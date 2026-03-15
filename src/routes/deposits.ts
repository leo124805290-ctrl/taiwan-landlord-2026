// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { deposits } from '../db/schema.js';
import { isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/deposits?tenantId=xxx - 取得押金紀錄
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { tenantId, roomId } = req.query;

 const allDeposits = await db.select().from(deposits)
 .where(isNull(deposits.deletedAt))
 .orderBy(desc(deposits.createdAt));

 let filtered = allDeposits;
 if (tenantId && typeof tenantId === 'string') {
 filtered = filtered.filter(d => d.tenantId === tenantId);
 }
 if (roomId && typeof roomId === 'string') {
 filtered = filtered.filter(d => d.roomId === roomId);
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

// POST /api/deposits - 新增押金紀錄
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { tenantId, roomId, amount, type, description } = req.body;

 if (!roomId || !amount || !type) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位：roomId, amount, type',
 timestamp: new Date().toISOString()
 });
 }

 const [newDeposit] = await db.insert(deposits).values({
// @ts-ignore
 tenantId: tenantId || null,
 roomId,
 amount,
 type, // '收取', '退還', '扣款'
 description: description || null,
 depositDate: new Date(),
 }).returning();

 return res.json({
 success: true,
 data: newDeposit,
 message: `押金${type}成功`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;