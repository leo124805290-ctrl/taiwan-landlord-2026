'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';

// 房間資料類型
interface RoomFormData {
  roomNumber: string;
  floor: number;
  monthlyRent: number;
  depositAmount: number;
  electricityRate: number; // 每度電價格（分），例如 350 表示 3.5 元
  status: 'vacant' | 'occupied' | 'reserved' | 'maintenance';
}

interface RoomFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RoomFormData) => void;
  initialData?: Partial<RoomFormData>;
  isEditing?: boolean;
  propertyId: string;
}

export default function RoomForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
  propertyId: _propertyId,
}: RoomFormProps) {
  // 初始化表單資料
  const defaultFormData: RoomFormData = {
    roomNumber: '',
    floor: 1,
    monthlyRent: 0,
    depositAmount: 0,
    electricityRate: 350, // 預設 3.5 元/度
    status: 'vacant',
  };

  const [formData, setFormData] = useState<RoomFormData>({
    ...defaultFormData,
    ...initialData,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 重置表單資料
  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...defaultFormData,
        ...initialData,
      });
      setErrors({});
    }
  }, [isOpen, initialData]);

  // 驗證表單
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.roomNumber.trim()) {
      newErrors['roomNumber'] = '請輸入房間編號';
    }

    if (formData.floor < 1) {
      newErrors['floor'] = '樓層必須大於 0';
    }

    if (formData.monthlyRent < 0) {
      newErrors['monthlyRent'] = '月租金不能為負數';
    }

    if (formData.depositAmount < 0) {
      newErrors['depositAmount'] = '押金不能為負數';
    }

    if (formData.electricityRate < 0) {
      newErrors['electricityRate'] = '電費單價不能為負數';
    }

    if (!formData.status) {
      newErrors['status'] = '請選擇房間狀態';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 處理表單提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('提交表單錯誤:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 處理輸入變更
  const handleChange = (field: keyof RoomFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // 清除該欄位錯誤
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // 格式化金額輸入
  const formatCurrencyInput = (value: string): number => {
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  };

  // 格式化電費輸入（分轉元）
  const formatElectricityRate = (value: string): number => {
    const num = parseFloat(value);
    if (isNaN(num)) return 350;
    return Math.round(num * 100); // 轉換為分
  };

  // 顯示電費（分轉元）
  const displayElectricityRate = (cents: number): string => {
    return (cents / 100).toFixed(2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '編輯房間' : '新增房間'}
          </DialogTitle>
          <DialogDescription>
            請填寫房間資訊，帶 * 號的欄位為必填
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* 房間編號 */}
            <div className="space-y-2">
              <Label htmlFor="roomNumber">
                房間編號 *
                {errors['roomNumber'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['roomNumber']}
                  </span>
                )}
              </Label>
              <Input
                id="roomNumber"
                value={formData.roomNumber}
                onChange={(e) => handleChange('roomNumber', e.target.value)}
                placeholder="例如：101"
                className={errors['roomNumber'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 樓層 */}
            <div className="space-y-2">
              <Label htmlFor="floor">
                樓層 *
                {errors['floor'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['floor']}
                  </span>
                )}
              </Label>
              <Input
                id="floor"
                type="number"
                min="1"
                value={formData.floor}
                onChange={(e) => handleChange('floor', parseInt(e.target.value) || 1)}
                className={errors['floor'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 月租金 */}
            <div className="space-y-2">
              <Label htmlFor="monthlyRent">
                月租金 *
                {errors['monthlyRent'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['monthlyRent']}
                  </span>
                )}
              </Label>
              <Input
                id="monthlyRent"
                type="text"
                value={formData.monthlyRent === 0 ? '' : formData.monthlyRent.toLocaleString()}
                onChange={(e) => handleChange('monthlyRent', formatCurrencyInput(e.target.value))}
                placeholder="例如：8000"
                className={errors['monthlyRent'] ? 'border-destructive' : ''}
                required
              />
              <p className="text-xs text-gray-500">新台幣</p>
            </div>

            {/* 押金 */}
            <div className="space-y-2">
              <Label htmlFor="depositAmount">
                押金 *
                {errors['depositAmount'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['depositAmount']}
                  </span>
                )}
              </Label>
              <Input
                id="depositAmount"
                type="text"
                value={formData.depositAmount === 0 ? '' : formData.depositAmount.toLocaleString()}
                onChange={(e) => handleChange('depositAmount', formatCurrencyInput(e.target.value))}
                placeholder="例如：8000"
                className={errors['depositAmount'] ? 'border-destructive' : ''}
                required
              />
              <p className="text-xs text-gray-500">新台幣，通常等於一個月租金</p>
            </div>

            {/* 電費單價 */}
            <div className="space-y-2">
              <Label htmlFor="electricityRate">
                電費單價（每度） *
                {errors['electricityRate'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['electricityRate']}
                  </span>
                )}
              </Label>
              <div className="flex items-center">
                <Input
                  id="electricityRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={displayElectricityRate(formData.electricityRate)}
                  onChange={(e) => handleChange('electricityRate', formatElectricityRate(e.target.value))}
                  placeholder="例如：3.5"
                  className={errors['electricityRate'] ? 'border-destructive' : ''}
                  required
                />
                <span className="ml-2 text-gray-700">元/度</span>
              </div>
              <p className="text-xs text-gray-500">每度電價格（預設 3.5 元）</p>
            </div>

            {/* 房間狀態 */}
            <div className="space-y-2">
              <Label htmlFor="status">
                房間狀態 *
                {errors['status'] && (
                  <span className="text-destructive text-xs ml-2 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {errors['status']}
                  </span>
                )}
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value as RoomFormData['status'])}
              >
                <SelectTrigger className={errors['status'] ? 'border-destructive' : ''}>
                  <SelectValue placeholder="選擇房間狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacant">空房</SelectItem>
                  <SelectItem value="occupied">已入住</SelectItem>
                  <SelectItem value="reserved">已預訂</SelectItem>
                  <SelectItem value="maintenance">維修中</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className={`text-xs px-2 py-1 rounded ${formData.status === 'vacant' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>空房</span>
                <span className={`text-xs px-2 py-1 rounded ${formData.status === 'occupied' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>已入住</span>
                <span className={`text-xs px-2 py-1 rounded ${formData.status === 'reserved' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>已預訂</span>
                <span className={`text-xs px-2 py-1 rounded ${formData.status === 'maintenance' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>維修中</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : (isEditing ? '更新房間' : '新增房間')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}