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
import { Download, Filter, PlusCircle, Building, DollarSign, CreditCard } from 'lucide-react';
import { formatCents, formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/app-shell/page-header';
import { PageShell } from '@/components/app-shell/page-shell';

// 支出資料類型（與後端 Expense 類型對應）
interface Expense {
  id: string;
  propertyId: string;
  propertyName?: string;
  roomId: string | null;
  roomNumber?: string;
  type: 'fixed' | 'capital';
  category: 'rent' | 'utilities' | 'renovation' | 'equipment' | 'deposit' | 'other';
  amount: number; // 分
  expenseDate: string; // ISO 字串
  description: string | null;
  receiptUrl: string | null;
  recurring: boolean;
  recurringPeriod: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// 新增/編輯支出表單資料
interface ExpenseFormData {
  propertyId: string;
  roomId: string | null;
  type: 'fixed' | 'capital';
  category: 'rent' | 'utilities' | 'renovation' | 'equipment' | 'deposit' | 'other';
  amount: number;
  expenseDate: string;
  description: string;
  recurring: boolean;
  recurringPeriod: string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<ExpenseFormData>({
    propertyId: '',
    roomId: null,
    type: 'fixed',
    category: 'rent',
    amount: 0,
    expenseDate: new Date().toISOString().split('T')[0] ?? '',
    description: '',
    recurring: false,
    recurringPeriod: 'monthly',
  });
  // 篩選狀態
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; number: string; propertyId: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, r] = await Promise.all([
          api.get<Array<{ id: string; name: string }>>('/api/properties'),
          api.get<Array<{ id: string; roomNumber: string; propertyId: string }>>('/api/rooms'),
        ]);
        setProperties(p);
        setRooms(
          r.map((room) => ({
            id: room.id,
            number: room.roomNumber,
            propertyId: room.propertyId,
          })),
        );
      } catch {
        setProperties([]);
        setRooms([]);
      }
    })();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await api.get<Expense[]>('/api/expenses');
      setExpenses(data);
    } catch (err) {
      console.error(err);
      setExpenses([]);
      setError(err instanceof Error ? err.message : '載入支出失敗');
    } finally {
      setIsLoading(false);
    }
  };

  // 篩選後的支出
  const filteredExpenses = expenses.filter(expense => {
    if (selectedProperty !== 'all' && expense.propertyId !== selectedProperty) return false;
    if (selectedType !== 'all' && expense.type !== selectedType) return false;
    if (selectedCategory !== 'all' && expense.category !== selectedCategory) return false;
    
    // 日期範圍篩選
    if (dateRange.from || dateRange.to) {
      const expenseDate = String(expense.expenseDate || '').split('T')[0] ?? '';
      if (dateRange.from && expenseDate && expenseDate < dateRange.from) return false;
      if (dateRange.to && expenseDate && expenseDate > dateRange.to) return false;
    }
    
    return true;
  });

  // 計算統計
  const totalFixed = expenses
    .filter(e => e.type === 'fixed')
    .reduce((sum, e) => sum + e.amount, 0);
  
  const totalCapital = expenses
    .filter(e => e.type === 'capital')
    .reduce((sum, e) => sum + e.amount, 0);
  
  const totalThisMonth = expenses
    .filter(e => {
      const expenseDate = new Date(e.expenseDate);
      const now = new Date();
      return expenseDate.getMonth() === now.getMonth() && 
             expenseDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // 新增支出
  const handleAddExpense = () => {
    setEditingExpense(null);
    setFormData({
      propertyId: '',
      roomId: null,
      type: 'fixed',
      category: 'rent',
      amount: 0,
      expenseDate: new Date().toISOString().split('T')[0] ?? '',
      description: '',
      recurring: false,
      recurringPeriod: 'monthly',
    });
    setShowDialog(true);
  };

  // 編輯支出
  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      propertyId: expense.propertyId,
      roomId: expense.roomId,
      type: expense.type,
      category: expense.category,
      amount: expense.amount / 100, // 轉換為元
      expenseDate: String(expense.expenseDate || '').split('T')[0] ?? '',
      description: expense.description || '',
      recurring: expense.recurring,
      recurringPeriod: expense.recurringPeriod || 'monthly',
    });
    setShowDialog(true);
  };

  // 刪除支出（軟刪除）
  const handleDeleteExpense = async (id: string) => {
    if (!confirm('確定要刪除這筆支出紀錄嗎？')) return;

    try {
      await api.delete(`/api/expenses/${id}`);
      // 從列表中移除
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('刪除失敗', error);
      alert('刪除失敗，請稍後再試');
    }
  };

  // 儲存支出（新增或更新）
  const handleSaveExpense = async () => {
    // 驗證
    if (!formData.propertyId || !formData.amount || !formData.expenseDate) {
      alert('請填寫必填欄位（物業、金額、日期）');
      return;
    }

    const payload = {
      ...formData,
      amount: Math.round(formData.amount * 100), // 轉換為分
      expenseDate: new Date(formData.expenseDate).toISOString(),
      roomId: formData.roomId || null,
      description: formData.description || null,
      recurringPeriod: formData.recurring ? formData.recurringPeriod : null,
    };

    try {
      if (editingExpense) {
        // 更新
        const updated = await api.put(`/api/expenses/${editingExpense.id}`, payload);
        setExpenses(prev => prev.map(e => e.id === editingExpense.id ? updated : e));
      } else {
        // 新增
        const newExpense = await api.post('/api/expenses', payload);
        setExpenses(prev => [newExpense, ...prev]);
      }
      setShowDialog(false);
    } catch (error) {
      console.error('儲存失敗', error);
      alert('儲存失敗，請稍後再試');
    }
  };

  // 類型標籤顏色
  const getTypeBadge = (type: Expense['type']) => {
    switch (type) {
      case 'fixed': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">固定費用</Badge>;
      case 'capital': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">資本支出</Badge>;
      default: return <Badge>未知</Badge>;
    }
  };

  // 類別標籤
  const getCategoryBadge = (category: Expense['category']) => {
    const categoryMap: Record<Expense['category'], string> = {
      rent: '租金',
      utilities: '水電',
      renovation: '裝潢',
      equipment: '設備',
      deposit: '押金',
      other: '其他',
    };
    return <Badge variant="outline">{categoryMap[category]}</Badge>;
  };

  // 定期標示
  const getRecurringBadge = (recurring: boolean, period: string | null) => {
    if (!recurring) return null;
    
    const periodMap: Record<string, string> = {
      monthly: '每月',
      quarterly: '每季',
      yearly: '每年',
    };
    
    return (
      <Badge variant="secondary" className="ml-2">
        {periodMap[period || 'monthly']}定期
      </Badge>
    );
  };

  // 清空篩選
  const handleClearFilters = () => {
    setSelectedProperty('all');
    setSelectedType('all');
    setSelectedCategory('all');
    setDateRange({ from: '', to: '' });
  };

  return (
    <PageShell>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="支出管理"
          description="管理固定費用與資本支出，追蹤物業運營成本"
          actions={
            <>
              <Button onClick={handleAddExpense}>
                <PlusCircle className="mr-2 h-4 w-4" />
                新增支出
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                匯出報表
              </Button>
            </>
          }
        />

        {/* 統計卡片 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">固定費用</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCents(totalFixed)}</div>
              <p className="text-xs text-muted-foreground">
                {expenses.filter(e => e.type === 'fixed').length} 筆固定支出
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">資本支出</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCents(totalCapital)}</div>
              <p className="text-xs text-muted-foreground">
                {expenses.filter(e => e.type === 'capital').length} 筆資本支出
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本月支出</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCents(totalThisMonth)}</div>
              <p className="text-xs text-muted-foreground">
                本月累計支出
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                <Label htmlFor="type">支出類型</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有類型</SelectItem>
                    <SelectItem value="fixed">固定費用</SelectItem>
                    <SelectItem value="capital">資本支出</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">類別</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類別" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有類別</SelectItem>
                    <SelectItem value="rent">租金</SelectItem>
                    <SelectItem value="utilities">水電</SelectItem>
                    <SelectItem value="renovation">裝潢</SelectItem>
                    <SelectItem value="equipment">設備</SelectItem>
                    <SelectItem value="deposit">押金</SelectItem>
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
                  <Button className="flex-1" onClick={loadExpenses}>
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

        {/* 支出列表 */}
        <Card>
          <CardHeader>
            <CardTitle>支出紀錄</CardTitle>
            <CardDescription>
              共 {filteredExpenses.length} 筆支出，總金額 {formatCents(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}
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
                <Button variant="outline" onClick={loadExpenses} className="mt-2">
                  重試
                </Button>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">沒有符合條件的支出紀錄</p>
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
                      <TableHead>類別</TableHead>
                      <TableHead>物業</TableHead>
                      <TableHead>房間</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="font-medium">
                          {formatDate(expense.expenseDate)}
                          {expense.recurring && (
                            <span className="ml-2 text-xs text-muted-foreground">定期</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {getTypeBadge(expense.type)}
                            {getRecurringBadge(expense.recurring, expense.recurringPeriod)}
                          </div>
                        </TableCell>
                        <TableCell>{getCategoryBadge(expense.category)}</TableCell>
                        <TableCell>{expense.propertyName || expense.propertyId}</TableCell>
                        <TableCell>{expense.roomNumber || '公共區域'}</TableCell>
                        <TableCell className="font-bold text-red-600">
                          {formatCents(expense.amount)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {expense.description || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditExpense(expense)}
                            >
                              編輯
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteExpense(expense.id)}
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
      

      {/* 新增/編輯支出對話框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? '編輯支出' : '新增支出'}
            </DialogTitle>
            <DialogDescription>
              {editingExpense 
                ? '修改支出紀錄資訊' 
                : '記錄新的固定費用或資本支出'}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">支出類型 *</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value: 'fixed' | 'capital') => setFormData({...formData, type: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定費用</SelectItem>
                    <SelectItem value="capital">資本支出</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">類別 *</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value: Expense['category']) => setFormData({...formData, category: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類別" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rent">租金</SelectItem>
                    <SelectItem value="utilities">水電</SelectItem>
                    <SelectItem value="renovation">裝潢</SelectItem>
                    <SelectItem value="equipment">設備</SelectItem>
                    <SelectItem value="deposit">押金</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                <Label htmlFor="expenseDate">日期 *</Label>
                <Input
                  id="expenseDate"
                  type="date"
                  value={formData.expenseDate}
                  onChange={(e) => setFormData({...formData, expenseDate: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述（選填）</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="輸入支出描述"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={formData.recurring}
                  onChange={(e) => setFormData({...formData, recurring: e.target.checked})}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="recurring">定期支出</Label>
              </div>
              {formData.recurring && (
                <div className="space-y-2">
                  <Label htmlFor="recurringPeriod">週期</Label>
                  <Select 
                    value={formData.recurringPeriod} 
                    onValueChange={(value) => setFormData({...formData, recurringPeriod: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇週期" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">每月</SelectItem>
                      <SelectItem value="quarterly">每季</SelectItem>
                      <SelectItem value="yearly">每年</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveExpense}>
              {editingExpense ? '更新' : '新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageShell>
  );
}