-- ============================================================
-- Migration 002 – Super Admin, Trial System, Academic Periods,
--                 Tuition / Fee / Discount / Credit System
-- Run AFTER 001_additions.sql
-- ============================================================

-- ─────────────────────────────────────────
-- TRIAL SYSTEM (on schools table)
-- ─────────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS trial_start_date DATE,
  ADD COLUMN IF NOT EXISTS trial_end_date   DATE,
  ADD COLUMN IF NOT EXISTS trial_status     TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT schools_trial_status_check
      CHECK (trial_status IN ('active', 'expired', 'converted'));

-- ─────────────────────────────────────────
-- ACADEMIC PERIODS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_periods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_periods_school_year
  ON academic_periods(school_id, school_year_id);

-- Optional: link classes to academic period
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS academic_period_id UUID
    REFERENCES academic_periods(id) ON DELETE SET NULL;

-- Optional: link billing records to academic period
ALTER TABLE billing_records
  ADD COLUMN IF NOT EXISTS academic_period_id UUID
    REFERENCES academic_periods(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────
-- FEE TYPES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- TUITION CONFIGS (per level per academic period)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tuition_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_period_id  UUID NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  level               TEXT NOT NULL,
  total_amount        NUMERIC(10,2) NOT NULL,
  months              INT NOT NULL DEFAULT 10,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_period_id, level)
);

-- ─────────────────────────────────────────
-- DISCOUNTS
-- ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM ('fixed', 'percentage', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE discount_scope AS ENUM (
    'summer_to_sy', 'full_payment', 'early_enrollment', 'sibling', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS discounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        discount_type NOT NULL,
  scope       discount_scope NOT NULL DEFAULT 'custom',
  value       NUMERIC(10,2) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- STUDENT CREDITS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_credits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  reason      TEXT,
  applied_to  UUID REFERENCES billing_records(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- BILLING DISCOUNTS (snapshot applied to a billing record)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_discounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_record_id UUID NOT NULL REFERENCES billing_records(id) ON DELETE CASCADE,
  discount_id       UUID REFERENCES discounts(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  type              discount_type NOT NULL,
  value             NUMERIC(10,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- SUPER ADMIN HELPER FUNCTION
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- ─────────────────────────────────────────
-- SUPER ADMIN BYPASS POLICIES (existing tables)
-- Allows super_admin role to read all school data for impersonation
-- ─────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "super_admin_read_schools"              ON schools              FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_write_schools"             ON schools              FOR ALL    USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_write_profiles"            ON profiles             FOR ALL    USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_branches"             ON branches             FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_school_years"         ON school_years         FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_classes"              ON classes              FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_class_teachers"       ON class_teachers       FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_students"             ON students             FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_guardians"            ON guardians            FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_enrollments"          ON enrollments          FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_attendance"           ON attendance_records   FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_parent_updates"       ON parent_updates       FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_billing_records"      ON billing_records      FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_payments"             ON payments             FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_holidays"             ON holidays             FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_holiday_classes"      ON holiday_classes      FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_events"               ON events               FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_event_rsvps"          ON event_rsvps          FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_inquiries"            ON enrollment_inquiries FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_online_sessions"      ON online_class_sessions FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_progress_cats"        ON progress_categories  FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "super_admin_read_progress_obs"         ON progress_observations FOR SELECT USING (is_super_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- RLS ON NEW TABLES
-- ─────────────────────────────────────────
ALTER TABLE academic_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuition_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_credits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_discounts ENABLE ROW LEVEL SECURITY;

-- academic_periods
CREATE POLICY "members_read_periods"   ON academic_periods FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
CREATE POLICY "members_insert_periods" ON academic_periods FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_update_periods" ON academic_periods FOR UPDATE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_delete_periods" ON academic_periods FOR DELETE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- fee_types
CREATE POLICY "members_read_fee_types"   ON fee_types FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
CREATE POLICY "members_insert_fee_types" ON fee_types FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_update_fee_types" ON fee_types FOR UPDATE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_delete_fee_types" ON fee_types FOR DELETE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- tuition_configs
CREATE POLICY "members_read_tuition"   ON tuition_configs FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
CREATE POLICY "members_insert_tuition" ON tuition_configs FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_update_tuition" ON tuition_configs FOR UPDATE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_delete_tuition" ON tuition_configs FOR DELETE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- discounts
CREATE POLICY "members_read_discounts"   ON discounts FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
CREATE POLICY "members_insert_discounts" ON discounts FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_update_discounts" ON discounts FOR UPDATE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "members_delete_discounts" ON discounts FOR DELETE USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- student_credits
CREATE POLICY "members_read_credits"   ON student_credits FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
CREATE POLICY "members_insert_credits" ON student_credits FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- billing_discounts
CREATE POLICY "members_read_billing_discounts" ON billing_discounts FOR SELECT
  USING (billing_record_id IN (SELECT id FROM billing_records WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())) OR is_super_admin());
CREATE POLICY "members_insert_billing_discounts" ON billing_discounts FOR INSERT
  WITH CHECK (billing_record_id IN (SELECT id FROM billing_records WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "members_delete_billing_discounts" ON billing_discounts FOR DELETE
  USING (billing_record_id IN (SELECT id FROM billing_records WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGERS on new tables
-- ─────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'academic_periods', 'fee_types', 'tuition_configs', 'discounts'
  ]) LOOP
    BEGIN
      EXECUTE format(
        'CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE set_updated_at();',
        t, t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- SEED DATA – Pilot School (BK)
-- ─────────────────────────────────────────

-- Set trial window for BK (14 days from now)
UPDATE schools
SET trial_start_date = CURRENT_DATE,
    trial_end_date   = CURRENT_DATE + INTERVAL '14 days',
    trial_status     = 'active'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND trial_start_date IS NULL;

-- Academic periods for SY 2025-2026
INSERT INTO academic_periods (id, school_id, school_year_id, name, start_date, end_date, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002',
   'Regular Term', '2025-06-01', '2026-03-31', TRUE),
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002',
   'Summer Program', '2026-04-01', '2026-05-31', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Fee types
INSERT INTO fee_types (school_id, name, description)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Tuition',                   'Monthly tuition fee'),
  ('00000000-0000-0000-0000-000000000001', 'Enrollment Fee',            'One-time registration and enrollment fee'),
  ('00000000-0000-0000-0000-000000000001', 'Learning Materials',        'Textbooks, workbooks, and learning kits'),
  ('00000000-0000-0000-0000-000000000001', 'Uniform & Supplies',        'School uniforms, PE attire, and classroom supplies'),
  ('00000000-0000-0000-0000-000000000001', 'Activity & Optional Fees',  'Field trips, school events, and optional programs'),
  ('00000000-0000-0000-0000-000000000001', 'External Fees',             'Government requirements, insurance, and non-school charges')
ON CONFLICT DO NOTHING;

-- Tuition configs (Regular Term)
INSERT INTO tuition_configs (school_id, academic_period_id, level, total_amount, months)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Toddlers',   20000, 10),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Pre-Kinder', 22000, 10),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Kinder',     25000, 10)
ON CONFLICT (academic_period_id, level) DO NOTHING;

-- Discounts
INSERT INTO discounts (school_id, name, type, scope, value)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Full Payment Discount',    'percentage', 'full_payment',     5),
  ('00000000-0000-0000-0000-000000000001', 'Early Enrollment Discount','fixed',      'early_enrollment', 500),
  ('00000000-0000-0000-0000-000000000001', 'Sibling Discount',         'percentage', 'sibling',          10),
  ('00000000-0000-0000-0000-000000000001', 'Summer-to-SY Discount',    'fixed',      'summer_to_sy',     1000)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- SUPER ADMIN SETUP (run manually after first super admin signs up)
-- Replace with actual super admin email.
-- ─────────────────────────────────────────
-- UPDATE profiles
--   SET role      = 'super_admin',
--       school_id = NULL,
--       full_name = 'Platform Owner'
-- WHERE email = 'admin@laurislearn.com';
