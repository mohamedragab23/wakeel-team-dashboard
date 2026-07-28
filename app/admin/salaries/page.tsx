'use client';

import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type LedgerTxType = 'bonus' | 'deduction' | 'advance' | 'adjustment';

interface LedgerTransaction {
  transactionId: string;
  entityType: 'rider' | 'supervisor';
  entityCode: string;
  entityNameSnapshot: string;
  type: LedgerTxType;
  amount: number;
  reason: string;
  period: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: 'active' | 'voided' | 'corrected';
  correctsTransactionId: string;
  source: 'ledger_native' | 'legacy_mirror';
}

const LEDGER_TYPE_LABELS_AR: Record<LedgerTxType, string> = {
  bonus: 'مكافأة',
  deduction: 'خصم',
  advance: 'سلفة',
  adjustment: 'تعديل',
};

interface Supervisor {
  code: string;
  name: string;
}

interface SalaryCalculation {
  supervisorId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  periodTotals?: { totalOrders: number; totalHours: number };
  salaryMethod: 'fixed' | 'commission_type1' | 'commission_type2' | 'legacy_multiplier';
  baseAmount: number;
  commission?: {
    type: 'type1' | 'type2';
    totalOrders: number;
    totalHours: number;
    calculatedCommission: number;
    details: any;
  };
  deductions: {
    advances: number;
    deductions: number;
    equipment: number;
    security: number;
    performance: number;
    admin?: number;
    total: number;
  };
  netSalary: number;
  breakdown: Array<{
    date: string;
    orders: number;
    hours: number;
    multiplier: number;
    dailyCommission: number;
  }>;
  riderPerformance?: { code: string; name: string; totalOrders: number; totalHours: number }[];
}

export default function AdminSalariesPage() {
  const queryClient = useQueryClient();
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [adminDeductionDate, setAdminDeductionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adminDeductionReason, setAdminDeductionReason] = useState('');
  const [adminDeductionAmount, setAdminDeductionAmount] = useState('');
  const [adminDeductionSaving, setAdminDeductionSaving] = useState(false);
  const [adminDeductionMsg, setAdminDeductionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return firstDay.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // --- SRS-013 Phase 3: Payroll Ledger (additive; admin-deductions form above is untouched) ---
  const [ledgerEnabled, setLedgerEnabled] = useState(false);
  const [ledgerType, setLedgerType] = useState<LedgerTxType>('bonus');
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerReason, setLedgerReason] = useState('');
  const [ledgerPeriod, setLedgerPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerMsg, setLedgerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editingTx, setEditingTx] = useState<LedgerTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/admin/payroll/transactions');
        const j = await res.json();
        setLedgerEnabled(Boolean(j?.enabled));
      } catch {
        setLedgerEnabled(false);
      }
    })();
  }, []);

  const { data: ledgerTransactions = [], refetch: refetchLedger } = useQuery({
    queryKey: ['admin', 'payroll-ledger', selectedSupervisor, ledgerPeriod],
    queryFn: async () => {
      if (!selectedSupervisor) return [];
      const res = await authFetch(
        `/api/admin/payroll/transactions?entityCode=${selectedSupervisor}&period=${ledgerPeriod}`
      );
      const data = await res.json();
      return data.success ? (data.transactions as LedgerTransaction[]) : [];
    },
    enabled: ledgerEnabled && !!selectedSupervisor && !!ledgerPeriod,
  });

  async function submitLedgerTransaction(e: React.FormEvent) {
    e.preventDefault();
    setLedgerMsg(null);
    if (!selectedSupervisor) {
      setLedgerMsg({ type: 'err', text: 'اختر مشرفاً أولاً' });
      return;
    }
    const amount = parseFloat(ledgerAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setLedgerMsg({ type: 'err', text: 'أدخل مبلغاً صحيحاً' });
      return;
    }
    setLedgerSaving(true);
    try {
      const res = await authFetch('/api/admin/payroll/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'supervisor',
          entityCode: selectedSupervisor,
          type: ledgerType,
          amount,
          reason: ledgerReason.trim(),
          period: ledgerPeriod,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الحفظ');
      setLedgerMsg({ type: 'ok', text: 'تم تسجيل المعاملة' });
      setLedgerAmount('');
      setLedgerReason('');
      void refetchLedger();
      queryClient.invalidateQueries({ queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate] });
    } catch (err: unknown) {
      setLedgerMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطأ' });
    } finally {
      setLedgerSaving(false);
    }
  }

  async function voidLedgerTx(transactionId: string) {
    if (!confirm('هل تريد حذف (إلغاء) هذه المعاملة؟')) return;
    try {
      const res = await authFetch(`/api/admin/payroll/transactions/${transactionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الحذف');
      void refetchLedger();
      queryClient.invalidateQueries({ queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate] });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطأ');
    }
  }

  function startEditTx(t: LedgerTransaction) {
    setEditingTx(t);
    setEditAmount(String(Math.abs(t.amount)));
    setEditReason(t.reason);
  }

  async function submitEditTx(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    const amount = parseFloat(editAmount);
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      const res = await authFetch(`/api/admin/payroll/transactions/${editingTx.transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: editReason.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل التعديل');
      setEditingTx(null);
      void refetchLedger();
      queryClient.invalidateQueries({ queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate] });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطأ');
    }
  }

  // Fetch supervisors
  const { data: supervisors = [] } = useQuery({
    queryKey: ['admin', 'supervisors'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/supervisors');
      const data = await res.json();
      return data.success ? data.data : [];
    } });

  // Fetch salary calculation
  const { data: salaryData, isLoading } = useQuery({
    queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupervisor) return null;
      const res = await authFetch(
        `/api/admin/salary/calculate?supervisorCode=${selectedSupervisor}&startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      return data.success ? (data.data as SalaryCalculation) : null;
    },
    enabled: !!selectedSupervisor && !!startDate && !!endDate });

  async function submitAdminDeduction(e: React.FormEvent) {
    e.preventDefault();
    setAdminDeductionMsg(null);
    if (!selectedSupervisor) {
      setAdminDeductionMsg({ type: 'err', text: 'اختر مشرفاً أولاً' });
      return;
    }
    const amount = parseFloat(adminDeductionAmount);
    if (!adminDeductionDate || !Number.isFinite(amount) || amount <= 0) {
      setAdminDeductionMsg({ type: 'err', text: 'أدخل تاريخاً ومبلغاً صحيحاً' });
      return;
    }
    setAdminDeductionSaving(true);
    try {
      const res = await authFetch('/api/admin/salary/admin-deductions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorCode: selectedSupervisor,
          date: adminDeductionDate,
          reason: adminDeductionReason.trim() || 'خصم إداري',
          amount }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الحفظ');
      setAdminDeductionMsg({ type: 'ok', text: 'تم تسجيل الخصم' });
      setAdminDeductionAmount('');
      setAdminDeductionReason('');
      queryClient.invalidateQueries({
        queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate] });
    } catch (err: unknown) {
      setAdminDeductionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'خطأ' });
    } finally {
      setAdminDeductionSaving(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">حساب رواتب المشرفين</h1>
          <p className="text-[rgba(234,240,255,0.70)]">حساب رواتب المشرفين حسب نظام الراتب المحدد لكل مشرف</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="salary-supervisor-select" className="block text-sm font-medium text-gray-700 mb-2">اختر المشرف *</label>
              <select
                id="salary-supervisor-select"
                name="salary-supervisor-select"
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">اختر مشرف</option>
                {supervisors.map((s: Supervisor, index: number) => (
                  <option key={`supervisor-${s.code}-${index}`} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="salary-start-date" className="block text-sm font-medium text-gray-700 mb-2">من تاريخ</label>
              <input
                id="salary-start-date"
                name="salary-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label htmlFor="salary-end-date" className="block text-sm font-medium text-gray-700 mb-2">إلى تاريخ</label>
              <input
                id="salary-end-date"
                name="salary-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">خصم إداري على مشرف</h2>
          <p className="text-sm text-gray-600 mb-4">
            يُسجَّل في تبويب «خصومات_الإدارة» ويُخصم من راتب المشرف ويظهر له مع التفاصيل. أنشئ التبويب في ملف
            Google Sheets إن لم يكن موجوداً (أعمدة: كود المشرف، التاريخ، السبب، المبلغ، المسجل).
          </p>
          <form onSubmit={submitAdminDeduction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الخصم</label>
              <input
                type="date"
                value={adminDeductionDate}
                onChange={(e) => setAdminDeductionDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">السبب</label>
              <input
                type="text"
                value={adminDeductionReason}
                onChange={(e) => setAdminDeductionReason(e.target.value)}
                placeholder="مثال: خصم إداري — ..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ج.م)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={adminDeductionAmount}
                onChange={(e) => setAdminDeductionAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={adminDeductionSaving || !selectedSupervisor}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {adminDeductionSaving ? 'جاري الحفظ...' : 'تسجيل الخصم'}
            </button>
          </form>
          {adminDeductionMsg && (
            <p
              className={`mt-2 text-sm ${adminDeductionMsg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}
            >
              {adminDeductionMsg.text}
            </p>
          )}
        </div>

        {/* SRS-013 Phase 3: Payroll Ledger -- additive, alongside (not replacing) the form above. */}
        {ledgerEnabled && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">سجل المعاملات المالية (مكافأة / خصم / سلفة / تعديل)</h2>
            <p className="text-sm text-gray-600 mb-4">
              يُسجَّل في تبويب «سجل_المعاملات_المالية» الجديد (append-only) ويُضاف مباشرةً لحساب الراتب الصافي لهذا
              المشرف عن هذا الشهر. لا يستبدل خصم الإدارة الحالي أعلاه.
            </p>
            <form onSubmit={submitLedgerTransaction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
                <select
                  value={ledgerType}
                  onChange={(e) => setLedgerType(e.target.value as LedgerTxType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {Object.entries(LEDGER_TYPE_LABELS_AR).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الشهر (YYYY-MM)</label>
                <input
                  type="month"
                  value={ledgerPeriod}
                  onChange={(e) => setLedgerPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">السبب</label>
                <input
                  type="text"
                  value={ledgerReason}
                  onChange={(e) => setLedgerReason(e.target.value)}
                  placeholder="مثال: مكافأة أداء شهر ..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المبلغ (ج.م){ledgerType === 'adjustment' ? ' — موجب/سالب' : ''}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={ledgerAmount}
                  onChange={(e) => setLedgerAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={ledgerSaving || !selectedSupervisor}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {ledgerSaving ? 'جاري الحفظ...' : 'تسجيل المعاملة'}
              </button>
            </form>
            {ledgerMsg && (
              <p className={`mt-2 text-sm ${ledgerMsg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{ledgerMsg.text}</p>
            )}

            {selectedSupervisor && ledgerTransactions.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">النوع</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">المبلغ</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">السبب</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">المصدر</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">الحالة</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledgerTransactions.map((t) => (
                      <tr key={t.transactionId} className={t.status !== 'active' ? 'opacity-50' : undefined}>
                        <td className="py-2 px-3">{LEDGER_TYPE_LABELS_AR[t.type]}</td>
                        <td className={`py-2 px-3 font-semibold ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {t.amount >= 0 ? '+' : ''}
                          {t.amount.toFixed(2)} ج.م
                        </td>
                        <td className="py-2 px-3 text-gray-600">{t.reason || '—'}</td>
                        <td className="py-2 px-3 text-gray-500">{t.source === 'legacy_mirror' ? 'خصم إداري (قديم)' : 'مباشر'}</td>
                        <td className="py-2 px-3 text-gray-500">
                          {t.status === 'active' ? 'نشطة' : t.status === 'corrected' ? 'مُعدَّلة' : 'ملغاة'}
                        </td>
                        <td className="py-2 px-3">
                          {t.status === 'active' && t.source === 'ledger_native' && (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => startEditTx(t)} className="text-blue-600 hover:underline">
                                تعديل
                              </button>
                              <button type="button" onClick={() => voidLedgerTx(t.transactionId)} className="text-red-600 hover:underline">
                                حذف
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingTx && (
              <form onSubmit={submitEditTx} className="mt-4 p-4 bg-blue-50 rounded-lg grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">تعديل السبب</label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ الجديد</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
                    حفظ التعديل
                  </button>
                  <button type="button" onClick={() => setEditingTx(null)} className="px-4 py-2 bg-gray-200 rounded-lg">
                    إلغاء
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {isLoading && (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">جاري حساب الراتب...</p>
          </div>
        )}

        {salaryData && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">الراتب الأساسي</p>
                <p className="text-2xl font-bold text-blue-600">{salaryData.baseAmount.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">إجمالي الخصومات</p>
                <p className="text-2xl font-bold text-red-600">{salaryData.deductions.total.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">الراتب الصافي</p>
                <p className="text-2xl font-bold text-green-600">{salaryData.netSalary.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">نوع الراتب</p>
                <p className="text-lg font-semibold text-gray-800">
                  {salaryData.salaryMethod === 'fixed'
                    ? 'راتب ثابت'
                    : salaryData.salaryMethod === 'commission_type1'
                    ? 'عمولة (نوع 1)'
                    : salaryData.salaryMethod === 'commission_type2'
                    ? 'عمولة (نوع 2)'
                    : 'عمولة (نظام قديم)'}
                </p>
              </div>
            </div>

            {/* Commission Details */}
            {salaryData.commission && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">تفاصيل العمولة</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">إجمالي الطلبات</p>
                    <p className="text-xl font-semibold text-gray-800">{salaryData.commission.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">إجمالي الساعات</p>
                    <p className="text-xl font-semibold text-gray-800">{salaryData.commission.totalHours.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">العمولة المحسوبة</p>
                    <p className="text-xl font-semibold text-blue-600">
                      {salaryData.commission.calculatedCommission.toFixed(2)} ج.م
                    </p>
                  </div>
                  {salaryData.commission.type === 'type1' && salaryData.commission.details?.ratePerOrder != null && (
                    <div>
                      <p className="text-sm text-gray-600">معدل فعّال (مرجّح بعد الجمع اليومي)</p>
                      <p className="text-xl font-semibold text-gray-800">
                        {Number(salaryData.commission.details.ratePerOrder).toFixed(2)} ج.م/طلب
                      </p>
                    </div>
                  )}
                  {salaryData.commission.type === 'type2' && salaryData.commission.details && (
                    <>
                      <div>
                        <p className="text-sm text-gray-600">إجمالي قبض المشرف</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {(
                            salaryData.commission.details.totalSupervisorReceipts ??
                            salaryData.commission.details.totalReceipts ??
                            0
                          ).toFixed(2)}{' '}
                          ج.م
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">القيمة الأساسية</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {salaryData.commission.details.baseValue?.toFixed(2) || '0'} ج.م
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Deductions Breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">تفاصيل الخصومات</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <p className="text-sm text-gray-600">السلف</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.advances.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">الخصومات</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.deductions.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">المعدات</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.equipment.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">الاستعلام الأمني</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.security.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">خصم الأداء</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.performance.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">خصومات الإدارة</p>
                  <p className="text-lg font-semibold text-red-600">
                    {(salaryData.deductions.admin ?? 0).toFixed(2)} ج.م
                  </p>
                </div>
              </div>
            </div>

            {/* Daily Breakdown */}
            {salaryData.breakdown && salaryData.breakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">التفصيل اليومي</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">التاريخ</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الطلبات</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الساعات</th>
                        {salaryData.salaryMethod === 'commission_type1' && (
                          <>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">ج.م/طلب</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">عمولة يومية</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {salaryData.breakdown.map((day, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-800">
                            {new Date(day.date).toLocaleDateString('ar-EG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric' })}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{day.orders}</td>
                          <td className="py-3 px-4 text-gray-600">{day.hours.toFixed(1)}</td>
                          {salaryData.salaryMethod === 'commission_type1' && (
                            <>
                              <td className="py-3 px-4 text-gray-600">{day.multiplier.toFixed(2)}</td>
                              <td className="py-3 px-4 text-blue-600 font-semibold">
                                {day.dailyCommission.toFixed(2)} ج.م
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {salaryData.riderPerformance && salaryData.riderPerformance.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">أداء المناديب (الفترة)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">المندوب</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الكود</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الساعات</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الطلبات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {salaryData.riderPerformance.map((r) => (
                        <tr key={r.code} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-800">{r.name}</td>
                          <td className="py-3 px-4 text-gray-600">{r.code}</td>
                          <td className="py-3 px-4 text-gray-600">{r.totalHours.toFixed(1)}</td>
                          <td className="py-3 px-4 text-gray-600">{r.totalOrders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!isLoading && !salaryData && selectedSupervisor && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">لا توجد بيانات متاحة للفترة المحددة</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

