import { db, schema } from './index.js';
import { hashPassword } from '../utils/password.js';

// 清除現有資料（軟刪除標記）
async function clearExistingData() {
  console.log('🧹 清除現有資料...');

  // 注意：這裡使用直接 SQL 來清除資料，因為這是種子腳本
  // 在實際應用中，應該使用軟刪除
  const tables = [
    'property_managers',
    'rooms',
    'properties',
    'users',
  ];

  for (const table of tables) {
    await db.execute(`DELETE FROM ${table} WHERE 1=1`);
    console.log(`   - 已清除 ${table} 表`);
  }

  console.log('✅ 資料清除完成');
}

// 建立超級管理員
async function createSuperAdmin() {
  console.log('👑 建立超級管理員...');

  const password = 'Admin123!';
  const passwordHash = await hashPassword(password);

  // @ts-ignore - Drizzle 類型問題
  const [admin] = await db.insert(schema.users).values({
    email: 'admin@rental.com',
    passwordHash,
    fullName: '系統管理員',
    phone: '0912345678',
    role: 'super_admin',
    isActive: true,
  }).returning();

  console.log(`   - 帳號: ${admin.email}`);
  console.log(`   - 密碼: ${password}`);
  console.log(`   - 角色: ${admin.role}`);

  return admin;
}

// 建立測試物業
async function createTestProperty(adminId: string) {
  console.log('🏢 建立測試物業...');

  // @ts-ignore - Drizzle 類型問題
  const [property] = await db.insert(schema.properties).values({
    name: '台北市信義區測試大樓',
    address: '台北市信義區忠孝東路五段123號',
    totalFloors: 5,
    totalRooms: 20,
    landlordName: '王大房東',
    landlordPhone: '0922333444',
    landlordDeposit: 500000, // 50萬押金
    landlordMonthlyRent: 150000, // 15萬月租
    prepayCycleMonths: 2,
    contractStartDate: new Date('2026-01-01'),
    contractEndDate: new Date('2027-12-31'),
    createdBy: adminId,
  }).returning();

  console.log(`   - 名稱: ${property.name}`);
  console.log(`   - 地址: ${property.address}`);
  console.log(`   - 房東: ${property.landlordName}`);

  return property;
}

// 建立物業管理員關聯
async function createPropertyManager(propertyId: string, userId: string) {
  console.log('👥 建立物業管理員關聯...');

  await db.insert(schema.propertyManagers).values({
    propertyId,
    userId,
  });

  console.log('   - 管理員關聯建立完成');
}

// 建立測試房間
async function createTestRooms(propertyId: string) {
  console.log('🚪 建立測試房間...');

  const rooms = [
    // 1樓房間
    {
      roomNumber: '101',
      floor: 1,
      monthlyRent: 5000,
      depositAmount: 10000,
      electricityRate: 350, // 3.5元/度
      status: 'vacant' as const,
    },
    {
      roomNumber: '102',
      floor: 1,
      monthlyRent: 5500,
      depositAmount: 11000,
      electricityRate: 350,
      status: 'occupied' as const,
    },
    // 2樓房間
    {
      roomNumber: '201',
      floor: 2,
      monthlyRent: 6000,
      depositAmount: 12000,
      electricityRate: 350,
      status: 'vacant' as const,
    },
    {
      roomNumber: '202',
      floor: 2,
      monthlyRent: 6500,
      depositAmount: 13000,
      electricityRate: 350,
      status: 'reserved' as const,
    },
    // 3樓房間
    {
      roomNumber: '301',
      floor: 3,
      monthlyRent: 7000,
      depositAmount: 14000,
      electricityRate: 350,
      status: 'maintenance' as const,
    },
    {
      roomNumber: '302',
      floor: 3,
      monthlyRent: 7500,
      depositAmount: 15000,
      electricityRate: 350,
      status: 'vacant' as const,
    },
    // 4樓房間
    {
      roomNumber: '401',
      floor: 4,
      monthlyRent: 8000,
      depositAmount: 16000,
      electricityRate: 350,
      status: 'occupied' as const,
    },
    // 5樓房間
    {
      roomNumber: '501',
      floor: 5,
      monthlyRent: 8500,
      depositAmount: 17000,
      electricityRate: 350,
      status: 'vacant' as const,
    },
  ];

  const createdRooms = [];
  for (const roomData of rooms) {
    const [room] = await db.insert(schema.rooms).values({
      propertyId,
      ...roomData,
    }).returning();

    createdRooms.push(room);
    console.log(`   - ${room.roomNumber}: ${room.monthlyRent}元, 狀態: ${room.status}`);
  }

  console.log(`✅ 共建立 ${createdRooms.length} 間房間`);

  return createdRooms;
}

// 驗證資料
async function verifyData() {
  console.log('🔍 驗證種子資料...');

  const userCount = await db.$count(schema.users);
  const propertyCount = await db.$count(schema.properties);
  const managerCount = await db.$count(schema.propertyManagers);
  const roomCount = await db.$count(schema.rooms);

  console.log(`   - 使用者: ${userCount} 人`);
  console.log(`   - 物業: ${propertyCount} 棟`);
  console.log(`   - 管理員關聯: ${managerCount} 個`);
  console.log(`   - 房間: ${roomCount} 間`);

  return {
    userCount,
    propertyCount,
    managerCount,
    roomCount,
  };
}

// 主函數
async function main() {
  console.log(`
🌱 開始執行資料庫種子腳本
========================================
  `);

  try {
    // 1. 清除現有資料
    await clearExistingData();

    // 2. 建立超級管理員
    const admin = await createSuperAdmin();

    // 3. 建立測試物業
    const property = await createTestProperty(admin.id);

    // 4. 建立管理員關聯
    await createPropertyManager(property.id, admin.id);

    // 5. 建立測試房間
    await createTestRooms(property.id);

    // 6. 驗證資料
    const counts = await verifyData();

    console.log(`
========================================
🎉 種子資料建立完成！

📊 建立結果：
   • 超級管理員: 1 人
   • 測試物業: 1 棟
   • 房間數量: ${counts.roomCount} 間
   • 管理員關聯: ${counts.managerCount} 個

🔑 登入資訊：
   網址: http://localhost:3000
   帳號: admin@rental.com
   密碼: Admin123!

⚠️  注意事項：
   1. 此為測試資料，請勿在生產環境使用相同密碼
   2. 首次使用請立即修改密碼
   3. 可以建立更多測試資料以驗證功能

========================================
    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ 種子資料建立失敗:', error);
    process.exit(1);
  }
}

// 執行主函數
main();