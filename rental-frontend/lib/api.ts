/**
 * 單一 API 客戶端：所有需登入的請求都經此處，自動附帶 Authorization。
 * 與後端 docs/ADMIN_FRONTEND.md 約定一致。
 */

export const TOKEN_KEY = 'landlord_access_token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_URL 未設定');
  }
  return base.replace(/\/$/, '');
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  timestamp?: string;
};

async function parseEnvelope<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let json: Partial<ApiEnvelope<T>> = {};
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : {};
  } catch {
    throw new ApiError(raw || res.statusText || '無效回應', res.status);
  }
  if (!res.ok || json.success === false) {
    throw new ApiError(json.message ?? res.statusText, res.status);
  }
  if (json.success !== true) {
    throw new ApiError(json.message ?? '無效回應', res.status);
  }
  return json.data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: authHeaders(),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res);
}

/** 清除所有業務資料（需 admin / super_admin JWT） */
export function clearAllBusinessData() {
  return apiPost<{ cleared_at: string }>('/api/admin/clear-all-data', {
    confirm: 'CLEAR_ALL',
  });
}

export type LoginResult = {
  user: { id: string; email: string; fullName?: string; role: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
};

export async function loginWithPassword(password: string): Promise<LoginResult> {
  return apiPost<LoginResult>('/api/auth/login', { password });
}
