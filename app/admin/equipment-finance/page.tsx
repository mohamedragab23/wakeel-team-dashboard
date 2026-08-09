'use client';

import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useQuery } from '@tanstack/react-query';
import { formatMilliemesAsEgp } from '@/lib/money';

export default function EquipmentFinancePage() {
  const q = useQuery({
    queryKey: ['admin', 'equipment-finance'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/equipment-finance');
      return res.json();
    },
  });

  const settlements = useQuery({
    queryKey: ['admin', 'equipment-settlements'],
    enabled: Boolean(q.data?.enabled),
    queryFn: async () => {
      const res = await authFetch('/api/admin/equipment-settlements?status=pending');
      return res.json();
    },
  });

  const approve = async (id: string) => {
    const res = await authFetch(`/api/admin/equipment-settlements/${id}/approve`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) alert(json.error || 'فشل الاعتماد');
    else {
      settlements.refetch();
      q.refetch();
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold text-slate-800">مالية المعدات / المطابقة</h1>

        {!q.data?.enabled ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
            فعّل أحد أعلام المعدات (`FEATURE_EQUIPMENT_LEDGER_ENABLED` / auto / returns) لعرض التقارير.
          </div>
        ) : q.isLoading ? (
          <p>جاري التحميل…</p>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="border rounded-lg p-4 bg-white">
                <div className="text-sm text-slate-500">عهد مفتوحة</div>
                <div className="text-2xl font-semibold">{q.data.summary?.openIssuesCount ?? 0}</div>
              </div>
              <div className="border rounded-lg p-4 bg-white">
                <div className="text-sm text-slate-500">المتبقي</div>
                <div className="text-2xl font-semibold">{q.data.summary?.outstandingEgp ?? '0.00'} ج.م</div>
              </div>
              <div className="border rounded-lg p-4 bg-white">
                <div className="text-sm text-slate-500">المخصوم (عهد مفتوحة)</div>
                <div className="text-2xl font-semibold">{q.data.summary?.deductedEgp ?? '0.00'} ج.م</div>
              </div>
            </div>

            <section className="border rounded-lg bg-white overflow-x-auto">
              <h2 className="p-3 font-semibold border-b">عهد مفتوحة (عينة)</h2>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">مندوب</th>
                    <th className="p-2 text-right">مشرف</th>
                    <th className="p-2 text-right">متبقي</th>
                    <th className="p-2 text-right">أقساط</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data.summary?.sampleOpen || []).map((i: any) => (
                    <tr key={i.equipmentIssueId} className="border-t">
                      <td className="p-2">
                        {i.riderNameSnapshot} ({i.riderCode})
                      </td>
                      <td className="p-2">{i.supervisorCodeSnapshot}</td>
                      <td className="p-2">{formatMilliemesAsEgp(i.outstandingMilli)}</td>
                      <td className="p-2">{i.installmentsCompleted}/3</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="border rounded-lg bg-white overflow-x-auto">
              <h2 className="p-3 font-semibold border-b">لقطات مطابقة الدورات</h2>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">دورة</th>
                    <th className="p-2 text-right">تاريخ</th>
                    <th className="p-2 text-right">مخصوم</th>
                    <th className="p-2 text-right">تخطّي</th>
                    <th className="p-2 text-right">أخطاء</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data.snapshots || []).map((s: any) => (
                    <tr key={s.snapshotId} className="border-t">
                      <td className="p-2 font-mono text-xs">{s.cycleId}</td>
                      <td className="p-2">{s.asOfDate}</td>
                      <td className="p-2">{s.deducted}</td>
                      <td className="p-2">{s.skipped}</td>
                      <td className="p-2">{s.errorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="border rounded-lg bg-white overflow-x-auto">
              <h2 className="p-3 font-semibold border-b">تسويات معلّقة (waiver)</h2>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">معرف</th>
                    <th className="p-2 text-right">مندوب</th>
                    <th className="p-2 text-right">إعفاء (milli)</th>
                    <th className="p-2 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {(settlements.data?.settlements || []).map((s: any) => (
                    <tr key={s.settlementId} className="border-t">
                      <td className="p-2 font-mono text-xs">{s.settlementId}</td>
                      <td className="p-2">{s.riderCode}</td>
                      <td className="p-2">{s.waivedMilli}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() => approve(s.settlementId)}
                        >
                          اعتماد إعفاء
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!settlements.data?.settlements?.length && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-500">
                        لا توجد تسويات معلّقة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
