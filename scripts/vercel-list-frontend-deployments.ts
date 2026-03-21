/**
 * CLI：列出 Vercel 部署（與後端 GET /api/vercel/deployments 共用邏輯）
 * 需環境變數 VERCEL_TOKEN（與 VERCEL_TEAM_ID 選填）
 */
import dotenv from 'dotenv';
import { listVercelDeployments, ERR_VERCEL_NO_TOKEN } from '../src/lib/vercel-api.js';

dotenv.config();

try {
  const data = await listVercelDeployments();
  const parsed = data as { deployments?: Array<{ url?: string; readyState?: string; uid?: string }> };
  for (const d of parsed.deployments ?? []) {
    console.log(
      (d.readyState ?? '').padEnd(12),
      d.url ? `https://${d.url}` : d.uid ?? '',
    );
  }
} catch (e) {
  if (e instanceof Error && e.message === ERR_VERCEL_NO_TOKEN) {
    console.error('請設定 VERCEL_TOKEN（勿 commit）');
    process.exit(1);
  }
  throw e;
}
