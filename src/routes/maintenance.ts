// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { maintenance } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/maintenance - 取得維修紀錄
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { propertyId, roomId, status } = req.query;

 const allMaintenance = await db.select().from(maintenance)
 .where(isNull(maintenance.deletedAt))
 .orderBy(desc(maintenance.createdAt));

 let filtered = allMaintenance;
 if (propertyId && typeof propertyId === 'string') {
 filtered = filtered.filter(m => m.propertyId === propertyId);
 }
 if (roomId && typeof roomId === 'string') {
 filtered = filtered.filter(m => m.roomId === roomId);
 }
 if (status && typeof status === 'string') {
 filtered = filtered.filter(m => m.status === status);
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

// POST /api/maintenance - 新增維修紀錄
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const {
 propertyId, roomId, title, description, category,
 priority, scheduledDate, costEstimate, assignedTo
 } = req.body;

 if (!propertyId || !title || !category) {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位：propertyId, title, category',
 timestamp: new Date().toISOString()
 });
 }

 const [newRecord] = await db.insert(maintenance).values({
 propertyId,
 roomId: roomId || null,
 title,
 description: description || null,
 category, // 'plumbing', 'electrical', 'furniture', 'appliance', 'other'
 status: 'pending',
 priority: priority || 'normal',
 reportedDate: new Date(),
 scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
 costEstimate: costEstimate || null,
 assignedTo: assignedTo || null,
 }).returning();

 return res.json({
 success: true,
 data: newRecord,
 message: '維修紀錄新增成功',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// PATCH /api/maintenance/:id/status - 更新維修狀態
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;
 const { status, actualCost, completedDate } = req.body;

 // @ts-ignore - Drizzle 類型問題
 const updateData: Record<string, unknown> = { status };

 if (status === 'completed') {
 updateData.completedDate = completedDate ? new Date(completedDate) : new Date();
 if (actualCost !== undefined) {
 updateData.actualCost = actualCost;
 }
 }

 const [updated] = await db.update(maintenance)
 .set(updateData)
 .where(and(eq(maintenance.id, id), isNull(maintenance.deletedAt)))
 .returning();

 if (!updated) {
 return res.status(404).json({
 success: false,
 message: '維修紀錄不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: updated,
 message: `維修狀態更新為 ${status}`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// DELETE /api/maintenance/:id - 軟刪除
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { id } = req.params;

 const [deleted] = await db.update(maintenance)
 .set({ deletedAt: new Date() })
 .where(and(eq(maintenance.id, id), isNull(maintenance.deletedAt)))
 .returning();

 if (!deleted) {
 return res.status(404).json({
 success: false,
 message: '維修紀錄不存在',
 timestamp: new Date().toISOString()
 });
 }

 return res.json({
 success: true,
 data: deleted,
 message: '維修紀錄已刪除',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;