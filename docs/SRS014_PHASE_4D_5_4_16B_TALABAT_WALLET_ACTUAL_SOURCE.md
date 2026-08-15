# PHASE 4D.5.4.16B — TALABAT WALLET ACTUAL SOURCE + AUTO NEXT CYCLE

**Date:** 2026-08-15  
**Financial Apply:** OFF  
**Deploy:** NO  

---

## Confirmed source mapping

| Role | Talabat column (exact) | Internal field |
|---|---|---|
| REQUESTED | `3Pl Internal Deductions` | `requestedFromFileMilli` |
| ACTUAL | `Applaied Deduction on Wallet` | `actualWalletDeductionMilli` |

Spelling **Applaied** is preserved from the source file.

**Only ACTUAL** updates `amountDeductedMilli` / `outstandingMilli`.

Never used as Actual: Net Salary, Net After Deduction, Salaries Compensation, Expected, Requested, or 3Pl Internal Deductions.

---

## Weekly workflow (finished)

1. Sunday: Expected = MIN(300, Outstanding) → REQUEST → export/upload  
2. Thursday/Friday: Upload Talabat wallet file  
3. Match **Rider ID** exactly (fail closed)  
4. Read 3Pl (requested) + Applaied (actual)  
5. Reconcile; apply Actual only  
6. Auto-prepare next Expected/REQUEST for OPEN liabilities  
7. Stop when Outstanding = 0  

---

## Deliverables

| File | Role |
|---|---|
| `lib/equipmentDeductions/talabatWalletSource.ts` | Column mapping + parse |
| `lib/equipmentDeductions/talabatWalletReconcile.ts` | Batch reconcile + next-cycle prep |
| `lib/equipmentDeductions/talabatWalletReconcile.test.ts` | Regression suite |
| `app/api/admin/equipment-wallet-import/route.ts` | Multipart Excel import API |
| `app/admin/equipment-actual-reconcile/page.tsx` | Upload UI + exception report |

---

## Safety

```
FINANCIAL_APPLY = OFF
WALLET_MUTATIONS_BY_US = 0
LEDGER_MONEY = OFF
PAYROLL_EXECUTION = OFF
```

Talabat wallet file = **external result**. We request, read, reconcile, record Actual, update liability, prepare next request — we do not execute wallet deductions.
