'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateSlash } from '@/lib/api-client';

type Property = {
  id: string;
  name: string;
  address: string;
  totalFloors: number;
  totalRooms: number;
  landlordName: string;
  landlordPhone: string;
  contractStartDate: string;
  contractEndDate: string;
};

export default function PropertiesPage() {
  const [items, setItems] = useState<Property[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<Property[]>('/api/properties');
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) {
          setItems([]);
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">物業列表（真實 API）</p>
        <span className="text-xs text-amber-700">
          新增／編輯／批次房間將於後續迭代接 POST/PUT（規格 §四）
        </span>
      </div>
      {loading && <p className="text-slate-500">載入中…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}
      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.length === 0 ? (
            <p className="text-slate-500">尚無物業資料</p>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                <p className="text-sm text-slate-600">{p.address}</p>
                <p className="mt-2 text-sm">
                  房東：{p.landlordName}　{p.landlordPhone}
                </p>
                <p className="text-sm text-slate-600">
                  合約：{formatDateSlash(p.contractStartDate)} — {formatDateSlash(p.contractEndDate)}
                </p>
                <p className="text-sm">樓層 {p.totalFloors}　規劃房間 {p.totalRooms}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/properties/${p.id}`}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                  >
                    管理房間
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
