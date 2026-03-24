// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { checkoutSettlements, tenants, rooms, deposits, payments, meterReadings } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { yuanToCents } from '../utils/money.js';

const router = Router();

/**
 * POST /api/checkout/complete
 * Body: tenantId, roomId, checkoutDate, finalMeterReading? (度數),
 *       otherDeductions? (元，預設 0), notes?
 */
router.post('/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      tenantId,
      roomId,
      checkoutDate,
      finalMeterReading,
      finalMeter,
      otherDeductions: otherDeductionsRaw = 0,
      notes,
    } = req.body;

    const meterInput = finalMeterReading ?? finalMeter;

    if (!tenantId || !roomId || !checkoutDate) {
      return res.status(400).json({
        success: false,
        message: '缺少必要欄位：tenantId, roomId, checkoutDate',
        timestamp: new Date().toISOString(),
      });
    }

    if (meterInput === undefined || meterInput === null || meterInput === '') {
      return res.status(400).json({
        success: false,
        message: '請提供 finalMeterReading（退租電錶度數）',
        timestamp: new Date().toISOString(),
      });
    }

    const finalReadingNum = Number(meterInput);
    if (Number.isNaN(finalReadingNum) || finalReadingNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'finalMeterReading 必須為有效非負數字',
        timestamp: new Date().toISOString(),
      });
    }

    const otherDeductionsYuan = Number(otherDeductionsRaw) || 0;
    const otherDeductionsCents = yuanToCents(otherDeductionsYuan);

    const result = await db.transaction(async (tx) => {
      const tenantResult = await tx
        .select()
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
        .limit(1);

      if (tenantResult.length === 0) {
        throw new Error('租客不存在');
      }
      const tenant = tenantResult[0];

      const roomResult = await tx
        .select()
        .from(rooms)
        .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
        .limit(1);

      if (roomResult.length === 0) {
        throw new Error('房間不存在');
      }
      const room = roomResult[0];

      const checkIn = new Date(tenant.checkInDate);
      const checkOut = new Date(checkoutDate);
      const daysStayed = Math.max(
        0,
        Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
      );

      /** 月租金 rooms 表為「元」整數 */
      const dailyRentCents = Math.round(yuanToCents(Number(room.monthlyRent) || 0) / 30);
      const rentDueCents = dailyRentCents * daysStayed;

      await tx.insert(meterReadings).values({
        roomId,
        readingValue: Math.round(finalReadingNum),
        readingDate: checkOut,
      });

      const recentReadings = await tx
        .select()
        .from(meterReadings)
        .where(eq(meterReadings.roomId, roomId))
        .orderBy(desc(meterReadings.readingDate))
        .limit(2);

      let electricityFeeCents = 0;
      if (recentReadings.length >= 2) {
        const usage = recentReadings[0].readingValue - recentReadings[1].readingValue;
        if (usage > 0) {
          const rateFenPerUnit = Number(room.electricityRate) || 0;
          const rateYuan = rateFenPerUnit / 100;
          electricityFeeCents = Math.round(usage * rateYuan * 100);
        }
      }

      const totalDueCents = rentDueCents + electricityFeeCents + otherDeductionsCents;

      const allPayments = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.roomId, roomId), eq(payments.tenantId, tenantId), isNull(payments.deletedAt)));
      const prepaidAmount = allPayments.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);

      const allDeposits = await tx
        .select()
        .from(deposits)
        .where(and(eq(deposits.tenantId, tenantId), eq(deposits.type, '收取'), isNull(deposits.deletedAt)));
      const depositAmount = allDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

      const refundAmount = prepaidAmount - totalDueCents + depositAmount;

      const [settlement] = await tx
        .insert(checkoutSettlements)
        .values({
          tenantId,
          roomId,
          checkoutDate: checkOut,
          daysStayed,
          dailyRent: dailyRentCents,
          rentDue: rentDueCents,
          electricityFee: electricityFeeCents,
          otherDeductions: otherDeductionsCents,
          totalDue: totalDueCents,
          prepaidAmount,
          depositAmount,
          refundAmount: Math.max(0, refundAmount),
          settlementStatus: 'settled',
          notes: notes || null,
        })
        .returning();

      await tx
        .update(tenants)
        .set({
          status: 'checked_out',
          actualCheckoutDate: checkOut,
        })
        .where(eq(tenants.id, tenantId));

      await tx.update(rooms).set({ status: 'vacant' }).where(eq(rooms.id, roomId));

      if (refundAmount > 0) {
        await tx.insert(deposits).values({
          tenantId,
          roomId,
          amount: Math.min(depositAmount, Math.max(0, refundAmount)),
          type: '退還',
          description: '退租結算退還押金',
          depositDate: checkOut,
        });
      }

      return {
        settlement,
        summary: {
          rentDueCents,
          electricityFeeCents,
          otherDeductionsCents,
          totalDueCents,
          depositAmountCents: depositAmount,
          prepaidAmountCents: prepaidAmount,
          refundAmountCents: Math.max(0, refundAmount),
        },
      };
    });

    return res.json({
      success: true,
      data: result,
      message: '退租結算完成',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/settlements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlements = await db
      .select()
      .from(checkoutSettlements)
      .orderBy(desc(checkoutSettlements.createdAt));

    return res.json({
      success: true,
      data: settlements,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/settlements/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await db.select().from(checkoutSettlements).where(eq(checkoutSettlements.id, id)).limit(1);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '結算單不存在',
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
