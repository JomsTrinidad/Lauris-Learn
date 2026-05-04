-- ============================================================
-- Migration 071 — Shared Child Identity Layer (Phase 1, additive)
--
-- Purpose:
--   Introduce a school-agnostic identity primitive (`child_profiles`)
--   plus a flexible identifier table (`child_identifiers`) that can
--   later serve sister apps (Lauris Care, Lauris Med). Existing
--   `students` rows get an OPTIONAL link via a nullable FK column.
--
-- DELIBERATELY OUT OF SCOPE here:
--   - No changes to `students` (other than the additive nullable FK
--     column), `child_documents`, `student_plans`, or any RLS helper /
--     policy on existing tables.
--   - No `organizations` / `organization_memberships` /
--     `child_profile_memberships` tables yet — Phase 2.
--   - No new storage bucket. No UI behavior change.
--
-- UUIDs:
--   This migration uses gen_random_uuid() (pgcrypto), not
--   uuid_generate_v4() (uuid-ossp), to avoid an extension-dependency
--   mismatch on Supabase projects where uuid-ossp may not be enabled.
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036 (school_id fallback
--                                   to actor's profile, so this works
--                                   on the school-agnostic tables)
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
--   is_super_admin()              — migration 002
--   parent_student_ids()          — migration 026
--   teacher_visible_student_ids() — migration 056 (patched 066)
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1.1 child_profiles
-- The shared child identity. School-agnostic on purpose: a child may
-- later belong to a clinic (Lauris Care) without being enrolled in a
-- school. Linked from `students` via a nullable FK (added in §2).
--
-- Naming model:
--   display_name  — REQUIRED. The single-field name shown by apps that
--                   don't capture legal-name detail (e.g. Lauris Care).
--   legal_name    — optional formal/legal full name when available.
--   first_name / middle_name / last_name / preferred_name — optional
--                   structured fields used by Lauris Learn today.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_profiles (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Names
  display_name           TEXT         NOT NULL,
  legal_name             TEXT,
  first_name             TEXT,
  middle_name            TEXT,
  last_name              TEXT,
  preferred_name         TEXT,

  -- Demographics (all nullable; intl-flexible).
  -- country_code is intentionally NOT defaulted on backfill.
  date_of_birth          DATE,
  sex_at_birth           TEXT,
  gender_identity        TEXT,
  primary_language       TEXT,
  country_code           TEXT,

  -- Provenance / forensics (informational, NOT used for authz)
  created_in_app         TEXT         NOT NULL DEFAULT 'lauris_learn',
  created_by_user_id     UUID         REFERENCES profiles(id) ON DELETE SET NULL,

  -- Bookkeeping
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT child_profiles_display_name_nonblank
    CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_child_profiles_dob
  ON child_profiles (date_of_birth);
CREATE INDEX IF NOT EXISTS idx_child_profiles_last_first
  ON child_profiles (last_name, first_name);


-- ─────────────────────────────────────────────────────────────────
-- 1.2 child_identifiers
-- Open identifier table. `identifier_type` is TEXT (NOT an enum) so
-- new types (LRN, passport, national_id, future Lauris Med codes,
-- intl student IDs) can be added without DDL. Uniqueness is enforced
-- via a partial-style unique INDEX with COALESCE on country_code, so
-- NULL country_code values still participate in uniqueness (a plain
-- UNIQUE table constraint would treat each NULL as distinct).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_identifiers (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id    UUID         NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  identifier_type     TEXT         NOT NULL,
  identifier_value    TEXT         NOT NULL,
  label               TEXT,                          -- free-text label (helpful when type='other')
  country_code        TEXT,
  issued_by           TEXT,
  valid_from          DATE,
  valid_to            DATE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT child_identifiers_type_nonblank
    CHECK (length(trim(identifier_type)) > 0),
  CONSTRAINT child_identifiers_value_nonblank
    CHECK (length(trim(identifier_value)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_child_identifiers_profile
  ON child_identifiers (child_profile_id);
CREATE INDEX IF NOT EXISTS idx_child_identifiers_type_value
  ON child_identifiers (identifier_type, identifier_value);

-- Uniqueness with NULL-safe country_code — plain table-level UNIQUE
-- treats every NULL as distinct, which would let duplicate
-- (type, value) rows slip through whenever country_code is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS child_identifiers_unique_idx
  ON child_identifiers (
    identifier_type,
    identifier_value,
    COALESCE(country_code, '')
  );


-- ════════════════════════════════════════════════════════════════
-- 2. ADDITIVE COLUMN ON students
-- ════════════════════════════════════════════════════════════════

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS child_profile_id UUID
    REFERENCES child_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_child_profile_id
  ON students (child_profile_id);


-- ════════════════════════════════════════════════════════════════
-- 3. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- updated_at on child_profiles head
DROP TRIGGER IF EXISTS set_child_profiles_updated_at ON child_profiles;
CREATE TRIGGER set_child_profiles_updated_at
  BEFORE UPDATE ON child_profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- DML audit (matches the project-wide pattern from migration 036).
-- audit_log_trigger() falls back to the actor's profile.school_id when
-- the row has no school_id column — exactly our case here.
DROP TRIGGER IF EXISTS audit_child_profiles ON child_profiles;
CREATE TRIGGER audit_child_profiles
  AFTER INSERT OR UPDATE OR DELETE ON child_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_child_identifiers ON child_identifiers;
CREATE TRIGGER audit_child_identifiers
  AFTER INSERT OR UPDATE OR DELETE ON child_identifiers
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 4. RLS HELPER
-- ════════════════════════════════════════════════════════════════

-- Returns the set of child_profile.ids the calling user can already
-- see via existing student-visibility helpers. SECURITY DEFINER STABLE
-- to mirror the rest of the access helpers (002 / 026 / 031 / 056 / 066).
--
-- Resolution paths (all OR'd):
--   • super_admin                           → all profiles
--   • school_admin of school S              → all profiles linked from
--                                             students with school_id = S
--   • teacher                               → profiles linked from
--                                             teacher_visible_student_ids()
--   • parent                                → profiles linked from
--                                             parent_student_ids()
--
-- A child_profile not linked to any student is invisible to non-super-admins
-- in Phase 1 (Phase 2 will add organization_memberships paths).
CREATE OR REPLACE FUNCTION caller_visible_child_profile_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT cp_id), ARRAY[]::UUID[])
  FROM (
    -- super_admin → everything
    SELECT cp.id AS cp_id
      FROM child_profiles cp
      WHERE is_super_admin()

    UNION

    -- school_admin → linked from students in their school
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'school_admin'
        AND s.school_id = current_user_school_id()

    UNION

    -- teacher → linked from teacher-visible students
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'teacher'
        AND s.id = ANY(teacher_visible_student_ids())

    UNION

    -- parent → linked from guardian-bound students
    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'parent'
        AND s.id = ANY(parent_student_ids())
  ) t;
$$;


-- ════════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE child_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_identifiers ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- 5.1 child_profiles
-- Conservative Phase 1 posture:
--   SELECT — anyone whose visibility set contains the row.
--   INSERT — school_admin only (linking to a student happens via the
--            students.UPDATE path, which has its own RLS).
--   UPDATE — school_admin only, only on rows already linked to a
--            student in their school.
--   DELETE — no one in Phase 1 (no policy = denied).
--   super_admin — full bypass.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_visible_child_profiles"      ON child_profiles;
DROP POLICY IF EXISTS "school_admin_insert_child_profiles" ON child_profiles;
DROP POLICY IF EXISTS "school_admin_update_child_profiles" ON child_profiles;
DROP POLICY IF EXISTS "super_admin_all_child_profiles"     ON child_profiles;

CREATE POLICY "select_visible_child_profiles"
  ON child_profiles
  FOR SELECT
  TO authenticated
  USING (id = ANY(caller_visible_child_profile_ids()));

CREATE POLICY "school_admin_insert_child_profiles"
  ON child_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (current_user_role() = 'school_admin');

CREATE POLICY "school_admin_update_child_profiles"
  ON child_profiles
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_profiles.id
        AND s.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_profiles.id
        AND s.school_id = current_user_school_id()
    )
  );

CREATE POLICY "super_admin_all_child_profiles"
  ON child_profiles
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ─────────────────────────────────────────────────────────────────
-- 5.2 child_identifiers
-- Sub-row policies piggyback on the parent profile being linked to a
-- student in the admin's school. SELECT uses the same visibility
-- helper as child_profiles.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_visible_child_identifiers"     ON child_identifiers;
DROP POLICY IF EXISTS "school_admin_write_child_identifiers" ON child_identifiers;
DROP POLICY IF EXISTS "super_admin_all_child_identifiers"    ON child_identifiers;

CREATE POLICY "select_visible_child_identifiers"
  ON child_identifiers
  FOR SELECT
  TO authenticated
  USING (child_profile_id = ANY(caller_visible_child_profile_ids()));

CREATE POLICY "school_admin_write_child_identifiers"
  ON child_identifiers
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_identifiers.child_profile_id
        AND s.school_id = current_user_school_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_identifiers.child_profile_id
        AND s.school_id = current_user_school_id()
    )
  );

CREATE POLICY "super_admin_all_child_identifiers"
  ON child_identifiers
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 6. BACKFILL (idempotent — safe to re-run)
--
-- Mapping is direct and deterministic via a pre-minted UUID per
-- student row. No name/DOB matching, no ROW_NUMBER pairing.
--
-- Step A: pre-mint (student_id, profile_id) pairs in a MATERIALIZED
--         CTE so gen_random_uuid() is evaluated once and the same
--         profile_id is referenced by both the INSERT and the UPDATE.
-- Step B: INSERT one child_profiles row per pair using the minted id.
--         display_name is computed null-safely: COALESCE+NULLIF guards
--         against empty/whitespace name pairs falling foul of the
--         child_profiles_display_name_nonblank CHECK; falls back to
--         literal 'Unknown' when both names are missing.
-- Step C: UPDATE students.child_profile_id from the same CTE, joining
--         on the carried student_id — exact 1:1.
--
-- Step D: copy student_code → child_identifiers as 'school_internal'
--         with country_code='PH' (identifier metadata; the BK pilot
--         is PH). Guarded against re-runs.
-- ════════════════════════════════════════════════════════════════

-- A + B + C — child_profiles + students.child_profile_id link
WITH minted AS MATERIALIZED (
  SELECT
    s.id                  AS student_id,
    gen_random_uuid()     AS profile_id,
    s.first_name,
    s.last_name,
    s.preferred_name,
    s.date_of_birth
  FROM students s
  WHERE s.child_profile_id IS NULL
),
inserted AS (
  INSERT INTO child_profiles (
    id,
    display_name,
    first_name, last_name, preferred_name,
    date_of_birth,
    created_in_app
  )
  SELECT
    m.profile_id,
    COALESCE(
      NULLIF(
        btrim(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')),
        ''
      ),
      'Unknown'
    ),
    m.first_name,
    m.last_name,
    m.preferred_name,
    m.date_of_birth,
    'lauris_learn'
  FROM minted m
  RETURNING id
)
UPDATE students s
   SET child_profile_id = m.profile_id
  FROM minted m
 WHERE s.id = m.student_id
   AND s.child_profile_id IS NULL
   -- Force evaluation of the `inserted` CTE before the UPDATE row's
   -- FK check fires. Postgres always executes data-modifying CTEs to
   -- completion, but referencing it here makes the dependency explicit
   -- to readers and to the planner.
   AND EXISTS (SELECT 1 FROM inserted WHERE inserted.id = m.profile_id);


-- D — child_identifiers from students.student_code
INSERT INTO child_identifiers (
  child_profile_id,
  identifier_type,
  identifier_value,
  country_code
)
SELECT
  s.child_profile_id,
  'school_internal',
  s.student_code,
  'PH'
FROM students s
WHERE s.student_code IS NOT NULL
  AND s.child_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM child_identifiers ci
     WHERE ci.child_profile_id = s.child_profile_id
       AND ci.identifier_type  = 'school_internal'
       AND ci.identifier_value = s.student_code
       AND COALESCE(ci.country_code, '') = 'PH'
  );


-- ============================================================
-- End of Migration 071
-- ============================================================
