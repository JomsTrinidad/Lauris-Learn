-- ============================================================
-- Migration 076 — Phase 5B: cross-organization document sharing.
--
-- Purpose:
--   Allow a school to grant a target clinic / medical-practice
--   organization read access to a specific child_documents row,
--   WITHOUT touching any of the existing document RLS, helpers, or
--   the log_document_access RPC. Cross-org document access flows
--   through a new isolated table + helper + RPC, so the existing
--   Lauris Learn document coordination system is byte-for-byte
--   unchanged.
--
-- Strict isolation constraints (from approval):
--   - accessible_document_ids() is NOT modified.
--   - log_document_access RPC is NOT modified.
--   - No policies on any of the existing 7 document tables are
--     modified or removed.
--   - The single existing-table mutation is a CHECK widening on
--     `document_access_events.actor_kind` to add the new value
--     'organization_member' so the new RPC's audit rows land cleanly.
--   - No storage policy changes. No new bucket. The existing
--     `child-documents` bucket (private, no client SELECT) is reused.
--
-- What clinic / medical-practice users gain in Phase 5B:
--   ✅ SELECT on document_organization_access_grants rows whose
--      target_organization_id is one of their active memberships
--      AND status='active' (defense-in-depth clamp, mirrors 074).
--   ✅ A new SECURITY DEFINER RPC (log_document_access_for_organizations)
--      that returns the same metadata shape as log_document_access
--      and lets the existing API-route choke point mint a 60-second
--      signed URL via service-role.
--
-- What clinic / medical-practice users still CANNOT do in Phase 5B:
--   ❌ Direct SELECT on child_documents / child_document_versions —
--      those policies are unchanged, so they still resolve through
--      accessible_document_ids() which has no clinic arm.
--   ❌ See child_profiles or child_identifiers — those flow through
--      child_profile_access_grants (Phase 4/5A), a completely
--      separate table.
--   ❌ See student_plans, students, schools, billing, parent_updates,
--      events, external_contacts, document_consents,
--      document_access_grants, document_requests,
--      document_access_events — all school-scoped, no clinic arm.
--   ❌ Hidden versions, revoked documents — the existing version
--      filtering logic stays in force inside the new RPC.
--
-- Reused project-wide helpers:
--   set_updated_at()              — schema.sql
--   audit_log_trigger()           — migration 036
--   is_super_admin()              — migration 002
--   current_user_role()           — migration 031
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_organization_access_grants (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What is being shared
  document_id                 UUID         NOT NULL REFERENCES child_documents(id) ON DELETE CASCADE,
  -- Phase 5B is per-document only. `scope` column kept for future
  -- widening (document_type / all_for_student) without DDL churn.
  scope                       TEXT         NOT NULL DEFAULT 'document',

  -- Who is sharing → who is receiving
  source_school_id            UUID         NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  target_organization_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  -- Authoriser (audit; granted_by_kind snapshot of role-at-time-of-grant)
  granted_by_profile_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  granted_by_kind             TEXT         NOT NULL,
  purpose                     TEXT,

  -- Permissions JSONB — same shape as document_access_grants for
  -- familiarity. Phase 5B honours `view` (always true) and `download`.
  -- `comment` and `upload_new_version` are reserved (always false in
  -- v1) — flipping them is a future-phase decision.
  permissions                 JSONB        NOT NULL DEFAULT
    jsonb_build_object('view', true, 'download', false, 'comment', false, 'upload_new_version', false),

  -- Lifecycle
  status                      TEXT         NOT NULL DEFAULT 'active',
  valid_from                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  valid_until                 TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
  revoked_at                  TIMESTAMPTZ,
  revoked_by_profile_id       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  revoke_reason               TEXT,

  -- Bookkeeping
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT doag_scope_valid
    CHECK (scope IN ('document')),  -- Phase 5B accepts only 'document'; future phases may broaden
  CONSTRAINT doag_status_valid
    CHECK (status IN ('active','revoked','expired')),
  CONSTRAINT doag_granted_by_kind_valid
    CHECK (granted_by_kind IN ('school_admin','super_admin')),
  CONSTRAINT doag_valid_window
    CHECK (valid_until > valid_from)
);

-- One ACTIVE grant per (document, target_org). Replacing means
-- revoke-then-insert. Revoked / expired rows are excluded so they
-- don't block a fresh grant.
CREATE UNIQUE INDEX IF NOT EXISTS doag_active_unique_idx
  ON document_organization_access_grants (document_id, target_organization_id)
  WHERE status = 'active';

-- Helper hot path: clinic-side visibility check
CREATE INDEX IF NOT EXISTS idx_doag_target_status
  ON document_organization_access_grants (target_organization_id, status);

-- School-side audit views
CREATE INDEX IF NOT EXISTS idx_doag_doc_status
  ON document_organization_access_grants (document_id, status);
CREATE INDEX IF NOT EXISTS idx_doag_source_school
  ON document_organization_access_grants (source_school_id);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- updated_at maintenance
DROP TRIGGER IF EXISTS set_doag_updated_at ON document_organization_access_grants;
CREATE TRIGGER set_doag_updated_at
  BEFORE UPDATE ON document_organization_access_grants
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- DML audit (school_id fallback to actor profile per 036's contract)
DROP TRIGGER IF EXISTS audit_doag ON document_organization_access_grants;
CREATE TRIGGER audit_doag
  AFTER INSERT OR UPDATE OR DELETE ON document_organization_access_grants
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- Column-guard trigger.
-- Mirrors child_profile_access_grants column-guard (074). Only
-- lifecycle columns (status, valid_until, revoked_*) are mutable.
-- super_admin bypass via is_super_admin() so service-role and
-- impersonating super_admins can still patch data.
CREATE OR REPLACE FUNCTION doag_column_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.document_id IS DISTINCT FROM OLD.document_id THEN
    RAISE EXCEPTION 'document_id is immutable on document_organization_access_grants';
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope THEN
    RAISE EXCEPTION 'scope is immutable on document_organization_access_grants — revoke and re-grant';
  END IF;
  IF NEW.source_school_id IS DISTINCT FROM OLD.source_school_id THEN
    RAISE EXCEPTION 'source_school_id is immutable on document_organization_access_grants';
  END IF;
  IF NEW.target_organization_id IS DISTINCT FROM OLD.target_organization_id THEN
    RAISE EXCEPTION 'target_organization_id is immutable on document_organization_access_grants';
  END IF;
  IF NEW.granted_by_profile_id IS DISTINCT FROM OLD.granted_by_profile_id THEN
    RAISE EXCEPTION 'granted_by_profile_id is immutable on document_organization_access_grants';
  END IF;
  IF NEW.granted_by_kind IS DISTINCT FROM OLD.granted_by_kind THEN
    RAISE EXCEPTION 'granted_by_kind is immutable on document_organization_access_grants';
  END IF;
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'purpose is immutable on document_organization_access_grants';
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'permissions is immutable on document_organization_access_grants — revoke and re-grant';
  END IF;
  IF NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
    RAISE EXCEPTION 'valid_from is immutable on document_organization_access_grants';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable on document_organization_access_grants';
  END IF;

  -- Mutable: status, valid_until, revoked_at, revoked_by_profile_id,
  -- revoke_reason, updated_at.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS doag_column_guard_trigger ON document_organization_access_grants;
CREATE TRIGGER doag_column_guard_trigger
  BEFORE UPDATE ON document_organization_access_grants
  FOR EACH ROW EXECUTE FUNCTION doag_column_guard();


-- ════════════════════════════════════════════════════════════════
-- 3. NEW HELPER — caller_visible_document_ids_for_organizations()
--
-- ★ This helper does NOT gate any existing table. The existing
-- child_documents / child_document_versions SELECT policies continue
-- to use accessible_document_ids() (untouched). Phase 5B exposes this
-- helper for use by:
--   1. log_document_access_for_organizations() (defined below)
--   2. Future list/enumeration RPCs (not in Phase 5B)
--
-- Resolution: docs reachable via an active org grant whose target
-- org is a clinic or medical practice, the caller has an active
-- membership in that org, and the doc is not revoked.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION caller_visible_document_ids_for_organizations()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT g.document_id), ARRAY[]::UUID[])
  FROM document_organization_access_grants g
  JOIN organization_memberships m
    ON m.organization_id = g.target_organization_id
  JOIN child_documents d
    ON d.id = g.document_id
  WHERE g.status     = 'active'
    AND g.valid_until > NOW()
    AND m.profile_id = auth.uid()
    AND m.status     = 'active'
    AND d.status    <> 'revoked'
    AND EXISTS (
      SELECT 1
        FROM organizations o
       WHERE o.id   = g.target_organization_id
         AND o.kind IN ('clinic', 'medical_practice')
    );
$$;


-- Tiny SECURITY DEFINER helper used by the INSERT policy below to
-- check the target organization's kind. The RLS policy can't perform
-- this check via a plain EXISTS on `organizations` because the
-- inserter is a school_admin, and Phase 2's organizations SELECT
-- policy only exposes their own school's shadow org — clinic and
-- medical-practice rows are invisible to them. SECURITY DEFINER
-- bypasses that for this single read.
CREATE OR REPLACE FUNCTION doag_is_clinic_or_medical_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM organizations
     WHERE id   = p_org_id
       AND kind IN ('clinic', 'medical_practice')
  );
$$;


-- ════════════════════════════════════════════════════════════════
-- 4. EXTEND document_access_events.actor_kind CHECK
--
-- Single existing-table mutation in Phase 5B (approved as decision D).
-- Adds 'organization_member' to the allowed actor_kind values so the
-- new RPC's audit rows can land. Strictly additive — no existing rows
-- affected, no policies changed.
-- ════════════════════════════════════════════════════════════════

-- Drop any pre-existing actor_kind CHECK on document_access_events,
-- regardless of the historical name. Migration 054 named it
-- `document_access_events_actor_kind_chk`; later migrations may have
-- re-emitted it under a different name.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'document_access_events'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%actor_kind%'
  LOOP
    EXECUTE format('ALTER TABLE document_access_events DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE document_access_events
  ADD CONSTRAINT document_access_events_actor_kind_chk
  CHECK (actor_kind IN (
    'school_admin',
    'teacher',
    'parent',
    'external_contact',
    'super_admin',
    'unauthenticated',
    'organization_member'
  ));


-- ════════════════════════════════════════════════════════════════
-- 5. NEW RPC — log_document_access_for_organizations()
--
-- ★ Same return shape as log_document_access. Runs in isolation:
-- only resolves the org-grant pathway. Does NOT call into
-- log_document_access or accessible_document_ids().
--
-- Action whitelist matches the original RPC: view | download |
-- signed_url_issued | preview_opened.
--
-- Decision tree:
--   1. Unauthenticated (auth.uid IS NULL) → log denied + return.
--   2. is_super_admin() → log denied + return (super_admin is not
--      an org-pathway caller; they have direct DB access for ops).
--   3. Look up an active grant for (doc_id, caller's active orgs of
--      kind clinic/medical_practice). If none / revoked / expired →
--      log denied with the appropriate reason + return.
--   4. Resolve current_version_id; if NULL or hidden → log denied
--      ('no_visible_version') + return.
--   5. If action='download' AND grant.permissions->>'download' is
--      not 'true' → log denied ('download_not_permitted') + return.
--   6. Log allowed + return metadata { storage_path, mime_type,
--      current_version_id, version_number, signed_url_ttl_seconds }.
--
-- All paths INSERT into document_access_events for audit. The
-- function is SECURITY DEFINER so it can read child_documents and
-- child_document_versions despite the caller having no RLS access.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_document_access_for_organizations(
  p_doc_id      UUID,
  p_action      TEXT,
  p_ip          TEXT DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_uid       UUID := auth.uid();
  v_actor_email     TEXT;
  v_doc             child_documents%ROWTYPE;
  v_grant           document_organization_access_grants%ROWTYPE;
  v_version         child_document_versions%ROWTYPE;
  v_denied          TEXT;
  v_action          TEXT;
  v_signed_url_ttl  INT  := 60;
BEGIN
  -- Action whitelist (matches log_document_access).
  v_action := lower(coalesce(p_action, ''));
  IF v_action NOT IN ('view','download','signed_url_issued','preview_opened') THEN
    RAISE EXCEPTION 'log_document_access_for_organizations: invalid action %', p_action
      USING ERRCODE = '22023';
  END IF;

  -- Resolve doc up-front (we may need school_id for audit and
  -- current_version_id for the metadata branch).
  SELECT * INTO v_doc FROM child_documents WHERE id = p_doc_id;

  -- document_access_events.student_id is NOT NULL — audit rows are
  -- only inserted when v_doc.student_id is populated. For the
  -- unauthenticated / super_admin / doc_not_found branches that
  -- might have a missing or invalid p_doc_id, we skip the audit row
  -- (the denial response is still returned to the caller).

  -- Branch 1: unauthenticated
  IF v_actor_uid IS NULL THEN
    v_denied := 'not_authorized';
    IF v_doc.student_id IS NOT NULL THEN
      INSERT INTO document_access_events (
        document_id, student_id, school_id, actor_user_id, actor_email,
        actor_kind, action, denied_reason, ip, user_agent
      ) VALUES (
        p_doc_id, v_doc.student_id, v_doc.school_id, NULL, NULL,
        'unauthenticated', 'access_denied', v_denied, p_ip, p_user_agent
      );
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', v_denied,
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', v_signed_url_ttl
    );
  END IF;

  -- Resolve actor email (for audit only; not used in access decision)
  SELECT email INTO v_actor_email FROM profiles WHERE id = v_actor_uid;

  -- Branch 2: super_admin is not an org-pathway caller.
  -- Mirrors log_document_access's posture of denying super_admin
  -- through the app RPC. Ops happens via direct DB access.
  IF is_super_admin() THEN
    v_denied := 'not_authorized';
    IF v_doc.student_id IS NOT NULL THEN
      INSERT INTO document_access_events (
        document_id, student_id, school_id, actor_user_id, actor_email,
        actor_kind, action, denied_reason, ip, user_agent
      ) VALUES (
        p_doc_id, v_doc.student_id, v_doc.school_id, v_actor_uid, v_actor_email,
        'super_admin', 'access_denied', v_denied, p_ip, p_user_agent
      );
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', v_denied,
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', v_signed_url_ttl
    );
  END IF;

  -- Doc not found at all — no student to attribute, skip audit.
  IF v_doc.id IS NULL THEN
    v_denied := 'doc_not_found';
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', v_denied,
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', v_signed_url_ttl
    );
  END IF;

  -- Branch 3: find a grant for (doc, caller's active orgs of kind
  -- clinic/medical_practice). We pick the most recent matching row
  -- so we can give a precise denial reason if the grant exists but
  -- is no longer effective.
  SELECT g.* INTO v_grant
    FROM document_organization_access_grants g
    JOIN organization_memberships m
      ON m.organization_id = g.target_organization_id
    WHERE g.document_id = p_doc_id
      AND m.profile_id  = v_actor_uid
      AND m.status      = 'active'
      AND EXISTS (
        SELECT 1
          FROM organizations o
         WHERE o.id   = g.target_organization_id
           AND o.kind IN ('clinic', 'medical_practice')
      )
    ORDER BY g.created_at DESC
    LIMIT 1;

  IF NOT FOUND THEN
    v_denied := 'org_grant_not_found';
  ELSIF v_grant.status = 'revoked' THEN
    v_denied := 'org_grant_revoked';
  ELSIF v_grant.status = 'expired' OR v_grant.valid_until <= NOW() THEN
    v_denied := 'org_grant_expired';
  ELSIF v_doc.status = 'revoked' THEN
    v_denied := 'doc_revoked';
  ELSE
    v_denied := NULL;
  END IF;

  IF v_denied IS NOT NULL THEN
    INSERT INTO document_access_events (
      document_id, student_id, school_id, actor_user_id, actor_email,
      actor_kind, action, denied_reason, ip, user_agent
    ) VALUES (
      p_doc_id, v_doc.student_id, v_doc.school_id, v_actor_uid, v_actor_email,
      'organization_member', 'access_denied', v_denied, p_ip, p_user_agent
    );
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', v_denied,
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', v_signed_url_ttl
    );
  END IF;

  -- Branch 4: resolve current version. If hidden or absent, deny.
  IF v_doc.current_version_id IS NULL THEN
    v_denied := 'no_visible_version';
  ELSE
    SELECT * INTO v_version
      FROM child_document_versions
      WHERE id = v_doc.current_version_id;
    IF v_version.id IS NULL OR v_version.is_hidden THEN
      v_denied := 'no_visible_version';
    END IF;
  END IF;

  IF v_denied IS NOT NULL THEN
    INSERT INTO document_access_events (
      document_id, student_id, school_id, actor_user_id, actor_email,
      actor_kind, action, denied_reason, ip, user_agent
    ) VALUES (
      p_doc_id, v_doc.student_id, v_doc.school_id, v_actor_uid, v_actor_email,
      'organization_member', 'access_denied', v_denied, p_ip, p_user_agent
    );
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', v_denied,
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', v_signed_url_ttl
    );
  END IF;

  -- Branch 5: download permission check.
  IF v_action = 'download' THEN
    IF NOT COALESCE((v_grant.permissions->>'download')::boolean, false) THEN
      v_denied := 'download_not_permitted';
      INSERT INTO document_access_events (
        document_id, document_version_id, student_id, school_id, actor_user_id, actor_email,
        actor_kind, action, denied_reason, ip, user_agent
      ) VALUES (
        p_doc_id, v_version.id, v_doc.student_id, v_doc.school_id, v_actor_uid, v_actor_email,
        'organization_member', 'access_denied', v_denied, p_ip, p_user_agent
      );
      RETURN jsonb_build_object(
        'allowed', false,
        'denied_reason', v_denied,
        'storage_path', NULL,
        'mime_type', NULL,
        'current_version_id', NULL,
        'version_number', NULL,
        'signed_url_ttl_seconds', v_signed_url_ttl
      );
    END IF;
  END IF;

  -- Branch 6: allowed. Log + return metadata.
  INSERT INTO document_access_events (
    document_id, document_version_id, student_id, school_id, actor_user_id, actor_email,
    actor_kind, action, ip, user_agent
  ) VALUES (
    p_doc_id, v_version.id, v_doc.student_id, v_doc.school_id, v_actor_uid, v_actor_email,
    'organization_member', v_action, p_ip, p_user_agent
  );

  RETURN jsonb_build_object(
    'allowed', true,
    'denied_reason', NULL,
    'storage_path', v_version.storage_path,
    'mime_type', v_version.mime_type,
    'current_version_id', v_version.id,
    'version_number', v_version.version_number,
    'signed_url_ttl_seconds', v_signed_url_ttl
  );
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- 6. RLS POLICIES — document_organization_access_grants
-- ════════════════════════════════════════════════════════════════

ALTER TABLE document_organization_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_visible_doag"                ON document_organization_access_grants;
DROP POLICY IF EXISTS "school_admin_insert_doag"           ON document_organization_access_grants;
DROP POLICY IF EXISTS "school_admin_update_doag"           ON document_organization_access_grants;
DROP POLICY IF EXISTS "super_admin_all_doag"               ON document_organization_access_grants;

-- ─────────────────────────────────────────────────────────────────
-- 6.1 SELECT — asymmetric, mirrors child_profile_access_grants (074):
--   SCHOOL SIDE — school_admin/teacher of the doc's school: see all
--                 grants from their school for audit (incl. revoked,
--                 expired). Resolved via the doc's school_id.
--   CLINIC SIDE — target-org members: ACTIVE grants only — defense-
--                 in-depth `status='active'` clamp on top of helper
--                 filtering. Mirrors 074's clinic-side asymmetry.
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "select_visible_doag"
  ON document_organization_access_grants
  FOR SELECT
  TO authenticated
  USING (
    -- school side: school_admin / teacher of the source school
    (
      current_user_role() IN ('school_admin','teacher')
      AND source_school_id = current_user_school_id()
    )
    -- clinic side: active member of the target org, ACTIVE grants only
    OR (
      status = 'active'
      AND EXISTS (
        SELECT 1
          FROM organization_memberships m
          JOIN organizations o ON o.id = m.organization_id
         WHERE m.organization_id = document_organization_access_grants.target_organization_id
           AND m.profile_id = auth.uid()
           AND m.status     = 'active'
           AND o.kind IN ('clinic', 'medical_practice')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 6.2 INSERT — school_admin only, for own-school documents
-- targeting a clinic / medical-practice org.
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "school_admin_insert_doag"
  ON document_organization_access_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND granted_by_profile_id = auth.uid()
    AND granted_by_kind = 'school_admin'
    AND source_school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1
        FROM child_documents d
       WHERE d.id        = document_id
         AND d.school_id = current_user_school_id()
    )
    -- Target-org kind check via SECURITY DEFINER helper (school_admin
    -- has no SELECT visibility on clinic/medical_practice rows in
    -- `organizations`, so a plain EXISTS would always return false).
    AND doag_is_clinic_or_medical_org(target_organization_id)
  );

-- ─────────────────────────────────────────────────────────────────
-- 6.3 UPDATE — school_admin can update grants their own school
-- issued. Column-guard trigger restricts mutations to lifecycle
-- columns only.
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "school_admin_update_doag"
  ON document_organization_access_grants
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND source_school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND source_school_id = current_user_school_id()
  );

-- ─────────────────────────────────────────────────────────────────
-- 6.4 super_admin bypass (matches 074 / migration 002 pattern).
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY "super_admin_all_doag"
  ON document_organization_access_grants
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- DELETE — no policy → denied. Revoke (status='revoked') instead.


-- ════════════════════════════════════════════════════════════════
-- 7. NO BACKFILL
--
-- Phase 5B starts with an empty grants table.
-- ════════════════════════════════════════════════════════════════


-- ============================================================
-- End of Migration 076
-- ============================================================
