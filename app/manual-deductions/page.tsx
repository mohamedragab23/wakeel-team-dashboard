'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';

export default function ManualDeductionsV2Page() {
  const notify = usePageNotify();
  const [form, setForm] = useState({
    riderCode: '',
    riderName: '',
    amount: '',
    reason: 'سلفة',
    cycleId: '',
    notes: '',
  });

  const capability = useQuery({
    queryKey: ['manual-deductions-v2'],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/manual-deductions');
      return res.json();
    },
  });

  const cycles = useQuery({
    queryKey: ['payout-cycles-for-manual'],
    enabled: Boolean(capability.data?.enabled),
    queryFn: async () => {
      const now = new Date();
      const res = await authFetch(
        `/api/supervisor/payout-cycles?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      );
      const json = await res.json();
      if (!json.success) return [] as { cycleId: string; cycleNumber: number; startDate: string; endDate: string }[];
      return json.cycles as { cycleId: string; cycleNumber: number; startDate: string; endDate: string }[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/supervisor/manual-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الحفظ');
      return json;
    },
    onSuccess: () => {
      notify.success('تم تسجيل الخصم في سجل المعاملات');
      setForm((f) => ({ ...f, amount: '', notes: '' }));
    },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">خصومات يدوية (V2)</h1>
        <p className="text-sm text-slate-600">
          بديل لنموذج Excel. مسار الرفع القديم يبقى متاحاً من صفحة الاستقطاعات.
        </p>

        {!capability.data?.enabled ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
            الميزة غير مفعّلة (`FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED`).
          </div>
        ) : (
          <form
            className="space-y-3 border rounded-lg p-4 bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
          >
            <label className="block text-sm">
              كود المندوب
              <input
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.riderCode}
                onChange={(e) => setForm((f) => ({ ...f, riderCode: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              اسم المندوب
              <input
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.riderName}
                onChange={(e) => setForm((f) => ({ ...f, riderName: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              المبلغ (جنيه)
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              السبب
              <select
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              >
                <option value="سلفة">سلفة</option>
                <option value="خصم تشغيل">خصم تشغيل</option>
              </select>
            </label>
            <label className="block text-sm">
              دورة القبض
              <select
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.cycleId}
                onChange={(e) => setForm((f) => ({ ...f, cycleId: e.target.value }))}
                required
              >
                <option value="">اختر…</option>
                {(cycles.data || []).map((c) => (
                  <option key={c.cycleId} value={c.cycleId}>
                    #{c.cycleNumber} — {c.startDate} → {c.endDate}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              ملاحظات
              <input
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <button
              type="submit"
              disabled={mut.isPending}
              className="w-full bg-slate-800 text-white rounded py-2 disabled:opacity-50"
            >
              حفظ
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}
