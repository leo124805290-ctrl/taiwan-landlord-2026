// 全域類型定義
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN?: string;
    JWT_REFRESH_EXPIRES_IN?: string;
    PORT?: string;
    NODE_ENV?: 'development' | 'production';
    FRONTEND_URL?: string;
    /** 逗號分隔之多來源 CORS，與 FRONTEND_URL 合併去重 */
    FRONTEND_ORIGINS_EXTRA?: string;
    /** db:seed 管理員密碼；未設時種子使用開發預設並警告 */
    SEED_ADMIN_PASSWORD?: string;
    VERCEL_TOKEN?: string;
    /** Vercel Deployments API：專案 ID（Dashboard → Project Settings → General） */
    VERCEL_FRONTEND_PROJECT_ID?: string;
    VERCEL_TEAM_ID?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
  exit(code?: number): never;
  on(event: string, listener: Function): void;
  off(event: string, listener: Function): void;
};

// 解決 console 類型
interface Console {
  log(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  info(message?: any, ...optionalParams: any[]): void;
  debug(message?: any, ...optionalParams: any[]): void;
}