# Load Test Report (Phase 4E)

**Date:** 2026-06-23  
**Target:** `http://127.0.0.1:3000` (local production build)  
**NOT run against production** — scripts block `*.vercel.app` hosts.

---

## Methodology

| Item | Detail |
|------|--------|
| Server | `npm run start` (Next.js 14.2.33 production) |
| Scripts | `load-test-dashboard.ts`, `load-test-strategic-ops.ts`, `load-test-ticketing.ts` |
| Scenarios | 50, 100, 250, 500 concurrent requests |
| Auth | Unauthenticated (401 expected for protected routes) |

---

## Dashboard + Health (`/api/health`, `/api/dashboard`)

| Concurrency | Endpoint | P50 | P95 | P99 | Error % | Heap MB |
|------------:|----------|----:|----:|----:|--------:|--------:|
| 50 | health | 856 | 1078 | 1116 | 0 | 13.5 |
| 50 | dashboard | 406 | 568 | 584 | 0 | 13.7 |
| 100 | health | 581 | 939 | 970 | 0 | 14.2 |
| 100 | dashboard | 401 | 714 | 737 | 0 | 15.1 |
| 250 | health | 991 | 1582 | 1629 | 0 | 17.8 |
| 250 | dashboard | 646 | 1964 | 2058 | 0 | 21.1 |
| 500 | health | 1113 | 1980 | 2030 | **3.6** | 30.5 |
| 500 | dashboard | 1000 | 1861 | 1973 | 0 | 35.6 |

---

## Strategic Ops (`/api/admin/strategic-ops` — 401 gate)

| Concurrency | P50 | P95 | P99 | Error % | Heap MB |
|------------:|----:|----:|----:|--------:|--------:|
| 50 | 154 | 234 | 242 | 0 | 13.5 |
| 100 | 205 | 530 | 580 | 0 | 10.6 |
| 250 | 498 | 905 | 943 | 0 | 18.4 |
| 500 | 1059 | 1897 | 1963 | **3.6** | 23.5 |

*Note: Does not execute `buildStrategicOpsReport` without auth — measures API/middleware overhead only.*

---

## Ticketing (`/api/ticketing` — 401 gate)

| Concurrency | P50 | P95 | P99 | Error % | Heap MB |
|------------:|----:|----:|----:|--------:|--------:|
| 50 | 562 | 647 | 656 | 0 | 13.4 |
| 100 | 267 | 452 | 467 | 0 | 15.5 |
| 250 | 451 | 842 | 875 | 0 | 16.9 |
| 500 | 818 | 1569 | 1639 | **3.6** | 26.8 |

---

## Observations

1. **500 concurrent** shows ~3.6% errors on health/strategic-ops/ticketing — likely connection saturation on single local Node process.
2. Memory remains **&lt;36 MB** heap under 500 concurrent (auth-only routes).
3. Authenticated load tests (full Sheets reads) would show higher latency — run separately with test JWT on staging.
4. Redis not active locally — L1 only.

---

## Production safety

```typescript
// scripts/load-test-utils.ts
FORBIDDEN_HOSTS = ['wakeel-team-dashboard.vercel.app', 'vercel.app']
// Only localhost / 127.0.0.1 allowed
```

---

## Commands

```bash
npm run start
npm run load-test:dashboard
npm run load-test:strategic-ops
npm run load-test:ticketing
```

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Scripts created | Yes |
| 50/100/250/500 scenarios | Yes |
| P50/P95/P99 measured | Yes |
| Not run on production | Yes |
