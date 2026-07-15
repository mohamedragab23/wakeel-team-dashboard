/**
 * PRODUCTION ACCURACY AUDIT
 * Independently re-derives every Strategic Operations Center KPI directly from
 * raw Google Sheets rows and compares against the report pipeline output.
 *
 * Methodology:
 *   1. Fetch raw Sheets data (riders, performance, supervisors)
 *   2. Re-derive each KPI from first principles using the documented formula
 *   3. Compare with report pipeline value
 *   4. Flag any discrepancy > 1%
 *
 * Run: npx tsx scripts/production-accuracy-audit.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve('.env.local') });

import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';
import { getSheetData } from '../lib/googleSheets';
import { getAllRiders, getAllSupervisors } from '../lib/adminService';
import { normalizeRiderCodeForPerformance, parseDailySheetDate } from '../lib/dataFilter';
import { supervisorRowMatchesZoneFilter } from '../lib/zones';

const FILTERS = {
  startDate: '2026-06-15',
  endDate: '2026-06-23',  // last OPERATIONAL day (June 25 has no data)
  zone: 'Alexandria',
  supervisorCode: 'all',
};

const DISCREPANCY_THRESHOLD = 0.01; // 1%

function round2(n: number) { return Math.round(n * 100) / 100; }
function pct(part: number, total: number) {
  return total > 0 ? round2((part / total) * 100) : 0;
}
function avg(vals: number[]) {
  return vals.length > 0 ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

function discrepancyRow(
  kpi: string,
  formula: string,
  rawSource: string,
  intermediate: string,
  reportValue: number,
  auditValue: number,
  unit = ''
) {
  const diff = Math.abs(reportValue - auditValue);
  const pctDiff = reportValue !== 0 ? round2((diff / Math.abs(reportValue)) * 100) : (auditValue !== 0 ? 100 : 0);
  const flag = pctDiff > 1 ? '⚠️  DISCREPANCY' : '✓  MATCH';
  return { kpi, formula, rawSource, intermediate, reportValue, auditValue, diff, pctDiff, unit, flag };
}

function printRow(r: ReturnType<typeof discrepancyRow>) {
  console.log(`\n  KPI: ${r.kpi}`);
  console.log(`  Formula:      ${r.formula}`);
  console.log(`  Raw source:   ${r.rawSource}`);
  console.log(`  Intermediate: ${r.intermediate}`);
  console.log(`  Report value: ${r.reportValue}${r.unit}`);
  console.log(`  Audit value:  ${r.auditValue}${r.unit}`);
  console.log(`  Diff:         ${r.diff}${r.unit} (${r.pctDiff}%)`);
  console.log(`  Status:       ${r.flag}`);
}

async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('PRODUCTION ACCURACY AUDIT — Alexandria Strategic Operations Center');
  console.log(`Period: ${FILTERS.startDate} → ${FILTERS.endDate} | Zone: ${FILTERS.zone}`);
  console.log('Run at:', new Date().toISOString());
  console.log('═'.repeat(72));

  // ── Step 1: Full report pipeline ────────────────────────────────────────────
  console.log('\n[1/3] Running report pipeline...');
  const report = await buildStrategicOpsReport(FILTERS);
  const tal = report.talabatOperations;
  const ct = report.controlTower;
  console.log(`      Pipeline complete. operationalDays=${tal.operationalDays}`);

  // ── Step 2: Fetch raw data independently ────────────────────────────────────
  console.log('[2/3] Fetching raw Google Sheets data...');

  // Riders sheet (المناديب) — getSheetData(sheetName) reads spreadsheetId internally
  const ridersSheet = await getSheetData('المناديب', false);
  console.log(`      Riders sheet: ${ridersSheet.length} rows`);

  // Daily performance sheet
  const perfSheet = await getSheetData('البيانات اليومية', false);
  console.log(`      Performance sheet: ${perfSheet.length} rows`);

  // Supervisors sheet (for targets)
  const supSheet = await getSheetData('المشرفين', false);
  console.log(`      Supervisors sheet: ${supSheet.length} rows`);

  // ── Step 3: Re-derive each KPI from raw rows ─────────────────────────────────
  console.log('[3/3] Re-deriving KPIs from raw data...\n');

  const periodStart = new Date(FILTERS.startDate + 'T00:00:00');
  const periodEnd   = new Date(FILTERS.endDate   + 'T23:59:59');

  // ── Rider parsing via structured API (same path as pipeline) ────────────────
  // getAllRiders() already parses col 0=code, 1=name, 2=region, 3=supervisorCode, ...
  const allRiders = await getAllRiders();
  const scopedRiders = allRiders.filter((r) =>
    supervisorRowMatchesZoneFilter(r.region, FILTERS.zone)
  );
  const assignedCodes = new Set<string>();
  for (const r of scopedRiders) {
    const code = normalizeRiderCodeForPerformance(r.code);
    if (code) assignedCodes.add(code);
  }
  const rawHeadcount = assignedCodes.size;
  console.log(`      Scoped riders (zone=${FILTERS.zone}): ${rawHeadcount}`);

  // ── Supervisor/target parsing via structured API ──────────────────────────
  // getAllSupervisors() already parses; region is used by supervisorRowMatchesZoneFilter
  const allSupervisors = await getAllSupervisors();
  const scopedSupervisors = allSupervisors.filter((s) =>
    supervisorRowMatchesZoneFilter(s.region, FILTERS.zone)
  );
  let rawSupervisorTargetSum = 0;
  let supervisorRowsInScope = scopedSupervisors.length;
  for (const s of scopedSupervisors) {
    const t = Number(s.target);
    if (Number.isFinite(t) && t > 0) rawSupervisorTargetSum += t;
  }
  console.log(`      Scoped supervisors: ${supervisorRowsInScope}, target sum: ${rawSupervisorTargetSum}`);
  const rawTargetHoursDaily = rawSupervisorTargetSum > 0 ? round2(rawSupervisorTargetSum) : 1500;

  // ── Raw performance parsing ─────────────────────────────────────────────────
  // Sheet columns (confirmed from dataFilter.ts):
  //   col 0 = date, col 1 = riderCode, col 2 = hours, col 5 = absence, col 6 = orders
  type DayRec = { hours: number; orders: number };
  const byDate = new Map<string, Map<string, DayRec>>();
  let rawPerfRowsTotal = 0;
  let rawPerfRowsInPeriod = 0;
  let rawPerfRowsAssigned = 0;

  for (let i = 1; i < perfSheet.length; i++) {
    const row = perfSheet[i];
    if (!row || !row[0]) continue;
    const dateObj = parseDailySheetDate(row[0]);
    if (!dateObj) continue;
    rawPerfRowsTotal++;
    if (dateObj < periodStart || dateObj > periodEnd) continue;
    rawPerfRowsInPeriod++;

    const dateStr = dateObj.toISOString().split('T')[0];
    const code = normalizeRiderCodeForPerformance(String(row[1] ?? ''));
    if (!code || !assignedCodes.has(code)) continue;
    rawPerfRowsAssigned++;

    const hours  = Math.max(0, Number(row[2]) || 0);
    const orders = Math.max(0, Number(row[6]) || 0);

    const dayMap = byDate.get(dateStr) ?? new Map<string, DayRec>();
    const prev = dayMap.get(code) ?? { hours: 0, orders: 0 };
    dayMap.set(code, { hours: prev.hours + hours, orders: prev.orders + orders });
    byDate.set(dateStr, dayMap);
  }

  console.log(`  Raw perf rows total: ${rawPerfRowsTotal}`);
  console.log(`  Raw perf rows in period: ${rawPerfRowsInPeriod}`);
  console.log(`  Raw perf rows in period & assigned scope: ${rawPerfRowsAssigned}`);
  console.log(`  Dates with data in scope: ${byDate.size}`);

  // ── Build daily series from scratch ────────────────────────────────────────
  const calendarDates: string[] = [];
  const cur = new Date(periodStart);
  while (cur <= periodEnd) {
    calendarDates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  let totalHoursSum = 0;
  let totalActiveRidersSum = 0;
  let totalNoShowSum = 0;
  let operationalDayCount = 0;
  let noShowOperationalDaySum = 0;

  const dailyBreakdown: Array<{
    date: string; scheduled: number; active: number; noShow: number;
    partial: number; hours: number;
  }> = [];

  for (const date of calendarDates) {
    const dayMap = byDate.get(date);
    let scheduled = 0, active = 0, noShow = 0, partial = 0, hours = 0;

    if (dayMap) {
      for (const [, vals] of dayMap) {
        scheduled++;
        hours += vals.hours;
        if (vals.hours > 0) active++;
        else if (vals.orders === 0) noShow++;  // isTalabatNoShow: hours=0 AND orders=0
        else partial++;                         // hours=0, orders>0 → excluded
      }
    }

    totalHoursSum += hours;
    totalActiveRidersSum += active;

    if (scheduled > 0) {
      operationalDayCount++;
      noShowOperationalDaySum += noShow;
    }

    dailyBreakdown.push({ date, scheduled, active, noShow, partial, hours: round2(hours) });
  }

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  const auditActiveRiders     = avg(dailyBreakdown.map((d) => d.active));
  const auditNoShowRiders     = operationalDayCount > 0
    ? round2(noShowOperationalDaySum / operationalDayCount)
    : 0;
  const auditActualHours      = avg(dailyBreakdown.map((d) => d.hours));
  const auditTargetHours      = rawTargetHoursDaily;
  const auditAchievementPct   = pct(auditActualHours, auditTargetHours);
  const auditHoursGap         = round2(auditTargetHours - auditActualHours);
  const auditAvgHoursPerActive = auditActiveRiders > 0 ? round2(auditActualHours / auditActiveRiders) : 0;
  const auditUtilizationPct   = pct(auditActiveRiders, rawHeadcount);

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT TABLE — Section by section
  // ══════════════════════════════════════════════════════════════════════════

  const results: ReturnType<typeof discrepancyRow>[] = [];

  console.log('═'.repeat(72));
  console.log('SECTION 1: Core Fleet KPIs');
  console.log('═'.repeat(72));

  // 1a. Headcount
  {
    const r = discrepancyRow(
      'Headcount',
      'COUNT(riders in zone from المناديب sheet)',
      'المناديب — col A (riderCode), col D (zone)',
      `zone-filtered rider codes normalized → ${rawHeadcount} unique codes`,
      tal.headcount, rawHeadcount
    );
    printRow(r); results.push(r);
  }

  // 1b. Active Riders
  {
    const r = discrepancyRow(
      'Active Riders (daily avg)',
      'AVG over calendarDays of COUNT(riderCode WHERE hours > 0 on that day AND in assignedCodes)',
      'البيانات اليومية — col A (date), col B (riderCode), col C (hours)',
      `sum(daily active)=${dailyBreakdown.reduce((s,d)=>s+d.active,0)} ÷ ${calendarDates.length} days = ${auditActiveRiders}`,
      tal.activeRiders, auditActiveRiders
    );
    printRow(r); results.push(r);
  }

  // 1c. No Show
  {
    const r = discrepancyRow(
      'No Show Riders (daily avg)',
      'AVG over operational days of COUNT(riderCode WHERE hours=0 AND orders=0 AND in assignedCodes AND has row)',
      'البيانات اليومية — col A (date), col B (riderCode), col C (hours), col G (orders)',
      `sum(daily noShow over ${operationalDayCount} opDays)=${noShowOperationalDaySum} ÷ ${operationalDayCount} = ${auditNoShowRiders}`,
      tal.noShowRiders, auditNoShowRiders
    );
    printRow(r); results.push(r);
  }

  // 1d. Actual Hours
  {
    const r = discrepancyRow(
      'Actual Hours (daily avg)',
      'AVG over calendarDays of SUM(hours) for assigned riders',
      'البيانات اليومية — col C (hours) for assignedCodes',
      `sum(daily hours)=${round2(dailyBreakdown.reduce((s,d)=>s+d.hours,0))} ÷ ${calendarDates.length} = ${auditActualHours}h`,
      tal.actualHours, auditActualHours, 'h'
    );
    printRow(r); results.push(r);
  }

  // 1e. Target Hours
  {
    const r = discrepancyRow(
      'Target Hours (daily)',
      'SUM(supervisor.target) for supervisors in zone from المشرفين',
      'المشرفين — col D (target), col E (zone)',
      `${supervisorRowsInScope} supervisors in zone, sum=${rawSupervisorTargetSum}h/day`,
      tal.targetHours, auditTargetHours, 'h'
    );
    printRow(r); results.push(r);
  }

  // 1f. Achievement %
  {
    const r = discrepancyRow(
      'Achievement %',
      '(actualHours ÷ targetHours) × 100',
      'Derived from actual and target hours above',
      `${auditActualHours} ÷ ${auditTargetHours} × 100 = ${auditAchievementPct}%`,
      tal.achievementPercent, auditAchievementPct, '%'
    );
    printRow(r); results.push(r);
  }

  // 1g. Hours Gap
  {
    const r = discrepancyRow(
      'Hours Gap',
      'targetHours − actualHours',
      'Derived',
      `${auditTargetHours} − ${auditActualHours} = ${auditHoursGap}h`,
      round2(tal.targetHours - tal.actualHours), auditHoursGap, 'h'
    );
    printRow(r); results.push(r);
  }

  // 1h. Avg hours per active rider
  {
    const r = discrepancyRow(
      'Avg Hours per Active Rider',
      'actualHours ÷ activeRiders',
      'Derived',
      `${auditActualHours} ÷ ${auditActiveRiders} = ${auditAvgHoursPerActive}h`,
      tal.avgHoursPerActiveRider, auditAvgHoursPerActive, 'h'
    );
    printRow(r); results.push(r);
  }

  // 1i. Utilization %
  {
    const r = discrepancyRow(
      'Utilization %',
      '(activeRiders ÷ headcount) × 100',
      'Derived',
      `${auditActiveRiders} ÷ ${rawHeadcount} × 100 = ${auditUtilizationPct}%`,
      tal.utilizationPercent, auditUtilizationPct, '%'
    );
    printRow(r); results.push(r);
  }

  // ── Partial-work riders note ─────────────────────────────────────────────
  const partialRidersTotal = dailyBreakdown.reduce((s, d) => s + d.partial, 0);
  console.log(`\n  NOTE: riders with orders>0, hours=0 (excluded from both active AND no-show): `);
  console.log(`        ${partialRidersTotal} rider-days across the period (avg ${round2(partialRidersTotal / calendarDates.length)}/day)`);

  console.log('\n' + '═'.repeat(72));
  console.log('SECTION 2: Recruitment Analysis');
  console.log('═'.repeat(72));

  if (ct?.recruitmentAnalysis) {
    const ra = ct.recruitmentAnalysis;
    const totalRecovered = round2(
      ra.recoverableByReactivation + ra.recoverableByNoShowReduction +
      ra.recoverableByHoursPush + ra.recoverableBySupervision
    );

    console.log(`\n  totalGap (target − actual)      = ${ra.currentHoursGap}h`);
    console.log(`  Audit gap (${auditTargetHours} − ${auditActualHours}) = ${auditHoursGap}h`);
    console.log(`  Gap match: ${Math.abs(ra.currentHoursGap - auditHoursGap) <= 0.01 ? '✓' : '✗'}`);

    console.log(`\n  ── Lever 1: Reactivation ───`);
    console.log(`  Formula: SUM(resolveRiderExpected(r)) for r WHERE r.totalHours=0 × 0.4`);
    console.log(`           capped at MIN(remaining, 20% of gap = ${round2(ra.currentHoursGap * 0.20)}h)`);
    console.log(`  Result:  ${ra.recoverableByReactivation}h`);
    const reactivationRiders = dailyBreakdown.length > 0
      ? new Set(
          [...byDate.values()].flatMap((dm) =>
            [...dm.entries()].filter(([,v]) => v.hours === 0).map(([c]) => c)
          )
        ).size
      : 0;
    console.log(`  Inactive riders in period: ~${reactivationRiders} (codes with zero-hour rows)`);
    console.log(`  Cap respected: ${ra.recoverableByReactivation <= ra.currentHoursGap * 0.20 + 0.01 ? '✓ YES' : '✗ NO'}`);

    console.log(`\n  ── Lever 2: No-Show Reduction ──`);
    console.log(`  Formula: noShowRiders × avgHoursPerActive × 0.5, cap 30% of gap = ${round2(ra.currentHoursGap * 0.30)}h`);
    console.log(`  Inputs:  noShowRiders=${tal.noShowRiders}, avgHours=${tal.avgHoursPerActiveRider}`);
    const rawNoShowPotential = round2(tal.noShowRiders * tal.avgHoursPerActiveRider * 0.5);
    console.log(`  Potential before cap: ${rawNoShowPotential}h`);
    console.log(`  Result:  ${ra.recoverableByNoShowReduction}h`);
    console.log(`  Cap respected: ${ra.recoverableByNoShowReduction <= ra.currentHoursGap * 0.30 + 0.01 ? '✓ YES' : '✗ NO'}`);

    console.log(`\n  ── Lever 3: Hours Push ────────`);
    console.log(`  Formula: SUM(expectedH − actualDailyH) for active riders × 0.6, cap 25% = ${round2(ra.currentHoursGap * 0.25)}h`);
    console.log(`  Result:  ${ra.recoverableByHoursPush}h`);
    console.log(`  Cap respected: ${ra.recoverableByHoursPush <= ra.currentHoursGap * 0.25 + 0.01 ? '✓ YES' : '✗ NO'}`);

    console.log(`\n  ── Lever 4: Supervision ───────`);
    console.log(`  Formula: bottom-quartile supervisors × 30% improvement gap, cap 15% = ${round2(ra.currentHoursGap * 0.15)}h`);
    console.log(`  Result:  ${ra.recoverableBySupervision}h`);
    console.log(`  Cap respected: ${ra.recoverableBySupervision <= ra.currentHoursGap * 0.15 + 0.01 ? '✓ YES' : '✗ NO'}`);

    console.log(`\n  ── Summary ─────────────────────`);
    console.log(`  totalRecovery:      ${totalRecovered}h`);
    console.log(`  remainingGap:       ${ra.remainingGapAfterLevers}h`);
    console.log(`  recommendHiring:    ${ra.recommendHiring}`);
    console.log(`  hiringRidersNeeded: ${ra.hiringRequirementRiders}`);
    console.log(`  validationPassed:   ${ra.validationPassed}`);
    console.log(`  AUDIT: totalRecovery ≤ totalGap → ${totalRecovered <= ra.currentHoursGap + 0.01 ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  AUDIT: remainingGap > 0 → ${ra.remainingGapAfterLevers > 0 ? '✓ PASS' : '✗ FAIL'}`);
  } else {
    console.log('  [WARN] recruitmentAnalysis not in controlTower');
  }

  console.log('\n' + '═'.repeat(72));
  console.log('SECTION 3: Supervisor Recommendations (fleet-relative threshold audit)');
  console.log('═'.repeat(72));

  const fleetNoShowRate = round2(tal.noShowRiders / tal.headcount);
  console.log(`\n  Fleet noShow rate (basis):  ${tal.noShowRiders} ÷ ${tal.headcount} = ${round2(fleetNoShowRate * 100)}%`);
  console.log(`  Relative threshold applied: ±5pp above fleet rate`);
  console.log(`  Attendance trigger point:   >${round2((fleetNoShowRate + 0.05) * 100)}% per-supervisor noShow rate`);

  const supActions = ct?.executiveFocus?.filter((a: { entityType: string }) => a.entityType === 'supervisor') ?? [];
  console.log(`\n  Supervisor actions: ${supActions.length}`);
  for (const a of supActions) {
    const aa = a as { entityName: string; actionAr: string; evidence?: string };
    const cat = aa.actionAr.includes('غائب') || aa.actionAr.includes('حضور') || aa.actionAr.includes('غياب')
      ? 'ATTENDANCE'
      : aa.actionAr.includes('تفعيل') || aa.actionAr.includes('متوقف')
        ? 'INACTIVE-RECOVERY'
        : aa.actionAr.includes('ساعات')
          ? 'HOURS-PUSH'
          : 'STRUCTURAL';
    console.log(`  [${cat.padEnd(18)}] ${aa.entityName.slice(0, 20).padEnd(20)} | ${aa.actionAr.slice(0, 55)}`);
  }
  const categories = new Set(supActions.map((a: { actionAr: string }) => {
    const ar = a.actionAr ?? '';
    if (ar.includes('غائب') || ar.includes('حضور') || ar.includes('غياب')) return 'attendance';
    if (ar.includes('تفعيل') || ar.includes('متوقف')) return 'inactive';
    if (ar.includes('ساعات')) return 'hours';
    return 'structural';
  }));
  console.log(`\n  AUDIT: recommendation variety (${categories.size} categories): ${categories.size > 1 ? '✓ PASS (differentiated)' : '✗ FAIL (all same)'}`);

  console.log('\n' + '═'.repeat(72));
  console.log('SECTION 4: Forecast Metrics');
  console.log('═'.repeat(72));

  if (ct?.forecastMetrics && ct.forecastMetrics.length > 0) {
    const lastOpDay = [...(tal.dailySeries ?? [])].reverse().find((d) => d.scheduledRiders > 0);
    const noShowF = ct.forecastMetrics.find((f) => f.metricKey === 'noShowCount');
    const achF    = ct.forecastMetrics.find((f) => f.metricKey === 'achievementPct');
    const activeF = ct.forecastMetrics.find((f) => f.metricKey === 'activeRiderCount');
    const gapF    = ct.forecastMetrics.find((f) => f.metricKey === 'hoursGap');

    console.log(`\n  Last operational day in KPI series: ${lastOpDay?.date ?? 'N/A'}`);
    console.log(`  KPI noShow on that day:             ${lastOpDay?.noShowRiders ?? 'N/A'}`);
    console.log(`  KPI active on that day:             ${lastOpDay?.activeRiders ?? 'N/A'}`);
    console.log(`  KPI hours on that day:              ${lastOpDay?.hours ?? 'N/A'}h`);

    console.log(`\n  ── No-Show Forecast ──────────────────────────────────────────`);
    console.log(`  Formula:        headcount − activeRiders (using isTalabatNoShow on assignedCodes)`);
    console.log(`  currentValue:   ${noShowF?.currentValue}`);
    console.log(`  KPI same day:   ${lastOpDay?.noShowRiders}`);
    console.log(`  diff:           ${Math.abs((noShowF?.currentValue ?? 0) - (lastOpDay?.noShowRiders ?? 0))} riders`);
    console.log(`  AUDIT: diff = 0 → ${(noShowF?.currentValue ?? -1) === (lastOpDay?.noShowRiders ?? -2) ? '✓ EXACT MATCH' : `⚠️ diff=${Math.abs((noShowF?.currentValue ?? 0) - (lastOpDay?.noShowRiders ?? 0))}`}`);
    console.log(`  day7Forecast:   ${noShowF?.day7Forecast}`);
    console.log(`  day14Forecast:  ${noShowF?.day14Forecast}`);
    console.log(`  confidence:     ${noShowF?.confidence}`);

    console.log(`\n  ── Achievement % Forecast ────────────────────────────────────`);
    console.log(`  Formula:        (actualHours ÷ targetHours) × 100 per day → weighted regression`);
    console.log(`  currentValue:   ${achF?.currentValue}%`);
    const kpiAchLastDay = lastOpDay ? pct(lastOpDay.hours, tal.targetHours) : 0;
    console.log(`  KPI ach on last opDay: ${kpiAchLastDay}%`);
    console.log(`  diff:           ${round2(Math.abs((achF?.currentValue ?? 0) - kpiAchLastDay))}pp`);
    console.log(`  day7Forecast:   ${achF?.day7Forecast}%`);
    console.log(`  day14Forecast:  ${achF?.day14Forecast}%`);
    console.log(`  confidence:     ${achF?.confidence}`);
    console.log(`  alert:          ${achF?.alertAr ?? 'none'}`);

    console.log(`\n  ── Active Rider Count Forecast ───────────────────────────────`);
    console.log(`  currentValue:   ${activeF?.currentValue}`);
    console.log(`  KPI active on last opDay: ${lastOpDay?.activeRiders}`);
    console.log(`  day7Forecast:   ${activeF?.day7Forecast}`);
    console.log(`  day14Forecast:  ${activeF?.day14Forecast}`);
    console.log(`  confidence:     ${activeF?.confidence}`);

    console.log(`\n  ── Hours Gap Forecast ────────────────────────────────────────`);
    console.log(`  currentValue:   ${gapF?.currentValue}h`);
    const kpiGapLastDay = lastOpDay ? round2(tal.targetHours - lastOpDay.hours) : 0;
    console.log(`  KPI gap on last opDay: ${kpiGapLastDay}h`);
    console.log(`  day7Forecast:   ${gapF?.day7Forecast}h`);
    console.log(`  day14Forecast:  ${gapF?.day14Forecast}h`);
    console.log(`  confidence:     ${gapF?.confidence}`);
    console.log(`  alert:          ${gapF?.alertAr ?? 'none'}`);
  } else {
    console.log('  forecastMetrics not available');
  }

  console.log('\n' + '═'.repeat(72));
  console.log('SECTION 5: Baseline Coverage');
  console.log('═'.repeat(72));

  if (ct?.baselineCoverage) {
    const bc = ct.baselineCoverage;
    console.log(`\n  historical30d     = ${bc.historical30d}`);
    console.log(`  historicalPartial = ${bc.historicalPartial}`);
    console.log(`  fleetAverage      = ${bc.fleetAverage}`);
    console.log(`  total             = ${bc.total}`);
    console.log(`  headcount         = ${tal.headcount}`);
    console.log(`  historicalPct     = ${bc.historicalPct}%`);
    console.log(`  fleetAvgPct       = ${bc.fleetAvgPct}%`);
    console.log(`  AUDIT: total = headcount → ${bc.total === tal.headcount ? '✓ PASS' : `✗ FAIL (${bc.total} ≠ ${tal.headcount})`}`);
    console.log(`  AUDIT: 30d + partial + fleet = total → ${bc.historical30d + bc.historicalPartial + bc.fleetAverage === bc.total ? '✓ PASS' : '✗ FAIL'}`);
  }

  console.log('\n' + '═'.repeat(72));
  console.log('SECTION 6: Daily Breakdown (all operational days)');
  console.log('═'.repeat(72));
  console.log(`\n  ${'Date'.padEnd(12)} ${'Scheduled'.padEnd(12)} ${'Active'.padEnd(10)} ${'NoShow'.padEnd(10)} ${'Partial'.padEnd(10)} ${'Hours'.padEnd(10)}`);
  console.log('  ' + '─'.repeat(64));
  for (const d of dailyBreakdown) {
    if (d.scheduled > 0) {
      console.log(`  ${d.date.padEnd(12)} ${String(d.scheduled).padEnd(12)} ${String(d.active).padEnd(10)} ${String(d.noShow).padEnd(10)} ${String(d.partial).padEnd(10)} ${String(d.hours).padEnd(10)}`);
    }
  }

  // ── FINAL DISCREPANCY SUMMARY ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('DISCREPANCY SUMMARY');
  console.log('═'.repeat(72));
  const failures = results.filter((r) => r.pctDiff > 1);
  console.log(`\n  Total KPIs audited: ${results.length}`);
  console.log(`  KPIs with >1% discrepancy: ${failures.length}`);
  if (failures.length === 0) {
    console.log('\n  ✓ ALL KPIs PASS — no discrepancies greater than 1% detected');
  } else {
    for (const f of failures) {
      console.log(`\n  ✗ ${f.kpi}: report=${f.reportValue}${f.unit}, audit=${f.auditValue}${f.unit}, diff=${f.pctDiff}%`);
    }
  }

  // ── Existing audit traces from the pipeline itself ──────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('PIPELINE SELF-AUDIT TRACES (from report.talabatOperations.auditTraces)');
  console.log('═'.repeat(72));
  for (const trace of tal.auditTraces ?? []) {
    const status = trace.status === 'valid' ? '✓' : '⚠️';
    console.log(`\n  ${status} ${trace.kpi}`);
    console.log(`    Formula:     ${trace.formula}`);
    console.log(`    Source:      ${trace.rawDataSource}`);
    console.log(`    Numerator:   ${trace.numerator} (${trace.numeratorLabel})`);
    console.log(`    Denominator: ${trace.denominator} (${trace.denominatorLabel})`);
    console.log(`    Result:      ${trace.result}`);
  }

  console.log('\n' + '═'.repeat(72));
  console.log('END OF PRODUCTION ACCURACY AUDIT');
  console.log('═'.repeat(72) + '\n');
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
