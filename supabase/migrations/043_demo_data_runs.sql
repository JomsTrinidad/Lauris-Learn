-- 043_demo_data_runs.sql
-- Tracks demo data generation sessions for platform admin.
-- Only demo schools (is_demo = true) may have demo data runs.
-- The generator and cleaner are enforced in application code; this table is audit/status only.

CREATE TABLE IF NOT EXISTS demo_data_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  scenario      TEXT        NOT NULL
    CHECK (scenario IN ('small_preschool', 'compliance_heavy', 'trial_new')),
  action        TEXT        NOT NULL
    CHECK (action IN ('generate', 'refresh', 'reset', 'clear')),
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  -- summary holds counts + demoUserIds (auth UUIDs to delete on clear)
  summary       JSONB,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_data_runs_school
  ON demo_data_runs (school_id, created_at DESC);

ALTER TABLE demo_data_runs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read or write demo data runs
CREATE POLICY "super_admin_all_demo_data_runs" ON demo_data_runs
  FOR ALL USING (is_super_admin());
