import { pgTable, uuid, varchar, integer, boolean, timestamp, text, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ==================== 使用者表 ====================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).notNull().default('admin'), // 'super_admin', 'admin'
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  roleIdx: index('users_role_idx').on(table.role),
  deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 物業表 ====================
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address').notNull(),
  
  // 物業基本資訊
  totalFloors: integer('total_floors').notNull(),
  totalRooms: integer('total_rooms').notNull(),
  
  // 房東資訊
  landlordName: varchar('landlord_name', { length: 255 }).notNull(),
  landlordPhone: varchar('landlord_phone', { length: 50 }).notNull(),
  landlordDeposit: integer('landlord_deposit').notNull().default(0), // 給房東的押金
  landlordMonthlyRent: integer('landlord_monthly_rent').notNull().default(0), // 給房東的月租
  
  // 合約資訊
  prepayCycleMonths: integer('prepay_cycle_months').notNull().default(1), // 預付幾個月
  contractStartDate: timestamp('contract_start_date').notNull(),
  contractEndDate: timestamp('contract_end_date').notNull(),
  
  // 建立者
  createdBy: uuid('created_by').references(() => users.id),
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  nameIdx: index('properties_name_idx').on(table.name),
  createdByIdx: index('properties_created_by_idx').on(table.createdBy),
  deletedAtIdx: index('properties_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 物業管理員關聯表 ====================
export const propertyManagers = pgTable('property_managers', {
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  
  // 軟刪除
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.propertyId, table.userId] }),
  propertyIdIdx: index('property_managers_property_id_idx').on(table.propertyId),
  userIdIdx: index('property_managers_user_id_idx').on(table.userId),
  deletedAtIdx: index('property_managers_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 房間表 ====================
export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  
  // 房間識別
  roomNumber: varchar('room_number', { length: 50 }).notNull(),
  floor: integer('floor').notNull(),
  
  // 租金資訊
  monthlyRent: integer('monthly_rent').notNull().default(0),
  depositAmount: integer('deposit_amount').notNull().default(0),
  electricityRate: integer('electricity_rate').notNull().default(350), // 每度 3.5 元，存整數（分）
  
  // 狀態
  status: varchar('status', { length: 50 }).notNull().default('vacant'), // 'vacant', 'occupied', 'reserved', 'maintenance'
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  propertyIdIdx: index('rooms_property_id_idx').on(table.propertyId),
  roomNumberIdx: uniqueIndex('rooms_property_room_unique').on(table.propertyId, table.roomNumber),
  statusIdx: index('rooms_status_idx').on(table.status),
  deletedAtIdx: index('rooms_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 關聯定義 ====================
export const usersRelations = relations(users, ({ many }) => ({
  managedProperties: many(propertyManagers),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  creator: one(users, {
    fields: [properties.createdBy],
    references: [users.id],
  }),
  managers: many(propertyManagers),
  rooms: many(rooms),
}));

export const propertyManagersRelations = relations(propertyManagers, ({ one }) => ({
  property: one(properties, {
    fields: [propertyManagers.propertyId],
    references: [properties.id],
  }),
  user: one(users, {
    fields: [propertyManagers.userId],
    references: [users.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  property: one(properties, {
    fields: [rooms.propertyId],
    references: [properties.id],
  }),
  tenants: many(tenants),
  deposits: many(deposits),
  meterReadings: many(meterReadings),
  payments: many(payments),
}));

// ==================== 租客表 ====================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  
  // 租客資訊
  nameZh: varchar('name_zh', { length: 255 }).notNull(), // 中文姓名
  nameVi: varchar('name_vi', { length: 255 }).notNull(), // 越南文姓名
  phone: varchar('phone', { length: 50 }).notNull(),
  passportNumber: varchar('passport_number', { length: 100 }), // 護照號碼
  
  // 入住時間
  checkInDate: timestamp('check_in_date').notNull(),
  expectedCheckoutDate: timestamp('expected_checkout_date'), // 預期退租日期
  actualCheckoutDate: timestamp('actual_checkout_date'), // 實際退租日期
  
  // 狀態
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'checked_out'
  notes: text('notes'), // 備註
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  roomIdIdx: index('tenants_room_id_idx').on(table.roomId),
  propertyIdIdx: index('tenants_property_id_idx').on(table.propertyId),
  phoneIdx: index('tenants_phone_idx').on(table.phone),
  statusIdx: index('tenants_status_idx').on(table.status),
  deletedAtIdx: index('tenants_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 押金表 ====================
export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  
  // 押金資訊
  amount: integer('amount').notNull(), // 金額（分）
  type: varchar('type', { length: 50 }).notNull(), // '收取', '退還', '扣款'
  description: text('description'), // 描述
  depositDate: timestamp('deposit_date').notNull().defaultNow(),
  
  // 軟刪除
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  tenantIdIdx: index('deposits_tenant_id_idx').on(table.tenantId),
  roomIdIdx: index('deposits_room_id_idx').on(table.roomId),
  typeIdx: index('deposits_type_idx').on(table.type),
  deletedAtIdx: index('deposits_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 電錶讀數表 ====================
export const meterReadings = pgTable('meter_readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  
  // 讀數資訊
  readingValue: integer('reading_value').notNull(), // 電錶讀數（度）
  readingDate: timestamp('reading_date').notNull(),
  recordedBy: uuid('recorded_by').references(() => users.id),
  
  // 時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  roomIdIdx: index('meter_readings_room_id_idx').on(table.roomId),
  readingDateIdx: index('meter_readings_reading_date_idx').on(table.readingDate),
}));

// ==================== 付款表（收租與電費） ====================
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
  /** 帳單列類型：deposit=押金, rent=月租, electricity=電費（同房同月可多筆） */
  lineType: varchar('line_type', { length: 50 }).notNull().default('rent'),
  
  // 帳單期間
  paymentMonth: varchar('payment_month', { length: 7 }).notNull(), // 格式：YYYY-MM
  
  // 費用項目
  rentAmount: integer('rent_amount').notNull().default(0), // 租金（分）
  electricityFee: integer('electricity_fee').notNull().default(0), // 電費（分）
  managementFee: integer('management_fee').notNull().default(0), // 管理費（分）
  otherFees: integer('other_fees').notNull().default(0), // 其他費用（分）
  
  // 計算欄位（在應用層計算，非資料庫生成）
  totalAmount: integer('total_amount').notNull().default(0), // 總金額（分），在應用層計算：rent + electricity + management + other
  paidAmount: integer('paid_amount').notNull().default(0), // 已付金額（分）
  balance: integer('balance').notNull().default(0), // 餘額（分），在應用層計算：total - paid
  
  // 付款狀態
  paymentStatus: varchar('payment_status', { length: 50 }).notNull().default('pending'), // 'pending', 'partial', 'paid', 'overdue'
  paymentDate: timestamp('payment_date'), // 實際付款日期
  paymentMethod: varchar('payment_method', { length: 50 }), // 付款方式
  notes: text('notes'), // 備註
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  roomIdIdx: index('payments_room_id_idx').on(table.roomId),
  tenantIdIdx: index('payments_tenant_id_idx').on(table.tenantId),
  paymentMonthIdx: index('payments_payment_month_idx').on(table.paymentMonth),
  roomMonthLineUnique: uniqueIndex('payments_room_month_line_unique').on(
    table.roomId,
    table.paymentMonth,
    table.lineType,
  ),
  paymentStatusIdx: index('payments_payment_status_idx').on(table.paymentStatus),
  deletedAtIdx: index('payments_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 退租結算表 ====================
export const checkoutSettlements = pgTable('checkout_settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  
  // 退租資訊
  checkoutDate: timestamp('checkout_date').notNull(),
  daysStayed: integer('days_stayed').notNull(), // 實際入住天數
  dailyRent: integer('daily_rent').notNull(), // 日租金（分）
  
  // 應付項目
  rentDue: integer('rent_due').notNull().default(0), // 租金應付（分）
  electricityFee: integer('electricity_fee').notNull().default(0), // 電費應付（分）
  otherDeductions: integer('other_deductions').notNull().default(0), // 其他扣款（分）
  totalDue: integer('total_due').notNull().default(0), // 總應付（分）
  
  // 預付與押金
  prepaidAmount: integer('prepaid_amount').notNull().default(0), // 預付金額（分）
  depositAmount: integer('deposit_amount').notNull().default(0), // 押金金額（分）
  refundAmount: integer('refund_amount').notNull().default(0), // 應退金額（分）
  
  // 結算狀態
  settlementStatus: varchar('settlement_status', { length: 50 }).notNull().default('pending'), // 'pending', 'settled', 'disputed'
  notes: text('notes'), // 備註
  
  // 時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index('checkout_settlements_tenant_id_idx').on(table.tenantId),
  roomIdIdx: index('checkout_settlements_room_id_idx').on(table.roomId),
  checkoutDateIdx: index('checkout_settlements_checkout_date_idx').on(table.checkoutDate),
  settlementStatusIdx: index('checkout_settlements_settlement_status_idx').on(table.settlementStatus),
}));

// ==================== 支出表 ====================
export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }), // nullable
  
  // 支出類型
  type: varchar('type', { length: 50 }).notNull(), // 'fixed', 'capital'
  category: varchar('category', { length: 50 }).notNull(), // 'rent', 'utilities', 'renovation', 'equipment', 'deposit', 'other'
  amount: integer('amount').notNull(), // 金額（分）
  expenseDate: timestamp('expense_date').notNull(),
  description: text('description'),
  receiptUrl: text('receipt_url'), // 收據 URL
  
  // 定期支出
  recurring: boolean('recurring').notNull().default(false),
  recurringPeriod: varchar('recurring_period', { length: 50 }), // 'monthly', 'quarterly', 'yearly'
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  propertyIdIdx: index('expenses_property_id_idx').on(table.propertyId),
  roomIdIdx: index('expenses_room_id_idx').on(table.roomId),
  typeIdx: index('expenses_type_idx').on(table.type),
  categoryIdx: index('expenses_category_idx').on(table.category),
  expenseDateIdx: index('expenses_expense_date_idx').on(table.expenseDate),
  deletedAtIdx: index('expenses_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 補充收入表 ====================
export const extraIncomes = pgTable('extra_incomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  
  // 收入類型
  type: varchar('type', { length: 50 }).notNull(), // 'laundry', 'vending', 'other'
  amount: integer('amount').notNull(), // 金額（分）
  incomeDate: timestamp('income_date').notNull(),
  description: text('description'),
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  propertyIdIdx: index('extra_incomes_property_id_idx').on(table.propertyId),
  typeIdx: index('extra_incomes_type_idx').on(table.type),
  incomeDateIdx: index('extra_incomes_income_date_idx').on(table.incomeDate),
  deletedAtIdx: index('extra_incomes_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 維修表 ====================
export const maintenance = pgTable('maintenance', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'restrict' }), // nullable（公共區域維修）
  
  // 維修資訊
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled'
  priority: varchar('priority', { length: 50 }).notNull().default('medium'), // 'low', 'medium', 'high', 'urgent'
  estimatedCost: integer('estimated_cost').default(0), // 預估費用（分）
  actualCost: integer('actual_cost').default(0), // 實際費用（分）
  
  // 時間資訊
  reportedAt: timestamp('reported_at').notNull().defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  // 負責人
  assignedTo: uuid('assigned_to').references(() => users.id),
  reportedBy: uuid('reported_by').references(() => users.id),
  
  // 軟刪除與時間戳
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  propertyIdIdx: index('maintenance_property_id_idx').on(table.propertyId),
  roomIdIdx: index('maintenance_room_id_idx').on(table.roomId),
  statusIdx: index('maintenance_status_idx').on(table.status),
  priorityIdx: index('maintenance_priority_idx').on(table.priority),
  deletedAtIdx: index('maintenance_deleted_at_idx').on(table.deletedAt),
}));

// ==================== 新關聯定義 ====================
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  room: one(rooms, {
    fields: [tenants.roomId],
    references: [rooms.id],
  }),
  property: one(properties, {
    fields: [tenants.propertyId],
    references: [properties.id],
  }),
  deposits: many(deposits),
  payments: many(payments),
  checkoutSettlements: many(checkoutSettlements),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  tenant: one(tenants, {
    fields: [deposits.tenantId],
    references: [tenants.id],
  }),
  room: one(rooms, {
    fields: [deposits.roomId],
    references: [rooms.id],
  }),
}));

export const meterReadingsRelations = relations(meterReadings, ({ one }) => ({
  room: one(rooms, {
    fields: [meterReadings.roomId],
    references: [rooms.id],
  }),
  recordedByUser: one(users, {
    fields: [meterReadings.recordedBy],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  room: one(rooms, {
    fields: [payments.roomId],
    references: [rooms.id],
  }),
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
}));

export const checkoutSettlementsRelations = relations(checkoutSettlements, ({ one }) => ({
  tenant: one(tenants, {
    fields: [checkoutSettlements.tenantId],
    references: [tenants.id],
  }),
  room: one(rooms, {
    fields: [checkoutSettlements.roomId],
    references: [rooms.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  property: one(properties, {
    fields: [expenses.propertyId],
    references: [properties.id],
  }),
  room: one(rooms, {
    fields: [expenses.roomId],
    references: [rooms.id],
  }),
}));

export const extraIncomesRelations = relations(extraIncomes, ({ one }) => ({
  property: one(properties, {
    fields: [extraIncomes.propertyId],
    references: [properties.id],
  }),
}));

export const maintenanceRelations = relations(maintenance, ({ one }) => ({
  property: one(properties, {
    fields: [maintenance.propertyId],
    references: [properties.id],
  }),
  room: one(rooms, {
    fields: [maintenance.roomId],
    references: [rooms.id],
  }),
  assignedToUser: one(users, {
    fields: [maintenance.assignedTo],
    references: [users.id],
  }),
  reportedByUser: one(users, {
    fields: [maintenance.reportedBy],
    references: [users.id],
  }),
}));

// 匯出所有表
export const tables = {
  users,
  properties,
  propertyManagers,
  rooms,
  tenants,
  deposits,
  meterReadings,
  payments,
  checkoutSettlements,
  expenses,
  extraIncomes,
  maintenance,
};

// 匯出類型
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type PropertyManager = typeof propertyManagers.$inferSelect;
export type NewPropertyManager = typeof propertyManagers.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Deposit = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;
export type MeterReading = typeof meterReadings.$inferSelect;
export type NewMeterReading = typeof meterReadings.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type CheckoutSettlement = typeof checkoutSettlements.$inferSelect;
export type NewCheckoutSettlement = typeof checkoutSettlements.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExtraIncome = typeof extraIncomes.$inferSelect;
export type NewExtraIncome = typeof extraIncomes.$inferInsert;
export type Maintenance = typeof maintenance.$inferSelect;
export type NewMaintenance = typeof maintenance.$inferInsert;