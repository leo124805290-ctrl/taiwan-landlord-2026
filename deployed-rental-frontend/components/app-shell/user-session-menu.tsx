'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { removeAuthToken } from '@/lib/api-client';
import { LogOut, UserRound } from 'lucide-react';

/**
 * 登出：清除 token 並回到登入頁。
 * 切換帳號：同樣清除 session，方便以其他身分重新登入（後端若支援多帳密）。
 */
export function UserSessionMenu() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const goToLogin = () => {
    removeAuthToken();
    router.push('/login');
    router.refresh();
  };

  const handleLogout = () => {
    if (!confirm('確定要登出嗎？')) return;
    setBusy(true);
    try {
      goToLogin();
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchAccount = () => {
    if (!confirm('將結束目前登入並前往登入頁，以便重新輸入密碼。確定？')) return;
    setBusy(true);
    try {
      goToLogin();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-slate-200 text-slate-700"
        onClick={handleSwitchAccount}
        disabled={busy}
        title="清除登入狀態並返回登入頁"
      >
        <UserRound className="h-4 w-4 mr-1.5" />
        <span className="hidden sm:inline">切換帳號</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-slate-200 text-slate-700"
        onClick={handleLogout}
        disabled={busy}
      >
        <LogOut className="h-4 w-4 mr-1.5" />
        <span className="hidden sm:inline">登出</span>
      </Button>
    </div>
  );
}
