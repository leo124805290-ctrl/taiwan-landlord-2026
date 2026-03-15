// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { extraIncomes } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/incomes - 取得補充收入列表
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, type } = req.query;

 const allIncomes = await db.select().from(extraIncomes)
 .where(isNull(extraIncomes.deletedAt))
 .orderBy(desc(extraIncomes.createdAt));

 let filtered = allIncomes;
 if (propertyId && typeof propertyId === 'string') {
 filtered = filtered.filter(i => i.propertyId === propertyId);
 }
 if (type && typeof type === 'string') {
 filtered = filtered.filter(i => i.type === type);
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

// POST /api/incomes - 新增補充收入
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, type, amount, incomeDate, description } = req.body;

 if (!propertyId || !type || !amount || !incomeDate) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位',
 timestamp: new Date().toISOString()
 });
 }

 const [newIncome] = await db.insert(extraIncomes).values({
 propertyId,
 type, // 'laundry', 'vending', 'other'
 amount,
 incomeDate: new Date(incomeDate),
 description: description || null,
 }).returning();

 return res.json({
 success: true,
 data: newIncome,
 message: '收入紀錄新增成功',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// DELETE /api/incomes/:id - 軟刪除
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;

 const [deleted] = await db.update(extraIncomes)
 .set({ deletedAt: new Date() })
 .where(and(eq(extraIncomes.id, id), isNull(extraIncomes.deletedAt)))
 .returning();

 if (!deleted) {
 return res.status(404).json({
 success: false,
 message: '收入紀錄不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: deleted,
 message: '收入紀錄已刪除',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;