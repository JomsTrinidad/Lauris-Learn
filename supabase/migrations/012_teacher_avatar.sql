-- Add avatar_url to teacher_profiles
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
