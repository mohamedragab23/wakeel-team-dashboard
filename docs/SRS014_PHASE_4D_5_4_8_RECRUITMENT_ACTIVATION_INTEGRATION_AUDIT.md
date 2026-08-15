# PHASE 4D.5.4.8 — RECRUITMENT → ACTIVATION → OPERATIONS ASSIGNMENT  
# SAFE INTEGRATION GAP AUDIT + CLOSURE

**Date:** 2026-08-13  
**Continuing from:** `docs/SRS014_PHASE_4D_5_4_7_REAL_RIDER_LIABILITY_READ_ONLY_MIRROR.md`  
**Financial Apply:** OFF  
**Liability created:** 0  
**Pending production candidates/deliveries mutated:** **NO** (including 4821034)  

---

## Executive Verdict

| Chain | Verdict |
|---|---|
| Recruitment → Activation → Operations Assignment | **PARTIAL** (code rules strengthened; production data still incomplete) |
| Equipment eligibility for Real Rider Mirror | **BLOCKED** |
| Pricing SoT / Snapshot | **PASS** (unchanged) |
| Overall phase | **BLOCKED for Mirror — SAFE code gaps closed** |

**Root narrative:** The Equipment engine can fail-closed correctly, but Production cannot hand it a Phase-C-ready Candidate. The 4 “pending” items are **equipment delivery rows** in `تسليم_المعدات` for riders already in `المناديب`, **not** recruitment candidate requests. There is **no Candidate.riderCode link**, so approve → liability returns `CANDIDATE_NOT_FOUND`.

---

## Root Cause

**K — Multiple causes** (traced in code + live Sheets):

| Code | Finding |
|---|---|
| **C** Missing candidate ↔ rider linkage | Deliveries / `المناديب` use rider codes; `مرشحين_التعيين.riderCode` is empty for **0/552** |
| **E** Missing riderCode assignment source | Rider code is **manual** on Candidate; **no sync** from `المناديب` or assignment-request approve → `RIDER_CODE_SOURCE_GAP = BLOCKED` |
| **F** Missing Security recording | **0** candidates with explicit PAID/NOT_PAID; create path previously defaulted omitted security to `NOT_PAID` (inference) |
| **G** Missing Ops Supervisor assignment | **0** with `finalAssignedSupervisorCode` |
| **D** Activation without riderCode | **17** activated via confirm/status while V2 activation validation skipped when flag OFF / confirm-only path |
| **I** Legacy parallel model | `طلبات_التعيين` + `تسليم_المعدات` can operate on live riders without Candidate |
| **J** Flag / path mismatch | Production has `FEATURE_EQUIPMENT_LEDGER_ENABLED` set; liability create path live while Candidate prerequisites empty |
| **A/B** Partial UI/API | Security managed via `/security-fee` (V2-gated); PUT strips `securityInquiryPayment`; UI previously displayed empty as NOT_PAID |

**Not the problem:** Pricing (530/530/135/0/0/100 PASS). Approval orchestration itself correctly blocks incomplete Phase C.

---

## Chain trace (where it breaks)

```
Recruitment Candidate (مرشحين_التعيين)
  → Personal / contacts          [fields exist; V2 contacts gated]
  → Security PAID|NOT_PAID       [BREAK in prod: UNKNOWN for all]
  → Lecture / attendance         [fields exist]
  → Activation                   [17 activated WITHOUT riderCode]
  → Rider Code                   [BREAK: empty; no authoritative auto-source]
  → Ops Supervisor (Admin)       [BREAK: empty finals; Admin UI exists]
  → Equipment eligibility        [Phase C fail-closed]
  → Equipment Delivery           [4 pending تعيين exist on live riders]
  → Liability                    [cannot create — CANDIDATE_NOT_FOUND]
```

Next stage consumption: Delivery approve looks up **Candidate by delivery riderCode** (`findCandidateByRiderCode` → `assertPhaseCCandidateReady`). Live-rider-only deliveries never enter that map.

---

## Real Production “pending” (4)

**Clarification:** these are **`EQUIPMENT_DELIVERY_PENDING`** rows (`تسليم_المعدات`), **not** recruitment applications.

| deliveryRow | riderCode | name (min) | zone | type | bag/shirts | in المناديب | Candidate by riderCode | Security | Ops | Phase C | Gap type |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 122 | 4821034 | Mostafa Fathy… | Alexandria | تعيين | moto×1 / 2 | Yes (join 8/9) | **No** | UNKNOWN | none | `CANDIDATE_NOT_FOUND` | **HUMAN_ACTION** + linkage gap |
| 123 | 4822961 | Mohamed Saied… | Alexandria | تعيين | bike×1 / 2 | Yes (join 8/10) | **No** | UNKNOWN | none | `CANDIDATE_NOT_FOUND` | **HUMAN_ACTION** + linkage gap |
| 124 | 4826265 | Mohamed Ahmed… | Alexandria | تعيين | moto×1 / 2 | Yes (join 8/11) | **No** | UNKNOWN | none | `CANDIDATE_NOT_FOUND` | **HUMAN_ACTION** + linkage gap |
| 125 | 4828725 | Mohamed Ayman… | Alexandria | تعيين | shirt×1 only | Yes (join 8/12) | **No** | UNKNOWN | none | `CANDIDATE_NOT_FOUND` | **HUMAN_ACTION** + linkage gap |

**4821034 specifically:** Legitimate **live rider** with a pending **equipment** طلب تعيين. **Not** proven as a Recruitment Candidate ready for the next V2 step. Fuzzy name match to candidates: **none**. Do **not** auto-link or invent Candidate fields.

Post-phase recheck: same 4 pending, still 0 liabilities, candidates unchanged (552 / 0 riderCodes).

---

## Implementation (safe code only)

| File | Change | Why safe |
|---|---|---|
| `lib/recruitment/phaseB.ts` | Require riderCode also when `activationConfirmed` → `مؤكد` | Prevents confirm-only activation without authoritative code; does not invent codes |
| `app/api/recruitment/candidates/[id]/route.ts` | Always run lecture/activation Phase B validation even if V2 flag OFF | Closes V2-OFF bypass; no Sheets mutation of the 4 pendings |
| `app/api/recruitment/candidates/route.ts` | Stop defaulting omitted security to `NOT_PAID` | Honors UNKNOWN; no inference |
| `lib/recruitment/equipmentEligibility.ts` | New pure readiness checklist + explicit Security UNKNOWN | Read-only assess; no liability |
| `lib/recruitment/equipmentEligibility.test.ts` | New tests for eligibility / security / ops / FA OFF | No money |
| `lib/recruitment/phaseB.test.ts` | Confirm-only activation requires riderCode | Regression |
| `components/recruitment/CandidateEditModal.tsx` | Security select shows UNKNOWN; no silent NOT_PAID display | UI honesty |
| `components/recruitment/NewCandidateForm.tsx` | Security starts empty; human must choose | No invent |
| `scripts/srs014-phase-4d548-pending-audit.ts` | Read-only audit probe | No writes |

**Not done (correctly):** enable Financial Apply; create Liability; mutate 4821034; invent riderCode/Security/Ops; auto-approve; sync fake Candidate from live rider.

---

## Tests

| Suite | Result |
|---|---|
| Relevant (equipmentEligibility + phaseB + phaseC + FA safety) | **63 / 63 PASS** |
| Full SRS-014 + recruitment | **359 / 359 PASS** |

---

## Financial Safety

| Marker | Value |
|---|---|
| Financial Apply | **OFF** |
| Financial mutations | **0** |
| Liability created | **0** |
| Wallet mutations | **0** |
| Ledger mutations | **0** |
| First transaction | **NOT EXECUTED** |
| Dirty tree | preserved (no clean/stash) |

---

## Human Actions Required

Do **not** ask the agent to invent or auto-fill these for Mirror convenience.

1. **Decide policy** for live riders who got equipment deliveries outside Candidate linkage (legacy path vs onboard into Recruitment).  
2. For any rider chosen for first real liability (possibly 4821034 **only if** business confirms identity):  
   - Authorized human confirms/creates the real Candidate record  
   - Records **Security = PAID or NOT_PAID** (real fact — never invent)  
   - Confirms activation with **authoritative riderCode** from the real rider source (`المناديب` / Talabat — human-entered, not generated)  
   - Admin assigns the **real** Operations Supervisor (`finalAssignedSupervisorCode`)  
3. Only then Admin-approves the matching **pending delivery** via normal UI.  
4. Re-run Real Rider Read-Only Mirror under a **separate explicit instruction**.  
5. Even if Mirror = PASS later: **still no financial Go**.

---

## FINAL GATE

| Gate | Status |
|---|---|
| RECRUITMENT DATA MODEL | **PARTIAL** |
| ACTIVATION WORKFLOW | **PARTIAL** (rules hardened; prod activated rows still incomplete historically) |
| RIDER CODE SOURCE | **BLOCKED** (manual only; no auto authoritative sync) |
| SECURITY STATUS | **PARTIAL** (fail-closed + no invent; prod still UNKNOWN) |
| OPERATIONS SUPERVISOR ASSIGNMENT | **PARTIAL** (Admin UI exists; prod empty) |
| EQUIPMENT ELIGIBILITY | **BLOCKED** (no Phase-C-ready Candidate) |
| PRICING SOT | **PASS** |
| PRICE SNAPSHOT | **PASS** (architecture) |
| FINANCIAL APPLY | **OFF** |
| FINANCIAL MUTATIONS | **0** |
| REAL RIDER MIRROR | **NOT_AVAILABLE / BLOCKED** |
| FIRST FINANCIAL TRANSACTION | **NOT EXECUTED** |

```
RECRUITMENT → ACTIVATION → OPS ASSIGNMENT = PARTIAL
REAL_RIDER_MIRROR = BLOCKED
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED
PHASE 4D.5.4.8 = COMPLETE (audit + safe closure) / MIRROR STILL BLOCKED
```

---

## STOP

- DO NOT continue to financial execution.  
- DO NOT create a Liability just to complete the Mirror.  
- DO NOT approve or modify real pending delivery/candidate rows automatically.  
- Next Mirror attempt requires **human business completion** of a real Candidate chain, then a **separate** instruction.
