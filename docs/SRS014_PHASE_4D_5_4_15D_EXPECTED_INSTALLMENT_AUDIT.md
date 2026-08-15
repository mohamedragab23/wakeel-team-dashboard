# PHASE 4D.5.4.15D — READ-ONLY EXPECTED INSTALLMENT AUDIT (4802535)

**Date:** 2026-08-15  
**Mode:** READ-ONLY / TEST-ONLY  
**Subject:** Opening Liability `OPENING:4802535`

---

## Executive Output

```
PHASE = 4D.5.4.15D
MODE = READ_ONLY_EXPECTED_INSTALLMENT_AUDIT
4802535_CURRENT_OUTSTANDING = 500 EGP
NORMAL_INSTALLMENT = 300 EGP
CYCLE_1_EXPECTED = 300
CYCLE_1_REMAINING = 200
CYCLE_2_EXPECTED = 200
CYCLE_2_REMAINING = 0
CYCLE_3_EXPECTED = 0
OVER_DEDUCTION = 0
REQUEST_CREATED = 0
FINANCIAL_MUTATIONS = 0
PRODUCTION_MUTATIONS = 0
FINANCIAL_APPLY = OFF
AUTO_REQUEST = OFF
DEPLOY = NO
TEST_SUITE = 473/473 PASS
```

---

## Reloaded Opening (A:AZ)

| Field | Value |
|---|---|
| original | 900 EGP (90000) |
| settlementPaid | 400 EGP (40000) |
| amountDeducted | 0 |
| outstanding | 500 EGP (50000) |
| status | open |
| schedule from persisted original | [30000, 30000, 30000] |

Rule: `EXPECTED = MIN(normalInstallment, currentOutstanding)`  
`settlementPaidMilli` does **not** advance installment index.

---

## Ladder

| Cycle | Outstanding | Expected | Remaining |
|---|---|---|---|
| 1 | 500 | **300** | 200 |
| 2 | 200 | **200** | 0 |
| 3 | 0 | **0** | 0 |

Total theoretical deductions = **500** (= opening outstanding). No over-deduction.

Live Expected preview (cycle 1) = **300 EGP**. No REQUEST created.

---

## Cohort safety

| Rider | Opening rows |
|---|---|
| 4802535 | 1 |
| 877614 | 1 (settled) |
| 4811093 | 0 |

---

## STOP

Do not enable Auto REQUEST / Financial Apply. Do not run another pilot. Do not deploy.
