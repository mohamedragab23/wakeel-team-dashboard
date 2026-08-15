# PHASE 4D.5.4.15C — READ-ONLY POST-PILOT CONSISTENCY AUDIT

**Date:** 2026-08-15  
**Subject:** Opening pilot `877614` after A:AZ reader fix  
**Mode:** READ-ONLY / TEST-ONLY

---

## Executive Output

```
PHASE = 4D.5.4.15C
MODE = READ_ONLY_POST_PILOT_AUDIT
PILOT_RIDER = 877614
OPENING_KEY = OPENING:877614
EXACTLY_ONE_ROW = PASS
A_AZ_MAPPING = PASS
SETTLEMENT_RELOAD = PASS
SNAPSHOT_RELOAD = PASS
PRICING_SOURCE_RELOAD = PASS
EQUATION = PASS
EXPECTED_EXCLUSION = PASS
IDEMPOTENCY = PASS
UNINTENDED_WRITES_DURING_READER_FIX = 0
FINANCIAL_APPLY = OFF
AUTO_REQUEST = OFF
WALLET_MUTATIONS = 0
FINANCIAL_LEDGER_MUTATIONS = 0
877614_MODIFIED = NO
DEPLOY = NO
TEST_SUITE = 464/464 PASS
```

---

## 1. A:AZ read/write mapping

| Item | Finding |
|---|---|
| Header count | 32 |
| `settlementPaidMilli` index | **26** (col AA — beyond Z) |
| `pricingSource` index | **27** |
| Snapshot cols | 29–31 |
| Default `getSheetData` range | `A:Z` → **truncates** settlement/snapshot |
| `readAllIssues` (fixed) | `عهدة_المعدات!A:AZ` |
| Write path `issueToRow` | Full 32 cells including settlement + snapshot |

Live compare: narrow header len **26**, wide **32**. Raw row has all tail fields present.

---

## 2–5. Reload of 877614

| Field | Value | Pass |
|---|---|---|
| settlementPaidMilli | 80000 | ✓ |
| pricingSource | OPENING_MIGRATION | ✓ |
| snap moto/bike/shirt | 53000 / 53000 / 13500 | ✓ |
| original / settlement / outstanding | 80000 / 80000 / 0 | ✓ |
| amountDeductedMilli | 0 | ✓ |
| status | settled | ✓ |
| securityPaidUpfront | true | ✓ |
| equation | 0 = 80000 − 80000 − 0 | ✓ |

---

## 6–7. Expected + idempotency

- Settled Opening **excluded** from open Expected/REQUEST (`entersOpenExpected=false`).
- Second create attempt → `created=false`, `duplicateAttempt=true`, **no** persist/audit callbacks.

---

## 8. Reader-fix writes

A:AZ change is **read-path only** (`getSheetDataOrThrow` range override).  
This audit performed **0** appends/updates to 877614.

---

## 9–10. Row count + isolation

- Exactly **1** raw and **1** parsed `OPENING:877614` row.
- FA OFF · Auto REQUEST OFF · wallet/ledger/payroll mutations **0**.

---

## STOP

Do not migrate Pilot #2 until explicitly authorized.  
Do not enable Auto REQUEST / Financial Apply. Do not deploy.
