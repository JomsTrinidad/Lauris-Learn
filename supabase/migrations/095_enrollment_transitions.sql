-- 095_enrollment_transitions.sql
-- Supplementary enrollment lifecycle history (purely additive).
-- NOT a replacement for enrollments.status — the current enrollment row
-- remains authoritative. This table answers "what happened and when?"
-- without disturbing any existing query or UI.
--
-- Append-only by design: no UPDATE or DELETE RLS policies are issued.

CREATE TABLE IF NOT EXISTS enrollment_transitions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id           UUID        NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  transition_kind         TEXT        NOT NULL
                          CHECK (transition_kind IN (
                            'enrolled',               -- first enrolment of student into a class
                            'status_change',          -- any change to enrollments.status
                            'progression_classified', -- progression_status set / changed
                            'correction'              -- manual fix by admin (change_reason required)
                          )),
  from_status             TEXT,       -- NULL for 'enrolled' rows (no prior state)
  to_status               TEXT        NOT NULL,
  from_progression_status TEXT,
  to_progression_status   TEXT,
  changed_by              UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  change_reason           TEXT,
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: full history of a single enrolment, oldest-first
CREATE INDEX IF NOT EXISTS et_enrollment_time_idx
  ON enrollment_transitions (enrollment_id, changed_at ASC);

-- Actor audit: all transitions by a given user
CREATE INDEX IF NOT EXISTS et_actor_idx
  ON enrollment_transitions (changed_by, changed_at DESC);

-- Kind-based queries (e.g. "all graduations this year")
CREATE INDEX IF NOT EXISTS et_kind_idx
  ON enrollment_transitions (transition_kind, changed_at DESC);

ALTER TABLE enrollment_transitions ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────
-- School members can read transitions for enrollments that belong to their school.
CREATE POLICY "school_member_enrollment_transitions_select"
  ON enrollment_transitions
  FOR SELECT
  USING (
    is_super_admin()
    OR enrollment_id IN (
      SELECT e.id
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- School admins and teachers may insert for their school's enrolments.
-- (API-route writes use the service-role / admin client which bypasses RLS;
--  this policy covers the browser-client path in students/page.tsx.)
CREATE POLICY "school_member_enrollment_transitions_insert"
  ON enrollment_transitions
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR enrollment_id IN (
      SELECT e.id
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- No UPDATE policy  → updates are always rejected (append-only)
-- No DELETE policy  → deletes are always rejected (append-only)

-- ── Super-admin bypass ───────────────────────────────────────────────────────
CREATE POLICY "super_admin_all_enrollment_transitions"
  ON enrollment_transitions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- One synthetic "initial state" row per existing enrolment.
-- Idempotent: WHERE NOT EXISTS guard means re-runs insert 0 rows.
-- changed_by is NULL (historical — we don't know who made these changes).

INSERT INTO enrollment_transitions (
  enrollment_id,
  transition_kind,
  from_status,
  to_status,
  from_progression_status,
  to_progression_status,
  changed_by,
  change_reason,
  changed_at,
  created_at
)
SELECT
  e.id,
  CASE
    WHEN e.progression_status IS NOT NULL THEN 'progression_classified'
    WHEN e.status = 'enrolled'            THEN 'enrolled'
    ELSE                                       'status_change'
  END AS transition_kind,
  NULL  AS from_status,              -- no prior state known for historical rows
  e.status AS to_status,
  NULL  AS from_progression_status,
  e.progression_status AS to_progression_status,
  NULL  AS changed_by,
  'Backfilled from existing enrollment record' AS change_reason,
  COALESCE(e.enrolled_at, e.created_at, NOW()) AS changed_at,
  NOW() AS created_at
FROM enrollments e
WHERE NOT EXISTS (
  SELECT 1
  FROM enrollment_transitions et
  WHERE et.enrollment_id = e.id
);
