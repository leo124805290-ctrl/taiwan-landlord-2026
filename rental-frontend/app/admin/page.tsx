import Link from 'next/link';

/** 同一網域下的後台入口（不需與前台分網域） */
export default function AdminHomePage() {
  return (
    <div>
      <h1>管理後台</h1>
      <p className="muted">
        敏感操作需登入 JWT；帳號列表與建立帳號僅限超級管理員。未登入請先至登入頁。
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>快速連結</h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>
            <Link href="/dashboard">儀表板</Link>
          </li>
          <li>
            <Link href="/users">後台帳號（使用者與清除業務資料）</Link>
          </li>
          <li>
            <Link href="/meter-readings">抄電表</Link>
          </li>
          <li>
            <Link href="/expenses">支出管理</Link>
          </li>
          <li>
            <Link href="/login">登入</Link>
          </li>
        </ul>
      </div>

      <p className="muted" style={{ marginTop: '1.25rem' }}>
        本機預設超級管理員由後端 <code>npm run db:seed</code> 或{' '}
        <code>npm run db:ensure-admin</code> 建立；登入帳號預設 <code>admin</code>（非 Email）。正式環境請設定{' '}
        <code>SEED_ADMIN_PASSWORD</code> 並旋轉密碼。
      </p>
    </div>
  );
}
