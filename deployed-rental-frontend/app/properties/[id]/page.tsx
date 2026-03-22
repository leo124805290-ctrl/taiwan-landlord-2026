'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building, MapPin, Phone, Calendar, Home, Users, Plus, Edit, Trash2, ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { postCheckinGenerateAndMaybePay } from '@/lib/post-checkin-payments';
import { addOneYearToIsoDate, paymentMonthFromCheckIn } from '@/lib/checkin-dates';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/app-shell/page-shell';
import { PageHeader } from '@/components/app-shell/page-header';

// 模擬物業資料類型
interface Property {
  id: string;
  name: string;
  address: string;
  totalFloors: number;
  landlordName: string;
  landlordPhone: string;
  landlordDeposit: number;
  landlordMonthlyRent: number;
  prepaidPeriod: number;
  contractStartDate: string | null;
  contractEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  status?: 'active' | 'archived' | 'demo' | string;
}

// 房間資料類型
interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  electricityRate: number;
  status: 'vacant' | 'occupied' | 'reserved' | 'maintenance' | string;
  createdAt: string;
  updatedAt: string;
  tenantName?: string | null;
}

// 房間狀態對應的標籤和顏色
const roomStatusConfig = {
  vacant: { label: '空房', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  occupied: { label: '已入住', color: 'bg-green-100 text-green-800 border-green-200' },
  reserved: { label: '已預訂', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  maintenance: { label: '維修中', color: 'bg-red-100 text-red-800 border-red-200' },
};

interface RoomFormData {
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  electricityPrice: number; // 元/度，送出時轉 electricityRate(分)
}

type PaymentType = 'full' | 'partial' | 'deposit_only';

interface CheckinFormData {
  name: string;
  phone: string;
  passportNumber: string;
  checkInDate: string;
  expectedCheckoutDate: string;
  paymentType: PaymentType;
  /** 實際收款（新台幣元，API 送分） */
  paymentAmountYuan: number;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = params?.['id'] as string;
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomFormData, setRoomFormData] = useState<RoomFormData>({
    roomNumber: '',
    floor: 1,
    monthlyRent: 0,
    depositAmount: 0,
    electricityPrice: 3.5,
  });
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingStatusRoomId, setSavingStatusRoomId] = useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinRoom, setCheckinRoom] = useState<Room | null>(null);
  const [checkinForm, setCheckinForm] = useState<CheckinFormData>(() => {
    const today = new Date().toISOString().split('T')[0] ?? '';
    return {
      name: '',
      phone: '',
      passportNumber: '',
      checkInDate: today,
      expectedCheckoutDate: addOneYearToIsoDate(today),
      paymentType: 'full',
      paymentAmountYuan: 0,
    };
  });
  const [savingCheckin, setSavingCheckin] = useState(false);

  // 載入物業詳情和房間列表
  useEffect(() => {
    if (propertyId) {
      loadPropertyAndRooms();
    }
  }, [propertyId]);

  const loadPropertyAndRooms = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 後端目前沒有 `GET /api/properties/:id`，改用全量物業列表找出對應 id
      const [props, r] = await Promise.all([
        api.get<Property[]>(`/api/properties?include_archived=true`),
        api.get<Room[]>(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`),
      ]);
      const p = props.find((x) => String(x.id) === String(propertyId)) ?? null;
      setProperty(p);
      setRooms(r);
    } catch (err) {
      setError('載入資料失敗，請稍後再試');
      console.error('載入物業詳情錯誤:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreProperty = async () => {
    if (!propertyId || !property) return;
    if (property.status !== 'archived') return;

    if (!confirm(`確定要「恢復使用中」：${property.name}？`)) return;

    try {
      await api.patch(`/api/properties/${propertyId}/restore`);
      await loadPropertyAndRooms();
    } catch (err) {
      console.error('恢復物業失敗', err);
      alert('恢復失敗，請稍後再試');
    }
  };

  const handleDeleteProperty = async () => {
    if (!propertyId || !property) return;
    const status = property.status || 'active';
    if (status !== 'demo') {
      alert('目前僅允許刪除測試用（demo）物業');
      return;
    }

    if (
      !confirm(
        `確定要「刪除測試用物業」：${property.name}？\n\n此操作會硬刪 demo 物業及其關聯資料。`,
      )
    ) {
      return;
    }

    try {
      await api.delete(`/api/properties/${propertyId}`);
      router.push('/properties');
    } catch (err) {
      console.error('刪除物業失敗', err);
      alert('刪除失敗，請稍後再試');
    }
  };

  const handleAddRoom = () => {
    setEditingRoom(null);
    setRoomFormData({
      roomNumber: '',
      floor: 1,
      monthlyRent: 0,
      depositAmount: 0,
      electricityPrice: 3.5,
    });
    setRoomFormOpen(true);
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomFormData({
      roomNumber: room.roomNumber,
      floor: room.floor,
      monthlyRent: room.monthlyRent,
      depositAmount: room.depositAmount,
      electricityPrice: room.electricityRate / 100,
    });
    setRoomFormOpen(true);
  };

  const handleDeleteRoom = async (room: Room) => {
    if (confirm(`確定要刪除房間 ${room.roomNumber} 嗎？`)) {
      try {
        await api.delete(`/api/rooms/${room.id}`);
        setRooms(prev => prev.filter(r => r.id !== room.id));
      } catch (err) {
        console.error('刪除房間失敗', err);
        alert('刪除失敗，請稍後再試');
      }
    }
  };

  const handleRoomStatusChange = async (roomId: string, newStatus: Room['status']) => {
    setSavingStatusRoomId(roomId);
    try {
      const updated = await api.patch<Room>(`/api/rooms/${roomId}/status`, { status: newStatus });
      setRooms(prev => prev.map(room => 
        room.id === roomId ? updated : room
      ));
    } catch (err) {
      console.error('更新房間狀態失敗', err);
      alert('更新狀態失敗，請稍後再試');
    } finally {
      setSavingStatusRoomId(null);
    }
  };

  const handleRoomFormChange = (field: keyof RoomFormData, value: string | number) => {
    setRoomFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const openCheckinModal = (room: Room) => {
    setCheckinRoom(room);
    const today = new Date().toISOString().split('T')[0] ?? '';
    const defaultYuan = (room.monthlyRent + room.depositAmount) / 100;
    setCheckinForm({
      name: '',
      phone: '',
      passportNumber: '',
      checkInDate: today,
      expectedCheckoutDate: addOneYearToIsoDate(today),
      paymentType: 'full',
      paymentAmountYuan: Math.round(defaultYuan * 100) / 100,
    });
    setCheckinOpen(true);
  };

  const handleCheckinFieldChange = (field: keyof CheckinFormData, value: string | number) => {
    setCheckinForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCheckinDateChange = (value: string) => {
    setCheckinForm((prev) => ({
      ...prev,
      checkInDate: value,
      expectedCheckoutDate: addOneYearToIsoDate(value),
    }));
  };

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinRoom) return;

    const name = checkinForm.name.trim();
    if (!name) {
      alert('請輸入租客姓名');
      return;
    }
    if (!checkinForm.phone.trim()) {
      alert('請輸入電話');
      return;
    }

    const rentAmount = checkinRoom.monthlyRent;
    const depositAmount = checkinRoom.depositAmount;
    const paidAmountCents = Math.round(Number(checkinForm.paymentAmountYuan) * 100);

    setSavingCheckin(true);
    try {
      const result = await api.post<{ tenant: { id: string } }>('/api/checkin/complete', {
        roomId: checkinRoom.id,
        nameZh: name,
        nameVi: name,
        phone: checkinForm.phone.trim(),
        passportNumber: checkinForm.passportNumber.trim() || undefined,
        checkInDate: checkinForm.checkInDate,
        expectedCheckoutDate: checkinForm.expectedCheckoutDate,
        paymentType: checkinForm.paymentType,
        rentAmount,
        depositAmount,
        paidAmount: paidAmountCents,
        paymentAmount: paidAmountCents,
        paymentMethod: 'cash',
      });

      try {
        await postCheckinGenerateAndMaybePay({
          paymentType: checkinForm.paymentType,
          roomId: checkinRoom.id,
          tenantId: result.tenant.id,
          paymentMonth: paymentMonthFromCheckIn(checkinForm.checkInDate),
          paidAmountCents,
        });
      } catch (billErr) {
        console.error('產生收租帳單失敗', billErr);
        alert('入住已成功，但產生當月帳單失敗，請至收租管理手動處理。');
      }

      const nextStatus: Room['status'] =
        checkinForm.paymentType === 'full' ? 'occupied' : 'reserved';

      setRooms((prev) =>
        prev.map((r) =>
          r.id === checkinRoom.id
            ? { ...r, status: nextStatus, tenantName: name }
            : r
        )
      );

      alert('入住成功');
      setCheckinOpen(false);
      setCheckinRoom(null);
    } catch (err) {
      console.error('入住失敗', err);
      alert('入住失敗，請稍後再試');
    } finally {
      setSavingCheckin(false);
    }
  };

  const handleSubmitRoomForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;

    const payload = {
      propertyId,
      roomNumber: roomFormData.roomNumber.trim(),
      floor: Number(roomFormData.floor || 1),
      monthlyRent: Number(roomFormData.monthlyRent || 0),
      depositAmount: Number(roomFormData.depositAmount || 0),
      electricityRate: Math.round(Number(roomFormData.electricityPrice || 0) * 100),
      status: editingRoom?.status ?? 'vacant',
    };

    if (!payload.roomNumber) {
      alert('請輸入房號');
      return;
    }

    setSavingRoom(true);
    try {
      if (editingRoom) {
        const updated = await api.put<Room>(`/api/rooms/${editingRoom.id}`, payload);
        setRooms(prev => prev.map(r => (r.id === editingRoom.id ? updated : r)));
      } else {
        const created = await api.post<Room>('/api/rooms', payload);
        setRooms(prev => [...prev, created]);
      }
      setRoomFormOpen(false);
    } catch (err) {
      console.error('儲存房間失敗', err);
      alert('儲存房間失敗，請稍後再試');
    } finally {
      setSavingRoom(false);
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="物業載入中"
          actions={
            <Link href="/properties">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回物業列表
              </Button>
            </Link>
          }
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <div className="h-6 bg-gray-200 rounded w-48"></div>
              <div className="h-10 bg-gray-200 rounded w-32"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error || !property) {
    return (
      <PageShell>
        <PageHeader
          title="物業載入失敗"
          actions={
            <Link href="/properties">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回物業列表
              </Button>
            </Link>
          }
        />
        
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-red-500 text-lg font-medium">{error || '找不到指定的物業'}</div>
              <Button 
                onClick={loadPropertyAndRooms}
                className="mt-4"
                variant="outline"
              >
                重試
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const propertyStatus = property.status || 'active';
  if (propertyStatus === 'archived') {
    return (
      <PageShell>
        <PageHeader
          title={property.name}
          description="此物業已封存，只保留紀錄（不支援新增/編輯房間）。"
          actions={
            <Button onClick={handleRestoreProperty} variant="outline" size="sm">
              <RotateCcw className="h-4 w-4 mr-2" />
              恢復使用中
            </Button>
          }
        />

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="text-amber-900 font-medium">
              已封存物業
            </div>
            <p className="text-amber-800 text-sm mt-2">
              這個物業目前不在可操作清單中。若你需要繼續使用，請先按下「恢復使用中」。
            </p>
            <div className="mt-6">
              <Link href="/properties">
                <Button variant="outline" size="sm">
                  返回物業列表
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // 計算房間統計
  const roomStats = {
    total: rooms.length,
    vacant: rooms.filter(r => r.status === 'vacant').length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    reserved: rooms.filter(r => r.status === 'reserved').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  };

  // 計算月租金總收入（僅已入住和已預訂房間）
  const monthlyRentIncome = rooms
    .filter(r => r.status === 'occupied' || r.status === 'reserved')
    .reduce((sum, room) => sum + room.monthlyRent, 0);

  const occupancyRate = roomStats.total ? Math.round((roomStats.occupied / roomStats.total) * 100) : 0;

  return (
    <PageShell>
      <PageHeader
        title={property.name}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/properties">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回物業列表
              </Button>
            </Link>
            {(property.status || 'active') === 'demo' && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleDeleteProperty}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                刪除
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 左側：物業資訊 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2 text-gray-500" />
                物業資訊
              </CardTitle>
              <CardDescription>基本資訊與合約</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center text-gray-700">
                  <div className="w-6">
                    <MapPin className="h-4 w-4 text-gray-500" />
                  </div>
                  <span className="ml-2">{property.address}</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-6">
                    <Home className="h-4 w-4 text-gray-500" />
                  </div>
                  <span className="ml-2">{property.totalFloors} 層樓</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-6">
                    <Users className="h-4 w-4 text-gray-500" />
                  </div>
                  <span className="ml-2">{property.landlordName}</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <div className="w-6">
                    <Phone className="h-4 w-4 text-gray-500" />
                  </div>
                  <span className="ml-2">{property.landlordPhone}</span>
                </div>
                {property.contractStartDate && (
                  <div className="flex items-center text-gray-700">
                    <div className="w-6">
                      <Calendar className="h-4 w-4 text-gray-500" />
                    </div>
                    <span className="ml-2">
                      合約：{formatDate(property.contractStartDate, 'short')} - 
                      {property.contractEndDate ? formatDate(property.contractEndDate, 'short') : '未設定'}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">給房東押金</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(property.landlordDeposit)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">給房東月租</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(property.landlordMonthlyRent)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">預付週期</span>
                  <span className="font-bold text-gray-900">
                    {property.prepaidPeriod} 個月
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 統計卡片 */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">房間統計</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">總房間數</span>
                  <span className="font-bold text-gray-900">{roomStats.total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">空房</span>
                  <Badge className={roomStatusConfig.vacant.color}>
                    {roomStats.vacant}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">已入住</span>
                  <Badge className={roomStatusConfig.occupied.color}>
                    {roomStats.occupied}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">已預訂</span>
                  <Badge className={roomStatusConfig.reserved.color}>
                    {roomStats.reserved}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">維修中</span>
                  <Badge className={roomStatusConfig.maintenance.color}>
                    {roomStats.maintenance}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center pt-2">
                  <span className="text-gray-600">入住率</span>
                  <span className="font-bold text-gray-900">
                    {roomStats.total ? `${occupancyRate}%` : '—'}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center pt-2">
                  <span className="text-gray-600">月租金總收入</span>
                  <span className="font-bold text-green-700">
                    {formatCurrency(monthlyRentIncome)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右側：房間列表 */}
        <div className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">房間管理</h2>
              <p className="text-gray-600 mt-1">管理此物業的所有房間</p>
            </div>
            <Button onClick={handleAddRoom}>
              <Plus className="h-4 w-4 mr-2" />
              新增房間
            </Button>
          </div>

          {rooms.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Home className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">尚無房間資料</h3>
                  <p className="text-gray-600 mb-6">開始新增房間以出租</p>
                  <Button onClick={handleAddRoom}>
                    <Plus className="h-4 w-4 mr-2" />
                    新增房間
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map((room) => (
                <Card key={room.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl font-bold text-gray-900">
                          {room.roomNumber} 號房
                        </CardTitle>
                        <CardDescription className="flex items-center mt-1">
                          <Home className="h-4 w-4 mr-1" />
                          {room.floor} 樓
                        </CardDescription>
                      </div>
                  {(() => {
                    const meta =
                      roomStatusConfig[room.status as keyof typeof roomStatusConfig] ??
                      roomStatusConfig.vacant;
                    return (
                      <Badge className={meta.color}>
                        {meta.label}
                      </Badge>
                    );
                  })()}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">月租金</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(room.monthlyRent)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">押金</span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(room.depositAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">電費單價</span>
                        <span className="font-bold text-gray-900">
                          {(room.electricityRate / 100).toFixed(2)} 元/度
                        </span>
                      </div>
                      {room.status === 'occupied' && room.tenantName && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">租客</span>
                          <span className="font-medium text-gray-900">
                            {room.tenantName}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditRoom(room)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        編輯
                      </Button>
                      {room.status === 'vacant' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => openCheckinModal(room)}
                        >
                          安排入住
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleDeleteRoom(room)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        刪除
                      </Button>
                    </div>

                    {/* 快速狀態切換 */}
                    <div className="pt-3 border-t">
                      <p className="text-sm text-gray-600 mb-2">快速切換狀態：</p>
                      <div className="grid grid-cols-4 gap-2">
                        {Object.entries(roomStatusConfig).map(([status, config]) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={room.status === status ? "default" : "outline"}
                            className={`text-xs ${room.status === status ? '' : 'text-gray-600'}`}
                            onClick={() => handleRoomStatusChange(room.id, status as Room['status'])}
                            disabled={room.status === status || !!savingStatusRoomId}
                          >
                            {config.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-8 text-center text-sm text-gray-500">
            <p>共 {rooms.length} 個房間 • 系統建置中 v2.0</p>
          </div>
        </div>
      </div>

      {/* 房間新增/編輯 Dialog */}
      <Dialog open={roomFormOpen} onOpenChange={setRoomFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? '編輯房間' : '新增房間'}</DialogTitle>
            <DialogDescription>
              請輸入房號、樓層與租金相關資訊，電費單價以「元/度」輸入。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitRoomForm}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="roomNumber">房號</Label>
                <Input
                  id="roomNumber"
                  value={roomFormData.roomNumber}
                  onChange={(e) => handleRoomFormChange('roomNumber', e.target.value)}
                  placeholder="例如：101"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor">樓層</Label>
                <Input
                  id="floor"
                  type="number"
                  min={1}
                  value={roomFormData.floor}
                  onChange={(e) =>
                    handleRoomFormChange('floor', parseInt(e.target.value) || 1)
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyRent">月租金（元）</Label>
                <Input
                  id="monthlyRent"
                  type="number"
                  min={0}
                  value={roomFormData.monthlyRent}
                  onChange={(e) =>
                    handleRoomFormChange('monthlyRent', parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositAmount">押金（元）</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  min={0}
                  value={roomFormData.depositAmount}
                  onChange={(e) =>
                    handleRoomFormChange('depositAmount', parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="electricityPrice">電費單價（元/度）</Label>
                <Input
                  id="electricityPrice"
                  type="number"
                  min={0}
                  step={0.1}
                  value={roomFormData.electricityPrice}
                  onChange={(e) =>
                    handleRoomFormChange(
                      'electricityPrice',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <p className="text-xs text-gray-500">
                  送出時會自動轉換為後端的 electricityRate（分），例如 3.5 元 → 350。
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoomFormOpen(false)}
                disabled={savingRoom}
              >
                取消
              </Button>
              <Button type="submit" disabled={savingRoom}>
                {savingRoom ? '儲存中...' : '儲存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 入住 Dialog */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安排入住{checkinRoom ? `－${checkinRoom.roomNumber} 號房` : ''}</DialogTitle>
            <DialogDescription>
              請填寫租客資料與付款方式，送出後會建立入住紀錄並更新房間狀態。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitCheckin}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="tenantName">租客姓名</Label>
                <Input
                  id="tenantName"
                  value={checkinForm.name}
                  onChange={(e) => handleCheckinFieldChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">電話</Label>
                <Input
                  id="phone"
                  value={checkinForm.phone}
                  onChange={(e) => handleCheckinFieldChange('phone', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passportNumber">護照／居留證號碼</Label>
                <Input
                  id="passportNumber"
                  value={checkinForm.passportNumber}
                  onChange={(e) =>
                    handleCheckinFieldChange('passportNumber', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkInDate">入住日期</Label>
                <Input
                  id="checkInDate"
                  type="date"
                  value={checkinForm.checkInDate}
                  onChange={(e) => handleCheckinDateChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedCheckoutDate">合約到期日</Label>
                <Input
                  id="expectedCheckoutDate"
                  type="date"
                  value={checkinForm.expectedCheckoutDate}
                  onChange={(e) =>
                    handleCheckinFieldChange('expectedCheckoutDate', e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>付款方式</Label>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="paymentType"
                      value="full"
                      checked={checkinForm.paymentType === 'full'}
                      onChange={() => handleCheckinFieldChange('paymentType', 'full')}
                    />
                    <span>全額付清（押金 + 首月租金）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="paymentType"
                      value="partial"
                      checked={checkinForm.paymentType === 'partial'}
                      onChange={() => handleCheckinFieldChange('paymentType', 'partial')}
                    />
                    <span>部分付款</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="paymentType"
                      value="deposit_only"
                      checked={checkinForm.paymentType === 'deposit_only'}
                      onChange={() =>
                        handleCheckinFieldChange('paymentType', 'deposit_only')
                      }
                    />
                    <span>僅付押金</span>
                  </label>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="paymentAmountYuan">付款金額（元）</Label>
                <Input
                  id="paymentAmountYuan"
                  type="number"
                  min={0}
                  step={1}
                  value={checkinForm.paymentAmountYuan}
                  onChange={(e) =>
                    handleCheckinFieldChange(
                      'paymentAmountYuan',
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
                <p className="text-xs text-gray-500">
                  依選擇的付款方式輸入實際收款金額。全額付清時可輸入押金＋首月租金總和。
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCheckinOpen(false)}
                disabled={savingCheckin}
              >
                取消
              </Button>
              <Button type="submit" disabled={savingCheckin || !checkinRoom}>
                {savingCheckin ? '入住處理中...' : '確認入住'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}