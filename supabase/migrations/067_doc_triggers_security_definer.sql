-- ──────────────────────────────────────────────────────────────────────────
-- Migration 067 — SECURITY DEFINER on document trigger validators
--
-- Bug
--   When a school_admin tried to INSERT a document_access_grants row with
--   grantee_kind='school_user' for any teacher / other admin in the same
--   school, trigger 5.G raised:
--
--       grantee_user_id <uuid> does not exist
--
--   The trigger function ran as the invoker (school_admin), and `profiles`
--   RLS only permits a user to SELECT their own row (schema.sql:424). The
--   trigger's lookup `SELECT … FROM profiles WHERE id = NEW.grantee_user_id`
--   therefore returned 0 rows for any grantee other than the caller, and
--   the integrity check incorrectly tripped.
--
--   The same hazard exists in trigger 5.F (consent JSONB validator):
--   it looks up `profiles` for `school_user` recipients and would fail in
--   the same way once we surface that recipient kind in UI.
--
-- Fix
--   These are integrity-validator triggers — not user-callable, return
--   NEW or RAISE, never leak data back to the caller. The standard
--   Postgres pattern for that role is SECURITY DEFINER so the function
--   can read across RLS to actually validate references.
--
--   We re-emit only the two functions that cross-read `profiles` (and,
--   in 5.F's case, `external_contacts` / `schools`). Behavior is
--   unchanged for cases that already worked; cases that previously
--   raised a phantom "does not exist" now succeed when the row really
--   does exist.
--
-- Not in scope (left for later if needed)
--   5.D current_version_id validator, 5.E hide-version repointer, 5.H
--   consent-cascade — none currently cross RLS in a way that breaks
--   in-app flows. 5.H will need SECURITY DEFINER before parents can
--   revoke their own consents (Phase E), since the cascade UPDATEs grants
--   that the parent role can't touch directly.
--
-- Idempotent: CREATE OR REPLACE FUNCTION; no policy/trigger changes.
-- ──────────────────────────────────────────────────────────────────────────


-- ─── 5.F document_consents JSONB validator ───────────────────────────────

CREATE OR REPLACE FUNCTION document_consents_validate_jsonb()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_type   TEXT;
  v_doc_id       UUID;
  v_doc_school   UUID;
  v_doc_student  UUID;
  r              JSONB;
  r_type         TEXT;
  r_school       UUID;
  r_user         UUID;
  r_contact      UUID;
  r_contact_school UUID;
  r_user_school  UUID;
BEGIN
  -- ── scope ──────────────────────────────────────────────────────────────
  v_scope_type := NEW.scope->>'type';

  IF v_scope_type = 'document' THEN
    IF NOT (NEW.scope ? 'document_id') THEN
      RAISE EXCEPTION 'scope.document_id is required when scope.type = ''document''';
    END IF;
    BEGIN
      v_doc_id := (NEW.scope->>'document_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'scope.document_id is not a valid UUID';
    END;
    SELECT school_id, student_id INTO v_doc_school, v_doc_student
      FROM child_documents WHERE id = v_doc_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scope.document_id % does not exist', v_doc_id;
    END IF;
    IF v_doc_school <> NEW.school_id OR v_doc_student <> NEW.student_id THEN
      RAISE EXCEPTION
        'scope.document_id % belongs to a different school/student than this consent',
        v_doc_id;
    END IF;

  ELSIF v_scope_type = 'document_type' THEN
    IF NOT (NEW.scope ? 'document_type') THEN
      RAISE EXCEPTION 'scope.document_type is required when scope.type = ''document_type''';
    END IF;
    BEGIN
      PERFORM (NEW.scope->>'document_type')::document_type;
    EXCEPTION WHEN invalid_text_representation OR others THEN
      RAISE EXCEPTION 'scope.document_type ''%'' is not a valid document_type', NEW.scope->>'document_type';
    END;

  ELSIF v_scope_type = 'all_for_student' THEN
    NULL;

  ELSE
    RAISE EXCEPTION 'scope.type ''%'' is not supported', v_scope_type;
  END IF;

  -- ── recipients ─────────────────────────────────────────────────────────
  FOR r IN SELECT * FROM jsonb_array_elements(NEW.recipients) LOOP
    IF jsonb_typeof(r) <> 'object' THEN
      RAISE EXCEPTION 'each recipient must be a JSON object';
    END IF;

    r_type := r->>'type';
    IF r_type NOT IN ('school','school_user','external_contact') THEN
      RAISE EXCEPTION 'recipient.type ''%'' is not supported', r_type;
    END IF;

    IF r_type = 'school' THEN
      IF NOT (r ? 'school_id') THEN
        RAISE EXCEPTION 'recipient.school_id required when type = ''school''';
      END IF;
      r_school := (r->>'school_id')::UUID;
      PERFORM 1 FROM schools WHERE id = r_school;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'recipient.school_id % does not exist', r_school;
      END IF;

    ELSIF r_type = 'school_user' THEN
      IF NOT (r ? 'user_id') OR NOT (r ? 'school_id') THEN
        RAISE EXCEPTION 'recipient.user_id and recipient.school_id required when type = ''school_user''';
      END IF;
      r_user   := (r->>'user_id')::UUID;
      r_school := (r->>'school_id')::UUID;
      SELECT school_id INTO r_user_school FROM profiles WHERE id = r_user;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'recipient.user_id % does not exist', r_user;
      END IF;
      IF r_user_school IS DISTINCT FROM r_school THEN
        RAISE EXCEPTION
          'recipient user % does not belong to school % (belongs to %)',
          r_user, r_school, r_user_school;
      END IF;

    ELSIF r_type = 'external_contact' THEN
      IF NOT (r ? 'external_contact_id') THEN
        RAISE EXCEPTION 'recipient.external_contact_id required when type = ''external_contact''';
      END IF;
      r_contact := (r->>'external_contact_id')::UUID;
      SELECT school_id INTO r_contact_school
        FROM external_contacts
        WHERE id = r_contact AND deactivated_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION
          'recipient.external_contact_id % does not exist or is deactivated', r_contact;
      END IF;
      IF r_contact_school <> NEW.school_id THEN
        RAISE EXCEPTION
          'external_contact % belongs to school % (not consent school %)',
          r_contact, r_contact_school, NEW.school_id;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ─── 5.G document_access_grants invariants ───────────────────────────────

CREATE OR REPLACE FUNCTION document_access_grants_enforce_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_school     UUID;
  v_doc_student    UUID;
  v_doc_type       document_type;
  v_consent        RECORD;
  v_user_school    UUID;
  v_recipient_match BOOLEAN := FALSE;
  r                JSONB;
  v_scope_type     TEXT;
BEGIN
  -- ── Tenant integrity: grant.school_id must equal document.school_id ────
  SELECT school_id, student_id, document_type
    INTO v_doc_school, v_doc_student, v_doc_type
    FROM child_documents WHERE id = NEW.document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_id % does not exist', NEW.document_id;
  END IF;
  IF NEW.school_id <> v_doc_school THEN
    RAISE EXCEPTION
      'grant.school_id % does not match document school %', NEW.school_id, v_doc_school;
  END IF;

  -- ── Cross-school school_user requires consent ──────────────────────────
  IF NEW.grantee_kind = 'school_user' THEN
    SELECT school_id INTO v_user_school FROM profiles WHERE id = NEW.grantee_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grantee_user_id % does not exist', NEW.grantee_user_id;
    END IF;
    IF v_user_school IS DISTINCT FROM v_doc_school AND NEW.consent_id IS NULL THEN
      RAISE EXCEPTION
        'cross-school user grants require a consent_id (user belongs to %, document to %)',
        v_user_school, v_doc_school;
    END IF;
  END IF;

  -- ── If grant carries a consent, verify it covers this grantee+document ──
  IF NEW.consent_id IS NOT NULL THEN
    SELECT * INTO v_consent FROM document_consents WHERE id = NEW.consent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'consent_id % does not exist', NEW.consent_id;
    END IF;

    IF v_consent.status <> 'granted' THEN
      RAISE EXCEPTION
        'consent % is not granted (status = %)', NEW.consent_id, v_consent.status;
    END IF;

    IF v_consent.expires_at <= NOW() THEN
      RAISE EXCEPTION 'consent % is expired (expires_at = %)', NEW.consent_id, v_consent.expires_at;
    END IF;

    IF NEW.expires_at > v_consent.expires_at THEN
      RAISE EXCEPTION
        'grant.expires_at (%) must be <= consent.expires_at (%)',
        NEW.expires_at, v_consent.expires_at;
    END IF;

    IF v_consent.school_id <> v_doc_school OR v_consent.student_id <> v_doc_student THEN
      RAISE EXCEPTION
        'consent does not belong to the document''s school/student';
    END IF;

    v_scope_type := v_consent.scope->>'type';
    IF v_scope_type = 'document' THEN
      IF (v_consent.scope->>'document_id')::UUID <> NEW.document_id THEN
        RAISE EXCEPTION 'consent scope is for a different document';
      END IF;
    ELSIF v_scope_type = 'document_type' THEN
      IF (v_consent.scope->>'document_type')::document_type <> v_doc_type THEN
        RAISE EXCEPTION
          'consent scope document_type (%) does not match document type (%)',
          v_consent.scope->>'document_type', v_doc_type;
      END IF;
    ELSIF v_scope_type = 'all_for_student' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'consent has unsupported scope.type ''%''', v_scope_type;
    END IF;

    FOR r IN SELECT * FROM jsonb_array_elements(v_consent.recipients) LOOP
      IF NEW.grantee_kind = 'school'
         AND r->>'type' = 'school'
         AND (r->>'school_id')::UUID = NEW.grantee_school_id
      THEN
        v_recipient_match := TRUE; EXIT;
      ELSIF NEW.grantee_kind = 'school_user'
         AND r->>'type' = 'school_user'
         AND (r->>'user_id')::UUID = NEW.grantee_user_id
      THEN
        v_recipient_match := TRUE; EXIT;
      ELSIF NEW.grantee_kind = 'external_contact'
         AND r->>'type' = 'external_contact'
         AND (r->>'external_contact_id')::UUID = NEW.grantee_external_contact_id
      THEN
        v_recipient_match := TRUE; EXIT;
      END IF;
    END LOOP;

    IF NOT v_recipient_match THEN
      RAISE EXCEPTION
        'consent recipients do not include this grantee (kind=%)', NEW.grantee_kind;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
