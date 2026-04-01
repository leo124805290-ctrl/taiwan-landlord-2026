/**
 * 登入帳號（username）：非 Email，3～64 字元，可含中英數與 ._-
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 通過驗證回 null，否則回錯誤訊息 */
export function validateUsername(raw: string): string | null {
  const s = raw.trim();
  if (s.length < 3 || s.length > 64) {
    return '帳號長度須為 3～64 字元';
  }
  if (s.includes('@')) {
    return '請使用自訂帳號，不要使用 Email（勿含 @）';
  }
  if (/\s/.test(s)) {
    return '帳號不可含空白';
  }
  // 中英數、._-
  if (!/^[\p{L}\p{N}._-]+$/u.test(s)) {
    return '帳號僅能使用文字、數字與 . _ -';
  }
  return null;
}
