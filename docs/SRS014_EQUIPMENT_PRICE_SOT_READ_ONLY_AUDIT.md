# PHASE — EQUIPMENT PRICE SOURCE-OF-TRUTH READ-ONLY AUDIT

**Date:** 2026-08-13  
**Mode:** READ-ONLY  
**Code changes:** **0**  
**Deploy / migration / financial apply:** **NOT PERFORMED**  

---

## 1) EXECUTIVE VERDICT

| Question | Verdict |
|---|---|
| Is `أسعار_المعدات` the authoritative SoT for the **SRS-014 rider liability → expected → allocate → financial apply** path? | **NO** |
| What is the actual SoT for that path today? | **`lib/money.ts` hardcoded constants** (`BAG_COST_MILLI=53000`, `TWO_TSHIRTS_COST_MILLI=27000`, `SECURITY_FEE_MILLI=10000`) |
| What does `أسعار_المعدات` actually drive? | **Legacy supervisor salary equipment cost** via `salaryService.getEquipmentPricing()` (sheet `المعدات` × Admin prices) |
| Are the two sources “defaults vs runtime config” for the same lifecycle? | **NO — they are parallel competing authorities for different consumers** |
| Does liability persist a historical price snapshot? | **YES (partial)** — component + original/outstanding amounts are written to `عهدة_المعدات` / liability sheet at creation |
| If Admin changes `أسعار_المعدات` tomorrow, do old rider liabilities change? | **No** (SRS-014 never reads that sheet) |
| If someone changes `money.ts` constants tomorrow, can old rider installment **schedules** drift? | **YES — risk** (`rowToEquipmentLiability` / autoRequest recompute schedule from current `money.ts`; expectedSnapshot has a safer original-sum guard) |
| Operator report that Admin set Bag=530 / Shirt=135 / Security=100 | **Cannot verify live Sheets values from this repo** (no persisted pricing dump locally; no Sheets read executed). **Code defaults for Admin UI/API/salary still = 550 / 550 / tshirt 100 / jacket 200 / helmet 150. Security is not even a column on `أسعار_المعدات`.** |

**Bottom line for first money:**  
Even if the Admin UI currently shows 530/135, **SRS-014 does not consume Admin pricing**. Synchronizing numbers by hand does **not** close the architectural Dual SoT. Treating “Admin edited the sheet” as “SoT closed” would be incorrect.

**Severity of Dual SoT for first-run:** **Critical / High** (architecture), not merely Medium “numbers happen to match.”

---

## 2) PRICE SOURCE MAP

| Source | Location | Current code values | Consumers | Classification |
|---|---|---|---|---|
| `lib/money.ts` constants | `BAG_COST_MILLI`, `TWO_TSHIRTS_COST_MILLI`, `SECURITY_FEE_MILLI` | 530 / 270(=2×135) / 100 | Liability create, swap rules, expected schedule helpers, tests, QA gates | **A. AUTHORITATIVE** for SRS-014 rider path |
| `SHIRT_UNIT_COST_MILLI` | `lib/equipmentLiability/swapRules.ts` | 135 | Shirt swap charge | **G. DANGEROUS DUPLICATE** of shirt unit (hardcoded, not Admin) |
| Admin sheet `أسعار_المعدات` | Google Sheets via `/api/admin/equipment-pricing` + `salaryService.getEquipmentPricing` | **Runtime (ops-claimed 530/135)**; code fallback defaults **550 / 550 / tshirt 100** | Admin UI + **supervisor salary equipment deductions** | **A. AUTHORITATIVE** for **salary path only**; **G. DANGEROUS DUPLICATE** relative to intended rider SoT |
| Local `data/equipment-pricing.json` | optional local cache | (not present in repo) | Dev fallback for Admin/salary | **B. DEFAULT/FALLBACK** |
| Liability row fields | `bagCostMilli`, `shirtCostMilli`, `securityFeeMilli`, `originalLiabilityMilli`, `outstandingMilli` | Written at create from `money.ts` | Expected display; balance mutations later | **C. HISTORICAL SNAPSHOT** (amounts) |
| Installment schedule on read | `rowToEquipmentLiability` → `liabilityInstallmentSchedule(security)` | Derived from **current** `money.ts` + security flag | autoRequest sizing | **D. DERIVED** — **not** a stored historical schedule |
| Manager Compare / Actual | Excel Actual amounts | From payroll file | Allocation input | **D. DERIVED** from file (not equipment catalog price) |
| Allocation `allocatedMilli` | apply records | From waterfall vs Actual | Financial Apply | **C/D** persisted allocation amount — does not re-price bag/shirt |
| Financial Apply | uses `allocatedMilli` | — | Wallet (when flag ON) | Uses allocated amount, **not** Admin price recalculation |
| Jacket/Helmet Admin prices | `أسعار_المعدات` jacket/helmet | defaults 200/150 | Salary path only | **F. LEGACY** / custody in SRS-014 (not in rider liability total) |

---

## 3) COMPLETE PRICE FLOW (actual code)

```
Supervisor delivery approve
        ↓
resolveDeliveryEconomicIntent()  ← money.ts / SHIRT_UNIT_COST_MILLI
        ↓
createLiabilityFromDelivery()
        ↓
computeLiabilityFields()         ← money.ts ONLY (bag type ignored financially)
        ↓
Persist liability row:
  bagCostMilli, shirtCostMilli, securityFeeMilli,
  originalLiabilityMilli, outstandingMilli
        ↓
Expected / Auto REQUEST
  sizes from outstandingMilli + schedule
  schedule ≈ money.ts (via security flag)   ← see immutability gap
  expectedSnapshot: if original ≠ current schedule sum → split(original)
        ↓
Manager Compare Actual (Excel)   ← not catalog price
        ↓
Allocation                         ← actualTotal vs obligations; no re-price
        ↓
Financial Apply (FLAG OFF)         ← allocatedMilli only
```

**Parallel legacy flow (not SRS-014 rider wallet):**

```
أسعار_المعدات (Admin)
        ↓
salaryService.getEquipmentPricing()
        ↓
Counts from sheet المعدات × Admin unit prices
        ↓
Supervisor salary equipment cost
```

---

## 4) ALL HARDCODED PRICE LOCATIONS (code)

| Value | Where | Role |
|---|---|---|
| 53000 / 27000 / 10000 | `lib/money.ts` | SRS-014 liability authority |
| 13500 | `lib/equipmentLiability/swapRules.ts` `SHIRT_UNIT_COST_MILLI` | Shirt swap |
| 550 / 550 / 100 / 200 / 150 | `app/api/admin/equipment-pricing/route.ts` defaults | Admin API fallback |
| same | `app/admin/equipment-pricing/page.tsx` defaults | UI fallback before fetch |
| same | `lib/salaryService.ts` `getEquipmentPricing` defaults | Salary fallback |
| Tests / QA asserting 530/270/100 | `phaseC.test.ts`, `money.test.ts`, `srs014-prod-qa-gate.ts`, etc. | Freeze current money.ts |

**Not found in Admin pricing schema:** Security fee column. Security for riders comes from recruitment `PAID`/`NOT_PAID` + `SECURITY_FEE_MILLI` in `money.ts`.

---

## 5) AUTHORITATIVE VS FALLBACK CLASSIFICATION

| Claim | Evidence |
|---|---|
| “Admin is SoT; money.ts is only fallback” | **False for SRS-014.** `computeLiabilityFields` never calls `getEquipmentPricing` / `أسعار_المعدات`. Phase C test even asserts `money.ts` source does **not** mention `أسعار_المعدات`. |
| “money.ts is SoT; Admin is display-only” | **False.** Admin prices are live for **salary** deductions. |
| Correct classification | **Two authoritative domains that happen to talk about “equipment prices”:** (1) rider SRS-014 = `money.ts`; (2) supervisor salary = Admin sheet. |

---

## 6) HISTORICAL PRICE SNAPSHOT VERIFICATION

| Check | Result |
|---|---|
| Unit/component prices stored at create? | **YES** — `bagCostMilli`, `shirtCostMilli`, `securityFeeMilli` written via `issueToRow` |
| Original / outstanding stored? | **YES** — `originalLiabilityMilli`, `outstandingMilli` |
| Schedule stored durably? | **NO durable schedule column** — recomputed on read from security flag + current `money.ts` |
| Read fallback if cell empty/0? | **`Number(cell) \|\| BAG_COST_MILLI`** → can substitute **today’s** constant | 
| Expected uses historical original? | **Mostly YES** — if `originalLiabilityMilli !==` current schedule sum, uses `splitInstallmentsMilliemes(original)` |
| Auto REQUEST uses historical original schedule? | **Weaker** — uses `issue.installmentSchedule` which is recomputed from current `money.ts` |
| Admin price change affects old rider liability amounts? | **No** (unread) |
| `money.ts` change affects new creates? | **Yes** |
| `money.ts` change can affect old installment targeting? | **Yes (risk)** via schedule recompute |

**Snapshot grade:** **PARTIAL PASS** — good amount snapshot; incomplete schedule immutability.

---

## 7) PRICE CHANGE SCENARIO (logical, read-only)

### Day 1 — Bag catalog intent 530; Rider A issued

- Create path uses `money.ts` → original **900** (or **800** if security paid).  
- Persisted: bagCost=53000, shirts=27000, securityFee=10000, original/outstanding accordingly.

### Day 10 — Admin changes `أسعار_المعدات` Bag → 600

| Rider A (old) | Effect |
|---|---|
| Liability original/outstanding | **Unchanged** |
| Expected / Allocate / Apply amounts | Still driven by stored outstanding + schedule logic — **not** Admin 600 |
| Supervisor salary path | New salary calcs use **600** for counts in `المعدات` |

### Day 10 — Also change `money.ts` Bag → 600 (hypothetical code change)

| Rider A (old) | Effect |
|---|---|
| Stored original/outstanding | Unchanged on sheet |
| Component fields on read | Still 53000 if cells populated |
| Installment schedule on read | May become **new** 600-based schedule → **autoRequest sizing risk** |
| expectedSnapshot | Safer if original ≠ new schedule sum |

### New Rider B after money.ts = 600

- New liability uses new constants — **must not be confused with Rider A**. Today architecture supports different stored originals, but schedule recompute is the weak point.

---

## 8) SWAP PRICE VERIFICATION

| Rule | Code behavior | Price source |
|---|---|---|
| Bag → Bag swap FREE | `swap_bag_free_inventory_only`, bagCost=0 | N/A |
| Motorcycle vs Bicycle bag same price on assignment | `bagType` ignored in `computeLiabilityFields`; both get `BAG_COST_MILLI` | `money.ts` 530 |
| Shirt swap = 135 / shirt | `shirts * SHIRT_UNIT_COST_MILLI` | Hardcoded 13500 |
| Admin free shirt exception | `adminFreeShirtOverride` → inventory only, no liability | Explicit flag |
| Security re-charged on swap? | **No** (`securityFeeMilli: 0` on swap intents) | — |

Swap does **not** read `أسعار_المعدات`.

---

## 9) RETURN / WAIVE PRICE VERIFICATION

| Path | Uses catalog price? | Notes |
|---|---|---|
| Settlement payment | Reduces outstanding by paid milli | No re-price from Admin/`money.ts` |
| Waive | `markIssueWaived` → outstanding=0, status=`waived` | Does not rewrite historical bag/shirt/security component fields; zeros remaining |
| Return settle | Operates on existing liability balances | Remaining closed by payment and/or waive — **semantics still coarse** (separate blocker) |

Return/Waive do not re-read Admin pricing. Historical component columns remain unless separately overwritten.

---

## 10) EXPECTED → ACTUAL → ALLOCATION → FINANCIAL APPLY PRICE FLOW

| Stage | What amount is used? | Re-reads Admin price? | Re-reads money.ts price? |
|---|---|---|---|
| Expected snapshot | `outstandingMilli` + schedule (with original-sum guard) | No | Schedule helpers yes |
| Auto REQUEST | `outstandingMilli` + schedule from issue | No | Schedule yes |
| Manager Compare Actual | Excel Actual | No | No |
| Allocation | Actual total vs obligation remaining / REQUEST | No | No |
| Financial Apply | **`allocatedMilli`** on apply record | No | No (amount already decided) |

**Good news for first apply:** Financial Apply does **not** recalculate Bag/Shirt from catalog; it applies the persisted allocation.  
**Still blocked for architecture:** creation/expected authority ≠ Admin SoT that ops believe they control.

---

## 11) SECURITY / RECONCILIATION RISKS

| Risk | Severity | Detail |
|---|---|---|
| Ops believe Admin SoT; engine uses `money.ts` | **Critical** | Silent divergence if Admin sets 600 and code still creates 530 (or vice versa) |
| Admin defaults still 550/100 in code paths | **High** | Empty/missing sheet → salary uses 550/100 while rider path uses 530/135 |
| Security not in Admin sheet | **High** (product gap) | Cannot Admin-configure security via `أسعار_المعدات` today |
| Schedule recompute from `money.ts` on read | **High** | Historical installment targeting can drift if constants change |
| `\|\| BAG_COST_MILLI` fallback on empty cells | **Medium** | Corrupts snapshot display/intent if cells blank |
| Dual meaning of “equipment price” (salary vs rider) | **High** | Reconciliation across salary cost vs rider liability can disagree even when both “correct” for their domain |
| Shirt Admin unit vs 2-shirt liability package | **Medium** | Salary: `tshirt × unit`; SRS: fixed 2 shirts = 27000 |

---

## 12) REQUIRED FIXES (DO NOT IMPLEMENT IN THIS AUDIT)

Listed for the future **4D.5.4.2** hardening phase only:

1. Single pricing adapter: Admin `أسعار_المعدات` → service → liability create / swap shirt unit / security (or explicit security config).  
2. Persist immutable price snapshot + **installment schedule** (or always size from stored `originalLiabilityMilli` / remaining, never from live catalog).  
3. Remove competing hardcoded business prices from create/swap paths (keep pure milli math in `money.ts`).  
4. Align Admin schema with business (Security; shirt unit 135 defaults; bag 530 defaults) **without** migrating old liabilities.  
5. Fail-closed or explicit audited fallback if Admin prices unavailable — do not silently diverge across domains.  
6. Document salary-path vs rider-path if salary must remain separate.

---

## 13) SEVERITY SUMMARY

| Finding | Severity |
|---|---|
| SRS-014 create path ignores Admin pricing (competing SoT) | **Critical** |
| Admin-edited 530/135 does not bind rider engine | **Critical** (process risk) |
| Security absent from Admin pricing schema | **High** |
| Installment schedule not historically frozen | **High** |
| Salary defaults 550/100 still in code | **High** (salary / fallback) |
| Empty-cell fallback to live constants | **Medium** |
| Financial Apply uses allocatedMilli (no re-price) | **Low risk / positive** |

---

## 14) FIRST-RUN IMPACT

| Item | Impact |
|---|---|
| Can first financial apply use a wrong **recalculated** catalog price? | **Unlikely** — applies `allocatedMilli` |
| Can first-run Expected/REQUEST be sized from wrong authority vs what Admin thinks they set? | **Yes** — authority is `money.ts`, not Admin sheet |
| Is “Admin already set 530” enough to clear Blocker #1? | **NO** |
| Is blindly changing 550→530 in defaults enough? | **NO** — cosmetic; leaves two authorities |

**First transaction remains NOT approved** on pricing architecture grounds.

---

## 15) SCALE IMPACT

At scale, Admin price changes (or accidental sheet reverts to defaults) can:

- Change supervisor salary equipment costs immediately, while  
- Rider liabilities continue from `money.ts` / snapshots,  

producing **system-wide reconciliation confusion** without a single bug in allocation math.

---

## ANSWERS TO CRITICAL CHECKS (A–N)

| ID | Result |
|---|---|
| **A. CURRENT PRICE AUTHORITY** | Admin sheet is **not** read by production SRS-014 equipment calculation. Authority = `money.ts`. |
| **B. HISTORICAL SNAPSHOT** | Component + original/outstanding persisted at create. Schedule not durably snapshotted. |
| **C. OLD LIABILITY IMMUTABILITY** | Safe vs Admin sheet changes. **Not fully safe** vs `money.ts` constant changes (schedule). |
| **D. EXPECTED** | Uses liability outstanding + schedule; prefers split(original) when sums diverge. |
| **E. ACTUAL RECONCILIATION** | Compares payroll Actual — not today’s catalog. |
| **F. ALLOCATION** | Uses obligations / Actual — not catalog re-price. |
| **G. FINANCIAL APPLY** | Uses persisted `allocatedMilli`. |
| **H. SWAP** | Bag free; moto/bike same `BAG_COST_MILLI`; shirt 135 hardcoded; free override explicit. |
| **I. RETURN** | Uses existing liability balances; no Admin re-price. |
| **J. WAIVE** | Zeros outstanding; does not rewrite historical price components; status coarse. |
| **K. FALLBACK SAFETY** | Admin missing → salary defaults **550/100…**. SRS-014 does not fall back to Admin; it always uses `money.ts`. Silent dual domain = reconciliation hazard. **Fail-closed across domains not implemented.** |
| **L. DUAL SOURCE** | **(2) Dangerous competing Sources of Truth** (different consumers), not safely separated defaults-vs-runtime for one lifecycle. |
| **M. PRICE CHANGE SCENARIO** | Admin→600: old rider unchanged; new salary uses 600. money.ts→600: new riders 600; old schedule risk. |
| **N. CURRENT ADMIN VALUES** | **Limitation:** live Sheets values not readable in this audit. Repo defaults still 550/tshirt100. No `equipment-pricing.json` in tree. Operator claim (530/135/100) **unverified here**; Security not in sheet schema. |

---

## FINAL REQUIRED STATEMENT

```
FINANCIAL APPLY ENABLED = NO
FINANCIAL MUTATIONS = 0
CODE CHANGES = 0
FIRST TRANSACTION = NOT EXECUTED
```

**PHASE — EQUIPMENT PRICE SOURCE-OF-TRUTH READ-ONLY AUDIT — COMPLETE**

**STOP.**
