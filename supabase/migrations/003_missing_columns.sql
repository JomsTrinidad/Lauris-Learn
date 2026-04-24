-- Migration 003: Add missing columns referenced by the app but absent from schema

-- 1. students — is_active flag (used for filtering active students)
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. enrollment_inquiries — FK to classes (desired_class_id)
ALTER TABLE enrollment_inquiries ADD COLUMN IF NOT EXISTS desired_class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- 3. billing_records — FK to classes + description field
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS class_id    UUID REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. events — FK to classes (for class-specific events)
ALTER TABLE events ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- Indexes for new FK columns
CREATE INDEX IF NOT EXISTS idx_students_is_active              ON students(school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_enrollment_inquiries_class      ON enrollment_inquiries(desired_class_id);
CREATE INDEX IF NOT EXISTS idx_billing_records_class           ON billing_records(class_id);
CREATE INDEX IF NOT EXISTS idx_events_class                    ON events(class_id);
