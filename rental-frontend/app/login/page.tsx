'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginWithPassword, setAccessToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await loginWithPassword(password);
      setAccessToken(data.tokens.accessToken);
      router.push('/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>登入</h1>
      <p className="muted">後端簡易登入：密碼請依後端設定（預設測試為 <code>enter</code>）。成功後會將 JWT 存入 localStorage（<code>landlord_access_token</code>）。</p>
      <form onSubmit={onSubmit}>
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
        {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
}
