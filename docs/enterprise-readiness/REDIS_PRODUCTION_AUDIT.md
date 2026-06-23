# Redis Production Audit (Phase 4A)

**Date:** 2026-06-23  
**Method:** Read-only — `scripts/audit-redis-production.ts`, Vercel env probe, code review  
**Policy:** Google Sheets unchanged. No data migration.

---

## Executive summary

| Item | Status |
|------|--------|
| Code implementation | **READY** (`lib/tieredCache.ts`, `lib/redisCache.optional.ts`) |
| Production activation | **INACTIVE** — env vars not set on Vercel |
| Local activation | **INACTIVE** — no `UPSTASH_*` in `.env.local` |
| Cache invalidation wiring | **IMPLEMENTED** (`lib/cacheInvalidation.ts`) |

---

## Environment verification

| Variable | Vercel production | Local `.env.local` |
|----------|-------------------|-------------------|
| `UPSTASH_REDIS_REST_URL` | **Not set** | **Not set** |
| `UPSTASH_REDIS_REST_TOKEN` | **Not set** | **Not set** |

Probe: `npx vercel env run --environment production -- node -e "..."` → `hasUrl: false`, `hasToken: false`

---

## Runtime status

| Check | Result |
|-------|--------|
| `isRedisCacheConfigured()` | `false` in production |
| `isTieredRedisEnabled()` | `false` |
| Effective cache layer | **L1 in-memory only** per serverless instance |
| Strategic Ops L2 | Not active |
| Riders L2 | Not active |
| Salary L2 | Not active |
| Dashboard L2 | Not active |
| Sheet tab L2 (`getSheetData`) | Not active |

---

## Cache hit / miss ratio

| Metric | Value | Notes |
|--------|-------|-------|
| Production hit ratio | **N/A** | Redis not active — no Upstash metrics |
| Production miss ratio | **100%** (L2) | All cross-instance reads miss Redis |
| Simulated hit ratio (local probe) | **67%** | When Redis configured: L2 hit + L1 hit after warm |
| Invalidation tests | **Not run** | Requires active Redis |

When activated, expected production hit ratio (steady state): **60–85%** for dashboard/riders after warm period, **40–60%** for strategic ops (parameterized keys).

---

## Latency (when Redis inactive)

Production APIs use in-memory cache only (per lambda instance). Cold instances always hit Google Sheets.

| Layer | Typical latency |
|-------|-----------------|
| L1 hit | &lt;5 ms |
| L2 hit (projected) | 15–80 ms |
| Sheets miss | 500–3000+ ms |

---

## Cache invalidation

| Trigger | L1 | L2 (when active) |
|---------|----|--------------------|
| Performance sync | `invalidateAfterPerformanceSync()` | Prefix delete via `tieredCacheDeleteByPrefix` |
| Sheet write | `invalidateAfterSheetWrite()` | Same |
| Rider workflow | `invalidateRiderWorkflowCaches()` | Same |

**Prefixes invalidated:** `dashboard:`, `riders:`, `ridersData:`, `performance:`, `strategic-ops:`, `salary:`, `sheet:`

---

## Estimated performance improvement (after activation)

| Endpoint | Current (no Redis) | With Redis (estimate) |
|----------|-------------------|------------------------|
| Dashboard (warm) | 400–2000 ms | 50–200 ms |
| Strategic Ops (repeat) | 5–30 s | 1–5 s |
| Riders list | 1–5 s | 100–500 ms |
| Salary calc | 2–10 s | 200–800 ms |

Cross-instance consistency: **major gain** — today each Vercel lambda has isolated L1 cache.

---

## Recommendations

### P0
1. Create Upstash Redis database (REST API).
2. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on Vercel production.
3. Redeploy and re-run `npm run audit:redis`.

### P1
4. Monitor Upstash dashboard for hit rate after 48h traffic.
5. Add Vercel Cron for `npm run backup:daily` (separate from Redis).

### P2
6. Consider `instrumentation-client.ts` migration for Sentry/Redis metrics correlation.

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Audit completed read-only | Yes |
| Sheets untouched | Yes |
| Implementation verified in code | Yes |
| Production Redis active | **No — action required** |
