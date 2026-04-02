'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatMoneyYuanFromCents } from '@/lib/api-client';

type Property = { id: string; name: string };

/** 後端 enrich 後的付款列 */
type PaymentRow = Record<string, unknown> & {
  id: string;
  paymentMonth: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PaymentsPage() {
  const [month, setMonth] = useState(monthNow);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await apiGet<Property[]>('/api/properties');
        if (!cancelled) setProperties(p);
      } catch {
        if (!cancelled) setProperties([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ month });
        if (propertyId) q.set('propertyId', propertyId);
        const data = await apiGet<PaymentRow[]>(`/api/payments?${q.toString()}`);
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
  }, [month, propertyId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          物業
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="">全部</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          月份
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        收租完整流程（抄表、收款、新租客提醒）依規格 §六 持續實作；本頁已接真實 GET /api/payments。
      </p>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">月份</th>
                <th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2">應收</th>
                <th className="px-3 py-2">已收</th>
                <th className="px-3 py-2">餘額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{String(r.paymentMonth)}</td>
                  <td className="px-3 py-2">{String(r.paymentStatus)}</td>
                  <td className="px-3 py-2">${formatMoneyYuanFromCents(r.totalAmount)}</td>
                  <td className="px-3 py-2">${formatMoneyYuanFromCents(r.paidAmount)}</td>
                  <td className="px-3 py-2">${formatMoneyYuanFromCents(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
