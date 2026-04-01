import { queryClient } from './index.js';

/**
 * 舊版 autoMigrate 建立的 maintenance 欄位名與 Drizzle schema 不一致。
 * 此函式可重複執行：僅在「舊欄存在且新欄不存在」時 RENAME，並補上 schema 需要但舊表沒有的欄位。
 */
async function alignLegacyMaintenanceColumns(): Promise<void> {
  console.log('🔧 檢查 maintenance 表欄位與 Drizzle schema 對齊…');
  try {
    await queryClient.unsafe(`
DO $$
BEGIN
  IF to_regclass('public.maintenance') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'cost_estimate'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'estimated_cost'
  ) THEN
    ALTER TABLE maintenance RENAME COLUMN cost_estimate TO estimated_cost;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'reported_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'reported_at'
  ) THEN
    ALTER TABLE maintenance RENAME COLUMN reported_date TO reported_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'scheduled_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE maintenance RENAME COLUMN scheduled_date TO started_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'completed_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE maintenance RENAME COLUMN completed_date TO completed_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'maintenance' AND column_name = 'reported_by'
  ) THEN
    ALTER TABLE maintenance ADD COLUMN reported_by UUID REFERENCES users(id);
  END IF;
END $$;
`);
    console.log('✅ maintenance 欄位對齊檢查完成');
  } catch (err) {
    console.error('❌ maintenance 欄位對齊失敗（不阻斷啟動）:', err);
  }
}

/** 補上 users.username、email 可為空；舊資料由 email 推導帳號 */
async function alignUsersUsernameColumns(): Promise<void> {
  console.log('🔧 檢查 users.username（登入帳號）與 email 可為空…');
  try {
    await queryClient.unsafe(`
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(64);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  END IF;

  UPDATE users SET username = LOWER(REGEXP_REPLACE(TRIM(email), '@.*$', ''))
  WHERE username IS NULL AND email IS NOT NULL AND TRIM(email) <> '';

  UPDATE users SET username = 'u' || REPLACE(id::text, '-', '')
  WHERE username IS NULL OR TRIM(username) = '';

  UPDATE users u SET username = u.username || '_' || REPLACE(u.id::text, '-', '')
  WHERE u.id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY username ORDER BY created_at) AS rn
      FROM users WHERE deleted_at IS NULL
    ) t WHERE rn > 1
  );

  UPDATE users u SET username = u.username || '_' || REPLACE(u.id::text, '-', '')
  WHERE u.id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY username ORDER BY created_at) AS rn
      FROM users WHERE deleted_at IS NULL
    ) t WHERE rn > 1
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
  END IF;
END $$;
`);
    await queryClient.unsafe(`
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
`);
    console.log('✅ users.username／email 對齊完成');
  } catch (err) {
    console.error('❌ users.username 對齊失敗（不阻斷啟動）:', err);
  }
}

export async function autoMigrate() {
  console.log('🔧 自動建立資料庫表（使用 IF NOT EXISTS）...');
  
  try {
    console.log('📦 建立資料庫表...');

    // 按順序建表（注意外鍵依賴）
    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          phone VARCHAR(50),
          role VARCHAR(50) NOT NULL DEFAULT 'admin',
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ users 表建立完成');
    } catch (err) {
      console.error('❌ users 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    await alignUsersUsernameColumns();

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS properties (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          address TEXT NOT NULL,
          total_floors INTEGER NOT NULL DEFAULT 1,
          total_rooms INTEGER NOT NULL DEFAULT 0,
          landlord_name VARCHAR(255),
          landlord_phone VARCHAR(50),
          landlord_deposit INTEGER NOT NULL DEFAULT 0,
          landlord_monthly_rent INTEGER NOT NULL DEFAULT 0,
          prepay_cycle_months INTEGER NOT NULL DEFAULT 1,
          contract_start_date TIMESTAMPTZ,
          contract_end_date TIMESTAMPTZ,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ properties 表建立完成');
    } catch (err) {
      console.error('❌ properties 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS property_managers (
          property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          PRIMARY KEY (property_id, user_id)
        )
      `;
      console.log('✅ property_managers 表建立完成');
    } catch (err) {
      console.error('❌ property_managers 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS rooms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          room_number VARCHAR(50) NOT NULL,
          floor INTEGER NOT NULL DEFAULT 1,
          monthly_rent INTEGER NOT NULL DEFAULT 0,
          deposit_amount INTEGER NOT NULL DEFAULT 0,
          electricity_rate INTEGER NOT NULL DEFAULT 350,
          status VARCHAR(50) NOT NULL DEFAULT 'vacant',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          UNIQUE(property_id, room_number)
        )
      `;
      console.log('✅ rooms 表建立完成');
    } catch (err) {
      console.error('❌ rooms 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room_id UUID NOT NULL REFERENCES rooms(id),
          property_id UUID NOT NULL REFERENCES properties(id),
          name_zh VARCHAR(255) NOT NULL,
          name_vi VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NOT NULL,
          passport_number VARCHAR(100),
          check_in_date TIMESTAMPTZ NOT NULL,
          expected_checkout_date TIMESTAMPTZ,
          actual_checkout_date TIMESTAMPTZ,
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ tenants 表建立完成');
    } catch (err) {
      console.error('❌ tenants 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS deposits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID REFERENCES tenants(id),
          room_id UUID NOT NULL REFERENCES rooms(id),
          amount INTEGER NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          deposit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ deposits 表建立完成');
    } catch (err) {
      console.error('❌ deposits 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS meter_readings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          reading_value INTEGER NOT NULL,
          reading_date TIMESTAMPTZ NOT NULL,
          recorded_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      console.log('✅ meter_readings 表建立完成');
    } catch (err) {
      console.error('❌ meter_readings 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room_id UUID NOT NULL REFERENCES rooms(id),
          tenant_id UUID REFERENCES tenants(id),
          line_type VARCHAR(50) NOT NULL DEFAULT 'rent',
          payment_month VARCHAR(7) NOT NULL,
          rent_amount INTEGER NOT NULL DEFAULT 0,
          electricity_fee INTEGER NOT NULL DEFAULT 0,
          management_fee INTEGER NOT NULL DEFAULT 0,
          other_fees INTEGER NOT NULL DEFAULT 0,
          total_amount INTEGER NOT NULL DEFAULT 0,
          paid_amount INTEGER NOT NULL DEFAULT 0,
          balance INTEGER NOT NULL DEFAULT 0,
          payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
          payment_date TIMESTAMPTZ,
          payment_method VARCHAR(50),
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          UNIQUE(room_id, payment_month, line_type)
        )
      `;
      console.log('✅ payments 表建立完成');
    } catch (err) {
      console.error('❌ payments 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS checkout_settlements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id),
          room_id UUID NOT NULL REFERENCES rooms(id),
          checkout_date TIMESTAMPTZ NOT NULL,
          days_stayed INTEGER NOT NULL,
          daily_rent INTEGER NOT NULL,
          rent_due INTEGER NOT NULL DEFAULT 0,
          electricity_fee INTEGER NOT NULL DEFAULT 0,
          other_deductions INTEGER NOT NULL DEFAULT 0,
          total_due INTEGER NOT NULL DEFAULT 0,
          prepaid_amount INTEGER NOT NULL DEFAULT 0,
          deposit_amount INTEGER NOT NULL DEFAULT 0,
          refund_amount INTEGER NOT NULL DEFAULT 0,
          settlement_status VARCHAR(50) NOT NULL DEFAULT 'pending',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      console.log('✅ checkout_settlements 表建立完成');
    } catch (err) {
      console.error('❌ checkout_settlements 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id UUID NOT NULL REFERENCES properties(id),
          room_id UUID REFERENCES rooms(id),
          type VARCHAR(50) NOT NULL,
          category VARCHAR(50) NOT NULL,
          amount INTEGER NOT NULL,
          expense_date TIMESTAMPTZ NOT NULL,
          description TEXT,
          receipt_url VARCHAR(500),
          recurring BOOLEAN DEFAULT false,
          recurring_period VARCHAR(50),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ expenses 表建立完成');
    } catch (err) {
      console.error('❌ expenses 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS extra_incomes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id UUID NOT NULL REFERENCES properties(id),
          type VARCHAR(50) NOT NULL,
          amount INTEGER NOT NULL,
          income_date TIMESTAMPTZ NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ extra_incomes 表建立完成');
    } catch (err) {
      console.error('❌ extra_incomes 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    try {
      await queryClient`
        CREATE TABLE IF NOT EXISTS maintenance (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id UUID NOT NULL REFERENCES properties(id),
          room_id UUID REFERENCES rooms(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          priority VARCHAR(50) NOT NULL DEFAULT 'medium',
          estimated_cost INTEGER DEFAULT 0,
          actual_cost INTEGER DEFAULT 0,
          reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          assigned_to UUID REFERENCES users(id),
          reported_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        )
      `;
      console.log('✅ maintenance 表建立完成');
    } catch (err) {
      console.error('❌ maintenance 表建立失敗:', err);
      // 不要 throw，繼續建其他表
    }

    await alignLegacyMaintenanceColumns();

    try {
      await queryClient`ALTER TABLE payments ADD COLUMN IF NOT EXISTS line_type VARCHAR(50) DEFAULT 'rent'`;
      console.log('✅ payments.line_type 欄位已新增');
    } catch (e) {
      console.log('line_type:', e);
    }

    /** 舊庫 UNIQUE(room_id, payment_month) 會擋入住同月押金＋租金兩筆，需改為含 line_type */
    try {
      await queryClient.unsafe(
        `UPDATE payments SET line_type = 'rent' WHERE line_type IS NULL`,
      );
    } catch (e) {
      console.log('payments line_type backfill:', e);
    }

    try {
      await queryClient.unsafe(
        `ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_room_id_payment_month_key`,
      );
      console.log('✅ 已移除舊 UNIQUE(room_id, payment_month) 約束');
    } catch (e) {
      console.log('drop payments_room_id_payment_month_key:', e);
    }

    try {
      await queryClient.unsafe(`DROP INDEX IF EXISTS payments_room_month_unique`);
    } catch (e) {
      console.log('drop payments_room_month_unique:', e);
    }

    try {
      await queryClient.unsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS payments_room_month_line_unique
        ON payments (room_id, payment_month, line_type);
      `);
      console.log('✅ payments (room_id, payment_month, line_type) 唯一索引已就緒');
    } catch (e) {
      console.log('payments_room_month_line_unique:', e);
    }

    /** 舊版將 rooms 的「元」誤寫入 payments／deposits「分」欄位；僅在仍等於房間月租／押金時補乘 100（可重跑） */
    try {
      await queryClient.unsafe(`
        UPDATE payments p
        SET
          rent_amount = p.rent_amount * 100,
          total_amount = p.total_amount * 100,
          paid_amount = p.paid_amount * 100,
          balance = GREATEST(0, p.total_amount * 100 - p.paid_amount * 100),
          payment_status = CASE
            WHEN p.paid_amount * 100 >= p.total_amount * 100 THEN 'paid'
            WHEN p.paid_amount * 100 > 0 THEN 'partial'
            ELSE p.payment_status
          END
        FROM rooms r
        WHERE p.room_id = r.id
          AND p.line_type = 'rent'
          AND p.deleted_at IS NULL
          AND p.total_amount = r.monthly_rent
          AND p.rent_amount = r.monthly_rent
      `);
      await queryClient.unsafe(`
        UPDATE payments p
        SET
          total_amount = p.total_amount * 100,
          paid_amount = p.paid_amount * 100,
          balance = GREATEST(0, p.total_amount * 100 - p.paid_amount * 100),
          payment_status = CASE
            WHEN p.paid_amount * 100 >= p.total_amount * 100 THEN 'paid'
            WHEN p.paid_amount * 100 > 0 THEN 'partial'
            ELSE p.payment_status
          END
        FROM rooms r
        WHERE p.room_id = r.id
          AND p.line_type = 'deposit'
          AND p.deleted_at IS NULL
          AND p.rent_amount = 0
          AND p.total_amount = r.deposit_amount
      `);
      await queryClient.unsafe(`
        UPDATE deposits d
        SET amount = d.amount * 100
        FROM rooms r
        WHERE d.room_id = r.id
          AND d.deleted_at IS NULL
          AND d.type = '收取'
          AND d.amount = r.deposit_amount
      `);
      console.log(
        '✅ payments／deposits 金額「元→分」補正已執行（僅修正仍等於房間月租／押金的舊列）',
      );
    } catch (e) {
      console.log('payments 元→分補正:', e);
    }

    try {
      await queryClient`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT`;
      console.log('✅ expenses.receipt_url 欄位已新增');
    } catch (e) {
      console.log('receipt_url:', e);
    }

    console.log('🎉 所有 12 張資料庫表建立完成！');

  } catch (error) {
    console.error('❌ 資料庫遷移失敗:', error);
    throw error;
  }
}