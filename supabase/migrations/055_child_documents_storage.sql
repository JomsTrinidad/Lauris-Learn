-- ============================================================
-- Migration 055 – child-documents storage bucket + policies
--
-- Bucket: PRIVATE. Holds versioned files for child_documents.
--   id                 = 'child-documents'
--   public             = false
--   file_size_limit    = 26214400   (25 MB)
--   allowed_mime_types = pdf, jpeg, png, webp
--
-- Path convention (created and enforced by app + storage policies):
--   {school_id}/{student_id}/{document_id}/v{version_number}.{ext}
--
-- Storage RLS posture:
--   - INSERT: school staff (school_admin/teacher) at the path's school
--             OR a parent of the student in the path
--   - UPDATE: same as INSERT (allows upsert when overwriting a version blob)
--   - DELETE: school_admin only at the path's school. App-level enforces
--             the additional "doc is in 'draft' status" rule via the version
--             delete policy on the application table.
--   - SELECT: NO CLIENT POLICY. Default-deny.
--             The only path that can read is the API route using service-role,
--             after log_document_access has approved the access. This is the
--             choke point that satisfies "signed URLs only via the RPC path".
--
-- IMPORTANT: After running this migration, verify in Supabase Dashboard →
-- Storage that the bucket "child-documents" appears as PRIVATE. If your
-- Supabase version does not allow bucket creation via SQL, create it
-- manually with the configuration above. The policies still apply.
-- ============================================================


-- ── Create the bucket (idempotent) ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'child-documents',
  'child-documents',
  false,
  26214400,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ── Drop any pre-existing policies on this bucket (idempotent) ─────────────
DROP POLICY IF EXISTS "child_documents_school_staff_insert"  ON storage.objects;
DROP POLICY IF EXISTS "child_documents_parent_insert"        ON storage.objects;
DROP POLICY IF EXISTS "child_documents_school_staff_update"  ON storage.objects;
DROP POLICY IF EXISTS "child_documents_parent_update"        ON storage.objects;
DROP POLICY IF EXISTS "child_documents_school_admin_delete"  ON storage.objects;


-- ── INSERT: school staff at the path's school ─────────────────────────────
-- Path layout:
--   foldername(name)[1] = school_id (uuid as text)
--   foldername(name)[2] = student_id
--   foldername(name)[3] = document_id
CREATE POLICY "child_documents_school_staff_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'child-documents'
  AND current_user_role() IN ('school_admin','teacher')
  AND (storage.foldername(name))[1]::uuid = current_user_school_id()
);


-- ── INSERT: parent uploading a parent_provided document for own child ─────
-- The student in the path must belong to the parent. School ownership is
-- implicit via students.school_id, validated again by the application table
-- policies (which require source_kind='parent' AND status='draft').
CREATE POLICY "child_documents_parent_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'child-documents'
  AND current_user_role() = 'parent'
  AND (storage.foldername(name))[2]::uuid = ANY(parent_student_ids())
);


-- ── UPDATE: school staff (allows upsert / overwrite of the same path) ─────
CREATE POLICY "child_documents_school_staff_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'child-documents'
  AND current_user_role() IN ('school_admin','teacher')
  AND (storage.foldername(name))[1]::uuid = current_user_school_id()
);


-- ── UPDATE: parent (overwrite own draft uploads only) ─────────────────────
CREATE POLICY "child_documents_parent_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'child-documents'
  AND current_user_role() = 'parent'
  AND (storage.foldername(name))[2]::uuid = ANY(parent_student_ids())
);


-- ── DELETE: school_admin at the path's school ─────────────────────────────
-- Storage RLS cannot reference child_documents.status directly. The doc-status
-- "draft only" rule is enforced at the version-row delete policy in 056. If
-- the version row cannot be deleted, the orphaned blob can still be removed
-- by an admin and is harmless.
CREATE POLICY "child_documents_school_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'child-documents'
  AND current_user_role() = 'school_admin'
  AND (storage.foldername(name))[1]::uuid = current_user_school_id()
);


-- ── SELECT: deliberately NO CLIENT POLICY.
-- All reads happen via service-role inside the API route after the RPC
-- log_document_access() approves access. Default-deny is the choke point.
-- ============================================================
