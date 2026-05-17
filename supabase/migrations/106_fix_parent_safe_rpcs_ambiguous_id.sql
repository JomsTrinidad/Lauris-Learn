-- ============================================================
-- Migration 106 — Fix ambiguous `id` reference in migration 091's RPCs.
--
-- Background:
--   Both list_parent_visible_therapy_updates(p_student_id UUID) and
--   list_parent_child_connected_services(p_student_id UUID) declared
--   `RETURNS TABLE (id UUID, ...)` (or used `id` indirectly via output
--   columns). That declaration makes `id` a function-local variable
--   in plpgsql. Inside each function body the lookup
--
--       SELECT child_profile_id INTO v_profile_id
--         FROM students
--        WHERE id = p_student_id;
--
--   triggered Postgres error 42702:
--     column reference "id" is ambiguous
--     hint: It could refer to either a PL/pgSQL variable or a table column.
--
--   Effect: REST calls to either RPC returned HTTP 400 from PostgREST,
--   so the parent dashboard's Therapy filter (and connected-services
--   surface) never received real cross-app therapy data even when the
--   identity bridge (students.child_profile_id) was correctly set.
--
-- Fix:
--   Qualify the lookup with a table alias (students s ... WHERE s.id =
--   p_student_id). No signature change, no return-shape change, no
--   RLS or permission change — strictly a body-level disambiguation.
--   Both functions remain SECURITY DEFINER STABLE with the same
--   parent_student_ids() guard, the same column projections, and the
--   same REVOKE/GRANT permissions as migration 091.
--
-- Strict isolation:
--   - No change to caller_owned_child_profile_ids().
--   - No change to caller_visible_child_profile_ids().
--   - No change to accessible_document_ids() / log_document_access*.
--   - No change to parent_student_ids() itself.
--   - No new tables, no new policies, no new triggers.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. list_parent_visible_therapy_updates
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION list_parent_visible_therapy_updates(p_student_id UUID)
RETURNS TABLE (
  id                     UUID,
  clinic_name            TEXT,
  therapy_type           TEXT,
  scheduled_at           TIMESTAMPTZ,
  status                 TEXT,
  parent_visible_summary TEXT,
  therapist_name         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Guard: caller must be a guardian (parent) of this student.
  IF NOT (p_student_id = ANY(parent_student_ids())) THEN
    RETURN;
  END IF;

  -- Resolve the child's cross-app identity profile.
  -- Qualified `s.id` avoids the ambiguity with the RETURNS TABLE `id` column.
  SELECT s.child_profile_id INTO v_profile_id
    FROM students s
   WHERE s.id = p_student_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Return completed sessions with an explicit parent-facing note.
  RETURN QUERY
  SELECT
    ts.id,
    o.name            AS clinic_name,
    ts.therapy_type,
    ts.scheduled_at,
    ts.status,
    ts.parent_visible_summary,
    p.full_name       AS therapist_name
  FROM   therapy_sessions ts
  JOIN   organizations o ON o.id = ts.clinic_organization_id
  LEFT JOIN profiles  p ON p.id = ts.therapist_profile_id
  WHERE  ts.child_profile_id       = v_profile_id
    AND  ts.status                 = 'completed'
    AND  ts.parent_visible_summary IS NOT NULL
    AND  ts.parent_visible_summary <> ''
  ORDER  BY ts.scheduled_at DESC
  LIMIT  10;
END;
$$;

REVOKE ALL    ON FUNCTION list_parent_visible_therapy_updates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_parent_visible_therapy_updates(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. list_parent_child_connected_services
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION list_parent_child_connected_services(p_student_id UUID)
RETURNS TABLE (
  source_category    TEXT,
  organization_id    UUID,
  organization_name  TEXT,
  relationship_kind  TEXT,
  status             TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Guard: caller must be a guardian (parent) of this student.
  IF NOT (p_student_id = ANY(parent_student_ids())) THEN
    RETURN;
  END IF;

  -- Resolve the child's cross-app identity profile.
  -- Qualified `s.id` avoids the ambiguity with the RETURNS TABLE columns.
  SELECT s.child_profile_id INTO v_profile_id
    FROM students s
   WHERE s.id = p_student_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Return active clinic / medical_practice memberships only.
  RETURN QUERY
  SELECT
    CASE o.kind
      WHEN 'clinic'           THEN 'therapy'
      WHEN 'medical_practice' THEN 'medical'
      ELSE                         'other'
    END                     AS source_category,
    cpm.organization_id,
    o.name                  AS organization_name,
    cpm.relationship_kind,
    cpm.status
  FROM   child_profile_memberships cpm
  JOIN   organizations o ON o.id = cpm.organization_id
  WHERE  cpm.child_profile_id = v_profile_id
    AND  cpm.status           = 'active'
    AND  o.kind               IN ('clinic', 'medical_practice');
END;
$$;

REVOKE ALL    ON FUNCTION list_parent_child_connected_services(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_parent_child_connected_services(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. Force PostgREST to pick up the new function bodies.
-- ════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════
-- Smoke checks — body-level disambiguation present.
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- T-1: both function bodies reference `s.id = p_student_id` (qualified).
  ASSERT (
    pg_get_functiondef('list_parent_visible_therapy_updates(uuid)'::regprocedure)
    ILIKE '%s.id = p_student_id%'
  ), 'T-1 failed: list_parent_visible_therapy_updates still uses unqualified `id`';

  ASSERT (
    pg_get_functiondef('list_parent_child_connected_services(uuid)'::regprocedure)
    ILIKE '%s.id = p_student_id%'
  ), 'T-2 failed: list_parent_child_connected_services still uses unqualified `id`';

  -- T-3: neither function body contains a bare `WHERE id = p_student_id`
  -- in the students lookup (regression guard against re-introducing the bug).
  ASSERT NOT (
    pg_get_functiondef('list_parent_visible_therapy_updates(uuid)'::regprocedure)
    ~* '\sWHERE\s+id\s*=\s*p_student_id'
  ), 'T-3 failed: unqualified WHERE id = p_student_id back in therapy RPC';

  ASSERT NOT (
    pg_get_functiondef('list_parent_child_connected_services(uuid)'::regprocedure)
    ~* '\sWHERE\s+id\s*=\s*p_student_id'
  ), 'T-4 failed: unqualified WHERE id = p_student_id back in services RPC';

  RAISE NOTICE '✓ All 106 smoke checks passed.';
END $$;
