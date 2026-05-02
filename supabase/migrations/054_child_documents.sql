-- ============================================================
-- Migration 054 – Child Document Coordination (Phase A: schema)
--
-- Scope of this migration:
--   1. Enums                  (4 new types)
--   2. Tables                 (7 new tables)
--   3. Constraints            (CHECK + UNIQUE + FK)
--   4. Indexes
--   5. Triggers               (audit, updated_at, integrity)
--
-- DELIBERATELY OUT OF SCOPE for this migration (later phases):
--   - RLS policies              (RLS is ENABLED here so tables default-deny;
--                                 client policies land in Phase B)
--   - SECURITY DEFINER RPCs     (e.g. log_document_access, accessible_document_ids)
--   - Storage bucket creation   (child-documents bucket lands with its policies)
--   - super_admin bypass        (intentionally NOT added — strict no-default-access)
--
-- Storage path convention (for reference; bucket is created in a later phase):
--   child-documents/{school_id}/{student_id}/{document_id}/v{version_number}{ext}
--
-- Versioning model: chain/head.
--   child_documents          = stable head (logical document)
--   child_document_versions  = one row per uploaded file
--   child_documents.current_version_id points at the latest non-hidden version.
--   Grants and consents reference the head only.
--
-- Reused project-wide helpers:
--   set_updated_at()          — maintains updated_at
--   audit_log_trigger()       — DML audit into audit_logs
--
-- Storage of file metadata: uploaded_files (existing table) is referenced from
-- child_document_versions.uploaded_file_id. Insertion into uploaded_files is
-- the responsibility of the upload code path; the FK here is best-effort.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ════════════════════════════════════════════════════════════════
-- Only workflow-critical values get enums. Discriminator values that may
-- evolve (grantee_kind, recipient type inside JSONB, actor_kind, action,
-- source_kind) use TEXT + CHECK so they can be extended without DDL churn.

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'iep',
    'therapy_evaluation',
    'therapy_progress',
    'school_accommodation',
    'medical_certificate',
    'dev_pediatrician_report',
    'parent_provided',
    'other_supporting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM (
    'draft', 'active', 'shared', 'archived', 'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consent_status AS ENUM (
    'pending', 'granted', 'revoked', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM (
    'requested', 'submitted', 'reviewed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 2.1 external_contacts
-- Doctors, therapists, clinic staff. NOT auth users — identified by email.
-- ALWAYS scoped by school_id (per design); the same person at two schools
-- is two rows in v1. Email is normalized to lowercase by trigger.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_contacts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  full_name         TEXT        NOT NULL,
  email             TEXT        NOT NULL,
  organization_name TEXT,
  role_title        TEXT,
  phone             TEXT,
  notes             TEXT,
  deactivated_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_contacts_email_nonempty CHECK (length(btrim(email)) > 0)
);


-- ─────────────────────────────────────────────────────────────────
-- 2.2 child_documents (the head — stable id used by grants/consents/requests)
-- The FK to child_document_versions.id (current_version_id) is added AFTER
-- the versions table is created (circular dependency).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_documents (
  id                          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                   UUID            NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id                  UUID            NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  document_type               document_type   NOT NULL,
  title                       TEXT            NOT NULL,
  description                 TEXT,
  status                      document_status NOT NULL DEFAULT 'draft',
  effective_date              DATE,
  review_date                 DATE,
  -- 'school' = originated within this tenant
  -- 'external_contact' = originated from a known external_contacts row
  -- 'parent' = uploaded by a guardian
  source_kind                 TEXT            NOT NULL DEFAULT 'school',
  source_external_contact_id  UUID            REFERENCES external_contacts(id) ON DELETE SET NULL,
  source_label                TEXT,
  current_version_id          UUID,           -- FK added later (circular)
  created_by                  UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at                 TIMESTAMPTZ,
  archive_reason              TEXT,
  revoked_at                  TIMESTAMPTZ,
  revoke_reason               TEXT,
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT child_documents_source_kind_chk
    CHECK (source_kind IN ('school','external_contact','parent')),
  -- Drafts may have no version yet; any non-draft must have a current version.
  CONSTRAINT child_documents_current_version_required_chk
    CHECK (status = 'draft' OR current_version_id IS NOT NULL),
  -- Source attribution must be consistent with source_kind.
  CONSTRAINT child_documents_source_consistency_chk
    CHECK (
      (source_kind = 'external_contact' AND source_external_contact_id IS NOT NULL)
      OR
      (source_kind <> 'external_contact' AND source_external_contact_id IS NULL)
    )
);


-- ─────────────────────────────────────────────────────────────────
-- 2.3 child_document_versions
-- One row per uploaded file. version_number is unique per document.
-- school_id denormalized from the head for index-only RLS in Phase B.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_document_versions (
  id                                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id                       UUID         NOT NULL REFERENCES child_documents(id) ON DELETE RESTRICT,
  school_id                         UUID         NOT NULL REFERENCES schools(id)         ON DELETE CASCADE,
  version_number                    INT          NOT NULL CHECK (version_number > 0),
  uploaded_file_id                  UUID         REFERENCES uploaded_files(id) ON DELETE SET NULL,
  storage_path                      TEXT         NOT NULL,
  file_name                         TEXT,
  file_size                         BIGINT       CHECK (file_size IS NULL OR file_size >= 0),
  mime_type                         TEXT,
  uploaded_by_user_id               UUID         REFERENCES profiles(id)          ON DELETE SET NULL,
  uploaded_by_external_contact_id   UUID         REFERENCES external_contacts(id) ON DELETE SET NULL,
  -- Snapshot of the role at upload time. Stable in audit even if the user is later
  -- demoted. Validated in CHECK below — extend list when adding new uploader kinds.
  uploaded_by_kind                  TEXT         NOT NULL,
  upload_note                       TEXT,
  is_hidden                         BOOLEAN      NOT NULL DEFAULT FALSE,
  hidden_reason                     TEXT,
  hidden_at                         TIMESTAMPTZ,
  created_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT child_document_versions_uploaded_by_kind_chk
    CHECK (uploaded_by_kind IN ('school_admin','teacher','parent','external_contact')),
  -- Exactly one of (user, external_contact) populated, matching uploaded_by_kind.
  CONSTRAINT child_document_versions_uploader_one_of_chk
    CHECK (
      (uploaded_by_kind = 'external_contact'
        AND uploaded_by_external_contact_id IS NOT NULL
        AND uploaded_by_user_id             IS NULL)
      OR
      (uploaded_by_kind <> 'external_contact'
        AND uploaded_by_user_id             IS NOT NULL
        AND uploaded_by_external_contact_id IS NULL)
    ),
  -- hidden_* fields move together
  CONSTRAINT child_document_versions_hidden_consistency_chk
    CHECK (
      (is_hidden = FALSE AND hidden_at IS NULL  AND hidden_reason IS NULL)
      OR
      (is_hidden = TRUE  AND hidden_at IS NOT NULL)
    ),
  -- storage_path uniqueness across the table prevents accidental overwrites
  CONSTRAINT child_document_versions_storage_path_unique
    UNIQUE (storage_path),
  -- one row per (document, version_number)
  CONSTRAINT child_document_versions_doc_version_unique
    UNIQUE (document_id, version_number)
);


-- ── Add the deferred head→version FK now that both tables exist ─────────────
ALTER TABLE child_documents
  ADD CONSTRAINT child_documents_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES child_document_versions(id)
  ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────
-- 2.4 document_consents
-- Source of truth: granted_by_guardian_id (NOT email).
-- scope and recipients are JSONB with shape validated by trigger
-- (CHECK can only verify the top-level 'type' key cheaply).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_consents (
  id                          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                   UUID            NOT NULL REFERENCES schools(id)   ON DELETE CASCADE,
  student_id                  UUID            NOT NULL REFERENCES students(id)  ON DELETE RESTRICT,
  granted_by_guardian_id      UUID            REFERENCES guardians(id)          ON DELETE RESTRICT,
  purpose                     TEXT            NOT NULL,
  -- scope object: { "type":"document",         "document_id":"<uuid>" }
  --             | { "type":"document_type",    "document_type":"iep" }
  --             | { "type":"all_for_student" }
  scope                       JSONB           NOT NULL,
  -- recipients array (non-empty), each element:
  --   { "type":"school",           "school_id":"<uuid>" }
  -- | { "type":"school_user",      "school_id":"<uuid>", "user_id":"<uuid>" }
  -- | { "type":"external_contact", "external_contact_id":"<uuid>",
  --                                "email":"doctor@example.com" }   -- email optional
  recipients                  JSONB           NOT NULL,
  allow_download              BOOLEAN         NOT NULL DEFAULT FALSE,
  allow_reshare               BOOLEAN         NOT NULL DEFAULT FALSE,
  status                      consent_status  NOT NULL DEFAULT 'pending',
  starts_at                   TIMESTAMPTZ,
  expires_at                  TIMESTAMPTZ     NOT NULL,
  granted_at                  TIMESTAMPTZ,
  revoked_at                  TIMESTAMPTZ,
  revoked_by_guardian_id      UUID            REFERENCES guardians(id) ON DELETE RESTRICT,
  revoke_reason               TEXT,
  requested_by_user_id        UUID            REFERENCES profiles(id)  ON DELETE SET NULL,
  request_message             TEXT,
  created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Cheap top-level shape gates; deep validation happens in the trigger.
  CONSTRAINT document_consents_scope_shape_chk
    CHECK (
      jsonb_typeof(scope) = 'object'
      AND scope ? 'type'
      AND scope->>'type' IN ('document','document_type','all_for_student')
    ),
  CONSTRAINT document_consents_recipients_shape_chk
    CHECK (
      jsonb_typeof(recipients) = 'array'
      AND jsonb_array_length(recipients) > 0
    ),
  -- A 'granted' consent must record who granted it and when.
  CONSTRAINT document_consents_granted_completeness_chk
    CHECK (
      status <> 'granted'
      OR (granted_by_guardian_id IS NOT NULL AND granted_at IS NOT NULL)
    ),
  -- A 'revoked' consent must record who and why.
  CONSTRAINT document_consents_revoked_completeness_chk
    CHECK (
      status <> 'revoked'
      OR (revoked_at IS NOT NULL AND revoked_by_guardian_id IS NOT NULL)
    ),
  -- starts_at, if set, must precede expires_at.
  CONSTRAINT document_consents_dates_chk
    CHECK (starts_at IS NULL OR starts_at < expires_at)
);


-- ─────────────────────────────────────────────────────────────────
-- 2.5 document_access_grants — points at the head (access follows latest version)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_access_grants (
  id                                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id                       UUID         NOT NULL REFERENCES child_documents(id)    ON DELETE CASCADE,
  school_id                         UUID         NOT NULL REFERENCES schools(id)            ON DELETE CASCADE,
  -- NULL only for in-school internal grants (school_admin/teacher of the originating school).
  consent_id                        UUID         REFERENCES document_consents(id)           ON DELETE RESTRICT,
  grantee_kind                      TEXT         NOT NULL,
  grantee_school_id                 UUID         REFERENCES schools(id)                     ON DELETE CASCADE,
  grantee_user_id                   UUID         REFERENCES profiles(id)                    ON DELETE CASCADE,
  grantee_external_contact_id       UUID         REFERENCES external_contacts(id)           ON DELETE CASCADE,
  -- Permission booleans live in JSONB for forward-compat (e.g. add 'export' later).
  permissions                       JSONB        NOT NULL DEFAULT
    '{"view":true,"download":false,"comment":false,"upload_new_version":false}'::jsonb,
  expires_at                        TIMESTAMPTZ  NOT NULL,
  revoked_at                        TIMESTAMPTZ,
  revoked_by                        UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  revoke_reason                     TEXT,
  created_by                        UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT document_access_grants_grantee_kind_chk
    CHECK (grantee_kind IN ('school','school_user','external_contact')),
  -- Exactly one grantee_* FK populated, matching grantee_kind.
  CONSTRAINT document_access_grants_grantee_one_of_chk
    CHECK (
      (grantee_kind = 'school'
        AND grantee_school_id           IS NOT NULL
        AND grantee_user_id             IS NULL
        AND grantee_external_contact_id IS NULL)
      OR
      (grantee_kind = 'school_user'
        AND grantee_user_id             IS NOT NULL
        AND grantee_school_id           IS NULL
        AND grantee_external_contact_id IS NULL)
      OR
      (grantee_kind = 'external_contact'
        AND grantee_external_contact_id IS NOT NULL
        AND grantee_school_id           IS NULL
        AND grantee_user_id             IS NULL)
    ),
  -- External grants ALWAYS require a consent. Cross-school user grants also
  -- require consent; this is enforced in the trigger because it needs a join
  -- against profiles.school_id which CHECK cannot do.
  CONSTRAINT document_access_grants_external_requires_consent_chk
    CHECK (
      grantee_kind <> 'external_contact'
      OR consent_id IS NOT NULL
    ),
  -- Permissions JSONB top-level gate; deeper field types validated in trigger.
  CONSTRAINT document_access_grants_permissions_shape_chk
    CHECK (jsonb_typeof(permissions) = 'object'),
  -- revoke_* fields move together.
  CONSTRAINT document_access_grants_revoke_consistency_chk
    CHECK (
      (revoked_at IS NULL  AND revoked_by IS NULL)
      OR
      (revoked_at IS NOT NULL)
    )
);


-- ─────────────────────────────────────────────────────────────────
-- 2.6 document_requests — the "request a document" workflow
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_requests (
  id                                       UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                                UUID            NOT NULL REFERENCES schools(id)   ON DELETE CASCADE,
  student_id                               UUID            NOT NULL REFERENCES students(id)  ON DELETE RESTRICT,
  requested_document_type                  document_type   NOT NULL,
  requester_user_id                        UUID            REFERENCES profiles(id)          ON DELETE SET NULL,
  requester_external_contact_id            UUID            REFERENCES external_contacts(id) ON DELETE SET NULL,
  requested_from_kind                      TEXT            NOT NULL,
  requested_from_school_id                 UUID            REFERENCES schools(id)           ON DELETE SET NULL,
  requested_from_external_contact_id       UUID            REFERENCES external_contacts(id) ON DELETE SET NULL,
  requested_from_guardian_id               UUID            REFERENCES guardians(id)         ON DELETE SET NULL,
  reason                                   TEXT            NOT NULL,
  due_date                                 DATE,
  status                                   request_status  NOT NULL DEFAULT 'requested',
  fulfilled_with_document_id               UUID            REFERENCES child_documents(id)   ON DELETE SET NULL,
  cancelled_at                             TIMESTAMPTZ,
  cancelled_reason                         TEXT,
  created_at                               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT document_requests_requested_from_kind_chk
    CHECK (requested_from_kind IN ('parent','school','external_contact')),
  -- Exactly one requester_* set (caller is either an internal user or external contact).
  CONSTRAINT document_requests_requester_one_of_chk
    CHECK (
      (requester_user_id IS NOT NULL AND requester_external_contact_id IS NULL)
      OR
      (requester_user_id IS NULL AND requester_external_contact_id IS NOT NULL)
    ),
  -- Exactly one requested_from_* matching requested_from_kind.
  CONSTRAINT document_requests_requested_from_one_of_chk
    CHECK (
      (requested_from_kind = 'parent'
        AND requested_from_guardian_id        IS NOT NULL
        AND requested_from_school_id          IS NULL
        AND requested_from_external_contact_id IS NULL)
      OR
      (requested_from_kind = 'school'
        AND requested_from_school_id          IS NOT NULL
        AND requested_from_guardian_id        IS NULL
        AND requested_from_external_contact_id IS NULL)
      OR
      (requested_from_kind = 'external_contact'
        AND requested_from_external_contact_id IS NOT NULL
        AND requested_from_school_id          IS NULL
        AND requested_from_guardian_id        IS NULL)
    ),
  -- 'submitted' requests must point at the document they were fulfilled with.
  CONSTRAINT document_requests_submitted_completeness_chk
    CHECK (
      status <> 'submitted'
      OR fulfilled_with_document_id IS NOT NULL
    ),
  -- 'cancelled' requests must record when.
  CONSTRAINT document_requests_cancelled_completeness_chk
    CHECK (
      status <> 'cancelled'
      OR cancelled_at IS NOT NULL
    )
);


-- ─────────────────────────────────────────────────────────────────
-- 2.7 document_access_events — view/download audit (RPC-write only in Phase B)
-- This table is INSERT-only via SECURITY DEFINER RPC (added in a later phase).
-- No client write policy will ever exist. RLS is enabled below; SELECT policies
-- land in Phase B. Note: NO FK on document_id — events outlive deletion for audit.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_access_events (
  id                          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id                 UUID         NOT NULL,                                 -- soft pointer (no FK)
  document_version_id         UUID,                                                  -- soft pointer (no FK)
  student_id                  UUID         NOT NULL,                                 -- denormalized for parent-visibility
  school_id                   UUID         NOT NULL REFERENCES schools(id)            ON DELETE CASCADE,
  actor_user_id               UUID         REFERENCES profiles(id)                    ON DELETE SET NULL,
  actor_external_contact_id   UUID         REFERENCES external_contacts(id)           ON DELETE SET NULL,
  actor_email                 TEXT,
  actor_kind                  TEXT         NOT NULL,
  action                      TEXT         NOT NULL,
  denied_reason               TEXT,
  ip                          TEXT,
  user_agent                  TEXT,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT document_access_events_actor_kind_chk
    CHECK (actor_kind IN ('school_admin','teacher','parent','external_contact')),
  CONSTRAINT document_access_events_action_chk
    CHECK (action IN ('view','download','signed_url_issued','preview_opened','access_denied')),
  CONSTRAINT document_access_events_denied_reason_chk
    CHECK (action <> 'access_denied' OR denied_reason IS NOT NULL)
);


-- ════════════════════════════════════════════════════════════════
-- Enable RLS on all 7 new tables.
-- DEFAULT-DENY until Phase B writes the policies. This is intentional:
-- it prevents accidental open access during interim development.
-- ════════════════════════════════════════════════════════════════
ALTER TABLE external_contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_document_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_consents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_grants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_events   ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════
-- 3. CONSTRAINTS
-- (Most CHECK and FK constraints are inline in section 2.
--  Only constraints that need to be added separately appear here.)
-- ════════════════════════════════════════════════════════════════

-- external_contacts uniqueness uses lower(email) per design.
-- Implemented as a UNIQUE INDEX (expression indexes can't be CONSTRAINT UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_external_contacts_school_email
  ON external_contacts (school_id, lower(email));


-- ════════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ════════════════════════════════════════════════════════════════

-- ── external_contacts ─────────────────────────────────────────────
-- Lower(email) lookup for resolving the JWT email → contact rows.
CREATE INDEX IF NOT EXISTS idx_external_contacts_lower_email
  ON external_contacts (lower(email)) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_external_contacts_school
  ON external_contacts (school_id) WHERE deactivated_at IS NULL;

-- ── child_documents ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_child_documents_school_student
  ON child_documents (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_child_documents_student_status
  ON child_documents (student_id, status);
CREATE INDEX IF NOT EXISTS idx_child_documents_school_status_type
  ON child_documents (school_id, status, document_type);
-- Drives the "expiring soon" query in the workspace UI.
CREATE INDEX IF NOT EXISTS idx_child_documents_review_date
  ON child_documents (review_date) WHERE review_date IS NOT NULL;

-- ── child_document_versions ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_child_document_versions_doc_version
  ON child_document_versions (document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_child_document_versions_uploaded_file
  ON child_document_versions (uploaded_file_id) WHERE uploaded_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_child_document_versions_school_visible
  ON child_document_versions (school_id) WHERE is_hidden = FALSE;

-- ── document_consents ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_document_consents_student_status
  ON document_consents (student_id, status);
CREATE INDEX IF NOT EXISTS idx_document_consents_school_status
  ON document_consents (school_id, status);
-- Drives the consent-expiry sweep (Phase 2 cron).
CREATE INDEX IF NOT EXISTS idx_document_consents_expiring_granted
  ON document_consents (expires_at) WHERE status = 'granted';
-- GIN index on recipients enables JSONB containment / element scans without seqscan.
CREATE INDEX IF NOT EXISTS idx_document_consents_recipients_gin
  ON document_consents USING GIN (recipients jsonb_path_ops);

-- ── document_access_grants ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_document_access_grants_doc_active
  ON document_access_grants (document_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_access_grants_user_active
  ON document_access_grants (grantee_user_id) WHERE revoked_at IS NULL AND grantee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_access_grants_extcontact_active
  ON document_access_grants (grantee_external_contact_id) WHERE revoked_at IS NULL AND grantee_external_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_access_grants_school_active
  ON document_access_grants (grantee_school_id) WHERE revoked_at IS NULL AND grantee_school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_access_grants_consent
  ON document_access_grants (consent_id) WHERE consent_id IS NOT NULL;
-- Drives the grant-expiry sweep.
CREATE INDEX IF NOT EXISTS idx_document_access_grants_expiring
  ON document_access_grants (expires_at) WHERE revoked_at IS NULL;

-- ── document_requests ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_document_requests_school_status
  ON document_requests (school_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requests_student_status
  ON document_requests (student_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requests_requested_from_guardian
  ON document_requests (requested_from_guardian_id) WHERE requested_from_guardian_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_requests_requested_from_extcontact
  ON document_requests (requested_from_external_contact_id) WHERE requested_from_external_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_requests_due_open
  ON document_requests (due_date) WHERE status IN ('requested','submitted');

-- ── document_access_events ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_document_access_events_document_time
  ON document_access_events (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_events_student_time
  ON document_access_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_events_school_time
  ON document_access_events (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_events_actor_time
  ON document_access_events (actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_access_events_extcontact_time
  ON document_access_events (actor_external_contact_id, created_at DESC) WHERE actor_external_contact_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════
-- 5. TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 5.A updated_at maintenance — reuses existing set_updated_at()
-- ─────────────────────────────────────────────────────────────────
CREATE TRIGGER set_external_contacts_updated_at
  BEFORE UPDATE ON external_contacts
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_child_documents_updated_at
  BEFORE UPDATE ON child_documents
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_document_consents_updated_at
  BEFORE UPDATE ON document_consents
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_document_requests_updated_at
  BEFORE UPDATE ON document_requests
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
-- (child_document_versions, document_access_grants, document_access_events are
--  effectively immutable rows — no updated_at column.)


-- ─────────────────────────────────────────────────────────────────
-- 5.B DML audit — reuses existing audit_log_trigger()
-- Skipped on document_access_events (it IS an audit table; double-logging adds
-- noise without value).
-- ─────────────────────────────────────────────────────────────────
CREATE TRIGGER audit_external_contacts
  AFTER INSERT OR UPDATE OR DELETE ON external_contacts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_child_documents
  AFTER INSERT OR UPDATE OR DELETE ON child_documents
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_child_document_versions
  AFTER INSERT OR UPDATE OR DELETE ON child_document_versions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_document_consents
  AFTER INSERT OR UPDATE OR DELETE ON document_consents
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_document_access_grants
  AFTER INSERT OR UPDATE OR DELETE ON document_access_grants
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_document_requests
  AFTER INSERT OR UPDATE OR DELETE ON document_requests
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ─────────────────────────────────────────────────────────────────
-- 5.C external_contacts: normalize email to lowercase
-- Together with the UNIQUE INDEX on (school_id, lower(email)) this guarantees
-- email comparisons against auth.jwt()->>'email' are deterministic.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION external_contacts_normalize_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_external_contacts_normalize_email
  BEFORE INSERT OR UPDATE OF email ON external_contacts
  FOR EACH ROW EXECUTE FUNCTION external_contacts_normalize_email();


-- ─────────────────────────────────────────────────────────────────
-- 5.D child_documents.current_version_id integrity
-- Enforces:
--   - the referenced version exists,
--   - belongs to THIS document,
--   - is NOT hidden.
-- This complements the FK and the CHECK that requires a version on non-draft docs.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION child_documents_validate_current_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_doc_id UUID;
  v_hidden BOOLEAN;
BEGIN
  IF NEW.current_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT document_id, is_hidden
    INTO v_doc_id, v_hidden
    FROM child_document_versions
    WHERE id = NEW.current_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_version_id % does not exist', NEW.current_version_id;
  END IF;

  IF v_doc_id <> NEW.id THEN
    RAISE EXCEPTION
      'current_version_id % belongs to document % (not %)', NEW.current_version_id, v_doc_id, NEW.id;
  END IF;

  IF v_hidden THEN
    RAISE EXCEPTION
      'current_version_id % points to a hidden version; choose a visible version', NEW.current_version_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_child_documents_validate_current_version
  BEFORE INSERT OR UPDATE OF current_version_id ON child_documents
  FOR EACH ROW EXECUTE FUNCTION child_documents_validate_current_version();


-- ─────────────────────────────────────────────────────────────────
-- 5.E child_document_versions: handle is_hidden flip
-- When a version is being marked hidden:
--   1. If it is the head's current_version_id, repoint the head to the latest
--      remaining non-hidden version of that document (if any).
--   2. If no non-hidden version remains AND the document is not 'draft',
--      reject the hide — caller must upload a replacement first.
-- Sets hidden_at automatically when not supplied.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION child_document_versions_handle_hide()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_replacement_id UUID;
  v_doc_status     document_status;
  v_doc_current    UUID;
BEGIN
  -- Default hidden_at when caller marks hidden but forgets the timestamp.
  IF NEW.is_hidden = TRUE AND NEW.hidden_at IS NULL THEN
    NEW.hidden_at := NOW();
  END IF;

  -- Only act on the FALSE → TRUE transition.
  IF TG_OP = 'UPDATE'
     AND NEW.is_hidden = TRUE
     AND OLD.is_hidden = FALSE
  THEN
    SELECT status, current_version_id
      INTO v_doc_status, v_doc_current
      FROM child_documents
      WHERE id = NEW.document_id
      FOR UPDATE;

    -- Find the next-best visible version (excluding this one).
    SELECT id INTO v_replacement_id
      FROM child_document_versions
      WHERE document_id = NEW.document_id
        AND id <> NEW.id
        AND is_hidden = FALSE
      ORDER BY version_number DESC
      LIMIT 1;

    IF v_replacement_id IS NULL AND v_doc_status <> 'draft' THEN
      RAISE EXCEPTION
        'cannot hide the only visible version of a non-draft document % — upload a replacement first',
        NEW.document_id;
    END IF;

    -- If this row was the head's current pointer, repoint it.
    -- (NULLs are allowed only on draft documents per the head's CHECK.)
    IF v_doc_current = NEW.id THEN
      UPDATE child_documents
        SET current_version_id = v_replacement_id
        WHERE id = NEW.document_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_child_document_versions_handle_hide
  BEFORE UPDATE OF is_hidden ON child_document_versions
  FOR EACH ROW EXECUTE FUNCTION child_document_versions_handle_hide();


-- ─────────────────────────────────────────────────────────────────
-- 5.F document_consents: deep validation of scope and recipients
-- Verifies:
--   - scope object has the field appropriate to its 'type'
--   - scope.document_id (if present) references this consent's school+student
--   - scope.document_type (if present) matches the document_type enum
--   - recipients is a non-empty array; each element has 'type' + matching FK
--   - referenced FKs exist and (for school_user / external_contact) are
--     properly scoped to a school
--   - if recipient.type = 'external_contact', the contact must belong to the
--     consent's school (NEVER cross-school by accident)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_consents_validate_jsonb()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    -- Cast through the enum to validate the value.
    BEGIN
      PERFORM (NEW.scope->>'document_type')::document_type;
    EXCEPTION WHEN invalid_text_representation OR others THEN
      RAISE EXCEPTION 'scope.document_type ''%'' is not a valid document_type', NEW.scope->>'document_type';
    END;

  ELSIF v_scope_type = 'all_for_student' THEN
    -- No additional fields required.
    NULL;

  ELSE
    -- The CHECK should have prevented this, but guard anyway.
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
      -- HARD INVARIANT: external contact must belong to this consent's school.
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

CREATE TRIGGER trg_document_consents_validate_jsonb
  BEFORE INSERT OR UPDATE OF scope, recipients, school_id, student_id
  ON document_consents
  FOR EACH ROW EXECUTE FUNCTION document_consents_validate_jsonb();


-- ─────────────────────────────────────────────────────────────────
-- 5.G document_access_grants: enforce consent invariants on insert/update
-- This is the choke point. A grant cannot be active unless ALL of:
--   - the document & grant tenant agree (school_id columns match document.school_id)
--   - cross-school school_user grants carry a consent_id
--   - if consent_id is set:
--       consent.status = 'granted'
--       consent.expires_at > now()
--       consent scope covers this document
--           ('document' → matches document_id;
--            'document_type' → matches document.document_type AND consent.student_id;
--            'all_for_student' → matches consent.student_id)
--       consent recipients array contains an element identifying THIS grantee
--           (FIELD-BASED match — only the id field for the relevant kind is compared;
--            extra fields like email or school_id are NOT required to match)
--       grant.expires_at <= consent.expires_at
-- Refusal raises an exception (the INSERT/UPDATE is rolled back).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_access_grants_enforce_invariants()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

    -- Grant expiry must not exceed consent expiry.
    IF NEW.expires_at > v_consent.expires_at THEN
      RAISE EXCEPTION
        'grant.expires_at (%) must be <= consent.expires_at (%)',
        NEW.expires_at, v_consent.expires_at;
    END IF;

    -- Tenant: consent must agree with the document.
    IF v_consent.school_id <> v_doc_school OR v_consent.student_id <> v_doc_student THEN
      RAISE EXCEPTION
        'consent does not belong to the document''s school/student';
    END IF;

    -- Scope covers this document?
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
      -- Already verified via consent.student_id = document.student_id above.
      NULL;
    ELSE
      RAISE EXCEPTION 'consent has unsupported scope.type ''%''', v_scope_type;
    END IF;

    -- Recipients: FIELD-BASED match on the id field appropriate to the grant kind.
    -- Extra fields (email, etc.) are NOT compared — they are informational only.
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

CREATE TRIGGER trg_document_access_grants_enforce_invariants
  BEFORE INSERT OR UPDATE OF
    document_id, school_id, consent_id,
    grantee_kind, grantee_school_id, grantee_user_id, grantee_external_contact_id,
    expires_at
  ON document_access_grants
  FOR EACH ROW EXECUTE FUNCTION document_access_grants_enforce_invariants();


-- ─────────────────────────────────────────────────────────────────
-- 5.H document_consents: cascade revoke/expire to dependent grants
-- When a consent transitions to 'revoked' or 'expired', mark every active
-- grant referencing it as revoked, with revoke_reason recording the cause.
-- Idempotent: only updates grants that are not already revoked.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_consents_cascade_revocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE TRIGGER trg_document_consents_cascade_revocation
  AFTER UPDATE OF status ON document_consents
  FOR EACH ROW EXECUTE FUNCTION document_consents_cascade_revocation();


-- ============================================================
-- End of Migration 054
--
-- Next migration (Phase B) will add:
--   - storage bucket child-documents (private, 25 MB, PDF + JPEG/PNG/WebP)
--   - storage RLS policies (school-folder gated)
--   - app-side RLS policies on the 7 tables in this migration
--   - accessible_document_ids()           (UUID[])
--   - external_contact_ids_for_caller()   (UUID[])
--   - log_document_access(...)            SECURITY DEFINER RPC
-- ============================================================
