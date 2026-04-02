'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';

type Room = {
  id: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  status: string;
};

type Property = { id: string; name: string };

export default function PropertyRoomsPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, r] = await Promise.all([
          apiGet<Property>(`/api/properties/${id}`),
          apiGet<Room[]>(`/api/rooms?propertyId=${encodeURIComponent(id)}`),
        ]);
        if (!cancelled) {
          setProperty(p);
          setRooms(r);
        }
      } catch (e) {
        if (!cancelled) {
          setProperty(null);
          setRooms([]);
          setError(e instanceof ApiError ? e.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const occupied = rooms.filter((x) => x.status === 'occupied').length;
  const rate = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/properties" className="text-blue-600 hover:underline">
          ← 物業列表
        </Link>
        <span className="text-slate-400">|</span>
        <h2 className="text-lg font-semibold">{property?.name ?? '…'}　房間管理</h2>
      </div>
      <p className="text-sm text-slate-600">
        總 {rooms.length} 間｜已入住 {occupied}｜入住率 {rate}%
      </p>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">房號</th>
                <th className="px-3 py-2">樓層</th>
                <th className="px-3 py-2">月租</th>
                <th className="px-3 py-2">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{r.roomNumber}</td>
                  <td className="px-3 py-2">{r.floor}</td>
                  <td className="px-3 py-2">{r.monthlyRent.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        入住流程、合約簽名等依規格 §五逐步實作。
      </p>
    </div>
  );
}
