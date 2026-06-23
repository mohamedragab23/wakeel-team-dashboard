# Neon Index Optimization Report (Phase 6D)

**Date:** 2026-06-23
**Safety:** Additive indexes only — no data or logic changes
**Sheets validated:** المناديب, المشرفين, البيانات اليومية, إعدادات_الرواتب

---

## Indexes applied

| Table | Columns | Index name | Before (ms) | After (ms) | Impact | Purpose |
|-------|---------|------------|------------:|-----------:|-------:|---------|
| mirror_sheet_rows | (sheet_name) | idx_mirror_rows_sheet_count | 487 | 289 | 41% | COUNT / existence per sheet |
| mirror_audit_log | (started_at DESC) | idx_mirror_audit_started | 157 | 158 | -1% | Recent audit log queries |

---

## Notes

- Primary key `(sheet_name, row_index)` already covers ordered row fetches.
- `jsonb_agg` path is the main read optimization (Phase 6 code change).
- Indexes are reversible via `DROP INDEX IF EXISTS`.
