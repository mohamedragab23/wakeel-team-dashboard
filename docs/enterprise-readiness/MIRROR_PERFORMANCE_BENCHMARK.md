# Mirror Performance Benchmark

**Date:** 2026-06-23
**Method:** Cold read — Sheets API vs Neon SQL (mirror tables). No cache. No `NEON_READ_REPLICA_ENABLED`.

---

## Summary

| Metric | Google Sheets | Neon Mirror |
|--------|--------------:|------------:|
| Avg latency (4 scenarios) | **2420 ms** | **2334 ms** |
| Overall | — | **4% faster** |

---

## Per-scenario results

| Scenario | Sheets (ms) | Mirror (ms) | Rows | Delta |
|----------|------------:|------------:|-----:|-------|
| Dashboard reads | 3794 | 4420 | 58823 | 16% slower |
| Riders reads | 347 | 401 | 432 | 16% slower |
| Salary reads | 1165 | 663 | 456 | 43% faster |
| Strategic Ops reads | 4373 | 3853 | 58847 | 12% faster |

### Notes

- **Dashboard reads:** Same tabs loaded by getDashboardData (data fetch only)
- **Riders reads:** Riders list source tab
- **Salary reads:** Salary config + riders tabs (mirror-covered only)
- **Strategic Ops reads:** Mirror-covered input tabs only — no buildStrategicOpsReport execution

---

## Caveats

- Benchmarks measure **raw tab fetch** only, not full API response assembly.
- Strategic Ops / Talabat **logic was not executed** (per safety rules).
- Mirror lacks tabs not in sync set (e.g. termination, debts) — full Strategic Ops still needs Sheets for non-mirror tabs.
- Production reads remain on Sheets until `NEON_READ_REPLICA_ENABLED=true` on preview.

---

## Recommendation

**READY_FOR_PREVIEW_READS** — data validation passed 100%. Mirror avg latency is **4% faster** overall on cold reads from this environment; heavy tabs (البيانات اليومية) benefit on Strategic Ops bundle reads. Enable read flag on **preview/staging only** after enabling sync cron.

**NOT_READY for production reads** until preview UAT completes and non-mirror tabs strategy is documented for Strategic Ops.
