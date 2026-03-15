// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db, queryClient } from '../db/index.js';
import { checkoutSettlements, tenants, rooms, deposits, payments, meterReadings } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// POST /api/checkout/complete - 退租結算
router.post('/complete', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { tenantId, roomId, checkoutDate, otherDeductions = 0, notes } = req.body;

 if (!tenantId || !roomId || !checkoutDate) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位：tenantId, roomId, checkoutDate',
 timestamp: new Date().toISOString()
 });
 }

 // 用 transaction 確保一致性
 const result = await queryClient.begin(async (sql) => {
 // 1. 取得租客資訊
 const tenantResult = await db.select().from(tenants)
 .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
 .limit(1);

 if (tenantResult.length === 0) {
 throw new Error('租客不存在');
 }
 const tenant = tenantResult[0];

 // 2. 取得房間資訊
 const roomResult = await db.select().from(rooms)
 .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
 .limit(1);

 if (roomResult.length === 0) {
 throw new Error('房間不存在');
 }
 const room = roomResult[0];

 // 3. 計算入住天數
 const checkIn = new Date(tenant.checkInDate);
 const checkOut = new Date(checkoutDate);
 const daysStayed = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

 // 4. 計算日租金
 const dailyRent = Math.round(room.monthlyRent / 30);

 // 5. 計算應付租金
 const rentDue = dailyRent * daysStayed;

 // 6. 計算電費（最後兩筆電錶差）
 const recentReadings = await db.select().from(meterReadings)
 .where(eq(meterReadings.roomId, roomId))
 .orderBy(desc(meterReadings.readingDate))
 .limit(2);

 let electricityFee = 0;
 if (recentReadings.length >= 2) {
 const usage = recentReadings[0].readingValue - recentReadings[1].readingValue;
 electricityFee = Math.round(usage * (room.electricityRate / 100) * 100);
 }

 // 7. 計算總應付
 const totalDue = rentDue + electricityFee + otherDeductions;

 // 8. 取得已繳租金（預付金額）
 const allPayments = await db.select().from(payments)
 .where(and(
 eq(payments.roomId, roomId),
 eq(payments.tenantId, tenantId),
 isNull(payments.deletedAt)
 ));
 const prepaidAmount = allPayments.reduce((sum, p) => sum + p.paidAmount, 0);

 // 9. 取得押金
 const allDeposits = await db.select().from(deposits)
 .where(and(
 eq(deposits.tenantId, tenantId),
 eq(deposits.type, '收取'),
 isNull(deposits.deletedAt)
 ));
 const depositAmount = allDeposits.reduce((sum, d) => sum + d.amount, 0);

 // 10. 計算退還金額
 // 退還 = 預付餘額 + 押金 - 總應付
 const refundAmount = (prepaidAmount - totalDue) + depositAmount;

 // 11. 建立結算單
 const [settlement] = await db.insert(checkoutSettlements).values({
 tenantId,
 roomId,
 checkoutDate: checkOut,
 daysStayed,
 dailyRent,
 rentDue,
 electricityFee,
 otherDeductions,
 totalDue,
 prepaidAmount,
 depositAmount,
 refundAmount: Math.max(0, refundAmount),
 settlementStatus: 'settled',
 notes: notes || null,
 }).returning();

 // 12. 更新租客狀態
 await db.update(tenants)
 .set({
 status: 'checked_out',
 actualCheckoutDate: checkOut,
 })
 .where(eq(tenants.id, tenantId));

 // 13. 更新房間狀態
 await db.update(rooms)
 .set({ status: 'vacant' })
 .where(eq(rooms.id, roomId));

 // 14. 記錄押金退還
 if (refundAmount > 0) {
 await db.insert(deposits).values({
 tenantId,
 roomId,
 amount: Math.min(depositAmount, Math.max(0, refundAmount)),
 type: '退還',
 description: `退租結算退還押金`,
 depositDate: checkOut,
 });
 }

 return settlement;
 });

 return res.json({
 success: true,
 data: result,
 message: '退租結算完成',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// GET /api/checkout/settlements - 取得結算紀錄
router.get('/settlements', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const settlements = await db.select().from(checkoutSettlements)
 .orderBy(desc(checkoutSettlements.createdAt));

 return res.json({
 success: true,
 data: settlements,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// GET /api/checkout/settlements/:id - 取得單一結算單
router.get('/settlements/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;

 const result = await db.select().from(checkoutSettlements)
 .where(eq(checkoutSettlements.id, id))
 .limit(1);

 if (result.length === 0) {
 return res.status(404).json({
 success: false,
 message: '結算單不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: result[0],
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;