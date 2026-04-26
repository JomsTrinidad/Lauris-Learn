-- Migration 020: Add next_class_id to classes for promotion path mapping
-- Defines the default class a student should be promoted to after completing this class.
-- Used by the Promote Students feature to pre-fill the suggested next class.

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS next_class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
