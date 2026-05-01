-- Migration 049: School-year-specific fee type pricing + demo fee type refresh
--
-- Adds fee_type_prices for per-school-year pricing.
-- Fee types now carry a price per school year so prices from one year
-- never overwrite prices from another year.
-- Also aligns demo (BK) fee type names and mandatory flags with the spec.

-- ── 1. Ensure is_enrollment_mandatory column exists ───────────────────────────
ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS is_enrollment_mandatory BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Create fee_type_prices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_type_prices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type_id    UUID NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fee_type_id, school_year_id)
);

ALTER TABLE fee_type_prices ENABLE ROW LEVEL SECURITY;

-- School members can read and write their own school's prices
CREATE POLICY "school_members_fee_type_prices_all" ON fee_type_prices
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  );

-- ── 3. Refresh demo (BK) fee type names, descriptions, and mandatory flags ───
-- BK demo school: 00000000-0000-0000-0000-000000000001
-- BK active SY:   00000000-0000-0000-0000-000000000002

DO $$ BEGIN

  -- Tuition Fee (mandatory)
  UPDATE fee_types
    SET name = 'Tuition Fee',
        description = 'Monthly tuition fee',
        is_enrollment_mandatory = TRUE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('Tuition', 'Tuition Fee');

  -- Registration Fee (mandatory) — was "Enrollment Fee"
  UPDATE fee_types
    SET name = 'Registration Fee',
        description = 'One-time registration and enrollment fee',
        is_enrollment_mandatory = TRUE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('Enrollment Fee', 'Registration Fee');

  -- Miscellaneous Fee (mandatory) — was "External Fees"
  UPDATE fee_types
    SET name = 'Miscellaneous Fee',
        description = 'Miscellaneous school charges and government requirements',
        is_enrollment_mandatory = TRUE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('External Fees', 'Miscellaneous', 'Miscellaneous Fee');

  -- Books & Materials (mandatory) — was "Learning Materials"
  UPDATE fee_types
    SET name = 'Books & Materials',
        description = 'Textbooks, workbooks, and learning kits',
        is_enrollment_mandatory = TRUE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('Learning Materials', 'Books', 'Books & Materials');

  -- Uniform Fee (optional) — was "Uniform & Supplies"
  UPDATE fee_types
    SET name = 'Uniform Fee',
        description = 'School uniforms, PE attire, and supplies',
        is_enrollment_mandatory = FALSE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('Uniform & Supplies', 'Uniform Fee');

  -- Activity Fee (optional) — was "Activity & Optional Fees"
  UPDATE fee_types
    SET name = 'Activity Fee',
        description = 'School events and optional programs',
        is_enrollment_mandatory = FALSE
  WHERE school_id = '00000000-0000-0000-0000-000000000001'
    AND name IN ('Activity & Optional Fees', 'Activity Fee');

  -- Add optional fee types not yet present
  INSERT INTO fee_types (school_id, name, description, is_enrollment_mandatory)
  VALUES
    ('00000000-0000-0000-0000-000000000001', 'Field Trip Fee',   'Fees for school field trips and outings',       FALSE),
    ('00000000-0000-0000-0000-000000000001', 'Late Payment Fee', 'Fee charged for late or overdue payments',      FALSE),
    ('00000000-0000-0000-0000-000000000001', 'Other',            'Other miscellaneous fees not covered above',    FALSE)
  ON CONFLICT DO NOTHING;

END $$;

-- ── 4. Seed school-year prices for BK SY 2025-2026 ───────────────────────────
-- Tuition Fee is intentionally excluded — its price comes from tuition_configs.
INSERT INTO fee_type_prices (fee_type_id, school_year_id, school_id, amount)
SELECT
  ft.id,
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  CASE ft.name
    WHEN 'Registration Fee'  THEN 500
    WHEN 'Miscellaneous Fee' THEN 350
    WHEN 'Books & Materials' THEN 1800
    WHEN 'Uniform Fee'       THEN 1200
    WHEN 'Activity Fee'      THEN 250
    WHEN 'Field Trip Fee'    THEN 0
    WHEN 'Late Payment Fee'  THEN 0
    WHEN 'Other'             THEN 0
    ELSE 0
  END
FROM fee_types ft
WHERE ft.school_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (fee_type_id, school_year_id) DO NOTHING;
