-- 096_student_class_assignments.sql
-- Effective-dated class assignment history (operationally meaningful).
--
-- This table is the authoritative source for "which class was this student
-- in on a given date?" It stays in sync with enrollments.class_id via the
-- application-level assignStudentToClass() helper (admin.ts). The helper
-- is strongly consistent — write failures propagate as HTTP 500 rather
-- than being swallowed like the supplementary enrollment_transitions rows.
--
-- DATE semantics (not TIMESTAMPTZ) — school operations are day-granular.
-- end_date is the INCLUSIVE last day of the assignment.
-- An open (current) assignment has end_date IS NULL.
--
-- Transfer invariant: the helper always closes the prior open assignment
-- (end_date = transfer_date - 1) before opening the new one. If the new
-- INSERT succeeds but the enrollments.class_id UPDATE fails, the helper
-- rolls back the new row (best-effort) and returns { error }.
--
-- Same-day correction: if the open assignment's start_date equals the
-- transfer's start_date, the old row is closed with end_date = start_date
-- (a valid one-day inclusive range) and its assignment_kind is flipped to
-- 'correction'. The new row also receives assignment_kind = 'correction'.
-- end_date is NEVER set to a value less than start_date.

-- ── Fix Phase 2 defect first ──────────────────────────────────────────────────
-- enrollment_transitions used ON DELETE RESTRICT which breaks demo teardown
-- (demo/index.ts deletes enrollments). Change to CASCADE so enrollment deletes
-- automatically remove the supplementary history rows.

ALTER TABLE enrollment_transitions
  DROP CONSTRAINT IF EXISTS enrollment_transitions_enrollment_id_fkey;

ALTER TABLE enrollment_transitions
  ADD CONSTRAINT enrollment_transitions_enrollment_id_fkey
  FOREIGN KEY (enrollment_id)
  REFERENCES enrollments(id)
  ON DELETE CASCADE;

-- ── Main table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_class_assignments (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),

  enrollment_id   UUID  NOT NULL REFERENCES enrollments(id)   ON DELETE CASCADE,
  class_id        UUID  NOT NULL REFERENCES classes(id)       ON DELETE RESTRICT,

  -- Redundant but indexed for RLS + class-centric attendance queries.
  -- Written once at INSERT from enrollment; treated as immutable.
  student_id      UUID  NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  school_year_id  UUID  NOT NULL REFERENCES school_years(id)  ON DELETE RESTRICT,

  assignment_kind TEXT  NOT NULL
                  CHECK (assignment_kind IN (
                    'initial',    -- first class at enrollment
                    'transfer',   -- moved to a different class mid-year
                    'correction'  -- same-day fix (tombstone when end_date < start_date)
                  )),

  start_date      DATE  NOT NULL,
  end_date        DATE,           -- NULL = currently active; inclusive last day otherwise
  -- No CHECK (end_date >= start_date): the helper ensures this invariant at write time.

  changed_by      UUID  REFERENCES profiles(id) ON DELETE SET NULL,
  change_reason   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary attendance lookup: "which students are in class X on date D?"
CREATE INDEX IF NOT EXISTS sca_class_date_idx
  ON student_class_assignments (class_id, start_date);

-- Partial index accelerates finding the single open row per enrollment
CREATE INDEX IF NOT EXISTS sca_class_open_idx
  ON student_class_assignments (class_id)
  WHERE end_date IS NULL;

-- Student-year lookup for reporting
CREATE INDEX IF NOT EXISTS sca_student_year_idx
  ON student_class_assignments (student_id, school_year_id);

-- Enrollment lookup (close-prior-open query)
CREATE INDEX IF NOT EXISTS sca_enrollment_idx
  ON student_class_assignments (enrollment_id);

-- Enforce at most one open (current) assignment per enrollment
CREATE UNIQUE INDEX IF NOT EXISTS sca_enrollment_open_uniq
  ON student_class_assignments (enrollment_id)
  WHERE end_date IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE student_class_assignments ENABLE ROW LEVEL SECURITY;

-- School members can read assignments for students in their school
CREATE POLICY "school_member_sca_select"
  ON student_class_assignments
  FOR SELECT
  USING (
    is_super_admin()
    OR student_id IN (
      SELECT s.id FROM students s
      WHERE s.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- School admins may insert and update (admin client bypasses RLS in API routes;
-- these policies cover any future browser-client paths)
CREATE POLICY "school_admin_sca_insert"
  ON student_class_assignments
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      current_user_role() = 'school_admin'
      AND student_id IN (
        SELECT s.id FROM students s WHERE s.school_id = current_user_school_id()
      )
    )
  );

CREATE POLICY "school_admin_sca_update"
  ON student_class_assignments
  FOR UPDATE
  USING (
    is_super_admin()
    OR (
      current_user_role() = 'school_admin'
      AND student_id IN (
        SELECT s.id FROM students s WHERE s.school_id = current_user_school_id()
      )
    )
  );

-- No DELETE policy → deletes are always rejected (assignments are closed, not deleted)

-- Super-admin bypass
CREATE POLICY "super_admin_all_sca"
  ON student_class_assignments
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- One row per existing enrollment. Idempotent: WHERE NOT EXISTS guard.
--
-- Active enrollments → end_date IS NULL (open assignment)
-- Completed / withdrawn → end_date = COALESCE(e.end_date, e.updated_at::date)
--
-- changed_by is NULL for all historical rows (actor not known at backfill time).

INSERT INTO student_class_assignments (
  enrollment_id,
  class_id,
  student_id,
  school_year_id,
  assignment_kind,
  start_date,
  end_date,
  changed_by,
  change_reason,
  created_at
)
SELECT
  e.id                                                          AS enrollment_id,
  e.class_id,
  e.student_id,
  e.school_year_id,
  'initial'                                                     AS assignment_kind,
  COALESCE(
    e.enrolled_at::date,
    e.start_date,
    e.created_at::date,
    CURRENT_DATE
  )                                                             AS start_date,
  CASE
    WHEN e.status IN ('completed', 'withdrawn')
    THEN COALESCE(e.end_date, e.updated_at::date)
    ELSE NULL
  END                                                           AS end_date,
  NULL                                                          AS changed_by,
  'Backfilled from existing enrollment record'                  AS change_reason,
  NOW()                                                         AS created_at
FROM enrollments e
WHERE NOT EXISTS (
  SELECT 1
  FROM student_class_assignments sca
  WHERE sca.enrollment_id = e.id
);
