-- Add optional photo URL to parent updates
ALTER TABLE parent_updates ADD COLUMN IF NOT EXISTS image_url TEXT;
