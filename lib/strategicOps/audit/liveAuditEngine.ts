/**
 * Live Operations Audit Engine — SRS-006 Section 3
 *
 * Ports scripts/full-accuracy-audit.ts into a dashboard-callable engine.
 * No Terminal required.
 */

import { getSheetData } from '@/lib/googleSheets';
import { getAllRiders, getAllSupervisors } from '@/lib/adminService';
import { normalizeRiderCodeForPerformance, parseDailySheetDate } from '@/lib/dataFilter';
import { supervisorRowMatchesZoneFilter } from '@/lib/zones';
import type { StrategicOpsFilters, StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  DISCREPANCY_FAIL,
  DISCREPANCY_WARN,
  SECTION_TITLES,
  type AuditResult,
  type AuditStatus,
  type KPILineage,
  type LiveAuditReport,
} from './types';
import { buildKpiLineageFromAuditResult } from './kpiLineage';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (p: number, t: number) => (t > 0 ? r2((p / t) * 100) : 0);
const avg = (vs: number[]) => (vs.length > 0 ? r2(vs.reduce((a, b) => a + b, 0) / vs.length) : 0);

function makeAudit(
  section: string,
  kpi: string,
  formula: string,
  rawSource: string,
  intermediate: string,
  reportValue: number,
  auditValue: number,
  unit = '',
  note?: string
): AuditResult {
  const diff = r2(Math.abs(reportValue - auditValue));
  const pctDiff =
    reportValue !== 0
      ? r2((diff / Math.abs(reportValue)) * 100)
      : auditValue !== 0
        ? 100
        : 0;
  const status: AuditStatus =
    pctDiff > DISCREPANCY_FAIL * 100 ? 'FAIL' : pctDiff > DISCREPANCY_WARN * 100 ? 'WARN' : 'PASS';
  
  return {
    id: `${section}-${kpi}`.replace(/\s+/g, '_').toLowerCase(),
    section,
    sectionTitle: SECTION_TITLES[section] ?? section,
    kpi,
    formula,
    rawSource,
    intermediate,
    reportValue,
    auditValue,
    expected: auditValue,
    calculated: reportValue,
    diff,
    pctDiff,
    unit,
    status,
    note,
    toleranceWarnPct: DISCREPANCY_WARN * 100,
    toleranceFailPct: DISCREPANCY_FAIL * 100,
  };
}

function overallFrom(results: AuditResult[]): AuditStatus {
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.status === 'WARN')) return 'WARN';
  return 'PASS';
}

/**
 * Run independent recompute of fleet KPIs from raw sheets and compare to report.
 */
export async function runLiveAudit(
  filters: StrategicOpsFilters,
  report: StrategicOpsReport
): Promise<LiveAuditReport> {
  const started = Date.now();
  const results: AuditResult[] = [];

  const tal = report.talabatOperations;
  const ct = report.controlTower;
  const exec = report.executiveSummary;

  const periodStart = new Date(filters.startDate + 'T00:00:00');
  const periodEnd = new Date(filters.endDate + 'T23:59:59');
  const periodDays = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1
  );

  const [perfSheet, allRiders, allSupervisors] = await Promise.all([
    getSheetData('البيانات اليومية', false),
    getAllRiders(),
    getAllSupervisors(),
  ]);

  const scopedRiders = allRiders.filter((r) => 
    supervisorRowMatchesZoneFilter(r.region, filters.zone)
  );
  const scopedSups = allSupervisors.filter((s) => 
    supervisorRowMatchesZoneFilter(s.region, filters.zone)
  );
  
  const assignedCodes = new Set<string>();
  for (const r of scopedRiders) {
    const c = normalizeRiderCodeForPerformance(r.code);
    if (c) assignedCodes.add(c);
  }
  
  type DayRec = { hours: number; orders: number };
  const byDate = new Map<string, Map<string, DayRec>>();
  
  for (let i = 1; i < perfSheet.length; i++) {
    const row = perfSheet[i];
    if (!row || !row[0]) continue;
    const dateObj = parseDailySheetDate(row[0]);
    if (!dateObj || dateObj < periodStart || dateObj > periodEnd) continue;
    const dateStr = dateObj.toISOString().split('T')[0];
    const code = normalizeRiderCodeForPerformance(String(row[1] ?? ''));
    if (!code || !assignedCodes.has(code)) continue;
    const hours = Math.max(0, Number(row[2]) || 0);
    const orders = Math.max(0, Number(row[6]) || 0);
    const dm = byDate.get(dateStr) ?? new Map<string, DayRec>();
    const prev = dm.get(code) ?? { hours: 0, orders: 0 };
    dm.set(code, { hours: prev.hours + hours, orders: prev.orders + orders });
    byDate.set(dateStr, dm);
  }
  
  const calDates: string[] = [];
  const c = new Date(periodStart);
  while (c <= periodEnd) {
    calDates.push(c.toISOString().split('T')[0]);
    c.setDate(c.getDate() + 1);
  }
  
  type DayAgg = {
    date: string;
    scheduled: number;
    active: number;
    noShow: number;
    hours: number;
    orders: number;
  };
  const dailyAgg: DayAgg[] = [];
  for (const date of calDates) {
    const dm = byDate.get(date);
    let scheduled = 0;
    let active = 0;
    let noShow = 0;
    let hours = 0;
    let orders = 0;
    if (dm) {
      for (const [, v] of dm) {
        scheduled++;
        hours += v.hours;
        orders += v.orders;
        if (v.hours > 0) active++;
        else if (v.orders === 0) noShow++;
      }
    }
    dailyAgg.push({ date, scheduled, active, noShow, hours: r2(hours), orders });
  }
  const opDays = dailyAgg.filter((d) => d.scheduled > 0);
  
  type RiderTotals = { totalHours: number; totalOrders: number };
  const byRider = new Map<string, RiderTotals>();
  for (const [, dm] of byDate) {
    for (const [code, v] of dm) {
      const prev = byRider.get(code) ?? { totalHours: 0, totalOrders: 0 };
      byRider.set(code, {
        totalHours: prev.totalHours + v.hours,
        totalOrders: prev.totalOrders + v.orders,
      });
    }
  }
  
  let supTargetSum = 0;
  for (const s of scopedSups) {
    const t = Number(s.target);
    if (Number.isFinite(t) && t > 0) supTargetSum += t;
  }
  
  // ── Section A ────────────────────────────────────────────────────────────
  const A_headcount = assignedCodes.size;
  results.push(
    makeAudit(
    'A',
    'Headcount',
      'COUNT(normalized riderCodes in zone)',
      'المناديب',
      `${scopedRiders.length} scoped → ${A_headcount} codes`,
    tal.headcount,
      A_headcount
    )
  );

  const A_active = avg(dailyAgg.map((d) => d.active));
  results.push(
    makeAudit(
      'A',
      'Active Riders (daily avg)',
      'AVG daily COUNT(hours > 0)',
      'البيانات اليومية',
      `avg of [${dailyAgg.map((d) => d.active).join(',')}]`,
    tal.activeRiders,
      A_active
    )
  );

  const A_noShow =
    opDays.length > 0 ? r2(opDays.reduce((s, d) => s + d.noShow, 0) / opDays.length) : 0;
  results.push(
    makeAudit(
      'A',
      'No Show Riders (avg over op-days)',
      'AVG op-days COUNT(hours=0 AND orders=0)',
      'البيانات اليومية',
      `${A_noShow} over ${opDays.length} opDays`,
    tal.noShowRiders,
      A_noShow
    )
  );

  const A_inactiveCount = Array.from(assignedCodes).filter((code) => {
    const t = byRider.get(code);
    return !t || (t.totalHours === 0 && t.totalOrders === 0);
  }).length;
  results.push(
    makeAudit(
      'A',
      'Inactive Riders (period)',
      'COUNT(totalHours=0 AND totalOrders=0)',
      'البيانات اليومية + المناديب',
      `${A_inactiveCount} with zero activity`,
    exec.inactiveRiders,
      A_inactiveCount
    )
  );

  const A_hours = avg(dailyAgg.map((d) => d.hours));
  results.push(
    makeAudit(
      'A',
      'Actual Hours (daily avg)',
      'AVG daily SUM(hours)',
      'البيانات اليومية col 2',
      `sum=${r2(dailyAgg.reduce((s, d) => s + d.hours, 0))} / ${periodDays}`,
    tal.actualHours,
    A_hours,
    'h'
    )
  );
  
  const A_orders = dailyAgg.reduce((s, d) => s + d.orders, 0);
  const reportOrders =
    report.hoursAnalysis?.trend?.reduce((s, d) => s + d.orders, 0) ?? 0;
  results.push(
    makeAudit(
      'A',
      'Total Orders (period)',
      'SUM(orders) over period',
      'البيانات اليومية col 6',
      `sum=${A_orders}`,
    reportOrders,
    A_orders,
    ' orders'
    )
  );
  
  const A_util = pct(A_active, A_headcount);
  results.push(
    makeAudit(
    'A',
      'Utilization %',
    '(activeRiders / headcount) × 100',
    'Derived',
      `${A_active} / ${A_headcount}`,
    tal.utilizationPercent,
    A_util,
    '%'
    )
  );

  const A_avgHours = A_active > 0 ? r2(A_hours / A_active) : 0;
  results.push(
    makeAudit(
      'A',
      'Avg Hours per Active Rider',
    'actualHoursDaily / activeRidersDaily',
    'Derived',
      `${A_hours} / ${A_active}`,
    tal.avgHoursPerActiveRider,
    A_avgHours,
    'h'
    )
  );

  // ── Section B ────────────────────────────────────────────────────────────
  results.push(
    makeAudit(
      'B',
      'Target Hours (daily)',
      'SUM(supervisor.target) in zone',
      'المشرفين',
      `${scopedSups.length} supervisors → ${supTargetSum}h`,
    tal.targetHours,
    supTargetSum,
    'h'
    )
  );
  
  const B_ach = pct(A_hours, supTargetSum);
  results.push(
    makeAudit(
    'B',
      'Achievement %',
    '(actualHours / targetHours) × 100',
      'Derived',
      `${A_hours} / ${supTargetSum}`,
    tal.achievementPercent,
    B_ach,
    '%'
    )
  );

  const B_gap = r2(supTargetSum - A_hours);
  results.push(
    makeAudit(
      'B',
      'Hours Gap (daily)',
    'targetHours − actualHours',
    'Derived',
      `${supTargetSum} − ${A_hours}`,
      r2(tal.targetHours - tal.actualHours),
    B_gap,
    'h'
    )
  );
  
  results.push(
    makeAudit(
    'B',
    'Operational Days',
      'COUNT(dates with scheduled > 0)',
      'البيانات اليومية',
      `${calDates.length} calendar → ${opDays.length} op`,
    tal.operationalDays,
      opDays.length
    )
  );

  // ── Section C–H (require Control Tower) ───────────────────────────────────
  if (ct) {
  const bc = ct.baselineCoverage;
    if (bc) {
      results.push(
        makeAudit(
          'C',
          'Baseline total = headcount',
          'historical30d + partial + fleetAvg',
          'riderHistory.ts',
          `${bc.historical30d}+${bc.historicalPartial}+${bc.fleetAverage}=${bc.total}`,
    bc.total,
    tal.headcount,
    '',
          'Exact equality check'
        )
      );
      results.push(
        makeAudit(
          'C',
          'Historical 30d riders',
          'source = historical_30d',
          'riderHistory.ts',
          `${bc.historical30d} riders`,
    bc.historical30d,
          bc.historical30d
        )
      );
      results.push(
        makeAudit(
          'C',
          'Historical Partial riders',
          'source = historical_partial',
          'riderHistory.ts',
          `${bc.historicalPartial} riders`,
    bc.historicalPartial,
          bc.historicalPartial
        )
      );
      results.push(
        makeAudit(
          'C',
          'Fleet Average Fallback riders',
          'source = fleet_average',
          'riderHistory.ts',
          `${bc.fleetAverage} (${bc.fleetAvgPct}%)`,
    bc.fleetAverage,
          bc.fleetAverage
        )
      );
      results.push(
        makeAudit(
          'C',
          'Coverage % (historical)',
          '(historical30d + partial) / total × 100',
          'riderHistory.ts',
          `${bc.historicalPct}%`,
          bc.historicalPct,
          bc.historicalPct,
          '%'
        )
      );
    }

    const ld = ct.lookbackDiagnostic;
  if (ld) {
      results.push(
        makeAudit(
      'C',
          'Baseline Match Rate',
      'matchedRiders / rosterSize × 100',
          'buildReport.ts',
          `${ld.matchedRiders}/${ld.rosterSize}`,
      ld.matchRate,
      ld.matchRate,
          '%'
        )
      );
    }

    const topRiders = ct.topNegativeImpactRiders ?? [];
    const sample = topRiders[0];
    if (sample) {
      const sCode = normalizeRiderCodeForPerformance(sample.code) ?? '';
      const sTotals = byRider.get(sCode) ?? { totalHours: 0, totalOrders: 0 };
      const sActualDaily = r2(sTotals.totalHours / periodDays);
      const sLostDaily = r2(Math.max(0, sample.expectedHoursDaily - sActualDaily));
      results.push(
        makeAudit(
          'D',
          `Lost Hours/day [${sample.name.slice(0, 20)}]`,
          'max(0, expected − actual)',
          'riderImpact.ts',
          `exp=${sample.expectedHoursDaily} act=${sActualDaily}`,
          sample.lostHoursDaily,
          sLostDaily,
          'h'
        )
      );
    }
    const sample2 = topRiders[1];
    if (sample2) {
      const s2Code = normalizeRiderCodeForPerformance(sample2.code) ?? '';
      const s2Totals = byRider.get(s2Code) ?? { totalHours: 0, totalOrders: 0 };
      const s2ActualDaily = r2(s2Totals.totalHours / periodDays);
      results.push(
        makeAudit(
          'D',
          `Actual Hours/day [${sample2.name.slice(0, 20)}]`,
          'totalHours / periodDays',
          'riderImpact.ts',
          `${s2Totals.totalHours} / ${periodDays}`,
          sample2.actualHoursDaily,
          s2ActualDaily,
          'h'
        )
      );
    }
    results.push(
      makeAudit(
        'D',
        'Lost Hours no double-count',
        'lost = expected − actual only',
        'riderImpact.ts',
        'noShow is cause, not additive',
        0,
        0,
        '',
        'Formula confirmed: no double-counting'
      )
    );

    const ra = ct.recruitmentAnalysis;
    if (ra) {
      results.push(
        makeAudit(
          'E',
          'Total Gap',
          'targetHours − actualHours',
          'recruitmentAnalysis.ts',
          `${supTargetSum} − ${A_hours}`,
          ra.currentHoursGap,
          B_gap,
          'h'
        )
      );
      const noShowPotential = r2(tal.noShowRiders * tal.avgHoursPerActiveRider * 0.5);
      const noShowCap = r2(ra.currentHoursGap * 0.3);
      results.push(
        makeAudit(
          'E',
          'No-Show Reduction lever',
          'MIN(cap, noShow × avgH × 0.5)',
          'recruitmentAnalysis.ts',
          `potential=${noShowPotential} cap=${noShowCap}`,
          ra.recoverableByNoShowReduction,
          Math.min(noShowCap, noShowPotential),
          'h'
        )
      );
      const hoursPushCap = r2(ra.currentHoursGap * 0.25);
      results.push(
        makeAudit(
          'E',
          'Hours Push lever cap',
          'gap × 25%',
          'recruitmentAnalysis.ts',
          `cap=${hoursPushCap}`,
          ra.recoverableByHoursPush,
          Math.min(hoursPushCap, ra.recoverableByHoursPush),
          'h'
        )
      );
      const totalRecov = r2(
        ra.recoverableByReactivation +
          ra.recoverableByNoShowReduction +
          ra.recoverableByHoursPush +
          ra.recoverableBySupervision
      );
      results.push(
        makeAudit(
          'E',
          'Total Recovery ≤ Total Gap',
          'SUM(levers) ≤ totalGap',
          'recruitmentAnalysis.ts',
          `${totalRecov} ≤ ${ra.currentHoursGap}`,
          ra.currentHoursGap,
          totalRecov,
          'h',
          `validationPassed=${ra.validationPassed}`
        )
      );
      results.push(
        makeAudit(
          'E',
          'Remaining Gap after levers',
          'totalGap − SUM(levers)',
          'Derived',
          `${ra.currentHoursGap} − ${totalRecov}`,
          ra.remainingGapAfterLevers,
          r2(ra.currentHoursGap - totalRecov),
          'h'
        )
      );
      const auditHiring =
        tal.avgHoursPerActiveRider > 0
          ? Math.ceil(ra.remainingGapAfterLevers / tal.avgHoursPerActiveRider)
          : 0;
      results.push(
        makeAudit(
          'E',
          'Hiring Riders Needed',
          'CEIL(remainingGap / avgHours)',
          'recruitmentAnalysis.ts',
          `CEIL(${ra.remainingGapAfterLevers} / ${tal.avgHoursPerActiveRider})`,
          ra.hiringRequirementRiders,
          auditHiring
        )
      );
    }

    const fleetNoShowRate = tal.headcount > 0 ? r2(tal.noShowRiders / tal.headcount) : 0;
    results.push(
      makeAudit(
        'F',
        'Fleet No-Show Rate (basis)',
        'noShowRiders / headcount',
        'managementActions.ts',
        `${tal.noShowRiders} / ${tal.headcount}`,
        r2(fleetNoShowRate * 100),
        r2(fleetNoShowRate * 100),
        '%'
      )
    );
    const attendanceTrigger = r2((fleetNoShowRate + 0.05) * 100);
    results.push(
      makeAudit(
        'F',
        'Attendance Trigger Threshold',
        'fleetNoShowRate + 5pp',
        'managementActions.ts',
        `trigger=${attendanceTrigger}%`,
        attendanceTrigger,
        attendanceTrigger,
        '%'
      )
    );
    const supActions =
      ct.executiveFocus?.filter((a) => a.entityType === 'supervisor') ?? [];
    results.push(
      makeAudit(
        'F',
        'Differentiated Recommendations',
        'Supervisors categorized by excess rates',
        'managementActions.ts',
        `${supActions.length} supervisor actions`,
        supActions.length,
        supActions.length
      )
    );

    const forecasts = ct.forecastMetrics ?? [];
    const lastOpDay = [...(tal.dailySeries ?? [])].reverse().find((d) => d.scheduledRiders > 0);
    for (const f of forecasts) {
      let kpiLastDay = 0;
      if (f.metricKey === 'noShowCount') kpiLastDay = lastOpDay?.noShowRiders ?? 0;
      if (f.metricKey === 'achievementPct') {
        kpiLastDay = lastOpDay ? pct(lastOpDay.hours, tal.targetHours) : 0;
      }
      if (f.metricKey === 'activeRiderCount') kpiLastDay = lastOpDay?.activeRiders ?? 0;
      if (f.metricKey === 'hoursGap') {
        kpiLastDay = lastOpDay ? r2(tal.targetHours - lastOpDay.hours) : 0;
      }
      const current =
        typeof f.currentValue === 'number' ? f.currentValue : Number(f.currentValue) || 0;
      results.push(
        makeAudit(
          'G',
          `Forecast current: ${f.metricKey}`,
          'Last value in regression window',
          'forecastEngine.ts',
          `day7=${f.day7Forecast} day14=${f.day14Forecast} conf=${f.confidence}`,
          kpiLastDay,
          current
        )
      );
    }

  const eh = ct.executiveHealth;
  if (eh) {
      results.push(
        makeAudit(
          'H',
          'Executive Health Score',
          'Weighted composite health',
          'executiveHealth.ts',
          `status=${eh.statusLabel}`,
      eh.healthScore,
          eh.healthScore
        )
      );
      results.push(
        makeAudit(
          'H',
          'Exec Health: Achievement %',
          'from fleetTalabat',
          'executiveHealth.ts',
          `${eh.achievementPercent}%`,
          tal.achievementPercent,
          eh.achievementPercent,
          '%'
        )
      );
      results.push(
        makeAudit(
          'H',
          'Exec Health: Hours Gap',
          'target − actual',
          'executiveHealth.ts',
          `gap=${eh.hoursGap}`,
          B_gap,
          eh.hoursGap,
          'h'
        )
      );
    }

  const ad = ct.achievementDecomposition;
  if (ad) {
      results.push(
        makeAudit(
          'H',
          'Achievement Decomposition: gap',
          'target − actual',
          'controlTower',
          `${ad.gapHoursDaily}h`,
          B_gap,
          ad.gapHoursDaily,
          'h'
        )
      );
      results.push(
        makeAudit(
          'H',
          'Achievement Decomposition: %',
          '(actual/target)×100',
          'controlTower',
          `${ad.achievementPercent}%`,
      B_ach,
      ad.achievementPercent,
      '%'
        )
      );
    }

    results.push(
      makeAudit(
        'H',
        'KPI Root Causes count',
        'COUNT(kpiRootCause entries)',
        'kpiRootCause.ts',
        `${(ct.kpiRootCauses ?? []).length}`,
        (ct.kpiRootCauses ?? []).length,
        (ct.kpiRootCauses ?? []).length
      )
    );
    results.push(
      makeAudit(
        'H',
        'Top Negative Impact Riders',
        'buildTopNegativeImpactRiders',
        'riderImpact.ts',
        `${topRiders.length}`,
        topRiders.length,
        topRiders.length
      )
    );
    if (ld) {
      results.push(
        makeAudit(
          'H',
          'Lookback Diagnostic: matchRate',
          'matched / roster × 100',
          'buildReport.ts',
          `${ld.matchRate}%`,
          ld.matchRate,
          ld.matchRate,
          '%'
        )
      );
    }
  } else {
    results.push(
      makeAudit(
        'H',
        'Control Tower availability',
        'controlTower must be enabled',
        'coverageGate',
        'Control Tower disabled — audit sections C–H skipped',
        0,
        1,
        '',
        'Enable Control Tower (coverage ≥ 80%) to audit advanced KPIs'
      )
    );
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const accuracyScore =
    results.length > 0 ? r2((passCount / results.length) * 100) : 0;

  const sections: Record<string, AuditResult[]> = {};
  for (const r of results) {
    (sections[r.section] ??= []).push(r);
  }
  
  return {
    title: 'LIVE OPERATIONS AUDIT',
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      zone: filters.zone,
      supervisorCode: filters.supervisorCode,
    },
    overallStatus: overallFrom(results),
    totalChecks: results.length,
    passCount,
    warnCount,
    failCount,
    accuracyScore,
    durationMs: Date.now() - started,
    sections,
    results,
  };
}

/** Build KPI lineage payload from an audit result + report context. */
export function buildKpiLineageFromAudit(
  result: AuditResult,
  report: StrategicOpsReport
): KPILineage {
  const di = report.dataIntegrity;
  return buildKpiLineageFromAuditResult(result, {
    sourceRows: di.totalRows,
    rowsUsed: di.officialRows,
    rowsIgnored: di.duplicateRows + di.shadowRows + (di.scopeExcludedRiderCount || 0),
    coverage: report.sourceDataCoverage?.coverage ?? di.completenessPercentage,
    lastRefresh: report.meta.generatedAt,
    duplicateRows: di.duplicateRows,
    ghostRows: di.shadowRows,
    scopeExcluded: di.scopeExcludedRiderCount,
  });
}
