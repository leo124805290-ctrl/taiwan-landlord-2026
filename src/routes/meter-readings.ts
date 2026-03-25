// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { meterReadings, rooms } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';

const router = Router();

// POST /api/meter-readings - 記錄電錶讀數
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { roomId, readingValue, readingDate } = req.body;

 if (!roomId || readingValue === undefined || readingValue === null || readingDate === undefined || readingDate === null || readingDate === '') {
 return res.status(400).json({
 success: false,
 message: '缺少必要欄位：roomId, readingValue, readingDate',
 timestamp: new Date().toISOString()
 });
 }

 // 取得房間資訊（電費單價）
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

 // 取得上次電錶讀數
 const lastReading = await db.select().from(meterReadings)
 .where(eq(meterReadings.roomId, roomId))
 .orderBy(desc(meterReadings.readingDate))
 .limit(1);

 const previousReading = lastReading.length > 0 ? lastReading[0].readingValue : 0;
 const usage = readingValue - previousReading;
 const electricityRate = room[0].electricityRate / 100; // 從分轉元
 const electricityFee = Math.round(usage * electricityRate * 100); // 轉回分

 // 寫入電錶讀數
 const [newReading] = await db.insert(meterReadings).values({
 roomId,
 readingValue,
 readingDate: new Date(readingDate),
 }).returning();

 return res.json({
 success: true,
 data: {
 reading: newReading,
 previousReading,
 usage,
 electricityRate: room[0].electricityRate,
 electricityFee,
 },
 message: '電錶讀數記錄成功',
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// GET /api/meter-readings?roomId=xxx - 取得某房間的電錶歷史
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { roomId } = req.query;

 if (!roomId || typeof roomId !== 'string') {
 return res.status(400).json({
 success: false,
 message: '缺少 roomId 參數',
 timestamp: new Date().toISOString()
 });
 }

 const readings = await db.select().from(meterReadings)
 .where(eq(meterReadings.roomId, roomId))
 .orderBy(desc(meterReadings.readingDate));

 return res.json({
 success: true,
 data: readings,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

// POST /api/meter-readings/batch - 批次抄錶（一次記錄多間房間）
router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
 try {
 const { readings } = req.body;
 // readings: [{ roomId, readingValue, readingDate }]

 if (!Array.isArray(readings) || readings.length === 0) {
 return res.status(400).json({
 success: false,
 message: '請提供至少一筆電錶讀數',
 timestamp: new Date().toISOString()
 });
 }

 const results = [];

 for (const reading of readings) {
 const { roomId, readingValue, readingDate } = reading;

 // 取得上次讀數
 const lastReading = await db.select().from(meterReadings)
 .where(eq(meterReadings.roomId, roomId))
 .orderBy(desc(meterReadings.readingDate))
 .limit(1);

 const previousReading = lastReading.length > 0 ? lastReading[0].readingValue : 0;

 // 寫入
 const [newReading] = await db.insert(meterReadings).values({
 roomId,
 readingValue,
 readingDate: new Date(readingDate),
 }).returning();

 results.push({
 reading: newReading,
 previousReading,
 usage: readingValue - previousReading,
 });
 }

 return res.json({
 success: true,
 data: results,
 message: `成功記錄 ${results.length} 筆電錶讀數`,
 timestamp: new Date().toISOString()
 });
 } catch (error) {
 next(error);
 }
});

export default router;