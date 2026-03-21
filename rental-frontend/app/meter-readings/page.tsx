'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { BUSINESS_DATA_CLEARED_EVENT } from '@/lib/events';

type Property = { id: string; name: string };
type Room = {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
};
type MeterReading = {
  id: string;
  roomId: string;
  readingValue: number;
  readingDate: string;
};

export default function MeterReadingsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState('');
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<Property[]>('/api/properties');
      setProperties(list);
      if (list.length) {
        setPropertyId((prev) => prev || list[0].id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '載入物業失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    const onCleared = () => loadProperties();
    window.addEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(BUSINESS_DATA_CLEARED_EVENT, onCleared);
  }, [loadProperties]);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      setError(null);
      try {
        const list = await apiGet<Room[]>(
          `/api/rooms?propertyId=${encodeURIComponent(propertyId)}`,
        );
        setRooms(list);
        if (list.length) setRoomId(list[0].id);
        else {
          setRoomId('');
          setReadings([]);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : '載入房間失敗');
      }
    })();
  }, [propertyId]);

  useEffect(() => {
    if (!roomId) {
      setReadings([]);
      return;
    }
    (async () => {
      setError(null);
      try {
        const list = await apiGet<MeterReading[]>(
          `/api/meter-readings?roomId=${encodeURIComponent(roomId)}`,
        );
        setReadings(list);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : '載入抄表紀錄失敗');
      }
    })();
  }, [roomId]);

  return (
    <div>
      <h1>抄電表</h1>
      <p className="muted">依物業與房間查詢抄表紀錄。</p>

      {loading && <p className="muted">載入中…</p>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && properties.length === 0 && (
        <div className="card">
          <p className="muted">尚無物業資料，請先於後端建立物業與房間。</p>
        </div>
      )}

      <div className="card">
        <label>
          <div className="muted">物業</div>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">請選擇</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginTop: '1rem', display: 'block' }}>
          <div className="muted">房間</div>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">請選擇</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.floor}F · {r.roomNumber}
              </option>
            ))}
          </select>
        </label>
        {propertyId && rooms.length === 0 && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>此物業尚無房間</p>
        )}
      </div>

      {roomId && (
        <div className="card">
          <h2>歷史讀數</h2>
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>讀數</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.readingDate).toLocaleString()}</td>
                  <td>{r.readingValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {readings.length === 0 && <p className="muted">尚無紀錄</p>}
        </div>
      )}
    </div>
  );
}
