# PHASE 4D.5.4.6 — SECURITY PRICE CONFIGURATION + READ-ONLY PRODUCTION RE-VERIFY

**Date:** 2026-08-13  
**Mode:** Configuration / UI–API consistency (NOT financial Go)  
**Financial Apply:** OFF  
**Financial mutations:** 0  
**First transaction:** NOT EXECUTED  
**Deploy:** NOT PERFORMED  

---

## 1) Current UI state (production screenshot + local source)

### Production (Vercel) — as inspected by Admin

Visible fields only:

| Field | Value |
|---|---|
| Motorcycle Bag | 530 |
| Bicycle Bag | 530 |
| T-Shirt | 135 |
| Jacket | 0 |
| Helmet | 0 |
| **Security Check** | **NOT VISIBLE** |

Example total on screen: **800** (= 530 + 2×135) — correct for security-paid equipment subtotal.

### Local repository source (`app/admin/equipment-pricing/page.tsx`)

Security Check field **exists in source** (label: الاستعلام الأمني / Security Check), plus API persistence for `securityCheck`.

**Verdict:**

```
PRODUCTION UI/DEPLOYMENT MISMATCH = YES
```

Production is serving a **stale build** without the Security field, while local code already includes it.

---

## 2) Current API state (local)

| Item | Status |
|---|---|
| GET `/api/admin/equipment-pricing` | Returns `data` + `meta.needsSecurityColumnSave` |
| POST save | Writes A2:F2 including `securityCheck` |
| Headers | `motorcycleBox … helmet, securityCheck` |

---

## 3) Current persistence state (live Sheets, prior read-only probes)

| Item | Status |
|---|---|
| Sheet `أسعار_المعدات` header | 5 columns only (no `securityCheck`) |
| Row values | 530 / 530 / 135 / 0 / 0 |
| Liability create load | **FAIL CLOSED** until security persisted |

---

## 4) Current pricing provider

```
Admin Sheets → requireAdminEquipmentPricingForLiability() → snapshot → NEW liability
```

Fail closed if `securityCheck` missing.  
`money.ts` is **not** create-path SoT.

---

## 5) Current securityCheck state

| Layer | State |
|---|---|
| Local UI code | Present |
| Production UI | **Missing (stale deploy)** |
| Sheets column F | **Missing until Admin Save after deploy** |
| Liability consume | Blocked until persisted |

---

## 6) Source-of-truth verdict

| Question | Answer |
|---|---|
| Admin Equipment Pricing SoT for NEW liabilities? | **YES (code)** |
| Competing silent 550 on create? | **NO** (fail closed) |
| Production config complete with Security=100? | **NO** — UI not deployed + column not saved |

---

## 7) What this phase changed (safe, minimal)

1. **Admin UI loader merge:** if Sheets has 530/530/135/0/0 but no security column, UI preserves those values and suggests `securityCheck=100` with `needsSecurityColumnSave=true` — **display only**; liability create still fail-closed.  
2. **Approved defaults:** jacket/helmet display defaults aligned to **0** (match current business / production).  
3. **UI banner + highlighted Security card** when security column not yet persisted.  
4. **Example copy** clarifies 800 (paid) vs 900 (unpaid + security).  
5. **Tests** for merge + fail-closed + 800/900.

**Did NOT:** change business 530/135, enable FA, create liability, deploy, mutate rider money.

---

## 8) 800 / 900 verification

| Case | Formula | Milli | Installments |
|---|---|---|---|
| Security paid | 530 + 270 | 80000 | 26667+26667+26666 |
| Security unpaid | 530 + 270 + 100 | 90000 | 30000×3 |

Covered by `adminUiPricing.test.ts` + existing `pricing.test.ts`.

---

## 9) Price snapshot verification

Unchanged architecture: NEW create persists snap fields; old liabilities not recalculated from live Admin prices.

---

## 10) Old liability protection

Still enforced (persisted originals; schedule from original). No production liabilities present to reprice.

---

## 11) Deployment mismatch

```
PRODUCTION UI/DEPLOYMENT MISMATCH
```

**Exact next human action (order matters):**

1. **Deploy** the current dashboard build that includes Security UI (human/ops deploy — agent did **not** deploy).  
2. Open Admin → أسعار المعدات.  
3. Confirm values: 530 / 530 / 135 / 0 / 0 / **Security 100**.  
4. Click **حفظ الأسعار** once (writes `securityCheck` to Sheets).  
5. Optionally set Closing `equipmentDeductionEnabled=false`.  
6. Create ONE real liability via **normal equipment delivery approve** (when ledger path intentionally used) — **not** manual Sheets, **not** Financial Apply.  
7. Re-run **Read-Only Real Rider Mirror** (4D.5.4.5/4D.5.4.6).  

---

## 12) Tests

| Suite | Result |
|---|---|
| adminUiPricing + pricing + liability + expected + MC orch + FA safety | **34 / 34 PASS** |
| pricing/* + liability + swap + FA safety + controlled pack | run confirmed PASS |

Financial Apply OFF; mutations 0.

---

## 13) Flags

```
FEATURE_SRS014_FINANCIAL_APPLY_ENABLED = OFF
```

---

## 14) Remaining blockers before Real Rider Mirror PASS

| # | Blocker |
|---|---|
| 1 | Production deploy of Security UI |
| 2 | Admin Save with `securityCheck=100` |
| 3 | At least one real persisted liability via normal delivery workflow |
| 4 | Actual payroll file for eligible cycle (for full Expected=Actual=Allocated) |
| 5 | Closing config hygiene (optional but recommended) |

---

## 15) Explicit gates

| Gate | Status |
|---|---|
| A. Security pricing configured (code defaults / UI source) | **PASS** (local) |
| B. Security pricing persisted (Sheets) | **BLOCKED** |
| C. Security pricing exposed in Admin UI | **PASS** (local) / **BLOCKED** (production deploy) |
| D. New Liability consumes Admin pricing | **PASS** (code) / **BLOCKED** until Save |
| E. Immutable price snapshot | **PASS** (code) |
| F. Existing liabilities protected | **PASS** (code) |
| G. 800/900 business rules | **PASS** |
| H. Full suite | see test run |
| I. Financial Apply OFF | **PASS** |
| J. Financial mutations = 0 | **PASS** |
| K. First transaction NOT EXECUTED | **PASS** |

---

## Final verdict

```
SECURITY PRICE CONFIGURATION = BLOCKED
```

**Why:** Local/code path is ready, but **production UI is stale** and **Sheets lacks `securityCheck`**. Until deploy + Admin Save, NEW liability SoT cannot complete.

```
FINANCIAL_APPLY = OFF
FINANCIAL_MUTATIONS = 0
FIRST_FINANCIAL_TRANSACTION = NOT_EXECUTED
DEPLOY = NOT PERFORMED
WAITING_FOR_HUMAN: deploy → save Security=100 → real liability via delivery → re-mirror
```

**STOP.** Do not interpret this as Financial Go.
