# SRS-014 Dependency Map

**Rule:** Calculation / Reconciliation automation ≠ Financial Mutation.

```
Recruitment (مرشحين_التعيين)
    ↓ lecture / attendance (manual statuses)
Activation + Rider Code
    ↓ Ops Supervisor assignment (admin)
Equipment Delivery (تسليم_المعدات)
    ↓ [FLAG: EQUIPMENT_LEDGER]
Equipment Liability (عهدة_المعدات)   ← financial TRIGGER (issue)
    ↓
Cycle Engine (دورات_القبض) + Payday (admin)
    ↓ eligibility (activation / closing)
Expected / REQUEST (الاستقطاعات)   ← CALCULATION  [FLAG: AUTO]
    ↓
Admin Actual file (استقطاعات المدير…)  ← ACTUAL SoT (after payday)
    ↓ [lib: managerCompare + evidence]  UI LINK BROKEN (legacy reconcile)
ALLOCATED apply-records (سجلات_تطبيق_التخصيص)
    ↓
Financial Apply Intent (نوايا_التطبيق_المالي)  ← MUTATION  [FLAG: FINANCIAL_APPLY = OFF]
    ↓ wallet updateBalance + ledger_native
COMPLETED / Equipment Ledger history
    ↓
Return / Waive (استرجاع + تسوية)  [FLAG: RETURNS_V2]
    ↓ closes future carry-forward
```

## Separation of concerns (mandatory)

| Layer | Meaning | Automation allowed? | Money mutation? |
|---|---|---|---|
| **Calculation** | Expected installment, eligibility, REQUEST mint | YES (flagged) | NO |
| **Reconciliation** | Expected vs Actual → allocate / CF | YES (lib; UI gap) | NO until Apply |
| **Financial Mutation** | Wallet + ledger + COMPLETED intent | **NO until separate Go** | YES (gated OFF) |

## Broken links (must fix for operational completeness)

| Link | Status |
|---|---|
| Delivery `تبديل` → liability economics | Was BROKEN (treated as assignment) |
| Manager Compare lib → reconcile UI | BROKEN |
| Evidence/Allocation → operator confirm → Apply | Apply API only; flag OFF |
| REQUEST cron → Expected queue UI | Was MISSING |
| Recruitment → Equipment eligibility | Partial (activation date on liability) |
| Return waive → stops CF | Partial (settlement amounts UX) |
| Rider 360 across SoRs | Was MISSING |

## Source of truth map

| Domain | SoT | Consumers | Risk |
|---|---|---|---|
| Rider identity / activation | Recruitment candidate | Liability gates, eligibility | OK |
| Equipment prices (liability) | `lib/money.ts` constants | Liability create | Dup vs admin sheet |
| Equipment prices (legacy salary) | `أسعار_المعدات` | salaryService | Dup |
| Cycle / Payday | `دورات_القبض` Admin | eligibility, cron, ledger meta | OK |
| Expected / REQUEST | `الاستقطاعات` obligations | Manager Compare, Apply | OK when Auto ON |
| Actual | Manager Excel evidence (SRS) / legacy actual sheet | Allocate | Dual paths |
| Allocated | Apply records | Financial Apply | OK |
| Wallet liability | `عهدة_المعدات` | Financial Apply, Desk | Flag OFF apply |
| Payroll ledger | ledger_native | Financial Apply | Flag OFF apply |
| Inventory counters | `المخزون_الرئيسي` | Delivery/return approve | OK |

## Flags gating each hop

| Hop | Flag |
|---|---|
| Recruitment V2 enforcement | `FEATURE_RECRUITMENT_V2_ENABLED` |
| Cycles API | `FEATURE_PAYOUT_CYCLES_ENABLED` |
| Liability on delivery approve | `FEATURE_EQUIPMENT_LEDGER_ENABLED` |
| Auto REQUEST | `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` |
| Returns settlement | `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` |
| Financial Apply | `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` (**must stay OFF**) |
