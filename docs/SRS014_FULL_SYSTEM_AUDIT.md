# SRS-014 Full System Audit

**Date:** 2026-08-13  
**Method:** Repository inspection of routes, services, Sheets adapters, flags, UI, tests.  
**Safety:** Financial Apply remains OFF. No real money executed during this audit.

**Flag snapshot (local process at audit time):** all SRS-014 flags `false` unless env `=== 'true'`.

| Flag | Env | Default |
|---|---|---|
| Recruitment V2 | `FEATURE_RECRUITMENT_V2_ENABLED` | OFF |
| Payout Cycles | `FEATURE_PAYOUT_CYCLES_ENABLED` | OFF |
| Equipment Ledger | `FEATURE_EQUIPMENT_LEDGER_ENABLED` | OFF |
| Auto Equipment Deductions | `FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED` | OFF |
| Returns V2 | `FEATURE_EQUIPMENT_RETURNS_V2_ENABLED` | OFF |
| Manual Deductions V2 | `FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED` | OFF |
| Inventory V2 | `FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED` | OFF |
| Financial Apply | `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` | OFF |

---

## Legend

| Status | Meaning |
|---|---|
| DONE | Code + tests/UI exist and match stated rule |
| PARTIAL | Exists but incomplete / mismatched |
| MISSING | Not found in code |
| FLAGGED | Implemented but OFF by default |
| LEGACY | Pre-SRS path still active |
| NOT SAFE TO ENABLE | Must not turn ON without separate Go |
| BROKEN | Integration gap / incorrect behavior |

---

## Requirement matrix

### REQ-R01 Recruitment fields + contacts
| | |
|---|---|
| Status | FLAGGED / PARTIAL |
| Files | `lib/recruitment/types.ts`, `phaseB.ts`, `contactsStore.ts`, `app/recruitment/*` |
| Sheets | `مرشحين_التعيين`, `جهات_اتصال_المرشحين` |
| Flags | `FEATURE_RECRUITMENT_V2_ENABLED` |
| Gap | Contacts APIs 503 when V2 OFF; min 2 / max 3 OK when ON |

### REQ-R02 Lifecycle stages
| | |
|---|---|
| Status | PARTIAL |
| Files | `deriveRecruitmentPipelineStage` in `phaseB.ts` |
| Gap | Derived UI stages (~8), not exact persisted 9-state machine |

### REQ-R03 Lecture / activation / rider code / Ops assign
| | |
|---|---|
| Status | FLAGGED / DONE (when V2 ON) |
| Files | recruitment APIs + UI; Ops assign admin-only under V2 |
| Gap | Enablement; no external Talabat API (manual status — correct) |

### REQ-E01 Equipment issuance + prices
| | |
|---|---|
| Status | PARTIAL / DUPLICATE SoT |
| Files | `app/equipment-delivery`, `lib/money.ts`, `app/admin/equipment-pricing` |
| Sheets | `تسليم_المعدات`, `أسعار_المعدات`, `عهدة_المعدات` |
| Gap | Liability uses fixed `money.ts` (530/135×2/100). Admin pricing sheet (defaults 550/100/…) drives salary/legacy — **duplicate SoT** |

### REQ-E02 Swap rules (bag free / shirt paid / admin free override)
| | |
|---|---|
| Status | MISSING → addressed in Master Implementation (pure rules + delivery wire) |
| Gap (pre) | `deliveryType` stored; approve ignored type; ledger ON treated swap like assignment |

### REQ-E03 Security check ↔ liability
| | |
|---|---|
| Status | DONE (when Ledger ON) |
| Files | `phaseCGates.ts`, `computeLiabilityFields` |
| Rule | PAID → 80000; NOT_PAID → 90000 |

### REQ-E04 Liability create / idempotency
| | |
|---|---|
| Status | FLAGGED / DONE |
| Files | `createLiabilityFromDelivery` |
| Flags | `FEATURE_EQUIPMENT_LEDGER_ENABLED` |

### REQ-C01 Cycles + Payday admin
| | |
|---|---|
| Status | FLAGGED / PARTIAL |
| Files | `lib/payoutCycles/*`, `app/admin/payout-cycles` |
| Gap | Admin CRUD only — **no auto Mon–Sun month generator** (added as proposal helper in Master Implementation) |

### REQ-C02 Activation / Closing eligibility
| | |
|---|---|
| Status | DONE |
| Files | `lib/payoutCycles/eligibility.ts` + tests |

### REQ-D01 Auto expected / REQUEST
| | |
|---|---|
| Status | FLAGGED / DONE (REQUEST-only) |
| Files | `autoRequest.ts`, cron `equipment-auto-deductions` |
| Gap | No Sunday **queue UI** (added Expected Snapshot UI in Master Implementation — calculation only) |

### REQ-D02 Manager Compare / Actual
| | |
|---|---|
| Status | BROKEN integration |
| Lib DONE | `managerCompare.ts`, `evidenceApply.ts`, allocation |
| UI LEGACY | `app/admin/deductions-reconcile` → `lib/deductionsReconcile` — **not wired** to FILE_VALID / completeCycle |

### REQ-D03 Financial Apply
| | |
|---|---|
| Status | FLAGGED / NOT SAFE TO ENABLE without separate Go |
| Files | `financialApply*.ts`, `app/api/admin/deductions-financial-apply` |
| Tests | 4D.4–4D.5.4 hardening PASS |
| Rule | Flag OFF ⇒ zero mutations |

### REQ-L01 Equipment Ledger chronology
| | |
|---|---|
| Status | PARTIAL |
| UI | liability desk + finance summary |
| Gap | Not a full chronological Expected/Actual/CF ledger (Rider 360 / ledger view added as read aggregate) |

### REQ-RET01 Returns + waive
| | |
|---|---|
| Status | FLAGGED / PARTIAL |
| Files | `equipment-return`, `equipmentReturns/settlement.ts` |
| Gap | Auto settlements start 0/0; finance UI approve often without waive amounts |

### REQ-INV01 Inventory
| | |
|---|---|
| Status | PARTIAL / FLAGGED (anomalies V2) |
| Files | `mainInventoryService.ts`, `equipmentInventory/anomalies.ts` |

### REQ-360 Rider 360
| | |
|---|---|
| Status | MISSING → Master Implementation adds read-only aggregate |

### REQ-KPI Admin KPIs (New Requested / Carried / Collection)
| | |
|---|---|
| Status | MISSING / DESIGN ONLY |
| Note | Do not expose misleading KPIs without SoT |

### REQ-RBAC
| | |
|---|---|
| Status | PARTIAL / DONE for many keys |
| Files | `adminPermissions.ts`, `adminFeatureAccess.ts`, `recruitmentAuth.ts` |

### REQ-NOTIF
| | |
|---|---|
| Status | PARTIAL |
| Recruitment in-app notifications exist; equipment/admin anomaly alerts incomplete |

---

## Classification buckets

### A. Implemented (code exists)
- Millieme money + 800/900 schedules  
- Eligibility activation/closing  
- Liability create + desk payments (flagged)  
- Auto REQUEST-only cron (flagged)  
- Financial apply state machine + production hardening (flagged OFF)  
- Recruitment V2 fields/contacts (flagged)  
- Payout cycles admin CRUD (flagged)  

### B. Partially implemented
- Manager Compare (lib vs legacy UI)  
- Returns waive UX  
- Inventory V2  
- Equipment pricing SoT  
- Recruitment lifecycle naming  
- Carry-forward (lib allocate vs UI)  

### C. Missing / addressed in Master Implementation
- Bag-free / shirt-paid swap economics → **DONE (calc + delivery wire)**  
- Rider 360 → **DONE (read-only aggregate)**  
- Expected deduction queue UI → **DONE (calc preview)**  
- Auto cycle month generator → **DONE (proposal only; Admin persists)**  
- Amendment KPIs → **still MISSING**  
- Manager Compare UI wiring → **still BROKEN / deferred**

### D. Behind feature flag
All SRS-014 financial/ops modules listed above.

### E. UI exists, backend missing/wrong
- Reconcile UI without FILE_VALID foundation  

### F. Backend exists, UI missing
- Financial apply API (intentionally no enable UI)  
- Manager Compare foundation  

### G. Implemented but not integrated
- `managerCompare` ↔ `deductions-reconcile`  
- Allocation / evidence ↔ operator workflow  

### H. Dangerous / inconsistent
- Enabling Ledger without swap rules → swap blocked or charged full 900  
- Enabling Auto without reconcile UI → REQUEST without operator Actual path  
- Dual pricing SoT (`money.ts` vs `أسعار_المعدات`)  

### I. Duplicate source of truth
- Equipment prices  
- Reconcile (legacy Excel path vs SRS evidence)  

### J. Data integrity risks
- Sheets non-atomic multi-resource writes (accepted; recover via intent)  
- Financial apply Redis TTL / ledger uniqueness (scale Medium)  

---

## Financial safety statement

| Item | Value |
|---|---|
| `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` | OFF |
| Real wallet / ledger mutations in this audit | 0 |
| First production transaction | NOT EXECUTED |
| Safe interpretation | IMPLEMENTED ≠ ENABLED ≠ EXECUTE |
