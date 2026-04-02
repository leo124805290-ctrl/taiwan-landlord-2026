/**
 * 與後端 `src/utils/checkin-contract.ts` 之合約到期日計算一致。
 */

export function parseLocalYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

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
