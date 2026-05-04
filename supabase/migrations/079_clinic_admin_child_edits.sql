-- ============================================================
-- Migration 079 — Phase 6B.1: clinic admins can edit clinic-owned
-- children + manage identifiers on their owned children.
--
-- Purpose:
--   Phase 6B was INSERT-only on the clinic side. This migration
--   adds the smallest safe edit surface so clinic admins can fix
--   typos and add/remove identifiers without SQL access — without
--   weakening any school-side flow or cross-clinic isolation.
--
-- Strict isolation constraints (Phase 6B.1 approval):
--   - caller_visible_child_profile_ids()                    → NOT modified.
--   - caller_visible_child_profile_ids_for_identifiers()    → NOT modified.
--   - caller_owned_child_profile_ids()                      → NOT modified.
--   - cp_origin_kind_validate_trigger                       → NOT modified.
--   - cp_origin_immutable_guard_trigger                     → NOT modified.
--   - school_admin_update_child_profiles policy             → NOT modified
--     (its students-linkage requirement already excludes clinic-owned
--      children, no students row → 0 matches).
--   - school_admin_write_child_identifiers policy           → NOT modified.
--   - super_admin policies                                  → NOT modified.
--   - Phase 6B INSERT policies                              → NOT modified.
--
-- What this migration adds:
--   ✅ UPDATE policy on child_profiles for clinic_admin of own org
--      (limited to clinic-owned rows — i.e. the helper match).
--   ✅ UPDATE + DELETE policies on child_identifiers for clinic_admin
--      of the owning clinic.
--   ✅ BEFORE UPDATE trigger on child_profiles — no-op guard for
--      clinic-owned rows (rejects updates that change zero editable
--      fields, to avoid audit noise / probing).
--   ✅ BEFORE UPDATE trigger on child_identifiers — same no-op guard
--      AND a child_profile_id immutability lock so identifiers cannot
--      be reassigned to another child.
--
-- What stays denied:
--   ❌ DELETE on child_profiles for clinic admins (deferred — use a
--      future archive lifecycle column instead of destructive delete).
--   ❌ Any UPDATE on origin_organization_id (existing immutability
--      trigger from 078 still applies).
--   ❌ Editing children owned by another clinic (RLS USING fails).
--   ❌ Editing school-shared children (grant arm doesn't feed the
--      ownership helper used by USING).
--   ❌ Non-admin clinic members editing anything (inline role check).
--
-- Why triggers, not WITH CHECK, for adjustments 1 + 2:
--   PostgreSQL row-security WITH CHECK can only inspect NEW. To
--   compare against OLD (no-op detection, child_profile_id lock) we
--   need a BEFORE UPDATE trigger. Both triggers scope themselves to
--   clinic-owned rows (origin_organization_id IS NOT NULL) so school-
--   side UPDATE behaviour is unaffected. is_super_admin() bypasses
--   both for parity with the rest of the project.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. UPDATE POLICIES
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "clinic_admin_update_child_profiles"    ON child_profiles;
DROP POLICY IF EXISTS "clinic_admin_update_child_identifiers" ON child_identifiers;
DROP POLICY IF EXISTS "clinic_admin_delete_child_identifiers" ON child_identifiers;


-- 1.A — child_profiles UPDATE
-- USING:      row must be in caller's owned set + caller is clinic_admin
--             of the row's origin org.
-- WITH CHECK: same predicate (defense in depth — origin can't change
--             because trigger 078.2.B rejects, and the row stays in
--             the owned set).
CREATE POLICY "clinic_admin_update_child_profiles"
  ON child_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = child_profiles.origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  )
  WITH CHECK (
    id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1 FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = child_profiles.origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  );


-- 1.B — child_identifiers UPDATE
CREATE POLICY "clinic_admin_update_child_identifiers"
  ON child_identifiers
  FOR UPDATE
  TO authenticated
  USING (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM child_profiles cp
        JOIN organization_memberships om
          ON om.organization_id = cp.origin_organization_id
       WHERE cp.id          = child_identifiers.child_profile_id
         AND om.profile_id  = auth.uid()
         AND om.role        = 'clinic_admin'
         AND om.status      = 'active'
    )
  )
  WITH CHECK (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM child_profiles cp
        JOIN organization_memberships om
          ON om.organization_id = cp.origin_organization_id
       WHERE cp.id          = child_identifiers.child_profile_id
         AND om.profile_id  = auth.uid()
         AND om.role        = 'clinic_admin'
         AND om.status      = 'active'
    )
  );


-- 1.C — child_identifiers DELETE
CREATE POLICY "clinic_admin_delete_child_identifiers"
  ON child_identifiers
  FOR DELETE
  TO authenticated
  USING (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM child_profiles cp
        JOIN organization_memberships om
          ON om.organization_id = cp.origin_organization_id
       WHERE cp.id          = child_identifiers.child_profile_id
         AND om.profile_id  = auth.uid()
         AND om.role        = 'clinic_admin'
         AND om.status      = 'active'
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 2. NO-OP GUARDS (BEFORE UPDATE TRIGGERS)
--
-- Scoped to clinic-owned rows only (origin_organization_id IS NOT
-- NULL on child_profiles). School-origin rows pass through. Both
-- triggers bypass on is_super_admin().
-- ════════════════════════════════════════════════════════════════

-- 2.A — child_profiles no-op guard
CREATE OR REPLACE FUNCTION cp_clinic_owned_noop_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- School-origin rows are out of scope.
  IF NEW.origin_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Reject if NO editable field has changed. Uses IS DISTINCT FROM
  -- so NULL <-> NULL counts as unchanged.
  IF NEW.display_name      IS NOT DISTINCT FROM OLD.display_name
     AND NEW.legal_name       IS NOT DISTINCT FROM OLD.legal_name
     AND NEW.first_name       IS NOT DISTINCT FROM OLD.first_name
     AND NEW.middle_name      IS NOT DISTINCT FROM OLD.middle_name
     AND NEW.last_name        IS NOT DISTINCT FROM OLD.last_name
     AND NEW.preferred_name   IS NOT DISTINCT FROM OLD.preferred_name
     AND NEW.date_of_birth    IS NOT DISTINCT FROM OLD.date_of_birth
     AND NEW.sex_at_birth     IS NOT DISTINCT FROM OLD.sex_at_birth
     AND NEW.gender_identity  IS NOT DISTINCT FROM OLD.gender_identity
     AND NEW.primary_language IS NOT DISTINCT FROM OLD.primary_language
     AND NEW.country_code     IS NOT DISTINCT FROM OLD.country_code
  THEN
    RAISE EXCEPTION
      'cp_clinic_owned_noop_guard: UPDATE rejected — at least one editable field must change'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cp_clinic_owned_noop_guard_trigger ON child_profiles;
CREATE TRIGGER cp_clinic_owned_noop_guard_trigger
  BEFORE UPDATE ON child_profiles
  FOR EACH ROW
  EXECUTE FUNCTION cp_clinic_owned_noop_guard();


-- 2.B — child_identifiers update guard
-- Two responsibilities, both clinic-owned only:
--   • Lock child_profile_id (NEW = OLD).
--   • No-op detection across editable columns.
CREATE OR REPLACE FUNCTION ci_clinic_owned_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin UUID;
BEGIN
  -- Look up parent profile's origin. SECURITY DEFINER so the lookup
  -- isn't blocked by RLS even when the caller would technically pass
  -- it (defensive).
  SELECT origin_organization_id INTO v_origin
    FROM child_profiles
   WHERE id = NEW.child_profile_id;

  -- School-origin (or unknown — treat conservatively) → out of scope.
  IF v_origin IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock identifier ownership: child_profile_id cannot change.
  IF NEW.child_profile_id IS DISTINCT FROM OLD.child_profile_id THEN
    RAISE EXCEPTION
      'ci_clinic_owned_update_guard: child_profile_id is immutable on UPDATE (was %, attempted %)',
      OLD.child_profile_id, NEW.child_profile_id
      USING ERRCODE = '42501';
  END IF;

  -- No-op detection across editable identifier fields.
  IF NEW.identifier_type   IS NOT DISTINCT FROM OLD.identifier_type
     AND NEW.identifier_value IS NOT DISTINCT FROM OLD.identifier_value
     AND NEW.country_code    IS NOT DISTINCT FROM OLD.country_code
     AND NEW.label           IS NOT DISTINCT FROM OLD.label
     AND NEW.issued_by       IS NOT DISTINCT FROM OLD.issued_by
     AND NEW.valid_from      IS NOT DISTINCT FROM OLD.valid_from
     AND NEW.valid_to        IS NOT DISTINCT FROM OLD.valid_to
  THEN
    RAISE EXCEPTION
      'ci_clinic_owned_update_guard: UPDATE rejected — at least one field must change'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ci_clinic_owned_update_guard_trigger ON child_identifiers;
CREATE TRIGGER ci_clinic_owned_update_guard_trigger
  BEFORE UPDATE ON child_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION ci_clinic_owned_update_guard();


-- ============================================================
-- End of Migration 079
-- ============================================================
