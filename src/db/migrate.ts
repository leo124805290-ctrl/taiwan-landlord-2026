import { queryClient } from './index.js';

export async function autoMigrate() {
  console.log('🔧 自動建立資料庫表（使用 IF NOT EXISTS）...');
  
  try {
    console.log('📦 建立資料庫表...');

    // 按順序建表（注意外鍵依賴）
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
        recurring BOOLEAN DEFAULT false,
        recurring_period VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('✅ expenses 表建立完成');

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

    await queryClient`
      CREATE TABLE IF NOT EXISTS maintenance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES properties(id),
        room_id UUID REFERENCES rooms(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        priority VARCHAR(50) DEFAULT 'normal',
        reported_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scheduled_date TIMESTAMPTZ,
        completed_date TIMESTAMPTZ,
        cost_estimate INTEGER,
        actual_cost INTEGER,
        assigned_to VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `;
    console.log('✅ maintenance 表建立完成');

    console.log('🎉 所有 12 張資料庫表建立完成！');

  } catch (error) {
    console.error('❌ 資料庫遷移失敗:', error);
    throw error;
  }
}