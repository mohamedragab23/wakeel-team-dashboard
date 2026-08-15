'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { EQUIPMENT_PAYMENT_STATUS_AR } from '@/lib/equipmentLiability/paymentStatus';

type IssueRow = {
  equipmentIssueId: string;
  riderCode: string;
  riderName: string;
  zone: string;
  status: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paymentStatusAr: string;
  outstandingEgp: number;
  amountDeductedEgp: number;
  settlementPaidEgp: number;
  originalLiabilityEgp: number;
};

const STATUS_OPTIONS = [
  { value: 'UNPAID', label: EQUIPMENT_PAYMENT_STATUS_AR.UNPAID },
  { value: 'PARTIALLY_PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PARTIALLY_PAID },
  { value: 'PAID', label: EQUIPMENT_PAYMENT_STATUS_AR.PAID },
] as const;

export default function SupervisorEquipmentStatusPage() {
  const notify = usePageNotify();
  const qc = useQueryClient();
  const [proposeFor, setProposeFor] = useState<IssueRow | null>(null);
  const [proposedStatus, setProposedStatus] = useState<'UNPAID' | 'PARTIALLY_PAID' | 'PAID'>('PAID');
  const [paidEgp, setPaidEgp] = useState('');
  const [note, setNote] = useState('');

  const list = useQuery({
    queryKey: ['supervisor-equipment-liabilities'],
    queryFn: async () => {
      const res = await authFetch('/api/supervisor/equipment-liabilities');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return {
        issues: (json.issues || []) as IssueRow[],
        rosterRiderCount: Number(json.rosterRiderCount || 0),
        liabilityCount: Number(json.liabilityCount || 0),
      };
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!proposeFor) throw new Error('اختر عهدة');
      const res = await authFetch('/api/supervisor/equipment-payment-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentIssueId: proposeFor.equipmentIssueId,
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
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">عهدة معدات الطيارين</h1>
        <p className="text-sm text-slate-600">
          تظهر كل عهد معدات لمناديبك الحاليين (من شيت المناديب). اقترح تحديث السداد لمدير المعدات
          (لم يدفع / جزئي / مسدد) حتى تُراجع العهدة قبل مسار الاستقطاع الأوتوماتيك.
          لا يطبّق النظام خصماً مالياً أوتوماتيكياً من هذه الصفحة.
        </p>

        {list.isLoading && <p className="text-slate-500">جاري التحميل…</p>}
        {list.isError && (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-rose-800">
            {(list.error as Error).message}
          </div>
        )}

        {list.data && (
          <p className="text-xs text-slate-500">
            مناديبك في الروستر: {list.data.rosterRiderCount} — عهد معدات ظاهرة:{' '}
            {list.data.liabilityCount}
            {list.data.rosterRiderCount > 0 && list.data.liabilityCount === 0
              ? ' (لا توجد صفوف عهدة لطياريك بعد — يحتاج Opening / تسليم معدات)'
              : ''}
          </p>
        )}

        {list.data && list.data.issues.length === 0 && (
          <p className="text-slate-500">لا توجد عهد معدات مسجّلة لطياريك الحاليين.</p>
        )}

        {list.data && list.data.issues.length > 0 && (
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-right">المندوب</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-right">السداد</th>
                  <th className="px-3 py-2 text-right">المتبقي</th>
                  <th className="px-3 py-2 text-right">مخصوم</th>
                  <th className="px-3 py-2 text-right">مسدد نقداً</th>
                  <th className="px-3 py-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.data.issues.map((row) => (
                  <tr key={row.equipmentIssueId} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.riderName || '—'}</div>
                      <div className="text-xs text-slate-500">{row.riderCode}</div>
                    </td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.paymentStatusAr}</td>
                    <td className="px-3 py-2">{row.outstandingEgp.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.amountDeductedEgp.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.settlementPaidEgp.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-indigo-700 hover:underline text-xs"
                        onClick={() => {
                          setProposeFor(row);
                          setProposedStatus(row.paymentStatus);
                          setPaidEgp(
                            row.settlementPaidEgp > 0 ? String(row.settlementPaidEgp) : ''
                          );
                          setNote('');
                        }}
                      >
                        اقتراح تحديث
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {proposeFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-4 space-y-3 shadow-lg" dir="rtl">
              <h2 className="font-bold text-lg">اقتراح تحديث سداد</h2>
              <p className="text-sm text-slate-600">
                {proposeFor.riderName} ({proposeFor.riderCode}) — متبقي{' '}
                {proposeFor.outstandingEgp.toFixed(2)} ج
              </p>
              <label className="block text-sm">
                الحالة المقترحة
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={proposedStatus}
                  onChange={(e) =>
                    setProposedStatus(e.target.value as typeof proposedStatus)
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                مبلغ السداد الإجمالي المقترح (جنيه) — اختياري
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={paidEgp}
                  onChange={(e) => setPaidEgp(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                ملاحظة / المتبقي
                <textarea
                  className="mt-1 w-full border rounded px-2 py-1"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded border"
                  onClick={() => setProposeFor(null)}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={mut.isPending}
                  className="px-3 py-1.5 rounded bg-slate-800 text-white disabled:opacity-50"
                  onClick={() => mut.mutate()}
                >
                  إرسال للمراجعة
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
