# PHASE 4D.5.4.15 — CONTROLLED OPENING BALANCE PILOT

**Date:** 2026-08-15  
**Mode:** Controlled FLOW A Opening Liability persist (pilot allowlist only)  
**Continuing from:** `docs/SRS014_PHASE_4D_5_4_14_OPENING_RECONCILIATION_UI.md`

---

## Executive Output

```
PHASE = 4D.5.4.15
FLOW_A = OPENING_BALANCE_PILOT
FINANCIAL_APPLY = OFF
AUTO_REQUEST = OFF
WALLET_MUTATIONS = 0
FINANCIAL_LEDGER_MUTATIONS = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED
DEPLOY = NO
TEST_SUITE = 437/437 PASS
pilot riderCodes actually written = []
OPENING_LIABILITIES_CREATED = 0
```

---

## Safety gates

| Gate | Mechanism |
|---|---|
| Write flag | `FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED=true` |
| Allowlist | `FEATURE_SRS014_OPENING_PILOT_ALLOWLIST` (max 3 codes) |
| Hard block | `4811093` always refused |
| Admin auth | `equipment_liability` |
| Confirm | `confirmPersist=true` after preview |
| Concurrent | Redis NX locks on `OPENING:<riderCode>` + rider |
| Idempotency | `OPENING:<riderCode>` — return existing, no rewrite |
| Audit | `create_opening_liability` |

Persist still uses `createOpeningLiability` + `appendLiabilityIssue` only.

---

## Live Production write status

This phase **implements** the controlled pilot path.  
**No live Production Opening rows were created in this phase run** (no invented Security/paid; allowlist empty by default; write flag OFF by default).

To execute a live pilot write (human Go):

1. Set `FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED=true` (runtime env — not auto-deployed here)
2. Set `FEATURE_SRS014_OPENING_PILOT_ALLOWLIST=<1–3 riderCodes>` (never 4811093)
3. Equipment Manager enters real reconciliation on `/admin/equipment-reconciliation`
4. Preview → Confirm persist

```
pilot riderCodes actually written = []
OPENING_LIABILITIES_CREATED = 0
duplicate attempts = 0
failed writes = 0
```

---

## API

`POST /api/admin/equipment-reconciliation`

- `action=preview` — dry-run  
- `action=persist` + `confirmPersist=true` — pilot write path  

---

## Files

| File | Role |
|---|---|
| `lib/equipmentLiability/openingPilotAllowlist.ts` | Allowlist + write gate |
| `lib/equipmentLiability/openingPilot.ts` | Persist orchestration + verify + Expected dry-run |
| `lib/equipmentLiability/openingPilot.test.ts` | Cases 1–18 |
| `lib/equipmentLiability/openingBalance.ts` | Allowlist on persist; idempotent PERSISTED mode |
| `lib/equipmentLiability/store.ts` | `appendLiabilityIssue` |
| `lib/srs014Flags.ts` | `isSrs014OpeningBalanceWriteEnabled` |
| `app/api/admin/equipment-reconciliation/route.ts` | persist action |
| `app/admin/equipment-reconciliation/page.tsx` | Persist button (allowlisted) |
| `docs/SRS014_PHASE_4D_5_4_15_CONTROLLED_OPENING_BALANCE_PILOT.md` | this doc |

---

## Tests

| Suite | Result |
|---|---|
| Full SRS-014 + recruitment + opening pilot | **437 / 437 PASS** |

---

## 4811093

```
IDENTITY_READY = YES
RECONCILIATION_DATA_COMPLETE = NO
OPENING_LIABILITY = NONE
```

Not written. Not on allowlist (hard-blocked).

---

## STOP

Do **not** enable Auto REQUEST or Financial Apply next without a separate explicit Go.  
Do **not** bulk-migrate. Do **not** modify 4811093.
