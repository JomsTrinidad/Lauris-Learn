-- ============================================================
-- Migration 082 — Phase 6E: basic therapy sessions for Lauris Care.
--
-- Strict isolation constraints (Phase 6E approval):
--   - All school-side tables / policies / helpers / RPCs       → NOT modified.
--   - caller_owned_child_profile_ids()                          → NOT modified.
--   - caller_visible_child_profile_ids()                        → NOT modified.
--   - caller_visible_child_profile_ids_for_identifiers()        → NOT modified.
--   - accessible_document_ids() / log_document_access*          → NOT modified.
--   - The 6C clinic_documents subsystem                          → NOT modified.
--   - The 078 child_profile_memberships INSERT policy
--     `clinic_admin_insert_child_profile_memberships`           → NOT modified.
--     A NEW permissive policy is added alongside it for the
--     'therapy_client' acceptance path.
--
-- What this migration adds (all NEW, all isolated):
--   1. Table `therapy_sessions` — single therapist per session in v1.
--      The schema can evolve later into a join-table model for
--      multi-therapist sessions without breaking compatibility:
--      `therapist_profile_id` becomes the "primary therapist" column,
--      and a future `therapy_session_therapists` join table holds
--      additional participants.
--   2. Triggers — column-guard immutability, set_updated_at, audit.
--   3. RLS — SELECT for any active member of clinic AND active
--      (clinic_client | therapy_client) membership on (child, clinic).
--      INSERT/UPDATE for clinic_admin or therapist of clinic.
--      DELETE denied (use status='cancelled').
--      super_admin bypass.
--   4. Permissive policy on child_profile_memberships — allows
--      clinic_admin to INSERT a 'therapy_client' membership row for
--      a school-shared child their clinic has an active identity
--      grant on. This is the acceptance gate. The existing 078 INSERT
--      policy (clinic-owned 'clinic_client' children) is untouched.
--   5. RPC `list_clinic_members(p_org_id UUID)` — SECURITY DEFINER,
--      returns active members of the org for the therapist picker
--      and name resolution. Mirrors `list_school_staff_for_sharing`
--      (065) for the clinic side.
--
-- Two relationship_kinds in use (Phase 6E adjustment 1):
--   'clinic_client'   — clinic-owned children. Created automatically
--                       when clinic admin uses NewChildModal (078).
--                       Ownership-based.
--   'therapy_client'  — accepted school-shared children. Created via
--                       the new acceptance flow (this migration).
--                       Treatment-based; requires an active identity
--                       grant from the school side.
--
-- Both kinds gate session access. Ownership and treatment are
-- distinct concepts; this separation prevents ambiguity in future
-- multi-org workflows.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS therapy_sessions (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy + scope
  clinic_organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  child_profile_id            UUID         NOT NULL REFERENCES child_profiles(id) ON DELETE RESTRICT,

  -- Single therapist in v1. Future migration may add a join table
  -- for multi-therapist sessions; this column stays as the primary
  -- therapist anchor (no migration of existing rows needed).
  therapist_profile_id        UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,

  -- Editorial
  therapy_type                TEXT         NOT NULL,
  scheduled_at                TIMESTAMPTZ  NOT NULL,
  duration_minutes            INT,
  status                      TEXT         NOT NULL DEFAULT 'scheduled',
  notes                       TEXT,

  -- Reserved for future parent portal. Never displayed in v1.
  parent_visible_summary      TEXT,

  created_by_profile_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ts_therapy_type_valid
    CHECK (therapy_type IN ('speech', 'occupational', 'behavioral', 'other')),
  CONSTRAINT ts_status_valid
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT ts_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX IF NOT EXISTS therapy_sessions_clinic_idx
  ON therapy_sessions (clinic_organization_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS therapy_sessions_child_idx
  ON therapy_sessions (child_profile_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS therapy_sessions_therapist_idx
  ON therapy_sessions (therapist_profile_id, scheduled_at DESC);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- 2.A — Immutability column-guard.
-- UPDATE may NOT change clinic_organization_id, child_profile_id,
-- or created_by_profile_id. is_super_admin() bypasses for support.
CREATE OR REPLACE FUNCTION ts_immutable_columns_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.clinic_organization_id IS DISTINCT FROM OLD.clinic_organization_id THEN
    RAISE EXCEPTION
      'ts_immutable_columns_guard: clinic_organization_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.child_profile_id IS DISTINCT FROM OLD.child_profile_id THEN
    RAISE EXCEPTION
      'ts_immutable_columns_guard: child_profile_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id THEN
    RAISE EXCEPTION
      'ts_immutable_columns_guard: created_by_profile_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ts_immutable_columns_guard_trg ON therapy_sessions;
CREATE TRIGGER ts_immutable_columns_guard_trg
  BEFORE UPDATE ON therapy_sessions
  FOR EACH ROW
  EXECUTE FUNCTION ts_immutable_columns_guard();


-- 2.B — updated_at + audit
DROP TRIGGER IF EXISTS therapy_sessions_set_updated_at ON therapy_sessions;
CREATE TRIGGER therapy_sessions_set_updated_at
  BEFORE UPDATE ON therapy_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS therapy_sessions_audit ON therapy_sessions;
CREATE TRIGGER therapy_sessions_audit
  AFTER INSERT OR UPDATE OR DELETE ON therapy_sessions
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. RLS — therapy_sessions
-- ════════════════════════════════════════════════════════════════

ALTER TABLE therapy_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_therapy_sessions"            ON therapy_sessions;
DROP POLICY IF EXISTS "clinic_staff_insert_therapy_sessions" ON therapy_sessions;
DROP POLICY IF EXISTS "clinic_staff_update_therapy_sessions" ON therapy_sessions;
DROP POLICY IF EXISTS "super_admin_all_therapy_sessions"   ON therapy_sessions;


-- 3.A — SELECT: any active member of clinic AND there's an active
-- (clinic_client OR therapy_client) membership on (child, clinic).
-- Covers admins, therapists, and other staff roles.
CREATE POLICY "select_therapy_sessions"
  ON therapy_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.organization_id = therapy_sessions.clinic_organization_id
         AND om.profile_id      = auth.uid()
         AND om.status          = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM child_profile_memberships cpm
       WHERE cpm.child_profile_id  = therapy_sessions.child_profile_id
         AND cpm.organization_id   = therapy_sessions.clinic_organization_id
         AND cpm.status            = 'active'
         AND cpm.relationship_kind IN ('clinic_client', 'therapy_client')
    )
  );


-- 3.B — INSERT: clinic_admin or therapist, created_by pinned to
-- auth.uid(), membership predicate, and the chosen therapist must
-- itself be an active member of the clinic.
CREATE POLICY "clinic_staff_insert_therapy_sessions"
  ON therapy_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.organization_id = clinic_organization_id
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
    AND EXISTS (
      -- Outer-row column references MUST be qualified as
      -- `therapy_sessions.x`. `child_profile_memberships` has its own
      -- `child_profile_id` and `organization_id` columns; an unqualified
      -- reference inside the subquery resolves to those (innermost
      -- FROM wins), making the predicate degenerate to true.
      SELECT 1 FROM child_profile_memberships cpm
       WHERE cpm.child_profile_id  = therapy_sessions.child_profile_id
         AND cpm.organization_id   = therapy_sessions.clinic_organization_id
         AND cpm.status            = 'active'
         AND cpm.relationship_kind IN ('clinic_client', 'therapy_client')
    )
    AND EXISTS (
      SELECT 1 FROM organization_memberships om2
       WHERE om2.organization_id = therapy_sessions.clinic_organization_id
         AND om2.profile_id      = therapy_sessions.therapist_profile_id
         AND om2.status          = 'active'
    )
  );


-- 3.C — UPDATE: clinic_admin or therapist of the clinic. Column-
-- guard trigger 2.A keeps clinic/child/created_by immutable;
-- everything else is mutable.
CREATE POLICY "clinic_staff_update_therapy_sessions"
  ON therapy_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.organization_id = therapy_sessions.clinic_organization_id
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM child_profile_memberships cpm
       WHERE cpm.child_profile_id  = therapy_sessions.child_profile_id
         AND cpm.organization_id   = therapy_sessions.clinic_organization_id
         AND cpm.status            = 'active'
         AND cpm.relationship_kind IN ('clinic_client', 'therapy_client')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.organization_id = therapy_sessions.clinic_organization_id
         AND om.profile_id      = auth.uid()
         AND om.role            IN ('clinic_admin', 'therapist')
         AND om.status          = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM child_profile_memberships cpm
       WHERE cpm.child_profile_id  = therapy_sessions.child_profile_id
         AND cpm.organization_id   = therapy_sessions.clinic_organization_id
         AND cpm.status            = 'active'
         AND cpm.relationship_kind IN ('clinic_client', 'therapy_client')
    )
    AND EXISTS (
      SELECT 1 FROM organization_memberships om2
       WHERE om2.organization_id = therapy_sessions.clinic_organization_id
         AND om2.profile_id      = therapist_profile_id
         AND om2.status          = 'active'
    )
  );

-- DELETE — no policy → denied. Use status='cancelled'.

CREATE POLICY "super_admin_all_therapy_sessions"
  ON therapy_sessions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 4. ACCEPTANCE POLICY on child_profile_memberships
--
-- Phase 6E adjustment 1: 'therapy_client' is the new relationship_kind
-- for accepted school-shared children. Distinct from 'clinic_client'
-- (clinic-owned) so ownership and treatment stay separate concepts.
--
-- This is a permissive policy ADDED ALONGSIDE the existing 078
-- `clinic_admin_insert_child_profile_memberships` policy. PostgreSQL
-- ORs permissive policies, so both INSERT paths now succeed:
--   - clinic-owned ('clinic_client')      → 078 policy
--   - school-shared accepted ('therapy_client') → THIS policy
--
-- The existing 078 policy is NOT modified.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "clinic_admin_accept_granted_child" ON child_profile_memberships;

CREATE POLICY "clinic_admin_accept_granted_child"
  ON child_profile_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    relationship_kind = 'therapy_client'
    AND status = 'active'
    -- Caller is clinic_admin of the membership's organization_id.
    -- NB: outer NEW-row references MUST be qualified as
    -- `child_profile_memberships.x`. organization_memberships has its
    -- own `organization_id` column and child_profile_access_grants has
    -- its own `child_profile_id` — unqualified references inside the
    -- subqueries resolve to those (innermost FROM wins), which makes
    -- the predicate degenerate to TRUE. Same bug class as section 3.
    AND EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = child_profile_memberships.organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
    -- Active identity grant exists on (child, organization).
    AND EXISTS (
      SELECT 1 FROM child_profile_access_grants g
       WHERE g.child_profile_id        = child_profile_memberships.child_profile_id
         AND g.target_organization_id  = child_profile_memberships.organization_id
         AND g.status                  = 'active'
         AND g.valid_until             > NOW()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 5. RPC — list_clinic_members
--
-- Mirrors `list_school_staff_for_sharing` (065). The base profiles
-- SELECT only exposes the caller's own row; SECURITY DEFINER
-- bypasses that for this single, narrow operation.
--
-- Caller must themselves be an active member of p_org_id; otherwise
-- returns empty (mirrors `log_document_access`-style empty-on-deny).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION list_clinic_members(p_org_id UUID)
RETURNS TABLE (
  id        UUID,
  full_name TEXT,
  email     TEXT,
  role      TEXT,
  status    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be an active member of the org.
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
     WHERE om.organization_id = p_org_id
       AND om.profile_id      = auth.uid()
       AND om.status          = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.email,
      om.role,
      om.status
      FROM organization_memberships om
      JOIN profiles p ON p.id = om.profile_id
     WHERE om.organization_id = p_org_id
       AND om.status          = 'active'
     ORDER BY p.full_name NULLS LAST, p.email;
END;
$$;

REVOKE ALL ON FUNCTION list_clinic_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_clinic_members(UUID) TO authenticated;

COMMENT ON FUNCTION list_clinic_members(UUID) IS
  'Phase 6E — clinic member directory for therapist picker + name resolution. SECURITY DEFINER (the base profiles SELECT is self-only). Returns empty for non-members of p_org_id.';


-- ============================================================
-- End of Migration 082
-- ============================================================
