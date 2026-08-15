# PHASE 4D.5.4.16 — EQUIPMENT DEDUCTION REQUEST + ACTUAL RECONCILIATION COMPLETION

**Date:** 2026-08-15  
**Mode:** Implementation complete (non-financial operational workflow)  
**Deploy:** NO  
**Financial Apply:** OFF  
**New pilot:** NO  

---

## Executive Output

```
PHASE = 4D.5.4.16
MODE = COMPLETE_REQUEST_ACTUAL_WORKFLOW
REQUEST_NE_ACTUAL = TRUE
FINANCIAL_APPLY = OFF
WALLET = OFF
LEDGER_MONEY = OFF
PAYROLL_EXECUTION = OFF
PRODUCTION_ACTUALS_WRITTEN = 0
NEW_PILOT = NO
DEPLOY = NO
877614 = SETTLED_UNCHANGED (outstanding 0)
4802535 = OPEN_UNCHANGED (outstanding 500, amountDeducted 0)
4811093 = UNTOUCHED (no Opening)
SRS014_RELATED_TESTS = 491/491 PASS
LIB_EXCL_ROOSTER_STRATEGIC = 492/492 PASS
4D5416_UNIT_TESTS = 19/19 PASS
READ_ONLY_VERIFY = PASS
```

---

## Product workflow delivered

| Day | Step | System responsibility |
|---|---|---|
| Sunday | Expected → Auto Request → sheet/export | Prepare REQUEST only; **no** outstanding mutation |
| Ops | Upload to Talabat | Manual / external |
| Thursday | Record Actual Deducted | Reconcile REQUEST vs Actual |
| Thursday | Liability update | **Only Actual** advances `amountDeductedMilli` / outstanding |

**Core rule:** Requesting 300 EGP does **not** mean the rider paid 300 EGP.

---

## What was implemented

### Domain
- `lib/equipmentDeductions/actualPayrollReconcile.ts` — Actual reconcile with validation, over-actual block, idempotency by Talabat ref + deductionId, immutable REQUEST amount, settlementPaid untouched
- `lib/equipmentDeductions/actualReconcileStore.ts` — memory + Sheets store (`تسوية_خصم_معدات_فعلي`)
- `lib/equipmentDeductions/requestExportView.ts` — explicit Requested vs Actual export columns
- `lib/equipmentDeductions/weeklyEquipmentWorkflow.ts` — Sunday REQUEST + Thursday Actual helpers
- Auto Request audit action: `create_equipment_deduction_request`
- Actual audit action: `reconcile_equipment_actual_deduction`

### Existing reuse (no parallel money model)
- Auto Request (`autoRequest.ts`) + REQUEST ledger `الاستقطاعات`
- Liability `updateBalance` for payroll progress (`amountDeductedMilli`)
- Expected sizing via persisted Opening/Delivery schedule (`MIN(installment, outstanding)`)

### Admin surface
- API: `GET/POST /api/admin/equipment-actual-reconcile` (CSV export + Actual apply)
- UI: `/admin/equipment-actual-reconcile`
- Sheet ensure: `SHEET_EQUIPMENT_PAYROLL_ACTUAL`

### Tests
- `lib/equipmentDeductions/actualPayrollReconcile.test.ts` — cases A–E, duplicates, 877614/4802535/4811093 isolation, FA/wallet/ledger/payroll safety, export separation, immutability, partial Actual, pending Actual

---

## Balance formula preserved

```
Outstanding = Original − Historical Settlement − Actual Payroll Deductions
```

Not subtracted: Requested, Expected, Exported.

`settlementPaidMilli` remains historical cash/desk only.

---

## Production verify (read-only)

| Rider | Result |
|---|---|
| 877614 | Opening settled; outstanding 0; amountDeducted 0 |
| 4802535 | Opening open; original 900 / paid 400 / outstanding **500**; amountDeducted **0** |
| 4811093 | No Opening / no liability issues |

Script: `scripts/srs014-phase-4d5416-read-only-verify.ts`

---

## Explicit non-goals (held)

- Financial Apply remains OFF
- No wallet mutations
- No native financial ledger money posts from this path
- No Talabat payroll execution inside the system
- No invented Actuals; no second pilot; no auto deploy

---

## Operator next use

1. Sunday: run Auto Request (when flag enabled) → export `/admin/equipment-actual-reconcile` CSV → upload to Talabat manually  
2. Thursday: enter Actual Deducted + Talabat reference on the same admin page  
3. Outstanding updates only after confirmed Actual  

Auto Request flag may stay OFF until Ops is ready; the code path is complete and tested.

---

## Follow-on (same phase): Talabat Wallet Actual source

Confirmed mapping (see `docs/SRS014_PHASE_4D_5_4_16B_TALABAT_WALLET_ACTUAL_SOURCE.md`):

- REQUESTED = `3Pl Internal Deductions`
- ACTUAL = `Applaied Deduction on Wallet` → `actualWalletDeductionMilli`

Import API: `POST /api/admin/equipment-wallet-import`  
After Actuals: auto next-cycle Expected/REQUEST for OPEN liabilities; stop at outstanding 0.
