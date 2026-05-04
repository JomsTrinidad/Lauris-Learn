-- ============================================================
-- Migration 075 — Phase 5A: identifier sharing on the existing grant
--                table.
--
-- Purpose:
--   Honour child_profile_access_grants.scope = 'identity_with_identifiers'.
--   Clinic / medical-practice users with such a grant gain SELECT
--   visibility on the granted child's child_identifiers (LRN,
--   passport, national_id, etc.). Identity-only grants are unchanged:
--   they continue to expose child_profiles but NOT child_identifiers.
--
-- Single grant table (locked in by decision record before this
-- migration): child_profile_access_grants is the only consent
-- artifact for both identity and identifier sharing. No new tables.
--
-- DELIBERATELY OUT OF SCOPE:
--   - No changes to child_profile_access_grants schema or policies.
--   - No changes to caller_visible_child_profile_ids() (Phase 4).
--   - No changes to child_profiles policies.
--   - No changes to child_identifiers INSERT/UPDATE/DELETE policies.
--   - No document sharing.
--   - No UI.
--   - No background expiry job — valid_until > NOW() is the inline
--     enforcement; status remains audit-only.
--
-- Target-org kind guard:
--   The new arm in caller_visible_child_profile_ids_for_identifiers()
--   restricts identifier visibility to grants targeting orgs whose
--   kind is in ('clinic','medical_practice'). Identifier sharing is
--   intentionally a clinic/medical concern; even if a future grant
--   row is mistakenly created targeting a school org or some other
--   org kind, identifier visibility will not flow.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. HELPER UPDATE
-- ════════════════════════════════════════════════════════════════

-- caller_visible_child_profile_ids_for_identifiers() — adds a 5th arm.
-- The first 4 arms are byte-identical to migration 074. The new arm
-- mirrors the grant arm in caller_visible_child_profile_ids() (Phase 4)
-- with two extra predicates:
--   - g.scope = 'identity_with_identifiers'
--   - target organization's kind is 'clinic' or 'medical_practice'
CREATE OR REPLACE FUNCTION caller_visible_child_profile_ids_for_identifiers()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT cp_id), ARRAY[]::UUID[])
  FROM (
    SELECT cp.id AS cp_id
      FROM child_profiles cp
      WHERE is_super_admin()

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'school_admin'
        AND s.school_id = current_user_school_id()

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'teacher'
        AND s.id = ANY(teacher_visible_student_ids())

    UNION

    SELECT s.child_profile_id
      FROM students s
      WHERE s.child_profile_id IS NOT NULL
        AND current_user_role() = 'parent'
        AND s.id = ANY(parent_student_ids())

    UNION

    -- Phase 5A NEW arm: identity_with_identifiers grants only, AND
    -- the target organization must be a clinic or medical practice.
    -- Schools / future org kinds never gain identifier visibility
    -- through this path even if a grant is mistakenly issued to one.
    SELECT g.child_profile_id
      FROM child_profile_access_grants g
      JOIN organization_memberships m
        ON m.organization_id = g.target_organization_id
     WHERE g.status = 'active'
       AND g.valid_until > NOW()
       AND g.scope = 'identity_with_identifiers'
       AND m.profile_id = auth.uid()
       AND m.status = 'active'
       AND EXISTS (
         SELECT 1
           FROM organizations o
          WHERE o.id = g.target_organization_id
            AND o.kind IN ('clinic', 'medical_practice')
       )
  ) t;
$$;


-- ════════════════════════════════════════════════════════════════
-- 2. POLICY UPDATE
-- ════════════════════════════════════════════════════════════════

-- child_identifiers SELECT now flows through the identifier-aware
-- helper. Other policies on the table are NOT touched.
DROP POLICY IF EXISTS "select_visible_child_identifiers" ON child_identifiers;

CREATE POLICY "select_visible_child_identifiers"
  ON child_identifiers
  FOR SELECT
  TO authenticated
  USING (child_profile_id = ANY(caller_visible_child_profile_ids_for_identifiers()));


-- ============================================================
-- End of Migration 075
-- ============================================================
