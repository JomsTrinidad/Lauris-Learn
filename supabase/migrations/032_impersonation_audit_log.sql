-- ============================================================
-- Migration 032 – Impersonation Audit Log
-- Creates the impersonation_audit_log table used by the super
-- admin server route to record every impersonation start/end.
--
-- Inserts are performed exclusively via the service-role API
-- route (/api/super-admin/impersonation-log). No authenticated
-- client has INSERT access — only SELECT for super_admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonation_audit_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The super_admin who triggered the impersonation event.
  actor_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_email        TEXT        NOT NULL,
  -- The school being impersonated.
  target_school_id   UUID        NOT NULL REFERENCES schools(id)     ON DELETE CASCADE,
  target_school_name TEXT        NOT NULL,
  -- 'impersonation_started' or 'impersonation_ended'
  event_type         TEXT        NOT NULL
    CONSTRAINT impersonation_audit_log_event_type_check
      CHECK (event_type IN ('impersonation_started', 'impersonation_ended')),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying a specific actor's history efficiently.
CREATE INDEX IF NOT EXISTS idx_impersonation_audit_log_actor
  ON impersonation_audit_log (actor_id, occurred_at DESC);

-- Index for querying all events targeting a specific school.
CREATE INDEX IF NOT EXISTS idx_impersonation_audit_log_school
  ON impersonation_audit_log (target_school_id, occurred_at DESC);

ALTER TABLE impersonation_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admin users can view the audit log.
-- INSERT is intentionally blocked for all client roles — the server route
-- uses the service-role client which bypasses RLS entirely.
CREATE POLICY "super_admin_read_impersonation_audit_log"
  ON impersonation_audit_log FOR SELECT
  USING (is_super_admin());
