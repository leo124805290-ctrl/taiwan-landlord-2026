#!/usr/bin/env node
/**
 * 使用 Vercel REST API 列出 rental-frontend-2026 最近部署（需 VERCEL_TOKEN）
 * https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments
 */
import { VERCEL_FRONTEND_PROJECT_ID } from './vercel-frontend-constants.mjs';

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error('請設定環境變數 VERCEL_TOKEN（Vercel → Account Settings → Tokens）');
  process.exit(1);
}

const url = new URL('https://api.vercel.com/v6/deployments');
url.searchParams.set('projectId', VERCEL_FRONTEND_PROJECT_ID);
url.searchParams.set('limit', '10');
const teamId = process.env.VERCEL_TEAM_ID;
if (teamId) {
  url.searchParams.set('teamId', teamId);
}

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});

const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status, text);
  process.exit(1);
}

const data = JSON.parse(text);
for (const d of data.deployments ?? []) {
  console.log(
    d.readyState?.padEnd(12),
    d.url ? `https://${d.url}` : d.uid,
    d.meta?.githubCommitMessage ?? '',
  );
}
