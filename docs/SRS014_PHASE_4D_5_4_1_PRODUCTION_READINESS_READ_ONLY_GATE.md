# SRS-014 — Phase 4D.5.4.1 Production Readiness Read-Only Gate

**Date:** 2026-08-13  
**Mode:** READ-ONLY (no flag enablement, no wallet/ledger mutations, no first transaction)  
**Suite sample (this gate):** core subset **48/48 PASS** (allocate / MC orchestration / hardening / expected snapshot / month proposal / swap / financial safety / money / eligibility)  
**Prior full suite (accepted baseline):** **247/247 PASS** with Financial Mutations = 0  

---

## Executive verdict

| Question | Answer |
|---|---|
| Is the calculation/reconcile path operationally integrated? | **YES** |
| Does Manager Compare → Evidence → Allocation use the new foundation? | **YES** |
| Are financial mutations possible with current flags? | **NO** (`FINANCIAL_APPLY` OFF) |
| Is dual price Source of Truth closed? | **NO — BLOCKER** |
| Are Returns/Waive accounting semantics production-clear? | **NO — BLOCKER** |
| Controlled one-rider preparation complete? | **NO — NOT STARTED** |
| Approved for first financial transaction? | **NO** |
| Approved for scale? | **NO** |

**Overall status:** 🟢 **Operationally Strong / Near Complete** for **read-only / reconcile**  
**Money status:** 🔴 **Not approved for first transaction**

---

## Gate table (authoritative for this phase)

| Gate | Status | Meaning |
|---|---|---|
| A — Deploy with Flags OFF | 🟢 **YES** | Safe: money path cannot run |
| B — Read-only Production Review | 🟢 **YES** | Final business-path review can be done |
| C — Controlled-test Preparation | 🟢 **YES** *(prep allowed)* | May prepare **one** rider snapshot pack; **not** execute |
| D — First Financial Transaction | 🔴 **NO** | Forbidden until dual-price + waive clarity + human EXECUTE ONE LINE |
| E — Scale | 🔴 **NO** | Far from multi-rider / production scale |

**C ≠ D.** Preparation readiness does **not** authorize money.

---

## 1) End-to-end business path (read-only verification)

Target chain reviewed against code + prior integration:

```
Recruitment / Activation
        ↓
Equipment issue + Liability (lib/money.ts constants today)
        ↓
Cycle proposal (monthProposal — Aug closing 24–31)
        ↓
Expected (cron REQUEST + expectedSnapshot)
        ↓
Actual Payroll File (Manager Excel)
        ↓
Manager Compare (SRS-014 path — default UI)
        ↓
Persisted Evidence (evidenceApplySheets)
        ↓
FILE_VALID + Cycle Confirmation
        ↓
Allocation (allocateAgainstActual → apply records)
        ↓
Expected vs Actual reconciliation
        ↓
Financial Intent (financialApplyProduction)
        ↓
[FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF]
        ↓
Wallet / Ledger   ← NOT REACHABLE
```

### Path verdict by stage

| Stage | Represents business reality? | Evidence | Gap |
|---|---|---|---|
| Recruitment → Activation | Partial / external | Rider fields + eligibility use activation | Ops still depend on sheet data quality |
| Equipment → Liability | **Yes for 800/900 meaning** | `money.ts` Bag 530 + Shirt 135×2 + Security 100 | **Prices not from Admin sheet** |
| Cycle | **Yes (Aug rule)** | Aug C1 1–9, C2 10–16, C3 17–23, Closing **24–31** | Other months use proposal/heuristic — watch Jul/Sep edge |
| Expected | **Yes (REQUEST semantics)** | Cron + `expectedSnapshot` + New Requested / Carried | Still REQUEST ≠ ACTUAL |
| Actual file | **Yes** | Manager Excel parse + match | Requires real FILE_VALID ops discipline |
| Manager Compare → Evidence | **Yes (integrated)** | `managerCompareOrchestration` + UI default SRS-014 | Legacy path still optional behind toggle |
| Allocation | **Yes** | `allocateAgainstActual` + economicKey / evidenceIdentityKey | Apply records ≠ wallet |
| Financial Intent | **Built, gated OFF** | Production entry + auth + lock + period/cycle guards | Must stay OFF |
| Wallet / Ledger | **Blocked** | Flag default false + hard refuse | Correct |

---

## 2) Flags (local / intended production posture)

| Flag | Required for this gate | Observed / intended |
|---|---|---|
| `FEATURE_SRS014_RECRUITMENT_V2_ENABLED` | OFF | OFF |
| `FEATURE_SRS014_PAYOUT_CYCLES_ENABLED` | OFF | OFF |
| `FEATURE_SRS014_LEDGER_ENABLED` | OFF | OFF |
| `FEATURE_SRS014_EQUIPMENT_AUTO_DEDUCTIONS_ENABLED` | OFF | OFF |
| `FEATURE_SRS014_EQUIPMENT_RETURNS_ENABLED` | OFF | OFF |
| `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` | **OFF** | **OFF** |

**Financial Mutations in this gate:** **0** (no apply, no `updateBalance`, no ledger append).

---

## 3) Money meaning 800 / 900 (confirmed, not a blocker)

| Concept | Formula | Milli / EGP |
|---|---|---|
| Bag | constant | 530 |
| 2 Shirts | 135 × 2 | 270 |
| Subtotal (security already paid) | 530 + 270 | **800** |
| + Security unpaid | 800 + 100 | **900** |
| Installments on 800 | 800/3 | 266.67 / 266.67 / 266.66 |
| Installments on 900 | 900/3 | 300 / 300 / 300 |

**Verdict:** No arithmetic conflict in 800/900 rule.  
**Separate issue:** those constants live in `lib/money.ts`, **not** Admin `أسعار_المعدات` (see Blocker #1).

---

## 4) August cycle rule (confirmed)

Proposal for August 2026:

| Cycle | Dates |
|---|---|
| Cycle 1 | 1–9 |
| Cycle 2 | 10–16 |
| Cycle 3 | 17–23 |
| Closing | **24–31** |

Business examples (eligibility):

- Activated in Cycle 1 → skip C1; deduct C2+C3; skip Closing  
- Activated in Cycle 3 → skip C3 + Closing; first deduct September Cycle 1  

**Verdict:** Matches stated business rule in code proposal. Critical for avoiding over/duplicate deduction.

---

## 5) Blockers before first money (must not skip)

### BLOCKER #1 — Dual Price Source of Truth 🔴

| Source | Bag | Shirt (unit) | Security | Notes |
|---|---|---|---|---|
| `lib/money.ts` (liability / expected / 800–900) | **530** | **135** (×2 → 270) | **100** | Used by SRS-014 liability math |
| Admin `أسعار_المعدات` defaults (`lib/salaryService.ts`) | **550** | n/a in same shape | **100** (+ Jacket 200, Trousers 150) | Admin catalog defaults **≠** money.ts today |

Even if ops manually set sheet to 530 tomorrow, **two writers/readers** remain:

```
Admin Equipment Pricing  ≠  money.ts constants
        ↓                        ↓
   (UI / salary tools)      (liability / expected / allocate intent)
```

**Required before first transaction:**

```
Admin Equipment Pricing
        ↓
Single Source of Truth
        ↓
Expected Calculation
        ↓
Allocation
        ↓
Financial Apply
```

**Not acceptable:** two equal numbers today that can diverge tomorrow (550 vs 530 already diverge).

**Gate impact:** Blocks **D (First Financial Transaction)**.

---

### BLOCKER #2 — Returns / Waive accounting semantics 🔴

Scenario under review:

- Remaining = 500  
- Supervisor: Paid = 200, Waived = 300  
- Need: Original − Actual Paid − Approved Waive = Remaining  
- If Waive = 500 → Remaining = 0  

**What code does today (`approveSettlement`):**

1. Apply `settlementPaidMilli` as cash reduction (does not advance installment index).  
2. If waive requested (`waivedMilli > 0` or waiver reason) → `markIssueWaived` → liability status **`waived`**.  
3. Settlement record status → **`approved`**.  
4. Modes: `payment` | `waiver` | `payment_and_waiver`.

**What is NOT clearly separated for ops/accounting:**

| Needed concept | Present? |
|---|---|
| Original / Paid / Waived / Remaining as first-class ops labels | Partial (milli fields exist; status model coarse) |
| `WAIVED` | Approx. as issue status `waived` |
| `WRITTEN_OFF` | **No distinct status** |
| `RETURN_SETTLED` | **No distinct status** (settlement `approved` ≠ liability settled) |
| Partial waive of exactly `waivedMilli` vs “waive all remaining” | **Risky:** waive path calls `markIssueWaived` (full remaining waive), not a precise milli-capped write-off ledger event |

**Gate impact:** Blocks treating Returns as production-safe for money-adjacent ops until semantics are named and proven with a fixture.  
Returns flag is correctly **OFF**; do not enable until this is closed.

---

### BLOCKER #3 — Controlled one-rider preparation not done 🔴 (prep gate)

Before any money:

1. Choose **exactly one** rider (not 10, not 100).  
2. Capture **pre-execution snapshot**:

**Rider:** riderCode, riderName, zone, supervisor, activationDate  
**Equipment:** Bag, 2 Shirts, Security  
**Liability:** Original, Paid, Remaining, Expected  
**Cycle:** Expected deduction, New Requested, Carried, Actual (from Manager Compare file)  
**Allocation:** allocatedMilli, economicKey, evidenceIdentityKey, deductionId  

3. Prove **read-only**:

```
Expected  =  Actual reconciliation  =  Allocated
```

per cycle rules — **without** `updateBalance` / ledger / flag ON.

4. Only then, in a **separate human message**, consider **EXECUTE ONE LINE**.

**Current state:** Preparation **allowed** (Gate C = YES) but **not executed** yet.  
**Gate impact:** Blocks D until snapshot pack exists and reconciles.

---

## 6) What is closed (safe gap closure — accepted)

| Item | Status |
|---|---|
| Manager Compare UI → Evidence → Allocation integration | ✅ Closed |
| REQUEST ≠ ACTUAL ≠ ALLOCATED semantics | ✅ Preserved |
| Financial Apply default OFF + refuse without flag | ✅ |
| Auth / lock / period / cycleId hardening on production entry | ✅ (prior 4D.5.4) |
| 800/900 arithmetic meaning documented | ✅ |
| August closing 24–31 proposal | ✅ |
| Swap rules (same-SKU / different-SKU) | ✅ (safe, non-money) |
| Expected snapshot + New Requested / Carried KPIs | ✅ |
| Zero financial mutations under current flags | ✅ |

---

## 7) Explicit non-goals of this gate (NOT done)

- ❌ Enable `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED`  
- ❌ `updateBalance` / wallet debit  
- ❌ Ledger append  
- ❌ First real deduction  
- ❌ Scale enablement  
- ❌ Treating “C = YES” or “247 PASS” as Go for money  
- ❌ Auto-merge Dual Price / Waive fixes in this gate (read-only)

---

## 8) Recommended next sequence (human-controlled)

1. **Close Dual Price SoT** (single reader for Bag/Shirt/Security used by liability + expected + allocate intent).  
2. **Name and fixture Returns/Waive** (`WAIVED` vs `WRITTEN_OFF` vs `RETURN_SETTLED`; paid/waive/remaining identity).  
3. **Controlled-Test Preparation** for **ONE** rider — snapshot pack + Expected=Actual=Allocated proof (still no money).  
4. **Separate message only:** human **EXECUTE ONE LINE** Go (if still desired after 1–3).  
5. Scale remains **NO** until after successful one-line + monitoring.

---

## 9) Final gate answers

```
A) Deploy with Flags OFF ............ YES
B) Read-only Production Review ...... YES
C) Controlled-test Preparation ...... YES (prep only; pack not yet built)
D) First Financial Transaction ...... NO
E) Scale ............................ NO
```

**Safe Gap Closure:** accepted.  
**Go for money:** **rejected / not requested / not granted**.

---

## PHASE 4D.5.4.1 PRODUCTION READINESS READ-ONLY GATE — COMPLETE

**STOP.** No financial apply. No flag enablement. Await human Gate Review on blockers #1–#3.
