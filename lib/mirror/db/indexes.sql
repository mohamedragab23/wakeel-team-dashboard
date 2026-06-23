-- Phase 6D additive indexes (read performance only — no data/logic changes)
-- Reversible: DROP INDEX IF EXISTS idx_mirror_rows_agg_covering;

-- Supports COUNT and existence checks per sheet
CREATE INDEX IF NOT EXISTS idx_mirror_rows_sheet_count
  ON mirror_sheet_rows (sheet_name);

-- Audit log time-range queries
CREATE INDEX IF NOT EXISTS idx_mirror_audit_started
  ON mirror_audit_log (started_at DESC);
