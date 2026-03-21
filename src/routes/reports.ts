// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { payments, expenses, extraIncomes, rooms, properties } from '../db/schema.js';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

const router = Router();

// GET /api/reports/monthly?propertyId=xxx&month=2026-03
router.get('/monthly', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, month } = req.query;

 if (!propertyId || !month || typeof propertyId !== 'string' || typeof month !== 'string') {
 return res.status(400).json({
 success: false,
 message: '缺少必要參數：propertyId, month（格式 YYYY-MM）',
 timestamp: new Date().toISOString()
 });
 }

 // 取得該物業所有房間
 const propertyRooms = await db.select().from(rooms)
 .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)));

 const roomIds = propertyRooms.map(r => r.id);

 // 收入：租金 + 電費
 const monthPayments = await db.select().from(payments)
 .where(and(
 eq(payments.paymentMonth, month),
 isNull(payments.deletedAt)
 ));

 const propertyPayments = monthPayments.filter(p => roomIds.includes(p.roomId));

 const totalRentIncome = propertyPayments.reduce((sum, p) => sum + p.rentAmount, 0);
 const totalElectricityIncome = propertyPayments.reduce((sum, p) => sum + p.electricityFee, 0);
 const totalPaid = propertyPayments.reduce((sum, p) => sum + p.paidAmount, 0);

 // 收入：補充收入（洗衣機等）
 const monthStart = new Date(`${month}-01`);
 const monthEnd = new Date(monthStart);
 monthEnd.setMonth(monthEnd.getMonth() + 1);

 const monthIncomes = await db.select().from(extraIncomes)
 .where(and(
 eq(extraIncomes.propertyId, propertyId),
 isNull(extraIncomes.deletedAt),
 gte(extraIncomes.incomeDate, monthStart),
 lte(extraIncomes.incomeDate, monthEnd)
 ));

 const totalExtraIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0);

 // 支出
 const monthExpenses = await db.select({
   id: expenses.id,
   propertyId: expenses.propertyId,
   roomId: expenses.roomId,
   type: expenses.type,
   category: expenses.category,
   amount: expenses.amount,
   expenseDate: expenses.expenseDate,
   description: expenses.description,
   receiptUrl: expenses.receiptUrl,
   recurring: expenses.recurring,
   recurringPeriod: expenses.recurringPeriod,
   createdAt: expenses.createdAt,
   updatedAt: expenses.updatedAt,
   deletedAt: expenses.deletedAt,
 }).from(expenses)
 .where(and(
 eq(expenses.propertyId, propertyId),
 isNull(expenses.deletedAt),
 gte(expenses.expenseDate, monthStart),
 lte(expenses.expenseDate, monthEnd)
 ));

 const totalFixedExpense = monthExpenses
 .filter(e => e.type === 'fixed')
 .reduce((sum, e) => sum + e.amount, 0);

 const totalCapitalExpense = monthExpenses
 .filter(e => e.type === 'capital')
 .reduce((sum, e) => sum + e.amount, 0);

 // 計算淨利
 const totalIncome = totalRentIncome + totalElectricityIncome + totalExtraIncome;
 const totalExpense = totalFixedExpense + totalCapitalExpense;
 const netProfit = totalIncome - totalExpense;

 return res.json({
 success: true,
 data: {
 propertyId,
 month,
 income: {
 rent: totalRentIncome,
 electricity: totalElectricityIncome,
 extra: totalExtraIncome,
 total: totalIncome,
 collected: totalPaid,
 },
 expense: {
 fixed: totalFixedExpense,
 capital: totalCapitalExpense,
 total: totalExpense,
 breakdown: monthExpenses.map(e => ({
 category: e.category,
 amount: e.amount,
 description: e.description,
 })),
 },
 netProfit,
 rooms: {
 total: propertyRooms.length,
 occupied: propertyRooms.filter(r => r.status === 'occupied').length,
 vacant: propertyRooms.filter(r => r.status === 'vacant').length,
 occupancyRate: propertyRooms.length > 0
 ? Math.round((propertyRooms.filter(r => r.status === 'occupied').length / propertyRooms.length) * 100)
 : 0,
 },
 },
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// GET /api/reports/summary - 所有物業總覽
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { month } = req.query;
 const targetMonth = (typeof month === 'string' ? month : null) ||
 `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

 // 取得所有物業
 const allProperties = await db.select().from(properties)
 .where(isNull(properties.deletedAt));

 const allRooms = await db.select().from(rooms)
 .where(isNull(rooms.deletedAt));

 // 取得該月所有收支
 const allPayments = await db.select().from(payments)
 .where(and(
 eq(payments.paymentMonth, targetMonth),
 isNull(payments.deletedAt)
 ));

 const monthStart = new Date(`${targetMonth}-01`);
 const monthEnd = new Date(monthStart);
 monthEnd.setMonth(monthEnd.getMonth() + 1);

 const allExpenses = await db.select({
   id: expenses.id,
   propertyId: expenses.propertyId,
   roomId: expenses.roomId,
   type: expenses.type,
   category: expenses.category,
   amount: expenses.amount,
   expenseDate: expenses.expenseDate,
   description: expenses.description,
   receiptUrl: expenses.receiptUrl,
   recurring: expenses.recurring,
   recurringPeriod: expenses.recurringPeriod,
   createdAt: expenses.createdAt,
   updatedAt: expenses.updatedAt,
   deletedAt: expenses.deletedAt,
 }).from(expenses)
 .where(and(
 isNull(expenses.deletedAt),
 gte(expenses.expenseDate, monthStart),
 lte(expenses.expenseDate, monthEnd)
 ));

 const allIncomes = await db.select().from(extraIncomes)
 .where(and(
 isNull(extraIncomes.deletedAt),
 gte(extraIncomes.incomeDate, monthStart),
 lte(extraIncomes.incomeDate, monthEnd)
 ));

 // 彙總
 const totalIncome = allPayments.reduce((sum, p) => sum + p.paidAmount, 0)
 + allIncomes.reduce((sum, i) => sum + i.amount, 0);
 const totalExpense = allExpenses.reduce((sum, e) => sum + e.amount, 0);

 return res.json({
 success: true,
 data: {
 month: targetMonth,
 totalProperties: allProperties.length,
 totalRooms: allRooms.length,
 occupiedRooms: allRooms.filter(r => r.status === 'occupied').length,
 vacantRooms: allRooms.filter(r => r.status === 'vacant').length,
 totalIncome,
 totalExpense,
 netProfit: totalIncome - totalExpense,
 properties: allProperties.map(p => {
 const pRooms = allRooms.filter(r => r.propertyId === p.id);
 const pPayments = allPayments.filter(pay =>
 pRooms.some(r => r.id === pay.roomId)
 );
 const pExpenses = allExpenses.filter(e => e.propertyId === p.id);
 const pIncomes = allIncomes.filter(i => i.propertyId === p.id);

 const income = pPayments.reduce((s, pay) => s + pay.paidAmount, 0)
 + pIncomes.reduce((s, i) => s + i.amount, 0);
 const expense = pExpenses.reduce((s, e) => s + e.amount, 0);

 return {
 id: p.id,
 name: p.name,
 rooms: pRooms.length,
 occupied: pRooms.filter(r => r.status === 'occupied').length,
 income,
 expense,
 netProfit: income - expense,
 };
 }),
 },
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;