-- ============================================================
-- Migration 001 – Additions & Seed Data
-- Run AFTER schema.sql on a fresh Supabase project
-- ============================================================

-- ─────────────────────────────────────────
-- VISIBILITY on progress_observations
-- ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'observation_visibility'
  ) THEN
    CREATE TYPE observation_visibility AS ENUM ('internal_only', 'parent_visible');
  END IF;
END $$;

ALTER TABLE progress_observations
  ADD COLUMN IF NOT EXISTS visibility observation_visibility NOT NULL DEFAULT 'internal_only';

-- ─────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_class_date    ON attendance_records(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date  ON attendance_records(student_id, date);
CREATE INDEX IF NOT EXISTS idx_enrollments_class        ON enrollments(class_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student      ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_school_month     ON billing_records(school_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_billing_student          ON billing_records(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_billing         ON payments(billing_record_id, status);
CREATE INDEX IF NOT EXISTS idx_inquiries_school_status  ON enrollment_inquiries(school_id, status);
CREATE INDEX IF NOT EXISTS idx_events_school_date       ON events(school_id, event_date);
CREATE INDEX IF NOT EXISTS idx_holidays_school_date     ON holidays(school_id, date);
CREATE INDEX IF NOT EXISTS idx_progress_obs_student     ON progress_observations(student_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_updates_class     ON parent_updates(class_id, created_at DESC);

-- ─────────────────────────────────────────
-- PILOT SCHOOL SEED
-- Creates the BK school, default branch, active school year,
-- and default progress categories.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────

-- Insert pilot school
INSERT INTO schools (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Bright Kids Learning and Tutorial Center')
ON CONFLICT (id) DO NOTHING;

-- Insert main branch
INSERT INTO branches (school_id, name, address)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Branch', 'Your Address Here')
ON CONFLICT DO NOTHING;

-- Insert active school year
INSERT INTO school_years (id, school_id, name, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'SY 2025–2026',
  '2025-06-01',
  '2026-03-31',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Insert default progress categories
INSERT INTO progress_categories (school_id, name, description, sort_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  cat.name,
  cat.description,
  cat.sort_order
FROM (VALUES
  ('Participation',             'Engagement during class activities',                    1),
  ('Social Skills',             'Interaction with peers and adults',                     2),
  ('Communication',             'Verbal and non-verbal expression',                      3),
  ('Motor Skills',              'Fine and gross motor development',                      4),
  ('Early Literacy',            'Pre-reading and writing readiness',                     5),
  ('Numeracy',                  'Number sense and basic math concepts',                  6),
  ('Behavior / Self-Regulation','Emotional control and classroom behavior',              7)
) AS cat(name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM progress_categories
  WHERE school_id = '00000000-0000-0000-0000-000000000001' AND name = cat.name
);

-- ─────────────────────────────────────────
-- ADMIN USER SETUP (run manually after signing up)
-- Replace 'admin@yourschool.com' with the actual admin email.
-- ─────────────────────────────────────────
-- UPDATE profiles
--   SET school_id = '00000000-0000-0000-0000-000000000001',
--       role      = 'school_admin',
--       full_name = 'School Administrator'
-- WHERE email = 'admin@yourschool.com';

-- ─────────────────────────────────────────
-- SAMPLE CLASSES (uncomment after admin user is linked)
-- ─────────────────────────────────────────
-- INSERT INTO classes (school_id, school_year_id, name, level, start_time, end_time, capacity)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Toddlers','2–3 years','08:00','10:00',15),
--   ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Pre-Kinder','3–4 years','10:00','12:00',20),
--   ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Kinder','4–6 years','13:00','17:00',25)
-- ON CONFLICT DO NOTHING;
