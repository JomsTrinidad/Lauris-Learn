-- ============================================================
-- Smoke tests for migration 103 — Care Performance Phase 1
-- child detail RPC. BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Function present, SECURITY DEFINER, STABLE, EXECUTE
--         granted to authenticated only (REVOKE PUBLIC).
--   T-2   Unauthenticated caller → 0 rows.
--   T-3   Authenticated caller without an active membership in
--         p_org_id → 0 rows.
--   T-4   Owned child: clinic_admin caller sees origin_type='owned',
--         membership_state='owned', show_identifiers=TRUE,
--         identifiers populated, grant_scope=NULL, grant_valid_until=NULL.
--   T-5   Owned child: non-admin clinic member (therapist) still
--         sees the row with identifiers (ownership arm covers both
--         child_profiles and child_identifiers).
--   T-6   Shared child (identity_only grant) → origin_type='shared',
--         grant_scope='identity_only', show_identifiers=FALSE,
--         identifiers='[]'.
--   T-7   Shared child (identity_with_identifiers) → identifiers
--         populated, show_identifiers=TRUE.
--   T-8   Shared child with active grant but no membership row →
--         membership_state='shared_pending'.
--   T-9   Shared child with accepted therapy_client membership →
--         membership_state='accepted'.
--   T-10  Expired grant → 0 rows.
--   T-11  Revoked grant → 0 rows.
--   T-12  Cross-clinic isolation: clinic B caller asking for clinic
--         A's owned child → 0 rows. Clinic B caller passing
--         p_org_id=clinic_a_id → 0 rows.
--   T-13  Non-existent child_profile_id → 0 rows.
--   T-14  ★ Strict isolation regression ★ — caller_visible_child_profile_ids,
--         caller_visible_child_profile_ids_for_identifiers,
--         list_documents_for_organization bodies do NOT reference the
--         new function. No RLS policy added or altered on
--         child_profiles or child_identifiers.
--   T-15  child_identifiers direct SELECT by a clinic with identity_only
--         grant still returns 0 rows (we did not widen any RLS).
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id          UUID;
  v_admin_id           UUID;

  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_clinic_a_admin_uid UUID;
  v_clinic_a_tx_uid    UUID;  -- therapist in clinic A
  v_clinic_b_admin_uid UUID;

  -- Children
  v_owned_child        UUID;
  v_shared_child_ident UUID;   -- identity_only grant
  v_shared_child_full  UUID;   -- identity_with_identifiers grant
  v_shared_child_acc   UUID;   -- shared + therapy_client accepted
  v_shared_child_exp   UUID;   -- expired grant
  v_shared_child_rev   UUID;   -- revoked grant
  v_other_clinic_child UUID;   -- clinic B's owned child

  v_grant_ident        UUID;
  v_grant_full         UUID;
  v_grant_acc          UUID;
  v_grant_exp          UUID;
  v_grant_rev          UUID;

  v_count              INT;
  v_row                RECORD;
  v_proc_oid           OID;
  v_security_def       BOOLEAN;
  v_volatility         "char";
  v_helper_body        TEXT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no admin'; END IF;


  ----------------------------------------------------------------
  -- T-1 Function present, SECURITY DEFINER, STABLE, REVOKE/GRANT
  ----------------------------------------------------------------
  SELECT p.oid, p.prosecdef, p.provolatile
    INTO v_proc_oid, v_security_def, v_volatility
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_care_child_with_details' AND n.nspname='public';
  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'T-1 FAILED: function missing';
  END IF;
  IF NOT v_security_def THEN
    RAISE EXCEPTION 'T-1 FAILED: function not SECURITY DEFINER';
  END IF;
  -- 's' = STABLE
  IF v_volatility <> 's' THEN
    RAISE EXCEPTION 'T-1 FAILED: function not STABLE (got %)', v_volatility;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_child_with_details'
       AND grantee='PUBLIC'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: PUBLIC still has EXECUTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_child_with_details'
       AND grantee='authenticated'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize clinics + members + children
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 103 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 103 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'cAadmin-103@example.com')
    RETURNING id INTO v_clinic_a_admin_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_clinic_a_admin_uid,'cAadmin-103@example.com','TEST 103 ClinicA Admin',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'cAtx-103@example.com')
    RETURNING id INTO v_clinic_a_tx_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_clinic_a_tx_uid,'cAtx-103@example.com','TEST 103 ClinicA Therapist',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'cBadmin-103@example.com')
    RETURNING id INTO v_clinic_b_admin_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_clinic_b_admin_uid,'cBadmin-103@example.com','TEST 103 ClinicB Admin',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;

  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_clinic_a_admin_uid, 'clinic_admin', 'active');
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_clinic_a_tx_uid, 'therapist', 'active');
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_clinic_b_admin_uid, 'clinic_admin', 'active');

  -- Owned child of clinic A
  INSERT INTO child_profiles (display_name, first_name, last_name,
                              origin_organization_id, created_in_app)
    VALUES ('TEST 103 Owned','Owned','OneA',v_clinic_a_id,'lauris_care')
    RETURNING id INTO v_owned_child;
  INSERT INTO child_profile_memberships (
    child_profile_id, organization_id, relationship_kind, status, created_in_app
  ) VALUES (
    v_owned_child, v_clinic_a_id, 'clinic_client', 'active', 'lauris_care'
  );
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_owned_child, 'lrn', '103-OWN-0001', 'PH');

  -- Owned child of clinic B (for cross-clinic isolation test)
  INSERT INTO child_profiles (display_name, first_name, last_name,
                              origin_organization_id, created_in_app)
    VALUES ('TEST 103 OtherClinic','Other','BChild',v_clinic_b_id,'lauris_care')
    RETURNING id INTO v_other_clinic_child;
  INSERT INTO child_profile_memberships (
    child_profile_id, organization_id, relationship_kind, status, created_in_app
  ) VALUES (
    v_other_clinic_child, v_clinic_b_id, 'clinic_client', 'active', 'lauris_care'
  );

  -- Shared children (school origin: nullable origin_organization_id;
  -- we'll create profiles without origin and grant them to clinic A).
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 103 Shared Ident','Shared','IdentOnly','lauris_learn')
    RETURNING id INTO v_shared_child_ident;
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_shared_child_ident, 'lrn', '103-SI-0002', 'PH');

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 103 Shared Full','Shared','FullIDs','lauris_learn')
    RETURNING id INTO v_shared_child_full;
  INSERT INTO child_identifiers (child_profile_id, identifier_type, identifier_value, country_code)
    VALUES (v_shared_child_full, 'lrn', '103-SF-0003', 'PH');

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 103 Shared Accepted','Shared','Accepted','lauris_learn')
    RETURNING id INTO v_shared_child_acc;

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 103 Shared Expired','Shared','Expired','lauris_learn')
    RETURNING id INTO v_shared_child_exp;

  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 103 Shared Revoked','Shared','Revoked','lauris_learn')
    RETURNING id INTO v_shared_child_rev;

  -- We need a source organization for the grants. Use the school's
  -- shadow org.
  -- (The 074 INSERT policy normally constrains source to own school,
  --  but inside this DO block we're acting as the function owner.)
  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_shared_child_ident,
    (SELECT id FROM organizations WHERE kind='school' AND school_id=v_school_id),
    v_clinic_a_id,
    v_admin_id, 'school_admin', 'identity_only', 'active',
    NOW(), NOW() + INTERVAL '90 days'
  ) RETURNING id INTO v_grant_ident;

  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_shared_child_full,
    (SELECT id FROM organizations WHERE kind='school' AND school_id=v_school_id),
    v_clinic_a_id,
    v_admin_id, 'school_admin', 'identity_with_identifiers', 'active',
    NOW(), NOW() + INTERVAL '90 days'
  ) RETURNING id INTO v_grant_full;

  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_shared_child_acc,
    (SELECT id FROM organizations WHERE kind='school' AND school_id=v_school_id),
    v_clinic_a_id,
    v_admin_id, 'school_admin', 'identity_only', 'active',
    NOW(), NOW() + INTERVAL '90 days'
  ) RETURNING id INTO v_grant_acc;
  -- Accept as therapy_client.
  INSERT INTO child_profile_memberships (
    child_profile_id, organization_id, relationship_kind, status, created_in_app
  ) VALUES (
    v_shared_child_acc, v_clinic_a_id, 'therapy_client', 'active', 'lauris_care'
  );

  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until
  ) VALUES (
    v_shared_child_exp,
    (SELECT id FROM organizations WHERE kind='school' AND school_id=v_school_id),
    v_clinic_a_id,
    v_admin_id, 'school_admin', 'identity_with_identifiers', 'active',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day'
  ) RETURNING id INTO v_grant_exp;

  INSERT INTO child_profile_access_grants (
    child_profile_id, source_organization_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, scope, status,
    valid_from, valid_until, revoked_at, revoke_reason
  ) VALUES (
    v_shared_child_rev,
    (SELECT id FROM organizations WHERE kind='school' AND school_id=v_school_id),
    v_clinic_a_id,
    v_admin_id, 'school_admin', 'identity_with_identifiers', 'revoked',
    NOW(), NOW() + INTERVAL '90 days', NOW(), 'test'
  ) RETURNING id INTO v_grant_rev;


  ----------------------------------------------------------------
  -- T-2 Unauthenticated → 0 rows
  ----------------------------------------------------------------
  -- No SET ROLE, no jwt claims set. auth.uid() will be NULL.
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_owned_child, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: unauthenticated returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- T-3 Authenticated but not a member of p_org_id → 0 rows
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_b_admin_uid::text, 'email','cBadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_owned_child, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: non-member returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4 Owned child + clinic_admin: full visibility
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_admin_uid::text, 'email','cAadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT * INTO v_row
    FROM get_care_child_with_details(v_owned_child, v_clinic_a_id);
  IF v_row.child_profile_id IS NULL THEN
    RAISE EXCEPTION 'T-4 FAILED: no row for owned child';
  END IF;
  IF v_row.origin_type <> 'owned' THEN
    RAISE EXCEPTION 'T-4 FAILED: origin_type expected owned, got %', v_row.origin_type;
  END IF;
  IF v_row.membership_state <> 'owned' THEN
    RAISE EXCEPTION 'T-4 FAILED: membership_state expected owned, got %', v_row.membership_state;
  END IF;
  IF v_row.grant_scope IS NOT NULL THEN
    RAISE EXCEPTION 'T-4 FAILED: grant_scope expected NULL for owned, got %', v_row.grant_scope;
  END IF;
  IF v_row.grant_valid_until IS NOT NULL THEN
    RAISE EXCEPTION 'T-4 FAILED: grant_valid_until expected NULL for owned';
  END IF;
  IF v_row.show_identifiers IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'T-4 FAILED: show_identifiers expected TRUE';
  END IF;
  IF jsonb_array_length(v_row.identifiers) <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: expected 1 identifier, got %', jsonb_array_length(v_row.identifiers);
  END IF;
  IF v_row.identifiers->0->>'identifier_value' <> '103-OWN-0001' THEN
    RAISE EXCEPTION 'T-4 FAILED: identifier value mismatch';
  END IF;
  RAISE NOTICE 'T-4 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-5 Owned child + non-admin clinic member (therapist)
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_tx_uid::text, 'email','cAtx-103@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT * INTO v_row
    FROM get_care_child_with_details(v_owned_child, v_clinic_a_id);
  IF v_row.child_profile_id IS NULL THEN
    RAISE EXCEPTION 'T-5 FAILED: therapist denied access to owned child';
  END IF;
  IF v_row.show_identifiers IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'T-5 FAILED: therapist must see identifiers (ownership covers)';
  END IF;
  IF jsonb_array_length(v_row.identifiers) <> 1 THEN
    RAISE EXCEPTION 'T-5 FAILED: identifiers count mismatch';
  END IF;
  RAISE NOTICE 'T-5 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-6 Shared child (identity_only): identifiers HIDDEN
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_admin_uid::text, 'email','cAadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT * INTO v_row
    FROM get_care_child_with_details(v_shared_child_ident, v_clinic_a_id);
  IF v_row.child_profile_id IS NULL THEN
    RAISE EXCEPTION 'T-6 FAILED: no row for shared (identity_only) child';
  END IF;
  IF v_row.origin_type <> 'shared' THEN
    RAISE EXCEPTION 'T-6 FAILED: origin_type expected shared, got %', v_row.origin_type;
  END IF;
  IF v_row.grant_scope <> 'identity_only' THEN
    RAISE EXCEPTION 'T-6 FAILED: grant_scope expected identity_only, got %', v_row.grant_scope;
  END IF;
  IF v_row.membership_state <> 'shared_pending' THEN
    RAISE EXCEPTION 'T-6 FAILED: membership_state expected shared_pending, got %', v_row.membership_state;
  END IF;
  IF v_row.show_identifiers IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'T-6 FAILED: show_identifiers must be FALSE for identity_only';
  END IF;
  IF jsonb_array_length(v_row.identifiers) <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: identifiers must be empty for identity_only, got %', v_row.identifiers;
  END IF;
  RAISE NOTICE 'T-6 PASSED';


  ----------------------------------------------------------------
  -- T-7 Shared child (identity_with_identifiers): IDs visible
  ----------------------------------------------------------------
  SELECT * INTO v_row
    FROM get_care_child_with_details(v_shared_child_full, v_clinic_a_id);
  IF v_row.child_profile_id IS NULL THEN
    RAISE EXCEPTION 'T-7 FAILED: no row for shared (full) child';
  END IF;
  IF v_row.origin_type <> 'shared' THEN
    RAISE EXCEPTION 'T-7 FAILED: origin_type mismatch';
  END IF;
  IF v_row.grant_scope <> 'identity_with_identifiers' THEN
    RAISE EXCEPTION 'T-7 FAILED: grant_scope mismatch, got %', v_row.grant_scope;
  END IF;
  IF v_row.show_identifiers IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'T-7 FAILED: show_identifiers must be TRUE';
  END IF;
  IF jsonb_array_length(v_row.identifiers) <> 1 THEN
    RAISE EXCEPTION 'T-7 FAILED: expected 1 identifier, got %', jsonb_array_length(v_row.identifiers);
  END IF;
  RAISE NOTICE 'T-7 PASSED';


  ----------------------------------------------------------------
  -- T-8 Shared + active grant + no membership → shared_pending
  ----------------------------------------------------------------
  -- v_shared_child_ident already covered. Re-assert directly.
  SELECT * INTO v_row
    FROM get_care_child_with_details(v_shared_child_ident, v_clinic_a_id);
  IF v_row.membership_state <> 'shared_pending' THEN
    RAISE EXCEPTION 'T-8 FAILED: expected shared_pending, got %', v_row.membership_state;
  END IF;
  RAISE NOTICE 'T-8 PASSED';


  ----------------------------------------------------------------
  -- T-9 Accepted therapy_client membership → 'accepted'
  ----------------------------------------------------------------
  SELECT * INTO v_row
    FROM get_care_child_with_details(v_shared_child_acc, v_clinic_a_id);
  IF v_row.child_profile_id IS NULL THEN
    RAISE EXCEPTION 'T-9 FAILED: no row for accepted shared child';
  END IF;
  IF v_row.membership_state <> 'accepted' THEN
    RAISE EXCEPTION 'T-9 FAILED: expected accepted, got %', v_row.membership_state;
  END IF;
  RAISE NOTICE 'T-9 PASSED';


  ----------------------------------------------------------------
  -- T-10 Expired grant → 0 rows
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_shared_child_exp, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-10 FAILED: expired grant returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11 Revoked grant → 0 rows
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_shared_child_rev, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: revoked grant returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-11 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-12 Cross-clinic isolation
  ----------------------------------------------------------------
  -- Clinic B admin asking for clinic A's owned child
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_b_admin_uid::text, 'email','cBadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- (a) pass clinic_a_id → not a member of clinic_a → 0 rows
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_owned_child, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12a FAILED: clinic B got clinic A child via p_org_id=clinic_a, % rows', v_count;
  END IF;
  -- (b) pass clinic_b_id (own clinic) but ask for clinic A's owned
  -- child → child is not owned by clinic B and no grant exists → 0 rows
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_owned_child, v_clinic_b_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12b FAILED: clinic B got clinic A child via p_org_id=clinic_b, % rows', v_count;
  END IF;
  -- (c) clinic A admin asking for clinic B's owned child → no
  -- ownership, no grant → 0 rows
  RESET ROLE;
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_admin_uid::text, 'email','cAadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(v_other_clinic_child, v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12c FAILED: clinic A got clinic B child, % rows', v_count;
  END IF;
  RAISE NOTICE 'T-12 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-13 Non-existent child → 0 rows
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_admin_uid::text, 'email','cAadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_child_with_details(gen_random_uuid(), v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: non-existent child returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-13 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-14 ★ Strict isolation regression ★
  -- Existing helpers/RPC bodies do NOT reference the new function
  ----------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO v_helper_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'caller_visible_child_profile_ids' AND n.nspname='public';
  IF v_helper_body IS NULL THEN
    RAISE EXCEPTION 'T-14 FAILED: caller_visible_child_profile_ids() missing';
  END IF;
  IF position('get_care_child_with_details' IN v_helper_body) > 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: caller_visible_child_profile_ids body references new RPC';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_helper_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'caller_visible_child_profile_ids_for_identifiers'
      AND n.nspname='public';
  IF v_helper_body IS NULL THEN
    RAISE EXCEPTION 'T-14 FAILED: caller_visible_child_profile_ids_for_identifiers() missing';
  END IF;
  IF position('get_care_child_with_details' IN v_helper_body) > 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: identifier helper body references new RPC';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_helper_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'list_documents_for_organization' AND n.nspname='public';
  IF v_helper_body IS NULL THEN
    RAISE EXCEPTION 'T-14 FAILED: list_documents_for_organization() missing';
  END IF;
  IF position('get_care_child_with_details' IN v_helper_body) > 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: list_documents_for_organization body references new RPC';
  END IF;
  RAISE NOTICE 'T-14 PASSED';


  ----------------------------------------------------------------
  -- T-15 Direct SELECT on child_identifiers still gated by RLS:
  -- clinic A admin with identity_only grant on v_shared_child_ident
  -- must see 0 identifier rows (Phase 5A scope gate).
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_clinic_a_admin_uid::text, 'email','cAadmin-103@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM child_identifiers
    WHERE child_profile_id = v_shared_child_ident;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-15 FAILED: identity_only clinic saw % identifier rows via direct SELECT', v_count;
  END IF;
  RAISE NOTICE 'T-15 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 103 smoke tests passed.';
END;
$$;

ROLLBACK;
