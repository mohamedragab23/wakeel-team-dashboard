# SRS-014 — Equipment Price Source of Truth + Immutable Snapshot (4D.5.4.2)

## 1. Official Source of Truth

**Admin → `أسعار_المعدات`** (Google Sheets), loaded via `lib/equipmentPricing/loadAdminPricing.ts`.

Runtime path for **NEW** rider liabilities:

```
Admin UI / API
   ↓
أسعار_المعدات
   ↓
requireAdminEquipmentPricingForLiability()  (fail closed)
   ↓
EquipmentPriceSnapshot
   ↓
computeLiabilityFields / createLiabilityFromDelivery
   ↓
Persisted liability amounts + snapshot metadata
   ↓
Expected / REQUEST / Allocation / Financial Apply (uses persisted amounts)
```

`lib/money.ts` retains **millieme arithmetic** and **approved fixture constants** documenting the current 800/900 meaning. It is **not** a runtime authority for NEW liability creation.

## 2. Current approved Admin prices (EGP)

| Item | Price |
|---|---|
| Motorcycle Bag | 530 |
| Bicycle Bag | 530 |
| Shirt (unit) | 135 |
| Security Check | 100 |
| Jacket / Helmet | 200 / 150 (custody / salary catalog; not in rider 800/900) |

## 3. Snapshot rule

At liability / shirt-swap economic commitment creation, the system persists:

- `bagCostMilli`, `shirtCostMilli`, `securityFeeMilli`, `originalLiabilityMilli`, `outstandingMilli`
- Metadata: `pricingSource=ADMIN_EQUIPMENT_PRICES`, `pricingCapturedAt`, `snapMotorcycleBagMilli`, `snapBicycleBagMilli`, `snapShirtUnitMilli`

## 4. Historical rule

Existing liabilities are **not** repriced when Admin changes `أسعار_المعدات`.

Legacy rows without snapshot metadata are labeled `LEGACY_NO_SNAPSHOT` and keep persisted monetary totals. Schedules are derived from `originalLiabilityMilli` via `scheduleFromPersistedOriginalMilli`.

## 5. Future rule

New liabilities use **current** validated Admin pricing at create time.

## 6. Installment examples (unchanged)

- 800 → 266.67 / 266.67 / 266.66  
- 900 → 300 / 300 / 300  

## 7. Fallback policy

- **NEW rider liability:** Admin pricing unavailable/invalid → **FAIL CLOSED** (`PRICING_UNAVAILABLE` / `PRICING_INVALID`). No silent 550.
- **Admin UI GET:** may show approved display defaults if Sheets empty (display only).
- **Supervisor salary path:** shares Admin sheet when available; may use approved defaults if Sheets unavailable (salary domain only — does not create rider liabilities).

## 8. Financial safety

This phase does **not** enable or execute financial mutation.

- `FEATURE_SRS014_FINANCIAL_APPLY_ENABLED` remains OFF  
- Wallet / ledger mutations: 0  
- First transaction: not executed  
