'use client';

import { authFetch } from '@/lib/authFetch';
import Layout from '@/components/Layout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MetadataCompletionAudit } from '@/lib/strategicOps/metadataCompletionAudit';
import type { RiderMetadataStatus } from '@/lib/riderMetadata';
import {
  CONTRACT_TYPE_OPTIONS,
  computeContractEndDate,
  parseRiderIsoDate,
} from '@/lib/riderMetadata';
import { Fragment, useMemo, useState } from 'react';

type AuditResponse = {
  generatedAt: string;
  scope: { supervisorCode?: string; supervisorName?: string };
  audit: MetadataCompletionAudit;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

function missingFieldsLabel(fields: string[]) {
  const map: Record<string, string> = {
    joinDate: 'Join Date',
    contractType: 'Contract Type',
    contractEndDate: 'Contract End Date',
  };
  return fields.map((f) => map[f] || f).join(' · ');
}

function MetadataEditForm({
  rider,
  onCancel,
  onSaved,
}: {
  rider: RiderMetadataStatus;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [joinDate, setJoinDate] = useState(rider.joinDate ?? '');
  const [contractType, setContractType] = useState(rider.contractType ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const contractEndPreview = useMemo(() => {
    try {
      if (parseRiderIsoDate(joinDate)) return computeContractEndDate(joinDate);
    } catch {
      return '';
    }
    return '';
  }, [joinDate]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/rider-metadata-audit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderCode: rider.riderCode,
          joinDate: joinDate.trim(),
          contractType: contractType.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'فشل الحفظ');
        return;
      }
      onSaved();
    } catch {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-[rgba(255,255,255,0.03)] border-t border-white/5">
      <p className="text-sm text-[#94A3B8] mb-3">
        إكمال بيانات: <span className="text-[#EAF0FF]">{rider.name}</span> ({rider.riderCode})
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-[#64748B] mb-1">نوع العقد *</label>
          <select
            value={contractType}
            onChange={(e) => setContractType(e.target.value)}
            className={inputClass}
          >
            <option value="">اختر نوع العقد</option>
            {CONTRACT_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#64748B] mb-1">Join Date *</label>
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-[#64748B] mb-1">Contract End Date (تلقائي)</label>
          <input type="text" readOnly value={contractEndPreview || '—'} className={`${inputClass} opacity-70`} />
        </div>
      </div>
      {error && <p className="text-sm text-red-300 mb-3">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !joinDate.trim() || !contractType.trim()}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-black text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-white/20 text-sm text-[#94A3B8] hover:bg-white/5"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

export default function RiderMetadataAuditPage() {
  const queryClient = useQueryClient();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rider-metadata-audit'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-metadata-audit');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل التقرير');
      return json.data as AuditResponse;
    },
  });

  const audit = data?.audit;

  const handleSaved = async () => {
    setEditingCode(null);
    setSaveMessage('✅ تم حفظ البيانات بنجاح');
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['rider-metadata', 'notifications'] });
    setTimeout(() => setSaveMessage(''), 4000);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">تدقيق بيانات المناديب</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            راجع المناديب الناقصين وأكمل Join Date و Contract Type مباشرة من هذه الصفحة.
          </p>
        </div>

        {isLoading && <p className="text-[#94A3B8]">جاري التحميل...</p>}
        {error && <p className="text-red-300">{(error as Error).message}</p>}
        {saveMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200 text-sm">
            {saveMessage}
          </div>
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
              اضغط «إكمال البيانات» بجانب كل مندوب لإدخال Join Date و Contract Type. تاريخ انتهاء العقد
              يُحسب تلقائيًا (Join Date + سنة واحدة) ويُحفظ مباشرة في شيت المناديب.
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#94A3B8] border-b border-white/10">
                    <th className="text-right p-3">الكود</th>
                    <th className="text-right p-3">الاسم</th>
                    <th className="text-right p-3">الحقول الناقصة</th>
                    <th className="text-right p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.ridersNeedingMetadata.slice(0, 100).map((r) => (
                    <Fragment key={r.riderCode}>
                      <tr className="border-b border-white/5">
                        <td className="p-3 text-[#EAF0FF]">{r.riderCode}</td>
                        <td className="p-3 text-[#EAF0FF]">{r.name}</td>
                        <td className="p-3 text-amber-200">{missingFieldsLabel(r.missingFields)}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingCode((prev) => (prev === r.riderCode ? null : r.riderCode))
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30"
                          >
                            {editingCode === r.riderCode ? 'إغلاق' : 'إكمال البيانات'}
                          </button>
                        </td>
                      </tr>
                      {editingCode === r.riderCode && (
                        <tr>
                          <td colSpan={4} className="p-0">
                            <MetadataEditForm
                              rider={r}
                              onCancel={() => setEditingCode(null)}
                              onSaved={handleSaved}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
