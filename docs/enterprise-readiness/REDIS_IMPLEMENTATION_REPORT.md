# Redis (Upstash) Production Cache — Implementation Report

**Date:** 2026-06-23  
**Policy:** Google Sheets remains source of truth. **Cache only** — no sheet writes, no data migration.

---

## Executive summary

| Item | Status |
|------|--------|
| L2 Upstash Redis cache | **Implemented** |
| L1 in-memory cache (per instance) | **Retained** |
| Strategic ops reads | **Cached** (L1 + L2) |
| Riders reads | **Cached** (L1 + L2) |
| Salary reads | **Cached** (L1 + L2) |
| Dashboard metrics | **Cached** (L1 + L2) |
| Sheet tab reads (`getSheetData`) | **Already cached** (L1 + L2, unchanged behavior) |
| Invalidation after sync | **Implemented** (L1 + L2) |
| Build | **PASS** |

---

## Architecture

```
Request
   │
   ▼
tieredCacheGet (computed responses)     getSheetData (raw tabs)
   │                                         │
   ├─ L1: in-memory (lib/cache.ts)          ├─ L1 hit → return
   │                                         ├─ L2 Redis hit → warm L1 → return
   └─ L2: Upstash REST (lib/redisCache.optional.ts)
         miss → compute from Sheets → tieredCacheSet / redisCacheSet
```

**Activation:** Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on Vercel. Without them, the app falls back to in-memory only (existing behavior).

---

## New / updated modules

| File | Role |
|------|------|
| `lib/tieredCache.ts` | **New** — unified L1+L2 get/set/delete for computed API caches |
| `lib/redisCache.optional.ts` | Added `redisCacheDeleteByPrefix()` for bulk L2 invalidation |
| `lib/cache.ts` | Added `CACHE_KEYS.strategicOpsReport`, `CACHE_KEYS.salaryCalculation` |
| `lib/cacheInvalidation.ts` | Centralized L1+L2 invalidation after sync and sheet writes |

---

## Cached surfaces

### 1. Strategic operations

| Item | Detail |
|------|--------|
| Location | `app/api/admin/strategic-ops/route.ts` |
| Key pattern | `strategic-ops:{start}:{end}:{zone}:{supervisor}:{scope}:{talabat}` |
| TTL | 10 minutes |
| Scope | Admin zone scope + Talabat benchmark params included in key |

### 2. Riders

| Item | Detail |
|------|--------|
| Location | `lib/dataService.ts` |
| Keys | `riders:{code}`, `riders:__all_assigned__`, `ridersData:{code}` |
| TTL | 15 minutes |

### 3. Salary

| Item | Detail |
|------|--------|
| Location | `lib/salaryService.ts` → `calculateSupervisorSalary()` |
| Key pattern | `salary:{supervisorCode}:{startDate}:{endDate}` |
| TTL | 10 minutes |
| APIs | `/api/salary/calculate`, `/api/admin/salary/calculate` |

### 4. Dashboard metrics

| Item | Detail |
|------|--------|
| Location | `lib/dataService.ts` → `getDashboardData()` |
| Key pattern | `dashboard:{supervisorCode}:{rangeKey}` |
| TTL | 2 minutes |
| API | `/api/dashboard` |

### 5. Performance charts (supervisor dashboard)

| Item | Detail |
|------|--------|
| Location | `lib/dataService.ts` → `getPerformanceData()` |
| Key pattern | `performance:{code}:{start}:{end}` |
| TTL | 15 minutes |

### 6. Google Sheets tab reads (existing)

| Item | Detail |
|------|--------|
| Location | `lib/googleSheets.ts` → `getSheetData()` |
| Key pattern | `sheet:{tabName}` |
| TTL | 15 minutes |

---

## Cache invalidation

Invalidation clears **both** in-memory and Redis keys.

| Trigger | Function | Clears |
|---------|----------|--------|
| Performance sync / day replace | `invalidateAfterPerformanceSync()` | Daily sheet + all `dashboard:`, `riders:`, `ridersData:`, `performance:`, `strategic-ops:`, `salary:` |
| Any main sheet write | `invalidateAfterSheetWrite(sheetName)` | Tab cache + derived caches by sheet type |
| Rider workflow (assignments, terminations) | `invalidateRiderWorkflowCaches()` | Riders + related sheets + derived |
| Performance day delete | `invalidateAfterPerformanceSync()` | Same as sync |
| Performance clear (admin) | `invalidateAfterPerformanceSync()` | Same as sync |

### Wired call sites

| File | When |
|------|------|
| `lib/performanceDaySheet.ts` | `replacePerformanceDay()` after Tableau sync write |
| `lib/googleSheets.ts` | After append, update, delete, header ensure |
| `app/api/admin/performance/delete-day/route.ts` | After manual day delete |
| `app/api/admin/performance/clear/route.ts` | After full performance clear |
| `lib/cacheInvalidation.ts` | Rider workflow (existing callers unchanged) |

Cron routes (`/api/cron/performance-sync`) invalidate via `replacePerformanceDay()` → `invalidateAfterPerformanceSync()`.

---

## Production configuration

Add to Vercel (Production + Preview recommended):

```env
UPSTASH_REDIS_REST_URL=https://<your-db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
```

**No code deploy flag required** — cache enables automatically when both vars are set.

Documented in `.env.example`.

---

## What was NOT changed

| Area | Status |
|------|--------|
| Google Sheets schema / data | **Unchanged** |
| Sheet write paths | **Unchanged** (only cache bust after writes) |
| Ticketing (Neon) | **Unchanged** |
| Strategic Ops / Talabat calculation logic | **Unchanged** |
| Data migration | **None** |

---

## Verification

```
npm run build → PASS (exit code 0)
```

### Recommended post-deploy checks

1. Set Upstash env vars on Vercel → redeploy
2. Load `/api/admin/strategic-ops?...` twice — second request should be faster (Redis hit on cold instances)
3. Run performance sync → confirm dashboards reflect new data (cache invalidated)
4. Upstash dashboard → monitor key count and hit rate under `dashboard:*`, `strategic-ops:*`, `salary:*`

---

## Rollback

Remove or unset `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and redeploy. App reverts to in-memory-only caching with no Sheets impact.

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Google Sheets = source of truth | Yes |
| No sheet writes from cache layer | Yes |
| No data migration | Yes |
| Cache strategic ops | Yes |
| Cache riders | Yes |
| Cache salary | Yes |
| Cache dashboard metrics | Yes |
| Invalidation after sync | Yes |
| Build passes | Yes |
