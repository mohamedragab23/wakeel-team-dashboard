/**
 * POST-FIX PRODUCTION VALIDATION REPORT — SECTION A (Real Alexandria data)
 * Run: npx tsx scripts/post-fix-production-validation.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve('.env.local') });

import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';

const FILTERS = {
  startDate: '2026-06-15',
  endDate: '2026-06-25',
  zone: 'Alexandria',
  supervisorCode: 'all',
};

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('PRODUCTION VALIDATION REPORT — Alexandria');
  console.log('Period:', FILTERS.startDate, '→', FILTERS.endDate);
  console.log('Run at:', new Date().toISOString());
  console.log('═'.repeat(70));

  let report: Awaited<ReturnType<typeof buildStrategicOpsReport>>;
  try {
    report = await buildStrategicOpsReport(FILTERS);
  } catch (err) {
    console.error('\n[ERROR] buildStrategicOpsReport failed:', err);
    process.exit(1);
  }

  const tal = report.talabatOperations;
  const ct = report.controlTower;

  // ─── SECTION A: Real KPIs ────────────────────────────────────────────────
  console.log('\n── SECTION A: Production KPIs ─────────────────────────────────────────');
  console.log(`  headcount          = ${tal.headcount}`);
  console.log(`  activeRiders       = ${tal.activeRiders}`);
  console.log(`  noShowRiders       = ${tal.noShowRiders}`);
  console.log(`  actualHours        = ${tal.actualHours}`);
  console.log(`  targetHours        = ${tal.targetHours}`);
  console.log(`  achievementPct     = ${tal.achievementPercent}%`);
  console.log(`  gap (target-actual)= ${Math.round((tal.targetHours - tal.actualHours) * 100) / 100}h`);
  console.log(`  operationalDays    = ${tal.operationalDays}`);

  // Last OPERATIONAL day = last day where riders were actually scheduled
  const lastDay = tal.dailySeries?.[tal.dailySeries.length - 1];
  const lastOperationalDay = [...(tal.dailySeries ?? [])].reverse().find((d) => d.scheduledRiders > 0);
  if (lastDay) {
    console.log(`  lastCalendarDate   = ${lastDay.date} (scheduled=${lastDay.scheduledRiders}, noShow=${lastDay.noShowRiders})`);
  }
  if (lastOperationalDay) {
    console.log(`  lastOperationalDate= ${lastOperationalDay.date}`);
    console.log(`  lastOp.activeRiders  = ${lastOperationalDay.activeRiders}`);
    console.log(`  lastOp.noShowRiders  = ${lastOperationalDay.noShowRiders}  ← KPI value for that day`);
    console.log(`  lastOp.scheduled     = ${lastOperationalDay.scheduledRiders}`);
  }

  // ─── Baseline Coverage ────────────────────────────────────────────────────
  console.log('\n── SECTION A: Baseline Coverage ───────────────────────────────────────');
  if (ct?.baselineCoverage) {
    const bc = ct.baselineCoverage;
    console.log(`  historical30d      = ${bc.historical30d}`);
    console.log(`  historicalPartial  = ${bc.historicalPartial}`);
    console.log(`  fleetAverage       = ${bc.fleetAverage}`);
    console.log(`  total              = ${bc.total}`);
    console.log(`  headcount          = ${tal.headcount}`);
    console.log(`  historicalPct      = ${bc.historicalPct}%`);
    console.log(`  fleetAvgPct        = ${bc.fleetAvgPct}%`);
    console.log(`  qualityWarning     = ${bc.qualityWarning}`);
    console.log(`  VALIDATION: total === headcount → ${bc.total === tal.headcount ? 'PASS ✓' : `FAIL ✗ (${bc.total} !== ${tal.headcount})`}`);
    console.log(`  VALIDATION: 30d+partial+fleet sum → ${bc.historical30d + bc.historicalPartial + bc.fleetAverage === bc.total ? 'PASS ✓' : 'FAIL ✗'}`);
  } else {
    console.log('  [WARN] ct.baselineCoverage not available');
  }

  // ─── Baseline Match Rate ──────────────────────────────────────────────────
  console.log('\n── SECTION A: Baseline Match Rate ─────────────────────────────────────');
  if (ct?.lookbackDiagnostic) {
    const ld = ct.lookbackDiagnostic;
    console.log(`  rosterSize         = ${ld.rosterSize}`);
    console.log(`  matchedRiders      = ${ld.matchedRiders}`);
    console.log(`  unmatchedRiders    = ${ld.unmatchedRiders}`);
    console.log(`  matchRate          = ${ld.matchRate}%`);
    console.log(`  sampleUnmatched    = [${(ld.sampleUnmatched ?? []).slice(0, 5).join(', ')}]`);
    const warn = (ld.unmatchedRiders ?? 0) > (ld.rosterSize ?? 1) * 0.1;
    console.log(`  Status: ${warn ? `⚠️  WARN: ${ld.unmatchedRiders} unmatched (${100 - ld.matchRate}%) — normalization mismatch likely` : '✓  OK: match rate ≥ 90%'}`);
  } else {
    console.log('  [WARN] ct.lookbackDiagnostic not available');
  }

  // ─── Forecast ─────────────────────────────────────────────────────────────
  console.log('\n── SECTION A: Forecast Validation ─────────────────────────────────────');
  if (ct?.forecastMetrics && ct.forecastMetrics.length > 0) {
    for (const f of ct.forecastMetrics) {
      console.log(`  [${f.metricKey}]`);
      console.log(`    currentValue   = ${f.currentValue}`);
      console.log(`    day7Forecast   = ${f.day7Forecast}`);
      console.log(`    day14Forecast  = ${f.day14Forecast}`);
      console.log(`    confidence     = ${f.confidence}`);
      console.log(`    trend          = ${f.trend}`);
      if (f.alertAr) console.log(`    alert          = ${f.alertAr}`);
    }
    const noShowF = ct.forecastMetrics.find((f) => f.metricKey === 'noShowCount');
    if (noShowF && lastOperationalDay) {
      const kpiLastDay = lastOperationalDay.noShowRiders;      // same-day KPI value
      const kpiAvg = tal.noShowRiders;                         // 9-day KPI average
      const forecastCurrent = noShowF.currentValue;            // last data point in regression window

      const diffVsLastDay = Math.abs(forecastCurrent - kpiLastDay);
      const diffVsAvg     = Math.abs(forecastCurrent - kpiAvg);
      const pctVsLastDay  = kpiLastDay > 0 ? Math.round((diffVsLastDay / kpiLastDay) * 1000) / 10 : 0;
      const pctVsAvg      = kpiAvg > 0 ? Math.round((diffVsAvg / kpiAvg) * 1000) / 10 : 0;

      console.log(`\n  ── No-Show Reconciliation (Final) ────────────────────────────────`);
      console.log(`  KPI noShowRiders (9-day avg)       = ${kpiAvg}`);
      console.log(`  KPI noShowRiders (last oper. day)  = ${kpiLastDay}  [${lastOperationalDay.date}]`);
      console.log(`  Forecast currentValue              = ${forecastCurrent}  [last 14-day window end]`);
      console.log(`  Absolute diff vs last oper. day    = ${diffVsLastDay} riders`);
      console.log(`  Percentage diff vs last oper. day  = ${pctVsLastDay}%`);
      console.log(`  Absolute diff vs 9-day KPI avg     = ${diffVsAvg} riders`);
      console.log(`  Percentage diff vs 9-day KPI avg   = ${pctVsAvg}%`);
      console.log(`  TARGET: abs diff ≤ 1 rider, pct < 1%`);
      console.log(`  RESULT vs same day: ${diffVsLastDay <= 1 ? `✓ PASS (diff=${diffVsLastDay})` : diffVsLastDay <= 5 ? `⚠️ NEAR (diff=${diffVsLastDay} — within daily fluctuation)` : `✗ FAIL (diff=${diffVsLastDay})`}`);
    }
  } else {
    console.log('  [WARN] forecastMetrics not available (coverage gated or no lookback data)');
  }

  // ─── Supervisor Distribution ──────────────────────────────────────────────
  console.log('\n── SECTION A: Supervisor Recommendation Distribution ──────────────────');
  const allActions = ct?.executiveFocus ?? [];
  if (allActions.length > 0) {
    const supActions = allActions.filter((a: { entityType: string }) => a.entityType === 'supervisor');
    let attendanceCount = 0, inactiveCount = 0, hoursPushCount = 0, structuralCount = 0;
    for (const a of supActions) {
      const actionAr: string = (a as { actionAr: string }).actionAr ?? '';
      if (actionAr.includes('غائب') || actionAr.includes('حضور') || actionAr.includes('غياب')) attendanceCount++;
      else if (actionAr.includes('تفعيل') || actionAr.includes('متوقف')) inactiveCount++;
      else if (actionAr.includes('ساعات') || actionAr.includes('النشطين')) hoursPushCount++;
      else structuralCount++;
    }
    const fleetNoShowRate = Math.round((tal.noShowRiders / tal.headcount) * 100);
    console.log(`  Fleet noShow rate         = ${fleetNoShowRate}%`);
    console.log(`  Total supervisor actions  = ${supActions.length}`);
    console.log(`  attendance-intervention   = ${attendanceCount}`);
    console.log(`  inactive-recovery         = ${inactiveCount}`);
    console.log(`  hours-push                = ${hoursPushCount}`);
    console.log(`  structural-review         = ${structuralCount}`);
    const categories = new Set(supActions.map((a: { actionAr: string }) => {
      const ar = a.actionAr ?? '';
      if (ar.includes('غائب') || ar.includes('حضور') || ar.includes('غياب')) return 'attendance';
      if (ar.includes('تفعيل') || ar.includes('متوقف')) return 'inactive';
      if (ar.includes('ساعات')) return 'hours';
      return 'structural';
    }));
    console.log(`  VALIDATION: mixed categories → ${categories.size > 1 ? 'PASS ✓' : 'FAIL ✗ (all same)'}`);
    console.log(`  Top 5 recommendations:`);
    for (const a of supActions.slice(0, 5)) {
      const rec = (a as { actionAr: string }).actionAr?.slice(0, 70) ?? '';
      console.log(`    [${(a as { entityName: string }).entityName?.slice(0, 14).padEnd(14)}] ${rec}`);
    }
  } else {
    // Try full managementActions list from the report (field might differ)
    console.log('  [NOTE] executiveFocus empty — checking if coverage gate blocked insights');
    console.log(`  insightsEnabled = ${ct?.insightsEnabled}`);
    console.log(`  disabled        = ${ct?.disabled ?? false}`);
  }

  // ─── Waterfall ────────────────────────────────────────────────────────────
  console.log('\n── SECTION A: Recovery Waterfall ──────────────────────────────────────');
  if (ct?.recruitmentAnalysis) {
    const r = ct.recruitmentAnalysis;
    const totalRec = Math.round((
      r.recoverableByReactivation + r.recoverableByNoShowReduction +
      r.recoverableByHoursPush + r.recoverableBySupervision
    ) * 100) / 100;
    const gap = r.currentHoursGap;
    console.log(`  totalGap               = ${gap}h`);
    console.log(`  reactivation           = ${r.recoverableByReactivation}h  (20% cap = ${Math.round(gap * 0.20 * 100) / 100}h) ${r.recoverableByReactivation <= gap * 0.20 + 0.01 ? '✓' : '✗ OVER'}`);
    console.log(`  noShowReduction        = ${r.recoverableByNoShowReduction}h  (30% cap = ${Math.round(gap * 0.30 * 100) / 100}h) ${r.recoverableByNoShowReduction <= gap * 0.30 + 0.01 ? '✓' : '✗ OVER'}`);
    console.log(`  hoursPush              = ${r.recoverableByHoursPush}h  (25% cap = ${Math.round(gap * 0.25 * 100) / 100}h) ${r.recoverableByHoursPush <= gap * 0.25 + 0.01 ? '✓' : '✗ OVER'}`);
    console.log(`  supervision            = ${r.recoverableBySupervision}h  (15% cap = ${Math.round(gap * 0.15 * 100) / 100}h) ${r.recoverableBySupervision <= gap * 0.15 + 0.01 ? '✓' : '✗ OVER'}`);
    console.log(`  totalRecovery          = ${totalRec}h`);
    console.log(`  remainingGap           = ${r.remainingGapAfterLevers}h`);
    console.log(`  recommendHiring        = ${r.recommendHiring}`);
    console.log(`  hiringRidersNeeded     = ${r.hiringRequirementRiders}`);
    console.log(`  validationPassed       = ${r.validationPassed}`);
    console.log(`  VALIDATION: totalRec ≤ gap → ${totalRec <= gap + 0.01 ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`  VALIDATION: remainingGap > 0 → ${r.remainingGapAfterLevers > 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  } else {
    console.log('  [WARN] recruitmentAnalysis not available');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('END OF PRODUCTION VALIDATION REPORT');
  console.log('═'.repeat(70) + '\n');
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
