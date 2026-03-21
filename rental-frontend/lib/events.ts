/** 業務資料已清空時發送，儀表板／抄表／支出等分頁可監聽並重新載入。 */
export const BUSINESS_DATA_CLEARED_EVENT = 'landlord-business-data-cleared';

export function emitBusinessDataCleared(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BUSINESS_DATA_CLEARED_EVENT));
}
