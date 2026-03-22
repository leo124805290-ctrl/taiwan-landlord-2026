'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Filter, PlusCircle, Wrench, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

// 維修紀錄資料類型（與後端 Maintenance 類型對應）
interface MaintenanceRecord {
  id: string;
  propertyId: string;
  propertyName?: string;
  roomId: string | null;
  roomNumber?: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedCost: number | null; // 分
  actualCost: number | null; // 分
  reportedAt: string; // ISO 字串
  startedAt: string | null;
  completedAt: string | null;
  assignedTo: string | null;
  assignedUserName?: string | null;
  reportedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// 新增/編輯維修表單資料
interface MaintenanceFormData {
  propertyId: string;
  roomId: string | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedCost: number | null;
  scheduledDate: string | null;
  assignedTo: string | null;
}

export default function MaintenancePage() {
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [formData, setFormData] = useState<MaintenanceFormData>({
    propertyId: '',
    roomId: null,
    title: '',
    description: '',
    priority: 'medium',
    estimatedCost: null,
    scheduledDate: null,
    assignedTo: null,
  });
  
  // 篩選狀態
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; number: string; propertyId: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, r, u] = await Promise.all([
          api.get<Array<{ id: string; name: string }>>('/api/properties'),
          api.get<Array<{ id: string; roomNumber: string; propertyId: string }>>('/api/rooms'),
          api.get<Array<{ id: string; email: string; fullName: string | null }>>('/api/users'),
        ]);
        setProperties(p);
        setRooms(
          r.map((room) => ({
            id: room.id,
            number: room.roomNumber,
            propertyId: room.propertyId,
          })),
        );
        setUsers(
          u.map((user) => ({
            id: user.id,
            name: user.fullName?.trim() || user.email,
          })),
        );
      } catch {
        setProperties([]);
        setRooms([]);
        setUsers([]);
      }
    })();
  }, []);

  // 載入維修紀錄
  useEffect(() => {
    loadMaintenanceRecords();
  }, []);

  const loadMaintenanceRecords = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 嘗試從 API 載入資料
      const [data, propList] = await Promise.all([
        api.get<MaintenanceRecord[]>('/api/maintenance'),
        api.get<any[]>('/api/properties'),
      ]);

      // 一致性：維修操作列表只顯示 active/demo 物業的紀錄
      const allowedPropertyIds = new Set(propList.map((p) => String(p.id)));
      const filtered = data.filter((r) => allowedPropertyIds.has(String(r.propertyId)));
      setMaintenanceRecords(filtered);
    } catch (error) {
      console.error(error);
      setMaintenanceRecords([]);
      setError(error instanceof Error ? error.message : '載入維修紀錄失敗');
    } finally {
      setIsLoading(false);
    }
  };

  // 篩選後的維修紀錄
  const filteredRecords = maintenanceRecords.filter(record => {
    if (selectedProperty !== 'all' && record.propertyId !== selectedProperty) return false;
    if (selectedStatus !== 'all' && record.status !== selectedStatus) return false;
    if (selectedPriority !== 'all' && record.priority !== selectedPriority) return false;
    return true;
  });

  // 計算統計
  const totalPending = maintenanceRecords.filter(r => r.status === 'pending').length;
  const totalInProgress = maintenanceRecords.filter(r => r.status === 'in_progress').length;
  const totalCompleted = maintenanceRecords.filter(r => r.status === 'completed').length;
  const totalEstimatedCost = maintenanceRecords.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
  const totalActualCost = maintenanceRecords
    .filter(r => r.status === 'completed' && r.actualCost)
    .reduce((sum, r) => sum + (r.actualCost || 0), 0);

  // 新增維修紀錄
  const handleAddMaintenance = () => {
    setEditingRecord(null);
    setFormData({
      propertyId: '',
      roomId: null,
      title: '',
      description: '',
      priority: 'medium',
      estimatedCost: null,
      scheduledDate: null,
      assignedTo: null,
    });
    setShowDialog(true);
  };

  // 編輯維修紀錄
  const handleEditMaintenance = (record: MaintenanceRecord) => {
    setEditingRecord(record);
    setFormData({
      propertyId: record.propertyId,
      roomId: record.roomId,
      title: record.title,
      description: record.description || '',
      priority: record.priority,
      estimatedCost: record.estimatedCost ? record.estimatedCost / 100 : null,
      scheduledDate: record.startedAt || null,
      assignedTo: record.assignedTo,
    });
    setShowDialog(true);
  };

  // 更新維修狀態
  const handleUpdateStatus = async (id: string, newStatus: MaintenanceRecord['status']) => {
    try {
      const updated = await api.patch(`/api/maintenance/${id}/status`, {
        status: newStatus,
        completedDate: newStatus === 'completed' ? new Date().toISOString() : null,
      });
      
      setMaintenanceRecords(prev => 
        prev.map(r => r.id === id ? { ...r, ...updated, status: newStatus } : r)
      );
    } catch (error) {
      console.error('狀態更新失敗', error);
      alert('狀態更新失敗，請稍後再試');
    }
  };

  // 刪除維修紀錄（軟刪除）
  const handleDeleteMaintenance = async (id: string) => {
    if (!confirm('確定要刪除這筆維修紀錄嗎？')) return;

    try {
      await api.delete(`/api/maintenance/${id}`);
      setMaintenanceRecords(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error('刪除失敗', error);
      alert('刪除失敗，請稍後再試');
    }
  };

  // 儲存維修紀錄（新增或更新）
  const handleSaveMaintenance = async () => {
    // 驗證
    if (!formData.propertyId || !formData.title) {
      alert('請填寫必填欄位（物業、標題）');
      return;
    }

    const payload = {
      ...formData,
      estimatedCost: formData.estimatedCost ? Math.round(formData.estimatedCost * 100) : null,
      scheduledDate: formData.scheduledDate || null,
      roomId: formData.roomId || null,
      description: formData.description || null,
      assignedTo: formData.assignedTo || null,
    };

    try {
      if (editingRecord) {
        // 更新 - 注意：目前後端只有狀態更新 API，需擴充
        alert('編輯功能開發中，目前只支援新增和刪除');
        setShowDialog(false);
      } else {
        // 新增
        const newRecord = await api.post('/api/maintenance', payload);
        setMaintenanceRecords(prev => [newRecord, ...prev]);
        setShowDialog(false);
      }
    } catch (error) {
      console.error('儲存失敗', error);
      alert('儲存失敗，請稍後再試');
    }
  };

  // 狀態標籤顏色
  const getStatusBadge = (status: MaintenanceRecord['status']) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">待處理</Badge>;
      case 'in_progress': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">進行中</Badge>;
      case 'completed': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">已完成</Badge>;
      case 'cancelled': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">已取消</Badge>;
      default: return <Badge>未知</Badge>;
    }
  };

  // 優先級標籤
  const getPriorityBadge = (priority: MaintenanceRecord['priority']) => {
    switch (priority) {
      case 'low': return <Badge variant="outline" className="border-gray-300 text-gray-700">低</Badge>;
      case 'medium': return <Badge variant="outline" className="border-blue-300 text-blue-700">中</Badge>;
      case 'high': return <Badge variant="outline" className="border-orange-300 text-orange-700">高</Badge>;
      case 'urgent': return <Badge variant="outline" className="border-red-300 text-red-700">緊急</Badge>;
      default: return <Badge variant="outline">未知</Badge>;
    }
  };

  // 狀態圖示
  const getStatusIcon = (status: MaintenanceRecord['status']) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'in_progress': return <AlertCircle className="h-4 w-4 text-blue-600" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-gray-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  // 清空篩選
  const handleClearFilters = () => {
    setSelectedProperty('all');
    setSelectedStatus('all');
    setSelectedPriority('all');
  };

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="維修紀錄管理"
          description="管理物業維修需求、追蹤處理進度、記錄維修成本"
          actions={
            <>
              <Button onClick={handleAddMaintenance}>
                <PlusCircle className="mr-2 h-4 w-4" />
                新增維修
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                匯出報表
              </Button>
            </>
          }
        />

        {/* 統計卡片 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待處理</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{totalPending}</div>
              <p className="text-xs text-muted-foreground">
                需要處理的維修案件
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">進行中</CardTitle>
              <AlertCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{totalInProgress}</div>
              <p className="text-xs text-muted-foreground">
                正在處理中的案件
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已完成</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalCompleted}</div>
              <p className="text-xs text-muted-foreground">
                已完成的維修案件
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">維修成本</CardTitle>
              <Wrench className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(totalActualCost)}</div>
              <p className="text-xs text-muted-foreground">
                預估 {formatCurrency(totalEstimatedCost)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 篩選器 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="mr-2 h-5 w-5" />
              篩選條件
            </CardTitle>
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
                    {properties.map(property => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">狀態</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有狀態</SelectItem>
                    <SelectItem value="pending">待處理</SelectItem>
                    <SelectItem value="in_progress">進行中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                    <SelectItem value="cancelled">已取消</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">優先級</Label>
                <Select value={selectedPriority} onValueChange={setSelectedPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇優先級" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有優先級</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="urgent">緊急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex space-x-2">
                  <Button className="flex-1" onClick={loadMaintenanceRecords}>
                    重新整理
                  </Button>
                  <Button variant="outline" onClick={handleClearFilters}>
                    清空
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 維修紀錄列表 */}
        <Card>
          <CardHeader>
            <CardTitle>維修紀錄列表</CardTitle>
            <CardDescription>
              共 {filteredRecords.length} 筆維修紀錄
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
                <Button variant="outline" onClick={loadMaintenanceRecords} className="mt-2">
                  重試
                </Button>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">沒有符合條件的維修紀錄</p>
                <Button variant="outline" onClick={handleClearFilters} className="mt-2">
                  清除篩選
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>狀態</TableHead>
                      <TableHead>標題</TableHead>
                      <TableHead>物業/房間</TableHead>
                      <TableHead>優先級</TableHead>
                      <TableHead>報告時間</TableHead>
                      <TableHead>負責人</TableHead>
                      <TableHead>預估成本</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex items-center">
                            {getStatusIcon(record.status)}
                            <span className="ml-2">{getStatusBadge(record.status)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            <div>{record.title}</div>
                            <div className="text-sm text-muted-foreground truncate max-w-xs">
                              {record.description || '無描述'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{record.propertyName || record.propertyId}</div>
                            <div className="text-sm text-muted-foreground">
                              {record.roomNumber || '公共區域'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getPriorityBadge(record.priority)}</TableCell>
                        <TableCell>{formatDate(record.reportedAt)}</TableCell>
                        <TableCell>
                          {record.assignedUserName || record.assignedTo || '未指派'}
                        </TableCell>
                        <TableCell>
                          {record.estimatedCost ? (
                            <div className="font-medium">
                              {formatCurrency(record.estimatedCost)}
                              {record.actualCost && record.status === 'completed' && (
                                <div className="text-sm text-muted-foreground">
                                  實際：{formatCurrency(record.actualCost)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">未估價</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {record.status === 'pending' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(record.id, 'in_progress')}
                                >
                                  開始處理
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateStatus(record.id, 'cancelled')}
                                >
                                  取消
                                </Button>
                              </>
                            )}
                            {record.status === 'in_progress' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(record.id, 'completed')}
                              >
                                標記完成
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditMaintenance(record)}
                            >
                              編輯
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteMaintenance(record.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              刪除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      

      {/* 新增/編輯維修對話框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? '編輯維修紀錄' : '新增維修紀錄'}
            </DialogTitle>
            <DialogDescription>
              {editingRecord 
                ? '修改維修紀錄資訊' 
                : '記錄新的維修需求'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyId">物業 *</Label>
                <Select 
                  value={formData.propertyId} 
                  onValueChange={(value) => setFormData({...formData, propertyId: value, roomId: null})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇物業" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(property => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roomId">房間（選填）</Label>
                <Select 
                  value={formData.roomId || '__public__'} 
                  onValueChange={(value) => setFormData({...formData, roomId: value === '__public__' ? null : value})}
                  disabled={!formData.propertyId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇房間" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__public__">公共區域</SelectItem>
                    {rooms
                      .filter(room => room.propertyId === formData.propertyId)
                      .map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.number}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">維修標題 *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="輸入維修標題"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">維修描述（選填）</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="輸入維修詳細描述"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">優先級</Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value: 'low' | 'medium' | 'high' | 'urgent') => setFormData({...formData, priority: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇優先級" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="urgent">緊急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedCost">預估成本（元，選填）</Label>
                <Input
                  id="estimatedCost"
                  type="number"
                  value={formData.estimatedCost || ''}
                  onChange={(e) => setFormData({...formData, estimatedCost: e.target.value ? parseFloat(e.target.value) : null})}
                  placeholder="輸入預估成本"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">預定處理日期（選填）</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={formData.scheduledDate || ''}
                  onChange={(e) => setFormData({...formData, scheduledDate: e.target.value || null})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignedTo">指派給（選填）</Label>
                <Select 
                  value={formData.assignedTo || '__unassigned__'} 
                  onValueChange={(value) => setFormData({...formData, assignedTo: value === '__unassigned__' ? null : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇負責人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">未指派</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveMaintenance}>
              {editingRecord ? '更新' : '新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageShell>
  );
}