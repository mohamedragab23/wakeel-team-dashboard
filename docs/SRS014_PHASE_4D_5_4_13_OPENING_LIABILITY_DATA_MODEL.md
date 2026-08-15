# PHASE 4D.5.4.13 — OPENING LIABILITY DATA MODEL + CREATION AUTHORITY

**Date:** 2026-08-15  
**Mode:** NON-FINANCIAL implementation (domain + tests)  
**Continuing from:** `docs/SRS014_PHASE_4D_5_4_12_OPENING_BALANCE_RECONCILIATION_AUDIT.md`

---

## Executive Output

```
PHASE = 4D.5.4.13
MODE = NON_FINANCIAL IMPLEMENTATION
FLOW_A = OPENING_BALANCE
FLOW_B = FUTURE_AUTOMATED
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
PRODUCTION_MUTATIONS = 0
PRODUCTION_OPENING_LIABILITIES_CREATED = 0
FIRST_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
```

---

## FLOW A vs FLOW B

| | FLOW A — Opening Balance | FLOW B — New Equipment |
|---|---|---|
| When | One-time first run / migration | After migration, all new assignments |
| Identity | `المناديب.كود` | Candidate.riderCode + delivery |
| Candidate required? | **NO** | **YES** (Phase C) |
| Creation authority | `createOpeningLiability` / calculateOpeningLiability | `createLiabilityFromDelivery` |
| Pricing | Catalog reference frozen as `OPENING_MIGRATION` | Live Admin SoT → `ADMIN_EQUIPMENT_PRICES` |
| Idempotency | `OPENING:<riderCode>` | `deliveryRowRef` (delivery row) |

**FLOW A MUST NOT call:** `assertPhaseCCandidateReady`, `findCandidateByRiderCode`, fuzzy match, Candidate create/link.

---

## Why Candidate is NOT required for FLOW A

Legacy riders (e.g. **4811093**) already exist in `المناديب` via legacy assignment. First-run need is to record **current equipment reality + paid + outstanding**, not to invent a Recruitment history. Requiring Candidate would wrongly block Opening Reconciliation.

**4811093** remains a valid **diagnostic** example: `IDENTITY_READY = YES` (live rider), `RECONCILIATION_DATA_COMPLETE = NO` until Equipment Manager enters real data. **Must not be mutated** in this phase.

---

## Data model decision

Existing `EquipmentLiabilityIssue` + `عهدة_المعدات` columns are sufficient.

| Field | FLOW A usage |
|---|---|
| `pricingSource` | **`OPENING_MIGRATION`** (extended enum) |
| `deliveryRowRef` | **`OPENING:<riderCode>`** (migration key) |
| `originalLiabilityMilli` | Frozen original |
| `settlementPaidMilli` | Historical paid (cash/desk) |
| `amountDeductedMilli` | **0** at opening (not installment progress) |
| `outstandingMilli` | original − historicalPaid |
| snap* milli | Frozen catalog unit prices |
| `status` | `open` if outstanding > 0; `settled` if 0 |

No duplicate liability model introduced.

---

## Input contract — `OpeningReconciliationInput`

Required: riderCode, motorcycleBagHeld, bicycleBagHeld, tshirtQuantity, jacketQuantity, helmetQuantity, securityStatus (`PAID`|`NOT_PAID`), historicalPaidMilli, operatorConfirmation.

Rules enforced in `validateOpeningReconciliationInput` / `calculateOpeningLiability`.

---

## Pricing policy (exact)

- Admin catalog (530/530/135/0/0/100) is the **default reference** for component milliemes at opening **preview/create**.  
- Those unit prices are **frozen** onto the issue (`snap*` + component costs + `originalLiabilityMilli`).  
- Later Admin catalog edits **must not** recompute opening debt.  
- Expected/REQUEST use `scheduleFromPersistedOriginalMilli(originalLiabilityMilli)` / outstanding — never live Admin reload for opening rows.  
- Operator still must declare **equipment held** and **historical paid**; system does not invent ownership or paid amounts.

---

## Security handling

- Explicit `PAID` | `NOT_PAID` only.  
- UNKNOWN → fail closed (`SECURITY_STATUS_REQUIRED`).  
- PAID → security contribution 0; NOT_PAID → securityFeeMilli from frozen catalog (100 EGP currently).

---

## Zero-balance policy (exact)

```
CREATE_SETTLED_OPENING_RECORD
```

If `historicalPaidMilli === originalLiabilityMilli`:

- `outstandingMilli = 0`  
- `status = settled`  
- Still create/build the Opening record so `OPENING:<riderCode>` exists for idempotency + audit.  
- Settled rows do **not** enter open Expected/REQUEST.

---

## Idempotency + duplicate prevention (exact)

1. Migration key = `OPENING:<riderCode>` stored in `deliveryRowRef`.  
2. Second create with same key → return existing (`created: false`), **no mutation** of economics.  
3. If another **open** assignment liability exists for rider → `OPEN_LIABILITY_EXISTS` (no supersede in this phase).

---

## Production write safety

`createOpeningLiability(..., { persist: true })` requires:

`FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED=true` **and** a `persistIssue` dependency.

Otherwise → `PRODUCTION_WRITE_DISABLED` or default **DRY_RUN** (in-memory issue only).

This phase never enables that flag and never writes Production sheets.

---

## Downstream Expected / REQUEST

Compatible: any `open` liability with persisted `originalLiabilityMilli` / `outstandingMilli` is consumed by existing Expected/autoRequest helpers via `scheduleFromPersistedOriginalMilli`.  
`pricingSource = OPENING_MIGRATION` is accepted on read (`rowToEquipmentLiability`).

Regression tests prove Admin price changes do not alter persisted opening original/schedule.

---

## Files changed

| File | Change |
|---|---|
| `lib/equipmentLiability/openingBalance.ts` | **NEW** — validate, calculate, build, create (guarded), FLOW A readiness |
| `lib/equipmentLiability/openingBalance.test.ts` | **NEW** — cases 1–23 coverage |
| `lib/equipmentPricing/types.ts` | `OPENING_MIGRATION` on `EquipmentPricingSource` / snapshot source |
| `lib/equipmentPricing/validate.ts` | snapshot shape accepts OPENING_MIGRATION |
| `lib/equipmentLiability/store.ts` | parse `OPENING_MIGRATION`; shirtQty `0` preserved (empty→2 only) |
| `docs/SRS014_PHASE_4D_5_4_13_OPENING_LIABILITY_DATA_MODEL.md` | this doc |

---

## Tests

| Suite | Result |
|---|---|
| Opening + pricing focused | **38 / 38 PASS** |
| Full SRS-014 + recruitment | **398 / 398 PASS** (failed 0, skipped 0) |

---

## Financial isolation

```
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
PRODUCTION_MUTATIONS = 0
PRODUCTION_OPENING_LIABILITIES_CREATED = 0
FIRST_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
```

---

## Remaining blockers (next phases — not this one)

1. Admin Reconciliation UI  
2. Enable production write flag + persist wiring (separate Go)  
3. Controlled pilot opening writes  
4. Expected dry-run for migrated cohort  
5. Auto REQUEST / Financial Apply — separate Gos  

**STOP.** Do not proceed to UI / production migration / FA.
