-- Parent updates: status lifecycle, multi-photo support, audit fields

-- Status: draft | posted | hidden | deleted (default posted for all existing rows)
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
UPDATE parent_updates SET status = 'posted' WHERE status IS NULL;

-- Multi-photo support (image_url kept for backward compat; image_urls is the new source)
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing single image_url into image_urls array
UPDATE parent_updates
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- Audit fields
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS action_by UUID REFERENCES auth.users(id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS parent_updates_status_idx ON parent_updates(school_id, status, created_at DESC);
