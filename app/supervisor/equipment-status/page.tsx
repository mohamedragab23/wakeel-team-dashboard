'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { EQUIPMENT_PAYMENT_STATUS_AR } from '@/lib/equipmentLiability/paymentStatus';

type DeskRow = {
  riderCode: string;
  riderName: string;
  zone: string;
  hasLiability: boolean;
  equipmentIssueId: string | null;
  status: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | null;
  paymentStatusAr: string;
  outstandingEgp: number | null;
  amountDeductedEgp: number | null;
  settlementPaidEgp: number | null;
  originalLiabilityEgp: number | null;
  pendingProposalId: string | null;
  pendingProposalKind: 'payment_update' | 'opening_report' | null;
};

const STATUS_OPTIONS = [
  { value: 'UNPAID', label: EQUIPMENT_PAYMENT_STATUS_AR.UNPAID },
  { value: 'PARTIALLY_PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PARTIALLY_PAID },
  { value: 'PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PAID },
] as const;

export default function SupervisorEquipmentStatusPage() {
  const notify = usePageNotify();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [q, setQ] = useState('');
  const [proposeFor, setProposeFor] = useState<DeskRow | null>(null);
  const [proposedStatus, setProposedStatus] = useState<'UNPAID' | 'PARTIALLY_PAID' | 'PAID'>('UNPAID');
  const [paidEgp, setPaidEgp] = useState('');
  const [note, setNote] = useState('');
  const [cycleId, setCycleId] = useState('');

  const cycles = useQuery({
    queryKey: ['supervisor-payout-cycles', 2026, 8],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/payout-cycles?year=2026&month=8');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل دورات القبض');
      return json.cycles as Array<{ cycleId: string; startDate: string; endDate: string; cycleNumber: number }>;
    },
  });

  const list = useQuery({
    queryKey: ['supervisor-equipment-liabilities'],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/equipment-liabilities');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return {
        rows: (json.rows || []) as DeskRow[],
        rosterRiderCount: Number(json.rosterRiderCount || 0),
        liabilityCount: Number(json.liabilityCount || 0),
      };
    },
  });

  const visible = useMemo(() => {
    const rows = list.data?.rows || [];
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'with' && !r.hasLiability) return false;
      if (filter === 'without' && r.hasLiability) return false;
      if (!qq) return true;
      return (
        r.riderCode.toLowerCase().includes(qq) ||
        r.riderName.toLowerCase().includes(qq)
      );
    });
  }, [list.data?.rows, filter, q]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!proposeFor) throw new Error('اختر مندوباً');
      if (!cycleId) throw new Error('اختر دورة القبض');
      const res = await authFetch('/api/supervisor/equipment-declarations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          equipmentIssueId: proposeFor.equipmentIssueId || undefined,
          riderCode: proposeFor.riderCode,
          riderName: proposeFor.riderName,
          paymentStatus: proposedStatus,
          declaredPaidEgp: paidEgp === '' ? null : Number(paidEgp),
          notes: note,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل حفظ الإقرار');
      return json;
    },
    onSuccess: () => {
      notify.success('تم حفظ إقرار السداد للدورة المحددة');
      setProposeFor(null);
      setPaidEgp('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['supervisor-equipment-liabilities'] });
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const proposalMut = useMutation({
    mutationFn: async () => {
      if (!proposeFor) throw new Error('اختر مندوباً');
      const kind = proposeFor.hasLiability ? 'payment_update' : 'opening_report';
      const res = await authFetch('/api/supervisor/equipment-payment-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalKind: kind,
          equipmentIssueId: proposeFor.equipmentIssueId || undefined,
          riderCode: proposeFor.riderCode,
          riderName: proposeFor.riderName,
          proposedPaymentStatus: proposedStatus,
          proposedSettlementPaidEgp: paidEgp === '' ? null : Number(paidEgp),
          proposedOutstandingNote: note,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الإرسال');
      return json;
    },
    onSuccess: () => {
      notify.success('تم إرسال الاقتراح لمدير المعدات للمراجعة');
      setProposeFor(null);
      setPaidEgp('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['supervisor-equipment-liabilities'] });
    },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 text-[#EAF0FF]" dir="rtl">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">عهدة / تسوية معدات الطيارين</h1>
        <p className="text-sm text-[rgba(234,240,255,0.75)]">
          دي صفحة المشرف لتسوية المعدات (مش صفحة الأدمن «تسوية افتتاحية»). تظهر{' '}
          <strong className="text-[#EAF0FF]">كل مناديبك</strong> من الروستر — اللي بدون عهدة اضغط
          «اقتراح فتح عهدة»، واللي عنده عهدة اضغط «اقتراح تحديث».
        </p>
        <p className="text-xs text-cyan-100/90 bg-cyan-950/50 border border-cyan-500/30 rounded-lg p-3">
          <strong>إقرار السداد:</strong> اختر دورة القبض ثم سجّل حالة السداد (مدفوع / جزئي / غير
          مدفوع). الإقرار يُحفظ مباشرة ويُستخدم في حساب المتبقي — الاستقطاع الفعلي من Talabat يُسجّل
          لاحقاً من «الاستقطاعات_الفعلية».
        </p>
        <p className="text-xs text-amber-100 bg-amber-950/80 border border-amber-500/40 rounded-lg p-3">
          مهم قبل الاستقطاع الأوتوماتيك: المناديب القديمة لازم تتظبط عهدتهم (Opening / اقتراح فتح) عشان
          مايتخصمش مرتين لو كانوا سددوا، أو يتقسّط عليهم المتبقي فقط. التسليم الجديد يثبت الأسعار لحظة
          التسليم ويمنع تكرار نفس القسط تلقائياً.
        </p>

        {list.isLoading && <p className="text-[rgba(234,240,255,0.6)]">جاري التحميل…</p>}
        {list.isError && (
          <div className="rounded-lg border border-rose-400/50 bg-rose-950/80 p-3 text-rose-100">
            {(list.error as Error).message}
          </div>
        )}

        {list.data && (
          <p className="text-xs text-[rgba(234,240,255,0.65)]">
            مناديبك في الروستر: {list.data.rosterRiderCount} — عهد معدات ظاهرة:{' '}
            {list.data.liabilityCount}
          </p>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-3 py-1.5 text-sm placeholder:text-white/40"
            placeholder="بحث كود / اسم…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {(
            [
              ['all', 'الكل'],
              ['with', 'لديهم عهدة'],
              ['without', 'بدون عهدة'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`px-3 py-1.5 rounded-md border text-sm ${
                filter === k
                  ? 'bg-cyan-600 border-cyan-500 text-white'
                  : 'border-white/20 bg-white/5 text-[#EAF0FF] hover:bg-white/10'
              }`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {list.data && visible.length === 0 && (
          <p className="text-[rgba(234,240,255,0.6)]">لا نتائج للعرض.</p>
        )}

        {visible.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/15 bg-[#12182B]">
            <table className="min-w-full text-sm text-[#EAF0FF]">
              <thead className="bg-[#1C2440] text-[#EAF0FF]">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold">المندوب</th>
                  <th className="px-3 py-2.5 text-right font-semibold">الحالة</th>
                  <th className="px-3 py-2.5 text-right font-semibold">السداد</th>
                  <th className="px-3 py-2.5 text-right font-semibold">المتبقي</th>
                  <th className="px-3 py-2.5 text-right font-semibold">مخصوم</th>
                  <th className="px-3 py-2.5 text-right font-semibold">مسدد نقداً</th>
                  <th className="px-3 py-2.5 text-right font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.riderCode} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#EAF0FF]">{row.riderName || '—'}</div>
                      <div className="text-xs text-[rgba(234,240,255,0.55)]">{row.riderCode}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{row.status}</div>
                      {row.pendingProposalId && (
                        <div className="text-[11px] text-amber-200 mt-0.5">
                          اقتراح معلّق بانتظار مدير المعدات
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.paymentStatusAr}</td>
                    <td className="px-3 py-2">
                      {row.outstandingEgp == null ? '—' : row.outstandingEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {row.amountDeductedEgp == null ? '—' : row.amountDeductedEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {row.settlementPaidEgp == null ? '—' : row.settlementPaidEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {row.pendingProposalId && !row.hasLiability ? (
                        <span className="text-xs text-amber-200">تم الإرسال — انتظر القبول</span>
                      ) : (
                        <button
                          type="button"
                          className="text-cyan-300 hover:text-cyan-200 underline text-xs font-medium"
                          onClick={() => {
                            setProposeFor(row);
                            setProposedStatus(row.paymentStatus || 'UNPAID');
                            setPaidEgp(
                              row.settlementPaidEgp != null && row.settlementPaidEgp > 0
                                ? String(row.settlementPaidEgp)
                                : ''
                            );
                            setNote('');
                          }}
                        >
                          {row.hasLiability ? 'اقتراح تحديث' : 'اقتراح فتح عهدة'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {proposeFor && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]">
            <div
              className="w-full max-w-md rounded-xl border border-white/20 bg-[#12182B] p-5 text-[#EAF0FF] shadow-2xl space-y-3"
              dir="rtl"
              role="dialog"
              aria-modal="true"
            >
              <h2 className="font-bold text-lg text-[#EAF0FF]">
                {proposeFor.hasLiability ? 'اقتراح تحديث سداد' : 'اقتراح فتح عهدة / حالة سداد'}
              </h2>
              <p className="text-sm text-[rgba(234,240,255,0.75)]">
                {proposeFor.riderName} ({proposeFor.riderCode})
                {proposeFor.hasLiability
                  ? ` — متبقي ${proposeFor.outstandingEgp?.toFixed(2) ?? '—'} ج`
                  : ' — لا توجد عهدة مسجّلة؛ مدير المعدات يراجع وينشئ العهدة'}
              </p>
              <label className="block text-sm text-[#EAF0FF]">
                دورة القبض
                <select
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2"
                  value={cycleId}
                  onChange={(e) => setCycleId(e.target.value)}
                >
                  <option value="">— اختر —</option>
                  {(cycles.data || []).map((c) => (
                    <option key={c.cycleId} value={c.cycleId} className="bg-[#0B1020]">
                      دورة {c.cycleNumber}: {c.startDate} → {c.endDate}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-[#EAF0FF]">
                الحالة المقترحة
                <select
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2"
                  value={proposedStatus}
                  onChange={(e) =>
                    setProposedStatus(e.target.value as typeof proposedStatus)
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value} className="bg-[#0B1020] text-[#EAF0FF]">
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-[#EAF0FF]">
                مبلغ مسدد (جنيه) — إن وُجد
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2 placeholder:text-white/40"
                  value={paidEgp}
                  onChange={(e) => setPaidEgp(e.target.value)}
                />
              </label>
              <label className="block text-sm text-[#EAF0FF]">
                ملاحظة
                <textarea
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2 placeholder:text-white/40"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="flex gap-2 justify-end pt-1 flex-wrap">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-white/25 text-[#EAF0FF] hover:bg-white/10"
                  onClick={() => setProposeFor(null)}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={mut.isPending}
                  className="px-3 py-1.5 rounded-md bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
                  onClick={() => mut.mutate()}
                >
                  حفظ الإقرار
                </button>
                <button
                  type="button"
                  disabled={proposalMut.isPending}
                  className="px-3 py-1.5 rounded-md bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50 text-xs"
                  onClick={() => proposalMut.mutate()}
                >
                  إرسال اقتراح (قديم)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
