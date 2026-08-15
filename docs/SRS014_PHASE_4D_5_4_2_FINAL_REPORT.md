# PHASE 4D.5.4.2 — FINAL REPORT

**Equipment Pricing Source of Truth + Immutable Price Snapshot**  
**Date:** 2026-08-13  

---

## A. Files changed

- `lib/money.ts` — documented fixture constants; not runtime SoT
- `lib/equipmentLiability/constants.ts` — additive snapshot headers
- `lib/equipmentLiability/store.ts` — Admin pricing load + snapshot persist; no money.ts price authority; schedule from persisted original
- `lib/equipmentLiability/phaseCGates.ts` — `PRICING_UNAVAILABLE` / `PRICING_INVALID`
- `lib/equipmentLiability/swapRules.ts` — amounts from optional Admin snapshot; shirt unit param
- `lib/equipmentDeductions/autoRequest.ts` — schedule from persisted original
- `lib/equipmentDeductions/expectedSnapshot.ts` — schedule from persisted original
- `lib/equipmentDeductions/engine.ts` — schedule from persisted original
- `lib/salaryService.ts` — shares Admin sheet loader; salary-domain fallback to approved defaults only
- `app/api/admin/equipment-pricing/route.ts` — securityCheck column; validation; audit; SoT messaging
- `app/admin/equipment-pricing/page.tsx` — defaults 530/135/100 + security field
- Tests: `phaseC.test.ts`, `phaseD.test.ts`, `liability.test.ts`, `swapRules.test.ts`, `srs014SafetyGate.test.ts`

## B. Files added

- `lib/equipmentPricing/types.ts`
- `lib/equipmentPricing/approvedDefaults.ts`
- `lib/equipmentPricing/validate.ts`
- `lib/equipmentPricing/loadAdminPricing.ts`
- `lib/equipmentPricing/computeFromPricing.ts`
- `lib/equipmentPricing/index.ts`
- `lib/equipmentPricing/pricing.test.ts`
- `docs/SRS014_EQUIPMENT_PRICE_SOT_IMPLEMENTATION.md`
- `docs/SRS014_PHASE_4D_5_4_2_FINAL_REPORT.md`

## C. Price Source of Truth

**Runtime (NEW rider liabilities):**

```
أسعار_المعدات
  → requireAdminEquipmentPricingForLiability()
  → EquipmentPriceSnapshot
  → computeLiabilityFields / createLiability*
  → persisted amounts + snap* columns
```

Fail closed if Admin pricing missing/invalid.  
No silent `550` / `money.ts` substitution on create.

**Supervisor salary equipment cost:** same Admin sheet when available; may use approved defaults if Sheets unavailable (does not create rider debts).

## D. Price Snapshot

| Aspect | Detail |
|---|---|
| Where created | `createLiabilityFromDelivery` / `createShirtSwapLiabilityFromDelivery` |
| Fields | component milli amounts + `pricingSource`, `pricingCapturedAt`, `snapMotorcycleBagMilli`, `snapBicycleBagMilli`, `snapShirtUnitMilli` |
| Immutable | Admin price changes do not rewrite existing rows; `withImmutableOriginal` still protects original |
| Consumed | Expected / REQUEST / engine schedules use `originalLiabilityMilli` via `scheduleFromPersistedOriginalMilli`; Allocation / Financial Apply use obligation / `allocatedMilli` |

## E. Existing liabilities

- Persisted `originalLiabilityMilli` / `outstandingMilli` / component costs remain authoritative.
- Missing snapshot metadata → `LEGACY_NO_SNAPSHOT`.
- **No automatic rewrite / backfill / migration** of historical financial amounts.
- Read path does **not** fall back to live `money.ts` catalog prices for empty cells (zeros / persisted only).

## F. New liabilities

Load validated Admin EGP → milli snapshot → bag by type + 2×shirt + security if unpaid → persist snapshot metadata.

## G. Remaining price authorities (classified)

| Occurrence | Class |
|---|---|
| `money.ts` BAG/SHIRT/SECURITY constants | **A** fixture / **docs** of current 800/900 — not create-path authority |
| `APPROVED_ADMIN_EQUIPMENT_PRICING_EGP` | **D** Admin UI / salary-domain display defaults |
| `SHIRT_UNIT_COST_MILLI` in swapRules | **A** deprecated fixture constant; create uses Admin snapshot |
| Test fixtures 530/135/100 | **A** |
| Docs 800/900 | **B** |
| Persisted liability milli columns | **C** historical snapshot |
| Salary fallback to approved defaults | **F** salary-domain compatibility (not rider create) |

No unexplained runtime rider-create authority remains on `money.ts`.

## H. Tests

- Targeted pricing suite (`pricing.test.ts` + related): **PASS**
- Expanded SRS-014 suite this phase: **339 / 339 PASS**
- Failures: **0**

## I. Financial mutation

```
Wallet mutations: 0
Ledger mutations: 0
Production financial mutations: 0
First financial transaction: NOT EXECUTED
```

## J. Flags

```
FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF
FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = OFF
FEATURE_EQUIPMENT_LEDGER_ENABLED = OFF
FEATURE_EQUIPMENT_RETURNS_V2_ENABLED = OFF
```

## K. Deployment

```
DEPLOY: NOT PERFORMED
```

## L. Migration

```
PRODUCTION FINANCIAL MIGRATION: NOT PERFORMED
```

Legacy liabilities without snapshot metadata: compatibility read-only strategy only. Optional future data-quality phase if explicit snapshot backfill is desired (non-mutating of amounts).

---

## FINAL GATE

| Gate | Result |
|---|---|
| Price SoT unified? | **YES** (rider create → Admin sheet) |
| Immutable snapshot implemented? | **YES** |
| Existing liabilities protected from repricing? | **YES** |
| New liabilities use Admin pricing? | **YES** |
| Hidden competing runtime price authorities eliminated? | **YES** (create path) |
| Invalid pricing fails closed? | **YES** |
| Full suite passing? | **YES** (339/339) |
| Financial Apply enabled? | **NO** |
| Financial mutation executed? | **0** |
| First financial transaction executed? | **NO** |
| Deploy performed? | **NO** |

---

```
PHASE 4D.5.4.2 COMPLETE — PRICE SOT + IMMUTABLE SNAPSHOT ONLY

Financial Apply: OFF
Financial Mutations: 0
First Financial Transaction: NOT EXECUTED
Deploy: NOT PERFORMED
Production Migration: NOT PERFORMED

NO FINANCIAL ENABLEMENT
NO FIRST TRANSACTION
STOP
```
