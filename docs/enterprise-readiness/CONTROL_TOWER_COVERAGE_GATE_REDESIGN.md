# Control Tower Coverage Gating — Redesign Proposal

**Date:** 2026-06-24  
**Status:** Proposal only — **no implementation**  
**Trigger:** Coverage audit for Alexandria, 15-Jun-2026 → 22-Jun-2026  
**Related audit:** Live run via `scripts/coverage-audit-run.ts` (2026-06-24T13:47:16Z)

---

## 1. Problem Statement

### Observed behavior (actual engine execution)

| Metric | Value |
|--------|-------|
| Zone | Alexandria |
| Date range | 2026-06-15 → 2026-06-22 |
| Total calendar days | 8 |
| Days with uploaded daily data | 8 |
| **Operational Coverage** (`completenessPercentage`) | **100%** |
| Riders in scope | 354 |
| Riders with valid join date | 51 |
| **Metadata Coverage** (`joinDateCoveragePercent`) | **14.41%** |
| **Combined Coverage** (`min(operational, metadata)`) | **14.41%** |
| Control Tower `insightsEnabled` | **false** |
| Talabat daily series | 8/8 days populated (active, hours, no-show all present) |

### Root cause

The engine uses a **single combined gate**:

```typescript
coverage = round2(min(completenessPercentage, joinDateCoveragePercent))
strategicKpisEnabled = coverage >= 80
```

Control Tower passes `sourceDataCoverage.coverage` (combined) into `isControlTowerInsightsEnabled()`:

```typescript
// lib/strategicOps/controlTower/index.ts
const insightsEnabled = isControlTowerInsightsEnabled(ctx.dataCoveragePercent);
// ctx.dataCoveragePercent ← sourceDataCoverage.coverage (combined min)
```

**Result:** Operational analytics (Executive Focus, Root Cause, Rider Impact, Management Actions) are disabled even when **100% of calendar days have operational sheet data**, because **85.6% of Alexandria riders lack join dates** in `المناديب`.

This conflates two unrelated data quality dimensions:

| Dimension | Measures | Affects |
|-----------|----------|---------|
| **Operational** | Daily sheet upload completeness | Hours, active riders, no-show, Talabat KPIs |
| **Metadata** | Rider master-field completeness | Join date, tenure, lifetime KPIs, contract fields |

---

## 2. Design Goals

1. **Operational analytics** gated by **Operational Coverage only** (≥ 80%).
2. **Tenure/lifecycle analytics** gated by **Metadata Coverage only** (≥ 80%).
3. **Reliability Dashboard** shows both metrics separately with clear gate status.
4. **Talabat KPI formulas unchanged** — no changes to `computeFleetTalabatMetrics`, `aggregateTalabatFromDailySeries`, or daily aggregation logic.
5. **Backward compatibility** — existing `coverage` and `strategicKpisEnabled` fields preserved for consumers that have not migrated.
6. **No false disable** — do not suppress ops insights when the only gap is HR metadata.

---

## 3. Proposed Coverage Model

### 3.1 Two primary coverage metrics

| Metric | Source (existing) | Formula | Gate threshold |
|--------|-------------------|---------|----------------|
| **Operational Coverage** | `dataIntegrity.completenessPercentage` | `validDaysInDataset ÷ periodDays × 100` | 80% (`STRATEGIC_KPI_COVERAGE_THRESHOLD`) |
| **Metadata Coverage** | `joinDateAudit.joinDateCoveragePercent` | `ridersWithValidJoinDate ÷ totalRidersInScope × 100` | 80% (`JOIN_DATE_COVERAGE_THRESHOLD`) |

**Operational Coverage inputs** (unchanged):

- Sheet: `البيانات اليومية`
- Distinct dates with ≥1 row after dedup (official + ghost)
- Denominator: all calendar days in selected period
- **Not zone-filtered** — fleet-wide upload completeness

**Metadata Coverage inputs** (unchanged):

- Sheet: `المناديب` — `joinDate` column (extensible to contract/tenure fields)
- Scoped to filtered riders (zone, supervisor)
- Denominator: riders in scope

### 3.2 Derived gate flags (new)

```typescript
type CoverageGates = {
  operationalCoveragePercent: number;   // alias: completenessPercentage
  metadataCoveragePercent: number;      // alias: joinDateCoveragePercent

  operationalAnalyticsEnabled: boolean; // operational >= 80
  metadataAnalyticsEnabled: boolean;    // metadata >= 80

  // Backward-compatible combined (informational + legacy consumers)
  overallReadinessPercent: number;      // min(operational, metadata)
  strategicKpisEnabled: boolean;          // DEPRECATED alias: operationalAnalyticsEnabled
                                         // OR keep as min() with documented override for CT
};
```

**Recommended gate assignment:**

| Feature | Gate | Rationale |
|---------|------|-----------|
| Talabat KPI cards (values) | Always compute; audit trace status uses **operational** gate | Formulas already run; values valid when ops data exists |
| Control Tower — Executive Focus | **Operational** | Derived from daily performance + supervisor rows |
| Control Tower — Root Cause | **Operational** | Derived from Talabat fleet metrics |
| Control Tower — Rider Impact | **Operational** | Derived from hours/orders in daily sheet |
| Control Tower — Management Actions | **Operational** | Derived from supervisor ops metrics |
| Control Tower — Achievement Decomposition | **Operational** | Uses target − actual hours (Talabat-aligned) |
| Rider lifetime / tenure KPIs | **Metadata** | Requires `joinDate` |
| Contract Health (Sprint 4) | **Metadata** (+ contract field when added) | Requires contract mapping |
| STI / ORPS / Growth roadmap | **Operational** (recommendation) | Forecast from ops trends, not join dates |
| Operational Health score | **Operational** | Currently incorrectly tied to combined `strategicKpisEnabled` |
| Recruitment funnel rates | **Operational** or separate gate | Not join-date dependent |
| Executive Accuracy Score (final audit) | Split: ops components vs join-date component | Already weighted separately in `finalKpiAccuracyAudit.ts` |

### 3.3 Combined coverage (legacy)

Keep for display only:

```
overallReadinessPercent = min(operationalCoverage, metadataCoverage)
```

Do **not** use `overallReadinessPercent` to disable operational Control Tower insights.

---

## 4. Control Tower Gating — Proposed Change

### Current

```
dataCoveragePercent = sourceDataCoverage.coverage          // combined min
insightsEnabled = dataCoveragePercent >= 80
```

### Proposed

```
operationalCoveragePercent = sourceDataCoverage.completenessPercentage
insightsEnabled = operationalCoveragePercent >= 80

metadataCoveragePercent = sourceDataCoverage.joinDateCoveragePercent
tenureInsightsEnabled = metadataCoveragePercent >= 80   // future lifecycle modules
```

**Disabled banner logic:**

| Condition | Message |
|-----------|---------|
| Operational < 80% | `Control Tower insights disabled due to insufficient operational data coverage.` |
| Operational ≥ 80%, Metadata < 80% | Insights **enabled**; optional info banner: `Tenure and lifecycle analytics limited — metadata coverage 14.41%.` |

### Reliability Dashboard — proposed layout

Replace single "Coverage" stat with two explicit cards:

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ Operational Coverage    │  │ Metadata Coverage       │
│ 100%  ✓ GATE OPEN        │  │ 14.41%  ✗ GATE CLOSED   │
│ 8/8 days with data       │  │ 51/354 join dates       │
└─────────────────────────┘  └─────────────────────────┘

Overall Readiness: 14.41% (informational — min of both)
Control Tower Gate: OPERATIONAL → OPEN
Tenure Gate: METADATA → CLOSED
```

**Reliability score update:** `coverageScore` in `reliability.ts` should use **operational coverage** when scoring Control Tower operational insight quality, not combined min.

---

## 5. Backward Compatibility

### Preserved fields (no breaking change)

| Field | Behavior after migration |
|-------|--------------------------|
| `sourceDataCoverage.coverage` | Still `min(operational, metadata)` — **unchanged value** |
| `sourceDataCoverage.completenessPercentage` | Unchanged |
| `sourceDataCoverage.joinDateCoveragePercent` | Unchanged |
| `sourceDataCoverage.strategicKpisEnabled` | **Semantic change documented** — becomes alias for `operationalAnalyticsEnabled` OR stays as `min()` with Control Tower explicitly overriding (see Option B below) |

### Option A — Recommended: Additive fields only

Add new fields; change Control Tower to read `operationalAnalyticsEnabled`. Leave `strategicKpisEnabled = min() >= 80` for legacy sections until Phase 2 migration.

**Pros:** Safest; existing API consumers unchanged.  
**Cons:** Two gates coexist temporarily; some sections still incorrectly disabled.

### Option B — Full semantic split (Phase 2)

Repoint all operational features to `operationalAnalyticsEnabled`. Keep `strategicKpisEnabled` as deprecated alias = `operationalAnalyticsEnabled`.

**Pros:** Consistent behavior everywhere.  
**Cons:** Broader `buildReport.ts` touch surface.

**Recommendation:** **Option A** for Sprint 3 entry; **Option B** in follow-up sprint.

---

## 6. Talabat KPI Protection

**No formula changes.** Explicit guarantees:

| Module | Change |
|--------|--------|
| `computeDailyTalabatSeries()` | None |
| `aggregateTalabatFromDailySeries()` | None |
| `computeFleetTalabatMetrics()` | None |
| `buildTalabatAuditTraces()` | Optional: set `status: 'insufficient_data'` based on **operational** gate only (cosmetic; values unchanged) |

Talabat KPI **values** already compute regardless of `strategicKpisEnabled`. Only audit trace status and some strategic sections are gated today.

---

## 7. Files Affected

### Core logic (Phase 1 — Control Tower gate)

| File | Change |
|------|--------|
| `lib/strategicOps/talabatOpsMetrics.ts` | Extend `SourceDataCoverage` type with `operationalAnalyticsEnabled`, `metadataAnalyticsEnabled`, `overallReadinessPercent` |
| `lib/strategicOps/controlTower/coverageGate.ts` | Add `isOperationalInsightsEnabled()`, `isMetadataInsightsEnabled()`; document threshold |
| `lib/strategicOps/controlTower/index.ts` | Gate on `operationalCoveragePercent` not combined `coverage` |
| `lib/strategicOps/controlTower/types.ts` | Add `operationalCoveragePercent`, `metadataCoveragePercent` to report |
| `lib/strategicOps/controlTower/reliability.ts` | Score operational gate separately; add metadata gate indicator |
| `lib/strategicOps/buildReport.ts` | Pass operational + metadata separately to Control Tower context |

### UI (Phase 1)

| File | Change |
|------|--------|
| `app/admin/strategic-ops/page.tsx` | Reliability Dashboard: two coverage cards; conditional disabled banner |
| `lib/strategicOps/labelsAr.ts` | Labels for operational vs metadata coverage |

### Tests & validation

| File | Change |
|------|--------|
| `lib/strategicOps/controlTower/controlTower.test.ts` | Gate open at ops 100% / metadata 14% |
| `scripts/validate-control-tower-audit.ts` | Separate gate assertions |
| `scripts/coverage-audit-run.ts` | Output both gate flags |

### Phase 2 — Broader `buildReport.ts` gate repointing

| File | Sections to repoint to operational gate |
|------|----------------------------------------|
| `lib/strategicOps/buildReport.ts` | `operationalHealth`, `growthOpportunities`, `strategicForecasts`, recruitment display |
| `lib/strategicOps/finalKpiAccuracyAudit.ts` | Executive score disable reason |
| `lib/strategicOps/formatReportText.ts` | Export labels |
| `lib/strategicOps/clientExport.ts` | Export columns |

### Documentation

| File | Change |
|------|--------|
| `docs/enterprise-readiness/CONTROL_TOWER_EVIDENCE_AUDIT.md` | Update gate evidence |
| `docs/enterprise-readiness/RELIABILITY_REMEDIATION_PLAN.md` | Cross-reference |

**Not affected:** `lib/strategicOps/talabatOpsMetrics.ts` aggregation functions, Google Sheets integrations, Sprint 4 contract module (future).

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Insights enabled with incomplete join dates | Low | Rider Impact and Root Cause do not use join date; tenure modules stay gated |
| Operational coverage 100% but ghost rider leakage | Medium | Existing ghost audit unchanged; Reliability Dashboard already shows mapping health |
| Legacy consumers read `strategicKpisEnabled` and expect combined behavior | Medium | Keep field; document semantic; Phase 2 migration guide |
| Operational completeness is fleet-wide, not zone-scoped | Medium | Document in UI; future: optional zone-scoped operational coverage |
| Metadata improves later — no re-run needed | Low | Gate recalculates per report request |
| Over-enabling insights on sparse ops data | Low | Operational gate still blocks when daily sheets missing (< 80% days) |
| Reliability score inflation after gate change | Low | Update `coverageScore` formula to use operational % directly |

---

## 9. Migration Plan

### Phase 0 — Documentation (this deliverable)

- [x] Coverage audit with actual Alexandria numbers
- [x] Redesign proposal (this document)
- [ ] Stakeholder sign-off on gate matrix

### Phase 1 — Control Tower gate split (Sprint 3 prerequisite)

1. Extend `SourceDataCoverage` with new gate fields (additive).
2. Change `buildControlTowerReport()` to gate on `completenessPercentage >= 80`.
3. Update Reliability Dashboard UI — two coverage cards.
4. Update unit tests and validation scripts.
5. Re-run `coverage-audit-run.ts` — confirm Alexandria: insights **enabled**.
6. Update `CONTROL_TOWER_VALIDATION_AUDIT_V3.md` with new gate evidence.

**Estimated scope:** ~8 files, no Talabat formula changes.

### Phase 2 — Report-wide gate repointing

1. Repoint `operationalHealth`, growth, forecasts to operational gate.
2. Keep rider lifetime strictly on metadata gate (remove double-gate via `strategicKpisEnabled && joinDateAudit`).
3. Deprecate `strategicKpisEnabled` as combined min in UI labels; show both metrics.
4. API: add `operationalAnalyticsEnabled` to JSON response; keep `strategicKpisEnabled` for 1 release.

### Phase 3 — Metadata expansion (Sprint 4+)

1. Extend Metadata Coverage to include contract field coverage when Contract Health ships.
2. Weighted metadata score: `joinDate 60% + contract 40%` (configurable).
3. Zone-scoped operational completeness (optional enhancement).

---

## 10. Expected Behavior — Alexandria (15-Jun → 22-Jun)

### After Phase 1 implementation

| Component | Current | Proposed |
|-----------|---------|----------|
| Operational Coverage | 100% (8/8 days) | 100% — unchanged |
| Metadata Coverage | 14.41% (51/354) | 14.41% — unchanged |
| Combined / Overall Readiness | 14.41% | 14.41% — informational only |
| Talabat KPI cards | Visible (values compute) | Visible — unchanged |
| Achievement Decomposition | Visible | Visible — unchanged |
| Executive Focus | **Hidden** | **Visible** |
| Root Cause ("Why?" panels) | **Hidden** | **Visible** |
| Rider Impact Rankings | **Hidden** | **Visible** |
| Management Actions | **Hidden** | **Visible** |
| Reliability Dashboard | Shows combined 14.41%; gate closed | Shows Operational 100% ✓, Metadata 14.41% ✗ |
| Rider Lifetime KPI | Disabled (double-gated) | Disabled (metadata gate only — correct) |
| Contract Health (future) | N/A | Disabled until metadata + contract coverage ≥ 80% |

### User-visible banner

**Before (current):**

> Control Tower insights disabled due to insufficient data coverage.

**After (proposed):**

> Control Tower insights: **Active** (operational coverage 100%).  
> Tenure analytics limited — metadata coverage 14.41% (51/354 riders with join date).

---

## 11. Gate Decision Matrix (Reference)

```
                    Operational ≥ 80%    Operational < 80%
Metadata ≥ 80%      Full analytics       Ops only (no tenure)
Metadata < 80%      Ops analytics ✓      All gated ✗
                    (Alexandria case)
```

**Alexandria 15–22 Jun lands in bottom-left:** Operational analytics ON, tenure/lifecycle OFF.

---

## 12. Success Criteria

| Criterion | Verification |
|-----------|--------------|
| Control Tower enabled when ops 100% / metadata 14% | `coverage-audit-run.ts` → `insightsEnabled: true` |
| Talabat KPI values unchanged | Layer A replay in `TALABAT_ACCURACY_AUDIT.md` still PASS |
| Rider lifetime remains disabled at 14% metadata | `joinDateAudit.riderLifetimeKpiEnabled === false` |
| Reliability Dashboard shows both metrics | UI screenshot CT-06 |
| Backward compat: `coverage` field still present | API diff check |
| No Talabat formula files modified | Git diff scope check |

---

## 13. Recommendation

**Approve Phase 1** before Sprint 3 feature work. The current `min(operational, metadata)` gate incorrectly treats HR metadata gaps as operational data gaps, disabling Control Tower in Alexandria despite complete daily operational uploads.

Separating gates aligns system behavior with data reality:

- **Operational Coverage** answers: *"Do we have daily performance data for this period?"*
- **Metadata Coverage** answers: *"Do we have enough rider master fields for lifecycle analytics?"*

These questions should not share a single disable switch.

---

## Appendix — Current Code References

| Concern | Location |
|---------|----------|
| Combined coverage formula | `lib/strategicOps/talabatOpsMetrics.ts` → `computeSourceDataCoverage()` |
| Day completeness | `lib/strategicOps/dataIntegrity.ts` L392–395 |
| Join date coverage | `lib/strategicOps/joinDateAudit.ts` L66–67 |
| Control Tower gate | `lib/strategicOps/controlTower/index.ts` L21 |
| Combined passed to CT | `lib/strategicOps/buildReport.ts` L1978 |
| Reliability coverage score | `lib/strategicOps/controlTower/reliability.ts` L59–63 |
| UI combined display | `app/admin/strategic-ops/page.tsx` L578, L456–470 |
