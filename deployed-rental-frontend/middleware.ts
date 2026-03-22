import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 公開路徑（不需要登入即可訪問）
const publicPaths = ['/login', '/api/auth/login', '/health'];
// 忽略的路徑（靜態資源等）
const ignoredPaths = ['/_next', '/favicon.ico', '/api/public'];

/**
 * 從 cookie 取得認證 token
 */
function getAuthToken(request: NextRequest): string | null {
  const cookie = request.cookies.get('auth_token');
  return cookie?.value || null;
}

/**
 * 檢查是否為公開路徑
 */
function isPublicPath(pathname: string): boolean {
  return publicPaths.some(path => pathname.startsWith(path));
}

/**
 * 檢查是否為忽略的路徑
 */
function isIgnoredPath(pathname: string): boolean {
  return ignoredPaths.some(path => pathname.startsWith(path));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 檢查是否為忽略的路徑
  if (isIgnoredPath(pathname)) {
    return NextResponse.next();
  }

  // 檢查是否為公開路徑
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 開發階段：跳過認證檢查（方便測試）
  // 正式上線時，請設定環境變數 SKIP_AUTH=false 來啟用認證
  const skipAuth = process.env['SKIP_AUTH'] !== 'false'; // 預設為 true，除非明確設為 false
  if (skipAuth) {
    console.log('[Middleware] Skipping auth check for development');
    return NextResponse.next();
  }

  // 檢查是否已登入（檢查 cookie 中的 token）
  const token = getAuthToken(request);
  if (!token) {
    // 未登入，導向登入頁面
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 已登入，繼續請求
  return NextResponse.next();
}

// Middleware 配置
export const config = {
  matcher: [
    /*
     * 匹配所有路徑，除了：
     * 1. _next/static (靜態檔案)
     * 2. _next/image (圖片優化)
     * 3. favicon.ico (網站圖示)
     * 4. 公開 API 端點（已在 publicPaths 中處理）
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};