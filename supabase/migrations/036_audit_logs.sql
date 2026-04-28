-- ============================================================
-- Migration 036 – Audit Logs
-- Creates audit_logs table and a generic SECURITY DEFINER
-- trigger function that records INSERT/UPDATE/DELETE on all
-- high-impact tables (students, enrollments, billing, etc.).
--
-- Inserts are performed exclusively by the trigger function
-- (SECURITY DEFINER). No client role has INSERT/UPDATE/DELETE
-- access to audit_logs. Super admin and school members have
-- SELECT only.
--
-- Large/binary fields (photo_path, receipt_photo_path,
-- avatar_url, logo_url, photos) are stripped before logging.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        REFERENCES schools(id) ON DELETE SET NULL,
  actor_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role    TEXT,
  table_name    TEXT        NOT NULL,
  record_id     UUID,
  action        TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values    JSONB,
  new_values    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_school
  ON audit_logs (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
  ON audit_logs (table_name, record_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- School members (admin + teacher) can read their own school's logs.
CREATE POLICY "school_members_read_audit_logs" ON audit_logs
  FOR SELECT USING (school_id = current_user_school_id());

-- Super admin can read all logs.
CREATE POLICY "super_admin_read_audit_logs" ON audit_logs
  FOR SELECT USING (is_super_admin());

-- ─── Generic audit trigger function ───────────────────────────────────────────
-- SECURITY DEFINER: can read profiles to resolve actor role and can INSERT into
-- audit_logs (which has no client INSERT policy). Runs with search_path = public
-- to prevent search-path injection.
--
-- School_id resolution order:
--   1. Direct column on the row (most tables)
--   2. Actor's school_id from profiles (junction tables: payments, guardians, etc.)
--
-- Fields stripped to avoid logging large binary/media paths:
--   photo_path, receipt_photo_path, avatar_url, logo_url, photos, branding
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id    UUID;
  v_actor_role  TEXT;
  v_school_id   UUID;
  v_row_data    JSONB;
  v_old_values  JSONB;
  v_new_values  JSONB;
  v_record_id   UUID;
  -- Fields excluded from log (binary paths, large blobs, derived branding)
  v_strip       TEXT[] := ARRAY[
    'photo_path', 'receipt_photo_path', 'avatar_url',
    'logo_url', 'photos', 'branding'
  ];
BEGIN
  v_actor_id := auth.uid();

  -- Resolve actor role (bypasses RLS because this function is SECURITY DEFINER)
  SELECT role::TEXT INTO v_actor_role FROM profiles WHERE id = v_actor_id;

  IF TG_OP = 'DELETE' THEN
    v_row_data    := to_jsonb(OLD);
    v_record_id   := (v_row_data->>'id')::UUID;
    v_old_values  := v_row_data - v_strip;
    v_new_values  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_data    := to_jsonb(NEW);
    v_record_id   := (v_row_data->>'id')::UUID;
    v_old_values  := NULL;
    v_new_values  := v_row_data - v_strip;
  ELSE -- UPDATE
    v_row_data    := to_jsonb(NEW);
    v_record_id   := (v_row_data->>'id')::UUID;
    v_old_values  := to_jsonb(OLD) - v_strip;
    v_new_values  := v_row_data - v_strip;
  END IF;

  -- School_id: from row first, then actor profile fallback (for junction tables)
  v_school_id := (v_row_data->>'school_id')::UUID;
  IF v_school_id IS NULL THEN
    SELECT school_id INTO v_school_id FROM profiles WHERE id = v_actor_id;
  END IF;

  INSERT INTO audit_logs (
    school_id, actor_user_id, actor_role,
    table_name, record_id,
    action, old_values, new_values
  ) VALUES (
    v_school_id, v_actor_id, v_actor_role,
    TG_TABLE_NAME, v_record_id,
    TG_OP, v_old_values, v_new_values
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ─── Attach trigger to high-impact tables ─────────────────────────────────────
-- AFTER trigger: fired after the DML succeeds, so a failed INSERT/UPDATE/DELETE
-- does not produce a spurious audit entry.

CREATE TRIGGER audit_students
  AFTER INSERT OR UPDATE OR DELETE ON students
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_guardians
  AFTER INSERT OR UPDATE OR DELETE ON guardians
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_enrollments
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_attendance_records
  AFTER INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_billing_records
  AFTER INSERT OR UPDATE OR DELETE ON billing_records
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_parent_updates
  AFTER INSERT OR UPDATE OR DELETE ON parent_updates
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_progress_observations
  AFTER INSERT OR UPDATE OR DELETE ON progress_observations
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_proud_moments
  AFTER INSERT OR UPDATE OR DELETE ON proud_moments
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
