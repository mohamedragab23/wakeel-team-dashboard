# PHASE 4D.5.4.3 — READ-ONLY RE-REVIEW (Post Price SoT)

**Date:** 2026-08-13  
**Mode:** READ-ONLY  
**Code changes this phase:** **0**  
**Predecessor:** 4D.5.4.2 Price SoT + Immutable Snapshot  

---

## 1) Purpose

Independent re-review after 4D.5.4.2 to answer:

> Was Dual Price SoT **architecturally** closed, or only cosmetically (550→530)?

And: is the system still financially safe (no money path open)?

---

## 2) Executive verdict

| Question | Verdict |
|---|---|
| Is Admin `أسعار_المعدات` the runtime SoT for **NEW** rider liabilities? | **YES** |
| Does create path still use `money.ts` as price authority? | **NO** (`store.ts` has no `BAG_COST_MILLI`; loads Admin via `requireAdminEquipmentPricingForLiability`) |
| Is historical snapshot / no-reprice of old debts implemented? | **YES** (persisted amounts + snap metadata; schedules from `originalLiabilityMilli`) |
| Was this a cosmetic 550→530 only? | **NO** — architecture changed |
| Financial Apply enabled? | **NO** |
| Financial mutations in this review? | **0** |
| First transaction executed? | **NO** |
| Approved for first money? | **NO** (other blockers remain) |

**Overall:** 🟢 **Price Dual-SoT blocker for rider create path: CLOSED in code**  
**Money:** 🔴 **Still NOT approved for first transaction**

---

## 3) Evidence checklist (code)

### A) Create path authority

| Check | Evidence |
|---|---|
| Loader | `lib/equipmentPricing/loadAdminPricing.ts` → sheet `أسعار_المعدات` |
| Fail closed | `PRICING_UNAVAILABLE` / `PRICING_INVALID` in `phaseCGates` + create returns those codes |
| Compute | `computeLiabilityFields({ pricing: snapshot })` → `computeAssignmentLiabilityFields` |
| Persist snapshot | `pricingSource`, `pricingCapturedAt`, `snapMotorcycleBagMilli`, `snapBicycleBagMilli`, `snapShirtUnitMilli` |
| No money.ts create authority | `store.ts` imports pricing module; not `BAG_COST_MILLI` |

### B) Historical immutability

| Check | Evidence |
|---|---|
| Read path no live catalog fallback | `rowToEquipmentLiability` uses persisted cells only (no `\|\| BAG_COST_MILLI`) |
| Schedule | `scheduleFromPersistedOriginalMilli(originalLiabilityMilli)` in store / expected / autoRequest / engine |
| Legacy | Missing snapshot → `LEGACY_NO_SNAPSHOT`; amounts not rewritten |
| Regression | `pricing.test.ts` Test5/7: Admin 530→550 keeps created liability at 530 |

### C) Downstream (Expected → Actual → Allocate → Apply)

| Stage | Re-reads Admin catalog for existing liability? |
|---|---|
| Expected Snapshot | **No** — persisted original / outstanding |
| Auto REQUEST | **No** — schedule from persisted original |
| Allocation | **No** — obligation amounts / Actual |
| Financial Apply | **No** — `allocatedMilli` only (flag OFF) |

### D) money.ts role after 4D.5.4.2

| Role | Status |
|---|---|
| Millieme arithmetic / installment split | Legitimate |
| Fixture constants 530/270/100 for 800/900 docs+tests | Legitimate (not create SoT) |
| Runtime NEW liability price authority | **Removed** |

### E) Salary path

Shares Admin sheet when available; may use approved display defaults if Sheets unavailable (**salary domain only** — does not create rider liabilities). Acceptable separation per 4D.5.4.2 design.

---

## 4) Flags (verified this review)

```
FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF
FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = OFF
FEATURE_EQUIPMENT_LEDGER_ENABLED = OFF
FEATURE_EQUIPMENT_RETURNS_V2_ENABLED = OFF
FEATURE_PAYOUT_CYCLES_ENABLED = OFF
```

---

## 5) Tests (this review)

| Suite | Result |
|---|---|
| Pricing + phaseC + liability + swap + expected + financial safety (targeted) | **66 / 66 PASS** |
| Expanded SRS-014 suite | **339 / 339 PASS** (prior run confirmed; re-run completed exit 0) |

Financial mutations: **0**

---

## 6) Operational caveat (not a code failure)

Admin sheet must include **`securityCheck`** (column F).  
If the sheet was last saved under the old 5-column schema, **NEW liability creation will fail closed** until Admin opens أسعار المعدات and saves (530 / 530 / 135 / … / security 100).

This is **correct fail-closed behavior**, not a Dual-SoT regression.

---

## 7) Remaining blockers before first transaction

| # | Blocker | Status after this review |
|---|---|---|
| 1 | Dual Price SoT (rider create) | 🟢 **CLOSED in code** |
| 2 | Returns / Waive accounting semantics | 🔴 **Still open** |
| 3 | Controlled one-rider read-only test pack | 🔴 **Not built** |
| — | Human EXECUTE ONE LINE Go | 🔴 **Not granted** |
| — | Scale | 🔴 **NO** |

---

## 8) Gate table (authoritative)

| Gate | Status | Meaning |
|---|---|---|
| A — Deploy with Flags OFF | 🟢 **YES** | Money path cannot run |
| B — Read-only Production / Re-Review | 🟢 **YES** | This phase |
| C — Controlled-test Preparation | 🟢 **YES** *(prep allowed)* | Next bounded phase may build ONE-rider pack only |
| D — First Financial Transaction | 🔴 **NO** | Forbidden |
| E — Scale | 🔴 **NO** | Forbidden |

**C ≠ D.** Preparation ≠ execution.

---

## 9) What this phase did NOT do

- ❌ Code changes  
- ❌ Flag enablement  
- ❌ Financial Apply  
- ❌ Controlled test pack execution of money  
- ❌ Returns/Waive redesign  
- ❌ Deploy / migration  

---

## 10) Recommended next human-authorized phase

**4D.5.4.4 — Controlled Test Preparation Review** (read-only pack for ONE rider / ONE cycle):

- Snapshot Rider / Equipment / Liability / Cycle / Expected / Actual / Allocation keys  
- Prove Expected = Actual = Allocated **without** wallet/ledger  
- Still **no** Financial Apply  

Then only a **separate explicit** human message:

`EXECUTE ONE CONTROLLED PRODUCTION FINANCIAL TRANSACTION`

may open money — and only after Returns/Waive clarity if returns are in scope for that rider.

---

## FINAL REQUIRED STATEMENT

```
FINANCIAL APPLY ENABLED = NO
FINANCIAL MUTATIONS = 0
CODE CHANGES = 0
FIRST TRANSACTION = NOT EXECUTED
DEPLOY = NOT PERFORMED
MIGRATION = NOT PERFORMED
```

**4D.5.4.2 Price SoT: ACCEPTED as architectural closure (not cosmetic).**  
**First money: NOT AUTHORIZED.**

---

```
PHASE 4D.5.4.3 COMPLETE — READ-ONLY RE-REVIEW ONLY
STOP
```
