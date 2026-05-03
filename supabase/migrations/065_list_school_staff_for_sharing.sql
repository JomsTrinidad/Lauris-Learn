-- ──────────────────────────────────────────────────────────────────────────
-- Migration 065 — list_school_staff_for_sharing RPC (Phase D step D10)
--
-- Purpose
--   The Document Coordination ShareDocumentModal needs to populate a picker
--   of staff in the same school so an admin can choose a `school_user`
--   grantee. The base `profiles` table only permits a user to SELECT their
--   own row (per supabase/schema.sql lines 423–428), and migration 002 adds
--   only a super-admin bypass — there is no same-school SELECT policy on
--   `profiles`.
--
--   Two viable fixes were considered:
--     (a) Add a same-school SELECT policy on `profiles`. Broadens default
--         visibility for many unrelated features, harder to reason about.
--     (b) Add a narrow SECURITY DEFINER RPC scoped to the sharing use case,
--         returning only the columns the picker needs.
--
--   We pick (b). It keeps RLS strict and exposes the minimum surface.
--
--   Auth: caller must be the school_admin OF p_school_id. Anything else
--   returns zero rows (we do NOT raise — same disclosure-minimization
--   posture as `log_document_access`).
--
--   The caller themselves is excluded from the result (you cannot share a
--   document with yourself).
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION list_school_staff_for_sharing(p_school_id UUID)
RETURNS TABLE (
  id        UUID,
  full_name TEXT,
  email     TEXT,
  role      user_role
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF current_user_role() <> 'school_admin'
     OR current_user_school_id() IS DISTINCT FROM p_school_id
  THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role
      FROM profiles p
     WHERE p.school_id = p_school_id
       AND p.role IN ('school_admin','teacher')
       AND p.id <> auth.uid()
     ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION list_school_staff_for_sharing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_school_staff_for_sharing(UUID) TO authenticated;
