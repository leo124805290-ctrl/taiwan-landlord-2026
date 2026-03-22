'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Building, Home } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

interface Property {
  id: string;
  name: string;
}

type RoomStatus = 'vacant' | 'occupied' | 'reserved' | 'maintenance';

interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  electricityRate: number;
  status: RoomStatus | string;
  deletedAt?: string | null;
}

const roomStatusConfig: Record<RoomStatus, { label: string; color: string }> = {
  vacant: { label: '空房', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  occupied: { label: '已入住', color: 'bg-green-100 text-green-800 border-green-200' },
  reserved: { label: '已預訂', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  maintenance: { label: '維修中', color: 'bg-red-100 text-red-800 border-red-200' },
};

export default function RoomsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [props, rms] = await Promise.all([
          api.get<Property[]>('/api/properties'),
          api.get<Room[]>('/api/rooms'),
        ]);
        setProperties(props);
        setRooms(rms);
      } catch (err) {
        console.error('載入房間列表失敗', err);
        setError('載入房間資料失敗，請稍後再試');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p.name])),
    [properties]
  );

  const filteredRooms = useMemo(
    () =>
      rooms.filter((room) => {
        // 避免顯示「已不在管理清單」的物業所屬房間（例如剛封存/刪除）
        if (!propertyMap.has(room.propertyId)) return false;
        return selectedPropertyId === 'all' ? true : room.propertyId === selectedPropertyId;
      }),
    [rooms, selectedPropertyId, propertyMap]
  );

  const stats = useMemo(() => {
    const total = filteredRooms.length;
    const occupied = filteredRooms.filter((r) => r.status === 'occupied').length;
    const vacant = filteredRooms.filter((r) => r.status === 'vacant').length;
    const reserved = filteredRooms.filter((r) => r.status === 'reserved').length;
    const maintenance = filteredRooms.filter((r) => r.status === 'maintenance').length;
    const rate = total ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, vacant, reserved, maintenance, rate };
  }, [filteredRooms]);

  return (
    <PageShell>
      <PageHeader
        title="房間管理"
        description="跨物業檢視與篩選所有房間"
        actions={
          <div className="flex items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
            >
              <option value="all">全部物業</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectedPropertyId !== 'all' && (
              <Link href={`/properties/${selectedPropertyId}`}>
                <Button variant="outline" size="sm">
                  <Building className="h-4 w-4 mr-1" />
                  前往物業
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-center text-red-600 text-sm">{error}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-gray-600">總房數</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-gray-600">已入住</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-green-700">{stats.occupied}</span>
              <span className="text-xs text-gray-500">
                入住率 {stats.rate}
                %
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-gray-600">空房</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{stats.vacant}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm text-gray-600">維修中</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{stats.maintenance}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10">
            <div className="text-center">
              <Home className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <div className="text-gray-700 font-medium mb-1">目前沒有符合條件的房間</div>
              <div className="text-gray-500 text-sm">
                嘗試切換上方物業篩選，或從物業頁面建立新房間
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <Card key={room.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-bold text-gray-900">
                      {room.roomNumber} 號房
                    </CardTitle>
                    <div className="text-xs text-gray-500 mt-1">
                      {propertyMap.get(room.propertyId) || '未知物業'} · {room.floor} 樓
                    </div>
                  </div>
                  {(() => {
                    const meta =
                      roomStatusConfig[room.status as RoomStatus] ??
                      roomStatusConfig.vacant;
                    return (
                      <Badge className={meta.color}>
                        {meta.label}
                      </Badge>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">月租金</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(room.monthlyRent)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">押金</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(room.depositAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">電費單價</span>
                  <span className="font-semibold text-gray-900">
                    {(room.electricityRate / 100).toFixed(2)} 元/度
                  </span>
                </div>
                <div className="pt-2">
                  <Link href={`/properties/${room.propertyId}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      前往房間管理
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

