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

export const roomsRelations = relations(rooms, ({ one }) => ({
  property: one(properties, {
    fields: [rooms.propertyId],
    references: [properties.id],
  }),
}));

// 匯出所有表
export const tables = {
  users,
  properties,
  propertyManagers,
  rooms,
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