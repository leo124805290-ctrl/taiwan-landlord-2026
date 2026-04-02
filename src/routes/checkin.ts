import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { yuanToCents } from '../utils/money.js';
import {
  CONTRACT_TERM_OPTIONS,
  computeExpectedCheckoutDate,
  isOnOrBeforeDay20,
  nextCalendarMonthYm,
  parseLocalYmd,
  prorationRentYuan,
  ymFromDate,
} from '../utils/checkin-contract.js';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorResponse(message: string): ApiResponse {
  return {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };
}

interface CheckinRequest {
  roomId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber?: string;
  notes?: string;
  checkInDate?: string;
  /** 1 / 3 / 6 / 12 */
  contractTermMonths: number;
  /** 入住起始電錶度數，可為 0；未送則不建立讀數 */
  initialMeterReading?: number | null;
  /** 相容舊前端；若未送合約月數則視為 12 */
  expectedCheckoutDate?: string;
  paymentType: 'full';
  paidAmount: number;
  paymentMethod?: string;
  paymentNotes?: string;
}

const router = Router();

async function insertPaymentRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: {
    roomId: string;
    tenantId: string;
    lineType: 'deposit' | 'rent' | 'electricity';
    paymentMonth: string;
    totalCents: number;
    rentAmountCents: number;
    notes?: string | null;
  },
) {
  const { roomId, tenantId, lineType, paymentMonth, totalCents, rentAmountCents, notes } = row;
  // @ts-expect-error Drizzle insert 型別推論
  await tx.insert(schema.payments).values({
    roomId,
    tenantId,
    lineType,
    paymentMonth,
    rentAmount: rentAmountCents,
    electricityFee: 0,
    managementFee: 0,
    otherFees: 0,
    totalAmount: totalCents,
    paidAmount: 0,
    balance: totalCents,
    paymentStatus: 'pending',
    notes: notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

router.post('/complete', async (req: Request, res: Response) => {
  try {
    const result = await db.transaction(async (tx) => {
      const raw = req.body as CheckinRequest & {
        paymentAmount?: number;
        rentAmount?: number;
        depositAmount?: number;
        legacyImport?: boolean;
      };
      const paidResolved =
        raw.paidAmount !== undefined && raw.paidAmount !== null
          ? raw.paidAmount
          : raw.paymentAmount ?? 0;

      let contractTermMonths = Number(raw.contractTermMonths);
      if (!Number.isFinite(contractTermMonths) || !CONTRACT_TERM_OPTIONS.includes(contractTermMonths as (typeof CONTRACT_TERM_OPTIONS)[number])) {
        contractTermMonths = 12;
      }

      const legacyImport = raw.legacyImport === true;

      const checkinData: CheckinRequest = {
        ...raw,
        contractTermMonths,
        paymentType: 'full',
        paidAmount: paidResolved,
      };

      const requiredFields = ['roomId', 'nameZh', 'nameVi', 'phone'] as const;
      for (const field of requiredFields) {
        const v = checkinData[field];
        if (v === undefined || v === null || String(v).trim() === '') {
          throw new Error(`請提供 ${field}`);
        }
      }

      const rooms = await tx
        .select()
        .from(schema.rooms)
        .where(sql`${schema.rooms.id} = ${checkinData.roomId} AND ${schema.rooms.deletedAt} IS NULL`)
        .limit(1);

      if (rooms.length === 0) {
        throw new Error('指定的房間不存在或已被刪除');
      }

      const room = rooms[0];

      if (room.status !== 'vacant') {
        throw new Error('房間目前不可入住（狀態：' + room.status + '）');
      }

      const properties = await tx
        .select()
        .from(schema.properties)
        .where(sql`${schema.properties.id} = ${room.propertyId} AND ${schema.properties.deletedAt} IS NULL`)
        .limit(1);

      if (properties.length === 0) {
        throw new Error('房間所屬的物業不存在或已被刪除');
      }

      const [updatedRoom] = await tx
        .update(schema.rooms)
        .set({
          status: 'occupied',
          updatedAt: new Date(),
        } as Record<string, unknown>)
        .where(sql`${schema.rooms.id} = ${checkinData.roomId}`)
        .returning();

      const checkIn =
        checkinData.checkInDate && !Number.isNaN(Date.parse(checkinData.checkInDate))
          ? parseLocalYmd(checkinData.checkInDate)
          : new Date();
      if (Number.isNaN(checkIn.getTime())) {
        throw new Error('入住日期格式不正確');
      }

      const expectedCheckout = computeExpectedCheckoutDate(checkIn, contractTermMonths);

      // @ts-expect-error Drizzle
      const [newTenant] = await tx.insert(schema.tenants).values({
        roomId: checkinData.roomId,
        propertyId: room.propertyId,
        nameZh: checkinData.nameZh,
        nameVi: checkinData.nameVi,
        phone: checkinData.phone,
        passportNumber: checkinData.passportNumber || null,
        checkInDate: checkIn,
        expectedCheckoutDate: expectedCheckout,
        status: 'active',
        notes: checkinData.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      const checkInYm = ymFromDate(checkIn);
      const monthlyRentYuan = Number(room.monthlyRent) || 0;
      const depositYuan = Number(room.depositAmount) || 0;

      const prorationYuan = prorationRentYuan(monthlyRentYuan, checkIn);
      const after20 = !isOnOrBeforeDay20(checkIn);

      /** 舊資料補登：不產生入住帳單／不自動寫押金流水，由前端另送 meter、deposits */
      if (!legacyImport) {
        if (depositYuan > 0) {
          await tx.insert(schema.deposits).values({
            // @ts-ignore
            tenantId: newTenant.id,
            roomId: checkinData.roomId,
            amount: yuanToCents(depositYuan),
            type: '收取',
            description: '入住押金',
            depositDate: new Date(),
            createdAt: new Date(),
          });
        }

        if (depositYuan > 0) {
          await insertPaymentRow(tx, {
            roomId: checkinData.roomId,
            tenantId: newTenant.id,
            lineType: 'deposit',
            paymentMonth: checkInYm,
            totalCents: yuanToCents(depositYuan),
            rentAmountCents: 0,
            notes: '入住押金',
          });
        }

        const daysLeft = Math.max(0, new Date(checkIn.getFullYear(), checkIn.getMonth() + 1, 0).getDate() - checkIn.getDate());
        const rentNoteA = `${checkInYm.slice(5)}月租金（${daysLeft}天）`;
        if (prorationYuan > 0) {
          await insertPaymentRow(tx, {
            roomId: checkinData.roomId,
            tenantId: newTenant.id,
            lineType: 'rent',
            paymentMonth: checkInYm,
            totalCents: yuanToCents(prorationYuan),
            rentAmountCents: yuanToCents(prorationYuan),
            notes: rentNoteA,
          });
        }

        if (after20 && monthlyRentYuan > 0) {
          const nextYm = nextCalendarMonthYm(checkIn);
          await insertPaymentRow(tx, {
            roomId: checkinData.roomId,
            tenantId: newTenant.id,
            lineType: 'rent',
            paymentMonth: nextYm,
            totalCents: yuanToCents(monthlyRentYuan),
            rentAmountCents: yuanToCents(monthlyRentYuan),
            notes: `${nextYm} 月租金（整月）`,
          });
        }
      }

      const im = raw.initialMeterReading as number | string | null | undefined;
      if (im !== undefined && im !== null && im !== '') {
        const rv = typeof im === 'string' ? Number(im.trim()) : Number(im);
        if (!Number.isFinite(rv) || rv < 0) {
          throw new Error('入住電錶度數須為 0 以上的數字');
        }
        await tx.insert(schema.meterReadings).values({
          roomId: checkinData.roomId,
          readingValue: Math.round(rv),
          readingDate: checkIn,
        });
      }

      return {
        room: updatedRoom,
        tenant: newTenant,
        roomStatus: 'occupied',
        message: '入住流程完成',
        expectedCheckoutDate: expectedCheckout.toISOString(),
        billing: {
          checkInMonth: checkInYm,
          depositYuan,
          prorationYuan,
          nextMonthRentYuan: after20 ? monthlyRentYuan : null,
        },
      };
    });

    return res.status(201).json(successResponse(result));
  } catch (error) {
    console.error('❌ 入住流程錯誤:', error);
    const message = error instanceof Error ? error.message : '伺服器內部錯誤';
    const isClient =
      typeof message === 'string' &&
      (message.startsWith('請提供') ||
        message.startsWith('指定的房間') ||
        message.startsWith('房間目前不可入住') ||
        message.startsWith('房間所屬的物業') ||
        message.startsWith('入住日期') ||
        message.startsWith('入住電錶'));
    return res.status(isClient ? 400 : 500).json(errorResponse(message));
  }
});

export default router;
