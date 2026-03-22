'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Wallet, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

interface Property {
  id: string;
  name: string;
  status?: 'active' | 'archived' | 'demo' | string;
}

interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  electricityRate: number; // 分
  status: string;
  tenantName?: string | null;
}

type PaymentStatus = 'pending' | 'partial' | 'paid' | string;

interface Payment {
  id: string;
  paymentMonth: string; // YYYY-MM
  status: PaymentStatus;
  rentAmount: number;
  electricityFee: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt?: string;
}

interface MeterReading {
  id: string;
  roomId: string;
  readingValue: number;
  readingDate: string; // YYYY-MM-DD
}

export default function PaymentsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );

  const [meterHistory, setMeterHistory] = useState<MeterReading[]>([]);
  const [readingValue, setReadingValue] = useState<string>('');
  const [readingDate, setReadingDate] = useState<string>(
    new Date().toISOString().split('T')[0] ?? ''
  );

  const [payments, setPayments] = useState<Payment[]>([]);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showCollectDialog, setShowCollectDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [collectMethod, setCollectMethod] = useState<string>('cash');
  const [collectNotes, setCollectNotes] = useState<string>('');

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const lastReading = useMemo(() => {
    if (meterHistory.length === 0) return null;
    const sorted = [...meterHistory].sort((a, b) =>
      a.readingDate > b.readingDate ? -1 : 1
    );
    return sorted[0] ?? null;
  }, [meterHistory]);

  const electricityRateYuan = useMemo(() => {
    if (!selectedRoom) return 0;
    return (Number(selectedRoom.electricityRate || 0) / 100) || 0;
  }, [selectedRoom]);

  const usagePreview = useMemo(() => {
    const current = Number(readingValue || 0);
    const prev = Number(lastReading?.readingValue || 0);
    if (!readingValue) return null;
    const diff = current - prev;
    return diff >= 0 ? diff : null;
  }, [readingValue, lastReading]);

  const electricityFeePreview = useMemo(() => {
    if (usagePreview === null) return null;
    return Math.round(usagePreview * electricityRateYuan);
  }, [usagePreview, electricityRateYuan]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const props = await api.get<Property[]>('/api/properties');
        // 封存物業不應出現在可操作清單的 property 下拉選單中
        const allowedProps = props.filter((p) => p.status !== 'archived');
        setProperties(allowedProps);
        setSelectedPropertyId(allowedProps[0]?.id ?? '');
      } catch (err) {
        console.error('載入物業失敗', err);
        setError('載入物業失敗，請稍後再試');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) return;
    (async () => {
      setError(null);
      try {
        const rms = await api.get<Room[]>(`/api/rooms?property_id=${selectedPropertyId}`);
        setRooms(rms);
        setSelectedRoomId(rms[0]?.id ?? '');
      } catch (err) {
        console.error('載入房間失敗', err);
        setError('載入房間失敗，請稍後再試');
        setRooms([]);
        setSelectedRoomId('');
      }
    })();
  }, [selectedPropertyId]);

  const loadPayments = async () => {
    if (!selectedRoomId) return;
    setError(null);
    try {
      const [history, list] = await Promise.all([
        api.get<MeterReading[]>(`/api/meter-readings?roomId=${selectedRoomId}`),
        api.get<Payment[]>(`/api/payments?roomId=${selectedRoomId}&month=${selectedMonth}`),
      ]);
      setMeterHistory(history);
      setPayments(list);
    } catch (err) {
      console.error('載入收租資料失敗', err);
      setError('載入收租資料失敗，請稍後再試');
    }
  };

  useEffect(() => {
    void loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, selectedMonth]);

  // 計算統計（以目前房間+月份為準）
  const totalPending = payments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const totalPartial = payments
    .filter(p => p.status === 'partial')
    .reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const totalCollected = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);

  // 收租功能
  const handleCollectPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setCollectAmount(String(payment.balance || 0));
    setCollectMethod('cash');
    setCollectNotes('');
    setShowCollectDialog(true);
  };

  const handleConfirmCollect = async () => {
    if (!selectedPayment) return;
    try {
      const amount = parseInt(collectAmount, 10);
      if (Number.isNaN(amount) || amount <= 0) {
        alert('繳費金額需大於 0');
        return;
      }
      await api.patch(`/api/payments/${selectedPayment.id}/pay`, {
        amount,
        paymentMethod: collectMethod,
        notes: collectNotes || undefined,
      });
      await loadPayments();
      setShowCollectDialog(false);
      setSelectedPayment(null);
      setCollectAmount('');
      alert('繳費已記錄');
    } catch (err) {
      console.error('繳費失敗', err);
      alert('繳費失敗，請稍後再試');
    }
  };

  // 生成帳單功能
  const handleGenerateBills = () => setShowGenerateDialog(true);

  const handleConfirmGenerate = async () => {
    if (!selectedRoomId) return;
    try {
      // 有填本期度數就先寫入抄表，避免重複輸入
      if (readingValue.trim()) {
        const val = parseInt(readingValue, 10);
        if (Number.isNaN(val) || val < 0) {
          alert('本期電表度數格式不正確');
          return;
        }
        await api.post('/api/meter-readings', {
          roomId: selectedRoomId,
          readingValue: val,
          readingDate,
        });
      }

      await api.post('/api/payments/generate', {
        roomId: selectedRoomId,
        paymentMonth: selectedMonth,
      });

      await loadPayments();
      setShowGenerateDialog(false);
      alert('帳單已生成');
    } catch (err) {
      console.error('生成帳單失敗', err);
      alert('生成帳單失敗，請稍後再試');
    }
  };

  // 狀態標籤顏色
  const getStatusBadge = (status: Payment['status']) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">已繳清</Badge>;
      case 'partial': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">部分繳款</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">待繳款</Badge>;
      default: return <Badge>未知</Badge>;
    }
  };

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="收租管理"
          description="先抄表、再生成帳單、最後記錄繳費（支援部分繳費）"
          actions={
            <Button onClick={handleGenerateBills}>
              <PlusCircle className="mr-2 h-4 w-4" />
              生成帳單
            </Button>
          }
        />

        {/* 統計卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待收租金</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalPending)}</div>
              <p className="text-xs text-muted-foreground">以目前房間＋月份計算</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">部分繳款</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalPartial)}</div>
              <p className="text-xs text-muted-foreground">以目前房間＋月份計算</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已收金額</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalCollected)}</div>
              <p className="text-xs text-muted-foreground">
                以目前房間＋月份計算
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">電價（元/度）</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{selectedRoom ? electricityRateYuan.toFixed(2) : '—'}</div>
              <p className="text-xs text-muted-foreground">
                來自房間設定
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 收租條件（物業/房間/月份 + 抄表） */}
        <Card>
          <CardHeader>
            <CardTitle>收租條件</CardTitle>
            <CardDescription>選擇物業、房間與月份，並可填入本期電表度數（會自動寫入抄電表）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>物業</Label>
                <Select
                  value={selectedPropertyId || '__none__'}
                  onValueChange={(v) => setSelectedPropertyId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇物業" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">請選擇物業</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>房間</Label>
                <Select
                  value={selectedRoomId || '__none__'}
                  onValueChange={(v) => setSelectedRoomId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇房間" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">請選擇房間</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.roomNumber}（{r.floor} 樓）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>月份</Label>
                <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </div>

              <div className="space-y-2 flex items-end">
                <Button className="w-full" onClick={loadPayments} disabled={!selectedRoomId}>
                  重新整理
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>上期電表度數</Label>
                <Input value={lastReading ? String(lastReading.readingValue) : ''} readOnly placeholder="尚無資料" />
              </div>
              <div className="space-y-2">
                <Label>本期電表度數</Label>
                <Input value={readingValue} onChange={(e) => setReadingValue(e.target.value)} placeholder="例如：1250" />
              </div>
              <div className="space-y-2">
                <Label>抄表日期</Label>
                <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>預估電費</Label>
                <Input value={electricityFeePreview === null ? '' : String(electricityFeePreview)} readOnly placeholder="—" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 帳單列表 */}
        <Card>
          <CardHeader>
            <CardTitle>帳單列表</CardTitle>
            <CardDescription>
              共 {payments.length} 筆帳單
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
                <Button variant="outline" onClick={loadPayments} className="mt-2">
                  重試
                </Button>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">沒有符合條件的帳單</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月份</TableHead>
                      <TableHead>租金</TableHead>
                      <TableHead>電費</TableHead>
                      <TableHead>合計</TableHead>
                      <TableHead>已繳/餘額</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{payment.paymentMonth}</TableCell>
                        <TableCell>{formatCurrency(payment.rentAmount)}</TableCell>
                        <TableCell>{formatCurrency(payment.electricityFee)}</TableCell>
                        <TableCell className="font-bold">{formatCurrency(payment.totalAmount)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-green-600">{formatCurrency(payment.paidAmount)}</span>
                            <span className="text-sm text-muted-foreground">餘額 {formatCurrency(payment.balance)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCollectPayment(payment)}
                            disabled={payment.status === 'paid'}
                          >
                            收租
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 收租對話框 */}
      <Dialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>記錄繳費</DialogTitle>
            <DialogDescription>
              記錄帳單繳費（支援部分繳費，狀態會自動更新）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="balance">應付餘額</Label>
              <Input
                id="balance"
                value={formatCurrency(selectedPayment?.balance || 0)}
                disabled
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">繳費金額</Label>
              <Input
                id="amount"
                type="number"
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                placeholder="輸入繳費金額"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="method">繳費方式</Label>
              <Select value={collectMethod} onValueChange={setCollectMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇繳費方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">現金</SelectItem>
                  <SelectItem value="bank_transfer">銀行轉帳</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">備註</Label>
              <Input
                id="notes"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                placeholder="例如：先付一半"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollectDialog(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmCollect}>
              確認繳費
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成帳單對話框 */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>生成帳單</DialogTitle>
            <DialogDescription>
              會先（可選）寫入本期抄表，再依月份生成帳單（租金 + 電費）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                房間：{selectedRoom ? `${selectedRoom.roomNumber}（${selectedRoom.floor} 樓）` : '—'}，月份：{selectedMonth}
                <br />
                本期度數：{readingValue ? readingValue : '未填（不寫入抄表）'}，抄表日期：{readingDate}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmGenerate}>
              生成帳單
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}