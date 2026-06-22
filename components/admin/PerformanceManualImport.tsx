'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type Preview = {
  targetDate: string;
  source: 'tableau' | 'legacy';
  wakeelRows: number;
  withDataRows: number;
  zeroRatio: number;
  qualityMessage: string;
  isSuspiciousEmpty: boolean;
  codRiders: number;
  hadCodFile: boolean;
  warnings: string[];
  sample: Array<{ riderCode: string; hours: number; orders: number; debt: number }>;
};

type PerformanceManualImportProps = {
  date: string;
};

export default function PerformanceManualImport({ date }: PerformanceManualImportProps) {
  const queryClient = useQueryClient();
  const [perfFile, setPerfFile] = useState<File | null>(null);
  const [codFile, setCodFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [forceReplace, setForceReplace] = useState(false);
  const [skipQuality, setSkipQuality] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const dateIso = date?.trim() || '';

  async function submit(action: 'preview' | 'apply') {
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      setMsg({ type: 'err', text: 'اختر تاريخ الأداء من الأعلى أولاً' });
      return;
    }
    if (!perfFile) {
      setMsg({ type: 'err', text: 'اختر ملف الأداء (تصدير Tableau Crosstab Excel)' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('action', action);
      fd.append('date', dateIso);
      fd.append('performanceFile', perfFile);
      if (codFile) fd.append('codFile', codFile);
      if (forceReplace) fd.append('forceReplace', '1');
      if (skipQuality) fd.append('skipQualityBlock', '1');

      const res = await authFetch('/api/admin/performance-import', {
        method: 'POST',
        body: fd });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'فشلت العملية');

      if (action === 'preview') {
        setPreview(j.preview);
        setMsg({ type: 'ok', text: 'تمت المعاينة — راجع الأرقام ثم اضغط «حفظ في الشيت»' });
      } else {
        setPreview(j.preview);
        setMsg({ type: 'ok', text: j.message || 'تم الحفظ' });
        setPerfFile(null);
        setCodFile(null);
        queryClient.invalidateQueries({ queryKey: ['admin', 'performance-stats'] });
        queryClient.invalidateQueries({ queryKey: ['riders'] });
        queryClient.invalidateQueries({ queryKey: ['performance'] });
      }
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-6 space-y-4 text-[#EAF0FF]">
      <div>
        <h2 className="text-lg font-semibold">رفع الأداء يدوياً (Tableau + COD)</h2>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mt-1">
          صدّر من Tableau: Download → Crosstab → Excel (Rider Performance، فلتر wakeel). ارفع ملف COD اختيارياً —
          النظام يصفّي الأعمدة، يدمج المديونية، ويكتب في البيانات اليومية.
        </p>
      </div>

      {msg && (
        <div
          className={
            msg.type === 'ok'
              ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100'
              : 'rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100'
          }
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm block">
          ملف الأداء (Excel) *
          <input
            type="file"
            accept=".xlsx,.xls"
            className="mt-1 w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => {
              setPerfFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <label className="text-sm block">
          ملف COD (اختياري)
          <input
            type="file"
            accept=".xlsx,.xls"
            className="mt-1 w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => setCodFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={forceReplace} onChange={(e) => setForceReplace(e.target.checked)} />
          استبدال يوم موجود
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={skipQuality} onChange={(e) => setSkipQuality(e.target.checked)} />
          رفع رغم تحذير بيانات فارغة
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading || !perfFile}
          onClick={() => submit('preview')}
          className="px-4 py-2 rounded-lg border border-white/25 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'جاري المعالجة...' : 'معاينة'}
        </button>
        <button
          type="button"
          disabled={loading || !perfFile}
          onClick={() => submit('apply')}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
        >
          حفظ في الشيت
        </button>
      </div>

      {preview && (
        <div className="rounded-lg border border-white/15 bg-black/25 p-4 text-sm space-y-2">
          <p>
            المصدر: <strong>{preview.source === 'tableau' ? 'تصدير Tableau' : 'ملف الأعمدة التسعة'}</strong>
          </p>
          <p>
            مناديب: <strong>{preview.wakeelRows}</strong> — ببيانات: <strong>{preview.withDataRows}</strong> — COD:{' '}
            <strong>{preview.codRiders}</strong>
          </p>
          <p className={preview.isSuspiciousEmpty ? 'text-amber-200' : 'text-emerald-200'}>{preview.qualityMessage}</p>
          {preview.sample.length > 0 && (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="p-1 text-right">كود</th>
                  <th className="p-1">ساعات</th>
                  <th className="p-1">طلبات</th>
                  <th className="p-1">مديونية</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r) => (
                  <tr key={r.riderCode} className="border-b border-white/10">
                    <td className="p-1">{r.riderCode}</td>
                    <td className="p-1 text-center">{r.hours}</td>
                    <td className="p-1 text-center">{r.orders}</td>
                    <td className="p-1 text-center">{r.debt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}