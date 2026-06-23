# Preview UAT Report (Phase 6B)

**Date:** 2026-06-23  
**Preview URL:** https://wakeel-team-dashboard-hmn3dg3tj-ragab-team.vercel.app

---

## Environment status

| Env | Health | Mirror sync | Mirror reads |
|-----|--------|-------------|--------------|
| **Preview (Vercel)** | Deploy READY | **ON** (`MIRROR_SYNC_ENABLED=true`) | **ON** (`NEON_READ_REPLICA_ENABLED=true`) |
| **Production** | OK | **OFF** (vars unset) | **OFF** (vars unset) |

Preview flags verified via `vercel env ls preview`. Production has no MIRROR/NEON_READ variables.

---

## Sheets vs Mirror (local data-fetch comparison)

Controlled toggle in `scripts/preview-uat-monitor.ts` — same Neon data, flag simulation only. **No calculation logic executed** (safety rule).

| Scenario | Sheets (ms) | Mirror agg (ms) | Delta |
|----------|------------:|----------------:|------:|
| Dashboard load (3 tabs) | 3849 | 4628 | +20% slower |
| Riders page (المناديب) | 346 | 556 | +61% slower |
| Salary (2 tabs) | 1660 | **1292** | **−22% faster** |
| Strategic Ops inputs (4 tabs) | 3623 | 4930 | +36% slower |

**Note:** Multi-run benchmark ([NEON_FINAL_BENCHMARK.md](./NEON_FINAL_BENCHMARK.md)) shows Dashboard and Riders **faster** with optimized mirror after warmup — single-run UAT is noisier.

---

## Observability

| System | Status |
|--------|--------|
| Redis | Configured (`KV_REST_API_*` / Upstash) |
| Sentry | DSN configured; source maps upload on build |
| Ticketing | Health probe OK |
| Error rate (CLI probe) | 0% — no automated UI session |
| Redis hit ratio | Not exposed in CLI — check Upstash dashboard |
| Sentry errors | Check `wakeel-sentry` project post-preview deploy |
| CPU / memory | Not available via CLI — use Vercel Observability + Sentry |
| Neon query latency | See [NEON_QUERY_AUDIT.md](./NEON_QUERY_AUDIT.md) |
| Google Sheets fallback | `tryGetMirrorSheetData()` → `null` → `getSheetData()` uses Sheets |

---

## Ticketing operations

Unchanged — Neon `TICKETING_DATABASE_URL` + R2. Preview health `/api/health` returns 200.

---

## Salary / Strategic Ops

| Area | UAT scope |
|------|-----------|
| Salary calculations | **Not executed** — mirror tab fetch only |
| Strategic Ops report | **Not executed** — input tab fetch only |
| Riders workflows | **Not executed** |

---

## Verdict

**NOT_READY** for production mirror cutover.

| Criterion | Result |
|-----------|--------|
| Preview deploy | Pass |
| Data validation | 100% match (Phase 5) |
| Production unchanged | Pass |
| Mirror faster on all scenarios | **Fail** (Strategic Ops regression in benchmark) |

Continue preview soak; re-score after 7–14 days.

---

## Related

- [PREVIEW_MIRROR_ACTIVATION.md](./PREVIEW_MIRROR_ACTIVATION.md)
- [PRODUCTION_MIRROR_RECOMMENDATION.md](./PRODUCTION_MIRROR_RECOMMENDATION.md)
