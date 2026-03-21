import { redirect } from 'next/navigation';

/** 舊網址相容：導向使用者管理 */
export default function AdminRedirectPage() {
  redirect('/users');
}
