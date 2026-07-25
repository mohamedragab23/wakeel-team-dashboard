'use client';

/**
 * SRS-010 Part 2 — Root Cause Tree.
 * Renders the causal chain for a critical KPI as a literal top-to-bottom
 * "because" chain, built from real data already computed by the Root Cause
 * Explainability engine (SRS-006 §7) — no invented narrative.
 */
import type { RootCauseExplanation } from '@/lib/strategicOps/trust/rootCauseExplainability';
import { resolveKpiFromText } from '@/lib/strategicOps/kpiIntelligence';
import type { FleetHourBucketId } from '@/lib/strategicOps/controlTower/fleetDistribution';

type Props = {
  explanations: RootCauseExplanation[];
  onOpenKpi?: (kpiId: string) => void;
  /** SRS-011 Part 3 — Root Cause Navigation: drill from KPI → hours → riders bucket in one click. */
  onOpenFleetBucket?: (bucketId: FleetHourBucketId) => void;
};

export function RootCauseTree({ explanations, onOpenKpi, onOpenFleetBucket }: Props) {
  const rows = explanations.slice(0, 5);
  if (rows.length === 0) {
    return <p className="text-sm text-[#64748B]">لا توجد أسباب جذرية محسوبة لهذه الفترة.</p>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      {rows.map((r) => {
        const kpiDef = resolveKpiFromText(r.kpiKey);
        const nodes: Array<{ labelAr: string; detailAr?: string; tone: 'root' | 'cause' | 'leaf' }> = [
          { labelAr: r.kpiKey, detailAr: r.whatHappenedAr, tone: 'root' },
        ];
        // Break whyAr (joined with " · ") back into individual causal factors.
        const factorLines = r.whyAr.split(' · ').filter(Boolean);
        for (const f of factorLines) {
          nodes.push({ labelAr: f, tone: 'cause' });
        }
        if (r.responsibleSupervisors.length > 0) {
          nodes.push({
            labelAr: `المشرفون الأكثر تأثيرًا: ${r.responsibleSupervisors.map((s) => `${s.name} (${s.contribution})`).join('، ')}`,
            tone: 'leaf',
          });
        }
        if (r.hoursLost != null) {
          nodes.push({
            labelAr: `الأثر: -${r.hoursLost} ساعة${r.ordersLost != null ? ` · -${r.ordersLost} طلب` : ''}${
              r.financialCostEstimate != null ? ` · ≈ ${Math.round(r.financialCostEstimate).toLocaleString('ar-EG')} EGP` : ''
            }`,
            tone: 'leaf',
          });
        }

        return (
          <div key={r.kpiKey} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                onClick={() => kpiDef && onOpenKpi?.(kpiDef.id)}
                className={`text-sm font-semibold ${kpiDef ? 'text-cyan-300 hover:underline cursor-pointer' : 'text-[#EAF0FF]'}`}
              >
                {kpiDef?.labelAr ?? r.kpiKey} ↓
              </button>
              <span className="text-[10px] text-[#64748B]">ثقة التحليل: {r.confidenceLevel}</span>
            </div>
            <ol className="space-y-2">
              {nodes.map((n, idx) => (
                <li
                  key={`${r.kpiKey}-${idx}`}
                  className="flex items-start gap-2"
                  style={{ marginRight: `${idx * 14}px` }}
                >
                  <span className="text-[#64748B] text-xs mt-0.5">{idx === 0 ? '' : 'because ⬅ لأن'}</span>
                  <span
                    className={`text-xs ${
                      n.tone === 'root'
                        ? 'text-[#EAF0FF] font-semibold'
                        : n.tone === 'cause'
                          ? 'text-amber-200'
                          : 'text-[#94A3B8]'
                    }`}
                  >
                    {n.labelAr}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-cyan-300 mt-3">↗ الإصلاح المقترح: {r.suggestedFixAr}</p>
            <p className="text-[10px] text-[#64748B] mt-1">{r.expectedRecoveryAr}</p>
            {r.hoursLost != null && r.hoursLost > 0 && onOpenFleetBucket && (
              <button
                type="button"
                onClick={() => onOpenFleetBucket('under_4')}
                className="mt-2 text-[11px] text-emerald-300 hover:underline"
              >
                🔽 تابع السبب حتى الطيارين المتأثرين (توزيع الأسطول حسب الساعات) ←
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
