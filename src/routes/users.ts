// @ts-nocheck
import { Router, type Request, type Response } from 'express';
import { sql, eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../utils/password.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

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
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: 'super_admin' | 'admin';
}

interface UserUpdateRequest {
  email?: string;
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
router.get('/', authenticate, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: schema.users.id,
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
 * 取得單一使用者詳細資訊
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(errorResponse('請提供使用者 ID'));
    }

    const users = await db.select({
      id: schema.users.id,
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
router.post('/', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, role = 'admin' }: UserCreateRequest = req.body;

    // 驗證必填欄位
    if (!email || !password) {
      return res.status(400).json(errorResponse('請提供 email 和 password'));
    }

    // 驗證 email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json(errorResponse('email 格式不正確'));
    }

    // 檢查 email 是否已存在
    const existingUsers = await db.select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.email, email),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (existingUsers.length > 0) {
      return res.status(409).json(errorResponse('email 已存在'));
    }

    // 密碼強度檢查
    if (password.length < 8) {
      return res.status(400).json(errorResponse('密碼長度需至少 8 個字元'));
    }

    // 雜湊密碼
    const passwordHash = await hashPassword(password);

    // 建立使用者
    // @ts-ignore - Drizzle 類型問題
    const [newUser] = await db.insert(schema.users).values({
      email,
      passwordHash,
      fullName,
      phone,
      role,
      isActive: true,
    }).returning({
      id: schema.users.id,
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
 * 編輯使用者資訊
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, fullName, phone, role, isActive }: UserUpdateRequest = req.body;

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

    // 如果更新 email，檢查是否與其他使用者衝突
    if (email && email !== existingUsers[0].email) {
      const emailUsers = await db.select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.email, email),
            sql`${schema.users.deletedAt} IS NULL`
          )
        )
        .limit(1);

      if (emailUsers.length > 0) {
        return res.status(409).json(errorResponse('email 已被其他使用者使用'));
      }
    }

    // 更新使用者
    // @ts-ignore - Drizzle 類型問題
    const [updatedUser] = await db.update(schema.users)
      .set({
        email: email || existingUsers[0].email,
        fullName: fullName !== undefined ? fullName : existingUsers[0].fullName,
        phone: phone !== undefined ? phone : existingUsers[0].phone,
        role: role || existingUsers[0].role,
        isActive: isActive !== undefined ? isActive : existingUsers[0].isActive,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.users.id, id))
      .returning({
        id: schema.users.id,
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
 * 軟刪除使用者
 */
router.delete('/:id', async (req: Request, res: Response) => {
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
    const currentUserId = (req as any).user?.id;
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
router.patch('/:id/role', authenticate, requireSuperAdmin, async (req: Request, res: Response) => {
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

export default router;