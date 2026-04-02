'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { computeExpectedCheckoutDate, parseLocalYmd } from '@/lib/contract-dates';
import { Button } from '@/components/ui/button';

type Property = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  status: string;
};

const TERM_OPTIONS = [1, 3, 6, 12] as const;
type Term = (typeof TERM_OPTIONS)[number];

type Draft = {
  enabled: boolean;
  name: string;
  phone: string;
  passport: string;
  checkInDate: string;
  contractMonths: Term;
  meterReading: string;
  depositCollected: boolean;
  depositYuan: string;
  lastRentMonth: string;
  notes: string;
};

function defaultDraft(): Draft {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return {
    enabled: false,
    name: '',
    phone: '',
    passport: '',
    checkInDate: ymd,
    contractMonths: 12,
    meterReading: '',
    depositCollected: true,
    depositYuan: '',
    lastRentMonth: ym,
    notes: '',
  };
}

function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}

function formatYmdSlashLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export default function LegacyImportPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await apiGet<Property[]>('/api/properties');
        if (!cancelled) setProperties(list);
      } catch (e) {
        if (!cancelled) {
          setProperties([]);
          setError(e instanceof ApiError ? e.message : '載入物業失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!propertyId) {
      setRooms([]);
      setDrafts({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await apiGet<Room[]>(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`);
        if (cancelled) return;
        setRooms(list);
        setDrafts((prev) => {
          const next: Record<string, Draft> = { ...prev };
          for (const r of list) {
            if (!next[r.id]) next[r.id] = defaultDraft();
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) {
          setRooms([]);
          setError(e instanceof ApiError ? e.message : '載入房間失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const vacantRooms = useMemo(() => rooms.filter((r) => r.status === 'vacant'), [rooms]);

  const updateDraft = useCallback((roomId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [roomId]: { ...(prev[roomId] ?? defaultDraft()), ...patch },
    }));
  }, []);

  const readingDateToday = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const runBatch = useCallback(async () => {
    setSuccess(null);
    setError(null);
    const targets = vacantRooms.filter((r) => drafts[r.id]?.enabled);
    if (targets.length === 0) {
      setError('請至少勾選一間空房並填寫資料');
      return;
    }

    for (const room of targets) {
      const d = drafts[room.id];
      if (!d.name.trim() || !d.phone.trim()) {
        setError(`${room.roomNumber} 號房：請填寫租客姓名與電話`);
        return;
      }
      if (!d.checkInDate) {
        setError(`${room.roomNumber} 號房：請選擇入住日期`);
        return;
      }
      if (d.meterReading === '' || d.meterReading === undefined || d.meterReading === null) {
        setError(`${room.roomNumber} 號房：請填寫目前電錶度數（可為 0）`);
        return;
      }
      const mv = Number(d.meterReading);
      if (!Number.isFinite(mv) || mv < 0) {
        setError(`${room.roomNumber} 號房：電錶度數須為 0 以上的數字`);
        return;
      }
      if (d.depositCollected) {
        const dy = Number(d.depositYuan);
        if (!Number.isFinite(dy) || dy < 0) {
          setError(`${room.roomNumber} 號房：押金金額不正確`);
          return;
        }
      }
    }

    setSubmitting(true);
    let ok = 0;
    const errs: string[] = [];

    for (const room of targets) {
      const d = drafts[room.id];
      const notesLine = `[舊資料補登] 上期收租月份：${d.lastRentMonth || '—'}。${d.notes || ''}`.trim();
      try {
        const checkIn = parseLocalYmd(d.checkInDate);
        if (Number.isNaN(checkIn.getTime())) {
          errs.push(`${room.roomNumber}：入住日期格式錯誤`);
          continue;
        }

        const res = await apiPost<{
          tenant: { id: string };
        }>('/api/checkin/complete', {
          roomId: room.id,
          propertyId,
          nameZh: d.name.trim(),
          nameVi: d.name.trim(),
          phone: d.phone.trim(),
          passportNumber: d.passport.trim() || undefined,
          checkInDate: d.checkInDate,
          contractTermMonths: d.contractMonths,
          legacyImport: true,
          paidAmount: 0,
          notes: notesLine || undefined,
        });

        const tenantId = res.tenant?.id;
        if (!tenantId) {
          errs.push(`${room.roomNumber}：入住成功但未取得租客 ID`);
          continue;
        }

        const mv = Number(d.meterReading);
        await apiPost('/api/meter-readings', {
          roomId: room.id,
          readingValue: Math.round(mv),
          readingDate: readingDateToday,
        });

        if (d.depositCollected) {
          const dy = Number(d.depositYuan);
          if (Number.isFinite(dy) && dy > 0) {
            await apiPost('/api/deposits', {
              tenantId,
              roomId: room.id,
              amount: yuanToCents(dy),
              type: '收取',
              description: '舊資料補登：已收押金',
            });
          }
        }

        ok += 1;
      } catch (e) {
        errs.push(
          `${room.roomNumber}：${e instanceof ApiError ? e.message : '失敗'}`,
        );
      }
    }

    setSubmitting(false);
    if (ok > 0) {
      setSuccess(`已匯入 ${ok} 間房間的租客資料。`);
    }
    if (errs.length > 0) {
      setError(errs.join('；'));
    }
    if (ok > 0 && propertyId) {
      try {
        const list = await apiGet<Room[]>(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`);
        setRooms(list);
        setDrafts({});
      } catch {
        /* ignore refresh */
      }
    }
  }, [vacantRooms, drafts, propertyId, readingDateToday]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">舊資料補登</h1>
        <p className="mt-1 text-sm text-slate-600">
          將系統上線前已在住的租客一次性登入（僅限初期使用）。不觸發入住合約簽名；不產生入住當月帳單。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">選擇物業</label>
        <select
          className="mt-2 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={propertyId}
          onChange={(e) => {
            setPropertyId(e.target.value);
            setSuccess(null);
            setError(null);
          }}
        >
          <option value="">請選擇</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading && propertyId && <p className="text-slate-500">載入房間…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </div>
      )}

      {propertyId && !loading && (
        <div className="space-y-4">
          {vacantRooms.length === 0 ? (
            <p className="text-slate-600">此物業目前沒有空房可補登（僅限狀態為 vacant 的房間）。</p>
          ) : (
            vacantRooms.map((room) => {
              const d = drafts[room.id] ?? defaultDraft();
              const checkIn = d.checkInDate ? parseLocalYmd(d.checkInDate) : new Date(NaN);
              const end =
                !Number.isNaN(checkIn.getTime()) && d.contractMonths
                  ? computeExpectedCheckoutDate(checkIn, d.contractMonths)
                  : null;

              return (
                <div
                  key={room.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="font-medium text-slate-900">
                    {room.roomNumber} 號房 — 目前狀態：空房
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => updateDraft(room.id, { enabled: e.target.checked })}
                    />
                    此房間有現有租客，需要補登
                  </label>

                  {d.enabled && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="text-slate-600">租客姓名</span>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.name}
                          onChange={(e) => updateDraft(room.id, { name: e.target.value })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="text-slate-600">電話</span>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.phone}
                          onChange={(e) => updateDraft(room.id, { phone: e.target.value })}
                        />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        <span className="text-slate-600">護照／居留證</span>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.passport}
                          onChange={(e) => updateDraft(room.id, { passport: e.target.value })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="text-slate-600">入住日期（實際入住日）</span>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.checkInDate}
                          onChange={(e) => updateDraft(room.id, { checkInDate: e.target.value })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="text-slate-600">合約期限</span>
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.contractMonths}
                          onChange={(e) =>
                            updateDraft(room.id, {
                              contractMonths: Number(e.target.value) as Term,
                            })
                          }
                        >
                          {TERM_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m === 12 ? '1年' : `${m}個月`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-sm text-slate-600 sm:col-span-2">
                        合約到期日（自動）：{end ? formatYmdSlashLocal(end) : '—'}
                      </p>
                      <label className="text-sm">
                        <span className="text-slate-600">目前電錶度數（可為 0）</span>
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          inputMode="numeric"
                          value={d.meterReading}
                          onChange={(e) => updateDraft(room.id, { meterReading: e.target.value })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="text-slate-600">上期收租月份（YYYY-MM）</span>
                        <input
                          type="month"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={d.lastRentMonth}
                          onChange={(e) => updateDraft(room.id, { lastRentMonth: e.target.value })}
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={d.depositCollected}
                            onChange={(e) =>
                              updateDraft(room.id, { depositCollected: e.target.checked })
                            }
                          />
                          已收押金
                        </label>
                        {d.depositCollected && (
                          <label className="text-sm">
                            <span className="text-slate-600">金額（元）</span>
                            <input
                              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                              inputMode="numeric"
                              placeholder={String(room.depositAmount ?? 0)}
                              value={d.depositYuan}
                              onChange={(e) => updateDraft(room.id, { depositYuan: e.target.value })}
                            />
                          </label>
                        )}
                      </div>
                      <label className="text-sm sm:col-span-2">
                        <span className="text-slate-600">備註</span>
                        <textarea
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          rows={2}
                          placeholder="系統上線前已入住的租客…"
                          value={d.notes}
                          onChange={(e) => updateDraft(room.id, { notes: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {vacantRooms.length > 0 && (
            <div className="flex justify-end">
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={submitting}
                onClick={() => void runBatch()}
              >
                {submitting ? '匯入中…' : '批次匯入所有勾選的房間'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
