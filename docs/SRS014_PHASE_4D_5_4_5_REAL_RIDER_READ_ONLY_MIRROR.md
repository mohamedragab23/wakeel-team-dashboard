# PHASE 4D.5.4.5 — REAL RIDER READ-ONLY MIRROR & FINAL PRE-EXECUTION GATE

**Date:** 2026-08-13  
**Mode:** STRICT READ-ONLY  
**Code changes this phase:** probe script only (`scripts/srs014-phase-4d545-read-only-mirror.ts`) — **no production financial writes**  
**Sheets writes / wallet / ledger / Financial Apply:** **0**  

---

## 1) Executive Summary

| Item | Result |
|---|---|
| Independent architecture re-check (SoT / snapshot / apply boundary) | **PASS** (code) |
| **REAL_RIDER_MIRROR** | **NOT_AVAILABLE** |
| Reason | Sheet `عهدة_المعدات` has **header only** (1 row). **0** open liabilities. Cannot select a real rider with a real liability. |
| Deliveries present | **126** rows in `تسليم_المعدات` (equipment activity exists) |
| Admin pricing row | Bag moto **530**, bike **530**, shirt **135**, jacket **0**, helmet **0** — **`securityCheck` column MISSING** |
| Financial Apply | **OFF** |
| Financial mutations | **0** |
| First transaction | **NOT EXECUTED** |
| Recommendation | **DO NOT execute money.** Fix production data prerequisites (security column + at least one real liability snapshot) then re-run this mirror. |

**CTRL001 pack from 4D.5.4.4 remains a valid calculation rehearsal only — it is NOT a production rider mirror.**

---

## 2) Files / code reviewed

Docs:
- `docs/SRS014_PHASE_4D_5_4_2_FINAL_REPORT.md`
- `docs/SRS014_EQUIPMENT_PRICE_SOT_IMPLEMENTATION.md`
- `docs/SRS014_PHASE_4D_5_4_4_CONTROLLED_TEST_PREPARATION.md`
- prior gate / SoT audit docs

Code (inspection):
- `lib/equipmentPricing/*` (Admin SoT + fail-closed)
- `lib/equipmentLiability/store.ts` (snapshot persist; no `BAG_COST_MILLI` create authority)
- `lib/equipmentLiability/swapRules.ts` (bag free / shirt unit from pricing)
- `lib/equipmentDeductions/expectedSnapshot.ts`, `autoRequest.ts`, `allocate.ts`, `financialApply.ts`
- `lib/payoutCycles/eligibility.ts`, `monthProposal.ts`
- `lib/srs014Flags.ts`

Live read-only Sheets probe (cache off):
- `عهدة_المعدات`, `أسعار_المعدات`, `دورات_القبض`, `تسليم_المعدات`

---

## 3) Independent confirmation checklist (architecture)

| # | Rule | Verdict |
|---|---|---|
| 1 | Admin pricing SoT for NEW liabilities | **PASS** (code) |
| 2 | Price Snapshot immutable after create | **PASS** (code) |
| 3 | Existing liabilities not repriced | **PASS** (code) |
| 4 | Security fee represented | **PASS** (code) / **BLOCKED** (prod sheet missing `securityCheck`) |
| 5 | 800/900 semantics | **PASS** (code + fixtures) |
| 6 | Swap: bag free / shirt priced / admin free override | **PASS** (code; shirt from Admin snapshot at create) |
| 7 | Cycle calculation | **PASS** (proposal + sheet Aug windows) |
| 8 | Closing excluded from auto deductions | **PASS** via `isClosing` in eligibility helpers — see Finding H1 if sheet flag contradicts |
| 9 | Activation mid-cycle skip | **PASS** (code/tests) |
| 10 | Payday Admin-configured | **PASS** (sheet has payday dates) |
| 11–13 | Expected / Actual compare / Allocation non-mutating | **PASS** (code) |
| 14 | Financial Apply behind flag | **PASS** — flag **OFF** |
| 15 | Auth persisted-evidence based | **PASS** (prior hardening) |
| 16 | period/cycleId validation | **PASS** (prior hardening) |
| 17 | economic key `srs014:fa:{evidenceIdentityKey}:{deductionId}` | **PASS** (`financialApplyEconomicKey`) |

No architecture regression found that required a STOP-with-code-change.  
**Production data incompleteness** blocks the real-rider mirror objective.

---

## 4) Real Rider Snapshot

```
REAL_RIDER_MIRROR = NOT_AVAILABLE
```

| Field | Value |
|---|---|
| riderCode | **N/A** |
| riderName | **N/A** |
| activationDate | **N/A** |
| zone / supervisor | **N/A** |
| liability | **none in `عهدة_المعدات`** |
| delivery activity | **126** rows exist in `تسليم_المعدات` (not mapped to liability rows) |

**Did not invent / fabricate / create any rider or liability to compensate.**

---

## 5) Pricing verification (live Admin sheet)

| Field | Live value |
|---|---|
| motorcycleBox | **530** |
| bicycleBox | **530** |
| tshirt | **135** |
| jacket | **0** |
| helmet | **0** |
| securityCheck | **MISSING** (header has only 5 columns) |

Validated loader result: `PRICING_MISSING / missing field securityCheck`  
→ **NEW liability creation would FAIL CLOSED** until Admin saves Security column (expected fail-closed; good).  
Operator previously reported Security=100 in UI intent — **not persisted in sheet schema yet**.

---

## 6) Price Snapshot verification (real rider)

**NOT VERIFIED** — no liability rows to inspect.

Header of `عهدة_المعدات` currently ends at `updatedBy` (no `pricingSource` / snap columns in header). That is consistent with **no Phase-C liabilities written yet** (and ensure-header not run in this read-only phase).

---

## 7) Security fee verification (real rider)

**NOT VERIFIED** — no rider liability.  
Admin sheet also lacks `securityCheck`, so production cannot currently mint a validated SoT snapshot for new creates.

---

## 8) Cycle calculation (production sheet `دورات_القبض`)

| Cycle | Dates | isClosing | equipmentDeductionEnabled | payday |
|---|---|---|---|---|
| C1 | 2026-08-01 → 2026-08-09 | false | true | 2026-08-09 |
| C2 | 2026-08-10 → 2026-08-16 | false | true | 2026-08-16 |
| C3 | 2026-08-17 → 2026-08-23 | false | true | 2026-08-23 |
| Closing | 2026-08-24 → 2026-08-31 | **true** | **true** ⚠️ | 2026-08-31 |

Date windows match the Aug business narrative (1–9 / 10–16 / 17–23 / 24–31).  
Payday is populated (Admin-configured).

⚠️ Closing has `equipmentDeductionEnabled=true` while `isClosing=true`. Engine skip for closing relies on `isClosing` (and related helpers). This sheet flag inconsistency is a **High ops finding** — do not “fix” in this phase.

First eligible cycle for a real rider: **NOT VERIFIED** (no activationDate available).

---

## 9) Expected deduction (real rider)

**NOT VERIFIED** — no liability / no rider.

For reference only (4D.5.4.4 fake pack, not production):

| | CTRL001 pack |
|---|---|
| Expected | 26667 |
| Actual (simulated) | 26667 |
| Allocated | 26667 |
| MATCH | PASS |

---

## 10) Actual payroll comparison

**NOT VERIFIED**

No Manager Excel Actual file was provided/read for a real rider in this phase.  
Probe did **not** upload or modify any payroll artifact.

---

## 11) Manager Compare → Evidence → Allocation

**PRE-APPLY / NOT YET EXECUTED** for any real rider.

No evidenceIdentityKey / APPLIED allocate records were read for a selected rider (none selectable).  
Probe did **not** create evidence or apply rows.

Foundation code path remains: Manager Compare → Evidence → Allocation → (Financial Apply OFF).

---

## 12) Financial mutation boundary

```
FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF
FINANCIAL_MUTATIONS = 0
UPDATE_BALANCE_CALLS_FROM_THIS_PHASE = 0
LEDGER_WRITES_FROM_THIS_PHASE = 0
OBLIGATION_WRITES_FROM_THIS_PHASE = 0
INTENT_FINANCIAL_WRITES_FROM_THIS_PHASE = 0
FIRST_FINANCIAL_TRANSACTION = NOT EXECUTED
DEPLOY = NOT PERFORMED
MIGRATION = NOT PERFORMED
REVERSE = NOT PERFORMED
RE-APPLY = NOT PERFORMED
```

Sheets access: **read-only** `getSheetData(..., false)` (no ensure/append/update).  
Local JSON probe artifact only: `tmp-srs014-4d545-mirror.json` (workspace scratch; not production money state).

---

## 13) Edge cases observed (environment)

| Edge | Present? | Handling / note |
|---|---|---|
| activation during cycle | N/A | no rider |
| closing cycle | Yes (sheet) | `isClosing=true`; eq-enabled flag inconsistent |
| prior payment | N/A | |
| security paid/unpaid | N/A | Admin security column missing |
| swap / waiver / return | N/A | not inspected per-rider |
| legacy liability | N/A | zero liabilities |
| missing price snapshot | N/A | |
| missing cycle | No | 4 Aug cycles present |
| missing payroll Actual | Yes | blocks Expected=Actual=Allocated proof on real data |
| deliveries without liability | **Yes (126 vs 0)** | likely ledger/Phase-C create path never persisted liabilities in prod |

---

## 14) Test results

| Suite | Result |
|---|---|
| Pricing + controlled pack + swap + expected + monthProposal + financial safety | **34 / 34 PASS** |
| Full expanded SRS-014 suite | **344 / 344 PASS** |

---

## 15) Findings by severity

### Critical / Blocker (before any money)

| ID | Finding |
|---|---|
| C1 | **REAL_RIDER_MIRROR = NOT_AVAILABLE** — `عهدة_المعدات` empty of liability rows |
| C2 | Admin `أسعار_المعدات` missing **`securityCheck`** → NEW liability SoT load fails closed |

### High

| ID | Finding |
|---|---|
| H1 | Closing cycle row has `equipmentDeductionEnabled=true` despite `isClosing=true` |
| H2 | 126 equipment deliveries exist but 0 liabilities — production cannot mirror Expected path until a real liability exists |

### Medium

| ID | Finding |
|---|---|
| M1 | Jacket/Helmet Admin prices are **0** in sheet (may be intentional custody) |
| M2 | Liability sheet header lacks snapshot columns yet (no rows written under new schema) |

### Low

| ID | Finding |
|---|---|
| L1 | 4D.5.4.4 CTRL001 pack remains calculation-only; must not be treated as production proof |

---

## 16) Operational match table (real rider)

| Field | Expected | Actual | Match |
|------|----------|--------|-------|
| Rider | real production rider | **none selectable** | **BLOCKED** |
| Activation Date | from liability | **N/A** | **NOT VERIFIED** |
| Cycle | from activation | Aug sheet exists | **NOT VERIFIED** (no rider) |
| First Eligible Cycle | post-activation | **N/A** | **NOT VERIFIED** |
| Closing Exclusion | closing no auto deduct | closing flagged isClosing | **PARTIAL** (flag inconsistency H1) |
| Bag Price | Admin 530 | Admin 530 | **PASS** (catalog) |
| Shirt Price | Admin 135 | Admin 135 | **PASS** (catalog) |
| Security | Admin 100 | **MISSING column** | **FAIL** |
| Original Liability | persisted | **none** | **NOT VERIFIED** |
| Paid | persisted | **none** | **NOT VERIFIED** |
| Outstanding | persisted | **none** | **NOT VERIFIED** |
| Expected Deduction | engine | **N/A** | **NOT VERIFIED** |
| Actual Payroll Deduction | Manager file | **not read** | **NOT VERIFIED** |
| Allocated | allocate engine | **N/A** | **NOT VERIFIED** |
| Price Snapshot | persisted | **none** | **NOT VERIFIED** |

---

## 17) Gate table (separate — not a percentage)

| Gate | Result |
|---|---|
| A. Pricing Architecture | **PASS** (code) / prod security column **BLOCKED** |
| B. Real Rider Data Integrity | **BLOCKED** (`REAL_RIDER_MIRROR = NOT_AVAILABLE`) |
| C. Cycle Determination | **PASS** (Aug windows + payday present) / rider-specific **NOT VERIFIED** |
| D. Expected Calculation | **NOT VERIFIED** (no rider liability) |
| E. Actual Payroll Reconciliation | **NOT VERIFIED** |
| F. Manager Compare → Evidence → Allocation | **NOT VERIFIED** (pre-apply; no rider) |
| G. Authorization | **PASS** (code inspection) |
| H. Financial Mutation Isolation | **PASS** |
| I. Controlled-Test Preparation | **PASS** (4D.5.4.4 fake pack only) |
| J. First Financial Transaction | **BLOCKED** (must remain not executed) |
| K. Scale | **BLOCKED** |

---

## 18) Explicit no-money statement

```
READ-ONLY MIRROR COMPLETE (with NOT_AVAILABLE rider outcome)
REPORT WRITTEN
FINANCIAL APPLY OFF
FINANCIAL MUTATIONS 0
FIRST TRANSACTION NOT EXECUTED
WAITING FOR EXPLICIT HUMAN GO
```

**Preparation / mirror / PASS on architecture ≠ EXECUTE.**

---

## 19) Recommendation for next phase

1. **Ops data prep (human, not auto-migration by agent):**  
   - Save Admin pricing including **`securityCheck = 100`**.  
   - Ensure at least one real rider has a persisted liability in `عهدة_المعدات` (via normal approve/ledger path when intentionally enabled for create — **still not Financial Apply**).  
   - Optionally correct Closing `equipmentDeductionEnabled` to false for clarity.  
2. **Re-run 4D.5.4.5** on that one real rider until Expected / Actual / Allocated can be filled from live data.  
3. Only then consider a **separate** Human Go message for ONE LINE financial execution.

---

```
PHASE 4D.5.4.5 COMPLETE — REAL RIDER READ-ONLY MIRROR
REAL_RIDER_MIRROR = NOT_AVAILABLE
FINANCIAL APPLY: OFF
FINANCIAL MUTATIONS: 0
FIRST FINANCIAL TRANSACTION: NOT EXECUTED
STOP
```
