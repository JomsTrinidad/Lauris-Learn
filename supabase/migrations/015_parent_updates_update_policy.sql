-- Missing RLS UPDATE policy on parent_updates.
-- Without this, any UPDATE (e.g. saving image paths, hiding, deleting) is silently blocked
-- and PostgREST returns 204 with no rows actually modified.
CREATE POLICY "School members can update parent_updates"
  ON parent_updates FOR UPDATE
  USING (school_id IN (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  ));
