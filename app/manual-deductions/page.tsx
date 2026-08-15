'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { ZONE_OPTIONS } from '@/lib/zones';

const REASONS = ['سلفة', 'خصم تشغيلي', 'مديونية سابقة', 'أخرى'] as const;
const CYCLE_OPTIONS = [
  { key: 'first', label: 'الأولى' },
  { key: 'second', label: 'الثانية' },
  { key: 'third', label: 'الثالثة' },
] as const;

const MONTHS = [
  { n: 1, label: 'يناير' },
  { n: 2, label: 'فبراير' },
  { n: 3, label: 'مارس' },
  { n: 4, label: 'أبريل' },
  { n: 5, label: 'مايو' },
  { n: 6, label: 'يونيو' },
  { n: 7, label: 'يوليو' },
  { n: 8, label: 'أغسطس' },
  { n: 9, label: 'سبتمبر' },
  { n: 10, label: 'أكتوبر' },
  { n: 11, label: 'نوفمبر' },
  { n: 12, label: 'ديسمبر' },
];

export default function ManualDeductionsV2Page() {
  const notify = usePageNotify();
  const now = new Date();
  const [form, setForm] = useState({
    riderCode: '',
    riderName: '',
    zone: ZONE_OPTIONS[0],
    amount: '',
    reason: 'سلفة' as (typeof REASONS)[number],
    reasonOther: '',
    cycleKey: 'first' as (typeof CYCLE_OPTIONS)[number]['key'],
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    notes: '',
  });

  const capability = useQuery({
    queryKey: ['manual-deductions-v2'],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/manual-deductions');
      return res.json();
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/supervisor/manual-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderCode: form.riderCode,
          riderName: form.riderName,
          zone: form.zone,
          amount: Number(form.amount),
          reason: form.reason,
          reasonOther: form.reasonOther,
          cycleKey: form.cycleKey,
          month: form.month,
          year: form.year,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الحفظ');
      return json;
    },
    onSuccess: () => {
      notify.success('تم تسجيل طلب الاستقطاع (REQUEST) — لم يُطبَّق خصم مالي بعد');
      setForm((f) => ({ ...f, amount: '', notes: '', reasonOther: '' }));
    },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">خصومات يدوية (V2)</h1>
        <p className="text-sm text-slate-600">
          يسجّل طلب استقطاع على مسار الاستقطاعات (REQUEST) لينضم لخصم المعدات الأوتوماتيك عند التفعيل.
          لا يطبّق خصماً مالياً فورياً ولا يعدّل عهدة المعدات.
        </p>
        <p className="text-xs text-slate-500">
          لتفعيل الإنتاج على Vercel: عيّن{' '}
          <code className="bg-slate-100 px-1 rounded">FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED=true</code>{' '}
          (افتراضياً OFF).
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
              الزون
              <select
                className="mt-1 w-full border rounded px-2 py-1"
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value as typeof form.zone }))}
                required
              >
                {ZONE_OPTIONS.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
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
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    reason: e.target.value as (typeof REASONS)[number],
                  }))
                }
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {form.reason === 'أخرى' && (
              <label className="block text-sm">
                تفاصيل السبب (مطلوب)
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.reasonOther}
                  onChange={(e) => setForm((f) => ({ ...f, reasonOther: e.target.value }))}
                  required
                />
              </label>
            )}
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm col-span-1">
                الدورة
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.cycleKey}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cycleKey: e.target.value as typeof form.cycleKey,
                    }))
                  }
                >
                  {CYCLE_OPTIONS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm col-span-1">
                الشهر
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.month}
                  onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
                >
                  {MONTHS.map((m) => (
                    <option key={m.n} value={m.n}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm col-span-1">
                السنة
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  required
                />
              </label>
            </div>
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
              تسجيل طلب الاستقطاع
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}
