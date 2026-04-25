-- Migration 006: Extended billing statuses + meeting link on classes

-- Add cancelled and refunded to billing_status enum
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE billing_status ADD VALUE IF NOT EXISTS 'refunded';

-- Add meeting_link to classes (for recurring class-level Google Meet links)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS meeting_link text;

-- Add RLS policies for grading_scales (in case 005 was run without them)
DO $$ BEGIN
  CREATE POLICY "members_read_grading_scales" ON grading_scales
    FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "members_write_grading_scales" ON grading_scales
    FOR ALL USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add RLS for guardian_invites if not exists
DO $$ BEGIN
  CREATE POLICY "members_read_guardian_invites" ON guardian_invites
    FOR SELECT USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "members_write_guardian_invites" ON guardian_invites
    FOR ALL USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()) OR is_super_admin());
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
