import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合併多個 class 名稱，處理 Tailwind CSS 衝突
 * 
 * @example
 * cn('px-2 py-1', 'bg-red-500', 'text-white')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化貨幣（新台幣）
 * 
 * @example
 * formatCurrency(1234567) // "1,234,567"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 後端金額多為「分」，顯示為新台幣元 */
export function formatCents(cents: number): string {
  return formatCurrency(cents / 100);
}

/**
 * 格式化日期（台灣格式）
 * 
 * @example
 * formatDate(new Date(), 'full') // "2026年3月14日"
 */
export function formatDate(
  date: Date | string,
  format: 'short' | 'medium' | 'long' | 'full' = 'medium'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  switch (format) {
    case 'short':
      options.month = 'numeric';
      options.day = 'numeric';
      break;
    case 'long':
      options.month = 'long';
      break;
    case 'full':
      options.weekday = 'long';
      options.month = 'long';
      break;
  }

  return new Intl.DateTimeFormat('zh-TW', options).format(dateObj);
}

/**
 * 計算日租金（月租金 ÷ 30）
 */
export function calculateDailyRent(monthlyRent: number): number {
  return Math.round(monthlyRent / 30);
}

/**
 * 計算入住天數
 */
export function calculateStayDays(
  checkInDate: Date | string,
  checkOutDate: Date | string
): number {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  
  // 確保時間設為中午以避免時區問題
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(diffDays, 1); // 最少一天
}

/**
 * 計算電費（度數 × 單價）
 */
export function calculateElectricityCost(
  usage: number, // 度數
  rate: number // 每度單價（分）
): number {
  return Math.round(usage * (rate / 100)); // 轉換為元
}

/**
 * 生成隨機 ID（用於前端臨時資料）
 */
export function generateId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 深度拷貝物件
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 物件安全取值（避免 undefined 錯誤）
 */
export function safeGet<T, K extends keyof T>(
  obj: T | null | undefined,
  key: K,
  defaultValue?: T[K]
): T[K] | undefined {
  if (obj == null) return defaultValue;
  return obj[key] !== undefined ? obj[key] : defaultValue;
}

/**
 * 延遲函數
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 防抖函數
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * 節流函數
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 驗證電子郵件格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 驗證手機號碼（台灣格式）
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^09\d{8}$/;
  return phoneRegex.test(phone);
}

/**
 * 擷取字串，超過長度加...
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * 計算百分比
 */
export function calculatePercentage(
  value: number,
  total: number,
  decimalPlaces: number = 1
): number {
  if (total === 0) return 0;
  const percentage = (value / total) * 100;
  return parseFloat(percentage.toFixed(decimalPlaces));
}

/**
 * 轉換狀態為中文顯示
 */
export function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    vacant: '空房',
    occupied: '已入住',
    reserved: '已預訂',
    maintenance: '維修中',
    pending: '待處理',
    completed: '已完成',
    cancelled: '已取消',
    active: '啟用中',
    inactive: '已停用',
  };
  
  return statusMap[status] || status;
}

/**
 * 取得狀態顏色
 */
export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    vacant: 'green',
    occupied: 'blue',
    reserved: 'yellow',
    maintenance: 'red',
    pending: 'gray',
    completed: 'green',
    cancelled: 'gray',
    active: 'green',
    inactive: 'gray',
  };
  
  return colorMap[status] || 'gray';
}

/**
 * 格式化檔案大小
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export default {
  cn,
  formatCurrency,
  formatDate,
  calculateDailyRent,
  calculateStayDays,
  calculateElectricityCost,
  generateId,
  deepClone,
  safeGet,
  delay,
  debounce,
  throttle,
  isValidEmail,
  isValidPhone,
  truncateString,
  calculatePercentage,
  getStatusLabel,
  getStatusColor,
  formatFileSize,
};