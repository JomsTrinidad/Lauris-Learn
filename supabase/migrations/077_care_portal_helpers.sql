-- ============================================================
-- Migration 077 — Phase 6A: read-only enumeration helper for the
-- Lauris Care clinic portal.
--
-- Purpose:
--   Phase 5B (migration 076) gave clinic / medical-practice org users
--   a way to OPEN a specific shared document via
--   log_document_access_for_organizations(). It did NOT give them a
--   way to ENUMERATE which documents have been shared with their org,
--   because:
--     - child_documents and child_document_versions SELECT policies
--       resolve through accessible_document_ids() which has no
--       clinic arm (intentional — see 076 isolation guarantees).
--     - Joining through students.child_profile_id is unsafe: students
--       has no clinic-side SELECT policy, so a client-side join would
--       silently drop rows or surface as zero results.
--
--   This migration adds a single, additive, SECURITY DEFINER STABLE
--   helper that anchors enumeration on
--   document_organization_access_grants (the row a clinic user CAN
--   already see via the 5B policy) and walks outward to fetch the
--   enrichment fields needed to render a list (title, type, version
--   metadata, child_profile_id).
--
-- Strict isolation constraints (Phase 6A approval):
--   - accessible_document_ids() is NOT modified.
--   - log_document_access RPC is NOT modified.
--   - log_document_access_for_organizations RPC is NOT modified.
--   - caller_visible_document_ids_for_organizations() is NOT modified.
--   - No RLS policy on any existing table is added, removed, or
--     altered.
--   - No new tables, no new columns, no CHECK constraint changes.
--   - Single artifact: one new SECURITY DEFINER STABLE function.
--
-- What this RPC returns:
--   For a given target organization id, every (document, grant) pair
--   that satisfies:
--     - grant.target_organization_id = p_org_id
--     - grant.status = 'active'
--     - grant.valid_until > NOW()
--     - cd.status IN ('active','shared')
--     - cd.current_version_id IS NOT NULL
--     - cdv.is_hidden IS NOT TRUE
--   plus an authorization gate up-front:
--     caller MUST have an active organization_memberships row in
--     p_org_id; otherwise the function returns zero rows (no
--     exception, mirroring the disclosure-minimisation posture of
--     log_document_access / list_school_staff_for_sharing).
--
-- Note on returned child_profile_id:
--   The link from a child_documents row to its child_profile is
--   resolved via students.child_profile_id. SECURITY DEFINER lets
--   this query bypass the students SELECT policy. The returned
--   child_profile_id is metadata only — clinic users still need an
--   active child_profile_access_grants row to see the corresponding
--   child_profiles record (Phase 4 RLS).
-- ============================================================


CREATE OR REPLACE FUNCTION list_documents_for_organization(
  p_org_id UUID
)
RETURNS TABLE (
  document_id        UUID,
  title              TEXT,
  document_type      document_type,
  doc_status         document_status,
  current_version_id UUID,
  version_number     INT,
  mime_type          TEXT,
  file_name          TEXT,
  file_size_bytes    BIGINT,
  child_profile_id   UUID,
  permissions        JSONB,
  grant_valid_until  TIMESTAMPTZ,
  grant_created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_uid UUID := auth.uid();
BEGIN
  -- Unauthenticated → no rows. No exception (don't leak existence).
  IF v_actor_uid IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be an active member of the requested org.
  IF NOT EXISTS (
    SELECT 1
      FROM organization_memberships om
     WHERE om.profile_id      = v_actor_uid
       AND om.organization_id = p_org_id
       AND om.status          = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cd.id                    AS document_id,
    cd.title                 AS title,
    cd.document_type         AS document_type,
    cd.status                AS doc_status,
    cdv.id                   AS current_version_id,
    cdv.version_number       AS version_number,
    cdv.mime_type            AS mime_type,
    cdv.file_name            AS file_name,
    cdv.file_size            AS file_size_bytes,
    s.child_profile_id       AS child_profile_id,
    doag.permissions         AS permissions,
    doag.valid_until         AS grant_valid_until,
    doag.created_at          AS grant_created_at
  FROM document_organization_access_grants doag
  JOIN child_documents          cd  ON cd.id  = doag.document_id
  JOIN students                 s   ON s.id   = cd.student_id
  LEFT JOIN child_document_versions cdv ON cdv.id = cd.current_version_id
  WHERE doag.target_organization_id = p_org_id
    AND doag.status                 = 'active'
    AND doag.valid_until            > NOW()
    AND cd.status                  IN ('active','shared')
    AND cd.current_version_id IS NOT NULL
    AND (cdv.is_hidden IS NOT TRUE)
  ORDER BY doag.created_at DESC;
END;
$$;

-- Restrict EXECUTE to authenticated callers. The body's auth.uid()
-- and membership check are the real gates; this just keeps anonymous
-- clients from invoking it at all.
REVOKE ALL ON FUNCTION list_documents_for_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_documents_for_organization(UUID) TO authenticated;

COMMENT ON FUNCTION list_documents_for_organization(UUID) IS
  'Phase 6A — Care portal enumeration helper. Anchored on document_organization_access_grants. Returns 0 rows for non-members. Does NOT modify any existing RLS/helper/RPC.';
