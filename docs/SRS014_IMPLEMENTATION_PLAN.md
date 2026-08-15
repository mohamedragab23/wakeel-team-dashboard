# SRS-014 Implementation Plan (Master)

**Constraint:** No Financial Apply enablement. No real money. No destructive migration.

## Phase order

| Phase | Scope | Money? | This Master pass |
|---|---|---|---|
| A | Recruitment completion / V2 docs & gaps | No | Document; no flag ON |
| B | Lecture/activation (existing) | No | No change |
| C | Equipment issuance + **swap rules** | Liability create only when Ledger ON | **YES — rules + wire** |
| D | Liability (preserve Phase C) | Flagged | Preserve |
| E | **Expected deduction snapshot** (calc) | No mutation | **YES** |
| F | Actual reconcile UI ↔ FILE_VALID | No Apply | Deferred (high risk UI merge) — documented |
| G | Returns UX | Flagged | Deferred |
| H | Equipment Ledger chronology (read) | No | Via Rider 360 |
| I | **Rider 360** read aggregate | No | **YES** |
| J | Admin KPIs New Requested/Carried | No | Deferred (needs SoT) |
| K | RBAC | No | Preserve |
| L | Production Financial Go prep | Separate human Go | **NOT IN SCOPE** |
| M | **Cycle month proposal** helper | No | **YES** |

## This Master Implementation deliverables

1. `lib/equipmentLiability/swapRules.ts` + tests + delivery approve wiring  
2. `lib/equipmentDeductions/expectedSnapshot.ts` + API + admin UI (calc only)  
3. `lib/payoutCycles/monthProposal.ts` + tests (+ optional admin helper API)  
4. Rider 360 read API + admin page  
5. Docs: Audit / Dependency / Plan / Final Status  
6. Full test suite green; Financial Apply remains OFF  

## Explicitly deferred (future Go)

- Wire `deductions-reconcile` UI to `managerCompare` / evidence persist  
- Enable any production flag  
- First controlled financial apply  
- Reverse / Re-Apply  
- Amendment KPI dashboard  
- Destructive price migration from admin sheet → money.ts  

## Risk notes

| Change | Risk | Mitigation |
|---|---|---|
| Swap bag free | Medium if Ledger ON | Pure rules + tests; تعيين path unchanged |
| Expected snapshot | Low | Read-only calc |
| Rider 360 | Low | Read aggregate |
| Cycle proposal | Low | Proposal only; admin still creates rows |
