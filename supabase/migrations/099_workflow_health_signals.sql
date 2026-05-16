-- Migration 099: Workflow Health Signals (Operational Intelligence Phase 2)
--
-- Adds one composite index and one SECURITY DEFINER function used exclusively by
-- the Operational Intelligence panel to surface workflow aging, correction frequency,
-- and repeated-touch patterns. All callers must be super_admin; others receive '{}'.
--
-- Index rationale
-- ─────────────────────────────────────────────────────────────────────────────
-- Existing indexes on audit_logs:
--   idx_audit_logs_school          → (school_id, created_at DESC)
--   idx_audit_logs_actor           → (actor_user_id, created_at DESC)
--   idx_audit_logs_table_record    → (table_name, record_id, created_at DESC)
--   idx_audit_logs_created_at      → (created_at DESC)            [from 098]
--
-- Phase 2 queries filter by (table_name, action='UPDATE', created_at range).
-- The table_record index helps for GROUP BY record_id, but does not efficiently
-- restrict on action. Adding (table_name, action, created_at DESC) enables index
-- range scans for patterns like:
--   WHERE table_name = 'attendance_records' AND action = 'UPDATE'
--   AND created_at BETWEEN p_from AND p_to
-- which underpins every correction-frequency and high-touch signal below.

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_action_created
  ON audit_logs (table_name, action, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- get_workflow_health_signals
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns a single JSONB object with all Phase 2 operational health signals.
-- Running everything in one function call avoids N round-trips from the client
-- and lets Postgres evaluate the sub-selects with shared planner context.
--
-- Signal groups
-- ─────────────────────────────────────────────────────────────────────────────
-- A. Plan draft aging (point-in-time — not date-range-filtered)
--    Reflects current operational burden regardless of the selected view period.
--    plan_drafts_idle_7d   — drafts not touched in 7+ days
--    plan_drafts_idle_14d  — drafts not touched in 14+ days (subset of above)
--
-- B. Plan review aging (point-in-time)
--    plans_review_7d       — in submitted/in_review, not updated 7+ days
--    plans_review_14d      — …14+ days
--    plans_review_30d      — …30+ days (longest delay signal)
--
-- C. Enrollment inquiry aging (point-in-time)
--    inquiries_open_7d     — open status, created 7+ days ago
--    inquiries_open_14d    — …14+ days
--    inquiries_open_30d    — …30+ days
--
-- D. Attendance correction frequency (period-filtered via p_from/p_to)
--    att_corrections       — UPDATE events on attendance_records in period
--    att_markings          — INSERT events on attendance_records in period
--    Interpretation: corrections / markings ratio surfaces post-submission edits
--
-- E. Billing correction frequency (period-filtered)
--    billing_corrections   — UPDATE events on billing_records + payments in period
--    billing_created       — INSERT events on billing_records in period
--
-- F. High-touch records (period-filtered)
--    Records with 3 or more UPDATE events in the period. Counts how many
--    distinct records crossed the threshold — not the raw update count.
--    Threshold of 3 avoids noise from routine 2-step saves.
--    high_touch_plans      — student_plans records updated 3+ times
--    high_touch_billing    — billing_records or payments records updated 3+ times
--    high_touch_att        — attendance_records updated 3+ times

CREATE OR REPLACE FUNCTION get_workflow_health_signals(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RETURN '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(

    -- ── A. Plan draft aging ─────────────────────────────────────────────────
    'plan_drafts_idle_7d', (
      SELECT COUNT(*)
      FROM student_plans
      WHERE status = 'draft'
        AND updated_at < NOW() - INTERVAL '7 days'
    ),
    'plan_drafts_idle_14d', (
      SELECT COUNT(*)
      FROM student_plans
      WHERE status = 'draft'
        AND updated_at < NOW() - INTERVAL '14 days'
    ),

    -- ── B. Plan review aging ────────────────────────────────────────────────
    'plans_review_7d', (
      SELECT COUNT(*)
      FROM student_plans
      WHERE status IN ('submitted', 'in_review')
        AND updated_at < NOW() - INTERVAL '7 days'
    ),
    'plans_review_14d', (
      SELECT COUNT(*)
      FROM student_plans
      WHERE status IN ('submitted', 'in_review')
        AND updated_at < NOW() - INTERVAL '14 days'
    ),
    'plans_review_30d', (
      SELECT COUNT(*)
      FROM student_plans
      WHERE status IN ('submitted', 'in_review')
        AND updated_at < NOW() - INTERVAL '30 days'
    ),

    -- ── C. Enrollment inquiry aging ─────────────────────────────────────────
    'inquiries_open_7d', (
      SELECT COUNT(*)
      FROM enrollment_inquiries
      WHERE status IN ('inquiry', 'assessment_scheduled', 'waitlisted')
        AND created_at < NOW() - INTERVAL '7 days'
    ),
    'inquiries_open_14d', (
      SELECT COUNT(*)
      FROM enrollment_inquiries
      WHERE status IN ('inquiry', 'assessment_scheduled', 'waitlisted')
        AND created_at < NOW() - INTERVAL '14 days'
    ),
    'inquiries_open_30d', (
      SELECT COUNT(*)
      FROM enrollment_inquiries
      WHERE status IN ('inquiry', 'assessment_scheduled', 'waitlisted')
        AND created_at < NOW() - INTERVAL '30 days'
    ),

    -- ── D. Attendance correction frequency (period-filtered) ────────────────
    'att_corrections', (
      SELECT COUNT(*)
      FROM audit_logs
      WHERE table_name = 'attendance_records'
        AND action = 'UPDATE'
        AND created_at >= p_from
        AND created_at <= p_to
    ),
    'att_markings', (
      SELECT COUNT(*)
      FROM audit_logs
      WHERE table_name = 'attendance_records'
        AND action = 'INSERT'
        AND created_at >= p_from
        AND created_at <= p_to
    ),

    -- ── E. Billing correction frequency (period-filtered) ───────────────────
    'billing_corrections', (
      SELECT COUNT(*)
      FROM audit_logs
      WHERE table_name IN ('billing_records', 'payments')
        AND action = 'UPDATE'
        AND created_at >= p_from
        AND created_at <= p_to
    ),
    'billing_created', (
      SELECT COUNT(*)
      FROM audit_logs
      WHERE table_name = 'billing_records'
        AND action = 'INSERT'
        AND created_at >= p_from
        AND created_at <= p_to
    ),

    -- ── F. High-touch records (period-filtered, threshold = 3 UPDATEs) ──────
    'high_touch_plans', (
      SELECT COUNT(*)
      FROM (
        SELECT record_id
        FROM audit_logs
        WHERE table_name = 'student_plans'
          AND action = 'UPDATE'
          AND created_at >= p_from
          AND created_at <= p_to
        GROUP BY record_id
        HAVING COUNT(*) >= 3
      ) sub
    ),
    'high_touch_billing', (
      SELECT COUNT(*)
      FROM (
        SELECT record_id
        FROM audit_logs
        WHERE table_name IN ('billing_records', 'payments')
          AND action = 'UPDATE'
          AND created_at >= p_from
          AND created_at <= p_to
        GROUP BY record_id
        HAVING COUNT(*) >= 3
      ) sub
    ),
    'high_touch_att', (
      SELECT COUNT(*)
      FROM (
        SELECT record_id
        FROM audit_logs
        WHERE table_name = 'attendance_records'
          AND action = 'UPDATE'
          AND created_at >= p_from
          AND created_at <= p_to
        GROUP BY record_id
        HAVING COUNT(*) >= 3
      ) sub
    )

  );
END;
$$;

REVOKE ALL ON FUNCTION get_workflow_health_signals(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_workflow_health_signals(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
