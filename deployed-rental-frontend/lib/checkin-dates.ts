/** 入住日 YYYY-MM-DD → 合約到期預設為隔年同日（UTC 日期，避免 DST） */
export function addOneYearToIsoDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const parts = isoDate.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → YYYY-MM */
export function paymentMonthFromCheckIn(isoDate: string): string {
  if (!isoDate) return new Date().toISOString().slice(0, 7);
  return isoDate.slice(0, 7);
}
