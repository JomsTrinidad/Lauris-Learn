-- ============================================================
-- Migration 104 — Care Performance Phase 2: sessions list RPC.
--
-- Purpose:
--   The Care sessions list currently fans out into 2 sequential
--   Supabase calls per render:
--     1) SELECT therapy_sessions ⨝ child_profiles
--     2) RPC list_clinic_members(p_org_id)   ← only used to map
--                                              therapist_profile_id
--                                              → display name.
--   The second call is sequential because the first call's response
--   handler is what triggers it. With ~80ms per round-trip in
--   production Supabase, that's ~160ms of blocking time even when
--   the data set is tiny.
--
--   This RPC bundles both reads — sessions + therapist name
--   resolution — into a single SECURITY DEFINER call. Cuts the
--   blocking time roughly in half and removes the N+1-style waterfall
--   on the sessions page (`/care/sessions`) and on the per-child
--   sessions card.
--
-- Security posture (mirrors 077 / 082 / 103):
--   - SECURITY DEFINER STABLE.
--   - REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--   - Body-level auth.uid() gate.
--   - The function re-applies the exact predicate the
--     `select_therapy_sessions` policy (082 §3.A) enforces:
--       (a) caller is an active member of p_org_id, AND
--       (b) per-session: an active `(clinic_client | therapy_client)`
--           membership on (child_profile_id, p_org_id).
--     Sessions whose child↔clinic relationship has ended (e.g.
--     membership flipped to 'ended') are excluded — same byte-clean
--     behaviour as the policy.
--   - No cross-clinic leakage: every emitted row's
--     `clinic_organization_id = p_org_id`.
--   - Disclosure minimisation: non-members get zero rows, no
--     exception (matches 077 / 082 / 103).
--
-- Strict isolation constraints:
--   - No new tables, columns, enums, CHECK constraints, or RLS
--     policies.
--   - No existing helper or RPC is modified. `list_clinic_members`,
--     `get_care_child_with_details`, and the
--     `select_therapy_sessions` policy stay byte-clean.
--   - Removing the RPC leaves the app on the legacy 2-call path.
--
-- Returned shape mirrors what the sessions page already uses:
--   - core therapy_sessions columns
--   - child_display_name (resolved via child_profiles)
--   - therapist_full_name, therapist_email (resolved via profiles,
--     same field-fallback the UI uses: full_name ?? email ?? null)
-- ============================================================


CREATE OR REPLACE FUNCTION get_care_sessions_with_therapists(
  p_org_id          UUID,
  p_from_iso        TIMESTAMPTZ DEFAULT NULL,
  p_to_iso          TIMESTAMPTZ DEFAULT NULL,
  p_status          TEXT        DEFAULT NULL,
  p_therapy_type    TEXT        DEFAULT NULL,
  p_child_profile_id UUID       DEFAULT NULL
)
RETURNS TABLE (
  id                     UUID,
  clinic_organization_id UUID,
  child_profile_id       UUID,
  child_display_name     TEXT,
  therapist_profile_id   UUID,
  therapist_full_name    TEXT,
  therapist_email        TEXT,
  therapy_type           TEXT,
  scheduled_at           TIMESTAMPTZ,
  duration_minutes       INT,
  status                 TEXT,
  notes                  TEXT,
  parent_visible_summary TEXT,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_uid UUID := auth.uid();
BEGIN
  -- ── Auth gate ────────────────────────────────────────────────
  -- Unauthenticated → no rows. Disclosure-minimisation, matches
  -- 077 / 082 / 103 posture.
  IF v_actor_uid IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be an active member of p_org_id. Binds the call to
  -- an org the caller already belongs to; cross-clinic requests
  -- silently return zero rows (the existing
  -- `select_therapy_sessions` policy enforces the same predicate
  -- under direct SELECT).
  IF NOT EXISTS (
    SELECT 1
      FROM organization_memberships om
     WHERE om.profile_id      = v_actor_uid
       AND om.organization_id = p_org_id
       AND om.status          = 'active'
  ) THEN
    RETURN;
  END IF;

  -- ── Query ────────────────────────────────────────────────────
  -- Re-applies the per-session predicate the
  -- `select_therapy_sessions` SELECT policy enforces:
  --   active (clinic_client | therapy_client) membership on
  --   (child_profile_id, p_org_id).
  -- We resolve therapist + child names server-side. The UI's
  -- fallback (full_name → email → null) is left to the caller; this
  -- function exposes both so the client doesn't need a second hop.
  RETURN QUERY
  SELECT
    ts.id                       AS id,
    ts.clinic_organization_id   AS clinic_organization_id,
    ts.child_profile_id         AS child_profile_id,
    cp.display_name             AS child_display_name,
    ts.therapist_profile_id     AS therapist_profile_id,
    p.full_name                 AS therapist_full_name,
    p.email                     AS therapist_email,
    ts.therapy_type::TEXT       AS therapy_type,
    ts.scheduled_at             AS scheduled_at,
    ts.duration_minutes         AS duration_minutes,
    ts.status::TEXT             AS status,
    ts.notes                    AS notes,
    ts.parent_visible_summary   AS parent_visible_summary,
    ts.created_at               AS created_at,
    ts.updated_at               AS updated_at
  FROM therapy_sessions ts
  -- LEFT JOIN on child_profiles in case a profile was soft-deleted
  -- after a session was created. The RLS policy would still surface
  -- the session because membership is what gates visibility; we
  -- mirror that.
  LEFT JOIN child_profiles cp ON cp.id = ts.child_profile_id
  -- LEFT JOIN on profiles so a therapist whose profile is no longer
  -- visible still surfaces with a null name rather than dropping
  -- the row. The base RLS posture is: as long as the session is
  -- visible, the row should appear.
  LEFT JOIN profiles p ON p.id = ts.therapist_profile_id
  WHERE ts.clinic_organization_id = p_org_id
    -- Per-session membership predicate (mirrors 082 §3.A).
    AND EXISTS (
      SELECT 1
        FROM child_profile_memberships cpm
       WHERE cpm.child_profile_id  = ts.child_profile_id
         AND cpm.organization_id   = ts.clinic_organization_id
         AND cpm.status            = 'active'
         AND cpm.relationship_kind IN ('clinic_client', 'therapy_client')
    )
    -- Optional filters. NULL → no filter.
    AND (p_from_iso       IS NULL OR ts.scheduled_at  >= p_from_iso)
    AND (p_to_iso         IS NULL OR ts.scheduled_at  <= p_to_iso)
    AND (p_status         IS NULL OR ts.status::TEXT  = p_status)
    AND (p_therapy_type   IS NULL OR ts.therapy_type::TEXT = p_therapy_type)
    AND (p_child_profile_id IS NULL OR ts.child_profile_id = p_child_profile_id)
  ORDER BY ts.scheduled_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_care_sessions_with_therapists(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_care_sessions_with_therapists(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID
) TO authenticated;

COMMENT ON FUNCTION get_care_sessions_with_therapists(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID
) IS
  'Care Performance Phase 2 — bundles therapy_sessions read + therapist/child name resolution into one SECURITY DEFINER call. Re-applies the select_therapy_sessions (082 §3.A) predicate so RLS semantics are preserved byte-for-byte. Returns 0 rows for non-members.';
