-- 041_uploaded_files.sql
-- Media lifecycle tracking table.
--
-- Records metadata for every file uploaded to Supabase Storage so we can:
--   - report per-school storage consumption to the super admin
--   - soft-delete orphaned files when their parent entity is removed
--   - enforce per-school quotas in a future pass
--
-- NOTE: Upload instrumentation (inserting rows here from upload call sites) is
-- deferred to a future pass. This migration creates the schema so RLS policies
-- and queries are ready. The storage_path UNIQUE constraint prevents duplicate rows.
--
-- Buckets in use:
--   profile-photos   (public)  — student, teacher, admin avatars; school logos
--   updates-media    (private) — parent update photos; payment receipt photos

CREATE TABLE IF NOT EXISTS uploaded_files (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID        REFERENCES schools(id) ON DELETE SET NULL,
  uploaded_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- e.g. 'parent_update', 'student', 'payment', 'school_logo', 'teacher', 'admin'
  related_entity_type TEXT,
  related_entity_id   UUID,
  bucket              TEXT        NOT NULL,
  storage_path        TEXT        NOT NULL UNIQUE,
  file_size           BIGINT,     -- bytes at time of upload (before any CDN transformation)
  mime_type           TEXT,
  status              TEXT        NOT NULL DEFAULT 'active'
    CONSTRAINT uploaded_files_status_check
      CHECK (status IN ('active', 'hidden', 'deleted')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_school_created
  ON uploaded_files (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_entity
  ON uploaded_files (related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_status_school
  ON uploaded_files (status, school_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- School members (admin + teacher) can view their school's uploaded files
CREATE POLICY "school_members_select_uploaded_files"
  ON uploaded_files FOR SELECT
  USING (school_id = current_user_school_id());

-- Only school_admin can insert/update/delete via client (service-role routes bypass RLS)
CREATE POLICY "school_admin_write_uploaded_files"
  ON uploaded_files FOR ALL
  USING  (current_user_role() = 'school_admin' AND school_id = current_user_school_id())
  WITH CHECK (current_user_role() = 'school_admin' AND school_id = current_user_school_id());

-- Super admin reads and writes all rows
CREATE POLICY "super_admin_all_uploaded_files"
  ON uploaded_files FOR ALL
  USING (is_super_admin());
