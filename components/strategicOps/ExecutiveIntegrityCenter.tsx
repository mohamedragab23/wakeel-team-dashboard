'use client';

/**
 * SRS-010 Part 5 — Executive Integrity Center.
 * Converts every FAIL/WARN Live Audit result into a business card:
 * Problem / Business impact / Why it happened / How to fix / Estimated
 * time / Severity / Responsible module + "Fix Guide" button.
 * The raw technical audit (Formula/Expected/Calculated) stays available
 * below for engineers — this is the executive-facing layer above it.
 */
import { useMemo, useState } from 'react';
import type { AuditResult, LiveAuditReport } from '@/lib/strategicOps/audit';
import {
  explainAuditReportForExecutive,
  type ExecutiveAuditExplain,
} from '@/lib/strategicOps/systemHealth/executiveExplain';

type Props = {
  auditReport: LiveAuditReport | null | undefined;
  loading?: boolean;
  onOpenKpi?: (kpiId: string) => void;
  onOpenLineage?: (result: AuditResult) => void;
  /** Optional canonical KPI id from `?kpi=` — highlights matching cards first. */
  focusKpiId?: string | null;
};

const SEVERITY_STYLES: Record<ExecutiveAuditExplain['severity'], string> = {
  critical: 'border-red-500/40 bg-red-500/10',
  high: 'border-orange-500/40 bg-orange-500/10',
  medium: 'border-amber-500/40 bg-amber-500/10',
  low: 'border-white/10 bg-white/5',
};

export function ExecutiveIntegrityCenter({
  auditReport,
  loading,
  onOpenKpi,
  onOpenLineage,
  focusKpiId,
}: Props) {
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);

  const explains = useMemo(() => {
    if (!auditReport) return [];
    const all = explainAuditReportForExecutive(auditReport.results);
    if (!focusKpiId) return all;
    // Focused KPI's issues float to the top without hiding the rest.
    return [...all].sort((a, b) => {
      const aMatch = a.affectedKpiIds.includes(focusKpiId) ? 1 : 0;
      const bMatch = b.affectedKpiIds.includes(focusKpiId) ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [auditReport, focusKpiId]);

  const resultById = useMemo(() => {
    const map = new Map<string, AuditResult>();
    for (const r of auditReport?.results ?? []) map.set(r.id, r);
    return map;
  }, [auditReport]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse">
        <p className="text-sm text-[#94A3B8]">جاري تحليل نتائج التدقيق تنفيذيًا...</p>
      </div>
    );
  }

  if (!auditReport) return null;

  if (explains.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5" dir="rtl">
        <p className="text-sm font-semibold text-emerald-200">✅ لا توجد مشاكل تشغيلية مفتوحة</p>
        <p className="text-xs text-[#94A3B8] mt-1">
          كل الفحوصات ({auditReport.totalChecks}) ناجحة — الأرقام المعروضة اليوم مطابقة للحساب المستقل.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#EAF0FF]">
          🛡️ Executive Integrity Center — {explains.length} مشكلة تحتاج قرار
        </h3>
        <p className="text-[11px] text-[#64748B]">
          كل بطاقة = مشكلة حقيقية من Live Operations Audit، مُترجمة إلى تأثير تجاري وخطوات إصلاح.
        </p>
      </div>

      <div className="space-y-2.5">
        {explains.map((ex) => {
          const raw = resultById.get(ex.id);
          const isFocused = focusKpiId != null && ex.affectedKpiIds.includes(focusKpiId);
          return (
            <div
              key={ex.id}
              className={`rounded-xl border p-4 ${SEVERITY_STYLES[ex.severity]} ${
                isFocused ? 'ring-2 ring-cyan-400/60' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{ex.severityLabelAr}</span>
                  <span className="text-sm font-semibold text-[#EAF0FF]">{ex.problemAr}</span>
                </div>
                <span className="text-[10px] text-[#64748B] shrink-0">⏱ {ex.estimatedTimeAr}</span>
              </div>

              <p className="text-xs text-[#CBD5E1] mt-2">
                <span className="text-[#94A3B8]">التأثير التجاري: </span>
                {ex.businessImpactAr}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">
                <span className="text-[#64748B]">لماذا حدثت: </span>
                {ex.whyAr}
              </p>

              {/* SRS-011 Part 6 — current score, expected result after fix, intervention type */}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                <span className="text-[#94A3B8]">
                  الحالة الآن: <span className="font-semibold text-amber-200">{ex.currentMatchPercent}%</span>
                </span>
                <span className="text-[#64748B]">←</span>
                <span className="text-[#94A3B8]">
                  النتيجة المتوقعة بعد الإصلاح: <span className="font-semibold text-emerald-300">{ex.expectedResultPercent}%</span>
                </span>
                <span className="text-[10px] text-cyan-200/90">{ex.interventionTypeLabelAr}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setOpenGuideId((v) => (v === ex.id ? null : ex.id))}
                  className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs"
                >
                  {openGuideId === ex.id ? 'إخفاء دليل الإصلاح' : '🛠 Fix Guide'}
                </button>
                {raw && onOpenLineage && (
                  <button
                    type="button"
                    onClick={() => onOpenLineage(raw)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
                  >
                    عرض المصدر الفني (Lineage)
                  </button>
                )}
                {onOpenKpi && ex.affectedKpiIds[0] && (
                  <button
                    type="button"
                    onClick={() => onOpenKpi(ex.affectedKpiIds[0])}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-white/10"
                  >
                    🔗 المؤشر المرتبط
                  </button>
                )}
                <span className="text-[10px] text-[#64748B]">المسؤول: {ex.responsibleModuleAr}</span>
              </div>

              {openGuideId === ex.id && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="text-xs font-semibold text-cyan-200 mb-1.5">الإصلاح الموصى به</p>
                  <p className="text-xs text-[#CBD5E1] mb-2">{ex.howToFixAr}</p>
                  <ol className="list-decimal list-inside space-y-1">
                    {ex.fixGuideStepsAr.map((step, i) => (
                      <li key={i} className="text-[11px] text-[#94A3B8]">
                        {step}
                      </li>
                    ))}
                  </ol>
                  {ex.affectedKpiIds.length > 0 && (
                    <p className="text-[10px] text-[#64748B] mt-2">
                      المؤشرات المتأثرة: {ex.affectedKpiIds.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
