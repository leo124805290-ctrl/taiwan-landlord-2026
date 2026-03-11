-- Taiwan Landlord / Vietnam Tenant - PostgreSQL Schema
-- All TIMESTAMP in Asia/Taipei (application responsibility)

-- Users (backend auth)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  language VARCHAR(20) DEFAULT 'zh-TW',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (token-based auth)
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Idempotency keys (checkin/checkout)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  floor INTEGER,
  room_number VARCHAR(50) NOT NULL,
  monthly_rent NUMERIC(12,2),
  deposit NUMERIC(12,2),
  status VARCHAR(50) NOT NULL DEFAULT 'vacant',
  tenant_name VARCHAR(255),
  check_in_date DATE,
  check_out_date DATE,
  current_meter NUMERIC(12,2),
  previous_meter NUMERIC(12,2),
  locked_by VARCHAR(255),
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id, room_number)
);
CREATE INDEX IF NOT EXISTS idx_rooms_property_status ON rooms(property_id, status);

-- Tenants (historical + active)
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(100),
  nationality VARCHAR(100),
  contract_start DATE NOT NULL,
  contract_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tenants_property_active ON tenants(property_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_room ON tenants(room_id);

-- Payments (soft delete)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_payments_property_date ON payments(property_id, paid_date);
CREATE INDEX IF NOT EXISTS idx_payments_room ON payments(room_id);

-- Costs (soft delete)
CREATE TABLE IF NOT EXISTS costs (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  category VARCHAR(100) NOT NULL,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(12,2) NOT NULL,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_costs_property_date ON costs(property_id, cost_date);

-- History (audit log)
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  description TEXT,
  amount NUMERIC(12,2),
  performed_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_property_created ON history(property_id, created_at);

-- Maintenance
CREATE TABLE IF NOT EXISTS maintenance (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  estimated_cost NUMERIC(12,2),
  actual_cost NUMERIC(12,2),
  completed_at TIMESTAMP,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_maintenance_property_status ON maintenance(property_id, status);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  label VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
