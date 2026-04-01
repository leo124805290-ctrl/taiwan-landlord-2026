// 確保 autoMigrate 和 debug 端點正確部署
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import propertiesRouter from './routes/properties.js';
import roomsRouter from './routes/rooms.js';
import tenantsRouter from './routes/tenants.js';
import checkinRouter from './routes/checkin.js';
import paymentsRouter from './routes/payments.js';
import meterReadingsRouter from './routes/meter-readings.js';
import depositsRouter from './routes/deposits.js';
import checkoutRouter from './routes/checkout.js';
import expensesRouter from './routes/expenses.js';
import incomesRouter from './routes/incomes.js';
import reportsRouter from './routes/reports.js';
import maintenanceRouter from './routes/maintenance.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';
import vercelRouter from './routes/vercel.js';
import { autoMigrate } from './db/migrate.js';
import { queryClient } from './db/index.js';
import { authenticate } from './middleware/auth.js';
import { hashPassword } from './utils/password.js';
import { normalizeUsername, validateUsername } from './utils/username.js';

// 載入環境變數
dotenv.config();

// 環境變數驗證
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PORT'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ 缺少必要的環境變數: ${envVar}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const EXTRA_CORS_ORIGINS = (process.env.FRONTEND_ORIGINS_EXTRA || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const ALLOWED_CORS_ORIGINS = [...new Set([FRONTEND_URL.trim(), ...EXTRA_CORS_ORIGINS])];

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

// Express 應用程式
const app = express();

// Middleware 順序：helmet → cors → json → urlencoded → morgan
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (ALLOWED_CORS_ORIGINS.includes(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 健康檢查端點
app.get('/health', (_req: Request, res: Response) => {
  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'taiwan-landlord-backend-v2',
    version: '2.0.0'
  }));
});

// 資料庫除錯端點（僅開發環境，正式環境不暴露）
if (NODE_ENV === 'development') {
  app.get('/api/debug/db-status', async (_req: Request, res: Response) => {
    try {
      const tables = await queryClient`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;

      const counts: Record<string, number> = {};
      for (const t of tables) {
        try {
          const result = await queryClient`
            SELECT COUNT(*) as count FROM ${queryClient(t.table_name)}
          `;
          counts[t.table_name] = Number(result[0].count);
        } catch {
          counts[t.table_name] = -1;
        }
      }

      res.json({
        success: true,
        data: {
          tables: tables.map((t) => t.table_name),
          tableCount: tables.length,
          rowCounts: counts,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '未知錯誤',
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * 臨時：建立或重置 admin（僅在 Zeabur 初次建立帳號時使用，請勿長期暴露）。
 * 需設定環境變數 ALLOW_DEBUG_CREATE_ADMIN=true 才會啟用。
 */
app.post('/api/debug/create-admin', async (req: Request, res: Response) => {
  const allow =
    NODE_ENV === 'development' || process.env.ALLOW_DEBUG_CREATE_ADMIN === 'true';
  if (!allow) {
    res
      .status(403)
      .json(
        errorResponse(
          '此端點未啟用：請在 Zeabur 設定環境變數 ALLOW_DEBUG_CREATE_ADMIN=true 後重新部署',
        ),
      );
    return;
  }
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json(errorResponse('請提供 username 與 password'));
      return;
    }
    const uErr = validateUsername(username);
    if (uErr) {
      res.status(400).json(errorResponse(uErr));
      return;
    }
    const normalized = normalizeUsername(username);
    const passwordHash = await hashPassword(password);
    await queryClient`
      INSERT INTO users (username, password_hash, full_name, role, is_active)
      VALUES (${normalized}, ${passwordHash}, ${'超級管理員'}, ${'super_admin'}, true)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        is_active = true,
        deleted_at = NULL,
        updated_at = NOW()
    `;
    res.json(successResponse({ message: 'admin 帳號已建立或已更新' }));
  } catch (error) {
    console.error('❌ create-admin:', error);
    res.status(500).json(errorResponse('伺服器內部錯誤'));
  }
});

// 公開認證路由必須掛在全域 JWT 中介層之前，避免反向代理下 req.path 與預期不符而誤擋 POST /api/auth/login
app.use('/api/auth', authRouter);

/**
 * 除 /api/auth/*（已由 authRouter 處理）與開發用 debug 外，其餘 /api/* 需 Bearer JWT
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }
  if (req.path.startsWith('/api/auth')) {
    next();
    return;
  }
  if (
    NODE_ENV === 'development' &&
    req.path === '/api/debug/db-status' &&
    req.method === 'GET'
  ) {
    next();
    return;
  }
  void authenticate(req, res, next);
});

// API 路由（需 JWT）
app.use('/api/properties', propertiesRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/meter-readings', meterReadingsRouter);
app.use('/api/deposits', depositsRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/incomes', incomesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/vercel', vercelRouter);

// 暫時保留舊路由（相容性）
app.get('/api/v1/properties', (_req: Request, res: Response) => {
  res.json(successResponse([]));
});

// 404 處理
app.use((_req: Request, res: Response) => {
  res.status(404).json(errorResponse('API 端點不存在'));
});

// 統一錯誤處理 middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ 伺服器錯誤:', err);

  // 如果是 JWT 錯誤
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(errorResponse('無效的認證憑證'));
  }

  // 如果是語法錯誤
  if (err.name === 'SyntaxError' && 'body' in err) {
    return res.status(400).json(errorResponse('請求格式錯誤'));
  }

  const statusCode =
    'statusCode' in err && typeof (err as { statusCode?: number }).statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;
  const message =
    statusCode >= 500 && NODE_ENV === 'production'
      ? '伺服器內部錯誤'
      : err.message;

  return res.status(statusCode || 500).json(errorResponse(message));
});

// 啟動伺服器（先建表再啟動）
autoMigrate().then(() => {
  app.listen(PORT, () => {
    console.log(`
🚀 台灣房東越南租客管理系統後端 v2.0
✅ 環境: ${NODE_ENV}
📡 埠號: ${PORT}
🔗 CORS 允許來源: ${ALLOWED_CORS_ORIGINS.join(', ')}
💾 資料庫: ${process.env.DATABASE_URL?.split('@')[1] || '已連接'}
✨ API 端點: http://localhost:${PORT}
   ├── GET  /health
   ├── GET  /api/v1/properties
   └── ...
    `);
  });
}).catch((err) => {
  console.error('❌ 資料庫初始化失敗，無法啟動:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 收到 SIGTERM 訊號，正在關閉伺服器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 收到 SIGINT 訊號，正在關閉伺服器...');
  process.exit(0);
});