'use client';

import type { ExecutiveDecision } from '@/lib/strategicOps/digitalTwin';

type Props = { decision: ExecutiveDecision };

export function ExecutiveDecisionCard({ decision }: Props) {
  const bg =
    decision.answerAr === 'نعم'
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : decision.answerAr === 'بحذر'
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-red-500/40 bg-red-500/10';

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${bg}`} dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#EAF0FF]">قرار تنفيذي</h3>
        <span className="text-2xl font-bold text-[#EAF0FF]">{decision.answerAr}</span>
      </div>
      <p className="text-sm text-[#CBD5E1]">{decision.whyAr}</p>
      <p className="text-xs text-[#94A3B8]">{decision.expectedResultAr}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold text-emerald-200 mb-1">فوائد</p>
          <ul className="list-disc list-inside text-[#94A3B8] space-y-0.5">
            {decision.benefitsAr.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-amber-200 mb-1">مخاطر</p>
          <ul className="list-disc list-inside text-[#94A3B8] space-y-0.5">
            {decision.risksAr.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-cyan-200/90">بديل: {decision.alternativeAr}</p>
      <p className="text-[10px] text-[#64748B]">
        ثقة القرار {decision.confidence}% ({decision.confidenceLevel})
      </p>
    </div>
  );
}
