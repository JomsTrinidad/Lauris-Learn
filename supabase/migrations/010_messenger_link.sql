-- Add messenger group chat link to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS messenger_link TEXT;
