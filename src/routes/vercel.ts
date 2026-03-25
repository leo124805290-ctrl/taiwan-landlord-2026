import { Router, type Request, type Response } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  listVercelDeployments,
  ERR_VERCEL_NO_TOKEN,
  ERR_VERCEL_NO_PROJECT_ID,
} from '../lib/vercel-api.js';

interface ApiResponse<T = unknown> {
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
 * GET /api/vercel/deployments
 * 代理查詢 Vercel 部署清單（使用伺服器端 VERCEL_TOKEN，前端不會拿到 token）
 * 需登入且為 admin 或 super_admin
 */
router.get(
  '/deployments',
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const data = await listVercelDeployments();
      return res.status(200).json(successResponse(data));
    } catch (error) {
      if (error instanceof Error && error.message === ERR_VERCEL_NO_TOKEN) {
        return res.status(503).json(
          errorResponse(
            'Vercel 整合未設定：請在 Zeabur／本機環境變數設定 VERCEL_TOKEN',
          ),
        );
      }
      if (error instanceof Error && error.message === ERR_VERCEL_NO_PROJECT_ID) {
        return res.status(503).json(
          errorResponse(
            'Vercel 整合未設定：請設定環境變數 VERCEL_FRONTEND_PROJECT_ID（專案 Settings → General）',
          ),
        );
      }
      console.error('[GET /api/vercel/deployments]', error);
      return res.status(502).json(
        errorResponse(
          error instanceof Error ? error.message : 'Vercel API 請求失敗',
        ),
      );
    }
  },
);

export default router;
