'use client';

import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { formatMilliemesAsEgp } from '@/lib/money';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/** Read-only Rider 360 — no financial mutations. */
export default function Rider360Page() {
  const [riderCode, setRiderCode] = useState('');
  const [queryCode, setQueryCode] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'rider-360', queryCode],
    enabled: Boolean(queryCode),
    queryFn: async () => {
      const res = await authFetch(
        `/api/admin/rider-360?riderCode=${encodeURIComponent(queryCode)}`
      );
      return res.json();
    },
  });

  const data = q.data;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">ملف المندوب 360°</h1>
        <p className="text-sm text-slate-600">
          عرض تجميعي للقراءة فقط من مصادر الحقيقة الحالية. لا ينفّذ خصمًا ماليًا.
        </p>

        <div className="flex gap-2 items-end">
          <label className="text-sm flex-1">
            كود المندوب
            <input
              className="block w-full border rounded px-2 py-1 mt-1"
              value={riderCode}
              onChange={(e) => setRiderCode(e.target.value)}
              placeholder="مثال: R123"
            />
          </label>
          <button
            type="button"
            className="px-4 py-2 rounded bg-slate-800 text-white text-sm"
            onClick={() => setQueryCode(riderCode.trim())}
          >
            عرض
          </button>
        </div>

        {q.isFetching ? (
          <p>جاري التحميل…</p>
        ) : data?.success === false ? (
          <div className="rounded border border-red-200 bg-red-50 p-3">{data.error}</div>
        ) : data?.success ? (
          <div className="space-y-4">
            <section className="border rounded-lg bg-white p-4">
              <h2 className="font-semibold mb-2">الهوية / التعيين</h2>
              {data.identity ? (
                <dl className="grid md:grid-cols-2 gap-2 text-sm">
                  <div>الاسم: {data.identity.name}</div>
                  <div>الكود: {data.identity.riderCode}</div>
                  <div>الهاتف: {data.identity.phone}</div>
                  <div>المنطقة: {data.identity.zone}</div>
                  <div>التفعيل: {data.identity.activationStatus}</div>
                  <div>تاريخ التفعيل: {data.identity.activationDate || '—'}</div>
                  <div>المحاضرة: {data.identity.lectureDate || '—'}</div>
                  <div>الحضور: {data.identity.lectureAttendance || '—'}</div>
                  <div>مشرف التشغيل: {data.identity.finalAssignedSupervisorCode || '—'}</div>
                  <div>الاستعلام الأمني: {data.identity.securityInquiryPayment || '—'}</div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">لا يوجد مرشح بهذا الكود.</p>
              )}
            </section>

            <section className="border rounded-lg bg-white p-4">
              <h2 className="font-semibold mb-2">جهات الاتصال</h2>
              <ul className="text-sm space-y-1">
                {(data.contacts || []).length === 0 && <li>—</li>}
                {(data.contacts || []).map((c: { id?: string; name?: string; relationship?: string; phone?: string }) => (
                  <li key={c.id || `${c.name}-${c.phone}`}>
                    {c.name} — {c.relationship} — {c.phone}
                  </li>
                ))}
              </ul>
            </section>

            <section className="border rounded-lg bg-white p-4 overflow-x-auto">
              <h2 className="font-semibold mb-2">عهدة المعدات (مفتوحة)</h2>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">Issue</th>
                    <th className="p-2 text-right">أصلي</th>
                    <th className="p-2 text-right">مخصوم</th>
                    <th className="p-2 text-right">متبقي</th>
                    <th className="p-2 text-right">أقساط</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.equipmentLiability?.openIssues || []).map(
                    (i: {
                      equipmentIssueId: string;
                      originalLiabilityMilli: number;
                      amountDeductedMilli: number;
                      outstandingMilli: number;
                      installmentsCompleted: number;
                    }) => (
                      <tr key={i.equipmentIssueId} className="border-t">
                        <td className="p-2">{i.equipmentIssueId}</td>
                        <td className="p-2">{formatMilliemesAsEgp(i.originalLiabilityMilli)}</td>
                        <td className="p-2">{formatMilliemesAsEgp(i.amountDeductedMilli)}</td>
                        <td className="p-2">{formatMilliemesAsEgp(i.outstandingMilli)}</td>
                        <td className="p-2">{i.installmentsCompleted}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </section>

            <section className="border rounded-lg bg-white p-4 overflow-x-auto">
              <h2 className="font-semibold mb-2">التزامات REQUEST</h2>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">deductionId</th>
                    <th className="p-2 text-right">السبب</th>
                    <th className="p-2 text-right">أصلي</th>
                    <th className="p-2 text-right">مدفوع</th>
                    <th className="p-2 text-right">متبقي</th>
                    <th className="p-2 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.obligations || []).map(
                    (o: {
                      deductionId: string;
                      reason: string;
                      originalAmount: number;
                      paidAmount: number;
                      remainingAmount: number;
                      status: string;
                    }) => (
                      <tr key={o.deductionId} className="border-t">
                        <td className="p-2">{o.deductionId}</td>
                        <td className="p-2">{o.reason}</td>
                        <td className="p-2">{formatMilliemesAsEgp(o.originalAmount)}</td>
                        <td className="p-2">{formatMilliemesAsEgp(o.paidAmount)}</td>
                        <td className="p-2">{formatMilliemesAsEgp(o.remainingAmount)}</td>
                        <td className="p-2">{o.status}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </section>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
