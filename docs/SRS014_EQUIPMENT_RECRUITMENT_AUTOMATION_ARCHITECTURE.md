# SRS-014 — Equipment / Recruitment / Auto-Deductions Architecture

**Status:** Design frozen — implement phase-by-phase behind feature flags (default OFF).  
**Companion:** `docs/SRS014_DESIGN_FREEZE.md`  
**Baseline:** existing production dashboard on `main` (SRS-013 payroll ledger + equipment delivery/return + recruitment pipeline already shipped).

---

## 1. Business objective

Automate the operational + financial path:

Recruitment → Lecture → Activation → Admin assignment → Equipment issue (900/800 liability) → Cycle-based installments → Return/settlement/waiver → Manual advances/ops deductions → Reconciliation + audit + Telegram.

Supervisors must **not** need Excel for *new* equipment deductions. Legacy Excel upload remains for rollback.

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
| Audit / Telegram / cron / flags | SRS-013 patterns | Copy |

**Do not touch:** `lib/roosterLive/*` auth/sync, destructive sheet renames/deletes, floating-point money, hard-coded month calendars.

---

## 3. Critical financial rules

1. Liability components (milliemes; 1 EGP = 100): bag 53000 + shirts 27000 + security 10000 = **90000**.
2. Motorcycle and bicycle bag both cost 53000. Jacket/helmet = custody only.
3. Security paid upfront → remaining **80000** → installments 26667 + 26667 + 26666 (remainder front-loaded into earlier installments).
4. Not paid → remaining **90000** → 30000 × 3.
5. Installments across **3 eligible deduction cycles** (not calendar weeks).
6. No equipment auto-deduction in **closing** cycle; liability carries forward.
7. Activation during cycle N → first equipment deduction in next eligible cycle.
8. Insufficient payout → partial deduct + carry remainder.
9. Idempotency key: `equipment:{riderCode}:{equipmentIssueId}:{cycleId}:{installmentNumber}`.
10. History survives user/rider/supervisor deletion via snapshots.

**Double-count guard:** when `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` and rider has active `equipment_issue`, exclude that rider from legacy `المعدات` × pricing contribution in salary calc.

---

## 4. Feature flags (default OFF)

| Flag | Gates |
|---|---|
| `FEATURE_RECRUITMENT_V2_ENABLED` | Contacts, security fee fields, lecture/activation upgrades |
| `FEATURE_PAYOUT_CYCLES_ENABLED` | Cycle CRUD + Admin UI |
| `FEATURE_EQUIPMENT_LEDGER_ENABLED` | Liability creation on issue + **Equipment Liability Management Desk** (cash payments) |
| `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | Cron + engine + salary guard |
| `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | Physical return + return-settlement / waiver sheet |
| `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | Supervisor form (no Excel) |
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
| `استقطاعات_المعدات_التلقائية` | Auto deduction history (append-only) |
| `تسوية_استرجاع_المعدات` | Physical return settlement / waiver (Returns V2) |
| `مطابقة_دورات_الاستقطاع` | Cycle reconciliation snapshots |

Existing tabs extended additively only (headers via `ensureHeaderRow`).

---

## 6. Architecture

```
Recruitment V2 → Activation (rider_code)
       ↓
Admin assigns Ops Supervisor
       ↓
Equipment issue → عهدة_المعدات (900/800 once)
       ↓
Liability Desk (cash payments) → مدفوعات_عهدة_المعدات  [Ledger ON; not Returns]
       ↓
Payout cycles (دورات_القبض)
       ↓
Auto engine (cron) → ledger_native + استقطاعات_المعدات_التلقائية  [Auto ON; separate]
       ↓
Salary fold-in (no double-count)
       ↓
Return → return-settlement/waiver → ledger + audit  [Returns V2; separate]
```

Money: `lib/money.ts` (integer milliemes).  
Cycles: `lib/payoutCycles/*`.  
Liability: `lib/equipmentLiability/*`.  
Engine: `lib/equipmentDeductions/engine.ts`.

---

## 7. Permissions

| Actor | Can |
|---|---|
| `recruitment_manager` | Applications, contacts, lecture, activation; **not** ops assign / cycles / waivers |
| Supervisor | Manual V2 for owned riders; issue/return if authorized |
| Admin (+ feature keys) | Cycles, assign, waivers, corrections, reports |

Server-side enforcement on every API.

---

## 8. Phased delivery

| Phase | Scope |
|---|---|
| A | Money + payout cycles |
| B | Recruitment V2 |
| C | Equipment liability |
| D | Return / settlement / waiver |
| E | Auto deductions + salary guard |
| F | Manual deductions V2 |
| G | Inventory V2 flags |
| H | Reports / reconciliation / Telegram aggregates |

---

## 9. Rollback

Flip flags OFF. Do not delete new sheets. Legacy Excel + `المعدات` salary path remains.

---

## 10. Acceptance (global)

- All 25 business rules from the product brief.
- Flags OFF ⇒ byte-identical existing behavior for salary/equipment/recruitment APIs.
- SRS-013 Phase 3 regression still passes.
- No Rooster live/auth changes.
