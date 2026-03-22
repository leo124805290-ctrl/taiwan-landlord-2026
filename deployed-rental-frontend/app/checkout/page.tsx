'use client';

import { useMemo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Home, Users, CheckCircle, History, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

interface TenantApi {
  id: string;
  roomId: string;
  propertyId: string;
  nameZh?: string;
  nameVi?: string;
  phone?: string;
  checkInDate?: string;
  status?: string;
  createdAt?: string;
}

interface RoomApi {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor?: number;
  status?: string;
  monthlyRent?: number;
  depositAmount?: number;
  electricityRate?: number; // 分
  previousMeter?: number;
  currentMeter?: number;
}

interface PropertyApi {
  id: string;
  name: string;
}

type DepositAction = 'return' | 'keep' | 'none';

export default function CheckoutPage() {
  const [tenants, setTenants] = useState<TenantApi[]>([]);
  const [rooms, setRooms] = useState<Record<string, RoomApi>>({});
  const [properties, setProperties] = useState<Record<string, PropertyApi>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [checkoutDate, setCheckoutDate] = useState<Date>(new Date());
  const [finalMeter, setFinalMeter] = useState<string>('');
  const [depositAction, setDepositAction] = useState<DepositAction>('return');
  const [depositAmount, setDepositAmount] = useState<string>('0');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 載入租客 / 房間 / 物業
  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [tenantList, roomList, propertyList] = await Promise.all([
        api.get<any[]>('/api/tenants'),
        api.get<any[]>('/api/rooms'),
        api.get<any[]>('/api/properties'),
      ]);

      const roomsMap: Record<string, RoomApi> = {};
      for (const r of roomList) {
        const base: RoomApi = {
          id: String(r.id),
          propertyId: String(r.propertyId ?? r.property_id ?? ''),
          roomNumber: String(r.roomNumber ?? r.room_number ?? ''),
        };

        roomsMap[String(r.id)] = {
          ...base,
          ...(r.floor != null ? { floor: Number(r.floor) } : {}),
          ...(r.status != null ? { status: String(r.status) } : {}),
          ...(r.monthlyRent != null
            ? { monthlyRent: Number(r.monthlyRent) }
            : (r.monthly_rent != null ? { monthlyRent: Number(r.monthly_rent) } : {})),
          ...(r.depositAmount != null
            ? { depositAmount: Number(r.depositAmount) }
            : (r.deposit != null ? { depositAmount: Number(r.deposit) } : {})),
          ...(r.electricityRate != null ? { electricityRate: Number(r.electricityRate) } : {}),
          ...(r.previousMeter != null
            ? { previousMeter: Number(r.previousMeter) }
            : (r.previous_meter != null ? { previousMeter: Number(r.previous_meter) } : {})),
          ...(r.currentMeter != null
            ? { currentMeter: Number(r.currentMeter) }
            : (r.current_meter != null ? { currentMeter: Number(r.current_meter) } : {})),
        };
      }

      const propsMap: Record<string, PropertyApi> = {};
      for (const p of propertyList) {
        propsMap[String(p.id)] = { id: String(p.id), name: String(p.name || '') };
      }

      const normalizedTenants: TenantApi[] = tenantList.map((t) => ({
        id: String(t.id),
        roomId: String(t.roomId ?? t.room_id ?? ''),
        propertyId: String(t.propertyId ?? t.property_id ?? ''),
        nameZh: t.nameZh != null ? String(t.nameZh) : (t.name != null ? String(t.name) : ''),
        nameVi: t.nameVi != null ? String(t.nameVi) : '',
        phone: t.phone != null ? String(t.phone) : '',
        checkInDate: String(t.checkInDate ?? t.contract_start ?? t.createdAt ?? new Date().toISOString()),
        status: String(t.status ?? (t.is_active === false ? 'checked_out' : 'active')),
        ...(t.createdAt ? { createdAt: String(t.createdAt) } : {}),
      }));

      setTenants(normalizedTenants);
      setRooms(roomsMap);
      setProperties(propsMap);

      const firstActive = normalizedTenants.find((t) => t.status !== 'checked_out');
      setSelectedTenantId(firstActive?.id ?? '');
    } catch (error) {
      setError('載入資料失敗');
      console.error('載入錯誤:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeTenants = useMemo(
    () => tenants.filter((t) => t.status !== 'checked_out'),
    [tenants]
  );

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId]
  );

  const selectedRoom = useMemo(() => {
    if (!selectedTenant?.roomId) return null;
    return rooms[selectedTenant.roomId] ?? null;
  }, [rooms, selectedTenant]);

  const selectedPropertyName = useMemo(() => {
    if (!selectedTenant?.propertyId) return '';
    return properties[selectedTenant.propertyId]?.name || '';
  }, [properties, selectedTenant]);

  const meterPreview = useMemo(() => {
    const prev = Number(selectedRoom?.previousMeter ?? selectedRoom?.currentMeter ?? 0);
    const finalVal = Number(finalMeter || 0);
    if (!finalMeter) return null;
    if (Number.isNaN(finalVal) || finalVal < 0) return null;
    const diff = finalVal - prev;
    return diff >= 0 ? { prev, finalVal, usage: diff } : null;
  }, [selectedRoom, finalMeter]);

  const electricityRateYuan = useMemo(() => {
    if (!selectedRoom) return 6;
    const rateFen = Number(selectedRoom.electricityRate ?? 600);
    return rateFen > 0 ? rateFen / 100 : 6;
  }, [selectedRoom]);

  const electricityFeePreview = useMemo(() => {
    if (!meterPreview) return null;
    return Math.round(meterPreview.usage * electricityRateYuan);
  }, [meterPreview, electricityRateYuan]);

  const checkoutDateStr = useMemo(
    () => checkoutDate.toISOString().split('T')[0] ?? '',
    [checkoutDate]
  );

  const openConfirm = () => {
    if (!selectedTenant || !selectedRoom) {
      alert('請先選擇租客');
      return;
    }
    const finalVal = parseInt(finalMeter, 10);
    if (Number.isNaN(finalVal)) {
      alert('請輸入本期（退租）電表度數');
      return;
    }
    setShowSettlementDialog(true);
  };

  const handleConfirmCheckout = async () => {
    if (!selectedTenant || !selectedRoom) return;
    const finalVal = parseInt(finalMeter, 10);
    if (Number.isNaN(finalVal)) return;

    const depAmount = parseInt(depositAmount, 10);
    const safeDepAmount = Number.isNaN(depAmount) ? 0 : depAmount;

    try {
      setSubmitting(true);
      setError(null);

      await api.post('/api/checkout/complete', {
        // 後端可能用 snake_case；同時帶兩套 key，讓後端任一解析方式都能吃到
        roomId: selectedRoom.id,
        room_id: selectedRoom.id,
        checkoutDate: checkoutDateStr,
        checkout_date: checkoutDateStr,
        finalMeter: finalVal,
        final_meter: finalVal,
        depositAction,
        deposit_action: depositAction,
        depositAmount: safeDepAmount,
        deposit_amount: safeDepAmount,
        note: settlementNotes || undefined,
      });

      setShowSettlementDialog(false);
      setSelectedTenantId('');
      setFinalMeter('');
      setDepositAmount('0');
      setDepositAction('return');
      setSettlementNotes('');
      await loadData();
      alert('退租完成');
    } catch (err) {
      console.error('退租失敗', err);
      alert('退租失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <Card>
          <CardHeader>
            <CardTitle>退租結算管理</CardTitle>
            <CardDescription>載入中...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              正在載入資料
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="退租結算管理"
          description="處理租客退租（會寫入退租電表、選擇是否退還押金）"
          actions={
            <Button variant="outline" onClick={() => void loadData()}>
              <History className="mr-2 h-4 w-4" />
              重新整理
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* 左側：退租結算表單 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 租客選擇 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  選擇退租租客
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tenant">租客</Label>
                    <Select
                      value={selectedTenantId || '__none__'}
                      onValueChange={(v) => setSelectedTenantId(v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選擇要退租的租客" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">請選擇租客</SelectItem>
                        {activeTenants.map((t) => {
                          const room = rooms[t.roomId];
                          const label = `${t.nameZh || t.nameVi || '未命名'}（${room?.roomNumber || '—'}）`;
                          return (
                            <SelectItem key={t.id} value={t.id}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedTenant && selectedRoom && (
                    <>
                      <div className="rounded-md bg-muted p-4">
                        <h3 className="font-medium mb-2">租客資訊</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>姓名：{selectedTenant.nameZh || selectedTenant.nameVi || '—'}</div>
                          <div>電話：{selectedTenant.phone || '—'}</div>
                          <div>房號：{selectedRoom.roomNumber}</div>
                          <div>物業：{selectedPropertyName || '—'}</div>
                          <div>入住日期：{formatDate(selectedTenant.checkInDate || '')}</div>
                          <div>月租金：{formatCurrency(Number(selectedRoom.monthlyRent || 0))}</div>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="checkout-date">退租日期</Label>
                            <Popover>
                              <PopoverTrigger
                                className={cn(
                                  "inline-flex h-10 w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-sm font-normal ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                                  !checkoutDate && "text-muted-foreground"
                                )}
                                type="button"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {checkoutDate ? formatDate(checkoutDate.toISOString()) : "選擇日期"}
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={checkoutDate}
                                  onSelect={(date) => date && setCheckoutDate(date)}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="final-meter">退租電表度數</Label>
                            <Input
                              id="final-meter"
                              type="number"
                              value={finalMeter}
                              onChange={(e) => setFinalMeter(e.target.value)}
                              placeholder="例如：1250"
                            />
                            <p className="text-xs text-muted-foreground">
                              上期：{String(selectedRoom.previousMeter ?? selectedRoom.currentMeter ?? 0)}
                              {meterPreview ? `，用量 ${meterPreview.usage} 度，預估電費 ${formatCurrency(electricityFeePreview || 0)}` : ''}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>押金處理</Label>
                            <Select value={depositAction} onValueChange={(v) => setDepositAction(v as DepositAction)}>
                              <SelectTrigger>
                                <SelectValue placeholder="選擇押金處理方式" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="return">退還押金</SelectItem>
                                <SelectItem value="keep">沒收押金</SelectItem>
                                <SelectItem value="none">不處理</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder="退還押金金額"
                              disabled={depositAction !== 'return'}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="notes">結算備註</Label>
                          <Textarea
                            id="notes"
                            value={settlementNotes}
                            onChange={(e) => setSettlementNotes(e.target.value)}
                            placeholder="輸入結算備註（可選）"
                            rows={3}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calculator className="mr-2 h-5 w-5" />
                  退租操作
                </CardTitle>
                <CardDescription>
                  填入必要資訊後提交（會把房間狀態改回空房）
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={openConfirm}
                  disabled={!selectedTenant || !selectedRoom || submitting}
                >
                  <CheckCircle className="mr-2 h-5 w-5" />
                  確認退租並送出
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 右側：統計與提示 */}
          <div className="space-y-6">
            {/* 統計卡片 */}
            <Card>
              <CardHeader>
                <CardTitle>結算統計</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">入住中租客</p>
                    <p className="text-2xl font-bold">
                      {activeTenants.filter(t => t.status === 'active').length}
                    </p>
                  </div>
                  <Home className="h-8 w-8 text-muted-foreground" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">退租中租客</p>
                    <p className="text-2xl font-bold">
                      {activeTenants.filter(t => t.status === 'checking_out').length}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            {/* 操作提示 */}
            <Card>
              <CardHeader>
                <CardTitle>操作提示</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1 mr-2"></div>
                    <span>選擇租客後系統會自動計算結算金額</span>
                  </li>
                  <li className="flex items-start">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1 mr-2"></div>
                    <span>日租金 = 月租金 ÷ 30（四捨五入）</span>
                  </li>
                  <li className="flex items-start">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1 mr-2"></div>
                    <span>應退金額 = 預付餘額 + 押金 - 應付總額</span>
                  </li>
                  <li className="flex items-start">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1 mr-2"></div>
                    <span>提交退租後，房間狀態會自動變更為「空房」</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 確認結算對話框 */}
      <Dialog open={showSettlementDialog} onOpenChange={setShowSettlementDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>確認退租</DialogTitle>
            <DialogDescription>
              請確認資訊無誤後提交（會寫入電費與押金退還紀錄）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTenant && selectedRoom && (
              <div className="rounded-md bg-muted p-4">
                <h3 className="font-medium mb-2">提交內容</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>租客：{selectedTenant.nameZh || selectedTenant.nameVi || '—'}</div>
                  <div>房號：{selectedRoom.roomNumber}</div>
                  <div>物業：{selectedPropertyName || '—'}</div>
                  <div>退租：{checkoutDateStr}</div>
                  <div>上期電表：{String(selectedRoom.previousMeter ?? selectedRoom.currentMeter ?? 0)}</div>
                  <div>本期電表：{finalMeter || '—'}</div>
                  <div>預估電費：{formatCurrency(electricityFeePreview || 0)}</div>
                  <div>押金處理：{depositAction}</div>
                  <div>押金金額：{formatCurrency(parseInt(depositAmount || '0', 10) || 0)}</div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmCheckout} disabled={submitting}>
              {submitting ? '送出中...' : '確認並完成退租'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}