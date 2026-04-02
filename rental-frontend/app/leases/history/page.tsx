import { redirect } from 'next/navigation';

export default function LegacyLeaseHistoryRedirect() {
  redirect('/history');
}
