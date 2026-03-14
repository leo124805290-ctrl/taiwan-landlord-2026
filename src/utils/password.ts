import bcrypt from 'bcrypt';

// 鹽的輪數（成本因數）
const SALT_ROUNDS = 12;

// 密碼雜湊選項
const hashOptions = {
  rounds: SALT_ROUNDS,
};

// 雜湊密碼
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 6) {
    throw new Error('密碼長度至少需要 6 個字元');
  }

  try {
    const salt = await bcrypt.genSalt(hashOptions.rounds);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    console.error('❌ 密碼雜湊失敗:', error);
    throw new Error('密碼處理失敗');
  }
}

// 比較密碼
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || !hashedPassword) {
    return false;
  }

  try {
    const match = await bcrypt.compare(password, hashedPassword);
    return match;
  } catch (error) {
    console.error('❌ 密碼比較失敗:', error);
    return false;
  }
}

// 檢查密碼強度
export function checkPasswordStrength(password: string): {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // 長度檢查
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('密碼長度至少需要 8 個字元');
  }

  // 包含數字
  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('密碼應包含至少一個數字');
  }

  // 包含小寫字母
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('密碼應包含至少一個小寫字母');
  }

  // 包含大寫字母
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('密碼應包含至少一個大寫字母');
  }

  // 包含特殊字元
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('密碼應包含至少一個特殊字元');
  }

  const isValid = score >= 3; // 至少中等強度

  return {
    isValid,
    score,
    feedback: isValid ? [] : feedback,
  };
}

// 產生隨機密碼
export function generateRandomPassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  // 確保至少包含每種類型
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 26)); // 大寫
  password += 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26)); // 小寫
  password += '0123456789'.charAt(Math.floor(Math.random() * 10)); // 數字
  password += '!@#$%^&*'.charAt(Math.floor(Math.random() * 8)); // 特殊字元

  // 填充剩餘長度
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  // 隨機排序
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// 檢查密碼是否在常見密碼清單中（簡單實作）
export function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    'password',
    '123456',
    'qwerty',
    'admin',
    'welcome',
    'password123',
    '12345678',
    '123456789',
    '123123',
    '111111',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

// 密碼策略驗證
export function validatePasswordPolicy(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 基本檢查
  if (!password || password.length === 0) {
    errors.push('密碼不能為空');
    return { isValid: false, errors };
  }

  // 長度檢查
  if (password.length < 8) {
    errors.push('密碼長度至少需要 8 個字元');
  }

  if (password.length > 128) {
    errors.push('密碼長度不能超過 128 個字元');
  }

  // 常見密碼檢查
  if (isCommonPassword(password)) {
    errors.push('密碼過於常見，請使用更複雜的密碼');
  }

  // 強度檢查
  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    errors.push(...strength.feedback);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 導出所有函數
export default {
  hashPassword,
  comparePassword,
  checkPasswordStrength,
  generateRandomPassword,
  isCommonPassword,
  validatePasswordPolicy,
};