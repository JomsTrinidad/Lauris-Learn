-- ============================================================
-- Migration 073 — organization_memberships (Phase 3, linking only)
--
-- Purpose:
--   Bridge phase that lets Lauris Care users authenticate and see
--   their own clinic + memberships, WITHOUT exposing any school data
--   or child identity records. This phase is link-only — the act of
--   creating a membership establishes a relationship, not consent to
--   read child identity.
--
-- Phase boundary (deliberate):
--   Phase 3 = LINKING ONLY     (this migration)
--   Phase 4 = CONSENT + VISIBILITY of child_profiles / child_identifiers
--             across organizations.
--
-- What clinic users can see in Phase 3:
--   ✅ their organization row (kind='clinic', etc.)
--   ✅ their own organization_memberships row + colleagues' rows in
--      orgs they're a member of
--   ✅ child_profile_memberships rows whose organization_id matches
--      one of their orgs (these are bare links — child_profile_id is
--      a UUID they cannot dereference)
--
-- What clinic users CANNOT see in Phase 3:
--   ❌ child_profiles                                 — Phase 1 helper unmodified
--   ❌ child_identifiers (LRN, passport, etc.)        — chains through child_profiles
--   ❌ schools, students, child_documents, student_plans, billing,
--      enrollments, parent_updates, events, external_contacts, …
--      — every Lauris Learn record stays gated by its existing RLS,
--      none of which has a clinic arm.
--
-- Frozen helpers (NOT modified by this migration):
--   - caller_visible_child_profile_ids() (migration 071)
--     A clinic membership IS NOT consent to view a child_profile.
--     Phase 4 will introduce an explicit consent record and only then
--     extend this helper.
--   - All Lauris Learn RLS policies on existing tables — untouched.
--
-- Updated helper:
--   - caller_visible_organization_ids() (migration 072)
--     Adds an organization-membership arm so a clinic user can see
--     their own clinic's row in `organizations`. The arm is gated
--     by `status='active'` — ended memberships do not grant
--     organization visibility (but the user can still see their own
--     past membership row via the SELECT policy below).
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036 (school_id fallback
--                                   to actor's profile, NULL for
--                                   non-Lauris-Learn users)
--   is_super_admin()              — migration 002
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
--   parent_student_ids()          — migration 026
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- organization_memberships
-- Many-to-many between profiles and organizations. Phase 3 ships
-- this table with no Lauris Learn population (Lauris Learn keeps
-- using profiles.school_id + profiles.role for its own authz).
-- Lauris Care will write rows here for clinic staff.
--
-- role is TEXT (no enum) — same flexibility lesson as identifier_type
-- and organization.kind — Lauris Care will populate richer roles.
--
-- status:
--   'active'     — currently a member; participates in helpers
--   'suspended'  — temporary lockout; treated like 'ended' for access
--   'ended'      — historical row; kept for audit
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_memberships (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          UUID         NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  role                TEXT         NOT NULL,         -- 'admin' | 'staff' | 'therapist' | 'doctor' | …
  status              TEXT         NOT NULL DEFAULT 'active',
  started_at          DATE,
  ended_at            DATE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT om_role_nonblank
    CHECK (length(trim(role)) > 0),
  CONSTRAINT om_status_valid
    CHECK (status IN ('active','suspended','ended'))
);

-- One ACTIVE membership per (org, profile). Suspended/ended rows are
-- kept and don't participate in this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS om_active_unique_idx
  ON organization_memberships (organization_id, profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_om_profile_status
  ON organization_memberships (profile_id, status);
CREATE INDEX IF NOT EXISTS idx_om_org_status
  ON organization_memberships (organization_id, status);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS set_organization_memberships_updated_at ON organization_memberships;
CREATE TRIGGER set_organization_memberships_updated_at
  BEFORE UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS audit_organization_memberships ON organization_memberships;
CREATE TRIGGER audit_organization_memberships
  AFTER INSERT OR UPDATE OR DELETE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. RLS HELPER UPDATE — caller_visible_organization_ids()
--
-- Adds a fourth arm: any user with an active organization_memberships
-- row sees that organization. Lauris Learn users (no membership rows)
-- continue to resolve through the existing three arms exactly as they
-- did in Phase 2 — no behaviour change for them.
--
-- caller_visible_child_profile_ids() (migration 071) is INTENTIONALLY
-- not modified in Phase 3. A membership is a relationship, not a
-- consent to read identity records.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION caller_visible_organization_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT org_id), ARRAY[]::UUID[])
  FROM (
    -- super_admin → everything
    SELECT id AS org_id
      FROM organizations
      WHERE is_super_admin()

    UNION

    -- school_admin / teacher → their school's shadow org
    SELECT o.id
      FROM organizations o
      WHERE o.kind = 'school'
        AND o.school_id IS NOT NULL
        AND current_user_role() IN ('school_admin','teacher')
        AND o.school_id = current_user_school_id()

    UNION

    -- parent → the school orgs of the schools their children attend
    SELECT o.id
      FROM organizations o
      WHERE o.kind = 'school'
        AND o.school_id IS NOT NULL
        AND current_user_role() = 'parent'
        AND o.school_id IN (
          SELECT s.school_id
            FROM students s
            WHERE s.id = ANY(parent_student_ids())
        )

    UNION

    -- Phase 3 NEW arm: any user with an ACTIVE organization_memberships
    -- row → that organization. This is what lets a clinic user see
    -- their own clinic's row in `organizations`. Suspended/ended
    -- memberships are excluded so access drops the moment status flips.
    SELECT m.organization_id
      FROM organization_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
  ) t;
$$;


-- ════════════════════════════════════════════════════════════════
-- 4. RLS POLICIES — organization_memberships
--
-- Phase 3 posture:
--   SELECT — own membership rows + memberships in orgs the caller
--            already sees (via caller_visible_organization_ids).
--            Note: ended/suspended rows on the caller's own profile
--            remain SELECTable for audit (the policy is not filtered
--            by status). The org-arm only matches when the caller
--            currently has an active membership in the same org —
--            so once your membership ends, you stop seeing your
--            colleagues' rows.
--   INSERT/UPDATE/DELETE — super_admin only. Lauris Care UI will get
--                          self-write paths in a later phase.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_visible_organization_memberships"   ON organization_memberships;
DROP POLICY IF EXISTS "super_admin_all_organization_memberships"  ON organization_memberships;

CREATE POLICY "select_visible_organization_memberships"
  ON organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR organization_id = ANY(caller_visible_organization_ids())
  );

CREATE POLICY "super_admin_all_organization_memberships"
  ON organization_memberships
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 5. NO BACKFILL
--
-- Lauris Learn deliberately does NOT populate this table from
-- profiles.school_id. Lauris Learn continues to scope its own
-- authz through profiles.school_id + profiles.role unchanged.
-- Lauris Care will INSERT membership rows for its own users via
-- the super_admin path until its UI ships.
-- ════════════════════════════════════════════════════════════════


-- ============================================================
-- End of Migration 073
-- ============================================================
