-- Migration 022: Public profile-photos storage bucket
-- Stores admin avatars, teacher avatars, and school logos.
-- Must be PUBLIC so images can be served directly in <img> tags without signed URLs.
--
-- IMPORTANT: After running this migration, go to
--   Supabase Dashboard → Storage → Buckets
-- and verify a bucket named "profile-photos" appears.
-- If it does NOT appear (Supabase version caveat), create it manually:
--   Name: profile-photos   Public: YES   File size limit: 2 MB

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "Authenticated users can upload profile photos"  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update profile photos"  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete profile photos"  ON storage.objects;
DROP POLICY IF EXISTS "Public read access on profile photos"           ON storage.objects;

-- Authenticated users can upload (INSERT)
CREATE POLICY "Authenticated users can upload profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

-- Authenticated users can replace existing uploads (UPDATE / upsert)
CREATE POLICY "Authenticated users can update profile photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos');

-- Authenticated users can delete their own uploads
CREATE POLICY "Authenticated users can delete profile photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos');

-- Anyone (including unauthenticated) can read — required for public <img src>
CREATE POLICY "Public read access on profile photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-photos');
