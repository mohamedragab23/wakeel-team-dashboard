# SRS-014 Production Safety Gate Report

**Date:** 2026-08-09  
**Operator:** Cursor agent (local workspace)  
**Rule:** No SRS-014 feature flag was enabled in Production during this gate.

---

## Executive verdict

| Area | Status |
|---|---|
| Offline financial / eligibility / idempotency / reconciliation suite | **PASS** (40/40 incl. safety gate) |
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| SRS-013 Phase 0 verify | **PASS** (5/5) |
| SRS-013 Phase 3 OFF/ON regression | **FAIL 1 case** (WA-003 last month) — see §J |
| Live Production QA sheet mutations (liability/cron/settlement) | **BLOCKED** — see below |
| Production SRS-014 flags | **ALL ABSENT / OFF** |

**Do not enable any SRS-014 Production flag yet.**

### Why live Production QA writes were blocked

1. **SRS-014 code is not deployed.** `HEAD` = `d7aca2bf4837ee808a4e8591ae52ab321b4ee3ba` (Live 3PL Redis fix). All SRS-014 work is **uncommitted local changes** on `main`. Production cannot execute the new liability/engine/settlement paths.
2. Creating “QA liability rows” against the live spreadsheet from local code would either no-op (old deploy) or write into Production Sheets from a non-deployed binary — unsafe without a controlled deploy-with-flags-OFF window.
3. Per instruction: no flag enable; no real rider financial mutation. Offline millieme-accurate simulation covers §2–§12 / §14 fully.

**Required next step before live QA:** commit → deploy with **all SRS-014 flags unset/OFF** → re-run this gate’s live section on Production, then discuss which flag to enable first.

---

## A–D. Tests performed

### 1. Production data safety audit (static + env)

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| No sheet delete/rename in SRS-014 modules | Only `ensureSheetExists` / additive headers | Confirmed: new tabs only; no `deleteSheet` / rename of existing tabs | **PASS** |
| Payroll ledger columns | Additive after `source` | Added `category`, `idempotencyKey`, `cycleId`, `equipmentIssueId` via `ensureHeaderRow` | **PASS** (additive) |
| Flags OFF ⇒ legacy paths | No auto liability / cron / V2 APIs | Flags absent in Prod Vercel; helpers return false; APIs 503 / cron `{skipped:true}` | **PASS** |
| Production FEATURE_* vars | No SRS-014 flags | Prod has only `FEATURE_PAYROLL_LEDGER_ENABLED`, `FEATURE_RIDER_SEARCH_ENABLED`, `FEATURE_SHIFT_IMPORT_ENABLED` | **PASS** |
| Local `.env.local` | No SRS-014 flags ON | Only `FEATURE_PAYROLL_LEDGER_ENABLED=true` | **PASS** |

### 2. Real 900 / 800 liability (offline milliemes)

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| NOT_PAID | 530+270+100 = **900.00**; installments 300×3 | `90000` milli; `[30000,30000,30000]` | **PASS** |
| PAID | 530+270 = **800.00**; 266.67 / 266.67 / 266.66 | `80000` milli; `[26667,26667,26666]`; sum=80000; display never 799.99/800.01 | **PASS** |
| Integer-only math | No floats in split | All parts `Number.isInteger` | **PASS** |

### 3. Mid-cycle activation (cycle 17→23 Aug, activation 20 Aug)

| Activation | Expected first eligible | C1 (17–23) eligible? | Actual | Pass/Fail |
|---|---|---|---|---|
| 20 Aug (middle) | C2 (24–30) | No (`activation_in_current_cycle`) | As expected | **PASS** |
| 17 Aug (first day) | C2 | No | As expected | **PASS** |
| 23 Aug (last day) | C2 | No | As expected | **PASS** |
| 16 Aug (day before) | C1 | Yes | As expected | **PASS** |

### 4. Closing cycle

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| `isClosing=true` | skip; reason `closing_cycle`; no deduct | `action:'skip'`, `reason:'closing_cycle'` | **PASS** |

### 5. Partial payout (300 expected, 150 available)

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| First cycle | Deduct 150; installment incomplete | `amountMilli=15000`, `installmentComplete=false` | **PASS** |
| Next cycle | Carry remaining **150** of same installment (not 300+150) | `amountMilli=15000`, `installmentNumber=1`, complete | **PASS** |

**Fix applied during gate:** engine now tracks `amountDeductedMilli` vs schedule so partials do not advance installment index or skip the 150 remainder.

### 6. Double-deduction guard (contract)

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Guard contract | When auto flag ON + open liability riders for supervisor → legacy `equipmentCost=0` | Code path present in `lib/salaryService.ts` (additive) | **PASS** (contract) |
| Live salary OFF/ON matrix with real liability rider | Exact EGP numbers | **NOT RUN live** — code undeployed; would require flag ON (forbidden here) | **BLOCKED** |

**Known design note:** legacy `المعدات` is supervisor-aggregated (no rider codes). Guard zeros **entire** supervisor legacy equipmentCost when **any** open liability rider exists for that supervisor. Documented risk if mixed legacy+V2 riders share one supervisor.

### 7. Idempotency

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Same key ×3 (sheet uniqueness set) | Exactly 1 deduct decision | `deductCount=1`; others `duplicate_idempotency` | **PASS** |
| Redis NX | Used in engine when Upstash configured | Code path `redisSetNx` present | **PASS** (code review) |
| Live Redis+Sheet triple-run on Prod | One ledger row | **BLOCKED** (undeployed) | **BLOCKED** |

### 8. Manual vs equipment separation

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Categories distinct | `manual_advance` / `manual_operational_deduction` ≠ `equipment_installment` | Confirmed | **PASS** |

### 9–10. Settlement / waiver / reconciliation

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| 900 − 300 auto − 200 paid | Remaining **400.00** | `40000` milli; equation balances | **PASS** |
| Waiver after 300 auto | Remaining 0; status waived | Equation balances; `approveSettlement` + `markIssueWaived` | **PASS** (logic) |
| Gap found then fixed | Payment path must not always waive | Added `applySettlementPayment` + `approveSettlement` modes | **PASS** (fix) |

### 11. Cycle configuration

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Feb / 30-day / 31-day | Valid when non-overlapping | Validation accepts | **PASS** |
| Overlap | Rejected | Rejected | **PASS** |
| Finalized silent edit | Blocked without correction flag | Blocked | **PASS** |

### 12. deductionGenerationDate (not hard-coded Sunday)

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Resolve by configured date | Sunday vs Wednesday configs map correctly | `resolveCycleForDeductionDate` matches exact generation dates | **PASS** |

### 13. Legacy backward compatibility

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Flags OFF in Prod | No SRS-014 behavior | Flags absent | **PASS** |
| SRS-013 Phase 0 | Pass | 5/5 PASS | **PASS** |
| SRS-013 Phase 3 OFF vs ON (payroll ledger) | Byte-identical when no ledger_native | 4 PASS, **1 FAIL** (WA-003 Jul) | **FAIL** — see risks |
| Live Excel / delivery / return / recruitment smoke | Functional | Not re-exercised end-to-end in browser this gate | **NOT RUN** (manual) |

### 14. Flag isolation

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Each flag independent | Enabling payout cycles alone does not enable auto deductions | Confirmed in unit test | **PASS** |
| Prod remains OFF after gate | All SRS-014 unset | Confirmed via `vercel env ls production` | **PASS** |

### 15. Audit trail (code review)

| Mutation | Audit action / domain | Status |
|---|---|---|
| create liability | `equipment` / `create_liability` | Present |
| balance update | `update_liability_balance` | Present |
| settlement payment | `settlement_payment` | Present (added) |
| waiver | `waive_liability` / `approve_waiver` | Present |
| cycle create/update/finalize | `payout_cycles` | Present |
| manual deduction V2 | `payroll` / `manual_deduction_v2` | Present |
| recruitment security fee | `recruitment` (V2 route) | Present |

Live audit row verification on Prod for SRS-014 entities: **BLOCKED** (undeployed).

### 16. Cleanup

| Item | Status |
|---|---|
| No SRS-014 QA liability / ledger / auto-deduction rows created | **N/A — none written** |
| SRS-013 Phase 0 verify appended **1** audit row to `سجل_العمليات` (1110→1111) | Pre-existing Phase 0 harness behavior; not rider financial history |

### 17. Final regression commands

| Command | Result |
|---|---|
| `npm run test:srs014` | **40/40 PASS** |
| `tsc --noEmit` | **PASS** (exit 0) |
| `next build` | **PASS** (exit 0) |
| `tsx scripts/srs013-phase0-verify.ts` | **5/5 PASS** |
| `tsx scripts/srs013-phase3-regression-check.ts` | **4 PASS / 1 FAIL** |

---

## E. Exact production data touched

| Resource | Touch |
|---|---|
| Vercel Production env | **Read-only** (`vercel env ls`) — no writes |
| Google Sheets via Phase 0 verify | **1 append** to `سجل_العمليات` (audit test harness) |
| SRS-014 new sheets / liability / ledger / auto-deductions | **None** |
| Real rider financial history | **None** |

---

## F. Exact files changed during this gate (delta on top of SRS-014 WIP)

Critical fixes discovered by the gate:

- `lib/equipmentDeductions/engine.ts` — partial installment carry (`amountDeductedMilli`, `installmentComplete`)
- `lib/equipmentLiability/store.ts` — `applySettlementPayment`; `updateBalance({ incrementInstallment })`
- `lib/equipmentReturns/settlement.ts` — `approveSettlement` / `patchSettlementAmounts`
- `app/api/admin/equipment-settlements/[id]/approve/route.ts` — payment vs waiver body
- `app/api/equipment-returns/route.ts` — do not pre-waive on return
- `lib/srs014SafetyGate.test.ts` — new deep suite
- `docs/SRS014_PRODUCTION_SAFETY_GATE_REPORT.md` — this report
- `package.json` — `test:srs014` includes safety gate

(Full SRS-014 WIP remains uncommitted relative to `d7aca2b`.)

---

## G. Git commit hashes

| Ref | Hash |
|---|---|
| Current Production / origin `main` HEAD (no SRS-014) | `d7aca2bf4837ee808a4e8591ae52ab321b4ee3ba` |
| SRS-014 implementation commits | **None yet** (working tree only) |

---

## H. Deployment status

| Item | Status |
|---|---|
| SRS-014 on Production Vercel | **Not deployed** |
| Local `next build` of WIP | **Succeeded** |
| Recommended deploy posture | Deploy WIP with **all SRS-014 flags unset**, then re-run live QA |

---

## I. Current Production feature flag values

| Flag | Production |
|---|---|
| `FEATURE_PAYROLL_LEDGER_ENABLED` | Present (SRS-013; value hidden; local pull shows `true`) |
| `FEATURE_RECRUITMENT_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_PAYOUT_CYCLES_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | **Absent → OFF** |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | **Absent → OFF** |
| `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | **Absent → OFF** |

---

## J. Remaining risks

1. **Not deployed** — offline PASS ≠ Production runtime validation.
2. **SRS-013 Phase 3 regression FAIL** on `WA-003 / 2026-07` OFF vs ON (payroll ledger). Needs triage before any SRS-014 enablement; may be pre-existing ledger optional fields / timezone period labeling (`startDate` shows `2026-06-30`).
3. **Double-count guard granularity** — supervisor-level zeroing of legacy `المعدات` when any V2 liability rider exists (sheet has no per-rider breakdown).
4. **`ensureHeaderRow` on payroll ledger** — first ledger touch after deploy will extend header row additively; data cells preserved, but header rewrite is a Production sheet metadata change.
5. **Live idempotency (Redis + Sheet)** and **live salary matrix** still required after deploy-with-flags-OFF, then a controlled staging of `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` on a QA supervisor only.
6. Phase 0 verify wrote one audit log row — harmless but note for sheet noise.

---

## Recommended sequence (discussion only — do not enable yet)

1. Commit SRS-014 WIP.  
2. Deploy Production with **zero** SRS-014 flags.  
3. Re-run live QA checklist (§2–§16 against Sheets) with isolated `QA-*` rider codes; cleanup.  
4. Triage SRS-013 Phase 3 WA-003 mismatch.  
5. Enable **first** flag candidate: `FEATURE_PAYOUT_CYCLES_ENABLED` (no money movement).  
6. Then `FEATURE_EQUIPMENT_LEDGER_ENABLED` → Returns → Auto deductions last.
