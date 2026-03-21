'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { BUSINESS_DATA_CLEARED_EVENT } from '@/lib/events';

type Property = { id: string; name: string };
type Expense = {
  id: string;
  propertyId: string;
  type: string;
  category: string;
  amount: number;
  expenseDate: string;
  description: string | null;
};

export default function ExpensesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rows, setRows] = useState<Expense[]>([]);
  const [propError, setPropError] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProperties = useCallback(async () => {
    setPropError(null);
    try {
      const list = await apiGet<Property[]>('/api/properties');
      setProperties(list);
    } catch (e) {
      setProperties([]);
      setPropError(e instanceof ApiError ? e.message : '載入物業失敗');
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setExpenseError(null);
    try {
      const q = propertyId
        ? `/api/expenses?propertyId=${encodeURIComponent(propertyId)}`
        : '/api/expenses';
      const list = await apiGet<Expense[]>(q);
      setRows(list);
    } catch (e) {
      setRows([]);
      setExpenseError(e instanceof ApiError ? e.message : '載入支出失敗');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const onCleared = () => {
      void loadProperties();
      void loadExpenses();
    };
    window.addEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
  }, [loadProperties, loadExpenses]);

  async function refreshAll() {
    await loadProperties();
    await loadExpenses();
  }

  return (
    <div>
      <h1>支出管理</h1>
      <p className="muted">依物業篩選或顯示全部支出。</p>

      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          <span className="muted">篩選物業 </span>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            disabled={!!propError && properties.length === 0}
          >
            <option value="">全部</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void refreshAll()} disabled={loading}>
          重新整理
        </button>
      </div>

      {propError && <div className="error" style={{ marginTop: '0.75rem' }}>{propError}</div>}

      {loading && <p className="muted">載入中…</p>}
      {expenseError && <div className="error">{expenseError}</div>}

      {!loading && !expenseError && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>類型</th>
                <th>分類</th>
                <th>金額</th>
                <th>日期</th>
                <th>說明</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>{r.category}</td>
                  <td>{r.amount}</td>
                  <td>{new Date(r.expenseDate).toLocaleDateString()}</td>
                  <td>{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">無支出紀錄</p>}
        </div>
      )}
    </div>
  );
}
