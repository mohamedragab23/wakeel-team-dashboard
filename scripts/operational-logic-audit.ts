/**
 * Operational Logic Audit — Executive Focus, Rider Impact, Recovery Hours, Supervisor Targets
 * Run: npx tsx scripts/operational-logic-audit.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';
import {
  supervisorImpliedTargetDaily,
  supervisorLostTargetDaily,
} from '../lib/strategicOps/controlTower/supervisorMetrics';
import { computeSupervisorLostHoursDaily } from '../lib/strategicOps/controlTower/supervisorScorecard';
import { getAllSupervisors } from '../lib/adminService';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const FILTERS = {
  startDate: '2026-06-15',
  endDate: '2026-06-22',
  zone: 'Alexandria',
  supervisorCode: 'all',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log('=== OPERATIONAL LOGIC AUDIT — Alexandria live ===\n');

  const report = await buildStrategicOpsReport(FILTERS);
  const ct = report.controlTower;
  const fleet = report.talabatOperations;
  const rows = report.supervisorPerformance.rows;

  if (!ct?.insightsEnabled) {
    console.error('Control Tower disabled:', ct?.disabledReasonAr);
    process.exit(1);
  }

  const supervisors = await getAllSupervisors(false);
  const targetByCode = new Map(
    supervisors.map((s) => [String(s.code ?? '').trim(), Number(s.target) || 0])
  );

  const fleetAvg = fleet.avgHoursPerActiveRider;
  const periodDays = report.meta.periodDays;

  console.log('Fleet Alexandria (Talabat):');
  console.log(`  targetHours/day: ${fleet.targetHours}`);
  console.log(`  actualHours/day: ${fleet.actualHours}`);
  console.log(`  achievement%: ${fleet.achievementPercent}`);
  console.log(`  avgHoursPerActiveRider (fleet): ${fleetAvg}`);
  console.log(`  headcount: ${fleet.headcount}`);
  console.log(`  activeRiders avg: ${fleet.activeRiders}`);
  console.log(`  periodDays: ${periodDays}\n`);

  // --- Supervisor reconciliation ---
  type SupRec = {
    code: string;
    name: string;
    headcount: number;
    sheetTargetDaily: number;
    targetHoursUsed: number;
    actualHours: number;
    achievementPct: number;
    impliedTarget: number;
    lostTargetHours: number;
    scorecardLostHours: number;
    formulaTarget: string;
    formulaLost: string;
  };

  const supRecs: SupRec[] = rows.map((s) => {
    const sheetTarget = targetByCode.get(s.code) ?? 0;
    const targetUsed =
      sheetTarget > 0 ? sheetTarget : report.executiveSummary.targetDailyHours;
    const implied = supervisorImpliedTargetDaily(s);
    const lostTarget = supervisorLostTargetDaily(s);
    const scorecardLost = computeSupervisorLostHoursDaily(s, fleetAvg > 0 ? fleetAvg : 5);

    return {
      code: s.code,
      name: s.name,
      headcount: s.headcount,
      sheetTargetDaily: sheetTarget,
      targetHoursUsed: round2(targetUsed),
      actualHours: s.dailyHours,
      achievementPct: s.achievementPercent,
      impliedTarget: implied,
      lostTargetHours: lostTarget,
      scorecardLostHours: scorecardLost,
      formulaTarget:
        sheetTarget > 0
          ? `sheet target col=${sheetTarget}`
          : `FALLBACK fleetDailyTarget=${round2(report.executiveSummary.targetDailyHours)}`,
      formulaLost: `lostTarget = targetHours(${round2(targetUsed)}) - actualHours(${s.dailyHours}) = ${lostTarget} | implied=actual/(ach%/100)=${implied}`,
    };
  });

  supRecs.sort((a, b) => b.lostTargetHours - a.lostTargetHours);

  console.log('Supervisor reconciliation (sorted by lostTargetHours desc):');
  console.log(
    'Supervisor | HC | SheetTarget | TargetUsed | Actual | Ach% | ImpliedTarget | LostTarget | ScorecardLost'
  );
  for (const r of supRecs) {
    console.log(
      `${r.name.slice(0, 20).padEnd(20)} | ${String(r.headcount).padStart(3)} | ${String(r.sheetTargetDaily).padStart(5)} | ${String(r.targetHoursUsed).padStart(6)} | ${String(r.actualHours).padStart(6)} | ${String(r.achievementPct).padStart(5)} | ${String(r.impliedTarget).padStart(6)} | ${String(r.lostTargetHours).padStart(5)} | ${String(r.scorecardLostHours).padStart(5)}`
    );
  }

  // Small vs large headcount comparison
  const small = supRecs.filter((s) => s.headcount <= 10 && s.lostTargetHours >= 15);
  const large = supRecs.filter((s) => s.headcount >= 50 && s.lostTargetHours >= 15);
  console.log('\n--- Headcount vs Lost Target pattern ---');
  if (small.length) {
    console.log(`Small teams (HC≤10, lost≥15): ${small.length} supervisors`);
    for (const s of small.slice(0, 5)) {
      console.log(`  ${s.name} HC=${s.headcount} lost=${s.lostTargetHours} targetUsed=${s.targetHoursUsed} actual=${s.actualHours} (${s.formulaTarget})`);
    }
  }
  if (large.length) {
    console.log(`Large teams (HC≥50, lost≥15): ${large.length} supervisors`);
    for (const s of large.slice(0, 5)) {
      console.log(`  ${s.name} HC=${s.headcount} lost=${s.lostTargetHours} targetUsed=${s.targetHoursUsed} actual=${s.actualHours} (${s.formulaTarget})`);
    }
  }

  // --- Rider impact 10.74 analysis ---
  const riders = ct.topNegativeImpactRiders;
  const lostDistribution = new Map<number, number>();
  for (const r of riders) {
    const k = r.lostHoursDaily;
    lostDistribution.set(k, (lostDistribution.get(k) ?? 0) + 1);
  }

  console.log('\n--- Rider Impact lostHoursDaily distribution (top 20) ---');
  for (const [lost, count] of [...lostDistribution.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  lost=${lost} → ${count} riders`);
  }

  const ridersAt1074 = riders.filter((r) => Math.abs(r.lostHoursDaily - 10.74) < 0.01);
  console.log(`\nRiders with lostHoursDaily ≈ 10.74: ${ridersAt1074.length} (of ${riders.length} in top list)`);
  if (ridersAt1074.length > 0) {
    const sample = ridersAt1074[0];
    const doubleFleet = round2(fleetAvg * 2);
    console.log('Sample rider breakdown:');
    console.log(`  code=${sample.code} expected=${sample.expectedHoursDaily} actual=${sample.actualHoursDaily}`);
    console.log(`  noShow=${sample.noShowCount} scheduledDays=${sample.scheduledDays}`);
    console.log(`  lost=${sample.lostHoursDaily} periodLost=${sample.lostHoursPeriod}`);
    console.log(`  Formula: hoursGap=max(0,${sample.expectedHoursDaily}-${sample.actualHoursDaily}) + noShowLost`);
    console.log(`  2×fleetAvg = ${doubleFleet} (equals 10.74 when fleetAvg=${fleetAvg} and rider has zero actual + full no-show)`);
  }

  // --- Executive Focus / Recovery ---
  const efAudit = ct.executiveFocusAudit;

  console.log('\n--- Executive Focus / Recovery Hours ---');
  console.log(`  Actions before entity dedup: ${efAudit.actionsBeforeDedup}`);
  console.log(`  Unique entities after dedup: ${efAudit.actionsAfterDedup}`);
  console.log(`  Raw recovery total (all actions): ${efAudit.rawRecoveryHoursTotal}`);
  console.log(`  Deduplicated recovery (top-10 focus): ${efAudit.deduplicatedRecoveryHoursTotal}`);
  console.log(`  Reliability ratio: ${round2(efAudit.deduplicatedRecoveryHoursTotal / (efAudit.rawRecoveryHoursTotal || 1))}`);

  console.log('\nTop Executive Focus actions:');
  for (const a of ct.executiveFocus.slice(0, 10)) {
    console.log(
      `  [${a.priority}] ${a.entityType}:${a.entityName} recovery=${a.deduplicatedRecoveryHours}h | ${a.problemAr.slice(0, 60)}`
    );
  }

  // Double-count check: sum of focus recoveries vs fleet gap
  const fleetGap = round2(Math.max(0, fleet.targetHours - fleet.actualHours));
  const focusSum = efAudit.deduplicatedRecoveryHoursTotal;
  console.log(`\nFleet gap hours/day: ${fleetGap}`);
  console.log(`Executive Focus dedup sum: ${focusSum}`);
  console.log(`Focus sum / fleet gap: ${round2(focusSum / (fleetGap || 1))} (>1 suggests overlapping estimates)`);

  // Write markdown doc
  const docPath = path.resolve('docs/enterprise-readiness/OPERATIONAL_LOGIC_AUDIT.md');
  const md = buildMarkdown({
    runAt: new Date().toISOString(),
    filters: FILTERS,
    fleet,
    periodDays,
    fleetAvg,
    fleetGap,
    supRecs,
    small,
    large,
    riders,
    lostDistribution,
    ridersAt1074,
    ct,
    efAudit,
    report,
  });

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, md, 'utf8');
  console.log(`\nWrote ${docPath}`);
}

function buildMarkdown(input: {
  runAt: string;
  filters: typeof FILTERS;
  fleet: Awaited<ReturnType<typeof buildStrategicOpsReport>>['talabatOperations'];
  periodDays: number;
  fleetAvg: number;
  fleetGap: number;
  supRecs: Array<{
    code: string;
    name: string;
    headcount: number;
    sheetTargetDaily: number;
    targetHoursUsed: number;
    actualHours: number;
    achievementPct: number;
    impliedTarget: number;
    lostTargetHours: number;
    scorecardLostHours: number;
    formulaTarget: string;
    formulaLost: string;
  }>;
  small: typeof input.supRecs;
  large: typeof input.supRecs;
  riders: NonNullable<Awaited<ReturnType<typeof buildStrategicOpsReport>>['controlTower']>['topNegativeImpactRiders'];
  lostDistribution: Map<number, number>;
  ridersAt1074: typeof input.riders;
  ct: NonNullable<Awaited<ReturnType<typeof buildStrategicOpsReport>>['controlTower']>;
  efAudit: NonNullable<Awaited<ReturnType<typeof buildStrategicOpsReport>>['controlTower']>['executiveFocusAudit'];
  report: Awaited<ReturnType<typeof buildStrategicOpsReport>>;
}): string {
  const {
    runAt,
    filters,
    fleet,
    periodDays,
    fleetAvg,
    fleetGap,
    supRecs,
    small,
    large,
    riders,
    lostDistribution,
    ridersAt1074,
    ct,
    efAudit,
    report,
  } = input;

  const supTable = supRecs
    .map(
      (r) =>
        `| ${r.name} | ${r.headcount} | ${r.targetHoursUsed} | ${r.actualHours} | ${r.achievementPct}% | ${r.lostTargetHours} | ${r.sheetTargetDaily || 'fleet fallback'} |`
    )
    .join('\n');

  const lostDistRows = [...lostDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lost, count]) => `| ${lost} | ${count} |`)
    .join('\n');

  const focusRows = ct.executiveFocus
    .map(
      (a) =>
        `| ${a.priority} | ${a.entityType} | ${a.entityName} | ${a.deduplicatedRecoveryHours} | ${a.evidence.slice(0, 80)} |`
    )
    .join('\n');

  const rawActionSum = efAudit.rawRecoveryHoursTotal;
  const entityDedupCount = efAudit.actionsAfterDedup;

  return `# Operational Logic Audit — Executive Focus, Rider Impact, Recovery Hours, Supervisor Targets

**Generated:** ${runAt}  
**Period:** ${filters.startDate} → ${filters.endDate}  
**Zone:** ${filters.zone}  
**Data source:** Live Google Sheets via \`buildStrategicOpsReport\`

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Fleet target hours/day | ${fleet.targetHours} |
| Fleet actual hours/day | ${fleet.actualHours} |
| Fleet achievement % | ${fleet.achievementPercent}% |
| Fleet avg hours/active rider | ${fleetAvg} |
| Fleet gap (target − actual) | ${fleetGap} h/day |
| Control Tower insights | ${ct.insightsEnabled ? 'ENABLED' : 'DISABLED'} |
| Operational coverage | ${report.sourceDataCoverage.operationalCoveragePercent}% |

---

## 2. Why Similar Lost Target Hours Across Small vs Large Teams?

### Root cause (formula)

Supervisor **lost target hours** uses **implied target**, not headcount:

\`\`\`
targetHoursUsed = supervisor.sheetTarget  OR  fleetDailyTargetHours (fallback)
achievement%    = actualHours / targetHoursUsed × 100
impliedTarget   = actualHours / (achievement% / 100)  → equals targetHoursUsed
lostTargetHours = targetHoursUsed − actualHours
\`\`\`

**Headcount does not appear in lostTargetHours.** A supervisor with 6 riders and one with 60 riders can show **similar lost target** if their **team actual hours** and **targetHoursUsed** produce the same gap.

### Evidence — small vs large teams

**Small teams (HC ≤ 10, lost ≥ 15):** ${small.length} supervisors

${small.length ? small.map((s) => `- **${s.name}** HC=${s.headcount} targetUsed=${s.targetHoursUsed} actual=${s.actualHours} lost=${s.lostTargetHours} (${s.formulaTarget})`).join('\n') : '_None_'}

**Large teams (HC ≥ 50, lost ≥ 15):** ${large.length} supervisors

${large.length ? large.map((s) => `- **${s.name}** HC=${s.headcount} targetUsed=${s.targetHoursUsed} actual=${s.actualHours} lost=${s.lostTargetHours} (${s.formulaTarget})`).join('\n') : '_None_'}

### Fallback target warning

When a supervisor has **no sheet target** (column target = 0), the system uses **fleetDailyTargetHours (${report.executiveSummary.targetDailyHours})** as their daily target — this is **not proportional to team size** and can inflate lost-target metrics for small teams.

Supervisors using fleet fallback: **${supRecs.filter((s) => !s.sheetTargetDaily).length}** / ${supRecs.length}

---

## 3. Supervisor-by-Supervisor Reconciliation

| Supervisor | Headcount | Target Hours | Actual Hours | Achievement % | Lost Target Hours | Sheet Target |
|------------|-----------|--------------|--------------|---------------|-------------------|--------------|
${supTable}

**Target Hours column** = daily target used in Talabat formula (\`targetDaily\` from sheet or fleet fallback).  
**Lost Target Hours** = \`targetHours − actualHours\` (algebraically identical to \`supervisorLostTargetDaily()\`).

**Scorecard lost hours** (separate metric): \`max(0, headcount × fleetAvg − dailyHours)\` — scales with headcount; see column in script output.

---

## 4. Rider Impact — Why lostHoursDaily ≈ 10.74?

### Formula (fleet-average based — NOT rider-specific)

\`\`\`
expectedHoursDaily = fleet avgHoursPerActiveRider = ${fleetAvg}
actualHoursDaily   = rider.totalHours / periodDays
hoursGapDaily      = max(0, expected − actual)
noShowLostDaily    = (noShowCount / scheduledDays) × fleetAvg   [if scheduled]
lostHoursDaily     = hoursGapDaily + noShowLostDaily
\`\`\`

**Rider expected hours are 100% fleet-average based.** There is no rider-specific baseline.

### 10.74 pattern

When **fleetAvg ≈ ${round2(fleetAvg / 2)} × 2 = ${round2(fleetAvg * 2)}** and a rider has:
- **actualHoursDaily = 0** (zero hours in period average)
- **noShowCount = scheduledDays** (every scheduled day is no-show)

Then: \`lostHoursDaily = fleetAvg + fleetAvg = 2 × ${fleetAvg} = ${round2(fleetAvg * 2)}\`

| lostHoursDaily | Rider count (top-20 list) |
|----------------|---------------------------|
${lostDistRows}

Riders with lost ≈ 10.74: **${ridersAt1074.length}** of ${riders.length} in top negative impact list.

${ridersAt1074.length ? `Sample: **${ridersAt1074[0].name}** (${ridersAt1074[0].code}) — expected=${ridersAt1074[0].expectedHoursDaily}, actual=${ridersAt1074[0].actualHoursDaily}, noShow=${ridersAt1074[0].noShowCount}/${ridersAt1074[0].scheduledDays} scheduled days` : ''}

---

## 5. Executive Focus & Recovery Hours — Achievability & Double-Counting

### Deduplication layers

1. **Per supervisor:** multiple rule candidates → keep highest priority + recovery (\`managementActions.ts\`)
2. **Per entity (supervisor/rider/fleet):** one action per \`entityType:entityId\` (\`executiveFocus.ts\`)
3. **Top 10 cap:** executive focus list limited to 10 actions

### Audit numbers (Alexandria live)

| Metric | Value |
|--------|-------|
| Total actions ranked | ${efAudit.actionsBeforeDedup} |
| Sum of all action recoveries (raw) | ${rawActionSum} h/day |
| Unique entities after entity dedup | ${entityDedupCount} |
| Top-10 focus recovery sum | ${efAudit.deduplicatedRecoveryHoursTotal} h/day |
| Fleet operational gap | ${fleetGap} h/day |
| Focus sum / fleet gap | ${round2(efAudit.deduplicatedRecoveryHoursTotal / (fleetGap || 1))}× |

### Top Executive Focus actions

| Priority | Entity | Name | Recovery h/day | Evidence |
|----------|--------|------|----------------|----------|
${focusRows || '| — | — | — | — | — |'}

### Double-counting assessment

- **Within Executive Focus list:** deduplication prevents the same supervisor/rider/fleet appearing twice ✅
- **Across supervisors:** each supervisor's lost-target recovery is independent — **summing all raw actions (${rawActionSum} h) exceeds fleet gap (${fleetGap} h)** because recoveries are **rule-based estimates**, not a partition of the fleet gap ⚠️
- **Rider + supervisor overlap:** a supervisor lost-target action and a rider impact action for the same team can **both** appear (different entities) — partial overlap in real recoverability ⚠️
- **Achievability:** Top-10 dedup sum (${efAudit.deduplicatedRecoveryHoursTotal} h/day) represents **upper-bound actionable estimates**, not guaranteed recoverable hours. Treat as **prioritized intervention list**, not additive forecast.

Reliability score: **${ct.reliability.overallScore}/100** (dedup ratio component).

---

## 6. Conclusions Before Sprint 4/5

| Question | Finding |
|----------|---------|
| Why similar lost target for 6 vs 60+ riders? | \`lostTarget = targetUsed − actualHours\`; headcount excluded. Similar gaps when teams have similar actual/target ratio regardless of size. Fleet-target fallback amplifies distortion for small teams. |
| Exact target per supervisor? | See reconciliation table §3; sheet target or fleet fallback ${report.executiveSummary.targetDailyHours}. |
| Why lostHours ≈ 10.74? | \`2 × fleetAvg\` for zero-hour riders with full no-show rate; fleetAvg=${fleetAvg}. |
| Rider expected hours fleet or rider-specific? | **Fleet-average only** (\`avgHoursPerActiveRider\`). |
| Executive Focus double-counted? | Entity dedup ✅; cross-entity sum can exceed fleet gap ⚠️ — not additive. |

**Recommendation:** Before Sprint 4/5, consider making supervisor \`targetDaily\` proportional to headcount (or use sheet targets for all supervisors) and document that Executive Focus recovery hours are **prioritization weights**, not a sum-to-gap budget.

---

*Audit script: \`scripts/operational-logic-audit.ts\`*
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
