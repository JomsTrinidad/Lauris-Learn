-- ============================================================
-- Lauris Learn – Full Database Schema
-- SaaS-ready: multi-school, multi-branch
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- SCHOOLS & BRANCHES
-- ─────────────────────────────────────────

CREATE TABLE schools (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- SCHOOL YEARS
-- ─────────────────────────────────────────

CREATE TYPE school_year_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE school_years (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- e.g. "SY 2025–2026"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      school_year_status NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active school year per school
CREATE UNIQUE INDEX one_active_year_per_school
  ON school_years(school_id)
  WHERE status = 'active';

-- ─────────────────────────────────────────
-- USER PROFILES (extends Supabase auth.users)
-- ─────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('super_admin', 'school_admin', 'teacher', 'parent');

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   UUID REFERENCES schools(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'teacher',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ─────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────

CREATE TABLE classes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,          -- e.g. "Toddlers", "Pre-Kinder", "Kinder"
  level          TEXT,                   -- age group / level label
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  capacity       INT NOT NULL DEFAULT 20,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: teacher_id originally referenced profiles(id); migration 058
-- re-points it to teacher_profiles(id). teacher_profiles is created in
-- migration 004, so on fresh-project setup the FK is added there.
CREATE TABLE class_teachers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, teacher_id)
);

-- ─────────────────────────────────────────
-- STUDENTS & GUARDIANS
-- ─────────────────────────────────────────

CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  date_of_birth DATE,
  gender        TEXT,
  photo_url     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guardians (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  relationship         TEXT NOT NULL,   -- e.g. "Mother", "Father", "Guardian"
  phone                TEXT,
  email                TEXT,
  is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
  is_emergency_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- ENROLLMENTS
-- ─────────────────────────────────────────

CREATE TYPE enrollment_status AS ENUM (
  'inquiry', 'waitlisted', 'enrolled', 'withdrawn', 'completed'
);

CREATE TABLE enrollments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id       UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE RESTRICT,
  status         enrollment_status NOT NULL DEFAULT 'inquiry',
  enrolled_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, school_year_id)   -- one active enrollment per student per year
);

-- ─────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────

CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'excused');

CREATE TABLE attendance_records (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  status       attendance_status NOT NULL,
  note         TEXT,
  recorded_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, student_id, date)
);

-- ─────────────────────────────────────────
-- PARENT UPDATES / CLASS FEED
-- ─────────────────────────────────────────

CREATE TABLE parent_updates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   UUID REFERENCES classes(id) ON DELETE SET NULL,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  photo_url  TEXT,             -- placeholder for future storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- BILLING & PAYMENTS
-- ─────────────────────────────────────────

CREATE TYPE billing_status AS ENUM ('unpaid', 'partial', 'paid', 'overdue');
CREATE TYPE payment_method_type AS ENUM ('cash', 'bank_transfer', 'gcash', 'maya', 'card', 'other');
CREATE TYPE payment_status_type AS ENUM ('pending', 'confirmed', 'failed', 'refunded');

CREATE TABLE billing_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE RESTRICT,
  billing_month  TEXT NOT NULL,          -- e.g. "2025-06"
  amount_due     NUMERIC(10,2) NOT NULL,
  status         billing_status NOT NULL DEFAULT 'unpaid',
  due_date       DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_record_id UUID NOT NULL REFERENCES billing_records(id) ON DELETE CASCADE,
  amount            NUMERIC(10,2) NOT NULL,
  payment_method    payment_method_type NOT NULL DEFAULT 'cash',
  reference_number  TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  notes             TEXT,
  recorded_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status            payment_status_type NOT NULL DEFAULT 'confirmed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- HOLIDAYS & SCHEDULE OVERRIDES
-- ─────────────────────────────────────────

CREATE TABLE holidays (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  date           DATE NOT NULL,
  applies_to_all BOOLEAN NOT NULL DEFAULT TRUE,
  is_no_class    BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link holidays to specific classes when applies_to_all = false
CREATE TABLE holiday_classes (
  holiday_id UUID NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (holiday_id, class_id)
);

-- ─────────────────────────────────────────
-- EVENTS & RSVP
-- ─────────────────────────────────────────

CREATE TYPE event_applies_to AS ENUM ('all', 'class', 'selected');
CREATE TYPE rsvp_status AS ENUM ('going', 'not_going', 'maybe');

CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  DATE NOT NULL,
  start_time  TIME,
  end_time    TIME,
  applies_to  event_applies_to NOT NULL DEFAULT 'all',
  fee         NUMERIC(10,2),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_rsvps (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status     rsvp_status NOT NULL DEFAULT 'maybe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, student_id)
);

-- ─────────────────────────────────────────
-- ENROLLMENT INQUIRIES (pipeline)
-- ─────────────────────────────────────────

CREATE TYPE inquiry_status AS ENUM (
  'inquiry', 'assessment_scheduled', 'waitlisted',
  'offered_slot', 'enrolled', 'not_proceeding'
);

CREATE TABLE enrollment_inquiries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  child_name      TEXT NOT NULL,
  parent_name     TEXT NOT NULL,
  contact         TEXT,
  email           TEXT,
  desired_class   TEXT,
  school_year_id  UUID REFERENCES school_years(id) ON DELETE SET NULL,
  inquiry_source  TEXT,
  status          inquiry_status NOT NULL DEFAULT 'inquiry',
  notes           TEXT,
  next_follow_up  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- ONLINE CLASS SESSIONS
-- ─────────────────────────────────────────

CREATE TYPE online_class_status AS ENUM ('scheduled', 'live', 'completed', 'cancelled');

CREATE TABLE online_class_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  date         DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  meeting_link TEXT,
  notes        TEXT,
  status       online_class_status NOT NULL DEFAULT 'scheduled',
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- PROGRESS TRACKING
-- ─────────────────────────────────────────

CREATE TYPE progress_rating AS ENUM ('emerging', 'developing', 'consistent', 'advanced');

CREATE TABLE progress_categories (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  applies_to_level    TEXT,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE progress_observations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES progress_categories(id) ON DELETE CASCADE,
  rating       progress_rating NOT NULL,
  note         TEXT,
  observed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  observed_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGER (reusable)
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to every table that has updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'schools','branches','school_years','profiles','classes','class_teachers',
    'students','guardians','enrollments','attendance_records','parent_updates',
    'billing_records','payments','holidays','events','event_rsvps',
    'enrollment_inquiries','online_class_sessions','progress_categories',
    'progress_observations'
  ]) LOOP
    EXECUTE format('
      CREATE TRIGGER set_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
    ', t, t);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────
-- ROW-LEVEL SECURITY (RLS)
-- Enable on all tables – policies to be refined per role
-- ─────────────────────────────────────────

ALTER TABLE schools               ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_years          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teachers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians             ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_updates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays              ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_classes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_inquiries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_observations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- School-scoped policy helper: all data within same school as the user's profile
-- These broad policies allow all authenticated users in the same school to read data.
-- Tighten per-role in production.

CREATE POLICY "School members can view school data"
  ON schools FOR SELECT
  USING (id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view branches"
  ON branches FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view school years"
  ON school_years FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view classes"
  ON classes FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view students"
  ON students FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view guardians"
  ON guardians FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view enrollments"
  ON enrollments FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view attendance"
  ON attendance_records FOR SELECT
  USING (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view parent_updates"
  ON parent_updates FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view billing"
  ON billing_records FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view payments"
  ON payments FOR SELECT
  USING (billing_record_id IN (SELECT id FROM billing_records WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view holidays"
  ON holidays FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view holiday_classes"
  ON holiday_classes FOR SELECT
  USING (holiday_id IN (SELECT id FROM holidays WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view events"
  ON events FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view rsvps"
  ON event_rsvps FOR SELECT
  USING (event_id IN (SELECT id FROM events WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view inquiries"
  ON enrollment_inquiries FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view online sessions"
  ON online_class_sessions FOR SELECT
  USING (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view class_teachers"
  ON class_teachers FOR SELECT
  USING (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "School members can view progress categories"
  ON progress_categories FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "School members can view progress observations"
  ON progress_observations FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

-- Admin/teacher write policies (school_admin and teacher can insert/update/delete)
-- Simplified: any authenticated user in the school can write – tighten by role later
CREATE POLICY "School members can insert school years"    ON school_years          FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update school years"    ON school_years          FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert classes"         ON classes               FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update classes"         ON classes               FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert students"        ON students              FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update students"        ON students              FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert guardians"       ON guardians             FOR INSERT WITH CHECK (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can update guardians"       ON guardians             FOR UPDATE USING    (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert enrollments"     ON enrollments           FOR INSERT WITH CHECK (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can update enrollments"     ON enrollments           FOR UPDATE USING    (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert attendance"      ON attendance_records    FOR INSERT WITH CHECK (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can update attendance"      ON attendance_records    FOR UPDATE USING    (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert parent_updates"  ON parent_updates        FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert billing"         ON billing_records       FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update billing"         ON billing_records       FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert payments"        ON payments              FOR INSERT WITH CHECK (billing_record_id IN (SELECT id FROM billing_records WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert holidays"        ON holidays              FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update holidays"        ON holidays              FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert events"          ON events                FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update events"          ON events                FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert rsvps"           ON event_rsvps           FOR INSERT WITH CHECK (event_id IN (SELECT id FROM events WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert inquiries"       ON enrollment_inquiries  FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can update inquiries"       ON enrollment_inquiries  FOR UPDATE USING    (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert online sessions" ON online_class_sessions FOR INSERT WITH CHECK (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can update online sessions" ON online_class_sessions FOR UPDATE USING    (class_id IN (SELECT id FROM classes WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "School members can insert progress cats"   ON progress_categories   FOR INSERT WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "School members can insert observations"    ON progress_observations FOR INSERT WITH CHECK (student_id IN (SELECT id FROM students WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())));

-- ─────────────────────────────────────────
-- SEED: Pilot school "Bright Kids Learning and Tutorial Center"
-- Uncomment and run after schema is in place
-- ─────────────────────────────────────────

-- INSERT INTO schools (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Bright Kids Learning and Tutorial Center');
-- INSERT INTO branches (school_id, name, address) VALUES ('00000000-0000-0000-0000-000000000001', 'Main Branch', 'Your Address Here');
-- INSERT INTO school_years (school_id, name, start_date, end_date, status) VALUES ('00000000-0000-0000-0000-000000000001', 'SY 2025–2026', '2025-06-01', '2026-03-31', 'active');
