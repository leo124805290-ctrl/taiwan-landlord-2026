'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import {
  fetchTenantArchive,
  formatDateZh,
  formatNtdFromCents,
  type TenantArchive,
} from '@/lib/lease-history';

export default function HistoryDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [data, setData] = useState<TenantArchive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTenantArchive(id);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!id) {
    return <p className="muted">無效的租約 ID</p>;
  }

  return (
    <div>
      <p>
        <Link href="/history">← 返回歷史租約列表</Link>
      </p>
      <h1>歷史租約詳情</h1>
      <p className="muted">此頁為唯讀歸檔檢視。</p>

      {loading && <p className="muted">載入中…</p>}
      {error && <div className="error">{error}</div>}

      {data && !loading && !error && (
        <>
          <section className="card">
            <h2>租客與房間</h2>
            <p>
              <strong>{String(data.tenant.nameZh ?? '')}</strong> /{' '}
              {String(data.tenant.nameVi ?? '')}
            </p>
            <p>電話：{String(data.tenant.phone ?? '—')}</p>
            <p>護照：{data.tenant.passportNumber ? String(data.tenant.passportNumber) : '—'}</p>
            <p>入住：{formatDateZh(data.tenant.checkInDate)}</p>
            <p>實際退租：{formatDateZh(data.tenant.actualCheckoutDate)}</p>
            <p>
              物業：{data.property ? String((data.property as { name?: string }).name) : '—'}　房間：
              {data.room ? String((data.room as { roomNumber?: string }).roomNumber) : '—'}
            </p>
            {data.tenant.notes ? (
              <p>
                備註：<span className="muted">{String(data.tenant.notes)}</span>
              </p>
            ) : null}
          </section>

          <section className="card">
            <h2>退租結算</h2>
            {data.checkoutSettlements.length === 0 ? (
              <p className="muted">無結算紀錄</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>退租日</th>
                    <th>入住天數</th>
                    <th>租金應付</th>
                    <th>電費</th>
                    <th>其他扣款</th>
                    <th>總應付</th>
                    <th>應退金額</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {data.checkoutSettlements.map((s) => (
                    <tr key={String(s.id)}>
                      <td>{formatDateZh(s.checkoutDate)}</td>
                      <td>{String(s.daysStayed ?? '—')}</td>
                      <td>{formatNtdFromCents(s.rentDue)}</td>
                      <td>{formatNtdFromCents(s.electricityFee)}</td>
                      <td>{formatNtdFromCents(s.otherDeductions)}</td>
                      <td>{formatNtdFromCents(s.totalDue)}</td>
                      <td>{formatNtdFromCents(s.refundAmount)}</td>
                      <td>{String(s.settlementStatus ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>押金流水</h2>
            {data.deposits.length === 0 ? (
              <p className="muted">無押金紀錄</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>類型</th>
                    <th>金額（元）</th>
                    <th>說明</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deposits.map((d) => (
                    <tr key={String(d.id)}>
                      <td>{formatDateZh(d.depositDate)}</td>
                      <td>{String(d.type ?? '—')}</td>
                      <td>{formatNtdFromCents(d.amount)}</td>
                      <td className="muted">{d.description ? String(d.description) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>帳單（收款）</h2>
            {data.payments.length === 0 ? (
              <p className="muted">無帳單紀錄</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th>類型</th>
                    <th>總額</th>
                    <th>已付</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={String(p.id)}>
                      <td>{String(p.paymentMonth ?? '—')}</td>
                      <td>{String(p.lineType ?? '—')}</td>
                      <td>{formatNtdFromCents(p.totalAmount)}</td>
                      <td>{formatNtdFromCents(p.paidAmount)}</td>
                      <td>{String(p.paymentStatus ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>電錶（入住日至退租日）</h2>
            {data.meterReadings.length === 0 ? (
              <p className="muted">此區間無抄表紀錄</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>度數</th>
                  </tr>
                </thead>
                <tbody>
                  {data.meterReadings.map((m) => (
                    <tr key={String(m.id)}>
                      <td>{formatDateZh(m.readingDate)}</td>
                      <td>{String(m.readingValue ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
