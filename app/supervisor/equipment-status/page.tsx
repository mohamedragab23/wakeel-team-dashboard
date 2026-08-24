'use client';

import { useEffect, useMemo, useState } from 'react';
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
  securityPaidUpfront?: boolean | null;
  w1RequestEgp?: number | null;
  w1ActualEgp?: number | null;
  w2RequestEgp?: number | null;
  w2ActualEgp?: number | null;
  warnings?: string[];
  needsFreshDeclaration?: boolean;
};

type CycleOption = {
  cycleId: string;
  startDate: string;
  endDate: string;
  cycleNumber: number;
  status?: string;
  payoutDate?: string;
  isClosing?: boolean;
};

const STATUS_OPTIONS = [
  { value: 'UNPAID', label: EQUIPMENT_PAYMENT_STATUS_AR.UNPAID },
  { value: 'PARTIALLY_PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PARTIALLY_PAID },
  { value: 'PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PAID },
] as const;

function pickDefaultCycleId(cycles: CycleOption[]): string {
  if (!cycles.length) return '';
  const active = cycles.find((c) => String(c.status || '').toLowerCase() === 'active');
  if (active) return active.cycleId;
  const nonClosing = cycles.filter((c) => !c.isClosing);
  const sorted = [...(nonClosing.length ? nonClosing : cycles)].sort((a, b) =>
    String(b.endDate).localeCompare(String(a.endDate))
  );
  return sorted[0]?.cycleId || '';
}

function cycleReadableLabel(c: CycleOption): string {
  const payout = c.payoutDate ? ` · قبض ${c.payoutDate}` : '';
  const st = c.status ? ` · ${c.status}` : '';
  return `دورة ${c.cycleNumber}: ${c.startDate} → ${c.endDate}${payout}${st}`;
}

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
  const [showLegacyProposal, setShowLegacyProposal] = useState(false);
  const [missingOutcome, setMissingOutcome] = useState<
    '' | 'OWES' | 'PARTIAL' | 'FULLY_PAID' | 'NO_EQUIPMENT' | 'DATA_ERROR'
  >('');

  const cycles = useQuery({
    queryKey: ['supervisor-payout-cycles', 2026, 8],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/payout-cycles?year=2026&month=8');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل دورات القبض');
      return (json.cycles || []) as CycleOption[];
    },
  });

  useEffect(() => {
    if (!cycleId && cycles.data?.length) {
      setCycleId(pickDefaultCycleId(cycles.data));
    }
  }, [cycles.data, cycleId]);

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

  const selectedCycle = useMemo(
    () => (cycles.data || []).find((c) => c.cycleId === cycleId) || null,
    [cycles.data, cycleId]
  );

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
      if (proposeFor && !proposeFor.hasLiability && !missingOutcome) {
        throw new Error('حدد نتيجة مراجعة العهدة المفقودة');
      }
      // Map missing outcomes to payment status when needed
      let status = proposedStatus;
      if (!proposeFor.hasLiability) {
        if (missingOutcome === 'OWES') status = 'UNPAID';
        else if (missingOutcome === 'PARTIAL') status = 'PARTIALLY_PAID';
        else if (missingOutcome === 'FULLY_PAID' || missingOutcome === 'NO_EQUIPMENT')
          status = 'PAID';
        else if (missingOutcome === 'DATA_ERROR') status = 'UNPAID';
      }
      if (status === 'PARTIALLY_PAID' && (paidEgp === '' || Number(paidEgp) < 0)) {
        throw new Error('أدخل المبلغ المسدد للدفع الجزئي');
      }
      const res = await authFetch('/api/supervisor/equipment-declarations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId,
          equipmentIssueId: proposeFor.equipmentIssueId || undefined,
          riderCode: proposeFor.riderCode,
          riderName: proposeFor.riderName,
          paymentStatus: status,
          declaredPaidEgp: paidEgp === '' ? null : Number(paidEgp),
          notes: note,
          applyToLiability: false,
          missingLiabilityOutcome: !proposeFor.hasLiability ? missingOutcome : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل حفظ الإقرار');
      return json;
    },
    onSuccess: (json) => {
      notify.success(
        json?.message ||
          'تم حفظ إقرار المشرف كدليل نهائي (بدون تعديل رصيد العهدة تلقائياً)'
      );
      setProposeFor(null);
      setPaidEgp('');
      setNote('');
      setMissingOutcome('');
      setShowLegacyProposal(false);
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
      notify.success('تم إرسال الاقتراح القديم لمدير المعدات');
      setProposeFor(null);
      setPaidEgp('');
      setNote('');
      setMissingOutcome('');
      setShowLegacyProposal(false);
      void qc.invalidateQueries({ queryKey: ['supervisor-equipment-liabilities'] });
    },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 text-[#EAF0FF]" dir="rtl">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">الإفادة النهائية عن حالة سداد عهدة المندوب</h1>
        <p className="text-sm text-[rgba(234,240,255,0.75)]">
          ابدأ من الصفر لكل مندوب ذي صلة. الإقرارات القديمة تبقى للتدقيق فقط — المطلوب الآن إفادة
          نهائية جديدة. حفظ الإقرار لا يعدّل رصيد العهدة تلقائياً.
        </p>
        <p className="text-sm text-emerald-100 bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-3 font-medium">
          الإفادة النهائية عن حالة سداد عهدة المندوب
        </p>
        <p className="text-xs text-cyan-100/90 bg-cyan-950/50 border border-cyan-500/30 rounded-lg p-3">
          الإجراء الرسمي: <strong>حفظ الإقرار</strong>. المناديب بدون صف عهدة يظهرون للمراجعة
          (MISSING_LIABILITY) — لا تُنشأ عهدة تلقائياً. التسوية على الرصيد تتم لاحقاً بخطوة إدارية
          صريحة.
        </p>

        {selectedCycle && (
          <p className="text-xs text-[rgba(234,240,255,0.7)]">
            الدورة الحالية المحددة تلقائياً: {cycleReadableLabel(selectedCycle)}
          </p>
        )}

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
              ['without', 'بدون عهدة (مراجعة)'],
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
                  <th className="px-3 py-2.5 text-right font-semibold">أصل العهدة</th>
                  <th className="px-3 py-2.5 text-right font-semibold">تأمين؟</th>
                  <th className="px-3 py-2.5 text-right font-semibold">المتبقي</th>
                  <th className="px-3 py-2.5 text-right font-semibold">مسدد/مخصوم</th>
                  <th className="px-3 py-2.5 text-right font-semibold">W1 طلب/فعلي</th>
                  <th className="px-3 py-2.5 text-right font-semibold">W2 طلب/فعلي</th>
                  <th className="px-3 py-2.5 text-right font-semibold">تحذير</th>
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
                      {row.originalLiabilityEgp == null
                        ? '—'
                        : row.originalLiabilityEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.securityPaidUpfront == null
                        ? '—'
                        : row.securityPaidUpfront
                          ? 'مدفوع'
                          : 'غير مدفوع'}
                    </td>
                    <td className="px-3 py-2">
                      {row.outstandingEgp == null ? '—' : row.outstandingEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      نقداً {row.settlementPaidEgp == null ? '—' : row.settlementPaidEgp.toFixed(2)}
                      <br />
                      رواتب{' '}
                      {row.amountDeductedEgp == null ? '—' : row.amountDeductedEgp.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.w1RequestEgp == null && row.w1ActualEgp == null
                        ? '—'
                        : `${row.w1RequestEgp?.toFixed(0) ?? '—'} / ${row.w1ActualEgp?.toFixed(0) ?? '—'}`}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.w2RequestEgp == null && row.w2ActualEgp == null
                        ? '—'
                        : `${row.w2RequestEgp?.toFixed(0) ?? '—'} / ${row.w2ActualEgp?.toFixed(0) ?? '—'}`}
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-200">
                      {(row.warnings || []).length
                        ? (row.warnings || []).join(', ')
                        : !row.hasLiability
                          ? 'MISSING_LIABILITY'
                          : '—'}
                    </td>
                    <td className="px-3 py-2">
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
                          setMissingOutcome('');
                          setShowLegacyProposal(false);
                        }}
                      >
                        إقرار نهائي
                      </button>
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
              className="w-full max-w-lg rounded-xl border border-white/20 bg-[#12182B] p-5 text-[#EAF0FF] shadow-2xl space-y-3"
              dir="rtl"
              role="dialog"
              aria-modal="true"
            >
              <h2 className="font-bold text-lg text-[#EAF0FF]">الإفادة النهائية عن حالة سداد عهدة المندوب</h2>
              <p className="text-sm text-emerald-100/95 border border-emerald-500/30 rounded-md p-2 bg-emerald-950/40">
                الإفادة النهائية عن حالة سداد عهدة المندوب — ابدأ من الصفر. لا يُعتمد على إقرارات قديمة.
              </p>
              <div className="text-sm text-[rgba(234,240,255,0.8)] space-y-1">
                <div>
                  {proposeFor.riderName} ({proposeFor.riderCode})
                </div>
                <div>
                  أصل العهدة:{' '}
                  {proposeFor.originalLiabilityEgp == null
                    ? 'غير مسجّل'
                    : `${proposeFor.originalLiabilityEgp.toFixed(2)} ج`}
                </div>
                <div>
                  متبقي النظام:{' '}
                  {proposeFor.outstandingEgp == null
                    ? '—'
                    : `${proposeFor.outstandingEgp.toFixed(2)} ج`}
                </div>
                <div>
                  مخصوم رواتب:{' '}
                  {proposeFor.amountDeductedEgp == null
                    ? '—'
                    : `${proposeFor.amountDeductedEgp.toFixed(2)} ج`}
                  {' · '}
                  مسدد نقداً:{' '}
                  {proposeFor.settlementPaidEgp == null
                    ? '—'
                    : `${proposeFor.settlementPaidEgp.toFixed(2)} ج`}
                </div>
                <div className="text-xs">
                  تأمين:{' '}
                  {proposeFor.securityPaidUpfront == null
                    ? '—'
                    : proposeFor.securityPaidUpfront
                      ? 'مدفوع'
                      : 'غير مدفوع'}
                  {' · '}
                  W1 طلب/فعلي:{' '}
                  {proposeFor.w1RequestEgp?.toFixed?.(0) ?? '—'}/
                  {proposeFor.w1ActualEgp?.toFixed?.(0) ?? '—'}
                  {' · '}
                  W2 طلب/فعلي:{' '}
                  {proposeFor.w2RequestEgp?.toFixed?.(0) ?? '—'}/
                  {proposeFor.w2ActualEgp?.toFixed?.(0) ?? '—'}
                </div>
                {!proposeFor.hasLiability && (
                  <div className="text-amber-200 text-xs">
                    تحذير: لا توجد صف عهدة — الإقرار للمراجعة فقط ولن يُنشئ عهدة تلقائياً.
                  </div>
                )}
                {(proposeFor.warnings || []).length > 0 && (
                  <div className="text-amber-200 text-xs">
                    {(proposeFor.warnings || []).join(' · ')}
                  </div>
                )}
              </div>
              <label className="block text-sm text-[#EAF0FF]">
                دورة القبض (للتدقيق)
                <select
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2"
                  value={cycleId}
                  onChange={(e) => setCycleId(e.target.value)}
                >
                  <option value="">— اختر —</option>
                  {(cycles.data || []).map((c) => (
                    <option key={c.cycleId} value={c.cycleId} className="bg-[#0B1020]">
                      {cycleReadableLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              {!proposeFor.hasLiability && (
                <label className="block text-sm text-[#EAF0FF]">
                  نتيجة مراجعة العهدة المفقودة (مطلوب)
                  <select
                    className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2"
                    value={missingOutcome}
                    onChange={(e) =>
                      setMissingOutcome(e.target.value as typeof missingOutcome)
                    }
                  >
                    <option value="">— اختر —</option>
                    <option value="OWES">استلم معدات وما زال مديناً</option>
                    <option value="PARTIAL">استلم معدات وسدد جزئياً</option>
                    <option value="FULLY_PAID">استلم معدات وسدد بالكامل</option>
                    <option value="NO_EQUIPMENT">لم يستلم المعدات / لا توجد عهدة</option>
                    <option value="DATA_ERROR">البيانات خاطئة وتحتاج مراجعة إدارية</option>
                  </select>
                </label>
              )}
              {proposeFor.hasLiability && (
              <label className="block text-sm text-[#EAF0FF]">
                الحالة النهائية
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
              )}
              {(proposedStatus === 'PARTIALLY_PAID' || missingOutcome === 'PARTIAL') && (
                <label className="block text-sm text-[#EAF0FF]">
                  المبلغ المسدد بالفعل (جنيه) — مطلوب
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2 placeholder:text-white/40"
                    value={paidEgp}
                    onChange={(e) => setPaidEgp(e.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm text-[#EAF0FF]">
                ملاحظة (اختياري)
                <textarea
                  className="mt-1 w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-2 placeholder:text-white/40"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <p className="text-[11px] text-[rgba(234,240,255,0.55)]">
                حفظ الإقرار = حفظ الدليل فقط. لن يتم تعديل outstanding / settlement تلقائياً.
              </p>
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
                  className="px-4 py-1.5 rounded-md bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 font-semibold"
                  onClick={() => mut.mutate()}
                >
                  حفظ الإقرار النهائي
                </button>
              </div>
              <details
                className="pt-2 border-t border-white/10"
                open={showLegacyProposal}
                onToggle={(e) => setShowLegacyProposal((e.target as HTMLDetailsElement).open)}
              >
                <summary className="text-xs text-[rgba(234,240,255,0.5)] cursor-pointer">
                  متقدم / توافق قديم — خارج المسار الرسمي
                </summary>
                <button
                  type="button"
                  disabled={proposalMut.isPending}
                  className="mt-2 px-3 py-1.5 rounded-md bg-slate-700/80 text-white/80 hover:bg-slate-600 disabled:opacity-50 text-xs"
                  onClick={() => proposalMut.mutate()}
                >
                  إرسال اقتراح (قديم)
                </button>
              </details>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
