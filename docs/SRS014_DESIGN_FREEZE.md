# SRS-014 — Design Freeze

**Status:** FROZEN for implementation.  
**Companion:** `docs/SRS014_EQUIPMENT_RECRUITMENT_AUTOMATION_ARCHITECTURE.md`  
**Global rules:** additive only; flags default OFF; no existing sheet deletes/renames; no Rooster live/auth changes; integer milliemes for money.

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
equipmentIssueId, riderCode, riderNameSnapshot, zoneSnapshot, supervisorCodeSnapshot, supervisorNameSnapshot, issueDate, activationDate, bagType, bagCostMilli, shirtQty, shirtCostMilli, securityFeeMilli, securityPaidUpfront, originalLiabilityMilli, outstandingMilli, amountDeductedMilli, installmentsCompleted, status (`open|settled|waived|closed`), deliveryRowRef, createdAt, createdBy, …

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
- Cash payments update `settlementPaidMilli` only; they must **not** modify `amountDeductedMilli` or installment index.
- Permission: admin feature key `equipment_liability`. UI: `/admin/equipment-liability`.

Distinction:

| Concept | Flag / sheet |
|---|---|
| A) Equipment liability cash payment | Ledger ON · `مدفوعات_عهدة_المعدات` |
| B) Physical return / return settlement | Returns V2 · `تسوية_استرجاع_المعدات` |
| C) Auto deduction | Auto flag · `استقطاعات_المعدات_التلقائية` |

---

## Phase D — Returns V2

### Sheet `تسوية_استرجاع_المعدات`
settlementId, equipmentIssueId, riderCode, returned items, settlementPaidMilli, waivedMilli, waiverReason, approvedBy, approvedAt, status, …

### Flag
`FEATURE_EQUIPMENT_RETURNS_V2_ENABLED`

---

## Phase E — Auto deductions

### Sheet `استقطاعات_المعدات_التلقائية`
transaction/idempotency fields per architecture doc.

### Cron
`/api/cron/equipment-auto-deductions` — daily; skips when flag off.

### Salary impact
Additive filter in `calculateSupervisorSalary` when auto flag ON.

### Flag
`FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED`

### Acceptance
- Closing skip; activation next-cycle; partial carry; duplicate cron no double post; no legacy double-count.

---

## Phase F — Manual deductions V2

### API
`/api/supervisor/manual-deductions` — riderCode, amount, reason (`سلفة`/`خصم تشغيل`), cycleId, notes.

Posts `ledger_native` with category `manual_advance` | `manual_operational_deduction`.

Excel upload remains available (legacy).

### Flag
`FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED`

---

## Phase G — Inventory V2

Anomaly helpers on existing inventory counters; no schema break.

### Flag
`FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED`

---

## Phase H — Reports / reconciliation / Telegram

### Sheet `مطابقة_دورات_الاستقطاع`
Per-cycle snapshot metrics.

Admin UI: equipment finance + reconciliation.  
Telegram: aggregated job success/failure via `sendAdminTelegramNotificationSafe`.

---

## Audit domains (extend)

`AuditLogDomain` += `equipment` | `recruitment` | `payout_cycles`

---

## Admin feature keys (extend)

`payout_cycles`, `equipment_liability`, `auto_equipment_deductions`, `manual_deductions_v2`, `equipment_finance`
