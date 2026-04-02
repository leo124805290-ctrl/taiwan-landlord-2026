'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatMoneyYuanFromCents } from '@/lib/api-client';

type Property = { id: string; name: string };

type Summary = {
  month: string;
  totalProperties: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  properties: Array<{
    id: string;
    name: string;
    rooms: number;
    occupied: number;
    income: number;
    expense: number;
    netProfit: number;
  }>;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(monthNow);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await apiGet<Summary>(`/api/reports/summary?month=${encodeURIComponent(month)}`);
      setSummary(s);
    } catch (e) {
      setSummary(null);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const occRate =
    summary && summary.totalRooms > 0
      ? Math.round((summary.occupiedRooms / summary.totalRooms) * 100)
      : 0;

  const filteredProps = summary?.properties.filter((p) => !propertyId || p.id === propertyId) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          月份
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
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
      </div>
      <p className="text-xs text-slate-500">
        電費差異分析依規格 §十 將接 GET /api/reports/monthly（需 propertyId）。
      </p>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {summary && !loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="border-b border-slate-100 pb-2 font-semibold">損益摘要</h2>
            <p>收入：${formatMoneyYuanFromCents(summary.totalIncome)}</p>
            <p>支出：${formatMoneyYuanFromCents(summary.totalExpense)}</p>
            <p className="font-semibold text-blue-600">
              淨利：${formatMoneyYuanFromCents(summary.netProfit)}
            </p>
            <p>入住率：{occRate}%</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="border-b border-slate-100 pb-2 font-semibold">物業篩選後</h2>
            {filteredProps.map((p) => (
              <div key={p.id} className="border-b border-slate-50 py-2 text-sm last:border-0">
                <div className="font-medium">{p.name}</div>
                <div>淨利 ${formatMoneyYuanFromCents(p.netProfit)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
