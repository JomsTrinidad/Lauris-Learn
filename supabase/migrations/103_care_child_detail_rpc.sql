-- ============================================================
-- Migration 103 — Care Performance Phase 1: child detail RPC.
--
-- Purpose:
--   The Care portal's child detail page currently fans out into
--   5+ client-side queries to assemble the per-child shell:
--     listOwnedChildren(orgId)                — find ownership
--     listGrantedChildren(orgId)              — find grant scope/expiry
--     getChildIdentity(childId)               — identity core fields
--     listChildIdentifiers(childId)           — identifier list
--     getChildClinicMembershipState(orgId,    — 2 internal queries
--                                   childId)
--
--   Net cost: 6+ Supabase round-trips before the page renders. The
--   page blocks behind a full-page spinner for ~800ms.
--
--   This RPC bundles the read into a single SECURITY DEFINER STABLE
--   call that returns 0 or 1 row. RLS semantics are preserved at the
--   body level — the function refuses to return identity data unless
--   the caller meets the EXACT visibility predicate the existing
--   policies enforce:
--
--     (1) caller is authenticated AND
--     (2) caller has an active organization_memberships row in p_org_id AND
--     (3) either:
--          (a) child_profiles.origin_organization_id = p_org_id
--              (Phase 6B ownership arm), OR
--          (b) an active, currently-valid
--              child_profile_access_grants row exists on
--              (p_child_profile_id, p_org_id)
--              (Phase 4 grant arm).
--
--   Identifier visibility is gated separately to mirror Phase 5A:
--     owned children always see identifiers; shared children see
--     them only when grant.scope = 'identity_with_identifiers'.
--
-- Strict isolation constraints:
--   - No new tables, columns, enums, or CHECK constraints.
--   - No RLS policies are added, removed, or altered.
--   - No existing helper or RPC is modified.
--   - caller_visible_child_profile_ids() and
--     caller_visible_child_profile_ids_for_identifiers() are NOT
--     touched.
--   - The function is purely additive. Removing it leaves the app
--     working on the legacy 5-query fallback path.
--
-- Security posture (mirrors 077 / 065):
--   - Body-level auth.uid() gate.
--   - REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--   - Non-members of p_org_id silently return zero rows (no
--     exception — disclosure-minimisation).
--   - Caller cannot widen visibility by passing an arbitrary
--     p_org_id; the membership check binds the call to an org the
--     caller already belongs to.
--   - The identifiers JSONB array is empty when the grant does not
--     authorise identifier sharing — even though SECURITY DEFINER
--     bypasses base RLS, the function refuses to surface the rows
--     itself.
--
-- Returned shape:
--   Single row with:
--     - child_profile_id, display_name, legal_name, preferred_name,
--       first_name, middle_name, last_name, date_of_birth,
--       sex_at_birth, gender_identity, primary_language, country_code
--     - origin_type: 'owned' | 'shared'
--     - grant_scope: 'identity_only' | 'identity_with_identifiers' | NULL
--       (NULL when origin_type = 'owned')
--     - grant_valid_until: TIMESTAMPTZ | NULL
--       (NULL when origin_type = 'owned')
--     - membership_state: 'owned' | 'accepted' | 'shared_pending'
--                        | 'shared_no_grant'
--     - show_identifiers: BOOLEAN (precomputed visibility flag)
--     - identifiers: JSONB array of
--         { id, identifier_type, identifier_value, country_code }
--       (empty array when show_identifiers = false)
-- ============================================================


CREATE OR REPLACE FUNCTION get_care_child_with_details(
  p_child_profile_id UUID,
  p_org_id           UUID
)
RETURNS TABLE (
  child_profile_id   UUID,
  display_name       TEXT,
  legal_name         TEXT,
  preferred_name     TEXT,
  first_name         TEXT,
  middle_name        TEXT,
  last_name          TEXT,
  date_of_birth      DATE,
  sex_at_birth       TEXT,
  gender_identity    TEXT,
  primary_language   TEXT,
  country_code       TEXT,
  origin_type        TEXT,
  grant_scope        TEXT,
  grant_valid_until  TIMESTAMPTZ,
  membership_state   TEXT,
  show_identifiers   BOOLEAN,
  identifiers        JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_uid       UUID := auth.uid();
  v_is_owner        BOOLEAN := FALSE;
  v_grant_scope     TEXT;
  v_grant_until     TIMESTAMPTZ;
  v_membership_kind TEXT;
  v_membership_state TEXT;
  v_show_ids        BOOLEAN := FALSE;
  v_identifiers     JSONB := '[]'::jsonb;
BEGIN
  -- ── Auth gate ────────────────────────────────────────────────
  -- Unauthenticated → no rows. No exception (don't leak existence).
  IF v_actor_uid IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be an active member of the requested org.
  -- Mirrors 077; binds the call to an org the caller belongs to.
  IF NOT EXISTS (
    SELECT 1
      FROM organization_memberships om
     WHERE om.profile_id      = v_actor_uid
       AND om.organization_id = p_org_id
       AND om.status          = 'active'
  ) THEN
    RETURN;
  END IF;

  -- ── Ownership check (Phase 6B arm) ──────────────────────────
  -- A child is owned by p_org_id when its origin_organization_id
  -- matches AND p_org_id is a clinic / medical_practice org. The
  -- second guard mirrors the 078 origin-kind validation trigger.
  --
  -- NB: school-origin shared children have origin_organization_id
  -- IS NULL. Without the COALESCE/IS NOT NULL clamp, the equality
  -- `NULL = p_org_id` evaluates to NULL, which propagates through
  -- the AND/NOT in the access-denial guard below and causes the
  -- IF to silently no-op (PG three-valued logic: `IF NULL` is not
  -- TRUE, so the body is skipped — but neither is the implicit
  -- FALSE branch taken). Result: a shared child with an
  -- expired/revoked/no grant would still emit a row. The explicit
  -- non-NULL clamp keeps v_is_owner strictly BOOLEAN.
  SELECT
    COALESCE(
      cp.origin_organization_id IS NOT NULL
        AND cp.origin_organization_id = p_org_id
        AND EXISTS (
          SELECT 1 FROM organizations o
           WHERE o.id = p_org_id
             AND o.kind IN ('clinic', 'medical_practice')
        ),
      FALSE
    )
  INTO v_is_owner
  FROM child_profiles cp
  WHERE cp.id = p_child_profile_id;

  -- If child_profile doesn't exist, the SELECT above returns no
  -- rows and v_is_owner stays at its initialiser (FALSE). Fall
  -- through to the grant check.

  -- ── Grant check (Phase 4 arm) ───────────────────────────────
  -- Used both for shared-access visibility AND, even on owned
  -- children, to decide membership_state. For non-owners, no
  -- active grant ⇒ no access ⇒ zero rows.
  SELECT g.scope::TEXT, g.valid_until
    INTO v_grant_scope, v_grant_until
    FROM child_profile_access_grants g
   WHERE g.child_profile_id        = p_child_profile_id
     AND g.target_organization_id  = p_org_id
     AND g.status                  = 'active'
     AND g.valid_until             > NOW()
   ORDER BY g.valid_until DESC
   LIMIT 1;

  -- Access decision: owners OR active-grant-holders only.
  -- COALESCE belt-and-suspenders: even if a future edit reintroduces
  -- a NULL into v_is_owner, the access-denial guard still fires
  -- correctly (NOT NULL would otherwise evaluate to NULL and the
  -- IF body would be skipped).
  IF NOT COALESCE(v_is_owner, FALSE) AND v_grant_scope IS NULL THEN
    RETURN;
  END IF;

  -- ── Membership state resolution ─────────────────────────────
  -- Mirrors getChildClinicMembershipState() in sessions-api.ts:
  --   clinic_client membership   → 'owned'
  --   therapy_client membership  → 'accepted'
  --   no membership + active grant → 'shared_pending'
  --   else → 'shared_no_grant'
  SELECT m.relationship_kind
    INTO v_membership_kind
    FROM child_profile_memberships m
   WHERE m.child_profile_id  = p_child_profile_id
     AND m.organization_id   = p_org_id
     AND m.status            = 'active'
   ORDER BY
     -- Prefer clinic_client over therapy_client if both somehow
     -- exist (defensive — schema doesn't forbid it).
     CASE WHEN m.relationship_kind = 'clinic_client' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_membership_kind = 'clinic_client' THEN
    v_membership_state := 'owned';
  ELSIF v_membership_kind = 'therapy_client' THEN
    v_membership_state := 'accepted';
  ELSIF v_grant_scope IS NOT NULL THEN
    v_membership_state := 'shared_pending';
  ELSE
    v_membership_state := 'shared_no_grant';
  END IF;

  -- ── Identifier visibility (Phase 5A semantics) ──────────────
  -- Owned children: always visible (Phase 6B ownership helper
  -- covers child_identifiers SELECT too).
  -- Shared children: only when scope = 'identity_with_identifiers'.
  IF v_is_owner THEN
    v_show_ids := TRUE;
  ELSIF v_grant_scope = 'identity_with_identifiers' THEN
    v_show_ids := TRUE;
  ELSE
    v_show_ids := FALSE;
  END IF;

  IF v_show_ids THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',               ci.id,
          'identifier_type',  ci.identifier_type,
          'identifier_value', ci.identifier_value,
          'country_code',     ci.country_code
        )
        ORDER BY ci.identifier_type, ci.identifier_value
      ),
      '[]'::jsonb
    )
    INTO v_identifiers
    FROM child_identifiers ci
    WHERE ci.child_profile_id = p_child_profile_id;
  END IF;

  -- ── Emit the single row ─────────────────────────────────────
  RETURN QUERY
  SELECT
    cp.id,
    cp.display_name,
    cp.legal_name,
    cp.preferred_name,
    cp.first_name,
    cp.middle_name,
    cp.last_name,
    cp.date_of_birth,
    cp.sex_at_birth,
    cp.gender_identity,
    cp.primary_language,
    cp.country_code,
    CASE WHEN v_is_owner THEN 'owned' ELSE 'shared' END AS origin_type,
    CASE WHEN v_is_owner THEN NULL ELSE v_grant_scope END AS grant_scope,
    CASE WHEN v_is_owner THEN NULL ELSE v_grant_until END AS grant_valid_until,
    v_membership_state                                AS membership_state,
    v_show_ids                                        AS show_identifiers,
    v_identifiers                                     AS identifiers
  FROM child_profiles cp
  WHERE cp.id = p_child_profile_id;
END;
$$;

-- Restrict EXECUTE. The body-level auth.uid() + membership checks
-- are the real gates; this just keeps anonymous clients from
-- invoking the function.
REVOKE ALL ON FUNCTION get_care_child_with_details(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_care_child_with_details(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION get_care_child_with_details(UUID, UUID) IS
  'Care Performance Phase 1 — bundles child detail page fetch (identity + identifiers + origin + membership state) into one SECURITY DEFINER call. Returns 0 rows for non-members / non-owners-without-grant. Preserves identifier scope gate. Does NOT modify any existing RLS/helper/RPC.';
