-- ============================================================
-- Migration 080 — Phase 6D: clinic-sharing RPCs.
--
-- Purpose:
--   Provide the three minimum SECURITY DEFINER RPCs the school-side
--   Clinic Sharing UI needs to enumerate, create, and resolve
--   clinic / medical_practice organisations — without weakening any
--   existing RLS posture.
--
-- Why RPCs instead of new policies:
--   The migration-072 RLS on `organizations` is intentionally tight:
--     • SELECT visibility is gated by caller_visible_organization_ids()
--       which only returns the caller's own school's shadow org for
--       school_admin / teacher / parent.
--     • INSERT is restricted to kind='school' AND school_id=own school.
--   Widening either policy to include clinic/medical_practice rows
--   would leak Lauris Care directory data to every Lauris Learn user
--   AND let any school_admin write arbitrary org rows from the table
--   surface. Same precedent as migration 076's
--   `doag_is_clinic_or_medical_org()` SECURITY DEFINER helper:
--   keep the policy strict, expose a narrow function that does
--   exactly what the school-side needs.
--
-- Strict isolation constraints (Phase 6D approval):
--   - caller_visible_organization_ids()                   → NOT modified.
--   - All organizations / child_profile_access_grants /
--     document_organization_access_grants policies        → NOT modified.
--   - Column-guard triggers on both grant tables           → NOT modified.
--   - All Care-portal RPCs, helpers, and policies         → NOT modified.
--   - No new tables. No schema mutations. No new triggers.
--
-- What the school-side UI gains:
--   ✅ list_clinic_organizations_for_sharing(query, limit) — search the
--      directory of clinic/medical_practice orgs with ILIKE matching.
--      Used by the org combobox.
--   ✅ create_clinic_organization_for_sharing(kind, name, country) —
--      INSERT a new clinic/medical_practice org row (school_id=NULL,
--      created_in_app='lauris_learn'). Returns the new id.
--   ✅ lookup_clinic_organizations(ids) — resolve target_org names by
--      id for the audit tables (school_admin can SELECT the grant
--      rows but not the target_org row itself).
--
-- All three:
--   - SECURITY DEFINER (writers/readers bypass the strict
--     organizations policies for this single, narrow operation)
--   - Body-level role check: caller must be school_admin
--     (current_user_role() = 'school_admin')
--   - REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated
--
-- Reused project-wide helpers:
--   current_user_role()           — migration 031
--   current_user_school_id()      — migration 031
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. list_clinic_organizations_for_sharing
--
-- Search/list clinic + medical_practice orgs. p_query is matched
-- case-insensitively against organizations.name with ILIKE; NULL or
-- empty p_query returns the most-recent rows up to p_limit.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION list_clinic_organizations_for_sharing(
  p_query TEXT  DEFAULT NULL,
  p_limit INT   DEFAULT 50
)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  kind         TEXT,
  country_code TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_pattern TEXT;
  v_limit   INT;
BEGIN
  IF current_user_role() <> 'school_admin' THEN
    RETURN;
  END IF;

  v_limit   := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_pattern := CASE
    WHEN p_query IS NULL OR length(trim(p_query)) = 0 THEN NULL
    ELSE '%' || trim(p_query) || '%'
  END;

  RETURN QUERY
    SELECT o.id, o.name, o.kind, o.country_code, o.created_at
      FROM organizations o
     WHERE o.kind IN ('clinic', 'medical_practice')
       AND (v_pattern IS NULL OR o.name ILIKE v_pattern)
     ORDER BY
       -- Exact-prefix matches float to the top, then alphabetical.
       CASE WHEN v_pattern IS NULL THEN 1
            WHEN o.name ILIKE (trim(p_query) || '%') THEN 0
            ELSE 1
       END,
       o.name ASC
     LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION list_clinic_organizations_for_sharing(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_clinic_organizations_for_sharing(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION list_clinic_organizations_for_sharing(TEXT, INT) IS
  'Phase 6D — school-admin only. Returns clinic/medical_practice orgs matching p_query (ILIKE), capped at p_limit. Bypasses the strict organizations SELECT policy via SECURITY DEFINER. Non-school_admin callers get an empty set.';


-- ════════════════════════════════════════════════════════════════
-- 2. create_clinic_organization_for_sharing
--
-- Inserts a new clinic / medical_practice organization. The
-- search-first UX pattern enforced client-side by the org picker is
-- the duplicate-prevention guard; this function does NOT block
-- duplicates by name (multiple schools may legitimately reach the
-- same physical clinic).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_clinic_organization_for_sharing(
  p_kind         TEXT,
  p_name         TEXT,
  p_country_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_name TEXT;
BEGIN
  IF current_user_role() <> 'school_admin' THEN
    RAISE EXCEPTION 'create_clinic_organization_for_sharing: caller is not a school_admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('clinic', 'medical_practice') THEN
    RAISE EXCEPTION 'create_clinic_organization_for_sharing: kind must be clinic or medical_practice (got %)',
      p_kind
      USING ERRCODE = '22023';
  END IF;

  v_name := trim(COALESCE(p_name, ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'create_clinic_organization_for_sharing: name is required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO organizations (kind, name, country_code, school_id, created_in_app)
    VALUES (
      p_kind,
      v_name,
      NULLIF(trim(COALESCE(p_country_code, '')), ''),
      NULL,
      'lauris_learn'
    )
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION create_clinic_organization_for_sharing(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_clinic_organization_for_sharing(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_clinic_organization_for_sharing(TEXT, TEXT, TEXT) IS
  'Phase 6D — school-admin only. Inserts a new clinic/medical_practice organization (school_id=NULL, created_in_app=lauris_learn). Bypasses the strict school-only INSERT policy via SECURITY DEFINER. Search-first UX guards duplicate-name pollution client-side.';


-- ════════════════════════════════════════════════════════════════
-- 3. lookup_clinic_organizations
--
-- Resolve target_organization_id → name/kind for the audit tables.
-- The school_admin can SELECT the grant rows (074 + 076 SELECT
-- policies cover school side) but not the target organization row,
-- so a plain join in the client returns NULL for org name. This
-- function takes an array of ids and returns a name+kind row for
-- each that resolves to a clinic/medical_practice.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lookup_clinic_organizations(
  p_ids UUID[]
)
RETURNS TABLE (
  id   UUID,
  name TEXT,
  kind TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF current_user_role() <> 'school_admin' THEN
    RETURN;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT o.id, o.name, o.kind
      FROM organizations o
     WHERE o.id = ANY(p_ids)
       AND o.kind IN ('clinic', 'medical_practice');
END;
$$;

REVOKE ALL ON FUNCTION lookup_clinic_organizations(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_clinic_organizations(UUID[]) TO authenticated;

COMMENT ON FUNCTION lookup_clinic_organizations(UUID[]) IS
  'Phase 6D — school-admin only. Resolves clinic/medical_practice org names by id list. Used by the audit tables to display target_organization_id''s name; the strict organizations SELECT policy hides those rows from school_admin direct SELECT.';


-- ============================================================
-- End of Migration 080
-- ============================================================
