import type { ScenarioComparisonRow, SimulationResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Composite score: ROI + achievement gain − risk */
function score(r: SimulationResult): number {
  return (
    r.impact.financial.roiPercent * 0.35 +
    r.impact.deltas.achievement * 2 +
    r.impact.deltas.hours * 0.05 -
    r.impact.risk.overallRisk * 0.4
  );
}

export function compareScenarios(
  items: Array<{ id: string; title: string; result: SimulationResult }>
): ScenarioComparisonRow[] {
  if (items.length === 0) return [];

  let bestId = items[0].id;
  let bestScore = score(items[0].result);
  for (const item of items) {
    const s = score(item.result);
    if (s > bestScore) {
      bestScore = s;
      bestId = item.id;
    }
  }

  return items.map((item) => {
    const r = item.result;
    return {
      id: item.id,
      title: item.title,
      investment: r.impact.financial.totalInvestment,
      hours: r.impact.projected.actualHours,
      orders: r.impact.projected.orders,
      profit: r.impact.financial.profit,
      risk: r.impact.risk.overallRisk,
      roiPercent: r.impact.financial.roiPercent,
      growthRate: r.impact.deltas.growthRate,
      achievement: r.impact.projected.achievement,
      recommendationAr: r.decision.answerAr + ' — ' + r.decision.whyAr,
      isBest: item.id === bestId,
    };
  });
}

export function pickBestScenario(
  items: Array<{ id: string; title: string; result: SimulationResult }>
): { id: string; title: string; result: SimulationResult } | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (score(cur.result) > score(best.result) ? cur : best));
}
