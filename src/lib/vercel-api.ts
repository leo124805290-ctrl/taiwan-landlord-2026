import { VERCEL_FRONTEND_PROJECT_ID } from '../config/vercel.js';

export const ERR_VERCEL_NO_TOKEN = 'VERCEL_TOKEN_NOT_CONFIGURED';

export function isVercelApiConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN?.trim());
}

/**
 * 呼叫 Vercel REST API 列出專案部署（使用環境變數 VERCEL_TOKEN，絕不寫入程式碼）。
 * @see https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments
 */
export async function listVercelDeployments(): Promise<unknown> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    const err = new Error(ERR_VERCEL_NO_TOKEN);
    err.name = 'VercelConfigError';
    throw err;
  }

  const url = new URL('https://api.vercel.com/v6/deployments');
  url.searchParams.set('projectId', VERCEL_FRONTEND_PROJECT_ID);
  url.searchParams.set('limit', '20');
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}
