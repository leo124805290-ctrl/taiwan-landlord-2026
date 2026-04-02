'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateSlash } from '@/lib/api-client';

type Property = { id: string; name: string };
type Room = { id: string; propertyId: string; roomNumber: string };

type MeterReading = {
  id: string;
  roomId: string;
  readingValue: number;
  readingDate: string;
};

export default function MeterHistoryPage() {
  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [rows, setRows] = useState<MeterReading[]>([]);
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
      const q = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
      try {
        const r = await apiGet<Room[]>(`/api/rooms${q}`);
        if (!cancelled) setRooms(r);
      } catch {
        if (!cancelled) setRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  useEffect(() => {
    if (!roomId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<MeterReading[]>(
          `/api/meter-readings?roomId=${encodeURIComponent(roomId)}`,
        );
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
  }, [roomId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          物業
          <select
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setRoomId('');
            }}
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
          房間
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="">請選擇</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomNumber}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && roomId && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && roomId && !error && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">度數</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{formatDateSlash(r.readingDate)}</td>
                  <td className="px-3 py-2">{r.readingValue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
