# SRS-014 — Design Freeze

**Status:** Design is frozen for documentation/planning purposes. Implementation requires a separate explicit Go after the final SRS consistency audit and an approved implementation plan.  
**Companion:** `docs/SRS014_EQUIPMENT_RECRUITMENT_AUTOMATION_ARCHITECTURE.md`  
**Normative amendment (post-payroll reconcile):** `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md` — **LOCKED**. Where this freeze conflicts with that amendment on Auto Deduction / Manager Actual / allocation / liability / rollover / dashboard metrics, **the amendment wins**.  
**Global rules:** additive only; flags default OFF; no existing sheet deletes/renames; no Rooster live/auth changes; integer milliemes for money.  
**Implementation note:** This document does **not** authorize code, flags, Sheets mutation, migration, production enablement, or Phase 3/4 work. Feature flags remain default OFF until a separate enablement Go.

Every phase: Endpoints → Sheets → APIs → Impact → Rollback → Acceptance.

---

## Phase A — Money + Payout Cycles

### Sheets — new tab `دورات_القبض`

| Col | Header | Notes |
|---|---|---|
| A | cycleId | UUID |
| B | year | number |
| C | month | 1–12 |
| D | cycleNumber | 1..N within month |
| E | startDate | YYYY-MM-DD |
| F | endDate | YYYY-MM-DD |
| G | payoutDate | YYYY-MM-DD |
| H | deductionGenerationDate | YYYY-MM-DD |
| I | isClosing | TRUE/FALSE |
| J | equipmentDeductionEnabled | TRUE/FALSE |
| K | status | draft \| active \| finalized |
| L | notes | |
| M | createdBy | |
| N | createdAt | ISO |
| O | updatedBy | |
| P | updatedAt | ISO |

### APIs
| Route | Method | Auth | Flag |
|---|---|---|---|
| `/api/admin/payout-cycles` | GET/POST | admin + `payout_cycles` | `FEATURE_PAYOUT_CYCLES_ENABLED` |
| `/api/admin/payout-cycles/[id]` | GET/PATCH | admin + `payout_cycles` | same |
| `/api/admin/payout-cycles/[id]/finalize` | POST | admin + `payout_cycles` | same |
| `/api/admin/payout-cycles/capability` | GET | admin | reports enabled |

### Validations
- start ≤ end; no overlap in month; unique cycleNumber; ≤1 closing; closing must be last by endDate; finalized rows need explicit correction flow.

### Lib
- `lib/money.ts`
- `lib/payoutCycles/*`
- `lib/srs014Flags.ts`

### Rollback
Flag OFF → APIs 503; UI hidden.

### Acceptance
- Money splits 800/900 exact milliemes.
- Overlap rejected.
- Closing must be last.
- Flag OFF → no behavior change elsewhere.

---

## Phase B — Recruitment V2

### Sheets
- Extend `مرشحين_التعيين` additively: `securityInquiryPayment` (`PAID`/`NOT_PAID`), lecture/activation note fields as needed.
- New `جهات_اتصال_المرشحين`: contactId, candidateId, name, relationship, relationshipOther, phone, createdAt, createdBy.

### Rules
- ≥2 contacts required unless Admin exception (audited).
- Security fee frozen after set (Admin correction audited).

### Flag
`FEATURE_RECRUITMENT_V2_ENABLED`

---

## Phase C — Equipment liability

### Sheet `عهدة_المعدات`
equipmentIssueId, riderCode, riderNameSnapshot, zoneSnapshot, supervisorCodeSnapshot, supervisorNameSnapshot, issueDate, activationDate, bagType, bagCostMilli, shirtQty, shirtCostMilli, securityFeeMilli, securityPaidUpfront, originalLiabilityMilli, outstandingMilli, amountDeductedMilli, **settlementPaidMilli**, installmentsCompleted, status (`open|settled|waived|closed`), deliveryRowRef, createdAt, createdBy, …

Field separation (locked):

| Field | Path |
|---|---|
| `amountDeductedMilli` | Wallet allocation only (Σ ALLOCATED `معدات`) |
| `settlementPaidMilli` | Desk cash only (Phase C); never wallet ACTUAL/ALLOCATED |
| `outstandingMilli` | Authoritative remaining balance; may decrease via wallet allocation and/or desk cash per scoped rules |
| `installmentsCompleted` | Advances **only** when corresponding معدات installment obligation reaches `remainingAmount = 0` via ALLOCATED (amendment §5a / H-1); never on REQUEST / rollover / partial / desk cash |

### Rules
- Create exactly once per finalized issue (idempotent on delivery approval / issue finalize).
- 900 or 800 from security fee.
- Jacket/helmet not in liability.

### Flag
`FEATURE_EQUIPMENT_LEDGER_ENABLED`

### Amendment — Equipment Liability Management Desk (additive)

Authorized under `FEATURE_EQUIPMENT_LEDGER_ENABLED` **independently** of Returns V2.

- **Purpose:** Admin desk to list liabilities and record **financial cash payments** against an existing `عهدة_المعدات` row.
- **History sheet (append-only):** `مدفوعات_عهدة_المعدات` — transaction evidence only; **not** a second liability ledger. Authoritative balance remains on `عهدة_المعدات` (`settlementPaidMilli`, `outstandingMilli`).
- **Cash payment does not imply physical return** and does **not** create return records.
- **Does not** enable or require `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED`.
- **Does not** enable Auto Deduction (`FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED`).
- Cash payments update `settlementPaidMilli` only; they must **not** modify `amountDeductedMilli` or installment index (`installmentsCompleted`).
- Permission: admin feature key `equipment_liability`. UI: `/admin/equipment-liability`.

Distinction:

| Concept | Flag / sheet |
|---|---|
| A) Equipment liability cash payment | Ledger ON · `مدفوعات_عهدة_المعدات` |
| B) Physical return / return settlement | Returns V2 · `تسوية_استرجاع_المعدات` |
| C) Auto deduction REQUEST + wallet allocation | Auto flag · `استقطاعات_المعدات_التلقائية` + `الاستقطاعات` + Manager Actual (`الاستقطاعات_الفعلية`) |

**Hard separation (amendment-locked):**

- **Wallet path:** REQUEST on `الاستقطاعات` → FILE_VALID Manager Actual → allocation → `paidAmount` increases; then explicitly:
  - `amountDeductedMilli +=` Σ ALLOCATED `معدات`
  - `outstandingMilli -=` that same wallet equipment allocation Σ
  - `installmentsCompleted` advances only per amendment §5a / H-1
- **Desk cash:** updates `settlementPaidMilli` only (never `amountDeductedMilli`); **MAY** reduce authoritative `outstandingMilli` per Phase C desk model; **MUST NOT** count as ACTUAL/ALLOCATED, create allocation audit, advance `installmentsCompleted`, or use the wallet-allocation path.
- Do **not** use absolute wording that «عهدة decreases only by ALLOCATED معدات» without scoping to the **wallet-driven / `amountDeductedMilli`** path.
- See `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md`.

---

## Phase D — Returns V2

### Sheet `تسوية_استرجاع_المعدات`
settlementId, equipmentIssueId, riderCode, returned items, settlementPaidMilli, waivedMilli, waiverReason, approvedBy, approvedAt, status, …

### Flag
`FEATURE_EQUIPMENT_RETURNS_V2_ENABLED`

---

## Phase E — Auto deductions

**Normative source:** `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md` (v6 locked + Final Approval Gate).  
Prior Phase E text that assumed pre-payroll available payout (Y) and paid liability on cron is **superseded**.

### Concepts (LOCKED)
- **REQUESTED ≠ ACTUAL ≠ ALLOCATED**
- Pre-payroll Auto path emits **REQUEST** only into operational ledger `الاستقطاعات` (and links `استقطاعات_المعدات_التلقائية`).
- REQUEST does **not** increase `paidAmount` and does **not** change `amountDeductedMilli` / wallet-driven outstanding.
- ACTUAL = FILE_VALID cycle-scoped Manager Excel → `الاستقطاعات_الفعلية.خصم_المحفظة_شيت_المدير`.
- Allocation (Equipment First + FIFO + frozen reason order) increases `paidAmount`; then `amountDeductedMilli +=` Σ ALLOCATED `معدات`; `outstandingMilli -=` that Σ.
- **`installmentsCompleted` (H-1):** never on REQUEST / Cron / rollover / partial ALLOCATED / desk cash; advances only when the corresponding معدات installment obligation reaches `remainingAmount = 0` via ALLOCATED apply; Full Reverse reverses completion only if caused by that apply (never blindly; never negative). See amendment §5a.
- **Equipment ordering (deterministic):** (1) oldest eligible equipment obligation/installment; (2) `equipmentIssueId` ascending secondary tie-break.
- **Surplus** Actual after all open obligations satisfied is **audit-only** and MUST NOT create a new deduction/request.
- Rollover = same `deductionId` (not a new request); `originalAmount` immutable; **open remainder is queued, not re-requested**.
- Historical auto rows with `status=posted` = **legacy/audit freeze** (not auto-ACTUAL).
- Evidence apply-once: keyed by **`evidenceIdentityKey`** (cycle scope + sorted FILE_VALID `(riderCode, actualMilli)` SHA-256); `reconcileBatchId` is audit/upload only. See amendment §7a (D-EVIDENCE-1).
- Supersession: explicit **Full Reverse + Re-Apply** only; delta-only waterfall correction forbidden (D-EVIDENCE-2).
- Crash safety: **apply-record-first** + recoverable liability; no wallet mutation without durable apply record (D-EVIDENCE-3).
- REQUEST ≠ collection; **v1:** `ledger_native` is **not** written on REQUEST and is **not** collection truth; `paidAmount` / `remainingAmount` / `amountDeductedMilli` are. Manual V2 must not treat create-time ledger append as collection. Future allocate dual-write needs separate Go (D-LEDGER-1). See amendment §9a.
- Terminology: use `FILE_INVALID` / `FILE_PARTIAL` / `FILE_VALID` for Manager files; use `PARTIALLY_ALLOCATED` for obligation allocation outcomes — never unqualified «PARTIAL» for both.

### Sheets
| Sheet | Role |
|---|---|
| `الاستقطاعات` | Operational requested ledger (auto + supervisor); additive obligation fields |
| `استقطاعات_المعدات_التلقائية` | Auto history / idempotency link to `deductionId` |
| `الاستقطاعات_الفعلية` | Manager Actual + reconcileBatchId + validation/complete-confirm fields |

### Cron
`/api/cron/equipment-auto-deductions` — daily; skips when flag off.  
**Cron creates REQUESTS only. Cron does not allocate ACTUAL.**  
Manager Compare / reconciliation performs post-payroll allocation.

When ON (future enablement Go):

- MAY create a new REQUEST only for a **genuinely new** eligible obligation/installment.
- MUST NOT create a new `deductionId` for an already-open remainder.
- For carried obligations: preserve `deductionId`, `originalAmount`, `originalCycleId`, `equipmentIssueId` / `installmentNumber` where applicable; update `currentCycleId` only (**queued, not re-requested**); **do not** advance `installmentsCompleted`.
- No wallet ACTUAL; no `amountDeductedMilli` / wallet-outstanding cut on request.
- Closing cycle: no new equipment REQUEST for that closing cycle.
- Activation in cycle N: first eligible equipment REQUEST only in next applicable eligible cycle.

### Manager Compare (reuse — no second uploader)
Existing Admin «استقطاعات المدير — مقارنة مع رفع المشرفين» extended additively:
- File states: `FILE_INVALID` / `FILE_PARTIAL` / `FILE_VALID(cycle)`.
- `FILE_INVALID` / `FILE_PARTIAL` ⇒ **no** cycle-final reconciliation / no allocation.
- `FILE_VALID` requires technical validation **and** explicit «ملف الدورة كامل» authorized by the **existing dual gate**: `deductions_reconcile` feature access **and** `deductions_verify` permission (D-PERM-1 VERIFIED). Confirmation is a **separate explicit action**. Do **not** invent a new permission.
- Missing rider must **NOT** become Actual=0 unless that specific cycle is `FILE_VALID` with complete-cycle confirmation.
- Allocate only when `FILE_VALID`; apply-once by `evidenceIdentityKey` / `(evidenceIdentityKey, deductionId)`; reprocessing ⇒ zero additional allocation and zero additional wallet liability effect unless explicit Full Reverse + Re-Apply.
- **§7a:** new `reconcileBatchId` alone ≠ second net apply; corrections require explicit audited Full Reverse + Re-Apply linked to prior evidence.

### Salary impact
Additive filter in `calculateSupervisorSalary` when auto flag ON (double-count guard vs legacy `المعدات` pricing) — still behind flag; no change while OFF.  
Salary/double-count guard must not treat REQUEST as collection.

### Flag
`FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` (default OFF; enablement requires separate Go).  
**Wording lock:** this flag gates Cron **REQUEST** creation + (separately) Manager Compare post-payroll **allocation** wiring + salary guard. The Cron itself does **not** allocate ACTUAL.

### Acceptance (amendment matrix — summary)
- Normative: amendment AT-01…AT-21 (includes FILE_INVALID, surplus, desk cash, corrected re-upload, closing/activation, non-equipment FIFO).

---

## Phase F — Manual deductions V2

### API
`/api/supervisor/manual-deductions` — riderCode, amount, reason from the **frozen vocabulary** (`سلفة` / `خصم تشغيل` / …). Future reason values may exist **only** after explicit SRS/config approval. Unknown values must **never** silently map to an “other” bucket.

### Ledger alignment (amendment)
- Manual V2 obligations participate in the same operational requested ledger semantics as `الاستقطاعات` (stable `deductionId`, original/paid/remaining, rollover identity).
- New supervisor upload of a different obligation does **not** automatically replace an open prior obligation; **Replace** is an explicit action.
- Excel upload remains available (legacy) and must not double-create conflicting paid semantics when Auto/reconcile paths are later enabled.
- **REQUEST ≠ collection:** creating a Manual/Auto REQUEST does not increase `paidAmount`, does not cut wallet liability (`amountDeductedMilli`), must **not** write `ledger_native` as collection on create, and must not treat create-time ledger append as paid.
- **v1 collection truth:** `paidAmount` / `remainingAmount` after ALLOCATED + wallet `amountDeductedMilli` for معدات. `ledger_native` is not collection truth for this flow (D-LEDGER-1). Any future allocate dual-write requires a separate Go. No new ledger architecture.

### Flag
`FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` (default OFF).

---

## Phase G — Inventory V2

Anomaly helpers on existing inventory counters; no schema break.

### Flag
`FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED`

---

## Phase H — Reports / reconciliation / Telegram

### Sheet `مطابقة_دورات_الاستقطاع`
Per-cycle snapshot metrics (operational snapshots).

### Dashboard metrics (amendment-locked — distinct from snapshots)
| Metric | Definition |
|---|---|
| New Requested This Cycle | Σ `originalAmount` of obligations **created** in this cycle |
| Carried Open Remaining | Σ `remainingAmount` of prior-cycle obligations currently carried into this cycle |
| Total Open Exposure | New Requested + Carried Open Remaining |

Carried Open Remaining must **not** be counted again as New Requested. Same `deductionId` remains identifiable across cycles.

Admin UI: equipment finance + Manager Compare / reconciliation (`FILE_VALID` / `FILE_PARTIAL` / `FILE_INVALID` + complete-cycle confirm).  
Telegram: aggregated job success/failure via `sendAdminTelegramNotificationSafe`.

---

## Audit domains (extend)

`AuditLogDomain` += `equipment` | `recruitment` | `payout_cycles`

---

## Admin feature keys (extend)

**Confirmed existing keys:** `payout_cycles`, `equipment_liability`, `auto_equipment_deductions`, `manual_deductions_v2`, `equipment_finance`, plus deductions compare dual-gate `deductions_reconcile` (feature) + `deductions_verify` (permission) for Manager Compare upload **and** explicit complete-cycle confirmation (D-PERM-1 VERIFIED). Do **not** invent new permissions.
