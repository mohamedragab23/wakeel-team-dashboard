/**
 * SRS-006 §12 — Supervisor Fairness Engine (normalize by fleet size / target / active).
 */

import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';

export type FairSupervisorScore = {
  code: string;
  name: string;
  region: string;
  headcount: number;
  rawAchievement: number;
  /** Hours per assigned rider (size-normalized) */
  hoursPerRider: number;
  /** Active / headcount */
  attendanceProxy: number;
  /** Achievement vs own target */
  targetEfficiency: number;
  /** Size-normalized composite 0–100 */
  fairScore: number;
  peerPercentile: number;
  rank: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSupervisorFairnessRanking(rows: SupervisorOpsRow[]): FairSupervisorScore[] {
  if (rows.length === 0) return [];

  const scored = rows.map((s) => {
    const hoursPerRider = s.headcount > 0 ? s.dailyHours / s.headcount : 0;
    const attendanceProxy = s.headcount > 0 ? (s.activeRiders / s.headcount) * 100 : 0;
    const targetEfficiency = s.achievementPercent;
    // Fair score: rates only — not raw totals
    const fairScore = round2(
      targetEfficiency * 0.4 +
        Math.min(100, hoursPerRider * 12) * 0.25 +
        attendanceProxy * 0.25 +
        s.utilizationPercent * 0.1
    );
    return {
      code: s.code,
      name: s.name,
      region: s.region,
      headcount: s.headcount,
      rawAchievement: s.achievementPercent,
      hoursPerRider: round2(hoursPerRider),
      attendanceProxy: round2(attendanceProxy),
      targetEfficiency: round2(targetEfficiency),
      fairScore,
      peerPercentile: 0,
      rank: 0,
    };
  });

  scored.sort((a, b) => b.fairScore - a.fairScore);
  const n = scored.length;
  scored.forEach((s, i) => {
    s.rank = i + 1;
    s.peerPercentile = round2(((n - i) / n) * 100);
  });

  return scored;
}
