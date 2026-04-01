import { Router, type Request, type Response } from 'express';
import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  generateAccessToken,
  generateTokenPair,
  parseJwtExpiresInSeconds,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import type { TokenPayload } from '../utils/jwt.js';
import { comparePassword } from '../utils/password.js';
import { db, schema } from '../db/index.js';
import { normalizeUsername } from '../utils/username.js';

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

interface UserInfo {
  id: string;
  username: string;
  email?: string;
  fullName?: string;
  role: string;
}

const router = Router();

/** 舊 JWT 僅含 email 時補上 username */
function payloadUsername(p: TokenPayload & { email?: string }): string {
  if (p.username && p.username.length > 0) return p.username;
  return p.email && p.email.includes('@')
    ? p.email.split('@')[0] || 'user'
    : p.email || 'user';
}

/**
 * POST /api/auth/login
 * body: { username, password } — 以「帳號」登入（非 Email）
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json(errorResponse('請提供帳號與密碼'));
    }

    const normalizedUser = normalizeUsername(username);

    const rows = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.username, normalizedUser), isNull(schema.users.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      return res.status(401).json(errorResponse('帳號或密碼錯誤'));
    }

    const userData = rows[0];
    if (!userData.isActive) {
      return res.status(403).json(errorResponse('帳號已停用'));
    }

    const isValidPassword = await comparePassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json(errorResponse('帳號或密碼錯誤'));
    }

    const { accessToken, refreshToken, expiresIn } = generateTokenPair({
      id: userData.id,
      username: userData.username,
      email: userData.email ?? undefined,
      role: userData.role || 'admin',
      fullName: userData.fullName ?? undefined,
    });

    await db.execute(
      sql`UPDATE users SET last_login_at = ${new Date()} WHERE id = ${userData.id}`,
    );

    const user: UserInfo = {
      id: userData.id,
      username: userData.username,
      email: userData.email ?? undefined,
      fullName: userData.fullName ?? undefined,
      role: userData.role || 'admin',
    };

    return res.status(200).json(
      successResponse({
        user,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn,
        },
      }),
    );
  } catch (error) {
    console.error('❌ 登入錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json(errorResponse('請提供刷新令牌'));
    }

    const payload = verifyRefreshToken(refreshToken) as TokenPayload & { email?: string };
    if (!payload || payload.type !== 'refresh') {
      return res.status(401).json(errorResponse('無效的刷新令牌'));
    }

    const newAccessToken = generateAccessToken({
      id: payload.id,
      username: payloadUsername(payload),
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
    });

    const newExpiresIn = parseJwtExpiresInSeconds(process.env.JWT_EXPIRES_IN || '7d');

    return res.status(200).json(
      successResponse({
        accessToken: newAccessToken,
        expiresIn: newExpiresIn,
      }),
    );
  } catch (error) {
    console.error('❌ 刷新令牌錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  return res.status(200).json(
    successResponse({
      message: '已成功登出',
    }),
  );
});

router.get('/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(errorResponse('需要登入才能存取此資源'));
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token) as TokenPayload & { email?: string };

    if (!payload || payload.type !== 'access') {
      return res.status(401).json(errorResponse('無效的認證憑證'));
    }

    const userInfo: UserInfo = {
      id: payload.id,
      username: payloadUsername(payload),
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
    };

    return res.status(200).json(successResponse(userInfo));
  } catch (error) {
    console.error('❌ 取得使用者資訊錯誤:', error);
    return res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

export default router;
