'use client';

/**
 * SRS-011 Part 2 — Executive Decision Feed.
 * Replaces "dozens of cards" with a single clickable decision timeline,
 * grouped by urgency: 🔴 عاجل (critical/high) → 🟡 متوسط (medium/low) →
 * 🟢 فرصة (positive, non-problem opportunities). Every row is collapsed by
 * default; clicking expands the full why/action/owner/confidence detail —
 * the same underlying data as the full Action Engine cards, just reframed
 * as decisions instead of a wall of cards.
 */
import { useState } from 'react';
import type { ManagementAction } from '@/lib/strategicOps/controlTower/types';
import type { DecisionOpportunity } from '@/lib/strategicOps/controlTower/decisionFeed';
import { getKpiDef } from '@/lib/strategicOps/kpiIntelligence';

type DecisionConfidence = {
  confidencePercent: number;
  confidenceLevel: string;
  evidenceAr: string[];
  historicalBasisAr: string;
  businessRuleUsedAr: string;
  expectedGainAr: string;
  expectedRiskAr: string;
  whyExistsAr: string;
};

type Props = {
  actions: ManagementAction[];
  opportunities: DecisionOpportunity[];
  decisionConfidenceById?: Map<string, DecisionConfidence>;
  onOpenKpi?: (kpiId: string) => void;
};

const URGENCY_LABEL: Record<string, string> = {
  immediate: 'فوري',
  this_week: 'هذا الأسبوع',
  this_month: 'هذا الشهر',
};

export function ExecutiveDecisionFeed({ actions, opportunities, decisionConfidenceById, onOpenKpi }: Props) {
  const critical = actions.filter((a) => a.priority === 'critical' || a.priority === 'high');
  const mediumOnes = actions.filter((a) => a.priority === 'medium' || a.priority === 'low');

  if (critical.length === 0 && mediumOnes.length === 0 && opportunities.length === 0) return null;

  return (
    <section className="space-y-3" dir="rtl">
      <h3 className="text-sm font-semibold text-[#EAF0FF]">
        🗓️ خط سير القرارات التنفيذية — Executive Decision Feed
      </h3>
      <div className="relative border-r border-white/10 pr-4 space-y-2.5">
        {critical.map((a) => (
          <FeedRow
            key={a.id}
            icon="🔴"
            tone="critical"
            action={a}
            confidence={decisionConfidenceById?.get(a.id)}
            onOpenKpi={onOpenKpi}
          />
        ))}
        {mediumOnes.map((a) => (
          <FeedRow
            key={a.id}
            icon="🟡"
            tone="medium"
            action={a}
            confidence={decisionConfidenceById?.get(a.id)}
            onOpenKpi={onOpenKpi}
          />
        ))}
        {opportunities.map((o) => (
          <OpportunityRow key={o.id} opportunity={o} />
        ))}
      </div>
    </section>
  );
}

function FeedRow({
  icon,
  tone,
  action,
  confidence,
  onOpenKpi,
}: {
  icon: string;
  tone: 'critical' | 'medium';
  action: ManagementAction;
  confidence?: DecisionConfidence;
  onOpenKpi?: (kpiId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const toneClass =
    tone === 'critical'
      ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
      : 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10';
  const confidencePercent = confidence?.confidencePercent ?? null;

  return (
    <div className={`rounded-xl border ${toneClass} transition-colors`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center gap-2 px-3 py-2.5 text-right"
      >
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold text-[#EAF0FF]">{action.entityName}</span>
        <span className="text-xs text-[#94A3B8]">— {action.problemAr}</span>
        {action.urgency && (
          <span className="text-[10px] text-[#64748B] mr-auto">{URGENCY_LABEL[action.urgency] ?? action.urgency}</span>
        )}
        {confidencePercent != null && <span className="text-[10px] text-cyan-300">الثقة: {confidencePercent}%</span>}
        <span className="text-[10px] text-[#64748B]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs text-[#CBD5E1]">
          {action.whyAr && <p className="text-[#94A3B8] italic">السبب: {action.whyAr}</p>}
          <p className="text-cyan-200/90">
            <span className="text-[#64748B]">الإجراء: </span>
            {action.actionAr}
          </p>
          <div className="flex flex-wrap gap-3 text-[11px]">
            {action.ownerAr && (
              <span>
                <span className="text-[#64748B]">المسؤول: </span>
                {action.ownerAr}
              </span>
            )}
            {action.deadlineAr && (
              <span>
                <span className="text-[#64748B]">الموعد: </span>
                <span className="text-amber-200">{action.deadlineAr}</span>
              </span>
            )}
            <span className="text-emerald-300">↗ +{action.deduplicatedRecoveryHours} س/يوم</span>
            {action.riderCount ? <span className="text-[#64748B]">👥 {action.riderCount} طيار</span> : null}
          </div>
          {action.riskIfIgnoredAr && (
            <p className="text-amber-200/90">⚠️ إذا تم التجاهل: {action.riskIfIgnoredAr}</p>
          )}
          {confidence && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-1">
              <p>{confidence.whyExistsAr}</p>
              <p className="text-emerald-300/90">مكسب: {confidence.expectedGainAr}</p>
              <p className="text-amber-300/90">مخاطر: {confidence.expectedRiskAr}</p>
            </div>
          )}
          {action.affectedKpiIds && action.affectedKpiIds.length > 0 && onOpenKpi && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[#64748B]">مؤشرات متأثرة: </span>
              {action.affectedKpiIds.map((kpiId) => {
                const def = getKpiDef(kpiId);
                if (!def) return null;
                return (
                  <button
                    key={kpiId}
                    type="button"
                    onClick={() => onOpenKpi(kpiId)}
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-200 hover:bg-cyan-500/20"
                  >
                    {def.labelAr}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityRow({ opportunity }: { opportunity: DecisionOpportunity }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center gap-2 px-3 py-2.5 text-right"
      >
        <span className="text-base">🟢</span>
        <span className="text-xs font-semibold text-[#EAF0FF]">{opportunity.titleAr}</span>
        <span className="text-xs text-emerald-200/90">— فرصة تحسين سهلة</span>
        <span className="text-[10px] text-[#64748B] mr-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1 text-xs text-[#CBD5E1]">
          <p className="text-[#94A3B8]">{opportunity.reasonAr}</p>
          <p className="text-emerald-200/90">
            <span className="text-[#64748B]">الإجراء: </span>
            {opportunity.actionAr}
          </p>
        </div>
      )}
    </div>
  );
}
