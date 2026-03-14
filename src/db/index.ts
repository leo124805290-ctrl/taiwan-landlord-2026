import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import * as schema from './schema.js';

// 載入環境變數
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 環境變數未設定');
}

// 建立 PostgreSQL 連線（生產環境建議使用連線池）
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10, // 最大連線數
  idle_timeout: 20, // 閒置超時（秒）
  connect_timeout: 10, // 連線超時（秒）
  prepare: false, // 禁用 prepared statements 以避免連線洩漏
  // SSL 設定（生產環境建議啟用）
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  // 連線生命週期事件
  onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
  onclose: (id) => {
    console.log(`🔌 資料庫連線關閉: ${id}`);
  },
});

// 建立 Drizzle 實例
export const db = drizzle(queryClient, { schema });

// 匯出資料庫連線（用於手動查詢或關閉）
export { queryClient };

// 匯出 schema
export { schema };

// 工具函數：關閉資料庫連線
export async function closeDatabaseConnection() {
  console.log('🔌 關閉資料庫連線...');
  await queryClient.end();
  console.log('✅ 資料庫連線已關閉');
}

// 工具函數：檢查資料庫連線
export async function checkDatabaseConnection() {
  try {
    const result = await queryClient`SELECT NOW() as now`;
    return {
      success: true,
      timestamp: result[0].now,
      message: '資料庫連線正常',
    };
  } catch (error) {
    console.error('❌ 資料庫連線檢查失敗:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知錯誤',
      message: '資料庫連線失敗',
    };
  }
}

// 工具函數：建立軟刪除查詢條件
export function notDeleted<T extends { deletedAt: Date | null }>() {
  return (table: T) => table.deletedAt === null;
}

// 預設匯出
export default db;