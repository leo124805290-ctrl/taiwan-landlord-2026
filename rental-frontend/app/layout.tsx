import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '房東管理後台',
  description: '台灣房東租客管理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <nav>
          <Link href="/">首頁</Link>
          <Link href="/dashboard">儀表板</Link>
          <Link href="/meter-readings">抄電表</Link>
          <Link href="/expenses">支出管理</Link>
          <Link href="/users">使用者管理</Link>
          <Link href="/login">登入</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
