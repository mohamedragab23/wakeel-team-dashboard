# SRS-014 Production Safety Gate Report

**Date:** 2026-08-09  
**Operator:** Cursor agent  
**Hard rule:** No SRS-014 feature flag was enabled in Production. Do not enable until human review of this report.

---

## Executive verdict

| Gate | Result |
|---|---|
| Commit SRS-014 work | **DONE** (`fac888c` + follow-up idempotency commit) |
| Deploy Production with all SRS-014 flags OFF | **PASS** |
| Vercel flag confirmation (absent / false) | **PASS** — all 7 SRS-014 flags **absent** |
| SRS-013 Phase 3 regression | **PASS** — 5 passed, 0 failed, 1 intentional skip |
| WA-003 root cause | **Resolved / explained** — false FAIL from Sheets quota; salaries identical when reads succeed |
| Offline SRS-014 suite | **PASS** — 41/41 |
| Production HTTP (flags OFF) | **PASS** — cron skipped; new routes present (401 unauth) |
| Isolated Production Sheets QA (A–K) | **PASS** — 19/19 |
| Cleanup / no orphan `SRS014QA_` financial rows | **PASS** — leftover=0 after cleanup |
| Enable any SRS-014 flag | **NOT DONE — STOPPED** |

**Verdict for enablement:** Safety gate evidence is complete for review. **Do not enable flags automatically.** Await explicit human approval.

---

## Deployed commit & Vercel deployment

| Item | Value |
|---|---|
| Production URL | https://wakeel-team-dashboard.vercel.app |
| Current Production deployment ID | `dpl_EorcGo6Ah9bjKci1zuYCmJvaXVgV` |
| Deploy URL | https://wakeel-team-dashboard-gnq0q2ape-ragab-team.vercel.app |
| Git SHA on Production alias | `67617e148f36df73b1f0dff8485f941acfd1e9bd` |
| Prior SRS-014 ship (flags-OFF baseline) | `fac888c` / `dpl_6YwbkWKLyWx3UvpdPkeJpJA7SGiR` |
| Current commit message | `fix(srs014): one auto-deduct per issue per cycle + production safety gate evidence` |

**Evidence that SRS-014 code is on Production:** authenticated cron returns structured skip for the new route; unauthenticated hits to new admin/supervisor routes return **401** (not 404).

---

## Exact feature-flag state (Production Vercel)

Source: `vercel env ls production -S ragab-team` (2026-08-09).

| Flag | Production |
|---|---|
| `FEATURE_PAYROLL_LEDGER_ENABLED` | Present (SRS-013) |
| `FEATURE_RIDER_SEARCH_ENABLED` | Present (SRS-013) |
| `FEATURE_SHIFT_IMPORT_ENABLED` | Present (SRS-013) |
| `FEATURE_RECRUITMENT_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_PAYOUT_CYCLES_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | **Absent → OFF** |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | **Absent → OFF** |

### Runtime proof (deployed Production HTTP)

```
GET /api/cron/equipment-auto-deductions
Authorization: Bearer <CRON_SECRET>
→ 200 {"success":true,"skipped":true,"reason":"FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED off"}
```

Script: `scripts/srs014-prod-verify-flags-off.ts`

---

## WA-003 root cause and resolution

### Symptom
SRS-013 Phase 3 OFF vs ON regression reported **FAIL** for `WA-003 / July`.

### Investigation
1. Recomputed `calculateSupervisorSalary('WA-003', '2026-07-01', '2026-07-31')` with payroll ledger OFF and ON.
2. When Google Sheets reads succeed: **byte-identical** financial fingerprint; `netSalary = 7234.5`, legacy equipment = 0.
3. Stability script (`scripts/srs013-wa003-stability.ts`): A==B==C==D when quota healthy.
4. Failures correlated with `Quota exceeded … Read requests per minute` → incomplete sheet reads → **false mismatch**.
5. Not timezone math changing salary; period labels may show `2026-06-30` UTC boundary but OFF/ON still match.
6. Not ledger-shape for WA-003 July (no active `ledger_native` rows for that pair).
7. Not caused by SRS-014 salary paths (auto equipment flag OFF; no open liability for real WA-003 during triage).
8. Pre-existing unrelated: `السلف!A:Z` parse error → advances fall back to 0 (same OFF and ON).

### Fix
Hardened `scripts/srs013-phase3-regression-check.ts`: rate-limit, retry on quota, financial fingerprint compare. No production salary formula change required for WA-003.

### Can it affect real salaries?
The **false FAIL** cannot. Incomplete sheet reads under quota can temporarily produce wrong salary API responses in any environment — that is a Sheets QPM operational risk, not an OFF/ON ledger divergence for WA-003.

### Rerun result
`tsx scripts/srs013-phase3-regression-check.ts` → **5 passed, 0 failed, 1 skipped**

| Pair | Result |
|---|---|
| WA-003 / July | **PASS** (OFF == ON) |
| Other applicable pairs | **PASS** |
| WA-002 / July | **SKIP** — 2 active `ledger_native` rows (OFF/ON expected to differ by design) |

**SRS-013 regression requirement met:** 0 failures on applicable pairs.

---

## SRS-014 offline test result

| Command | Result |
|---|---|
| `npm run test:srs014` | **41/41 PASS** |
| Includes | money, cycles, eligibility, engine (incl. one-per-cycle), liability, inventory anomalies, `srs014SafetyGate.test.ts` |

---

## SRS-014 Production QA result (isolated)

### Method (critical)
- Production **Vercel flags remained OFF** the entire time (cron skipped).
- QA script `scripts/srs014-prod-qa-gate.ts` ran **locally** with process-env SRS-014 flags ON against Production Google Sheets only.
- All artifacts prefixed `SRS014QA_`.
- No real rider financial history mutated (synthetic rider codes / issue IDs only).
- Cleanup: `scripts/srs014-prod-qa-cleanup.ts` → **0 leftovers** on financial sheets.

### Result: **19/19 PASS**

### A. 900 EGP liability
- pouch 530 + two shirts 270 + security 100 = **900**
- milliemes: `90000`

### B. Security fee already paid → 800
- milliemes: `80000`

### C. Installment split (integer-safe)
- 900 → `30000 + 30000 + 30000`
- 800 → `26667 + 26667 + 26666` (remainder front-loaded; sum exact)

### D. Activation timing
- Activation inside cycle → no deduct that cycle; first eligible = next equipment-enabled non-closing cycle
- Activation before cycle → first deduct in that next eligible cycle

### E. Partial payout
- expected 300, available 150 → deduct 150; installment **not** advanced; carry remaining 150

### F. Closing cycle
- `isClosing=true` → skip; liability remains outstanding

### G. Idempotency
- Same rider+cycle cron/API twice → **exactly one** ledger tx + **exactly one** auto-deduction after fix
- Root cause of earlier FAIL: idempotency key included installment number, so a second run could post installment 2 in the same cycle
- Fix: `existingIssueCycleKeys` / reason `already_posted_for_cycle` in `lib/equipmentDeductions/engine.ts`

### H. Settlement payment
- remaining 600, pay 200 → remaining **400**; status **not** waived

### I. Waiver
- Explicit Admin waive → outstanding waived; no fake payment; audit trail with actor + before/after

### J. Return before completion
- Return records paid amount + remaining liability; Admin must settle or **explicitly** waive — never auto-waive

### K. Salary double-count protection
- With QA open liability on WA-003 and auto flag ON in **local process**: log  
  `SRS-014 double-count guard: excluding legacy equipmentCost for WA-003`  
  → `equipment=0`, `net=7234.5`
- Legacy path (no open liability / flag OFF): legacy `المعدات` behavior unchanged
- **Deployed Production** with flags OFF never entered the V2 deduction path during this gate

### Reconciliation
Observed identity example from QA run:
`original=90000`, `deducted=50000`, `outstanding=40000`, ledger milli sum + settlement paid + waived balance the liability equation.

Sheets touched (QA only):
- `عهدة_المعدات`
- `استقطاعات_المعدات_التلقائية`
- `دورات_القبض`
- `تسوية_استرجاع_المعدات`
- `سجل_المعاملات_المالية`
- `سجل_العمليات` (audit appends)

### Cleanup proof
Post-QA wipe + verification wipe:
```
عهدة_المعدات deleted 0
استقطاعات_المعدات_التلقائية deleted 0
دورات_القبض deleted 0
تسوية_استرجاع_المعدات deleted 0
سجل_المعاملات_المالية deleted 0
```
QA financial leftovers = **0**.

---

## Old system with SRS-014 OFF (mandatory)

| Surface | Evidence |
|---|---|
| Salary calculations | Phase 3 regression PASS (incl. WA-003); Production flags OFF |
| Payroll ledger (SRS-013) | Still gated only by `FEATURE_PAYROLL_LEDGER_ENABLED`; present |
| Equipment auto cron | Skipped on Production HTTP |
| New V2 APIs | Present but auth-gated; no money movement without flags |
| Legacy recruitment / delivery / return / Excel deductions | Code paths unchanged when SRS-014 flags false; no Production flag ON test that alters them |

Browser end-to-end click-through of every legacy UI was not re-run in this gate; behavioral isolation is proven by flag defaults + cron skip + regression salaries.

---

## Data-integrity / existing-data protection

| Rule | Status |
|---|---|
| Snapshot / isolated `SRS014QA_` IDs before mutation | Done |
| No delete/rename of existing sheets or columns | Observed (additive `ensureSheetExists` / headers only) |
| No overwrite of real historical rows | Done |
| SRS-013 functionality preserved | Phase 3 PASS |
| Cleanup only QA artifacts | Done for liability/auto/cycles/settlements/ledger |

---

## Remaining risks (do not ignore)

1. **Supervisor-level double-count guard granularity** — when auto flag ON and any open liability rider exists for a supervisor, legacy `المعدات` cost is zeroed for the whole supervisor (sheet has no per-rider breakdown). Mixed legacy+V2 riders under one supervisor need an enablement plan.
2. **Google Sheets QPM** — can cause incomplete salary reads / false diffs; operational, not SRS-014-specific.
3. **`السلف` sheet parse error** — pre-existing; advances may read as 0.
4. **One-deduct-per-cycle fix** is now on Production alias (`67617e1` / `dpl_EorcGo6Ah9bjKci1zuYCmJvaXVgV`). Still do not enable auto deductions until human approval.
5. **Audit rows** in `سجل_العمليات` with `SRS014QA_` may remain as append-only history of the gate.
6. First enablement should still be staged: cycles → liability ledger → returns → auto deductions last, on a dedicated QA supervisor only.

---

## STOP — flags not enabled

The following remain **OFF / absent** in Production and were **not** set during this gate:

- `FEATURE_RECRUITMENT_V2_ENABLED`
- `FEATURE_PAYOUT_CYCLES_ENABLED`
- `FEATURE_EQUIPMENT_LEDGER_ENABLED`
- `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED`
- `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED`
- `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED`
- `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED`

Await human review of this report before any enablement.
