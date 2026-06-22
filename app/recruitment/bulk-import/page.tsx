'use client';

import { authFetch } from '@/lib/authFetch';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BulkImportPanel from '@/components/recruitment/BulkImportPanel';
import Card from '@/components/ui-v2/Card';
import type { Candidate } from '@/lib/recruitment/types';

export default function RecruitmentBulkImportPage() {
  const queryClient = useQueryClient();
  const { data: allCandidates = [] } = useQuery({
    queryKey: ['recruitment', 'bulk-import-candidates-pool'],
    queryFn: async () => {
      const url = new URL('/api/recruitment/candidates', window.location.origin);
      const res = await authFetch(url.toString());
      const json = await res.json();
      return json.success ? (json.data as Candidate[]) : [];
    } });

  const [newCandidates, legacyCandidates] = useMemo(() => {
    const legacy = allCandidates.filter((c) => c.isLegacy);
    const fresh = allCandidates.filter((c) => !c.isLegacy && c.pipelineStatus === 'active');
    return [fresh, legacy];
  }, [allCandidates]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">الرفع المجمع</h2>
      <div className="grid xl:grid-cols-2 gap-4">
        <BulkImportPanel
          isLegacy={false}
          title="رفع بيانات تعيين جديد"
          description="مرشحون جدد سيدخلون مسار التعيين المعتاد."
          onImported={() => queryClient.invalidateQueries({ queryKey: ['recruitment'] })}
        />
        <BulkImportPanel
          isLegacy
          title="رفع بيانات إعادة تفعيل (مرشحون قدامى)"
          description="بيانات مرشحين سابقين لإعادة متابعتهم في جدول منفصل."
          onImported={() => queryClient.invalidateQueries({ queryKey: ['recruitment'] })}
        />
      </div>
      <div className="grid xl:grid-cols-2 gap-4">
        <CandidatesPreviewTable
          title="جدول التعيين الجديد"
          rows={newCandidates}
          emptyText="لا يوجد مرشحون جدد حاليًا"
        />
        <CandidatesPreviewTable
          title="جدول إعادة التفعيل (قدامى)"
          rows={legacyCandidates}
          emptyText="لا يوجد مرشحون قدامى حاليًا"
        />
      </div>
    </div>
  );
}

function CandidatesPreviewTable({
  title,
  rows,
  emptyText }: {
  title: string;
  rows: Candidate[];
  emptyText: string;
}) {
  return (
    <Card className="p-0 overflow-x-auto">
      <div className="p-4 border-b border-[rgba(255,255,255,0.10)]">
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-[rgba(234,240,255,0.65)] mt-1">عدد السجلات: {rows.length}</p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[rgba(234,240,255,0.65)]">{emptyText}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.10)] text-[rgba(234,240,255,0.7)]">
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">الهاتف</th>
              <th className="p-3 text-start">الإعلان</th>
              <th className="p-3 text-start">تاريخ التقديم</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((c) => (
              <tr key={c.id} className="border-b border-[rgba(255,255,255,0.06)]">
                <td className="p-3">{c.fullName}</td>
                <td className="p-3 font-mono">{c.phone}</td>
                <td className="p-3">{c.jobAd || '—'}</td>
                <td className="p-3">{c.appliedDate || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
