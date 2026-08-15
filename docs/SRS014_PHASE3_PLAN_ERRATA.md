# SRS-014 — Phase 3 Implementation Plan Errata

**Status:** Normative errata.  
**Date context:** Phase 3.4 (after Phase 3.1/3.2 decision locks and H-1 documentation lock).

## Supersession notice

The Phase 3 **Implementation Planning** output delivered in chat is **advisory only** for file/impact inventory and sequencing.

Where that Phase 3 chat plan conflicts with the finalized SRS documents, **the SRS wins**:

1. `docs/SRS014_AMENDMENT_POST_PAYROLL_RECONCILE.md`
2. `docs/SRS014_DESIGN_FREEZE.md`
3. `docs/SRS014_EQUIPMENT_RECRUITMENT_AUTOMATION_ARCHITECTURE.md`

No separate full Phase 3 plan markdown file existed in the repository at the time of this errata. This document is the in-repo record that the chat plan’s stale evidence/idempotency wording is **superseded**.

---

## Explicitly superseded Phase 3 chat wording

| Stale Phase 3 chat guidance | Normative replacement (SRS) |
|---|---|
| `(reconcileBatchId, deductionId)` as primary economic apply-once key | **`evidenceIdentityKey`** is the normative economic apply-once identity; line key = `(evidenceIdentityKey, deductionId)` |
| `reconcileBatchId` as economic identity | **`reconcileBatchId`** = upload/audit identifier **only** |
| D-EVIDENCE-1/2/3 “needs separate business Go” | **LOCKED** in SRS §7a (Phase 3.1/3.2) |
| Supersession model unspecified / delta possible | **Full Reverse + Re-Apply** only; delta-only waterfall correction **forbidden** |
| Crash model deferred | **Apply-record-first** + recoverable liability; no wallet mutation without durable apply record |
| D-LEDGER-1 open | **LOCKED:** no `ledger_native` on REQUEST; `ledger_native` is **not** collection truth for this path (v1); future allocate dual-write needs separate Go |
| D-PERM-1 assumption | **VERIFIED:** dual-gate `deductions_reconcile` + `deductions_verify`; explicit confirm action; **no new permission** |
| `installmentsCompleted` unspecified | **LOCKED (H-1 / §5a):** advance only when معدات installment `remainingAmount = 0` via ALLOCATED; never on REQUEST / rollover / partial / desk cash; reverse completion only if caused by reversed apply |

---

## Implementer instruction

Before any Phase 4 code:

1. Treat the three SRS docs as the only financial/contract source of truth.  
2. Do **not** implement apply-once keyed primarily by `reconcileBatchId`.  
3. Do **not** treat current repo Auto paid-on-cron + Y-gate behavior as target semantics.  
4. Do **not** enable Auto flags or run migrations without separate Gos.

**PHASE 4 remains NOT APPROVED by this errata alone.**
