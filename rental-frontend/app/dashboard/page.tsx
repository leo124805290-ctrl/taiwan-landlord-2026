'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
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

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const [month, setMonth] = useState(monthNow);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = `/api/reports/summary?month=${encodeURIComponent(month)}`;
      const res = await apiGet<Summary>(q);
      setData(res);
    } catch (e) {
      setData(null);
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

  return (
    <div>
      <h1>儀表板</h1>
      <p className="muted">顯示本月總覽與各物業數字（皆來自後端 API）。</p>

      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          <span className="muted">月份 </span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => load()} disabled={loading}>
          重新整理
        </button>
      </div>

      {loading && <p className="muted">載入中…</p>}
      {error && <div className="error">{error}</div>}

      {data && !loading && (
        <>
          <div className="card">
            <h2>總覽（{data.month}）</h2>
            <p>物業數：{data.totalProperties}　房間數：{data.totalRooms}　入住：{data.occupiedRooms}　空房：{data.vacantRooms}</p>
            <p>總收入：{data.totalIncome}　總支出：{data.totalExpense}　淨利：{data.netProfit}</p>
          </div>
          <div className="card">
            <h3>各物業</h3>
            {data.properties.length === 0 ? (
              <p className="muted">此月份尚無物業資料</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>名稱</th>
                    <th>房間</th>
                    <th>入住</th>
                    <th>收入</th>
                    <th>支出</th>
                    <th>淨利</th>
                  </tr>
                </thead>
                <tbody>
                  {data.properties.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.rooms}</td>
                      <td>{p.occupied}</td>
                      <td>{p.income}</td>
                      <td>{p.expense}</td>
                      <td>{p.netProfit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
