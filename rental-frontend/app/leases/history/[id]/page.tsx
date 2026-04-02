import { redirect } from 'next/navigation';

export default function LegacyLeaseHistoryDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/history/${params.id}`);
}
