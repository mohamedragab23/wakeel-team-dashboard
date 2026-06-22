'use client';

import { authFetch } from '@/lib/authFetch';
import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey } from '@/lib/equipmentSheetConstants';

const CYCLE_OPTIONS: { key: DeductionCycleKey; label: string }[] = (
  Object.entries(DEDUCTION_CYCLE_LABELS) as [DeductionCycleKey, string][]
).map(([key, label]) => ({ key, label }));

export default function DeductionsUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [deductionCycle, setDeductionCycle] = useState<DeductionCycleKey | ''>('');
  const [month, setMonth] = useState<string>(() => String(new Date().getMonth() + 1));
  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string; details?: string[] } | null>(null);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => String(y - 2 + i));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage({ type: 'err', text: 'اختر ملف Excel' });
      return;
    }
    if (!deductionCycle) {
      setMessage({ type: 'err', text: 'حدد دورة الاستقطاع' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('deductionCycle', deductionCycle);
      fd.append('month', month);
      fd.append('year', year);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await authFetch(`${origin}/api/supervisor/deductions-upload`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd });
      const data = await res.json();
      if (!data.success) {
        setMessage({
          type: 'err',
          text: data.error || 'فشل الرفع',
          details: data.details });
        return;
      }
      setMessage({
        type: 'ok',
        text: `${data.message || 'تم'} (${data.imported || 0} صف)`,
        details: data.errors });
      setFile(null);
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'خطأ' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#EAF0FF]">رفع استقطاعات (Excel)</h1>
        <p className="text-sm text-[rgba(234,240,255,0.65)]">
          حدّد <strong className="text-[#EAF0FF]">دورة الاستقطاع</strong> والشهر والسنة قبل الرفع. تُنسخ هذه
          البيانات لكل صف في ورقة Google «الاستقطاعات» (أعمدة: دورة_الاستقطاع، شهر، سنة) مع تاريخ الرفع وكود
          المشرف. أعمدة Excel: كود المندوب، اسم المندوب، قيمة الاستقطاع، سبب الاستقطاع، الزون.
        </p>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm space-y-2 ${
              message.type === 'ok'
                ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-500/30'
                : 'bg-red-500/15 text-red-100 border border-red-500/30'
            }`}
          >
            <div>{message.text}</div>
            {message.details && message.details.length > 0 && (
              <ul className="list-disc list-inside text-xs opacity-90 max-h-40 overflow-auto">
                {message.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Card title="الفترة والملف">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1 text-sm text-[#EAF0FF]">
                <span>دورة الاستقطاع</span>
                <select
                  className="w-full rounded-md bg-[#1e1e2f] border border-white/15 px-3 py-2 text-[#EAF0FF]"
                  value={deductionCycle}
                  onChange={(e) => setDeductionCycle(e.target.value as DeductionCycleKey | '')}
                  required
                >
                  <option value="">— اختر —</option>
                  {CYCLE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-[#EAF0FF]">
                <span>الشهر</span>
                <select
                  className="w-full rounded-md bg-[#1e1e2f] border border-white/15 px-3 py-2 text-[#EAF0FF]"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                >
                  {ARABIC_MONTH_NAMES.map((name, i) => (
                    <option key={name} value={String(i + 1)}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-[#EAF0FF]">
                <span>السنة</span>
                <select
                  className="w-full rounded-md bg-[#1e1e2f] border border-white/15 px-3 py-2 text-[#EAF0FF]"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="block text-sm text-[#EAF0FF] mb-1">ملف Excel</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="text-sm text-[#EAF0FF]"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={loading || !file || !deductionCycle}>
              {loading ? 'جاري الرفع...' : 'رفع إلى Google Sheets'}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
