# SRS-014 Amendment — Post-Payroll Deduction Reconciliation

**Status:** LOCKED (Final Approval Package — SRS write authorized).  
**Design base:** Business Design Spec v6 (LOCKED).  
**Companions:** `docs/SRS014_DESIGN_FREEZE.md`, `docs/SRS014_EQUIPMENT_RECRUITMENT_AUTOMATION_ARCHITECTURE.md`  
**Scope of this document:** Normative amendment for Auto Deduction REQUEST path + Manager Excel ACTUAL + allocation / liability / rollover / dashboard semantics.

**Implementation is NOT authorized by this document.** Feature flags remain OFF until a separate production enablement Go.

---

## 0. Amendment identity

| Item | Value |
|---|---|
| Amendment id | SRS-014-AMD-POST-PAYROLL-RECONCILE |
| Supersedes (partial) | Architecture §3 rule 8 (insufficient payout as pre-payroll Y); Architecture §6 Auto path that posts paid liability on cron; Design Freeze Phase E acceptance that assumes pre-payroll paid carry; Phase F posting only to payroll ledger without `الاستقطاعات` alignment |
| Does not supersede | Phase A–D shipped semantics; Liability Desk cash payment model; Returns V2; Inventory V2; Rooster |
| Historical freeze | Pre-amendment `استقطاعات_المعدات_التلقائية` rows with `status=posted` remain legacy/audit unless a **separate approved migration** proves wallet ACTUAL |

---

## 1. Final locked business rules

1. **REQUESTED ≠ ACTUAL ≠ ALLOCATED** — three distinct financial concepts.
2. Pre-payroll Auto Deduction creates **REQUEST** obligations only; they are **not** paid.
3. **ACTUAL** wallet deduction for a rider+cycle is known only from **FILE_VALID** Manager Excel evidence stored as `الاستقطاعات_الفعلية.خصم_المحفظة_شيت_المدير` (cycle-scoped).
4. `Salaries&Tips Applaied on Wallet` is **retrospective audit only** — never pre-payroll available payout (Y) for Auto Deduction.
5. Operational requested ledger is **`الاستقطاعات`** (auto-generated + supervisor uploads share this ledger).
6. Deduction **reason** comes only from `الاستقطاعات.سبب الاستقطاع` using the frozen vocabulary (see §3).
7. `3Pl Internal Deductions` is **audit/consistency only** — never reason classification, never silent mapping.
8. Priority order (LOCKED): `معدات` → `استعلام أمني` → `مديونية سابقة` → `سلفة` → `خصم تشغيل` → (future approved vocabulary only).
9. Within a reason: **FIFO** by obligation age; for `معدات`: all open equipment before any non-equipment; older installment **remaining** before newer installment; tie-break = `equipmentIssueId` ascending.
10. `paidAmount` increases **only** as a result of **allocation** from ACTUAL.
11. **Wallet-driven liability (scoped — not absolute “عهدة” wording):**
    - `amountDeductedMilli` increases **only** by Σ **ALLOCATED** amounts where سبب الاستقطاع = `معدات`.
    - Wallet-driven `outstandingMilli` decreases by the same wallet allocation Σ.
    - REQUEST never changes `amountDeductedMilli` / wallet-driven outstanding.
    - Surplus never changes `amountDeductedMilli` / wallet-driven outstanding.
    - Desk cash is **not** the wallet-allocation path (see rule 18).
12. **Rollover** = same obligation identity (`deductionId`; same equipmentIssueId / installmentNumber when applicable) — **not** a new request row for the same remainder. **Open remainder is queued, not re-requested.**
13. Manual unpaid stays OPEN; **new supervisor upload ≠ replace**; replace requires an **explicit** action.
14. Manager file states: **FILE_INVALID / FILE_PARTIAL / FILE_VALID**; FILE_VALID requires technical validation **and** explicit complete-cycle confirmation for that cycle.
15. Missing rider on a non-FILE_VALID file does **not** imply Actual = 0.
16. Surplus ACTUAL (after all open remaining filled) is **audit-only** — never creates a new deduction.
17. Same reconcile batch (`reconcileBatchId`) applies allocation to a `deductionId` **at most once**.
18. **Desk cash vs wallet path (locked distinction):**
    - `settlementPaidMilli` / `مدفوعات_عهدة_المعدات` = desk cash collection (Phase C model).
    - Desk cash **MAY** reduce authoritative `outstandingMilli` per existing Phase C desk-cash rules.
    - Desk cash **MUST NOT**: increase `amountDeductedMilli`; count as ACTUAL; count as ALLOCATED; create an allocation audit; reduce liability through the **wallet-allocation** path.
19. Historical auto `posted` rows are **frozen legacy/audit** — not reinterpreted as ACTUAL automatically.
20. **Evidence apply-once:** keyed by `evidenceIdentityKey` (see §7a). A new `reconcileBatchId` alone must **not** create a second financial effect for the same evidence.
21. **Cron vs rollover:** Cron may create a new REQUEST only for a genuinely new eligible obligation/installment. Cron must **not** mint a new `deductionId` for an already-open remainder (see §6).
22. **REQUEST vs `ledger_native` (v1):** no `ledger_native` on REQUEST; `ledger_native` is not collection truth for this flow; collection truth = paidAmount/remainingAmount after ALLOCATED + amountDeductedMilli for معدات (see §9a).
23. **`installmentsCompleted` (Phase 3.4 H-1):** not a REQUEST transition; see §5a.

---

## 2. Final invariants

1. REQUEST ≠ ACTUAL ≠ ALLOCATED.
2. `paidAmount` changes only from allocation.
3. REQUEST never increases `paidAmount` and never changes `amountDeductedMilli` / wallet-driven outstanding.
4. Rollover never creates a second obligation for the same remainder. **Open remainder is queued, not re-requested.**
5. `originalAmount` is **immutable** on rollover.
6. **Carried Open Remaining** is never counted again as **New Requested This Cycle**.
7. Old and new loans (and distinct obligations) remain separate `deductionId`s.
8. Equipment First; older equipment remaining before newer installment; deterministic tie-break.
9. **Wallet-path liability Δ:** `amountDeductedMilli` += Σ ALLOCATED to `معدات` only; wallet-driven `outstandingMilli` decreases by that same Σ. Desk cash may still change `outstandingMilli` via `settlementPaidMilli` under Phase C and must never touch `amountDeductedMilli`.
10. Allocated Total for a rider+cycle ≤ Actual Total for that rider+cycle.
11. Surplus never creates a deduction.
12. Same `(evidenceIdentityKey, deductionId)` applied ≤ once (batch id may be audited but is not the apply-once key).
13. Same **`evidenceIdentityKey`** ⇒ at most one **net** financial application (new batch id alone ≠ new allocation).
14. FILE_VALID is **cycle-scoped** (FILE_VALID(C1) ⇏ FILE_VALID(C2)).
15. Missing rider → Actual 0 **only if** file is FILE_VALID for that cycle with complete-cycle confirmation.
16. New supervisor upload ≠ automatic replace.
17. Historical `posted` ≠ ACTUAL without separate approved migration.
18. Cron does not create a new `deductionId` for an open carried remainder.
19. `ledger_native` is not written on REQUEST and is not collection truth in v1; never marks a deduction paid merely because a REQUEST exists.
20. No wallet liability mutation without a durable allocation apply record; recovery is idempotent and never double-cuts.
21. Evidence supersession uses Full Reverse + Re-Apply only; delta-only waterfall correction is forbidden.
22. **`installmentsCompleted` (H-1):** advances only when the corresponding معدات installment obligation reaches `remainingAmount = 0` via ALLOCATED wallet apply; never on REQUEST, rollover, partial allocation, or desk cash. Full Reverse reverses completion only when caused by the reversed apply; never negative; auditable.

---

## 3. Frozen reason vocabulary

Canonical values only:

| Order | Reason |
|---|---|
| 1 | معدات |
| 2 | استعلام أمني |
| 3 | مديونية سابقة |
| 4 | سلفة |
| 5 | خصم تشغيل |

Any future reason must be **explicitly** added to approved vocabulary/configuration.  
Never infer a reason from `3Pl Internal Deductions`.  
Never silently map an unknown reason to “other”.

---

## 4. Final state model

**Terminology lock (do not conflate):**

| Term | Domain | Meaning |
|---|---|---|
| `FILE_INVALID` | Manager Excel validation | Technical validation failed |
| `FILE_PARTIAL` | Manager Excel validation | Readable but not complete-confirmed / uncertain completeness |
| `FILE_VALID(Cx)` | Manager Excel validation | Technical OK + explicit «ملف الدورة كامل» for cycle Cx |
| `PARTIALLY_ALLOCATED` | Obligation allocation outcome | Some but not all of `remainingAmount` allocated this apply |
| `PAID` / `UNPAID` | Obligation allocation outcome | Fully allocated remaining=0 / allocated this cycle=0 with remaining>0 |

Never use unqualified **PARTIAL** alone for both file state and allocation state.

```text
REQUESTED
  → ACTUAL_KNOWN     (FILE_VALID Manager evidence for this rider + cycle + reconcileBatchId)
  → ALLOCATED
       ├── PAID                 (remainingAmount = 0) → CLOSED
       ├── PARTIALLY_ALLOCATED  (remainingAmount > 0) → OPEN (may be queued / carried)
       └── UNPAID               (allocated this cycle = 0, remaining > 0) → OPEN (queued / carried)

Manager file validation (per upload/batch, cycle-scoped):
  FILE_INVALID | FILE_PARTIAL | FILE_VALID(cycleId, reconcileBatchId)

Rider missing on non-FILE_VALID file:
  ACTUAL_UNCONFIRMED  (do NOT treat as Actual = 0)
```

OPEN / queued / carried = **same** `deductionId` continuation — not a new financial request.

---

## 5. Final allocation algorithm

Preconditions:

- Manager file for cycle **Cx** is **FILE_VALID(Cx)** (technical validation + explicit «ملف الدورة كامل» confirmation by authorized deductions verification/reconcile role).
- `FILE_INVALID` / `FILE_PARTIAL` ⇒ **no** cycle-final reconciliation / no allocation.
- ACTUAL for rider = `خصم_المحفظة_شيت_المدير` for that rider+cycle+batch (only meaningful for cycle-final use under FILE_VALID).

```
actualRemaining = Actual Total for rider in this FILE_VALID batch

1) Select open obligations with reason معدات for this rider.
   Order (deterministic):
     primary  = oldest eligible equipment obligation / installment age
     secondary = equipmentIssueId ascending
   For each line:
     allocate = min(remainingAmount, actualRemaining)
     paidAmount += allocate
     remainingAmount -= allocate
     actualRemaining -= allocate
     record allocation audit (reconcileBatchId, deductionId) once

2) For each remaining reason in locked order:
     استعلام أمني → مديونية سابقة → سلفة → خصم تشغيل
   Within reason: FIFO by obligation age (stable secondary key = deductionId ascending).
   Allocate similarly.

3) If actualRemaining > 0 after all open remaining filled:
     Surplus = actualRemaining  (audit-only; MUST NOT create a new deduction/request)

4) Persist allocation results via durable apply records keyed by `(evidenceIdentityKey, deductionId)`, subject to §7a (apply-record-first; batch id audit-only).
   Reprocessing / recovery ⇒ zero additional allocation and zero additional wallet liability effect.

5) Wallet-path liability algorithm (معدات ALLOCATED only):
     amountDeductedMilli += Σ allocated to معدات
     outstandingMilli    -= Σ allocated to معدات
     For each equipment obligation closed by this apply (remainingAmount becomes 0):
       installmentsCompleted MAY advance by 1 for that issue, attributable to this apply record
     Partial allocation (remainingAmount > 0 after apply) MUST NOT advance installmentsCompleted
     Desk cash remains governed by settlementPaidMilli and existing Phase C desk-cash model
     (never for non-معدات; never for surplus; never for REQUEST;
      desk cash does not use this wallet-allocation path — see rule 18 / §8.6)
```

Same inputs ⇒ same allocation result. No random order. No unstable sheet row order.

---

## 5a. `installmentsCompleted` rule (Phase 3.4 H-1 LOCKED)

`installmentsCompleted` on `عهدة_المعدات` is **not** a REQUEST-field transition.

**MUST NOT increment when:**

- a REQUEST is created (Cron or otherwise);
- an open remainder rolls over / is carried to another eligible cycle;
- a **partial** ALLOCATED payment is applied (`remainingAmount > 0` after apply);
- desk cash / `settlementPaidMilli` is recorded;
- any obligation still has `remainingAmount > 0`.

**MAY advance only when:**

- the corresponding **equipment installment obligation** reaches `remainingAmount = 0` as the result of a successful **ALLOCATED** wallet application; and
- that completion is attributable to the allocation/apply-audit record that closed that obligation.

**Rollover:** preserves the same `deductionId` and **MUST NOT** advance `installmentsCompleted`.

**Full Reverse** of an allocation that previously closed an equipment installment:

- restore obligation state consistently (`paidAmount` / `remainingAmount`);
- reverse the installment-completion effect **only** when that completion was caused by the reversed allocation;
- do **not** blindly decrement `installmentsCompleted` on every reverse;
- never allow `installmentsCompleted` to become negative;
- preserve an auditable reverse trail.

Compatible with: REQUEST ≠ ACTUAL ≠ ALLOCATED and open remainder ≠ new REQUEST. No new financial meaning beyond installment-index consistency with closed obligations.

---

## 6. Final rollover rules

| Rule | Statement |
|---|---|
| Identity | Same `deductionId` across cycles |
| Amounts | `originalAmount` never overwritten; `remainingAmount` carries |
| Cycle fields | `originalCycleId` immutable; `currentCycleId` moves to next eligible cycle |
| Equipment keys | `equipmentIssueId` / `installmentNumber` unchanged when present |
| Creation | Never create a new row solely to represent the same remainder |
| Queue rule | **Open remainder is queued, not re-requested** |
| Cron | Cron MAY create a REQUEST only for a **genuinely new** eligible obligation/installment; Cron MUST NOT mint a new `deductionId` for an already-open remainder |
| Idempotency key | Auto installment REQUEST key must not accidentally create a second obligation for the same installment / open remainder (key binds to the stable `deductionId`; carried remainders update `currentCycleId` only) |
| Manual | Stays OPEN until settle / cancel / **explicit** replace |
| Replace | Explicit action only; new supervisor upload of another obligation does **not** replace |
| Dashboard | Carried Open Remaining ≠ New Requested This Cycle |

---

## 7. Final Manager Excel validation rules

| State | Meaning | Effects |
|---|---|---|
| **FILE_INVALID** | Technical validation failed | No cycle-final reconcile / no allocation |
| **FILE_PARTIAL** | Readable but not complete-confirmed, or uncertain completeness | No cycle-final Actual semantics; missing rider ≠ Actual 0 |
| **FILE_VALID(Cx)** | Technical OK **and** authorized role explicitly confirms «ملف الدورة كامل» for cycle Cx | Reconcile/allocate allowed; missing rider **may** be treated as Actual = 0 for Cx |

**Missing rider (locked):** must **NOT** become Actual=0 unless the **specific cycle** is `FILE_VALID` **and** complete-cycle confirmation exists for that cycle.

Additional rules:

- Do **not** infer completeness from parser success alone.
- Do **not** infer completeness from row count alone.
- Ordinary upload **action** does **not** imply business confirmation (confirmation is a separate explicit action).
- Authorization for upload **and** for «ملف الدورة كامل» uses the existing dual gate (Phase 3.1 **D-PERM-1 VERIFIED**): `deductions_reconcile` feature access **and** `deductions_verify` permission. **No new permission key.**
- FILE_VALID(C1) does not make FILE_VALID(C2).
- Re-upload of the same evidence must not double-allocate (see §7a).

### 7a. Evidence identity, supersession, and crash consistency (Phase 3.1 LOCKED)

**Invariant:** The same economic Manager evidence may produce **at most one net financial application**.

#### D-EVIDENCE-1 — `evidenceIdentityKey` (LOCKED)

`evidenceIdentityKey` is the deterministic canonical fingerprint of:

1. **Cycle scope:** `cycleId` when mapped, else normalized `(دورة_الاستقطاع, شهر, سنة)`.
2. **FILE_VALID apply population:** every rider in the confirmed cycle-final Actual population for that apply (including missing riders treated as Actual=0 under FILE_VALID).
3. **Sorted Actual vector:** pairs `(riderCode, actualMilli)` sorted by `riderCode` ascending, where `actualMilli` is `خصم_المحفظة_شيت_المدير` in milliemes (0 if missing under FILE_VALID).
4. **Encoding:** SHA-256 of a stable canonical encoding of (1)+(3).

`reconcileBatchId` remains **audit/upload identity only**. A new `reconcileBatchId` alone must **never** authorize a second net financial application for the same `evidenceIdentityKey`.

Apply-once line key: `(evidenceIdentityKey, deductionId)` (batch id may be recorded for audit).

#### D-EVIDENCE-2 — Supersession model (LOCKED)

Corrected / re-uploaded Manager evidence for a cycle that already has an applied `evidenceIdentityKey`:

1. Requires an **explicit** admin supersession action (not automatic on upload).
2. Uses **Full Reverse + Re-Apply** only:
   - audited reverse of the prior net wallet/obligation application for that prior `evidenceIdentityKey`;
   - mark prior evidence `SUPERSEDED` with link to the new batch/identity;
   - allocate the new FILE_VALID evidence under its new `evidenceIdentityKey`.
3. **Delta-only waterfall correction is forbidden** (waterfall is order-dependent; local deltas are unsafe).
4. Reverse and re-apply must be explicit and auditable.

#### D-EVIDENCE-3 — Crash consistency (LOCKED)

Sheets are not multi-row ACID. Required model:

1. **Apply-record first:** durable allocation apply record `(evidenceIdentityKey, reconcileBatchId, deductionId, allocatedMilli, reason, applyStatus)` must exist before (or as the gate for) wallet liability mutation.
2. Then update `paidAmount` / `remainingAmount` on `الاستقطاعات`.
3. Then, if reason = `معدات`: `amountDeductedMilli +=`, `outstandingMilli -=`.
4. Mark apply record fully applied.
5. **Recovery** (idempotent): if an apply record exists but liability/obligation lag → complete once; if fully applied → no-op.
6. **Forbidden:** mutate `amountDeductedMilli` / wallet-driven `outstandingMilli` without a durable allocation apply record.
7. Retries must **never** double-cut liability.

| Forbidden | Required |
|---|---|
| New `reconcileBatchId` alone ⇒ re-allocate | Match on `evidenceIdentityKey` |
| Blind second allocation | Explicit Full Reverse + Re-Apply only |
| Silent latest-upload-wins | Audited supersede link |
| Liability write without apply record | Apply-record-first + recoverable completion |

---

## 8. Final data model delta (additive only)

### 8.1 `الاستقطاعات` (operational requested ledger)

Additive fields (conceptual; implementation later):

| Field | Meaning |
|---|---|
| `deductionId` | Stable obligation id across cycles |
| `source` | `auto_equipment` \| `supervisor` \| … |
| `equipmentIssueId` | When reason = معدات |
| `installmentNumber` | When applicable |
| `originalCycleId` | Cycle of creation |
| `currentCycleId` | Cycle where currently open/queued |
| `originalAmount` | Immutable original request amount |
| `paidAmount` | Cumulative allocated/paid (starts 0) |
| `remainingAmount` | Open remaining |
| `status` | open \| partially_allocated \| paid \| cancelled \| replaced \| … (do not use unqualified `partial` for file validation) |

Existing columns (amount, reason, rider, cycle labels, etc.) remain; no destructive renames.

### 8.2 `استقطاعات_المعدات_التلقائية`

- Link to `deductionId`.
- Statuses aligned to REQUEST vs post-allocation outcomes as implemented later.
- **Historical `status=posted` rows:** frozen legacy/audit — do not reinterpret as wallet ACTUAL; do not retroactively decrease عهدة again; do not invent duplicate historical allocations.

### 8.3 `الاستقطاعات_الفعلية`

Additive fields: `reconcileBatchId`, `evidenceIdentityKey`, `fileValidationStatus` (`FILE_INVALID` \| `FILE_PARTIAL` \| `FILE_VALID`), `completeCycleConfirmedBy`, `completeCycleConfirmedAt`, optional supersede links (+ existing Actual field `خصم_المحفظة_شيت_المدير`).

### 8.4 Allocation apply audit (required for D-EVIDENCE-3)

Durable apply records (dedicated sheet or additive rows — implementation choice later):

`(evidenceIdentityKey, reconcileBatchId, deductionId, allocatedAmount, reason, applyStatus, …)` — append-only / lifecycle statuses supporting PENDING → APPLIED / SUPERSEDED / reverse links.

### 8.5 `عهدة_المعدات`

No destructive schema change.

| Field path | Rule |
|---|---|
| `amountDeductedMilli` | Increases **only** by Σ ALLOCATED `معدات` (wallet path) |
| Wallet-driven `outstandingMilli` | Decreases by that same wallet allocation Σ |
| `installmentsCompleted` | Advances **only** when the corresponding معدات installment obligation reaches `remainingAmount = 0` via ALLOCATED apply (§5a); never on REQUEST / rollover / partial / desk cash |
| `settlementPaidMilli` | Desk cash only (Phase C); may reduce authoritative outstanding per Phase C; never wallet ACTUAL/ALLOCATED |

### 8.6 Desk cash (unchanged separation)

`settlementPaidMilli` / `مدفوعات_عهدة_المعدات` remain cash-desk only.

Desk cash **MUST NOT**:

- increase `amountDeductedMilli`
- count as ACTUAL or ALLOCATED
- create an allocation audit
- reduce liability through the wallet-allocation path

---

## 9. Final API delta (documentation only — not implemented by this write)

| Surface | Intended change (future Go) |
|---|---|
| Auto cron | Emit REQUEST only for **new** eligible obligations/installments; queue open remainders by `currentCycleId` (no new `deductionId`); **no** `amountDeductedMilli` / wallet outstanding cut on request |
| Manager Compare / reconcile | Cycle validation; complete-cycle confirm; batch id; allocate when FILE_VALID; idempotent; **§7a evidence apply-once** |
| Summary GET | New Requested / Carried Open / Total Open Exposure + per-line |
| Settle / cancel / replace | Explicit manual actions |
| Manual V2 (when ON) | Align posting to `الاستقطاعات` semantics |

### 9a. REQUEST ledger vs `ledger_native` / `سجل_المعاملات_المالية` (Phase 3.1 D-LEDGER-1 LOCKED)

No new ledger architecture is invented by this amendment.

**v1 collection path (LOCKED):**

| Rule | Statement |
|---|---|
| REQUEST ≠ collection | Creating a row on `الاستقطاعات` does **not** mean money was collected |
| REQUEST ≠ paid | REQUEST creation does **not** increase `paidAmount` |
| REQUEST ≠ wallet liability cut | REQUEST creation does **not** increase `amountDeductedMilli` or reduce wallet-driven outstanding |
| **No `ledger_native` on REQUEST** | Do **not** write `ledger_native` when creating a REQUEST |
| **`ledger_native` ≠ collection truth (v1)** | For Auto REQUEST + Manager allocate + Manual obligations under this amendment, `ledger_native` is **not** used as collection/paid truth |
| Collection truth (v1) | `الاستقطاعات.paidAmount` / `remainingAmount` after ALLOCATED, plus wallet `amountDeductedMilli` for ALLOCATED `معدات`, remain the collection truth; ACTUAL comes only from FILE_VALID Manager evidence |
| Manual V2 | Must **not** treat create-time ledger append as collection truth; align to `الاستقطاعات` REQUEST semantics |
| Future dual-write | Any optional `ledger_native` write on ALLOCATION is **explicitly deferred** and requires a **separate Go**; if ever approved, must be idempotent on `(evidenceIdentityKey, deductionId)` and must not be consulted as paid before ALLOCATED |

---

## 10. Final UI / dashboard delta

### Cycle Deduction Summary

| Metric | Definition |
|---|---|
| **New Requested This Cycle** | Σ `originalAmount` of obligations **created** in this cycle |
| **Carried Open Remaining** | Σ `remainingAmount` of prior-cycle obligations with `currentCycleId` = this cycle |
| **Total Open Exposure** | New Requested This Cycle + Carried Open Remaining |
| Actual Total | From FILE_VALID Manager evidence for the cycle |
| Uncollected | Open remaining after allocation (where applied) |

**CRITICAL:** Carried Open Remaining must **not** be counted again as a new original request.

### Per-line display

سبب · مطلوب (`originalAmount`) · تم تحصيله (`paidAmount`) · متبقي (`remainingAmount`) · `deductionId` · equipment/installment · carried?  

Manager Compare: show FILE_INVALID / FILE_PARTIAL / FILE_VALID + control for «ملف الدورة كامل».  
Supervisor: create + **explicit** Replace (never auto-replace on new upload).

Example (correct vs incorrect):

| Cycle | Facts | Correct dashboard |
|---|---|---|
| C1 | New سلفة 200, uncollected | New=200, Carried=0, Exposure=200 |
| C2 | Same سلفة rem 200 + new سلفة 100 | New=100, Carried=200, Exposure=300 — **not** New Requested=300 |

---

## 11. Final acceptance test matrix (normative)

| ID | Assert |
|---|---|
| AT-01 | REQUEST: paidAmount=0; amountDeductedMilli unchanged; wallet-driven outstanding unchanged |
| AT-02 | Eq500+Loan200, Actual500 → Eq allocated 500; Loan rem 200; amountDeductedMilli +500; wallet outstanding −500 |
| AT-03 | Eq500+Loan200, Actual300 → Eq PARTIALLY_ALLOCATED rem 200; Loan UNPAID 200; amountDeductedMilli +300; wallet outstanding −300 |
| AT-04 | Two loans never merged |
| AT-05 | Old equipment remaining then new equipment before loan |
| AT-06 | Equal age: stable order by equipmentIssueId ascending |
| AT-07 | Same `(evidenceIdentityKey, deductionId)` applied twice: second apply Δ amountDeductedMilli=0 and no double paidAmount |
| AT-07b | Same economic Manager evidence (same `evidenceIdentityKey`) re-uploaded with a **new** reconcileBatchId: no second net financial application (unless explicit audited Full Reverse + Re-Apply) |
| AT-08 | Rollover same deductionId; originalAmount unchanged; open remainder queued not re-requested; **installmentsCompleted unchanged** |
| AT-08b | Cron on later cycle: does not mint new deductionId for open remainder; may create only genuinely new installment/obligation |
| AT-08c | Duplicate cron execution for same new installment key: no second deductionId |
| AT-08d | Partial ALLOCATED on معدات installment: remainingAmount > 0 ⇒ installmentsCompleted unchanged |
| AT-08e | ALLOCATED closes معدات installment (remainingAmount = 0) ⇒ installmentsCompleted advances once, attributable to that apply |
| AT-08f | Full Reverse of a closing allocation: reverse completion only if caused by that apply; installmentsCompleted never negative; audit trail preserved |
| AT-09 | New=100, Carried=200, Exposure=300 (not New=300) |
| AT-10 | FILE_VALID(C1) does not validate C2 |
| AT-11 | FILE_PARTIAL + missing rider: no Actual=0; no cycle-final reconciliation |
| AT-11b | FILE_INVALID: no allocation / no cycle-final reconciliation |
| AT-12 | FILE_VALID + missing rider: Actual=0; remaining stays OPEN |
| AT-13 | Surplus Actual after all open obligations satisfied: audit-only; no new deduction/request |
| AT-14 | New upload ≠ replace; explicit replace closes/supersedes old |
| AT-15 | Historical posted not reinterpreted as ACTUAL |
| AT-16 | Desk cash: settlementPaidMilli changes; amountDeductedMilli and wallet allocation unchanged; not ACTUAL/ALLOCATED |
| AT-16b | REQUEST (or ledger_native tied only to REQUEST) never marks deduction paid |
| AT-17 | Auto flag OFF: no auto REQUEST/allocate side effects |
| AT-18 | ACTUAL evidence exists but allocation not executed: paidAmount unchanged; amountDeductedMilli unchanged |
| AT-19 | Closing cycle: no new equipment REQUEST for that closing cycle |
| AT-20 | Activation in cycle N: first eligible equipment REQUEST only in next applicable eligible cycle |
| AT-21 | Non-equipment FIFO: older obligation before newer; equal age → deductionId ascending |

---

## 12. Final regression matrix

| Area | Expectation |
|---|---|
| Auto flag OFF | No new financial side effects from this amendment |
| Liability Desk cash / orphan payment reconcile | Unchanged |
| Legacy Manager Compare statuses | Remain; FILE_VALID / FILE_PARTIAL / complete confirm are additive |
| Supervisor Excel upload | Remains; additive ids/fields |
| Payout cycles CRUD | Unchanged |
| Rooster | Untouched |
| Salary path with Auto OFF | Unchanged |
| Returns / Inventory V2 OFF | Untouched |
| Historical auto `posted` | Frozen audit |

---

## 13. Final migration / backward compatibility

1. Additive sheet columns only; no deletes/renames of existing headers.
2. Historical auto `posted` = legacy/audit; no automatic ACTUAL/allocation reinterpretation.
3. Existing `الاستقطاعات` rows: assign `deductionId` on first touch/backfill under a later plan; unpaid without allocation → OPEN with remaining = amount.
4. Append-only actuals: `reconcileBatchId` is audit/upload identity; **§7a** apply-once is by `evidenceIdentityKey`. Supersession = explicit Full Reverse + Re-Apply only.
5. Any future historical wallet-proof migration requires a **separate approved migration Go**.
6. Optional future `ledger_native` dual-write on ALLOCATION requires a **separate Go** (D-LEDGER-1).

---

## 14. Final assumptions

1. Google Sheets remain system of record for these ledgers in this phase.
2. **Permissions (Phase 3.1 D-PERM-1 VERIFIED):**
   - **Confirmed existing keys:** `deductions_verify`, `deductions_reconcile`, `equipment_liability`, `payout_cycles`, `equipment_finance`, `auto_equipment_deductions`, `manual_deductions_v2`.
   - Complete-cycle confirmation («ملف الدورة كامل») is authorized by the **existing dual gate** already used by Manager Compare: `deductions_reconcile` feature access **and** `deductions_verify` permission.
   - Confirmation remains a **separate explicit action** (upload/parse success alone never implies FILE_VALID).
   - **Do not invent a new permission key.**
3. EGP on `الاستقطاعات` converts to milliemes at the liability boundary.
4. Arabic cycle label + month + year maps 1:1 to `دورات_القبض.cycleId` for active calendars.
5. Vocabulary beyond the five frozen reasons is empty until explicitly added via SRS/config approval. Unknown values must never silently map to an “other” bucket.
6. Security auto path uses reason `استعلام أمني` when that product path is enabled later.
7. Implementation and Auto enablement remain behind separate Gos; Auto defaults OFF.

---

## 15. Change map against prior SRS-014 text

| Location | Change |
|---|---|
| Architecture §3 rule 8 | Replaced: no pre-payroll “insufficient payout Y”; post-payroll ACTUAL + REQUESTED/ACTUAL/ALLOCATED |
| Architecture §6 Auto path | REQUEST → Friday Manager evidence → allocate → wallet `amountDeductedMilli` for معدات only |
| Design Freeze Phase E | REQUEST semantics; paidAmount; waterfall; evidence apply-once; cron queues remainders |
| Design Freeze Phase F | Align Manual V2 to `الاستقطاعات`; explicit replace; REQUEST ≠ ledger paid |
| Design Freeze Phase H | Distinguish snapshot metrics vs allocation reconcile; New/Carried/Exposure |
| Design Freeze Phase C Desk | Explicit separation: desk cash ≠ wallet allocation; outstanding may move via settlementPaidMilli |
| This amendment | FILE_VALID/FILE_PARTIAL/FILE_INVALID; PARTIALLY_ALLOCATED; historical freeze; dashboard metrics; §7a; §9a |
| Phase 3.1 / 3.2 | evidenceIdentityKey; Full Reverse + Re-Apply; apply-record-first; ledger_native not collection truth (v1); D-PERM-1 verified |

---

## 16. Residual decisions locked in Final Approval Gate

| ID | Decision |
|---|---|
| A Historical cutover | Do not reinterpret historical `posted` as ACTUAL; no retro wallet liability cut; no duplicate historical allocations; separate migration if ever needed |
| B Complete-cycle confirmation | FILE_VALID = technical + explicit «ملف الدورة كامل»; dual-gate `deductions_reconcile` + `deductions_verify`; separate confirm action; no new permission (D-PERM-1 VERIFIED) |
| C Reason vocabulary | Freeze five reasons; future reasons only via explicit SRS/config approval; no silent other; no 3Pl inference |
| D Equipment FIFO tie-break | Age primary; equipmentIssueId ascending secondary |
| E Requested / Carried | New Requested ≠ Carried Open; originalAmount immutable; same deductionId across cycles |
| F Wallet vs desk (Phase 2.1) | amountDeductedMilli = wallet ALLOCATED معدات only; settlementPaidMilli = desk cash; outstanding may be affected by either path per scoped rules |
| G Evidence apply-once | Same economic evidence ⇒ ≤ one net financial application; keyed by `evidenceIdentityKey` (not batch id alone) |
| H Cron vs rollover (Phase 2.1) | Open remainder queued, not re-requested; no new deductionId for open remainder |
| I REQUEST vs ledger_native | v1: no ledger_native on REQUEST; ledger_native not collection truth; paidAmount/remainingAmount/amountDeductedMilli are collection truth (D-LEDGER-1) |
| J Terminology (Phase 2.2) | FILE_* vs PARTIALLY_ALLOCATED disambiguated |
| K Governance status (Phase 2.3) | Design frozen for documentation/planning only; implementation requires separate explicit Go after final SRS audit + approved implementation plan |
| L D-EVIDENCE-1 (Phase 3.1/3.2) | `evidenceIdentityKey` = SHA-256 of cycle scope + sorted (riderCode, actualMilli) FILE_VALID population |
| M D-EVIDENCE-2 (Phase 3.1/3.2) | Explicit Full Reverse + Re-Apply only; delta-only waterfall correction forbidden |
| N D-EVIDENCE-3 (Phase 3.1/3.2) | Apply-record-first + recoverable liability; no wallet mutation without durable apply record |
| O D-LEDGER-1 (Phase 3.1/3.2) | ledger_native not collection truth in v1; future allocate dual-write needs separate Go |
| P D-PERM-1 (Phase 3.1/3.2) | Existing dual-gate verified sufficient |
| Q installmentsCompleted (Phase 3.4 H-1) | Advance only when معدات installment remainingAmount=0 via ALLOCATED; never on REQUEST/rollover/partial/desk; reverse completion only if caused by reversed apply |

---

## 17. Explicit non-goals of this SRS write

- No source code changes.
- No database / Neon / SQL migrations.
- No Google Sheets header or data changes.
- No API/UI implementation.
- No feature flag enablement.
- No deployment.
- No Design v7.
- No reinterpretation of historical financial rows.
- No Phase 4 Code from this document alone.
- No production Auto enablement from this document alone.
