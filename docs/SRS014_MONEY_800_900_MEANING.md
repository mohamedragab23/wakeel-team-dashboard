# SRS-014 — Meaning of 800 / 900 (DO NOT SILENTLY CHANGE)

**Verified from `lib/money.ts` (source of liability math):**

| Constant | Milli | EGP |
|---|---|---|
| `BAG_COST_MILLI` | 53000 | **530** (motorcycle or bicycle bag) |
| `TWO_TSHIRTS_COST_MILLI` | 27000 | **270** (= 2 × 135) |
| `SECURITY_FEE_MILLI` | 10000 | **100** |
| `FULL_LIABILITY_MILLI` | 90000 | **900** = 530 + 270 + 100 |
| `LIABILITY_AFTER_SECURITY_PAID_MILLI` | 80000 | **800** = 530 + 270 (security already paid at recruitment) |

**Installment schedules** (`splitInstallmentsMilliemes`):

- **90000** → 30000 + 30000 + 30000 (= 300 + 300 + 300 EGP)
- **80000** → 26667 + 26667 + 26666 (= 266.67 + 266.67 + 266.66 EGP)

**Business meaning (locked):**

- Security fee itself is **100 EGP**, not 900.
- **900** = full collectible when security was **NOT** paid upfront (bag + 2 shirts + security).
- **800** = collectible when security **was** paid during recruitment (bag + 2 shirts only).

**Competing SoT (still open gap):** Admin sheet `أسعار_المعدات` (legacy salary defaults differ). Liability creation uses `money.ts`, not the admin pricing sheet.

**This operational completeness pass does NOT change these constants.**
