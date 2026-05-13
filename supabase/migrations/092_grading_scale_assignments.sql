-- 092_grading_scale_assignments.sql
-- Connects progress tracking to grading scale sets via a context-aware
-- assignment hierarchy. Strictly additive except for migrating
-- progress_observations.rating from the fixed enum to TEXT so that
-- any scale label can be stored.
--
-- Resolution order (highest wins):
--   1. student_domain_override  (student_id + domain_id)
--   2. domain_default           (domain_id)
--   3. level_default            (level_id from the student's class)
--   4. school_default           (school-wide fallback)
--
-- Existing observations keep their values ('emerging', 'developing',
-- 'consistent', 'advanced') untouched; only the column type changes.

-- ── 1. Migrate progress_observations.rating from enum → text ──────────────
-- The progress_rating enum type is preserved in Postgres but no longer
-- referenced by this column. Existing string values are kept intact.
ALTER TABLE progress_observations
  ALTER COLUMN rating TYPE TEXT USING rating::text;

-- ── 2. Add scale_item_id to progress_observations ─────────────────────────
-- Tracks the grading_scales row selected when the observation was recorded.
-- NULL for observations recorded before this migration (legacy).
ALTER TABLE progress_observations
  ADD COLUMN IF NOT EXISTS scale_item_id UUID
    REFERENCES grading_scales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS progress_obs_scale_item_idx
  ON progress_observations(scale_item_id)
  WHERE scale_item_id IS NOT NULL;

-- ── 3. grading_scale_assignments table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_scale_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grading_scale_set_id UUID        NOT NULL REFERENCES grading_scale_sets(id) ON DELETE CASCADE,
  assignment_type      TEXT        NOT NULL
                       CHECK (assignment_type IN (
                         'school_default',
                         'level_default',
                         'domain_default',
                         'student_domain_override'
                       )),
  -- level_default: class_levels.id (required, others NULL)
  level_id    UUID NULL REFERENCES class_levels(id)      ON DELETE CASCADE,
  -- domain_default / student_domain_override: progress_categories.id
  domain_id   UUID NULL REFERENCES progress_categories(id) ON DELETE CASCADE,
  -- student_domain_override: students.id
  student_id  UUID NULL REFERENCES students(id)          ON DELETE CASCADE,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Enforce valid field combinations per assignment_type
  CONSTRAINT gsa_school_default_no_extras CHECK (
    assignment_type <> 'school_default'
    OR (level_id IS NULL AND domain_id IS NULL AND student_id IS NULL)
  ),
  CONSTRAINT gsa_level_default_requires_level CHECK (
    assignment_type <> 'level_default'
    OR (level_id IS NOT NULL AND domain_id IS NULL AND student_id IS NULL)
  ),
  CONSTRAINT gsa_domain_default_requires_domain CHECK (
    assignment_type <> 'domain_default'
    OR (level_id IS NULL AND domain_id IS NOT NULL AND student_id IS NULL)
  ),
  CONSTRAINT gsa_student_domain_requires_both CHECK (
    assignment_type <> 'student_domain_override'
    OR (student_id IS NOT NULL AND domain_id IS NOT NULL AND level_id IS NULL)
  )
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS gsa_school_type_idx
  ON grading_scale_assignments(school_id, assignment_type, is_active);
CREATE INDEX IF NOT EXISTS gsa_level_idx
  ON grading_scale_assignments(level_id) WHERE level_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gsa_domain_idx
  ON grading_scale_assignments(domain_id) WHERE domain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gsa_student_domain_idx
  ON grading_scale_assignments(student_id, domain_id)
  WHERE student_id IS NOT NULL;

-- Uniqueness: one active assignment per context
CREATE UNIQUE INDEX IF NOT EXISTS gsa_unique_school_default
  ON grading_scale_assignments(school_id)
  WHERE assignment_type = 'school_default' AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS gsa_unique_level_default
  ON grading_scale_assignments(school_id, level_id)
  WHERE assignment_type = 'level_default' AND is_active = true
    AND level_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gsa_unique_domain_default
  ON grading_scale_assignments(school_id, domain_id)
  WHERE assignment_type = 'domain_default' AND is_active = true
    AND domain_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gsa_unique_student_domain
  ON grading_scale_assignments(school_id, student_id, domain_id)
  WHERE assignment_type = 'student_domain_override' AND is_active = true
    AND student_id IS NOT NULL AND domain_id IS NOT NULL;

-- ── 4. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE grading_scale_assignments ENABLE ROW LEVEL SECURITY;

-- Staff can read (needed for observation entry); super_admin bypass
CREATE POLICY gsa_select ON grading_scale_assignments
  FOR SELECT
  USING (
    is_super_admin()
    OR school_id = current_user_school_id()
  );

-- Only school_admin can create/change/delete assignments
CREATE POLICY gsa_insert ON grading_scale_assignments
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (current_user_role() = 'school_admin'
        AND school_id = current_user_school_id())
  );

CREATE POLICY gsa_update ON grading_scale_assignments
  FOR UPDATE
  USING (
    is_super_admin()
    OR (current_user_role() = 'school_admin'
        AND school_id = current_user_school_id())
  )
  WITH CHECK (
    is_super_admin()
    OR (current_user_role() = 'school_admin'
        AND school_id = current_user_school_id())
  );

CREATE POLICY gsa_delete ON grading_scale_assignments
  FOR DELETE
  USING (
    is_super_admin()
    OR (current_user_role() = 'school_admin'
        AND school_id = current_user_school_id())
  );

-- updated_at — reuses the global set_updated_at() from schema.sql
CREATE TRIGGER gsa_set_updated_at
  BEFORE UPDATE ON grading_scale_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Seed BK pilot school → school_default ──────────────────────────────
-- Links the existing "Preschool Development Scale" set to the school's
-- default progress-tracking grading scale.
-- Uses WHERE NOT EXISTS so re-running is safe.
INSERT INTO grading_scale_assignments
  (school_id, grading_scale_set_id, assignment_type)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  'school_default'
WHERE
  EXISTS (
    SELECT 1 FROM grading_scale_sets
    WHERE id    = '00000000-0000-0000-0000-000000000003'
      AND school_id = '00000000-0000-0000-0000-000000000001'
  )
  AND NOT EXISTS (
    SELECT 1 FROM grading_scale_assignments
    WHERE school_id       = '00000000-0000-0000-0000-000000000001'
      AND assignment_type = 'school_default'
      AND is_active       = true
  );
