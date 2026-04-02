/**
 * 歷史租約（已終止）API 型別與請求
 * 後端：GET /api/tenants/history、GET /api/tenants/:id/archive
 */

import { apiGet } from '@/lib/api';

export type HistoryTenantRow = {
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
  createdAt: string;
  updatedAt: string;
  roomNumber: string;
  propertyName: string;
};

export type HistoryListResponse = {
  items: HistoryTenantRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type PropertyRow = { id: string; name: string };
export type RoomRow = { id: string; propertyId: string; roomNumber: string; floor: number };

export async function fetchHistoryList(params: {
  page?: number;
  pageSize?: number;
  propertyId?: string;
  roomId?: string;
  checkoutFrom?: string;
  checkoutTo?: string;
  q?: string;
}): Promise<HistoryListResponse> {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  if (params.propertyId) sp.set('propertyId', params.propertyId);
  if (params.roomId) sp.set('roomId', params.roomId);
  if (params.checkoutFrom) sp.set('checkoutFrom', params.checkoutFrom);
  if (params.checkoutTo) sp.set('checkoutTo', params.checkoutTo);
  if (params.q?.trim()) sp.set('q', params.q.trim());
  const q = sp.toString();
  return apiGet<HistoryListResponse>(`/api/tenants/history${q ? `?${q}` : ''}`);
}

export type TenantArchive = {
  tenant: Record<string, unknown>;
  room: Record<string, unknown> | null;
  property: Record<string, unknown> | null;
  checkoutSettlements: Record<string, unknown>[];
  deposits: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  meterReadings: Record<string, unknown>[];
  readonly: boolean;
};

export function fetchTenantArchive(tenantId: string): Promise<TenantArchive> {
  return apiGet<TenantArchive>(`/api/tenants/${tenantId}/archive`);
}

export function fetchProperties(): Promise<PropertyRow[]> {
  return apiGet<PropertyRow[]>('/api/properties');
}

export function fetchRooms(propertyId?: string): Promise<RoomRow[]> {
  const q = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
  return apiGet<RoomRow[]>(`/api/rooms${q}`);
}

/** 後端金額多為「分」 */
export function formatNtdFromCents(cents: unknown): string {
  const n = Number(cents);
  if (Number.isNaN(n)) return '—';
  return (n / 100).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDateZh(iso: unknown): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
