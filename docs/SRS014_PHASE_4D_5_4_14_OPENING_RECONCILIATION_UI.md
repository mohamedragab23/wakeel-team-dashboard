# PHASE 4D.5.4.14 — ADMIN EQUIPMENT RECONCILIATION UI (FLOW A)

**Date:** 2026-08-15  
**Mode:** UI + dry-run preview + validation + tests  
**Continuing from:** `docs/SRS014_PHASE_4D_5_4_13_OPENING_LIABILITY_DATA_MODEL.md`

---

## Executive Output

```
PHASE = 4D.5.4.14
MODE = UI + DRY_RUN_PREVIEW
FLOW_A = OPENING_BALANCE (one-time first-run)
FLOW_B = UNTOUCHED (future deliveries)
FINANCIAL_APPLY = OFF
PRODUCTION_WRITES = OFF
MIGRATION_EXECUTION = OFF
OPENING_LIABILITIES_CREATED = 0
PRODUCTION_MUTATIONS = 0
FIRST_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
```

---

## UI route

`/admin/equipment-reconciliation`  
Feature gate: `equipment_liability`  
API: `GET|POST /api/admin/equipment-reconciliation` (POST = preview only)

---

## Exact user workflow

1. Admin with `equipment_liability` opens **تسوية افتتاحية للمعدات**.
2. System lists live riders from `المناديب` with status  
   `NOT_MIGRATED | READY | MIGRATED | CONFLICT`.
3. Equipment Manager selects a rider (form starts **empty** — no invented values).
4. Manager enters: bag YES/NO, shirt/jacket/helmet qty, Security **PAID|NOT_PAID**, historical paid EGP, optional evidence/note, confirmation checkbox.
5. Clicks **معاينة** → server validates via `openingBalance` / `buildOpeningPreview` and returns Original / Paid / Outstanding.
6. If already `MIGRATED` or `CONFLICT`, form is locked; no second Opening.
7. Zero outstanding preview shows `CREATE_SETTLED_OPENING_RECORD` and `entersExpectedRequest = false`.
8. **No persist button in this phase** — Production Opening write remains disabled.

**4811093:** diagnostic panel shows `IDENTITY_READY=YES`, `RECONCILIATION_DATA_COMPLETE=NO`. No prefill. No save.

---

## Files

| File | Role |
|---|---|
| `lib/equipmentLiability/openingReconciliationUi.ts` | Pure list/status/preview helpers |
| `lib/equipmentLiability/openingReconciliationUi.test.ts` | UI/validation/preview/access tests |
| `app/api/admin/equipment-reconciliation/route.ts` | GET list + POST dry-run preview |
| `app/admin/equipment-reconciliation/page.tsx` | Admin screen |
| `lib/adminFeatureAccess.ts` | Nav link |
| `docs/SRS014_PHASE_4D_5_4_14_OPENING_RECONCILIATION_UI.md` | this doc |

Domain engine reused (not duplicated): `lib/equipmentLiability/openingBalance.ts`.

---

## Safety

- Does **not** call `createOpeningLiability` with persist
- Does **not** enable `FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED`
- Does **not** invent Candidate / Security / paid amounts
- Does **not** mix FLOW B delivery → liability path
- Rider **4811093** not modified

---

## Tests

| Suite | Result |
|---|---|
| Opening UI + domain focused | included below |
| Full SRS-014 + recruitment + opening | **419 / 419 PASS** (failed 0, skipped 0) |

Command:

```bash
npx --yes tsx --test lib/money.test.ts lib/payoutCycles/*.test.ts lib/equipmentDeductions/*.test.ts lib/equipmentLiability/*.test.ts lib/equipmentPricing/*.test.ts lib/equipmentInventory/*.test.ts lib/recruitment/*.test.ts lib/srs014SafetyGate.test.ts lib/srs014FinancialApplySafety.test.ts
```

---

## Confirmations

- **No Production data changed** (list/preview code only; no persist path invoked)
- **4811093 not modified** (diagnostic read-only; form never prefills; no save)
- **FINANCIAL_APPLY = OFF**
- **OPENING_LIABILITIES_CREATED = 0**
- **DEPLOY = NO**

---

## Remaining (NOT this phase)

1. Production Opening write flag + persist wiring  
2. Controlled pilot migration  
3. Expected dry-run for migrated cohort  
4. Auto REQUEST / Financial Apply

**STOP** after UI + dry-run preview.
