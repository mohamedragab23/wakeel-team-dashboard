# Production Mirror Recommendation (Phase 6G)

**Date:** 2026-06-23  
**Decision:** **KEEP_PRODUCTION_ON_SHEETS**

---

## Summary

After Phase 6 preview activation, query audit, index optimization, and three-way benchmarking, **production should remain on Google Sheets** until Strategic Ops mirror read latency matches or beats Sheets under preview soak.

Mirror infrastructure is **validated and preview-ready** — not production-cutover-ready today.

---

## Evidence

### Data integrity (pass)

| Check | Result |
|-------|--------|
| Mirror vs Sheets row match | **100%** on all 4 tabs ([MIRROR_DATA_VALIDATION_REPORT.md](./MIRROR_DATA_VALIDATION_REPORT.md)) |
| Production mirror flags | **OFF** (verified) |
| Business logic changes | **None** |

### Performance (mixed)

From [NEON_FINAL_BENCHMARK.md](./NEON_FINAL_BENCHMARK.md) — optimized `jsonb_agg` path:

| Scenario | Google Sheets (avg) | Mirror optimized (avg) | Winner |
|----------|--------------------:|-----------------------:|--------|
| Dashboard | 3996 ms | **2919 ms** | Mirror (−27%) |
| Riders | 636 ms | **282 ms** | Mirror (−56%) |
| Salary | 1128 ms | **554 ms** | Mirror (−51%) |
| Strategic Ops | **4150 ms** | 7737 ms | **Sheets** (+86%) |

Strategic Ops loads four mirror tabs including **البيانات اليومية** (58,369 rows). DB execution for `jsonb_agg` is ~87ms, but end-to-end mirror path is slower than cached Sheets API for this workload.

### UAT verdict

[PREVIEW_UAT_REPORT.md](./PREVIEW_UAT_REPORT.md): **NOT_READY** for production mirror cutover (Dashboard and Strategic Ops single-run mirror slower in one UAT pass; preview Vercel flags ON but local soak incomplete).

### Query audit

[NEON_QUERY_AUDIT.md](./NEON_QUERY_AUDIT.md): No full-table seq scans on `mirror_sheet_rows` when filtered by `sheet_name`. Index scans only.

### Index optimization

[NEON_INDEX_OPTIMIZATION_REPORT.md](./NEON_INDEX_OPTIMIZATION_REPORT.md): `idx_mirror_rows_sheet_count` improved COUNT latency **41%** on البيانات اليومية.

---

## What is safe today

| Action | Safe? |
|--------|-------|
| Keep `MIRROR_SYNC_ENABLED=true` on **Preview** | Yes |
| Keep `NEON_READ_REPLICA_ENABLED=true` on **Preview** | Yes |
| Enable mirror on **Production** | **No** — Strategic Ops regression |
| Continue daily sync to Neon (read-only from Sheets) | Yes (preview/cron) |

---

## Path to `READY_FOR_PRODUCTION_MIRROR`

1. **Preview soak** (7–14 days): monitor Sentry errors, Redis hit ratio, mirror sync lag.
2. **Strategic Ops optimization**: parallel tab fetch, warm Redis for البيانات اليومية, or selective Sheets fallback for that tab only (additive flag).
3. **Re-run** `npm run benchmark:mirror-final` and `npm run preview:uat` until Strategic Ops mirror ≤ Sheets P95.
4. **Gradual cutover**: enable `NEON_READ_REPLICA_ENABLED` on production with instant rollback (unset env + redeploy).

---

## Rollback (if mirror ever enabled on production)

```text
vercel env rm NEON_READ_REPLICA_ENABLED production
vercel env rm MIRROR_SYNC_ENABLED production
vercel deploy --prod
```

Reads immediately fall back to Google Sheets via `getSheetData()` — no data migration required.

---

## Final answer

**KEEP_PRODUCTION_ON_SHEETS** — with mirror preview UAT continuing and clear performance gate before production activation.
