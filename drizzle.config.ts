import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // 生成遷移時的安全設定
  verbose: true,
  strict: true,
  // 遷移設定
  migrations: {
    prefix: 'timestamp',
    table: 'drizzle_migrations',
    schema: 'public'
  }
});