/**
 * SRS-007 §16 — Mature optimization engine (multi-objective plan).
 */

import { hiringNeededForGap } from './hiringSimulation';
import type { DigitalTwinState, OptimizationHint, ScenarioLevers } from './types';
import { runSimulation } from './scenarioEngine';

export type OptimalPlan = {
  recommendedLevers: ScenarioLevers;
  score: number;
  hints: OptimizationHint[];
  rationaleAr: string[];
  expectedAchievement: number;
  expectedInvestment: number;
  expectedRisk: number;
};

function scoreResult(achievement: number, roi: number, risk: number, investment: number): number {
  return achievement * 0.45 + Math.min(100, roi) * 0.25 - risk * 0.25 - Math.min(40, investment / 50000) * 0.05;
}

/**
 * Grid-search a small set of high-value lever combinations and pick the best.
 */
export function generateOptimalPlan(twin: DigitalTwinState): OptimalPlan {
  const gap = Math.max(0, twin.fleet.targetHours - twin.fleet.actualHours);
  const hireNeed = hiringNeededForGap(gap, twin.fleet.avgHours || 5);

  const candidates: Array<{ title: string; levers: ScenarioLevers }> = [
    { title: 'إنتاجية فقط', levers: { absenteeismReductionPercent: 20, breakReductionPercent: 15, noShowRecoveryPct: 60 } },
    { title: 'تعيين جزئي', levers: { hireRiders: Math.min(20, hireNeed), noShowRecoveryPct: 40 } },
    { title: 'تعيين كامل الفجوة', levers: { hireRiders: hireNeed } },
    { title: 'مزيج متوازن', levers: { hireRiders: Math.ceil(hireNeed * 0.4), absenteeismReductionPercent: 15, breakReductionPercent: 10, reallocateRiders: 15 } },
    { title: 'إعادة توزيع مشرفين', levers: { replaceWeakSupervisor: true, reallocateRiders: 25, noShowRecoveryPct: 30 } },
  ];

  let best = candidates[0];
  let bestScore = -Infinity;
  let bestRun = runSimulation(twin, best.levers);

  for (const c of candidates) {
    const r = runSimulation(twin, c.levers);
    const s = scoreResult(
      r.impact.projected.achievement,
      r.impact.financial.roiPercent,
      r.impact.risk.overallRisk,
      r.impact.financial.totalInvestment
    );
    if (s > bestScore) {
      bestScore = s;
      best = c;
      bestRun = r;
    }
  }

  return {
    recommendedLevers: best.levers,
    score: Math.round(bestScore * 100) / 100,
    hints: bestRun.optimizationHints,
    rationaleAr: [
      `الخطة المختارة: ${best.title}`,
      `إنجاز متوقع ${bestRun.impact.projected.achievement}%`,
      `استثمار ${bestRun.impact.financial.totalInvestment} ${twin.economics.currency}`,
      `مخاطر ${bestRun.impact.risk.overallRisk}/100`,
      bestRun.decision.whyAr,
    ],
    expectedAchievement: bestRun.impact.projected.achievement,
    expectedInvestment: bestRun.impact.financial.totalInvestment,
    expectedRisk: bestRun.impact.risk.overallRisk,
  };
}
