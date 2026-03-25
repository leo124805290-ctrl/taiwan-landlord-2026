/**
 * Vercel 前端專案 ID（Deployments API 用）。
 * 請在環境變數設定，勿將專案專用 ID 寫死於公開 repo。
 */
export const VERCEL_FRONTEND_PROJECT_ID = process.env.VERCEL_FRONTEND_PROJECT_ID?.trim() || '';
