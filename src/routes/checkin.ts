import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { yuanToCents } from '../utils/money.js';

interface ApiResponse<T = any> {
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

/** 入住請求：簡化為僅建立租客＋已入住，付款改由收租頁處理 */
interface CheckinRequest {
  roomId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber?: string;
  notes?: string;
  checkInDate?: string;
  expectedCheckoutDate?: string;
  /** API 固定送 full；paidAmount 可為 0 */
  paymentType: 'full';
  rentAmount: number;
  depositAmount: number;
  paidAmount: number;
  paymentMethod?: string;
  paymentNotes?: string;
}

const router = Router();

router.post('/complete', async (req: Request, res: Response) => {
  try {
    const result = await db.transaction(async (tx) => {
      const raw = req.body as CheckinRequest & { paymentAmount?: number };
      const paidResolved =
        raw.paidAmount !== undefined && raw.paidAmount !== null
          ? raw.paidAmount
          : raw.paymentAmount ?? 0;

      const checkinData: CheckinRequest = {
        ...raw,
        paymentType: 'full',
        paidAmount: paidResolved,
      };

      const requiredFields = [
        'roomId',
        'nameZh',
        'nameVi',
        'phone',
        'rentAmount',
        'depositAmount',
      ] as const;
      for (const field of requiredFields) {
        const v = checkinData[field];
        if (v === undefined || v === null) {
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
          ? new Date(checkinData.checkInDate)
          : new Date();
      const expectedCheckout =
        checkinData.expectedCheckoutDate &&
        !Number.isNaN(Date.parse(checkinData.expectedCheckoutDate))
          ? new Date(checkinData.expectedCheckoutDate)
          : null;

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

      const paymentMonth = checkIn.toISOString().slice(0, 7);

      if (checkinData.depositAmount > 0) {
        await tx.insert(schema.deposits).values({
          // @ts-ignore
          tenantId: newTenant.id,
          roomId: checkinData.roomId,
          amount: yuanToCents(checkinData.depositAmount),
          type: '收取',
          description: '入住押金',
          depositDate: new Date(),
          createdAt: new Date(),
        });
      }

      /** 入住收款單：押金列 + 首月租金列（待收）；金額為「分」 */
      if (checkinData.depositAmount > 0) {
        const depC = yuanToCents(checkinData.depositAmount);
        // @ts-ignore
        await tx.insert(schema.payments).values({
          roomId: checkinData.roomId,
          tenantId: newTenant.id,
          lineType: 'deposit',
          paymentMonth,
          rentAmount: 0,
          electricityFee: 0,
          managementFee: 0,
          otherFees: 0,
          totalAmount: depC,
          paidAmount: 0,
          balance: depC,
          paymentStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      if (checkinData.rentAmount > 0) {
        const rentC = yuanToCents(checkinData.rentAmount);
        // @ts-ignore
        await tx.insert(schema.payments).values({
          roomId: checkinData.roomId,
          tenantId: newTenant.id,
          lineType: 'rent',
          paymentMonth,
          rentAmount: rentC,
          electricityFee: 0,
          managementFee: 0,
          otherFees: 0,
          totalAmount: rentC,
          paidAmount: 0,
          balance: rentC,
          paymentStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return {
        room: updatedRoom,
        tenant: newTenant,
        roomStatus: 'occupied',
        message: '入住流程完成',
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
        message.startsWith('房間所屬的物業'));
    return res.status(isClient ? 400 : 500).json(errorResponse(message));
  }
});

export default router;
