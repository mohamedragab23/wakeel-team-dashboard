'use client';

import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { formatMilliemesAsEgp } from '@/lib/money';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Expected equipment deductions — CALCULATION preview only.
 * Does not run financial apply or mutate wallets.
 */
export default function ExpectedEquipmentDeductionsPage() {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ['admin', 'expected-equipment-deductions', asOfDate],
    queryFn: async () => {
      const res = await authFetch(
        `/api/admin/expected-equipment-deductions?asOfDate=${encodeURIComponent(asOfDate)}`
      );
      return res.json();
    },
  });

  const snap = q.data?.snapshot;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">المتوقع لخصم المعدات (معاينة)</h1>
        <p className="text-sm text-slate-600">
          حساب فقط — لا يخصم من العهدة ولا يكتب دفترًا. Financial Apply يبقى مقفولًا.
        </p>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            تاريخ التوليد
            <input
              type="date"
              className="block border rounded px-2 py-1 mt-1"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </label>
        </div>

        {q.data && q.data.success === false ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
            {q.data.error || 'غير متاح — تأكد من تفعيل دورات القبض.'}
          </div>
        ) : q.isLoading ? (
          <p>جاري التحميل…</p>
        ) : !snap ? (
          <div className="rounded border p-4 bg-white">لا توجد دورة مطابقة لهذا التاريخ.</div>
        ) : (
          <>
            <div className="grid md:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-slate-500">الدورة</div>
                <div className="font-semibold">{snap.cycleLabel}</div>
              </div>
              <div className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-slate-500">مناديب</div>
                <div className="font-semibold">{snap.totals?.riders ?? 0}</div>
              </div>
              <div className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-slate-500">إجمالي المتوقع</div>
                <div className="font-semibold">
                  {formatMilliemesAsEgp(snap.totals?.expectedMilli ?? 0)} ج.م
                </div>
              </div>
              <div className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-slate-500">ختامية؟</div>
                <div className="font-semibold">{snap.isClosing ? 'نعم — خصم 0' : 'لا'}</div>
              </div>
            </div>

            <div className="border rounded-lg bg-white overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">مندوب</th>
                    <th className="p-2 text-right">أصلي</th>
                    <th className="p-2 text-right">متبقي</th>
                    <th className="p-2 text-right">متوقع</th>
                    <th className="p-2 text-right">ترحيل</th>
                    <th className="p-2 text-right">سبب الصفر</th>
                  </tr>
                </thead>
                <tbody>
                  {(snap.lines || []).map((l: {
                    equipmentIssueId: string;
                    riderCode: string;
                    riderNameSnapshot: string;
                    originalLiabilityMilli: number;
                    outstandingMilli: number;
                    expectedDeductionMilli: number;
                    carriedRemainderMilli: number;
                    reasonIfZero: string;
                  }) => (
                    <tr key={l.equipmentIssueId} className="border-t">
                      <td className="p-2">
                        {l.riderNameSnapshot} ({l.riderCode})
                      </td>
                      <td className="p-2">{formatMilliemesAsEgp(l.originalLiabilityMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(l.outstandingMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(l.expectedDeductionMilli)}</td>
                      <td className="p-2">{formatMilliemesAsEgp(l.carriedRemainderMilli)}</td>
                      <td className="p-2 text-slate-500">{l.reasonIfZero || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
