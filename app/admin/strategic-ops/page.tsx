'use client';

import { authFetch } from '@/lib/authFetch';
import { useMemo, useState, type ReactNode } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { ZONE_OPTIONS } from '@/lib/zones';
import { STRATEGIC_OPS_LABELS as L } from '@/lib/strategicOps/labelsAr';
import { GHOST_CATEGORY_LABELS_AR } from '@/lib/strategicOps/ghostRiderAudit';
import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import type { KpiRootCause, ManagementAction } from '@/lib/strategicOps/controlTower/types';
import { formatKpiTrendSummary } from '@/lib/strategicOps/controlTower/kpiRootCause';
import {
  exportStrategicOpsExcel,
  exportStrategicOpsPdf,
  copyStrategicOpsText } from '@/lib/strategicOps/clientExport';
import SupervisorScorecardsSection from '@/components/strategicOps/SupervisorScorecardsSection';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis } from 'recharts';

const BUCKET_COLORS = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#EAF0FF]">{value}</p>
      {sub && <p className="text-xs text-[#64748B] mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-4">
      <h2 className="text-lg font-semibold text-[#EAF0FF] border-b border-white/10 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function roundPct(n: number): number {
  return Math.round(n * 10000) / 100;
}

function RiskBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    yellow: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    red: 'bg-red-500/20 text-red-300 border-red-500/40' };
  const labels = { green: 'منخفض', yellow: 'متوسط', red: 'مرتفع' };
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[level]}`}>{labels[level]}</span>;
}

function HealthBadge({ score, label }: { score: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border border-cyan-500/40 bg-cyan-500/15 text-cyan-200">
      <span className="font-bold">{score}/100</span>
      <span>{label}</span>
    </span>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-[#CBD5E1]">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h) => (
              <th key={h} className="text-right py-2 px-2 font-medium text-[#94A3B8] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2 text-right">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionPriorityBadge({ priority }: { priority: ManagementAction['priority'] }) {
  const styles = {
    critical: 'bg-red-500/25 text-red-200 border-red-500/50',
    high: 'bg-orange-500/25 text-orange-200 border-orange-500/50',
    medium: 'bg-amber-500/25 text-amber-200 border-amber-500/50',
    low: 'bg-slate-500/25 text-slate-200 border-slate-500/50',
  };
  const labels = {
    critical: L.priorityCritical,
    high: L.priorityHigh,
    medium: L.priorityMedium,
    low: L.priorityLow,
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
}

function ImpactBadge({ level }: { level: 'critical' | 'high' | 'medium' | 'low' }) {
  const colors = {
    critical: 'text-red-300 border-red-500/40 bg-red-500/15',
    high: 'text-orange-300 border-orange-500/40 bg-orange-500/15',
    medium: 'text-amber-300 border-amber-500/40 bg-amber-500/15',
    low: 'text-slate-300 border-slate-500/40 bg-slate-500/15',
  };
  const labels = {
    critical: L.priorityCritical,
    high: L.priorityHigh,
    medium: L.priorityMedium,
    low: L.priorityLow,
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[level]}`}>{labels[level]}</span>
  );
}

function ReliabilityBadge({
  score,
  classification,
  label,
}: {
  score: number;
  classification: 'excellent' | 'good' | 'warning' | 'unreliable';
  label: string;
}) {
  const colors = {
    excellent: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    good: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200',
    warning: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    unreliable: 'border-red-500/40 bg-red-500/15 text-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border ${colors[classification]}`}>
      <span className="font-bold">{score}/100</span>
      <span>{label}</span>
    </span>
  );
}

function TalabatKpiCard({
  label,
  value,
  sub,
  trace,
  rootCause,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trace?: StrategicOpsReport['talabatOperations']['auditTraces'][number];
  rootCause?: KpiRootCause;
}) {
  const [open, setOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#EAF0FF]">{value}</p>
      {sub && <p className="text-xs text-[#64748B] mt-1">{sub}</p>}
      {rootCause && (
        <>
          <button
            type="button"
            onClick={() => setWhyOpen((o) => !o)}
            className="text-xs text-emerald-300/90 mt-2 me-3 hover:underline"
          >
            {whyOpen ? `إخفاء ${L.kpiWhy}` : L.kpiWhy}
          </button>
          {whyOpen && (
            <div className="mt-2 text-xs text-[#94A3B8] space-y-2 border-t border-white/10 pt-2">
              <p className="text-[#CBD5E1]">{rootCause.summaryAr}</p>
              <p className="text-[#64748B]">{L.trendLabel}: {formatKpiTrendSummary(rootCause.trend)}</p>
              {rootCause.factors.length > 0 && (
                <div>
                  <p className="text-[#64748B] mb-1">{L.topFactors}:</p>
                  <ul className="space-y-0.5">
                    {rootCause.factors.map((f) => (
                      <li key={f.labelAr}>• {f.labelAr}: <strong>{f.value}</strong> — {f.impactAr}</li>
                    ))}
                  </ul>
                </div>
              )}
              {rootCause.topSupervisors.length > 0 && (
                <div>
                  <p className="text-[#64748B] mb-1">{L.topSupervisors}:</p>
                  <ul className="space-y-0.5">
                    {rootCause.topSupervisors.slice(0, 3).map((s) => (
                      <li key={s.code}>• {s.name}: {s.contribution} {s.unit}</li>
                    ))}
                  </ul>
                </div>
              )}
              {rootCause.topCities.length > 0 && (
                <div>
                  <p className="text-[#64748B] mb-1">{L.topCities}:</p>
                  <ul className="space-y-0.5">
                    {rootCause.topCities.slice(0, 3).map((c) => (
                      <li key={c.zone}>• {c.zone}: {c.contribution} {c.unit}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {trace && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-cyan-300/90 mt-2 hover:underline"
          >
            {open ? 'إخفاء التدقيق' : 'عرض التدقيق'}
          </button>
          {open && (
            <div className="mt-2 text-xs text-[#94A3B8] space-y-1 border-t border-white/10 pt-2">
              <p><span className="text-[#64748B]">المعادلة:</span> {trace.formula}</p>
              <p><span className="text-[#64748B]">البسط:</span> {trace.numerator} ({trace.numeratorLabel})</p>
              <p><span className="text-[#64748B]">المقام:</span> {trace.denominator} ({trace.denominatorLabel})</p>
              <p><span className="text-[#64748B]">المصدر:</span> {trace.rawDataSource}</p>
              <p><span className="text-[#64748B]">النتيجة:</span> {trace.result}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StrategicOpsCenterPage() {
  const notify = usePageNotify();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const defaultStart = monthAgo.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [zone, setZone] = useState('all');
  const [supervisorCode, setSupervisorCode] = useState('all');
  const [requestFilters, setRequestFilters] = useState<{
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
    talabatActive?: string;
    talabatNoShow?: string;
    talabatHours?: string;
    talabatAchievement?: string;
  } | null>(null);
  const [dashboardMode, setDashboardMode] = useState<'talabat_ops' | 'strategic_full'>('talabat_ops');
  const [showStrategicSections, setShowStrategicSections] = useState(false);
  const [talabatActive, setTalabatActive] = useState('');
  const [talabatNoShow, setTalabatNoShow] = useState('');
  const [talabatHours, setTalabatHours] = useState('');
  const [talabatAchievement, setTalabatAchievement] = useState('');

  const { data: supervisorsList } = useQuery({
    queryKey: ['admin', 'supervisors-list'],
    queryFn: async () => {
      const res = await authFetch('/api/admin/supervisors');
      const json = await res.json();
      if (!json.success) return [];
      return (json.data ?? []) as Array<{ code: string; name: string; region: string }>;
    },
    staleTime: 5 * 60 * 1000 });

  const { data: report, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin', 'strategic-ops', requestFilters],
    queryFn: async () => {
      const q = new URLSearchParams({
        startDate: requestFilters!.startDate,
        endDate: requestFilters!.endDate,
        zone: requestFilters!.zone,
        supervisorCode: requestFilters!.supervisorCode });
      if (requestFilters!.talabatActive) q.set('talabatActive', requestFilters!.talabatActive);
      if (requestFilters!.talabatNoShow) q.set('talabatNoShow', requestFilters!.talabatNoShow);
      if (requestFilters!.talabatHours) q.set('talabatHours', requestFilters!.talabatHours);
      if (requestFilters!.talabatAchievement) q.set('talabatAchievement', requestFilters!.talabatAchievement);
      const res = await authFetch(`/api/admin/strategic-ops?${q}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل التقرير');
      return json.data as StrategicOpsReport;
    },
    enabled: !!requestFilters,
    staleTime: 2 * 60 * 1000 });

  const supervisorsFiltered = useMemo(() => {
    if (!supervisorsList) return [];
    if (zone === 'all') return supervisorsList;
    return supervisorsList.filter((s) =>
      String(s.region ?? '').split(/[|,]/).map((z) => z.trim()).includes(zone)
    );
  }, [supervisorsList, zone]);

  const kpiRootCauseMap = useMemo(() => {
    if (!report?.controlTower) return new Map<string, KpiRootCause>();
    return new Map(report.controlTower.kpiRootCauses.map((r) => [r.kpiKey, r]));
  }, [report?.controlTower]);

  const runAnalysis = () => {
    if (!startDate || !endDate) {
      notify.error('يرجى اختيار نطاق التاريخ');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      notify.error('تاريخ البداية يجب أن يكون قبل النهاية');
      return;
    }
    setRequestFilters({
      startDate,
      endDate,
      zone,
      supervisorCode,
      talabatActive: talabatActive.trim() || undefined,
      talabatNoShow: talabatNoShow.trim() || undefined,
      talabatHours: talabatHours.trim() || undefined,
      talabatAchievement: talabatAchievement.trim() || undefined });
  };

  const loading = isLoading || isFetching;

  const handleCopy = async () => {
    if (!report) return;
    try {
      await copyStrategicOpsText(report);
      notify.success('تم نسخ التحليل الكامل للحافظة');
    } catch {
      notify.error('فشل النسخ — تحقق من صلاحيات الحافظة');
    }
  };

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">{L.pageTitle}</h1>
          <p className="text-sm text-[#94A3B8]">{L.pageSubtitle}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.startDate}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.endDate}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.zone}</label>
            <select value={zone} onChange={(e) => { setZone(e.target.value); setSupervisorCode('all'); }} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm">
              <option value="all">{L.allZones}</option>
              {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.supervisor}</label>
            <select value={supervisorCode} onChange={(e) => setSupervisorCode(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm">
              <option value="all">{L.allSupervisors}</option>
              {supervisorsFiltered.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={runAnalysis} disabled={loading} className="w-full rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold py-2.5 text-sm disabled:opacity-50">
              {loading ? L.analyzing : L.runAnalysis}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">{(error as Error).message}</div>
        )}

        {!requestFilters && !loading && (
          <div className="text-center py-16 text-[#64748B]">{L.selectFilters}</div>
        )}

        {report && (
          <>
            {report.kpiTrust.level > 1 && (
              <div
                className={`rounded-2xl border p-4 text-sm font-medium ${
                  report.kpiTrust.level >= 4
                    ? 'border-red-500/50 bg-red-500/15 text-red-100'
                    : report.kpiTrust.level === 3
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                      : 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                }`}
              >
                {report.kpiTrust.labelAr}: {report.kpiTrust.descriptionAr}
                <span className="block text-xs mt-1 font-normal opacity-90">
                  جودة البيانات: {report.kpiTrust.dataQualityScore}/100 — تسرب Ghost: {report.kpiTrust.ghostLeakagePercent}%
                  {report.kpiTrust.disableStiOrpsGrowthRoadmap && ' — STI/ORPS/النمو/الخارطة معطّلة'}
                  {report.kpiTrust.lowConfidenceStrategic && !report.kpiTrust.disableStiOrpsGrowthRoadmap && ' — مؤشرات استراتيجية بثقة منخفضة'}
                </span>
              </div>
            )}

            {/* درجة صحة التشغيل — معطّلة عند تغطية < 80% */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[#94A3B8]">{L.operationalHealth}</p>
                {report.operationalHealth.disabled ? (
                  <p className="text-2xl font-bold text-amber-300 mt-1">{L.insufficientData}</p>
                ) : (
                  <p className="text-4xl font-bold text-[#EAF0FF] mt-1">{report.operationalHealth.score}<span className="text-lg text-[#64748B]">/100</span></p>
                )}
              </div>
              <div className="text-right">
                {report.operationalHealth.disabled ? (
                  <span className="text-sm text-amber-300/90">{report.operationalHealth.disabledReason}</span>
                ) : (
                  <HealthBadge score={report.operationalHealth.score} label={report.operationalHealth.levelLabelAr} />
                )}
              </div>
            </div>

            {report.controlTower && (
              <>
                <Section title={L.reliabilityTitle}>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <ReliabilityBadge
                      score={report.controlTower.reliability.overallScore}
                      classification={report.controlTower.reliability.classification}
                      label={report.controlTower.reliability.classificationLabelAr}
                    />
                    <span className="text-xs text-[#64748B]">
                      {L.overallReadiness}: {report.controlTower.overallReadinessPercent}%
                      {report.controlTower.disabled ? ' — insights gated' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <StatCard
                      label={L.operationalCoverage}
                      value={`${report.controlTower.operationalCoveragePercent}%`}
                      sub={report.controlTower.insightsEnabled ? L.gateOpen : L.gateClosed}
                    />
                    <StatCard
                      label={L.metadataCoverage}
                      value={`${report.controlTower.metadataCoveragePercent}%`}
                      sub={report.controlTower.metadataCoveragePercent >= 80 ? L.gateOpen : L.gateClosed}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <StatCard label={L.coverageReliability} value={`${report.controlTower.reliability.coverageScore}/100`} sub={`${report.controlTower.operationalCoveragePercent}% ${L.operationalCoverage}`} />
                    <StatCard label={L.mappingHealth} value={`${report.controlTower.reliability.mappingHealthScore}/100`} sub={`${report.controlTower.mappingHealth.mappedCount} ${L.mappedRiders} · ${report.controlTower.mappingHealth.unmappedCount} ${L.unmappedRiders}`} />
                    <StatCard label={L.rootCauseConfidence} value={`${report.controlTower.reliability.rootCauseConfidenceScore}/100`} />
                    <StatCard label={L.actionReliability} value={`${report.controlTower.reliability.actionReliabilityScore}/100`} sub={`${L.rawRecovery}: ${report.controlTower.executiveFocusAudit.rawRecoveryHoursTotal} · ${L.dedupRecovery}: ${report.controlTower.executiveFocusAudit.deduplicatedRecoveryHoursTotal}`} />
                  </div>
                  {report.controlTower.disabled && (
                    <p className="text-sm text-amber-300/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-3">
                      {report.controlTower.disabledReasonAr ?? L.insightsDisabled}
                    </p>
                  )}
                  {report.controlTower.metadataLimitedReasonAr && (
                    <p className="text-sm text-cyan-200/90 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                      {report.controlTower.metadataLimitedReasonAr}
                    </p>
                  )}
                </Section>

                {report.controlTower.insightsEnabled && (
                <Section title={L.executiveFocus}>
                  <p className="text-sm text-[#94A3B8] mb-4">{L.controlTowerSubtitle}</p>
                  {report.controlTower.executiveFocus.length === 0 ? (
                    <p className="text-sm text-emerald-300/90">لا توجد إجراءات حرجة — الأداء ضمن النطاق المقبول.</p>
                  ) : (
                    <div className="space-y-3">
                      {report.controlTower.executiveFocus.map((action, idx) => (
                        <div
                          key={action.id}
                          className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col sm:flex-row sm:items-start gap-3"
                        >
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-lg font-bold text-[#EAF0FF] w-6">{idx + 1}</span>
                            <ActionPriorityBadge priority={action.priority} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[#EAF0FF]">
                              {action.entityType === 'supervisor' && '🔴 '}
                              {action.entityName}
                            </p>
                            <p className="text-sm text-[#94A3B8] mt-1">{action.problemAr}</p>
                            <p className="text-sm text-emerald-300/90 mt-2">
                              <span className="text-[#64748B]">{L.potentialRecovery}: </span>
                              +{action.deduplicatedRecoveryHours} {L.recoveryPerDay}
                            </p>
                            <p className="text-sm text-cyan-200/90 mt-1">
                              <span className="text-[#64748B]">{L.recommendedAction}: </span>
                              {action.actionAr}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
                )}

                {report.controlTower.insightsEnabled && report.controlTower.supervisorScorecards && (
                  <SupervisorScorecardsSection scorecards={report.controlTower.supervisorScorecards} />
                )}

                <Section title={L.achievementDecomposition}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <StatCard label="التحقيق %" value={`${report.controlTower.achievementDecomposition.achievementPercent}%`} />
                    <StatCard label={L.gapHours} value={report.controlTower.achievementDecomposition.gapHoursDaily} />
                    <StatCard label={L.gapRiders} value={report.controlTower.achievementDecomposition.gapRidersDaily} />
                    <StatCard label={L.gapShifts} value={report.controlTower.achievementDecomposition.gapShiftsTotal} />
                  </div>
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-[#94A3B8] mb-2">Top 10 — {L.topSupervisors} (فقدان الهدف)</h3>
                      <MiniTable
                        headers={[L.supervisorLabel, 'س/يوم مفقودة']}
                        rows={report.controlTower.achievementDecomposition.topSupervisorsByLoss.map((s) => [
                          s.name,
                          s.lostTargetHoursDaily,
                        ])}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[#94A3B8] mb-2">Top 10 — {L.riderLabel} (فقدان الساعات)</h3>
                      <MiniTable
                        headers={[L.riderLabel, L.lostHoursCol]}
                        rows={report.controlTower.achievementDecomposition.topRidersByLoss.map((r) => [
                          r.name,
                          r.lostHoursDaily,
                        ])}
                      />
                    </div>
                  </div>
                </Section>

                {report.controlTower.insightsEnabled && (
                <Section title={L.topNegativeRiders}>
                  <MiniTable
                    headers={[L.riderLabel, L.supervisorLabel, L.expectedHoursCol, L.actualHoursCol, L.lostHoursCol, L.noShowCol, L.impactCol]}
                    rows={report.controlTower.topNegativeImpactRiders.map((r) => [
                      `${r.name} (${r.code})`,
                      r.supervisorName,
                      r.expectedHoursDaily,
                      r.actualHoursDaily,
                      r.lostHoursDaily,
                      r.noShowCount,
                      <ImpactBadge key={r.code} level={r.impactLevel} />,
                    ])}
                  />
                </Section>
                )}
              </>
            )}

            <Section title={L.talabatOperations}>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setDashboardMode('talabat_ops')}
                  className={`rounded-lg px-3 py-1.5 text-sm border ${dashboardMode === 'talabat_ops' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-white/10 text-[#94A3B8]'}`}
                >
                  Talabat Operations
                </button>
                <button
                  type="button"
                  onClick={() => { setDashboardMode('strategic_full'); setShowStrategicSections(true); }}
                  className={`rounded-lg px-3 py-1.5 text-sm border ${dashboardMode === 'strategic_full' ? 'border-purple-500 bg-purple-500/20 text-purple-200' : 'border-white/10 text-[#94A3B8]'}`}
                >
                  {L.showStrategicAnalysis}
                </button>
                <span className="text-xs text-[#64748B] self-center">
                  تغطية البيانات: {report.sourceDataCoverage.coverage}%
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TalabatKpiCard label={L.headcount} value={report.talabatOperations.headcount} trace={report.talabatOperations.auditTraces[0]} rootCause={kpiRootCauseMap.get('headcount')} />
                <TalabatKpiCard label={L.activeRiders} value={report.talabatOperations.activeRiders} sub={`تشخيص فريد: ${report.talabatOperations.uniqueActiveRidersInPeriod}`} trace={report.talabatOperations.auditTraces[1]} rootCause={kpiRootCauseMap.get('activeRiders')} />
                <TalabatKpiCard label={L.noShowRiders} value={report.talabatOperations.noShowRiders} trace={report.talabatOperations.auditTraces[2]} rootCause={kpiRootCauseMap.get('noShowRiders')} />
                <TalabatKpiCard label={L.actualHours} value={report.talabatOperations.actualHours} sub="متوسط يومي" trace={report.talabatOperations.auditTraces[3]} rootCause={kpiRootCauseMap.get('actualHours')} />
                <TalabatKpiCard label={L.targetHours} value={report.talabatOperations.targetHours} sub="متوسط يومي" trace={report.talabatOperations.auditTraces[4]} rootCause={kpiRootCauseMap.get('targetHours')} />
                <TalabatKpiCard label={L.achievementPercent} value={`${report.talabatOperations.achievementPercent}%`} trace={report.talabatOperations.auditTraces[5]} rootCause={kpiRootCauseMap.get('achievementPercent')} />
                <TalabatKpiCard label={L.avgHoursPerActiveRider} value={report.talabatOperations.avgHoursPerActiveRider} trace={report.talabatOperations.auditTraces[6]} />
                <TalabatKpiCard label={L.utilizationRate} value={`${report.talabatOperations.utilizationPercent}%`} trace={report.talabatOperations.auditTraces[7]} rootCause={kpiRootCauseMap.get('utilizationPercent')} />
              </div>
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-200/90 mb-3">{L.noShowComparison}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label={L.dashboardNoShow} value={report.talabatOperations.noShowComparison.dashboardNoShow} sub="متوسط يومي" />
                  <StatCard
                    label={L.talabatNoShow}
                    value={report.talabatOperations.noShowComparison.talabatNoShow ?? '—'}
                    sub={report.talabatOperations.noShowComparison.talabatNoShow === null ? 'أدخل قيمة Talabat' : 'متوسط يومي'}
                  />
                  <StatCard
                    label={L.deviationPercent}
                    value={
                      report.talabatOperations.noShowComparison.deviationPercent !== null
                        ? `${report.talabatOperations.noShowComparison.deviationPercent}%`
                        : '—'
                    }
                    sub={
                      report.talabatOperations.noShowComparison.withinTolerance === null
                        ? undefined
                        : report.talabatOperations.noShowComparison.withinTolerance
                          ? 'ضمن 2%'
                          : 'خارج 2%'
                    }
                  />
                  <StatCard
                    label="تطابق %"
                    value={
                      report.talabatOperations.noShowComparison.matchPercent !== null
                        ? `${report.talabatOperations.noShowComparison.matchPercent}%`
                        : '—'
                    }
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-2">
                  يُحسب No Show فقط للطيارين المجدولين (صف يومي في البيانات) الذين لم يعملوا (ساعات=٠ وطلبات=٠). المعيّنون بلا صف يومي لا يُحسبون.
                </p>
              </div>
            </Section>

            <Section title={L.talabatAccuracyScore}>
              <p className="text-xs text-[#94A3B8] mb-3">{L.talabatBenchmark} — أدخل قيم تقرير Talabat للمقارنة (اختياري)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-xs text-[#64748B]">{L.activeRiders}</label>
                  <input type="number" value={talabatActive} onChange={(e) => setTalabatActive(e.target.value)} className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-[#EAF0FF]" />
                </div>
                <div>
                  <label className="text-xs text-[#64748B]">{L.noShowRiders}</label>
                  <input type="number" value={talabatNoShow} onChange={(e) => setTalabatNoShow(e.target.value)} className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-[#EAF0FF]" />
                </div>
                <div>
                  <label className="text-xs text-[#64748B]">{L.actualHours}</label>
                  <input type="number" value={talabatHours} onChange={(e) => setTalabatHours(e.target.value)} className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-[#EAF0FF]" />
                </div>
                <div>
                  <label className="text-xs text-[#64748B]">{L.achievementPercent}</label>
                  <input type="number" value={talabatAchievement} onChange={(e) => setTalabatAchievement(e.target.value)} className="w-full mt-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-[#EAF0FF]" />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <StatCard
                  label={L.overallAccuracy}
                  value={report.talabatAccuracyScore.overallAccuracyPercent !== null ? `${report.talabatAccuracyScore.overallAccuracyPercent}%` : '—'}
                  sub={report.talabatAccuracyScore.providedBenchmarkCount > 0 ? `${report.talabatAccuracyScore.providedBenchmarkCount} KPIs` : 'أدخل قيم Talabat'}
                />
                <StatCard
                  label="ضمن 2%"
                  value={report.talabatAccuracyScore.allWithinTolerance === null ? '—' : report.talabatAccuracyScore.allWithinTolerance ? 'نعم' : 'لا'}
                />
                <StatCard
                  label="هدف 95%+"
                  value={report.talabatAccuracyScore.goalMet === null ? '—' : report.talabatAccuracyScore.goalMet ? 'متحقق' : 'غير متحقق'}
                />
              </div>
              <MiniTable
                headers={['KPI', 'لوحة التحكم', 'Talabat', 'انحراف %', 'تطابق %']}
                rows={report.talabatAccuracyScore.matches.map((m) => [
                  m.kpiLabelAr,
                  m.dashboardValue,
                  m.talabatValue ?? '—',
                  m.deviationPercent !== null ? `${m.deviationPercent}%` : '—',
                  m.matchPercent !== null ? `${m.matchPercent}%` : '—',
                ])}
              />
            </Section>

            {(dashboardMode === 'strategic_full' || showStrategicSections) && (
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowStrategicSections((s) => !s)} className="text-sm text-[#94A3B8] hover:text-[#EAF0FF]">
                  {showStrategicSections ? L.hideStrategicAnalysis : L.showStrategicAnalysis}
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => exportStrategicOpsExcel(report)} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/10">{L.exportExcel}</button>
              <button type="button" onClick={() => exportStrategicOpsPdf(report)} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/10">{L.exportPdf}</button>
              <button type="button" onClick={handleCopy} className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm text-purple-200 hover:bg-purple-500/25">{L.copyChatGpt}</button>
            </div>

            <Section title={L.supervisorPerformance}>
              <MiniTable
                headers={['المشرف', 'Headcount', 'نشطون يومياً', 'No Show', 'ساعات/يوم', 'س/طيار', 'تحقيق%', 'استغلال%']}
                rows={report.supervisorPerformance.rows.map((s) => [
                  s.name,
                  s.headcount,
                  s.activeRiders,
                  s.noShowRiders,
                  s.dailyHours,
                  s.avgHoursPerRiderDaily,
                  `${s.achievementPercent}%`,
                  `${s.utilizationPercent}%`,
                ])}
              />
            </Section>

            {(showStrategicSections || dashboardMode === 'strategic_full') && (
            <>
            <Section title={L.dataIntegrityReport}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="درجة جودة البيانات" value={`${report.dataIntegrity.dataQualityScore}/100`} />
                <StatCard label="صفوف معالجة" value={report.dataIntegrity.totalRows} />
                <StatCard label="صفوف صالحة للمؤشرات" value={report.dataIntegrity.validRows} />
                <StatCard label="تكرارات محذوفة" value={report.dataIntegrity.duplicateRows} />
                <StatCard label="اكتمال الأيام" value={`${report.dataIntegrity.completenessPercentage}%`} sub={`${report.dataIntegrity.validDaysInDataset}/${report.meta.periodDays} يوم`} />
                <StatCard label="أيام ناقصة" value={report.dataIntegrity.missingDates.length} />
                <StatCard label="Ghost Riders" value={report.dataIntegrity.missingRiders} sub={`${report.dataIntegrity.ghostRiderRowCount} صف`} />
                <StatCard label="غير معيّنين" value={report.dataIntegrity.unassignedRiderCount} />
              </div>
              {report.dataIntegrity.missingDates.length > 0 && (
                <p className="text-xs text-amber-300/90 mb-3">
                  أيام بدون بيانات: {report.dataIntegrity.missingDates.slice(0, 15).join('، ')}
                  {report.dataIntegrity.missingDates.length > 15 ? ` … (+${report.dataIntegrity.missingDates.length - 15})` : ''}
                </p>
              )}
              {report.dataIntegrity.ghostRiders.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">Ghost Riders — عينة (صفوف يومية)</h3>
                  <MiniTable
                    headers={['الكود', 'التاريخ', 'صف الشيت', 'ساعات']}
                    rows={report.dataIntegrity.ghostRiders.slice(0, 20).map((g) => [g.riderCode, g.date, g.sheetRow, g.hours])}
                  />
                  <p className="text-xs text-[#64748B] mt-2">للقائمة الكاملة والتصنيف — انظر قسم تدقيق Ghost Riders أدناه</p>
                </>
              )}
              {report.dataIntegrity.unassignedRiders.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-[#94A3B8] mt-4 mb-2">طيارون بدون مشرف</h3>
                  <MiniTable
                    headers={['الكود', 'الاسم']}
                    rows={report.dataIntegrity.unassignedRiders.slice(0, 20).map((u) => [u.riderCode, u.name])}
                  />
                </>
              )}
              <p className="text-xs text-[#64748B] mt-3">
                مسار المعالجة: {report.codeNormalizationAudit.pipelinePath}
              </p>
            </Section>

            <Section title={L.ghostRiderAudit}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="إجمالي Ghost" value={report.ghostRiderAudit.totalGhostRiders} sub={`${report.ghostRiderAudit.ratioGhostToRegisteredPercent}% من المسجلين`} />
                <StatCard label="مستبعدون بالفلتر" value={report.ghostRiderAudit.totalScopeExcludedRiders} />
                <StatCard label="إجمالي الشذوذ" value={report.ghostRiderAudit.totalAnomalies} />
                <StatCard label="تسرب Ghost" value={`${report.ghostRiderAudit.ghostLeakagePercent}%`} />
              </div>
              <h3 className="text-sm font-medium text-[#94A3B8] mb-2">ملخص السبب الجذري</h3>
              <div className="grid sm:grid-cols-5 gap-2 mb-4 text-xs">
                <div className="rounded-lg border border-white/10 p-2">A عدم تطابق: {report.ghostRiderAudit.rootCauseSummary.codeMismatchPercent}%</div>
                <div className="rounded-lg border border-white/10 p-2">B غائب من المناديب: {report.ghostRiderAudit.rootCauseSummary.missingMasterPercent}%</div>
                <div className="rounded-lg border border-white/10 p-2">C فشل تطبيع: {report.ghostRiderAudit.rootCauseSummary.normalizationFailedPercent}%</div>
                <div className="rounded-lg border border-white/10 p-2">D فلتر زون: {report.ghostRiderAudit.rootCauseSummary.zoneFilteringPercent}%</div>
                <div className="rounded-lg border border-white/10 p-2">E ربط مشرف: {report.ghostRiderAudit.rootCauseSummary.supervisorMappingPercent}%</div>
              </div>
              <MiniTable
                headers={['الكود', 'الاسم', 'المشرف', 'ساعات', 'طلبات', 'التصنيف', 'السبب']}
                rows={report.ghostRiderAudit.riders.slice(0, 50).map((g) => [
                  g.rawRiderCode,
                  g.riderName,
                  g.supervisorName,
                  g.totalHours,
                  g.totalOrders,
                  GHOST_CATEGORY_LABELS_AR[g.category],
                  g.reasonAr,
                ])}
              />
              {report.ghostRiderAudit.riders.length > 50 && (
                <p className="text-xs text-[#64748B] mt-2">يعرض ٥٠ من {report.ghostRiderAudit.riders.length} — صدّر Excel للقائمة الكاملة</p>
              )}
            </Section>

            <Section title={L.metadataCompletionAudit}>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <StatCard label={L.operationalCoverage} value={`${report.sourceDataCoverage.operationalCoveragePercent}%`} sub={report.sourceDataCoverage.operationalAnalyticsEnabled ? L.gateOpen : L.gateClosed} />
                <StatCard label={L.metadataCoverage} value={`${report.sourceDataCoverage.metadataCoveragePercent}%`} sub={report.sourceDataCoverage.metadataAnalyticsEnabled ? L.gateOpen : L.gateClosed} />
                <StatCard label={L.overallReadiness} value={`${report.sourceDataCoverage.overallReadinessPercent}%`} />
                <StatCard label="بدون Join Date" value={report.metadataCompletionAudit.ridersMissingJoinDate} />
                <StatCard label={L.ridersMissingContract} value={report.metadataCompletionAudit.ridersMissingContractType} />
              </div>
              <MiniTable
                headers={['المشرف', 'الإجمالي', 'Join Date', 'Contract Type', 'Contract End', 'الاكتمال %']}
                rows={report.metadataCompletionAudit.bySupervisor.slice(0, 25).map((s) => [
                  s.supervisorName || s.supervisorCode || '—',
                  s.totalRiders,
                  s.ridersMissingJoinDate,
                  s.ridersMissingContractType,
                  s.ridersMissingContractEndDate,
                  `${s.metadataCompletionPercent}%`,
                ])}
              />
            </Section>

            <Section title={L.joinDateAudit}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="تغطية تاريخ الانضمام" value={`${report.joinDateAudit.joinDateCoveragePercent}%`} />
                <StatCard label="بتاريخ صالح" value={report.joinDateAudit.ridersWithValidJoinDate} />
                <StatCard label="بدون تاريخ" value={report.joinDateAudit.ridersWithoutJoinDate} />
                <StatCard
                  label="KPI عمر الطيار"
                  value={report.joinDateAudit.riderLifetimeKpiEnabled ? 'مفعّل' : 'معطّل'}
                  sub={report.joinDateAudit.riderLifetimeDisabledReason}
                />
              </div>
              {report.joinDateAudit.ridersMissingJoinDate.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">طيارون بدون تاريخ انضمام</h3>
                  <MiniTable
                    headers={['الكود', 'الاسم', 'المشرف']}
                    rows={report.joinDateAudit.ridersMissingJoinDate.slice(0, 30).map((r) => [r.riderCode, r.name, r.supervisorCode || '—'])}
                  />
                </>
              )}
            </Section>

            <Section title={L.postNormalizationValidation}>
              {(() => {
                const pn = report.postNormalizationValidation;
                return (
                  <>
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 mb-6">
                      <p className="text-sm font-semibold text-cyan-200">إثبات رقمي — Smart Rider Code Normalization Engine</p>
                      <p className="text-sm text-[#CBD5E1] mt-2">{pn.proofStatementAr}</p>
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">1 — Ghost Before Normalization</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <StatCard label="Ghost Riders Count" value={pn.ghostBefore.ridersCount} />
                      <StatCard label="Ghost Hours" value={pn.ghostBefore.hours} />
                      <StatCard label="Ghost Orders" value={pn.ghostBefore.orders} />
                      <StatCard label="Ghost %" value={`${pn.ghostBefore.percent}%`} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">2 — Ghost After Normalization</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <StatCard label="Ghost Riders Count" value={pn.ghostAfter.ridersCount} />
                      <StatCard label="Ghost Hours" value={pn.ghostAfter.hours} />
                      <StatCard label="Ghost Orders" value={pn.ghostAfter.orders} />
                      <StatCard label="Ghost %" value={`${pn.ghostAfter.percent}%`} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">3 — Recovery Analysis</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <StatCard label="Recovered Riders" value={pn.recovery.riders} />
                      <StatCard label="Recovered Hours" value={pn.recovery.hours} />
                      <StatCard label="Recovered Orders" value={pn.recovery.orders} />
                      <StatCard label="Improvement %" value={`${pn.recovery.improvementPercent}%`} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">4 — Root Cause Analysis (Riders Fixed)</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <StatCard label="Direct Match" value={pn.rootCauseFixes.directMatch} />
                      <StatCard label="Suffix Removal" value={pn.rootCauseFixes.suffixRemoval} />
                      <StatCard label="Numeric Extraction" value={pn.rootCauseFixes.numericExtraction} />
                      <StatCard label="Manual Review" value={pn.rootCauseFixes.manualReview} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">5 — Confidence Distribution</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <StatCard label="100%" value={`${pn.confidenceDistribution.pct100}%`} sub={`${pn.confidenceDistribution.counts.pct100} كود`} />
                      <StatCard label="95%" value={`${pn.confidenceDistribution.pct95}%`} sub={`${pn.confidenceDistribution.counts.pct95} كود`} />
                      <StatCard label="90%" value={`${pn.confidenceDistribution.pct90}%`} sub={`${pn.confidenceDistribution.counts.pct90} كود`} />
                      <StatCard label="<90%" value={`${pn.confidenceDistribution.below90}%`} sub={`${pn.confidenceDistribution.counts.below90} كود`} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">6 — Top 50 Recovered Riders</h3>
                    <MiniTable
                      headers={['Original Code', 'Normalized Code', 'Hours Recovered', 'Orders Recovered', 'Confidence']}
                      rows={pn.top50Recovered.map((r) => [
                        r.originalCode,
                        r.normalizedCode,
                        r.hoursRecovered,
                        r.ordersRecovered,
                        `${r.confidence}%`,
                      ])}
                    />

                    <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">7 — Remaining Ghost Riders ({pn.remainingGhosts.count})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <StatCard label="Not Found In Master" value={pn.remainingGhosts.byReason.not_found_in_master} />
                      <StatCard label="Low Confidence" value={pn.remainingGhosts.byReason.low_confidence} />
                      <StatCard label="Multiple Matches" value={pn.remainingGhosts.byReason.multiple_matches} />
                      <StatCard label="Invalid Code" value={pn.remainingGhosts.byReason.invalid_code} />
                    </div>
                    <MiniTable
                      headers={['Original', 'Legacy', 'Effective', 'Hours', 'Orders', 'Reason']}
                      rows={pn.remainingGhosts.riders.slice(0, 40).map((r) => [
                        r.originalCode,
                        r.legacyCode,
                        r.effectiveCode,
                        r.hours,
                        r.orders,
                        r.reasonAr,
                      ])}
                    />
                    {pn.remainingGhosts.riders.length > 40 && (
                      <p className="text-xs text-[#64748B] mt-2">
                        يعرض ٤٠ من {pn.remainingGhosts.riders.length} — صدّر Excel ورقة POST NORMALIZATION VALIDATION
                      </p>
                    )}

                    <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">8 — Executive Conclusion</h3>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
                      <p className="font-medium text-amber-200">السبب الرئيسي: {pn.executiveConclusion.primaryCauseAr}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <StatCard
                          label="Code Formatting Problem"
                          value={`${pn.executiveConclusion.codeFormattingProblemPercent}%`}
                          sub={`${pn.executiveConclusion.codeFormattingHours} ساعة مستردة`}
                        />
                        <StatCard
                          label="Missing Riders In Master Data"
                          value={`${pn.executiveConclusion.missingRidersInMasterPercent}%`}
                          sub={`${pn.executiveConclusion.missingInMasterHours} ساعة ما زالت Ghost`}
                        />
                      </div>
                      <p className="text-sm text-[#CBD5E1] mt-3">{pn.executiveConclusion.explanationAr}</p>
                    </div>

                    <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">9 — Trust Impact</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                      <div className="rounded-xl border border-slate-500/30 bg-slate-500/10 p-4">
                        <p className="text-xs uppercase tracking-wide text-[#94A3B8] mb-2">Before Normalization</p>
                        <StatCard label="Trust Level" value={pn.trustImpact.before.trustLevel} sub={pn.trustImpact.before.trustLabelAr} />
                        <div className="mt-3">
                          <StatCard
                            label="Executive Accuracy Score"
                            value={`${pn.trustImpact.before.executiveAccuracyScore}/100`}
                            sub={pn.trustImpact.before.executiveGradeAr}
                          />
                        </div>
                        <div className={`mt-3 rounded-lg border p-3 ${pn.trustImpact.before.canTrust ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
                          <p className="text-sm font-medium text-[#EAF0FF]">CAN MANAGEMENT TRUST THIS REPORT?</p>
                          <p className={`text-xl font-bold ${pn.trustImpact.before.canTrust ? 'text-emerald-300' : 'text-red-300'}`}>
                            {pn.trustImpact.before.canTrustAnswerAr}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                        <p className="text-xs uppercase tracking-wide text-emerald-200/80 mb-2">After Normalization</p>
                        <StatCard label="Trust Level" value={pn.trustImpact.after.trustLevel} sub={pn.trustImpact.after.trustLabelAr} />
                        <div className="mt-3">
                          <StatCard
                            label="Executive Accuracy Score"
                            value={`${pn.trustImpact.after.executiveAccuracyScore}/100`}
                            sub={pn.trustImpact.after.executiveGradeAr}
                          />
                        </div>
                        <div className={`mt-3 rounded-lg border p-3 ${pn.trustImpact.after.canTrust ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
                          <p className="text-sm font-medium text-[#EAF0FF]">CAN MANAGEMENT TRUST THIS REPORT?</p>
                          <p className={`text-xl font-bold ${pn.trustImpact.after.canTrust ? 'text-emerald-300' : 'text-red-300'}`}>
                            {pn.trustImpact.after.canTrustAnswerAr}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <StatCard label="Accuracy Score Δ" value={pn.trustImpact.accuracyScoreDelta} />
                      <StatCard label="Ghost Leakage Δ" value={`${pn.trustImpact.ghostLeakageDelta}%`} />
                      <StatCard
                        label="Trust Improved"
                        value={pn.trustImpact.trustLevelImproved ? 'نعم' : 'لا'}
                      />
                    </div>
                  </>
                );
              })()}
            </Section>

            <Section title={L.finalKpiAccuracyAudit}>
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 mb-4">
                <p className="text-lg font-bold text-[#EAF0FF]">Executive Accuracy Score</p>
                <p className="text-4xl font-bold text-purple-300 mt-1">
                  {!report.sourceDataCoverage.strategicKpisEnabled
                    ? L.insufficientData
                    : <>
                        {report.finalKpiAccuracyAudit.executiveAccuracyScore.score}
                        <span className="text-lg text-[#64748B]">/100</span>
                      </>}
                </p>
                <p className="text-sm text-purple-200/90 mt-1">{report.finalKpiAccuracyAudit.executiveAccuracyScore.gradeLabelAr}</p>
              </div>

              <div className={`rounded-xl border p-4 mb-6 ${report.finalKpiAccuracyAudit.managementTrust.canTrust ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
                <p className="font-bold text-[#EAF0FF]">CAN MANAGEMENT TRUST THIS REPORT?</p>
                <p className={`text-2xl font-bold mt-1 ${report.finalKpiAccuracyAudit.managementTrust.canTrust ? 'text-emerald-300' : 'text-red-300'}`}>
                  {report.finalKpiAccuracyAudit.managementTrust.answerAr}
                </p>
                <ul className="list-disc list-inside text-sm text-[#CBD5E1] mt-2 space-y-1">
                  {report.finalKpiAccuracyAudit.managementTrust.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">1 — Ghost Rider Verification</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <StatCard label="Ghost فعلي" value={report.finalKpiAccuracyAudit.ghostVerification.actualGhostRiders} />
                <StatCard label="Code Mismatch" value={report.finalKpiAccuracyAudit.ghostVerification.codeMismatchCount} />
                <StatCard label="غير موجود في المناديب" value={report.finalKpiAccuracyAudit.ghostVerification.missingFromMasterCount} />
                <StatCard label="مستبعد — Zone" value={report.finalKpiAccuracyAudit.ghostVerification.zoneFilterExcludedCount} />
                <StatCard label="مستبعد — Supervisor" value={report.finalKpiAccuracyAudit.ghostVerification.supervisorFilterExcludedCount} />
                <StatCard label="Ghost Leakage Hours" value={report.finalKpiAccuracyAudit.ghostVerification.ghostLeakageHours} />
                <StatCard label="Ghost Leakage Orders" value={report.finalKpiAccuracyAudit.ghostVerification.ghostLeakageOrders} />
                <StatCard label="Ghost Leakage %" value={`${report.finalKpiAccuracyAudit.ghostVerification.ghostLeakagePercent}%`} />
              </div>
              <MiniTable
                headers={['Code', 'Name', 'Hours', 'Orders', 'Root Cause']}
                rows={report.finalKpiAccuracyAudit.ghostVerification.top100.slice(0, 25).map((g) => [
                  g.code, g.name, g.hours, g.orders, g.rootCauseLabelAr,
                ])}
              />
              <p className="text-xs text-[#64748B] mt-1">Top 25 من 100 — Excel للقائمة الكاملة</p>

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">2 — Join Date Coverage</h3>
              <div className="grid sm:grid-cols-4 gap-3 mb-3">
                <StatCard label="Coverage %" value={`${report.finalKpiAccuracyAudit.joinDateValidation.joinDateCoveragePercent}%`} />
                <StatCard label="Valid Join Dates" value={report.finalKpiAccuracyAudit.joinDateValidation.validJoinDates} />
                <StatCard label="Missing Join Dates" value={report.finalKpiAccuracyAudit.joinDateValidation.missingJoinDates} />
                <StatCard
                  label="Average Rider Lifetime"
                  value={report.finalKpiAccuracyAudit.joinDateValidation.lifetimeDisplayBlocked ? 'NULL' : '—'}
                  sub={report.finalKpiAccuracyAudit.joinDateValidation.lifetimeBlockReason}
                />
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">3 — Active Riders Consistency</h3>
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
                <StatCard label="Unique Active (Period)" value={report.finalKpiAccuracyAudit.activeRidersConsistency.uniqueActiveRidersInPeriod} />
                <StatCard label="Avg Daily Active" value={report.finalKpiAccuracyAudit.activeRidersConsistency.averageDailyActiveRiders} />
                <StatCard label="Daily Min" value={report.finalKpiAccuracyAudit.activeRidersConsistency.dailyActiveMin} />
                <StatCard label="Daily Max" value={report.finalKpiAccuracyAudit.activeRidersConsistency.dailyActiveMax} />
                <StatCard label="Std Dev" value={report.finalKpiAccuracyAudit.activeRidersConsistency.dailyActiveStdDev} />
                <StatCard label="Days w/ Data" value={report.finalKpiAccuracyAudit.activeRidersConsistency.daysWithData} />
              </div>
              <p className="text-xs text-[#94A3B8] mb-4">{report.finalKpiAccuracyAudit.activeRidersConsistency.discrepancyExplanationAr}</p>

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">4 — Roadmap Validation</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4 text-sm space-y-1">
                <p>Daily Gap: <strong>{report.finalKpiAccuracyAudit.roadmapValidation.dailyGap}</strong> س/يوم</p>
                <p>Avg Daily Hrs/Active Rider: <strong>{report.finalKpiAccuracyAudit.roadmapValidation.averageDailyHoursPerActiveRider}</strong></p>
                <p className="font-mono text-xs text-cyan-400/90">{report.finalKpiAccuracyAudit.roadmapValidation.formula}</p>
                <p>Additional Riders Needed: <strong>{report.finalKpiAccuracyAudit.roadmapValidation.additionalRidersNeeded}</strong></p>
                <p>{report.finalKpiAccuracyAudit.roadmapValidation.additionalRidersCalculation}</p>
                <div className="text-xs font-mono text-cyan-400/90 space-y-0.5 mt-2">
                  <p>gapHours: {report.finalKpiAccuracyAudit.roadmapValidation.ridersAudit.gapHours}</p>
                  <p>avgHoursPerActiveRider: {report.finalKpiAccuracyAudit.roadmapValidation.ridersAudit.avgHoursPerActiveRider ?? 'null'}</p>
                  <p>rawCalculation: {report.finalKpiAccuracyAudit.roadmapValidation.ridersAudit.rawCalculation}</p>
                  <p>roundedResult: {report.finalKpiAccuracyAudit.roadmapValidation.ridersAudit.roundedResult ?? 'null'}</p>
                </div>
                <p className={report.finalKpiAccuracyAudit.roadmapValidation.zeroValidationPassed ? 'text-emerald-400' : 'text-red-400'}>
                  Zero validation: {report.finalKpiAccuracyAudit.roadmapValidation.zeroValidationPassed ? 'PASS' : 'FAIL'}
                </p>
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">5 — KPI Trust Verification</h3>
              <div className="grid sm:grid-cols-4 gap-3 mb-3">
                <StatCard label="Trust Level" value={report.finalKpiAccuracyAudit.kpiTrustVerification.trustLevel} sub={report.finalKpiAccuracyAudit.kpiTrustVerification.trustLabelAr} />
                <StatCard label="Data Quality" value={`${report.finalKpiAccuracyAudit.kpiTrustVerification.dataQualityScore}/100`} />
                <StatCard label="Ghost Leakage" value={`${report.finalKpiAccuracyAudit.kpiTrustVerification.ghostLeakagePercent}%`} />
                <StatCard label="Gate Status" value={report.finalKpiAccuracyAudit.kpiTrustVerification.gateStatusAr} />
              </div>
              <MiniTable
                headers={['KPI', 'الحالة', 'السبب']}
                rows={report.finalKpiAccuracyAudit.kpiTrustVerification.kpiGates.map((g) => [
                  g.kpiAr,
                  g.enabled ? 'مفعّل' : 'معطّل',
                  g.reasonAr,
                ])}
              />

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">6 — Executive Accuracy Components</h3>
              <MiniTable
                headers={['المكوّن', 'الدرجة', 'الوزن']}
                rows={[
                  ['جودة البيانات', report.finalKpiAccuracyAudit.executiveAccuracyScore.components.dataQuality, `${report.finalKpiAccuracyAudit.executiveAccuracyScore.weights.dataQuality * 100}%`],
                  ['عكس تسرب Ghost', report.finalKpiAccuracyAudit.executiveAccuracyScore.components.ghostLeakageInverse, `${report.finalKpiAccuracyAudit.executiveAccuracyScore.weights.ghostLeakageInverse * 100}%`],
                  ['تغطية الانضمام', report.finalKpiAccuracyAudit.executiveAccuracyScore.components.joinDateCoverage, `${report.finalKpiAccuracyAudit.executiveAccuracyScore.weights.joinDateCoverage * 100}%`],
                  ['سلامة التكرارات', report.finalKpiAccuracyAudit.executiveAccuracyScore.components.duplicateIntegrity, `${report.finalKpiAccuracyAudit.executiveAccuracyScore.weights.duplicateIntegrity * 100}%`],
                  ['سلامة النطاق', report.finalKpiAccuracyAudit.executiveAccuracyScore.components.scopeIntegrity, `${report.finalKpiAccuracyAudit.executiveAccuracyScore.weights.scopeIntegrity * 100}%`],
                ]}
              />
            </Section>

            <Section title={L.executiveSummary}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label={L.headcount} value={report.executiveSummary.totalRegisteredRiders} />
                <StatCard label={L.activeRiders} value={report.executiveSummary.activeRiders} sub="متوسط يومي" />
                <StatCard label={L.noShowRiders} value={report.executiveSummary.noShowRiders} />
                <StatCard label={L.actualHours} value={report.executiveSummary.actualDailyHours} sub="متوسط يومي" />
                <StatCard label={L.targetHours} value={report.executiveSummary.targetDailyHours} />
                <StatCard label={L.achievementPercent} value={`${report.executiveSummary.achievementPercent}%`} />
                <StatCard label={L.avgHoursPerActiveRider} value={report.executiveSummary.avgHoursPerActiveRider} />
                <StatCard label={L.utilizationRate} value={`${report.executiveSummary.utilizationRate}%`} />
                <StatCard label="فريدون بالفترة (تشخيص)" value={report.executiveSummary.uniqueActiveRidersInPeriod} />
                <StatCard label={L.approvedResignations} value={report.executiveSummary.approvedResignations} />
                <StatCard label={L.attritionRate} value={`${report.executiveSummary.attritionRate}%`} />
              </div>
            </Section>

            <Section title={L.activityDistribution}>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.activityDistribution.buckets}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 10 }} angle={-15} textAnchor="end" height={70} />
                      <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                      <Bar dataKey="count" name="عدد الطيارين" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.activityDistribution.buckets.filter((b) => b.count > 0)}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ percent }) => {
                          const pctLabel = percent <= 1 ? percent * 100 : percent;
                          return `${Math.round(pctLabel)}%`;
                        }}
                      >
                        {report.activityDistribution.buckets.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-[#64748B] mb-2">
                أساس التصنيف: {report.activityDistribution.classificationFormula} — {report.activityDistribution.periodDays} يوم · العرض الافتراضي: متوسط يومي
              </p>
              <MiniTable headers={['الفئة', 'العدد', 'النسبة', 'متوسط يومي/طيار', 'ساعات الفترة']} rows={report.activityDistribution.buckets.map((b) => [b.label, b.count, `${b.percent}%`, b.avgDailyHoursPerRider, b.hoursContribution])} />
            </Section>

            <Section title={L.utilization}>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <StatCard label={L.totalRegistered} value={report.utilization.totalRegisteredRiders} />
                <StatCard label={L.activeRiders} value={report.utilization.activeRiders} />
                <StatCard label={L.utilizationRate} value={`${report.utilization.utilizationRate}%`} sub="النشطون ÷ المسجلون" />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">أعلى ٢٠ طياراً (متوسط يومي)</h3>
                  <MiniTable headers={['الاسم', 'الكود', 'متوسط يومي', 'طلبات/يوم', 'ساعات الفترة']} rows={report.utilization.top20ByHours.map((r) => [r.name, r.code, r.avgDailyHours, r.avgDailyOrders, r.hours])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">أدنى ٢٠ طياراً (متوسط يومي)</h3>
                  <MiniTable headers={['الاسم', 'الكود', 'متوسط يومي', 'طلبات/يوم', 'ساعات الفترة']} rows={report.utilization.bottom20ByHours.map((r) => [r.name, r.code, r.avgDailyHours, r.avgDailyOrders, r.hours])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">الأكثر انتظاماً</h3>
                  <MiniTable headers={['الاسم', 'الدرجة', 'أيام عمل', 'متوسط يومي']} rows={report.utilization.mostConsistent.slice(0, 10).map((r) => [r.name, r.consistencyScore ?? 0, r.workDays, r.avgDailyHours])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">الأكثر تحسناً / تراجعاً (س/يوم)</h3>
                  <MiniTable headers={['الاسم', 'التغير يومي', 'متوسط يومي']} rows={[
                    ...report.utilization.mostImproved.slice(0, 5).map((r) => [r.name, `+${r.trendDelta ?? 0}`, r.avgDailyHours]),
                    ...report.utilization.declining.slice(0, 5).map((r) => [r.name, String(r.trendDelta ?? 0), r.avgDailyHours]),
                  ]} />
                </div>
              </div>
            </Section>

            <Section title={L.hoursAnalysis}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="متوسط الساعات اليومية (الأسطول)" value={report.hoursAnalysis.averageDailyHours} sub={`فترة: ${report.hoursAnalysis.totalHours}`} />
                <StatCard label="إجمالي الساعات (الفترة)" value={report.hoursAnalysis.totalHours} sub={`يومي: ${report.hoursAnalysis.totalHoursDual.daily}`} />
                <StatCard label="أعلى يوم" value={report.hoursAnalysis.highestDay?.hours ?? 0} sub={report.hoursAnalysis.highestDay?.date} />
                <StatCard label="أدنى يوم" value={report.hoursAnalysis.lowestDay?.hours ?? 0} sub={report.hoursAnalysis.lowestDay?.date} />
                <StatCard label="متوسط الساعات/طيار/يوم" value={report.hoursAnalysis.averageHoursPerRiderDual.daily} sub={`فترة: ${report.hoursAnalysis.averageHoursPerRider}`} />
                <StatCard label="متوسط الساعات/طيار نشط/يوم" value={report.hoursAnalysis.averageHoursPerActiveRiderDual.daily} sub={`فترة: ${report.hoursAnalysis.averageHoursPerActiveRider}`} />
              </div>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.hoursAnalysis.trend}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                    <Legend />
                    <Line type="monotone" dataKey="hours" name="الساعات" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="orders" name="الطلبات" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أفضل ١٠ أيام</h3>
                  <MiniTable headers={['التاريخ', 'الساعات']} rows={report.hoursAnalysis.top10Days.map((d) => [d.date, d.hours])} />
                </div>
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أسوأ ١٠ أيام</h3>
                  <MiniTable headers={['التاريخ', 'الساعات']} rows={report.hoursAnalysis.worst10Days.map((d) => [d.date, d.hours])} />
                </div>
              </div>
            </Section>

            <Section title={L.lostHours}>
              <div className="grid sm:grid-cols-4 gap-3">
                <StatCard label="الساعات المحتملة/يوم" value={report.lostHours.potentialHoursDual.daily} sub={`فترة: ${report.lostHours.potentialHours}`} />
                <StatCard label="الساعات الفعلية/يوم" value={report.lostHours.actualHoursDual.daily} sub={`فترة: ${report.lostHours.actualHours}`} />
                <StatCard label="الساعات المهدرة/يوم" value={report.lostHours.lostHoursDual.daily} sub={`${report.lostHours.lostPercent}% · فترة: ${report.lostHours.lostHours}`} />
              </div>
              <div className="h-56 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.lostHours.breakdown.map((b) => ({ ...b, dailyLost: b.hoursDual.daily }))} layout="vertical">
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis type="number" tick={{ fill: '#94A3B8' }} />
                    <YAxis type="category" dataKey="category" width={200} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                    <Bar dataKey="dailyLost" name="ساعات مهدرة/يوم" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <MiniTable headers={['الفئة', 'مهدرة/يوم', 'مهدرة (فترة)', 'النسبة', 'العدد']} rows={report.lostHours.breakdown.map((b) => [b.category, b.hoursDual.daily, b.hours, `${b.percent}%`, b.riderCount])} />
            </Section>

            <Section title={L.supervisorRisk}>
              <MiniTable headers={['المشرف', 'درجة المخاطر', 'المستوى', 'العوامل']} rows={report.supervisorRisk.rows.map((s) => [
                s.name, s.riskScore, <RiskBadge key={s.code} level={s.riskLevel} />, s.factors.join('؛ ') || '—',
              ])} />
            </Section>

            <Section title={L.operationalTruthIntelligence}>
              {report.kpiTrust.disableStiOrpsGrowthRoadmap && (
                <p className="text-sm text-red-300/90 mb-3">STI / ORPS / RDE معطّلة — {report.kpiTrust.descriptionAr}</p>
              )}
              {report.kpiTrust.lowConfidenceStrategic && !report.kpiTrust.disableStiOrpsGrowthRoadmap && (
                <p className="text-sm text-amber-300/90 mb-3">⚠ ثقة منخفضة — STI/ORPS للاتجاه العام فقط</p>
              )}
              {report.operationalTruthIntelligence.criticalAlerts.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h3 className="text-sm font-semibold text-[#94A3B8]">تنبيهات حرجة</h3>
                  {report.operationalTruthIntelligence.criticalAlerts.slice(0, 12).map((alert, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        alert.severity === 'red'
                          ? 'border-red-500/40 bg-red-500/10 text-red-200'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      }`}
                    >
                      {alert.messageAr}
                    </div>
                  ))}
                </div>
              )}

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">ترتيب الحقيقة التشغيلية للمشرفين (STI)</h3>
              <MiniTable
                headers={['الترتيب', 'المشرف', 'STI', 'تسرب Ghost', 'احتفاظ', 'المستوى', 'تفصيل']}
                rows={report.operationalTruthIntelligence.supervisorTruthIndex.map((s) => [
                  s.rank,
                  s.supervisorName,
                  s.stiScore,
                  `${roundPct(s.ghostDependencyRatio)}%`,
                  s.retentionScore,
                  <RiskBadge key={`sti-${s.supervisorId}`} level={s.riskLevel} />,
                  `ساعات=${s.breakdown.officialHours} | ghost=${s.breakdown.allocatedGhostHours}`,
                ])}
              />

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">محرك الاعتماد التشغيلي (RDE)</h3>
              <MiniTable
                headers={['المشرف', 'اعتماد', 'هشاشة', 'نواة', 'المستوى']}
                rows={report.operationalTruthIntelligence.riderDependency.map((d) => [
                  d.supervisorName,
                  `${roundPct(d.dependencyScore)}%`,
                  `${roundPct(d.fragilityIndex)}%`,
                  d.coreRidersList.slice(0, 3).map((c) => c.riderName).join('، ') || '—',
                  <RiskBadge key={`rde-${d.supervisorId}`} level={d.riskLevel} />,
                ])}
              />

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">توقع المخاطر التشغيلية (ORPS)</h3>
              <MiniTable
                headers={['المشرف', 'ORPS', 'المستوى', 'السبب الرئيسي', 'تفصيل العوامل']}
                rows={report.operationalTruthIntelligence.operationalRiskPrediction.map((o) => [
                  o.supervisorName,
                  o.orpsScore,
                  <RiskBadge key={`orps-${o.supervisorId}`} level={o.riskLevel} />,
                  o.primaryRiskDriver,
                  `ghost=${o.breakdown.ghostLeakageScore} dep=${o.breakdown.dependencyRisk} attr=${o.breakdown.attritionPressure}`,
                ])}
              />

              <div className="grid lg:grid-cols-2 gap-4 mt-6">
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أكثر ٥ فرق استقراراً (STI)</h3>
                  <MiniTable
                    headers={['المشرف', 'STI']}
                    rows={report.operationalTruthIntelligence.globalInsights.top5StableSupervisors.map((s) => [
                      s.supervisorName,
                      s.stiScore,
                    ])}
                  />
                </div>
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أعلى ٥ مخاطر (ORPS)</h3>
                  <MiniTable
                    headers={['المشرف', 'ORPS']}
                    rows={report.operationalTruthIntelligence.globalInsights.top5HighestRiskSupervisors.map((s) => [
                      s.supervisorName,
                      s.orpsScore,
                    ])}
                  />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">نقاط فشل واحدة (Single Point of Failure)</h3>
              <MiniTable
                headers={['الطيار', 'المشرف', 'الساعات', 'حصة من المشرف']}
                rows={report.operationalTruthIntelligence.globalInsights.singlePointOfFailureRiders.map((r) => [
                  `${r.riderName} (${r.riderCode})`,
                  r.supervisorName,
                  r.hours,
                  `${r.supervisorShare}%`,
                ])}
              />

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">بؤر تسرب Ghost Riders</h3>
              <MiniTable
                headers={['الكود', 'الساعات', 'حصة من التسرب']}
                rows={report.operationalTruthIntelligence.globalInsights.ghostLeakageHotspots.map((g) => [
                  g.riderCode,
                  g.hours,
                  `${g.shareOfGhostLeakage}%`,
                ])}
              />
            </Section>

            <Section title={L.recruitment}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="إجمالي الطلبات" value={report.recruitment.totalApplications} />
                <StatCard label="المقبولون" value={report.recruitment.totalAccepted} />
                <StatCard label="المنضمون" value={report.recruitment.totalJoined} />
                <StatCard label="نشطون بعد الانضمام" value={report.recruitment.totalActiveAfterJoining} />
                <StatCard label="طلب→انضمام" value={`${report.recruitment.applicationToJoinRate}%`} />
                <StatCard label="كفاءة التعيين" value={`${report.recruitment.recruitmentEfficiencyPercent}%`} />
              </div>
              <h3 className="text-sm text-[#94A3B8] mt-4">ترتيب مسؤولي التعيين</h3>
              <MiniTable headers={['المسؤول', 'طلبات', 'مقبول', 'منضم', 'نشط', 'كفاءة%']} rows={report.recruitment.recruiterRanking.slice(0, 15).map((r) => [
                r.recruiter, r.applications, r.accepted, r.joined, r.activeAfterJoining, r.efficiencyPercent,
              ])} />
            </Section>

            <Section title={L.attrition}>
              <div className="grid sm:grid-cols-4 gap-3">
                <StatCard label="عدد الإقالات" value={report.attrition.approvedResignations} />
                <StatCard label="نسبة التسرب" value={`${report.attrition.attritionRate}%`} />
                <StatCard label="متوسط التسرب الشهري" value={`${report.attrition.monthlyAttritionRate}%`} />
                <StatCard
                  label="متوسط عمر الطيار (يوم)"
                  value={report.attrition.riderLifetimeKpiEnabled ? (report.attrition.averageRiderLifetimeDays ?? '—') : 'معطّل'}
                  sub={report.attrition.riderLifetimeDisabledReason}
                />
              </div>
              <p className="text-xs text-[#64748B]">متوسط الطيارين النشطين يومياً: {report.attrition.averageActiveRidersDuringPeriod}</p>
              <h3 className="text-sm text-[#94A3B8] mt-4">أكثر المشرفين فقداناً للطيارين</h3>
              <MiniTable headers={['المشرف', 'إقالات']} rows={report.attrition.topSupervisorsLosingRiders.map((s) => [s.name, s.count])} />
              {report.attrition.attritionTrend.length > 0 && (
                <div className="h-48 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.attrition.attritionTrend}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="period" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94A3B8' }} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                      <Bar dataKey="resignations" fill="#f97316" name="إقالات" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>

            <Section title={L.growthOpportunities}>
              {report.growthOpportunities.disabled ? (
                <p className="text-sm text-amber-300/90">{report.growthOpportunities.disabledReason}</p>
              ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {report.growthOpportunities.scenarios.map((sc) => (
                  <div key={sc.key} className="rounded-xl border border-white/10 p-4 bg-white/5">
                    <p className="font-medium text-[#EAF0FF]">{sc.label}</p>
                    <p className="text-cyan-400 text-lg font-bold mt-1">+{sc.additionalHoursGainDaily} ساعة/يوم</p>
                    <p className="text-xs text-[#94A3B8]">فترة: +{sc.additionalHoursGain}س · متوقع يومي: {sc.expectedTotalHoursDaily}س · {sc.affectedRiders} طيار</p>
                  </div>
                ))}
              </div>
              )}
            </Section>

            <Section title={L.growthExpansion}>
              {report.growthExpansion.disabled && (
                <p className="text-sm text-amber-300/90 mb-3">{report.growthExpansion.disabledReason}</p>
              )}
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <StatCard
                  label="هدف الساعات اليومية"
                  value={report.growthExpansion.dailyTargetHours}
                  sub="ساعة/يوم"
                />
                <StatCard
                  label="متوسط الساعات اليومية الحالي"
                  value={report.growthExpansion.currentAverageDailyHours}
                  sub="ساعة/يوم"
                />
              </div>
              <div className="space-y-3">
                {report.growthExpansion.indicators.map((ind) => (
                  <div
                    key={ind.key}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-start"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-[#EAF0FF]">{ind.labelAr}</p>
                      <p className="text-xs text-cyan-400/90 font-mono" dir="ltr">
                        {ind.formula}
                      </p>
                      <p className="text-sm text-[#94A3B8]">{ind.calculation}</p>
                    </div>
                    <div className="text-left lg:text-left shrink-0">
                      <p className="text-2xl font-bold text-cyan-300">{ind.displayValue}</p>
                      {ind.unit !== '%' && ind.unit !== 'طيار' && ind.unit !== 'ساعة' && ind.unit !== 'طلب' && (
                        <p className="text-xs text-[#64748B]">{ind.unit}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={L.hoursRoadmap}>
              {report.hoursRoadmap.disabled && (
                <p className="text-sm text-amber-300/90 mb-3">{report.hoursRoadmap.disabledReason}</p>
              )}
              {report.hoursRoadmap.lowConfidence && !report.hoursRoadmap.disabled && (
                <p className="text-sm text-amber-300/90 mb-3">⚠ ثقة منخفضة — التوقعات للاتجاه العام فقط</p>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard label="المتوسط اليومي الحالي" value={report.hoursRoadmap.currentDailyHours} sub="ساعة/يوم" />
                <StatCard label="الهدف اليومي" value={report.hoursRoadmap.targetDailyHours} sub="ساعة/يوم" />
                <StatCard label="الفجوة اليومية" value={report.hoursRoadmap.dailyGap} sub="ساعة/يوم" />
                <StatCard label="إجمالي الفترة (مرجع)" value={report.hoursRoadmap.currentPeriodHours} sub={`${report.hoursRoadmap.validDaysInDataset} يوم بيانات`} />
                <StatCard
                  label="طيارون إضافيون"
                  value={report.hoursRoadmap.additionalActiveRidersNeeded}
                  sub={
                    report.hoursRoadmap.ridersAudit?.validationPassed === false
                      ? 'تحقق فاشل'
                      : report.hoursRoadmap.calculationTrace.forecastDisabled
                        ? 'توقعات معطّلة — الحساب متاح'
                        : `+${report.hoursRoadmap.additionalHoursPerRiderNeeded}س/طيار/يوم`
                  }
                />
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 mt-4 text-sm text-[#CBD5E1] space-y-1">
                <p className="font-medium text-cyan-200/90">تتبع الحساب</p>
                <p className="text-xs font-mono text-cyan-400/90">{report.hoursRoadmap.calculationTrace.formula}</p>
                <p>{report.hoursRoadmap.calculationTrace.dailyGapCalculation}</p>
                <p>متوسط ساعات الطيار النشط يومياً: {report.hoursRoadmap.calculationTrace.avgDailyHoursPerActiveRider}</p>
                <p className="text-xs font-mono text-cyan-400/90">{report.hoursRoadmap.calculationTrace.additionalRidersFormula}</p>
                <p className="font-medium">{report.hoursRoadmap.calculationTrace.additionalRidersCalculation}</p>
                {report.hoursRoadmap.ridersAudit && (
                  <div className="mt-2 pt-2 border-t border-cyan-500/20 text-xs font-mono space-y-0.5">
                    <p>gapHours: {report.hoursRoadmap.ridersAudit.gapHours}</p>
                    <p>avgHoursPerActiveRider: {report.hoursRoadmap.ridersAudit.avgHoursPerActiveRider ?? 'null'}</p>
                    <p>rawCalculation: {report.hoursRoadmap.ridersAudit.rawCalculation}</p>
                    <p>roundedResult: {report.hoursRoadmap.ridersAudit.roundedResult ?? 'null'}</p>
                    <p className={report.hoursRoadmap.ridersAudit.validationPassed ? 'text-emerald-400' : 'text-red-400'}>
                      validation: {report.hoursRoadmap.ridersAudit.validationPassed ? 'PASS' : 'FAIL'}
                      {report.hoursRoadmap.ridersAudit.validationMessage ? ` — ${report.hoursRoadmap.ridersAudit.validationMessage}` : ''}
                    </p>
                  </div>
                )}
                {report.hoursRoadmap.calculationTrace.forecastDisabled && (
                  <p className="text-amber-300 text-xs">{report.hoursRoadmap.calculationTrace.forecastDisabledReason}</p>
                )}
              </div>
              <ul className="list-disc list-inside text-sm text-[#CBD5E1] space-y-1 mt-3">
                {report.hoursRoadmap.roadmap.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Section>

            <Section title={L.formulaAudit}>
              <p className="text-sm text-amber-300/90 mb-4">{report.operationalFormulaAudit.daily2200Roadmap.warning}</p>

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">جدول التحقق من المؤشرات</h3>
              <MiniTable
                headers={['المؤشر', 'الصيغة', 'البيانات الخام', 'النتيجة', 'الحالة']}
                rows={report.operationalFormulaAudit.validationTable.map((row) => [
                  row.kpi,
                  row.formula,
                  row.rawData,
                  row.result,
                  <span key={row.kpi} className={row.status === 'valid' ? 'text-emerald-400' : 'text-amber-400'}>
                    {row.status === 'valid' ? 'صالح' : `تحذير${row.statusReason ? `: ${row.statusReason}` : ''}`}
                  </span>,
                ])}
              />

              <div className="grid lg:grid-cols-2 gap-4 mt-6">
                <AuditCard title="نسبة التسرب — تدقيق تفصيلي">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.attrition.formula}</p>
                  <p>البسط: {report.operationalFormulaAudit.attrition.numerator} ({report.operationalFormulaAudit.attrition.numeratorLabel})</p>
                  <p>المقام: {report.operationalFormulaAudit.attrition.denominator} ({report.operationalFormulaAudit.attrition.denominatorLabel})</p>
                  <p className="font-medium text-[#EAF0FF]">{report.operationalFormulaAudit.attrition.calculation}</p>
                  <p className="text-sm text-[#94A3B8] mt-2">{report.operationalFormulaAudit.attrition.explanation}</p>
                  <p className="text-xs text-[#64748B]">{report.operationalFormulaAudit.attrition.dailyActiveCountsSample}</p>
                </AuditCard>

                <AuditCard title="متوسط عمر الطيار">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.riderLifetime.formula}</p>
                  <p>انضمام: {report.operationalFormulaAudit.riderLifetime.joinDateColumn}</p>
                  <p>موافقة: {report.operationalFormulaAudit.riderLifetime.approvalDateColumns}</p>
                  <p>{report.operationalFormulaAudit.riderLifetime.calculation}</p>
                  <p className="font-medium">النتيجة: {report.operationalFormulaAudit.riderLifetime.resultDays != null ? `${report.operationalFormulaAudit.riderLifetime.resultDays} يوم` : 'معطّل'}</p>
                </AuditCard>

                <AuditCard title="خارطة 2200 ساعة يومياً">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.daily2200Roadmap.formula}</p>
                  <p>{report.operationalFormulaAudit.daily2200Roadmap.calculation}</p>
                  <p>{report.operationalFormulaAudit.daily2200Roadmap.additionalRidersFormula}</p>
                  <p className="font-medium">{report.operationalFormulaAudit.daily2200Roadmap.additionalRidersCalculation}</p>
                  <div className="text-xs font-mono text-cyan-400/80 mt-2 space-y-0.5">
                    <p>gapHours: {report.operationalFormulaAudit.daily2200Roadmap.ridersAudit.gapHours}</p>
                    <p>avgHoursPerActiveRider: {report.operationalFormulaAudit.daily2200Roadmap.ridersAudit.avgHoursPerActiveRider ?? 'null'}</p>
                    <p>rawCalculation: {report.operationalFormulaAudit.daily2200Roadmap.ridersAudit.rawCalculation}</p>
                    <p>roundedResult: {report.operationalFormulaAudit.daily2200Roadmap.ridersAudit.roundedResult ?? 'null'}</p>
                    <p className={report.operationalFormulaAudit.daily2200Roadmap.mathValidationPassed ? 'text-emerald-400' : 'text-red-400'}>
                      validation: {report.operationalFormulaAudit.daily2200Roadmap.mathValidationPassed ? 'PASS' : 'FAIL'}
                    </p>
                  </div>
                </AuditCard>

                <AuditCard title="توزيع الساعات">
                  <p className="font-medium text-emerald-300">{report.operationalFormulaAudit.hoursDistribution.basisLabelAr}</p>
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.hoursDistribution.formula}</p>
                  <p>{report.operationalFormulaAudit.hoursDistribution.classificationLogic}</p>
                  <p className="text-sm text-[#94A3B8]">{report.operationalFormulaAudit.hoursDistribution.example}</p>
                </AuditCard>
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">الإقالات المعتمدة — سجلات مُحتسبة</h3>
              <p className="text-xs text-[#64748B] mb-2">
                صفوف خام: {report.operationalFormulaAudit.approvedResignations.rawRowsMatched} |
                بعد إزالة التكرار: {report.operationalFormulaAudit.approvedResignations.afterDedupe} |
                تكرارات محذوفة: {report.operationalFormulaAudit.approvedResignations.duplicatesRemoved}
              </p>
              <MiniTable
                headers={['صف الشيت', 'كود الطيار', 'الاسم', 'المشرف', 'الحالة', 'تاريخ الموافقة', 'مُحتسب']}
                rows={report.operationalFormulaAudit.approvedResignations.records.map((rec) => [
                  rec.sheetRow,
                  rec.riderCode,
                  rec.riderName || '—',
                  rec.supervisorCode,
                  rec.statusRaw,
                  rec.approvalDate,
                  rec.included ? 'نعم' : `لا${rec.dedupeNote ? ` (${rec.dedupeNote})` : ''}`,
                ])}
              />

              {report.operationalFormulaAudit.riderLifetime.samples.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">عينة حساب عمر الطيار</h3>
                  <MiniTable
                    headers={['الكود', 'انضمام', 'موافقة', 'العمر (يوم)']}
                    rows={report.operationalFormulaAudit.riderLifetime.samples.slice(0, 20).map((s) => [
                      s.riderCode,
                      s.joinDate ?? '—',
                      s.approvalDate,
                      s.lifetimeDays > 0 ? s.lifetimeDays : '—',
                    ])}
                  />
                </>
              )}

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">الساعات المهدرة — صيغ مفصلة</h3>
              <div className="space-y-3">
                {report.operationalFormulaAudit.lostHours.categories.map((cat) => (
                  <div key={cat.key} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                    <p className="font-medium text-[#EAF0FF]">{cat.label}</p>
                    <p className="text-cyan-400/90 text-xs font-mono mt-1">{cat.formula}</p>
                    <p className="text-[#94A3B8]">{cat.rawData}</p>
                    <p className="text-cyan-300 font-semibold mt-1">{cat.resultHours} ساعة</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={L.aiInsights}>
              <div className="space-y-3 text-sm text-[#CBD5E1]">
                <InsightBlock title="أكبر مشكلة تشغيلية" text={report.aiInsights.biggestProblem} />
                <InsightBlock title="سبب الساعات المهدرة" text={report.aiInsights.lostHoursCause} />
                <InsightBlock title="مشرف يحتاج تدخل" text={report.aiInsights.supervisorNeedingIntervention} />
                <InsightBlock title="طيارون غير مستغَلون" text={report.aiInsights.underutilizedRiders} />
                <InsightBlock title="تركيز هذا الأسبوع" text={report.aiInsights.focusThisWeek} />
                <InsightBlock title="تركيز هذا الشهر" text={report.aiInsights.focusThisMonth} />
                <InsightBlock title="أسرع مكاسب للساعات" text={report.aiInsights.fastestHourGains} />
              </div>
            </Section>

            </>
            )}

            <Section title={L.dataValidation}>
              <MiniTable
                headers={['المؤشر', 'البسط', 'المقام', 'المعادلة', 'النتيجة']}
                rows={report.dataValidation.map((d) => [
                  d.kpi,
                  d.numerator !== undefined ? `${d.numerator} (${d.numeratorLabel ?? ''})` : '—',
                  d.denominator !== undefined ? `${d.denominator} (${d.denominatorLabel ?? ''})` : '—',
                  d.formula,
                  d.result,
                ])}
              />
            </Section>
          </>
        )}
      </div>
    </Layout>
  );
}

function AuditCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm text-[#CBD5E1]">
      <h4 className="font-semibold text-[#EAF0FF]">{title}</h4>
      {children}
    </div>
  );
}

function InsightBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold text-cyan-400 mb-1">{title}</p>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}
