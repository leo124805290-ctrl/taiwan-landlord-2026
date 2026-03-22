'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export interface FloorConfig {
  floor: number;
  roomCount: number;
  monthlyRent: number; // 元
  depositAmount: number; // 元
  electricityPrice: number; // 元/度 (可小數)，送出時轉 electricityRate(分)
}

// 物業資料類型
export interface PropertyFormData {
  name: string;
  address: string;
  totalFloors: number;
  landlordName: string;
  landlordPhone: string;
  landlordDeposit: number;
  landlordMonthlyRent: number;
  prepaidPeriod: number;
  contractStartDate: string;
  contractEndDate: string;
  isDemo: boolean;
}

export interface PropertyFormSubmitData extends PropertyFormData {
  floorConfigs: FloorConfig[];
}

interface PropertyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PropertyFormSubmitData) => void | Promise<void>;
  initialData?: Partial<PropertyFormData>;
  isEditing?: boolean;
}

export default function PropertyForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
}: PropertyFormProps) {
  // 初始化表單資料
  const defaultFormData: PropertyFormData = {
    name: '',
    address: '',
    totalFloors: 1,
    landlordName: '',
    landlordPhone: '',
    landlordDeposit: 0,
    landlordMonthlyRent: 0,
    prepaidPeriod: 1,
    contractStartDate: new Date().toISOString().split('T')[0] ?? '',
    contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '',
    isDemo: false,
  };

  const [formData, setFormData] = useState<PropertyFormData>(() => ({
    ...defaultFormData,
    ...initialData,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createDefaultFloorConfigs = (totalFloors: number): FloorConfig[] => {
    const floors = Math.max(1, Math.min(50, Number(totalFloors) || 1));
    return Array.from({ length: floors }, (_, idx) => {
      const floor = idx + 1;
      const monthlyRent = 5000 + (floor - 1) * 500;
      return {
        floor,
        roomCount: 3,
        monthlyRent,
        depositAmount: monthlyRent,
        electricityPrice: 3.5,
      };
    });
  };

  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>(
    () => createDefaultFloorConfigs(formData.totalFloors)
  );

  // Dialog 重新開啟 / 切換編輯目標時，同步表單資料
  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      ...defaultFormData,
      ...initialData,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditing, initialData]);

  // totalFloors 變更時，自動產生每層設定欄位（保留既有已填值）
  useEffect(() => {
    const nextTotal = Math.max(1, Math.min(50, Number(formData.totalFloors) || 1));
    setFloorConfigs((prev) => {
      const byFloor = new Map(prev.map((c) => [c.floor, c]));
      return Array.from({ length: nextTotal }, (_, idx) => {
        const floor = idx + 1;
        const existing = byFloor.get(floor);
        if (existing) return existing;
        const monthlyRent = 5000 + (floor - 1) * 500;
        return {
          floor,
          roomCount: 3,
          monthlyRent,
          depositAmount: monthlyRent,
          electricityPrice: 3.5,
        };
      });
    });
  }, [formData.totalFloors]);

  const totalAutoRooms = useMemo(
    () => floorConfigs.reduce((sum, f) => sum + (Number(f.roomCount) || 0), 0),
    [floorConfigs]
  );

  // 驗證表單
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors['name'] = '請輸入物業名稱';
    }
    if (!formData.address.trim()) {
      newErrors['address'] = '請輸入地址';
    }
    if (!formData.landlordName.trim()) {
      newErrors['landlordName'] = '請輸入房東姓名';
    }
    if (!formData.landlordPhone.trim()) {
      newErrors['landlordPhone'] = '請輸入房東電話';
    }
    if (formData.totalFloors < 1) {
      newErrors['totalFloors'] = '樓層數必須大於 0';
    }
    if (formData.landlordDeposit < 0) {
      newErrors['landlordDeposit'] = '押金不能為負數';
    }
    if (formData.landlordMonthlyRent < 0) {
      newErrors['landlordMonthlyRent'] = '月租金不能為負數';
    }
    if (formData.prepaidPeriod < 1) {
      newErrors['prepaidPeriod'] = '預付週期必須大於 0';
    }

    if (!isEditing) {
      if (floorConfigs.length !== Math.max(1, Number(formData.totalFloors) || 1)) {
        newErrors['floorConfigs'] = '樓層設定產生異常，請重新調整總樓層數';
      }
      for (const cfg of floorConfigs) {
        if (cfg.roomCount < 0) newErrors[`floor_${cfg.floor}`] = '房間數不可小於 0';
        if (cfg.monthlyRent < 0) newErrors[`floor_${cfg.floor}`] = '月租金不可為負';
        if (cfg.depositAmount < 0) newErrors[`floor_${cfg.floor}`] = '押金不可為負';
        if (cfg.electricityPrice < 0) newErrors[`floor_${cfg.floor}`] = '電費單價不可為負';
      }
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
      await onSubmit({
        ...formData,
        floorConfigs,
      });
      onClose();
    } catch (error) {
      console.error('提交表單錯誤:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 處理輸入變更
  const handleChange = (
    field: keyof PropertyFormData,
    value: string | number | boolean,
  ) => {
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

  const handleFloorConfigChange = (floor: number, patch: Partial<FloorConfig>) => {
    setFloorConfigs((prev) =>
      prev.map((cfg) => (cfg.floor === floor ? { ...cfg, ...patch } : cfg))
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '編輯物業' : '新增物業'}
          </DialogTitle>
          <DialogDescription>
            請填寫物業資訊，帶 * 號的欄位為必填
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* 物業名稱 */}
            <div className="space-y-2">
              <Label htmlFor="name">
                物業名稱 *
                {errors['name'] && (
                  <span className="text-destructive text-xs ml-2">{errors['name']}</span>
                )}
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="例如：台北市信義區公寓"
                className={errors['name'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 地址 */}
            <div className="space-y-2">
              <Label htmlFor="address">
                地址 *
                {errors['address'] && (
                  <span className="text-destructive text-xs ml-2">{errors['address']}</span>
                )}
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="完整地址"
                className={errors['address'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 樓層數 */}
            <div className="space-y-2">
              <Label htmlFor="totalFloors">
                總樓層數 *
                {errors['totalFloors'] && (
                  <span className="text-destructive text-xs ml-2">{errors['totalFloors']}</span>
                )}
              </Label>
              <Input
                id="totalFloors"
                type="number"
                min="1"
                value={formData.totalFloors}
                onChange={(e) => handleChange('totalFloors', parseInt(e.target.value) || 1)}
                className={errors['totalFloors'] ? 'border-destructive' : ''}
                required
              />
              {!isEditing && (
                <p className="text-xs text-gray-500">
                  將依每層設定自動建立房間，共預計建立 <span className="font-medium">{totalAutoRooms}</span> 間
                </p>
              )}
            </div>

            {/* 房東姓名 */}
            <div className="space-y-2">
              <Label htmlFor="landlordName">
                房東姓名 *
                {errors['landlordName'] && (
                  <span className="text-destructive text-xs ml-2">{errors['landlordName']}</span>
                )}
              </Label>
              <Input
                id="landlordName"
                value={formData.landlordName}
                onChange={(e) => handleChange('landlordName', e.target.value)}
                placeholder="房東姓名"
                className={errors['landlordName'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 房東電話 */}
            <div className="space-y-2">
              <Label htmlFor="landlordPhone">
                房東電話 *
                {errors['landlordPhone'] && (
                  <span className="text-destructive text-xs ml-2">{errors['landlordPhone']}</span>
                )}
              </Label>
              <Input
                id="landlordPhone"
                value={formData.landlordPhone}
                onChange={(e) => handleChange('landlordPhone', e.target.value)}
                placeholder="例如：0912-345-678"
                className={errors['landlordPhone'] ? 'border-destructive' : ''}
                required
              />
            </div>

            {/* 押金 */}
            <div className="space-y-2">
              <Label htmlFor="landlordDeposit">
                押金
                {errors['landlordDeposit'] && (
                  <span className="text-destructive text-xs ml-2">{errors['landlordDeposit']}</span>
                )}
              </Label>
              <Input
                id="landlordDeposit"
                type="text"
                value={formData.landlordDeposit === 0 ? '' : formData.landlordDeposit.toLocaleString()}
                onChange={(e) => handleChange('landlordDeposit', formatCurrencyInput(e.target.value))}
                placeholder="例如：60000"
                className={errors['landlordDeposit'] ? 'border-destructive' : ''}
              />
              <p className="text-xs text-gray-500">新台幣，可填 0</p>
            </div>

            {/* 月租金 */}
            <div className="space-y-2">
              <Label htmlFor="landlordMonthlyRent">
                月租金
                {errors['landlordMonthlyRent'] && (
                  <span className="text-destructive text-xs ml-2">{errors['landlordMonthlyRent']}</span>
                )}
              </Label>
              <Input
                id="landlordMonthlyRent"
                type="text"
                value={formData.landlordMonthlyRent === 0 ? '' : formData.landlordMonthlyRent.toLocaleString()}
                onChange={(e) => handleChange('landlordMonthlyRent', formatCurrencyInput(e.target.value))}
                placeholder="例如：30000"
                className={errors['landlordMonthlyRent'] ? 'border-destructive' : ''}
              />
              <p className="text-xs text-gray-500">新台幣，可填 0</p>
            </div>

            {/* 預付週期 */}
            <div className="space-y-2">
              <Label htmlFor="prepaidPeriod">
                預付週期（月）
                {errors['prepaidPeriod'] && (
                  <span className="text-destructive text-xs ml-2">{errors['prepaidPeriod']}</span>
                )}
              </Label>
              <Input
                id="prepaidPeriod"
                type="number"
                min="1"
                value={formData.prepaidPeriod}
                onChange={(e) => handleChange('prepaidPeriod', parseInt(e.target.value) || 1)}
                className={errors['prepaidPeriod'] ? 'border-destructive' : ''}
              />
              <p className="text-xs text-gray-500">房客預付租金月數</p>
            </div>

            {/* 合約開始日期 */}
            <div className="space-y-2">
              <Label htmlFor="contractStartDate">
                合約開始日期
              </Label>
              <Input
                id="contractStartDate"
                type="date"
                value={formData.contractStartDate}
                onChange={(e) => handleChange('contractStartDate', e.target.value)}
              />
            </div>

            {/* 合約結束日期 */}
            <div className="space-y-2">
              <Label htmlFor="contractEndDate">
                合約結束日期
              </Label>
              <Input
                id="contractEndDate"
                type="date"
                value={formData.contractEndDate}
                onChange={(e) => handleChange('contractEndDate', e.target.value)}
              />
            </div>

            {/* 是否為測試用物業 */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-3">
                <input
                  id="isDemo"
                  type="checkbox"
                  checked={formData.isDemo}
                  onChange={(e) => handleChange('isDemo', e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="isDemo" className="cursor-pointer">
                  此物業為測試用（demo）
                </Label>
              </div>
              <p className="text-xs text-gray-500">
                demo 物業可以直接刪除；非 demo 物業刪除會改成封存並可復原。
              </p>
            </div>
          </div>

          {/* 自動建立房間（每層設定） */}
          {!isEditing && (
            <div className="space-y-3 pb-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">自動建立房間（每層設定）</div>
                <div className="text-xs text-gray-500">房號規則：樓層×100 + 序號（例：201）</div>
              </div>
              {errors['floorConfigs'] && (
                <div className="text-destructive text-xs">{errors['floorConfigs']}</div>
              )}

              <div className="space-y-2">
                {floorConfigs.map((cfg) => (
                  <div key={cfg.floor} className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-md border p-3 bg-white">
                    <div className="md:col-span-1 flex items-center justify-between">
                      <div className="font-medium">{cfg.floor}F</div>
                      <div className="text-xs text-gray-500">
                        例：{cfg.floor * 100 + 1}~{cfg.floor * 100 + Math.max(0, cfg.roomCount)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">房間數</Label>
                      <Input
                        type="number"
                        min="0"
                        value={cfg.roomCount}
                        onChange={(e) =>
                          handleFloorConfigChange(cfg.floor, { roomCount: parseInt(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">月租金（元）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={cfg.monthlyRent}
                        onChange={(e) =>
                          handleFloorConfigChange(cfg.floor, { monthlyRent: parseInt(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">押金（元）</Label>
                      <Input
                        type="number"
                        min="0"
                        value={cfg.depositAmount}
                        onChange={(e) =>
                          handleFloorConfigChange(cfg.floor, { depositAmount: parseInt(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1 md:col-span-4">
                      <Label className="text-xs">電費單價（元/度）</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={cfg.electricityPrice}
                        onChange={(e) =>
                          handleFloorConfigChange(cfg.floor, { electricityPrice: parseFloat(e.target.value) || 0 })
                        }
                      />
                      <p className="text-xs text-gray-500">
                        送出時會自動換算為後端 `electricityRate`（分），例：3.5 元 → 350
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              {isSubmitting ? '提交中...' : (isEditing ? '更新物業' : '新增物業')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}