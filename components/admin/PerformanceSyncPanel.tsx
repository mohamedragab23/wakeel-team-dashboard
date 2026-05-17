'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type PendingEntry = {
  targetDate: string;
  status: string;
  reason: string;
  wakeelRows: number;
  zeroRatio: number;
};

export default function PerformanceSyncPanel() {
  const queryClient = useQueryClient();
  const [syncDate, setSyncDate] = useState('');
  const [codDate, setCodDate] = useState('');
  const [codFile, setCodFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'performance-sync'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/performance-sync', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل التحميل');
      return j.data as {
        pending: PendingEntry[];
        suggestedDate: string;
        tableauConfigured: boolean;
        cloudflareAccessConfigured: boolean;
      };
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (params: { action: string; date: string }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/performance-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      });
      const j = await res.json();
      if (!j.success && j.result?.status !== 'pending') throw new Error(j.error || j.result?.message || 'فشل');
      return j;
    },
    onSuccess: (j) => {
      const r = j.result;
      setMsg({
        type: r?.status === 'failed' ? 'err' : 'ok',
        text: r?.message || j.message || 'تم',
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'performance-sync'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'performance-stats'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
    },
    onError: (e: Error) => setMsg({ type: 'err', text: e.message }),
  });

  const codMutation = useMutation({
    mutationFn: async () => {
      const d = codDate || syncDate || data?.suggestedDate || '';
      if (!codFile || !d) throw new Error('اختر التاريخ وملف COD');
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', codFile);
      fd.append('date', d);
      const res = await fetch('/api/admin/cod-snapshot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل رفع COD');
      return j;
    },
    onSuccess: (j) => {
      setMsg({ type: 'ok', text: j.message || 'تم حفظ المديونية' });
      setCodFile(null);
    },
    onError: (e: Error) => setMsg({ type: 'err', text: e.message }),
  });

  const suggested = data?.suggestedDate || '';
  const dateVal = syncDate || suggested;

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:p-6 space-y-4 text-[#EAF0FF]">
      <div>
        <h2 className="text-lg font-semibold">مزامنة Tableau التلقائية</h2>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mt-1">
          يومياً الساعة 12:00 ظهراً (القاهرة) يُسحب أداء <strong>أمس</strong> من Tableau. إن كانت البيانات فارغة يظهر تنبيه
          هنا. المديونية من COD (اختياري).
        </p>
        {!data?.tableauConfigured && !isLoading && (
          <p className="text-amber-200 text-sm mt-2">متغيرات Tableau غير مضبوطة على السيرفر.</p>
        )}
        {data?.tableauConfigured && !data?.cloudflareAccessConfigured && !isLoading && (
          <p className="text-amber-200 text-sm mt-2">
            Tableau محمي بـ Cloudflare Access — السحب من Vercel يحتاج{' '}
            <code className="text-xs">CLOUDFLARE_ACCESS_CLIENT_ID</code> و{' '}
            <code className="text-xs">CLOUDFLARE_ACCESS_CLIENT_SECRET</code> (Service Token من IT). حتى ذلك: صدّر
            Excel من Tableau وارفعه يدوياً أدناه.
          </p>
        )}
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
      {(data?.pending?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-200">تحديثات بانتظار الموافقة</h3>
          {data!.pending.map((p) => (
            <div
              key={p.targetDate}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm"
            >
              <div className="flex-1">
                <p className="font-medium">يوم {p.targetDate}</p>
                <p className="text-xs opacity-70">{p.reason}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={syncMutation.isPending}
                  onClick={() => syncMutation.mutate({ action: 'approve', date: p.targetDate })}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold"
                >
                  اعتماد
                </button>
                <button
                  type="button"
                  disabled={syncMutation.isPending}
                  onClick={() => syncMutation.mutate({ action: 'skip', date: p.targetDate })}
                  className="px-3 py-1.5 rounded-md border border-white/20 text-xs"
                >
                  تخطي
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <label className="flex-1 text-sm">
          تاريخ السحب
          <input
            type="date"
            value={dateVal}
            onChange={(e) => setSyncDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={syncMutation.isPending || !dateVal}
          onClick={() => syncMutation.mutate({ action: 'sync', date: dateVal })}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-black font-semibold disabled:opacity-50"
        >
          سحب من Tableau
        </button>
        <button
          type="button"
          disabled={syncMutation.isPending || !dateVal}
          onClick={() => syncMutation.mutate({ action: 'force', date: dateVal })}
          className="px-4 py-2 rounded-lg border border-white/20 text-sm"
        >
          فرض التحديث
        </button>
      </div>
      <div className="border-t border-white/10 pt-4 space-y-3">
        <h3 className="text-sm font-medium">رفع COD</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={codDate || dateVal}
            onChange={(e) => setCodDate(e.target.value)}
            className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
          />
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setCodFile(e.target.files?.[0] || null)} className="text-sm flex-1" />
          <button
            type="button"
            disabled={codMutation.isPending}
            onClick={() => codMutation.mutate()}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold"
          >
            حفظ المديونية
          </button>
        </div>
      </div>
    </div>
  );
}