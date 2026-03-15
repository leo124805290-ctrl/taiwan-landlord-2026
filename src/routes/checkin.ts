import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

// 統一 API 回應格式
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

// 入住請求格式
interface CheckinRequest {
  // 房間資訊
  roomId: string;
  
  // 租客資訊
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber?: string;
  notes?: string;
  
  // 付款資訊
  paymentType: 'full' | 'partial' | 'deposit_only'; // 全額、部分付款、僅押金
  rentAmount: number;  // 租金金額（分）
  depositAmount: number; // 押金金額（分）
  paidAmount: number;  // 實際付款金額（分）
  
  // 付款方式
  paymentMethod?: string; // 'cash', 'transfer', 'credit_card'
  paymentNotes?: string;
}

const router = Router();

/**
 * POST /api/checkin/complete
 * 完成租客入住流程（包含三種付款情境）
 * 使用 database transaction 確保數據一致性
 */
router.post('/complete', async (req: Request, res: Response) => {
  // 開始 transaction
  const transaction = await db.transaction(async (tx) => {
    try {
      const checkinData = req.body as CheckinRequest;

      // 驗證必要欄位
      const requiredFields = ['roomId', 'nameZh', 'nameVi', 'phone', 'paymentType', 'rentAmount', 'depositAmount', 'paidAmount'];
      for (const field of requiredFields) {
        if (checkinData[field as keyof CheckinRequest] === undefined || checkinData[field as keyof CheckinRequest] === null) {
          throw new Error(`請提供 ${field}`);
        }
      }

      // 檢查房間是否存在且未刪除
      const rooms = await tx.select()
        .from(schema.rooms)
        .where(sql`${schema.rooms.id} = ${checkinData.roomId} AND ${schema.rooms.deletedAt} IS NULL`)
        .limit(1);

      if (rooms.length === 0) {
        throw new Error('指定的房間不存在或已被刪除');
      }

      const room = rooms[0];

      // 檢查房間是否為空房
      if (room.status !== 'vacant') {
        throw new Error('房間目前不可入住（狀態：' + room.status + '）');
      }

      // 檢查物業是否存在
      const properties = await tx.select()
        .from(schema.properties)
        .where(sql`${schema.properties.id} = ${room.propertyId} AND ${schema.properties.deletedAt} IS NULL`)
        .limit(1);

      if (properties.length === 0) {
        throw new Error('房間所屬的物業不存在或已被刪除');
      }

      const property = properties[0];

      // 根據付款類型設定房間狀態
      let newRoomStatus: string;
      switch (checkinData.paymentType) {
        case 'full':
          newRoomStatus = 'occupied'; // 全額付款 → 已入住
          break;
        case 'partial':
        case 'deposit_only':
          newRoomStatus = 'reserved'; // 部分付款或僅押金 → 已預訂
          break;
        default:
          throw new Error('無效的付款類型，請使用 full、partial 或 deposit_only');
      }

      // 更新房間狀態
      const [updatedRoom] = await tx.update(schema.rooms)
        .set({ 
          status: newRoomStatus,
          updatedAt: new Date(),
        })
        .where(sql`${schema.rooms.id} = ${checkinData.roomId}`)
        .returning();

      // 建立租客紀錄
      const [newTenant] = await tx.insert(schema.tenants).values({
        roomId: checkinData.roomId,
        propertyId: room.propertyId,
        nameZh: checkinData.nameZh,
        nameVi: checkinData.nameVi,
        phone: checkinData.phone,
        passportNumber: checkinData.passportNumber || null,
        checkInDate: new Date(),
        status: 'active',
        notes: checkinData.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // 建立押金紀錄（如果押金金額 > 0）
      if (checkinData.depositAmount > 0) {
        await tx.insert(schema.deposits).values({
          tenantId: newTenant.id,
          roomId: checkinData.roomId,
          amount: checkinData.depositAmount,
          type: '收取',
          description: '入住押金',
          depositDate: new Date(),
          createdAt: new Date(),
        });
      }

      // 建立付款紀錄（如果租金金額 > 0 且實際付款 > 0）
      if (checkinData.rentAmount > 0 && checkinData.paidAmount > 0) {
        // 計算當前月份（YYYY-MM 格式）
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        await tx.insert(schema.payments).values({
          roomId: checkinData.roomId,
          tenantId: newTenant.id,
          paymentMonth: currentMonth,
          rentAmount: checkinData.rentAmount,
          electricityFee: 0,
          managementFee: 0,
          otherFees: 0,
          paidAmount: checkinData.paidAmount,
          paymentStatus: checkinData.paidAmount >= checkinData.rentAmount ? 'paid' : 'partial',
          paymentDate: new Date(),
          paymentMethod: checkinData.paymentMethod || 'cash',
          notes: checkinData.paymentNotes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // 返回結果
      return {
        room: updatedRoom,
        tenant: newTenant,
        roomStatus: newRoomStatus,
        message: '入住流程完成'
      };
    } catch (error) {
      console.error('❌ 入住流程 transaction 錯誤:', error);
      throw error; // transaction 會自動回滾
    }
  });

  try {
    return res.status(201).json(successResponse(transaction));
  } catch (error) {
    console.error('❌ 入住流程錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;