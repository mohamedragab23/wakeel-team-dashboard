# Neon Final Benchmark (Phase 6E)

**Date:** 2026-06-23
**Runs per scenario:** 5
**Modes:** (1) Google Sheets API (2) Mirror row-by-row (3) Mirror jsonb_agg optimized

---

## Dashboard

| Mode | Avg (ms) | P50 | P95 | P99 | Throughput (ops/s) |
|------|--------:|----:|----:|----:|-------------------:|
| google_sheets | 3996 | 3894 | 4483 | 4483 | 0.25 |
| mirror_before | 9082 | 7736 | 15189 | 15189 | 0.11 |
| mirror_after | 2919 | 2451 | 4507 | 4507 | 0.34 |

**Optimization impact (agg vs row):** 68%

## Riders

| Mode | Avg (ms) | P50 | P95 | P99 | Throughput (ops/s) |
|------|--------:|----:|----:|----:|-------------------:|
| google_sheets | 636 | 762 | 961 | 961 | 1.57 |
| mirror_before | 436 | 409 | 543 | 543 | 2.29 |
| mirror_after | 282 | 283 | 283 | 283 | 3.55 |

**Optimization impact (agg vs row):** 35%

## Salary

| Mode | Avg (ms) | P50 | P95 | P99 | Throughput (ops/s) |
|------|--------:|----:|----:|----:|-------------------:|
| google_sheets | 1128 | 1081 | 1541 | 1541 | 0.89 |
| mirror_before | 717 | 685 | 835 | 835 | 1.39 |
| mirror_after | 554 | 547 | 576 | 576 | 1.81 |

**Optimization impact (agg vs row):** 23%

## Strategic Ops

| Mode | Avg (ms) | P50 | P95 | P99 | Throughput (ops/s) |
|------|--------:|----:|----:|----:|-------------------:|
| google_sheets | 4150 | 4380 | 4646 | 4646 | 0.24 |
| mirror_before | 11162 | 6253 | 27189 | 27189 | 0.09 |
| mirror_after | 7737 | 7817 | 10250 | 10250 | 0.13 |

**Optimization impact (agg vs row):** 31%

---

## Cache effectiveness

Mirror reads bypass Google Sheets API quota. Redis L2 remains active for `getSheetData` when mirror flag off.
With `NEON_READ_REPLICA_ENABLED=true`, tiered cache still applies after first mirror load per instance.

---

## Summary comparison (optimized mirror vs Sheets)

| Scenario | Sheets avg | Mirror (optimized) avg | Change |
|----------|----------:|-----------------------:|-------:|
| Dashboard | 3996 ms | 2919 ms | **−27%** |
| Riders | 636 ms | 282 ms | **−56%** |
| Salary | 1128 ms | 554 ms | **−51%** |
| Strategic Ops | 4150 ms | 7737 ms | **+86%** |

**Conclusion:** Mirror optimized path wins on 3/4 scenarios. Strategic Ops (4-tab load incl. 58k rows) remains slower — gate for production cutover.
