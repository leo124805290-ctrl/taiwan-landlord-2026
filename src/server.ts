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
import { autoMigrate } from './db/migrate.js';

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
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// API 路由
app.use('/api/auth', authRouter);
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

  // 預設錯誤
  const statusCode = 'statusCode' in err ? (err as any).statusCode : 500;
  const message = NODE_ENV === 'production' ? '伺服器內部錯誤' : err.message;

  return res.status(statusCode || 500).json(errorResponse(message));
});

// 啟動伺服器（先建表再啟動）
autoMigrate().then(() => {
  app.listen(PORT, () => {
    console.log(`
🚀 台灣房東越南租客管理系統後端 v2.0
✅ 環境: ${NODE_ENV}
📡 埠號: ${PORT}
🔗 前端 URL: ${FRONTEND_URL}
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