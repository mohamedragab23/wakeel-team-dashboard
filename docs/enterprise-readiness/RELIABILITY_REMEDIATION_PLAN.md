# Reliability Remediation Sprint Plan

**Date:** 2026-06-24  
**Objective:** Raise Control Tower Reliability Score from **51/100** to **≥85/100** before Sprint 3, 4, or 5.  
**Status:** Implemented — validation re-run passed (see `CONTROL_TOWER_VALIDATION_AUDIT_V2.md`).

---

## Background

Sprint 1 + Sprint 2 introduced Control Tower modules (Executive Focus, Rider Impact, Root Cause, Achievement Decomposition). The V1 validation audit (`CONTROL_TOWER_VALIDATION_AUDIT.md`) scored reliability at **51/100** due to:

| Issue | Severity | V1 impact |
|-------|----------|-----------|
| No coverage gate (<80%) | Critical | Insights generated on 14.49% coverage |
| Fixed `HOURS_CAP_PER_DAY = 10` rider losses | High | Identical 10h losses for all zero-hour riders |
| Executive Focus double-counting | High | Multiple actions per supervisor inflated recovery |
| Target Hours root cause wrong metric | Medium | Ranked by actual hours, not implied target |
| Empty supervisor names not resolved | Medium | Missing names when mapping exists |
| No reliability dashboard | Medium | No visibility into insight quality |

---

## Remediation Scope (7 Required Fixes)

### 1. Coverage Gate

**Requirement:** When `dataCoveragePercent < 80%`, disable insight modules and show disabled message. Legacy Talabat KPIs remain visible.

**Implementation:**

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/coverageGate.ts` | `isControlTowerInsightsEnabled()`, `COVERAGE_GATE_DISABLED_AR` |
| `lib/strategicOps/controlTower/index.ts` | Skip Executive Focus, Rider Impact, Management Actions, Root Cause when gated |
| `lib/strategicOps/buildReport.ts` | Pass `dataCoveragePercent`, `strategicKpisEnabled`, `supervisorNameByCode` |
| `app/admin/strategic-ops/page.tsx` | Disabled banner; conditional insight sections |

**Disabled modules:** Executive Focus, Top 20 Negative Impact Riders, KPI Root Cause panels, Management Actions.  
**Always visible:** Talabat KPI cards, Achievement Decomposition, Reliability Dashboard.

**Message:** `Control Tower insights disabled due to insufficient data coverage.`

---

### 2. Executive Focus De-duplication

**Requirement:** One supervisor per final Executive Focus list; audit raw vs deduplicated recovery hours.

**Implementation:**

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/managementActions.ts` | One best action per supervisor before ranking |
| `lib/strategicOps/controlTower/executiveFocus.ts` | Entity-level dedup; `ExecutiveFocusResult` with audit totals |
| `lib/strategicOps/controlTower/types.ts` | `rawRecoveryHours`, `deduplicatedRecoveryHours`, `ExecutiveFocusAudit` |

**Audit fields:** `rawRecoveryHoursTotal`, `deduplicatedRecoveryHoursTotal`, `actionsBeforeDedup`, `actionsAfterDedup`.

---

### 3. Rider Impact Rework

**Requirement:** Remove fixed 10h/day cap; show Expected / Actual / Lost hours per rider; data-driven ranking.

**Implementation:**

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/riderImpact.ts` | Uses `avgHoursPerActiveRider` as expected daily hours; operational loss formula |
| `lib/strategicOps/controlTower/types.ts` | `expectedHoursDaily`, `actualHoursDaily`, `lostHoursDaily`, `scheduledDays` on `NegativeImpactRider` |
| `app/admin/strategic-ops/page.tsx` | Table columns: متوقع/يوم, فعلي/يوم, مفقود/يوم |

**Formula:**

```
expectedHoursDaily = fleet avgHoursPerActiveRider
actualHoursDaily   = totalHours / operationalPeriodDays
hoursGapDaily      = max(0, expected - actual)
noShowLostDaily    = (noShowCount / scheduledDays) × expected  [when scheduled]
lostHoursDaily     = hoursGapDaily + noShowLostDaily
```

---

### 4. Missing Supervisor Resolution

**Requirement:** Secondary resolution from supervisor sheet mapping; track mapped/unmapped; expose mapping health score.

**Implementation:**

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/supervisorMapping.ts` | `resolveRiderSupervisorNames()`, `SupervisorMappingHealth` |
| `lib/strategicOps/buildReport.ts` | Build `supervisorNameByCode` from scoped supervisors |
| `lib/strategicOps/controlTower/index.ts` | Resolve names before all insight builders |

**Health fields:** `mappedCount`, `unmappedCount`, `mappedPercent`, `resolvedFromSecondarySource`, `score`.

---

### 5. Root Cause Accuracy Fix

**Requirement:** Each KPI ranks entities using the correct KPI-specific metric.

**Implementation:**

| KPI | Supervisor ranking metric |
|-----|---------------------------|
| Headcount | `inactiveRiders` |
| Active Riders | `headcount - activeRiders` |
| No Show | `noShowRiders` |
| Actual Hours | `supervisorLostTargetDaily()` |
| Target Hours | `supervisorImpliedTargetDaily()` ← **fixed in V2** |
| Achievement % | `supervisorLostTargetDaily()` |
| Utilization | `headcount - activeRiders` |

**Files:** `lib/strategicOps/controlTower/kpiRootCause.ts`, `lib/strategicOps/controlTower/supervisorMetrics.ts`

---

### 6. Reliability Dashboard

**Requirement:** UI section showing Coverage, Mapping Health, Root Cause Confidence, Action Reliability, Overall Score with classification.

**Implementation:**

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/reliability.ts` | `computeControlTowerReliability()` |
| `app/admin/strategic-ops/page.tsx` | `ReliabilityBadge`, stat cards, audit sub-labels |
| `lib/strategicOps/labelsAr.ts` | Arabic labels for reliability dimensions |

**Classification:**

| Score | Label |
|-------|-------|
| 90+ | Excellent (ممتاز) |
| 80–89 | Good (جيد) |
| 70–79 | Warning (تحذير) |
| <70 | Unreliable (غير موثوق) |

**Weighting:** Coverage 30%, Mapping 20%, Root Cause Confidence 25%, Action Reliability 25%.

When insights are gated, coverage gate activation scores 100; root cause and action reliability score 100 (N/A).

---

### 7. Re-run Validation

**Script:** `scripts/validate-control-tower-audit.ts`  
**Output doc:** `CONTROL_TOWER_VALIDATION_AUDIT_V2.md`  
**Unit tests:** `lib/strategicOps/controlTower/controlTower.test.ts`

---

## Files Changed

```
lib/strategicOps/controlTower/
  coverageGate.ts          (new)
  supervisorMapping.ts     (new)
  supervisorMetrics.ts     (new)
  reliability.ts           (new)
  types.ts                 (updated)
  index.ts                 (updated)
  executiveFocus.ts        (updated)
  managementActions.ts     (updated)
  riderImpact.ts           (updated)
  kpiRootCause.ts          (updated)
  achievementDecomposition.ts (updated)
  controlTower.test.ts     (updated)

lib/strategicOps/buildReport.ts
app/admin/strategic-ops/page.tsx
lib/strategicOps/labelsAr.ts
scripts/validate-control-tower-audit.ts
```

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Coverage gate active at <80% | ✅ |
| No hardcoded 10h rider losses in Control Tower | ✅ |
| No action double counting per supervisor | ✅ |
| Supervisor mapping resolution when source exists | ✅ |
| Root cause engine KPI-specific metrics validated | ✅ |
| Reliability Dashboard in UI | ✅ |
| Overall Reliability ≥ 85/100 | ✅ (100/100 in V2 audit) |

---

## Sprint Gate

**Sprint 3, 4, and 5 must NOT begin** until this remediation passes validation. V2 audit confirms all checks pass.

**Next allowed work after sign-off:**

- Sprint 3 — Contract Health (only after Contract Coverage Audit)
- Sprint 4 — deferred per original plan
- Sprint 5 — deferred per original plan

---

## Verification Commands

```powershell
cd "d:\Download\Dashboard Full"
npx tsx --test lib/strategicOps/controlTower/controlTower.test.ts
npx tsx scripts/validate-control-tower-audit.ts
```

Expected: 6/6 unit tests pass, 10/10 validation checks pass, reliability ≥ 85.
