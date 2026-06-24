# Sprint 3 Dependency Audit — Supervisor Scorecards

**Date:** 2026-06-24  
**Scope:** Planned Sprint 3 metrics only (no implementation)  
**Alexandria context:** Operational Coverage **100%** · Metadata Coverage **0%** (full join+contract) · Join-date-only **14.41%**  
**Method:** Trace each planned metric to existing code paths and data sources in `lib/strategicOps/` — not assumptions.

---

## Executive Summary

Sprint 3 (Supervisor Scorecards) is specified in [`CONTROL_TOWER_IMPLEMENTATION_PLAN.md`](./CONTROL_TOWER_IMPLEMENTATION_PLAN.md) and [`STRATEGIC_CONTROL_TOWER_GAP_ANALYSIS.md`](./STRATEGIC_CONTROL_TOWER_GAP_ANALYSIS.md). The planned module (`supervisorScorecard.ts`) **does not exist yet**; all dependencies were verified against:

1. The **planned formulas and acceptance criteria** (7 core metrics + rankings + diagnosis).
2. The **live aggregation pipeline** that already powers supervisor rows today (`SupervisorOpsRow` in `buildReport.ts`, Talabat supervisor metrics, Control Tower supervisor modules).

**Finding:** **11/11 planned Sprint 3 metrics (100%)** are **Operational Data Dependent**. **0** are Metadata Dependent. **0** are Mixed among required deliverables.

**Recommendation:** **Start Sprint 3 now.** Keep metadata completion (Join Date / Contract Type / Contract End Date) as a **parallel workstream** for tenure, lifecycle, and Sprint 4 — not as a blocker for Supervisor Scorecards.

---

## Methodology

For each planned metric we traced:

| Step | What we checked |
|------|-----------------|
| 1 | Sprint 3 spec in `CONTROL_TOWER_IMPLEMENTATION_PLAN.md` § Sprint 3 |
| 2 | Current producer: `buildReport.ts` → `supervisorRows` loop (L1359–1428) |
| 3 | Talabat math: `computeSupervisorTalabatMetrics()` in `talabatOpsMetrics.ts` |
| 4 | Planned loss fields: `supervisorMetrics.ts` (`supervisorLostTargetDaily`) |
| 5 | Related Control Tower modules already shipping supervisor analytics: `managementActions.ts`, `achievementDecomposition.ts`, `kpiRootCause.ts` |
| 6 | Grep for `joinDate`, `contractType`, `contractEndDate` under `lib/strategicOps/controlTower/` → **no matches** |

**Coverage gates (post Phase 1):**

| Gate | Controls | Relevant to Sprint 3? |
|------|----------|------------------------|
| `operationalAnalyticsEnabled` | Control Tower insights (Executive Focus, Root Cause, etc.) | **Yes** — Sprint 3 should use this gate |
| `metadataAnalyticsEnabled` | Tenure / lifecycle KPIs | **No** — not in Sprint 3 spec |
| `strategicKpisEnabled` (= min(ops, metadata)) | Legacy sections (operational health, growth, STI) | **No** — supervisor table is **not** gated on this |

**Evidence:** `supervisorPerformance` is always attached to the report (L1944) and rendered unconditionally in `app/admin/strategic-ops/page.tsx` (L708–721). It does not check metadata coverage.

---

## Planned Sprint 3 Metric Inventory

Source: Sprint 3 acceptance criteria + implementation plan.

**7 required scorecard metrics:**

1. Team Size  
2. Active Riders  
3. No Show %  
4. Achievement %  
5. Utilization %  
6. Lost Hours Daily  
7. Lost Target Daily  

**Required derived deliverables:**

8. Scorecard Rank (composite)  
9. Top 5 Performers ranking  
10. Bottom 5 Performers ranking  
11. Bottom Performer Diagnosis (why / missing / fix)

---

## Metric Dependency Matrix

| # | Metric Name | Classification | Data Sources (sheets / code) | Join Date? | Contract Type? | Contract End? | Operates @ Alexandria metadata today? |
|---|-------------|----------------|------------------------------|------------|----------------|---------------|--------------------------------------|
| 1 | **Team Size** | Operational | `المناديب` (supervisor assignment col D) → `supRiders.length` in `buildReport.ts` L1362–1403 | No | No | No | **Yes** |
| 2 | **Active Riders** (avg daily) | Operational | `البيانات اليومية` → `computeSupervisorTalabatMetrics()` → `activeRiders` (`talabatOpsMetrics.ts` L247–262, L170–171) | No | No | No | **Yes** |
| 3 | **No Show %** | Operational | Planned: `(noShowRiders / headcount) × 100`. `noShowRiders` from daily sheet via Talabat no-show rule (`hours=0 AND orders=0`, L139–173) | No | No | No | **Yes** |
| 4 | **Achievement %** | Operational | Supervisor target from `المشرفين` col target + daily hours → `supTalabat.achievementPercent` (`buildReport.ts` L1371–1423, `talabatOpsMetrics.ts` L205) | No | No | No | **Yes** |
| 5 | **Utilization %** | Operational | `activeRiders / headcount` via `supTalabat.utilizationPercent` (`talabatOpsMetrics.ts` L204) | No | No | No | **Yes** |
| 6 | **Lost Hours Daily** | Operational | Planned: `max(0, headcount × HOURS_CAP − dailyHours) / operationalDays`. Inputs: `headcount`, `dailyHours` from `SupervisorOpsRow` — both operational (`buildReport.ts` L1403–1412) | No | No | No | **Yes** |
| 7 | **Lost Target Daily** | Operational | `supervisorLostTargetDaily()` — implied target from `dailyHours` + `achievementPercent` (`supervisorMetrics.ts` L14–17). Already used in Control Tower (`achievementDecomposition.ts` L22–29) | No | No | No | **Yes** |
| 8 | **Scorecard Rank** | Operational | Planned composite: achievement, utilization, inverse no-show, inverse lostTarget — all operational inputs above | No | No | No | **Yes** |
| 9 | **Top 5 Performers** | Operational | Sort/rank scorecard composite — no metadata inputs | No | No | No | **Yes** |
| 10 | **Bottom 5 Performers** | Operational | Sort/rank scorecard composite — no metadata inputs | No | No | No | **Yes** |
| 11 | **Bottom Performer Diagnosis** | Operational | Planned templates use `noShowPercent`, `utilizationPercent`, `inactiveRiders`, `noShowRiders` (`CONTROL_TOWER_IMPLEMENTATION_PLAN.md` L370–378). All from daily performance + roster assignment | No | No | No | **Yes** |

### Classification totals

| Classification | Count | Share |
|----------------|-------|-------|
| Operational Data Dependent | **11** | **100%** |
| Metadata Dependent | 0 | 0% |
| Mixed | 0 | 0% |

**>80% operational-only threshold:** **Met (100%).**

---

## Code Evidence (by data layer)

### Layer A — Daily operational sheet (`البيانات اليومية`)

Drives per-supervisor Talabat metrics:

```typescript
// buildReport.ts L1367–1378
const supPerformance = performance.filter(/* rider in supervisor team */);
const supTalabat = computeSupervisorTalabatMetrics({
  calendarDates,
  performance: supPerformance,
  assignedRiderCodes: supRiderCodes,
  targetDaily,
  headcount: supRiders.length,
});
```

`computeDailyTalabatSeries()` schedules riders by **assignment + daily row presence** — not join date (`talabatOpsMetrics.ts` L134–177).

### Layer B — Rider master (`المناديب`)

Used for:

- Team size / headcount (count of riders with `supervisorCode`)
- Assignment scope (`assignedRiderCodes`)
- `inactiveRiders` via `buildRiderAggs()` + hours in period (`buildReport.ts` L1154, L1380)

**Join date is not a filter** for `ridersInScope` (`buildReport.ts` L1093–1101). Riders without join date remain in scope.

### Layer C — Supervisor master (`المشرفين`)

Used for:

- Supervisor identity, region, name
- Optional daily target (`sup.target`) for achievement denominator

### Layer D — Control Tower (already operational-gated)

Existing supervisor analytics **already run** on Alexandria with 100% operational coverage:

| Module | File | Metadata refs |
|--------|------|---------------|
| Management actions | `controlTower/managementActions.ts` | None |
| Achievement decomposition (top supervisors by loss) | `controlTower/achievementDecomposition.ts` | None |
| KPI root cause (supervisor contributors) | `controlTower/kpiRootCause.ts` | None |
| Lost target helper | `controlTower/supervisorMetrics.ts` | None |

Sprint 3 scorecards are an **aggregation/UI layer** over the same `SupervisorOpsRow` inputs — not a new metadata dimension.

---

## What is NOT in Sprint 3 (do not conflate)

These **do** touch metadata or contract data but are **explicitly other sprints**:

| Feature | Sprint | Metadata / contract dependency |
|---------|--------|--------------------------------|
| Contract Health grid | Sprint 4 | **Contract mapping** (Shifts roster join) |
| Predictive Alerts | Sprint 5 | Operational trends (not join date) |
| Rider lifetime / tenure KPIs | Phase 2 / attrition | **Join Date** (`metadataAnalyticsEnabled`) |
| `newHires` on `SupervisorOpsRow` | Already computed, **not** a Sprint 3 required metric | Uses `joinDate` for period filter (`buildReport.ts` L1384) — undercounts when join date missing; does **not** block scorecard core metrics |
| STI / ORPS rankings | Separate strategic modules | Gated on `strategicKpisEnabled` (combined min) |

---

## Alexandria Live Validation (operational readiness)

From [`ALEXANDRIA_VALIDATION_AUDIT.md`](./ALEXANDRIA_VALIDATION_AUDIT.md) (2026-06-24):

| Check | Value |
|-------|-------|
| Operational Coverage | 100% |
| Control Tower insights | Enabled |
| Supervisor rows in report | Populated (8 supervisors in worst-supervisor list) |
| Existing supervisor table columns | Headcount, active, no-show, hours, achievement, utilization — **all populated** |
| Metadata blocking supervisor table? | **No** |

Example supervisors already receiving operational analytics in Executive Focus: Kero Maged Wakeel, Adham Ahmed Wakeel, Rami Ibrahim Wakeel — derived from the same supervisor row pipeline Sprint 3 will rank.

---

## Gate Recommendation for Sprint 3 Implementation

When Sprint 3 is built, wire it consistently with Phase 1:

```typescript
// Recommended gate (align with Control Tower operational modules)
insightsEnabled = ctx.operationalAnalyticsEnabled;
// NOT metadataAnalyticsEnabled
// NOT strategicKpisEnabled (combined min)
```

**Do not** gate Supervisor Scorecards on:

- `metadataAnalyticsEnabled`
- `sourceDataCoverage.coverage` (combined min)
- Full metadata completion %

---

## Risks if Sprint 3 is delayed for metadata

| Risk | Severity | Notes |
|------|----------|-------|
| Directors lack unified top/bottom supervisor view | **High** | Table exists but no scorecard rank, lost hours/target columns, or diagnosis |
| False blocker | **High** | Metadata remediation improves tenure/Sprint 4 — not scorecard math |
| Duplicate work | Medium | Control Tower already computes supervisor loss in `achievementDecomposition` and `managementActions` — Sprint 3 consolidates UI |

---

## Parallel workstreams (keep running)

| Workstream | Owner | Blocks Sprint 3? |
|------------|-------|------------------|
| Metadata completion via assignment/reactivation forms | Supervisors + ops | **No** |
| `/rider-metadata-audit` remediation | Supervisors | **No** |
| Sprint 4 Contract Health | Engineering | **No** (separate sprint) |
| Phase 2: repoint `operationalHealth` to operational-only gate | Engineering | **No** |

---

## Final Recommendation

### ✅ **Start Sprint 3 now**

**Rationale (code-based):**

1. **100%** of planned Sprint 3 metrics (11/11) depend only on operational data already at **100%** coverage in Alexandria.  
2. **Zero** planned scorecard metrics require Join Date, Contract Type, or Contract End Date.  
3. The supervisor aggregation pipeline **already runs** and **already feeds** Control Tower actions — Sprint 3 is primarily a unified scorecard + ranking + diagnosis layer.  
4. Gating Sprint 3 on metadata completion would **incorrectly** couple HR master-data quality to daily performance analytics — the same anti-pattern Phase 1 removed from Control Tower insights.

**Continue in parallel:** metadata remediation for tenure/lifecycle and Sprint 4 prerequisites — without blocking Supervisor Scorecards.

---

## References

| Document / file | Relevance |
|-----------------|-----------|
| `docs/enterprise-readiness/CONTROL_TOWER_IMPLEMENTATION_PLAN.md` § Sprint 3 | Planned metrics & formulas |
| `lib/strategicOps/buildReport.ts` L96–128, L1359–1436 | `SupervisorOpsRow` production |
| `lib/strategicOps/talabatOpsMetrics.ts` L134–262 | Daily Talabat supervisor math |
| `lib/strategicOps/controlTower/supervisorMetrics.ts` | Lost target (planned scorecard field) |
| `lib/strategicOps/controlTower/managementActions.ts` | Supervisor actions (operational) |
| `docs/enterprise-readiness/ALEXANDRIA_VALIDATION_AUDIT.md` | Live Alexandria gate status |
| `docs/enterprise-readiness/CONTROL_TOWER_COVERAGE_GATE_REDESIGN.md` | Operational vs metadata gate split |

**Audit status:** Read-only · Sprint 3 **not implemented** · Sprint 4/5 **not started**
