# PHASE 4D.5.4.15A — PRE-WRITE SAFETY AUDIT

**Date:** 2026-08-15  
**Mode:** READ-ONLY / TEST-ONLY  
**Continuing from:** `docs/SRS014_PHASE_4D_5_4_15_CONTROLLED_OPENING_BALANCE_PILOT.md`

---

## Executive Output

```
PHASE = 4D.5.4.15A
MODE = PRE_WRITE_SAFETY_AUDIT
FINANCIAL_APPLY = OFF
AUTO_REQUEST = OFF
WALLET_MUTATIONS = 0
FINANCIAL_LEDGER_MUTATIONS = 0
PRODUCTION_OPENING_LIABILITIES_CREATED = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
WRITE_FLAG_ENABLED = NO
ALLOWLIST_POPULATED = NO
TEST_SUITE = 455/455 PASS
```

---

## 1. Exact Production persistence call chain

```
UI  /admin/equipment-reconciliation
  POST action=persist + confirmPersist=true
    → app/api/admin/equipment-reconciliation/route.ts
      → assertAdminApiAccess(..., 'equipment_liability')
      → formToOpeningInput / buildOpeningPreview (validate)
      → runControlledOpeningPilotPersist
           → assertOpeningPilotPersistAllowed (write flag + allowlist)
           → acquirePhaseCLiabilityLocks(OPENING:<riderCode>)
           → createOpeningLiability(..., { persist: true })
                → assertOpeningPilotPersistAllowed (again)
                → buildOpeningLiabilityIssue
                → deps.persistIssue(issue)
                     → appendLiabilityIssue
                          → ensureEquipmentLiabilitySheet
                          → appendToSheet(عهدة_المعدات, issueToRow)
           → appendAuditLog(action=create_opening_liability)
           → verifyOpeningLiabilityReadOnly
           → expectedDryRunForOpeningIssue (READ-ONLY)
```

**Not in chain:** Financial Apply, Auto REQUEST, payroll, wallet, ledger money, Candidate create/link, rider master writes.

---

## 2. Exact fields persisted (sheet `عهدة_المعدات`)

Via `issueToRow` / `EQUIPMENT_LIABILITY_HEADERS`:

`equipmentIssueId`, `riderCode`, name/zone/supervisor snapshots, `issueDate`, `activationDate`, `bagType`, `bagCostMilli`, `shirtQty`, `shirtCostMilli`, `securityFeeMilli`, `securityPaidUpfront`, `originalLiabilityMilli`, `outstandingMilli`, `amountDeductedMilli`, `installmentsCompleted`, `status`, `deliveryRowRef` (`OPENING:<riderCode>`), jacket/helmet held, `createdAt`/`createdBy`/`updatedAt`/`updatedBy`, `settlementPaidMilli` (historical cash), `pricingSource=OPENING_MIGRATION`, `pricingCapturedAt`, `snapMotorcycleBagMilli`, `snapBicycleBagMilli`, `snapShirtUnitMilli`.

**Audit only (separate tab `سجل_العمليات`):** `create_opening_liability` with riderCode, migrationKey, amounts, snapshot, evidence/note.

---

## 3. Financial side-effect boundaries audited

| Boundary | Invoked by Opening path? |
|---|---|
| `runProductionFinancialApply` / `runFinancialApplyLine` | **NO** (no import) |
| `runEquipmentAutoRequestsForDate` | **NO** |
| Wallet mutation | **NO** |
| Financial ledger mutation | **NO** |
| Payroll deduction execution | **NO** |
| Payment allocation | **NO** |
| `createLiabilityFromDelivery` (FLOW B) | **NO** |
| Candidate lookup/link | **NO** |
| Rider master mutation | **NO** |

Allowed: **Opening liability row** + **audit event**.

---

## 4–13. Test results (mocked only)

| # | Check | Result |
|---|---|---|
| 4 | Isolation (spy counters) | **PASS** — liability=1, audit=1, FA/AR/wallet/ledger/payroll=0 |
| 5 | Idempotency | **PASS** — created true→false; no 2nd row; no 2nd audit |
| 6 | Conflict | **PASS** — `OPEN_LIABILITY_EXISTS`, writes=0 |
| 7 | Security UNKNOWN | **PASS** — `SECURITY_STATUS_REQUIRED` |
| 8 | Overpayment | **PASS** — `PAID_EXCEEDS_ORIGINAL` |
| 9 | Zero balance | **PASS** — settled, outstanding=0, not in open Expected |
| 10 | Expected dry-run | **PASS** — uses persisted original; `financialMutation=false` |
| 11 | Allowlist | **PASS** — empty / not listed / >3 / duplicate / malformed / 4811093 |
| 12 | Authorization | **PASS** — API `assertAdminApiAccess(equipment_liability)` |
| 13 | 4811093 | **PASS** — IDENTITY_READY=YES, RECONCILIATION_DATA_COMPLETE=NO, OPENING=NONE |

**Allowlist hardening (15A):** invalid config now **fail-closed** (`PILOT_ALLOWLIST_TOO_LARGE` / `DUPLICATE` / `MALFORMED`) instead of silent truncation.

---

## 14. Full test suite

**455 / 455 PASS** (failed 0, skipped 0)

---

## Confirmations

- Write flag **not** enabled  
- Allowlist **not** populated for Production riders  
- **0** Production Opening Liabilities created  
- **4811093** not modified  
- FA / Auto REQUEST remain **OFF**  
- **No deploy**

**STOP.** Do not proceed to real pilot write until human Go with explicit allowlist + reconciliation data.
