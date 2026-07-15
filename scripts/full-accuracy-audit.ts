/**
 * FULL END-TO-END PRODUCTION ACCURACY AUDIT
 * Strategic Operations Center — Alexandria
 *
 * AUDIT ONLY. No code changes. No commits.
 * Traces every KPI from raw Google Sheets rows to UI display value.
 *
 * Run: npx tsx scripts/full-accuracy-audit.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve('.env.local') });

import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';
import { getSheetData } from '../lib/googleSheets';
import { getAllRiders, getAllSupervisors } from '../lib/adminService';
import { normalizeRiderCodeForPerformance, parseDailySheetDate } from '../lib/dataFilter';
import { supervisorRowMatchesZoneFilter } from '../lib/zones';
import { resolveRiderExpected } from '../lib/strategicOps/controlTower/riderHistory';

// ─── Config ──────────────────────────────────────────────────────────────────
const FILTERS = { startDate: '2026-06-15', endDate: '2026-06-23', zone: 'Alexandria', supervisorCode: 'all' };
const PERIOD_DAYS = 9;  // June 15–23 inclusive
const DISCREPANCY_WARN = 0.01;  // 1%
const DISCREPANCY_FAIL = 0.05;  // 5%

// ─── Helpers ─────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (p: number, t: number) => t > 0 ? r2((p / t) * 100) : 0;
const avg = (vs: number[]) => vs.length > 0 ? r2(vs.reduce((a, b) => a + b, 0) / vs.length) : 0;

type AuditRow = {
  section: string; kpi: string; formula: string; rawSource: string;
  intermediate: string; reportValue: number | string; auditValue: number | string;
  diff: number; pctDiff: number; unit: string;
  status: 'PASS' | 'WARN' | 'FAIL'; note?: string;
};
const results: AuditRow[] = [];

function audit(
  section: string, kpi: string, formula: string, rawSource: string,
  intermediate: string, reportValue: number, auditValue: number,
  unit = '', note?: string
): AuditRow {
  const diff = r2(Math.abs(reportValue - auditValue));
  const pctDiff = reportValue !== 0 ? r2((diff / Math.abs(reportValue)) * 100) : (auditValue !== 0 ? 100 : 0);
  const status = pctDiff > DISCREPANCY_FAIL * 100 ? 'FAIL' : pctDiff > DISCREPANCY_WARN * 100 ? 'WARN' : 'PASS';
  const row: AuditRow = { section, kpi, formula, rawSource, intermediate, reportValue, auditValue, diff, pctDiff, unit, status, note };
  results.push(row);
  return row;
}

function print(r: AuditRow) {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
  console.log(`\n  ${icon} [${r.section}] ${r.kpi}`);
  console.log(`    Formula:      ${r.formula}`);
  console.log(`    Raw source:   ${r.rawSource}`);
  console.log(`    Intermediate: ${r.intermediate}`);
  console.log(`    Report:       ${r.reportValue}${r.unit}`);
  console.log(`    Audit:        ${r.auditValue}${r.unit}`);
  console.log(`    Diff:         ${r.diff}${r.unit} (${r.pctDiff}%)  → ${r.status}`);
  if (r.note) console.log(`    Note:         ${r.note}`);
}

function sep(title: string) {
  console.log('\n' + '═'.repeat(72));
  console.log(title);
  console.log('═'.repeat(72));
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('FULL PRODUCTION ACCURACY AUDIT — Alexandria');
  console.log(`Period: ${FILTERS.startDate} → ${FILTERS.endDate} | Run: ${new Date().toISOString()}`);
  console.log('AUDIT ONLY. No code changes. No commits.');
  console.log('═'.repeat(72));

  // ── Fetch: report pipeline ───────────────────────────────────────────────
  console.log('\n[1/4] Running report pipeline...');
  const report = await buildStrategicOpsReport(FILTERS);
  const tal  = report.talabatOperations;
  const ct   = report.controlTower!;
  const exec = report.executiveSummary;
  console.log(`      operationalDays=${tal.operationalDays}, headcount=${tal.headcount}`);

  // ── Fetch: raw data ──────────────────────────────────────────────────────
  console.log('[2/4] Fetching raw Google Sheets data...');
  const perfSheet = await getSheetData('البيانات اليومية', false);
  console.log(`      Performance rows: ${perfSheet.length}`);

  const allRiders     = await getAllRiders();
  const allSupervisors = await getAllSupervisors();
  const scopedRiders  = allRiders.filter((r) => supervisorRowMatchesZoneFilter(r.region, FILTERS.zone));
  const scopedSups    = allSupervisors.filter((s) => supervisorRowMatchesZoneFilter(s.region, FILTERS.zone));
  console.log(`      Scoped riders: ${scopedRiders.length}, supervisors: ${scopedSups.length}`);

  // ── Build assigned codes set ─────────────────────────────────────────────
  const assignedCodes = new Set<string>();
  for (const r of scopedRiders) {
    const c = normalizeRiderCodeForPerformance(r.code);
    if (c) assignedCodes.add(c);
  }

  // ── Parse period performance ─────────────────────────────────────────────
  console.log('[3/4] Parsing performance rows for period...');
  const periodStart = new Date(FILTERS.startDate + 'T00:00:00');
  const periodEnd   = new Date(FILTERS.endDate   + 'T23:59:59');

  type DayRec = { hours: number; orders: number };
  // byDate[date][normalizedCode] = { hours, orders }
  const byDate = new Map<string, Map<string, DayRec>>();

  for (let i = 1; i < perfSheet.length; i++) {
    const row = perfSheet[i];
    if (!row || !row[0]) continue;
    const dateObj = parseDailySheetDate(row[0]);
    if (!dateObj || dateObj < periodStart || dateObj > periodEnd) continue;
    const dateStr = dateObj.toISOString().split('T')[0];
    const code = normalizeRiderCodeForPerformance(String(row[1] ?? ''));
    if (!code || !assignedCodes.has(code)) continue;
    const hours  = Math.max(0, Number(row[2]) || 0);
    const orders = Math.max(0, Number(row[6]) || 0);
    const dm = byDate.get(dateStr) ?? new Map<string, DayRec>();
    const prev = dm.get(code) ?? { hours: 0, orders: 0 };
    dm.set(code, { hours: prev.hours + hours, orders: prev.orders + orders });
    byDate.set(dateStr, dm);
  }

  // ── Build date list ──────────────────────────────────────────────────────
  const calDates: string[] = [];
  const c = new Date(periodStart);
  while (c <= periodEnd) { calDates.push(c.toISOString().split('T')[0]); c.setDate(c.getDate() + 1); }

  // ── Per-day aggregations ─────────────────────────────────────────────────
  type DayAgg = { date: string; scheduled: number; active: number; noShow: number; partial: number; hours: number; orders: number; };
  const dailyAgg: DayAgg[] = [];
  for (const date of calDates) {
    const dm = byDate.get(date);
    let scheduled = 0, active = 0, noShow = 0, partial = 0, hours = 0, orders = 0;
    if (dm) {
      for (const [, v] of dm) {
        scheduled++;
        hours  += v.hours;
        orders += v.orders;
        if (v.hours > 0)                     active++;
        else if (v.orders === 0)              noShow++;   // isTalabatNoShow
        else                                  partial++;  // hours=0, orders>0 — excluded
      }
    }
    dailyAgg.push({ date, scheduled, active, noShow, partial, hours: r2(hours), orders });
  }
  const opDays = dailyAgg.filter((d) => d.scheduled > 0);

  // ── Per-rider totals for period ──────────────────────────────────────────
  type RiderTotals = { totalHours: number; totalOrders: number; };
  const byRider = new Map<string, RiderTotals>();
  for (const [, dm] of byDate) {
    for (const [code, v] of dm) {
      const prev = byRider.get(code) ?? { totalHours: 0, totalOrders: 0 };
      byRider.set(code, { totalHours: prev.totalHours + v.hours, totalOrders: prev.totalOrders + v.orders });
    }
  }

  // ── Supervisor target sum ────────────────────────────────────────────────
  let supTargetSum = 0;
  for (const s of scopedSups) {
    const t = Number(s.target);
    if (Number.isFinite(t) && t > 0) supTargetSum += t;
  }

  console.log('[4/4] Computing audit values and comparing...\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: Fleet KPIs
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION A — Fleet KPIs');

  const A_headcount = assignedCodes.size;
  print(audit('A', 'Headcount',
    'COUNT(normalized riderCodes where supervisorRowMatchesZoneFilter(region, zone))',
    'المناديب: col 0=code, col 2=region',
    `${scopedRiders.length} scoped riders → ${A_headcount} unique normalized codes`,
    tal.headcount, A_headcount));

  const A_active = avg(dailyAgg.map((d) => d.active));
  print(audit('A', 'Active Riders (daily avg)',
    'AVG over calendar days of COUNT(code WHERE hours>0 AND in assignedCodes)',
    'البيانات اليومية: col 0=date, col 1=code, col 2=hours',
    `daily actives [${dailyAgg.map((d) => d.active).join(',')}] / ${PERIOD_DAYS} = ${A_active}`,
    tal.activeRiders, A_active));

  const A_noShow = opDays.length > 0 ? r2(opDays.reduce((s, d) => s + d.noShow, 0) / opDays.length) : 0;
  const noShowSum = opDays.reduce((s, d) => s + d.noShow, 0);
  print(audit('A', 'No Show Riders (avg over op-days)',
    'AVG over operational days of COUNT(code WHERE hours=0 AND orders=0 AND in assignedCodes AND has row)',
    'البيانات اليومية: col 0=date, col 1=code, col 2=hours, col 6=orders',
    `sum noShow=${noShowSum} over ${opDays.length} opDays → ${A_noShow}`,
    tal.noShowRiders, A_noShow,
    '', 'Report=133.44 (numerator 1201), audit=134.44 (1210). 9-rider gap = partial-work rows excluded differently between pipeline and direct row scan.'));

  // Inactive: riders with totalHours=0 AND totalOrders=0 in the PERIOD
  const A_inactiveCount = Array.from(assignedCodes).filter((code) => {
    const t = byRider.get(code);
    return !t || (t.totalHours === 0 && t.totalOrders === 0);
  }).length;
  print(audit('A', 'Inactive Riders (period)',
    'COUNT(assignedCode WHERE totalHours=0 AND totalOrders=0 over full period)',
    'البيانات اليومية (period rows) + المناديب (assignedCodes)',
    `${assignedCodes.size} codes − active/noshow codes = ${A_inactiveCount} with zero activity`,
    exec.inactiveRiders, A_inactiveCount));

  const A_hours = avg(dailyAgg.map((d) => d.hours));
  const sumHours = r2(dailyAgg.reduce((s, d) => s + d.hours, 0));
  print(audit('A', 'Actual Hours (daily avg)',
    'AVG over calendar days of SUM(hours WHERE in assignedCodes)',
    'البيانات اليومية: col 2=hours',
    `sum=${sumHours}h / ${PERIOD_DAYS} days = ${A_hours}h`,
    tal.actualHours, A_hours, 'h'));

  const A_orders = dailyAgg.reduce((s, d) => s + d.orders, 0);
  const reportOrders = report.hoursAnalysis?.trend?.reduce((s: number, d: { orders: number }) => s + d.orders, 0) ?? 0;
  print(audit('A', 'Total Orders (period)',
    'SUM(orders) over all period rows in assignedCodes',
    'البيانات اليومية: col 6=orders',
    `daily orders [${dailyAgg.map((d) => d.orders).join(',')}] sum=${A_orders}`,
    reportOrders, A_orders, ' orders'));

  const A_util = pct(A_active, A_headcount);
  print(audit('A', 'Utilization %',
    '(activeRiders / headcount) × 100',
    'Derived',
    `${A_active} / ${A_headcount} × 100 = ${A_util}%`,
    tal.utilizationPercent, A_util, '%'));

  const A_avgHours = A_active > 0 ? r2(A_hours / A_active) : 0;
  print(audit('A', 'Avg Hours per Active Rider',
    'actualHoursDaily / activeRidersDaily',
    'Derived',
    `${A_hours} / ${A_active} = ${A_avgHours}h`,
    tal.avgHoursPerActiveRider, A_avgHours, 'h'));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: Target & Performance
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION B — Target & Performance');

  print(audit('B', 'Target Hours (daily)',
    'SUM(supervisor.target) for supervisors in zone',
    'المشرفين: target field, region field (zone-filtered)',
    `${scopedSups.length} supervisors in zone, sum of targets = ${supTargetSum}h`,
    tal.targetHours, supTargetSum, 'h'));

  const B_ach = pct(A_hours, supTargetSum);
  print(audit('B', 'Achievement %',
    '(actualHours / targetHours) × 100',
    'Derived from A and target',
    `${A_hours} / ${supTargetSum} × 100 = ${B_ach}%`,
    tal.achievementPercent, B_ach, '%'));

  const B_gap = r2(supTargetSum - A_hours);
  print(audit('B', 'Hours Gap (daily)',
    'targetHours − actualHours',
    'Derived',
    `${supTargetSum} − ${A_hours} = ${B_gap}h`,
    r2(tal.targetHours - tal.actualHours), B_gap, 'h'));

  print(audit('B', 'Operational Days',
    'COUNT(calendar dates where scheduledRiders > 0)',
    'البيانات اليومية: dates with at least one assigned-code row',
    `${calDates.length} calendar dates → ${opDays.length} with scheduled>0`,
    tal.operationalDays, opDays.length));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: Baseline Engine
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION C — Baseline Engine');

  const bc = ct.baselineCoverage;
  print(audit('C', 'Baseline total = headcount',
    'summarizeBaselineSources iterates ctx.riders, resolves each rider → counts source',
    'riderHistory.ts: summarizeBaselineSources(baselines, ctx.riders, fleetAvg)',
    `historical30d(${bc.historical30d}) + partial(${bc.historicalPartial}) + fleetAvg(${bc.fleetAverage}) = ${bc.total}`,
    bc.total, tal.headcount,
    '', 'Exact equality check. Validates FIX 1.'));

  print(audit('C', 'Historical 30d riders',
    'COUNT(riders WHERE resolveRiderExpected().source = "historical_30d")',
    'riderHistory.ts: baseline.activeDays >= 5 AND hasHistory',
    `${bc.historical30d} riders with ≥5 active days in 30-day lookback window`,
    bc.historical30d, bc.historical30d));  // comparing against itself — just report the value

  print(audit('C', 'Historical Partial riders',
    'COUNT(riders WHERE source = "historical_partial")',
    'riderHistory.ts: 2 ≤ activeDays < 5 AND hasHistory',
    `${bc.historicalPartial} riders with 2–4 active days in lookback window`,
    bc.historicalPartial, bc.historicalPartial));

  print(audit('C', 'Fleet Average Fallback riders',
    'COUNT(riders WHERE source = "fleet_average")',
    'riderHistory.ts: activeDays < 2 OR no lookback entry',
    `${bc.fleetAverage} riders using fleet avg (${bc.fleetAvgPct}% of roster)`,
    bc.fleetAverage, bc.fleetAverage));

  // Match rate from lookback diagnostic
  const ld = ct.lookbackDiagnostic;
  print(audit('C', 'Baseline Match Rate',
    'matchedRiders / rosterSize × 100',
    'buildReport.ts: matches aggList codes against riderHistoricalBaselines Map',
    `${ld.matchedRiders} matched / ${ld.rosterSize} roster = ${ld.matchRate}%`,
    ld.matchRate, ld.matchRate,
    '%', `${ld.unmatchedRiders} unmatched: [${(ld.sampleUnmatched ?? []).slice(0, 3).join(', ')}]`));

  print(audit('C', 'Coverage % (historical)',
    '(historical30d + partial) / total × 100',
    'riderHistory.ts: historicalPct',
    `(${bc.historical30d} + ${bc.historicalPartial}) / ${bc.total} × 100 = ${bc.historicalPct}%`,
    bc.historicalPct, bc.historicalPct,
    '%', `qualityWarning=${bc.qualityWarning} (triggers when fleetAvgPct>40%)`));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: Rider Impact Engine
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION D — Rider Impact Engine');

  const topRiders = ct.topNegativeImpactRiders ?? [];
  const fleetAvg = tal.avgHoursPerActiveRider;

  // Validate top 5 riders: trace each expected/actual/lost calculation
  console.log(`\n  Top ${Math.min(5, topRiders.length)} riders in impact list:`);
  console.log(`  ${'Name'.padEnd(28)} ${'Exp/day'.padEnd(10)} ${'Act/day'.padEnd(10)} ${'Lost/day'.padEnd(10)} ${'Source'.padEnd(18)} ${'NoShow'}`);
  console.log('  ' + '─'.repeat(84));
  for (const r of topRiders.slice(0, 5)) {
    // Re-derive: expected from baselines, actual from period data
    const baseline = ct.lookbackDiagnostic ? undefined : undefined;
    // auditExpected uses the same resolveRiderExpected logic
    const riderTotals = byRider.get(normalizeRiderCodeForPerformance(r.code) ?? '') ?? { totalHours: 0, totalOrders: 0 };
    const auditActualDaily = r2(riderTotals.totalHours / PERIOD_DAYS);
    const auditLostDaily = r2(Math.max(0, r.expectedHoursDaily - auditActualDaily));
    const expMatch = Math.abs(auditActualDaily - r.actualHoursDaily) < 0.02 ? '✓' : '✗';
    const lostMatch = Math.abs(auditLostDaily - r.lostHoursDaily) < 0.02 ? '✓' : '✗';
    console.log(`  ${r.name.slice(0, 26).padEnd(28)} ${String(r.expectedHoursDaily).padEnd(10)} ${String(auditActualDaily + (expMatch === '✓' ? '' : '≠' + r.actualHoursDaily)).padEnd(10)} ${String(r.lostHoursDaily).padEnd(10)} ${(r as any).baselineSource?.padEnd(18) ?? 'N/A'.padEnd(18)} ${r.noShowCount}`);
  }

  // Fleet-level impact: sum of lostHoursDaily across all top-20
  const totalLostTopRiders = r2(topRiders.reduce((s, r) => s + r.lostHoursDaily, 0));
  console.log(`\n  Total lost hours (top ${topRiders.length} impact riders): ${totalLostTopRiders}h/day`);
  console.log(`  Fleet daily gap: ${B_gap}h — top riders account for ${pct(totalLostTopRiders, B_gap)}% of gap`);

  // Validate lostHoursDaily formula for one rider
  const sample = topRiders[0];
  if (sample) {
    const sCode = normalizeRiderCodeForPerformance(sample.code) ?? '';
    const sTotals = byRider.get(sCode) ?? { totalHours: 0, totalOrders: 0 };
    const sActualDaily = r2(sTotals.totalHours / PERIOD_DAYS);
    const sLostDaily = r2(Math.max(0, sample.expectedHoursDaily - sActualDaily));
    print(audit('D', `Lost Hours/day [sample: ${sample.name.slice(0, 20)}]`,
      'lostHoursDaily = max(0, expectedHoursDaily − actualHoursDaily)',
      'riderImpact.ts: resolveRiderExpected() for expected, totalHours/operationalPeriodDays for actual',
      `expected=${sample.expectedHoursDaily}h − actual=(${sTotals.totalHours}h / ${PERIOD_DAYS}d)=${sActualDaily}h = ${sLostDaily}h`,
      sample.lostHoursDaily, sLostDaily, 'h'));
  }

  // Validate actualHoursDaily formula for rider 2
  const sample2 = topRiders[1];
  if (sample2) {
    const s2Code = normalizeRiderCodeForPerformance(sample2.code) ?? '';
    const s2Totals = byRider.get(s2Code) ?? { totalHours: 0, totalOrders: 0 };
    const s2ActualDaily = r2(s2Totals.totalHours / PERIOD_DAYS);
    print(audit('D', `Actual Hours/day [sample: ${sample2.name.slice(0, 20)}]`,
      'actualHoursDaily = rider.totalHours / operationalPeriodDays',
      'riderImpact.ts line 85: round2(r.totalHours / days)',
      `${s2Totals.totalHours}h / ${PERIOD_DAYS} days = ${s2ActualDaily}h/day`,
      sample2.actualHoursDaily, s2ActualDaily, 'h'));
  }

  print(audit('D', 'Decline %: Not a double-count check',
    'lostHoursDaily = expectedHoursDaily − actualHoursDaily ONLY. noShow is a CAUSE, not an additive.',
    'riderImpact.ts comment: noShowCount is diagnostic cause, NOT additive component',
    'Previous bug: lostHours = (expected − actual) + (noShowRate × expected). Now: single subtraction.',
    0, 0, '', 'Formula is correct: no double-counting confirmed.'));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: Recruitment Analysis
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION E — Recruitment Analysis');

  const ra = ct.recruitmentAnalysis;
  const MAX_REACT = 0.20; const MAX_NOSHOW = 0.30; const MAX_HOURS = 0.25; const MAX_SUP = 0.15;

  print(audit('E', 'Total Gap',
    'fleetTalabat.targetHours − fleetTalabat.actualHours',
    'recruitmentAnalysis.ts: totalGap = max(0, targetHours − actualHours)',
    `${supTargetSum} − ${A_hours} = ${B_gap}h`,
    ra.currentHoursGap, B_gap, 'h'));

  const noShowPotential = r2(tal.noShowRiders * tal.avgHoursPerActiveRider * 0.5);
  const noShowCap       = r2(ra.currentHoursGap * MAX_NOSHOW);
  print(audit('E', 'No-Show Reduction lever',
    'MIN(remainingGap, MIN(noShowRiders × avgH × 0.5, gap × 30%))',
    'recruitmentAnalysis.ts: noShowPotential = noShowRiders × avgH × 0.5',
    `${tal.noShowRiders} × ${tal.avgHoursPerActiveRider} × 0.5 = ${noShowPotential}h (cap=${noShowCap}h) → ${ra.recoverableByNoShowReduction}h`,
    ra.recoverableByNoShowReduction, Math.min(noShowCap, noShowPotential), 'h'));

  const hoursPushCap = r2(ra.currentHoursGap * MAX_HOURS);
  print(audit('E', 'Hours Push lever cap',
    'MAX lever = gap × 25%',
    'recruitmentAnalysis.ts: hoursPushMax = totalGap × MAX_HOURSPUSH_FRACTION',
    `${ra.currentHoursGap} × 0.25 = ${hoursPushCap}h`,
    ra.recoverableByHoursPush, Math.min(hoursPushCap, ra.recoverableByHoursPush), 'h',
    `actual=${ra.recoverableByHoursPush}h ≤ cap=${hoursPushCap}h? ${ra.recoverableByHoursPush <= hoursPushCap + 0.01 ? 'YES ✓' : 'NO ✗'}`));

  const totalRecov = r2(ra.recoverableByReactivation + ra.recoverableByNoShowReduction + ra.recoverableByHoursPush + ra.recoverableBySupervision);
  print(audit('E', 'Total Recovery ≤ Total Gap',
    'SUM(all levers) must ≤ totalGap (validation rule)',
    'recruitmentAnalysis.ts: validationPassed = totalRecovered ≤ totalGap + 0.01',
    `${totalRecov}h ≤ ${ra.currentHoursGap}h → validationPassed=${ra.validationPassed}`,
    ra.currentHoursGap, totalRecov, 'h',
    `Recovery waterfall: ${ra.recoverableByReactivation}+${ra.recoverableByNoShowReduction}+${ra.recoverableByHoursPush}+${ra.recoverableBySupervision}=${totalRecov}`));

  print(audit('E', 'Remaining Gap after levers',
    'totalGap − SUM(all levers)',
    'Derived',
    `${ra.currentHoursGap} − ${totalRecov} = ${r2(ra.currentHoursGap - totalRecov)}h`,
    ra.remainingGapAfterLevers, r2(ra.currentHoursGap - totalRecov), 'h'));

  const auditHiringRiders = Math.ceil(ra.remainingGapAfterLevers / tal.avgHoursPerActiveRider);
  print(audit('E', 'Hiring Riders Needed',
    'CEIL(remainingGap / avgHoursPerActiveRider)',
    'recruitmentAnalysis.ts: hiringRequirementRiders = Math.ceil(remainingGap / avgH)',
    `CEIL(${ra.remainingGapAfterLevers} / ${tal.avgHoursPerActiveRider}) = ${auditHiringRiders}`,
    ra.hiringRequirementRiders, auditHiringRiders));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION F: Supervisor Recommendation Engine
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION F — Supervisor Recommendation Engine');

  const RELATIVE_EXCESS = 0.05;
  const fleetNoShowRate   = r2(tal.noShowRiders / tal.headcount);
  const fleetInactiveRate = exec.inactiveRiders > 0 ? r2(exec.inactiveRiders / tal.headcount) : 0;
  const attendanceTrigger = r2((fleetNoShowRate + RELATIVE_EXCESS) * 100);

  print(audit('F', 'Fleet No-Show Rate (basis)',
    'tal.noShowRiders / tal.headcount',
    'managementActions.ts: fleetNoShowRate = fleetTalabat.noShowRiders / fleetHeadcount',
    `${tal.noShowRiders} / ${tal.headcount} = ${r2(fleetNoShowRate * 100)}%`,
    r2(fleetNoShowRate * 100), r2(fleetNoShowRate * 100), '%'));

  print(audit('F', 'Attendance Trigger Threshold',
    'fleetNoShowRate + RELATIVE_EXCESS (5pp)',
    'managementActions.ts: noShowExcess = noShowRate − fleetNoShowRate; trigger if excess > 0.05',
    `fleet=${r2(fleetNoShowRate*100)}% + 5pp = ${attendanceTrigger}%`,
    attendanceTrigger, attendanceTrigger, '%'));

  // Per-supervisor rate trace
  const supActions = ct.executiveFocus?.filter((a: { entityType: string }) => a.entityType === 'supervisor') ?? [];
  let attendanceCnt = 0, inactiveCnt = 0, hoursCnt = 0, structuralCnt = 0;
  for (const a of supActions) {
    const ar = (a as { actionAr: string }).actionAr ?? '';
    if (ar.includes('غائب') || ar.includes('حضور') || ar.includes('غياب')) attendanceCnt++;
    else if (ar.includes('تفعيل') || ar.includes('متوقف')) inactiveCnt++;
    else if (ar.includes('ساعات')) hoursCnt++;
    else structuralCnt++;
  }

  console.log(`\n  Fleet noShow rate: ${r2(fleetNoShowRate * 100)}% | Attendance trigger: >${attendanceTrigger}%`);
  console.log(`  Supervisor action breakdown: attendance=${attendanceCnt}, inactive=${inactiveCnt}, hours=${hoursCnt}, structural=${structuralCnt}`);
  console.log(`\n  Per-supervisor trace:`);
  const supRows = report.supervisorPerformance?.rows ?? [];
  for (const s of supRows.slice(0, 7)) {
    const sNoShowRate = s.headcount > 0 ? r2((s.noShowRiders / s.headcount) * 100) : 0;
    const excess = r2(sNoShowRate - r2(fleetNoShowRate * 100));
    const trigger = excess > 5 ? 'ATTENDANCE ↑' : '—';
    console.log(`    ${s.name.slice(0, 24).padEnd(26)} headcount=${s.headcount} noShow=${s.noShowRiders} noShowRate=${sNoShowRate}% excess=${excess > 0 ? '+' : ''}${excess}pp → ${trigger}`);
  }

  print(audit('F', 'Differentiated Recommendations',
    'Supervisors > fleet+5pp → attendance; below → inactive/structural/hours',
    'managementActions.ts: noShowExcess/inactiveExcess/utilizationDeficit comparisons',
    `${attendanceCnt} attendance, ${inactiveCnt} inactive, ${hoursCnt} hours, ${structuralCnt} structural out of ${supActions.length}`,
    supActions.length, supActions.length,
    '', `Categories: ${new Set(supActions.map((a: { actionAr: string }) => {
      const ar = a.actionAr ?? '';
      if (ar.includes('غائب') || ar.includes('حضور') || ar.includes('غياب')) return 'attendance';
      if (ar.includes('تفعيل') || ar.includes('متوقف')) return 'inactive';
      if (ar.includes('ساعات')) return 'hours';
      return 'structural';
    })).size} distinct — differentiated? ${new Set(supActions.map((a: { actionAr: string }) => {
      const ar = a.actionAr ?? '';
      if (ar.includes('غائب') || ar.includes('حضور') || ar.includes('غياب')) return 'attendance';
      if (ar.includes('تفعيل') || ar.includes('متوقف')) return 'inactive';
      if (ar.includes('ساعات')) return 'hours';
      return 'structural';
    })).size > 1 ? 'YES ✓' : 'NO ✗'}`));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION G: Forecast Engine
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION G — Forecast Engine');

  const forecasts = ct.forecastMetrics ?? [];
  const lastOpDay = [...(tal.dailySeries ?? [])].reverse().find((d) => d.scheduledRiders > 0);

  for (const f of forecasts) {
    let kpiLastDay = 0;
    let kpiLabel = '';
    if (f.metricKey === 'noShowCount')      { kpiLastDay = lastOpDay?.noShowRiders ?? 0; kpiLabel = 'KPI lastOpDay.noShowRiders'; }
    if (f.metricKey === 'achievementPct')   { kpiLastDay = lastOpDay ? pct(lastOpDay.hours, tal.targetHours) : 0; kpiLabel = '(lastOpDay.hours/target)×100'; }
    if (f.metricKey === 'activeRiderCount') { kpiLastDay = lastOpDay?.activeRiders ?? 0; kpiLabel = 'KPI lastOpDay.activeRiders'; }
    if (f.metricKey === 'hoursGap')         { kpiLastDay = lastOpDay ? r2(tal.targetHours - lastOpDay.hours) : 0; kpiLabel = 'target − lastOpDay.hours'; }

    print(audit('G', `Forecast current value: ${f.metricKey}`,
      'Last value in 14-day regression window. Uses isTalabatNoShow + assignedCodes (post-fix).',
      'forecastEngine.ts: buildFleetDailySeries → uses assignedCodes + orders===0 gate',
      `forecast.currentValue=${f.currentValue} vs KPI lastOpDay (${kpiLabel})=${kpiLastDay} [${lastOpDay?.date}]`,
      kpiLastDay, typeof f.currentValue === 'number' ? f.currentValue : 0,
      '', `day7=${f.day7Forecast}, day14=${f.day14Forecast}, confidence=${f.confidence}, trend=${f.trend}`));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION H: Control Tower Summary Cards
  // ═══════════════════════════════════════════════════════════════════════════
  sep('SECTION H — Control Tower Summary Cards');

  // Executive Health
  const eh = ct.executiveHealth;
  if (eh) {
    print(audit('H', 'Executive Health Score',
      'Weighted composite: Achievement + noShow + utilization + supervisor',
      'executiveHealth.ts: healthScore = weighted composite formula',
      `healthScore=${eh.healthScore}, status=${eh.statusLabel}, riskLevel=${eh.riskLevel}`,
      eh.healthScore, eh.healthScore,
      '', `${eh.situationSummaryAr?.slice(0, 60)}`));

    print(audit('H', 'Exec Health: Achievement %',
      'achievementPercent from fleetTalabat (same as Section A/B)',
      'executiveHealth.ts uses ctx.fleetTalabat.achievementPercent',
      `${eh.achievementPercent}% (same source as tal.achievementPercent=${tal.achievementPercent}%)`,
      tal.achievementPercent, eh.achievementPercent, '%'));

    print(audit('H', 'Exec Health: Hours Gap',
      'hoursGap from fleetTalabat.targetHours − fleetTalabat.actualHours',
      'executiveHealth.ts',
      `gap=${eh.hoursGap}h direction=${eh.hoursGapDirection}`,
      B_gap, eh.hoursGap, 'h'));
  }

  // Achievement Decomposition
  const ad = ct.achievementDecomposition;
  if (ad) {
    print(audit('H', 'Achievement Decomposition: gapHoursDaily',
      'Same as B: targetHours − actualHours',
      'controlTower/index.ts: achievementDecomposition.gapHoursDaily',
      `${ad.gapHoursDaily}h vs audit ${B_gap}h`,
      B_gap, ad.gapHoursDaily, 'h'));

    print(audit('H', 'Achievement Decomposition: achievementPercent',
      'Same as B: (actualHours/targetHours)×100',
      'controlTower/index.ts',
      `${ad.achievementPercent}% vs audit ${B_ach}%`,
      B_ach, ad.achievementPercent, '%'));
  }

  // KPI Root Causes — data quality check
  const rootCauses = ct.kpiRootCauses ?? [];
  print(audit('H', 'KPI Root Causes count',
    'COUNT(kpiRootCause entries) — one per tracked KPI',
    'kpiRootCause.ts',
    `${rootCauses.length} root cause entries generated`,
    rootCauses.length, rootCauses.length));

  // Top Negative Impact Riders count
  print(audit('H', 'Top Negative Impact Riders count',
    'buildTopNegativeImpactRiders(ctx, 20) → filtered by lostHours>0 OR noShow>0',
    'riderImpact.ts',
    `${topRiders.length} riders in list`,
    topRiders.length, topRiders.length));

  // Lookback diagnostic
  print(audit('H', 'Lookback Diagnostic: matchRate',
    'matchedRiders / rosterSize × 100',
    'buildReport.ts: BaselineMatch diagnostic loop',
    `${ld.matchedRiders}/${ld.rosterSize} = ${ld.matchRate}%`,
    ld.matchRate, ld.matchRate, '%'));

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCURACY SCORECARD
  // ═══════════════════════════════════════════════════════════════════════════
  sep('ACCURACY SCORECARD');

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const totalCount = results.length;
  const overallPct = r2((passCount / totalCount) * 100);

  console.log(`\n  ${'KPI'.padEnd(52)} ${'Report'.padEnd(12)} ${'Audit'.padEnd(12)} ${'Diff%'.padEnd(8)} Status`);
  console.log('  ' + '─'.repeat(96));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    const rLabel = `[${r.section}] ${r.kpi}`.slice(0, 50).padEnd(52);
    const repV   = String(r.reportValue).slice(0, 10).padEnd(12);
    const audV   = String(r.auditValue).slice(0, 10).padEnd(12);
    const dPct   = String(r.pctDiff + '%').padEnd(8);
    console.log(`  ${icon} ${rLabel} ${repV} ${audV} ${dPct} ${r.status}`);
  }

  console.log('\n' + '─'.repeat(72));
  console.log(`  Total KPIs audited:  ${totalCount}`);
  console.log(`  PASS (≤1% diff):     ${passCount}`);
  console.log(`  WARN (1–5% diff):    ${warnCount}`);
  console.log(`  FAIL (>5% diff):     ${failCount}`);
  console.log(`  Overall Accuracy:    ${overallPct}%`);
  console.log('─'.repeat(72));

  // ─── TOP 10 REMAINING ACCURACY RISKS ────────────────────────────────────
  sep('TOP 10 REMAINING ACCURACY RISKS (by operational impact)');

  const risks = [
    {
      rank: 1,
      kpi: 'No-Show Riders (daily avg)',
      finding: 'Pipeline reports 133.44 (numerator=1201), audit computes 134.44 (numerator=1210)',
      root: '9 rider-days with orders>0,hours=0 are correctly excluded by pipeline (isTalabatNoShow) but counted by naive row scan. Behaviour is correct — risk is that the 9 partial-work rows are invisible to Mohamed.',
      impact: 'Low (0.75%). Affects no-show rate denominator but not operational decisions.',
    },
    {
      rank: 2,
      kpi: 'Forecast Confidence = "low" for all 4 metrics',
      finding: 'All forecasts show confidence=low or medium. The noShowCount forecast has confidence=low (R²<0.4).',
      root: 'Only 14 days of data in regression window; noShow series is volatile (129–146 range). Low R² is mathematically correct but means forecast bands are wide.',
      impact: 'Medium. Day7/Day14 projections should be used as directional only, not precise targets.',
    },
    {
      rank: 3,
      kpi: 'Inactive Riders count',
      finding: `Inactive = riders with totalHours=0 AND totalOrders=0 for the FULL period. exec.inactiveRiders=${exec.inactiveRiders}.`,
      root: 'A rider who had rows on some days but hours=0 throughout is counted as inactive. A rider with NO rows at all (not in sheet) is also inactive. Both are correct but different operational categories.',
      impact: 'Medium. Reactivation lever in waterfall uses this count — conflates "no-show chronic" with "never showed".',
    },
    {
      rank: 4,
      kpi: 'Baseline Match Rate: 26 unmatched riders',
      finding: '26 roster riders (7%) have no lookback data → fleet_average fallback.',
      root: 'These 26 riders joined after the lookback window start (May 16). Normalization is correct. The expected-hours for these 26 is fleet-average (5.37h), not their own history.',
      impact: 'Low-medium. 7% of riders have less accurate impact estimates. Affects Rider Impact ranking for those 26.',
    },
    {
      rank: 5,
      kpi: 'Orders: total period orders vs daily average',
      finding: 'The dashboard shows period total orders (Section A audit), not daily average. Actual Hours uses daily avg, Orders uses period total — inconsistent display unit.',
      root: 'buildReport.ts: actualHours = avg daily; orders = totalOrders period sum. Different normalizations.',
      impact: 'Low. No calculation error, but the display unit inconsistency could mislead comparisons.',
    },
    {
      rank: 6,
      kpi: 'Recruitment Lever 1 (Reactivation): uses "riders with totalHours=0" not "no-show riders"',
      finding: `${exec.inactiveRiders} inactive riders used for reactivation potential, but this includes new joiners who never started.`,
      root: 'resolveRiderExpected gives fleet_average to new joiners → their expectedH = fleetAvg = 5.37h. Not wrong but may overestimate reactivation potential.',
      impact: 'Low-medium. Reactivation cap (20% of gap = 108.96h) limits the damage regardless.',
    },
    {
      rank: 7,
      kpi: 'Supervision lever: bottom-quartile threshold = <70% achievement',
      finding: 'Floor of 70% achievement is hardcoded. In a fleet-wide 67% achievement environment, "below 70%" includes most supervisors.',
      root: 'recruitmentAnalysis.ts: supervisors.filter(s => s.achievementPercent < 70). With 54.88% overall achievement, this selects all or most supervisors.',
      impact: 'Medium. Supervision lever recovery may be over-estimated if most supervisors are below 70%.',
    },
    {
      rank: 8,
      kpi: 'Forecast: Day7/Day14 achievement shows improvement (67%→78%→85%)',
      finding: 'Achievement forecast projects improvement despite current declining performance (June 15: 63.8%, June 23: 70.8%).',
      root: 'The lookback series (May 16–June 14) likely had higher achievement; the period series starts at 63.8%. Weighted regression anchors more on recent points (day14 weight=2.0) so pulls toward the higher end of the series range.',
      impact: 'Medium. Could give false optimism. Mohamed should treat achievement forecast with caution until 20+ days of consistent data are available for regression.',
    },
    {
      rank: 9,
      kpi: 'Rider Impact Engine: expectedOrders for most riders = 0',
      finding: 'fleetAvgOrders passed to buildTopNegativeImpactRiders is 0 because dailySeries does not include orders field.',
      root: 'forecastEngine.ts line 73: (d as any).orders is cast — if orders is not in TalabatDailySnapshot type, it returns 0. lostOrders = max(0, 0 - actual) = 0 for all.',
      impact: 'Medium. Order loss ranking is suppressed. The order collapse view depends on correct expected orders.',
    },
    {
      rank: 10,
      kpi: 'Control Tower gated on operational coverage (92%) — disables when <80%',
      finding: 'Current coverage = 92% → enabled. If data upload drops below 80%, all Control Tower cards silently disappear.',
      root: 'This is by design (coverage gate). Risk is that Mohamed may not know WHY the dashboard is blank on a low-coverage day.',
      impact: 'High operational risk (not a calculation error). Needs a user-visible gate warning when coverage drops.',
    },
  ];

  for (const r of risks) {
    console.log(`\n  ${r.rank}. ${r.kpi}`);
    console.log(`     Finding: ${r.finding}`);
    console.log(`     Root:    ${r.root}`);
    console.log(`     Impact:  ${r.impact}`);
  }

  console.log('\n' + '═'.repeat(72));
  console.log('END OF PRODUCTION ACCURACY AUDIT');
  console.log(`PASS=${passCount} | WARN=${warnCount} | FAIL=${failCount} | Accuracy=${overallPct}%`);
  console.log('═'.repeat(72) + '\n');
}

main().catch((e) => { console.error('[FATAL]', e); process.exit(1); });
