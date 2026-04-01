'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { loginWithCredentials, setAccessToken } from '@/lib/api';

const REMEMBER_KEY = 'landlord_login_remember';
const SAVED_USER_KEY = 'landlord_saved_username';
const SAVED_PASS_KEY = 'landlord_saved_password';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const jwt = data.token || data.tokens?.accessToken;
      if (!jwt) {
        throw new Error('登入回應缺少 token');
      }
      setAccessToken(jwt);
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
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 400,
        margin: '2rem auto',
        padding: '2rem',
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid #2d3a4d',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }} aria-hidden>
          🔒
        </div>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>租屋管理系統</h1>
      </div>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <div className="muted" style={{ marginBottom: '0.35rem' }}>
              帳號
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="請輸入帳號"
              autoComplete="username"
              required
              style={{ maxWidth: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div className="muted" style={{ marginBottom: '0.35rem' }}>
            密碼
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ maxWidth: '100%', paddingRight: '2.75rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className="muted">記住帳號與密碼（僅存於此裝置瀏覽器）</span>
        </label>

        {error && (
          <div className="error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.65rem' }}>
          {loading ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
}
