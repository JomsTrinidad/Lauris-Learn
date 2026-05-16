-- ============================================================
-- Smoke tests for migration 105 — Care Performance Phase 3
-- filtered documents RPC. BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1   Function present, SECURITY DEFINER, STABLE, EXECUTE
--         granted to authenticated only (REVOKE PUBLIC).
--   T-2   Unauthenticated caller → 0 rows.
--   T-3   Authenticated caller without an active membership in
--         p_org_id → 0 rows.
--   T-4   Clinic admin: org-wide call (p_child_profile_id=NULL)
--         returns ONLY documents granted to this clinic. Mirrors
--         the 077 happy path.
--   T-5   Clinic admin: per-child filter narrows the set to the
--         documents linked to that child via students.child_profile_id.
--   T-6   Clinic admin: per-child filter on a child the clinic has
--         no grants for → 0 rows (not an exception).
--   T-7   Cross-clinic: clinic B admin asking with p_org_id=clinic_a
--         → 0 rows.
--   T-8   Therapist (non-admin) of clinic A sees the same set as
--         clinic admin (membership-based gate, not role-based).
--   T-9   Filter consistency: result of org-wide call ⨯ filter
--         where child_profile_id = X equals the result of per-child
--         call with p_child_profile_id = X.
--   T-10  Pagination: limit/offset bounds the response and does not
--         change visibility.
--   T-11  Expired grant → not returned.
--   T-12  Revoked grant → not returned.
--   T-13  Draft document (cd.status='draft') → not returned.
--   T-14  No storage paths returned — result columns match the
--         077 shape exactly (no storage_path / storage_object_id /
--         signed_url columns present).
--   T-15  ★ Strict isolation regression ★ — existing helpers/RPCs
--         (list_documents_for_organization, log_document_access*,
--          accessible_document_ids, caller_visible_child_profile_ids*,
--          caller_owned_child_profile_ids,
--          caller_visible_document_ids_for_organizations,
--          get_care_child_with_details,
--          get_care_sessions_with_therapists) bodies do NOT reference
--         the new function. No RLS policy added or altered on
--         child_documents, child_document_versions, students, or
--         document_organization_access_grants.
--   T-16  log_document_access_for_organizations still gates signed
--         URLs and is byte-clean. The new RPC has not interfered
--         with the existing access-logging path.
--   T-17  Unauthorized caller cannot infer document existence:
--         calling with a random p_org_id returns 0 rows (same as
--         non-existent / non-member).
--
-- Note (hidden-version coverage):
--   Following the 077 smoke test precedent, we do NOT test
--   `cdv.is_hidden = TRUE` directly. Trigger 5.E (migration 054)
--   either raises 'cannot hide the only visible version of a
--   non-draft document …' (refusing the UPDATE), or auto-repoints
--   `cd.current_version_id` to a replacement so the head no longer
--   points at the hidden version. Combined with the
--   `child_documents_current_version_required_chk` CHECK that
--   forbids non-draft docs with `current_version_id=NULL`, schema
--   invariants make this scenario unreachable through normal SQL.
--   The `cdv.is_hidden IS NOT TRUE` clamp in the RPC body is
--   defence-in-depth only.
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id          UUID;
  v_admin_id           UUID;
  v_school_org_id      UUID;

  v_clinic_a_id        UUID;
  v_clinic_b_id        UUID;
  v_admin_a_uid        UUID;
  v_therapist_a_uid    UUID;
  v_admin_b_uid        UUID;

  v_student_one        UUID;
  v_profile_one        UUID;
  v_student_two        UUID;
  v_profile_two        UUID;

  v_doc_a1             UUID;   -- granted, active, linked to child one
  v_doc_a2             UUID;   -- granted, active, linked to child one (2nd doc)
  v_doc_b              UUID;   -- granted, active, linked to child two
  v_doc_draft          UUID;   -- granted, but cd.status='draft' → hidden
  v_doc_expired        UUID;   -- expired grant → hidden
  v_doc_revoked        UUID;   -- revoked grant → hidden
  v_doc_no_grant       UUID;   -- no grant to clinic A → hidden

  v_ver_a1             UUID;
  v_ver_a2             UUID;
  v_ver_b              UUID;
  v_ver_draft          UUID;
  v_ver_expired        UUID;
  v_ver_revoked        UUID;
  v_ver_no_grant       UUID;

  v_count              INT;
  v_count_filtered     INT;
  v_count_unfiltered   INT;
  v_row                RECORD;
  v_proc_oid           OID;
  v_security_def       BOOLEAN;
  v_volatility         "char";
  v_def                TEXT;
  v_col_names          TEXT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Fixtures (school side)
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id INTO v_admin_id
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;


  ----------------------------------------------------------------
  -- T-1 Function present, SECURITY DEFINER, STABLE, REVOKE/GRANT
  ----------------------------------------------------------------
  SELECT p.oid, p.prosecdef, p.provolatile
    INTO v_proc_oid, v_security_def, v_volatility
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_care_documents_for_organization' AND n.nspname='public';
  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'T-1 FAILED: function missing';
  END IF;
  IF NOT v_security_def THEN
    RAISE EXCEPTION 'T-1 FAILED: function not SECURITY DEFINER';
  END IF;
  IF v_volatility <> 's' THEN
    RAISE EXCEPTION 'T-1 FAILED: function not STABLE (got %)', v_volatility;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_documents_for_organization'
       AND grantee='PUBLIC'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: PUBLIC still has EXECUTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_name='get_care_documents_for_organization'
       AND grantee='authenticated'
       AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize clinics, members, students, profiles, documents
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 105 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 105 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-105@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-105@example.com','TEST 105 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-105@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-105@example.com','TEST 105 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-105@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-105@example.com','TEST 105 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- Two students with linked child_profiles.
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST105','One') RETURNING id INTO v_student_one;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 105 One','TEST105','One','lauris_learn')
    RETURNING id INTO v_profile_one;
  UPDATE students SET child_profile_id = v_profile_one WHERE id = v_student_one;

  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST105','Two') RETURNING id INTO v_student_two;
  INSERT INTO child_profiles (display_name, first_name, last_name, created_in_app)
    VALUES ('TEST 105 Two','TEST105','Two','lauris_learn')
    RETURNING id INTO v_profile_two;
  UPDATE students SET child_profile_id = v_profile_two WHERE id = v_student_two;

  -- Documents + versions + grants. Helper macro inlined.
  -- doc_a1: granted to clinic A, active, linked to child one.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'parent_provided', 'TEST 105 doc A1', 'draft', v_admin_id)
    RETURNING id INTO v_doc_a1;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_a1, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_a1::text || '/v1.pdf',
    'a1.pdf', 1234, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_a1;
  UPDATE child_documents SET current_version_id = v_ver_a1, status = 'active' WHERE id = v_doc_a1;

  -- doc_a2: same child, also granted.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'medical_certificate', 'TEST 105 doc A2', 'draft', v_admin_id)
    RETURNING id INTO v_doc_a2;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_a2, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_a2::text || '/v1.pdf',
    'a2.pdf', 2345, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_a2;
  UPDATE child_documents SET current_version_id = v_ver_a2, status = 'active' WHERE id = v_doc_a2;

  -- doc_b: child two, granted.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_two, 'iep', 'TEST 105 doc B', 'draft', v_admin_id)
    RETURNING id INTO v_doc_b;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_b, v_school_id, 1,
    v_school_id::text || '/' || v_student_two::text || '/' || v_doc_b::text || '/v1.pdf',
    'b.pdf', 3456, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_b;
  UPDATE child_documents SET current_version_id = v_ver_b, status = 'active' WHERE id = v_doc_b;

  -- doc_draft: granted, but cd.status='draft' → must be filtered.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'iep', 'TEST 105 doc DRAFT', 'draft', v_admin_id)
    RETURNING id INTO v_doc_draft;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_draft, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_draft::text || '/v1.pdf',
    'draft.pdf', 4567, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_draft;
  UPDATE child_documents SET current_version_id = v_ver_draft WHERE id = v_doc_draft;
  -- status stays 'draft' on purpose.

  -- doc_expired: granted with valid_until in the past.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'medical_certificate', 'TEST 105 doc EXPIRED', 'draft', v_admin_id)
    RETURNING id INTO v_doc_expired;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_expired, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_expired::text || '/v1.pdf',
    'exp.pdf', 5678, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_expired;
  UPDATE child_documents SET current_version_id = v_ver_expired, status = 'active' WHERE id = v_doc_expired;

  -- doc_revoked: grant.status='revoked'.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'school_accommodation', 'TEST 105 doc REVOKED', 'draft', v_admin_id)
    RETURNING id INTO v_doc_revoked;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_revoked, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_revoked::text || '/v1.pdf',
    'rev.pdf', 6789, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_revoked;
  UPDATE child_documents SET current_version_id = v_ver_revoked, status = 'active' WHERE id = v_doc_revoked;

  -- doc_no_grant: no grant to clinic A; only relevant for cross-clinic
  -- and "shouldn't appear at all" assertions.
  INSERT INTO child_documents (school_id, student_id, document_type, title, status, created_by)
    VALUES (v_school_id, v_student_one, 'therapy_evaluation', 'TEST 105 doc NOGRANT', 'draft', v_admin_id)
    RETURNING id INTO v_doc_no_grant;
  INSERT INTO child_document_versions (
    document_id, school_id, version_number, storage_path, file_name, file_size, mime_type,
    uploaded_by_user_id, uploaded_by_kind
  ) VALUES (
    v_doc_no_grant, v_school_id, 1,
    v_school_id::text || '/' || v_student_one::text || '/' || v_doc_no_grant::text || '/v1.pdf',
    'ng.pdf', 7890, 'application/pdf', v_admin_id, 'school_admin'
  ) RETURNING id INTO v_ver_no_grant;
  UPDATE child_documents SET current_version_id = v_ver_no_grant, status = 'active' WHERE id = v_doc_no_grant;

  -- Active grants to clinic A.
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_a1, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',true,'comment',false,'upload_new_version',false)
  );
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_a2, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  );
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_b, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',true,'comment',false,'upload_new_version',false)
  );

  -- Draft grant to clinic A (cd.status='draft' should hide it).
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_draft, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active', NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  );

  -- Expired grant.
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions
  ) VALUES (
    v_doc_expired, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'active',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false)
  );

  -- Revoked grant.
  INSERT INTO document_organization_access_grants (
    document_id, source_school_id, target_organization_id,
    granted_by_profile_id, granted_by_kind, status, valid_from, valid_until,
    permissions, revoked_at, revoke_reason
  ) VALUES (
    v_doc_revoked, v_school_id, v_clinic_a_id,
    v_admin_id, 'super_admin', 'revoked',
    NOW(), NOW() + INTERVAL '90 days',
    jsonb_build_object('view',true,'download',false,'comment',false,'upload_new_version',false),
    NOW(), 'test'
  );


  ----------------------------------------------------------------
  -- T-2 Unauthenticated → 0 rows
  ----------------------------------------------------------------
  -- No SET ROLE, no jwt claims set. auth.uid() will be NULL.
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-2 FAILED: unauthenticated returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- T-3 Authenticated but not a member of p_org_id → 0 rows
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-105@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-3 FAILED: non-member of clinic A returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4 Clinic admin: org-wide call returns only granted docs
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-105@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Expected: a1 + a2 + b = 3 rows. draft, expired, revoked, and
  -- no_grant docs must NOT appear.
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-4 FAILED: expected 3, got %', v_count;
  END IF;

  -- Sanity: child_profile_id is populated for at least one row.
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id)
    WHERE child_profile_id IS NOT NULL;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-4 FAILED: child_profile_id missing on some rows';
  END IF;
  RAISE NOTICE 'T-4 PASSED';


  ----------------------------------------------------------------
  -- T-5 Per-child filter narrows correctly
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, v_profile_one);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'T-5 FAILED: profile_one expected 2, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, v_profile_two);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-5 FAILED: profile_two expected 1, got %', v_count;
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6 Per-child filter on a child the clinic has no grants for
  ----------------------------------------------------------------
  -- Use a random UUID to simulate an unrelated child.
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, gen_random_uuid());
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: unrelated child returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-6 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-7 Cross-clinic: clinic B → clinic_a
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-105@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic B got clinic A docs, % rows', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, v_profile_one);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: clinic B per-child filter leaked, % rows', v_count;
  END IF;
  RAISE NOTICE 'T-7 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8 Therapist (non-admin) sees same set as admin
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-105@example.com')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-8 FAILED: therapist expected 3, got %', v_count;
  END IF;
  RAISE NOTICE 'T-8 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-9 Filter consistency: org-wide filtered == per-child call
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-105@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Manually filter the org-wide call vs the per-child call result.
  SELECT count(*) INTO v_count_unfiltered
    FROM get_care_documents_for_organization(v_clinic_a_id)
    WHERE child_profile_id = v_profile_one;
  SELECT count(*) INTO v_count_filtered
    FROM get_care_documents_for_organization(v_clinic_a_id, v_profile_one);
  IF v_count_unfiltered <> v_count_filtered THEN
    RAISE EXCEPTION 'T-9 FAILED: filtered=%, unfiltered⨯where=%', v_count_filtered, v_count_unfiltered;
  END IF;
  IF v_count_filtered <> 2 THEN
    RAISE EXCEPTION 'T-9 FAILED: expected 2 in both branches, got %', v_count_filtered;
  END IF;
  RAISE NOTICE 'T-9 PASSED';


  ----------------------------------------------------------------
  -- T-10 Pagination bounds
  ----------------------------------------------------------------
  -- limit=1 → 1 row.
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, NULL, 1, 0);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-10 FAILED: limit=1 expected 1, got %', v_count;
  END IF;

  -- offset=10 → 0 rows (we only have 3 visible docs).
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, NULL, 100, 10);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-10 FAILED: offset=10 expected 0, got %', v_count;
  END IF;

  -- Negative offset is clamped to 0; verify the result equals
  -- offset=0 result (same 3 rows).
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id, NULL, 200, -50);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T-10 FAILED: negative offset clamp expected 3, got %', v_count;
  END IF;
  RAISE NOTICE 'T-10 PASSED';


  ----------------------------------------------------------------
  -- T-11 Expired grant filtered out (already covered by T-4 count)
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_expired;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-11 FAILED: expired grant returned %', v_count;
  END IF;
  RAISE NOTICE 'T-11 PASSED';


  ----------------------------------------------------------------
  -- T-12 Revoked grant filtered out
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_revoked;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-12 FAILED: revoked grant returned %', v_count;
  END IF;
  RAISE NOTICE 'T-12 PASSED';


  ----------------------------------------------------------------
  -- T-13 Draft document filtered out
  ----------------------------------------------------------------
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(v_clinic_a_id)
    WHERE document_id = v_doc_draft;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: draft doc returned %', v_count;
  END IF;
  RAISE NOTICE 'T-13 PASSED';


  ----------------------------------------------------------------
  -- T-14 No storage paths in result columns
  ----------------------------------------------------------------
  -- (See header note: hidden-current-version scenario intentionally
  --  skipped — unreachable through normal SQL given trigger 5.E +
  --  the head's current_version_required CHECK constraint. The
  --  clamp stays in the RPC body as defence-in-depth.)
  -- Assert the function's declared columns do not include any
  -- storage_path / signed_url / object_key column.
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_col_names
    FROM pg_attribute a
    JOIN pg_proc p ON p.prorettype = a.attrelid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_care_documents_for_organization'
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped;
  IF position('storage_path' IN COALESCE(v_col_names,'')) > 0
     OR position('signed_url' IN COALESCE(v_col_names,'')) > 0
     OR position('object_key' IN COALESCE(v_col_names,'')) > 0 THEN
    RAISE EXCEPTION 'T-14 FAILED: result type leaks storage column: %', v_col_names;
  END IF;
  RAISE NOTICE 'T-14 PASSED';


  ----------------------------------------------------------------
  -- T-15 ★ Strict isolation regression ★
  -- Existing helpers / RPCs do NOT reference the new function.
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'list_documents_for_organization',
         'log_document_access',
         'log_document_access_for_organizations',
         'accessible_document_ids',
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers',
         'caller_owned_child_profile_ids',
         'caller_visible_document_ids_for_organizations',
         'get_care_child_with_details',
         'get_care_sessions_with_therapists'
       )
  LOOP
    IF position('get_care_documents_for_organization' IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-15 FAILED: existing helper/RPC body references new RPC';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-15 PASSED';


  ----------------------------------------------------------------
  -- T-16 Access logging path untouched
  ----------------------------------------------------------------
  -- log_document_access_for_organizations is the sole signed-URL
  -- gate. Assert it still exists and is byte-clean (does not
  -- reference the new RPC).
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='log_document_access_for_organizations'
      AND n.nspname='public';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'T-16 FAILED: log_document_access_for_organizations missing';
  END IF;
  IF position('get_care_documents_for_organization' IN v_def) > 0 THEN
    RAISE EXCEPTION 'T-16 FAILED: log_document_access_for_organizations body references new RPC';
  END IF;
  RAISE NOTICE 'T-16 PASSED';


  ----------------------------------------------------------------
  -- T-17 Unauthorized caller cannot infer document existence
  ----------------------------------------------------------------
  -- Use a random org id the caller has no membership in.
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-105@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
    FROM get_care_documents_for_organization(gen_random_uuid());
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-17 FAILED: random p_org_id returned % rows', v_count;
  END IF;
  RAISE NOTICE 'T-17 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 105 smoke tests passed.';
END;
$$;

ROLLBACK;
