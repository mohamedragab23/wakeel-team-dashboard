# PHASE 4D.5.4.15B — SINGLE-RIDER CONTROLLED OPENING PILOT (877614)

**Date:** 2026-08-15  
**Status:** **COMPLETE — ONE Production Opening written**  
**Human GO:** rider `877614` only

---

## Executive Output

```
PHASE = 4D.5.4.15B
PILOT_RIDER_CODE = 877614
PRODUCTION_WRITE = SUCCESS
AUDIT_WRITE = SUCCESS
POST_WRITE_VERIFICATION = PASS
EXPECTED_DRY_RUN = PASS
DUPLICATE_CHECK = PASS
OPENING_ROWS_FOR_KEY = 1

FINANCIAL_APPLY = OFF
AUTO_REQUEST = OFF
WALLET_MUTATIONS = 0
FINANCIAL_LEDGER_MUTATIONS = 0
PAYROLL_MUTATIONS = 0
FINANCIAL_TRANSACTIONS = 0
FLOW_B_LIABILITIES_CREATED = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
TEST_SUITE = 460/460 PASS
```

---

## Reconciliation input (human)

| Field | Value |
|---|---|
| Motorcycle bag | YES |
| Bicycle bag | NO |
| T-shirt qty | 2 |
| Jacket | YES (qty 1; price 0) |
| Helmet | NO |
| Security | PAID |
| Historical **equipment** paid | **800 EGP** (Security 100 **excluded**) |

---

## Persisted economics

| Field | EGP | Milli |
|---|---|---|
| Original | 800 | **80000** |
| Equipment paid (`settlementPaidMilli`) | 800 | **80000** |
| Outstanding | 0 | 0 |
| amountDeductedMilli | — | **0** |
| status | settled | |
| securityPaidUpfront | true | |
| pricingSource | OPENING_MIGRATION | |
| deliveryRowRef | OPENING:877614 | |

Note: codebase uses `MILLIEMES_PER_EGP = 100` → 800 EGP = **80000** milli (not 800000).

Snapshot: moto 53000 / bike 53000 / shirt 13500; security catalog 10000 (not in original because PAID).

Live rider: Abanoub Milad Nasim _ WAKEEL / Alexandria / Elsayed Mohamed Wakeel.

Issue id: `opening_877614_1786803723785`

---

## Read-path fix (same phase)

Initial verify used `getSheetDataOrThrow(... A:Z)` which truncated columns after Z and falsely reported missing `settlementPaidMilli` / snapshot.  
**Raw sheet row was already correct.** Fixed `readAllIssues` → `A:AZ`. Re-verify **PASS**. No second Opening created.

---

## STOP

Do not migrate another rider. Do not enable Auto REQUEST / Financial Apply. Do not deploy.
