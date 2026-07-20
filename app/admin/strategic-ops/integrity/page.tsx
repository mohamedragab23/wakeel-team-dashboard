'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { ZONE_OPTIONS } from '@/lib/zones';
import { SystemHealthCard } from '@/components/strategicOps/SystemHealthCard';
import { LiveOperationsAudit } from '@/components/strategicOps/LiveOperationsAudit';
import { KPILineageModal } from '@/components/strategicOps/KPILineageModal';
import { ExecutiveTrustCenter } from '@/components/strategicOps/ExecutiveTrustCenter';
import type { SystemHealthMetrics } from '@/lib/strategicOps/systemHealth';
import type { LiveAuditReport, AuditResult, KPILineage } from '@/lib/strategicOps/audit';
import { buildKpiLineageFromAuditResult } from '@/lib/strategicOps/audit/kpiLineage';
import type { TrustScore } from '@/lib/strategicOps/trust';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export default function SystemIntegrityCenterPage() {
  const defaults = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [zone, setZone] = useState('all');
  const [supervisorCode, setSupervisorCode] = useState('all');
  const [applied, setApplied] = useState(defaults);
  const [lineage, setLineage] = useState<KPILineage | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [auditForceKey, setAuditForceKey] = useState(0);

  const qs = useMemo(() => {
    const q = new URLSearchParams({
      startDate: applied.startDate,
      endDate: applied.endDate,
      zone,
      supervisorCode,
    });
    return q.toString();
  }, [applied, zone, supervisorCode]);

  const healthQuery = useQuery({
    queryKey: ['strategic-ops-system-health', qs],
    queryFn: async () => {
      const res = await authFetch(`/api/strategic-ops/system-health?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل صحة النظام');
      return json.data as SystemHealthMetrics;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const trustQuery = useQuery({
    queryKey: ['strategic-ops-trust-score', qs],
    queryFn: async () => {
      const res = await authFetch(`/api/strategic-ops/trust-score?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل درجة الثقة');
      return json.data as TrustScore;
    },
    staleTime: 60_000,
  });

  const auditQuery = useQuery({
    queryKey: ['strategic-ops-live-audit', qs, auditForceKey],
    queryFn: async () => {
      const force = auditForceKey > 0 ? '&force=1' : '';
      const res = await authFetch(`/api/strategic-ops/live-audit?${qs}${force}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تشغيل التدقيق');
      return json.data as LiveAuditReport;
    },
    staleTime: 5 * 60_000,
  });

  const onKpiClick = (result: AuditResult) => {
    const h = healthQuery.data;
    setLineage(
      buildKpiLineageFromAuditResult(result, {
        sourceRows: h?.dataHealth.uploadStatus.presentDays ?? 0,
        rowsUsed: h?.dataHealth.uploadStatus.presentDays ?? 0,
        duplicateRows: h?.dataHealth.duplicateRecords ?? 0,
        ghostRows: h?.dataHealth.ghostRiders ?? 0,
        coverage: h?.dataHealth.uploadStatus.completenessPercent ?? 0,
        lastRefresh: h?.overall.lastCheck ?? new Date().toISOString(),
      })
    );
    setLineageOpen(true);
  };

  const health = healthQuery.data;

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#64748B] mb-1">
              <Link href="/admin/strategic-ops" className="hover:text-cyan-300">
                مركز العمليات الاستراتيجي
              </Link>{' '}
              / System Integrity Center
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">System Integrity Center</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              صحة البيانات، الـ API، الحسابات، التدقيق، والإعدادات — في مكان واحد
            </p>
          </div>
          <Link
            href="/admin/strategic-ops"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            العودة للوحة الرئيسية
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">من</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">إلى</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">المنطقة</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            >
              <option value="all">الكل</option>
              {ZONE_OPTIONS.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">المشرف</label>
            <input
              value={supervisorCode}
              onChange={(e) => setSupervisorCode(e.target.value)}
              placeholder="all"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setApplied({ startDate, endDate })}
              className="w-full rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold py-2.5 text-sm"
            >
              تحديث
            </button>
          </div>
        </div>

        {trustQuery.data && <ExecutiveTrustCenter trustScore={trustQuery.data} />}

        {healthQuery.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
            {(healthQuery.error as Error).message}
          </div>
        )}

        {health && (
          <>
            <div
              className={`rounded-2xl border p-5 ${
                health.overall.status === 'healthy'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : health.overall.status === 'degraded'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-red-500/40 bg-red-500/10'
              }`}
            >
              <p className="text-xs text-[#94A3B8]">Overall System Health</p>
              <p className="text-5xl font-bold text-[#EAF0FF] mt-1">
                {health.overall.score}
                <span className="text-lg text-[#64748B]">/100</span>
              </p>
              <p className="text-sm text-[#94A3B8] mt-1">
                الحالة: {health.overall.status} — آخر فحص:{' '}
                {new Date(health.overall.lastCheck).toLocaleString('ar-EG')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SystemHealthCard
                title="Data Health"
                value={`${health.dataHealth.dataQualityScore}/100`}
                sub={`Ghost ${health.dataHealth.ghostLeakagePercent}% · Dup ${health.dataHealth.duplicateRecords}`}
                status={
                  health.dataHealth.dataQualityScore >= 85
                    ? 'healthy'
                    : health.dataHealth.dataQualityScore >= 70
                      ? 'degraded'
                      : 'critical'
                }
              />
              <SystemHealthCard
                title="API Health"
                value={`${health.apiHealth.responseTimeMs}ms`}
                sub={`Success ${health.apiHealth.successRate}%`}
                status={health.apiHealth.status}
              />
              <SystemHealthCard
                title="Google Sheets"
                value={health.dataHealth.googleSheetsConnectivity}
                sub={
                  health.dataHealth.sheetsLatencyMs != null
                    ? `Latency ${health.dataHealth.sheetsLatencyMs}ms`
                    : '—'
                }
                status={
                  health.dataHealth.googleSheetsConnectivity === 'connected'
                    ? 'healthy'
                    : health.dataHealth.googleSheetsConnectivity === 'slow'
                      ? 'degraded'
                      : 'critical'
                }
              />
              <SystemHealthCard
                title="Calculation Engine"
                value={
                  health.calculationEngine.auditAccuracyScore != null
                    ? `${health.calculationEngine.auditAccuracyScore}%`
                    : '—'
                }
                sub={`Failed: ${health.calculationEngine.failedCalculations}`}
                status={health.calculationEngine.status}
              />
              <SystemHealthCard
                title="Cache Health"
                value={health.cacheHealth.status}
                sub={health.cacheHealth.noteAr}
                status={health.cacheHealth.status}
              />
              <SystemHealthCard
                title="Memory Usage"
                value={
                  health.memoryUsage.heapUsedMb != null
                    ? `${health.memoryUsage.heapUsedMb} MB`
                    : 'N/A'
                }
                sub={
                  health.memoryUsage.rssMb != null ? `RSS ${health.memoryUsage.rssMb} MB` : undefined
                }
              />
              <SystemHealthCard
                title="Upload Status"
                value={`${health.dataHealth.uploadStatus.completenessPercent}%`}
                sub={`Missing ${health.dataHealth.uploadStatus.missingDays.length} days`}
                status={
                  health.dataHealth.uploadStatus.completenessPercent >= 90
                    ? 'healthy'
                    : health.dataHealth.uploadStatus.completenessPercent >= 80
                      ? 'degraded'
                      : 'critical'
                }
              />
              <SystemHealthCard
                title="Audit Status"
                value={health.auditStatus.overallStatus}
                sub={`P${health.auditStatus.passCount} W${health.auditStatus.warnCount} F${health.auditStatus.failCount}`}
                status={
                  health.auditStatus.overallStatus === 'PASS'
                    ? 'healthy'
                    : health.auditStatus.overallStatus === 'WARN'
                      ? 'degraded'
                      : health.auditStatus.overallStatus === 'FAIL'
                        ? 'critical'
                        : 'unknown'
                }
              />
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
              <h2 className="text-lg font-semibold text-[#EAF0FF]">Current Configuration</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                <ConfigRow label="Version" value={health.configuration.version} />
                <ConfigRow label="Target Hours" value={String(health.configuration.target)} />
                <ConfigRow label="City / Zone" value={health.configuration.city} />
                <ConfigRow label="Supervisor" value={health.configuration.supervisorFilter} />
                <ConfigRow label="Period Start" value={health.configuration.startDate} />
                <ConfigRow label="Period End" value={health.configuration.endDate} />
                <ConfigRow
                  label="Last Upload Date"
                  value={health.dataHealth.uploadStatus.lastUploadDate ?? '—'}
                />
                <ConfigRow
                  label="Data Freshness"
                  value={
                    health.dataHealth.dataFreshnessMinutes != null
                      ? `${health.dataHealth.dataFreshnessMinutes} min`
                      : '—'
                  }
                />
              </div>
              {health.dataHealth.uploadStatus.missingDays.length > 0 && (
                <p className="text-xs text-amber-300">
                  Missing days: {health.dataHealth.uploadStatus.missingDays.slice(0, 12).join(', ')}
                  {health.dataHealth.uploadStatus.missingDays.length > 12 ? '…' : ''}
                </p>
              )}
            </section>
          </>
        )}

        <LiveOperationsAudit
          auditReport={auditQuery.data}
          loading={auditQuery.isLoading || auditQuery.isFetching}
          onRefresh={() => setAuditForceKey((k) => k + 1)}
          onKpiClick={onKpiClick}
        />

        <KPILineageModal
          lineage={lineage}
          isOpen={lineageOpen}
          onClose={() => setLineageOpen(false)}
        />
      </div>
    </Layout>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] text-[#64748B]">{label}</p>
      <p className="text-sm font-semibold text-[#EAF0FF] truncate">{value}</p>
    </div>
  );
}
