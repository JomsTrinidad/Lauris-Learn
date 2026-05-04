-- ============================================================
-- Migration 072 — Organizations + Child-Profile Memberships (Phase 2)
--
-- Purpose:
--   Add the minimum additive foundation that future sister apps
--   (Lauris Care for therapy/clinic, Lauris Med for doctors) need
--   to coexist with Lauris Learn on the same Supabase project,
--   WITHOUT changing any existing Lauris Learn flow, table, or RLS.
--
-- Tables introduced:
--   1. organizations              — generic tenant for school /
--                                   clinic / medical_practice. Every
--                                   existing school is shadowed by a
--                                   kind='school' row via reverse FK.
--   2. child_profile_memberships  — child_profile ↔ organization
--                                   relationships. Models "one child →
--                                   one school + multiple clinics +
--                                   multiple doctors" naturally.
--
-- Tables INTENTIONALLY NOT introduced in Phase 2:
--   - organization_memberships    — deferred until Lauris Care users
--                                   actually exist. Lauris Learn
--                                   continues to use profiles.school_id
--                                   + profiles.role for authz.
--
-- Triggers INTENTIONALLY NOT introduced:
--   - AFTER INSERT on schools     — explicit app-side org creation
--                                   only. We don't want hidden side
--                                   effects on a core Lauris Learn
--                                   table.
--
-- DELIBERATELY OUT OF SCOPE here:
--   - No changes to schools, students, child_documents, student_plans,
--     child_profiles, child_identifiers, profiles, or any RLS policy
--     on existing tables.
--   - No changes to caller_visible_child_profile_ids() (Phase 1's
--     helper stays frozen). Phase 3 will add an org-membership arm
--     gated by explicit consent.
--   - No Lauris Care / Lauris Med tables. No cross-app UI.
--
-- UUIDs:
--   gen_random_uuid() (pgcrypto), matching migration 071.
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036 (school_id fallback
--                                   to actor's profile, so it works
--                                   on the school-agnostic tables)
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
--   is_super_admin()              — migration 002
--   parent_student_ids()          — migration 026
--   caller_visible_child_profile_ids() — migration 071
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1.1 organizations
-- Generic tenant for schools, clinics, and medical practices.
--
-- Bridge to Lauris Learn:
--   The school↔org relationship is held HERE (organizations.school_id
--   reverse FK). The schools table is intentionally not modified —
--   keeping the existing Lauris Learn shape byte-for-byte identical.
--
-- Invariants enforced at the row level:
--   - kind is non-blank
--   - school_id may only be set when kind='school' (the CHECK below)
--   - one school maps to at most one school-kind org (partial unique)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT         NOT NULL,         -- 'school' | 'clinic' | 'medical_practice' | future kinds
  name                TEXT         NOT NULL,
  country_code        TEXT,                          -- ISO-3166 alpha-2
  school_id           UUID         REFERENCES schools(id) ON DELETE SET NULL,
  created_in_app      TEXT         NOT NULL DEFAULT 'lauris_learn',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_kind_nonblank
    CHECK (length(trim(kind)) > 0),

  -- Misuse guard: only kind='school' rows may carry a school_id.
  CONSTRAINT organizations_school_id_only_for_school
    CHECK (school_id IS NULL OR kind = 'school')
);

-- One school maps to at most one kind='school' organization. NULL
-- school_ids (clinics, medical practices) are excluded from this index.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_school_unique_idx
  ON organizations (school_id)
  WHERE kind = 'school' AND school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_kind
  ON organizations (kind);
CREATE INDEX IF NOT EXISTS idx_organizations_country
  ON organizations (country_code);


-- ─────────────────────────────────────────────────────────────────
-- 1.2 child_profile_memberships
-- One row per (child, organization) relationship. Naturally supports
-- the business rules:
--   - one child → one school          : 1 row, kind=school
--   - one child → multiple clinics    : N rows, kind=clinic
--   - one child → multiple doctors    : N rows, kind=medical_practice
--
-- relationship_kind is TEXT (no enum) so future kinds (consult_only,
-- discharged_returning, etc.) don't need DDL — same flexibility lesson
-- as identifier_type in migration 071.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_profile_memberships (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id    UUID         NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  organization_id     UUID         NOT NULL REFERENCES organizations(id)  ON DELETE RESTRICT,
  relationship_kind   TEXT         NOT NULL,         -- 'enrolled_student' | 'patient' | 'consult_only' | …
  status              TEXT         NOT NULL DEFAULT 'active',
  started_at          DATE,
  ended_at            DATE,
  created_in_app      TEXT         NOT NULL DEFAULT 'lauris_learn',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT cpm_relationship_kind_nonblank
    CHECK (length(trim(relationship_kind)) > 0),
  CONSTRAINT cpm_status_valid
    CHECK (status IN ('active','ended'))
);

-- One ACTIVE membership per (child, org). Ended rows are kept for audit.
CREATE UNIQUE INDEX IF NOT EXISTS cpm_active_unique_idx
  ON child_profile_memberships (child_profile_id, organization_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cpm_org
  ON child_profile_memberships (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cpm_profile
  ON child_profile_memberships (child_profile_id, status);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS set_child_profile_memberships_updated_at ON child_profile_memberships;
CREATE TRIGGER set_child_profile_memberships_updated_at
  BEFORE UPDATE ON child_profile_memberships
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- DML audit (matches the project-wide pattern from migration 036).
-- audit_log_trigger() falls back to the actor's profile.school_id when
-- the row has no school_id column — exactly our case for both tables.
DROP TRIGGER IF EXISTS audit_organizations ON organizations;
CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_child_profile_memberships ON child_profile_memberships;
CREATE TRIGGER audit_child_profile_memberships
  AFTER INSERT OR UPDATE OR DELETE ON child_profile_memberships
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- NO trigger on `schools` — Phase 2 explicitly avoids hidden side
-- effects on the core Lauris Learn tenant table. New schools must
-- have their organization row created by application code (or a
-- subsequent backfill migration) when needed.


-- ════════════════════════════════════════════════════════════════
-- 3. RLS HELPER
-- ════════════════════════════════════════════════════════════════

-- Returns the set of organization.ids the calling user can see.
-- SECURITY DEFINER STABLE to mirror the rest of the access helpers.
--
-- Resolution paths (all OR'd):
--   • super_admin                          → all organizations
--   • school_admin / teacher (current_user_school_id())
--                                          → the kind='school' org
--                                            shadowing their school
--   • parent (parent_student_ids())        → the kind='school' org
--                                            shadowing the school of
--                                            any student they guard
--
-- Phase 2 has NO organization_memberships table, so there is no
-- "org-member" arm. Phase 3 will add one when Lauris Care users exist.
-- Until then, a non-Lauris-Learn user (NULL school_id, no role) gets
-- an empty array — that is the desired strict isolation.
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
  ) t;
$$;


-- ════════════════════════════════════════════════════════════════
-- 4. RLS POLICIES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_profile_memberships  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- 4.1 organizations
-- Phase 2 posture (deliberately conservative):
--   SELECT — anyone whose visibility set contains the row.
--   INSERT — school_admin can insert kind='school' rows for THEIR
--            OWN school. clinic / medical_practice INSERTS are not
--            permitted in Phase 2 — Lauris Care will add its own
--            write path in Phase 3.
--   UPDATE — school_admin can rename / set country_code on their own
--            school's org row; nothing else.
--   DELETE — no policy → denied.
--   super_admin — full bypass.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_visible_organizations"         ON organizations;
DROP POLICY IF EXISTS "school_admin_insert_organizations"    ON organizations;
DROP POLICY IF EXISTS "school_admin_update_organizations"    ON organizations;
DROP POLICY IF EXISTS "super_admin_all_organizations"        ON organizations;

CREATE POLICY "select_visible_organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (id = ANY(caller_visible_organization_ids()));

CREATE POLICY "school_admin_insert_organizations"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND kind = 'school'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "school_admin_update_organizations"
  ON organizations
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND kind = 'school'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND kind = 'school'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "super_admin_all_organizations"
  ON organizations
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ─────────────────────────────────────────────────────────────────
-- 4.2 child_profile_memberships
-- SELECT visibility is the union of two arms:
--   (a) the child_profile is already visible to the caller
--       (caller_visible_child_profile_ids — Phase 1 helper, frozen)
--   (b) the organization is visible to the caller
--       (caller_visible_organization_ids — Phase 2 helper)
--
-- Arm (b) is forward-compatible: Phase 3 will broaden the
-- organization-visibility helper with an org-membership arm,
-- automatically extending cross-app reads to clinic/medical staff
-- WITHOUT modifying this policy.
--
-- Writes:
--   INSERT — school_admin can attach a child to their own school's
--            org as 'enrolled_student' (the only Phase 2 use case).
--   UPDATE/DELETE — super_admin only in Phase 2.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_visible_child_profile_memberships"      ON child_profile_memberships;
DROP POLICY IF EXISTS "school_admin_insert_child_profile_memberships" ON child_profile_memberships;
DROP POLICY IF EXISTS "super_admin_all_child_profile_memberships"     ON child_profile_memberships;

CREATE POLICY "select_visible_child_profile_memberships"
  ON child_profile_memberships
  FOR SELECT
  TO authenticated
  USING (
    child_profile_id = ANY(caller_visible_child_profile_ids())
    OR organization_id = ANY(caller_visible_organization_ids())
  );

CREATE POLICY "school_admin_insert_child_profile_memberships"
  ON child_profile_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = child_profile_memberships.organization_id
        AND o.kind = 'school'
        AND o.school_id = current_user_school_id()
    )
    AND EXISTS (
      SELECT 1 FROM students s
      WHERE s.child_profile_id = child_profile_memberships.child_profile_id
        AND s.school_id = current_user_school_id()
    )
  );

CREATE POLICY "super_admin_all_child_profile_memberships"
  ON child_profile_memberships
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 5. BACKFILL (idempotent — safe to re-run)
-- ════════════════════════════════════════════════════════════════

-- 5.A — One organization per existing school.
-- Idempotent via NOT EXISTS — re-running the migration inserts 0 rows.
INSERT INTO organizations (kind, name, school_id, created_in_app)
SELECT 'school', s.name, s.id, 'lauris_learn'
  FROM schools s
 WHERE NOT EXISTS (
   SELECT 1
     FROM organizations o
    WHERE o.kind = 'school'
      AND o.school_id = s.id
 );


-- 5.B — One active 'enrolled_student' membership per linked student.
-- Joins each student.child_profile_id to its school's shadow org and
-- inserts a child_profile_memberships row. Started_at carried forward
-- from students.created_at::date. Skips any pair already present.
INSERT INTO child_profile_memberships (
  child_profile_id,
  organization_id,
  relationship_kind,
  status,
  started_at,
  created_in_app
)
SELECT DISTINCT
  s.child_profile_id,
  o.id,
  'enrolled_student',
  'active',
  s.created_at::date,
  'lauris_learn'
FROM students s
JOIN organizations o
  ON o.kind = 'school'
 AND o.school_id = s.school_id
WHERE s.child_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM child_profile_memberships m
     WHERE m.child_profile_id = s.child_profile_id
       AND m.organization_id  = o.id
       AND m.status           = 'active'
  );


-- ============================================================
-- End of Migration 072
-- ============================================================
