import { Router, type Request, type Response } from 'express';
import { queryClient } from '../db/index.js';
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

const router = Router();

/**
 * POST /api/admin/clear-all-data
 * 清除所有「業務資料」（保留 users / auth 相關資料）
 *
 * 注意：
 * - 多數表使用 deleted_at（軟刪除）
 * - meter_readings / checkout_settlements 沒有 deleted_at，改用硬刪除
 * - 需要 super_admin 權限
 */
router.post(
  '/clear-all-data',
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    const { confirm } = (req.body ?? {}) as { confirm?: string };

    // 二次確認，避免誤觸
    if (confirm !== 'CLEAR_ALL') {
      return res.status(400).json(errorResponse('Invalid confirm payload'));
    }

    const now = new Date();

    try {
      const result = await queryClient.begin(async (tx) => {
        // 軟刪除：有 deleted_at 的業務表
        await tx.unsafe('UPDATE properties SET deleted_at = $1, updated_at = $2', [now, now]);
        await tx.unsafe('UPDATE property_managers SET deleted_at = $1', [now]);
        await tx.unsafe('UPDATE rooms SET deleted_at = $1, updated_at = $2', [now, now]);
        await tx.unsafe('UPDATE tenants SET deleted_at = $1, updated_at = $2', [now, now]);
        await tx.unsafe('UPDATE deposits SET deleted_at = $1', [now]);
        await tx.unsafe('UPDATE payments SET deleted_at = $1, updated_at = $2', [now, now]);
        await tx.unsafe('UPDATE expenses SET deleted_at = $1, updated_at = $2', [now, now]);
        await tx.unsafe('UPDATE extra_incomes SET deleted_at = $1', [now]);
        await tx.unsafe('UPDATE maintenance SET deleted_at = $1, updated_at = $2', [now, now]);

        // 硬刪除：沒有 deleted_at 的業務表
        await tx.unsafe('DELETE FROM meter_readings');
        await tx.unsafe('DELETE FROM checkout_settlements');

        return {
          cleared_at: now.toISOString(),
        };
      });

      return res.status(200).json(successResponse(result));
    } catch (error) {
      console.error('[POST /api/admin/clear-all-data] error:', error);
      return res.status(500).json(errorResponse('Failed to clear all business data'));
    }
  },
);

export default router;

