'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Home, Users, DollarSign, Clock, AlertCircle, CheckCircle, Wrench, Calendar } from 'lucide-react';
import { formatCents, formatCurrency, formatDate } from '@/lib/utils';
import { PageShell } from '@/components/app-shell/page-shell';
import { PageHeader } from '@/components/app-shell/page-header';
import { api } from '@/lib/api-client';
import { Input } from '@/components/ui/input';

interface PropertyCard {
  id: string;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  monthlyIncome: number;
  monthlyExpense: number;
  vacancyRate: number;
}

interface TodoItem {
  id: string;
  type: 'overdue_payment' | 'pending_maintenance' | 'upcoming_checkout' | 'unpaid_bill';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  roomNumber?: string;
  amount?: number;
}

interface MonthlySummary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  profitMargin: number;
  incomeTrend: number;
  expenseTrend: number;
}

interface ChartData {
  month: string;
  收入: number;
  支出: number;
}

interface SummaryApi {
  month: string;
  totalProperties: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  properties: Array<{
    id: string;
    name: string;
    rooms: number;
    occupied: number;
    income: number;
    expense: number;
    netProfit: number;
  }>;
}

function monthAdd(ym: string, delta: number): string {
  const parts = ym.split('-').map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? 1;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const [summaryMonth, setSummaryMonth] = useState(currentMonthYm);
  const [propertyCards, setPropertyCards] = useState<PropertyCard[]>([]);
  const [todos] = useState<TodoItem[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    profitMargin: 0,
    incomeTrend: 0,
    expenseTrend: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cur = await api.get<SummaryApi>(
        `/api/reports/summary?month=${encodeURIComponent(summaryMonth)}`,
      );
      let prev: SummaryApi | null = null;
      try {
        prev = await api.get<SummaryApi>(
          `/api/reports/summary?month=${encodeURIComponent(monthAdd(summaryMonth, -1))}`,
        );
      } catch {
        prev = null;
      }

      const incomeTrend =
        prev && prev.totalIncome > 0
          ? ((cur.totalIncome - prev.totalIncome) / prev.totalIncome) * 100
          : 0;
      const expenseTrend =
        prev && prev.totalExpense > 0
          ? ((cur.totalExpense - prev.totalExpense) / prev.totalExpense) * 100
          : 0;
      const profitMargin =
        cur.totalIncome > 0 ? (cur.netProfit / cur.totalIncome) * 100 : 0;

      setMonthlySummary({
        totalIncome: cur.totalIncome,
        totalExpense: cur.totalExpense,
        netProfit: cur.netProfit,
        profitMargin,
        incomeTrend,
        expenseTrend,
      });

      setPropertyCards(
        cur.properties.map((p) => ({
          id: p.id,
          name: p.name,
          totalRooms: p.rooms,
          occupiedRooms: p.occupied,
          monthlyIncome: p.income,
          monthlyExpense: p.expense,
          vacancyRate:
            p.rooms > 0 ? Math.round(((p.rooms - p.occupied) / p.rooms) * 100) : 0,
        })),
      );

      const chartMonths = [monthAdd(summaryMonth, -2), monthAdd(summaryMonth, -1), summaryMonth];
      const chartPoints: ChartData[] = [];
      for (const m of chartMonths) {
        const s = await api.get<SummaryApi>(`/api/reports/summary?month=${encodeURIComponent(m)}`);
        chartPoints.push({
          month: m,
          收入: s.totalIncome / 100,
          支出: s.totalExpense / 100,
        });
      }
      setChartData(chartPoints);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '載入儀表板失敗');
      setPropertyCards([]);
      setChartData([]);
      setMonthlySummary({
        totalIncome: 0,
        totalExpense: 0,
        netProfit: 0,
        profitMargin: 0,
        incomeTrend: 0,
        expenseTrend: 0,
      });
    } finally {
      setIsLoading(false);
    }
  }, [summaryMonth]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const getTodoIcon = (type: TodoItem['type']) => {
    switch (type) {
      case 'overdue_payment':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'pending_maintenance':
        return <Wrench className="h-5 w-5 text-orange-600" />;
      case 'upcoming_checkout':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'unpaid_bill':
        return <DollarSign className="h-5 w-5 text-yellow-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTodoBadge = (type: TodoItem['type']) => {
    const typeMap: Record<TodoItem['type'], string> = {
      overdue_payment: '逾期繳款',
      pending_maintenance: '待處理維修',
      upcoming_checkout: '即將退租',
      unpaid_bill: '待繳帳單',
    };
    return typeMap[type];
  };

  const getPriorityBadge = (priority: TodoItem['priority']) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">緊急</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">高</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">中</Badge>;
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">低</Badge>;
      default:
        return <Badge>未知</Badge>;
    }
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    }
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  const totalRoomsSum = propertyCards.reduce((sum, p) => sum + p.totalRooms, 0);
  const occupiedSum = propertyCards.reduce((sum, p) => sum + p.occupiedRooms, 0);
  const occupancyPct =
    totalRoomsSum > 0 ? Math.round((occupiedSum / totalRoomsSum) * 100) : 0;

  return (
    <PageShell>
      <PageHeader
        title="儀表板"
        description="總覽物業營運狀況、待辦事項與財務表現（資料來自後端 /api/reports/summary）"
        actions={
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">月份</span>
              <Input
                type="month"
                className="w-[9rem]"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
              />
            </div>
            <Button onClick={() => void loadDashboardData()}>重新整理</Button>
          </>
        }
      />

      {error && (
        <Card className="border-red-200 mb-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <p className="text-red-600 mb-2">{error}</p>
            <Button variant="outline" onClick={() => void loadDashboardData()}>
              重試
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總收入</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCents(monthlySummary.totalIncome)}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {getTrendIcon(monthlySummary.incomeTrend)}
              <span className="ml-1">
                {monthlySummary.incomeTrend > 0 ? '+' : ''}
                {monthlySummary.incomeTrend.toFixed(1)}% 較上月
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總支出</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCents(monthlySummary.totalExpense)}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {getTrendIcon(monthlySummary.expenseTrend)}
              <span className="ml-1">
                {monthlySummary.expenseTrend > 0 ? '+' : ''}
                {monthlySummary.expenseTrend.toFixed(1)}% 較上月
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">淨利</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCents(monthlySummary.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              利潤率 {monthlySummary.profitMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總房間數</CardTitle>
            <Home className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{totalRoomsSum}</div>
            <p className="text-xs text-muted-foreground">入住率 {occupancyPct}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>收入支出趨勢</CardTitle>
              <CardDescription>過去三個月收入與支出變化（元）</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {chartData.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">無圖表資料</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="收入" fill="#10b981" />
                    <Bar dataKey="支出" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>物業總覽</CardTitle>
              <CardDescription>各物業營運狀況與收入分析</CardDescription>
            </CardHeader>
            <CardContent>
              {propertyCards.length === 0 ? (
                <p className="text-muted-foreground text-sm">此月份尚無物業資料</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {propertyCards.map((property) => (
                    <Card key={property.id} className="border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{property.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">房間數</span>
                          <span className="font-medium">
                            {property.occupiedRooms} / {property.totalRooms} 間
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">空房率</span>
                          <Badge variant={property.vacancyRate > 20 ? 'destructive' : 'outline'}>
                            {property.vacancyRate}%
                          </Badge>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">收入</span>
                            <span className="font-medium text-green-600">
                              {formatCents(property.monthlyIncome)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">支出</span>
                            <span className="font-medium text-red-600">
                              {formatCents(property.monthlyExpense)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t">
                            <span className="text-sm font-medium">淨利</span>
                            <span className="font-bold text-blue-600">
                              {formatCents(property.monthlyIncome - property.monthlyExpense)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>今日待辦</CardTitle>
              <CardDescription>需後端提供待辦 API 後顯示</CardDescription>
            </CardHeader>
            <CardContent>
              {todos.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                  <p className="text-muted-foreground">尚無待辦資料</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {todos.map((todo) => (
                    <div key={todo.id} className="p-3 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">{getTodoIcon(todo.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm">{getTodoBadge(todo.type)}</span>
                              {getPriorityBadge(todo.priority)}
                            </div>
                            {todo.roomNumber && <Badge variant="outline">{todo.roomNumber}</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{todo.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                              {todo.dueDate && (
                                <>
                                  <Calendar className="h-3 w-3" />
                                  <span>{formatDate(todo.dueDate, 'short')}</span>
                                </>
                              )}
                            </div>
                            {todo.amount != null && (
                              <span className="font-medium text-sm">{formatCents(todo.amount * 100)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>快速行動</CardTitle>
              <CardDescription>常用功能快速連結</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="justify-start">
                  <DollarSign className="mr-2 h-4 w-4" />
                  收租
                </Button>
                <Button variant="outline" className="justify-start">
                  <Users className="mr-2 h-4 w-4" />
                  入住登記
                </Button>
                <Button variant="outline" className="justify-start">
                  <Wrench className="mr-2 h-4 w-4" />
                  報修
                </Button>
                <Button variant="outline" className="justify-start">
                  <Home className="mr-2 h-4 w-4" />
                  新增物業
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>近期活動</CardTitle>
              <CardDescription>需後端提供活動紀錄 API 後顯示</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-4">尚無近期活動</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">載入儀表板資料中...</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}
