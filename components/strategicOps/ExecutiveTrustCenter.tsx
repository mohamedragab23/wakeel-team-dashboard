'use client';

import { useEffect, useState } from 'react';
import type { TrustScore } from '@/lib/strategicOps/trust';

type Props = {
  trustScore?: TrustScore | null;
  onViewDetails?: () => void;
  loading?: boolean;
  /** SRS-010 — Interconnected Tabs: canonical KPI id from `?kpi=` — highlights
   *  and auto-expands the trust component(s) that back that KPI's numbers. */
  focusKpiId?: string | null;
  onOpenKpi?: (kpiId: string) => void;
};

/** Which canonical KPI ids each trust component's score actually backs.
 *  Mirrors the same domain mapping used in Integrity/Validation Centers so a
 *  KPI clicked anywhere lands on the right evidence here too. */
const TRUST_COMPONENT_KPI_IDS: Record<keyof TrustScore['components'], string[]> = {
  dataCompleteness: ['active_riders', 'data_quality', 'target_achievement'],
  missingUploads: ['data_quality', 'forecast_accuracy'],
  ghostRiders: ['ghost_riders', 'active_riders'],
  duplicateRecords: ['ghost_riders', 'data_quality'],
  calculationSuccess: ['target_achievement', 'active_riders', 'utilization'],
  validationPass: ['trust_score'],
  apiHealth: ['trust_score'],
  lastAuditRecency: ['trust_score', 'target_achievement'],
  formulaValidation: ['target_achievement'],
  coverage: ['forecast_accuracy', 'data_quality'],
};

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-300';
  if (score >= 70) return 'text-amber-300';
  return 'text-red-300';
}

function bannerBg(status: TrustScore['status']): string {
  if (status === 'healthy') return 'border-emerald-500/40 bg-emerald-500/10';
  if (status === 'warning') return 'border-amber-500/40 bg-amber-500/10';
  return 'border-red-500/40 bg-red-500/10';
}

function pillColor(color: 'green' | 'amber' | 'red'): string {
  if (color === 'green') return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
  if (color === 'amber') return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  return 'bg-red-500/15 text-red-200 border-red-500/30';
}

export function ExecutiveTrustCenter({ trustScore, onViewDetails, loading, focusKpiId, onOpenKpi }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Auto-open the detailed breakdown when arriving with a focused KPI so the
  // matching component's evidence/cross-checks are visible immediately.
  useEffect(() => {
    if (focusKpiId) setExpanded(true);
  }, [focusKpiId]);

  if (loading || !trustScore) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse">
        <p className="text-sm text-[#94A3B8]">جاري حساب درجة الثقة التنفيذية...</p>
        <div className="mt-3 h-12 w-32 rounded-lg bg-white/10" />
      </div>
    );
  }

  const trendArrow =
    trustScore.trend === 'improving' ? '↑' : trustScore.trend === 'declining' ? '↓' : '→';

  const highlightKeys: Array<keyof TrustScore['components']> = [
    'dataCompleteness',
    'coverage',
    'ghostRiders',
    'apiHealth',
    'validationPass',
    'lastAuditRecency',
  ];
  const highlights = trustScore.componentDetails.filter((c) => highlightKeys.includes(c.key));
  const isFocusedComponent = (key: keyof TrustScore['components']) =>
    Boolean(focusKpiId && TRUST_COMPONENT_KPI_IDS[key]?.includes(focusKpiId));
  const focusedLabel = focusKpiId
    ? trustScore.componentDetails.find((c) => isFocusedComponent(c.key))?.labelAr
    : null;
  const componentDetailsOrdered = focusKpiId
    ? [...trustScore.componentDetails].sort(
        (a, b) => Number(isFocusedComponent(b.key)) - Number(isFocusedComponent(a.key))
      )
    : trustScore.componentDetails;

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${bannerBg(trustScore.status)}`} dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#94A3B8] mb-1">مركز الثقة التنفيذية — هل يمكن الوثوق بأرقام اليوم؟</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-5xl font-bold ${scoreColor(trustScore.overall)}`}>
              {trustScore.overall}
            </span>
            <span className="text-lg text-[#64748B]">/100</span>
            <span className="text-xl font-semibold text-[#EAF0FF] mr-2">{trustScore.gradeLabelAr}</span>
            <span className="text-sm text-[#94A3B8]">
              {trendArrow} {trustScore.trendLabelAr}
            </span>
          </div>
          <p className="text-sm text-[#EAF0FF]/90 mt-2 max-w-2xl">{trustScore.explanation}</p>
          <p className="text-xs text-[#94A3B8] mt-1">
            هل أثق بالأرقام؟{' '}
            <span className="font-semibold text-[#EAF0FF]">{trustScore.answerAr}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            {expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
          </button>
          {onViewDetails && (
            <button
              type="button"
              onClick={onViewDetails}
              className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs"
            >
              System Integrity Center ←
            </button>
          )}
        </div>
      </div>

      {focusKpiId && focusedLabel && (
        <p className="text-xs text-cyan-200 -mt-1 flex items-center gap-2 flex-wrap">
          <span>
            🔗 مكوّن الثقة المرتبط بهذا المؤشر: <span className="font-semibold">{focusedLabel}</span> — تم إبرازه أدناه.
          </span>
          {onOpenKpi && (
            <button
              type="button"
              onClick={() => onOpenKpi(focusKpiId)}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-100 hover:bg-cyan-500/20"
            >
              فتح تفاصيل المؤشر
            </button>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {highlights.map((c) => (
          <div
            key={c.key}
            className={`rounded-xl border px-3 py-2 text-xs ${pillColor(c.color)} ${
              isFocusedComponent(c.key) ? 'ring-2 ring-cyan-400/60' : ''
            }`}
            title={`${c.explanation}\n${c.rootCause}`}
          >
            <p className="opacity-80 mb-0.5">{c.labelAr}</p>
            <p className="text-sm font-bold">{c.score}</p>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          {trustScore.rootCauses.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#EAF0FF] mb-1">الأسباب الجذرية</p>
              <ul className="list-disc list-inside text-xs text-[#94A3B8] space-y-1">
                {trustScore.rootCauses.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {trustScore.suggestedActions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#EAF0FF] mb-1">إجراءات مقترحة</p>
              <ul className="list-disc list-inside text-xs text-[#94A3B8] space-y-1">
                {trustScore.suggestedActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {componentDetailsOrdered.map((c) => (
              <div
                key={c.key}
                className={`rounded-xl border border-white/10 bg-black/20 p-3 text-xs space-y-1.5 ${
                  isFocusedComponent(c.key) ? 'ring-2 ring-cyan-400/60' : ''
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-[#EAF0FF]">
                    {isFocusedComponent(c.key) && '🔗 '}
                    {c.labelAr}
                  </span>
                  <span className={scoreColor(c.score)}>{c.score}/100</span>
                </div>
                <p className="text-[#94A3B8]">{c.explanation}</p>
                <p className="text-[#64748B]">لماذا الثقة منخفضة هنا: {c.rootCause}</p>

                {/* SRS-011 Part 7 — checklist-style ✅ (satisfied) / ⚠ (missing) instead of plain bullets */}
                {(c.evidenceAr.length > 0 || c.crossChecksAr.length > 0) && (
                  <div>
                    <p className="text-[10px] text-[#64748B]/80">لماذا؟ (Why this score):</p>
                    <ul className="space-y-0.5">
                      {c.evidenceAr.map((e) => (
                        <li key={e} className="text-[#CBD5E1] flex items-start gap-1.5">
                          <span className="text-emerald-400 shrink-0">✅</span>
                          <span>{e}</span>
                        </li>
                      ))}
                      {c.crossChecksAr.map((e) => (
                        <li key={e} className="text-[#CBD5E1] flex items-start gap-1.5">
                          <span className="text-emerald-400 shrink-0">✅</span>
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.missingValidationsAr.length > 0 && (
                  <div>
                    <p className="text-[10px] text-amber-300/80">للوصول إلى 100%:</p>
                    <ul className="space-y-0.5">
                      {c.missingValidationsAr.map((e) => (
                        <li key={e} className="text-amber-200 flex items-start gap-1.5">
                          <span className="text-amber-400 shrink-0">⚠</span>
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-cyan-300/80">الإجراء: {c.suggestedAction}</p>
                <p className="text-emerald-300/90 font-semibold">
                  تحسّن متوقع لهذا المكوّن: {c.improvementPathAr}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-cyan-200/80">
            💡 بعد تنفيذ الإجراءات المطلوبة أعلاه، أعد تشغيل Validation (Ops Validation Center) لتأكيد ارتفاع الدرجة.
          </p>
          <p className="text-[10px] text-[#64748B]">
            آخر حساب: {new Date(trustScore.lastCalculated).toLocaleString('ar-EG')}
          </p>
        </div>
      )}
    </section>
  );
}
