-- Neon read-replica mirror tables (additive — separate from ticketing).
-- Sheets remains source of truth. Reversible: DROP TABLE mirror_* ;

CREATE TABLE IF NOT EXISTS mirror_sheet_rows (
  sheet_name TEXT NOT NULL,
  row_index INT NOT NULL,
  row_data JSONB NOT NULL,
  row_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sheet_name, row_index)
);

CREATE INDEX IF NOT EXISTS idx_mirror_sheet_rows_sheet ON mirror_sheet_rows (sheet_name);

CREATE TABLE IF NOT EXISTS mirror_sync_state (
  sheet_name TEXT PRIMARY KEY,
  last_sync_at TIMESTAMPTZ,
  row_count INT NOT NULL DEFAULT 0,
  tab_hash TEXT,
  last_run_id UUID
);

CREATE TABLE IF NOT EXISTS mirror_audit_log (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  sheet_name TEXT,
  action TEXT NOT NULL,
  rows_upserted INT NOT NULL DEFAULT 0,
  rows_deleted INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_mirror_audit_log_run ON mirror_audit_log (run_id);
