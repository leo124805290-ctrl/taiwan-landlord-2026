/**
 * API 客戶端
 * 統一處理所有 API 請求、錯誤處理、認證標頭
 */

// 基礎 API URL
// 瀏覽器端優先走同源 `/api/*`（由 Next.js rewrites 代理到 Zeabur），避免 CORS。
// 伺服器端（SSR/Route Handlers）則可直接打到後端網址。
function getApiBaseUrl(): string {
  // @ts-ignore - process.env 由 Next.js 提供
  const envBase = process.env['NEXT_PUBLIC_API_URL'] || 'https://taiwan-landlord-2026.zeabur.app';
  return typeof window === 'undefined' ? envBase : '';
}

// 請求逾時時間（毫秒）
const REQUEST_TIMEOUT = 10000;

// 連線狀態類型
export type ConnectionStatus = 'success' | 'error' | 'timeout' | 'offline';

// API 回應格式（與後端保持一致）
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

// API 錯誤類別
export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// 連線狀態檢查
async function checkConnectionStatus(): Promise<ConnectionStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${getApiBaseUrl()}/health`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return 'success';
    } else {
      return 'error';
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return 'timeout';
    }
    return 'offline';
  }
}

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_TOKEN_EXPIRES_KEY = 'auth_token_expires';

// 從 localStorage 或 cookie 取得 token（與登入後寫入方式一致）
function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null;

  try {
    const fromLs = localStorage.getItem(AUTH_TOKEN_KEY);
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const parts = cookie.trim().split('=');
    if (parts.length >= 2 && parts[0] === AUTH_TOKEN_KEY) {
      return decodeURIComponent(parts.slice(1).join('='));
    }
  }
  return null;
}

// 設定 token（localStorage + cookie + 到期時間）
export function setAuthToken(token: string, expiresInHours: number = 24): void {
  if (typeof document === 'undefined') return;

  const expires = new Date();
  expires.setTime(expires.getTime() + expiresInHours * 60 * 60 * 1000);

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_TOKEN_EXPIRES_KEY, expires.toISOString());
  } catch {
    /* ignore */
  }

  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; expires=${expires.toUTCString()}; SameSite=Lax${secure}`;
}

// 移除 token
export function removeAuthToken(): void {
  if (typeof document === 'undefined') return;

  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_EXPIRES_KEY);
  } catch {
    /* ignore */
  }

  document.cookie = `${AUTH_TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

// 取得授權標頭
function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};

  return {
    'Authorization': `Bearer ${token}`,
  };
}

// 基礎請求函數
async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; status: number; headers: Headers }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // 合併標頭
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    };

    // 發出請求
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
      // 跨網域呼叫 Zeabur 後端時避免因 credentials 造成 CORS 失敗
      credentials: 'omit',
    });

    clearTimeout(timeoutId);

    // 解析回應
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new ApiError(`非 JSON 回應: ${text}`, response.status);
    }

    // 檢查回應格式
    const apiResponse = data as ApiResponse<T>;
    
    if (!apiResponse.success) {
      throw new ApiError(
        apiResponse.message || 'API 請求失敗',
        response.status,
        apiResponse.data
      );
    }

    return {
      data: apiResponse.data as T,
      status: response.status,
      headers: response.headers,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('請求逾時，請稍後再試', 408);
    }

    throw new ApiError(
      error instanceof Error ? error.message : '未知錯誤',
      500
    );
  }
}

// HTTP 方法封裝
export const api = {
  // GET 請求
  async get<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
    const { data } = await request<T>(endpoint, {
      ...options,
      method: 'GET',
    });
    return data;
  },

  // POST 請求
  async post<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    const { data } = await request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : null,
    });
    return data;
  },

  // PUT 請求
  async put<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    const { data } = await request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : null,
    });
    return data;
  },

  // DELETE 請求
  async delete<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
    const { data } = await request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
    return data;
  },

  // PATCH 請求
  async patch<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    const { data } = await request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : null,
    });
    return data;
  },

  // 檢查連線狀態
  checkConnectionStatus,

  // 取得 token
  getAuthToken,

  // 設定 token
  setAuthToken,

  // 移除 token
  removeAuthToken,
};

export default api;