// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { expenses } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/expenses - 取得支出列表
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, type, category } = req.query;

 // 明確選擇欄位
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
 .where(isNull(expenses.deletedAt))
 .orderBy(desc(expenses.createdAt));

 let filtered = allExpenses;
 if (propertyId && typeof propertyId === 'string') {
 filtered = filtered.filter(e => e.propertyId === propertyId);
 }
 if (type && typeof type === 'string') {
 filtered = filtered.filter(e => e.type === type);
 }
 if (category && typeof category === 'string') {
 filtered = filtered.filter(e => e.category === category);
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

// POST /api/expenses - 新增支出
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, roomId, type, category, amount, expenseDate, description, recurring, recurringPeriod } = req.body;

 if (!propertyId || !type || !category || !amount || !expenseDate) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位',
 timestamp: new Date().toISOString()
 });
 }

 const [newExpense] = await db.insert(expenses).values({
 propertyId,
 roomId: roomId || null,
 type, // 'fixed' 或 'capital'
 category, // 'rent', 'utilities', 'renovation', 'equipment', 'deposit', 'other'
 amount,
 expenseDate: new Date(expenseDate),
 description: description || null,
 recurring: recurring || false,
 recurringPeriod: recurringPeriod || null,
 }).returning({
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
 });

 return res.json({
 success: true,
 data: newExpense,
 message: '支出紀錄新增成功',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// PUT /api/expenses/:id - 編輯支出
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;
 const updateData = req.body;

 const [updated] = await db.update(expenses)
 .set(updateData)
 .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
 .returning({
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
 });

 if (!updated) {
 return res.status(404).json({
 success: false,
 message: '支出紀錄不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: updated,
 message: '支出紀錄更新成功',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// DELETE /api/expenses/:id - 軟刪除
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;

 const [deleted] = await db.update(expenses)
 .set({ deletedAt: new Date() })
 .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
 .returning({
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
 });

 if (!deleted) {
 return res.status(404).json({
 success: false,
 message: '支出紀錄不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: deleted,
 message: '支出紀錄已刪除',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;