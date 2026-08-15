'use client';

import { getStoredUser } from '@/lib/clientSession';
import { authFetch } from '@/lib/authFetch';
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
import { formatMilliemesAsEgp } from '@/lib/money';

const CYCLE_OPTIONS: { key: DeductionCycleKey; label: string }[] = (
  Object.entries(DEDUCTION_CYCLE_LABELS) as [DeductionCycleKey, string][]
).map(([key, label]) => ({ key, label }));

type PathMode = 'srs014' | 'legacy';

export default function AdminDeductionsReconcilePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [deductionCycle, setDeductionCycle] = useState<DeductionCycleKey | ''>('');
  const [month, setMonth] = useState<string>(() => String(new Date().getMonth() + 1));
  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [pathMode, setPathMode] = useState<PathMode>('srs014');
  const [completeCycleConfirmed, setCompleteCycleConfirmed] = useState(false);
  const [runAllocation, setRunAllocation] = useState(false);
  const [payoutCycleId, setPayoutCycleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    stats?: Record<string, number>;
    warnings?: string[];
    srs?: Record<string, unknown>;
  } | null>(null);

  const yearOptions = Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    try {
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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('deductionCycle', deductionCycle);
      fd.append('month', month);
      fd.append('year', year);

      if (pathMode === 'srs014') {
        fd.append('completeCycleConfirmed', completeCycleConfirmed ? 'true' : 'false');
        fd.append('runAllocation', runAllocation ? 'true' : 'false');
        if (payoutCycleId.trim()) fd.append('payoutCycleId', payoutCycleId.trim());
        const res = await authFetch('/api/admin/deductions-manager-compare', {
          method: 'POST',
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
          warnings: data.parseWarnings,
          srs: data,
        });
        setFile(null);
        return;
      }

      const res = await authFetch('/api/admin/deductions-reconcile', {
        method: 'POST',
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ';
      setResult({ ok: false, text: message });
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

  const srs = result?.srs as
    | {
        fileValidationStatus?: string;
        completeCycleConfirmed?: boolean;
        evidenceIdentityKey?: string | null;
        allocationReady?: boolean;
        allocationOutcome?: string;
        allocatedTotalMilli?: number;
        anomalyActualExceedsRequested?: unknown[];
        linesPreview?: Array<{
          riderCode: string;
          requestedMilli: number;
          actualMilli: number | null;
          deltaMilli: number | null;
        }>;
        financialMutation?: boolean;
        financialApplyEnabled?: boolean;
      }
    | undefined;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#EAF0FF]">
          استقطاعات المدير — مقارنة مع رفع المشرفين
        </h1>
        <p className="text-sm text-[rgba(234,240,255,0.7)] leading-relaxed">
          المسار الافتراضي (SRS-014): Manager Compare → Evidence → Allocation (اختياري).{' '}
          <strong className="text-[#EAF0FF]">لا يخصم فلوسًا</strong> — Financial Apply يبقى مقفولًا.
          المسار القديم يكتب فقط إلى «الاستقطاعات_الفعلية» كما سابقًا.
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
            {srs && (
              <ul className="text-xs space-y-1 opacity-95">
                <li>FILE status: {srs.fileValidationStatus}</li>
                <li>completeCycleConfirmed: {String(srs.completeCycleConfirmed)}</li>
                <li>evidenceIdentityKey: {srs.evidenceIdentityKey || '—'}</li>
                <li>allocationReady: {String(srs.allocationReady)}</li>
                <li>allocationOutcome: {srs.allocationOutcome || '—'}</li>
                <li>
                  allocatedTotal:{' '}
                  {formatMilliemesAsEgp(srs.allocatedTotalMilli ?? 0)} ج.م
                </li>
                <li>
                  anomalies (actual &gt; requested):{' '}
                  {(srs.anomalyActualExceedsRequested || []).length}
                </li>
                <li>financialMutation: {String(srs.financialMutation)}</li>
                <li>financialApplyEnabled: {String(srs.financialApplyEnabled)}</li>
              </ul>
            )}
            {srs?.linesPreview && srs.linesPreview.length > 0 && (
              <div className="overflow-x-auto max-h-48 border border-white/10 rounded">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr>
                      <th className="p-1 text-right">Rider</th>
                      <th className="p-1 text-right">Requested</th>
                      <th className="p-1 text-right">Actual</th>
                      <th className="p-1 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {srs.linesPreview.map((l) => (
                      <tr key={l.riderCode} className="border-t border-white/10">
                        <td className="p-1">{l.riderCode}</td>
                        <td className="p-1">{formatMilliemesAsEgp(l.requestedMilli)}</td>
                        <td className="p-1">
                          {l.actualMilli == null ? '—' : formatMilliemesAsEgp(l.actualMilli)}
                        </td>
                        <td className="p-1">
                          {l.deltaMilli == null ? '—' : formatMilliemesAsEgp(l.deltaMilli)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.stats && (
              <ul className="text-xs space-y-1 opacity-95">
                <li>إجمالي صفوف المقارنة: {result.stats.total}</li>
                <li>متطابقة: {result.stats['متطابقة'] ?? 0}</li>
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
            <fieldset className="space-y-2 text-sm text-[#EAF0FF]">
              <legend className="mb-1">مسار المقارنة</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="path"
                  checked={pathMode === 'srs014'}
                  onChange={() => setPathMode('srs014')}
                />
                SRS-014 (Evidence + Allocation) — بدون خصم مالي
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="path"
                  checked={pathMode === 'legacy'}
                  onChange={() => setPathMode('legacy')}
                />
                Legacy → كتابة «الاستقطاعات_الفعلية»
              </label>
            </fieldset>

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

            {pathMode === 'srs014' && (
              <div className="space-y-3 rounded-lg border border-white/10 p-3 text-sm text-[#EAF0FF]">
                <label className="block space-y-1">
                  <span>payoutCycleId (اختياري — لتصفية REQUEST)</span>
                  <input
                    className="w-full rounded-md bg-[#1e1e2f] border border-white/15 px-3 py-2"
                    value={payoutCycleId}
                    onChange={(e) => setPayoutCycleId(e.target.value)}
                    placeholder="cycleId من دورات_القبض"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={completeCycleConfirmed}
                    onChange={(e) => setCompleteCycleConfirmed(e.target.checked)}
                  />
                  أؤكد أن ملف الدورة كامل (FILE_VALID) — مطلوب قبل Allocation
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={runAllocation}
                    onChange={(e) => setRunAllocation(e.target.checked)}
                    disabled={!completeCycleConfirmed}
                  />
                  تشغيل Allocation foundation (سجلات APPLIED فقط — بدون Wallet/Ledger)
                </label>
              </div>
            )}

            <div>
              <span className="block text-sm text-[#EAF0FF] mb-1">ملف Excel (شيت المدير)</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="text-sm text-[#EAF0FF]"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <Button type="submit" variant="primary" disabled={loading || !file || !deductionCycle}>
              {loading
                ? 'جاري المعالجة...'
                : pathMode === 'srs014'
                  ? 'تشغيل Manager Compare (SRS-014)'
                  : 'مقارنة وكتابة إلى «الاستقطاعات_الفعلية»'}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
