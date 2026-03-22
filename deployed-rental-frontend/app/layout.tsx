'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Building, Users, CreditCard, Gauge, LogOut, TrendingDown, TrendingUp, BarChart3, Wrench, Home, UserCog, Menu } from 'lucide-react';
import { UserSessionMenu } from '@/components/app-shell/user-session-menu';

const navItems = [
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/properties', label: '物業管理', icon: Building },
  { href: '/rooms', label: '全部房間', icon: Home },
  { href: '/tenants', label: '租客管理', icon: Users },
  { href: '/payments', label: '收租管理', icon: CreditCard },
  { href: '/meter-readings', label: '抄電錶', icon: Gauge },
  { href: '/checkout', label: '退租結算', icon: LogOut },
  { href: '/expenses', label: '支出管理', icon: TrendingDown },
  { href: '/incomes', label: '補充收入', icon: TrendingUp },
  { href: '/reports', label: '損益報表', icon: BarChart3 },
  { href: '/maintenance', label: '維修紀錄', icon: Wrench },
  { href: '/users', label: '使用者管理', icon: UserCog },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/dashboard' && pathname === '/') return true;
    // 物業列表僅 /properties；子路徑 /properties/[id] 不應高亮「物業管理」
    if (href === '/properties') return pathname === '/properties';
    return pathname.startsWith(href);
  };

  if (pathname === '/login') {
    return (
      <html lang="zh-TW">
        <body className="min-h-screen bg-slate-100">{children}</body>
      </html>
    );
  }

  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-slate-100">
        <div className="flex h-screen">
          {/* 側邊導航列 */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 transform transition-transform duration-200 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
          >
            {/* Logo 區 */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Home className="w-6 h-6 text-blue-400" />
                <div>
                  <h1 className="text-sm font-bold tracking-tight">租屋管理系統</h1>
                  <p className="text-xs text-slate-400">v2.0 • Taiwan Landlord</p>
                </div>
              </Link>
              <button
                type="button"
                className="lg:hidden p-1 rounded hover:bg-slate-800"
                onClick={() => setSidebarOpen(false)}
                aria-label="關閉側邊選單"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* 導航連結 */}
            <nav className="mt-4 px-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                      active
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    ].join(' ')}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* 手機版遮罩層：點擊後關閉側邊欄 */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* 主要內容區 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 頂部列 */}
            <header className="h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
                  onClick={() => setSidebarOpen((open) => !open)}
                  aria-label="開啟側邊選單"
                >
                  <Menu className="h-5 w-5 text-slate-700" />
                </button>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                    租屋管理系統
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dashboard v2.0 · Taiwan Landlord
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
                  <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100">
                    API 連線：Zeabur（後端）
                  </span>
                  <span>今日 {new Date().toLocaleDateString('zh-TW')}</span>
                </div>
                <UserSessionMenu />
              </div>
            </header>

            {/* 頁面內容 */}
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}