'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building, User, Phone, Calendar, Plus, Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import CheckinModal, { type CheckinSubmitPayload } from './components/checkin-modal';
import { api, ApiError } from '@/lib/api-client';
import { postCheckinGenerateAndMaybePay } from '@/lib/post-checkin-payments';
import { paymentMonthFromCheckIn } from '@/lib/checkin-dates';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

// 租客資料類型
interface Tenant {
  id: string;
  roomId: string;
  propertyId: string;
  nameZh: string;
  nameVi: string;
  phone: string;
  passportNumber?: string;
  checkInDate: string;
  expectedCheckoutDate?: string;
  actualCheckoutDate?: string;
  status: 'active' | 'checked_out';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 房間資料類型
interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  status: string;
  monthlyRent: number;
  depositAmount: number;
}

// 物業資料類型
interface Property {
  id: string;
  name: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [properties, setProperties] = useState<Record<string, Property>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  
  // 篩選狀態
  const [searchTerm, setSearchTerm] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active'); // 'all', 'active', 'checked_out'

  // 載入租客資料
  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [tenantListRaw, roomListRaw, propertyListRaw] = await Promise.all([
        api.get<any[]>('/api/tenants'),
        api.get<any[]>('/api/rooms'),
        api.get<any[]>('/api/properties'),
      ]);

      const tenantList = Array.isArray(tenantListRaw) ? tenantListRaw : [];
      const roomList = Array.isArray(roomListRaw) ? roomListRaw : [];
      const propertyList = Array.isArray(propertyListRaw) ? propertyListRaw : [];

      const roomsMap: Record<string, Room> = {};
      for (const r of roomList) {
        const rid = String(r.id);
        roomsMap[rid] = {
          id: rid,
          propertyId: String(r.propertyId ?? (r as { property_id?: string }).property_id ?? ''),
          roomNumber: String(r.roomNumber ?? ''),
          floor: Number(r.floor || 1),
          status: String(r.status || 'vacant'),
          monthlyRent: Number(r.monthlyRent || 0),
          depositAmount: Number(r.depositAmount || 0),
        };
      }

      // 由 /api/rooms 反推「可操作清單」：這個端點應已只回 active/demo 物業的房間
      const allowedPropertyIds = new Set(
        Object.values(roomsMap).map((r) => String(r.propertyId)),
      );

      const propsMap: Record<string, Property> = {};
      for (const p of propertyList) {
        const pid = String(p.id);
        if (!allowedPropertyIds.has(pid)) continue;
        propsMap[pid] = { id: pid, name: String(p.name ?? '') };
      }

      // archived 物業的租客若其房間不在 roomsMap 中，則不顯示於此操作頁
      const normalizedTenants: Tenant[] = tenantList.reduce<Tenant[]>((acc, t) => {
        const roomIdKey = String(t.roomId);
        if (!roomsMap[roomIdKey]) return acc;

        const status = (t.status === 'checked_out' ? 'checked_out' : 'active') as Tenant['status'];
        acc.push({
          id: String(t.id),
          roomId: String(t.roomId),
          propertyId: String(t.propertyId),
          nameZh: String(t.nameZh || ''),
          nameVi: String(t.nameVi || ''),
          phone: String(t.phone || ''),
          ...(t.passportNumber ? { passportNumber: String(t.passportNumber) } : {}),
          checkInDate: String(t.checkInDate || t.createdAt || new Date().toISOString()),
          ...(t.expectedCheckoutDate ? { expectedCheckoutDate: String(t.expectedCheckoutDate) } : {}),
          ...(t.actualCheckoutDate ? { actualCheckoutDate: String(t.actualCheckoutDate) } : {}),
          status,
          ...(t.notes ? { notes: String(t.notes) } : {}),
          createdAt: String(t.createdAt || new Date().toISOString()),
          updatedAt: String(t.updatedAt || t.createdAt || new Date().toISOString()),
        });
        return acc;
      }, []);

      setTenants(normalizedTenants);
      setRooms(roomsMap);
      setProperties(propsMap);
    } catch (err) {
      setError('載入租客資料失敗，請稍後再試');
      console.error('載入租客錯誤:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 篩選租客
  const filteredTenants = tenants.filter(tenant => {
    // 搜尋篩選
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        tenant.nameZh.toLowerCase().includes(searchLower) ||
        tenant.nameVi.toLowerCase().includes(searchLower) ||
        tenant.phone.includes(searchTerm) ||
        (tenant.passportNumber && tenant.passportNumber.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    // 物業篩選
    if (propertyFilter !== 'all' && tenant.propertyId !== propertyFilter) {
      return false;
    }

    // 狀態篩選
    if (statusFilter !== 'all' && tenant.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const handleCheckin = () => setCheckinOpen(true);

  const handleSubmitCheckin = async (data: CheckinSubmitPayload) => {
    try {
      const rentAmount = Number(data.rentAmount);
      const depositAmount = Number(data.depositAmount);
      const paidAmount = Number(data.paidAmount);
      const result = await api.post<{ tenant: { id: string } }>('/api/checkin/complete', {
        roomId: data.roomId,
        propertyId: data.propertyId,
        nameZh: data.nameZh,
        nameVi: data.nameVi,
        phone: data.phone,
        passportNumber: data.passportNumber.trim() || undefined,
        checkInDate: data.checkInDate,
        expectedCheckoutDate: data.expectedCheckoutDate,
        notes: data.notes || undefined,
        paymentType: data.paymentType,
        rentAmount,
        depositAmount,
        paidAmount,
        paymentAmount: paidAmount,
        paymentMethod: data.paymentMethod || 'cash',
        paymentNotes: data.notes || undefined,
      });

      try {
        await postCheckinGenerateAndMaybePay({
          paymentType: data.paymentType,
          roomId: data.roomId,
          tenantId: result.tenant.id,
          paymentMonth: paymentMonthFromCheckIn(data.checkInDate),
          paidAmountCents: paidAmount,
        });
      } catch (billErr) {
        console.error('產生收租帳單失敗', billErr);
        alert('入住已成功，但產生當月帳單失敗，請至收租管理手動處理。');
      }

      await loadTenants();
    } catch (e) {
      console.error('入住失敗', e);
      const msg =
        e instanceof ApiError ? e.message : '入住失敗，請稍後再試';
      alert(msg);
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="租客管理"
          description="管理所有租客資訊"
          actions={
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              辦理入住
            </Button>
          }
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <PageHeader
          title="租客管理"
          description="管理所有租客資訊"
          actions={<Button onClick={loadTenants}>重新載入</Button>}
        />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-red-500 text-lg font-medium">{error}</div>
              <Button 
                onClick={loadTenants}
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

  return (
    <PageShell>
      <PageHeader
        title="租客管理"
        description="管理所有租客資訊"
        actions={
          <Button onClick={handleCheckin}>
            <Plus className="mr-2 h-4 w-4" />
            辦理入住
          </Button>
        }
      />

      {/* 篩選區域 */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 搜尋框 */}
            <div className="space-y-2">
              <div className="flex items-center">
                <Search className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium">搜尋租客</span>
              </div>
              <Input
                placeholder="搜尋姓名、電話、護照號碼..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 物業篩選 */}
            <div className="space-y-2">
              <div className="flex items-center">
                <Building className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium">篩選物業</span>
              </div>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="所有物業" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有物業</SelectItem>
                  {Object.values(properties).map(property => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 狀態篩選 */}
            <div className="space-y-2">
              <div className="flex items-center">
                <Filter className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium">篩選狀態</span>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="所有狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有狀態</SelectItem>
                  <SelectItem value="active">在住中</SelectItem>
                  <SelectItem value="checked_out">已退租</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 租客卡片列表 */}
      {filteredTenants.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">尚無租客資料</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || propertyFilter !== 'all' || statusFilter !== 'all' 
                  ? '找不到符合篩選條件的租客' 
                  : '開始辦理第一位租客入住'}
              </p>
              <Button onClick={handleCheckin}>
                <Plus className="h-4 w-4 mr-2" />
                辦理入住
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((tenant) => {
            const room = rooms[tenant.roomId];
            const property = properties[tenant.propertyId];
            
            return (
              <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl font-bold text-gray-900">
                        {tenant.nameZh}
                      </CardTitle>
                    </div>
                    <Badge 
                      className={tenant.status === 'active' 
                        ? 'bg-green-100 text-green-800 border-green-200' 
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                      }
                    >
                      {tenant.status === 'active' ? '在住中' : '已退租'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center text-gray-700">
                      <div className="w-6">
                        <Building className="h-4 w-4 text-gray-500" />
                      </div>
                      <span className="ml-2">
                        {property?.name || '未知物業'} • {room?.roomNumber || '未知'} 號房
                      </span>
                    </div>
                    <div className="flex items-center text-gray-700">
                      <div className="w-6">
                        <Phone className="h-4 w-4 text-gray-500" />
                      </div>
                      <span className="ml-2">{tenant.phone}</span>
                    </div>
                    <div className="flex items-center text-gray-700">
                      <div className="w-6">
                        <Calendar className="h-4 w-4 text-gray-500" />
                      </div>
                      <span className="ml-2">
                        入住：{formatDate(tenant.checkInDate, 'short')}
                      </span>
                    </div>
                    {tenant.passportNumber && (
                      <div className="text-sm text-gray-600">
                        護照：{tenant.passportNumber}
                      </div>
                    )}
                    {tenant.expectedCheckoutDate && tenant.status === 'active' && (
                      <div className="text-sm text-gray-600">
                        預期退租：{formatDate(tenant.expectedCheckoutDate, 'short')}
                      </div>
                    )}
                    {tenant.actualCheckoutDate && tenant.status === 'checked_out' && (
                      <div className="text-sm text-gray-600">
                        實際退租：{formatDate(tenant.actualCheckoutDate, 'short')}
                      </div>
                    )}
                    {tenant.notes && (
                      <div className="text-sm text-gray-600 border-t pt-2">
                        備註：{tenant.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <Link href={`/properties/${tenant.propertyId}`}>
                        查看物業
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      查看詳情
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 統計資訊 */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>
          共 {tenants.length} 位租客 • 
          在住中：{tenants.filter(t => t.status === 'active').length} 位 • 
          已退租：{tenants.filter(t => t.status === 'checked_out').length} 位
        </p>
      </div>

      <CheckinModal
        isOpen={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        onSubmit={handleSubmitCheckin}
        rooms={Object.values(rooms)}
      />
    </PageShell>
  );
}