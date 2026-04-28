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

## Before the Pilot Starts — Recommended Actions

1. Upgrade Supabase to Pro (daily backups)
2. Take a manual database export immediately before handing access to the pilot school
3. Store the backup file somewhere outside Supabase (local drive, Google Drive)
4. Document the date of the export and what state the data was in
5. Repeat the manual export at the end of each week during the pilot

---

## Recovery Contact

If a Supabase project is in a broken state (RLS locked out, accidental migration, table drop):

- Supabase Support: https://supabase.com/support
- For service role bypass, you can always query via the Supabase SQL Editor as project owner
- If locked out of auth, use the Supabase service role key directly from the API tab
