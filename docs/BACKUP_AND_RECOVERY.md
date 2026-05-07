# Backup and Recovery

---

## What Supabase Backs Up

**Supabase Free plan:**
- No automatic backups
- You must take manual exports

**Supabase Pro plan ($25/month):**
- Daily automatic backups (7-day retention)
- Point-in-time recovery (PITR) available as an add-on
- Strongly recommended before going live with real school data

**Recommendation:** Upgrade to Pro before the pilot starts.

---

## Manual Database Export

To export the full database at any time:

1. Supabase Dashboard → Database → Backups
2. Click **Create backup** (Pro plan)
3. Or use `pg_dump` if you have direct DB access credentials:
   ```
   pg_dump postgresql://postgres:<password>@<host>:5432/postgres > backup_$(date +%Y%m%d).sql
   ```

**Before any major change** (new migration, data import, pilot start): take a manual backup.

---

## What to Export for Critical Tables

If you want a lightweight export without a full dump, export these tables in order:

| Table | Why |
|---|---|
| `schools` | Tenant root; losing this breaks everything |
| `profiles` | User accounts and roles |
| `students` | Core student records |
| `guardians` | Parent contact links |
| `enrollments` | Class assignments |
| `billing_records` | Financial records |
| `payments` | Payment history |
| `audit_logs` | Activity trail (cannot reconstruct after deletion) |
| `impersonation_audit_log` | Super admin actions |

Export via: Dashboard → Table Editor → select table → Export as CSV.

---

## Storage / Media Backup

Supabase Storage is **not covered** by database backups. Photos stored in `updates-media` and `profile-photos` are separate from the Postgres backup.

**Current state:** No automated storage backup exists.

**Options:**
- Manually download important files from Dashboard → Storage → bucket → download
- Use the `uploaded_files` table to identify all tracked files (gives you the storage paths)
- If using Supabase Pro or higher tiers, check if storage snapshots are available in your plan

**Recommendation:** For the pilot, accept the risk. If a storage bucket is accidentally deleted, tracked files are listed in `uploaded_files` but the binary data is gone. Communicate this limitation to pilot schools.

---

## Recovery from Accidental Data Deletion

### What audit_logs can help with

The `audit_logs` table records: table name, action (INSERT/UPDATE/DELETE), actor, timestamp, old values, and new values.

**Can recover:**
- Which record was deleted and its previous values (if `old_values` was captured)
- Who performed the action and when

**Cannot recover:**
- Binary files (photos deleted from storage)
- Records deleted before `audit_logs` was implemented (migration 036)
- The actual restored row — you would need to re-insert manually from the captured old_values JSON

### Manual Recovery Steps

1. Query `audit_logs` to find the deletion event:
   ```sql
   SELECT * FROM audit_logs
   WHERE action = 'DELETE' AND table_name = 'students'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

2. Inspect `old_values` in the result — this is a JSONB snapshot of the row before deletion

3. Re-insert the record manually using those values

4. Note: related rows (enrollments, billing_records, etc.) may also have been cascade-deleted; check each table

### For Soft-Deleted Media

When a parent update is hidden or deleted, its `uploaded_files` rows are marked `status = 'deleted'`. The binary file may still exist in Supabase Storage unless explicitly removed.

To check:
```sql
SELECT storage_path, related_entity_type, deleted_at
FROM uploaded_files
WHERE status = 'deleted'
ORDER BY deleted_at DESC;
```

---

## Full Restore Procedure

### Supabase Pro Backup Recovery (Recommended)

1. **Identify the backup date** → Dashboard → Database → Backups
2. **Restore to new project** (Supabase creates a temporary project with the backup)
3. **Verify data integrity** before switching your app:
   ```sql
   SELECT COUNT(*) FROM students;
   SELECT COUNT(*) FROM audit_logs;
   SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'audit_%'; -- should be 42+
   ```
4. **Update app configuration:**
   - Copy new project URL from Dashboard
   - Update `.env.local`: `NEXT_PUBLIC_SUPABASE_URL=<new-project-url>`
   - Redeploy to Vercel: `git push`
5. **Test the app:** confirm login works, create a test student, verify data is present
6. **Clean up:** delete the temporary project or keep it as standby (costs $25/mo)

### Manual Restore from pg_dump

If using a manual `pg_dump` backup:

1. **Create a staging Supabase project** (or use local postgres)
2. **Restore the dump:**
   ```bash
   pg_restore -h <host> -U <user> -d postgres -Fc backup_YYYY-MM-DD.dump
   ```
3. **Run sanity checks** (above)
4. **Point app to the staging project** temporarily
5. **Test thoroughly** before making permanent

---

## Restore Testing

**BEFORE the pilot, test a full restore:**

1. Take a manual backup: `pg_dump ... > test_backup.dump`
2. Create a staging project in Supabase (separate from production)
3. Restore the backup to staging
4. Run the sanity checks (above)
5. Confirm the app can log in with staging credentials
6. Create a test student on staging and verify it appears
7. Document the time it takes (for future planning)
8. Delete staging (or keep as a cold standby for X months)

---

## Partial Table Restore

If only one table is corrupted:

1. **Identify the corruption:**
   ```sql
   SELECT COUNT(*) FROM students;
   SELECT * FROM students WHERE id = '<suspected-id>' \gx
   ```

2. **Restore that table only:**
   ```bash
   pg_restore -h <host> -U <user> -d postgres -t students -Fc backup.dump
   ```

3. **Verify row count matches:**
   ```sql
   SELECT COUNT(*) FROM students;
   ```

4. **Check audit trail for the table:**
   ```sql
   SELECT action, actor_user_id, created_at 
   FROM audit_logs 
   WHERE table_name = 'students' 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

---

## Rollback a Migration

Migrations 001–084 are additive and reversible via counter-migration only. **Do NOT manually DROP migrations.**

If a migration must be reverted:

1. **Create a counter-migration** (e.g., `085_revert_084_audit_triggers.sql`):
   ```sql
   -- Drop all triggers added in 084
   DROP TRIGGER IF EXISTS audit_classes ON classes;
   DROP TRIGGER IF EXISTS audit_class_teachers ON class_teachers;
   -- ... (for all 11 tables in 084)
   ```

2. **Test on staging first**

3. **Deploy to production** via your normal CI/CD

4. **Document the reason** in the migration file header

---

## Before the Pilot Starts — Recommended Actions

1. ✅ Upgrade Supabase to Pro (daily backups)
2. ✅ Take a manual database export immediately before handing access to the pilot school
3. ✅ **Test a restore** on staging to estimate recovery time (critical!)
4. ✅ Store the backup file somewhere outside Supabase (Google Drive, encrypted USB, etc.)
5. ✅ Document the date, size, and state of the export
6. ✅ Repeat the manual export at the end of each week during the pilot
7. ✅ For storage media: maintain a manual export of `uploads-media` and `profile-photos` buckets weekly

---

## Recovery Contact

If a Supabase project is in a broken state (RLS locked out, accidental migration, table drop):

- **Supabase Support:** https://supabase.com/support
- **For service role bypass:** You can always query via the Supabase SQL Editor as project owner
- **If locked out of auth:** Use the Supabase service role key directly from the API tab
- **For data recovery:** Restore from backup (Pro plan) or use `audit_logs.old_values` to manually reconstruct deleted rows
