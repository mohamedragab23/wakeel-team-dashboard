/**
 * Exact coverage audit for a Strategic Ops run — read-only.
 * Run: npx tsx scripts/coverage-audit-run.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

async function main() {
  const filters = {
    startDate: '2026-06-15',
    endDate: '2026-06-22',
    zone: 'Alexandria',
    supervisorCode: 'all',
  };

  const report = await buildStrategicOpsReport(filters);
  const sd = report.sourceDataCoverage;
  const di = report.dataIntegrity;
  const jd = report.joinDateAudit;

  const operationalCoverage = sd.completenessPercentage;
  const metadataCoverage = sd.joinDateCoveragePercent;

  console.log(JSON.stringify({
    runAt: new Date().toISOString(),
    filters,
    totalCalendarDays: report.meta.periodDays,
    daysWithUploadedDailyData: di.validDaysInDataset,
    missingDates: di.missingDates,
    presentDates: di.presentDates,
    completenessPercentage: sd.completenessPercentage,
    ridersCount: jd.totalRidersInScope,
    ridersWithJoinDate: jd.ridersWithValidJoinDate,
    ridersWithoutJoinDate: jd.ridersWithoutJoinDate,
    joinDateCoveragePercent: sd.joinDateCoveragePercent,
    coverageFormula: 'round2(min(completenessPercentage, joinDateCoveragePercent))',
    intermediateMin: Math.min(sd.completenessPercentage, sd.joinDateCoveragePercent),
    finalCoverage: sd.coverage,
    strategicKpisEnabled: sd.strategicKpisEnabled,
    operationalCoverage,
    metadataCoverage,
    operationalAnalyticsEnabled: sd.operationalAnalyticsEnabled,
    metadataAnalyticsEnabled: sd.metadataAnalyticsEnabled,
    overallReadinessPercent: sd.overallReadinessPercent,
    controlTower: report.controlTower
      ? {
          insightsEnabled: report.controlTower.insightsEnabled,
          disabled: report.controlTower.disabled,
          operationalCoveragePercent: report.controlTower.operationalCoveragePercent,
          metadataCoveragePercent: report.controlTower.metadataCoveragePercent,
          overallReadinessPercent: report.controlTower.overallReadinessPercent,
          metadataLimitedReasonAr: report.controlTower.metadataLimitedReasonAr,
          executiveFocusCount: report.controlTower.executiveFocus.length,
          kpiRootCausesCount: report.controlTower.kpiRootCauses.length,
          topNegativeImpactRidersCount: report.controlTower.topNegativeImpactRiders.length,
        }
      : null,
    talabatOperations: {
      headcount: report.talabatOperations.headcount,
      activeRiders: report.talabatOperations.activeRiders,
      actualHours: report.talabatOperations.actualHours,
      operationalDays: report.talabatOperations.operationalDays,
    },
    ordersSummary: {
      totalOrders: report.hoursAnalysis.trend.reduce((s, d) => s + d.orders, 0),
      dailyOrders: report.hoursAnalysis.trend.map((d) => ({ date: d.date, orders: d.orders })),
    },
    dailySeriesDates: report.talabatOperations.dailySeries?.map((d) => ({
      date: d.date,
      scheduled: d.scheduledRiders,
      active: d.activeRiders,
      noShow: d.noShowRiders,
      hours: d.hours,
    })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
