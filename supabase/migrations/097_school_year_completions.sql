-- 097_school_year_completions.sql
-- Durable year-end completion snapshots.
--
-- PURPOSE
-- -------
-- Captures facts that may become historically ambiguous if operational data
-- changes after a school year closes: class name, level name, progression outcome.
--
-- This table becomes the authoritative year-end truth for closed years.
-- Operational tables (enrollments, classes) remain the live source for active years.
--
-- WRITE-ONCE SEMANTICS
-- --------------------
-- No UPDATE policy is issued. The correction workflow is:
--   DELETE the affected row(s) → call POST /api/school-years/close again.
-- This is intentional — endless mutable edits erode historical trust.
--
-- GENERATION PATHS
-- ----------------
-- 1. POST /api/school-years/close — closes the active year and generates
--    snapshots for all enrollments (enrolled / completed / withdrawn).
-- 2. If a year is closed implicitly (new year activated), the same route is
--    called for the year being demoted before the new year is activated.
--
-- IDEMPOTENCY
-- -----------
-- INSERT uses ON CONFLICT (student_id, school_year_id) DO NOTHING.
-- Re-closing or re-running the route inserts zero duplicate rows.

CREATE TABLE IF NOT EXISTS school_year_completions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  school_id           UUID        NOT NULL REFERENCES schools(id)       ON DELETE RESTRICT,
  school_year_id      UUID        NOT NULL REFERENCES school_years(id)  ON DELETE RESTRICT,
  student_id          UUID        NOT NULL REFERENCES students(id)      ON DELETE RESTRICT,

  -- Nullable: enrollment may be deleted for data-correction purposes
  enrollment_id       UUID                 REFERENCES enrollments(id)   ON DELETE SET NULL,

  -- Durable name snapshots — captured at close time because class and level
  -- names may be renamed or deleted after the year ends.
  final_class_id      UUID                 REFERENCES classes(id)       ON DELETE SET NULL,
  final_class_name    TEXT,
  final_level_name    TEXT,

  -- Year-end outcome (mirrors enrollment state at close time).
  --   'completed'         — enrollment.status was 'completed' at close
  --                         (classified via year_end_classification)
  --   'withdrawn'         — enrollment.status was 'withdrawn'
  --                         (mid-year departure recorded before close)
  --   'enrolled_at_close' — still enrolled when year was force-closed;
  --                         progression_status may be NULL (unclassified)
  completion_status   TEXT        NOT NULL
                      CHECK (completion_status IN (
                        'completed',
                        'withdrawn',
                        'enrolled_at_close'
                      )),

  -- Mirrors enrollments.progression_status at snapshot time.
  -- NULL when the student was unclassified at close.
  progression_status  TEXT,

  -- When this snapshot was generated and by whom.
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by        UUID                 REFERENCES profiles(id)      ON DELETE SET NULL,

  -- One record per student per year — the unique constraint also serves
  -- as the ON CONFLICT target for idempotent inserts.
  UNIQUE (student_id, school_year_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Batch reads: list all completions for a given year (year-close admin view)
CREATE INDEX IF NOT EXISTS syc_school_year_idx
  ON school_year_completions (school_id, school_year_id);

-- Student history: all years for a single student
CREATE INDEX IF NOT EXISTS syc_student_idx
  ON school_year_completions (student_id);

-- Outcome queries (e.g. "how many graduated this year?")
CREATE INDEX IF NOT EXISTS syc_progression_idx
  ON school_year_completions (school_year_id, progression_status)
  WHERE progression_status IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE school_year_completions ENABLE ROW LEVEL SECURITY;

-- School members (admin + teacher) can read their school's completions.
CREATE POLICY "school_member_syc_select"
  ON school_year_completions
  FOR SELECT
  USING (
    is_super_admin()
    OR school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
  );

-- School admins may insert. The snapshot generation API route uses the
-- service-role client (bypasses RLS); this policy covers any future
-- browser-client path.
CREATE POLICY "school_admin_syc_insert"
  ON school_year_completions
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      current_user_role() = 'school_admin'
      AND school_id = current_user_school_id()
    )
  );

-- School admins may delete for the correction workflow (delete + regenerate).
-- No UPDATE policy — write-once semantics enforced at DB level.
CREATE POLICY "school_admin_syc_delete"
  ON school_year_completions
  FOR DELETE
  USING (
    is_super_admin()
    OR (
      current_user_role() = 'school_admin'
      AND school_id = current_user_school_id()
    )
  );

-- Super-admin bypass (FOR ALL covers SELECT/INSERT/UPDATE/DELETE).
CREATE POLICY "super_admin_all_syc"
  ON school_year_completions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
