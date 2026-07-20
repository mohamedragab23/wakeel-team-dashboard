'use client';

import { useMemo, useState } from 'react';
import type { AuditResult, LiveAuditReport } from '@/lib/strategicOps/audit';
import { SECTION_TITLES } from '@/lib/strategicOps/audit';
import { AuditResultRow } from './AuditResultRow';

type Props = {
  auditReport: LiveAuditReport | null | undefined;
  loading?: boolean;
  onKpiClick?: (result: AuditResult) => void;
  onRefresh?: () => void;
};

export function LiveOperationsAudit({ auditReport, loading, onKpiClick, onRefresh }: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ A: true });

  const sectionKeys = useMemo(() => {
    if (!auditReport) return [];
    return Object.keys(auditReport.sections).sort();
  }, [auditReport]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse">
        <p className="text-sm text-[#94A3B8]">جاري تشغيل Live Operations Audit...</p>
      </div>
    );
  }

  if (!auditReport) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#94A3B8]">لم يُشغَّل التدقيق بعد.</p>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs"
          >
            تشغيل التدقيق
          </button>
        )}
      </div>
    );
  }

  const statusColor =
    auditReport.overallStatus === 'PASS'
      ? 'text-emerald-300'
      : auditReport.overallStatus === 'WARN'
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">Live Operations Audit</h2>
          <p className="text-xs text-[#64748B] mt-1">
            مقارنة Expected vs Calculated لكل مؤشر — بدون Terminal
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            إعادة التشغيل
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs text-[#94A3B8]">دقة التدقيق</p>
          <p className={`text-4xl font-bold ${statusColor}`}>{auditReport.accuracyScore}%</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 px-2 py-1">
            PASS {auditReport.passCount}
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/15 text-amber-200 px-2 py-1">
            WARN {auditReport.warnCount}
          </span>
          <span className="rounded-md border border-red-500/30 bg-red-500/15 text-red-200 px-2 py-1">
            FAIL {auditReport.failCount}
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 text-[#94A3B8] px-2 py-1">
            {auditReport.totalChecks} فحص — {auditReport.durationMs}ms
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {sectionKeys.map((key) => {
          const rows = auditReport.sections[key] ?? [];
          const open = openSections[key] ?? false;
          const fails = rows.filter((r) => r.status === 'FAIL').length;
          const warns = rows.filter((r) => r.status === 'WARN').length;
          return (
            <div key={key} className="rounded-xl border border-white/10 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-black/30 text-sm text-[#EAF0FF]"
                onClick={() => setOpenSections((s) => ({ ...s, [key]: !open }))}
              >
                <span>
                  {open ? '▼' : '▶'} Section {key}: {SECTION_TITLES[key] ?? key}
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  {rows.length} · FAIL {fails} · WARN {warns}
                </span>
              </button>
              {open && (
                <div className="p-2 space-y-1.5">
                  {rows.map((r) => (
                    <AuditResultRow key={r.id} result={r} onClick={onKpiClick} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-[#64748B]">
        آخر تشغيل: {new Date(auditReport.generatedAt).toLocaleString('ar-EG')} —{' '}
        {auditReport.filters.startDate} → {auditReport.filters.endDate} · {auditReport.filters.zone}
      </p>
    </section>
  );
}
