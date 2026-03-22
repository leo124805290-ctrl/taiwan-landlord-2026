/**
 * 房間月租／押金在 rooms 表為「元」整數；payments／deposits 表金額欄位為「分」。
 */
export function yuanToCents(yuan: number): number {
  if (!Number.isFinite(yuan)) return 0;
  return Math.round(yuan * 100);
}
