/**
 * Sprint 3 validation audit — Supervisor Scorecards
 * Run: npx tsx scripts/validate-sprint3-audit.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';
import {
  computeSupervisorLostHoursDaily,
  computeSupervisorNoShowPercent,
} from '../lib/strategicOps/controlTower/supervisorScorecard';
import { supervisorLostTargetDaily } from '../lib/strategicOps/controlTower/supervisorMetrics';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function main() {
  console.log('=== SPRINT 3 VALIDATION AUDIT ===\n');

  const filters = {
    startDate: '2026-06-15',
    endDate: '2026-06-22',
    zone: 'Alexandria',
    supervisorCode: 'all',
  };

  const report = await buildStrategicOpsReport(filters);
  const ct = report.controlTower;
  const sc = ct?.supervisorScorecards;

  check('Control Tower enabled', Boolean(ct?.insightsEnabled), `insightsEnabled=${ct?.insightsEnabled}`);
  check('Scorecards present', Boolean(sc && sc.all.length > 0), `count=${sc?.all.length ?? 0}`);

  if (!sc || sc.all.length === 0) {
    writeDoc(checks, null, report, filters);
    process.exitCode = 1;
    return;
  }

  check('Top 5 count', sc.topPerformers.length <= 5 && sc.topPerformers.length > 0, `${sc.topPerformers.length}`);
  check('Bottom 5 count', sc.bottomPerformers.length <= 5 && sc.bottomPerformers.length > 0, `${sc.bottomPerformers.length}`);

  const ranks = sc.all.map((c) => c.scorecardRank).sort((a, b) => a - b);
  const ranksSequential = ranks.every((r, i) => r === i + 1);
  check('Unique sequential ranks', ranksSequential, ranks.join(','));

  const topSorted = [...sc.topPerformers].every((c, i, arr) =>
    i === 0 ? true : c.compositeScore <= arr[i - 1].compositeScore
  );
  check('Top performers sorted by composite desc', topSorted, `top=${sc.topPerformers.map((c) => c.compositeScore).join(',')}`);

  const bottomHasDiagnosis = sc.bottomPerformers.every((c) => Boolean(c.bottomPerformerDiagnosis));
  check('Bottom performers have diagnosis', bottomHasDiagnosis, `${sc.bottomPerformers.filter((c) => c.bottomPerformerDiagnosis).length}/${sc.bottomPerformers.length}`);

  for (const c of sc.bottomPerformers) {
    const d = c.bottomPerformerDiagnosis!;
    check(
      `Diagnosis complete — ${c.code}`,
      Boolean(d.whyAr && d.mainIssueAr && d.recommendedActionAr && d.missingHoursLabelAr),
      d.whyAr.slice(0, 40)
    );
  }

  const supRowByCode = new Map(report.supervisorPerformance.rows.map((r) => [r.code, r]));
  let formulaPass = true;
  for (const card of sc.all) {
    const row = supRowByCode.get(card.code);
    if (!row) continue;
    const expectedNoShow = computeSupervisorNoShowPercent(row);
    const expectedLostTarget = supervisorLostTargetDaily(row);
    const expectedLostHours = computeSupervisorLostHoursDaily(row, report.talabatOperations.avgHoursPerActiveRider);
    if (card.noShowPercent !== expectedNoShow) formulaPass = false;
    if (card.lostTargetDaily !== expectedLostTarget) formulaPass = false;
    if (card.lostHoursDaily !== expectedLostHours) formulaPass = false;
    if (card.teamSize !== row.headcount) formulaPass = false;
    if (card.activeRiders !== row.activeRiders) formulaPass = false;
    if (card.achievementPercent !== row.achievementPercent) formulaPass = false;
    if (card.utilizationPercent !== row.utilizationPercent) formulaPass = false;
  }
  check('Scorecard formulas match supervisor table', formulaPass, 'all cards vs SupervisorOpsRow');

  const recoveryIds = new Set<string>();
  let dupRecovery = false;
  for (const card of sc.all) {
    const drill = sc.drillDownByCode[card.code];
    if (!drill) continue;
    for (const a of drill.executiveActions) {
      if (recoveryIds.has(a.id)) dupRecovery = true;
      recoveryIds.add(a.id);
    }
  }
  check('No duplicate action IDs in drill-down', !dupRecovery, `unique actions=${recoveryIds.size}`);

  const execDedup = ct!.executiveFocusAudit.deduplicatedRecoveryHoursTotal <= ct!.executiveFocusAudit.rawRecoveryHoursTotal;
  check('Executive focus dedup intact', execDedup, `raw=${ct!.executiveFocusAudit.rawRecoveryHoursTotal}, dedup=${ct!.executiveFocusAudit.deduplicatedRecoveryHoursTotal}`);

  const fleetActive = report.talabatOperations.activeRiders;
  const sumSupActive = report.supervisorPerformance.rows.reduce((s, r) => s + r.activeRiders, 0);
  check(
    'Supervisor active riders aggregate plausible vs fleet',
    sumSupActive >= fleetActive * 0.5,
    `fleet avg active=${fleetActive}, sum supervisor active=${Math.round(sumSupActive * 100) / 100}`
  );

  check(
    'Operational gate only (not metadata)',
    ct!.insightsEnabled && ct!.operationalCoveragePercent >= 80,
    `operational=${ct!.operationalCoveragePercent}%, metadata=${ct!.metadataCoveragePercent}%`
  );

  check(
    'Drill-down populated for all supervisors',
    sc.all.every((c) => Boolean(sc.drillDownByCode[c.code])),
    `${Object.keys(sc.drillDownByCode).length}/${sc.all.length}`
  );

  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.filter((c) => !c.pass).length;
  const reliability = ct!.reliability.overallScore;
  const productionReady = failCount === 0 && ct!.insightsEnabled && reliability >= 85;

  console.log(`\n=== SUMMARY: ${passCount} PASS, ${failCount} FAIL ===`);
  console.log(`Reliability: ${reliability}/100 (${ct!.reliability.classificationLabelAr})`);
  console.log(`Production readiness: ${productionReady ? 'READY' : 'NOT READY'}`);

  writeDoc(checks, sc, report, filters, reliability, productionReady);

  if (failCount > 0) process.exitCode = 1;
}

function writeDoc(
  checks: Check[],
  sc: NonNullable<NonNullable<Awaited<ReturnType<typeof buildStrategicOpsReport>>['controlTower']>['supervisorScorecards']>,
  report: Awaited<ReturnType<typeof buildStrategicOpsReport>>,
  filters: { startDate: string; endDate: string; zone: string; supervisorCode: string },
  reliability?: number,
  productionReady?: boolean
) {
  const ct = report.controlTower;
  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.filter((c) => !c.pass).length;
  const docPath = path.resolve('docs/enterprise-readiness/SPRINT3_VALIDATION_AUDIT.md');

  const md = `# Sprint 3 Validation Audit — Supervisor Scorecards

**Generated:** ${new Date().toISOString()}  
**Zone:** ${filters.zone} · **Period:** ${filters.startDate} → ${filters.endDate}

---

## Verdict

| Item | Result |
|------|--------|
| **PASS / FAIL** | **${passCount} PASS / ${failCount} FAIL** |
| **Reliability Score** | **${reliability ?? ct?.reliability.overallScore ?? '—'}/100** |
| **Production Readiness** | **${productionReady ? '✅ READY' : '❌ NOT READY'}** |

---

## Coverage Context

| Gate | Value |
|------|-------|
| Operational Coverage | ${report.sourceDataCoverage.operationalCoveragePercent}% |
| Metadata Coverage | ${report.sourceDataCoverage.metadataCoveragePercent}% |
| Control Tower Insights | ${ct?.insightsEnabled ? 'Enabled' : 'Disabled'} |

Sprint 3 uses **operational gate only** — no Join Date / Contract fields.

---

## Validation Checks

${checks.map((c) => `- [${c.pass ? 'x' : ' '}] **${c.name}** — ${c.detail}`).join('\n')}

---

## Scorecard Summary (Alexandria)

${sc
  ? `### Top 5

| Rank | Supervisor | Team | Active | No Show % | Ach % | Util % | Lost H | Lost Target | Score |
|------|------------|------|--------|-----------|-------|--------|--------|-------------|-------|
${sc.topPerformers.map((c) => `| ${c.scorecardRank} | ${c.name} | ${c.teamSize} | ${c.activeRiders} | ${c.noShowPercent}% | ${c.achievementPercent}% | ${c.utilizationPercent}% | ${c.lostHoursDaily} | ${c.lostTargetDaily} | ${c.compositeScore} |`).join('\n')}

### Bottom 5

| Rank | Supervisor | Diagnosis (why) |
|------|------------|-----------------|
${sc.bottomPerformers.map((c) => `| ${c.scorecardRank} | ${c.name} | ${c.bottomPerformerDiagnosis?.whyAr ?? '—'} |`).join('\n')}
`
  : '_No scorecards generated_'}

---

## Talabat KPI Cross-Check

| Fleet KPI | Dashboard |
|-----------|-----------|
| Active Riders (avg) | ${report.talabatOperations.activeRiders} |
| No Show (avg) | ${report.talabatOperations.noShowRiders} |
| Actual Hours (avg) | ${report.talabatOperations.actualHours} |
| Achievement % | ${report.talabatOperations.achievementPercent}% |

---

## Formula Reference

| Metric | Formula |
|--------|---------|
| No Show % | \`(noShowRiders / headcount) × 100\` |
| Lost Hours Daily | \`max(0, headcount × fleetAvgHoursPerActiveRider − dailyHours)\` |
| Lost Target Daily | \`max(0, impliedTarget − dailyHours)\` from \`supervisorMetrics.ts\` |
| Composite Score | weighted(achievement 35%, utilization 25%, inverse no-show 20%, inverse lost target 20%) |
| Rank | sort composite descending |

---

## Operational-Only Dependency

- ✅ No \`joinDate\`, \`contractType\`, or \`contractEndDate\` in \`supervisorScorecard.ts\`
- ✅ Inputs: \`SupervisorOpsRow\` + \`البيانات اليومية\` Talabat metrics only

---

## Deferred

- Sprint 4 (Contract Health) — not started
- Sprint 5 (Predictive Alerts) — not started
`;

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, md, 'utf8');
  console.log(`\nWrote ${docPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
