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

// 物業建立/更新請求格式
interface PropertyRequest {
  name: string;
  address: string;
  totalFloors: number;
  landlordName: string;
  landlordPhone: string;
  landlordDeposit: number;
  landlordMonthlyRent: number;
  prepaidPeriod: number; // 預付週期（月）
  contractStartDate: string; // ISO 格式日期
  contractEndDate: string; // ISO 格式日期
}

const router = Router();

/**
 * GET /api/properties
 * 取得物業列表（排除已軟刪除的）
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const properties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.deletedAt} IS NULL`)
      .orderBy(schema.properties.createdAt);

    return res.status(200).json(successResponse(properties));
  } catch (error) {
    console.error('❌ 取得物業列表錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/properties/:id
 * 取得單一物業詳細資訊
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供物業 ID'));
    }

    const properties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.id} = ${id} AND ${schema.properties.deletedAt} IS NULL`)
      .limit(1);

    if (properties.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的物業'));
    }

    return res.status(200).json(successResponse(properties[0]));
  } catch (error) {
    console.error('❌ 取得物業詳細資訊錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/properties
 * 新增物業
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const propertyData = req.body as PropertyRequest;

    // 驗證必要欄位
    const requiredFields = ['name', 'address', 'totalFloors', 'landlordName', 'landlordPhone'];
    for (const field of requiredFields) {
      if (!propertyData[field as keyof PropertyRequest]) {
        return res.status(400).json(errorResponse(`請提供 ${field}`));
      }
    }

    // 建立物業
    // @ts-ignore - Drizzle 類型問題
    const [newProperty] = await db.insert(schema.properties).values({
      name: propertyData.name,
      address: propertyData.address,
      totalFloors: propertyData.totalFloors,
      landlordName: propertyData.landlordName,
      landlordPhone: propertyData.landlordPhone,
      landlordDeposit: propertyData.landlordDeposit || 0,
      landlordMonthlyRent: propertyData.landlordMonthlyRent || 0,
      prepaidPeriod: propertyData.prepaidPeriod || 1,
      contractStartDate: propertyData.contractStartDate ? new Date(propertyData.contractStartDate) : null,
      contractEndDate: propertyData.contractEndDate ? new Date(propertyData.contractEndDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json(successResponse(newProperty));
  } catch (error) {
    console.error('❌ 新增物業錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PUT /api/properties/:id
 * 編輯物業
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const propertyData = req.body as Partial<PropertyRequest>;

    if (!id) {
      return res.status(400).json(errorResponse('請提供物業 ID'));
    }

    // 檢查物業是否存在且未刪除
    const existingProperties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.id} = ${id} AND ${schema.properties.deletedAt} IS NULL`)
      .limit(1);

    if (existingProperties.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的物業'));
    }

    // 準備更新資料
    const updateData: any = {
      updatedAt: new Date(),
    };

    // 只更新提供的欄位
    const fields = ['name', 'address', 'totalFloors', 'landlordName', 'landlordPhone', 
                   'landlordDeposit', 'landlordMonthlyRent', 'prepaidPeriod'];
    
    fields.forEach(field => {
      if (propertyData[field as keyof PropertyRequest] !== undefined) {
        updateData[field] = propertyData[field as keyof PropertyRequest];
      }
    });

    // 處理日期欄位
    if (propertyData.contractStartDate !== undefined) {
      updateData.contractStartDate = propertyData.contractStartDate ? new Date(propertyData.contractStartDate) : null;
    }
    if (propertyData.contractEndDate !== undefined) {
      updateData.contractEndDate = propertyData.contractEndDate ? new Date(propertyData.contractEndDate) : null;
    }

    // 更新物業
    const [updatedProperty] = await db.update(schema.properties)
      .set(updateData)
      .where(sql`${schema.properties.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse(updatedProperty));
  } catch (error) {
    console.error('❌ 編輯物業錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * DELETE /api/properties/:id
 * 軟刪除物業（設定 deleted_at）
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供物業 ID'));
    }

    // 檢查物業是否存在
    const existingProperties = await db.select()
      .from(schema.properties)
      .where(sql`${schema.properties.id} = ${id} AND ${schema.properties.deletedAt} IS NULL`)
      .limit(1);

    if (existingProperties.length === 0) {
      return res.status(404).json(errorResponse('找不到指定的物業'));
    }

    // 執行軟刪除
    const [deletedProperty] = await db.update(schema.properties)
      // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
      .set({ 
        // @ts-ignore - Drizzle 類型問題，待 schema 對齊後修復
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${schema.properties.id} = ${id}`)
      .returning();

    return res.status(200).json(successResponse({
      message: '物業已刪除',
      property: deletedProperty
    }));
  } catch (error) {
    console.error('❌ 刪除物業錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;