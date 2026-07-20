'use client';

import { useState } from 'react';
import type { TrustScore } from '@/lib/strategicOps/trust';

type Props = {
  trustScore?: TrustScore | null;
  onViewDetails?: () => void;
  loading?: boolean;
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

export function ExecutiveTrustCenter({ trustScore, onViewDetails, loading }: Props) {
  const [expanded, setExpanded] = useState(false);

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {highlights.map((c) => (
          <div
            key={c.key}
            className={`rounded-xl border px-3 py-2 text-xs ${pillColor(c.color)}`}
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
            {trustScore.componentDetails.map((c) => (
              <div key={c.key} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                <div className="flex justify-between gap-2 mb-1">
                  <span className="font-semibold text-[#EAF0FF]">{c.labelAr}</span>
                  <span className={scoreColor(c.score)}>{c.score}/100</span>
                </div>
                <p className="text-[#94A3B8]">{c.explanation}</p>
                <p className="text-[#64748B] mt-1">السبب: {c.rootCause}</p>
                <p className="text-cyan-300/80 mt-1">الإجراء: {c.suggestedAction}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#64748B]">
            آخر حساب: {new Date(trustScore.lastCalculated).toLocaleString('ar-EG')}
          </p>
        </div>
      )}
    </section>
  );
}
