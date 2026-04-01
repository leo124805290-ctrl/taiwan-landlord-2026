/**
 * 不重灌資料：若尚無約定之超級管理員帳號則建立一筆。
 * 適用已有資料庫、或不想執行 db:seed 清空全表時。
 *
 *   npm run db:ensure-admin
 *
 * 環境變數：SEED_ADMIN_USERNAME（預設 admin）、SEED_ADMIN_PASSWORD（預設 82913187）
 */
import dotenv from 'dotenv';
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from './index.js';
import { hashPassword } from '../utils/password.js';
import { normalizeUsername } from '../utils/username.js';

dotenv.config();

async function main() {
  const adminUsername = normalizeUsername(
    process.env.SEED_ADMIN_USERNAME?.trim() || 'admin',
  );
  let password = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!password) {
    console.warn(
      '⚠️  未設定 SEED_ADMIN_PASSWORD，使用專案約定預設；正式環境請改為強密碼。',
    );
    password = '82913187';
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(eq(schema.users.username, adminUsername), isNull(schema.users.deletedAt)),
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(`✅ 已存在超級管理員帳號：${adminUsername}，略過建立。`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);

  // @ts-ignore - Drizzle 類型問題
  const [created] = await db.insert(schema.users).values({
    username: adminUsername,
    email: null,
    passwordHash,
    fullName: '系統管理員',
    phone: '0912345678',
    role: 'super_admin',
    isActive: true,
  }).returning({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
  });

  console.log(`
✅ 已建立超級管理員
   帳號: ${created.username}
   密碼: （與本次 SEED_ADMIN_PASSWORD 或預設相同，請勿提交至版控）
   角色: ${created.role}
`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ ensure-super-admin 失敗:', err);
  process.exit(1);
});
