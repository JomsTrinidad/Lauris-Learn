-- Create the updates-media storage bucket as PRIVATE
-- Photos of children should not be publicly accessible.
-- The app uses short-lived signed URLs (1 hour) generated server-side.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'updates-media',
  'updates-media',
  false,
  10485760,  -- 10 MB hard limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop any previously created policies before recreating
DROP POLICY IF EXISTS "Authenticated users can upload updates media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update updates media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete updates media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read updates media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access on updates media" ON storage.objects;

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload updates media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'updates-media');

-- Authenticated users can replace existing uploads (upsert on re-save)
CREATE POLICY "Authenticated users can update updates media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'updates-media');

-- Authenticated users can delete uploads (for moderation / post deletion)
CREATE POLICY "Authenticated users can delete updates media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'updates-media');

-- Authenticated users can read objects (required to generate signed URLs)
CREATE POLICY "Authenticated users can read updates media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'updates-media');
