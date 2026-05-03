-- ──────────────────────────────────────────────────────────────────────────
-- Migration 068 — document_consents parent transition guard NULL-role fix
--
-- Bug
--   Trigger 4.1 (`document_consents_parent_transition_guard`) is supposed
--   to early-return for any caller that isn't a parent, so school_admin
--   updates pass through unimpeded:
--
--       IF current_user_role() <> 'parent' THEN
--         RETURN NEW;
--       END IF;
--
--   But when the connection has NULL auth context (Supabase SQL editor
--   running raw SQL, service-role connections, cron jobs), `current_user_role()`
--   returns NULL, and `NULL <> 'parent'` evaluates to NULL — not TRUE.
--   The IF block doesn't fire the early return and the function falls
--   through into the parent-only branch, which fails with:
--
--       granted_by_guardian_id must match one of the calling parent's
--       guardian rows
--
--   This blocks the dev workflow of "manually grant a consent in the SQL
--   editor while the parent UI is still pending (Phase E)" and any future
--   service-role consent management.
--
-- Fix
--   Use `IS DISTINCT FROM` so NULL is treated as not-equal-to-parent and
--   the early return fires correctly:
--
--       IF current_user_role() IS DISTINCT FROM 'parent'::user_role THEN
--         RETURN NEW;
--       END IF;
--
--   Also marks the trigger SECURITY DEFINER so `parent_guardian_ids()`
--   (already SECURITY DEFINER) chains correctly without surprises across
--   different invokers. Behavior for actual parent callers is unchanged.
--
-- Idempotent: CREATE OR REPLACE FUNCTION; trigger binding unchanged.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION document_consents_parent_transition_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF current_user_role() IS DISTINCT FROM 'parent'::user_role THEN
    RETURN NEW;  -- school_admin / teacher / NULL-role / service-role pass through
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'granted' THEN
    IF NEW.granted_by_guardian_id IS NULL OR NEW.granted_at IS NULL THEN
      RAISE EXCEPTION
        'parent grant must set granted_by_guardian_id and granted_at';
    END IF;
    IF NOT (NEW.granted_by_guardian_id = ANY(parent_guardian_ids())) THEN
      RAISE EXCEPTION
        'granted_by_guardian_id must match one of the calling parent''s guardian rows';
    END IF;

  ELSIF OLD.status = 'granted' AND NEW.status = 'revoked' THEN
    IF NEW.revoked_by_guardian_id IS NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION
        'parent revoke must set revoked_by_guardian_id and revoked_at';
    END IF;
    IF NOT (NEW.revoked_by_guardian_id = ANY(parent_guardian_ids())) THEN
      RAISE EXCEPTION
        'revoked_by_guardian_id must match one of the calling parent''s guardian rows';
    END IF;

  ELSE
    RAISE EXCEPTION
      'parent cannot transition consent from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.school_id      <> OLD.school_id
     OR NEW.student_id  <> OLD.student_id
     OR NEW.purpose     IS DISTINCT FROM OLD.purpose
     OR NEW.scope       IS DISTINCT FROM OLD.scope
     OR NEW.recipients  IS DISTINCT FROM OLD.recipients
     OR NEW.allow_download <> OLD.allow_download
     OR NEW.allow_reshare  <> OLD.allow_reshare
     OR NEW.expires_at  <> OLD.expires_at
     OR NEW.starts_at   IS DISTINCT FROM OLD.starts_at
     OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
     OR NEW.request_message      IS DISTINCT FROM OLD.request_message
  THEN
    RAISE EXCEPTION
      'parent cannot modify consent terms — only the status transition is allowed';
  END IF;

  RETURN NEW;
END;
$$;
