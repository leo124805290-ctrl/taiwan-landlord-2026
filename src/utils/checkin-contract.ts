/**
 * 月簽制：合約到期日、入住應收（20 號分界、日租金＝月租÷30）。
 */

export const CONTRACT_TERM_OPTIONS = [1, 3, 6, 12] as const;
export type ContractTermMonths = (typeof CONTRACT_TERM_OPTIONS)[number];

/** YYYY-MM-DD → 本地午夜（避免 UTC 偏移） */
export function parseLocalYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

export function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * 入住日 + 合約月數 → 該段最後一日。
 * 1 號入住：+ (term - 1) 個月曆月後取月底；非 1 號：+ term 個月曆月後取月底。
 */
export function computeExpectedCheckoutDate(checkIn: Date, contractTermMonths: number): Date {
  if (Number.isNaN(checkIn.getTime())) return checkIn;
  const day = checkIn.getDate();
  const y = checkIn.getFullYear();
  const mi = checkIn.getMonth();
  const monthsToAdd = day === 1 ? contractTermMonths - 1 : contractTermMonths;
  const end = new Date(y, mi + monthsToAdd, 1);
  const ld = lastDayOfMonth(end.getFullYear(), end.getMonth());
  return new Date(end.getFullYear(), end.getMonth(), ld);
}

/** 當月剩餘可收天數：月底日 − 入住日（與規格 3/25→6 天、3/15→16 天一致） */
export function daysRemainingInMonthForRent(checkIn: Date): number {
  const last = lastDayOfMonth(checkIn.getFullYear(), checkIn.getMonth());
  return last - checkIn.getDate();
}

export function prorationRentYuan(monthlyRentYuan: number, checkIn: Date): number {
  const days = daysRemainingInMonthForRent(checkIn);
  const daily = monthlyRentYuan / 30;
  return Math.round(daily * days);
}

export function isOnOrBeforeDay20(checkIn: Date): boolean {
  return checkIn.getDate() <= 20;
}

/** 次月 YYYY-MM */
export function nextCalendarMonthYm(checkIn: Date): string {
  const d = new Date(checkIn.getFullYear(), checkIn.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ymFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
