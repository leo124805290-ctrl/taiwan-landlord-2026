'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateSlash } from '@/lib/api-client';

type Tenant = {
  id: string;
  roomId: string;
  propertyId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  checkInDate: string;
  actualCheckoutDate: string | null;
};

type RoomDetail = {
  id: string;
  propertyId: string;
  roomNumber: string;
  monthlyRent: number;
};

type PropertyDetail = {
  id: string;
  name: string;
};

type Row = Tenant & {
  roomNumber: string;
  propertyName: string;
  monthlyRentYuan: number;
};

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch {
    return null;
  }
}

export default function HistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenants = await apiGet<Tenant[]>('/api/tenants?status=checked_out');
      const roomIds = Array.from(new Set(tenants.map((t) => t.roomId)));
      const propIds = Array.from(new Set(tenants.map((t) => t.propertyId)));

      const [rooms, props] = await Promise.all([
        Promise.all(roomIds.map((id) => fetchJson<RoomDetail>(`/api/rooms/${id}`))),
        Promise.all(propIds.map((id) => fetchJson<PropertyDetail>(`/api/properties/${id}`))),
      ]);

      const roomMap = new Map<string, RoomDetail>();
      roomIds.forEach((id, i) => {
        const r = rooms[i];
        if (r) roomMap.set(id, r);
      });
      const propMap = new Map<string, PropertyDetail>();
      propIds.forEach((id, i) => {
        const p = props[i];
        if (p) propMap.set(id, p);
      });

      const enriched: Row[] = tenants.map((t) => {
        const room = roomMap.get(t.roomId);
        const prop = propMap.get(t.propertyId);
        return {
          ...t,
          roomNumber: room?.roomNumber ?? '—',
          propertyName: prop?.name ?? '—',
          monthlyRentYuan: room != null ? Number(room.monthlyRent) || 0 : 0,
        };
      });

      setRows(enriched);
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="text-sm text-slate-600">
        已退租租客（<code className="rounded bg-slate-100 px-1">GET /api/tenants?status=checked_out</code>
        ）；房號／物業／月租由房間與物業 API 補齊。
      </p>

      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">租客</th>
                <th className="px-3 py-2">房號</th>
                <th className="px-3 py-2">物業</th>
                <th className="px-3 py-2">入住日</th>
                <th className="px-3 py-2">退租日</th>
                <th className="px-3 py-2">月租（元）</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    尚無已退租紀錄
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{r.nameZh}</span>
                      <span className="text-slate-500"> / {r.nameVi}</span>
                    </td>
                    <td className="px-3 py-2">{r.roomNumber}</td>
                    <td className="px-3 py-2">{r.propertyName}</td>
                    <td className="px-3 py-2">{formatDateSlash(r.checkInDate)}</td>
                    <td className="px-3 py-2">{formatDateSlash(r.actualCheckoutDate)}</td>
                    <td className="px-3 py-2">${r.monthlyRentYuan.toLocaleString('zh-TW')}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/history/${r.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
