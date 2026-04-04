'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Building,
  CreditCard,
  Shield,
  LogOut,
  Wallet,
  BarChart3,
  Gauge,
  Archive,
  Upload,
  UserCog,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setAccessToken } from '@/lib/api-client';

const navItems = [
  { href: '/dashboard', label: '儀表板', icon: LayoutDashboard },
  { href: '/properties', label: '物業管理', icon: Building },
  { href: '/payments', label: '收租管理', icon: CreditCard },
  { href: '/deposits', label: '押金管理', icon: Shield },
  { href: '/checkout', label: '退租結算', icon: LogOut },
  { href: '/finance', label: '收支管理', icon: Wallet },
  { href: '/reports', label: '損益報表', icon: BarChart3 },
  { href: '/meter-history', label: '電錶歷史', icon: Gauge },
  { href: '/history', label: '歷史租約', icon: Archive },
  { href: '/import', label: '舊資料補登', icon: Upload },
  { href: '/users', label: '使用者管理', icon: UserCog },
  { href: '/landlord-payments', label: '房東付款', icon: Building2 },
];

function pageTitleFromPath(pathname: string): string {
  const hit = navItems.find(
    (n) => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href + '/')),
  );
  if (hit) return hit.label;
  if (pathname === '/properties' || pathname.startsWith('/properties/')) return '物業管理';
  if (pathname === '/login') return '登入';
  return '租屋管理系統';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const todayStr = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const isActive = (href: string) => {
    if (href === '/dashboard' && pathname === '/') return true;
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  function handleLogout() {
    setAccessToken(null);
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="關閉選單"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 lg:justify-center">
          <span className="font-semibold">租屋管理</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-slate-800 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="開啟選單"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-slate-900">{pageTitleFromPath(pathname)}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>{todayStr}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
              登出
            </Button>
          </div>
        </header>
        <main className="flex-1 bg-gray-50 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
