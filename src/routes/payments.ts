import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const router = Router();

// 統一 API 回應格式
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

function errorResponse(message: string): ApiResponse {
  return {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
}

/**
 * @route   GET /api/payments
 * @desc    查詢帳單列表
 * @access  Private
 * @query   room_id? (UUID) - 房間 ID
 * @query   tenant_id? (UUID) - 租客 ID
 * @query   payment_month? (YYYY-MM) - 帳單月份
 * @query   payment_status? (pending/partial/paid/overdue) - 付款狀態
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { room_id, tenant_id, payment_month, payment_status } = req.query;

    // 基本查詢
    let query: any = db.select()
      .from(schema.payments)
      .where(sql`${schema.payments.deletedAt} IS NULL`);

    // 篩選條件
    if (room_id) {
      query = query.where(sql`${schema.payments.roomId} = ${room_id}`);
    }

    if (tenant_id) {
      query = query.where(sql`${schema.payments.tenantId} = ${tenant_id}`);
    }

    if (payment_month) {
      query = query.where(sql`${schema.payments.paymentMonth} = ${payment_month}`);
    }

    if (payment_status) {
      query = query.where(sql`${schema.payments.paymentStatus} = ${payment_status}`);
    }

    const payments = await query;

    return res.status(200).json(successResponse(payments));
  } catch (error) {
    console.error('查詢帳單錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

/**
 * @route   GET /api/payments/:id
 * @desc    取得單一帳單詳細資料
 * @access  Private
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const payments = await db.select()
      .from(schema.payments)
      .where(sql`${schema.payments.id} = ${id} AND ${schema.payments.deletedAt} IS NULL`);

    if (payments.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的帳單'));
    }

    return res.status(200).json(successResponse(payments[0]));
  } catch (error) {
    console.error('取得帳單錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

/**
 * @route   POST /api/payments
 * @desc    建立帳單（生成月帳單）
 * @access  Private
 * @body    {
 *   roomId: string (required),
 *   paymentMonth: string (required, YYYY-MM),
 *   rentAmount?: number (分),
 *   electricityFee?: number (分),
 *   managementFee?: number (分),
 *   otherFees?: number (分),
 *   notes?: string
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { roomId, paymentMonth, rentAmount, electricityFee, managementFee, otherFees, notes } = req.body;

    // 驗證必填欄位
    if (!roomId || !paymentMonth) {
      return res.status(400).json(errorResponse('缺少必要欄位：roomId, paymentMonth'));
    }

    // 驗證月份格式
    if (!/^\d{4}-\d{2}$/.test(paymentMonth)) {
      return res.status(400).json(errorResponse('paymentMonth 格式錯誤，必須為 YYYY-MM'));
    }

    // 檢查房間是否存在且未刪除
    const rooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${roomId} AND ${schema.rooms.deletedAt} IS NULL`);

    if (rooms.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的房間'));
    }

    const room = rooms[0];

    // 檢查該房間該月份是否已有帳單
    const existingPayments = await db.select()
      .from(schema.payments)
      .where(
        sql`${schema.payments.roomId} = ${roomId} 
            AND ${schema.payments.paymentMonth} = ${paymentMonth} 
            AND ${schema.payments.deletedAt} IS NULL`
      );

    if (existingPayments.length > 0) {
      return res.status(400).json(errorResponse('該房間在此月份已有帳單'));
    }

    // 尋找該房間的當前租客（如果有的話）
    let tenantId = null;
    if (room.status === 'occupied') {
      const tenants = await db.select()
        .from(schema.tenants)
        .where(
          sql`${schema.tenants.roomId} = ${roomId} 
              AND ${schema.tenants.status} = 'active' 
              AND ${schema.tenants.deletedAt} IS NULL`
        );

      if (tenants.length > 0) {
        tenantId = tenants[0].id;
      }
    }

    // 計算總金額
    const rent = rentAmount || room.monthlyRent;
    const electricity = electricityFee || 0;
    const management = managementFee || 0;
    const other = otherFees || 0;
    const totalAmount = rent + electricity + management + other;

    // 建立帳單
    const newPayment = {
      roomId,
      tenantId,
      paymentMonth,
      rentAmount: rent,
      electricityFee: electricity,
      managementFee: management,
      otherFees: other,
      totalAmount,
      paidAmount: 0,
      balance: totalAmount, // 初始餘額等於總金額
      paymentStatus: 'pending' as const,
      notes: notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [createdPayment] = await db.insert(schema.payments).values(newPayment).returning();

    return res.status(201).json(successResponse(createdPayment, '帳單建立成功'));
  } catch (error) {
    console.error('建立帳單錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

/**
 * @route   PATCH /api/payments/:id/pay
 * @desc    繳費（支援部分繳費）
 * @access  Private
 * @body    {
 *   paidAmount: number (required, 分),
 *   paymentMethod?: string,
 *   notes?: string
 * }
 */
router.patch('/:id/pay', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paidAmount, paymentMethod, notes } = req.body;

    // 驗證必填欄位
    if (!paidAmount || paidAmount < 0) {
      return res.status(400).json(errorResponse('paidAmount 必須是大於 0 的數字'));
    }

    // 檢查帳單是否存在
    const payments = await db.select()
      .from(schema.payments)
      .where(sql`${schema.payments.id} = ${id} AND ${schema.payments.deletedAt} IS NULL`);

    if (payments.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的帳單'));
    }

    const payment = payments[0];

    // 檢查帳單是否已全額繳清
    if (payment.paymentStatus === 'paid') {
      return res.status(400).json(errorResponse('此帳單已全額繳清，無法再次繳費'));
    }

    // 計算新的已付金額和餘額
    const newPaidAmount = payment.paidAmount + paidAmount;
    const newBalance = payment.totalAmount - newPaidAmount;

    // 判斷付款狀態
    let newPaymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' = payment.paymentStatus as 'pending' | 'partial' | 'paid' | 'overdue';
    if (newBalance <= 0) {
      newPaymentStatus = 'paid'; // 已付清
    } else if (newPaidAmount > 0) {
      newPaymentStatus = 'partial'; // 部分付款
    }

    // 更新帳單
    const updateData = {
      paidAmount: newPaidAmount,
      balance: newBalance,
      paymentStatus: newPaymentStatus,
      paymentDate: new Date(),
      paymentMethod: paymentMethod || payment.paymentMethod,
      notes: notes || payment.notes,
      updatedAt: new Date(),
    };

    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [updatedPayment] = await db.update(schema.payments)
      // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
      .set(updateData)
      .where(sql`${schema.payments.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedPayment, '繳費成功'));
  } catch (error) {
    console.error('繳費錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

/**
 * @route   PATCH /api/payments/:id
 * @desc    更新帳單資訊
 * @access  Private
 * @body    {
 *   rentAmount?: number (分),
 *   electricityFee?: number (分),
 *   managementFee?: number (分),
 *   otherFees?: number (分),
 *   notes?: string
 * }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rentAmount, electricityFee, managementFee, otherFees, notes } = req.body;

    // 檢查帳單是否存在
    const payments = await db.select()
      .from(schema.payments)
      .where(sql`${schema.payments.id} = ${id} AND ${schema.payments.deletedAt} IS NULL`);

    if (payments.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的帳單'));
    }

    const payment = payments[0];

    // 如果帳單已付款，不允許修改金額（只能改備註）
    if (payment.paidAmount > 0 && (rentAmount !== undefined || electricityFee !== undefined || managementFee !== undefined || otherFees !== undefined)) {
      return res.status(400).json(errorResponse('帳單已有付款紀錄，無法修改金額'));
    }

    // 計算新的總金額
    const rent = rentAmount !== undefined ? rentAmount : payment.rentAmount;
    const electricity = electricityFee !== undefined ? electricityFee : payment.electricityFee;
    const management = managementFee !== undefined ? managementFee : payment.managementFee;
    const other = otherFees !== undefined ? otherFees : payment.otherFees;
    const totalAmount = rent + electricity + management + other;

    // 計算新的餘額
    const newBalance = totalAmount - payment.paidAmount;

    // 判斷付款狀態（如果餘額改變）
    let newPaymentStatus = payment.paymentStatus;
    if (newBalance <= 0 && payment.paidAmount > 0) {
      newPaymentStatus = 'paid';
    } else if (payment.paidAmount > 0 && newBalance > 0) {
      newPaymentStatus = 'partial';
    } else if (payment.paidAmount === 0) {
      newPaymentStatus = 'pending';
    }

    // 更新帳單
    const updateData = {
      rentAmount: rent,
      electricityFee: electricity,
      managementFee: management,
      otherFees: other,
      totalAmount,
      balance: newBalance,
      paymentStatus: newPaymentStatus,
      notes: notes !== undefined ? notes : payment.notes,
      updatedAt: new Date(),
    };

    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [updatedPayment] = await db.update(schema.payments)
      // @ts-ignore - Drizzle 類型問題（帳單更新部分），待 schema 對齊後修復
      .set(updateData)
      .where(sql`${schema.payments.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedPayment, '帳單更新成功'));
  } catch (error) {
    console.error('更新帳單錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

/**
 * @route   DELETE /api/payments/:id
 * @desc    刪除帳單（軟刪除）
 * @access  Private
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 檢查帳單是否存在
    const payments = await db.select()
      .from(schema.payments)
      .where(sql`${schema.payments.id} = ${id} AND ${schema.payments.deletedAt} IS NULL`);

    if (payments.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的帳單'));
    }

    const payment = payments[0];

    // 如果帳單已有付款，不允許刪除
    if (payment.paidAmount > 0) {
      return res.status(400).json(errorResponse('帳單已有付款紀錄，無法刪除'));
    }

    // 執行軟刪除
    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [deletedPayment] = await db.update(schema.payments)
      // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
      .set({ 
        // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${schema.payments.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse({
      message: '帳單已刪除',
      payment: deletedPayment
    }));
  } catch (error) {
    console.error('刪除帳單錯誤:', error);
    return res.status(500).json(errorResponse('伺服器錯誤'));
  }
});

export default router;