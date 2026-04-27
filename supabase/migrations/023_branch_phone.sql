-- Migration 023: Add phone number to branches
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS phone TEXT;
