# PHASE 4D.5.4.6 — PRODUCTION DATA READINESS + REAL RIDER MIRROR

**Date:** 2026-08-13  
**Mode:** STRICT READ-ONLY / NO FINANCIAL EXECUTION  
**Probe:** `scripts/srs014-phase-4d546-readiness-probe.ts` (Sheets read via `getSheetData(..., false)` only)  
**Did NOT:** save Admin pricing, create Liability, mutate Evidence/Allocation, enable flags, Financial Apply, deploy  

---

## Executive Summary

| Item | Result |
|---|---|
| Pricing SoT (code) | **PASS** — NEW liability loads Admin sheet fail-closed |
| Security = 100 in Admin sheet | **BLOCKED** — `securityCheck` column **missing** |
| Bag/Shirt prices in sheet | moto **530**, bike **530**, shirt **135** |
| Real Rider Mirror | **NOT_AVAILABLE** — `عهدة_المعدات` has **0** liability rows |
| Equipment deliveries | **126** rows exist (real activity) |
| LEDGER flag | **OFF** — explains deliveries without liability persistence |
| Closing config | **INCONSISTENT** (`isClosing=true` + `equipmentDeductionEnabled=true`) |
| Closing engine guard | **PASS** (`shouldSkip` true because `isClosing`) |
| Full suite | **344 / 344 PASS** |
| Financial Apply | **OFF** |
| Financial mutations | **0** |
| First transaction | **NOT_EXECUTED** |

**Even if other gates were PASS, this phase still forbids Financial Apply.**

`CTRL001` remains prep-only — **not** used as a production substitute.

---

## Baseline

```
FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF
FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = OFF
FEATURE_EQUIPMENT_LEDGER_ENABLED = OFF
FEATURE_EQUIPMENT_RETURNS_V2_ENABLED = OFF
FEATURE_PAYOUT_CYCLES_ENABLED = OFF
FEATURE_RECRUITMENT_V2_ENABLED = OFF

FINANCIAL_APPLY_FLAG = OFF
FINANCIAL_MUTATIONS = 0
```

Dirty working tree preserved (no reset/stash/clean).

---

## Admin Pricing Verification

Live `أسعار_المعدات`:

| Field | Header | Value |
|---|---|---|
| motorcycleBox | present | **530** |
| bicycleBox | present | **530** |
| tshirt | present | **135** |
| jacket | present | **0** |
| helmet | present | **0** |
| securityCheck | **absent** | **N/A** |

`hasSecurityColumn = false`  
Validated loader: `PRICING_MISSING / missing field securityCheck`

**Requirement (human Admin, not this phase):** open Admin UI → set Security = 100 → **Save** so column F materializes.  
**This phase did NOT perform that save.**

---

## Security Pricing Verification

```
SECURITY_PRICE_CONFIG = BLOCKED
```

Until `securityCheck` is persisted, **NEW** rider liability creation fails closed (correct).  
No silent default of 100 is applied for create.

---

## Pricing Source-of-Truth Audit

| Path | Authority |
|---|---|
| NEW liability create | `requireAdminEquipmentPricingForLiability()` → Admin sheet |
| `computeLiabilityFields` | requires `pricing` snapshot arg — not `money.ts` |
| Read legacy liability | persisted milli amounts (no `\|\| BAG_COST_MILLI`) |
| Expected / REQUEST / engine schedule | `scheduleFromPersistedOriginalMilli(original)` |
| Allocation / Financial Apply | obligation / `allocatedMilli` (flag OFF) |
| Salary path | Admin sheet when available; salary-domain defaults if unavailable |

Silent fallbacks to **550 / shirt 100** on **rider create**: **not found** (would fail closed instead).  
`money.ts` constants remain fixtures / arithmetic docs only.

---

## Price Snapshot Audit

Code model: on create, persist component milli + `pricingSource` / `pricingCapturedAt` / snap bag & shirt unit fields.  
Tests prove Admin price change after create does not alter computed historical snapshot amounts.

**Production:** liability sheet header still ends at `updatedBy` — **no rows written** under snapshot schema yet.  
No existing liability to reprice-check live.

---

## August Cycle Audit

Persisted `دورات_القبض`:

| # | Dates | isClosing | equipmentDeductionEnabled | payday | status |
|---|---|---|---|---|---|
| C1 | 2026-08-01 → 09 | false | true | 2026-08-09 | finalized |
| C2 | 2026-08-10 → 16 | false | true | 2026-08-16 | active |
| C3 | 2026-08-17 → 23 | false | true | 2026-08-23 | active |
| Closing | 2026-08-24 → 31 | **true** | **true** | 2026-08-31 | active |

Windows match business narrative. Payday Admin-populated.

---

## Closing Cycle Safety

```
CLOSING_CONFIG = INCONSISTENT
CLOSING_ENGINE_GUARD = PASS
```

| Layer | Observation |
|---|---|
| Sheet | `isClosing=true` AND `equipmentDeductionEnabled=true` |
| Engine | `shouldSkipEquipmentAutoDeductions` → **true** because `isClosing` |
| Risk | Ops confusion / future code path that checks only `equipmentDeductionEnabled` |
| This phase | **Did NOT repair** the sheet |

---

## Real Rider Selection

```
REAL_RIDER_MIRROR = NOT_AVAILABLE
REAL_RIDER = BLOCKED
```

**Why:** `عهدة_المعدات` = header only → **0** parsed liabilities / **0** open.

**Not used:** CTRL001 (prep fake).  
**Not created:** any liability / ledger / evidence row.

Deliveries prove real riders exist in ops (sample, names masked):

| riderCode | type | moto | bike | shirts | zone |
|---|---|---|---|---|---|
| 4225685 | تبديل | 1 | 0 | 0 | Alexandria |
| 2197583 | تبديل | 1 | 0 | 0 | Alexandria |
| 4624988 | تعيين | 0 | 1 | 2 | Alexandria |
| 2149487 | تعيين | (see probe JSON) | | | Alexandria |

These are **delivery candidates only** — without persisted liability they cannot complete Expected/Actual/Allocated mirror under the phase rules.

Likely dependency: `FEATURE_EQUIPMENT_LEDGER_ENABLED = OFF` → approve path may not persist Phase-C liability.  
**Enabling ledger / creating liability is OUT OF SCOPE and FORBIDDEN in this phase.**

---

## Real Rider Snapshot

**N/A — NOT_AVAILABLE**

No liability ID / original / outstanding / snapshot to report without fabricating data.

---

## Liability Verification

```
LIABILITY = BLOCKED / NOT_AVAILABLE
```

Cannot compute 800 vs 900 against a persisted liability.  
Did not assume PAID/NOT_PAID.

---

## Activation Cycle / First Eligible Deduction Cycle

**NOT VERIFIED** (no rider liability with activationDate).

Rules confirmed in code:
- activation cycle excluded
- first eligible = next non-closing equipment-enabled cycle with `startDate > activationDate`
- closing always skipped via `isClosing`

---

## Expected Calculation

```
CALCULATED_EXPECTED_ONLY = NOT_AVAILABLE
```

No REQUEST minted. No intent. No Sheets write.

---

## Actual Payroll

```
ACTUAL_PAYROLL = NOT_AVAILABLE
```

No Manager Excel Actual file attached/read for a selected rider.  
Missing Actual **≠** zero.

---

## Expected vs Actual vs Allocated

| Metric | Value |
|---|---|
| Expected | **NOT_AVAILABLE** |
| Actual | **NOT_AVAILABLE** |
| Allocated | **NOT_AVAILABLE** |
| MATCH | **NOT VERIFIED** |

In-memory only — nothing persisted.

---

## Manager Compare / Evidence / Allocation

| Item | State |
|---|---|
| Manager Compare foundation (code) | PASS |
| Evidence for selected rider | `EVIDENCE_STATE = NOT_CREATED / PRE-APPLY` |
| Allocation APPLIED records | none for selectable rider |
| Created by this phase | **none** |

---

## Authorization

Code chain remains: Admin auth → `deductions_reconcile` / `deductions_verify` → dual gate → persisted FILE_VALID + completeCycleConfirmed → ACTIVE evidence → identity → APPLIED → `allocatedMilli` → Financial Apply (flag OFF).

No records generated/altered.

---

## Swap Rules

Read-only code verify:

| Rule | Status |
|---|---|
| Bag swap FREE | PASS |
| Shirt swap = Admin shirt unit (currently 135 when pricing valid) | PASS (code) |
| Admin free shirt override | PASS (explicit flag) |
| Production create shirt charge today | **BLOCKED** until security pricing config valid |

---

## Returns / Waive

```
RETURNS_WAIVE = BLOCKED
```

Semantics still coarse (`waived` vs written-off vs return-settled) per prior audits.  
Not redesigned; not executed.

---

## Inventory / Delivery Consistency

Deliveries exist with plausible تعيين (bike + 2 shirts) and تبديل (bag) patterns.  
**Cannot** reconcile delivery qty vs liability qty — **no liability rows**.

```
DELIVERY_LIABILITY_CONSISTENCY = NOT VERIFIED / BLOCKED
```

---

## Tests

| Suite | Result |
|---|---|
| Pricing + liability + swap + cycles + expected + MC orch + auth + FA safety + controlled pack | **54 / 54 PASS** |
| Full expanded SRS-014 | **344 / 344 PASS** |

No tests modified in this phase.

---

## Findings

### Blockers (before Human Go / before meaningful real mirror)

| ID | Finding |
|---|---|
| B1 | `securityCheck` missing in Admin sheet → `SECURITY_PRICE_CONFIG = BLOCKED` |
| B2 | Zero liabilities in `عهدة_المعدات` → `REAL_RIDER_MIRROR = NOT_AVAILABLE` |
| B3 | LEDGER flag OFF — operational reason deliveries ≠ liabilities (do not auto-enable here) |
| B4 | Actual payroll not available for mirror comparison |

### High (config hygiene)

| ID | Finding |
|---|---|
| H1 | Closing `equipmentDeductionEnabled=true` while `isClosing=true` → `CLOSING_CONFIG = INCONSISTENT` (engine still skips) |

### Medium

| ID | Finding |
|---|---|
| M1 | Jacket/Helmet Admin prices = 0 |
| M2 | Liability header lacks snapshot columns (no rows under new schema yet) |

---

## Gate Table

| Gate | Status | Evidence | Blocking? |
|------|--------|----------|-----------|
| Pricing SoT | **PASS** | create path → Admin loader fail-closed | No (code) |
| Security Price | **BLOCKED** | missing `securityCheck` column | **YES** |
| Price Snapshot | **PASS** (code) / **NOT VERIFIED** (prod rows) | store + tests; 0 liability rows | Soft until first liability |
| Existing Liability Integrity | **NOT VERIFIED** | 0 rows | **YES** for mirror |
| August Cycles | **PASS** | 1–9 / 10–16 / 17–23 / 24–31 + payday | No |
| Closing Cycle Config | **BLOCKED** / INCONSISTENT | eqEnabled=true on closing | **YES** (ops clarity) |
| Closing Engine Guard | **PASS** | `isClosing` ⇒ skip | No |
| Real Rider | **BLOCKED** | NOT_AVAILABLE | **YES** |
| Equipment Delivery | **PASS** (existence) | 126 rows | No for existence |
| Liability | **BLOCKED** | 0 rows | **YES** |
| Activation Rule | **PASS** (code) / **NOT VERIFIED** (rider) | eligibility.ts | Soft |
| Expected Calculation | **NOT VERIFIED** | no liability | **YES** for mirror |
| Actual Payroll | **NOT_AVAILABLE** | no file | **YES** for full reconcile |
| Manager Compare | **PASS** (code) / **NOT VERIFIED** (rider) | foundation present | Soft |
| Evidence | **NOT_CREATED / PRE-APPLY** | none created | Soft |
| Allocation | **NOT VERIFIED** | none | Soft |
| Authorization | **PASS** | code chain | No |
| Swap Rules | **PASS** (code) | swapRules | No |
| Returns/Waive | **BLOCKED** | semantics open | Soft for non-return first line |
| Financial Isolation | **PASS** | flags OFF; mutations 0 | No |
| Full Suite | **PASS** | 344/344 | No |

---

## Final Executive Gates

| # | Question | Answer |
|---|---|---|
| A | Safe to deploy with Financial Apply OFF? | **YES** (flags OFF; money path unreachable) |
| B | Production data ready? | **BLOCKED** |
| C | Real Rider Mirror complete? | **NOT_AVAILABLE** |
| D | Calculation/reconciliation ready? | **NO** (real path blocked by data) |
| E | Financial Apply technically reachable? | **NO** (flag OFF) |
| F | First financial transaction approved? | **NO** |
| G | Scale approved? | **NO** |

---

## Absolute final state

```
READ-ONLY PHASE COMPLETE

REAL_RIDER_MIRROR = NOT_AVAILABLE
SECURITY_PRICE_CONFIG = BLOCKED
CLOSING_CONFIG = INCONSISTENT
CLOSING_ENGINE_GUARD = PASS

FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED

WAITING_FOR_EXPLICIT_HUMAN_GO
```

**PASS on tests / SoT code ≠ EXECUTE.**  
**Do not proceed to 4D.5.4.7 unless a separate explicit human message authorizes it — and only after B1/B2 (at minimum) are cleared by ops.**

---

## Recommended human ops (outside this agent phase)

1. Admin UI: save أسعار المعدات with **securityCheck = 100** (and keep 530/530/135).  
2. Decide intentionally whether to enable ledger/create-path for **one** delivery → liability (**still not Financial Apply**).  
3. Optionally set Closing `equipmentDeductionEnabled=false` for config clarity.  
4. Provide Actual payroll file for that rider’s eligible cycle.  
5. Re-run **4D.5.4.5 / 4D.5.4.6 mirror** until `REAL_RIDER_MIRROR = PASS`.  
6. Only then consider a separate **4D.5.4.7 HUMAN EXECUTE ONE LINE GO**.

---

```
PHASE 4D.5.4.6 COMPLETE — PRODUCTION DATA READINESS ONLY
STOP
```
