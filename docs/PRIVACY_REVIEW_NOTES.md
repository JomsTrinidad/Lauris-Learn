# Privacy Review Notes

Honest assessment of what data Lauris Learn collects, who can access it, and known risks.
This document is for the platform owner's reference, not for public distribution.

---

## What Data Is Collected

| Category | Data | Where Stored |
|---|---|---|
| Identity | Full name, email address, role | `profiles` table (Supabase Auth + public) |
| Students | Full name, date of birth (optional), photo | `students` table + `profile-photos` storage bucket |
| Guardians | Full name, email, phone (optional), relationship to student | `guardians` table |
| Attendance | Present/absent/late/excused per student per day | `attendance_records` table |
| Billing | Monthly fees, payment amounts, payment method, OR number | `billing_records`, `payments` tables |
| Payment receipts | Receipt photo (optional) | `updates-media` storage bucket (private) |
| Class updates | Teacher-posted text and photos | `parent_updates` table + `updates-media` bucket (private) |
| Progress observations | Teacher notes on student development (ratings by category) | `progress_observations` table |
| Events / RSVP | Event attendance intentions per student | `event_rsvps` table |
| Absence reports | Parent-submitted absence reason | `absence_notifications` table |
| Profile photos | Student, teacher, and admin avatar photos | `profile-photos` storage bucket |
| School logo | School branding logo | `profile-photos` storage bucket |
| File upload metadata | File size, type, storage path, upload timestamp | `uploaded_files` table |
| Audit trail | Who did what, when, and on what record | `audit_logs` table |
| Impersonation log | When super admin viewed a school | `impersonation_audit_log` table |

---

## Who Can Access What

| Role | Can See |
|---|---|
| `super_admin` | All data across all schools (bypasses RLS via `is_super_admin()`) |
| `school_admin` | All data within their school |
| `teacher` | Students, attendance, class updates, progress for their classes; no billing |
| `parent` | Their linked children's data only: attendance, class updates, billing, progress (parent_visible only), events |

**RLS is enabled on all tables.** Supabase row-level security policies enforce these boundaries at the database layer — not just in the application code. Even if the application has a bug, RLS prevents cross-tenant data leaks.

**Exception:** Super admin impersonation is logged in `impersonation_audit_log` every time it is used.

---

## Storage Access

| Bucket | Public? | Who Can Access |
|---|---|---|
| `profile-photos` | **Yes — public** | Anyone with the URL, no authentication required |
| `updates-media` | Private | Authenticated users with a valid signed URL (1-hour expiry) |

### Known Risk: profile-photos bucket is public

Student photos, teacher photos, admin photos, and school logos stored in `profile-photos` are publicly accessible to anyone who knows the URL. The URLs are structured as:

```
https://<project>.supabase.co/storage/v1/object/public/profile-photos/<path>/<id>.jpg
```

**Impact:** A person who discovers a URL (e.g. from browser inspection) can access the photo without logging in.

**Mitigation planned but not yet implemented:** A `profile-photos-private` bucket with signed URL access (helpers already written in `src/lib/upload-private.ts`). Full migration requires: create private bucket → update all upload paths → backfill avatar_url → update all `<img>` tags to use signed URLs.

**Recommendation for pilot:** Acceptable risk if the pilot school is informed and consents. For a formal rollout, complete the private bucket migration first.

---

## Media Lifecycle and Deletion

- When a class update is hidden or deleted, associated photos in `uploaded_files` are marked `status = 'deleted'`
- The binary files are **not automatically deleted** from Supabase Storage
- A retention helper exists (`src/lib/retention-check.ts`) that can identify stale deleted files, but no automated cleanup job runs
- **Recommendation:** Before the pilot, clarify with the school: "Deleted updates are hidden from view but the photo files are retained for 30 days before we can manually remove them."

---

## Audit Logs

All significant write actions are recorded in `audit_logs` with:
- Actor (user ID + role)
- Timestamp
- Table affected
- Record ID
- Old and new values (JSONB snapshots)

**What audit_logs does NOT cover:**
- Actions taken before migration 036 was applied
- SELECT queries (reads are not logged)
- Direct database edits made via Supabase Dashboard or SQL Editor
- Storage file uploads/deletions (these are tracked separately in `uploaded_files`)

---

## Trial Data Recommendation

During the trial/pilot period, advise schools to use:
- Test student names (e.g. "Test Student A", "Juan D.") instead of real student full names
- Placeholder photos (initials-only avatars)
- No real guardian contact information if the parent portal isn't being tested

This reduces risk if trial data is ever inadvertently exposed or if the school decides not to continue.

---

## Data Retention

No formal data retention policy is implemented. Data persists indefinitely unless manually deleted.

**Recommendation before full production:**
- Define a data retention policy (e.g. archived school years purged after 5 years)
- Implement a soft-delete or archive mechanism for inactive schools
- Document what happens to a school's data if they cancel their subscription

---

## Remaining Risks Summary

| Risk | Severity | Status |
|---|---|---|
| `profile-photos` bucket is public | Medium | Documented; fix planned (`upload-private.ts` ready) |
| No automated storage cleanup | Low | Retention helper exists; no automated job yet |
| No formal data retention policy | Low | Document for legal review before full launch |
| TypeScript `any` casts in 15+ places | Low | Code quality only; not a security risk |
| RLS INSERT policies not fully audited across all 21+ tables | Low | Scheduled for future pass |
| No privacy policy or terms of service | Medium | Required before collecting real user data at scale |

---

## Recommended Next Steps Before Full Production

1. Complete the `profile-photos-private` bucket migration
2. Draft a privacy policy (can use a generator as a starting point)
3. Implement a data retention/deletion process for cancelled schools
4. Complete the systematic RLS INSERT policy audit
5. Consider a formal security review if handling sensitive student records at scale
