'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { formatDateSlash } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_TYPE_FIXED,
  getCategoryLabel,
} from '@/lib/expense-categories';
import {
  type LandlordContract,
  type LandlordPayment,
  autoLandlordDescriptionPrefix,
  categoryCodeForPayment,
  deleteContract,
  expenseTypeForKind,
  loadLandlordContracts,
  periodIdForAuto,
  upsertContract,
  updatePayment,
} from '@/lib/landlord-store';

type Property = { id: string; name: string };

function yuanToCents(yuan: number): number {
  return Math.round(Number(yuan) * 100);
}

function kindLabel(k: LandlordPayment['kind']): string {
  if (k === 'rent') return '租金';
  if (k === 'deposit') return '押金';
  return '電費';
}

function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, day] = ymd.split('-').map(Number);
  const d = new Date(y!, m! - 1, day!);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function LandlordPaymentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propError, setPropError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<LandlordContract[]>([]);
  const [contractDialog, setContractDialog] = useState(false);
  const [editing, setEditing] = useState<LandlordContract | null>(null);
  const [payDialog, setPayDialog] = useState<{
    contract: LandlordContract;
    payment: LandlordPayment;
  } | null>(null);
  const [expenseDate, setExpenseDate] = useState(todayYmd());
  const [syncing, setSyncing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState({
    propertyId: '',
    title: '',
    monthlyRentYuan: '',
    depositYuan: '0',
    utilityElectricYuanMonthly: '0',
    paymentDay: '5',
    startDate: todayYmd(),
    endDate: '',
    rentCategoryCode: 'landlord_rent',
    depositCategoryCode: 'landlord_deposit',
    utilityCategoryCode: 'utility_electric',
  });

  const refreshContracts = useCallback(() => {
    setContracts(loadLandlordContracts());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<Property[]>('/api/properties');
        if (!cancelled) {
          setProperties(list);
          setPropError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setProperties([]);
          setPropError(e instanceof ApiError ? e.message : '載入物業失敗');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshContracts();
  }, [refreshContracts]);

  const nameByPropertyId = useMemo(() => {
    const m = new Map(properties.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [properties]);

  const reminders = useMemo(() => {
    const today = todayYmd();
    const week = addDaysYmd(today, 7);
    const rows: { contract: LandlordContract; p: LandlordPayment }[] = [];
    for (const c of contracts) {
      for (const p of c.payments) {
        if (p.paid) continue;
        if (p.dueDate >= today && p.dueDate <= week) {
          rows.push({ contract: c, p });
        }
      }
    }
    rows.sort((a, b) => a.p.dueDate.localeCompare(b.p.dueDate));
    return rows;
  }, [contracts]);

  const allPaymentsFlat = useMemo(() => {
    const rows: { contract: LandlordContract; p: LandlordPayment }[] = [];
    for (const c of contracts) {
      for (const p of [...c.payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate))) {
        rows.push({ contract: c, p });
      }
    }
    return rows;
  }, [contracts]);

  function openNewContract() {
    setEditing(null);
    setFormError(null);
    setForm({
      propertyId: properties[0]?.id ?? '',
      title: '房東租約',
      monthlyRentYuan: '',
      depositYuan: '0',
      utilityElectricYuanMonthly: '0',
      paymentDay: '5',
      startDate: todayYmd(),
      endDate: '',
      rentCategoryCode: 'landlord_rent',
      depositCategoryCode: 'landlord_deposit',
      utilityCategoryCode: 'utility_electric',
    });
    setContractDialog(true);
  }

  function openEdit(c: LandlordContract) {
    setEditing(c);
    setFormError(null);
    setForm({
      propertyId: c.propertyId,
      title: c.title,
      monthlyRentYuan: String(c.monthlyRentYuan),
      depositYuan: String(c.depositYuan),
      utilityElectricYuanMonthly: String(c.utilityElectricYuanMonthly),
      paymentDay: String(c.paymentDay),
      startDate: c.startDate,
      endDate: c.endDate ?? '',
      rentCategoryCode: c.rentCategoryCode,
      depositCategoryCode: c.depositCategoryCode,
      utilityCategoryCode: c.utilityCategoryCode,
    });
    setContractDialog(true);
  }

  function handleSaveContract() {
    setFormError(null);
    const rent = Number(form.monthlyRentYuan);
    const dep = Number(form.depositYuan) || 0;
    const util = Number(form.utilityElectricYuanMonthly) || 0;
    const pd = Number(form.paymentDay);
    if (!form.propertyId) {
      setFormError('請選擇物業');
      return;
    }
    if (!form.title.trim()) {
      setFormError('請填寫合約名稱');
      return;
    }
    if (!Number.isFinite(rent) || rent <= 0) {
      setFormError('月租金需為正數');
      return;
    }
    if (!Number.isFinite(pd) || pd < 1 || pd > 28) {
      setFormError('每月繳款日請填 1～28');
      return;
    }

    const now = new Date().toISOString();
    const base: LandlordContract = editing
      ? {
          ...editing,
          propertyId: form.propertyId,
          propertyName: nameByPropertyId(form.propertyId),
          title: form.title.trim(),
          monthlyRentYuan: rent,
          depositYuan: dep,
          utilityElectricYuanMonthly: util,
          paymentDay: pd,
          startDate: form.startDate,
          endDate: form.endDate.trim() || null,
          rentCategoryCode: form.rentCategoryCode,
          depositCategoryCode: form.depositCategoryCode,
          utilityCategoryCode: form.utilityCategoryCode,
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          propertyId: form.propertyId,
          propertyName: nameByPropertyId(form.propertyId),
          title: form.title.trim(),
          monthlyRentYuan: rent,
          depositYuan: dep,
          utilityElectricYuanMonthly: util,
          paymentDay: pd,
          startDate: form.startDate,
          endDate: form.endDate.trim() || null,
          rentCategoryCode: form.rentCategoryCode,
          depositCategoryCode: form.depositCategoryCode,
          utilityCategoryCode: form.utilityCategoryCode,
          payments: [],
          createdAt: now,
          updatedAt: now,
        };

    upsertContract({
      ...base,
      payments: editing?.payments ?? [],
    });
    refreshContracts();
    setContractDialog(false);
  }

  function handleDelete(id: string) {
    if (!window.confirm('確定刪除此合約與本地排程？')) return;
    deleteContract(id);
    refreshContracts();
  }

  function openMarkPaid(c: LandlordContract, p: LandlordPayment) {
    setActionError(null);
    setExpenseDate(todayYmd());
    setPayDialog({ contract: c, payment: p });
  }

  async function handleConfirmMarkPaid() {
    if (!payDialog) return;
    const { contract: c, payment: p } = payDialog;
    setActionError(null);
    setSyncing(true);
    try {
      const period = periodIdForAuto(p);
      const cat = categoryCodeForPayment(c, p);
      const desc =
        `${autoLandlordDescriptionPrefix(c.id, period)} ${c.title} ${kindLabel(p.kind)} ${p.dueDate}`;
      const iso = new Date(expenseDate + 'T12:00:00').toISOString();
      const created = await apiPost<{
        id: string;
        amount: number;
        expenseDate: string;
      }>('/api/expenses', {
        propertyId: c.propertyId,
        roomId: null,
        type: expenseTypeForKind(p.kind),
        category: cat,
        amount: yuanToCents(p.amountYuan),
        expenseDate: iso,
        description: desc,
        recurring: false,
      });
      updatePayment(c.id, p.id, {
        paid: true,
        paidAt: new Date().toISOString(),
        expenseId: created.id,
        expenseSynced: true,
      });
      setPayDialog(null);
      refreshContracts();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '同步支出失敗');
    } finally {
      setSyncing(false);
    }
  }

  function markPaidLocalOnly(c: LandlordContract, p: LandlordPayment) {
    updatePayment(c.id, p.id, {
      paid: true,
      paidAt: new Date().toISOString(),
      expenseSynced: false,
    });
    refreshContracts();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-700">
          <Building2 className="h-6 w-6" aria-hidden />
          <p className="text-sm text-slate-600">
            管理付給上游房東的租金／押金／電費排程，並可一鍵寫入收支（支出）。
          </p>
        </div>
        <Button type="button" onClick={openNewContract} disabled={properties.length === 0 && !propError}>
          <Plus className="mr-1 h-4 w-4" />
          新增合約
        </Button>
      </div>

      {propError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          {propError}（無法選擇物業時仍可檢視已存合約）
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-900">近 7 日提醒</h2>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500">無即將到期之未繳項目。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reminders.map(({ contract: c, p }) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span>
                  <span className="font-medium text-slate-800">{c.title}</span>
                  <span className="text-slate-600">
                    {' '}
                    · {kindLabel(p.kind)} · 應繳 {formatDateSlash(p.dueDate)} · $
                    {p.amountYuan.toLocaleString('zh-TW')}
                  </span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => openMarkPaid(c, p)}>
                  標記已繳
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">合約與排程</h2>
        {contracts.length === 0 ? (
          <p className="text-sm text-slate-500">尚無合約，請按「新增合約」。</p>
        ) : (
          contracts.map((c) => (
            <div
              key={c.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{c.title}</h3>
                  <p className="text-sm text-slate-600">
                    物業：{c.propertyName || nameByPropertyId(c.propertyId)} · 月租 $
                    {c.monthlyRentYuan.toLocaleString('zh-TW')} · 每月 {c.paymentDay} 日
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(c)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    編輯
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-700"
                    onClick={() => handleDelete(c.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    刪除
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto p-2">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-white text-left text-slate-600">
                      <th className="px-2 py-2">到期日</th>
                      <th className="px-2 py-2">項目</th>
                      <th className="px-2 py-2">金額（元）</th>
                      <th className="px-2 py-2">狀態</th>
                      <th className="px-2 py-2">同步支出</th>
                      <th className="px-2 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...c.payments]
                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                      .map((p) => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="px-2 py-2">{formatDateSlash(p.dueDate)}</td>
                          <td className="px-2 py-2">{kindLabel(p.kind)}</td>
                          <td className="px-2 py-2">${p.amountYuan.toLocaleString('zh-TW')}</td>
                          <td className="px-2 py-2">{p.paid ? '已繳' : '未繳'}</td>
                          <td className="px-2 py-2">
                            {p.expenseSynced ? (
                              <span className="text-green-700">已同步</span>
                            ) : p.paid ? (
                              <span className="text-amber-700">僅本地</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {!p.paid && (
                              <div className="flex justify-end gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => markPaidLocalOnly(c, p)}>
                                  僅標記已繳
                                </Button>
                                <Button type="button" size="sm" onClick={() => openMarkPaid(c, p)}>
                                  標記並同步
                                </Button>
                              </div>
                            )}
                            {p.paid && !p.expenseSynced && (
                              <Button type="button" size="sm" onClick={() => openMarkPaid(c, p)}>
                                補同步支出
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-900">付款歷史（全部合約）</h2>
        {allPaymentsFlat.length === 0 ? (
          <p className="text-sm text-slate-500">尚無排程資料。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2">到期日</th>
                  <th className="px-3 py-2">合約</th>
                  <th className="px-3 py-2">項目</th>
                  <th className="px-3 py-2">金額</th>
                  <th className="px-3 py-2">支出同步</th>
                </tr>
              </thead>
              <tbody>
                {allPaymentsFlat.map(({ contract: c, p }) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{formatDateSlash(p.dueDate)}</td>
                    <td className="px-3 py-2">{c.title}</td>
                    <td className="px-3 py-2">{kindLabel(p.kind)}</td>
                    <td className="px-3 py-2">${p.amountYuan.toLocaleString('zh-TW')}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.expenseSynced && p.expenseId
                        ? `已同步（${p.expenseId.slice(0, 8)}…）`
                        : p.paid
                          ? '僅本地'
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        <strong className="font-medium text-slate-600">MVP 說明：</strong>
        合約與繳款狀態僅存於此瀏覽器的 localStorage，不會上傳伺服器。若多人共用帳號、清除網站資料或更換裝置，資料可能不一致或遺失；正式環境建議改為後端儲存。
      </p>

      {contractDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setContractDialog(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold">{editing ? '編輯合約' : '新增合約'}</h3>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-slate-600">物業 *</span>
                <select
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.propertyId}
                  onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
                >
                  <option value="">請選擇</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">合約名稱 *</span>
                <input
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">月租金（元）*</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.monthlyRentYuan}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyRentYuan: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">押金（元）</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.depositYuan}
                  onChange={(e) => setForm((f) => ({ ...f, depositYuan: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">每月電費預估（元，0＝不排程）</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.utilityElectricYuanMonthly}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, utilityElectricYuanMonthly: e.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">每月繳款日（1～28）*</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.paymentDay}
                  onChange={(e) => setForm((f) => ({ ...f, paymentDay: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">起始日 *</span>
                <input
                  type="date"
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-slate-600">結束日（選填）</span>
                <input
                  type="date"
                  className="rounded-md border border-slate-300 px-2 py-2"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </label>
              <div className="grid gap-1">
                <span className="text-slate-600">支出分類（英文 code → 收支報表用）</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="grid gap-1">
                    <span className="text-xs text-slate-500">租金</span>
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={form.rentCategoryCode}
                      onChange={(e) => setForm((f) => ({ ...f, rentCategoryCode: e.target.value }))}
                    >
                      {EXPENSE_CATEGORIES.map((x) => (
                        <option key={x.code} value={x.code}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-slate-500">押金</span>
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={form.depositCategoryCode}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, depositCategoryCode: e.target.value }))
                      }
                    >
                      {EXPENSE_CATEGORIES.map((x) => (
                        <option key={x.code} value={x.code}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-slate-500">電費</span>
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={form.utilityCategoryCode}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, utilityCategoryCode: e.target.value }))
                      }
                    >
                      {EXPENSE_CATEGORIES.map((x) => (
                        <option key={x.code} value={x.code}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setContractDialog(false)}>
                取消
              </Button>
              <Button type="button" onClick={handleSaveContract}>
                儲存
              </Button>
            </div>
          </div>
        </div>
      )}

      {payDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => !syncing && setPayDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">標記已繳並同步至支出</h3>
            <p className="text-sm text-slate-600">
              {payDialog.contract.title} · {kindLabel(payDialog.payment.kind)} · $
              {payDialog.payment.amountYuan.toLocaleString('zh-TW')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              分類：{getCategoryLabel(categoryCodeForPayment(payDialog.contract, payDialog.payment))} ·
              類型：{EXPENSE_TYPE_FIXED}
            </p>
            <label className="mt-4 grid gap-1 text-sm">
              <span className="text-slate-600">支出入帳日</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-2"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                disabled={syncing}
              />
            </label>
            {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={syncing} onClick={() => setPayDialog(null)}>
                取消
              </Button>
              <Button type="button" disabled={syncing} onClick={() => void handleConfirmMarkPaid()}>
                {syncing ? '同步中…' : '確認並 POST 支出'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
