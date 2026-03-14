import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// 環境變數驗證
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 環境變數未設定');
}

const JWT_SECRET = process.env.JWT_SECRET;

// 擴展 Express Request 類型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        fullName?: string;
      };
      token?: string;
    }
  }
}

// 錯誤類型
export class AuthenticationError extends Error {
  statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// JWT 驗證 middleware
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 從 Authorization header 取得 token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('缺少有效的 Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AuthenticationError('缺少 token');
    }

    // 驗證 token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      fullName?: string;
      type: 'access';
    };

    // 檢查 token 類型
    if (decoded.type !== 'access') {
      throw new AuthenticationError('無效的 token 類型');
    }

    // 將使用者資訊附加到 request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName,
    };
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('無效的 token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('token 已過期'));
    } else {
      next(error);
    }
  }
};

// 角色檢查 middleware
export const requireRole = (allowedRoles: string | string[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('需要登入才能存取此資源');
      }

      if (!roles.includes(req.user.role)) {
        throw new AuthorizationError('權限不足');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// 管理員檢查（super_admin 或 admin）
export const requireAdmin = requireRole(['super_admin', 'admin']);

// 超級管理員檢查
export const requireSuperAdmin = requireRole('super_admin');

// 登入檢查（僅檢查是否登入，不檢查角色）
export const requireLogin = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('需要登入才能存取此資源');
    }
    next();
  } catch (error) {
    next(error);
  }
};

// 錯誤處理 middleware（應在最後使用）
export const authErrorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AuthenticationError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } else if (error instanceof AuthorizationError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } else {
    next(error);
  }
};

// 導出所有 middleware
export default {
  authenticate,
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireLogin,
  authErrorHandler,
};