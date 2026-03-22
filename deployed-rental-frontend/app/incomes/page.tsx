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
import { Download, Filter, PlusCircle, Coins, DollarSign, Home, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

// 補充收入資料類型（與後端 ExtraIncome 類型對應）
interface ExtraIncome {
  id: string;
  propertyId: string;
  propertyName?: string;
  type: 'laundry' | 'vending' | 'other';
  amount: number; // 分
  incomeDate: string; // ISO 字串
  description: string | null;
  createdAt: string;
  deletedAt: string | null;
}

// 新增收入表單資料
interface IncomeFormData {
  propertyId: string;
  type: 'laundry' | 'vending' | 'other';
  amount: number;
  incomeDate: string;
  description: string;
}

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<ExtraIncome[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState<IncomeFormData>({
    propertyId: '',
    type: 'laundry',
    amount: 0,
    incomeDate: new Date().toISOString().split('T')[0] ?? '',
    description: '',
  });
  
  // 篩選狀態
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get<Array<{ id: string; name: string }>>('/api/properties');
        setProperties(p);
      } catch {
        setProperties([]);
      }
    })();
  }, []);

  // 載入收入資料
  useEffect(() => {
    loadIncomes();
  }, []);

  const loadIncomes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 嘗試從 API 載入資料
      const data = await api.get<ExtraIncome[]>('/api/incomes');
      setIncomes(data);
    } catch (error) {
      console.error(error);
      setIncomes([]);
      setError(error instanceof Error ? error.message : '載入收入失敗');
    } finally {
      setIsLoading(false);
    }
  };

  // 篩選後的收入
  const filteredIncomes = incomes.filter(income => {
    if (selectedProperty !== 'all' && income.propertyId !== selectedProperty) return false;
    if (selectedType !== 'all' && income.type !== selectedType) return false;
    
    // 日期範圍篩選
    if (dateRange.from || dateRange.to) {
      const incomeDate = String(income.incomeDate || '').split('T')[0] ?? '';
      if (dateRange.from && incomeDate && incomeDate < dateRange.from) return false;
      if (dateRange.to && incomeDate && incomeDate > dateRange.to) return false;
    }
    
    return true;
  });

  // 計算統計
  const totalLaundry = incomes
    .filter(i => i.type === 'laundry')
    .reduce((sum, i) => sum + i.amount, 0);
  
  const totalVending = incomes
    .filter(i => i.type === 'vending')
    .reduce((sum, i) => sum + i.amount, 0);
  
  const totalOther = incomes
    .filter(i => i.type === 'other')
    .reduce((sum, i) => sum + i.amount, 0);
  
  const totalThisMonth = incomes
    .filter(i => {
      const incomeDate = new Date(i.incomeDate);
      const now = new Date();
      return incomeDate.getMonth() === now.getMonth() && 
             incomeDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, i) => sum + i.amount, 0);

  // 新增收入
  const handleAddIncome = () => {
    setFormData({
      propertyId: '',
      type: 'laundry',
      amount: 0,
      incomeDate: new Date().toISOString().split('T')[0] ?? '',
      description: '',
    });
    setShowDialog(true);
  };

  // 刪除收入（軟刪除）
  const handleDeleteIncome = async (id: string) => {
    if (!confirm('確定要刪除這筆收入紀錄嗎？')) return;

    try {
      await api.delete(`/api/incomes/${id}`);
      // 從列表中移除
      setIncomes(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error('刪除失敗', error);
      alert('刪除失敗，請稍後再試');
    }
  };

  // 儲存收入
  const handleSaveIncome = async () => {
    // 驗證
    if (!formData.propertyId || !formData.amount || !formData.incomeDate) {
      alert('請填寫必填欄位（物業、金額、日期）');
      return;
    }

    const payload = {
      ...formData,
      amount: Math.round(formData.amount * 100), // 轉換為分
      incomeDate: new Date(formData.incomeDate).toISOString(),
      description: formData.description || null,
    };

    try {
      const newIncome = await api.post('/api/incomes', payload);
      setIncomes(prev => [newIncome, ...prev]);
      setShowDialog(false);
    } catch (error) {
      console.error('儲存失敗', error);
      alert('儲存失敗，請稍後再試');
    }
  };

  // 類型標籤
  const getTypeBadge = (type: ExtraIncome['type']) => {
    switch (type) {
      case 'laundry': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">洗衣機</Badge>;
      case 'vending': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">販賣機</Badge>;
      case 'other': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">其他</Badge>;
      default: return <Badge>未知</Badge>;
    }
  };

  // 清空篩選
  const handleClearFilters = () => {
    setSelectedProperty('all');
    setSelectedType('all');
    setDateRange({ from: '', to: '' });
  };

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="補充收入"
          description="管理洗衣機、販賣機等其他補充收入來源"
          actions={
            <>
              <Button onClick={handleAddIncome}>
                <PlusCircle className="mr-2 h-4 w-4" />
                新增收入
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
              <CardTitle className="text-sm font-medium">洗衣機收入</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalLaundry)}</div>
              <p className="text-xs text-muted-foreground">
                {incomes.filter(i => i.type === 'laundry').length} 筆紀錄
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">販賣機收入</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalVending)}</div>
              <p className="text-xs text-muted-foreground">
                {incomes.filter(i => i.type === 'vending').length} 筆紀錄
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">其他收入</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalOther)}</div>
              <p className="text-xs text-muted-foreground">
                {incomes.filter(i => i.type === 'other').length} 筆紀錄
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本月收入</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalThisMonth)}</div>
              <p className="text-xs text-muted-foreground">
                本月累計補充收入
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
                <Label htmlFor="type">收入類型</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有類型</SelectItem>
                    <SelectItem value="laundry">洗衣機</SelectItem>
                    <SelectItem value="vending">販賣機</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">日期範圍</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    id="date-from"
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    placeholder="開始日期"
                  />
                  <Input
                    id="date-to"
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    placeholder="結束日期"
                  />
                </div>
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex space-x-2">
                  <Button className="flex-1" onClick={loadIncomes}>
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

        {/* 收入列表 */}
        <Card>
          <CardHeader>
            <CardTitle>收入紀錄</CardTitle>
            <CardDescription>
              共 {filteredIncomes.length} 筆收入，總金額 {formatCurrency(filteredIncomes.reduce((sum, i) => sum + i.amount, 0))}
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
                <Button variant="outline" onClick={loadIncomes} className="mt-2">
                  重試
                </Button>
              </div>
            ) : filteredIncomes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">沒有符合條件的收入紀錄</p>
                <Button variant="outline" onClick={handleClearFilters} className="mt-2">
                  清除篩選
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>類型</TableHead>
                      <TableHead>物業</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncomes.map((income) => (
                      <TableRow key={income.id}>
                        <TableCell className="font-medium">
                          {formatDate(income.incomeDate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {getTypeBadge(income.type)}
                          </div>
                        </TableCell>
                        <TableCell>{income.propertyName || income.propertyId}</TableCell>
                        <TableCell className="font-bold text-green-600">
                          {formatCurrency(income.amount)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {income.description || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteIncome(income.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            刪除
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
      

      {/* 新增收入對話框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增補充收入</DialogTitle>
            <DialogDescription>
              記錄洗衣機、販賣機或其他補充收入
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="propertyId">物業 *</Label>
              <Select 
                value={formData.propertyId} 
                onValueChange={(value) => setFormData({...formData, propertyId: value})}
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
              <Label htmlFor="type">收入類型 *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: 'laundry' | 'vending' | 'other') => setFormData({...formData, type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇類型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laundry">洗衣機</SelectItem>
                  <SelectItem value="vending">販賣機</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">金額（元） *</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  placeholder="輸入金額"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="incomeDate">日期 *</Label>
                <Input
                  id="incomeDate"
                  type="date"
                  value={formData.incomeDate}
                  onChange={(e) => setFormData({...formData, incomeDate: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述（選填）</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="輸入收入描述"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveIncome}>
              新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageShell>
  );
}