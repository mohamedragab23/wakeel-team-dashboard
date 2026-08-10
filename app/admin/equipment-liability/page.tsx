'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { egpToMilliemes, formatMilliemesAsEgp } from '@/lib/money';
import { EQUIPMENT_PAYMENT_STATUS_AR } from '@/lib/equipmentLiability/paymentStatus';

type DeskIssue = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  zoneSnapshot: string;
  supervisorCodeSnapshot: string;
  supervisorNameSnapshot: string;
  bagType: string;
  originalLiabilityMilli: number;
  settlementPaidMilli: number;
  amountDeductedMilli: number;
  outstandingMilli: number;
  cashPaidMilli: number;
  autoDeductedMilli: number;
  totalCreditedMilli: number;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  status: string;
  lastPaymentAt?: string;
};

type PaymentRow = {
  paymentId: string;
  amountMilli: number;
  paymentDate: string;
  paymentMethod: string;
  note: string;
  outstandingBeforeMilli: number;
  resultingOutstandingMilli: number;
  actorCode: string;
  actorName: string;
  createdAt: string;
};

const LIABILITY_STATUS_AR: Record<string, string> = {
  open: 'مفتوحة',
  settled: 'مسوّاة',
  waived: 'معفاة',
  closed: 'مغلقة',
};

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `desk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function paymentStatusBadge(status: DeskIssue['paymentStatus']) {
  const label = EQUIPMENT_PAYMENT_STATUS_AR[status] || status;
  const cls =
    status === 'PAID'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'PARTIALLY_PAID'
        ? 'bg-amber-50 text-amber-900 border-amber-200'
        : 'bg-rose-50 text-rose-800 border-rose-200';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function EquipmentLiabilityDeskPage() {
  const qc = useQueryClient();
  const [riderCode, setRiderCode] = useState('');
  const [riderName, setRiderName] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [zone, setZone] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [liabilityStatus, setLiabilityStatus] = useState('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState({
    riderCode: '',
    riderName: '',
    supervisor: '',
    zone: '',
    paymentStatus: '',
    liabilityStatus: '',
    q: '',
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [payIssue, setPayIssue] = useState<DeskIssue | null>(null);
  const [amountEgp, setAmountEgp] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'OTHER'>('CASH');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [payError, setPayError] = useState('');
  const [idemKey, setIdemKey] = useState('');

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ list: '1' });
    if (applied.riderCode) params.set('riderCode', applied.riderCode);
    if (applied.riderName) params.set('riderName', applied.riderName);
    if (applied.supervisor) params.set('supervisorCode', applied.supervisor);
    if (applied.zone) params.set('zone', applied.zone);
    if (applied.paymentStatus) params.set('paymentStatus', applied.paymentStatus);
    if (applied.liabilityStatus) params.set('status', applied.liabilityStatus);
    if (applied.q) params.set('q', applied.q);
    return `/api/admin/equipment-liability?${params.toString()}`;
  }, [applied]);

  const listQ = useQuery({
    queryKey: ['admin', 'equipment-liability-desk', listUrl],
    queryFn: async () => {
      const res = await authFetch(listUrl);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'فشل تحميل العهد');
      }
      return json as {
        enabled: boolean;
        issues: DeskIssue[];
        summary: {
          totalLiabilities: number;
          totalOutstandingMilli: number;
          unpaidCount: number;
          partiallyPaidCount: number;
          paidCount: number;
        };
      };
    },
  });

  const detailQ = useQuery({
    queryKey: ['admin', 'equipment-liability-detail', detailId],
    enabled: Boolean(detailId),
    queryFn: async () => {
      const res = await authFetch(`/api/admin/equipment-liability/${detailId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل التفاصيل');
      return json as { issue: DeskIssue; payments: PaymentRow[] };
    },
  });

  const openPay = (issue: DeskIssue) => {
    setPayIssue(issue);
    setAmountEgp('');
    setMethod('CASH');
    setNote('');
    setConfirming(false);
    setSubmitting(false);
    setReceipt(null);
    setPayError('');
    setIdemKey(newIdempotencyKey());
  };

  const amountMilli = egpToMilliemes(Number(amountEgp));
  const remainingAfter =
    payIssue && Number.isFinite(amountMilli)
      ? payIssue.outstandingMilli - amountMilli
      : null;

  const submitPayment = async () => {
    if (!payIssue || !idemKey) return;
    setSubmitting(true);
    setPayError('');
    try {
      const res = await authFetch(`/api/admin/equipment-liability/${payIssue.equipmentIssueId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMilli,
          paymentMethod: method,
          note,
          idempotencyKey: idemKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPayError(json.error || json.code || 'فشل تسجيل الدفعة');
        return;
      }
      setReceipt(json.receipt || json.payment);
      setPayIssue(json.issue);
      await qc.invalidateQueries({ queryKey: ['admin', 'equipment-liability-desk'] });
      if (detailId === payIssue.equipmentIssueId) {
        await qc.invalidateQueries({ queryKey: ['admin', 'equipment-liability-detail', detailId] });
      }
    } catch (e: any) {
      setPayError(e?.message || 'فشل تسجيل الدفعة');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const applyFilters = () => {
    setApplied({
      riderCode: riderCode.trim(),
      riderName: riderName.trim(),
      supervisor: supervisor.trim(),
      zone: zone.trim(),
      paymentStatus,
      liabilityStatus,
      q: q.trim(),
    });
  };

  const equipmentLabel = (issue: DeskIssue) => {
    const parts = [issue.bagType === 'bicycle' ? 'شنطة دراجة' : 'شنطة موتوسيكل'];
    return parts.join(' · ');
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مكتب عهدة المعدات</h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة الالتزام المالي للمعدات وتسجيل الدفعات النقدية — بدون استرجاع فعلي وبدون استقطاع آلي.
          </p>
        </div>

        {listQ.isError ? (
          <div className="rounded border border-rose-200 bg-rose-50 p-4 text-rose-900">
            {(listQ.error as Error)?.message || 'فشل تحميل البيانات (لم تُعرض قائمة فارغة)'}
          </div>
        ) : listQ.isLoading ? (
          <p>جاري التحميل…</p>
        ) : !listQ.data?.enabled ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
            علم دفتر العهدة غير مفعّل (`FEATURE_EQUIPMENT_LEDGER_ENABLED`).
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="إجمالي العهد" value={String(listQ.data.summary?.totalLiabilities ?? 0)} />
              <SummaryCard
                label="إجمالي المبالغ المستحقة"
                value={`${formatMilliemesAsEgp(listQ.data.summary?.totalOutstandingMilli ?? 0)} ج.م`}
              />
              <SummaryCard label="لم يدفع" value={String(listQ.data.summary?.unpaidCount ?? 0)} tone="rose" />
              <SummaryCard
                label="دفع جزئي"
                value={String(listQ.data.summary?.partiallyPaidCount ?? 0)}
                tone="amber"
              />
              <SummaryCard
                label="مدفوع بالكامل"
                value={String(listQ.data.summary?.paidCount ?? 0)}
                tone="emerald"
              />
            </div>

            <div className="border rounded-lg bg-white p-3 grid md:grid-cols-4 gap-2">
              <input
                className="border rounded px-2 py-1.5 text-sm"
                placeholder="كود الطيار"
                value={riderCode}
                onChange={(e) => setRiderCode(e.target.value)}
              />
              <input
                className="border rounded px-2 py-1.5 text-sm"
                placeholder="اسم الطيار"
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
              />
              <input
                className="border rounded px-2 py-1.5 text-sm"
                placeholder="المشرف"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
              />
              <input
                className="border rounded px-2 py-1.5 text-sm"
                placeholder="المنطقة"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              />
              <select
                className="border rounded px-2 py-1.5 text-sm"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="">حالة السداد (الكل)</option>
                <option value="UNPAID">لم يدفع</option>
                <option value="PARTIALLY_PAID">دفع جزئي</option>
                <option value="PAID">دفع بالكامل</option>
              </select>
              <select
                className="border rounded px-2 py-1.5 text-sm"
                value={liabilityStatus}
                onChange={(e) => setLiabilityStatus(e.target.value)}
              >
                <option value="">حالة العهدة (الكل)</option>
                <option value="open">مفتوحة</option>
                <option value="settled">مسوّاة</option>
                <option value="waived">معفاة</option>
                <option value="closed">مغلقة</option>
              </select>
              <input
                className="border rounded px-2 py-1.5 text-sm md:col-span-2"
                placeholder="بحث عام"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                type="button"
                onClick={applyFilters}
                className="md:col-span-4 bg-slate-800 text-white rounded px-3 py-2 text-sm hover:bg-slate-700"
              >
                تطبيق الفلاتر
              </button>
            </div>

            <div className="border rounded-lg bg-white overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-right">الطيار</th>
                    <th className="p-2 text-right">الكود</th>
                    <th className="p-2 text-right">المعدات</th>
                    <th className="p-2 text-right">إجمالي العهدة</th>
                    <th className="p-2 text-right">المدفوع نقدي</th>
                    <th className="p-2 text-right">المخصوم آليًا</th>
                    <th className="p-2 text-right">إجمالي المسدد</th>
                    <th className="p-2 text-right">المتبقي</th>
                    <th className="p-2 text-right">حالة السداد</th>
                    <th className="p-2 text-right">حالة العهدة</th>
                    <th className="p-2 text-right">آخر دفعة</th>
                    <th className="p-2 text-right">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(listQ.data.issues || []).map((issue) => (
                    <tr key={issue.equipmentIssueId} className="border-t">
                      <td className="p-2">{issue.riderNameSnapshot}</td>
                      <td className="p-2 font-mono text-xs">{issue.riderCode}</td>
                      <td className="p-2">{equipmentLabel(issue)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(issue.originalLiabilityMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(issue.cashPaidMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(issue.autoDeductedMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(issue.totalCreditedMilli)}</td>
                      <td className="p-2 font-semibold">{formatMilliemesAsEgp(issue.outstandingMilli)}</td>
                      <td className="p-2">{paymentStatusBadge(issue.paymentStatus)}</td>
                      <td className="p-2">{LIABILITY_STATUS_AR[issue.status] || issue.status}</td>
                      <td className="p-2 text-xs text-slate-500">
                        {issue.lastPaymentAt
                          ? new Date(issue.lastPaymentAt).toLocaleString('ar-EG')
                          : '—'}
                      </td>
                      <td className="p-2 space-x-reverse space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => setDetailId(issue.equipmentIssueId)}
                        >
                          عرض التفاصيل
                        </button>
                        {issue.status === 'open' && issue.outstandingMilli > 0 ? (
                          <button
                            type="button"
                            className="text-emerald-700 hover:underline"
                            onClick={() => openPay(issue)}
                          >
                            تسجيل دفعة
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(listQ.data.issues || []).length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-slate-500">
                        لا توجد عهد مطابقة للفلاتر الحالية.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Detail drawer */}
        {detailId ? (
          <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center p-3">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 space-y-4" dir="rtl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">تفاصيل العهدة</h2>
                <button type="button" className="text-slate-500" onClick={() => setDetailId(null)}>
                  إغلاق
                </button>
              </div>
              {detailQ.isLoading ? (
                <p>جاري التحميل…</p>
              ) : detailQ.isError ? (
                <p className="text-rose-700">{(detailQ.error as Error).message}</p>
              ) : detailQ.data ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>الطيار: {detailQ.data.issue.riderNameSnapshot}</div>
                    <div>الكود: {detailQ.data.issue.riderCode}</div>
                    <div>العهدة: {formatMilliemesAsEgp(detailQ.data.issue.originalLiabilityMilli)} ج.م</div>
                    <div>المتبقي: {formatMilliemesAsEgp(detailQ.data.issue.outstandingMilli)} ج.م</div>
                    <div>نقدي: {formatMilliemesAsEgp(detailQ.data.issue.cashPaidMilli)} ج.م</div>
                    <div>آلي: {formatMilliemesAsEgp(detailQ.data.issue.autoDeductedMilli)} ج.م</div>
                    <div>حالة السداد: {paymentStatusBadge(detailQ.data.issue.paymentStatus)}</div>
                    <div>
                      حالة العهدة:{' '}
                      {LIABILITY_STATUS_AR[detailQ.data.issue.status] || detailQ.data.issue.status}
                    </div>
                  </div>
                  {detailQ.data.issue.status === 'open' && detailQ.data.issue.outstandingMilli > 0 ? (
                    <button
                      type="button"
                      className="bg-emerald-700 text-white rounded px-3 py-2 text-sm"
                      onClick={() => openPay(detailQ.data!.issue)}
                    >
                      تسجيل دفعة
                    </button>
                  ) : null}
                  <div>
                    <h3 className="font-semibold mb-2">سجل المدفوعات</h3>
                    <table className="min-w-full text-sm border">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2 text-right">التاريخ</th>
                          <th className="p-2 text-right">المبلغ</th>
                          <th className="p-2 text-right">الطريقة</th>
                          <th className="p-2 text-right">الموظف</th>
                          <th className="p-2 text-right">قبل / بعد</th>
                          <th className="p-2 text-right">paymentId</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailQ.data.payments || []).map((p) => (
                          <tr key={p.paymentId} className="border-t">
                            <td className="p-2 text-xs">
                              {new Date(p.createdAt || p.paymentDate).toLocaleString('ar-EG')}
                            </td>
                            <td className="p-2">{formatMilliemesAsEgp(p.amountMilli)}</td>
                            <td className="p-2">{p.paymentMethod}</td>
                            <td className="p-2">
                              {p.actorName} ({p.actorCode})
                            </td>
                            <td className="p-2 text-xs">
                              {formatMilliemesAsEgp(p.outstandingBeforeMilli)} →{' '}
                              {formatMilliemesAsEgp(p.resultingOutstandingMilli)}
                            </td>
                            <td className="p-2 font-mono text-[10px]">{p.paymentId}</td>
                          </tr>
                        ))}
                        {(detailQ.data.payments || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-500">
                              لا توجد مدفوعات مسجّلة.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                    <p className="text-xs text-slate-400 mt-2">سجل المدفوعات للقراءة فقط — لا يمكن التعديل أو الحذف.</p>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Payment modal */}
        {payIssue ? (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
            <div className="bg-white rounded-lg w-full max-w-lg p-4 space-y-3" dir="rtl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">تسجيل دفعة نقدية</h2>
                <button
                  type="button"
                  className="text-slate-500"
                  onClick={() => {
                    if (!submitting) setPayIssue(null);
                  }}
                >
                  إغلاق
                </button>
              </div>

              {receipt ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 space-y-1 text-sm">
                  <div className="font-semibold text-emerald-900">تم تسجيل الدفعة بنجاح</div>
                  <div>مرجع الدفعة: <span className="font-mono">{receipt.paymentId}</span></div>
                  <div>المبلغ: {formatMilliemesAsEgp(receipt.amountMilli)} ج.م</div>
                  <div>المتبقي بعد الدفع: {formatMilliemesAsEgp(receipt.resultingOutstandingMilli)} ج.م</div>
                  <div>
                    سجّلها: {receipt.actorName} ({receipt.actorCode})
                  </div>
                  <button
                    type="button"
                    className="mt-2 bg-slate-800 text-white rounded px-3 py-1.5 text-sm"
                    onClick={() => setPayIssue(null)}
                  >
                    تم
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 rounded p-3">
                    <div>اسم الطيار: {payIssue.riderNameSnapshot}</div>
                    <div>الكود: {payIssue.riderCode}</div>
                    <div>إجمالي العهدة: {formatMilliemesAsEgp(payIssue.originalLiabilityMilli)} ج.م</div>
                    <div>المدفوع حتى الآن: {formatMilliemesAsEgp(payIssue.cashPaidMilli)} ج.م</div>
                    <div className="col-span-2 font-semibold">
                      المتبقي: {formatMilliemesAsEgp(payIssue.outstandingMilli)} ج.م
                    </div>
                  </div>

                  <label className="block text-sm">
                    مبلغ الدفعة (ج.م)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 w-full border rounded px-2 py-1.5"
                      value={amountEgp}
                      onChange={(e) => {
                        setAmountEgp(e.target.value);
                        setConfirming(false);
                      }}
                    />
                  </label>

                  <label className="block text-sm">
                    طريقة الدفع
                    <select
                      className="mt-1 w-full border rounded px-2 py-1.5"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as typeof method)}
                    >
                      <option value="CASH">CASH — نقدي</option>
                      <option value="BANK_TRANSFER">BANK_TRANSFER — تحويل بنكي</option>
                      <option value="OTHER">OTHER — أخرى</option>
                    </select>
                  </label>

                  <label className="block text-sm">
                    ملاحظة (اختياري)
                    <textarea
                      className="mt-1 w-full border rounded px-2 py-1.5"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>

                  {remainingAfter != null && amountMilli > 0 ? (
                    <div
                      className={`rounded border p-2 text-sm ${
                        remainingAfter < 0
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : 'border-sky-200 bg-sky-50 text-sky-900'
                      }`}
                    >
                      {remainingAfter < 0
                        ? `المبلغ يتجاوز المتبقي — لن يُقبل الدفع (تجاوز ${formatMilliemesAsEgp(-remainingAfter)} ج.م)`
                        : `المتبقي بعد الدفع: ${formatMilliemesAsEgp(remainingAfter)} ج.م`}
                    </div>
                  ) : null}

                  {payError ? (
                    <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
                      {payError}
                    </div>
                  ) : null}

                  {!confirming ? (
                    <button
                      type="button"
                      disabled={
                        !amountEgp ||
                        amountMilli <= 0 ||
                        remainingAfter == null ||
                        remainingAfter < 0 ||
                        submitting
                      }
                      className="w-full bg-emerald-700 disabled:bg-slate-300 text-white rounded px-3 py-2 text-sm"
                      onClick={() => setConfirming(true)}
                    >
                      متابعة للتأكيد
                    </button>
                  ) : (
                    <div className="space-y-2 border rounded p-3 bg-amber-50">
                      <p className="text-sm font-medium text-amber-950">
                        تأكيد تسجيل دفعة {formatMilliemesAsEgp(amountMilli)} ج.م؟ المتبقي بعدها{' '}
                        {formatMilliemesAsEgp(remainingAfter || 0)} ج.م.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          className="flex-1 bg-emerald-700 text-white rounded px-3 py-2 text-sm"
                          onClick={submitPayment}
                        >
                          {submitting ? 'جاري التسجيل…' : 'تأكيد التسجيل'}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          className="flex-1 border rounded px-3 py-2 text-sm"
                          onClick={() => setConfirming(false)}
                        >
                          رجوع
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'rose' | 'amber' | 'emerald';
}) {
  const toneCls =
    tone === 'rose'
      ? 'border-rose-100 bg-rose-50'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50'
        : tone === 'emerald'
          ? 'border-emerald-100 bg-emerald-50'
          : 'border-slate-100 bg-white';
  return (
    <div className={`border rounded-lg p-3 ${toneCls}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-800 mt-1">{value}</div>
    </div>
  );
}
