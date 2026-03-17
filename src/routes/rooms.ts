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

// 房間建立/更新請求格式
interface RoomRequest {
  propertyId: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  electricityRate: number; // 每度電價格（分），例如 350 表示 3.5 元
  status: string; // 'vacant', 'occupied', 'reserved', 'maintenance'
}

// 批次建立房間請求格式
interface RoomBulkRequest {
  propertyId: string;
  rooms: Array<{
    roomNumber: string;
    floor: number;
    monthlyRent: number;
    depositAmount: number;
    electricityRate?: number;
  }>;
}

const router = Router();

/**
 * GET /api/rooms
 * 取得房間列表（排除已軟刪除的）
 * 可選查詢參數：propertyId (篩選特定物業的房間)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.query;
    
    let query: any = db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.deletedAt} IS NULL`);

    // 如果有 propertyId 篩選條件
    if (propertyId && typeof propertyId === 'string') {
      query = query.where(sql`${schema.rooms.propertyId} = ${propertyId}`);
    }

    const rooms = await query.orderBy(schema.rooms.floor, schema.rooms.roomNumber);

    return res.status(200).json(successResponse(rooms));
  } catch (error) {
    console.error('❌ 取得房間列表錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/rooms/:id
 * 取得單一房間詳細資訊
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供房間 ID'));
    }

    const rooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${id} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (rooms.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的房間'));
    }

    return res.status(200).json(successResponse(rooms[0]));
  } catch (error) {
    console.error('❌ 取得房間詳細資訊錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/rooms/bulk
 * 批次建立房間
 */
router.post('/bulk', async (req: Request, res: Response, next) => {
 try {
 const { propertyId, rooms: roomsData } = req.body as RoomBulkRequest;
 
 if (!propertyId || !Array.isArray(roomsData) || roomsData.length === 0) {
 return res.status(400).json({
 success: false,
 message: '缺少 propertyId 或 rooms 資料',
 timestamp: new Date().toISOString()
 });
 }

 const created = [];
 for (const room of roomsData) {
 // @ts-ignore
 const [newRoom] = await db.insert(schema.rooms).values({
 propertyId,
 roomNumber: room.roomNumber,
 floor: room.floor,
 monthlyRent: room.monthlyRent,
 depositAmount: room.depositAmount,
 electricityRate: room.electricityRate || 350,
 status: 'vacant',
 }).returning();
 created.push(newRoom);
 }

 return res.json({
 success: true,
 data: created,
 message: `成功建立 ${created.length} 間房間`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

/**
 * POST /api/rooms
 * 新增房間
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const roomData = req.body as RoomRequest;

    // 驗證必要欄位
    const requiredFields = ['propertyId', 'roomNumber', 'floor', 'monthlyRent', 'depositAmount'];
    for (const field of requiredFields) {
      if (roomData[field as keyof RoomRequest] === undefined || roomData[field as keyof RoomRequest] === null) {
        return res.status(400).json(errorResponse(`請提供 ${field}`));
      }
    }

    // 檢查物業是否存在
    const properties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.id} = ${roomData.propertyId} AND ${schema.properties.deletedAt} IS NULL`)
      .limit(1);

    if (properties.length === 0) {
      return res.status(400).json(errorResponse('指定的物業不存在或已被刪除'));
    }

    // 檢查同一物業中房間編號是否重複
    const existingRooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.propertyId} = ${roomData.propertyId} AND ${schema.rooms.roomNumber} = ${roomData.roomNumber} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (existingRooms.length > 0) {
      return res.status(400).json(errorResponse('此物業中已存在相同房間編號的房間'));
    }

    // 建立房間
    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [newRoom] = await db.insert(schema.rooms).values({
      propertyId: roomData.propertyId,
      roomNumber: roomData.roomNumber,
      floor: roomData.floor,
      monthlyRent: roomData.monthlyRent,
      depositAmount: roomData.depositAmount,
      electricityRate: roomData.electricityRate || 350, // 預設 3.5 元/度
      status: roomData.status || 'vacant',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json(successResponse(newRoom));
  } catch (error) {
    console.error('❌ 新增房間錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PUT /api/rooms/:id
 * 編輯房間
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const roomData = req.body as Partial<RoomRequest>;

    if (!id) {
      return res.status(400).json(errorResponse('請提供房間 ID'));
    }

    // 檢查房間是否存在且未刪除
    const existingRooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${id} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (existingRooms.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的房間'));
    }

    // 如果需要更新 propertyId，檢查新物業是否存在
    if (roomData.propertyId && roomData.propertyId !== existingRooms[0].propertyId) {
      const properties = await db.select()
        .from(schema.properties)
        .where(sql`${schema.properties.id} = ${roomData.propertyId} AND ${schema.properties.deletedAt} IS NULL`)
        .limit(1);

      if (properties.length === 0) {
        return res.status(400).json(errorResponse('指定的物業不存在或已被刪除'));
      }
    }

    // 如果需要更新 roomNumber，檢查同一物業中房間編號是否重複
    if (roomData.roomNumber && roomData.roomNumber !== existingRooms[0].roomNumber) {
      const propertyIdToCheck = roomData.propertyId || existingRooms[0].propertyId;
      const existingDuplicateRooms = await db.select()
        .from(schema.rooms)
        .where(sql`${schema.rooms.propertyId} = ${propertyIdToCheck} AND ${schema.rooms.roomNumber} = ${roomData.roomNumber} AND ${schema.rooms.deletedAt} IS NULL`)
        .limit(1);

      if (existingDuplicateRooms.length > 0) {
        return res.status(400).json(errorResponse('此物業中已存在相同房間編號的房間'));
      }
    }

    // 準備更新資料
    const updateData: any = {
      updatedAt: new Date(),
    };

    // 只更新提供的欄位
    const fields = ['propertyId', 'roomNumber', 'floor', 'monthlyRent', 'depositAmount', 'electricityRate', 'status'];
    
    fields.forEach(field => {
      if (roomData[field as keyof RoomRequest] !== undefined) {
        updateData[field] = roomData[field as keyof RoomRequest];
      }
    });

    // 更新房間
    const [updatedRoom] = await db.update(schema.rooms)
      .set(updateData)
      .where(sql`${schema.rooms.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedRoom));
  } catch (error) {
    console.error('❌ 編輯房間錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PATCH /api/rooms/:id/status
 * 快速更新房間狀態
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json(errorResponse('請提供房間 ID'));
    }

    if (!status || !['vacant', 'occupied', 'reserved', 'maintenance'].includes(status)) {
      return res.status(400).json(errorResponse('請提供有效的房間狀態 (vacant, occupied, reserved, maintenance)'));
    }

    // 檢查房間是否存在且未刪除
    const existingRooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${id} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (existingRooms.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的房間'));
    }

    // 更新房間狀態
    const [updatedRoom] = await db.update(schema.rooms)
      // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
      .set({ 
        // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        status,
        updatedAt: new Date(),
      })
      .where(sql`${schema.rooms.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedRoom));
  } catch (error) {
    console.error('❌ 更新房間狀態錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * DELETE /api/rooms/:id
 * 軟刪除房間（設定 deleted_at）
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供房間 ID'));
    }

    // 檢查房間是否存在
    const existingRooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${id} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (existingRooms.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的房間'));
    }

    // 執行軟刪除
    const [deletedRoom] = await db.update(schema.rooms)
      .set({ // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${schema.rooms.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse({
      message: '房間已刪除',
      room: deletedRoom
    }));
  } catch (error) {
    console.error('❌ 刪除房間錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;