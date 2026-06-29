/**
 * Phase 2 — Contract Intelligence
 *
 * Aggregates per-contract operational metrics from the current period
 * and classifies each contract as excellent / healthy / warning / critical.
 *
 * Data source: contractType from the riders sheet (المناديب), already
 * available on ctx.riders via the extended ControlTowerRiderInput.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type {
  ContractIntelligence,
  ControlTowerBuildContext,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(num: number, denom: number): number {
  return denom > 0 ? round2((num / denom) * 100) : 0;
}

export function buildContractIntelligence(
  ctx: ControlTowerBuildContext
): ContractIntelligence[] {
  const {
    riders,
    supervisorRows,
    performance,
    riderHistoricalBaselines,
    avgHoursPerActiveRider,
    fleetDailyTargetHours,
    operationalPeriodDays,
    fleetTalabat,
  } = ctx;

  const periodDays = Math.max(1, operationalPeriodDays);
  const fleetAvgHours = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 5;
  const fleetTotalTargetHours = fleetTalabat.targetHours;

  // Build performance map keyed by normalized rider code
  const riderPerfMap = new Map<string, { totalHours: number; totalOrders: number; activeDays: number }>();
  for (const rec of performance) {
    const norm = normalizeRiderCodeForPerformance(rec.riderCode);
    if (!norm) continue;
    const existing = riderPerfMap.get(norm) ?? { totalHours: 0, totalOrders: 0, activeDays: 0 };
    existing.totalHours += rec.hours;
    existing.totalOrders += rec.orders;
    if (rec.hours > 0) existing.activeDays++;
    riderPerfMap.set(norm, existing);
  }

  // Group riders by contractType
  const byContract = new Map<string, typeof riders>();
  for (const rider of riders) {
    const contract = (rider.contractType ?? '').trim() || 'غير محدد';
    const group = byContract.get(contract) ?? [];
    group.push(rider);
    byContract.set(contract, group);
  }

  // Supervisor lookup for this contract's riders
  const supRowByCode = new Map(supervisorRows.map((s) => [s.code, s]));

  const results: ContractIntelligence[] = [];

  for (const [contractType, contractRiders] of byContract) {
    const headcount = contractRiders.length;
    if (headcount === 0) continue;

    let actualHoursTotal = 0;
    let activeRidersCount = 0;
    let noShowCount = 0;
    let totalExpectedHoursDaily = 0;

    const riderLosses: Array<{ name: string; lostHoursDaily: number }> = [];

    for (const rider of contractRiders) {
      const norm = normalizeRiderCodeForPerformance(rider.code);
      const perf = norm ? riderPerfMap.get(norm) : undefined;
      const periodHours = perf?.totalHours ?? 0;
      const activeDays = perf?.activeDays ?? 0;

      actualHoursTotal += periodHours;
      if (periodHours > 0) activeRidersCount++;
      else noShowCount++;

      const expected = resolveRiderExpected(
        rider.code,
        riderHistoricalBaselines ?? new Map(),
        fleetAvgHours,
        0
      );
      totalExpectedHoursDaily += expected.hours;

      const actualDaily = round2(periodHours / periodDays);
      const lostHoursDaily = round2(Math.max(0, expected.hours - actualDaily));
      if (lostHoursDaily > 0) {
        riderLosses.push({ name: rider.name, lostHoursDaily });
      }
    }

    const inactiveRiders = headcount - activeRidersCount;
    const avgHoursDaily = round2(actualHoursTotal / periodDays);
    const noShowPct = pct(noShowCount, headcount);
    const utilizationPct = pct(activeRidersCount, headcount);

    // Target hours: proportional to contract's share of headcount
    const contractTargetDaily =
      fleetTotalTargetHours > 0
        ? round2((headcount / Math.max(1, riders.length)) * fleetDailyTargetHours)
        : totalExpectedHoursDaily;
    const achievementPct = contractTargetDaily > 0 ? pct(avgHoursDaily, contractTargetDaily) : 0;
    const gapHoursDaily = round2(Math.max(0, contractTargetDaily - avgHoursDaily));

    // Find top/weakest supervisor for this contract
    const contractSupCodes = new Set(contractRiders.map((r) => r.supervisorCode));
    const contractSups = supervisorRows.filter((s) => contractSupCodes.has(s.code));

    let topSupervisor = '';
    let weakestSupervisor = '';
    if (contractSups.length > 0) {
      const sorted = [...contractSups].sort((a, b) => b.achievementPercent - a.achievementPercent);
      topSupervisor = sorted[0].name;
      weakestSupervisor = sorted[sorted.length - 1].name;
    }

    // Top 3 rider losses
    riderLosses.sort((a, b) => b.lostHoursDaily - a.lostHoursDaily);
    const biggestRiderLosses = riderLosses.slice(0, 3);

    // Main operational issue in Arabic
    let mainOperationalIssueAr = '';
    if (noShowPct > 35) mainOperationalIssueAr = `${noShowPct.toFixed(0)}% من الطيارين غائبون — الحضور المشكلة الرئيسية`;
    else if (inactiveRiders > headcount * 0.2) mainOperationalIssueAr = `${inactiveRiders} طيار غير نشط — تراجع تشغيلي`;
    else if (gapHoursDaily > contractTargetDaily * 0.3) mainOperationalIssueAr = `فجوة ساعات كبيرة ${gapHoursDaily.toFixed(0)} س/يوم`;
    else mainOperationalIssueAr = 'أداء ضمن المعدل المقبول';

    // Trend (simplified: compare avgHoursDaily to expected)
    const trendRatio = totalExpectedHoursDaily > 0 ? avgHoursDaily / (totalExpectedHoursDaily / headcount) : 1;
    const trendDirection: ContractIntelligence['trendDirection'] =
      trendRatio >= 0.95 ? 'stable' : trendRatio >= 0.75 ? 'declining' : 'declining';

    // Classification
    let classification: ContractIntelligence['classification'];
    if (achievementPct >= 90 && noShowPct < 15) classification = 'excellent';
    else if (achievementPct >= 75 && noShowPct < 25) classification = 'healthy';
    else if (achievementPct >= 60 || noShowPct < 35) classification = 'warning';
    else classification = 'critical';

    results.push({
      contractType,
      headcount,
      activeRiders: activeRidersCount,
      inactiveRiders,
      achievementPct,
      gapHoursDaily,
      avgHoursDaily,
      noShowPct,
      utilizationPct,
      trendDirection,
      topSupervisor,
      weakestSupervisor,
      biggestRiderLosses,
      mainOperationalIssueAr,
      classification,
    });
  }

  // Sort by gapHoursDaily descending (most problematic first)
  results.sort((a, b) => b.gapHoursDaily - a.gapHoursDaily);
  return results;
}
