'use client';

import { authFetch } from '@/lib/authFetch';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import type { MetadataCompletionAudit } from '@/lib/strategicOps/metadataCompletionAudit';

type AuditResponse = {
  generatedAt: string;
  scope: { supervisorCode?: string; supervisorName?: string };
  audit: MetadataCompletionAudit;
};

function missingFieldsLabel(fields: string[]) {
  const map: Record<string, string> = {
    joinDate: 'Join Date',
    contractType: 'Contract Type',
    contractEndDate: 'Contract End Date',
  };
  return fields.map((f) => map[f] || f).join(' · ');
}

export default function RiderMetadataAuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['rider-metadata-audit'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-metadata-audit');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل التقرير');
      return json.data as AuditResponse;
    },
  });

  const audit = data?.audit;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">تدقيق بيانات المناديب</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            تقرير للمشرف يوضح المناديب الذين يحتاجون إكمال Join Date و Contract Type و Contract End Date.
          </p>
        </div>

        {isLoading && <p className="text-[#94A3B8]">جاري التحميل...</p>}
        {error && (
          <p className="text-red-300">{(error as Error).message}</p>
        )}

        {audit && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#64748B]">إجمالي المناديب</p>
                <p className="text-2xl font-bold text-[#EAF0FF]">{audit.totalRidersInScope}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#64748B]">بدون Join Date</p>
                <p className="text-2xl font-bold text-amber-300">{audit.ridersMissingJoinDate}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#64748B]">بدون Contract Type</p>
                <p className="text-2xl font-bold text-amber-300">{audit.ridersMissingContractType}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-[#64748B]">اكتمال البيانات</p>
                <p className="text-2xl font-bold text-emerald-300">{audit.metadataCoveragePercent}%</p>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
              عند إرسال طلب تعيين أو إعادة تفعيل جديد، يجب إدخال نوع العقد وتاريخ الانضمام. تاريخ انتهاء العقد
              يُحسب تلقائيًا (Join Date + سنة واحدة).
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#94A3B8] border-b border-white/10">
                    <th className="text-right p-3">الكود</th>
                    <th className="text-right p-3">الاسم</th>
                    <th className="text-right p-3">الحقول الناقصة</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.ridersNeedingMetadata.slice(0, 100).map((r) => (
                    <tr key={r.riderCode} className="border-b border-white/5">
                      <td className="p-3 text-[#EAF0FF]">{r.riderCode}</td>
                      <td className="p-3 text-[#EAF0FF]">{r.name}</td>
                      <td className="p-3 text-amber-200">{missingFieldsLabel(r.missingFields)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audit.ridersNeedingMetadata.length > 100 && (
                <p className="text-xs text-[#64748B] p-3">يعرض 100 من {audit.ridersNeedingMetadata.length}</p>
              )}
              {audit.ridersNeedingMetadata.length === 0 && (
                <p className="p-4 text-emerald-300">✅ جميع المناديب في نطاقك مكتملة البيانات الوصفية.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
