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

// 租客建立/更新請求格式
interface TenantRequest {
  roomId: string;
  propertyId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber?: string;
  checkInDate: string; // ISO 格式日期
  expectedCheckoutDate?: string; // ISO 格式日期
  status?: string; // 'active', 'checked_out'
  notes?: string;
}

const router = Router();

/**
 * GET /api/tenants
 * 取得租客列表（排除已軟刪除的）
 * 可選查詢參數：
 * - propertyId (篩選特定物業的租客)
 * - roomId (篩選特定房間的租客)
 * - status (篩選狀態：active, checked_out)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { propertyId, roomId, status } = req.query;
    
    let query: any = db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.deletedAt} IS NULL`);

    // 如果有 propertyId 篩選條件
    if (propertyId && typeof propertyId === 'string') {
      query = query.where(sql`${schema.tenants.propertyId} = ${propertyId}`);
    }

    // 如果有 roomId 篩選條件
    if (roomId && typeof roomId === 'string') {
      query = query.where(sql`${schema.tenants.roomId} = ${roomId}`);
    }

    // 如果有 status 篩選條件
    if (status && typeof status === 'string') {
      query = query.where(sql`${schema.tenants.status} = ${status}`);
    }

    const tenants = await query.orderBy(schema.tenants.checkInDate);

    return res.status(200).json(successResponse(tenants));
  } catch (error) {
    console.error('❌ 取得租客列表錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/tenants/:id
 * 取得單一租客詳細資訊
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    const tenants = await db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.id} = ${id} AND ${schema.tenants.deletedAt} IS NULL`)
      .limit(1);

    if (tenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    return res.status(200).json(successResponse(tenants[0]));
  } catch (error) {
    console.error('❌ 取得租客詳細資訊錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/tenants
 * 新增租客（僅建立租客紀錄，不包含入住流程）
 * 入住流程請使用 /api/checkin/complete
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantData = req.body as TenantRequest;

    // 驗證必要欄位
    const requiredFields = ['roomId', 'propertyId', 'nameZh', 'nameVi', 'phone', 'checkInDate'];
    for (const field of requiredFields) {
      if (!tenantData[field as keyof TenantRequest]) {
        return res.status(400).json(errorResponse(`請提供 ${field}`));
      }
    }

    // 檢查房間是否存在且未刪除
    const rooms = await db.select()
      .from(schema.rooms)
      .where(sql`${schema.rooms.id} = ${tenantData.roomId} AND ${schema.rooms.deletedAt} IS NULL`)
      .limit(1);

    if (rooms.length === 0) {
      return res.status(400).json(errorResponse('指定的房間不存在或已被刪除'));
    }

    // 檢查物業是否存在且未刪除
    const properties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.id} = ${tenantData.propertyId} AND ${schema.properties.deletedAt} IS NULL`)
      .limit(1);

    if (properties.length === 0) {
      return res.status(400).json(errorResponse('指定的物業不存在或已被刪除'));
    }

    // 檢查房間是否已入住（同一房間只能有一個 active 租客）
    const existingActiveTenants = await db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.roomId} = ${tenantData.roomId} AND ${schema.tenants.status} = 'active' AND ${schema.tenants.deletedAt} IS NULL`)
      .limit(1);

    if (existingActiveTenants.length > 0) {
      return res.status(400).json(errorResponse('此房間已有租客入住，請先辦理退租'));
    }

    // 建立租客
    // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
    const [newTenant] = await db.insert(schema.tenants).values({
      roomId: tenantData.roomId,
      propertyId: tenantData.propertyId,
      nameZh: tenantData.nameZh,
      nameVi: tenantData.nameVi,
      phone: tenantData.phone,
      passportNumber: tenantData.passportNumber || null,
      checkInDate: new Date(tenantData.checkInDate),
      expectedCheckoutDate: tenantData.expectedCheckoutDate ? new Date(tenantData.expectedCheckoutDate) : null,
      status: tenantData.status || 'active',
      notes: tenantData.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json(successResponse(newTenant));
  } catch (error) {
    console.error('❌ 新增租客錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PUT /api/tenants/:id
 * 編輯租客
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantData = req.body as Partial<TenantRequest>;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    // 檢查租客是否存在且未刪除
    const existingTenants = await db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.id} = ${id} AND ${schema.tenants.deletedAt} IS NULL`)
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 如果需要更新 roomId，檢查新房間是否存在
    if (tenantData.roomId && tenantData.roomId !== existingTenants[0].roomId) {
      const rooms = await db.select()
        .from(schema.rooms)
        .where(sql`${schema.rooms.id} = ${tenantData.roomId} AND ${schema.rooms.deletedAt} IS NULL`)
        .limit(1);

      if (rooms.length === 0) {
        return res.status(400).json(errorResponse('指定的房間不存在或已被刪除'));
      }

      // 檢查新房間是否已入住（同一房間只能有一個 active 租客）
      const existingActiveTenants = await db.select()
        .from(schema.tenants)
        .where(sql`${schema.tenants.roomId} = ${tenantData.roomId} AND ${schema.tenants.status} = 'active' AND ${schema.tenants.deletedAt} IS NULL`)
        .limit(1);

      if (existingActiveTenants.length > 0) {
        return res.status(400).json(errorResponse('新房間已有租客入住，請先辦理退租'));
      }
    }

    // 準備更新資料
    const updateData: any = {
      updatedAt: new Date(),
    };

    // 只更新提供的欄位
    const fields = ['roomId', 'propertyId', 'nameZh', 'nameVi', 'phone', 'passportNumber', 'status', 'notes'];
    
    fields.forEach(field => {
      if (tenantData[field as keyof TenantRequest] !== undefined) {
        updateData[field] = tenantData[field as keyof TenantRequest];
      }
    });

    // 處理日期欄位
    if (tenantData.checkInDate !== undefined) {
      updateData.checkInDate = tenantData.checkInDate ? new Date(tenantData.checkInDate) : null;
    }
    if (tenantData.expectedCheckoutDate !== undefined) {
      updateData.expectedCheckoutDate = tenantData.expectedCheckoutDate ? new Date(tenantData.expectedCheckoutDate) : null;
    }

    // 更新租客
    const [updatedTenant] = await db.update(schema.tenants)
      .set(updateData)
      .where(sql`${schema.tenants.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedTenant));
  } catch (error) {
    console.error('❌ 編輯租客錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * DELETE /api/tenants/:id
 * 軟刪除租客（設定 deleted_at）
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    // 檢查租客是否存在
    const existingTenants = await db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.id} = ${id} AND ${schema.tenants.deletedAt} IS NULL`)
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 執行軟刪除
    const [deletedTenant] = await db.update(schema.tenants)
      .set({ // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${schema.tenants.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse({
      message: '租客已刪除',
      tenant: deletedTenant
    }));
  } catch (error) {
    console.error('❌ 刪除租客錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PATCH /api/tenants/:id/status
 * 更新租客狀態（例如：active → checked_out）
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    if (!status || !['active', 'checked_out'].includes(status)) {
      return res.status(400).json(errorResponse('請提供有效的租客狀態 (active, checked_out)'));
    }

    // 檢查租客是否存在且未刪除
    const existingTenants = await db.select()
      .from(schema.tenants)
      .where(sql`${schema.tenants.id} = ${id} AND ${schema.tenants.deletedAt} IS NULL`)
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 更新租客狀態
    const [updatedTenant] = await db.update(schema.tenants)
      .set({ // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        status,
        updatedAt: new Date(),
      })
      .where(sql`${schema.tenants.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedTenant));
  } catch (error) {
    console.error('❌ 更新租客狀態錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;