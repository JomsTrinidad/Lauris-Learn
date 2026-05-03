-- ============================================================
-- Migration 069 — Phase E1 prerequisite
-- Mark trigger 5.H (consent cascade-revoke) as SECURITY DEFINER.
--
-- Why:
-- Without this, when a parent revokes a covering consent, trigger 5.H
-- fires inside the parent's session and tries to UPDATE
-- document_access_grants. The parent has no UPDATE policy on that table
-- (only school_admin does), so the cascade UPDATE silently affects zero
-- rows. Net effect: consent.status flips to 'revoked' while every
-- dependent external grant keeps working until its own expiry — exactly
-- the failure mode the spec wants prevented.
--
-- SECURITY DEFINER runs the trigger function as its owner (typically the
-- 'postgres' role on Supabase), which is the table owner and bypasses
-- RLS. Same pattern used by migration 067 for triggers 5.F / 5.G and by
-- migration 068 for 4.1. The trigger logic itself is unchanged — only
-- the security context.
--
-- The function only writes to (revoked_at, revoke_reason), which trigger
-- 4.2 (column guard) explicitly permits, so no other downstream guard
-- fires on the cascade UPDATE.
-- ============================================================

CREATE OR REPLACE FUNCTION document_consents_cascade_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  -- Only fire on transitions INTO revoked/expired.
  IF NEW.status NOT IN ('revoked','expired') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;  -- no transition, nothing to cascade
  END IF;

  v_reason := CASE NEW.status
                WHEN 'revoked' THEN 'consent_revoked'
                WHEN 'expired' THEN 'consent_expired'
              END;

  UPDATE document_access_grants
    SET revoked_at    = COALESCE(revoked_at, NOW()),
        revoke_reason = COALESCE(revoke_reason, v_reason)
    WHERE consent_id = NEW.id
      AND revoked_at IS NULL;

  RETURN NEW;
END;
$$;

-- Trigger binding is unchanged (already created in migration 054), but
-- re-emit it to be safe across re-runs / partial deployments.
DROP TRIGGER IF EXISTS trg_document_consents_cascade_revocation ON document_consents;
CREATE TRIGGER trg_document_consents_cascade_revocation
  AFTER UPDATE OF status ON document_consents
  FOR EACH ROW EXECUTE FUNCTION document_consents_cascade_revocation();

-- ============================================================
-- End of Migration 069
-- ============================================================
