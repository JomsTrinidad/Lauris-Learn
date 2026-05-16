-- ============================================================
-- Migration 100 — Parent IEP Plan Acknowledgment
--
-- Adds the parent-side read access and acknowledgment mechanism
-- for finalized and approved IEP support plans.
--
-- Isolation constraints (all strictly additive):
--   - No existing student_plans policies are modified.
--   - parent_student_ids() / parent_guardian_ids() are NOT re-emitted.
--   - No sub-row tables (goals, interventions, progress, attachments)
--     are exposed to parents via this migration.
--   - No school-admin, teacher, or super_admin policies are modified.
--   - No clinic/care/identity helpers are modified.
--
-- What this migration adds:
--   1. "parent_select_finalized_plans" — SELECT policy on student_plans.
--      Parents can read plans for their own children only when
--      status IN ('finalized', 'approved'). No draft / in-progress
--      plans are ever exposed.
--
--   2. acknowledge_plan(p_plan_id UUID) RETURNS TEXT
--      SECURITY DEFINER VOLATILE RPC.
--      Guards:
--        - caller must be a guardian (parent) of the plan's student.
--        - plan must be finalized or approved.
--      Behaviour:
--        - Idempotent: returns 'ok' even if already acknowledged.
--        - Resolves the caller's guardian row for the FK column.
--        - Writes parent_acknowledged_at + parent_acknowledged_by_guardian_id.
--        - Never touches any other column.
--      Return values:
--        'ok'              — acknowledged (or already was).
--        'plan_not_found'  — no such plan id (or caller can't see it).
--        'not_authorized'  — caller is not a guardian of this student.
--        'plan_not_ready'  — plan is not finalized or approved yet.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. Parent SELECT policy — finalized/approved plans only
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "parent_select_finalized_plans" ON student_plans;

CREATE POLICY "parent_select_finalized_plans"
  ON student_plans
  FOR SELECT
  TO authenticated
  USING (
    student_id = ANY(parent_student_ids())
    AND status IN ('finalized', 'approved')
  );


-- ════════════════════════════════════════════════════════════════
-- 2. acknowledge_plan(p_plan_id UUID) RETURNS TEXT
--
-- Called from the parent portal after the parent reads a finalized
-- or approved plan and taps "Acknowledge".
--
-- Security posture:
--   SECURITY DEFINER — runs with function-owner privileges so it can
--   read plan details and guardian rows that the caller's session might
--   not directly have access to before the acknowledgment is recorded.
--   Body-level guards replicate the intent of the SELECT/UPDATE policies.
--
--   The function ONLY writes parent_acknowledged_at and
--   parent_acknowledged_by_guardian_id. All other columns are untouched.
--
-- Idempotency: a second call from the same parent returns 'ok' without
-- overwriting the existing acknowledged_at timestamp (first-write-wins).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION acknowledge_plan(p_plan_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_student_id    UUID;
  v_status        TEXT;
  v_already_acked BOOLEAN;
  v_guardian_id   UUID;
BEGIN
  -- Read plan metadata (bypasses RLS inside SECURITY DEFINER).
  SELECT student_id,
         status::TEXT,
         parent_acknowledged_at IS NOT NULL
    INTO v_student_id, v_status, v_already_acked
    FROM student_plans
   WHERE id = p_plan_id;

  -- Plan doesn't exist (or was deleted).
  IF NOT FOUND THEN
    RETURN 'plan_not_found';
  END IF;

  -- Guard: caller must be a guardian of this student.
  -- parent_student_ids() resolves JWT email → guardian.student_id[].
  IF NOT (v_student_id = ANY(parent_student_ids())) THEN
    RETURN 'not_authorized';
  END IF;

  -- Guard: plan must be in a parent-visible, ready-for-acknowledgment state.
  IF v_status NOT IN ('finalized', 'approved') THEN
    RETURN 'plan_not_ready';
  END IF;

  -- Idempotent: already acknowledged by this parent → return ok.
  IF v_already_acked THEN
    RETURN 'ok';
  END IF;

  -- Resolve the caller's guardian row for the FK column.
  -- Case-insensitive email match; LIMIT 1 handles edge case of multiple
  -- guardian rows with the same email for the same student.
  SELECT id INTO v_guardian_id
    FROM guardians
   WHERE lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
     AND student_id   = v_student_id
   LIMIT 1;

  -- Write acknowledgment — only these two columns, nothing else.
  UPDATE student_plans
     SET parent_acknowledged_at             = NOW(),
         parent_acknowledged_by_guardian_id = v_guardian_id
   WHERE id = p_plan_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL    ON FUNCTION acknowledge_plan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acknowledge_plan(UUID) TO authenticated;
