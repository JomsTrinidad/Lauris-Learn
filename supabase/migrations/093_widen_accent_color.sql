-- Migration 093: widen schools.accent_color from VARCHAR(7) to TEXT
--
-- Background: the column was sized for 7-character hex strings (#rrggbb).
-- The curated theme system stores key strings instead (e.g. "neutral-slate" = 13 chars),
-- which exceed the old constraint and produce "value too long for type character varying(7)".
-- TEXT has no length limit and is the correct type for open-ended string keys.
ALTER TABLE schools
  ALTER COLUMN accent_color TYPE TEXT;
