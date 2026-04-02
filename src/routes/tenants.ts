import { Router, type Request, type Response } from 'express';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
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

/** Express 5 型別中 params.id 可能為 string | string[] */
function routeParamId(req: Request): string {
  const v = req.params.id;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? '';
  return '';
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

const { tenants, rooms, properties, checkoutSettlements, deposits, payments, meterReadings } =
  schema;

function parseDateStart(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateEnd(s: string): Date {
  const d = new Date(s);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * GET /api/tenants/history
 * 已終止租約（預設 status=checked_out）列表：篩選、排序、分頁
 * Query: propertyId, roomId, checkoutFrom, checkoutTo (ISO 日期，依 actual_checkout_date), q (姓名／電話關鍵字), page, pageSize
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { propertyId, roomId, checkoutFrom, checkoutTo, q } = req.query;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));

    const conditions = [
      isNull(tenants.deletedAt),
      isNull(rooms.deletedAt),
      isNull(properties.deletedAt),
      eq(tenants.status, 'checked_out'),
      isNotNull(tenants.actualCheckoutDate),
    ];

    if (propertyId && typeof propertyId === 'string') {
      conditions.push(eq(tenants.propertyId, propertyId));
    }
    if (roomId && typeof roomId === 'string') {
      conditions.push(eq(tenants.roomId, roomId));
    }
    if (checkoutFrom && typeof checkoutFrom === 'string') {
      conditions.push(gte(tenants.actualCheckoutDate, parseDateStart(checkoutFrom)));
    }
    if (checkoutTo && typeof checkoutTo === 'string') {
      conditions.push(lte(tenants.actualCheckoutDate, parseDateEnd(checkoutTo)));
    }
    if (q && typeof q === 'string' && q.trim()) {
      const pattern = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(tenants.nameZh, pattern),
          ilike(tenants.nameVi, pattern),
          ilike(tenants.phone, pattern),
        )!,
      );
    }

    const whereExpr = and(...conditions);

    const [totalRow] = await db
      .select({ n: count() })
      .from(tenants)
      .innerJoin(rooms, eq(tenants.roomId, rooms.id))
      .innerJoin(properties, eq(tenants.propertyId, properties.id))
      .where(whereExpr);

    const total = Number(totalRow?.n ?? 0);

    const offset = (page - 1) * pageSize;
    const rows = await db
      .select({
        tenant: tenants,
        roomNumber: rooms.roomNumber,
        propertyName: properties.name,
      })
      .from(tenants)
      .innerJoin(rooms, eq(tenants.roomId, rooms.id))
      .innerJoin(properties, eq(tenants.propertyId, properties.id))
      .where(whereExpr)
      .orderBy(desc(tenants.actualCheckoutDate))
      .limit(pageSize)
      .offset(offset);

    const items = rows.map((r) => ({
      ...r.tenant,
      roomNumber: r.roomNumber,
      propertyName: r.propertyName,
    }));

    return res.status(200).json(
      successResponse({
        items,
        total,
        page,
        pageSize,
      }),
    );
  } catch (error) {
    console.error('❌ 取得歷史租約列表錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/tenants/:id/archive
 * 單一已終止租約歸檔：租客、退租結算、押金、帳單、抄表（入住日至實際退租日）
 */
router.get('/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = routeParamId(req);
    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    const tenantRows = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
      .limit(1);

    if (tenantRows.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    const tenant = tenantRows[0];

    const [roomRow] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, tenant.roomId), isNull(rooms.deletedAt)))
      .limit(1);

    const [propertyRow] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, tenant.propertyId), isNull(properties.deletedAt)))
      .limit(1);

    const settlements = await db
      .select()
      .from(checkoutSettlements)
      .where(eq(checkoutSettlements.tenantId, id))
      .orderBy(desc(checkoutSettlements.checkoutDate));

    const tenantDeposits = await db
      .select()
      .from(deposits)
      .where(and(eq(deposits.tenantId, id), isNull(deposits.deletedAt)))
      .orderBy(desc(deposits.depositDate));

    const tenantPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, id), isNull(payments.deletedAt)))
      .orderBy(desc(payments.paymentMonth));

    const fromDate = tenant.checkInDate;
    const toDate = tenant.actualCheckoutDate ?? new Date();

    const readings = await db
      .select()
      .from(meterReadings)
      .where(
        and(
          eq(meterReadings.roomId, tenant.roomId),
          gte(meterReadings.readingDate, fromDate),
          lte(meterReadings.readingDate, toDate),
        ),
      )
      .orderBy(asc(meterReadings.readingDate));

    return res.status(200).json(
      successResponse({
        tenant,
        room: roomRow ?? null,
        property: propertyRow ?? null,
        checkoutSettlements: settlements,
        deposits: tenantDeposits,
        payments: tenantPayments,
        meterReadings: readings,
        readonly: true,
      }),
    );
  } catch (error) {
    console.error('❌ 取得租約歸檔錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/tenants
 * 取得租客列表（排除已軟刪除的）
 * 可選查詢參數：
 * - propertyId (篩選特定物業的租客)
 * - roomId (篩選特定房間的租客)
 * - status (篩選狀態：active, checked_out)
 * - checkoutFrom, checkoutTo (ISO 日期，篩選 actual_checkout_date，建議與 status=checked_out 併用)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { propertyId, roomId, status, checkoutFrom, checkoutTo } = req.query;

    const conditions = [isNull(tenants.deletedAt)];

    if (propertyId && typeof propertyId === 'string') {
      conditions.push(eq(tenants.propertyId, propertyId));
    }
    if (roomId && typeof roomId === 'string') {
      conditions.push(eq(tenants.roomId, roomId));
    }
    if (status && typeof status === 'string') {
      conditions.push(eq(tenants.status, status));
    }
    if (checkoutFrom && typeof checkoutFrom === 'string') {
      conditions.push(gte(tenants.actualCheckoutDate, parseDateStart(checkoutFrom)));
    }
    if (checkoutTo && typeof checkoutTo === 'string') {
      conditions.push(lte(tenants.actualCheckoutDate, parseDateEnd(checkoutTo)));
    }

    const whereExpr = and(...conditions);

    const tenantList = await db
      .select()
      .from(tenants)
      .where(whereExpr)
      .orderBy(asc(tenants.checkInDate));

    return res.status(200).json(successResponse(tenantList));
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
    const id = routeParamId(req);

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    const tenantRows = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
      .limit(1);

    if (tenantRows.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    return res.status(200).json(successResponse(tenantRows[0]));
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
    const roomRows = await db
      .select()
      .from(schema.rooms)
      .where(and(eq(schema.rooms.id, tenantData.roomId), isNull(schema.rooms.deletedAt)))
      .limit(1);

    if (roomRows.length === 0) {
      return res.status(400).json(errorResponse('指定的房間不存在或已被刪除'));
    }

    // 檢查物業是否存在且未刪除
    const propertyRows = await db
      .select()
      .from(schema.properties)
      .where(
        and(eq(schema.properties.id, tenantData.propertyId), isNull(schema.properties.deletedAt)),
      )
      .limit(1);

    if (propertyRows.length === 0) {
      return res.status(400).json(errorResponse('指定的物業不存在或已被刪除'));
    }

    // 檢查房間是否已入住（同一房間只能有一個 active 租客）
    const existingActiveTenants = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.roomId, tenantData.roomId),
          eq(tenants.status, 'active'),
          isNull(tenants.deletedAt),
        ),
      )
      .limit(1);

    if (existingActiveTenants.length > 0) {
      return res.status(400).json(errorResponse('此房間已有租客入住，請先辦理退租'));
    }

    // 建立租客
    const [newTenant] = await db
      .insert(tenants)
      .values({
        roomId: tenantData.roomId,
        propertyId: tenantData.propertyId,
        nameZh: tenantData.nameZh,
        nameVi: tenantData.nameVi,
        phone: tenantData.phone,
        passportNumber: tenantData.passportNumber || null,
        checkInDate: new Date(tenantData.checkInDate),
        expectedCheckoutDate: tenantData.expectedCheckoutDate
          ? new Date(tenantData.expectedCheckoutDate)
          : null,
        status: tenantData.status || 'active',
        notes: tenantData.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof tenants.$inferInsert)
      .returning();

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
    const id = routeParamId(req);
    const tenantData = req.body as Partial<TenantRequest>;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    // 檢查租客是否存在且未刪除
    const existingTenants = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 如果需要更新 roomId，檢查新房間是否存在
    if (tenantData.roomId && tenantData.roomId !== existingTenants[0].roomId) {
      const roomRows = await db
        .select()
        .from(schema.rooms)
        .where(and(eq(schema.rooms.id, tenantData.roomId), isNull(schema.rooms.deletedAt)))
        .limit(1);

      if (roomRows.length === 0) {
        return res.status(400).json(errorResponse('指定的房間不存在或已被刪除'));
      }

      // 檢查新房間是否已入住（同一房間只能有一個 active 租客）
      const existingActiveTenants = await db
        .select()
        .from(tenants)
        .where(
          and(
            eq(tenants.roomId, tenantData.roomId),
            eq(tenants.status, 'active'),
            isNull(tenants.deletedAt),
          ),
        )
        .limit(1);

      if (existingActiveTenants.length > 0) {
        return res.status(400).json(errorResponse('新房間已有租客入住，請先辦理退租'));
      }
    }

    // 準備更新資料
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // 只更新提供的欄位
    const fields = [
      'roomId',
      'propertyId',
      'nameZh',
      'nameVi',
      'phone',
      'passportNumber',
      'status',
      'notes',
    ];

    fields.forEach((field) => {
      if (tenantData[field as keyof TenantRequest] !== undefined) {
        updateData[field] = tenantData[field as keyof TenantRequest];
      }
    });

    // 處理日期欄位
    if (tenantData.checkInDate !== undefined) {
      updateData.checkInDate = tenantData.checkInDate ? new Date(tenantData.checkInDate) : null;
    }
    if (tenantData.expectedCheckoutDate !== undefined) {
      updateData.expectedCheckoutDate = tenantData.expectedCheckoutDate
        ? new Date(tenantData.expectedCheckoutDate)
        : null;
    }

    // 更新租客
    const [updatedTenant] = await db
      .update(tenants)
      .set(updateData)
      .where(eq(tenants.id, id))
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
    const id = routeParamId(req);

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    // 檢查租客是否存在
    const existingTenants = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 執行軟刪除
    const [deletedTenant] = await db
      .update(tenants)
      .set({
        // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    return res.status(200).json(
      successResponse({
        message: '租客已刪除',
        tenant: deletedTenant,
      }),
    );
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
    const id = routeParamId(req);
    const { status } = req.body;

    if (!id) {
      return res.status(400).json(errorResponse('請提供租客 ID'));
    }

    if (!status || !['active', 'checked_out'].includes(status)) {
      return res.status(400).json(errorResponse('請提供有效的租客狀態 (active, checked_out)'));
    }

    // 檢查租客是否存在且未刪除
    const existingTenants = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
      .limit(1);

    if (existingTenants.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的租客'));
    }

    // 更新租客狀態
    const [updatedTenant] = await db
      .update(tenants)
      .set({
        // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        status,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    return res.status(200).json(successResponse(updatedTenant));
  } catch (error) {
    console.error('❌ 更新租客狀態錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;
