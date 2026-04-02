'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatMoneyYuanFromCents, formatDateSlash } from '@/lib/api-client';

type Property = { id: string; name: string };

type Expense = {
  id: string;
  propertyId: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string | null;
};

type Income = {
  id: string;
  propertyId: string;
  type: string;
  amount: number;
  incomeDate: string;
  description: string | null;
};

export default function FinancePage() {
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
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
        const eq = propertyId
          ? `?propertyId=${encodeURIComponent(propertyId)}`
          : '';
        const [e, i] = await Promise.all([
          apiGet<Expense[]>(`/api/expenses${eq}`),
          apiGet<Income[]>(`/api/incomes${eq}`),
        ]);
        if (!cancelled) {
          setExpenses(e);
          setIncomes(i);
        }
      } catch (err) {
        if (!cancelled) {
          setExpenses([]);
          setIncomes([]);
          setError(err instanceof ApiError ? err.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
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
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">支出</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">類別</th>
                    <th className="px-3 py-2">金額</th>
                    <th className="px-3 py-2">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((x) => (
                    <tr key={x.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{formatDateSlash(x.expenseDate)}</td>
                      <td className="px-3 py-2">{x.category}</td>
                      <td className="px-3 py-2">${formatMoneyYuanFromCents(x.amount)}</td>
                      <td className="px-3 py-2">{x.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">補充收入</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">來源</th>
                    <th className="px-3 py-2">金額</th>
                    <th className="px-3 py-2">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {incomes.map((x) => (
                    <tr key={x.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{formatDateSlash(x.incomeDate)}</td>
                      <td className="px-3 py-2">{x.type}</td>
                      <td className="px-3 py-2">${formatMoneyYuanFromCents(x.amount)}</td>
                      <td className="px-3 py-2">{x.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
