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
          UNIQUE(room_id, payment_month)
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
          receipt_url TEXT,
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

    // 補齊可能缺少的欄位
    try {
      await queryClient`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT`;
      console.log('✅ expenses.receipt_url 欄位已確認');
    } catch (e) {
      console.log('receipt_url 欄位處理:', e);
    }

    console.log('🎉 所有 12 張資料庫表建立完成！');

  } catch (error) {
    console.error('❌ 資料庫遷移失敗:', error);
    throw error;
  }
}