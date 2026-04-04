'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateSlash, formatMoneyYuanFromCents } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

type Tenant = {
  id: string;
  roomId: string;
  propertyId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber: string | null;
  checkInDate: string;
  expectedCheckoutDate: string | null;
  actualCheckoutDate: string | null;
  status: string;
  notes: string | null;
};

type PaymentRow = {
  id: string;
  paymentMonth: string | null;
  lineType: string | null;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string | null;
};

type MeterRow = {
  id: string;
  readingDate: string;
  readingValue: number | null;
};

const PAPER_MSG = '此租客為紙本簽署，無電子紀錄。';

function storageKeyCheckin(tenantId: string) {
  return `contract_checkin_${tenantId}`;
}

function storageKeyCheckout(tenantId: string) {
  return `contract_checkout_${tenantId}`;
}

function renderStoredContract(raw: string | null): ReactNode {
  if (raw == null || raw === '') {
    return <p className="text-sm text-slate-600">{PAPER_MSG}</p>;
  }
  const t = raw.trim();
  if (t.startsWith('data:image') || t.startsWith('http://') || t.startsWith('https://')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={t} alt="合約簽署" className="max-h-[480px] max-w-full border border-slate-200 object-contain" />
    );
  }
  try {
    const j = JSON.parse(t) as { imageDataUrl?: string; signedAt?: string };
    if (j.imageDataUrl && typeof j.imageDataUrl === 'string') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={j.imageDataUrl}
          alt="合約簽署"
          className="max-h-[480px] max-w-full border border-slate-200 object-contain"
        />
      );
    }
  } catch {
    /* fallthrough */
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      {t.length > 2000 ? `${t.slice(0, 2000)}…` : t}
    </pre>
  );
}

export default function HistoryDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [checkinBlob, setCheckinBlob] = useState<string | null>(null);
  const [checkoutBlob, setCheckoutBlob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const t = await apiGet<Tenant>(`/api/tenants/${id}`);
      setTenant(t);

      const [payList, meterList] = await Promise.all([
        apiGet<PaymentRow[]>(`/api/payments?tenantId=${encodeURIComponent(id)}`),
        apiGet<MeterRow[]>(`/api/meter-readings?roomId=${encodeURIComponent(t.roomId)}`),
      ]);
      setPayments(payList);
      setMeters(meterList);

      let cin: string | null = null;
      let cout: string | null = null;
      try {
        cin = localStorage.getItem(storageKeyCheckin(id));
        cout = localStorage.getItem(storageKeyCheckout(id));
      } catch {
        cin = null;
        cout = null;
      }
      setCheckinBlob(cin);
      setCheckoutBlob(cout);
    } catch (e) {
      setTenant(null);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function handlePrint() {
    window.print();
  }

  if (!id) {
    return <p className="text-slate-500">無效的租客 ID</p>;
  }

  return (
    <div id="history-print-area" className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/history" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← 返回歷史租約
        </Link>
        <Button type="button" variant="outline" onClick={handlePrint}>
          列印
        </Button>
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-slate-900">歷史租約詳情（唯讀）</h1>
        <p className="text-sm text-slate-600">
          {tenant ? `${tenant.nameZh} / ${tenant.nameVi}` : ''}
        </p>
      </div>

      <p className="text-sm text-slate-600 print:hidden">此頁為唯讀；合約圖檔取自本機儲存（若有）。</p>

      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {tenant && !loading && !error && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">租客資料</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">姓名</dt>
                <dd className="font-medium text-slate-900">
                  {tenant.nameZh} / {tenant.nameVi}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">電話</dt>
                <dd>{tenant.phone}</dd>
              </div>
              <div>
                <dt className="text-slate-500">護照／證件</dt>
                <dd>{tenant.passportNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">狀態</dt>
                <dd>{tenant.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">入住日</dt>
                <dd>{formatDateSlash(tenant.checkInDate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">退租日</dt>
                <dd>{formatDateSlash(tenant.actualCheckoutDate)}</dd>
              </div>
              {tenant.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">備註</dt>
                  <dd className="text-slate-800">{tenant.notes}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">帳單歷史</h2>
            <p className="mb-2 text-xs text-slate-500">GET /api/payments?tenantId=…</p>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">無帳單紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-2 py-2">月份</th>
                      <th className="px-2 py-2">類型</th>
                      <th className="px-2 py-2">應付</th>
                      <th className="px-2 py-2">已付</th>
                      <th className="px-2 py-2">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{p.paymentMonth ?? '—'}</td>
                        <td className="px-2 py-2">{p.lineType ?? '—'}</td>
                        <td className="px-2 py-2">${formatMoneyYuanFromCents(p.totalAmount)}</td>
                        <td className="px-2 py-2">${formatMoneyYuanFromCents(p.paidAmount)}</td>
                        <td className="px-2 py-2">{p.paymentStatus ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">電錶歷史</h2>
            <p className="mb-2 text-xs text-slate-500">GET /api/meter-readings?roomId=…</p>
            {meters.length === 0 ? (
              <p className="text-sm text-slate-500">無抄表紀錄</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-2 py-2">日期</th>
                      <th className="px-2 py-2">度數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meters.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{formatDateSlash(m.readingDate)}</td>
                        <td className="px-2 py-2">{m.readingValue ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-slate-900">入住合約（本機）</h2>
            <p className="mb-2 text-xs text-slate-500">localStorage：{storageKeyCheckin(id)}</p>
            {renderStoredContract(checkinBlob)}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-slate-900">退租確認書（本機）</h2>
            <p className="mb-2 text-xs text-slate-500">localStorage：{storageKeyCheckout(id)}</p>
            {renderStoredContract(checkoutBlob)}
          </section>
        </>
      )}
    </div>
  );
}
