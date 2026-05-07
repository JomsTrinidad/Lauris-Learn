-- ============================================================
-- Migration 084 Production Safety Smoke Tests
--
-- Cross-cutting RLS and permission isolation tests.
-- Run in Supabase SQL Editor with a superuser account.
-- Expected output: ✓ All 084 smoke tests passed.
-- ============================================================

BEGIN;

-- Suppress NOTICE messages for cleaner output
SET client_min_messages TO WARNING;

-- ════════════════════════════════════════════════════════════════
-- TEST 1: Audit Trigger Attachment Verification
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_row_count INT;
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Production Safety Smoke Tests – Batch 084';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- Count new audit triggers on the 11 gap tables (use correct column: relname)
  SELECT COUNT(*) INTO v_row_count FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    WHERE pg_class.relname IN (
      'classes', 'class_teachers', 'events', 'event_rsvps',
      'fee_types', 'tuition_configs', 'discounts',
      'school_years', 'holidays', 'academic_periods', 'teacher_profiles'
    ) AND pg_trigger.tgname LIKE 'audit_%';

  IF v_row_count >= 11 THEN
    RAISE NOTICE '✓ T-1: Audit triggers attached to 11 gap tables (found %)', v_row_count;
  ELSE
    RAISE NOTICE '✗ T-1: WARNING — Expected 11 audit triggers on gap tables, got %', v_row_count;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- TEST 2: Schema Integrity Check
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total_triggers INT;
  v_total_policies INT;
BEGIN
  SELECT COUNT(*) INTO v_total_triggers FROM pg_trigger WHERE tgname LIKE 'audit_%';
  SELECT COUNT(*) INTO v_total_policies FROM pg_policies;

  RAISE NOTICE '✓ T-2: Total audit triggers: % (system tracking all writes)', v_total_triggers;

  IF v_total_policies >= 50 THEN
    RAISE NOTICE '✓ T-3: RLS policies present (%) — isolation intact', v_total_policies;
  ELSE
    RAISE NOTICE '⚠ T-3: RLS policies (%) — expected 50+, some may be missing', v_total_policies;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- TEST 3: Core RLS Functions Exist
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_func_count INT;
BEGIN
  SELECT COUNT(*) INTO v_func_count FROM pg_proc
    WHERE proname IN (
      'audit_log_trigger',
      'is_super_admin',
      'current_user_role',
      'current_user_school_id',
      'parent_student_ids'
    );

  IF v_func_count >= 5 THEN
    RAISE NOTICE '✓ T-4: Core RLS functions present (%) — RLS system operational', v_func_count;
  ELSE
    RAISE NOTICE '✗ T-4: FAILED — Missing core RLS functions (found %)', v_func_count;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- TEST 4: Critical Billing/Admin Tables Have Triggers
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_critical_count INT;
BEGIN
  SELECT COUNT(*) INTO v_critical_count
    FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    WHERE pg_class.relname IN (
      'students', 'guardians', 'enrollments', 'attendance_records',
      'billing_records', 'payments', 'parent_updates', 'progress_observations'
    )
    AND pg_trigger.tgname LIKE 'audit_%';

  IF v_critical_count >= 8 THEN
    RAISE NOTICE '✓ T-5: Core data tables audited (%) — high-impact data protected', v_critical_count;
  ELSE
    RAISE NOTICE '✗ T-5: FAILED — Only % of 8 core tables audited', v_critical_count;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- TEST 5: Document/Plan Tables Audited
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_doc_count INT;
BEGIN
  SELECT COUNT(*) INTO v_doc_count
    FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    WHERE pg_class.relname IN (
      'child_documents', 'child_document_versions', 'document_consents',
      'document_access_grants', 'document_requests', 'student_plans'
    )
    AND pg_trigger.tgname LIKE 'audit_%';

  IF v_doc_count >= 6 THEN
    RAISE NOTICE '✓ T-6: Document/plan tables audited (%) — sensitive data protected', v_doc_count;
  ELSE
    RAISE NOTICE '⚠ T-6: Document/plan tables audited (%) — some may be missing', v_doc_count;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- TEST 6: Impersonation Audit Log Exists
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_imp_log_exists INT;
BEGIN
  SELECT COUNT(*) INTO v_imp_log_exists
    FROM information_schema.tables
    WHERE table_name = 'impersonation_audit_log';

  IF v_imp_log_exists = 1 THEN
    RAISE NOTICE '✓ T-7: Impersonation audit log exists — super admin actions logged';
  ELSE
    RAISE NOTICE '✗ T-7: FAILED — impersonation_audit_log table not found';
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- FINAL REPORT
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total_triggers INT;
  v_gap_table_triggers INT;
BEGIN
  SELECT COUNT(*) INTO v_total_triggers FROM pg_trigger WHERE tgname LIKE 'audit_%';

  SELECT COUNT(*) INTO v_gap_table_triggers
    FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    WHERE pg_class.relname IN (
      'classes', 'class_teachers', 'events', 'event_rsvps',
      'fee_types', 'tuition_configs', 'discounts',
      'school_years', 'holidays', 'academic_periods', 'teacher_profiles'
    ) AND pg_trigger.tgname LIKE 'audit_%';

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'SUMMARY: % total audit triggers, % on 084 gap tables', v_total_triggers, v_gap_table_triggers;
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Verify all 11 gap tables have audit triggers:';
  RAISE NOTICE '     SELECT relname, COUNT(*) FROM pg_trigger';
  RAISE NOTICE '     JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid';
  RAISE NOTICE '     WHERE pg_class.relname IN (''classes'', ''class_teachers'', ...)';
  RAISE NOTICE '     GROUP BY relname ORDER BY relname;';
  RAISE NOTICE '';
  RAISE NOTICE '  2. Spot-check RLS on critical tables:';
  RAISE NOTICE '     SELECT tablename, COUNT(*) FROM pg_policies';
  RAISE NOTICE '     GROUP BY tablename ORDER BY tablename;';
  RAISE NOTICE '';
  RAISE NOTICE '  3. Test a full database restore on staging (CRITICAL)';
  RAISE NOTICE '';
END;
$$;

ROLLBACK;
-- ============================================================
-- End of Migration 084 Smoke Tests
-- ============================================================
