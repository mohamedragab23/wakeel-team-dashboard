'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { EQUIPMENT_PAYMENT_STATUS_AR } from '@/lib/equipmentLiability/paymentStatus';
import { milliemesToEgp } from '@/lib/money';

type Proposal = {
  proposalId: string;
  proposalKind?: 'payment_update' | 'opening_report';
  equipmentIssueId: string;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  proposedPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  proposedSettlementPaidEgp: number | null;
  proposedOutstandingNote: string;
  status: string;
  createdAt: string;
  beforeOutstandingMilli: number;
  beforeSettlementPaidMilli: number;
};

type OpeningForm = {
  motorcycleBagHeld: boolean;
  bicycleBagHeld: boolean;
  tshirtQuantity: number;
  jacketQuantity: number;
  helmetQuantity: number;
  securityStatus: 'PAID' | 'NOT_PAID';
  historicalPaidEgp: string;
  operatorConfirmation: boolean;
  zoneSnapshot: string;
};

const emptyOpening = (): OpeningForm => ({
  motorcycleBagHeld: true,
  bicycleBagHeld: false,
  tshirtQuantity: 0,
  jacketQuantity: 0,
  helmetQuantity: 0,
  securityStatus: 'NOT_PAID',
  historicalPaidEgp: '',
  operatorConfirmation: false,
  zoneSnapshot: '',
});

export default function EquipmentPaymentProposalsAdminPage() {
  const notify = usePageNotify();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [active, setActive] = useState<Proposal | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [modPaid, setModPaid] = useState('');
  const [modStatus, setModStatus] = useState<'UNPAID' | 'PARTIALLY_PAID' | 'PAID'>('PAID');
  const [opening, setOpening] = useState<OpeningForm>(emptyOpening());

  const list = useQuery({
    queryKey: ['equipment-payment-proposals', filter],
    queryFn: async () => {
      const res = await authFetch(
        `/api/admin/equipment-payment-proposals?status=${filter === 'all' ? 'all' : 'pending'}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json.proposals as Proposal[];
    },
  });

  const mut = useMutation({
    mutationFn: async (action: 'accept' | 'reject' | 'modify_accept') => {
      if (!active) throw new Error('اختر اقتراحاً');
      const isOpening = (active.proposalKind || 'payment_update') === 'opening_report';
      const res = await authFetch('/api/admin/equipment-payment-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: active.proposalId,
          action,
          reviewerNote,
          modifiedSettlementPaidEgp:
            !isOpening && action === 'modify_accept'
              ? modPaid === ''
                ? null
                : Number(modPaid)
              : undefined,
          modifiedPaymentStatus: !isOpening && action === 'modify_accept' ? modStatus : undefined,
          opening:
            isOpening && action !== 'reject'
              ? {
                  ...opening,
                  historicalPaidEgp:
                    opening.historicalPaidEgp === ''
                      ? active.proposedSettlementPaidEgp ?? 0
                      : Number(opening.historicalPaidEgp),
                }
              : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل المراجعة');
      return json;
    },
    onSuccess: (_d, action) => {
      notify.success(
        action === 'reject' ? 'تم الرفض' : action === 'accept' ? 'تم القبول' : 'تم التعديل والقبول'
      );
      setActive(null);
      setReviewerNote('');
      setOpening(emptyOpening());
      void qc.invalidateQueries({ queryKey: ['equipment-payment-proposals'] });
    },
    onError: (e: Error) => notify.error(e.message),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">اقتراحات سداد / فتح عهدة المعدات</h1>
        <p className="text-sm text-slate-600">
          Incoming من المشرفين: تحديث سداد على عهدة موجودة، أو فتح عهدة للمناديب بدون سجل. القبول
          يحدّث العهدة أو ينشئ Opening — بدون Financial Apply. للفتح الجماعي راجع أيضاً مطابقة العهدة.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded border text-sm ${filter === 'pending' ? 'bg-slate-800 text-white' : ''}`}
            onClick={() => setFilter('pending')}
          >
            معلّق
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded border text-sm ${filter === 'all' ? 'bg-slate-800 text-white' : ''}`}
            onClick={() => setFilter('all')}
          >
            الكل
          </button>
        </div>

        {list.isLoading && <p className="text-slate-500">جاري التحميل…</p>}
        {list.isError && (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-rose-800">
            {(list.error as Error).message}
          </div>
        )}

        {list.data && list.data.length === 0 && (
          <p className="text-slate-500">لا توجد اقتراحات.</p>
        )}

        {list.data && list.data.length > 0 && (
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-right">النوع</th>
                  <th className="px-3 py-2 text-right">المندوب</th>
                  <th className="px-3 py-2 text-right">المشرف</th>
                  <th className="px-3 py-2 text-right">المقترح</th>
                  <th className="px-3 py-2 text-right">قبل</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((p) => {
                  const kind = p.proposalKind || 'payment_update';
                  return (
                    <tr key={p.proposalId} className="border-t">
                      <td className="px-3 py-2 text-xs">
                        {kind === 'opening_report' ? 'فتح عهدة' : 'تحديث سداد'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.riderName}</div>
                        <div className="text-xs text-slate-500">{p.riderCode}</div>
                      </td>
                      <td className="px-3 py-2">
                        {p.supervisorName}{' '}
                        <span className="text-xs text-slate-500">({p.supervisorCode})</span>
                      </td>
                      <td className="px-3 py-2">
                        {EQUIPMENT_PAYMENT_STATUS_AR[p.proposedPaymentStatus]}
                        {p.proposedSettlementPaidEgp != null && (
                          <div className="text-xs text-slate-500">
                            {p.proposedSettlementPaidEgp} ج
                          </div>
                        )}
                        {p.proposedOutstandingNote && (
                          <div className="text-xs text-slate-500">{p.proposedOutstandingNote}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {kind === 'opening_report'
                          ? '—'
                          : milliemesToEgp(p.beforeOutstandingMilli).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">{p.status}</td>
                      <td className="px-3 py-2">
                        {p.status === 'pending' && (
                          <button
                            type="button"
                            className="text-indigo-700 hover:underline text-xs"
                            onClick={() => {
                              setActive(p);
                              setModStatus(p.proposedPaymentStatus);
                              setModPaid(
                                p.proposedSettlementPaidEgp != null
                                  ? String(p.proposedSettlementPaidEgp)
                                  : ''
                              );
                              setOpening({
                                ...emptyOpening(),
                                historicalPaidEgp:
                                  p.proposedSettlementPaidEgp != null
                                    ? String(p.proposedSettlementPaidEgp)
                                    : '',
                              });
                              setReviewerNote('');
                            }}
                          >
                            مراجعة
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {active && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg max-w-lg w-full p-4 space-y-3 shadow-lg my-8" dir="rtl">
              <h2 className="font-bold text-lg">مراجعة الاقتراح</h2>
              <p className="text-sm text-slate-600">
                {(active.proposalKind || 'payment_update') === 'opening_report'
                  ? 'فتح عهدة'
                  : 'تحديث سداد'}{' '}
                — {active.riderName} ({active.riderCode}) —{' '}
                {EQUIPMENT_PAYMENT_STATUS_AR[active.proposedPaymentStatus]}
              </p>
              <label className="block text-sm">
                ملاحظة المراجع
                <textarea
                  className="mt-1 w-full border rounded px-2 py-1"
                  rows={2}
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                />
              </label>

              {(active.proposalKind || 'payment_update') === 'opening_report' ? (
                <div className="border rounded p-3 space-y-2 bg-slate-50 text-sm">
                  <p className="font-medium">بيانات Opening (مطلوبة للقبول)</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={opening.motorcycleBagHeld}
                        onChange={(e) =>
                          setOpening((o) => ({
                            ...o,
                            motorcycleBagHeld: e.target.checked,
                            bicycleBagHeld: e.target.checked ? false : o.bicycleBagHeld,
                          }))
                        }
                      />
                      شنطة موتوسيكل
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={opening.bicycleBagHeld}
                        onChange={(e) =>
                          setOpening((o) => ({
                            ...o,
                            bicycleBagHeld: e.target.checked,
                            motorcycleBagHeld: e.target.checked ? false : o.motorcycleBagHeld,
                          }))
                        }
                      />
                      شنطة عجلة
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['tshirtQuantity', 'تيشرت'],
                        ['jacketQuantity', 'جاكيت'],
                        ['helmetQuantity', 'خوذة'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block">
                        {label}
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full border rounded px-2 py-1"
                          value={opening[key]}
                          onChange={(e) =>
                            setOpening((o) => ({
                              ...o,
                              [key]: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    الاستعلام الأمني
                    <select
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={opening.securityStatus}
                      onChange={(e) =>
                        setOpening((o) => ({
                          ...o,
                          securityStatus: e.target.value as 'PAID' | 'NOT_PAID',
                        }))
                      }
                    >
                      <option value="PAID">مدفوع</option>
                      <option value="NOT_PAID">غير مدفوع</option>
                    </select>
                  </label>
                  <label className="block">
                    مدفوع تاريخي (ج)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={opening.historicalPaidEgp}
                      onChange={(e) =>
                        setOpening((o) => ({ ...o, historicalPaidEgp: e.target.value }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={opening.operatorConfirmation}
                      onChange={(e) =>
                        setOpening((o) => ({
                          ...o,
                          operatorConfirmation: e.target.checked,
                        }))
                      }
                    />
                    أؤكد إنشاء/اعتماد العهدة من هذا الاقتراح (بدون FA)
                  </label>
                </div>
              ) : (
                <div className="border rounded p-2 space-y-2 bg-slate-50">
                  <p className="text-xs font-medium text-slate-700">تعديل ثم قبول</p>
                  <label className="block text-sm">
                    الحالة
                    <select
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={modStatus}
                      onChange={(e) => setModStatus(e.target.value as typeof modStatus)}
                    >
                      <option value="UNPAID">{EQUIPMENT_PAYMENT_STATUS_AR.UNPAID}</option>
                      <option value="PARTIALLY_PAID">
                        {EQUIPMENT_PAYMENT_STATUS_AR.PARTIALLY_PAID}
                      </option>
                      <option value="PAID">{EQUIPMENT_PAYMENT_STATUS_AR.PAID}</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    إجمالي المسدد المقترح (ج)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full border rounded px-2 py-1"
                      value={modPaid}
                      onChange={(e) => setModPaid(e.target.value)}
                    />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded border"
                  onClick={() => setActive(null)}
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  disabled={mut.isPending}
                  className="px-3 py-1.5 rounded border border-rose-300 text-rose-800"
                  onClick={() => mut.mutate('reject')}
                >
                  رفض
                </button>
                {(active.proposalKind || 'payment_update') !== 'opening_report' && (
                  <button
                    type="button"
                    disabled={mut.isPending}
                    className="px-3 py-1.5 rounded bg-amber-700 text-white"
                    onClick={() => mut.mutate('modify_accept')}
                  >
                    تعديل وقبول
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    mut.isPending ||
                    ((active.proposalKind || 'payment_update') === 'opening_report' &&
                      !opening.operatorConfirmation)
                  }
                  className="px-3 py-1.5 rounded bg-emerald-700 text-white disabled:opacity-50"
                  onClick={() => mut.mutate('accept')}
                >
                  قبول
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
