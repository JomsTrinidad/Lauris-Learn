-- ============================================================
-- Migration 038 – Storage Policy Hardening
--
-- Problems fixed:
--   A. updates-media bucket: any authenticated user could DELETE
--      any file regardless of who uploaded it.
--   B. profile-photos bucket: same — any authenticated user
--      could DELETE any file regardless of who uploaded it.
--   C. updates-media payment receipts: uploads for payment
--      receipts should be scoped to the uploader's school.
--      Path convention: payment-receipts/{school_id}/{payment_id}.ext
--      We enforce that the school_id folder matches the caller's
--      school_id so a user from school A cannot upload a receipt
--      under school B's path.
--
-- Approach:
--   - DELETE restricted to file owner (owner = auth.uid()) or
--     school_admin / super_admin (for moderation)
--   - payment-receipts INSERT additionally validates path school_id
--   - All other existing policies are preserved unchanged
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- A. updates-media bucket
-- ══════════════════════════════════════════════════════════════

-- Drop the current broad DELETE policy
DROP POLICY IF EXISTS "Authenticated users can delete updates media" ON storage.objects;

-- New DELETE policy: uploader can delete their own file.
-- School admins and super admins can delete any file in the bucket
-- (needed for moderation — removing inappropriate parent update photos).
CREATE POLICY "Owner or admin can delete updates media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'updates-media'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('school_admin', 'super_admin')
  )
);

-- Drop the existing broad INSERT policy for updates-media
DROP POLICY IF EXISTS "Authenticated users can upload updates media" ON storage.objects;

-- New INSERT policy: authenticated users can upload to updates-media,
-- BUT if uploading under the payment-receipts/ prefix the second path
-- segment (school_id folder) must match their own school_id.
-- Path: payment-receipts/{school_id}/{filename}
--   (storage.foldername(name))[1] = 'payment-receipts'
--   (storage.foldername(name))[2] = caller's school_id
CREATE POLICY "Authenticated users can upload updates media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'updates-media'
  AND (
    -- Non-receipt uploads: any authenticated user (class update photos, etc.)
    (storage.foldername(name))[1] <> 'payment-receipts'
    OR
    -- Receipt uploads: second folder must equal the caller's school_id
    (storage.foldername(name))[2] = (
      SELECT school_id::TEXT FROM public.profiles WHERE id = auth.uid()
    )
  )
);


-- ══════════════════════════════════════════════════════════════
-- B. profile-photos bucket
-- ══════════════════════════════════════════════════════════════

-- Drop the current broad DELETE policy
DROP POLICY IF EXISTS "Authenticated users can delete profile photos" ON storage.objects;

-- New DELETE policy: file owner can delete their own photo.
-- School admins can also delete any photo (branding management, removing
-- inappropriate avatars). Super admin has full access.
CREATE POLICY "Owner or admin can delete profile photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    owner = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('school_admin', 'super_admin')
  )
);
