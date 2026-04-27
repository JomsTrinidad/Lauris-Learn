-- Migration 021: School branding + accessibility settings
-- Adds per-school customization columns to the schools table.
-- Run in Supabase SQL Editor.

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS logo_url             TEXT,
  ADD COLUMN IF NOT EXISTS primary_color        VARCHAR(7),
  ADD COLUMN IF NOT EXISTS accent_color         VARCHAR(7),
  ADD COLUMN IF NOT EXISTS report_footer_text   TEXT,
  ADD COLUMN IF NOT EXISTS text_size_scale      TEXT NOT NULL DEFAULT 'default'
    CHECK (text_size_scale  IN ('default', 'large', 'extra_large')),
  ADD COLUMN IF NOT EXISTS spacing_scale        TEXT NOT NULL DEFAULT 'default'
    CHECK (spacing_scale    IN ('compact', 'default', 'relaxed'));

-- Note: school logo images are uploaded to the existing "profile-photos" storage
-- bucket under the path  school-logos/{school_id}.{ext}
-- That bucket is already public, so no new bucket or policy is needed.
