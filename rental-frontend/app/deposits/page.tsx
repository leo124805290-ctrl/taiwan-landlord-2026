'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatMoneyYuanFromCents, formatDateSlash } from '@/lib/api-client';

type DepositRow = {
  id: string;
  roomId: string;
  tenantId: string | null;
  amount: number;
  type: string;
  description: string | null;
  depositDate: string;
};

export default function DepositsPage() {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<DepositRow[]>('/api/deposits');
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof ApiError ? e.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="text-sm text-slate-600">押金明細（GET /api/deposits）</p>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">類型</th>
                <th className="px-3 py-2">金額</th>
                <th className="px-3 py-2">說明</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{formatDateSlash(r.depositDate)}</td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">${formatMoneyYuanFromCents(r.amount)}</td>
                  <td className="px-3 py-2">{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
