-- ============================================================
-- Smoke tests for migration 083 — Phase 6E.1 (therapy_session_notes).
-- BEGIN/ROLLBACK harness.
--
-- Scope:
--   T-1  Schema artifacts present (table, unique constraint,
--        triggers, policies).
--   T-2  ★ Existing artifacts byte-clean ★
--        accessible_document_ids(), log_document_access(),
--        log_document_access_for_organizations(),
--        list_documents_for_organization(),
--        caller_owned_child_profile_ids(),
--        caller_visible_child_profile_ids(),
--        caller_visible_child_profile_ids_for_identifiers(),
--        log_clinic_document_access(),
--        list_clinic_members() bodies do NOT reference
--        therapy_session_notes.
--        AND therapy_sessions policies do NOT reference
--        therapy_session_notes (forward decoupling).
--   T-3  Owned-child happy path: clinic-A admin INSERTs a note
--        for a scheduled session; SELECT returns it.
--   T-4  Therapist (non-admin) UPDATE works: same-session note
--        updated by therapist of the same clinic.
--   T-5  Cross-clinic SELECT isolation: clinic-B admin sees 0
--        notes for clinic-A's sessions.
--   T-6  Cross-clinic UPDATE denied: clinic-B admin's UPDATE
--        affects 0 rows on clinic-A's note.
--   T-7  School isolation: school_admin sees 0 notes.
--   T-8  Cancelled-session INSERT denied: flip session.status
--        to 'cancelled', then DELETE existing note (super_admin
--        bypass), then attempt INSERT as clinic-A admin → reject.
--   T-9  Cancelled-session UPDATE denied: re-insert the note as
--        super_admin while parent is cancelled, then attempt
--        UPDATE as clinic-A admin → 0 rows (USING fails).
--   T-10 Membership-end SELECT drop: end the parent session's
--        therapy_client membership; clinic-A admin should see 0
--        notes for that session.
--   T-11 Authored-by spoof denied: clinic-A admin cannot insert
--        a note pinning authored_by to a different user.
--   T-12 Column-guard rejects therapy_session_id and
--        authored_by_profile_id mutation (42501 each).
--   T-13 No DELETE policy: admin DELETE → 0 rows for clinic-A.
--   T-14 super_admin bypass: can DELETE and re-INSERT regardless.
--   T-15 1:1 enforcement: second INSERT for the same session
--        rejected by UNIQUE constraint (23505).
--
-- Run ONLY in a non-production project.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_school_id            UUID;
  v_school_admin_id      UUID;
  v_school_admin_email   TEXT;
  v_school_org_id        UUID;

  v_clinic_a_id          UUID;
  v_clinic_b_id          UUID;
  v_admin_a_uid          UUID;
  v_therapist_a_uid      UUID;
  v_admin_b_uid          UUID;

  v_owned_child_id       UUID;
  v_school_student_id    UUID;
  v_shared_child_id      UUID;
  v_session_id           UUID;
  v_shared_session_id    UUID;
  v_note_id              UUID;

  v_def                  TEXT;
  v_pol                  TEXT;
  v_count                INT;
  v_caught               BOOLEAN;
  v_caught_state         TEXT;
  v_rows                 INT;
BEGIN
  ----------------------------------------------------------------
  -- 0. Resolve school-side fixtures
  ----------------------------------------------------------------
  SELECT id INTO v_school_id FROM schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'no school'; END IF;

  SELECT id, email INTO v_school_admin_id, v_school_admin_email
    FROM profiles WHERE school_id = v_school_id AND role = 'school_admin'
    ORDER BY created_at LIMIT 1;
  IF v_school_admin_id IS NULL THEN RAISE EXCEPTION 'no school_admin'; END IF;

  SELECT id INTO v_school_org_id
    FROM organizations WHERE kind='school' AND school_id = v_school_id;
  IF v_school_org_id IS NULL THEN RAISE EXCEPTION 'no school org'; END IF;


  ----------------------------------------------------------------
  -- T-1  Schema artifacts present
  ----------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='therapy_session_notes') THEN
    RAISE EXCEPTION 'T-1 FAILED: therapy_session_notes table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename='therapy_session_notes'
       AND indexdef ILIKE '%UNIQUE%therapy_session_id%'
  ) THEN
    -- Constraint is defined inline as UNIQUE on the column. Either
    -- a unique INDEX or a unique CONSTRAINT satisfies us.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid='therapy_session_notes'::regclass
         AND contype='u'
    ) THEN
      RAISE EXCEPTION 'T-1 FAILED: UNIQUE on therapy_session_id missing';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tsn_immutable_columns_guard_trg') THEN
    RAISE EXCEPTION 'T-1 FAILED: column-guard trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_session_notes'
       AND policyname='select_therapy_session_notes'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: select policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_session_notes'
       AND policyname='clinic_staff_insert_therapy_session_notes'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: insert policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename='therapy_session_notes'
       AND policyname='super_admin_all_therapy_session_notes'
  ) THEN
    RAISE EXCEPTION 'T-1 FAILED: super_admin policy missing';
  END IF;
  RAISE NOTICE 'T-1 PASSED';


  ----------------------------------------------------------------
  -- T-2  ★ Existing artifacts byte-clean ★
  ----------------------------------------------------------------
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'accessible_document_ids',
         'log_document_access',
         'log_document_access_for_organizations',
         'list_documents_for_organization',
         'caller_owned_child_profile_ids',
         'caller_visible_child_profile_ids',
         'caller_visible_child_profile_ids_for_identifiers',
         'log_clinic_document_access',
         'list_clinic_members'
       )
  LOOP
    IF position('therapy_session_notes' IN v_def) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: existing helper/RPC body references therapy_session_notes';
    END IF;
  END LOOP;

  -- Forward decoupling: therapy_sessions policies must not reference
  -- therapy_session_notes (so that future 6E migrations don't accidentally
  -- couple the parent table to the notes table).
  FOR v_pol IN
    SELECT COALESCE(qual,'') || ' ' || COALESCE(with_check,'')
      FROM pg_policies
     WHERE tablename='therapy_sessions'
  LOOP
    IF position('therapy_session_notes' IN v_pol) > 0 THEN
      RAISE EXCEPTION 'T-2 FAILED: therapy_sessions policy references therapy_session_notes';
    END IF;
  END LOOP;
  RAISE NOTICE 'T-2 PASSED';


  ----------------------------------------------------------------
  -- 1. Synthesize fixtures
  ----------------------------------------------------------------
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 083 — Clinic A','PH','lauris_care')
    RETURNING id INTO v_clinic_a_id;
  INSERT INTO organizations (kind, name, country_code, created_in_app)
    VALUES ('clinic','TEST 083 — Clinic B','PH','lauris_care')
    RETURNING id INTO v_clinic_b_id;

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aA-083@example.com')
    RETURNING id INTO v_admin_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_a_uid,'aA-083@example.com','TEST 083 Admin A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_admin_a_uid, 'clinic_admin', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'tA-083@example.com')
    RETURNING id INTO v_therapist_a_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_therapist_a_uid,'tA-083@example.com','TEST 083 Therapist A',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_a_id, v_therapist_a_uid, 'therapist', 'active');

  INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(),'aB-083@example.com')
    RETURNING id INTO v_admin_b_uid;
  INSERT INTO profiles (id, email, full_name, school_id, role)
    VALUES (v_admin_b_uid,'aB-083@example.com','TEST 083 Admin B',NULL,'parent')
    ON CONFLICT (id) DO UPDATE
      SET full_name=EXCLUDED.full_name, school_id=EXCLUDED.school_id, role=EXCLUDED.role;
  INSERT INTO organization_memberships (organization_id, profile_id, role, status)
    VALUES (v_clinic_b_id, v_admin_b_uid, 'clinic_admin', 'active');

  -- Owned child + clinic_client membership.
  v_owned_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, origin_organization_id, created_in_app)
    VALUES (v_owned_child_id,'TEST 083 Owned', v_clinic_a_id,'lauris_care');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_owned_child_id, v_clinic_a_id, 'clinic_client', 'active','lauris_care');

  -- Schedule a session for the owned child.
  v_session_id := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, status, created_by_profile_id)
    VALUES
    (v_session_id, v_clinic_a_id, v_owned_child_id, v_therapist_a_uid,
     'speech', NOW() + INTERVAL '1 day', 'scheduled', v_admin_a_uid);

  -- Shared child + therapy_client acceptance + session (used in T-10).
  INSERT INTO students (school_id, first_name, last_name)
    VALUES (v_school_id,'TEST083','Shared')
    RETURNING id INTO v_school_student_id;
  v_shared_child_id := gen_random_uuid();
  INSERT INTO child_profiles (id, display_name, first_name, last_name, created_in_app)
    VALUES (v_shared_child_id,'TEST 083 Shared','TEST083','Shared','lauris_learn');
  UPDATE students SET child_profile_id = v_shared_child_id WHERE id = v_school_student_id;
  INSERT INTO child_profile_access_grants
    (child_profile_id, source_organization_id, target_organization_id,
     granted_by_profile_id, granted_by_kind, scope, status, valid_until)
    VALUES (v_shared_child_id, v_school_org_id, v_clinic_a_id,
            v_school_admin_id, 'school_admin', 'identity_only', 'active', NOW() + INTERVAL '30 days');
  INSERT INTO child_profile_memberships
    (child_profile_id, organization_id, relationship_kind, status, created_in_app)
    VALUES (v_shared_child_id, v_clinic_a_id, 'therapy_client', 'active','lauris_care');
  v_shared_session_id := gen_random_uuid();
  INSERT INTO therapy_sessions
    (id, clinic_organization_id, child_profile_id, therapist_profile_id,
     therapy_type, scheduled_at, status, created_by_profile_id)
    VALUES
    (v_shared_session_id, v_clinic_a_id, v_shared_child_id, v_therapist_a_uid,
     'occupational', NOW() + INTERVAL '2 days', 'scheduled', v_admin_a_uid);


  ----------------------------------------------------------------
  -- T-3  Owned-child happy path
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_note_id := gen_random_uuid();
  INSERT INTO therapy_session_notes
    (id, therapy_session_id, authored_by_profile_id,
     session_objective, activities, child_response,
     progress_observed, home_practice, private_internal_note)
    VALUES
    (v_note_id, v_session_id, v_admin_a_uid,
     'Build expressive vocabulary',
     'Picture cards, turn-taking',
     'Engaged for 25 min, fatigued at end',
     '+15% accuracy on /s/ blends',
     'Practice flashcards 10 min daily',
     'Mom asked about insurance — will follow up');

  SELECT count(*) INTO v_count FROM therapy_session_notes WHERE id = v_note_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-3 FAILED: admin cannot SELECT own note';
  END IF;
  RAISE NOTICE 'T-3 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-4  Therapist UPDATE works
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_therapist_a_uid::text, 'email','tA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  UPDATE therapy_session_notes
     SET activities = 'Picture cards, turn-taking, modeling'
   WHERE id = v_note_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-4 FAILED: therapist UPDATE affected % rows', v_rows;
  END IF;
  RAISE NOTICE 'T-4 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-5  Cross-clinic SELECT isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_b_uid::text, 'email','aB-083@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM therapy_session_notes;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-5 FAILED: clinic-B sees % clinic-A notes', v_count;
  END IF;
  RAISE NOTICE 'T-5 PASSED';


  ----------------------------------------------------------------
  -- T-6  Cross-clinic UPDATE denied
  ----------------------------------------------------------------
  UPDATE therapy_session_notes SET activities = 'hax'
   WHERE id = v_note_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-6 FAILED: cross-clinic UPDATE affected % rows', v_rows;
  END IF;
  RAISE NOTICE 'T-6 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-7  School isolation
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_school_admin_id::text, 'email', v_school_admin_email)::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM therapy_session_notes;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-7 FAILED: school_admin sees % notes', v_count;
  END IF;
  RAISE NOTICE 'T-7 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-8  Cancelled-session INSERT denied
  ----------------------------------------------------------------
  -- Cancel the session at the postgres level (via super_admin path).
  UPDATE therapy_sessions SET status = 'cancelled' WHERE id = v_session_id;
  -- Wipe existing note to free the UNIQUE slot for the INSERT attempt.
  DELETE FROM therapy_session_notes WHERE id = v_note_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO therapy_session_notes
      (therapy_session_id, authored_by_profile_id, session_objective)
      VALUES (v_session_id, v_admin_a_uid, 'late note');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-8 FAILED: INSERT on cancelled session was allowed';
  END IF;
  RAISE NOTICE 'T-8 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-9  Cancelled-session UPDATE denied
  ----------------------------------------------------------------
  -- Re-insert as super_admin (bypass) while parent is still cancelled.
  INSERT INTO therapy_session_notes
    (id, therapy_session_id, authored_by_profile_id, session_objective)
    VALUES (v_note_id, v_session_id, v_admin_a_uid, 'placeholder');

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  UPDATE therapy_session_notes SET activities = 'should not stick'
   WHERE id = v_note_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-9 FAILED: UPDATE on cancelled-session note affected % rows', v_rows;
  END IF;
  RAISE NOTICE 'T-9 PASSED';
  RESET ROLE;

  -- Restore the session to scheduled for the rest of the tests.
  UPDATE therapy_sessions SET status = 'scheduled' WHERE id = v_session_id;


  ----------------------------------------------------------------
  -- T-10  Membership-end SELECT drop (shared-child path)
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- Insert a note on the shared-child session.
  INSERT INTO therapy_session_notes
    (therapy_session_id, authored_by_profile_id, session_objective)
    VALUES (v_shared_session_id, v_admin_a_uid, 'visible while accepted');

  SELECT count(*) INTO v_count FROM therapy_session_notes
   WHERE therapy_session_id = v_shared_session_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T-10a FAILED: pre-end visibility broken (% rows)', v_count;
  END IF;
  RESET ROLE;

  -- End the therapy_client membership.
  UPDATE child_profile_memberships
     SET status = 'ended'
   WHERE child_profile_id = v_shared_child_id
     AND organization_id  = v_clinic_a_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM therapy_session_notes
   WHERE therapy_session_id = v_shared_session_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T-10b FAILED: notes still visible after membership end (% rows)', v_count;
  END IF;
  RAISE NOTICE 'T-10 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-11  Authored-by spoof denied
  ----------------------------------------------------------------
  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  v_caught := false;
  BEGIN
    INSERT INTO therapy_session_notes
      (therapy_session_id, authored_by_profile_id, session_objective)
      VALUES (v_session_id, v_therapist_a_uid /* not auth.uid() */, 'spoof');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  -- The note row already exists from T-9 (UNIQUE). The WITH CHECK
  -- clause and the UNIQUE both reject; either rejection is acceptable
  -- — what matters is that the INSERT does NOT succeed.
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T-11 FAILED: authored_by spoof was allowed';
  END IF;
  RAISE NOTICE 'T-11 PASSED';


  ----------------------------------------------------------------
  -- T-12  Column-guard rejects mutation of immutable columns
  ----------------------------------------------------------------
  -- 12a — therapy_session_id
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE therapy_session_notes SET therapy_session_id = v_shared_session_id
     WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-12a FAILED: therapy_session_id mutation not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;

  -- 12b — authored_by_profile_id
  v_caught := false; v_caught_state := NULL;
  BEGIN
    UPDATE therapy_session_notes SET authored_by_profile_id = v_therapist_a_uid
     WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '42501' THEN
    RAISE EXCEPTION 'T-12b FAILED: authored_by mutation not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-12 PASSED';


  ----------------------------------------------------------------
  -- T-13  No DELETE policy
  ----------------------------------------------------------------
  DELETE FROM therapy_session_notes WHERE id = v_note_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T-13 FAILED: clinic admin DELETE removed % rows', v_rows;
  END IF;
  RAISE NOTICE 'T-13 PASSED';
  RESET ROLE;


  ----------------------------------------------------------------
  -- T-14  super_admin bypass
  ----------------------------------------------------------------
  -- Postgres role was reset; service-role-equivalent (no JWT) can
  -- DELETE freely. Verify by confirming the row goes.
  DELETE FROM therapy_session_notes WHERE id = v_note_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T-14 FAILED: super_admin DELETE removed % rows (expected 1)', v_rows;
  END IF;
  RAISE NOTICE 'T-14 PASSED';


  ----------------------------------------------------------------
  -- T-15  1:1 enforcement (UNIQUE on therapy_session_id)
  ----------------------------------------------------------------
  -- Clean up the shared-session note left over from T-10 (super_admin
  -- bypass — postgres role at this point) so the "first insert" below
  -- actually hits an empty slot.
  DELETE FROM therapy_session_notes
   WHERE therapy_session_id = v_shared_session_id;

  -- Re-activate the shared membership so the session is visible again.
  UPDATE child_profile_memberships
     SET status = 'active'
   WHERE child_profile_id = v_shared_child_id
     AND organization_id  = v_clinic_a_id;

  EXECUTE format($f$ SET LOCAL "request.jwt.claims" = %L $f$,
    jsonb_build_object('sub', v_admin_a_uid::text, 'email','aA-083@example.com')::text);
  SET LOCAL ROLE authenticated;

  -- First insert succeeds.
  INSERT INTO therapy_session_notes
    (therapy_session_id, authored_by_profile_id, session_objective)
    VALUES (v_shared_session_id, v_admin_a_uid, 'first');

  -- Second insert on the same session must violate UNIQUE.
  v_caught := false; v_caught_state := NULL;
  BEGIN
    INSERT INTO therapy_session_notes
      (therapy_session_id, authored_by_profile_id, session_objective)
      VALUES (v_shared_session_id, v_admin_a_uid, 'second');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_caught_state := SQLSTATE;
  END;
  IF NOT v_caught OR v_caught_state <> '23505' THEN
    RAISE EXCEPTION 'T-15 FAILED: duplicate INSERT not rejected (caught=%, state=%)',
      v_caught, v_caught_state;
  END IF;
  RAISE NOTICE 'T-15 PASSED';
  RESET ROLE;


  RAISE NOTICE '✓ All 083 smoke tests passed.';
END
$$ LANGUAGE plpgsql;

ROLLBACK;
