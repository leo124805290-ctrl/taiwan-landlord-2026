'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  apiGet,
  clearAllBusinessData,
  getAccessToken,
  TOKEN_KEY,
} from '@/lib/api';
import { emitBusinessDataCleared } from '@/lib/events';

type UserRow = {
  id: string;
  email: string;
  fullName?: string | null;
  role: string;
  isActive?: boolean | null;
};

export default function UsersManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearOk, setClearOk] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [hasToken, setHasToken] = useState(false);

  const syncToken = useCallback(() => {
    setHasToken(!!getAccessToken());
  }, []);

  useEffect(() => {
    syncToken();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKEN_KEY) syncToken();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncToken]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const list = await apiGet<UserRow[]>('/api/users');
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setUsers([]);
      setUsersError(e instanceof ApiError ? e.message : '載入使用者失敗');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken) loadUsers();
  }, [hasToken, loadUsers]);

  async function onClear() {
    setClearError(null);
    setClearOk(null);
    if (!hasToken) {
      setClearError('請先登入。');
      return;
    }
    if (confirmText.trim() !== 'CLEAR_ALL') {
      setClearError('請在下欄位輸入 CLEAR_ALL 以確認清除。');
      return;
    }
    if (!window.confirm('最後確認：將清除所有業務資料（物業、房客、帳單等），無法還原。是否繼續？')) {
      return;
    }
    setClearing(true);
    try {
      const res = await clearAllBusinessData();
      setClearOk(`已清除（${res.cleared_at}）。`);
      setConfirmText('');
      emitBusinessDataCleared();
      await loadUsers();
      router.push('/dashboard');
    } catch (e) {
      setClearError(e instanceof ApiError ? e.message : '清除失敗');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <h1>使用者管理</h1>
      <p className="muted">
        需登入；敏感操作會帶上 JWT。若未登入請至 <Link href="/login">登入</Link>。
      </p>

      {!hasToken && (
        <div className="error">
          尚未登入，無法載入使用者列表或執行清除。
        </div>
      )}

      <div className="card">
        <h2>清除所有業務資料</h2>
        <p className="muted">
          將清除物業、房間、租客、帳單、抄表、支出等業務資料；帳號與登入設定會保留。
        </p>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span className="muted">請輸入 CLEAR_ALL 以啟用按鈕</span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CLEAR_ALL"
            autoComplete="off"
            disabled={!hasToken || clearing}
            style={{ marginTop: '0.35rem' }}
          />
        </label>
        {clearError && <div className="error" style={{ marginBottom: '0.75rem' }}>{clearError}</div>}
        {clearOk && <p style={{ color: 'var(--ok)', marginBottom: '0.75rem' }}>{clearOk}</p>}
        <button
          type="button"
          className="danger"
          onClick={onClear}
          disabled={clearing || !hasToken || confirmText.trim() !== 'CLEAR_ALL'}
        >
          {clearing ? '處理中…' : '清除所有業務資料'}
        </button>
      </div>

      <div className="card">
        <h2>使用者列表</h2>
        <button type="button" onClick={() => loadUsers()} disabled={loadingUsers || !hasToken}>
          重新載入
        </button>
        {usersError && <div className="error" style={{ marginTop: '0.75rem' }}>{usersError}</div>}
        {loadingUsers && <p className="muted">載入中…</p>}
        {!loadingUsers && hasToken && !usersError && (
          <table style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>姓名</th>
                <th>角色</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.fullName ?? '—'}</td>
                  <td>{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loadingUsers && hasToken && !usersError && users.length === 0 && (
          <p className="muted" style={{ marginTop: '1rem' }}>尚無使用者資料</p>
        )}
      </div>
    </div>
  );
}
