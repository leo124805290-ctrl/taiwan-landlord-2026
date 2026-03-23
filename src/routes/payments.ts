// @ts-nocheck
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { db } from '../db/index.js';
import { payments, rooms, meterReadings, tenants, properties } from '../db/schema.js';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import { yuanToCents } from '../utils/money.js';

const router = Router();

/** 組裝列表用：房號、物業、租客名 */
async function enrichPaymentRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];
  const roomIds = [...new Set(rows.map((r) => r.roomId))];
  const roomRows = await db
    .select()
    .from(rooms)
    .where(and(inArray(rooms.id, roomIds), isNull(rooms.deletedAt)));
  const roomMap = new Map(roomRows.map((r) => [r.id, r]));
  const propIds = [...new Set(roomRows.map((r) => r.propertyId))];
  const propRows = await db
    .select()
    .from(properties)
    .where(and(inArray(properties.id, propIds), isNull(properties.deletedAt)));
  const propMap = new Map(propRows.map((p) => [p.id, p]));
  const tenantRows = await db
    .select()
    .from(tenants)
    .where(and(inArray(tenants.roomId, roomIds), isNull(tenants.deletedAt)));
  const tenantByRoom = new Map();
  for (const t of tenantRows) {
    if (t.status === 'active' && !tenantByRoom.has(t.roomId)) {
      tenantByRoom.set(t.roomId, t);
    }
  }
  return rows.map((p) => {
    const room = roomMap.get(p.roomId);
    const prop = room ? propMap.get(room.propertyId) : null;
    const tenant = tenantByRoom.get(p.roomId);
    const name = tenant?.nameZh || tenant?.nameVi || '—';
    return {
      ...p,
      roomNumber: room?.roomNumber ?? '—',
      propertyName: prop?.name ?? '—',
      tenantName: name,
    };
  });
}

// GET /api/payments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, tenantId, month, status, propertyId, lineType, collection } = req.query;

    let allPayments = await db
      .select()
      .from(payments)
      .where(isNull(payments.deletedAt))
      .orderBy(desc(payments.createdAt));

    let filtered = allPayments;

    if (propertyId && typeof propertyId === 'string') {
      const prs = await db
        .select()
        .from(rooms)
        .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)));
      const allowed = new Set(prs.map((r) => r.id));
      filtered = filtered.filter((p) => allowed.has(p.roomId));
    }

    if (roomId && typeof roomId === 'string') {
      filtered = filtered.filter((p) => p.roomId === roomId);
    }
    if (tenantId && typeof tenantId === 'string') {
      filtered = filtered.filter((p) => p.tenantId === tenantId);
    }
    if (month && typeof month === 'string') {
      filtered = filtered.filter((p) => p.paymentMonth === month);
    }
    if (status && typeof status === 'string') {
      filtered = filtered.filter((p) => p.paymentStatus === status);
    }
    if (lineType && typeof lineType === 'string') {
      filtered = filtered.filter((p) => p.lineType === lineType);
    }

    /** 收款狀態：open=尚有欠款（待收／部分），settled=已繳清 */
    if (collection && typeof collection === 'string') {
      if (collection === 'open') {
        filtered = filtered.filter((p) => Number(p.paidAmount) < Number(p.totalAmount));
      } else if (collection === 'settled') {
        filtered = filtered.filter((p) => Number(p.paidAmount) >= Number(p.totalAmount));
      }
    }

    const enriched = await enrichPaymentRows(filtered);

    return res.json({
      success: true,
      data: enriched,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/generate — 單一房間單一類型（rent 或 electricity）
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, tenantId, paymentMonth, lineType: lineTypeRaw } = req.body;
    const lineType = lineTypeRaw === 'electricity' ? 'electricity' : 'rent';

    if (!roomId || !paymentMonth) {
      return res.status(400).json({
        success: false,
        message: '缺少必要欄位：roomId, paymentMonth',
        timestamp: new Date().toISOString(),
      });
    }

    const existing = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.roomId, roomId),
          eq(payments.paymentMonth, paymentMonth),
          eq(payments.lineType, lineType),
          isNull(payments.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `${paymentMonth} 的${lineType === 'rent' ? '租金' : '電費'}帳單已存在`,
        data: existing[0],
        timestamp: new Date().toISOString(),
      });
    }

    const room = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);

    if (room.length === 0) {
      return res.status(404).json({
        success: false,
        message: '房間不存在',
        timestamp: new Date().toISOString(),
      });
    }

    if (lineType === 'rent') {
      /** rooms.monthly_rent 為「元」，payments 為「分」 */
      const rentAmount = yuanToCents(room[0].monthlyRent);
      const totalAmount = rentAmount;
      const [newPayment] = await db
        .insert(payments)
        .values({
          roomId,
          tenantId: tenantId || null,
          lineType: 'rent',
          paymentMonth,
          rentAmount,
          electricityFee: 0,
          managementFee: 0,
          otherFees: 0,
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          paymentStatus: 'pending',
        })
        .returning();

      return res.json({
        success: true,
        data: newPayment,
        message: `${paymentMonth} 租金帳單建立成功`,
        timestamp: new Date().toISOString(),
      });
    }

    // electricity
    const recentReadings = await db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.roomId, roomId))
      .orderBy(desc(meterReadings.readingDate))
      .limit(2);

    let electricityFee = 0;
    if (recentReadings.length >= 2) {
      const usage = recentReadings[0].readingValue - recentReadings[1].readingValue;
      electricityFee = Math.round(usage * (room[0].electricityRate / 100) * 100);
    }

    const totalAmount = electricityFee;
    const [newPayment] = await db
      .insert(payments)
      .values({
        roomId,
        tenantId: tenantId || null,
        lineType: 'electricity',
        paymentMonth,
        rentAmount: 0,
        electricityFee,
        managementFee: 0,
        otherFees: 0,
        totalAmount,
        paidAmount: 0,
        balance: totalAmount,
        paymentStatus: totalAmount <= 0 ? 'paid' : 'pending',
      })
      .returning();

    return res.json({
      success: true,
      data: newPayment,
      message: `${paymentMonth} 電費帳單建立成功`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/generate-monthly — 為所有「已入住」房間建立當月租金帳單（略過已存在）
router.post('/generate-monthly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paymentMonth } = req.body;
    if (!paymentMonth || typeof paymentMonth !== 'string') {
      return res.status(400).json({
        success: false,
        message: '請提供 paymentMonth（YYYY-MM）',
        timestamp: new Date().toISOString(),
      });
    }

    const occupied = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.status, 'occupied'), isNull(rooms.deletedAt)));

    const created = [];
    const skipped = [];

    for (const room of occupied) {
      const tenantRow = await db
        .select()
        .from(tenants)
        .where(
          and(
            eq(tenants.roomId, room.id),
            eq(tenants.status, 'active'),
            isNull(tenants.deletedAt),
          ),
        )
        .limit(1);

      const tenantId = tenantRow[0]?.id ?? null;

      const exists = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.roomId, room.id),
            eq(payments.paymentMonth, paymentMonth),
            eq(payments.lineType, 'rent'),
            isNull(payments.deletedAt),
          ),
        )
        .limit(1);

      if (exists.length > 0) {
        skipped.push({ roomId: room.id, roomNumber: room.roomNumber, reason: '已存在' });
        continue;
      }

      const rentAmount = yuanToCents(room.monthlyRent);
      const [row] = await db
        .insert(payments)
        .values({
          roomId: room.id,
          tenantId,
          lineType: 'rent',
          paymentMonth,
          rentAmount,
          electricityFee: 0,
          managementFee: 0,
          otherFees: 0,
          totalAmount: rentAmount,
          paidAmount: 0,
          balance: rentAmount,
          paymentStatus: 'pending',
        })
        .returning();

      created.push(row);
    }

    return res.json({
      success: true,
      data: { created, skipped },
      message: `已建立 ${created.length} 筆，略過 ${skipped.length} 筆`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/electricity-with-reading
 * 本頁一次完成：記錄抄表 → 依「本次−上一筆」× 每度單價產生該月電費帳單（分）。
 * 若該房尚無任何抄表，僅寫入基準讀數，不產生帳單（下次再抄即可算費）。
 */
router.post('/electricity-with-reading', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, paymentMonth, readingValue, readingDate, tenantId: tenantIdBody } = req.body;

    if (!roomId || !paymentMonth || readingValue === undefined || readingValue === null || !readingDate) {
      return res.status(400).json({
        success: false,
        message: '缺少欄位：roomId、paymentMonth、readingValue、readingDate',
        timestamp: new Date().toISOString(),
      });
    }

    const rv = Number(readingValue);
    if (Number.isNaN(rv) || rv < 0) {
      return res.status(400).json({
        success: false,
        message: '抄表度數須為非負數',
        timestamp: new Date().toISOString(),
      });
    }

    const rd = new Date(readingDate);
    if (Number.isNaN(rd.getTime())) {
      return res.status(400).json({
        success: false,
        message: '抄表日期無效',
        timestamp: new Date().toISOString(),
      });
    }

    const dup = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.roomId, roomId),
          eq(payments.paymentMonth, paymentMonth),
          eq(payments.lineType, 'electricity'),
          isNull(payments.deletedAt),
        ),
      )
      .limit(1);

    if (dup.length > 0) {
      return res.status(409).json({
        success: false,
        message: `${paymentMonth} 的電費帳單已存在`,
        data: dup[0],
        timestamp: new Date().toISOString(),
      });
    }

    const roomResult = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
      .limit(1);

    if (roomResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: '房間不存在',
        timestamp: new Date().toISOString(),
      });
    }

    const room = roomResult[0];

    const lastReading = await db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.roomId, roomId))
      .orderBy(desc(meterReadings.readingDate))
      .limit(1);

    const result = await db.transaction(async (tx) => {
      if (lastReading.length === 0) {
        await tx.insert(meterReadings).values({
          roomId,
          readingValue: rv,
          readingDate: rd,
        });
        return { mode: 'baseline' as const, usage: 0, electricityFee: 0, payment: null };
      }

      const previous = lastReading[0].readingValue;
      if (rv < previous) {
        throw Object.assign(new Error('本次抄表度數不可小於上一筆'), { statusCode: 400 });
      }

      await tx.insert(meterReadings).values({
        roomId,
        readingValue: rv,
        readingDate: rd,
      });

      const recent = await tx
        .select()
        .from(meterReadings)
        .where(eq(meterReadings.roomId, roomId))
        .orderBy(desc(meterReadings.readingDate))
        .limit(2);

      if (recent.length < 2) {
        throw new Error('抄表資料異常');
      }

      const usage = recent[0].readingValue - recent[1].readingValue;
      const electricityFee = Math.round(usage * (room.electricityRate / 100) * 100);
      const totalAmount = electricityFee;

      const tenantRow = await tx
        .select()
        .from(tenants)
        .where(
          and(eq(tenants.roomId, roomId), eq(tenants.status, 'active'), isNull(tenants.deletedAt)),
        )
        .limit(1);

      const resolvedTenantId =
        (typeof tenantIdBody === 'string' && tenantIdBody) || tenantRow[0]?.id || null;

      const [payment] = await tx
        .insert(payments)
        .values({
          roomId,
          tenantId: resolvedTenantId,
          lineType: 'electricity',
          paymentMonth,
          rentAmount: 0,
          electricityFee,
          managementFee: 0,
          otherFees: 0,
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          paymentStatus: totalAmount <= 0 ? 'paid' : 'pending',
        })
        .returning();

      return {
        mode: 'billed' as const,
        usage,
        electricityFee,
        payment,
      };
    });

    if (result.mode === 'baseline') {
      return res.json({
        success: true,
        data: result,
        message: '已建立基準抄表；尚無上一筆可比較，無法計算電費。下次抄表後可於此頁產生帳單。',
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result,
      message: `${paymentMonth} 電費帳單已建立`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? (error as { statusCode: number }).statusCode : undefined;
    if (statusCode === 400 && error instanceof Error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    next(error);
  }
});

// PATCH /api/payments/:id/pay
router.patch('/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '請提供有效的繳費金額',
        timestamp: new Date().toISOString(),
      });
    }

    const existing = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), isNull(payments.deletedAt)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '帳單不存在',
        timestamp: new Date().toISOString(),
      });
    }

    const payment = existing[0];
    const newPaidAmount = payment.paidAmount + amount;
    const newBalance = payment.totalAmount - newPaidAmount;

    let newStatus: string;
    if (newBalance <= 0) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'pending';
    }

    const [updated] = await db
      .update(payments)
      .set({
        paidAmount: newPaidAmount,
        balance: Math.max(0, newBalance),
        paymentStatus: newStatus,
        paymentDate: new Date(),
        paymentMethod: paymentMethod || payment.paymentMethod,
        notes: notes || payment.notes,
      })
      .where(eq(payments.id, id))
      .returning();

    return res.json({
      success: true,
      data: updated,
      message: newStatus === 'paid' ? '已繳清' : `已繳 ${amount}，餘額 ${Math.max(0, newBalance)}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const result = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), isNull(payments.deletedAt)))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '帳單不存在',
        timestamp: new Date().toISOString(),
      });
    }

    const [enriched] = await enrichPaymentRows([result[0]]);

    return res.json({
      success: true,
      data: enriched,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
