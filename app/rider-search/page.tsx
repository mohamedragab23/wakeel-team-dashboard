'use client';

/**
 * SRS-013 Phase 2 — Rider Search / Single Rider Profile.
 *
 * Additive, standalone page (no existing page touched). Gated by
 * `FEATURE_RIDER_SEARCH_ENABLED` (default off): shows a clear "not enabled
 * yet" state instead of hiding the nav link entirely, so the route never
 * 404s and admins can confirm the flag status directly from the UI.
 */
import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/authFetch';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import type { MergedRiderProfile, RiderSearchType } from '@/lib/rooster/riderMerge';

const SEARCH_TYPE_OPTIONS: { value: RiderSearchType; label: string }[] = [
  { value: 'workerId', label: 'Worker ID (كود روستر)' },
  { value: 'paperNumber', label: 'رقم البطاقة (Paper No)' },
  { value: 'phone', label: 'رقم الهاتف' },
  { value: 'name', label: 'الاسم' },
  { value: 'email', label: 'البريد الإلكتروني' },
];

const FIELD_LABELS_AR: Record<string, string> = {
  workerId: 'Worker ID',
  paperNumber: 'رقم البطاقة',
  name: 'الاسم',
  email: 'البريد الإلكتروني',
  phoneNumbers: 'أرقام الهاتف',
  city: 'المدينة / المنطقة',
  company: 'الشركة',
  jobTitle: 'الوظيفة',
  joiningDate: 'تاريخ الالتحاق',
  currentStatus: 'الحالة الحالية',
  supervisorCode: 'كود المشرف',
  supervisorName: 'اسم المشرف',
  contractType: 'نوع العقد',
  contractEndDate: 'تاريخ انتهاء العقد',
};

function SourceTag({ source }: { source: 'dashboard' | 'rooster' | undefined }) {
  if (!source) return null;
  const isDashboard = source === 'dashboard';
  return (
    <span
      className={`ms-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isDashboard
          ? 'bg-[rgba(0,245,255,0.15)] text-[color:var(--v2-accent-cyan)]'
          : 'bg-[rgba(168,85,247,0.18)] text-[color:var(--v2-accent-purple)]'
      }`}
    >
      {isDashboard ? 'Dashboard' : 'Live from Rooster'}
    </span>
  );
}

function ProfileField({ label, value, source }: { label: string; value?: string; source?: 'dashboard' | 'rooster' }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[rgba(234,240,255,0.55)]">
        {label}
        <SourceTag source={source} />
      </span>
      <span className="text-sm text-[#EAF0FF]">{value}</span>
    </div>
  );
}

export default function RiderSearchPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [searchType, setSearchType] = useState<RiderSearchType>('workerId');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MergedRiderProfile[]>([]);
  const [selected, setSelected] = useState<MergedRiderProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/rooster/riders/search');
        const j = await res.json();
        setEnabled(Boolean(j?.enabled));
      } catch {
        setEnabled(false);
      }
    })();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('أدخل قيمة للبحث');
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const res = await authFetch(
        `/api/rooster/riders/search?type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      if (!data.success) {
        setResults([]);
        setError(data.error || 'فشل البحث');
        return;
      }
      setResults(data.results || []);
      if (!data.results?.length) {
        setError('لا توجد نتائج مطابقة');
      }
    } catch (e: any) {
      setError(e?.message || 'خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#EAF0FF]">بحث المناديب (Rider Search)</h1>
          <p className="text-sm text-[rgba(234,240,255,0.6)] mt-1">
            بحث مباشر من Rooster بدون فتح الموقع، مع دمج بيانات الداشبورد تلقائيًا.
          </p>
        </div>

        {enabled === false && (
          <Card className="p-5">
            <p className="text-sm text-[#EAF0FF]">هذه الميزة غير مفعّلة حاليًا (FEATURE_RIDER_SEARCH_ENABLED).</p>
          </Card>
        )}

        {enabled && (
          <>
            <Card className="p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm text-[#EAF0FF] sm:col-span-1">
                  نوع البحث
                  <select
                    value={searchType}
                    onChange={(e) => setSearchType(e.target.value as RiderSearchType)}
                    className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    {SEARCH_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[#EAF0FF] sm:col-span-2">
                  قيمة البحث
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="مثال: 877614"
                    className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
                  />
                </label>
              </div>
              <Button type="button" variant="primary" onClick={handleSearch} disabled={loading}>
                {loading ? 'جاري البحث…' : 'بحث'}
              </Button>
              {error && <p className="text-sm text-rose-400">{error}</p>}
            </Card>

            {results.length > 0 && (
              <Card title={`النتائج (${results.length})`} className="p-0">
                <div className="divide-y divide-[rgba(255,255,255,0.08)]">
                  {results.map((r, idx) => (
                    <button
                      key={`${r.workerId || idx}`}
                      type="button"
                      onClick={() => setSelected(r)}
                      className="w-full text-right px-4 sm:px-5 py-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm text-[#EAF0FF] font-medium">{r.name || '—'}</p>
                        <p className="text-xs text-[rgba(234,240,255,0.55)]">
                          Worker ID: {r.workerId || '—'} · {r.city || '—'}
                          {r.hasStartingPoints === false
                            ? ' · موقوف'
                            : r.hasStartingPoints
                              ? ' · نشط (SP)'
                              : ''}
                        </p>
                      </div>
                      <span className="text-xs text-[color:var(--v2-accent-cyan)]">عرض الملف ›</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {selected && (
              <Card title={`ملف المندوب: ${selected.name || selected.workerId || ''}`} className="p-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <ProfileField label={FIELD_LABELS_AR.workerId} value={selected.workerId} source={selected.fieldSources.workerId} />
                  <ProfileField label={FIELD_LABELS_AR.paperNumber} value={selected.paperNumber} source={selected.fieldSources.paperNumber} />
                  <ProfileField label={FIELD_LABELS_AR.name} value={selected.name} source={selected.fieldSources.name} />
                  <ProfileField label={FIELD_LABELS_AR.email} value={selected.email} source={selected.fieldSources.email} />
                  <ProfileField
                    label={FIELD_LABELS_AR.phoneNumbers}
                    value={selected.phoneNumbers?.join(' / ')}
                    source={selected.fieldSources.phoneNumbers}
                  />
                  <ProfileField label={FIELD_LABELS_AR.city} value={selected.city} source={selected.fieldSources.city} />
                  <ProfileField label={FIELD_LABELS_AR.company} value={selected.company} source={selected.fieldSources.company} />
                  <ProfileField label={FIELD_LABELS_AR.jobTitle} value={selected.jobTitle} source={selected.fieldSources.jobTitle} />
                  <ProfileField
                    label={FIELD_LABELS_AR.joiningDate}
                    value={selected.joiningDate}
                    source={selected.fieldSources.joiningDate}
                  />
                  <ProfileField
                    label={FIELD_LABELS_AR.currentStatus}
                    value={selected.currentStatus}
                    source={selected.fieldSources.currentStatus}
                  />
                  <ProfileField
                    label={FIELD_LABELS_AR.supervisorCode}
                    value={selected.supervisorCode}
                    source={selected.fieldSources.supervisorCode}
                  />
                  <ProfileField
                    label={FIELD_LABELS_AR.supervisorName}
                    value={selected.supervisorName}
                    source={selected.fieldSources.supervisorName}
                  />
                  <ProfileField
                    label={FIELD_LABELS_AR.contractType}
                    value={selected.contractType}
                    source={selected.fieldSources.contractType}
                  />
                  <ProfileField
                    label={FIELD_LABELS_AR.contractEndDate}
                    value={selected.contractEndDate}
                    source={selected.fieldSources.contractEndDate}
                  />
                </div>

                {/* Starting Points — empty = suspended (Rooster Overview behaviour) */}
                <div className="rounded-lg border border-[rgba(255,255,255,0.1)] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-[#EAF0FF] font-medium">
                      Starting Points <SourceTag source="rooster" />
                    </p>
                    {selected.hasStartingPoints ? (
                      <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] px-2.5 py-1">
                        نشط — لديه Starting Points
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-500/20 text-rose-300 text-[11px] px-2.5 py-1">
                        موقوف — لا يوجد Starting Points
                      </span>
                    )}
                  </div>
                  {selected.startingPoints && selected.startingPoints.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.startingPoints.map((sp) => (
                        <span
                          key={sp.id}
                          className="rounded-md bg-[rgba(168,85,247,0.2)] text-[color:var(--v2-accent-purple)] text-xs px-2.5 py-1"
                        >
                          {sp.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[rgba(234,240,255,0.55)]">
                      الخانة فارغة في روستر — المندوب موقوف تشغيليًا.
                    </p>
                  )}
                </div>

                {/* Rider Documents */}
                <div className="rounded-lg border border-[rgba(255,255,255,0.1)] p-4 space-y-3">
                  <p className="text-sm text-[#EAF0FF] font-medium">
                    مستندات المندوب (Rider Documents) <SourceTag source="rooster" />
                  </p>
                  {selected.documents && selected.documents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-[#EAF0FF]">
                        <thead>
                          <tr className="text-[rgba(234,240,255,0.55)] text-right">
                            <th className="py-1 pe-3">النوع</th>
                            <th className="py-1 pe-3">التاريخ</th>
                            <th className="py-1 pe-3">المصدر</th>
                            <th className="py-1 pe-3">عرض</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.documents.map((doc) => (
                            <tr key={doc.fieldName + doc.fileKey} className="border-t border-[rgba(255,255,255,0.06)]">
                              <td className="py-1.5 pe-3">
                                {doc.label}
                                {doc.underReview ? (
                                  <span className="ms-2 text-[10px] text-amber-300">قيد المراجعة</span>
                                ) : (
                                  <span className="ms-2 text-[10px] text-emerald-300">IN USE</span>
                                )}
                              </td>
                              <td className="py-1.5 pe-3">
                                {doc.createdAt ? new Date(doc.createdAt).toLocaleString('ar-EG') : '—'}
                              </td>
                              <td className="py-1.5 pe-3">{doc.source || '—'}</td>
                              <td className="py-1.5 pe-3">
                                {doc.viewUrl ? (
                                  <a
                                    href={doc.viewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[color:var(--v2-accent-cyan)] hover:underline"
                                  >
                                    فتح
                                  </a>
                                ) : (
                                  <span className="text-[rgba(234,240,255,0.4)]">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-[rgba(234,240,255,0.55)]">لا توجد مستندات متاحة لهذا المندوب.</p>
                  )}
                </div>

                {selected.contracts && selected.contracts.length > 0 && (
                  <div>
                    <p className="text-sm text-[#EAF0FF] font-medium mb-2">
                      سجل العقود <SourceTag source="rooster" />
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-[#EAF0FF]">
                        <thead>
                          <tr className="text-[rgba(234,240,255,0.55)] text-right">
                            <th className="py-1 pe-3">الشركة</th>
                            <th className="py-1 pe-3">الوظيفة</th>
                            <th className="py-1 pe-3">المدينة</th>
                            <th className="py-1 pe-3">البداية</th>
                            <th className="py-1 pe-3">النهاية</th>
                            <th className="py-1 pe-3">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.contracts.map((c) => (
                            <tr key={c.id} className="border-t border-[rgba(255,255,255,0.06)]">
                              <td className="py-1 pe-3">{c.contract?.company_name || '—'}</td>
                              <td className="py-1 pe-3">{c.job_title || '—'}</td>
                              <td className="py-1 pe-3">{c.city_name || '—'}</td>
                              <td className="py-1 pe-3">{c.start_at?.slice(0, 10) || '—'}</td>
                              <td className="py-1 pe-3">{c.end_at?.slice(0, 10) || '—'}</td>
                              <td className="py-1 pe-3">{c.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selected.additionalRoosterFields && Object.keys(selected.additionalRoosterFields).length > 0 && (
                  <div>
                    <p className="text-sm text-[#EAF0FF] font-medium mb-2">
                      بيانات إضافية من Rooster <SourceTag source="rooster" />
                    </p>
                    <pre className="text-[11px] text-[rgba(234,240,255,0.7)] bg-[rgba(0,0,0,0.25)] rounded-lg p-3 overflow-x-auto">
                      {JSON.stringify(selected.additionalRoosterFields, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
