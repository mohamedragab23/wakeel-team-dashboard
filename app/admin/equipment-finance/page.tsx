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
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 text-[#EAF0FF]" dir="rtl">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">مالية المعدات / المطابقة</h1>

        {!q.data?.enabled ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/80 p-4 text-amber-100">
            فعّل أحد أعلام المعدات (`FEATURE_EQUIPMENT_LEDGER_ENABLED` / auto / returns) لعرض التقارير.
          </div>
        ) : q.isLoading ? (
          <p className="text-[rgba(234,240,255,0.65)]">جاري التحميل…</p>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/15 bg-[#12182B] p-4">
                <div className="text-sm text-[rgba(234,240,255,0.65)]">عهد مفتوحة</div>
                <div className="text-2xl font-semibold text-[#EAF0FF]">
                  {q.data.summary?.openIssuesCount ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-[#12182B] p-4">
                <div className="text-sm text-[rgba(234,240,255,0.65)]">المتبقي</div>
                <div className="text-2xl font-semibold text-[#EAF0FF]">
                  {q.data.summary?.outstandingEgp ?? '0.00'} ج.م
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-[#12182B] p-4">
                <div className="text-sm text-[rgba(234,240,255,0.65)]">المخصوم (عهد مفتوحة)</div>
                <div className="text-2xl font-semibold text-[#EAF0FF]">
                  {q.data.summary?.deductedEgp ?? '0.00'} ج.م
                </div>
              </div>
            </div>

            <section className="rounded-xl border border-white/15 bg-[#12182B] overflow-x-auto">
              <h2 className="p-3 font-semibold border-b border-white/10 text-[#EAF0FF]">
                عهد مفتوحة (عينة)
              </h2>
              <table className="min-w-full text-sm text-[#EAF0FF]">
                <thead className="bg-[#1C2440] text-[#EAF0FF]">
                  <tr>
                    <th className="p-2 text-right font-semibold">مندوب</th>
                    <th className="p-2 text-right font-semibold">مشرف</th>
                    <th className="p-2 text-right font-semibold">متبقي</th>
                    <th className="p-2 text-right font-semibold">أقساط</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data.summary?.sampleOpen || []).map((i: any) => (
                    <tr key={i.equipmentIssueId} className="border-t border-white/10">
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

            <section className="rounded-xl border border-white/15 bg-[#12182B] overflow-x-auto">
              <h2 className="p-3 font-semibold border-b border-white/10 text-[#EAF0FF]">
                لقطات مطابقة الدورات
              </h2>
              <table className="min-w-full text-sm text-[#EAF0FF]">
                <thead className="bg-[#1C2440] text-[#EAF0FF]">
                  <tr>
                    <th className="p-2 text-right font-semibold">دورة</th>
                    <th className="p-2 text-right font-semibold">تاريخ</th>
                    <th className="p-2 text-right font-semibold">مخصوم</th>
                    <th className="p-2 text-right font-semibold">تخطّي</th>
                    <th className="p-2 text-right font-semibold">أخطاء</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data.snapshots || []).map((s: any) => (
                    <tr key={s.snapshotId} className="border-t border-white/10">
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

            <section className="rounded-xl border border-white/15 bg-[#12182B] overflow-x-auto">
              <h2 className="p-3 font-semibold border-b border-white/10 text-[#EAF0FF]">
                تسويات معلّقة (waiver)
              </h2>
              <table className="min-w-full text-sm text-[#EAF0FF]">
                <thead className="bg-[#1C2440] text-[#EAF0FF]">
                  <tr>
                    <th className="p-2 text-right font-semibold">معرف</th>
                    <th className="p-2 text-right font-semibold">مندوب</th>
                    <th className="p-2 text-right font-semibold">إعفاء (milli)</th>
                    <th className="p-2 text-right font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {(settlements.data?.settlements || []).map((s: any) => (
                    <tr key={s.settlementId} className="border-t border-white/10">
                      <td className="p-2 font-mono text-xs">{s.settlementId}</td>
                      <td className="p-2">{s.riderCode}</td>
                      <td className="p-2">{s.waivedMilli}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-cyan-300 underline hover:text-cyan-200"
                          onClick={() => approve(s.settlementId)}
                        >
                          اعتماد إعفاء
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!settlements.data?.settlements?.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-4 text-center text-[rgba(234,240,255,0.55)]"
                      >
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
