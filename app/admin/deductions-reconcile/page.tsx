'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';

const CYCLE_OPTIONS: { key: DeductionCycleKey; label: string }[] = (
  Object.entries(DEDUCTION_CYCLE_LABELS) as [DeductionCycleKey, string][]
).map(([key, label]) => ({ key, label }));

export default function AdminDeductionsReconcilePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [deductionCycle, setDeductionCycle] = useState<DeductionCycleKey | ''>('');
  const [month, setMonth] = useState<string>(() => String(new Date().getMonth() + 1));
  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    stats?: Record<string, number>;
    warnings?: string[];
  } | null>(null);

  const yearOptions = Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.replace('/');
      return;
    }
    try {
      const u = JSON.parse(userStr) as { role?: string; permissions?: string };
      if (u.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      setAllowed(true);
    } catch {
      router.replace('/');
    }
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !deductionCycle) return;
    setLoading(true);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('deductionCycle', deductionCycle);
      fd.append('month', month);
      fd.append('year', year);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${origin}/api/admin/deductions-reconcile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        setResult({
          ok: false,
          text: data.error || 'فشل',
          warnings: data.details,
        });
        return;
      }
      setResult({
        ok: true,
        text: data.message || 'تم',
        stats: data.stats,
        warnings: data.parseWarnings,
      });
      setFile(null);
    } catch (err: any) {
      setResult({ ok: false, text: err.message || 'خطأ' });
    } finally {
      setLoading(false);
    }
  };

  if (allowed !== true) {
    return (
      <Layout>
        <div className="p-8 text-center text-[#EAF0FF]">جاري التحقق...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#EAF0FF]">استقطاعات المدير — مقارنة مع رفع المشرفين</h1>
        <p className="text-sm text-[rgba(234,240,255,0.7)] leading-relaxed">
          ارفع شيت Excel كما يصدر من النظام (Rider ID، Applaied Deduction on Wallet، …). حدد{' '}
          <strong className="text-[#EAF0FF]">نفس</strong> الدورة والشهر والسنة المستخدمة في رفع المشرف لورقة
          «الاستقطاعات». يتمتجميع قيم المشرفين لكل كود مندوب ومقارنتها بمجموع عمود خصم المحفظة من شيتك، ثم إلحاق
          النتائج في Google Sheet تسمى <strong className="text-[#EAF0FF]">الاستقطاعات_الفعلية</strong>.
        </p>
        <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
          الصلاحية: أضف في ورقة Admins للعمود الرابع (الصلاحيات) أحد القيم:{' '}
          <code className="text-amber-100">deductions_verify</code> أو{' '}
          <code className="text-amber-100">استقطاعات_ادمن</code> أو <code className="text-amber-100">all</code>.
        </p>

        {result && (
          <div
            className={`rounded-lg px-4 py-3 text-sm space-y-2 ${
              result.ok
                ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-500/30'
                : 'bg-red-500/15 text-red-100 border border-red-500/30'
            }`}
          >
            <div>{result.text}</div>
            {result.stats && (
              <ul className="text-xs space-y-1 opacity-95">
                <li>إجمالي صفوف المقارنة: {result.stats.total}</li>
                <li>متطابقة: {result.stats['متطابقة'] ?? 0}</li>
                <li>المحفظة أعلى من المشرف: {result.stats['المحفظة_أعلى_من_المشرف'] ?? 0}</li>
                <li>المشرف أعلى من المحفظة: {result.stats['المشرف_أعلى_من_المحفظة'] ?? 0}</li>
                <li>لا يوجد في شيت المدير: {result.stats['لا_يوجد_في_شيت_المدير'] ?? 0}</li>
                <li>لا يوجد في رفع المشرف: {result.stats['لا_يوجد_في_رفع_المشرف'] ?? 0}</li>
              </ul>
            )}
            {result.warnings && result.warnings.length > 0 && (
              <ul className="list-disc list-inside text-xs max-h-32 overflow-auto opacity-90">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Card title="الفترة وملف شيت المدير">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <span className="block text-sm text-[#EAF0FF] mb-1">ملف Excel (شيت المدير)</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="text-sm text-[#EAF0FF]"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-[rgba(234,240,255,0.55)] mt-2">
                الأعمدة المتوقعة تشمل: Rider ID، Rider Name، 3PL، City، Starting Point، Vehicle، Salaries،
                Deduction، …، Applaied Deduction on Wallet، Net After Deduction، Transfer Type.
              </p>
            </div>

            <Button type="submit" variant="primary" disabled={loading || !file || !deductionCycle}>
              {loading ? 'جاري المقارنة والكتابة...' : 'مقارنة وكتابة إلى «الاستقطاعات_الفعلية»'}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
