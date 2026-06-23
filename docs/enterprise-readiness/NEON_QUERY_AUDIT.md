# Neon Mirror Query Audit (Phase 6C)

**Date:** 2026-06-23
**Method:** EXPLAIN (ANALYZE, BUFFERS) — read-only

---

## Summary

| Query | Sheet | Scan type | Rows examined | Time (ms) |
|-------|-------|-----------|--------------:|----------:|
| mirror_row_fetch | المناديب | Index Scan | 533 | 1318 |
| mirror_agg_fetch | المناديب | Index Scan | 533 | 148 |
| mirror_count | المناديب | Index Scan | 533 | 135 |
| mirror_row_fetch | المشرفين | Index Scan | 33 | 137 |
| mirror_agg_fetch | المشرفين | Index Scan | 33 | 136 |
| mirror_count | المشرفين | Index Scan | 33 | 135 |
| mirror_row_fetch | البيانات اليومية | Index Scan | 75116 | 159 |
| mirror_agg_fetch | البيانات اليومية | Index Scan | 75116 | 237 |
| mirror_count | البيانات اليومية | Index Scan | 75116 | 144 |
| mirror_row_fetch | إعدادات_الرواتب | Index Scan | 35 | 134 |
| mirror_agg_fetch | إعدادات_الرواتب | Index Scan | 35 | 136 |
| mirror_count | إعدادات_الرواتب | Index Scan | 35 | 134 |
| sync_state_lookup | — | Seq Scan | 680 | 135 |
| audit_log_recent | — | Seq Scan | 470 | 133 |

---

## Detailed plans

### mirror_row_fetch — المناديب

```
Sort  (cost=233.36..234.69 rows=533 width=75) (actual time=0.457..0.482 rows=432 loops=1)
  Sort Key: row_index
  Sort Method: quicksort  Memory: 90kB
  Buffers: shared hit=38 dirtied=2
  ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..209.22 rows=533 width=75) (actual time=0.023..0.296 rows=432 loops=1)
        Index Cond: (sheet_name = 'المناديب'::text)
        Buffers: shared hit=35 dirtied=2
Planning:
  Buffers: shared hit=48 dirtied=2
Planning Time: 0.229 ms
Execution Time: 0.565 ms
```

### mirror_agg_fetch — المناديب

```
Aggregate  (cost=236.02..236.03 rows=1 width=32) (actual time=0.754..0.755 rows=1 loops=1)
  Buffers: shared hit=35
  ->  Sort  (cost=233.36..234.69 rows=533 width=75) (actual time=0.224..0.245 rows=432 loops=1)
        Sort Key: row_index
        Sort Method: quicksort  Memory: 90kB
        Buffers: shared hit=35
        ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..209.22 rows=533 width=75) (actual time=0.011..0.123 rows=432 loops=1)
              Index Cond: (sheet_name = 'المناديب'::text)
              Buffers: shared hit=35
Planning:
  Buffers: shared hit=22
Planning Time: 0.134 ms
Execution Time: 0.811 ms
```

### mirror_count — المناديب

```
Aggregate  (cost=23.08..23.09 rows=1 width=4) (actual time=0.086..0.086 rows=1 loops=1)
  Buffers: shared hit=7
  ->  Index Only Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..21.75 rows=533 width=0) (actual time=0.014..0.054 rows=432 loops=1)
        Index Cond: (sheet_name = 'المناديب'::text)
        Heap Fetches: 21
        Buffers: shared hit=7
Planning:
  Buffers: shared hit=8
Planning Time: 0.091 ms
Execution Time: 0.107 ms
```

### mirror_row_fetch — المشرفين

```
Sort  (cost=21.75..21.84 rows=33 width=75) (actual time=0.066..0.068 rows=22 loops=1)
  Sort Key: row_index
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=8
  ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..20.92 rows=33 width=75) (actual time=0.036..0.056 rows=22 loops=1)
        Index Cond: (sheet_name = 'المشرفين'::text)
        Buffers: shared hit=8
Planning Time: 0.073 ms
Execution Time: 0.085 ms
```

### mirror_agg_fetch — المشرفين

```
Aggregate  (cost=21.92..21.93 rows=1 width=32) (actual time=0.134..0.135 rows=1 loops=1)
  Buffers: shared hit=8
  ->  Sort  (cost=21.75..21.84 rows=33 width=75) (actual time=0.052..0.055 rows=22 loops=1)
        Sort Key: row_index
        Sort Method: quicksort  Memory: 29kB
        Buffers: shared hit=8
        ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..20.92 rows=33 width=75) (actual time=0.021..0.041 rows=22 loops=1)
              Index Cond: (sheet_name = 'المشرفين'::text)
              Buffers: shared hit=8
Planning:
  Buffers: shared hit=9
Planning Time: 0.109 ms
Execution Time: 0.160 ms
```

### mirror_count — المشرفين

```
Aggregate  (cost=9.08..9.09 rows=1 width=4) (actual time=0.029..0.030 rows=1 loops=1)
  Buffers: shared hit=5
  ->  Index Only Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..9.00 rows=33 width=0) (actual time=0.019..0.023 rows=22 loops=1)
        Index Cond: (sheet_name = 'المشرفين'::text)
        Heap Fetches: 0
        Buffers: shared hit=5
Planning Time: 0.074 ms
Execution Time: 0.051 ms
```

### mirror_row_fetch — البيانات اليومية

```
Index Scan using mirror_sheet_rows_pkey on mirror_sheet_rows  (cost=0.42..11767.15 rows=75116 width=75) (actual time=0.015..20.274 rows=58369 loops=1)
  Index Cond: (sheet_name = 'البيانات اليومية'::text)
  Buffers: shared hit=4314 dirtied=84
Planning:
  Buffers: shared hit=8
Planning Time: 0.119 ms
Execution Time: 23.070 ms
```

### mirror_agg_fetch — البيانات اليومية

```
Aggregate  (cost=11954.94..11954.95 rows=1 width=32) (actual time=84.685..84.686 rows=1 loops=1)
  Buffers: shared hit=4280
  ->  Index Scan using mirror_sheet_rows_pkey on mirror_sheet_rows  (cost=0.42..11767.15 rows=75116 width=75) (actual time=0.023..16.838 rows=58369 loops=1)
        Index Cond: (sheet_name = 'البيانات اليومية'::text)
        Buffers: shared hit=4280
Planning Time: 0.079 ms
Execution Time: 87.095 ms
```

### mirror_count — البيانات اليومية

```
Aggregate  (cost=2169.60..2169.61 rows=1 width=4) (actual time=9.288..9.289 rows=1 loops=1)
  Buffers: shared hit=289
  ->  Index Only Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..1981.81 rows=75116 width=0) (actual time=0.028..5.684 rows=58369 loops=1)
        Index Cond: (sheet_name = 'البيانات اليومية'::text)
        Heap Fetches: 4366
        Buffers: shared hit=289
Planning Time: 0.072 ms
Execution Time: 9.315 ms
```

### mirror_row_fetch — إعدادات_الرواتب

```
Sort  (cost=22.54..22.63 rows=35 width=75) (actual time=0.069..0.071 rows=24 loops=1)
  Sort Key: row_index
  Sort Method: quicksort  Memory: 30kB
  Buffers: shared hit=10
  ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..21.64 rows=35 width=75) (actual time=0.031..0.049 rows=24 loops=1)
        Index Cond: (sheet_name = 'إعدادات_الرواتب'::text)
        Buffers: shared hit=7
Planning:
  Buffers: shared hit=70
Planning Time: 0.277 ms
Execution Time: 0.088 ms
```

### mirror_agg_fetch — إعدادات_الرواتب

```
Aggregate  (cost=22.72..22.73 rows=1 width=32) (actual time=0.067..0.068 rows=1 loops=1)
  Buffers: shared hit=7
  ->  Sort  (cost=22.54..22.63 rows=35 width=75) (actual time=0.032..0.033 rows=24 loops=1)
        Sort Key: row_index
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=7
        ->  Index Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..21.64 rows=35 width=75) (actual time=0.010..0.021 rows=24 loops=1)
              Index Cond: (sheet_name = 'إعدادات_الرواتب'::text)
              Buffers: shared hit=7
Planning:
  Buffers: shared hit=9
Planning Time: 0.091 ms
Execution Time: 0.090 ms
```

### mirror_count — إعدادات_الرواتب

```
Aggregate  (cost=9.12..9.13 rows=1 width=4) (actual time=0.030..0.031 rows=1 loops=1)
  Buffers: shared hit=5
  ->  Index Only Scan using idx_mirror_sheet_rows_sheet on mirror_sheet_rows  (cost=0.42..9.03 rows=35 width=0) (actual time=0.020..0.024 rows=24 loops=1)
        Index Cond: (sheet_name = 'إعدادات_الرواتب'::text)
        Heap Fetches: 0
        Buffers: shared hit=5
Planning Time: 0.073 ms
Execution Time: 0.051 ms
```

### sync_state_lookup

```
Sort  (cost=48.79..50.49 rows=680 width=44) (actual time=0.022..0.023 rows=4 loops=1)
  Sort Key: sheet_name
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=4
  ->  Seq Scan on mirror_sync_state  (cost=0.00..16.80 rows=680 width=44) (actual time=0.009..0.010 rows=4 loops=1)
        Buffers: shared hit=1
Planning:
  Buffers: shared hit=17
Planning Time: 0.084 ms
Execution Time: 0.036 ms
```

### audit_log_recent

```
Limit  (cost=27.21..27.26 rows=20 width=65) (actual time=0.023..0.025 rows=16 loops=1)
  Buffers: shared hit=1
  ->  Sort  (cost=27.21..28.38 rows=470 width=65) (actual time=0.022..0.023 rows=16 loops=1)
        Sort Key: started_at DESC
        Sort Method: quicksort  Memory: 27kB
        Buffers: shared hit=1
        ->  Seq Scan on mirror_audit_log  (cost=0.00..14.70 rows=470 width=65) (actual time=0.010..0.012 rows=16 loops=1)
              Buffers: shared hit=1
Planning Time: 0.053 ms
Execution Time: 0.037 ms
```

---

## Optimization recommendations

1. **Use `jsonb_agg` single-query path** for large tabs (البيانات اليومية) — reduces round-trip row deserialization.
2. **Primary key `(sheet_name, row_index)`** already supports ordered scans — no seq scan on full table when filtered by sheet.
3. **Additive indexes** in `lib/mirror/db/indexes.sql` — sheet_name count + audit_log started_at.
4. **Avoid `SELECT *` on mirror_audit_log** for hot paths — use limited columns.
