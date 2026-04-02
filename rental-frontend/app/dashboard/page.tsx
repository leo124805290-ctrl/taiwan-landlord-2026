'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatMoneyYuanFromCents } from '@/lib/api-client';
import { BUSINESS_DATA_CLEARED_EVENT } from '@/lib/events';

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

type PaymentRow = {
  id: string;
  roomId: string;
  tenantId: string | null;
  paymentMonth: string;
  rentAmount: number;
  electricityFee: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  paymentStatus: string;
  lineType?: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 當月 5 號後視為逾期（待收） */
function isOverduePending(monthYm: string): boolean {
  const [y, m] = monthYm.split('-').map(Number);
  if (!y || !m) return false;
  const now = new Date();
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return false;
  return now.getDate() > 5;
}

export default function DashboardPage() {
  const [month, setMonth] = useState(monthNow);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, pend] = await Promise.all([
        apiGet<Summary>(`/api/reports/summary?month=${encodeURIComponent(month)}`),
        apiGet<PaymentRow[]>(`/api/payments?status=pending`),
      ]);
      setSummary(s);
      setPending(pend);
    } catch (e) {
      setSummary(null);
      setPending([]);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onCleared = () => load();
    window.addEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
  }, [load]);

  const occRate = useMemo(() => {
    if (!summary || summary.totalRooms <= 0) return '0%';
    return `${Math.round((summary.occupiedRooms / summary.totalRooms) * 100)}%`;
  }, [summary]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-slate-600">
          月份
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          重新整理
        </button>
      </div>

      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}

      {summary && !loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">總物業</div>
              <div className="text-2xl font-semibold">{summary.totalProperties}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">總房間</div>
              <div className="text-2xl font-semibold">{summary.totalRooms}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">入住率</div>
              <div className="text-2xl font-semibold">{occRate}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">本月淨利</div>
              <div className="text-2xl font-semibold text-blue-600">
                ${formatMoneyYuanFromCents(summary.netProfit)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-semibold text-slate-800">本月收入（已入帳）</h2>
              <p className="text-slate-600">
                合計 ${formatMoneyYuanFromCents(summary.totalIncome)}（含收款與補充收入彙總）
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-semibold text-slate-800">本月支出</h2>
              <p className="text-slate-600">合計 ${formatMoneyYuanFromCents(summary.totalExpense)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">各物業</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-2">名稱</th>
                    <th className="px-4 py-2">房間</th>
                    <th className="px-4 py-2">入住</th>
                    <th className="px-4 py-2">收入</th>
                    <th className="px-4 py-2">支出</th>
                    <th className="px-4 py-2">淨利</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.properties.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2">{p.rooms}</td>
                      <td className="px-4 py-2">{p.occupied}</td>
                      <td className="px-4 py-2">${formatMoneyYuanFromCents(p.income)}</td>
                      <td className="px-4 py-2">${formatMoneyYuanFromCents(p.expense)}</td>
                      <td className="px-4 py-2">${formatMoneyYuanFromCents(p.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-2 font-semibold text-amber-900">待收帳單提醒</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-amber-800">目前無待收帳單</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-amber-900">
                  <th className="py-1 pr-2">月份</th>
                  <th className="py-1 pr-2">狀態</th>
                  <th className="py-1 pr-2">應收</th>
                  <th className="py-1 pr-2">已收</th>
                  <th className="py-1">餘額</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => {
                  const overdue = p.paymentStatus === 'pending' && isOverduePending(p.paymentMonth);
                  return (
                    <tr key={p.id} className={overdue ? 'text-red-700' : ''}>
                      <td className="py-1 pr-2">{p.paymentMonth}</td>
                      <td className="py-1 pr-2">{p.paymentStatus}</td>
                      <td className="py-1 pr-2">${formatMoneyYuanFromCents(p.totalAmount)}</td>
                      <td className="py-1 pr-2">${formatMoneyYuanFromCents(p.paidAmount)}</td>
                      <td className="py-1">${formatMoneyYuanFromCents(p.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
