import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// 環境變數驗證
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 環境變數未設定');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Token 類型
export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 秒數
}

// 生成 Access Token
export function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'access',
  };

  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

// 生成 Refresh Token
export function generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'refresh',
  };

  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

// 生成 Token 對（Access + Refresh）
export function generateTokenPair(user: {
  id: string;
  email: string;
  role: string;
  fullName?: string;
}): TokenPair {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const expiresIn = parseJwtExpiresInSeconds(JWT_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

// 驗證 Access Token
export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    
    if (decoded.type !== 'access') {
      throw new Error('無效的 token 類型');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('無效的 token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('token 已過期');
    }
    throw error;
  }
}

// 驗證 Refresh Token
export function verifyRefreshToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    
    if (decoded.type !== 'refresh') {
      throw new Error('無效的 token 類型');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('無效的 token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('token 已過期');
    }
    throw error;
  }
}

// 從 Access Token 中解析使用者資訊（不驗證）
export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/** 解析 JWT expiresIn 字串（如 7d、12h）為秒數 */
export function parseJwtExpiresInSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60; // 預設 7 天（秒）
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': // 秒
      return value;
    case 'm': // 分鐘
      return value * 60;
    case 'h': // 小時
      return value * 60 * 60;
    case 'd': // 天
      return value * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
}

// 檢查 token 是否即將過期（剩餘時間小於閾值）
export function isTokenExpiringSoon(
  token: string,
  thresholdSeconds: number = 3600,
): boolean {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = decoded.exp - now;

    return timeRemaining < thresholdSeconds;
  } catch {
    return true;
  }
}

// 從 token 中取得過期時間
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
}

// 導出所有函數
export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  isTokenExpiringSoon,
  getTokenExpiration,
};