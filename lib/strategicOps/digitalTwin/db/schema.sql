-- Digital Twin simulation scenarios (SRS-007)
-- Uses same Neon DB as ticketing (TICKETING_DATABASE_URL)

CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_code TEXT NOT NULL,
  author_name TEXT,
  title TEXT NOT NULL,
  filters_json JSONB NOT NULL,
  levers_json JSONB NOT NULL,
  baseline_json JSONB NOT NULL,
  impact_json JSONB NOT NULL,
  decision_json JSONB,
  actual_result_json JSONB,
  variance_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulation_scenarios_author ON simulation_scenarios (author_code);
CREATE INDEX IF NOT EXISTS idx_simulation_scenarios_created ON simulation_scenarios (created_at DESC);
