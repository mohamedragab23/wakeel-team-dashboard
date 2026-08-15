# PHASE 4D.5.4.12 — OPENING BALANCE / EQUIPMENT RECONCILIATION ARCHITECTURE AUDIT

**Date:** 2026-08-15  
**Mode:** READ-ONLY architecture audit (NO migration execution, NO Liability create, NO Financial Apply)  
**Correction:** Stop treating Recruitment Candidate as a prerequisite for **legacy first-run migration**.

---

## Executive Verdict

| Item | Result |
|---|---|
| Opening Balance / Equipment Reconciliation product | **DOES NOT EXIST YET** |
| Building blocks usable later | Liability ledger + snapshot fields + Expected/REQUEST pipeline |
| Legacy rider without Candidate (e.g. 4811093) | **Eligible for FLOW A design** — **not** a blocker for migration architecture |
| FLOW B (new delivery → liability) | Separate; Candidate + delivery gates remain for **new** assignments |
| FINANCIAL_APPLY | **OFF** |
| FINANCIAL_MUTATIONS | **0** |
| PRODUCTION_MUTATIONS | **0** |
| FIRST_TRANSACTION | **NOT_EXECUTED** |
| Migration implemented this phase | **NO** |
| Deploy | **NO** |

```
FLOW A = ONE-TIME MIGRATION (proposed; not built)
FLOW B = FUTURE AUTOMATED (partially built; Candidate-gated)
DO NOT MIX CREATION AUTHORITIES
```

---

## 1. Current Architecture

### Two business flows (normative going forward)

**FLOW A — One-time Production Migration (not implemented)**  
Existing live riders in `المناديب` → Equipment Manager reconciliation → Opening Outstanding → Opening Liability with immutable snapshot → later enters Expected/REQUEST (after validation Go).

**FLOW B — Future automated (partially implemented)**  
Delivery → Admin approve → Admin Price SoT → Price Snapshot → Liability → cycle → installments → Expected → Manager Compare → Evidence → Allocation → Financial Apply (OFF).

### What exists today (building blocks)

| Building block | Location | Role |
|---|---|---|
| Liability ledger | `عهدة_المعدات` / `lib/equipmentLiability/store.ts` | Debt SoT |
| Immutable original | `withImmutableOriginal`, `originalLiabilityMilli` | No reprice of original |
| Price snapshot fields | `pricingSource`, `pricingCapturedAt`, snap milli cols | FLOW B SoT freeze |
| Desk cash vs installments | `settlementPaidMilli` vs `amountDeductedMilli` | Different economic meanings |
| Balance equation | `lib/equipmentDeductions/reconcile.ts` | `original − deducted − settlement = outstanding` |
| Expected snapshot | `lib/equipmentDeductions/expectedSnapshot.ts` | From **persisted** liability |
| Auto REQUEST | `lib/equipmentDeductions/autoRequest.ts` | From open liabilities + outstanding |
| Allocation | `lib/equipmentDeductions/allocate.ts` | Pure waterfall (no liability mutate) |
| Desk UI | `/admin/equipment-liability` | Payments on **existing** liabilities only |
| Admin pricing | `/admin/equipment-pricing` | SoT for **new** FLOW B creates |
| Phase C gates | `lib/equipmentLiability/phaseCGates.ts` | Candidate required for FLOW B create |
| Payment reconcile | `paymentReconcile.ts` | Desk payment orphans — **not** opening migration |

### What does **not** exist

- Equipment Reconciliation / Opening Balance UI  
- `createOpeningLiability` / migration creation authority  
- `pricingSource = OPENING_MIGRATION` (or equivalent)  
- Stable migration idempotency key standard  
- Batch migration dry-run / approval workflow  

---

## 2. Gap Analysis (Answers A–K)

### A. Does Opening Balance / Equipment Reconciliation already exist?

**NO.** Adjacent concepts (desk payments, Manager Compare, balance equation) are **not** first-time equipment state migration.

### B. Where should one-time historical state live?

**Recommend:**

1. Authoritative opening row on **`عهدة_المعدات`** (same liability sheet Expected already reads).  
2. Optional evidence rows on **`مدفوعات_عهدة_المعدات`** only if historical desk cash is evidenced.  
3. **Do not** use Recruitment Candidate as required SoT for FLOW A.  
4. **Do not** use legacy salary sheet `المعدات` as rider opening SoT.  
5. **Do not** mint REQUEST first — REQUEST derives **from** open liabilities.

### C. Can existing riders without Recruitment Candidates participate safely?

**Today via FLOW B: NO** (`CANDIDATE_NOT_FOUND` / readiness `MISSING_CANDIDATE_LINK`).

**Under proposed FLOW A: YES** — migration path must **not** call `assertPhaseCCandidateReady`. Live rider in `المناديب` is the identity gate for FLOW A.

`LEGACY_RIDER_WITHOUT_RECRUITMENT_CANDIDATE` is **not** a First-Run migration blocker; it is only a FLOW B blocker.

### D. How should opening outstanding connect to Expected / REQUEST / Allocation?

Once an `open` liability exists with correct:

- `originalLiabilityMilli` (immutable)  
- `amountDeductedMilli` / `installmentsCompleted` (installment progress only)  
- `settlementPaidMilli` (historical cash collected — must **not** advance installment index)  
- `outstandingMilli = original − amountDeducted − settlementPaid`  

…then existing pipeline works:

```
listOpenIssues
  → buildExpectedDeductionSnapshot / computeAutoRequestDecision
  → REQUEST (الاستقطاعات)
  → allocateActualToObligations
  → Financial Apply (must stay OFF until separate Go)
```

Schedule must use `scheduleFromPersistedOriginalMilli(original)` — never live Admin prices.

### E. Prevent re-pricing when Admin prices change later?

Reuse immutability:

- Persist component milliemes + `originalLiabilityMilli` at migration  
- Set `pricingSource` to a **distinct** migration label (recommended: `OPENING_MIGRATION`) or at minimum write snap fields and never recompute from `أسعار_المعدات`  
- Downstream already prefers persisted original for Expected/REQUEST  

**Do not** call `requireAdminEquipmentPricingForLiability` to size opening outstanding from current catalog. Catalog may be shown as **reference only** on the reconciliation UI.

### F. Prevent duplicate liabilities from migration?

Today: `getByDeliveryRowRef` + `hasActiveEquipmentIssue` (assignment path).

**Gaps for migration:** no delivery; no standardized synthetic ref.

**Required:**

- Reject if open assignment liability already exists for rider  
- Stable idempotency key (e.g. `deliveryRowRef = OPENING:<riderCode>` or dedicated column)  
- Fail closed on second migration attempt without explicit supersede policy  

### G. Idempotency for already-migrated rider?

1. Lookup by synthetic `OPENING:<riderCode>` → return existing (`created: false`).  
2. Or `hasActiveEquipmentIssue(riderCode)` → block / return existing.  
3. Distinct audit action: `create_opening_liability` (not delivery create).  

### H. Security PAID / NOT_PAID?

| Layer | Representation |
|---|---|
| FLOW B Candidate | `securityInquiryPayment` PAID/NOT_PAID |
| Liability | `securityPaidUpfront: boolean` + `securityFeeMilli` |
| FLOW A | Manager **must explicitly declare** security status; UNKNOWN → **block save** (or allow only with forced NOT_PAID/PAID human choice — never silent infer) |

Desk `PAID/PARTIALLY_PAID` payment status is **cash progress**, not security inquiry.

### I. What UI does Equipment Manager need?

**Today:** Desk can collect cash on existing issues — cannot create opening rows.

**Needed (future phase):**

- Rider picker from `المناديب` (no Candidate required)  
- Equipment held (bag type, shirts, jacket, helmet)  
- Security PAID / NOT_PAID (explicit)  
- Confirmed historical paid (EGP)  
- Computed original / outstanding preview  
- Price snapshot review (reference Admin prices + frozen milliemes)  
- Confirm / dual approval  
- Already-migrated indicator  
- Evidence/reference field  

### J. Validation / approval gates required?

1. Rider exists in `المناديب`  
2. No conflicting open liability (idempotency)  
3. Equation: outstanding = original − deducted − settlement  
4. Non-negative milliemes; no over-credit  
5. Explicit equipment state + security  
6. Human confirmation + audit identity  
7. **Forbid** Phase C Candidate gates on FLOW A create  
8. **Forbid** live Admin reprice of opening totals  
9. Dry-run / Expected preview before Auto REQUEST for migrated cohort  

### K. What must remain disabled during migration?

| Control | During migration write / validation |
|---|---|
| `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` | **OFF** |
| Auto REQUEST cron | **OFF** until opening cohort validated |
| FLOW B delivery→liability for same economic event | Do not dual-create |
| Wallet / ledger | **0** |
| Fake Candidates / fuzzy auto-link | Forbidden |

Ledger flag may remain ON for desk **read** — that is not Financial Apply.

---

## 3. Proposed Migration Lifecycle (design only)

```
1. Load live riders (المناديب)
2. Equipment Manager opens Reconciliation for rider
3. Operator enters CURRENT REALITY (equipment + security + paid)
4. System previews Original / Paid / Outstanding using declared state
   (+ optional Admin catalog as reference labels only)
5. Operator confirms → dual gate / approval
6. System writes Opening Liability (immutable snapshot + OPENING idempotency key)
7. Audit log
8. Optional: Expected dry-run for next eligible cycle
9. Batch close when cohort complete
10. Separate Go: enable Auto REQUEST for migrated riders
11. Separate Go: Financial Apply (much later)
```

**Never:** invent paid amounts; invent security; require Recruitment Candidate for FLOW A.

---

## 4. Data Model Recommendation

Extend / use `EquipmentLiabilityIssue` with migration-specific metadata:

| Field | Purpose |
|---|---|
| `riderCode` | Canonical live identity |
| bag/shirt/security component milli | Declared economics |
| `originalLiabilityMilli` | Immutable |
| `amountDeductedMilli` | Installment progress (usually 0 at open unless true payroll history) |
| `settlementPaidMilli` | Confirmed historical cash/desk paid |
| `outstandingMilli` | Opening remaining |
| `securityPaidUpfront` | Explicit |
| `pricingSource` | `OPENING_MIGRATION` (new) |
| `pricingCapturedAt` | Migration timestamp |
| snap milli fields | Frozen unit prices used in declaration |
| `deliveryRowRef` | `OPENING:<riderCode>` (idempotency) |
| `createdBy` / audit | Operator identity |
| notes / evidence ref | Optional |

Optional companion sheet: migration batch registry (batchId, operator, counts) — not required for v1 if audit log suffices.

---

## 5. Idempotency Strategy

- Primary key: `OPENING:<riderCode>` as `deliveryRowRef` **or** dedicated `migrationKey`  
- Secondary: refuse second open assignment liability per rider  
- Retry returns existing row without mutating amounts  

---

## 6. Pricing Snapshot Strategy

- Admin catalog (530/530/135/0/0/100) = **reference UI defaults**, not silent authority to overwrite manager-declared outstanding  
- At save: freeze the milliemes the operator confirmed  
- Later Admin price edits must **not** change opening `originalLiabilityMilli` / schedule base  

Example (operator-declared):

```
Bag held, Shirt held, Security PAID
Operator confirms original components = 530 + 135 = 665
Already paid = 300
Outstanding = 365
```

System stores 665 / 300 / 365 — does **not** rewrite to “current catalog story” later.

---

## 7. Security Handling

- Explicit: PAID | NOT_PAID  
- UNKNOWN → **cannot complete migration save** (force human choice)  
- No inference from missing Candidate or empty field  

---

## 8. Duplicate-Prevention Strategy

| Check | Action |
|---|---|
| Existing `OPENING:<riderCode>` | Return existing |
| Existing open assignment liability | Block |
| Concurrent writers | Rider + migration-key locks (new; mirror Phase C lock pattern) |
| FLOW B delivery create later | Policy: if opening exists, delivery may be inventory-only or create **additional** liability only under explicit product rules (document in implementation phase — default fail-closed) |

---

## 9. UI/UX Requirements (Equipment Manager)

Screen: **Equipment Reconciliation / Opening Balance**

Per rider:

- Identity (code, name, zone, supervisor from `المناديب`)  
- Equipment held toggles / qty  
- Security PAID / NOT_PAID  
- Already paid (EGP)  
- Preview: Original / Paid / Outstanding  
- Reference Admin prices (read-only)  
- Confirm checkbox + save  
- Status: NOT_MIGRATED | MIGRATED | CONFLICT  

**Do not** show “must have Recruitment Candidate” on this screen.

---

## 10. Expected / REQUEST Integration

After opening rows exist and Auto REQUEST still OFF:

1. Run Expected dry-run for a target cycle  
2. Validate installment index / outstanding  
3. Human approve cohort  
4. Separate Go: Auto REQUEST ON  

Allocation / Evidence / Financial Apply remain later and gated.

---

## 11. Rollback / Reconciliation Strategy

- Prefer **compensating correction** (new audit + patch outstanding with approval) over silent delete  
- Soft-void opening row only with dual approval + reason (future)  
- Never rewrite historical snapshot prices  
- Desk payment reconcile remains for cash evidence only  

---

## 12. Financial Isolation Requirements

During all migration **implementation and first writes** (future phases):

```
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
WALLET = 0
LEDGER_NATIVE = 0
FIRST_TRANSACTION = NOT_EXECUTED
```

Migration create ≠ money movement.

---

## 13. Exact Implementation Phases (after human approval)

| Phase | Scope | Money? |
|---|---|---|
| **4D.5.4.13** | Data model + `createOpeningLiability` + idempotency + tests (still FA OFF) | No wallet |
| **4D.5.4.14** | Admin Reconciliation UI + dry-run preview | No |
| **4D.5.4.15** | Controlled pilot: 1–N riders write opening rows | No FA |
| **4D.5.4.16** | Expected dry-run validation for migrated cohort | No FA |
| **Later** | Auto REQUEST Go (separate) | REQUEST only |
| **Much later** | Financial Apply Go (separate explicit) | Money |

Do **not** skip to Financial Apply after migration UI ships.

---

## 14. Tests Required (for future implementation phases)

1. Opening create without Candidate → allowed (FLOW A)  
2. Opening create with duplicate OPENING key → idempotent  
3. Open liability already exists → blocked  
4. Security UNKNOWN → blocked  
5. Equation mismatch → blocked  
6. Snapshot immutable when Admin prices change  
7. Expected uses persisted original / outstanding  
8. settlementPaid does not advance installments  
9. FLOW B delivery create still requires Candidate  
10. FA remains OFF; zero wallet/ledger side effects in unit tests  
11. No auto-link / no fake Candidate in migration path  

---

## Special Test Case — Rider `4811093` (READ-ONLY diagnostic)

**Do not create or modify anything for this rider.**

### Live facts (prior probes)

| Field | Value |
|---|---|
| riderCode | 4811093 |
| Name | Khiyam Khaled Hassan Mohamed _WAKEEL |
| Zone | Alexandria |
| Supervisor | WA-016 |
| Join | 8/6/2026 |
| Status | نشط |
| Recruitment Candidate | **None** (legacy) |
| Equipment delivery | **None** |
| Liability | **None** |
| Phone on live row | Empty |

### What the Reconciliation screen WOULD require from Equipment Manager

(Empty form — **not** prefilled/saved by the system)

| Input | Required? | Notes |
|---|---|---|
| Confirm rider identity 4811093 | YES | From `المناديب` |
| Motorcycle bag held? | YES | Operator reality |
| Bicycle bag held? | YES | Mutually exclusive with moto typically |
| T-shirt qty held | YES | 0/1/2… |
| Jacket held | YES | |
| Helmet held | YES | |
| Security status | YES | PAID or NOT_PAID only |
| Amount already paid (EGP) | YES | Explicit; no invent |
| Evidence / note | Optional | |
| Confirm save | YES | Human approval |

**System would then preview** (only after operator inputs):

- Original (from declared items × frozen unit prices OR operator-confirmed total policy)  
- Paid  
- Outstanding = Original − Paid  

**Reference Admin catalog today (not auto-applied as debt):** 530 / 530 / 135 / 0 / 0 / 100.

Because no inputs were collected, **no values are asserted** for what 4811093 “owes.” That is intentional.

---

## Architecture Decision Summary

| Decision | Choice |
|---|---|
| First run for legacy riders | **FLOW A Opening Balance Migration** |
| Recruitment Candidate required for FLOW A? | **NO** |
| New equipment after migration | **FLOW B only** |
| Creation authorities | **Strictly separate** |
| Reprice opening from Admin UI later? | **NO** |
| Financial Apply during migration | **OFF** |

---

## Full Test Suite (this phase)

Run existing suite only (no new migration code).

| Metric | Value |
|---|---|
| Result | **PASS** |
| Total | **377** |
| Failed | **0** |
| Skipped | **0** |

---

## FINAL SAFETY CONTRACT

```
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
PRODUCTION_MUTATIONS = 0
FIRST_TRANSACTION = NOT_EXECUTED
MIGRATION_EXECUTED = NO
DEPLOY = NO
```

**STOP after this audit.**  
Next step requires separate human approval to implement FLOW A (not money).
