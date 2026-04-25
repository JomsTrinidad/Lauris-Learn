-- 004_student_enhancements.sql
-- Student profiles, student codes, teacher profiles, guardian communication preferences

-- ── Student extended fields ──────────────────────────────────────────────────

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code          text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_name        text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies             text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_conditions    text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact_name  text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS authorized_pickups    text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS primary_language      text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS special_needs         text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS teacher_notes         text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_notes           text;

-- Unique student code per school (null values allowed, not unique-constrained)
CREATE UNIQUE INDEX IF NOT EXISTS students_school_student_code_unique
  ON students(school_id, student_code)
  WHERE student_code IS NOT NULL;

-- ── School settings for student code generation ───────────────────────────────

ALTER TABLE schools ADD COLUMN IF NOT EXISTS student_code_prefix       text    DEFAULT 'LL';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS student_code_padding      integer DEFAULT 4;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS student_code_include_year boolean DEFAULT false;

-- ── Guardian communication preference ────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_preference_type') THEN
    CREATE TYPE communication_preference_type AS ENUM (
      'app', 'sms_phone', 'printed_note', 'in_person', 'assisted_by_school'
    );
  END IF;
END $$;

ALTER TABLE guardians ADD COLUMN IF NOT EXISTS communication_preference communication_preference_type DEFAULT 'app';

-- ── Teacher profiles (standalone, not linked to auth.users) ──────────────────

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name   text        NOT NULL,
  email       text,
  phone       text,
  start_date  date,
  end_date    date,
  is_active   boolean     NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_member_teacher_profiles" ON teacher_profiles
  FOR ALL
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR is_super_admin()
  );

-- Super admin bypass
CREATE POLICY "super_admin_teacher_profiles" ON teacher_profiles
  FOR ALL USING (is_super_admin());

-- Index for lookups
CREATE INDEX IF NOT EXISTS teacher_profiles_school_id_idx ON teacher_profiles(school_id);
CREATE INDEX IF NOT EXISTS students_school_student_code_idx ON students(school_id, student_code);
