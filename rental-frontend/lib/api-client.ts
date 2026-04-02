/**
 * 規格 v7：NEXT_PUBLIC_API_URL 預設 Zeabur 後端；JWT 存 cookie；請求帶 Bearer。
 */

export const TOKEN_COOKIE_NAME = 'landlord_access_token';

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
  const base =
    process.env.NEXT_PUBLIC_API_URL || 'https://taiwan-landlord-2026.zeabur.app';
  return base.replace(/\/$/, '');
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax${secure}`;
}

export function getAccessToken(): string | null {
  return readCookie(TOKEN_COOKIE_NAME);
}

/** 登入成功後寫入（7 天，與後端 JWT 預設可再調） */
export function setAccessToken(token: string | null): void {
  if (typeof document === 'undefined') return;
  if (!token) {
    document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0`;
    return;
  }
  writeCookie(TOKEN_COOKIE_NAME, token, 60 * 60 * 24 * 7);
}

function clearSessionAndGoLogin(requestPath: string): void {
  if (typeof window === 'undefined') return;
  if (requestPath.includes('/api/auth/login')) return;
  setAccessToken(null);
  const path = window.location.pathname || '';
  if (path !== '/login' && path !== '/') {
    window.location.replace('/login');
  }
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

async function parseEnvelope<T>(res: Response, requestPath: string): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<!doctype')) {
    throw new ApiError(
      '非 JSON 回應：API 可能為 Vercel 保護頁或網址錯誤，請檢查 NEXT_PUBLIC_API_URL',
      res.status,
    );
  }
  let json: Partial<ApiEnvelope<T>> = {};
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : {};
  } catch {
    throw new ApiError(raw || res.statusText || '無效回應', res.status);
  }
  if (!res.ok || json.success === false) {
    const msg = json.message ?? res.statusText;
    if (res.status === 401 && !requestPath.includes('/api/auth/login')) {
      clearSessionAndGoLogin(requestPath);
    }
    throw new ApiError(msg, res.status);
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
  return parseEnvelope<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res, path);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res, path);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res, path);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'omit',
  });
  return parseEnvelope<T>(res, path);
}

export type LoginResult = {
  user: {
    id: string;
    username: string;
    email?: string;
    fullName?: string;
    role: string;
  };
  token: string;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
};

export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<LoginResult> {
  const data = await apiPost<LoginResult>('/api/auth/login', {
    username: username.trim(),
    password,
  });
  if (!data.token && data.tokens?.accessToken) {
    return { ...data, token: data.tokens.accessToken };
  }
  return data;
}

/** 後端多數金額欄位為「分」；顯示為元加千分位 */
export function formatMoneyYuanFromCents(cents: unknown): string {
  const n = Number(cents);
  if (Number.isNaN(n)) return '—';
  return (n / 100).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** 規格：YYYY/MM/DD */
export function formatDateSlash(iso: unknown): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
