-- ============================================================
-- Migration 081 — Phase 6C: clinic-side document upload for clinic-
-- owned children.
--
-- Strict isolation constraints (Phase 6C approval):
--   - accessible_document_ids()                            → NOT modified.
--   - log_document_access()                                → NOT modified.
--   - log_document_access_for_organizations()              → NOT modified.
--   - list_documents_for_organization()                    → NOT modified.
--   - caller_owned_child_profile_ids()                     → NOT modified.
--   - All existing child_documents / child_document_versions
--     / document_access_events / document_access_grants
--     / document_organization_access_grants policies        → NOT modified.
--   - The `child-documents` storage bucket and its policies → NOT modified.
--   - student_plans                                        → NOT modified.
--
-- What this migration adds (all NEW, all isolated):
--   1. Tables — clinic_documents (head), clinic_document_versions
--               (chain), clinic_document_access_events (audit).
--   2. Triggers — origin/child-consistency validate, immutability
--               column-guard, normalize document_kind, audit log,
--               updated_at maintenance.
--   3. RLS    — default-deny + explicit allow for SELECT (any
--               active member of origin org), INSERT (clinic_admin
--               of origin), UPDATE (clinic_admin of origin, lifecycle
--               columns only via the column-guard trigger).
--               No DELETE policy → DELETE denied.
--   4. Storage bucket `clinic-documents` (private, 25 MB, PDF /
--               JPEG / PNG / WebP) and its INSERT/UPDATE policies.
--               No client SELECT policy — service-role-only reads
--               via the access route after RPC approval.
--   5. RPC    — log_clinic_document_access(p_doc_id, p_action, p_ip,
--               p_user_agent) RETURNS JSONB. Same shape as
--               log_document_access_for_organizations (5B). Atomic
--               decision + audit. Honours per-doc permissions JSONB
--               { view, download } with `clinic_admin` of origin
--               always allowed to download.
--
-- Permissions model (Phase 6C adjustment 1):
--   permissions JSONB DEFAULT '{"view":true,"download":false}'
--   - `view` is always true (we don't have a view-disabled path).
--     The column shape parallels document_organization_access_grants.permissions
--     to make a future cross-org-sharing phase trivial.
--   - `download` gates non-admin clinic members; admins ignore it.
--
-- document_kind normalisation (Phase 6C adjustment 2):
--   Trigger normalizes to LOWER(TRIM(kind)) on INSERT/UPDATE so casing
--   variants ("Therapy Evaluation" vs "therapy_evaluation") collapse.
--
-- Immutability column-guard (Phase 6C adjustment 3):
--   UPDATE rejects any change to origin_organization_id,
--   child_profile_id, or created_by_profile_id. Only is_super_admin()
--   bypasses.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════════════════════

-- 1.A — Head
CREATE TABLE IF NOT EXISTS clinic_documents (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  origin_organization_id   UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  child_profile_id         UUID         NOT NULL REFERENCES child_profiles(id) ON DELETE RESTRICT,

  -- Editorial. document_kind is TEXT (no enum) so future Lauris Care
  -- workflows can extend without DDL churn. Normalised by trigger.
  document_kind            TEXT         NOT NULL,
  title                    TEXT         NOT NULL,
  description              TEXT,

  -- Lifecycle. Phase 6C v1 only uses 'draft' / 'active' / 'archived'.
  -- 'shared' / 'revoked' reserved for a future cross-org-sharing phase.
  status                   TEXT         NOT NULL DEFAULT 'draft',

  -- Per-doc permission. Shape mirrors
  -- document_organization_access_grants.permissions so a future cross-
  -- org-sharing phase reuses the same key set.
  permissions              JSONB        NOT NULL DEFAULT '{"view":true,"download":false}'::jsonb,

  -- Optional dates
  effective_date           DATE,
  review_date              DATE,

  -- Versioning chain (FK back to versions added below)
  current_version_id       UUID,

  -- Authoring audit
  created_by_profile_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT clinic_documents_status_valid
    CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT clinic_documents_kind_nonblank
    CHECK (length(trim(document_kind)) > 0),
  CONSTRAINT clinic_documents_title_nonblank
    CHECK (length(trim(title)) > 0),
  CONSTRAINT clinic_documents_permissions_shape
    CHECK (
      jsonb_typeof(permissions) = 'object'
      AND permissions ? 'view'
      AND permissions ? 'download'
      AND jsonb_typeof(permissions->'view') = 'boolean'
      AND jsonb_typeof(permissions->'download') = 'boolean'
    )
);

CREATE INDEX IF NOT EXISTS clinic_documents_child_idx
  ON clinic_documents (child_profile_id);
CREATE INDEX IF NOT EXISTS clinic_documents_origin_idx
  ON clinic_documents (origin_organization_id);


-- 1.B — Versions
CREATE TABLE IF NOT EXISTS clinic_document_versions (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             UUID         NOT NULL REFERENCES clinic_documents(id) ON DELETE CASCADE,
  version_number          INT          NOT NULL,
  storage_path            TEXT         NOT NULL,
  mime_type               TEXT         NOT NULL,
  file_name               TEXT         NOT NULL,
  file_size               BIGINT,
  is_hidden               BOOLEAN      NOT NULL DEFAULT FALSE,
  hidden_reason           TEXT,
  uploaded_by_profile_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT clinic_document_versions_unique
    UNIQUE (document_id, version_number),
  CONSTRAINT clinic_document_versions_path_nonblank
    CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT clinic_document_versions_version_positive
    CHECK (version_number > 0)
);

CREATE INDEX IF NOT EXISTS clinic_document_versions_doc_idx
  ON clinic_document_versions (document_id);

ALTER TABLE clinic_documents
  DROP CONSTRAINT IF EXISTS clinic_documents_current_version_fkey;
ALTER TABLE clinic_documents
  ADD CONSTRAINT clinic_documents_current_version_fkey
    FOREIGN KEY (current_version_id) REFERENCES clinic_document_versions(id) ON DELETE SET NULL;


-- 1.C — Audit events (separate from document_access_events to avoid
-- touching that table's actor_kind CHECK and to keep clinic audit
-- isolated from school audit).
CREATE TABLE IF NOT EXISTS clinic_document_access_events (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id              UUID         REFERENCES clinic_documents(id) ON DELETE SET NULL,
  version_id               UUID         REFERENCES clinic_document_versions(id) ON DELETE SET NULL,
  origin_organization_id   UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id            UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role               TEXT,
  action                   TEXT         NOT NULL,
  denied_reason            TEXT,
  ip_address               TEXT,
  user_agent               TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT cdae_action_valid
    CHECK (action IN ('signed_url_issued', 'preview_opened', 'download', 'access_denied'))
);

CREATE INDEX IF NOT EXISTS clinic_document_access_events_doc_idx
  ON clinic_document_access_events (document_id, created_at DESC);


-- ════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- 2.A — Origin/child-profile consistency.
-- The child_profile being attached must itself be owned by the same
-- organization (origin_organization_id). SECURITY DEFINER for the
-- read in case the caller's RLS would have hidden the row in some
-- corner case (it shouldn't, but defensive).
CREATE OR REPLACE FUNCTION cd_origin_consistency_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_origin UUID;
BEGIN
  SELECT origin_organization_id INTO v_child_origin
    FROM child_profiles
   WHERE id = NEW.child_profile_id;

  IF v_child_origin IS NULL THEN
    RAISE EXCEPTION
      'cd_origin_consistency_validate: child_profile % is not clinic-owned (origin is NULL)',
      NEW.child_profile_id
      USING ERRCODE = '23514';
  END IF;

  IF v_child_origin <> NEW.origin_organization_id THEN
    RAISE EXCEPTION
      'cd_origin_consistency_validate: child % belongs to org %, not %',
      NEW.child_profile_id, v_child_origin, NEW.origin_organization_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cd_origin_consistency_validate_trg ON clinic_documents;
CREATE TRIGGER cd_origin_consistency_validate_trg
  BEFORE INSERT OR UPDATE OF origin_organization_id, child_profile_id ON clinic_documents
  FOR EACH ROW
  EXECUTE FUNCTION cd_origin_consistency_validate();


-- 2.B — Column-guard immutability.
-- UPDATE may NOT change origin_organization_id, child_profile_id,
-- or created_by_profile_id. is_super_admin() bypasses for support.
CREATE OR REPLACE FUNCTION cd_immutable_columns_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.origin_organization_id IS DISTINCT FROM OLD.origin_organization_id THEN
    RAISE EXCEPTION
      'cd_immutable_columns_guard: origin_organization_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.child_profile_id IS DISTINCT FROM OLD.child_profile_id THEN
    RAISE EXCEPTION
      'cd_immutable_columns_guard: child_profile_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id THEN
    RAISE EXCEPTION
      'cd_immutable_columns_guard: created_by_profile_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cd_immutable_columns_guard_trg ON clinic_documents;
CREATE TRIGGER cd_immutable_columns_guard_trg
  BEFORE UPDATE ON clinic_documents
  FOR EACH ROW
  EXECUTE FUNCTION cd_immutable_columns_guard();


-- 2.C — Normalize document_kind (Phase 6C adjustment 2).
-- Always store as LOWER(TRIM(kind)). Casing variants collapse.
CREATE OR REPLACE FUNCTION cd_normalize_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.document_kind := lower(trim(NEW.document_kind));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cd_normalize_kind_trg ON clinic_documents;
CREATE TRIGGER cd_normalize_kind_trg
  BEFORE INSERT OR UPDATE OF document_kind ON clinic_documents
  FOR EACH ROW
  EXECUTE FUNCTION cd_normalize_kind();


-- 2.D — updated_at + audit
DROP TRIGGER IF EXISTS clinic_documents_set_updated_at ON clinic_documents;
CREATE TRIGGER clinic_documents_set_updated_at
  BEFORE UPDATE ON clinic_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS clinic_documents_audit ON clinic_documents;
CREATE TRIGGER clinic_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON clinic_documents
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS clinic_document_versions_audit ON clinic_document_versions;
CREATE TRIGGER clinic_document_versions_audit
  AFTER INSERT OR UPDATE OR DELETE ON clinic_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_trigger();


-- ════════════════════════════════════════════════════════════════
-- 3. RLS — clinic_documents
-- ════════════════════════════════════════════════════════════════

ALTER TABLE clinic_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_clinic_documents"            ON clinic_documents;
DROP POLICY IF EXISTS "clinic_admin_insert_clinic_documents" ON clinic_documents;
DROP POLICY IF EXISTS "clinic_admin_update_clinic_documents" ON clinic_documents;
DROP POLICY IF EXISTS "super_admin_all_clinic_documents"   ON clinic_documents;

-- 3.A — SELECT: any active member of the origin org sees the docs
-- of their owned children. Reuses caller_owned_child_profile_ids().
CREATE POLICY "select_clinic_documents"
  ON clinic_documents
  FOR SELECT
  TO authenticated
  USING (child_profile_id = ANY(caller_owned_child_profile_ids()));

-- 3.B — INSERT: clinic_admin of origin org only.
-- created_by_profile_id pinned to auth.uid().
-- The origin/child-consistency trigger gives a second line of defence.
CREATE POLICY "clinic_admin_insert_clinic_documents"
  ON clinic_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_profile_id = auth.uid()
    AND child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  );

-- 3.C — UPDATE: clinic_admin of origin org. Column-guard trigger
-- 2.B keeps origin/child/created_by immutable; lifecycle columns
-- (title, description, status, permissions, effective_date,
-- review_date, current_version_id, document_kind) are mutable.
CREATE POLICY "clinic_admin_update_clinic_documents"
  ON clinic_documents
  FOR UPDATE
  TO authenticated
  USING (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = clinic_documents.origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  )
  WITH CHECK (
    child_profile_id = ANY(caller_owned_child_profile_ids())
    AND EXISTS (
      SELECT 1
        FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = clinic_documents.origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  );

-- DELETE — no policy → denied. Use status='archived' instead.

-- 3.D — super_admin bypass
CREATE POLICY "super_admin_all_clinic_documents"
  ON clinic_documents
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 4. RLS — clinic_document_versions
-- ════════════════════════════════════════════════════════════════

ALTER TABLE clinic_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_clinic_document_versions"            ON clinic_document_versions;
DROP POLICY IF EXISTS "clinic_admin_insert_clinic_document_versions" ON clinic_document_versions;
DROP POLICY IF EXISTS "clinic_admin_update_clinic_document_versions" ON clinic_document_versions;
DROP POLICY IF EXISTS "super_admin_all_clinic_document_versions"   ON clinic_document_versions;

-- 4.A — SELECT: piggyback on parent visibility.
CREATE POLICY "select_clinic_document_versions"
  ON clinic_document_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clinic_documents d
       WHERE d.id = clinic_document_versions.document_id
         AND d.child_profile_id = ANY(caller_owned_child_profile_ids())
    )
  );

-- 4.B — INSERT: clinic_admin of parent doc's origin.
CREATE POLICY "clinic_admin_insert_clinic_document_versions"
  ON clinic_document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM clinic_documents d
        JOIN organization_memberships om
          ON om.organization_id = d.origin_organization_id
       WHERE d.id              = clinic_document_versions.document_id
         AND d.child_profile_id = ANY(caller_owned_child_profile_ids())
         AND om.profile_id     = auth.uid()
         AND om.role           = 'clinic_admin'
         AND om.status         = 'active'
    )
  );

-- 4.C — UPDATE: clinic_admin only. Reserved for future hide-version
-- flow. v1 doesn't expose UPDATE in UI, but the policy is here so a
-- future migration that adds the trigger-based column-guard for
-- (is_hidden, hidden_reason) only doesn't need a separate policy
-- emission.
CREATE POLICY "clinic_admin_update_clinic_document_versions"
  ON clinic_document_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM clinic_documents d
        JOIN organization_memberships om
          ON om.organization_id = d.origin_organization_id
       WHERE d.id          = clinic_document_versions.document_id
         AND om.profile_id = auth.uid()
         AND om.role       = 'clinic_admin'
         AND om.status     = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM clinic_documents d
        JOIN organization_memberships om
          ON om.organization_id = d.origin_organization_id
       WHERE d.id          = clinic_document_versions.document_id
         AND om.profile_id = auth.uid()
         AND om.role       = 'clinic_admin'
         AND om.status     = 'active'
    )
  );

-- DELETE — no policy → denied.

CREATE POLICY "super_admin_all_clinic_document_versions"
  ON clinic_document_versions
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 5. RLS — clinic_document_access_events
-- ════════════════════════════════════════════════════════════════

ALTER TABLE clinic_document_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_clinic_document_access_events"      ON clinic_document_access_events;
DROP POLICY IF EXISTS "super_admin_all_clinic_document_access_events" ON clinic_document_access_events;

-- 5.A — SELECT: clinic_admin of origin org only.
-- Non-admin members do not see audit history in v1.
CREATE POLICY "select_clinic_document_access_events"
  ON clinic_document_access_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM organization_memberships om
       WHERE om.profile_id      = auth.uid()
         AND om.organization_id = clinic_document_access_events.origin_organization_id
         AND om.role            = 'clinic_admin'
         AND om.status          = 'active'
    )
  );

-- INSERT/UPDATE/DELETE — no policy → denied. Only the SECURITY DEFINER
-- RPC log_clinic_document_access writes here.

CREATE POLICY "super_admin_all_clinic_document_access_events"
  ON clinic_document_access_events
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ════════════════════════════════════════════════════════════════
-- 6. STORAGE BUCKET + POLICIES (clinic-documents)
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-documents',
  'clinic-documents',
  false,
  26214400,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- Storage path layout:
--   clinic-documents/{origin_organization_id}/{child_profile_id}/{document_id}/v{n}.{ext}
--   foldername(name)[1] = origin_organization_id
--   foldername(name)[2] = child_profile_id
--   foldername(name)[3] = document_id

-- Storage RLS cannot directly call caller_owned_child_profile_ids()
-- because the caller's role on the path's org is the discriminator
-- we need (clinic_admin can write; non-admin can not). The simplest
-- safe predicate is: caller has an active clinic_admin membership in
-- the path's first segment (the origin org).
DROP POLICY IF EXISTS "clinic_documents_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "clinic_documents_admin_update" ON storage.objects;

CREATE POLICY "clinic_documents_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'clinic-documents'
  AND EXISTS (
    SELECT 1
      FROM organization_memberships om
      JOIN organizations o ON o.id = om.organization_id
     WHERE om.organization_id = (storage.foldername(name))[1]::uuid
       AND om.profile_id      = auth.uid()
       AND om.role            = 'clinic_admin'
       AND om.status          = 'active'
       AND o.kind             IN ('clinic','medical_practice')
  )
);

CREATE POLICY "clinic_documents_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'clinic-documents'
  AND EXISTS (
    SELECT 1
      FROM organization_memberships om
      JOIN organizations o ON o.id = om.organization_id
     WHERE om.organization_id = (storage.foldername(name))[1]::uuid
       AND om.profile_id      = auth.uid()
       AND om.role            = 'clinic_admin'
       AND om.status          = 'active'
       AND o.kind             IN ('clinic','medical_practice')
  )
);

-- DELETE / SELECT — NO CLIENT POLICY. Service role mints signed URLs
-- after RPC approval. Any cleanup of orphaned blobs is super-admin-
-- only via SQL.


-- ════════════════════════════════════════════════════════════════
-- 7. RPC — log_clinic_document_access
--
-- Twin of log_document_access_for_organizations (5B) but for the
-- clinic-internal upload path. Atomic decision + audit. Returns
-- metadata; the API route mints the signed URL via service-role.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_clinic_document_access(
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
  v_uid             UUID := auth.uid();
  v_doc             clinic_documents%ROWTYPE;
  v_ver             clinic_document_versions%ROWTYPE;
  v_role            TEXT;
  v_actor_role      TEXT;
  v_can_download    BOOLEAN;
  v_denied          TEXT;
  v_action          TEXT;
  v_perm_view       BOOLEAN;
  v_perm_download   BOOLEAN;
BEGIN
  -- Action whitelist — same as 5B.
  v_action := COALESCE(p_action, '');
  IF v_action NOT IN ('signed_url_issued','preview_opened','download') THEN
    RAISE EXCEPTION
      'log_clinic_document_access: invalid action %', v_action
      USING ERRCODE = '22023';
  END IF;

  -- Auth gate.
  IF v_uid IS NULL THEN
    INSERT INTO clinic_document_access_events
      (document_id, action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, 'access_denied', 'unauthenticated', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'unauthenticated',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Super_admin path: deny on the clinic-portal route. Super-admins
  -- use SQL editor for support reads; this matches 5B's posture.
  IF is_super_admin() THEN
    INSERT INTO clinic_document_access_events
      (document_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, NULL, v_uid, 'super_admin',
              'access_denied', 'super_admin_not_supported_here', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'super_admin_not_supported_here',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Resolve the doc.
  SELECT * INTO v_doc FROM clinic_documents WHERE id = p_doc_id;
  IF v_doc.id IS NULL THEN
    INSERT INTO clinic_document_access_events
      (document_id, actor_user_id, action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_uid, 'access_denied', 'doc_not_found', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'doc_not_found',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Membership lookup — must be active member of origin org.
  SELECT om.role INTO v_role
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.organization_id
   WHERE om.organization_id = v_doc.origin_organization_id
     AND om.profile_id      = v_uid
     AND om.status          = 'active'
     AND o.kind             IN ('clinic','medical_practice');

  IF v_role IS NULL THEN
    INSERT INTO clinic_document_access_events
      (document_id, origin_organization_id, actor_user_id,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_doc.origin_organization_id, v_uid,
              'access_denied', 'not_owned', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'not_owned',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;
  v_actor_role := v_role;

  -- Doc lifecycle gate.
  IF v_doc.status = 'archived' THEN
    INSERT INTO clinic_document_access_events
      (document_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_doc.origin_organization_id, v_uid, v_actor_role,
              'access_denied', 'doc_archived', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'doc_archived',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Resolve the visible current version.
  IF v_doc.current_version_id IS NULL THEN
    INSERT INTO clinic_document_access_events
      (document_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_doc.origin_organization_id, v_uid, v_actor_role,
              'access_denied', 'no_visible_version', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'no_visible_version',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  SELECT * INTO v_ver
    FROM clinic_document_versions
   WHERE id = v_doc.current_version_id
     AND is_hidden = FALSE;

  IF v_ver.id IS NULL THEN
    INSERT INTO clinic_document_access_events
      (document_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_doc.origin_organization_id, v_uid, v_actor_role,
              'access_denied', 'no_visible_version', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'no_visible_version',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Permission gate. Admins can always download; non-admins need the
  -- doc's permissions.download flag.
  v_perm_view     := COALESCE((v_doc.permissions->>'view')::boolean, FALSE);
  v_perm_download := COALESCE((v_doc.permissions->>'download')::boolean, FALSE);

  IF NOT v_perm_view THEN
    INSERT INTO clinic_document_access_events
      (document_id, version_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_ver.id, v_doc.origin_organization_id, v_uid, v_actor_role,
              'access_denied', 'view_not_permitted', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'view_not_permitted',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  v_can_download := v_actor_role = 'clinic_admin' OR v_perm_download;
  IF v_action = 'download' AND NOT v_can_download THEN
    INSERT INTO clinic_document_access_events
      (document_id, version_id, origin_organization_id, actor_user_id, actor_role,
       action, denied_reason, ip_address, user_agent)
      VALUES (p_doc_id, v_ver.id, v_doc.origin_organization_id, v_uid, v_actor_role,
              'access_denied', 'download_not_permitted', p_ip, p_user_agent);
    RETURN jsonb_build_object(
      'allowed', false,
      'denied_reason', 'download_not_permitted',
      'storage_path', NULL,
      'mime_type', NULL,
      'current_version_id', NULL,
      'version_number', NULL,
      'signed_url_ttl_seconds', 60
    );
  END IF;

  -- Allowed. Record the event with the originally-requested action.
  INSERT INTO clinic_document_access_events
    (document_id, version_id, origin_organization_id, actor_user_id, actor_role,
     action, ip_address, user_agent)
    VALUES (p_doc_id, v_ver.id, v_doc.origin_organization_id, v_uid, v_actor_role,
            v_action, p_ip, p_user_agent);

  RETURN jsonb_build_object(
    'allowed', true,
    'denied_reason', NULL,
    'storage_path', v_ver.storage_path,
    'mime_type', v_ver.mime_type,
    'current_version_id', v_ver.id,
    'version_number', v_ver.version_number,
    'signed_url_ttl_seconds', 60
  );
END;
$$;

REVOKE ALL ON FUNCTION log_clinic_document_access(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_clinic_document_access(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION log_clinic_document_access(UUID, TEXT, TEXT, TEXT) IS
  'Phase 6C — atomic decision + audit for clinic-internal document access. Twin of log_document_access_for_organizations (5B). Returns metadata only; signed URL is minted by service-role in the API route.';


-- ============================================================
-- End of Migration 081
-- ============================================================
