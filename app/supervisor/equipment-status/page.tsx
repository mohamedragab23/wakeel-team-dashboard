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
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">عهدة / تسوية معدات الطيارين</h1>
        <p className="text-sm text-slate-600">
          دي صفحة المشرف لتسوية المعدات (مش صفحة الأدمن «تسوية افتتاحية»). تظهر{' '}
          <strong>كل مناديبك</strong> من الروستر — اللي بدون عهدة اضغط «اقتراح فتح عهدة»، واللي
          عنده عهدة اضغط «اقتراح تحديث». مسؤول المعدات يراجع ويقبل.
        </p>
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
          مهم قبل الاستقطاع الأوتوماتيك: المناديب القديمة لازم تتظبط عهدتهم (Opening / اقتراح فتح) عشان
          مايتخصمش مرتين لو كانوا سددوا، أو يتقسّط عليهم المتبقي فقط. التسليم الجديد يثبت الأسعار لحظة
          التسليم ويمنع تكرار نفس القسط تلقائياً.
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
          </p>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="border rounded px-2 py-1 text-sm"
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
              className={`px-3 py-1 rounded border text-sm ${filter === k ? 'bg-slate-800 text-white' : ''}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {list.data && visible.length === 0 && (
          <p className="text-slate-500">لا نتائج للعرض.</p>
        )}

        {visible.length > 0 && (
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
                {visible.map((row) => (
                  <tr key={row.riderCode} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.riderName || '—'}</div>
                      <div className="text-xs text-slate-500">{row.riderCode}</div>
                    </td>
                    <td className="px-3 py-2">{row.status}</td>
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
                      <button
                        type="button"
                        className="text-indigo-700 hover:underline text-xs"
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
              <h2 className="font-bold text-lg">
                {proposeFor.hasLiability ? 'اقتراح تحديث سداد' : 'اقتراح فتح عهدة / حالة سداد'}
              </h2>
              <p className="text-sm text-slate-600">
                {proposeFor.riderName} ({proposeFor.riderCode})
                {proposeFor.hasLiability
                  ? ` — متبقي ${proposeFor.outstandingEgp?.toFixed(2) ?? '—'} ج`
                  : ' — لا توجد عهدة مسجّلة؛ مدير المعدات يراجع وينشئ العهدة'}
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
                مبلغ مسدد (جنيه) — إن وُجد
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
                ملاحظة
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
