'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginWithCredentials, setAccessToken } from '@/lib/api';

const REMEMBER_KEY = 'landlord_login_remember';
const SAVED_USER_KEY = 'landlord_saved_username';
const SAVED_PASS_KEY = 'landlord_saved_password';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (localStorage.getItem(REMEMBER_KEY) === '1') {
        setRemember(true);
        setUsername(localStorage.getItem(SAVED_USER_KEY) || 'admin');
        setPassword(localStorage.getItem(SAVED_PASS_KEY) || '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await loginWithCredentials(username, password);
      setAccessToken(data.tokens.accessToken);
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, '1');
          localStorage.setItem(SAVED_USER_KEY, username.trim());
          localStorage.setItem(SAVED_PASS_KEY, password);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SAVED_USER_KEY);
          localStorage.removeItem(SAVED_PASS_KEY);
        }
      } catch {
        /* ignore */
      }
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>登入</h1>
      <p className="muted">
        請輸入<strong>登入帳號</strong>（自訂，非 Email）與密碼。預設種子帳號為 <code>admin</code>（密碼見 README
        ／種子輸出）。JWT 會寫入 <code>landlord_access_token</code>。
      </p>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <div className="muted">帳號</div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <div className="muted">密碼</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className="muted">記住帳號與密碼（僅存於此裝置瀏覽器）</span>
        </label>
        {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
}
