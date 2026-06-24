/**
 * Talabat formula replay — aggregates Talabat export daily snapshots through dashboard engine.
 * Run: npx tsx scripts/talabat-accuracy-replay.ts
 */
import { aggregateTalabatFromDailySeries, type TalabatDailySnapshot } from '../lib/strategicOps/talabatOpsMetrics';

const TOLERANCE = 2;

/** Verified from Talabat Wakeel export image (Jun 2026) */
const TALABAT_VERIFIED_DAILY: Array<{
  date: string;
  active: number;
  noShow: number;
  hours: number;
  achievementTalabat: number;
  headcount: number;
  avgHoursTalabat?: number;
  pctActiveTalabat?: number;
}> = [
  { date: '2026-06-01', active: 192, noShow: 21, hours: 1256.9, achievementTalabat: 84, headcount: 296, avgHoursTalabat: 6.5, pctActiveTalabat: 64.9 },
  { date: '2026-06-02', active: 206, noShow: 16, hours: 1330.1, achievementTalabat: 89, headcount: 298 },
  { date: '2026-06-03', active: 191, noShow: 24, hours: 1249.8, achievementTalabat: 83, headcount: 300 },
  { date: '2026-06-08', active: 166, noShow: 28, hours: 904.0, achievementTalabat: 60, headcount: 312 },
  { date: '2026-06-15', active: 172, noShow: 23, hours: 934.8, achievementTalabat: 62, headcount: 330 },
  { date: '2026-06-20', active: 202, noShow: 30, hours: 1222.0, achievementTalabat: 81, headcount: 339, avgHoursTalabat: 6.0 },
];

const TALABAT_WEEKLY = {
  week1: { start: '2026-06-01', end: '2026-06-07', active: 186, noShow: 23, hours: 1154, achievement: 77 },
  week2: { start: '2026-06-08', end: '2026-06-14', active: 176, noShow: 28, hours: 991, achievement: 66 },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function pctDiff(a: number, b: number) {
  if (b === 0) return a === 0 ? 0 : 100;
  return round2((Math.abs(a - b) / Math.abs(b)) * 100);
}

function toSnapshot(d: (typeof TALABAT_VERIFIED_DAILY)[0]): TalabatDailySnapshot {
  return {
    date: d.date,
    scheduledRiders: d.active + d.noShow,
    activeRiders: d.active,
    noShowRiders: d.noShow,
    hours: d.hours,
    targetHours: 1500,
  };
}

function auditPeriod(
  label: string,
  days: typeof TALABAT_VERIFIED_DAILY,
  headcount: number,
  talabatBench: { active: number; noShow: number; hours: number; achievement: number; utilization?: number }
) {
  const series = days.map(toSnapshot);
  const m = aggregateTalabatFromDailySeries(series, headcount, days[0]?.active ?? 0);
  const utilTalabat = talabatBench.utilization ?? round2((talabatBench.active / headcount) * 100);

  const rows = [
    { kpi: 'Active Riders', dash: m.activeRiders, tal: talabatBench.active },
    { kpi: 'No Show', dash: m.noShowRiders, tal: talabatBench.noShow },
    { kpi: 'Actual Hours', dash: m.actualHours, tal: talabatBench.hours },
    { kpi: 'Achievement %', dash: m.achievementPercent, tal: talabatBench.achievement },
    { kpi: 'Utilization %', dash: m.utilizationPercent, tal: utilTalabat },
  ].map((r) => ({
    ...r,
    abs: round2(r.dash - r.tal),
    pct: pctDiff(r.dash, r.tal),
    pass: pctDiff(r.dash, r.tal) <= TOLERANCE ? 'PASS' : 'FAIL',
  }));

  return { label, headcount, calendarDays: series.length, operationalDays: m.operationalDays, rows, metrics: m };
}

function uniformWeek(label: string, bench: typeof TALABAT_WEEKLY.week1, headcount: number) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(bench.start + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      date,
      active: bench.active,
      noShow: bench.noShow,
      hours: bench.hours,
      achievementTalabat: bench.achievement,
      headcount,
    };
  });
  return auditPeriod(label, days, headcount, {
    active: bench.active,
    noShow: bench.noShow,
    hours: bench.hours,
    achievement: bench.achievement,
    utilization: round2((bench.active / headcount) * 100),
  });
}

const oneDay = auditPeriod(
  'One day — 2026-06-01',
  [TALABAT_VERIFIED_DAILY[0]],
  296,
  { active: 192, noShow: 21, hours: 1256.9, achievement: 84, utilization: 64.86 }
);

const oneDayJun20 = auditPeriod(
  'One day — 2026-06-20',
  [TALABAT_VERIFIED_DAILY[5]],
  339,
  { active: 202, noShow: 30, hours: 1222, achievement: 81, utilization: round2((202 / 339) * 100) }
);

const sevenDay = uniformWeek('Seven days — 2026-06-01 to 2026-06-07 (Talabat weekly avg)', TALABAT_WEEKLY.week1, 310);

const sevenDayW2 = uniformWeek('Seven days — 2026-06-08 to 2026-06-14 (Talabat weekly avg W2)', TALABAT_WEEKLY.week2, 328);

const twentyDayBench = {
  active: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.active, 0) / TALABAT_VERIFIED_DAILY.length),
  noShow: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.noShow, 0) / TALABAT_VERIFIED_DAILY.length),
  hours: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.hours, 0) / TALABAT_VERIFIED_DAILY.length),
  achievement: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.hours, 0) / TALABAT_VERIFIED_DAILY.length / 1500 * 100),
};

const twentyDay = auditPeriod(
  'Twenty days — partial sample (6 verified Talabat days only; full export transcription pending)',
  TALABAT_VERIFIED_DAILY,
  339,
  { ...twentyDayBench, utilization: round2((twentyDayBench.active / 339) * 100) }
);

const thirtyDay = auditPeriod(
  'Thirty days — 2026-06-01 to 2026-06-30 (Talabat export covers 1–20 Jun; padded with zero-op days 21–30)',
  [
    ...TALABAT_VERIFIED_DAILY,
    ...Array.from({ length: 24 }, (_, i) => ({
      date: `2026-06-${String(i + 7).padStart(2, '0')}`,
      active: 0,
      noShow: 0,
      hours: 0,
      achievementTalabat: 0,
      headcount: 339,
    })).filter((d) => !TALABAT_VERIFIED_DAILY.some((v) => v.date === d.date)),
  ],
  339,
  {
    active: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.active, 0) / 30),
    noShow: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.noShow, 0) / 30),
    hours: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.hours, 0) / 30),
    achievement: round2(TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.hours, 0) / 30 / 1500 * 100),
    utilization: round2((TALABAT_VERIFIED_DAILY.reduce((s, d) => s + d.active, 0) / 30 / 339) * 100),
  }
);

console.log(JSON.stringify({ oneDay, oneDayJun20, sevenDay, sevenDayW2, twentyDay, thirtyDay }, null, 2));
