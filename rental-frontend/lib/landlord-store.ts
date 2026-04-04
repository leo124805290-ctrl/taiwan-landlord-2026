/**
 * 房東合約與付款排程（MVP：僅存瀏覽器 localStorage）
 */

import { EXPENSE_TYPE_FIXED } from './expense-categories';

const STORAGE_KEY = 'landlord_contracts_v1';

export type LandlordPaymentKind = 'rent' | 'deposit' | 'utility_electric';

export interface LandlordPayment {
  /** 期數識別，用於 [AUTO:landlord_payment:契約ID:期數ID] */
  id: string;
  contractId: string;
  kind: LandlordPaymentKind;
  /** 新台幣元（顯示與輸入用；同步 API 時換算為分） */
  amountYuan: number;
  /** ISO 日期字串 YYYY-MM-DD */
  dueDate: string;
  paid: boolean;
  paidAt: string | null;
  /** POST /api/expenses 回傳之支出 id */
  expenseId: string | null;
  expenseSynced: boolean;
}

export interface LandlordContract {
  id: string;
  propertyId: string;
  /** 快取顯示用 */
  propertyName: string;
  title: string;
  monthlyRentYuan: number;
  depositYuan: number;
  /** 每月電費（元），0 表示不產生電費期 */
  utilityElectricYuanMonthly: number;
  /** 每月幾號繳租（1–28） */
  paymentDay: number;
  startDate: string;
  endDate: string | null;
  rentCategoryCode: string;
  depositCategoryCode: string;
  utilityCategoryCode: string;
  payments: LandlordPayment[];
  createdAt: string;
  updatedAt: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 將年月與日組成當月日期，日超過該月天數則壓到月底 */
function dateInMonth(year: number, month0: number, day: number): Date {
  const last = new Date(year, month0 + 1, 0).getDate();
  const d = Math.min(day, last);
  return new Date(year, month0, d);
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthsDiff(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * 依合約條件產生未來一段期間的繳款期數（租金每月、首期可含押金、可含每月電費）。
 */
export function generatePaymentSchedule(c: LandlordContract): LandlordPayment[] {
  const paymentDay = Math.min(28, Math.max(1, Math.floor(c.paymentDay)));
  const start = monthStart(parseYmd(c.startDate));
  const endBound = c.endDate
    ? monthStart(parseYmd(c.endDate))
    : addMonths(new Date(), 12);
  const horizonEnd = addMonths(monthStart(new Date()), 12);
  const lastMonth = endBound < horizonEnd ? endBound : horizonEnd;
  let n = monthsDiff(start, lastMonth);
  if (n < 0) n = 0;

  const out: LandlordPayment[] = [];
  for (let i = 0; i <= n; i++) {
    const cur = addMonths(start, i);
    const y = cur.getFullYear();
    const m0 = cur.getMonth();
    const due = dateInMonth(y, m0, paymentDay);
    const ymd = toYmd(due);
    const ym = `${y}-${pad2(m0 + 1)}`;

    if (i === 0 && c.depositYuan > 0) {
      out.push({
        id: `${c.id}:${ym}-deposit`,
        contractId: c.id,
        kind: 'deposit',
        amountYuan: c.depositYuan,
        dueDate: ymd,
        paid: false,
        paidAt: null,
        expenseId: null,
        expenseSynced: false,
      });
    }

    out.push({
      id: `${c.id}:${ym}-rent`,
      contractId: c.id,
      kind: 'rent',
      amountYuan: c.monthlyRentYuan,
      dueDate: ymd,
      paid: false,
      paidAt: null,
      expenseId: null,
      expenseSynced: false,
    });

    if (c.utilityElectricYuanMonthly > 0) {
      out.push({
        id: `${c.id}:${ym}-electric`,
        contractId: c.id,
        kind: 'utility_electric',
        amountYuan: c.utilityElectricYuanMonthly,
        dueDate: ymd,
        paid: false,
        paidAt: null,
        expenseId: null,
        expenseSynced: false,
      });
    }
  }

  // 合併舊的已繳／已同步狀態（依 id）
  const prev = new Map(c.payments.map((p) => [p.id, p]));
  return out.map((p) => {
    const old = prev.get(p.id);
    if (!old) return p;
    return {
      ...p,
      paid: old.paid,
      paidAt: old.paidAt,
      expenseId: old.expenseId,
      expenseSynced: old.expenseSynced,
    };
  });
}

export function loadLandlordContracts(): LandlordContract[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LandlordContract[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveLandlordContracts(list: LandlordContract[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function upsertContract(contract: LandlordContract): void {
  const list = loadLandlordContracts();
  const idx = list.findIndex((x) => x.id === contract.id);
  const next = { ...contract, payments: generatePaymentSchedule(contract) };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveLandlordContracts(list);
}

export function deleteContract(id: string): void {
  saveLandlordContracts(loadLandlordContracts().filter((c) => c.id !== id));
}

export function updatePayment(
  contractId: string,
  paymentId: string,
  patch: Partial<Pick<LandlordPayment, 'paid' | 'paidAt' | 'expenseId' | 'expenseSynced'>>,
): void {
  const list = loadLandlordContracts();
  const c = list.find((x) => x.id === contractId);
  if (!c) return;
  const payments = c.payments.map((p) =>
    p.id === paymentId ? { ...p, ...patch } : p,
  );
  const next = { ...c, payments, updatedAt: new Date().toISOString() };
  saveLandlordContracts(list.map((x) => (x.id === contractId ? next : x)));
}

/** 期數 ID（用於 AUTO 標記第二段；與 payment.id 中第一個 `:` 後段一致） */
export function periodIdForAuto(p: LandlordPayment): string {
  const i = p.id.indexOf(':');
  return i >= 0 ? p.id.slice(i + 1) : p.id;
}

/** 產生自動同步支出說明前綴（後接使用者可讀文字） */
export function autoLandlordDescriptionPrefix(contractId: string, periodId: string): string {
  return `[AUTO:landlord_payment:${contractId}:${periodId}]`;
}

export function expenseTypeForKind(kind: LandlordPaymentKind): typeof EXPENSE_TYPE_FIXED {
  return EXPENSE_TYPE_FIXED;
}

export function categoryCodeForPayment(
  c: LandlordContract,
  p: LandlordPayment,
): string {
  if (p.kind === 'rent') return c.rentCategoryCode;
  if (p.kind === 'deposit') return c.depositCategoryCode;
  return c.utilityCategoryCode;
}
