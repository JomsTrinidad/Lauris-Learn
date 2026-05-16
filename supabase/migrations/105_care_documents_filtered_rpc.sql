-- ============================================================
-- Migration 105 — Care Performance Phase 3: filtered documents RPC.
--
-- Purpose:
--   `list_documents_for_organization` (077) returns EVERY active
--   grant for the calling clinic. The Care app then filters in
--   JavaScript:
--
--     listSharedDocuments(orgId, filterChildProfileId?)
--       calls list_documents_for_organization(orgId)
--       returns rows.filter(r => r.child_profile_id === filterChildProfileId)
--
--   With ~50-200 grants per clinic the per-child detail page
--   transmits ~50 KB of payload to render 1-3 rows. The cost
--   compounds because the same request fires on every child detail
--   page mount.
--
--   This migration adds a NEW SECURITY DEFINER STABLE RPC,
--   `get_care_documents_for_organization`, that accepts an optional
--   `p_child_profile_id` filter (plus a paging safety bound). The
--   existing `list_documents_for_organization` body is NOT touched —
--   it remains the fallback path and is referenced byte-clean by
--   smoke tests 077, 082, 103, 104.
--
-- Security posture (mirrors 077 / 082 / 103 / 104):
--   - SECURITY DEFINER STABLE.
--   - REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--   - Body-level auth.uid() gate.
--   - Identical access predicate to 077:
--       (a) caller is an active member of p_org_id, AND
--       (b) grant.target_organization_id = p_org_id, AND
--       (c) grant.status = 'active', AND
--       (d) grant.valid_until > NOW(), AND
--       (e) cd.status IN ('active','shared'), AND
--       (f) cd.current_version_id IS NOT NULL, AND
--       (g) cdv.is_hidden IS NOT TRUE.
--   - The optional p_child_profile_id filter ONLY narrows the
--     output — it cannot widen visibility. A clinic asking for a
--     child it has no grant on receives zero rows.
--   - No raw storage paths returned. The shape mirrors 077: it
--     surfaces document metadata for enumeration only. The
--     `log_document_access_for_organizations` RPC remains the sole
--     path to a signed URL — UNCHANGED.
--   - Disclosure-minimisation: non-members get 0 rows, no
--     exception (same posture as 077 / 082 / 103 / 104).
--   - Pagination bounds are advisory. The default limit (200) is
--     large enough to cover every realistic clinic-scale fan-out
--     while protecting against runaway responses.
--
-- Strict isolation constraints:
--   - No new tables, columns, enums, CHECK constraints, or RLS
--     policies.
--   - `list_documents_for_organization` (077) body is NOT modified.
--   - `accessible_document_ids()`, `log_document_access*`,
--     `caller_visible_child_profile_ids*`,
--     `caller_owned_child_profile_ids`, `caller_visible_document_ids_for_organizations`,
--     `get_care_child_with_details` (103), and
--     `get_care_sessions_with_therapists` (104) bodies stay
--     byte-clean. Smoke test 105 asserts this with
--     `pg_get_functiondef` regression checks.
--   - Removing this RPC leaves the app on the legacy
--     fetch-then-filter path.
--
-- Returned shape:
--   Identical to `list_documents_for_organization` (077) so callers
--   can swap the call site with a one-line change. Same column
--   names, same types, same ORDER BY.
-- ============================================================


CREATE OR REPLACE FUNCTION get_care_documents_for_organization(
  p_org_id            UUID,
  p_child_profile_id  UUID    DEFAULT NULL,
  p_limit             INT     DEFAULT 200,
  p_offset            INT     DEFAULT 0
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
  -- Clamp the limit defensively. Even if a caller passes a huge
  -- number, the body never returns more than 1000 rows in a single
  -- call. NULL → fall back to the default (200).
  v_limit     INT  := LEAST(COALESCE(p_limit, 200), 1000);
  v_offset    INT  := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- ── Auth gate ────────────────────────────────────────────────
  -- Unauthenticated → no rows. Disclosure-minimisation, matches
  -- 077 / 082 / 103 / 104 posture.
  IF v_actor_uid IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be an active member of the requested org. Binds
  -- the call to an org the caller already belongs to so a non-
  -- member cannot probe for the clinic's document inventory by
  -- passing arbitrary p_org_id values.
  IF NOT EXISTS (
    SELECT 1
      FROM organization_memberships om
     WHERE om.profile_id      = v_actor_uid
       AND om.organization_id = p_org_id
       AND om.status          = 'active'
  ) THEN
    RETURN;
  END IF;

  -- ── Query (mirrors 077, plus filter + pagination) ────────────
  -- The student→child_profile resolution is the same as 077:
  -- clinic users have no SELECT on `students`, so SECURITY DEFINER
  -- bypasses that policy for this single read. The returned
  -- child_profile_id is metadata only; opening the document still
  -- routes through log_document_access_for_organizations.
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
    -- Per-child filter. NULL → no filter (mirrors org-wide list).
    AND (p_child_profile_id IS NULL OR s.child_profile_id = p_child_profile_id)
  ORDER BY doag.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION get_care_documents_for_organization(
  UUID, UUID, INT, INT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_care_documents_for_organization(
  UUID, UUID, INT, INT
) TO authenticated;

COMMENT ON FUNCTION get_care_documents_for_organization(
  UUID, UUID, INT, INT
) IS
  'Care Performance Phase 3 — adds optional child_profile filter + pagination on top of list_documents_for_organization (077). Same return shape, same access predicate, same disclosure-minimisation posture. Does NOT modify the existing RPC or any helper. Storage paths are NOT exposed; signed URLs still flow through log_document_access_for_organizations only.';
