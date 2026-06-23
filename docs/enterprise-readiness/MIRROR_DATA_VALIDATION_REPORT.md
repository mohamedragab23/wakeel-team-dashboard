# Mirror Data Validation Report

**Date:** 2026-06-23
**Sync run ID:** 28fbba27-e71b-4c39-ab8f-08a439666eb1
**Policy:** Google Sheets = SoT. No Sheets writes. `NEON_READ_REPLICA_ENABLED` = **false**

---

## Executive summary

| Item | Value |
|------|-------|
| Sync | **PASS** |
| Data validation | **PASS** |
| Overall match | **100%** |
| Threshold | 100% per table |

---

## Per-table results

| Sheet | Sheet rows | Mirror rows | Missing | Extra | Hash mismatches | Match % | Status |
|-------|----------:|------------:|--------:|------:|----------------:|--------:|--------|
| المناديب | 432 | 432 | 0 | 0 | 0 | 100% | PASS |
| المشرفين | 22 | 22 | 0 | 0 | 0 | 100% | PASS |
| البيانات اليومية | 58369 | 58369 | 0 | 0 | 0 | 100% | PASS |
| إعدادات_الرواتب | 24 | 24 | 0 | 0 | 0 | 100% | PASS |

---

## Sync summary

| Sheet | Upserted | Deleted | Row count |
|-------|----------:|--------:|----------:|
| المناديب | 432 | 0 | 432 |
| المشرفين | 22 | 0 | 22 |
| البيانات اليومية | 58369 | 0 | 58369 |
| إعدادات_الرواتب | 24 | 0 | 24 |

---

## Sign-off

| Rule | Met |
|------|-----|
| No Google Sheets writes | Yes |
| Production read switch | No (`NEON_READ_REPLICA_ENABLED` off) |
| 100% match required | Yes |

---

## Deployment recommendation

**READY_FOR_PREVIEW_READS**

| Criterion | Result |
|-----------|--------|
| 100% row match (all 4 tables) | Yes |
| Sync completed successfully | Yes |
| `NEON_READ_REPLICA_ENABLED` on production | **No** (unchanged) |
| Google Sheets modified | **No** |
| Business logic modified | **No** |

### Next steps (preview only)

1. Enable `MIRROR_SYNC_ENABLED=true` on **preview** + schedule sync cron.
2. Enable `NEON_READ_REPLICA_ENABLED=true` on **preview** only.
3. Run full dashboard / riders / salary / strategic ops UAT on preview.
4. Keep production on Sheets until preview UAT passes.

See [MIRROR_PERFORMANCE_BENCHMARK.md](./MIRROR_PERFORMANCE_BENCHMARK.md) for latency comparison.
