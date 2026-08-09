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

---

## FINAL RELEASE AUDIT

**Audit type:** READ-ONLY  
**Audit time (local):** 2026-08-09 ~18:15 EEST  
**Mutations performed:** none (no Sheet writes, no Vercel env changes, no flag enables)  
**Flags enabled:** none

### Exact Production alias

| Field | Value |
|---|---|
| Alias | https://wakeel-team-dashboard.vercel.app |
| Vercel deployment ID | `dpl_4xe3bofk7tGfVt2NBxBQ87ktUpmD` |
| Deploy URL | https://wakeel-team-dashboard-d0ytecv1q-ragab-team.vercel.app |
| Production commit SHA | `c91798d889706a008d662a4aef7f773d63c99e99` |
| Commit subject | `docs(srs014): record production deploy id after safety-gate redeploy` |
| Deployment ready (UTC) | `2026-08-09T14:57:45.435Z` |
| Deployment ready (EEST) | `2026-08-09 17:57:45 GMT+0300` |
| `readyState` | `READY` |
| Alias includes Production | Yes (`wakeel-team-dashboard.vercel.app`) |

### Commit ancestry (required fixes on Production)

| Commit | Role | On Production alias? |
|---|---|---|
| `fac888c` | SRS-014 feature ship (flags default OFF) | Yes (ancestor) |
| `67617e1` | One auto-deduct per issue+cycle + QA scripts | Yes (ancestor of `c91798d`) |
| `c91798d` | Report deploy-ID docs only (no runtime logic delta) | **Yes — currently serving** |

`git merge-base --is-ancestor 67617e1 c91798d` → exit 0. Local `HEAD` = `c91798d` matches Vercel `githubCommitSha`.

### All 7 SRS-014 flag states (Production)

Source: `vercel env ls production -S ragab-team` + live cron probe.

| Flag | State |
|---|---|
| `FEATURE_RECRUITMENT_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_PAYOUT_CYCLES_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | **Absent → OFF** |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | **Absent → OFF** |

Present non-SRS-014 flags only: `FEATURE_PAYROLL_LEDGER_ENABLED`, `FEATURE_RIDER_SEARCH_ENABLED`, `FEATURE_SHIFT_IMPORT_ENABLED`.

**No automatic enablement by deploy:** `vercel.json` registers the cron path only; it does not set any `FEATURE_*` env. Flag helpers require env === `'true'` (`lib/srs014Flags.ts`).

### Cron cannot deduct while auto flag OFF

Live Production:

```
GET /api/cron/equipment-auto-deductions
→ 200 {"success":true,"skipped":true,"reason":"FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED off"}
```

Code path (`app/api/cron/equipment-auto-deductions/route.ts`): returns before `runEquipmentAutoDeductionsForDate` when `isAutoEquipmentDeductionsEnabled()` is false.

### Test ↔ deployed code correspondence

| Suite | Result | Code correspondence |
|---|---|---|
| Offline `npm run test:srs014` | **41/41 PASS** (re-run during this audit on `c91798d`) | Same tree as Production SHA |
| Production Sheets QA | **19/19 PASS** (prior gate) | Exercised runtime from `67617e1` (engine idempotency fix); `c91798d` is docs-only after that — **no financial logic drift** |
| SRS-013 Phase 3 | **5 PASS / 0 FAIL / 1 SKIP** (re-run this audit) | Salary path on deployed tree; auto equipment flag forced OFF in harness |

### SRS-013 Phase 3 (re-verified this audit)

```
=== Result: 5 passed, 0 failed, 1 skipped ===
```

- **WA-003 / July:** PASS — OFF==ON, `netSalary=7234.5`
- **WA-002 skip:** intentional and justified — read-only ledger check found **2 active `ledger_native`** rows for `WA-002` / `2026-07`:
  - `f7d55def-…` deduction −200 (`خصم`)
  - `95b24683-…` advance −1000 (`سلفه`)

### Checklist confirmations (items 7–20)

| # | Check | Result | Evidence |
|---|---|---|---|
| 7 | Salary double-count protection | **PASS** | Legacy `equipmentCost` only zeroed when auto flag ON **and** open liability riders exist (`lib/salaryService.ts`). Ledger sums **only** `source==='ledger_native' && status==='active'`; `legacy_mirror` excluded (`lib/payrollLedger.ts` + salary comments). With Production auto flag OFF, legacy equipment path is unchanged. |
| 8 | Activation-cycle eligibility | **PASS** | `isCycleEligibleForEquipmentDeduction` returns `activation_in_current_cycle` when activation falls inside cycle; first deduct = next equipment-enabled non-closing cycle with `startDate > activationDate` (`lib/payoutCycles/eligibility.ts` + offline tests). |
| 9 | Closing-cycle protection | **PASS** | `isClosing=true` → `closing_cycle` skip; `shouldSkipEquipmentAutoDeductions` true (`eligibility.ts` + engine tests). |
| 10 | Partial payout carry-forward | **PASS** | 300 expected / 150 available → deduct 150, `installmentComplete=false`; next cycle remaining 150 of same installment (`expectedInstallmentMilliemes` + safety-gate / engine tests). |
| 11 | 800/900 liability | **PASS** | PAID→80000 milli; NOT_PAID→90000 (`lib/money.ts`). |
| 12 | Installment rounding | **PASS** | 800→26667+26667+26666; 900→30000×3 (integer milliemes). |
| 13 | Settlement payment | **PASS** | `applySettlementPayment` reduces balance; status stays `open` if remaining > 0; does **not** call waive (`store.ts` / `approveSettlement`). |
| 14 | Waiver explicit only | **PASS** | Waiver only via `markIssueWaived` when Admin sets `waivedMilli` / `waiverReason` (`approveSettlement`). |
| 15 | Idempotency (one per issue+cycle) | **PASS** | `existingIssueCycleKeys` → `already_posted_for_cycle` plus idempotency key + Redis NX + ledger dup check (`engine.ts` on `67617e1`/`c91798d`). |
| 16 | Audit trail on financial mutations | **PASS (with note)** | Liability create/balance/settlement/waive and settlement approve write `سجل_العمليات` via `appendAuditLog` with `actorCode`/`actorName`, `timestamp`, `before`/`after` (create has `after` only). Auto-deduct also updates liability via `updateBalance` (audited) and posts `ledger_native` with `createdBy`. |
| 17 | Legacy Excel / admin deductions untouched | **PASS** | `app/api/admin/salary/admin-deductions` still uses `خصومات_الإدارة`; SRS-014 flags do not gate that route. |
| 18 | No destructive sheet delete/rename | **PASS** | No `deleteSheet`/`renameSheet` in SRS-014 modules (`equipmentLiability`, `equipmentDeductions`, `payoutCycles`, `equipmentReturns`). |
| 19 | New sheets additive / lazy | **PASS** | Created only via `ensureSheetExists` on first use. |
| 20 | Deploy does not enable flags | **PASS** | Confirmed absent in Production env after deploy of `c91798d`. |

### Cleanup / data integrity (read-only re-check)

| Sheet | `SRS014QA_` rows now |
|---|---|
| `عهدة_المعدات` | **0** |
| `استقطاعات_المعدات_التلقائية` | **0** |
| `دورات_القبض` | **0** |
| `تسوية_استرجاع_المعدات` | **0** |
| `سجل_المعاملات_المالية` | **0** |

**Confirmation:** Production QA artifacts on financial sheets are fully cleaned.  
**Confirmation:** This audit performed **no** production financial mutations. Prior gate mutations were isolated `SRS014QA_` rows only and were removed.

### Audit verdict

| Gate | Status |
|---|---|
| Deployed commit includes all required fixes through `c91798d` | **PASS** |
| All 7 SRS-014 flags OFF | **PASS** |
| Cron cannot deduct | **PASS** |
| SRS-013 regression | **PASS** (5/0/1; WA-003 PASS; WA-002 real ledger_native skip) |
| SRS-014 offline | **PASS** 41/41 |
| SRS-014 prod QA (prior) | **PASS** 19/19 (code-aligned) |
| Ready to discuss **first** single flag enablement | **YES — pending human decision** |

### STOP

No SRS-014 flag was enabled during this audit. Next step is a separate human decision on which **single** flag to enable first.

---

## PHASE A — PAYOUT CYCLES CONTROLLED ROLLOUT

**Date:** 2026-08-09  
**Status:** **PASS — STOPPED** (awaiting explicit approval before Phase B)  
**Enabled flag:** `FEATURE_PAYOUT_CYCLES_ENABLED=true` **only**

### Isolation (before enable)

| System | Coupled to payout-cycles flag? | Evidence |
|---|---|---|
| Salary calculation | **No** | `lib/salaryService.ts` has zero `payoutCycles` / `FEATURE_PAYOUT_CYCLES` references |
| Equipment liability | **No** | Liability store gated by equipment-ledger paths, not payout flag |
| Equipment auto deductions | **No** | Engine/cron gated solely by `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` |
| Payroll ledger | **No** | Gated by `FEATURE_PAYROLL_LEDGER_ENABLED` only |
| Recruitment / delivery / return / Excel admin deductions | **No** | Unchanged routes; payout flag only unlocks Admin payout-cycle APIs/UI |

With payout flag ON, those systems do not automatically change behavior.

### Deploy + flag state

| Field | Value |
|---|---|
| Production commit | `b29b566d266c0025e74937cf21663d8295414758` |
| Commit subject | `docs(srs014): add FINAL RELEASE AUDIT section before Phase A` |
| Code base for runtime | Includes `fac888c` + `67617e1` (SRS-014 engine) + docs tip |
| Vercel deployment ID | `dpl_6mCMaCJ9emNpKFsxze5WDHFcjfud` |
| Deploy URL | https://wakeel-team-dashboard-31nxymwub-ragab-team.vercel.app |
| Ready (UTC) | `2026-08-09T15:33:37.634Z` |
| Ready (EEST) | `2026-08-09 18:33:37 GMT+0300` |
| Alias | https://wakeel-team-dashboard.vercel.app |

| Flag | Production |
|---|---|
| `FEATURE_PAYOUT_CYCLES_ENABLED` | **true** (added; Sensitive) |
| `FEATURE_RECRUITMENT_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | **Absent → OFF** |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | **Absent → OFF** |

Live capability: `GET /api/admin/payout-cycles/capability` → `{ enabled: true }`.

### August 2026 configuration (Admin API — not hard-coded)

Dates are **configuration data only** stored in `دورات_القبض`. Application logic has no hard-coded August 2026 calendar (UI label "دورة التقفيلة" is display-only).

| # | cycleId | Range | deductionGenerationDate | isClosing | status |
|---|---|---|---|---|---|
| 1 | `8e3bd7b6-6ded-48e5-af43-30782aad6f7c` | 2026-08-01 → 2026-08-09 | 2026-08-09 | false | **finalized** (finalize + explicit correction audit test) |
| 2 | `5187b581-0025-4b57-bbdc-482cf7fed78e` | 2026-08-10 → 2026-08-16 | 2026-08-16 | false | active |
| 3 | `99e5f369-32f8-454e-8f2b-fe299a53cfd3` | 2026-08-17 → 2026-08-23 | 2026-08-23 | false | active |
| 4 | `d6e19bd4-cd26-490d-888b-60dfc649b1b3` | 2026-08-24 → 2026-08-31 | 2026-08-31 | **true** | active |

Canonical identity = `cycleId` (UUID). Arabic labels are not used as keys.

### Validation results (Production API + engine)

Script: `scripts/srs014-phase-a-payout-cycles-rollout.ts` → **35/35 PASS**

Rejected as required:
- overlapping cycles
- startDate > endDate
- duplicate cycleNumber
- invalid month
- multiple closing cycles
- closing cycle not final by endDate
- invalid payout/deduction dates
- silent edit of finalized cycle (409) — explicit correction allowed with audit

### Permissions

| Actor | Create/edit/finalize | Result |
|---|---|---|
| Admin | Allowed | PASS |
| Supervisor | Denied | **401** |
| Recruitment | Denied | **401** |

### Audit results

`سجل_العمليات` contains create/correct rows for August cycles with actor (`PHASEA-ADMIN`), action, timestamp, after JSON including `cycleId` (4 audit hits verified). Finalize/correction paths use `appendAuditLog` with before/after.

### Cron status

```
GET /api/cron/equipment-auto-deductions
→ {"success":true,"skipped":true,"reason":"FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED off"}
```

No automatic equipment deduction occurred.

### SRS-013 regression (with payout flag ON in process)

```
=== Result: 5 passed, 0 failed, 1 skipped ===
```

WA-002 skip remains the approved intentional `ledger_native` case. Salary output remained byte-identical OFF/ON for applicable pairs while `FEATURE_PAYOUT_CYCLES_ENABLED=true`.

### Equipment / ledger safety proof

| Check | Result |
|---|---|
| New equipment liability rows | **0 → 0** |
| New auto-deduction rows | **0 → 0** |
| `equipment_installment` ledger rows | **0 → 0** |
| Rejected invalid POSTs persisted | **none** |

### Persistence / data integrity

- `دورات_القبض` lazy-created / readable; **4** August rows kept as intended production calendar
- No existing sheets deleted/renamed
- No rider financial history modified
- No legacy Excel migration
- Temporary rejected cycleNumbers (94–99) did **not** persist

### Closing-cycle / generation-date behavior

- Cycle 4 exists for payroll/reporting (`isClosing=true`, status active)
- `shouldSkipEquipmentAutoDeductions` / eligibility reason `closing_cycle` confirmed
- `resolveCycleForDeductionDate(..., '2026-08-16')` → cycle **#2** via configured `deductionGenerationDate` (not week inference)
- Cycle 1 starts **2026-08-01** (Admin-configured month start / first Sunday boundary), not a hard-coded Monday week rule

### Phase A STOP

**Do not proceed to Phase B automatically.**

Still OFF:
- `FEATURE_RECRUITMENT_V2_ENABLED`
- `FEATURE_EQUIPMENT_LEDGER_ENABLED`
- `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED`
- `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED`
- `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED`
- `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED`

Await explicit approval for the next single flag.

---

## PHASE B — RECRUITMENT V2 (code ship, flag OFF)

**Date:** 2026-08-09  
**Scope:** Additive Recruitment V2 only. No Phase C–H. No equipment/payroll liability. No salary / Rooster changes.

### Design decisions (non-destructive)

| Topic | Decision |
|---|---|
| Security fee storage | Keep sheet value `PAID` / `NOT_PAID` (design freeze + liability). API accepts `UNPAID` as alias → stored as `NOT_PAID`. |
| Fee money side-effects | **None** in Phase B (status record only). |
| Ops supervisor assignment | When V2 ON: Admin only; RM cannot set/change `finalAssignedSupervisorCode`. Auto-promote preferred→final disabled when V2 ON. |
| Sheet columns | Append-only after `contactsExceptionReason`: `phoneSecondary`, `nationalId`, `detailedAddress`, `age`, `studentStatus`, `lectureAbsenceReason`, `activationNotActivatedReason`, `contactsExceptionAt`. |
| Contacts sheet | `جهات_اتصال_المرشحين` (lazy ensure). Max 3 active; min 2 unless Admin exception + audit timestamp. |
| Existing recruitment | Continues when flag OFF; V2-only routes return 503. |

### Files changed / added

**Core**
- `lib/recruitment/phaseB.ts` (+ `phaseB.test.ts`)
- `lib/recruitment/types.ts`, `recruitmentSheetParser.ts`, `contactsStore.ts`, `recruitmentV2.ts`, `recruitmentService.ts`, `recruitmentActivityLog.ts`

**APIs**
- `app/api/recruitment/capability/route.ts` (new)
- `app/api/recruitment/candidates/route.ts` (V2 create fields)
- `app/api/recruitment/candidates/[id]/route.ts` (RM strip Ops fields; exception Admin-only)
- `app/api/recruitment/candidates/[id]/contacts/route.ts` + `[contactId]/route.ts`
- `app/api/recruitment/candidates/[id]/security-fee/route.ts`

**UI**
- `CandidateContactsPanel.tsx` (new)
- `CandidateEditModal.tsx`, `NewCandidateForm.tsx`, `CandidatesTable.tsx` (pipeline stage), `CandidateFollowupWizardModal.tsx` (Admin-only Ops when V2)

**Tests**
- `package.json` → `test:srs014` includes `lib/recruitment/phaseB.test.ts`

### Sheets

| Sheet | Change |
|---|---|
| `مرشحين_التعيين` | Append columns only (via `ensureHeaderRow`); no rename/delete |
| `جهات_اتصال_المرشحين` | Created lazily if missing |
| Existing recruitment tabs | Untouched destructively |

### Permissions matrix (V2 ON, server-enforced)

| Action | Unauth | Supervisor | Recruitment Manager | Limited Admin* | Full Admin |
|---|---|---|---|---|---|
| Legacy list/create/update (non-Ops) | 401 | denied† | allowed | per capability | allowed |
| Family contacts CRUD | 401 | denied† | allowed | per capability | allowed |
| Security fee set/change | 401 | denied | set (freeze after); change only Admin | per capability | full |
| Lecture / attendance / activation | 401 | denied† | allowed | per capability | allowed |
| Contacts exception (&lt;2) | 401 | denied | **403** | per capability | allowed + audit |
| Ops supervisor assign/reassign | 401 | denied | **403** | per capability | allowed + audit |
| V2 routes when flag OFF | — | — | **503** | **503** | **503** |

\*Limited Admin follows existing `assertRecruitmentApiAccess` / capability model.  
†Supervisors are rejected by recruitment API access where they lack recruitment scope.

### Test results (pre-deploy)

| Suite | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` | PASS |
| `npm run test:srs014` | **61/61 PASS** (includes Phase B suite) |
| `scripts/srs013-phase3-regression-check.ts` | **5 PASS / 0 FAIL / 1 SKIP** (WA-002 ledger_native intentional) |

### Production deployment / flag state

- Deploy Phase B code with **`FEATURE_RECRUITMENT_V2_ENABLED` absent/OFF** (do **not** enable).
- Keep `FEATURE_PAYOUT_CYCLES_ENABLED=true` (Phase A).
- Keep all equipment / auto-deduction / returns / inventory / manual-deduction V2 flags OFF.
- No synthetic production candidate writes in this ship (flag OFF ⇒ V2 APIs 503).

### Phase B STOP

**Do NOT enable `FEATURE_RECRUITMENT_V2_ENABLED`.**  
**Do NOT start Phase C.**

Await explicit human approval before enabling Recruitment V2.
