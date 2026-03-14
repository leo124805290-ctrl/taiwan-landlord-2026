import { Router, type Request, type Response } from 'express';
import { generateAccessToken, generateRefreshToken, generateTokenPair, verifyToken } from '../utils/jwt.js';
// import { hashPassword, verifyPassword } from '../utils/password.js';
// import { db, schema } from '../db/index.js';

// 統一 API 回應格式（與 server.ts 保持一致）
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

// 簡易版登入請求格式
interface SimpleLoginRequest {
  password: string;
}

// 正式版登入請求格式（暫時註解）
// interface LoginRequest {
//   email: string;
//   password: string;
// }

// 使用者資訊格式
interface UserInfo {
  id: string;
  email: string;
  fullName?: string;
  role: string;
}

const router = Router();

/**
 * POST /api/auth/login
 * 簡易版登入：密碼 = "enter" 就成功
 * 
 * 正式版邏輯先註解掉，之後再實作
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    // 簡易版：只檢查密碼
    const { password } = req.body as SimpleLoginRequest;

    // 驗證請求格式
    if (!password || typeof password !== 'string') {
      return res.status(400).json(errorResponse('請提供密碼'));
    }

    // 簡易版驗證：密碼必須是 "enter"
    if (password !== 'enter') {
      return res.status(401).json(errorResponse('密碼錯誤'));
    }

    // 建立測試使用者資訊
    const testUser: UserInfo = {
      id: 'test-user-id',
      email: 'test@rental.com',
      fullName: '測試使用者',
      role: 'admin'
    };

    // 生成測試 token
    const accessToken = generateAccessToken(testUser);
    const refreshToken = generateRefreshToken(testUser);

    // 回應成功
    return res.status(200).json(successResponse({
      user: testUser,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 3600 // 1小時
      }
    }));

    // ===== 正式版邏輯（先註解掉） =====
    /*
    const { email, password } = req.body as LoginRequest;

    // 驗證請求格式
    if (!email || !password) {
      return res.status(400).json(errorResponse('請提供電子郵件和密碼'));
    }

    // 查詢使用者
    const user = await db.select().from(schema.users)
      .where(sql`${schema.users.email} = ${email} AND ${schema.users.deletedAt} IS NULL`)
      .limit(1);

    if (user.length === 0) {
      return res.status(401).json(errorResponse('電子郵件或密碼錯誤'));
    }

    const userData = user[0];

    // 驗證密碼
    const isValidPassword = await verifyPassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json(errorResponse('電子郵件或密碼錯誤'));
    }

    // 生成 token
    const accessToken = generateAccessToken({
      id: userData.id,
      email: userData.email,
      role: userData.role || 'user'
    });

    const refreshToken = generateRefreshToken({
      id: userData.id,
      email: userData.email,
      role: userData.role || 'user'
    });

    // 更新使用者最後登入時間
    await db.update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(sql`${schema.users.id} = ${userData.id}`);

    // 回應成功
    return res.status(200).json(successResponse({
      user: {
        id: userData.id,
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role || 'user'
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 3600
      }
    }));
    */
  } catch (error) {
    console.error('❌ 登入錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/auth/refresh
 * 刷新 Access Token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json(errorResponse('請提供刷新令牌'));
    }

    // 驗證 refresh token
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return res.status(401).json(errorResponse('無效的刷新令牌'));
    }

    // 生成新的 access token
    const newAccessToken = generateAccessToken({
      id: payload.id,
      email: payload.email,
      role: payload.role
    });

    return res.status(200).json(successResponse({
      accessToken: newAccessToken,
      expiresIn: 3600
    }));
  } catch (error) {
    console.error('❌ 刷新令牌錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/auth/logout
 * 登出（由前端清除 token）
 */
router.post('/logout', (_req: Request, res: Response) => {
  return res.status(200).json(successResponse({
    message: '已成功登出'
  }));
});

/**
 * GET /api/auth/me
 * 取得當前使用者資訊
 */
router.get('/me', (req: Request, res: Response) => {
  try {
    // 從 Authorization header 取得 token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(errorResponse('需要登入才能存取此資源'));
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload || payload.type !== 'access') {
      return res.status(401).json(errorResponse('無效的認證憑證'));
    }

    // 回應使用者資訊
    const userInfo: UserInfo = {
      id: payload.id,
      email: payload.email,
      role: payload.role
    };

    return res.status(200).json(successResponse(userInfo));
  } catch (error) {
    console.error('❌ 取得使用者資訊錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;