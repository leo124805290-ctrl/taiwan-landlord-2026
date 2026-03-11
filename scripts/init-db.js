#!/usr/bin/env node
/**
 * 資料庫初始化腳本
 * 執行：node scripts/init-db.js
 * 需要環境變數：DATABASE_URL
 * - 執行 db/schema.sql
 * - 插入預設 settings
 * - 建立 admin / Admin1234 superadmin 帳號 (bcrypt rounds=12)
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[ERROR] DATABASE_URL 未設定，請設定後再執行。');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

const DROP_ORDER = [
  'idempotency_keys',
  'user_sessions',
  'history',
  'maintenance',
  'payments',
  'costs',
  'tenants',
  'rooms',
  'properties',
  'settings',
  'users',
];

async function dropAllTables(client) {
  for (const table of DROP_ORDER) {
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  console.log('[OK] 已 DROP 所有相關表');
}

async function runSchema(client) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await client.query(sql);
  console.log('[OK] schema.sql 執行完成');
}

async function insertDefaultSettings(client) {
  const defaults = [
    { key: 'deposit_months', value: '1', label: '押金月數' },
    { key: 'electric_rate', value: '6', label: '電費單價（元/度）' },
    { key: 'water_rate', value: '0', label: '水費單價' },
    { key: 'lock_timeout_minutes', value: '5', label: '房間鎖定逾時（分鐘）' },
  ];
  for (const row of defaults) {
    await client.query(
      `INSERT INTO settings (key, value, label, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label, updated_at = CURRENT_TIMESTAMP`,
      [row.key, row.value, row.label],
    );
  }
  console.log('[OK] 預設 settings 插入完成');
}

async function createAdminUser(client) {
  const username = 'admin';
  const password = 'Admin1234';
  const rounds = 12;
  const password_hash = await bcrypt.hash(password, rounds);

  await client.query(
    `INSERT INTO users (username, password_hash, display_name, role, language, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       language = EXCLUDED.language,
       is_active = EXCLUDED.is_active`,
    [username, password_hash, '系統管理員', 'superadmin', 'zh-TW'],
  );
  console.log('[OK] 管理員帳號建立/更新完成：admin / Admin1234 (superadmin, bcrypt rounds=12)');
}

async function main() {
  const client = await pool.connect();
  try {
    await dropAllTables(client);
    await runSchema(client);
    await insertDefaultSettings(client);
    await createAdminUser(client);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
