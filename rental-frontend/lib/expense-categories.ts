/**
 * 支出 category：後端為英文 code，介面顯示中文 label。
 */

export type ExpenseCategoryItem = { code: string; label: string };

export const EXPENSE_CATEGORIES: ExpenseCategoryItem[] = [
  { code: 'landlord_rent', label: '付房東租金' },
  { code: 'landlord_deposit', label: '付房東押金' },
  { code: 'utility_electric', label: '電費（公用／表）' },
  { code: 'utility_water', label: '水費' },
  { code: 'utility_gas', label: '瓦斯費' },
  { code: 'management_fee', label: '管理費' },
  { code: 'renovation', label: '裝修' },
  { code: 'equipment', label: '設備' },
  { code: 'other', label: '其他' },
];

const map = new Map(EXPENSE_CATEGORIES.map((x) => [x.code, x.label]));

export function getCategoryLabel(code: string): string {
  return map.get(code) ?? code;
}

/** 後端 expenses.type：固定支出／資本性 */
export const EXPENSE_TYPE_FIXED = 'fixed' as const;
export const EXPENSE_TYPE_CAPITAL = 'capital' as const;
