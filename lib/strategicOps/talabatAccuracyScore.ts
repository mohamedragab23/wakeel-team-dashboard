import type { TalabatFleetMetrics } from '@/lib/strategicOps/talabatOpsMetrics';

export type TalabatBenchmarkInput = {
  active?: number;
  noShow?: number;
  hours?: number;
  achievement?: number;
};

export type TalabatKpiMatch = {
  kpiKey: 'active' | 'noShow' | 'hours' | 'achievement';
  kpiLabelAr: string;
  dashboardValue: number;
  talabatValue: number | null;
  deviationPercent: number | null;
  matchPercent: number | null;
  withinTolerance: boolean | null;
};

export type TalabatAccuracyScore = {
  title: 'TALABAT ACCURACY SCORE';
  matches: TalabatKpiMatch[];
  overallAccuracyPercent: number | null;
  allWithinTolerance: boolean | null;
  goalMet: boolean | null;
  tolerancePercent: number;
  goalPercent: number;
  providedBenchmarkCount: number;
};

const TOLERANCE_PERCENT = 2;
const GOAL_PERCENT = 95;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMatch(
  kpiKey: TalabatKpiMatch['kpiKey'],
  kpiLabelAr: string,
  dashboardValue: number,
  talabatValue: number | undefined
): TalabatKpiMatch {
  if (talabatValue === undefined || talabatValue === null || !Number.isFinite(talabatValue)) {
    return {
      kpiKey,
      kpiLabelAr,
      dashboardValue: round2(dashboardValue),
      talabatValue: null,
      deviationPercent: null,
      matchPercent: null,
      withinTolerance: null,
    };
  }

  const deviationPercent =
    talabatValue === 0
      ? dashboardValue === 0
        ? 0
        : 100
      : round2((Math.abs(dashboardValue - talabatValue) / Math.abs(talabatValue)) * 100);
  const matchPercent = round2(Math.max(0, 100 - deviationPercent));
  const withinTolerance = deviationPercent < TOLERANCE_PERCENT;

  return {
    kpiKey,
    kpiLabelAr,
    dashboardValue: round2(dashboardValue),
    talabatValue: round2(talabatValue),
    deviationPercent,
    matchPercent,
    withinTolerance,
  };
}

export function buildTalabatAccuracyScore(
  metrics: TalabatFleetMetrics,
  benchmark: TalabatBenchmarkInput
): TalabatAccuracyScore {
  const matches: TalabatKpiMatch[] = [
    computeMatch('active', 'الطيارون النشطون', metrics.activeRiders, benchmark.active),
    computeMatch('noShow', 'No Show', metrics.noShowRiders, benchmark.noShow),
    computeMatch('hours', 'الساعات الفعلية', metrics.actualHours, benchmark.hours),
    computeMatch(
      'achievement',
      'نسبة تحقيق الهدف',
      metrics.achievementPercent,
      benchmark.achievement
    ),
  ];

  const withBenchmark = matches.filter((m) => m.matchPercent !== null);
  const overallAccuracyPercent =
    withBenchmark.length > 0
      ? round2(withBenchmark.reduce((s, m) => s + (m.matchPercent ?? 0), 0) / withBenchmark.length)
      : null;

  const allWithinTolerance =
    withBenchmark.length > 0 ? withBenchmark.every((m) => m.withinTolerance === true) : null;

  const goalMet =
    overallAccuracyPercent !== null ? overallAccuracyPercent >= GOAL_PERCENT : null;

  return {
    title: 'TALABAT ACCURACY SCORE',
    matches,
    overallAccuracyPercent,
    allWithinTolerance,
    goalMet,
    tolerancePercent: TOLERANCE_PERCENT,
    goalPercent: GOAL_PERCENT,
    providedBenchmarkCount: withBenchmark.length,
  };
}
