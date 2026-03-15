// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { payments, rooms, meterReadings } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/payments - 取得帳單列表
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { roomId, tenantId, month, status, propertyId: _propertyId } = req.query;

 let query = db.select().from(payments).where(isNull(payments.deletedAt));

 // 篩選條件需要在應用層處理
 const allPayments = await query.orderBy(desc(payments.createdAt));

 // 在應用層篩選
 let filtered = allPayments;
 if (roomId && typeof roomId === 'string') {
 filtered = filtered.filter(p => p.roomId === roomId);
 }
 if (tenantId && typeof tenantId === 'string') {
 filtered = filtered.filter(p => p.tenantId === tenantId);
 }
 if (month && typeof month === 'string') {
 filtered = filtered.filter(p => p.paymentMonth === month);
 }
 if (status && typeof status === 'string') {
 filtered = filtered.filter(p => p.paymentStatus === status);
 }

 return res.json({
 success: true,
 data: filtered,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// POST /api/payments/generate - 生成月帳單
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { roomId, tenantId, paymentMonth } = req.body;

 if (!roomId || !paymentMonth) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位：roomId, paymentMonth',
 timestamp: new Date().toISOString()
 });
 }

 // 檢查是否已有該月帳單（唯一約束）
 const existing = await db.select().from(payments)
 .where(and(
 eq(payments.roomId, roomId),
 eq(payments.paymentMonth, paymentMonth),
 isNull(payments.deletedAt)
 ))
 .limit(1);

 if (existing.length > 0) {
 return res.status(409).json({
 success: false,
 message: `${paymentMonth} 的帳單已存在`,
 data: existing[0],
 timestamp: new Date().toISOString()
 });
 }

 // 取得房間資訊
 const room = await db.select().from(rooms)
 .where(and(eq(rooms.id, roomId), isNull(rooms.deletedAt)))
 .limit(1);

 if (room.length === 0) {
 return res.status(404).json({
 success: false,
 message: '房間不存在',
 timestamp: new Date().toISOString()
 });
 }

 // 計算電費
 const recentReadings = await db.select().from(meterReadings)
 .where(eq(meterReadings.roomId, roomId))
 .orderBy(desc(meterReadings.readingDate))
 .limit(2);

 let electricityFee = 0;
 if (recentReadings.length >= 2) {
 const usage = recentReadings[0].readingValue - recentReadings[1].readingValue;
 electricityFee = Math.round(usage * (room[0].electricityRate / 100) * 100);
 }

 const rentAmount = room[0].monthlyRent;
 const totalAmount = rentAmount + electricityFee;

 // 建立帳單
// @ts-ignore
 const [newPayment] = await db.insert(payments).values({
 roomId,
 tenantId: tenantId || null,
 paymentMonth,
 rentAmount,
 electricityFee,
 managementFee: 0,
 otherFees: 0,
 totalAmount,
 paidAmount: 0,
 balance: totalAmount,
 paymentStatus: 'pending',
 }).returning();

 return res.json({
 success: true,
 data: newPayment,
 message: `${paymentMonth} 帳單建立成功`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// PATCH /api/payments/:id/pay - 繳費（支援部分繳費）
router.patch('/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;
 const { amount, paymentMethod, notes } = req.body;

 if (!amount || amount <= 0) {
 return res.status(400).json({
 success: false,
 message: '請提供有效的繳費金額',
 timestamp: new Date().toISOString()
 });
 }

 // 取得帳單
 const existing = await db.select().from(payments)
 .where(and(eq(payments.id, id), isNull(payments.deletedAt)))
 .limit(1);

 if (existing.length === 0) {
 return res.status(404).json({
 success: false,
 message: '帳單不存在',
 timestamp: new Date().toISOString()
 });
 }

 const payment = existing[0];
 const newPaidAmount = payment.paidAmount + amount;
 const newBalance = payment.totalAmount - newPaidAmount;

 // 判斷繳費狀態
 let newStatus: string;
 if (newBalance <= 0) {
 newStatus = 'paid';
 } else if (newPaidAmount > 0) {
 newStatus = 'partial';
 } else {
 newStatus = 'pending';
 }

 // 更新帳單
// @ts-ignore
 const [updated] = await db.update(payments)
// @ts-ignore
 .set({
 paidAmount: newPaidAmount,
 balance: Math.max(0, newBalance),
 paymentStatus: newStatus,
 paymentDate: new Date(),
 paymentMethod: paymentMethod || payment.paymentMethod,
 notes: notes || payment.notes,
 })
 .where(eq(payments.id, id))
 .returning();

 return res.json({
 success: true,
 data: updated,
 message: newStatus === 'paid' ? '已繳清' : `已繳 ${amount}，餘額 ${Math.max(0, newBalance)}`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// GET /api/payments/:id - 取得單一帳單
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;

 const result = await db.select().from(payments)
 .where(and(eq(payments.id, id), isNull(payments.deletedAt)))
 .limit(1);

 if (result.length === 0) {
 return res.status(404).json({
 success: false,
 message: '帳單不存在',
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