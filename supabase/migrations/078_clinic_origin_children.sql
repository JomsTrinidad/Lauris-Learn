-- ============================================================
-- Migration 078 — Phase 6B: clinic-origin children.
--
-- Purpose:
--   Allow clinic admins to create child_profiles for therapy clients
--   who are NOT enrolled in any school (no `students` row). The new
--   identity rows are owned by the clinic organisation that created
--   them and remain INVISIBLE to schools and to other clinics.
--
-- Strict isolation constraints (Phase 6B approval):
--   - caller_visible_child_profile_ids()                    → NOT modified.
--   - caller_visible_child_profile_ids_for_identifiers()    → NOT modified.
--   - caller_visible_child_profile_ids_for_ownership()      → NEW.
--   - is_clinic_admin(p_org_id)                             → NEW.
--   - SELECT policies on child_profiles + child_identifiers
--     are MODIFIED to OR-in the new ownership helper. The
--     existing helper bodies stay byte-clean.
--   - origin_organization_id is fully immutable post-insert
--     (NULL→non-NULL, non-NULL→NULL, non-NULL→other ALL rejected),
--     with is_super_admin() the only bypass.
--   - No changes to documents, students, schools, RPCs, storage.
--   - Phase 6B is INSERT-only on the clinic side. UPDATE/DELETE
--     stay denied (no policy → denied), super_admin bypass aside.
--
-- What clinic-admin role users gain:
--   ✅ INSERT child_profiles with origin_organization_id = own org
--   ✅ INSERT child_profile_memberships of relationship_kind
--      'clinic_client' linking own children to own org
--   ✅ INSERT child_identifiers for own children
--   ✅ SELECT child_profiles + child_identifiers for own children
--      (via the new ownership helper)
--
-- What stays denied to clinic-admin role users:
--   ❌ Reading child_profiles owned by other clinics
--   ❌ Reading school-origin profiles (no grant, no membership)
--   ❌ Setting origin_organization_id to a non-clinic / non-medical
--      org (kind guard) or to an org they're not an admin of
--      (INSERT policy WITH CHECK)
--   ❌ Any UPDATE on the new column (immutable trigger)
--   ❌ DELETE anywhere (no policy)
--   ❌ Direct child_documents / child_document_versions reads — the
--      Phase 5B/6A path is unchanged; clinic-owned children carry no
--      docs in this phase.
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036
--   is_super_admin()              — migration 002
--   current_user_role()           — migration 031
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. SCHEMA — origin_organization_id column
-- ════════════════════════════════════════════════════════════════

ALTER TABLE child_profiles
  ADD COLUMN IF NOT EXISTS origin_organization_id UUID
    REFERENCES organizations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN child_profiles.origin_organization_id IS
  'Phase 6B — when set, the clinic / medical_practice org that owns this child profile (no students row). NULL = school-origin (existing flow). Immutable post-insert.';

-- Partial index so the per-org owner lookup stays fast without
-- bloating the index for the large school-origin majority.
CREATE INDEX IF NOT EXISTS child_profiles_origin_org_idx
  ON child_profiles(origin_organization_id)
  WHERE origin_organization_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS — kind guard + full immutability on origin
-- ════════════════════════════════════════════════════════════════

-- 2.A — Kind guard. Origin must reference a clinic / medical_practice
-- org, never a school org or any other future kind. Runs SECURITY
-- DEFINER so the org lookup bypasses caller_visible_organization_ids
-- (a clinic admin doesn't see school orgs, but the validator still
-- needs to read the row to verify kind).
CREATE OR REPLACE FUNCTION cp_origin_kind_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
BEGIN
  IF NEW.origin_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT kind INTO v_kind
    FROM organizations
   WHERE id = NEW.origin_organization_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION
      'cp_origin_kind_validate: origin_organization_id % does not reference an existing organization',
      NEW.origin_organization_id
      USING ERRCODE = '23503';
  END IF;

  IF v_kind NOT IN ('clinic', 'medical_practice') THEN
    RAISE EXCEPTION
      'cp_origin_kind_validate: origin_organization_id must reference a clinic or medical_practice org (got kind=%)',
      v_kind
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cp_origin_kind_validate_trigger ON child_profiles;
CREATE TRIGGER cp_origin_kind_validate_trigger
  BEFORE INSERT OR UPDATE OF origin_organization_id ON child_profiles
  FOR EACH ROW
  EXECUTE FUNCTION cp_origin_kind_validate();


-- 2.B — Full immutability. ANY change to origin_organization_id
-- post-insert is rejected, including NULL → non-NULL (so a clinic
-- cannot retroactively claim a school-origin child). is_super_admin()
-- is the sole bypass.
CREATE OR REPLACE FUNCTION cp_origin_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.origin_organization_id IS DISTINCT FROM NEW.origin_organization_id THEN
    RAISE EXCEPTION
      'cp_origin_immutable_guard: origin_organization_id is immutable after insert (was %, attempted %)',
      OLD.origin_organization_id, NEW.origin_organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cp_origin_immutable_guard_trigger ON child_profiles;
CREATE TRIGGER cp_origin_immutable_guard_trigger
  BEFORE UPDATE OF origin_organization_id ON child_profiles
  FOR EACH ROW
  EXECUTE FUNCTION cp_origin_immutable_guard();


-- ════════════════════════════════════════════════════════════════
-- 3. CONSOLIDATED HELPER — caller_owned_child_profile_ids()
--
-- Single Phase 6B ownership helper. Returns child_profile.id values
-- where the caller has an ACTIVE organization_memberships row in the
-- profile's origin_organization_id, and that org is of kind
-- 'clinic' or 'medical_practice'. Role-agnostic — admin AND
-- non-admin members both see their org's children.
--
-- Used CONSISTENTLY by:
--   - SELECT policy on child_profiles      (any active member sees)
--   - SELECT policy on child_identifiers   (any active member sees)
--   - INSERT policies                       (helper + inline admin-role
--                                            check; see section 5)
--
-- Strict scope: this helper is for Phase 6B Care-portal ownership
-- only. DO NOT use it for cross-org sharing, school-side logic, or
-- global identity APIs. Ownership ≠ grant-based access.
--
-- Strictly additive — does NOT replace, wrap, or modify
-- caller_visible_child_profile_ids() or
-- caller_visible_child_profile_ids_for_identifiers(). Phase 1/4/5A
-- behaviour is preserved for school-origin profiles.
--
-- Pre-existing policies that referenced superseded helpers
-- (caller_clinic_admin_organization_ids,
--  caller_owned_child_profile_ids_for_org,
--  caller_visible_child_profile_ids_for_ownership,
--  is_clinic_admin) are dropped first so the helpers can themselves
-- be DROPped without dependency errors.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "select_visible_child_profiles"           ON child_profiles;
DROP POLICY IF EXISTS "select_visible_child_identifiers"        ON child_identifiers;
DROP POLICY IF EXISTS "clinic_admin_insert_child_profiles"      ON child_profiles;
DROP POLICY IF EXISTS "clinic_admin_insert_child_profile_memberships" ON child_profile_memberships;
DROP POLICY IF EXISTS "clinic_admin_insert_child_identifiers"   ON child_identifiers;

DROP FUNCTION IF EXISTS caller_clinic_admin_organization_ids();
DROP FUNCTION IF EXISTS caller_owned_child_profile_ids_for_org(UUID);
DROP FUNCTION IF EXISTS caller_visible_child_profile_ids_for_ownership();
DROP FUNCTION IF EXISTS is_clinic_admin(UUID);

CREATE OR REPLACE FUNCTION caller_owned_child_profile_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT cp.id), ARRAY[]::UUID[])
    FROM child_profiles cp
    JOIN organization_memberships om
      ON om.organization_id = cp.origin_organization_id
    JOIN organizations o
      ON o.id = cp.origin_organization_id
   WHERE cp.origin_organization_id IS NOT NULL
     AND om.profile_id = auth.uid()
     AND om.status     = 'active'
     AND o.kind        IN ('clinic', 'medical_practice');
$$;

REVOKE ALL ON FUNCTION caller_owned_child_profile_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION caller_owned_child_profile_ids() TO authenticated;

COMMENT ON FUNCTION caller_owned_child_profile_ids() IS
  'Phase 6B Care-portal ownership helper. Returns child_profile ids where caller has an active membership (any role) in the profile''s origin_organization_id (kind=clinic|medical_practice). SCOPE: Care-only — do NOT extend for cross-org sharing or school-side flows. Ownership ≠ grant-based access.';


-- ════════════════════════════════════════════════════════════════
-- 4. SELECT POLICIES — re-emitted to use the consolidated helper.
--
-- Pre-existing helpers (caller_visible_child_profile_ids and
-- caller_visible_child_profile_ids_for_identifiers) stay byte-clean.
-- This is a POLICY change, not a HELPER change.
-- ════════════════════════════════════════════════════════════════

-- 4.A — child_profiles SELECT
CREATE POLICY "select_visible_child_profiles"
  ON child_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = ANY(caller_visible_child_profile_ids())
    OR id = ANY(caller_owned_child_profile_ids())
  );


-- 4.B — child_identifiers SELECT
CREATE POLICY "select_visible_child_identifiers"
  ON child_identifiers
  FOR SELECT
  TO authenticated
  USING (
    child_profile_id = ANY(caller_visible_child_profile_ids_for_identifiers())
    OR child_profile_id = ANY(caller_owned_child_profile_ids())
  );


-- ════════════════════════════════════════════════════════════════
-- 5. INSERT POLICIES (clinic-admin only)
--
-- Each INSERT policy combines:
--   • caller_owned_child_profile_ids() — establishes that caller has
--     an active membership (any role) in the relevant origin org;
--   • inline EXISTS — narrows the role to 'clinic_admin' for write
--     privilege.
--
-- For the child_profiles INSERT case the row doesn't exist yet, so
-- the ownership helper can't be used; the entire check is inline
-- against organization_memberships + organizations.
-- ════════════════════════════════════════════════════════════════

-- 5.A — INSERT child_profiles
-- Clinic inserts MUST set origin_organization_id to an org the caller
-- is currently an active clinic_admin of. The kind guard trigger
-- gives a second line of defence.
CREATE POLICY "clinic_admin_insert_child_profiles"
  ON child_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    origin_organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM organization_memberships om
        JOIN organizations o ON o.id = om.organization_id
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
         AND o.kind             IN ('clinic', 'medical_practice')
    )
  );


-- 5.B — INSERT child_profile_memberships
-- Three constraints, each a separate failure mode:
--   1. relationship_kind locked to 'clinic_client'.
--   2. child must be owned by caller (membership in origin org).
--   3. (child, org) pair must be consistent — child's origin equals
--      the membership's organization_id.
--   4. caller's role on that membership must be 'clinic_admin'.
CREATE POLICY "clinic_admin_insert_child_profile_memberships"
  ON child_profile_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    relationship_kind = 'clinic_client'
    AND child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1 FROM child_profiles cp
       WHERE cp.id = child_profile_id
         AND cp.origin_organization_id = organization_id
    )
    AND EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  );


-- 5.C — INSERT child_identifiers
-- Identifier writes require the child to be in the caller's owned set
-- AND the caller to be a clinic_admin of the child's origin org.
CREATE POLICY "clinic_admin_insert_child_identifiers"
  ON child_identifiers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM child_profiles cp
        JOIN organization_memberships om ON om.organization_id = cp.origin_organization_id
       WHERE cp.id          = child_profile_id
         AND om.profile_id  = auth.uid()
         AND om.role        = 'clinic_admin'
         AND om.status      = 'active'
    )
  );


-- ============================================================
-- End of Migration 078
-- ============================================================
