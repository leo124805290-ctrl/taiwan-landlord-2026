'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Building, MapPin, Phone, Calendar, Archive, RotateCcw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import PropertyForm, { type PropertyFormData, type PropertyFormSubmitData } from './components/property-form';
import { api } from '@/lib/api-client';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

// 模擬物業資料類型
interface Property {
  id: string;
  name: string;
  address: string;
  totalFloors: number;
  totalRooms?: number;
  landlordName: string;
  landlordPhone: string;
  landlordDeposit: number;
  landlordMonthlyRent: number;
  prepayCycleMonths: number;
  contractStartDate: string | null;
  contractEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  status?: 'active' | 'archived' | 'demo' | string;
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // 載入物業資料
  useEffect(() => {
    loadProperties();
  }, [showArchived]);

  const loadProperties = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = showArchived ? '/api/properties?include_archived=true' : '/api/properties';
      const data = await api.get<Property[]>(endpoint);
      setProperties(data);
    } catch (err) {
      console.error(err);
      setProperties([]);
      setError(err instanceof Error ? err.message : '載入物業失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProperty = () => {
    setEditingProperty(null);
    setFormOpen(true);
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property);
    setFormOpen(true);
  };

  const handleDeleteProperty = (property: Property) => {
    const status = property.status || 'active';
    const isDemo = status === 'demo';

    if (
      !confirm(
        isDemo
          ? `確定要「刪除測試用物業」：${property.name}？\n\n這只允許刪除 demo 物業，歷史資料仍可能受到資料庫設定影響。`
          : `確定要「封存物業」：${property.name}？\n\n封存後會從管理清單消失，但可透過 restore 復原（不會硬刪）。`,
      )
    ) {
      return;
    }

    (async () => {
      try {
        if (isDemo) {
          await api.delete(`/api/properties/${property.id}`);
        } else {
          await api.patch(`/api/properties/${property.id}/archive`);
        }
        await loadProperties();
      } catch (err) {
        console.error('封存/刪除物業失敗', err);
        alert('操作失敗，請稍後再試');
      }
    })();
  };

  const handleRestoreProperty = (property: Property) => {
    if (!confirm(`確定要「恢復使用中」：${property.name}？`)) return;

    (async () => {
      try {
        await api.patch(`/api/properties/${property.id}/restore`);
        await loadProperties();
      } catch (err) {
        console.error('恢復物業失敗', err);
        alert('恢復失敗，請稍後再試');
      }
    })();
  };

  const handleDeleteAllDemoProperties = () => {
    if (
      !confirm(
        '確定要「刪除所有測試用物業（demo）」嗎？\n\n此操作會硬刪 demo 物業及其關聯資料，無法復原。',
      )
    ) {
      return;
    }

    (async () => {
      try {
        // 不依賴目前頁面 showArchived 狀態，直接抓全量，避免漏掉 demo
        const all = await api.get<Property[]>('/api/properties?include_archived=true');
        const demos = all.filter((p) => (p.status || 'active') === 'demo');

        if (demos.length === 0) {
          alert('目前沒有測試用（demo）物業可刪除。');
          return;
        }

        // 逐一刪除，確保依序執行並更容易定位失敗原因
        for (const p of demos) {
          await api.delete(`/api/properties/${p.id}`);
        }

        await loadProperties();
      } catch (err) {
        console.error('刪除所有 demo 物業失敗', err);
        alert('刪除失敗，請稍後再試');
      }
    })();
  };

  const handleSubmitProperty = async (data: PropertyFormSubmitData) => {
    // PropertyForm 使用的是表單資料（非後端格式），這裡做最小映射
    const payload = {
      name: data.name,
      address: data.address,
      totalFloors: Number(data.totalFloors || 1),
      landlordName: data.landlordName,
      landlordPhone: data.landlordPhone,
      landlordDeposit: Number(data.landlordDeposit || 0),
      landlordMonthlyRent: Number(data.landlordMonthlyRent || 0),
      prepayCycleMonths: Number(data.prepaidPeriod || 1),
      contractStartDate: data.contractStartDate ? new Date(data.contractStartDate).toISOString() : null,
      contractEndDate: data.contractEndDate ? new Date(data.contractEndDate).toISOString() : null,
      // 後端用來判定可否硬刪的 demo 旗標
      is_demo: data.isDemo,
    };

    try {
      if (editingProperty) {
        const updated = await api.put<Property>(`/api/properties/${editingProperty.id}`, payload);
        setProperties((prev) => prev.map((p) => (p.id === editingProperty.id ? updated : p)));
        setFormOpen(false);
      } else {
        const created = await api.post<Property>('/api/properties', payload);
        // 建立房間（逐間呼叫 POST /api/rooms）
        for (const cfg of data.floorConfigs) {
          const roomCount = Math.max(0, Number(cfg.roomCount) || 0);
          for (let i = 1; i <= roomCount; i++) {
            const roomNumber = String(cfg.floor * 100 + i);
            await api.post('/api/rooms', {
              propertyId: created.id,
              roomNumber,
              floor: cfg.floor,
              monthlyRent: Number(cfg.monthlyRent || 0), // 元
              depositAmount: Number(cfg.depositAmount || 0), // 元
              electricityRate: Math.round(Number(cfg.electricityPrice || 0) * 100), // 分
              status: 'vacant',
            });
          }
        }

        setProperties((prev) => [created, ...prev]);
        setFormOpen(false);
        router.push(`/properties/${created.id}`);
      }
    } catch (err) {
      console.error('儲存物業失敗', err);
      alert('儲存失敗，請稍後再試');
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="物業管理"
          description="管理您的租屋物業資訊"
          actions={
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              新增物業
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
          title="物業管理"
          description="管理您的租屋物業資訊"
          actions={<Button onClick={loadProperties}>重新載入</Button>}
        />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-red-500 text-lg font-medium">{error}</div>
              <Button 
                onClick={loadProperties}
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
        title="物業管理"
        description="管理您的租屋物業資訊"
        actions={
          <>
            <Button onClick={handleAddProperty}>
              <Plus className="mr-2 h-4 w-4" />
              新增物業
            </Button>
            <Button
              variant="outline"
              onClick={handleDeleteAllDemoProperties}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              刪除所有測試
            </Button>
            <Button
              variant={showArchived ? 'default' : 'outline'}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? '只看使用中' : '顯示已封存'}
            </Button>
          </>
        }
      />

      {properties.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Building className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">尚無物業資料</h3>
              <p className="text-gray-600 mb-6">開始新增您的第一個租屋物業</p>
              <Button onClick={handleAddProperty}>
                <Plus className="mr-2 h-4 w-4" />
                新增物業
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <Card key={property.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900">
                      {property.name}
                    </CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {property.status === 'archived' ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          已封存
                        </Badge>
                      ) : property.status === 'demo' ? (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          測試用
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          使用中
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="flex items-center mt-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      {property.address}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {property.totalFloors} 層樓
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center text-gray-700">
                    <div className="w-6">
                      <Building className="h-4 w-4 text-gray-500" />
                    </div>
                    <span className="ml-2 font-medium">{property.landlordName}</span>
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

                <div className="grid grid-cols-2 gap-3 pt-4 border-t">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">押金</div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(property.landlordDeposit)}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">月租金</div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(property.landlordMonthlyRent)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditProperty(property)}
                    disabled={property.status === 'archived'}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    編輯
                  </Button>
                  {property.status === 'archived' ? (
                    <Button variant="default" size="sm" className="w-full" disabled>
                      房間管理
                    </Button>
                  ) : (
                    <Link href={`/properties/${property.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        房間管理
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className={
                      property.status === 'demo'
                        ? 'text-red-600 border-red-200 hover:bg-red-50'
                        : property.status === 'archived'
                          ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          : 'text-slate-700 border-slate-200 hover:bg-slate-50'
                    }
                    onClick={() =>
                      property.status === 'archived'
                        ? handleRestoreProperty(property)
                        : handleDeleteProperty(property)
                    }
                  >
                    {property.status === 'archived' ? (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    ) : property.status === 'demo' ? (
                      <Trash2 className="h-4 w-4 mr-2" />
                    ) : (
                      <Archive className="h-4 w-4 mr-2" />
                    )}
                    {property.status === 'archived'
                      ? '恢復'
                      : property.status === 'demo'
                        ? '刪除'
                        : '封存'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 text-center text-sm text-gray-500">
        <p>共 {properties.length} 個物業 • 系統建置中 v2.0</p>
      </div>

      <PropertyForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmitProperty}
        isEditing={!!editingProperty}
        {...(editingProperty
          ? {
              initialData: {
                name: editingProperty.name,
                address: editingProperty.address,
                totalFloors: editingProperty.totalFloors,
                landlordName: editingProperty.landlordName,
                landlordPhone: editingProperty.landlordPhone,
                landlordDeposit: editingProperty.landlordDeposit,
                landlordMonthlyRent: editingProperty.landlordMonthlyRent,
                prepaidPeriod: editingProperty.prepayCycleMonths,
                isDemo: editingProperty.status === 'demo',
                ...(editingProperty.contractStartDate
                  ? { contractStartDate: editingProperty.contractStartDate.split('T')[0] }
                  : {}),
                ...(editingProperty.contractEndDate
                  ? { contractEndDate: editingProperty.contractEndDate.split('T')[0] }
                  : {}),
              } satisfies Partial<PropertyFormData>,
            }
          : {})}
      />
    </PageShell>
  );
}