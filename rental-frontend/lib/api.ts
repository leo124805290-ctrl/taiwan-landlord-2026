/**
 * 相容舊 import，實作見 api-client（規格 v7）
 */
export {
  ApiError,
  TOKEN_COOKIE_NAME as TOKEN_KEY,
  getApiBase,
  getAccessToken,
  setAccessToken,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  loginWithCredentials,
  formatMoneyYuanFromCents,
  formatDateSlash,
  type LoginResult,
} from './api-client';

export async function clearAllBusinessData() {
  const { apiPost } = await import('./api-client');
  return apiPost<{ cleared_at: string }>('/api/admin/clear-all-data', {
    confirm: 'CLEAR_ALL',
  });
}
