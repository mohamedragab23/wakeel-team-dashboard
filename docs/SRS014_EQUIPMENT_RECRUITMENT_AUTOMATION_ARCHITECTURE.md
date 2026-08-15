# SRS-014 — Equipment / Recruitment / Auto-Deductions Architecture

**Status:** Design is frozen for documentation/planning purposes. Implementation requires a separate explicit Go after the final SRS consistency audit and an approved implementation plan. Delivery, when later approved, remains behind feature flags (default OFF).  
**Companion:** `docs/SRS014_DESIGN_FREEZE.md`  
**Normative amendment (post-payroll reconcile):** `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md` — **LOCKED**. Conflicts on Auto Deduction / Actual / allocation / liability / rollover / dashboard are resolved in favor of the amendment.  
**Baseline:** existing production dashboard on `main` (SRS-013 payroll ledger + equipment delivery/return + recruitment pipeline already shipped).  
**Implementation note:** This document does **not** authorize code, flags, Sheets mutation, migration, production enablement, or Phase 3/4 work.

---

## 1. Business objective

Automate the operational + financial path:

Recruitment → Lecture → Activation → Admin assignment → Equipment issue (900/800 liability) → Cycle-based installment **REQUESTS** → Post-payroll Manager Actual → Allocation (Equipment First) → Return/settlement/waiver → Manual advances/ops deductions → Reconciliation + audit + Telegram.

Supervisors must **not** need Excel for *new* equipment deduction **requests**. Legacy Excel upload remains for rollback. Manager Excel remains the **sole** operational source of wallet ACTUAL after payroll (via existing Manager Compare — no second uploader).

---

## 2. What already exists (reuse)

| Module | Path / sheet | Reuse |
|---|---|---|
| Payroll ledger | `lib/payrollLedger.ts` / `سجل_المعاملات_المالية` | Append/void/correct; double-count guard vs `legacy_mirror` |
| Salary | `lib/salaryService.ts` | Additive fold-in only; flagged equipmentCost filter |
| Equipment delivery/return | `تسليم_المعدات`, `استرجاع_المعدات` | Extend with `equipment_issue_id` |
| Inventory | `المخزون_الرئيسي` | Keep pouch SKUs; bag financially = 530 |
| Recruitment | `مرشحين_التعيين`, `lib/recruitment/*` | Extend; do not replace |
| Cycle labels | `lib/equipmentSheetConstants.ts` | Labels only; dates Admin-configured |
| Manager Compare | `الاستقطاعات` / `الاستقطاعات_الفعلية` + Admin reconcile UI | REQUEST ledger + wallet ACTUAL evidence (reuse; extend additively) |
| Audit / Telegram / cron / flags | SRS-013 patterns | Copy |

**Do not touch:** `lib/roosterLive/*` auth/sync, destructive sheet renames/deletes, floating-point money, hard-coded month calendars.

---

## 3. Critical financial rules

1. Liability components (milliemes; 1 EGP = 100): bag 53000 + shirts 27000 + security 10000 = **90000**.
2. Motorcycle and bicycle bag both cost 53000. Jacket/helmet = custody only.
3. Security paid upfront → remaining **80000** → installments 26667 + 26667 + 26666 (remainder front-loaded into earlier installments).
4. Not paid → remaining **90000** → 30000 × 3.
5. Installments across **3 eligible deduction cycles** (not calendar weeks).
6. No equipment auto-deduction **REQUEST** in **closing** cycle; liability/obligation carries forward.
7. Activation during cycle N → first equipment deduction REQUEST in next eligible cycle.
8. **Post-payroll ACTUAL + allocation (supersedes prior “insufficient payout” pre-Y wording):**  
   - There is **no** authoritative pre-payroll available-payout Y for Auto Deduction in this design.  
   - Pre-payroll Auto creates **REQUEST** only (`الاستقطاعات`); REQUEST never changes `amountDeductedMilli` / wallet-driven outstanding.  
   - After payroll, Manager Excel `Applaied Deduction on Wallet` → `خصم_المحفظة_شيت_المدير` is ACTUAL when the file is **FILE_VALID** for that cycle.  
   - `FILE_INVALID` / `FILE_PARTIAL` ⇒ **no** cycle-final reconciliation; missing rider must **NOT** become Actual=0 unless that specific cycle is FILE_VALID with complete-cycle confirmation.  
   - Allocation consumes ACTUAL with Equipment First + FIFO; partial collection leaves `remainingAmount` on the **same** `deductionId` (**PARTIALLY_ALLOCATED** outcome). **Open remainder is queued, not re-requested.**  
   - **Equipment ordering (deterministic):** (1) oldest eligible equipment obligation/installment; (2) `equipmentIssueId` ascending secondary tie-break. Non-equipment: FIFO by age, then `deductionId` ascending.  
   - **Surplus** Actual after all open obligations satisfied is **audit-only** and MUST NOT create a new deduction/request.  
   - `Salaries&Tips Applaied on Wallet` is retrospective audit only — not pre-payroll Y.  
   - Full normative detail: `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md`.
9. Idempotency key (auto installment REQUEST): `equipment:{riderCode}:{equipmentIssueId}:{cycleId}:{installmentNumber}` (links to stable `deductionId`). Must not create a second obligation for the same installment / open remainder; carried remainders update `currentCycleId` only. Duplicate cron for the same new installment key ⇒ no second `deductionId`.
10. History survives user/rider/supervisor deletion via snapshots.
11. **REQUESTED ≠ ACTUAL ≠ ALLOCATED**; `paidAmount` increases only from allocation; wallet algorithm: `amountDeductedMilli +=` Σ ALLOCATED `معدات`; `outstandingMilli -=` that Σ. Desk cash remains via `settlementPaidMilli` (Phase C).
12. Desk cash (`settlementPaidMilli`) is separate from wallet allocation (`amountDeductedMilli`). Desk cash MAY reduce authoritative `outstandingMilli` per Phase C; MUST NOT increase `amountDeductedMilli`, count as ACTUAL/ALLOCATED, create allocation audit, or advance `installmentsCompleted`.
13. Historical `استقطاعات_المعدات_التلقائية` `status=posted` rows are legacy/audit — not auto-reinterpreted as ACTUAL.
14. Same economic Manager evidence ⇒ at most one net financial application, keyed by **`evidenceIdentityKey`** (cycle scope + sorted FILE_VALID `(riderCode, actualMilli)` SHA-256). `reconcileBatchId` is audit/upload only. New batch id alone ≠ re-allocate. See amendment §7a.
15. REQUEST ≠ collection; **v1:** no `ledger_native` on REQUEST; `ledger_native` is **not** collection truth for this flow. Collection truth = `paidAmount`/`remainingAmount` after ALLOCATED + wallet `amountDeductedMilli` for معدات. See amendment §9a.
16. **Allocation apply idempotency:** durable apply-record first; `(evidenceIdentityKey, deductionId)` apply ≤ once; reprocessing / recovery ⇒ zero additional wallet liability effect. No wallet mutation without durable apply record.
17. Terminology: Manager file states use `FILE_INVALID` / `FILE_PARTIAL` / `FILE_VALID`; obligation outcomes use `PAID` / `PARTIALLY_ALLOCATED` / `UNPAID` — never unqualified «PARTIAL» for both.
18. Closing cycle: no new equipment REQUEST. Activation in cycle N: first eligible equipment REQUEST only in next applicable eligible cycle.
19. Supersession: explicit **Full Reverse + Re-Apply** only; delta-only waterfall correction forbidden.
20. **`installmentsCompleted` (Phase 3.4 H-1):** MUST NOT advance on REQUEST, Cron REQUEST, rollover/carry, partial ALLOCATED, or desk cash. MAY advance only when the corresponding معدات installment obligation reaches `remainingAmount = 0` via successful ALLOCATED wallet apply, attributable to that apply record. Full Reverse reverses completion only when caused by the reversed allocation; never blindly; never negative; auditable. See amendment §5a.

**Double-count guard:** when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` and rider has active `equipment_issue`, exclude that rider from legacy `المعدات` × pricing contribution in salary calc.

---

## 4. Feature flags (default OFF)

| Flag | Gates |
|---|---|
| `FEATURE_RECRUITMENT_V2_ENABLED` | Contacts, security fee fields, lecture/activation upgrades |
| `FEATURE_PAYOUT_CYCLES_ENABLED` | Cycle CRUD + Admin UI |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | Liability creation on issue + **Equipment Liability Management Desk** (cash payments) |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | **Cron REQUEST creation only** + (separate) Manager Compare post-payroll **allocation** wiring + salary guard. Cron itself does **not** allocate ACTUAL. Enablement = separate Go. |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | Physical return + return-settlement / waiver sheet |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | Supervisor Manual Deductions V2 (REQUEST on الاستقطاعات; default OFF). Enable on Vercel: `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED=true` after merge — do not hard-default ON in code. Excel `/deductions-upload` is hidden from supervisor nav. |
| `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | Inventory anomaly flags / extras |

Pattern: `String(process.env.X||'').trim().toLowerCase()==='true'`. API → `503 { enabled:false }`. Cron → `{ skipped:true }`.

---

## 5. Data model (new sheets)

| Sheet | Purpose |
|---|---|
| `دورات_القبض` | Admin payout cycles |
| `جهات_اتصال_المرشحين` | Family/emergency contacts |
| `عهدة_المعدات` | Equipment issue + balances (authoritative aggregate) |
| `مدفوعات_عهدة_المعدات` | Liability Desk cash payment history (append-only; Ledger ON) |
| `استقطاعات_المعدات_التلقائية` | Auto deduction REQUEST/history (append-only; link `deductionId`) |
| `تسوية_استرجاع_المعدات` | Physical return settlement / waiver (Returns V2) |
| `مطابقة_دورات_الاستقطاع` | Cycle reconciliation snapshots |

**Existing ledgers reused / extended additively (amendment):**

| Sheet | Purpose |
|---|---|
| `الاستقطاعات` | Operational **requested** ledger (auto + supervisor); obligation fields |
| `الاستقطاعات_الفعلية` | Manager **ACTUAL** wallet deduction evidence + batch/validation fields |

Existing tabs extended additively only (headers via `ensureHeaderRow`). No destructive renames/deletes.

---

## 6. Architecture

```
Recruitment V2 → Activation (rider_code)
       ↓
Admin assigns Ops Supervisor
       ↓
Equipment issue → عهدة_المعدات (900/800 once)
       ↓
Liability Desk (cash payments) → مدفوعات_عهدة_المعدات  [Ledger ON; not Returns; not wallet ACTUAL]
       ↓
Payout cycles (دورات_القبض)
       ↓
Auto engine (cron) → REQUEST on الاستقطاعات for **new** eligible obligations only
       (+ استقطاعات_المعدات_التلقائية link; open remainder queued via currentCycleId — not re-requested)
       [Auto ON — Cron does NOT allocate ACTUAL]
       ↓
(Friday after payroll) Manager Excel via existing Manager Compare
       → الاستقطاعات_الفعلية (ACTUAL) only when FILE_VALID(cycle) + «ملف الدورة كامل»
       → FILE_INVALID / FILE_PARTIAL ⇒ no cycle-final reconcile; missing rider ≠ Actual=0
       → evidenceIdentityKey = SHA-256(cycle scope + sorted FILE_VALID Actual vector)
       → reconcileBatchId = audit/upload only (alone ≠ second apply)
       ↓
Allocation (Manager Compare / reconcile — not Cron)
       Equipment First → frozen reasons → FIFO
       Equip order: oldest obligation/installment, then equipmentIssueId ascending
       → durable apply-record first, then paidAmount / remainingAmount
       → (evidenceIdentityKey, deductionId) apply ≤ once; recovery idempotent
       → amountDeductedMilli += Σ ALLOCATED معدات only
       → outstandingMilli -= that Σ
       → installmentsCompleted advances only if that معدات installment remainingAmount hits 0 (H-1); never on partial
       → surplus Actual = audit-only (no new deduction/request)
       → supersede = explicit Full Reverse + Re-Apply only (reverse completion only if caused by reversed apply)
       ↓
Salary fold-in / double-count guard (when Auto ON; REQUEST ≠ collection; ledger_native ≠ collection truth v1)
       ↓
Return → return-settlement/waiver → ledger + audit  [Returns V2; separate]
```

Money: `lib/money.ts` (integer milliemes).  
Cycles: `lib/payoutCycles/*`.  
Liability: `lib/equipmentLiability/*`.  
Engine: `lib/equipmentDeductions/engine.ts` (REQUEST vs allocate semantics per amendment — implementation later).  
Manager Compare: existing Admin deductions-reconcile path (extend; do not duplicate uploader).  
Payroll ledger: **v1** — not written on REQUEST; **not** collection truth for this amendment flow (`paidAmount` / `remainingAmount` / `amountDeductedMilli` are). Future allocate dual-write needs separate Go.

---

## 7. Permissions

| Actor | Can |
|---|---|
| `recruitment_manager` | Applications, contacts, lecture, activation; **not** ops assign / cycles / waivers |
| Supervisor | Manual V2 for owned riders; issue/return if authorized; create requests — **not** auto-replace open obligations |
| Admin (+ feature keys) | Cycles, assign, waivers, corrections, reports |
| Deductions compare | Manager Compare upload **and** explicit «ملف الدورة كامل» |

**Permission keys (D-PERM-1 VERIFIED):**

| Key | Status |
|---|---|
| `deductions_reconcile` (feature) + `deductions_verify` (permission) | **Confirmed dual gate** — authorizes Manager Compare **and** complete-cycle confirmation as a **separate explicit action** |
| `equipment_liability`, `payout_cycles`, `equipment_finance`, `auto_equipment_deductions`, `manual_deductions_v2` | **Confirmed existing** admin feature keys |
| New permission for «ملف الدورة كامل» | **Not invented.** Existing dual gate is sufficient. |

Server-side enforcement on every API.

---

## 8. Phased delivery

| Phase | Scope |
|---|---|
| A | Money + payout cycles |
| B | Recruitment V2 |
| C | Equipment liability (+ Desk cash; separate from wallet allocation) |
| D | Return / settlement / waiver |
| E | Auto deduction REQUEST + post-payroll allocation / wallet liability (per amendment) |
| F | Manual deductions V2 (aligned to `الاستقطاعات` semantics) |
| G | Inventory V2 flags |
| H | Reports / reconciliation / Telegram aggregates + New/Carried/Exposure metrics |

---

## 9. Rollback

Flip flags OFF. Do not delete new sheets. Legacy Excel + `المعدات` salary path remains.  
Historical auto `posted` rows remain frozen legacy/audit (no automatic reinterpretation as ACTUAL).

---

## 10. Acceptance (global)

- **Normative for this domain:** invariants + acceptance matrix in `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md` (AT-01…AT-21 and locked invariants). Do **not** depend on an external unspecified “25 business rules” list for amendment compliance.
- Flags OFF ⇒ byte-identical existing behavior for salary/equipment/recruitment APIs.
- SRS-013 Phase 3 regression still passes.
- No Rooster live/auth changes.
- SAFE FOR CODE / DEPLOY / PHASE 3 require separate explicit approvals (not granted by this architecture doc alone).
