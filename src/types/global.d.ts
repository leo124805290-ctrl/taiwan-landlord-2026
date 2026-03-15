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