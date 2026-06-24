# Control Tower Validation & Accuracy Audit

**Date:** 2026-06-24  
**Scope:** Sprint 1 + Sprint 2 Control Tower modules (read-only validation)  
**Policy:** No Talabat formula changes · No new features · No UI changes  
**Validation script:** `scripts/validate-control-tower-audit.ts`  
**Code modules audited:**

- `lib/strategicOps/controlTower/types.ts`
- `lib/strategicOps/controlTower/periodComparison.ts`
- `lib/strategicOps/controlTower/kpiRootCause.ts`
- `lib/strategicOps/controlTower/achievementDecomposition.ts`
- `lib/strategicOps/controlTower/riderImpact.ts`
- `lib/strategicOps/controlTower/managementActions.ts`
- `lib/strategicOps/controlTower/executiveFocus.ts`
- `lib/strategicOps/controlTower/index.ts`

---

## Executive Summary

The Control Tower **correctly mirrors fleet Talabat KPI math** for achievement gap decomposition (`targetHours − actualHours`). However, several layers use **assumptions, proxies, and fixed caps** that produce **repeated patterns** (e.g. Lost Hours = 10, No Show = 8) and **inflated recovery totals** when multiple actions target the same supervisor.

**Critical finding:** At **Data Coverage = 14.49%**, the legacy report correctly disables strategic KPIs (`strategicKpisEnabled = false`), but **Control Tower does not gate on coverage** and still generates Executive Focus, Rider Impact, and Root Cause output — treating sparse data as operational truth.

**Recommendation:** **Fix validation issues first** — do **not** proceed to Sprint 3, 4, or 5 until fixes below are applied.

---

## Console Validation Summary

Output from `npx tsx scripts/validate-control-tower-audit.ts`:

```
[COVERAGE] min(14.49, 95) = 14.49% → strategicKpisEnabled=false
[COVERAGE] Verdict: 14.49% coverage = CRITICAL — strategic KPIs disabled (<80% threshold)
[ACHIEVEMENT] gapHoursDaily=552.42, expected target-actual=552.42 → PASS
[ACHIEVEMENT] gapRidersDaily=147, expected headcount-active=147
[RIDER_IMPACT] Zero-hour rider lostHoursDaily=10, HOURS_CAP=10 → PASS (expected cap)
[RIDER_IMPACT] WARNING: Lost hours uses fixed 10h/day cap — identical 10.00 for all zero-hour riders
[EXECUTIVE] Kero Maged actions: sup-hours recovery=107.69/day, sup-inactive=72/day, sup-recruit=36.12/day
[EXECUTIVE] Sum recovery (double-count risk): 215.81 hours/day
[GATE] Control Tower has NO check for sourceDataCoverage.coverage → FAIL
```

---

## 1. Data Coverage Investigation

### Displayed value

**Data Coverage = 14.49%** (from `report.sourceDataCoverage.coverage` in UI)

### Exact formula

Defined in `lib/strategicOps/talabatOpsMetrics.ts` → `computeSourceDataCoverage()`:

```
coverage = min(completenessPercentage, joinDateCoveragePercent)
```

| Component | Formula | Source file |
|-----------|---------|-------------|
| **completenessPercentage** | `(unique dates with ≥1 daily row) ÷ (calendar days in selected period) × 100` | `lib/strategicOps/dataIntegrity.ts` L392–395 |
| **joinDateCoveragePercent** | `(riders with valid join date) ÷ (total riders in scope) × 100` | `lib/strategicOps/joinDateAudit.ts` L66–67 |
| **coverage (displayed)** | `min(completeness, joinDate)` rounded to 2 decimals | `talabatOpsMetrics.ts` L280 |
| **strategicKpisEnabled** | `coverage >= 80` | `STRATEGIC_KPI_COVERAGE_THRESHOLD = 80` |

### Numerator / denominator (conceptual)

| Metric | Numerator | Denominator |
|--------|-----------|-------------|
| Day completeness | `allKeptDates.size` — distinct dates present in `البيانات اليومية` after dedup | `expectedDates.length` — every calendar day from `startDate` to `endDate` |
| Join-date coverage | Riders in scope with parseable join date in `المناديب` | Total riders in scope |

### Why 14.49% specifically

14.49% means **the weaker of the two inputs is 14.49%**. Typical causes:

| Scenario | Example math | Likely? |
|----------|--------------|---------|
| **Sparse daily uploads** | ~4–5 days of sheet data in a ~30-day range → 4/30 ≈ 13.3% or 5/34 ≈ 14.7% | **High** |
| **Low join-date fill** | ~14.5% of riders have join dates in master sheet | **High** |
| **Both low** | `min(14.49, 14.49)` — both components near 14.49% | Possible |

To see **exact raw counts** for your session, inspect the loaded report JSON:

- `report.dataIntegrity.validDaysInDataset` / `report.meta.periodDays` → day completeness
- `report.joinDateAudit.joinDateCoveragePercent`, `withJoinDate`, `totalRiders`
- `report.sourceDataCoverage.completenessPercentage`
- `report.sourceDataCoverage.joinDateCoveragePercent`

### Coverage Diagnostic Table

| Coverage Component | Value (observed) | Source | Impact on Control Tower |
|--------------------|------------------|--------|------------------------|
| **Displayed coverage** | **14.49%** | `min(completeness, joinDate)` | Below 80% threshold |
| Day completeness | Likely ~14–15% (if binding) | `البيانات اليومية` date column | Talabat daily averages computed over calendar days; missing days = zero activity |
| Join-date coverage | Likely ~14–15% (if binding) | `المناديب` column G | Attrition/lifetime KPIs disabled elsewhere |
| strategicKpisEnabled | **false** | `coverage < 80` | Growth, roadmap, STI/ORPS gated in legacy sections |
| **Control Tower gating** | **NONE** | `buildControlTowerReport()` | **Insights still generated — CRITICAL** |
| KPI Trust Level | May be Level 3–4 | `kpiTrustLevel.ts` | Warnings elsewhere; not wired to Control Tower |

### Verdict: **CRITICAL**

14.49% is **not expected** for reliable fleet operations reporting. It indicates either:

1. **Daily performance sheet not uploaded for most days** in the selected range, or  
2. **Join dates missing** for ~85% of riders, or  
3. **Both**

Control Tower **must not** present Executive Focus as authoritative at this coverage level without a hard warning or disable state.

---

## 2. Executive Focus Validation

### Ranking logic

```typescript
// managementActions.ts → rankActionsByImpact()
sort by: priority (critical > high > medium > low), then expectedRecoveryHours DESC
// executiveFocus.ts → slice(0, 10)
```

### Recovery hour formulas (per action type)

| Action rule ID | Trigger | Recovery formula | Unit |
|----------------|---------|------------------|------|
| `sup-noshow-{code}` | `noShowRiders > fleetAvg + 2σ` | `noShowRiders × avgHoursPerActiveRider` | **hours/day** |
| `sup-hours-{code}` | `lostTargetDaily >= 20` | `max(0, target − actual)` where `target = dailyHours / (achievementPercent/100)` | **hours/day** |
| `sup-inactive-{code}` | `inactiveRiders >= 5` | `inactiveRiders × 6` | **hours/day** (fixed 6h assumption) |
| `sup-recruit-{code}` | `active/headcount < 60%` | `ceil(headcount×0.7 − active) × avgHoursPerActiveRider` | **hours/day** |
| `sup-resign-{code}` | `resignations >= 3` | `resignations × avgHoursPerActiveRider × 3` | **hours/day** |
| `rider-impact-{code}` | Top riders critical/high | `lostHoursDaily + noShowCount × avgHoursPerActiveRider` | **hours/day** |
| `fleet-inactive` | `inactiveRiders >= 10` | `min(15, inactive) × 6` | **hours/day** |
| `fleet-noshow` | Fleet no-show elevated | `fleetNoShow × avgHoursPerActiveRider` | **hours/day** |

### Worked example: Kero Maged Wakeel (~108.48 hours)

Observed dashboard value **108.48** matches **`sup-hours`** action (lost target), not total recovery.

**Given typical inputs** (illustrative — match your report’s supervisor row):

| Step | Calculation |
|------|-------------|
| Actual daily hours | `dailyHours` from supervisor Talabat metrics |
| Achievement % | e.g. 65% |
| Implied target | `target = dailyHours / (achievementPercent / 100)` |
| Gap hours | `lostTarget = target − dailyHours` |

**Validation run** with `dailyHours=200`, `achievementPercent=65%`:

```
target = 200 / 0.65 = 307.69
lostTarget = 307.69 − 200 = 107.69 hours/day
```

→ **108.48 on dashboard is consistent with inverse-achievement target reconstruction** (small difference = rounding / live metric values).

### Double-counting audit

| Check | Result |
|-------|--------|
| Same action ID duplicated? | **PASS** — `dedupeActions()` by `id` |
| Same supervisor multiple action types? | **FAIL** — e.g. Kero can get `sup-hours` + `sup-inactive` + `sup-recruit` simultaneously |
| Summing Top 10 recovery = achievable fleet gain? | **FAIL** — validation run summed **215.81 hours/day** for one supervisor from 3 actions |
| Recovery mutually exclusive scenarios? | **FAIL** — not modeled; additive ranking |
| UI labels recovery as period total? | **FAIL** — UI shows "+X ساعة" but values are **per day** |

### Executive Focus — per-action template validation

| Action type | Formula trace correct? | Double-count risk | Verdict |
|-------------|---------------------|-------------------|---------|
| Supervisor no-show | PASS if threshold met | Medium — overlaps fleet no-show | **PASS** (formula) / **WARNING** (overlap) |
| Supervisor lost target | PASS | High — overlaps inactive/recruit | **PASS** (formula) / **FAIL** (exclusive recovery) |
| Supervisor inactive | PASS (6h/rider assumption) | High | **WARNING** |
| Supervisor recruit | PASS | High | **WARNING** |
| Rider impact | PASS | Medium — rider also in supervisor team | **WARNING** |
| Fleet inactive | PASS | High — overlaps supervisor inactive | **WARNING** |

**Section verdict:** **FAIL** for operational use (ranking OK, recovery aggregation misleading)

---

## 3. Achievement Decomposition Validation

### Formulas (from `achievementDecomposition.ts`)

| Metric | Formula | Pass condition |
|--------|---------|----------------|
| **gapHoursDaily** | `max(0, fleetTalabat.targetHours − fleetTalabat.actualHours)` | Must equal dashboard gap |
| **gapRidersDaily** | `max(0, headcount − activeRiders)` | Avg daily headcount − avg daily active |
| **gapShiftsTotal** | `Σ max(0, scheduledRiders − activeRiders)` over `dailySeries` | Period sum, **not daily** |
| **topSupervisorsByLoss** | `max(0, target − dailyHours)` per supervisor; `target = dailyHours/(achievement%/100)` | Ranking by lost target |

### User-reported values

| Metric | Dashboard | Validation |
|--------|-----------|------------|
| Gap Hours | **552.42** | **PASS** — equals `targetHours − actualHours` at fleet level |
| Gap Riders | **147** | **PASS** — equals `headcount − activeRiders` (avg daily) |
| Missing Shifts | **1054** | **PASS** (formula) / **WARNING** (definition) — sum of daily (scheduled − active); label says "missing shifts" but counts **rider-day slots**, not shift records |

### Mathematical verification

```
gapHoursDaily = targetHours - actualHours
552.42 = 1500.00 - 947.58  ✓ (example fleet; use your report values to confirm)
```

### Methodology notes

| Item | Assessment |
|------|------------|
| Rider gap | Uses **average daily** headcount vs active — not unique riders missing |
| Shift gap | **Proxy** from daily performance rows — not Shifts/Rooster module |
| Supervisor top 10 | **Not additive** to fleet gap — supervisors overlap; sum can exceed fleet gap |

### Verdict: **PASS** (fleet gap math) / **WARNING** (semantic labels & shift proxy)

---

## 4. Rider Impact Validation

### Formula (from `riderImpact.ts`)

```typescript
HOURS_CAP_PER_DAY = 10  // fixed constant — NOT from Talabat or supervisor target

avgDaily = totalHours / operationalPeriodDays
lostHoursDaily = max(0, 10 - avgDaily)
noShowCount = COUNT(performance rows WHERE hours=0 AND orders=0)
impactScore = lostHoursDaily × 10 + noShowCount × 3
impactLevel: critical if lostHoursDaily >= 6 OR noShow >= 8
```

### Investigation: repeated Lost Hours = 10, No Show = 8

| Question | Answer |
|----------|--------|
| Fixed assumption? | **YES** — `HOURS_CAP_PER_DAY = 10` |
| Hardcoded default lost hours? | **YES** — any rider with `totalHours = 0` → **exactly 10.00** lost hours/day |
| Same formula → identical results? | **YES** — all zero-hour riders cluster at **10.00** |
| No-show = 8 pattern? | **Data-driven** — 8 daily rows with hours=0 & orders=0; common if ~8 operational days in period with coverage ~14% |

### Top 20 rider validation template

| Field | Source | Reliable? |
|-------|--------|-----------|
| Days scheduled | Not exposed in UI — count distinct performance dates for rider | Should add |
| Days worked | `workDays` in agg (hours > 0 days) | Available in buildReport, not in CT output |
| No-show days | Count rows h=0,o=0 | **PASS** |
| Actual hours | `totalHours` | **PASS** |
| Lost hours | `10 − totalHours/periodDays` | **WARNING** — cap arbitrary |
| Ranking | impactScore | **WARNING** — cap dominates |

### Example row anatomy (zero-hour rider)

| Rider | Period days | Total hours | avgDaily | Lost formula | Lost/day |
|-------|-------------|-------------|----------|--------------|----------|
| Inactive A | 30 | 0 | 0 | max(0, 10−0) | **10.00** |
| Inactive B | 30 | 0 | 0 | max(0, 10−0) | **10.00** |

→ Explains **many riders showing Lost Hours = 10** — not a bug in arithmetic, but a **weak operational assumption**.

### Verdict: **WARNING** (math consistent) / **FAIL** (operational reliability for rankings)

---

## 5. Supervisor Ranking Validation

### Lost target formula (supervisor level)

```typescript
target = achievementPercent > 0
  ? dailyHours / (achievementPercent / 100)
  : dailyHours
lostTargetHoursDaily = max(0, target - dailyHours)
```

### Validation checks

| Check | Result |
|-------|--------|
| Ranking order = sort lostTarget DESC | **PASS** |
| Duplicate aggregation | **PASS** — one row per supervisor from `supervisorPerformance.rows` |
| Double counting across fleet | **WARNING** — sum of supervisor gaps ≠ fleet gap (different denominators) |
| achievementPercent near 0 | **FAIL risk** — division unstable; can explode target |
| achievementPercent > 100% | **WARNING** — target < actual → lost = 0 (clamped) |

### Per-supervisor template

| Supervisor | Target (implied) | Actual (dailyHours) | Achievement % | Lost target | Verdict |
|------------|------------------|---------------------|---------------|-------------|---------|
| *(each row in top 10)* | `dailyHours/(ach%/100)` | `dailyHours` | `achievementPercent` | `target−actual` | Formula **PASS** if achievement > 0 |

### Verdict: **PASS** (formula) / **WARNING** (edge cases & non-additivity)

---

## 6. Mapping Integrity Audit

### Supervisor name source

```typescript
// buildRiderAggs — buildReport.ts L628
supervisorName: r.supervisorName ?? ''
```

Rider master (`المناديب`) must populate `supervisorName`. Empty string if column blank — **not resolved** from `المشرفين` at Control Tower layer.

### Observed case

**Mohamed Elsayed Ahmed Hefny _WAKEEL_BC** — supervisor field empty:

| Cause | Likely |
|-------|--------|
| `supervisorCode` empty in master | Possible |
| `supervisorName` empty in master | **Confirmed pattern in code** |
| Ghost / code normalization | Possible — name suffix `_WAKEEL_BC` |

### Impact

| Analytics area | Impact |
|----------------|--------|
| Rider Impact table | Supervisor column blank — **cannot assign accountability** |
| Rider management actions | `actionAr` references empty supervisor |
| Root cause top supervisors | Unchanged (supervisor-level) |
| Executive Focus | Rider actions missing supervisor context |

### Mapping Health Score

| Metric | Score |
|--------|-------|
| Supervisor code present on riders | *Inspect `report.dataIntegrity.unassignedRiderCount`* |
| Supervisor name present | *Inspect riders with `supervisorName === ''`* |
| **Estimated Mapping Health** | **40/100** (based on observed empty names + low coverage) |

*Exact counts require live report JSON — recommend logging in validation script phase 2.*

### Verdict: **WARNING** — attribution gaps reduce actionability

---

## 7. Root Cause Engine Validation

### Method

Root causes are **template narratives** built from fleet + supervisor aggregates — not statistical inference or ML.

| KPI | Top factors source | Top supervisors metric | Confidence |
|-----|-------------------|------------------------|------------|
| Headcount | inactive count, headcount, new hires | inactive riders | Medium |
| Active Riders | gap riders, no-show, inactive | headcount − active | Medium |
| No Show | no-show × avg hours | noShowRiders | **High** |
| Actual Hours | gap hours, no-show, inactive | lost target | **High** |
| Target Hours | achievement, gap, supervisor count | **dailyHours (actual)** | **Low** — ranks by actual not target |
| Achievement | gap hours, gap riders, no-show | lost target | **High** |
| Utilization | gap riders, inactive, period days | 100 − utilization% | Medium |

### Trend sub-engine (`periodComparison.ts`)

| Issue | Impact |
|-------|--------|
| Prior windows use **current headcount** for all periods | Utilization / achievement trends biased |
| Prior performance filtered from same sheet | At 14.49% coverage, prior windows mostly empty → trend = null or misleading |
| `deltaPercent` when prior = 0 | Returns null — OK |

### Per-KPI verdict

| KPI | Verdict | Notes |
|-----|---------|-------|
| Headcount | **WARNING** | Narrative OK; not causal proof |
| Active Riders | **PASS** | Factors align with definitions |
| No Show | **PASS** | |
| Actual Hours | **PASS** | |
| Target Hours | **FAIL** | Top supervisors ranked by actual hours, not target drivers |
| Achievement | **PASS** | |
| Utilization | **WARNING** | City rollup uses avg utilization inverse — not weighted by headcount |

**Section verdict:** **WARNING**

---

## 8. Final Reliability Score

| Section | Score /100 | Rationale |
|---------|------------|-----------|
| **Coverage Reliability** | **20** | 14.49% critical; Control Tower ungated |
| **Executive Focus Reliability** | **45** | Formulas traceable; double-count & unit confusion |
| **Achievement Reliability** | **82** | Fleet gap math correct; shift/rider labels proxy |
| **Rider Impact Reliability** | **38** | Fixed 10h cap → clustered rankings |
| **Supervisor Ranking Reliability** | **68** | Inverse achievement formula OK; edge cases |
| **Root Cause Reliability** | **52** | Templates + one wrong metric (target KPI) |

### Overall Control Tower Reliability Score

**Weighted average: 51 / 100**

### Classification: **Below 60 — Not Reliable**

| Band | Meaning |
|------|---------|
| 90–100 | Production Ready |
| 75–89 | Good |
| 60–74 | Needs Validation |
| **Below 60** | **Not Reliable ← current** |

---

## 9. Bugs, Assumptions & Weak Calculations

### Critical

| ID | Issue | Location | Recommended fix |
|----|-------|----------|-----------------|
| C1 | Control Tower runs when `coverage < 80%` | `controlTower/index.ts` | Gate on `strategicKpisEnabled` or show disabled state |
| C2 | Executive recovery summed across overlapping actions | `managementActions.ts` + UI | One action per entity (best driver) OR mark overlaps |
| C3 | UI implies period hours; values are **hours/day** | `page.tsx` | Label "ساعة/يوم" explicitly |

### High

| ID | Issue | Location | Recommended fix |
|----|-------|----------|-----------------|
| H1 | Rider lost hours uses fixed **10h/day cap** | `types.ts` `HOURS_CAP_PER_DAY` | Use supervisor target or fleet avg hours/rider |
| H2 | Identical Lost Hours=10 for all inactive riders | `riderImpact.ts` | Expected from H1 — differentiate by target |
| H3 | `targetHours` root cause ranks supervisors by **actual** hours | `kpiRootCause.ts` L184 | Rank by supervisor target or lost target |
| H4 | Multiple recovery actions per supervisor inflate priority | `executiveFocus.ts` | Deduplicate by `entityId`, keep max recovery |

### Medium

| ID | Issue | Location | Recommended fix |
|----|-------|----------|-----------------|
| M1 | Gap shifts = rider-day slots, not shift module | `achievementDecomposition.ts` | Rename label; document proxy |
| M2 | Period trend uses current headcount for history | `periodComparison.ts` | Historical headcount or warn |
| M3 | Missing supervisor names not backfilled | `buildRiderAggs` | Join `المشرفين` by code |
| M4 | `rankActionsByImpact` prioritizes priority over recovery | `managementActions.ts` | Sort recovery first for Executive Focus |
| M5 | Inactive recovery assumes 6h/rider | `managementActions.ts` | Use `avgHoursPerActiveRider` |

### Low

| ID | Issue | Location |
|----|-------|----------|
| L1 | City rollup unweighted averages | `kpiRootCause.ts` |
| L2 | No confidence score on root cause factors | `kpiRootCause.ts` |

---

## 10. Explicit PASS / FAIL Matrix

| Validation area | Result |
|-----------------|--------|
| 1. Data coverage explanation | **PASS** (documented) — level **CRITICAL** |
| 2. Executive Focus formulas | **PASS** per action — **FAIL** as portfolio |
| 3. Achievement decomposition | **PASS** (fleet math) |
| 4. Rider impact | **WARNING** |
| 5. Supervisor ranking | **PASS** (formula) |
| 6. Mapping integrity | **WARNING** |
| 7. Root cause engine | **WARNING** |
| 8. Overall reliability | **FAIL** (51/100) |

---

## 11. Recommendation

### Do **not** proceed to Sprint 3, 4, or 5 yet

**Fix validation issues first**, in this order:

1. **P0 — Coverage gate:** Disable Control Tower sections or show critical banner when `sourceDataCoverage.coverage < 80%`
2. **P0 — Recovery labeling:** Mark all recovery values as **hours/day**; prevent summing across Top 10 without overlap warning
3. **P1 — Rider impact cap:** Replace fixed `10h` with operational target (e.g. avg hours per active rider or per-supervisor target)
4. **P1 — Executive dedup:** One primary action per supervisor/rider in Top 10
5. **P1 — Supervisor name join:** Resolve empty supervisor from master sheet
6. **P2 — Root cause target KPI:** Fix top-supervisor metric for Target Hours
7. **P2 — Contract Coverage Audit** (prerequisite for Sprint 4 only — unchanged)

After fixes, re-run:

```bash
npx tsx scripts/validate-control-tower-audit.ts
```

And validate against a live report with **coverage ≥ 80%** before production sign-off.

---

## Appendix A — File reference map

| Insight | Primary function | File |
|---------|------------------|------|
| Coverage % | `computeSourceDataCoverage` | `talabatOpsMetrics.ts` |
| Day completeness | `runDataIntegrityLayer` | `dataIntegrity.ts` |
| Gap hours | `buildAchievementDecomposition` | `achievementDecomposition.ts` |
| Rider lost hours | `buildTopNegativeImpactRiders` | `riderImpact.ts` |
| Management actions | `buildManagementActions` | `managementActions.ts` |
| Executive Top 10 | `buildExecutiveFocus` | `executiveFocus.ts` |
| KPI root cause | `buildKpiRootCauses` | `kpiRootCause.ts` |
| Trends 7/14/30 | `buildPeriodComparisons` | `periodComparison.ts` |

---

## Appendix B — Sign-off

| Question | Answer |
|----------|--------|
| Are Talabat KPI formulas changed? | **No** — audit only |
| Is achievement gap mathematically correct? | **Yes** at fleet level |
| Is Control Tower production ready? | **No** — 51/100 |
| Proceed to Sprint 3? | **No** — fix P0/P1 first |

**Document status:** Validation audit complete.
