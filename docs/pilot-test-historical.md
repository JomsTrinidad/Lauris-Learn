# Historical Foundation — Pilot Test Script

Manual test script for the Phases 2–5 historical foundation.
Run before releasing the school-year close flow to the pilot school (Bright Kids Learning and Tutorial Center).

All steps use the `school_admin` role unless noted.

---

## Prerequisites

- Migration 097 (`school_year_completions`) applied.
- At least one active school year exists with enrolled students and recorded attendance.
- At least two classes exist with students enrolled.

---

## 1 — Active Year Normal Operations

**Goal:** Confirm baseline functionality is unchanged.

1. Open `/students`. Confirm student list shows enrolled students with their current class.
2. Open `/attendance`. Select a class and today's date. Mark a few students present/absent. Click **Save Attendance**. Confirm toast appears.
3. Open `/billing`. Confirm billing records load. Open a record and record a test payment.
4. Open `/classes`. Confirm class list shows the active year's classes with correct enrolled counts.

✅ Pass criteria: no regressions from before Phase 2.

---

## 2 — Class Transfer

**Goal:** Confirm `student_class_assignments` is written on transfer and `enrollments.class_id` stays in sync.

1. Open `/students`. Open a student's detail panel. Click **Enroll / Edit Enrollment**.
2. Change the class to a different class. Set a start date (today). Click **Save Enrollment**.
3. Verify in the UI: the student's class column now shows the new class.
4. Verify in SQL:
   ```sql
   SELECT * FROM student_class_assignments WHERE student_id = '<id>' ORDER BY start_date DESC LIMIT 5;
   ```
   Expect two rows for this enrollment: the old row with `end_date = today - 1`, and a new open row (`end_date IS NULL`) with the new class.
5. Verify `enrollments.class_id` matches the new class:
   ```sql
   SELECT class_id FROM enrollments WHERE student_id = '<id>' AND school_year_id = '<active_year_id>';
   ```

✅ Pass criteria: two assignment rows, `end_date` on prior row = transfer date - 1, `enrollments.class_id` matches new class.

---

## 3 — Attendance Before and After Transfer

**Goal:** Confirm historical attendance summary reflects class membership on the date, not current class.

1. Record attendance for the student in their **old class** on a date **before** the transfer.
2. Complete the transfer from Step 2 above.
3. Open `/attendance` → Summary view. Select the **pre-transfer date**. Confirm the student's headcount appears in their **old class**, not the new one.
4. Select **today** (post-transfer date). Confirm the student appears in their **new class** headcount.

✅ Pass criteria: class counts reflect effective-dated membership, not current class.

---

## 4 — Year-End Classification

**Goal:** Confirm classification writes to enrollments and logs a transition; confirm it cannot run on closed years.

1. Open `/students` → **Year-End Classification** tab.
2. Select the active school year as source. Confirm unclassified enrolled students appear.
3. Classify 2–3 students (e.g., one "Eligible", one "Graduated").
4. Click **Save Year-End Classifications**. Confirm success banner.
5. Verify in SQL:
   ```sql
   SELECT id, status, progression_status FROM enrollments WHERE student_id IN ('<id1>', '<id2>');
   SELECT * FROM enrollment_transitions WHERE enrollment_id IN ('<enroll_id1>', '<enroll_id2>') ORDER BY created_at DESC LIMIT 5;
   ```
   Expect `progression_status` populated and a `progression_classified` transition row.
6. **Closed-year guard**: Switch to a historical closed year as source (if one exists). Set a classification. Click Save — expect server error "Year-end classification is only allowed for the active school year." The button should also be disabled if `isHistoricalView` is true in the header.

✅ Pass criteria: classifications saved, transitions logged, closed-year blocked.

---

## 5 — Close School Year

**Goal:** Confirm the close route generates snapshots and the year transitions correctly.

1. Ensure at least one student is still `enrolled` (not classified) and at least one is `completed`.
2. Open **Settings → School Years**. Click **Close School Year** on the active year.
3. If unclassified students appear in the warning list, check **Close anyway** and proceed.
4. After close, verify in SQL:
   ```sql
   SELECT status FROM school_years WHERE id = '<year_id>';
   SELECT completion_status, progression_status, final_class_name, final_level_name
     FROM school_year_completions
    WHERE school_year_id = '<year_id>'
    ORDER BY completion_status;
   ```
   Expect:
   - `school_years.status = 'closed'`
   - One `school_year_completions` row per enrolled/completed/withdrawn student
   - `enrolled` students → `completion_status = 'enrolled_at_close'`
   - `completed` students → `completion_status = 'completed'`
   - `withdrawn` students → `completion_status = 'withdrawn'`
5. Verify that `final_class_name` and `final_level_name` are populated (not null) for students who had a class.

✅ Pass criteria: year closed, correct snapshot rows, name columns populated.

---

## 6 — View Historical Year

**Goal:** Confirm the header year-switcher enables read-only historical browsing.

1. Create a new **Planned** school year in Settings. Click **Activate** on it (this demotes the closed year — see Step 8 for the combined flow instead; for now just observe the header).
2. Use the **Header year dropdown** to switch back to the closed year.
3. Confirm the amber "Viewing historical year" banner appears in the layout.
4. Open `/students`. Confirm:
   - Students show their enrollment status **for the closed year** (completed/withdrawn/enrolled_at_close).
   - The **Add Student** button is disabled.
   - The **Year-End Classification** Confirm button is disabled.
5. Open a student's detail panel. Under **Year-End Classification**, confirm:
   - Classified students show the classification badge + green "Snapshotted at year close" indicator with class/level.
   - Students with `enrolled_at_close` and no classification show the amber "Enrolled at year close" note.
6. Open `/attendance`. Confirm the class list shows the **closed year's** classes, not the new active year's classes.

✅ Pass criteria: historical data displays correctly; all write actions are disabled or blocked.

---

## 7 — Regenerate Snapshots (Recovery Path)

**Goal:** Confirm the recovery route works when snapshots are missing or incomplete.

**Setup**: In SQL, delete a few snapshot rows to simulate partial failure:
```sql
DELETE FROM school_year_completions
 WHERE school_year_id = '<closed_year_id>'
 LIMIT 3;
```

1. Open **Settings → School Years**. Find the closed year. Click **Regenerate Snapshots**.
2. Read the warning in the modal. Click **Regenerate Snapshots** to confirm.
3. Confirm the success message shows `deleted: N · regenerated: M` (M should be the full enrollment count for the year).
4. Verify in SQL that snapshots are fully restored:
   ```sql
   SELECT COUNT(*) FROM school_year_completions WHERE school_year_id = '<closed_year_id>';
   ```
5. Confirm the regeneration did NOT change `school_years.status`:
   ```sql
   SELECT status FROM school_years WHERE id = '<closed_year_id>';
   -- must still be 'closed'
   ```

✅ Pass criteria: snapshots restored to full count, year remains closed, enrollments unchanged.

---

## 8 — Activate New Year (Implicit Close)

**Goal:** Confirm that activating a new year closes the old year AND generates snapshots in one operation.

1. Create a **Planned** school year for the next period in Settings.
2. Click **Activate**. The confirmation modal should warn about unclassified students (if any) and name the year being demoted.
3. Click **Activate** (or **Proceed Anyway**).
4. After activation, verify:
   ```sql
   SELECT id, name, status FROM school_years WHERE school_id = '<school_id>' ORDER BY start_date DESC LIMIT 3;
   ```
   Expect the new year is `active`, the old year is `closed`.
5. Verify `school_year_completions` rows exist for the just-closed year:
   ```sql
   SELECT COUNT(*) FROM school_year_completions WHERE school_year_id = '<old_year_id>';
   ```
6. Switch the header back to the old year. Confirm Steps 6 pass (historical view works for this newly-closed year).

✅ Pass criteria: implicit close generates snapshots, new year is active, old year browsable in historical view.

---

## 9 — Graduated Students Hidden From Active Default / Visible Historically

**Goal:** Confirm graduated/completed students are filtered out of the active-year default list but visible when browsing history.

1. In the active year, confirm at least one student's enrollment is `completed` with `progression_status = 'graduated'`.
2. Open `/students` with the **active year** in the header. Confirm the graduated student does NOT appear in the default "Active Students" list (the list defaults to hiding `completed` and `withdrawn` enrollments).
3. Set the Status filter to include "Completed". Confirm the graduated student now appears with the correct badge.
4. Switch the header to the **closed historical year** where the student was enrolled. Confirm:
   - The student appears by default in the historical list (all statuses shown).
   - The student's enrollment shows `completed` / `graduated`.
   - The detail panel shows the snapshot indicator (green dot + class/level).

✅ Pass criteria: clean separation between active operational list and historical browsing.

---

## Test Summary Checklist

| # | Test | Pass |
|---|---|---|
| 1 | Active year normal operations | ☐ |
| 2 | Class transfer writes assignment row + syncs class_id | ☐ |
| 3 | Attendance summary uses effective-dated assignments | ☐ |
| 4 | Year-end classification + closed-year block | ☐ |
| 5 | Close year → snapshots generated | ☐ |
| 6 | Historical view read-only + snapshot display | ☐ |
| 7 | Regenerate snapshots recovery | ☐ |
| 8 | Activate new year → implicit close + snapshots | ☐ |
| 9 | Graduated hidden active / visible historically | ☐ |
