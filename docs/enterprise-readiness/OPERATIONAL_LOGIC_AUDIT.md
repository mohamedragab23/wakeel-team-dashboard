# Operational Logic Audit — Executive Focus, Rider Impact, Recovery Hours, Supervisor Targets

**Generated:** 2026-06-25T12:48:48.271Z  
**Period:** 2026-06-15 → 2026-06-22  
**Zone:** Alexandria  
**Data source:** Live Google Sheets via `buildStrategicOpsReport`

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Fleet target hours/day | 1655 |
| Fleet actual hours/day | 1102.58 |
| Fleet achievement % | 66.62% |
| Fleet avg hours/active rider | 5.38 |
| Fleet gap (target − actual) | 552.42 h/day |
| Control Tower insights | ENABLED |
| Operational coverage | 100% |

---

## 2. Why Similar Lost Target Hours Across Small vs Large Teams?

### Root cause (formula)

Supervisor **lost target hours** uses **implied target**, not headcount:

```
targetHoursUsed = supervisor.sheetTarget  OR  fleetDailyTargetHours (fallback)
achievement%    = actualHours / targetHoursUsed × 100
impliedTarget   = actualHours / (achievement% / 100)  → equals targetHoursUsed
lostTargetHours = targetHoursUsed − actualHours
```

**Headcount does not appear in lostTargetHours.** A supervisor with 6 riders and one with 60 riders can show **similar lost target** if their **team actual hours** and **targetHoursUsed** produce the same gap.

### Evidence — small vs large teams

**Small teams (HC ≤ 10, lost ≥ 15):** 1 supervisors

- **Abdelrhman Elsayed Wakeel** HC=6 targetUsed=100 actual=7.68 lost=92.32 (sheet target col=100)

**Large teams (HC ≥ 50, lost ≥ 15):** 4 supervisors

- **Kero Maged Wakeel** HC=64 targetUsed=270 actual=161.51 lost=108.48 (sheet target col=270)
- **Adham Ahmed Wakeel** HC=64 targetUsed=240 actual=132.57 lost=107.42 (sheet target col=240)
- **Rami Ibrahim Wakeel** HC=91 targetUsed=430 actual=336.4 lost=93.61 (sheet target col=430)
- **Mohamed Hassan Wakeel** HC=79 targetUsed=350 actual=288.06 lost=61.95 (sheet target col=350)

### Fallback target warning

When a supervisor has **no sheet target** (column target = 0), the system uses **fleetDailyTargetHours (1655)** as their daily target — this is **not proportional to team size** and can inflate lost-target metrics for small teams.

Supervisors using fleet fallback: **0** / 7

---

## 3. Supervisor-by-Supervisor Reconciliation

| Supervisor | Headcount | Target Hours | Actual Hours | Achievement % | Lost Target Hours | Sheet Target |
|------------|-----------|--------------|--------------|---------------|-------------------|--------------|
| Kero Maged Wakeel | 64 | 270 | 161.51 | 59.82% | 108.48 | 270 |
| Adham Ahmed Wakeel | 64 | 240 | 132.57 | 55.24% | 107.42 | 240 |
| Rami Ibrahim Wakeel | 91 | 430 | 336.4 | 78.23% | 93.61 | 430 |
| Abdelrhman Elsayed Wakeel | 6 | 100 | 7.68 | 7.68% | 92.32 | 100 |
| وحوش الطريق | 20 | 100 | 36.91 | 36.91% | 63.09 | 100 |
| Mohamed Hassan Wakeel | 79 | 350 | 288.06 | 82.3% | 61.95 | 350 |
| Belal Mostafa Wakeel | 34 | 165 | 139.46 | 84.52% | 25.54 | 165 |

**Target Hours column** = daily target used in Talabat formula (`targetDaily` from sheet or fleet fallback).  
**Lost Target Hours** = `targetHours − actualHours` (algebraically identical to `supervisorLostTargetDaily()`).

**Scorecard lost hours** (separate metric): `max(0, headcount × fleetAvg − dailyHours)` — scales with headcount; see column in script output.

---

## 4. Rider Impact — Why lostHoursDaily ≈ 10.74?

### Formula (fleet-average based — NOT rider-specific)

```
expectedHoursDaily = fleet avgHoursPerActiveRider = 5.38
actualHoursDaily   = rider.totalHours / periodDays
hoursGapDaily      = max(0, expected − actual)
noShowLostDaily    = (noShowCount / scheduledDays) × fleetAvg   [if scheduled]
lostHoursDaily     = hoursGapDaily + noShowLostDaily
```

**Rider expected hours are 100% fleet-average based.** There is no rider-specific baseline.

### 10.74 pattern

When **fleetAvg = 5.38** and a rider has:
- **actualHoursDaily = 0** (zero hours in period average)
- **noShowCount = scheduledDays** (every scheduled day is no-show)

Then: `lostHoursDaily = fleetAvg + fleetAvg = 2 × 5.38 = 10.76`

| lostHoursDaily | Rider count (top-20 list) |
|----------------|---------------------------|
| 10.76 | 20 |

Riders with lost ≈ 10.74: **0** of 20 in top negative impact list.



---

## 5. Executive Focus & Recovery Hours — Achievability & Double-Counting

### Deduplication layers

1. **Per supervisor:** multiple rule candidates → keep highest priority + recovery (`managementActions.ts`)
2. **Per entity (supervisor/rider/fleet):** one action per `entityType:entityId` (`executiveFocus.ts`)
3. **Top 10 cap:** executive focus list limited to 10 actions

### Audit numbers (Alexandria live)

| Metric | Value |
|--------|-------|
| Total actions ranked | 14 |
| Sum of all action recoveries (raw) | 1407.83 h/day |
| Unique entities after entity dedup | 13 |
| Top-10 focus recovery sum | 569.91 h/day |
| Fleet operational gap | 552.42 h/day |
| Focus sum / fleet gap | 1.03× |

### Top Executive Focus actions

| Priority | Entity | Name | Recovery h/day | Evidence |
|----------|--------|------|----------------|----------|
| critical | supervisor | Kero Maged Wakeel | 108.48 | lostTargetDaily=108.48, achievement=59.82% |
| critical | supervisor | Adham Ahmed Wakeel | 107.42 | lostTargetDaily=107.42, achievement=55.24% |
| critical | supervisor | Rami Ibrahim Wakeel | 93.61 | lostTargetDaily=93.61, achievement=78.23% |
| critical | supervisor | Abdelrhman Elsayed Wakeel | 92.32 | lostTargetDaily=92.32, achievement=7.68% |
| critical | supervisor | وحوش الطريق | 63.09 | lostTargetDaily=63.09, achievement=36.91% |
| critical | supervisor | Mohamed Hassan Wakeel | 61.95 | lostTargetDaily=61.95, achievement=82.3% |
| critical | rider | EmadElDin Mohamed Ashraf Naeem _WAKEEL | 10.76 | expected=5.38, actual=0, lost=10.76, noShow=8 |
| critical | rider | Mohamed Elsayed Ahmed Hefny _WAKEEL_BC | 10.76 | expected=5.38, actual=0, lost=10.76, noShow=8 |
| critical | rider | Mohamed Emad Gaber Morsi _WAKEEL_BC | 10.76 | expected=5.38, actual=0, lost=10.76, noShow=8 |
| critical | rider | Amir Bulbul Anwar Aziz _WAKEEL_BC | 10.76 | expected=5.38, actual=0, lost=10.76, noShow=8 |

### Double-counting assessment

- **Within Executive Focus list:** deduplication prevents the same supervisor/rider/fleet appearing twice ✅
- **Across supervisors:** each supervisor's lost-target recovery is independent — **summing all raw actions (1407.83 h) exceeds fleet gap (552.42 h)** because recoveries are **rule-based estimates**, not a partition of the fleet gap ⚠️
- **Rider + supervisor overlap:** a supervisor lost-target action and a rider impact action for the same team can **both** appear (different entities) — partial overlap in real recoverability ⚠️
- **Achievability:** Top-10 dedup sum (569.91 h/day) represents **upper-bound actionable estimates**, not guaranteed recoverable hours. Treat as **prioritized intervention list**, not additive forecast.

Reliability score: **88/100** (dedup ratio component).

---

## 6. Conclusions Before Sprint 4/5

| Question | Finding |
|----------|---------|
| Why similar lost target for 6 vs 60+ riders? | `lostTarget = sheetTarget − actualHours` — **headcount is not in the formula**. Abdelrhman (HC=6): target 100 − actual 7.68 = **92.32**. Kero (HC=64): 270 − 161.51 = **108.48**. Similar ~90–110 gaps despite 10× headcount difference because sheet targets are fixed daily totals, not per-rider. |
| Exact target per supervisor? | See reconciliation table §3; sheet target or fleet fallback 1655. |
| Why lostHours ≈ 10.74? | `2 × fleetAvg` for zero-hour riders with full no-show rate; fleetAvg=5.38. |
| Rider expected hours fleet or rider-specific? | **Fleet-average only** (`avgHoursPerActiveRider`). |
| Executive Focus double-counted? | Entity dedup ✅; cross-entity sum can exceed fleet gap ⚠️ — not additive. |

**Recommendation:** Before Sprint 4/5, consider making supervisor `targetDaily` proportional to headcount (or use sheet targets for all supervisors) and document that Executive Focus recovery hours are **prioritization weights**, not a sum-to-gap budget.

---

*Audit script: `scripts/operational-logic-audit.ts`*
