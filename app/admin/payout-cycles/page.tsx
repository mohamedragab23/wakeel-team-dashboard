'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';

type Cycle = {
  cycleId: string;
  year: number;
  month: number;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  payoutDate: string;
  deductionGenerationDate: string;
  isClosing: boolean;
  equipmentDeductionEnabled: boolean;
  status: string;
  notes: string;
};

const emptyForm = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  cycleNumber: 1,
  startDate: '',
  endDate: '',
  payoutDate: '',
  deductionGenerationDate: '',
  isClosing: false,
  equipmentDeductionEnabled: true,
  notes: '',
};

export default function PayoutCyclesPage() {
  const notify = usePageNotify();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth() + 1));

  const capability = useQuery({
    queryKey: ['admin', 'payout-cycles', 'capability'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/payout-cycles/capability');
      return res.json();
    },
  });

  const enabled = Boolean(capability.data?.enabled);

  const list = useQuery({
    queryKey: ['admin', 'payout-cycles', yearFilter, monthFilter],
    enabled,
    queryFn: async () => {
      const res = await authFetch(
        `/api/admin/payout-cycles?year=${encodeURIComponent(yearFilter)}&month=${encodeURIComponent(monthFilter)}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json.cycles as Cycle[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/admin/payout-cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        const msg = json.errors?.map((e: any) => e.message).join(' · ') || json.error || 'فشل الحفظ';
        throw new Error(msg);
      }
      return json.cycle as Cycle;
    },
    onSuccess: () => {
      notify.success('تم إنشاء الدورة');
      qc.invalidateQueries({ queryKey: ['admin', 'payout-cycles'] });
      setForm((f) => ({ ...f, cycleNumber: f.cycleNumber + 1, startDate: '', endDate: '', payoutDate: '', deductionGenerationDate: '', notes: '', isClosing: false }));
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const finalizeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/admin/payout-cycles/${id}/finalize`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.errors?.[0]?.message || json.error || 'فشل التقفيل');
    },
    onSuccess: () => {
      notify.success('تم تقفيل الدورة');
      qc.invalidateQueries({ queryKey: ['admin', 'payout-cycles'] });
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const prepMut = useMutation({
    mutationFn: async (cycleId: string) => {
      const res = await authFetch('/api/admin/equipment-auto-request-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId, operatorConfirmation: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تجهيز الطلبات');
      return json;
    },
    onSuccess: (json) => {
      notify.success(
        `تم تجهيز REQUEST: جديد ${json.result?.requested ?? 0} · ترحيل ${json.result?.queued ?? 0} (بدون FA)`
      );
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const cycles = list.data || [];
  const title = useMemo(() => `دورات القبض — ${monthFilter}/${yearFilter}`, [monthFilter, yearFilter]);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="text-sm text-slate-600">
          عيّن <strong>تاريخ توليد الاستقطاع</strong> لكل دورة. زر «تجهيز طلبات المعدات» يكتب REQUEST على
          شيت الاستقطاعات (معدات) — بدون خصم محفظة. الخصم اليدوي V2 من المشرف يُضاف لنفس الشيت.
          بعد رفع محفظة Talabat تُحضَّر طلبات الدورة التالية تلقائياً.
        </p>

        {capability.isLoading ? (
          <p className="text-slate-600">جاري التحقق…</p>
        ) : !enabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            ميزة دورات القبض غير مفعّلة (`FEATURE_PAYOUT_CYCLES_ENABLED`). لا تغيير على النظام الحالي.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm">
                السنة
                <input
                  className="block border rounded px-2 py-1 mt-1 w-28"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                />
              </label>
              <label className="text-sm">
                الشهر
                <input
                  className="block border rounded px-2 py-1 mt-1 w-20"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                />
              </label>
            </div>

            <form
              className="grid md:grid-cols-3 gap-3 border rounded-lg p-4 bg-white"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
            >
              <h2 className="md:col-span-3 font-semibold text-slate-700">دورة جديدة</h2>
              {(
                [
                  ['year', 'السنة'],
                  ['month', 'الشهر'],
                  ['cycleNumber', 'رقم الدورة'],
                  ['startDate', 'من'],
                  ['endDate', 'إلى'],
                  ['payoutDate', 'تاريخ القبض'],
                  ['deductionGenerationDate', 'تاريخ توليد الاستقطاع'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm">
                  {label}
                  <input
                    className="block border rounded px-2 py-1 mt-1 w-full"
                    type={key.includes('Date') ? 'date' : 'number'}
                    value={(form as any)[key]}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [key]: key.includes('Date') ? e.target.value : Number(e.target.value),
                      }))
                    }
                    required
                  />
                </label>
              ))}
              <label className="text-sm flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={form.isClosing}
                  onChange={(e) => setForm((f) => ({ ...f, isClosing: e.target.checked }))}
                />
                دورة التقفيلة
              </label>
              <label className="text-sm flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={form.equipmentDeductionEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, equipmentDeductionEnabled: e.target.checked }))}
                />
                استقطاع معدات مفعّل
              </label>
              <label className="text-sm md:col-span-3">
                ملاحظات
                <input
                  className="block border rounded px-2 py-1 mt-1 w-full"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="md:col-span-3 bg-slate-800 text-white rounded px-4 py-2 disabled:opacity-50"
              >
                حفظ الدورة
              </button>
            </form>

            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-right">#</th>
                    <th className="p-2 text-right">الفترة</th>
                    <th className="p-2 text-right">توليد الاستقطاع</th>
                    <th className="p-2 text-right">تقفيلة</th>
                    <th className="p-2 text-right">معدات</th>
                    <th className="p-2 text-right">الحالة</th>
                    <th className="p-2 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.cycleId} className="border-t">
                      <td className="p-2">{c.cycleNumber}</td>
                      <td className="p-2">
                        {c.startDate} → {c.endDate}
                      </td>
                      <td className="p-2">{c.deductionGenerationDate}</td>
                      <td className="p-2">{c.isClosing ? 'نعم' : 'لا'}</td>
                      <td className="p-2">{c.equipmentDeductionEnabled ? 'نعم' : 'لا'}</td>
                      <td className="p-2">{c.status}</td>
                      <td className="p-2 space-x-2 space-x-reverse">
                        {c.status !== 'finalized' && c.equipmentDeductionEnabled && !c.isClosing ? (
                          <button
                            type="button"
                            className="text-emerald-800 underline ml-2"
                            disabled={prepMut.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  'تجهيز طلبات استقطاع المعدات (REQUEST) لهذه الدورة على شيت الاستقطاعات؟ بدون خصم محفظة.'
                                )
                              ) {
                                prepMut.mutate(c.cycleId);
                              }
                            }}
                          >
                            تجهيز طلبات المعدات
                          </button>
                        ) : null}
                        {c.status !== 'finalized' ? (
                          <button
                            type="button"
                            className="text-blue-700 underline"
                            onClick={() => finalizeMut.mutate(c.cycleId)}
                          >
                            تقفيل
                          </button>
                        ) : (
                          !c.equipmentDeductionEnabled || c.isClosing ? '—' : null
                        )}
                      </td>
                    </tr>
                  ))}
                  {!cycles.length && !list.isLoading && (
                    <tr>
                      <td colSpan={7} className="p-4 text-slate-500 text-center">
                        لا توجد دورات لهذا الشهر
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
