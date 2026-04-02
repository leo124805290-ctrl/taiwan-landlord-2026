'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  clearAllBusinessData,
  getAccessToken,
} from '@/lib/api';
import { emitBusinessDataCleared } from '@/lib/events';

type MeInfo = {
  id: string;
  username: string;
  email?: string;
  role: string;
  fullName?: string | null;
};

type UserRow = {
  id: string;
  username: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  role: string;
  isActive?: boolean | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type FormState = {
  username: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'super_admin' | 'admin';
  isActive: boolean;
  password: string;
  confirmPassword: string;
};

const emptyForm = (): FormState => ({
  username: '',
  email: '',
  fullName: '',
  phone: '',
  role: 'admin',
  isActive: true,
  password: '',
  confirmPassword: '',
});

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-TW');
  } catch {
    return iso;
  }
}

function roleLabel(role: string): string {
  if (role === 'super_admin') return '超級管理員';
  if (role === 'admin') return '管理員';
  return role;
}

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
  const [me, setMe] = useState<MeInfo | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toggleId, setToggleId] = useState<string | null>(null);

  const isSuperAdmin = me?.role === 'super_admin';

  const syncToken = useCallback(() => {
    setHasToken(!!getAccessToken());
  }, []);

  useEffect(() => {
    syncToken();
  }, [syncToken]);

  useEffect(() => {
    if (!hasToken) {
      setMe(null);
      setMeError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = await apiGet<MeInfo>('/api/auth/me');
        if (!cancelled) {
          setMe(info);
          setMeError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setMe(null);
          setMeError(e instanceof ApiError ? e.message : '無法取得帳號資訊');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const list = await apiGet<UserRow[]>('/api/users');
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setUsers([]);
      if (e instanceof ApiError && e.status === 403) {
        setUsersError(
          '權限不足：僅「超級管理員」可查看與管理帳號列表。若您需要此權限，請聯絡擁有超級管理員帳號的人員。',
        );
      } else {
        setUsersError(e instanceof ApiError ? e.message : '載入使用者失敗');
      }
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken) loadUsers();
  }, [hasToken, loadUsers]);

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setForm({
      username: u.username,
      email: u.email ?? '',
      fullName: u.fullName ?? '',
      phone: u.phone ?? '',
      role: u.role === 'super_admin' ? 'super_admin' : 'admin',
      isActive: u.isActive !== false,
      password: '',
      confirmPassword: '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.username.trim() || !form.fullName.trim()) {
      alert('請填寫登入帳號與姓名');
      return;
    }
    if (!editingUser) {
      if (!form.password || form.password.length < 8) {
        alert('新帳號需設定密碼，且至少 8 個字元');
        return;
      }
      if (form.password !== form.confirmPassword) {
        alert('兩次密碼不一致');
        return;
      }
    }

    const contactEmail = form.email.trim();
    const emailPayload =
      contactEmail === '' ? null : contactEmail.toLowerCase();

    setSaving(true);
    try {
      if (editingUser) {
        const updated = await apiPut<Partial<UserRow>>(`/api/users/${editingUser.id}`, {
          username: form.username.trim(),
          email: emailPayload,
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          isActive: form.isActive,
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  ...updated,
                  username: updated.username ?? u.username,
                  email: updated.email ?? u.email,
                  fullName: updated.fullName ?? u.fullName,
                  phone: updated.phone ?? u.phone,
                  role: updated.role ?? u.role,
                  isActive: updated.isActive ?? u.isActive,
                }
              : u,
          ),
        );
      } else {
        await apiPost<UserRow>('/api/users', {
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          email: emailPayload,
          role: form.role,
        });
        await loadUsers();
      }
      setDialogOpen(false);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(u: UserRow) {
    const currentlyActive = u.isActive !== false;
    const next = !currentlyActive;
    setToggleId(u.id);
    try {
      await apiPut(`/api/users/${u.id}`, { isActive: next });
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, isActive: next } : row)),
      );
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '更新狀態失敗');
    } finally {
      setToggleId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('確定要刪除此使用者？此為軟刪除，且無法還原顯示於列表。')) return;
    try {
      await apiDelete(`/api/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '刪除失敗');
    }
  }

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
    if (
      !window.confirm(
        '最後確認：將清除所有業務資料（物業、房客、帳單等），無法還原。是否繼續？',
      )
    ) {
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
      <h1>後台帳號管理</h1>
      <p className="muted">
        需登入；敏感操作會帶上 JWT。若未登入請至 <Link href="/login">登入</Link>。
      </p>

      {!hasToken && (
        <div className="error">尚未登入，無法載入使用者列表或執行清除。</div>
      )}

      {hasToken && me && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ margin: 0 }}>
            目前登入：<strong>{me.username}</strong>
            {me.email ? ` · 聯絡 Email：${me.email}` : ''}
            {me.fullName ? `（${me.fullName}）` : ''} · 角色：
            <strong>{roleLabel(me.role)}</strong>
          </p>
          {!isSuperAdmin && (
            <p className="muted" style={{ margin: '0.75rem 0 0' }}>
              檢視與維護「系統帳號」列表、新增／刪除帳號僅限超級管理員。一般管理員仍可使用儀表板與租務功能。
            </p>
          )}
        </div>
      )}
      {hasToken && meError && <div className="error">{meError}</div>}

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
        {clearError && (
          <div className="error" style={{ marginBottom: '0.75rem' }}>
            {clearError}
          </div>
        )}
        {clearOk && (
          <p style={{ color: 'var(--ok)', marginBottom: '0.75rem' }}>{clearOk}</p>
        )}
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ margin: 0, flex: '1 1 auto' }}>使用者列表</h2>
          <button
            type="button"
            onClick={() => loadUsers()}
            disabled={loadingUsers || !hasToken}
          >
            重新載入
          </button>
          {isSuperAdmin && (
            <button type="button" onClick={openCreate}>
              新增使用者
            </button>
          )}
        </div>

        {usersError && (
          <div className="error" style={{ marginTop: '0.75rem' }}>
            {usersError}
          </div>
        )}
        {loadingUsers && <p className="muted">載入中…</p>}
        {!loadingUsers && hasToken && !usersError && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ marginTop: '1rem', minWidth: 720 }}>
              <thead>
                <tr>
                  <th>登入帳號</th>
                  <th>姓名</th>
                  <th>聯絡 Email</th>
                  <th>電話</th>
                  <th>角色</th>
                  <th>狀態</th>
                  <th>最後登入</th>
                  <th>建立時間</th>
                  {isSuperAdmin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.fullName ?? '—'}</td>
                    <td className="muted">{u.email ?? '—'}</td>
                    <td>{u.phone ?? '—'}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>{u.isActive !== false ? '啟用' : '停用'}</td>
                    <td className="muted">{formatDt(u.lastLoginAt)}</td>
                    <td className="muted">{formatDt(u.createdAt)}</td>
                    {isSuperAdmin && (
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.35rem',
                            alignItems: 'center',
                          }}
                        >
                          <button
                            type="button"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => handleToggle(u)}
                            disabled={toggleId === u.id}
                          >
                            {toggleId === u.id
                              ? '…'
                              : u.isActive !== false
                                ? '停用'
                                : '啟用'}
                          </button>
                          <button
                            type="button"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => openEdit(u)}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="danger"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={() => handleDelete(u.id)}
                            disabled={u.id === me?.id}
                            title={
                              u.id === me?.id ? '不可刪除目前登入帳號' : undefined
                            }
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadingUsers && hasToken && !usersError && users.length === 0 && (
          <p className="muted" style={{ marginTop: '1rem' }}>
            {isSuperAdmin ? '尚無使用者資料' : '—'}
          </p>
        )}
      </div>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
          onClick={() => !saving && setDialogOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{editingUser ? '編輯使用者' : '新增使用者'}</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                <span className="muted">登入帳號 *（非 Email，3～64 字元）</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label>
                <span className="muted">聯絡 Email（選填）</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label>
                <span className="muted">姓名 *</span>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label>
                <span className="muted">電話</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                <span className="muted">角色</span>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role: e.target.value as 'super_admin' | 'admin',
                    }))
                  }
                >
                  <option value="admin">一般管理員</option>
                  <option value="super_admin">超級管理員</option>
                </select>
              </label>
              <label>
                <span className="muted">啟用</span>
                <select
                  value={form.isActive ? '1' : '0'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.value === '1' }))
                  }
                >
                  <option value="1">啟用</option>
                  <option value="0">停用</option>
                </select>
              </label>
              {!editingUser && (
                <>
                  <label>
                    <span className="muted">密碼 *（至少 8 字元）</span>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    <span className="muted">確認密碼 *</span>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                      }
                      autoComplete="new-password"
                    />
                  </label>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" disabled={saving} onClick={() => setDialogOpen(false)}>
                取消
              </button>
              <button type="button" disabled={saving} onClick={handleSave}>
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
