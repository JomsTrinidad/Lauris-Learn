# Support and Incident Process

A founder-friendly guide for handling school support requests and platform incidents.

---

## Support Categories

### Tier 1 — School Can Self-Serve
Issues the school admin can fix without platform owner help.

- Forgot password → Supabase sends a reset email via `/login`
- Parent can't log in → Check guardian email matches their signup email
- Data not showing → Check school year is set to Active in Settings
- Logo not uploading → File too large (max 1 MB); resize and retry
- Billing not generating → Fee types not configured; check Finance → Fee Types

### Tier 2 — Platform Owner Assists
Issues requiring super admin access or configuration.

- School needs trial extended → Super Admin → Edit school → update trial end date
- School accidentally suspended → Super Admin → Reactivate
- User account linked to wrong school → Update `profiles.school_id` in SQL Editor
- Parent invite not working → Check `profiles.role = 'parent'` was set on invite acceptance
- Attendance not saving → Verify no duplicate constraint violation in `attendance_records`

### Tier 3 — Incident or Data Issue
Requires investigation, possible recovery, or Supabase support.

- Data missing or corrupted → Check `audit_logs` for deletion events
- Storage files missing → Check `uploaded_files.status` and Supabase Storage bucket
- Authentication broken → Check Supabase Auth logs in Dashboard → Authentication → Logs
- RLS locking out users → Use service role key to inspect and fix policies
- Migration failed → Check SQL Editor output; most migrations are idempotent and can be re-run

---

## Severity Levels

| Level | Description | Target Response |
|---|---|---|
| P1 — Critical | No one can log in; all data inaccessible; production is down | Respond within 2 hours |
| P2 — High | A school's core workflow is broken (can't mark attendance, can't view billing) | Respond within 4 hours |
| P3 — Medium | A feature is broken but a workaround exists | Respond within 24 hours |
| P4 — Low | Cosmetic issue, minor inconvenience, enhancement request | Address in next work session |

During the pilot, treat all school-reported issues as P3 or above and respond the same day.

---

## What Schools Should Report

When a school contacts you for support, ask them to include:

1. **What they were trying to do** (e.g. "adding a student", "recording a payment")
2. **What happened instead** (e.g. "the page shows an error", "nothing saved", "blank screen")
3. **Which page or section** (e.g. Students, Billing, Settings)
4. **When it happened** (date and approximate time)
5. **Who was affected** — just them, or all staff?
6. **A screenshot** if possible

This information lets you reproduce the issue quickly.

---

## What to Check First (Platform Owner)

For any reported issue:

1. **Check audit_logs** for suspicious or failed actions around the reported time:
   ```sql
   SELECT * FROM audit_logs
   WHERE school_id = '<school_id>'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

2. **Check Supabase logs** — Dashboard → Logs → API logs or Auth logs

3. **Impersonate the school** — Super Admin → View → reproduce the issue with the school's data

4. **Check the browser console** — ask the user to open DevTools → Console and report any red errors

5. **Check RLS policies** — if data is missing, run the query directly with service role to confirm data exists

---

## Incident Log Template

Keep a simple log (text file, Notion, or spreadsheet) for any P1/P2 incident:

```
Date: 
Reported by: 
School affected: 
Severity: P1 / P2 / P3
Description: What broke?
Root cause: Why did it break?
Resolution: What was done to fix it?
Time to resolve: 
Follow-up needed: Yes / No
```

Even a brief entry helps you spot patterns across incidents.

---

## Escalation to Supabase

If the issue is at the infrastructure level (database down, auth service outage, storage unavailable):

1. Check Supabase status page: https://status.supabase.com
2. Open a support ticket: https://supabase.com/support
3. Include: project ref ID (in Dashboard → Settings → General), description of the issue, and timestamps

For P1 incidents, contact Supabase immediately and keep the school informed every 30 minutes until resolved.

---

## Communication Template — School Notification

For any P2+ issue, proactively notify the affected school:

> Hi [Name], we're aware of an issue affecting [feature] in Lauris Learn. We're investigating and will have an update within [timeframe]. In the meantime, [workaround if any]. We'll follow up as soon as it's resolved.

When resolved:

> The issue with [feature] has been resolved as of [time]. The root cause was [brief explanation]. Please let us know if you notice anything else. Thank you for your patience.
