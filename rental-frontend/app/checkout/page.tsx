'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateSlash } from '@/lib/api-client';

type Tenant = {
  id: string;
  nameZh: string;
  roomId: string;
  propertyId: string;
  phone: string;
};

export default function CheckoutPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<Tenant[]>('/api/tenants?status=active');
        if (!cancelled) setTenants(data);
      } catch (e) {
        if (!cancelled) {
          setTenants([]);
          setError(e instanceof ApiError ? e.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-slate-600">在住租客（辦理退租表單將依規格 §八 實作）</p>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          {tenants.map((t) => (
            <li key={t.id} className="text-sm">
              {t.nameZh}　{t.phone}　
              <span className="text-slate-500">租客 ID: {t.id}</span>
            </li>
          ))}
          {tenants.length === 0 && <li className="text-slate-500">無在住租客</li>}
        </ul>
      )}
    </div>
  );
}
