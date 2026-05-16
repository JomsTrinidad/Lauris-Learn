-- Migration 098: Operational Intelligence
-- Adds an index optimizing global date-range scans on audit_logs and a
-- SECURITY DEFINER aggregate function used by the Operational Intelligence panel.
-- Only super_admin callers receive data; all others receive an empty result set.

-- ─── Index ───────────────────────────────────────────────────────────────────
-- The existing indexes are scoped to (school_id, created_at) or (actor_user_id,
-- created_at). The platform-wide aggregation query filters only by date range, so
-- a standalone created_at index lets PostgreSQL do an efficient range scan before
-- grouping by table_name.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- ─── Aggregate function ───────────────────────────────────────────────────────
-- Returns one row per distinct table_name with:
--   activity_count  — total events in range
--   active_users    — distinct actor_user_id values
--   active_schools  — distinct school_id values
--   last_activity   — timestamp of the most recent event
--
-- Non-super_admin callers (including unauthenticated) receive an empty result.
CREATE OR REPLACE FUNCTION get_operational_activity_summary(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  table_name     TEXT,
  activity_count BIGINT,
  active_users   BIGINT,
  active_schools BIGINT,
  last_activity  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.table_name,
    COUNT(*)                        AS activity_count,
    COUNT(DISTINCT a.actor_user_id) AS active_users,
    COUNT(DISTINCT a.school_id)     AS active_schools,
    MAX(a.created_at)               AS last_activity
  FROM audit_logs a
  WHERE a.created_at >= p_from
    AND a.created_at <= p_to
  GROUP BY a.table_name
  ORDER BY activity_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_operational_activity_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_operational_activity_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
