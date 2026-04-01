// @ts-nocheck
import { Router, type Request, type Response } from 'express';
import { sql, eq, and, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../utils/password.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { normalizeUsername, validateUsername } from '../utils/username.js';

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

// 使用者建立/更新請求格式
interface UserCreateRequest {
  username: string;
  password: string;
  fullName?: string;
  phone?: string;
  /** 聯絡用，選填 */
  email?: string | null;
  role?: 'super_admin' | 'admin';
}

interface UserUpdateRequest {
  username?: string;
  email?: string | null;
  fullName?: string;
  phone?: string;
  role?: 'super_admin' | 'admin';
  isActive?: boolean;
}

interface ChangeRoleRequest {
  role: 'super_admin' | 'admin';
}

const router = Router();

/**
 * GET /api/users
 * 取得使用者列表（只有 super_admin 能用）
 * 排除已軟刪除的使用者
 */
router.get('/', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      fullName: schema.users.fullName,
      phone: schema.users.phone,
      role: schema.users.role,
      isActive: schema.users.isActive,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
      .from(schema.users)
      .where(sql`${schema.users.deletedAt} IS NULL`)
      .orderBy(schema.users.createdAt);

    return res.status(200).json(successResponse(users));
  } catch (error) {
    console.error('❌ 取得使用者列表錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * GET /api/users/:id
 * 取得單一使用者詳細資訊（需要登入）
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供使用者 ID'));
    }

    const users = await db.select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      fullName: schema.users.fullName,
      phone: schema.users.phone,
      role: schema.users.role,
      isActive: schema.users.isActive,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, id),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (users.length === 0) {
      return res.status(404).json(errorResponse('使用者不存在'));
    }

    return res.status(200).json(successResponse(users[0]));
  } catch (error) {
    console.error('❌ 取得使用者錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/users
 * 建立管理員帳號（只有 super_admin 能用）
 */
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, phone, email, role = 'admin' }: UserCreateRequest = req.body;

    if (!username || !password) {
      return res.status(400).json(errorResponse('請提供帳號（username）與密碼'));
    }

    const uErr = validateUsername(username);
    if (uErr) {
      return res.status(400).json(errorResponse(uErr));
    }
    const normalizedUser = normalizeUsername(username);

    const dup = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.username, normalizedUser), sql`${schema.users.deletedAt} IS NULL`))
      .limit(1);
    if (dup.length > 0) {
      return res.status(409).json(errorResponse('此帳號已被使用'));
    }

    let emailVal: string | null = null;
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      const em = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(em)) {
        return res.status(400).json(errorResponse('聯絡 Email 格式不正確'));
      }
      const emailDup = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.email, em), sql`${schema.users.deletedAt} IS NULL`))
        .limit(1);
      if (emailDup.length > 0) {
        return res.status(409).json(errorResponse('此 Email 已被使用'));
      }
      emailVal = em;
    }

    if (password.length < 8) {
      return res.status(400).json(errorResponse('密碼長度需至少 8 個字元'));
    }

    const passwordHash = await hashPassword(password);

    // @ts-ignore - Drizzle 類型問題
    const [newUser] = await db.insert(schema.users).values({
      username: normalizedUser,
      email: emailVal,
      passwordHash,
      fullName,
      phone,
      role,
      isActive: true,
    }).returning({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      fullName: schema.users.fullName,
      phone: schema.users.phone,
      role: schema.users.role,
      isActive: schema.users.isActive,
    });

    return res.status(201).json(successResponse(newUser));
  } catch (error) {
    console.error('❌ 建立使用者錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PUT /api/users/:id
 * 編輯使用者資訊（需要登入）
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, fullName, phone, role, isActive }: UserUpdateRequest = req.body;

    if (!id) {
      return res.status(400).json(errorResponse('請提供使用者 ID'));
    }

    const existingUsers = await db.select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, id),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingUsers.length === 0) {
      return res.status(404).json(errorResponse('使用者不存在'));
    }

    const cur = existingUsers[0];

    let nextUsername = cur.username;
    if (username !== undefined && username !== null && String(username).trim() !== '') {
      const uErr = validateUsername(username);
      if (uErr) {
        return res.status(400).json(errorResponse(uErr));
      }
      nextUsername = normalizeUsername(username);
      if (nextUsername !== cur.username) {
        const taken = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.username, nextUsername),
              ne(schema.users.id, id),
              sql`${schema.users.deletedAt} IS NULL`,
            ),
          )
          .limit(1);
        if (taken.length > 0) {
          return res.status(409).json(errorResponse('此帳號已被其他使用者使用'));
        }
      }
    }

    let nextEmail = cur.email;
    if (email !== undefined) {
      if (email === null || String(email).trim() === '') {
        nextEmail = null;
      } else {
        const em = String(email).trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(em)) {
          return res.status(400).json(errorResponse('聯絡 Email 格式不正確'));
        }
        if (em !== cur.email) {
          const emailUsers = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.email, em),
                ne(schema.users.id, id),
                sql`${schema.users.deletedAt} IS NULL`,
              ),
            )
            .limit(1);
          if (emailUsers.length > 0) {
            return res.status(409).json(errorResponse('此 Email 已被其他使用者使用'));
          }
        }
        nextEmail = em;
      }
    }

    // @ts-ignore - Drizzle 類型問題
    const [updatedUser] = await db.update(schema.users)
      .set({
        username: nextUsername,
        email: nextEmail,
        fullName: fullName !== undefined ? fullName : cur.fullName,
        phone: phone !== undefined ? phone : cur.phone,
        role: role || cur.role,
        isActive: isActive !== undefined ? isActive : cur.isActive,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.users.id, id))
      .returning({
        id: schema.users.id,
        username: schema.users.username,
        email: schema.users.email,
        fullName: schema.users.fullName,
        phone: schema.users.phone,
        role: schema.users.role,
        isActive: schema.users.isActive,
        updatedAt: schema.users.updatedAt,
      });

    return res.status(200).json(successResponse(updatedUser));
  } catch (error) {
    console.error('❌ 更新使用者錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * DELETE /api/users/:id
 * 軟刪除使用者（需登入且為 super_admin；不可刪除自己）
 */
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供使用者 ID'));
    }

    // 檢查使用者是否存在
    const existingUsers = await db.select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, id),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingUsers.length === 0) {
      return res.status(404).json(errorResponse('使用者不存在'));
    }

    // 防止刪除自己
    const currentUserId = req.user?.id;
    if (currentUserId && currentUserId === id) {
      return res.status(400).json(errorResponse('不能刪除自己的帳號'));
    }

    // 軟刪除
    // @ts-ignore - Drizzle 類型問題
    await db.update(schema.users)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.users.id, id));

    return res.status(200).json(successResponse({ message: '使用者已刪除' }));
  } catch (error) {
    console.error('❌ 刪除使用者錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * PATCH /api/users/:id/role
 * 修改使用者角色（只有 super_admin 能用）
 */
router.patch('/:id/role', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role }: ChangeRoleRequest = req.body;

    if (!id) {
      return res.status(400).json(errorResponse('請提供使用者 ID'));
    }

    if (!role || !['super_admin', 'admin'].includes(role)) {
      return res.status(400).json(errorResponse('請提供有效的角色 (super_admin 或 admin)'));
    }

    // 檢查使用者是否存在
    const existingUsers = await db.select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, id),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingUsers.length === 0) {
      return res.status(404).json(errorResponse('使用者不存在'));
    }

    // 更新角色
    // @ts-ignore - Drizzle 類型問題
    const [updatedUser] = await db.update(schema.users)
      .set({
        role,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.users.id, id))
      .returning({
        id: schema.users.id,
        username: schema.users.username,
        email: schema.users.email,
        role: schema.users.role,
        updatedAt: schema.users.updatedAt,
      });

    return res.status(200).json(successResponse(updatedUser));
  } catch (error) {
    console.error('❌ 修改使用者角色錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/users/clear-all-data
 * 清除所有業務資料（保留使用者帳戶）
 * 僅限 super_admin 使用
 */
router.post('/clear-all-data', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { confirm }: { confirm?: string } = req.body;
    
    // 安全確認：需要明確的確認文字
    if (confirm !== 'CLEAR_ALL') {
      return res.status(400).json(errorResponse('請提供確認文字 "CLEAR_ALL" 以執行此操作'));
    }

    // 開始資料庫交易，確保全部成功或全部失敗
    await db.transaction(async (tx) => {
      console.log('🚨 開始清除所有業務資料（保留使用者帳戶）...');

      // 按正確順序清除資料（考慮外鍵約束）
      // 1. 先清除有外鍵依賴的表
      await tx.delete(schema.propertyManagers);
      console.log('✅ 已清除 property_managers 表');
      
      await tx.delete(schema.deposits);
      console.log('✅ 已清除 deposits 表');
      
      await tx.delete(schema.meterReadings);
      console.log('✅ 已清除 meter_readings 表');
      
      await tx.delete(schema.payments);
      console.log('✅ 已清除 payments 表');
      
      await tx.delete(schema.checkoutSettlements);
      console.log('✅ 已清除 checkout_settlements 表');
      
      await tx.delete(schema.expenses);
      console.log('✅ 已清除 expenses 表');
      
      await tx.delete(schema.extraIncomes);
      console.log('✅ 已清除 extra_incomes 表');
      
      await tx.delete(schema.maintenance);
      console.log('✅ 已清除 maintenance 表');
      
      await tx.delete(schema.tenants);
      console.log('✅ 已清除 tenants 表');
      
      // 2. 清除房間資料
      await tx.delete(schema.rooms);
      console.log('✅ 已清除 rooms 表');
      
      // 3. 最後清除物業資料
      await tx.delete(schema.properties);
      console.log('✅ 已清除 properties 表');
      
      // 注意：users 表保留不刪除
      console.log('✅ 使用者帳戶已保留');
    });

    console.log('🎉 所有業務資料清除完成，使用者帳戶已保留');
    return res.status(200).json(successResponse({
      message: '所有業務資料已清除，使用者帳戶已保留',
      clearedTables: [
        'property_managers',
        'deposits', 
        'meter_readings',
        'payments',
        'checkout_settlements',
        'expenses',
        'extra_incomes',
        'maintenance',
        'tenants',
        'rooms',
        'properties'
      ],
      retainedTables: ['users']
    }));
  } catch (error) {
    console.error('❌ 清除所有資料錯誤:', error);
    return res.status(500).json(errorResponse('清除資料時發生錯誤'));
  }
});

export default router;