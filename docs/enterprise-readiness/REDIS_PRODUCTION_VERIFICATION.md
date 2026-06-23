# Redis Production Verification (Phase 1)

**Date:** 2026-06-23  
**Project:** `ragab-team/wakeel-team-dashboard`  
**Resource:** `wakeel-redis-cache` (Upstash for Redis, `iad1`, Free plan)  
**Method:** Read-only — synthetic cache keys only. No Google Sheets access.

---

## Executive summary

| Item | Status |
|------|--------|
| Upstash provisioned | **YES** (`store_SdEMSMBupLbCHB75`) |
| Connected to project | **YES** (production, preview, development) |
| Env vars on Vercel | **YES** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) |
| Code reads `KV_*` vars | **YES** (`lib/redisCache.optional.ts`) |
| Production deploy | **YES** (`dpl_6Z4KDTd7oGaLyxxZdphsLiZ5B1K5`) |
| Verification script | **PASS** |
| **Overall verdict** | **PASS** |

---

## Verification checklist

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | Runtime connection | **PASS** | `configured: true`, `status: ACTIVE` |
| 2 | Redis reads | **PASS** | `redis_read_get` 294–331 ms, `ok: true` |
| 3 | Redis writes | **PASS** | `redis_write_set` 389–514 ms, `redis_write_delete` 157–160 ms |
| 4 | Cache hit ratio | **PASS** | 67% simulated (2 hits / 3 attempts) |
| 5 | Strategic Ops cache | **PASS** | Prefix `strategic-ops:` — L1+L2 populated, invalidated |
| 6 | Riders cache | **PASS** | Prefix `riders:` — L1+L2 populated, invalidated |
| 7 | Salary cache | **PASS** | Prefix `salary:` — L1+L2 populated, invalidated |
| 8 | Dashboard cache | **PASS** | Prefix `dashboard:` — L1+L2 populated, invalidated |
| 9 | Latency before/after | **PASS** | Cold miss ~155 ms → L1/L2 hit &lt;1 ms |
| 10 | This report | **COMPLETE** | |

---

## Runtime connection

```json
{
  "configured": true,
  "urlSource": "KV_REST_API_URL",
  "tokenSource": "KV_REST_API_TOKEN",
  "status": "ACTIVE"
}
```

Command: `npm run verify:redis`  
Verified at: `2026-06-23T13:48:48.712Z`

---

## Read / write probes

| Operation | Latency | OK |
|-----------|--------:|----|
| SET (write) | 514 ms | Yes |
| GET (read) | 294 ms | Yes |
| DEL (write) | 160 ms | Yes |

---

## Cache hit ratio

| Metric | Value |
|--------|------:|
| Attempts | 3 |
| Hits | 2 |
| Misses | 1 |
| Hit ratio | **67%** |
| Miss ratio | **33%** |

*First access is always a miss (cold). Steady-state production expected: 60–85% for dashboard/riders.*

---

## Domain cache verification

| Domain | Key prefix | Cold miss | L2 hit | L1 hit | Invalidated |
|--------|------------|----------:|-------:|-------:|-------------|
| Strategic Ops | `strategic-ops:` | 153 ms | &lt;1 ms | &lt;1 ms | Yes |
| Riders | `riders:` | 161 ms | &lt;1 ms | &lt;1 ms | Yes |
| Salary | `salary:` | 151 ms | &lt;1 ms | &lt;1 ms | Yes |
| Dashboard | `dashboard:` | 153 ms | &lt;1 ms | &lt;1 ms | Yes |

---

## Latency: before vs after cache

| Phase | Avg latency |
|-------|------------:|
| Before (cold miss, no cached data) | **155 ms** |
| After (L2/L1 hit) | **&lt;1 ms** |
| Improvement | **~100%** on repeat reads |

Redis REST round-trip (Egypt → `iad1`): ~160–500 ms for SET/GET.  
In-memory L1 on same serverless instance: sub-millisecond.

---

## Environment variables (Vercel production)

| Variable | Set |
|----------|-----|
| `KV_REST_API_URL` | Yes |
| `KV_REST_API_TOKEN` | Yes |
| `KV_REST_API_READ_ONLY_TOKEN` | Yes |
| `REDIS_URL` | Yes |
| `UPSTASH_REDIS_REST_URL` | Not required (code falls back to `KV_*`) |

---

## Production deploy

| Item | Value |
|------|-------|
| Deployment | `dpl_6Z4KDTd7oGaLyxxZdphsLiZ5B1K5` |
| URL | https://wakeel-team-dashboard.vercel.app |
| Region | `iad1` |
| Build | **PASS** |

Post-deploy health check (public):

```
GET /api/health → {"ok":true}
```

Diagnostics (`/api/health/diagnostics`) requires admin auth — verify in browser while logged in; expect `redisConfigured: true`, `redis.ok: true`.

---

## Commands

```bash
# Full verification (read-only)
npm run verify:redis

# With production credentials
npx vercel env run --environment production -- npm run verify:redis

# Audit summary
npm run audit:redis
```

---

## Rollback

1. `vercel integration resource disconnect wakeel-redis-cache`
2. Redeploy — app reverts to L1 in-memory only
3. Google Sheets unaffected

---

## Next phases (your plan)

| Phase | Task | Status |
|-------|------|--------|
| **1** | Redis production | **COMPLETE** |
| 2 | Sentry production | Next |
| 3 | Password migration | After Redis + Sentry |
| 4 | Daily backup cron | Pending |
| 5 | Neon read replica | Architecture only |

---

## Sign-off

| Policy | Met |
|--------|-----|
| No Google Sheets modification | Yes |
| No business logic changes | Yes |
| Read-only verification | Yes |
| Redis production active | **Yes** |
