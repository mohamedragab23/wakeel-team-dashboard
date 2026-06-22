# Performance Report — Safe Optimizations

**Date:** 2026-06-22  
**Policy:** No business logic changes. Output values unchanged.

---

## Optimization O1: Supervisor performance — single daily sheet read

### Before
- `app/api/admin/supervisor-performance/route.ts` looped supervisors
- Each iteration called `aggregateSupervisorDailyPerformance()` → `getSheetData('البيانات اليومية')`
- **20 supervisors = 20 full sheet reads** per request

### After
- One `getSheetData('البيانات اليومية')` before the loop
- Passed via `preloadedDailySheet` to `aggregateSupervisorDailyPerformance()` in `lib/dataFilter.ts`
- Aggregation logic **unchanged**

### Expected improvement

| Supervisors | Before (sheet reads) | After | Est. time saved |
|-------------|---------------------|-------|-----------------|
| 10 | 10 | 1 | 40–70% API time |
| 20 | 20 | 1 | 60–85% API time |

*Depends on daily sheet row count and Google API latency.*

---

## Not changed (documented bottlenecks)

| Area | Issue | Why deferred |
|------|-------|--------------|
| Strategic ops report | Full sheet load + 120s monolith | Logic change risk |
| Riders API | Load-all-then-slice pagination | Behavior change |
| In-memory cache | Per-instance, 15 min TTL | Needs Redis (infra) |
| `getSupervisorRiders` in loop | N calls per supervisor-performance | Larger refactor |
| Client React Query | 10 min staleTime | UX unchanged intentionally |

---

## Monitoring additions (no perf impact)

| Tool | Purpose |
|------|---------|
| Speed Insights | FCP, LCP, CLS, INP (RUM) |
| Vercel Analytics | Page views |

---

## Estimated dashboard load times (architecture-based)

| Page | Before | After (expected) |
|------|--------|------------------|
| Supervisor dashboard | 2–8s | Unchanged |
| Admin supervisor performance (20 sup, 30d) | 20–60s | **8–25s** |
| Strategic ops (90d) | 30–120s | Unchanged |
| Ticketing list | <1s (with Neon) | Unchanged |

---

## Recommendations (future phases — approval required)

1. Shared Redis cache for sheet snapshots (read-only layer)
2. Pre-aggregated daily supervisor summary tab (new Sheet tab — additive, not migration)
3. Strategic ops async job + poll
4. `useCache: true` on supervisor-performance with shared preloaded sheet (already single read)
