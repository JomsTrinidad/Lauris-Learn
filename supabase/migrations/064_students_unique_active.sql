-- ─────────────────────────────────────────────────────────────────────────────
-- 064 — Prevent duplicate active students per school.
--
-- Backstory: clearDemoData() was silently failing on the students delete when
-- any child_documents row blocked the FK (ON DELETE RESTRICT, migration 054).
-- The next generate run inserted a fresh batch of students on top of the
-- survivors, producing visible duplicates in the Documents and Students UI.
--
-- The clear path is now fixed in src/lib/demo/index.ts, but this index is the
-- belt-and-suspenders backstop: even if a future code path silently leaves
-- active student rows behind, the second insert errors out instead of
-- creating a clone.
--
-- Partial: inactive (soft-deleted) rows are intentionally allowed to share a
-- name+DOB with an active row, so the index doesn't break archival flows.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS students_unique_active_per_school
  ON students (school_id, lower(first_name), lower(last_name), date_of_birth)
  WHERE is_active = TRUE;
