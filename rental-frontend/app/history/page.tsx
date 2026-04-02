'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import {
  fetchHistoryList,
  fetchProperties,
  fetchRooms,
  formatDateZh,
  type HistoryTenantRow,
  type PropertyRow,
  type RoomRow,
} from '@/lib/lease-history';

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryTenantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [checkoutFrom, setCheckoutFrom] = useState('');
  const [checkoutTo, setCheckoutTo] = useState('');
  const [q, setQ] = useState('');

  const loadMeta = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetchProperties(), fetchRooms()]);
      setProperties(p);
      setRooms(r);
    } catch {
      setProperties([]);
      setRooms([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHistoryList({
        page,
        pageSize,
        propertyId: propertyId || undefined,
        roomId: roomId || undefined,
        checkoutFrom: checkoutFrom || undefined,
        checkoutTo: checkoutTo || undefined,
        q: q || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [page, propertyId, roomId, checkoutFrom, checkoutTo, q]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyId) {
        if (!cancelled) setRooms(await fetchRooms());
        return;
      }
      const list = await fetchRooms(propertyId);
      if (!cancelled) setRooms(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1>歷史租約（已終止）</h1>
      <p className="muted">
        僅顯示已退租（<code>checked_out</code>）且有實際退租日之紀錄，供查詢歸檔。辦理退租請使用退租結算流程。
      </p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label>
            <span className="muted">物業</span>
            <br />
            <select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setRoomId('');
                setPage(1);
              }}
              style={{ minWidth: '160px', marginTop: '0.25rem' }}
            >
              <option value="">全部</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">房間</span>
            <br />
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setPage(1);
              }}
              style={{ minWidth: '120px', marginTop: '0.25rem' }}
            >
              <option value="">全部</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber} 樓{r.floor}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">退租日起</span>
            <br />
            <input
              type="date"
              value={checkoutFrom}
              onChange={(e) => {
                setCheckoutFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span className="muted">退租日迄</span>
            <br />
            <input
              type="date"
              value={checkoutTo}
              onChange={(e) => {
                setCheckoutTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label style={{ flex: '1 1 200px' }}>
            <span className="muted">姓名／電話</span>
            <br />
            <input
              type="search"
              value={q}
              placeholder="關鍵字"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  load();
                }
              }}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              load();
            }}
            disabled={loading}
          >
            套用篩選
          </button>
        </div>
      </div>

      {loading && <p className="muted">載入中…</p>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <p className="muted">
            共 {total} 筆，第 {page} / {totalPages} 頁（依實際退租日新到舊）
          </p>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>物業</th>
                  <th>房號</th>
                  <th>租客</th>
                  <th>電話</th>
                  <th>入住日</th>
                  <th>實際退租日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      尚無符合條件的歷史租約
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.propertyName}</td>
                      <td>{row.roomNumber}</td>
                      <td>
                        {row.nameZh}
                        <span className="muted"> / {row.nameVi}</span>
                      </td>
                      <td>{row.phone}</td>
                      <td>{formatDateZh(row.checkInDate)}</td>
                      <td>{formatDateZh(row.actualCheckoutDate)}</td>
                      <td>
                        <Link href={`/history/${row.id}`}>詳情</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一頁
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                下一頁
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
