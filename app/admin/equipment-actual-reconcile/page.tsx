'use client';

import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { formatMilliemesAsEgp } from '@/lib/money';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Equipment REQUEST export + Talabat Wallet Actual import.
 * ACTUAL = Applaied Deduction on Wallet only. No FA / wallet exec.
 */
export default function EquipmentActualReconcilePage() {
  const qc = useQueryClient();
  const [deductionId, setDeductionId] = useState('');
  const [actualEgp, setActualEgp] = useState('');
  const [talabatReference, setTalabatReference] = useState('');
  const [actualDate, setActualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [walletFile, setWalletFile] = useState<File | null>(null);
  const [walletCycleId, setWalletCycleId] = useState('');
  const [walletConfirm, setWalletConfirm] = useState(false);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);
  const [walletResult, setWalletResult] = useState<{
    applied?: Array<Record<string, unknown>>;
    exceptions?: Array<Record<string, unknown>>;
    nextCyclePrep?: Array<Record<string, unknown>>;
    sourceColumns?: Record<string, string>;
  } | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'equipment-actual-reconcile'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/equipment-actual-reconcile');
      return res.json();
    },
  });

  const mapping = useQuery({
    queryKey: ['admin', 'equipment-wallet-import-meta'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/equipment-wallet-import');
      return res.json();
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/admin/equipment-actual-reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deductionId: deductionId.trim(),
          actualDeductedEgp: Number(actualEgp),
          actualDeductionDate: actualDate,
          talabatReference: talabatReference.trim(),
          evidenceNote: note,
          operatorConfirmation: confirm,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setMsg(
          data.duplicate
            ? 'تم تجاهل التكرار (idempotent)'
            : `تم تسجيل الفعلي — المتبقي ${formatMilliemesAsEgp(data.liability?.outstandingMilli ?? 0)} ج.م`
        );
        qc.invalidateQueries({ queryKey: ['admin', 'equipment-actual-reconcile'] });
      } else {
        setMsg(data.error || data.code || 'فشل');
      }
    },
  });

  const walletImport = useMutation({
    mutationFn: async () => {
      if (!walletFile) throw new Error('no file');
      const fd = new FormData();
      fd.append('file', walletFile);
      fd.append('cycleId', walletCycleId.trim());
      fd.append('actualDeductionDate', actualDate);
      fd.append('operatorConfirmation', walletConfirm ? 'true' : 'false');
      const res = await authFetch('/api/admin/equipment-wallet-import', {
        method: 'POST',
        body: fd,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setWalletResult(data);
      setWalletMsg(data.message || data.error || (data.success ? 'تم' : 'فشل'));
      if (data.success) {
        qc.invalidateQueries({ queryKey: ['admin', 'equipment-actual-reconcile'] });
      }
    },
  });

  const rows = list.data?.rows || [];
  const safety = list.data?.safety;
  const cols = mapping.data?.sourceColumns;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 text-[#EAF0FF]" dir="rtl">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">طلب خصم المعدات ↔ الخصم الفعلي (محفظة Talabat)</h1>
        <p className="text-sm text-[rgba(234,240,255,0.75)]">
          الطلب = <code>3Pl Internal Deductions</code> · الفعلي ={' '}
          <code>Applaied Deduction on Wallet</code> فقط. Financial Apply مقفول — النظام لا ينفّذ خصم
          المحفظة.
        </p>

        {safety && (
          <div className="text-xs text-[rgba(234,240,255,0.65)] border border-white/15 rounded-lg p-2 bg-[#12182B]">
            FA={String(safety.financialApplyEnabled)} · WalletMutByUs=false · Ledger=false ·
            PayrollExec=false
          </div>
        )}

        {cols && (
          <div className="text-xs border border-amber-500/40 rounded-lg p-2 bg-amber-950/80 text-amber-100">
            REQUESTED ← {cols.requested} · ACTUAL ← {cols.actual}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="text-sm underline text-cyan-300 hover:text-cyan-200"
            onClick={async () => {
              const res = await authFetch('/api/admin/equipment-actual-reconcile?format=csv');
              const text = await res.text();
              const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'equipment-request-actual-export.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            تصدير CSV (Requested vs Actual)
          </button>
        </div>

        <div className="rounded-xl border border-white/15 bg-[#12182B] p-4 space-y-3 text-[#EAF0FF]">
          <h2 className="font-semibold text-[#EAF0FF]">رفع ملف محفظة/رواتب Talabat (خميس/جمعة)</h2>
          <p className="text-xs text-[rgba(234,240,255,0.7)]">
            يقرأ Rider ID + 3Pl Internal Deductions + Applaied Deduction on Wallet، يطبّق الفعلي فقط على
            العهدة والـ REQUEST، ثم <strong className="text-[#EAF0FF]">يجهّز تلقائياً طلبات استقطاع الدورة التالية</strong> للمتبقي
            (open remainder / القسط التالي). لا ينفّذ خصم محفظة من الداشبورد (FA OFF).
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm text-[#EAF0FF]">
              ملف Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block mt-1 text-sm text-[#EAF0FF]"
                onChange={(e) => setWalletFile(e.target.files?.[0] || null)}
              />
            </label>
            <label className="text-sm text-[#EAF0FF]">
              cycleId (دورة الطلب)
              <input
                className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1 placeholder:text-white/40"
                value={walletCycleId}
                onChange={(e) => setWalletCycleId(e.target.value)}
                placeholder="معرّف دورة القبض"
              />
            </label>
          </div>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={walletConfirm}
              onChange={(e) => setWalletConfirm(e.target.checked)}
            />
            أؤكد أن الملف نتيجة خارجية من Talabat (Applaied = الفعلي)
          </label>
          <button
            type="button"
            className="px-4 py-2 rounded bg-emerald-800 text-white text-sm disabled:opacity-50"
            disabled={
              walletImport.isPending || !walletConfirm || !walletFile || !walletCycleId.trim()
            }
            onClick={() => {
              setWalletMsg(null);
              walletImport.mutate();
            }}
          >
            استيراد ومطابقة المحفظة
          </button>
          {walletMsg && <p className="text-sm text-[rgba(234,240,255,0.85)]">{walletMsg}</p>}
          {walletResult?.exceptions && walletResult.exceptions.length > 0 && (
            <div className="border border-rose-400/50 bg-rose-950/80 rounded-lg p-2 text-sm text-rose-100">
              <div className="font-semibold mb-1">استثناءات (FAIL CLOSED)</div>
              <ul className="list-disc pr-5 space-y-1">
                {walletResult.exceptions.map((e, i) => (
                  <li key={i}>
                    {String(e.riderId || '—')}: {String(e.code)} — {String(e.message)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {walletResult?.nextCyclePrep && walletResult.nextCyclePrep.length > 0 && (
            <div className="border border-white/15 rounded-lg p-2 text-sm overflow-x-auto bg-[#0B1020]">
              <div className="font-semibold mb-1 text-[#EAF0FF]">
                تحضير الدورة التالية (REQUEST على الاستقطاعات — جاهز للقبض القادم)
              </div>
              <table className="min-w-full text-xs text-[#EAF0FF]">
                <thead>
                  <tr className="text-right bg-[#1C2440]">
                    <th className="p-1 font-semibold">Rider</th>
                    <th className="p-1 font-semibold">Outstanding</th>
                    <th className="p-1 font-semibold">Next Expected</th>
                    <th className="p-1 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {walletResult.nextCyclePrep.map((n, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="p-1">{String(n.riderCode)}</td>
                      <td className="p-1">
                        {formatMilliemesAsEgp(Number(n.outstandingMilli) || 0)}
                      </td>
                      <td className="p-1">
                        {formatMilliemesAsEgp(Number(n.nextExpectedMilli) || 0)}
                      </td>
                      <td className="p-1">
                        {String(n.outcome)} ({String(n.reason)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/15 bg-[#12182B] p-4 space-y-3 text-[#EAF0FF]">
          <h2 className="font-semibold text-[#EAF0FF]">تسجيل خصم فعلي يدوي (صف واحد)</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm text-[#EAF0FF]">
              deductionId
              <input
                className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                value={deductionId}
                onChange={(e) => setDeductionId(e.target.value)}
              />
            </label>
            <label className="text-sm text-[#EAF0FF]">
              Actual Deducted (EGP) = Applaied
              <input
                type="number"
                className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                value={actualEgp}
                onChange={(e) => setActualEgp(e.target.value)}
              />
            </label>
            <label className="text-sm text-[#EAF0FF]">
              مرجع Talabat
              <input
                className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                value={talabatReference}
                onChange={(e) => setTalabatReference(e.target.value)}
              />
            </label>
            <label className="text-sm text-[#EAF0FF]">
              تاريخ الخصم الفعلي
              <input
                type="date"
                className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                value={actualDate}
                onChange={(e) => setActualDate(e.target.value)}
              />
            </label>
          </div>
          <label className="text-sm block text-[#EAF0FF]">
            ملاحظات
            <input
              className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="text-sm flex items-center gap-2 text-[#EAF0FF]">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            أؤكد أن هذا خصم فعلي من نتائج Talabat (وليس الطلب)
          </label>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-cyan-600 text-white text-sm hover:bg-cyan-500 disabled:opacity-50"
            disabled={apply.isPending || !confirm}
            onClick={() => {
              setMsg(null);
              apply.mutate();
            }}
          >
            تسجيل الفعلي
          </button>
          {msg && <p className="text-sm text-[rgba(234,240,255,0.85)]">{msg}</p>}
        </div>

        <div className="rounded-xl border border-white/15 bg-[#12182B] overflow-x-auto">
          <table className="min-w-full text-sm text-[#EAF0FF]">
            <thead>
              <tr className="bg-[#1C2440] text-[#EAF0FF] text-right">
                <th className="p-2 font-semibold">Rider</th>
                <th className="p-2 font-semibold">Liability</th>
                <th className="p-2 font-semibold">Requested</th>
                <th className="p-2 font-semibold">Actual</th>
                <th className="p-2 font-semibold">Request Status</th>
                <th className="p-2 font-semibold">Actual Status</th>
                <th className="p-2 font-semibold">Talabat Ref</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td className="p-3 text-[rgba(234,240,255,0.6)]" colSpan={7}>
                    جاري التحميل…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-[rgba(234,240,255,0.6)]" colSpan={7}>
                    لا توجد طلبات معدات بعد
                  </td>
                </tr>
              ) : (
                rows.map((r: Record<string, string | number>, i: number) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="p-2">{r.riderCode}</td>
                    <td className="p-2 font-mono text-xs">{r.liabilityId}</td>
                    <td className="p-2">{formatMilliemesAsEgp(Number(r.requestedAmount) || 0)}</td>
                    <td className="p-2">
                      {r.actualDeductedAmount === '' || r.actualDeductedAmount == null
                        ? '—'
                        : formatMilliemesAsEgp(Number(r.actualDeductedAmount))}
                    </td>
                    <td className="p-2">{r.requestStatus}</td>
                    <td className="p-2">{r.actualStatus}</td>
                    <td className="p-2 text-xs">{r.talabatReference || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
