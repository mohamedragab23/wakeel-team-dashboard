/**
 * Alexandria validation + metadata remediation audit.
 * Run: npx tsx scripts/alexandria-validation-audit.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const FILTERS = {
  startDate: '2026-06-15',
  endDate: '2026-06-22',
  zone: 'Alexandria',
  supervisorCode: 'all',
};

/** Talabat Wakeel fleet reference (same period anchors — fleet scope, not Alexandria zone) */
const TALABAT_FLEET_REF = {
  '2026-06-15': { active: 172, noShow: 23, hours: 934.8, achievement: 62 },
  '2026-06-20': { active: 202, noShow: 30, hours: 1222.0, achievement: 81 },
};

async function main() {
  const report = await buildStrategicOpsReport(FILTERS);
  const ct = report.controlTower;
  const sd = report.sourceDataCoverage;
  const meta = report.metadataCompletionAudit;
  const tal = report.talabatOperations;

  const daily = tal.dailySeries ?? [];
  const jun15 = daily.find((d) => d.date === '2026-06-15');
  const ref15 = TALABAT_FLEET_REF['2026-06-15'];

  const audit = {
    runAt: new Date().toISOString(),
    filters: FILTERS,
    coverageGate: {
      operationalCoveragePercent: sd.operationalCoveragePercent,
      metadataCoveragePercent: sd.metadataCoveragePercent,
      overallReadinessPercent: sd.overallReadinessPercent,
      operationalAnalyticsEnabled: sd.operationalAnalyticsEnabled,
      metadataAnalyticsEnabled: sd.metadataAnalyticsEnabled,
      legacyCombinedCoverage: sd.coverage,
    },
    controlTower: ct
      ? {
          insightsEnabled: ct.insightsEnabled,
          disabled: ct.disabled,
          executiveFocusCount: ct.executiveFocus.length,
          kpiRootCausesCount: ct.kpiRootCauses.length,
          topNegativeImpactRidersCount: ct.topNegativeImpactRiders.length,
          achievementDecomposition: {
            achievementPercent: ct.achievementDecomposition.achievementPercent,
            gapHoursDaily: ct.achievementDecomposition.gapHoursDaily,
          },
          executiveFocusSample: ct.executiveFocus.slice(0, 3).map((a) => ({
            entity: a.entityName,
            priority: a.priority,
            recoveryHours: a.deduplicatedRecoveryHours,
          })),
        }
      : null,
    talabatKpis: {
      headcount: tal.headcount,
      activeRidersAvg: tal.activeRiders,
      noShowRidersAvg: tal.noShowRiders,
      actualHoursAvg: tal.actualHours,
      achievementPercent: tal.achievementPercent,
      operationalDays: tal.operationalDays,
    },
    kpiReconciliation: {
      note: 'Alexandria zone vs Talabat Wakeel fleet — different scope; day-level comparison is indicative only',
      alexandriaJun15: jun15
        ? {
            active: jun15.activeRiders,
            noShow: jun15.noShowRiders,
            hours: jun15.hours,
          }
        : null,
      talabatFleetJun15: ref15,
      deltasJun15: jun15
        ? {
            active: jun15.activeRiders - ref15.active,
            noShow: jun15.noShowRiders - ref15.noShow,
            hours: Math.round((jun15.hours - ref15.hours) * 100) / 100,
          }
        : null,
    },
    metadataImpact: {
      joinDateCoverageOnly: report.joinDateAudit.joinDateCoveragePercent,
      fullMetadataCoverage: meta.metadataCoveragePercent,
      ridersMissingJoinDate: meta.ridersMissingJoinDate,
      ridersMissingContractType: meta.ridersMissingContractType,
      ridersMissingContractEndDate: meta.ridersMissingContractEndDate,
      supervisorsBelow80: meta.bySupervisor.filter((s) => s.metadataCompletionPercent < 80).length,
      worstSupervisors: meta.bySupervisor.slice(0, 5).map((s) => ({
        supervisor: s.supervisorName,
        total: s.totalRiders,
        completionPercent: s.metadataCompletionPercent,
        missingJoinDate: s.ridersMissingJoinDate,
      })),
    },
    sprint3Blockers: [
      !sd.operationalAnalyticsEnabled ? 'Operational coverage below 80%' : null,
      meta.metadataCoveragePercent < 80
        ? `Metadata completion ${meta.metadataCoveragePercent}% — supervisors must complete rider metadata via assignment/reactivation workflow`
        : null,
      meta.ridersMissingJoinDate > 0
        ? `${meta.ridersMissingJoinDate} riders missing Join Date in Alexandria scope`
        : null,
    ].filter(Boolean),
    ordersTotal: report.hoursAnalysis.trend.reduce((s, d) => s + d.orders, 0),
  };

  console.log(JSON.stringify(audit, null, 2));

  const docPath = path.resolve('docs/enterprise-readiness/ALEXANDRIA_VALIDATION_AUDIT.md');
  const md = `# Alexandria Validation Audit — Coverage Gate Phase 1 + Metadata Remediation

**Generated:** ${audit.runAt}  
**Period:** ${FILTERS.startDate} → ${FILTERS.endDate}  
**Zone:** ${FILTERS.zone}

---

## 1. Coverage Gate Status

| Metric | Value | Gate |
|--------|-------|------|
| Operational Coverage | ${sd.operationalCoveragePercent}% | ${sd.operationalAnalyticsEnabled ? 'OPEN' : 'CLOSED'} |
| Metadata Coverage | ${sd.metadataCoveragePercent}% | ${sd.metadataAnalyticsEnabled ? 'OPEN' : 'CLOSED'} |
| Overall Readiness (min) | ${sd.overallReadinessPercent}% | informational |
| Legacy \`coverage\` | ${sd.coverage}% | backward compat |

Control Tower insights: **${ct?.insightsEnabled ? 'ENABLED' : 'DISABLED'}**

---

## 2. Control Tower Modules (Alexandria)

| Module | Status |
|--------|--------|
| Executive Focus | ${ct?.executiveFocusCount ?? 0} actions |
| Root Cause | ${ct?.kpiRootCausesCount ?? 0} KPIs |
| Rider Impact | ${ct?.topNegativeImpactRidersCount ?? 0} riders |
| Achievement Decomposition | gap ${ct?.achievementDecomposition.gapHoursDaily ?? '—'} h/day |

---

## 3. Talabat KPI Reconciliation

| KPI | Alexandria Dashboard (AVG) | Notes |
|-----|---------------------------|-------|
| Active Riders | ${tal.activeRiders} | zone-scoped |
| No Show | ${tal.noShowRiders} | zone-scoped |
| Actual Hours | ${tal.actualHours} | daily avg |
| Achievement % | ${tal.achievementPercent}% | Talabat formula unchanged |
| Total Orders | ${audit.ordersTotal} | from daily sheet |

**Jun-15 day comparison (Alexandria vs Talabat Wakeel fleet):**

| | Alexandria | Talabat Fleet | Delta |
|--|-----------|---------------|-------|
| Active | ${jun15?.activeRiders ?? '—'} | ${ref15.active} | ${audit.kpiReconciliation.deltasJun15?.active ?? '—'} |
| No Show | ${jun15?.noShowRiders ?? '—'} | ${ref15.noShow} | ${audit.kpiReconciliation.deltasJun15?.noShow ?? '—'} |
| Hours | ${jun15?.hours ?? '—'} | ${ref15.hours} | ${audit.kpiReconciliation.deltasJun15?.hours ?? '—'} |

---

## 4. Metadata Impact

| Field | Missing Count |
|-------|---------------|
| Join Date | ${meta.ridersMissingJoinDate} |
| Contract Type | ${meta.ridersMissingContractType} |
| Contract End Date | ${meta.ridersMissingContractEndDate} |

- Join-date-only coverage: **${report.joinDateAudit.joinDateCoveragePercent}%**
- Full metadata completion: **${meta.metadataCoveragePercent}%**

Supervisors below 80% completion: **${audit.metadataImpact.supervisorsBelow80}**

---

## 5. Remaining Blockers Before Sprint 3

${audit.sprint3Blockers.length === 0 ? '- None — ready for Sprint 3 review' : audit.sprint3Blockers.map((b) => `- ${b}`).join('\n')}

---

## 6. Workflow Implemented

- Supervisor metadata audit: \`/rider-metadata-audit\`
- Assignment + reactivation forms require Contract Type + Join Date
- Contract End Date auto = Join Date + 1 year (admin can override on approval)
- Metadata completion report in Strategic Ops admin dashboard

**Deferred:** Sprint 4 (Contract Health), Sprint 5 (Predictive Alerts)
`;

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, md, 'utf8');
  console.log(`\nWrote ${docPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
