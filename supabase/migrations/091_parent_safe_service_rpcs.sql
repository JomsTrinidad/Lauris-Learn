-- ============================================================
-- Migration 091 — Parent-safe service presence and therapy feed RPCs.
--
-- Strict isolation constraints:
--   - No school-side helpers, policies, or document RPCs modified.
--   - No clinic-side helpers, policies, or document RPCs modified.
--   - No child_profiles, child_identifiers, or identifier helpers modified.
--   - caller_owned_child_profile_ids()                 → NOT modified.
--   - caller_visible_child_profile_ids()               → NOT modified.
--   - accessible_document_ids() / log_document_access* → NOT modified.
--
-- What this migration adds (all NEW, all additive):
--   1. list_parent_child_connected_services(p_student_id UUID)
--      — SECURITY DEFINER STABLE.
--      — Guarded by parent_student_ids(): returns empty if the
--        authenticated user is not a guardian of the given student.
--      — Resolves child_profile_id from students, then returns
--        active clinic / medical_practice memberships in child_profile_memberships.
--      — Returns ONLY: source_category, organization_id,
--        organization_name, relationship_kind, status.
--      — Does NOT return child identifiers, clinical notes,
--        documents, or any sensitive child data.
--      — Purpose: lets the parent portal show "connected services"
--        chips (school, therapy center, medical practice) without
--        requiring the parent to have organization_memberships.
--
--   2. list_parent_visible_therapy_updates(p_student_id UUID)
--      — SECURITY DEFINER STABLE.
--      — Guarded by parent_student_ids(): returns empty if the
--        authenticated user is not a guardian of the given student.
--      — Resolves child_profile_id from students, then returns
--        completed therapy_sessions where parent_visible_summary
--        is non-empty (the therapist's explicit parent-facing note).
--      — Returns ONLY: id, clinic_name, therapy_type, scheduled_at,
--        status, parent_visible_summary, therapist_name.
--      — Intentionally excludes: internal notes (therapy_sessions.notes),
--        raw clinical data, session_notes sub-rows, clinic documents.
--      — Only surfaces what the therapist explicitly published for
--        parents: parent_visible_summary must be non-null and non-empty.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. list_parent_child_connected_services
--
-- Returns active clinic / medical_practice org memberships for a
-- student's linked child_profile. The parent portal uses this to
-- render "connected service" chips (therapy center, doctor) next to
-- the school chip, without exposing clinical records or identifiers.
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
  -- parent_student_ids() reads guardians.email = auth.jwt()->>'email'.
  IF NOT (p_student_id = ANY(parent_student_ids())) THEN
    RETURN;
  END IF;

  -- Resolve the child's cross-app identity profile.
  -- NULL means the student was created before migration 071
  -- or was not backfilled — no connected services to enumerate.
  SELECT child_profile_id INTO v_profile_id
    FROM students
   WHERE id = p_student_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Return active clinic / medical_practice memberships.
  -- Mapped to 'therapy' or 'medical' source_category for the
  -- parent portal. School membership is implicit and not returned
  -- here — the parent layout already knows the school from context.
  --
  -- Only returns: org name, kind-derived category, relationship_kind.
  -- Does NOT return: child identifiers, clinical notes, documents,
  -- or any data requiring clinic-side authorization.
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

REVOKE ALL   ON FUNCTION list_parent_child_connected_services(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_parent_child_connected_services(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. list_parent_visible_therapy_updates
--
-- Returns completed therapy sessions where the therapist has written
-- an explicit parent-facing summary (parent_visible_summary).
-- The parent portal uses this to show therapy progress in the
-- "Latest Updates" feed.
--
-- Privacy boundaries enforced here:
--   - Only status = 'completed' sessions are returned.
--   - Only sessions with a non-null, non-empty parent_visible_summary.
--   - Internal notes (therapy_sessions.notes) are NOT returned.
--   - Raw clinical data, session sub-tables, clinic documents
--     are NOT returned.
--   - therapist_name is the profiles.full_name display name only;
--     no contact details, role, or membership data is returned.
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

  -- Resolve child_profile_id from students table.
  SELECT child_profile_id INTO v_profile_id
    FROM students
   WHERE id = p_student_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Return completed sessions with an explicit parent-facing note.
  -- Excludes: therapy_sessions.notes (internal), any session where
  -- parent_visible_summary was not deliberately populated.
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
  LEFT JOIN profiles  p ON p.id  = ts.therapist_profile_id
  WHERE  ts.child_profile_id       = v_profile_id
    AND  ts.status                 = 'completed'
    AND  ts.parent_visible_summary IS NOT NULL
    AND  ts.parent_visible_summary <> ''
  ORDER  BY ts.scheduled_at DESC
  LIMIT  10;
END;
$$;

REVOKE ALL   ON FUNCTION list_parent_visible_therapy_updates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_parent_visible_therapy_updates(UUID) TO authenticated;
