'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Zap, Home, Battery, Calculator, SaveAll, RefreshCw } from 'lucide-react';
import { formatCents, formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';
import { api } from '@/lib/api-client';

interface RoomMeter {
  id: string;
  roomNumber: string;
  propertyName: string;
  electricityRate: number; // 每度電單價（分）
  lastReading: number;
  lastReadingDate: string;
  currentReading: string;
  usage: number;
  electricityFee: number;
  status: 'pending' | 'recorded' | 'overdue';
}

export default function MeterReadingsPage() {
  const [rooms, setRooms] = useState<RoomMeter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [allowedPropertyNames, setAllowedPropertyNames] = useState<Set<string>>(
    new Set(),
  );
  const [readingDate, setReadingDate] = useState<string>(
    new Date().toISOString().split('T')[0] ?? ''
  );
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchNotes, setBatchNotes] = useState<string>('');

  // 載入房間電錶資料
  useEffect(() => {
    loadMeterData();
  }, []);

  const loadMeterData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [properties, roomList] = await Promise.all([
        api.get<Array<{ id: string; name: string }>>('/api/properties'),
        api.get<
          Array<{
            id: string;
            propertyId: string;
            roomNumber: string;
            floor: number;
            electricityRate: number;
          }>
        >('/api/rooms'),
      ]);

      setAllowedPropertyNames(new Set(properties.map((p) => String(p.name))));
      const nameById = new Map(properties.map((p) => [p.id, p.name] as const));

      const withReadings = await Promise.all(
        roomList.map(async (room) => {
          try {
            const list = await api.get<
              Array<{ readingValue: number; readingDate: string }>
            >(`/api/meter-readings?roomId=${encodeURIComponent(room.id)}`);
            const latest = list[0];
            return { room, latest };
          } catch {
            return { room, latest: undefined };
          }
        }),
      );

      const next: RoomMeter[] = withReadings.map(({ room, latest }) => {
        const propertyName = nameById.get(room.propertyId) ?? '未知物業';
        const lastReading = latest?.readingValue ?? 0;
        const lastReadingDate = latest?.readingDate
          ? String(latest.readingDate).split('T')[0] ?? ''
          : new Date().toISOString().split('T')[0] ?? '';
        return {
          id: room.id,
          roomNumber: room.roomNumber,
          propertyName,
          electricityRate: room.electricityRate,
          lastReading,
          lastReadingDate,
          currentReading: '',
          usage: 0,
          electricityFee: 0,
          status: 'pending' as const,
        };
      });

      setRooms(next);
    } catch (error) {
      setError('載入電錶資料失敗');
      console.error('載入電錶錯誤:', error);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 篩選後的房間
  const filteredRooms = rooms.filter(room => {
    // archived 物業房間不應出現在可操作列表
    if (allowedPropertyNames.size > 0 && !allowedPropertyNames.has(room.propertyName)) {
      return false;
    }
    if (selectedProperty !== 'all' && room.propertyName !== selectedProperty) return false;
    return true;
  });

  // 計算統計
  const totalPending = filteredRooms.filter(r => r.status === 'pending').length;
  const totalRecorded = filteredRooms.filter(r => r.status === 'recorded').length;
  const totalUsage = filteredRooms.reduce((sum, r) => sum + r.usage, 0);
  const totalElectricityFee = filteredRooms.reduce((sum, r) => sum + r.electricityFee, 0);

  // 更新電錶讀數
  const handleReadingChange = (roomId: string, value: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const currentValue = parseFloat(value) || 0;
    const usage = currentValue - room.lastReading;
    const electricityFee = Math.max(0, usage) * (room.electricityRate / 100);

    setRooms(prev => prev.map(r => {
      if (r.id === roomId) {
        return {
          ...r,
          currentReading: value,
          usage: Math.max(0, usage),
          electricityFee,
          status: value ? 'recorded' : 'pending'
        };
      }
      return r;
    }));
  };

  // 批次儲存
  const handleBatchSave = () => {
    const roomsToSave = filteredRooms.filter(r => r.currentReading);
    
    if (roomsToSave.length === 0) {
      alert('請先輸入至少一筆電錶讀數');
      return;
    }

    setShowBatchDialog(true);
  };

  const handleConfirmBatchSave = async () => {
    const toSave = filteredRooms.filter((r) => r.currentReading);
    const readings = toSave.map((r) => ({
      roomId: r.id,
      readingValue: parseFloat(r.currentReading),
      readingDate: readingDate,
    }));
    try {
      await api.post('/api/meter-readings/batch', { readings });
    } catch (e) {
      console.error(e);
      alert('批次儲存失敗，請稍後再試');
      return;
    }
    setShowBatchDialog(false);
    setBatchNotes('');
    await loadMeterData();
  };

  // 狀態標籤
  const getStatusBadge = (status: RoomMeter['status']) => {
    switch (status) {
      case 'recorded': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">已記錄</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">待抄錶</Badge>;
      case 'overdue': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">逾期未抄</Badge>;
      default: return <Badge>未知</Badge>;
    }
  };

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="抄電錶管理"
          description="記錄各房間電錶讀數，自動計算用電度數與電費"
          actions={
            <>
              <Button onClick={handleBatchSave}>
                <SaveAll className="mr-2 h-4 w-4" />
                批次儲存
              </Button>
              <Button variant="outline" onClick={loadMeterData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新整理
              </Button>
            </>
          }
        />

        {/* 統計卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待抄錶房間</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPending}</div>
              <p className="text-xs text-muted-foreground">間待抄錶</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已記錄房間</CardTitle>
              <Battery className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRecorded}</div>
              <p className="text-xs text-muted-foreground">間已記錄</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總用電度數</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsage.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">度電</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">總電費金額</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalElectricityFee)}</div>
              <p className="text-xs text-muted-foreground">
                {filteredRooms.length > 0 ? `平均每度 ${formatCurrency(filteredRooms.reduce((s, r) => s + r.electricityRate, 0) / filteredRooms.length / 100)}` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 篩選與設定 */}
        <Card>
          <CardHeader>
            <CardTitle>抄錶設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="property">物業</Label>
                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇物業" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有物業</SelectItem>
                    {Array.from(
                      allowedPropertyNames.size > 0
                        ? allowedPropertyNames
                        : new Set(rooms.map((r) => r.propertyName)),
                    ).map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reading-date">抄錶日期</Label>
                <Input
                  id="reading-date"
                  type="date"
                  value={readingDate}
                  onChange={(e) => setReadingDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="electricity-rate">預設電費單價</Label>
                <Select defaultValue="6.5">
                  <SelectTrigger>
                    <SelectValue placeholder="選擇單價" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6.0">6.0元/度</SelectItem>
                    <SelectItem value="6.5">6.5元/度</SelectItem>
                    <SelectItem value="7.0">7.0元/度</SelectItem>
                    <SelectItem value="7.5">7.5元/度</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <Button className="w-full" onClick={loadMeterData}>
                  重新計算
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 電錶表格 */}
        <Card>
          <CardHeader>
            <CardTitle>房間電錶清單</CardTitle>
            <CardDescription>
              共 {filteredRooms.length} 間房間，{totalRecorded} 間已記錄，{totalPending} 間待抄錶
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">載入中...</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">
                <p>{error}</p>
                <Button variant="outline" onClick={loadMeterData} className="mt-2">
                  重試
                </Button>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">沒有符合條件的房間</p>
                <Button variant="outline" onClick={() => setSelectedProperty('all')} className="mt-2">
                  清除篩選
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>房號</TableHead>
                      <TableHead>物業</TableHead>
                      <TableHead>電費單價</TableHead>
                      <TableHead>上次讀數</TableHead>
                      <TableHead>本期讀數</TableHead>
                      <TableHead>用電度數</TableHead>
                      <TableHead>電費金額</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRooms.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.roomNumber}</TableCell>
                        <TableCell>{room.propertyName}</TableCell>
                        <TableCell>{formatCents(room.electricityRate)}/度</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{room.lastReading.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(room.lastReadingDate)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={room.currentReading}
                            onChange={(e) => handleReadingChange(room.id, e.target.value)}
                            placeholder="輸入本期讀數"
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {room.usage > 0 ? `${room.usage.toLocaleString()} 度` : '-'}
                        </TableCell>
                        <TableCell className="font-bold">
                          {room.electricityFee > 0 ? formatCurrency(room.electricityFee) : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(room.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 快速操作 */}
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
            <CardDescription>批次處理與工具</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Button variant="outline" onClick={() => {
                // 自動填入上期讀數+預估值
                setRooms(prev => prev.map(room => {
                  const estimated = Math.round(room.lastReading * 1.1);
                  const usage = estimated - room.lastReading;
                  const fee = Math.max(0, usage) * (room.electricityRate / 100);
                  
                  return {
                    ...room,
                    currentReading: estimated.toString(),
                    usage: Math.max(0, usage),
                    electricityFee: fee,
                    status: 'recorded'
                  };
                }));
              }}>
                自動填入預估值
              </Button>
              <Button variant="outline" onClick={() => {
                // 清除所有輸入
                setRooms(prev => prev.map(room => ({
                  ...room,
                  currentReading: '',
                  usage: 0,
                  electricityFee: 0,
                  status: 'pending'
                })));
              }}>
                清除所有輸入
              </Button>
              <Button variant="outline" onClick={handleBatchSave}>
                批次儲存已輸入
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 批次儲存對話框 */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>確認批次儲存</DialogTitle>
            <DialogDescription>
              將保存所有已輸入的電錶讀數
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="save-date">保存日期</Label>
              <Input
                id="save-date"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">備註</Label>
              <Input
                id="notes"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="輸入備註（可選）"
              />
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">即將儲存的項目：</p>
              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                {filteredRooms
                  .filter(r => r.currentReading)
                  .map(room => (
                    <li key={room.id}>
                      {room.roomNumber}：{room.lastReading.toLocaleString()} → {room.currentReading}（{room.usage} 度）
                    </li>
                  ))
                }
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmBatchSave}>
              確認儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}