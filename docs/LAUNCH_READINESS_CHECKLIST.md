# Launch Readiness Checklist

Use this before going live with any real school data.

---

## 1. Supabase Project

- [ ] Separate production project created (not the same as dev/staging)
- [ ] Project region chosen close to users (e.g. Southeast Asia for PH)
- [ ] RLS enabled — verify: Dashboard → Authentication → Policies, confirm all tables have policies
- [ ] `is_super_admin()` function exists and is SECURITY DEFINER
- [ ] `parent_student_ids()` function exists and is SECURITY DEFINER
- [ ] `current_user_role()` function exists and is SECURITY DEFINER
- [ ] `current_user_school_id()` function exists and is SECURITY DEFINER

---

## 2. Migrations Applied (in order)

Run each file in Supabase Dashboard → SQL Editor. Do not skip.

- [ ] `supabase/schema.sql`
- [ ] `001_additions.sql`
- [ ] `002_super_admin_trial_periods_tuition.sql`
- [ ] `003` through `017` (run in numeric order)
- [ ] `023_branch_phone.sql`
- [ ] `024` through `026` (parent RLS)
- [ ] `031_rls_tenant_hardening.sql`
- [ ] `032_impersonation_audit_log.sql`
- [ ] `033_billing_fee_type_id.sql`
- [ ] `036_audit_logs.sql`
- [ ] `037_proud_moments_hardening.sql`
- [ ] `038_storage_hardening.sql`
- [ ] `039_phase1_1_hardening.sql`
- [ ] `040_subscription_status.sql`
- [ ] `041_uploaded_files.sql`
- [ ] `042_uploaded_files_staff_write.sql`

After each migration: confirm no error in the SQL Editor output.

---

## 3. Storage Buckets

- [ ] `updates-media` bucket created as **private** (Dashboard → Storage → New bucket → uncheck Public)
- [ ] `profile-photos` bucket created as **public** (current design — avatars served directly)
- [ ] Storage RLS policies applied — confirmed by migration 038

**Known risk:** `profile-photos` is public. Student and teacher avatars are accessible without authentication. This is acceptable for pilot but should be migrated to a private bucket before full production. See `docs/PRIVACY_REVIEW_NOTES.md`.

---

## 4. Super Admin Account

- [ ] Super admin user registered at `/login`
- [ ] Profile set to `role = 'super_admin'` in SQL:
  ```sql
  UPDATE profiles SET role = 'super_admin', full_name = 'Your Name'
  WHERE email = 'your@email.com';
  ```
- [ ] Super admin can access `/super-admin/schools`
- [ ] Super admin can create a school and impersonate it

---

## 5. Demo / Test School

- [ ] Demo school created via super admin with `is_demo = true`
- [ ] Demo school has `trial_status = 'active'` with an extended trial end date
- [ ] Demo school excluded from paid/active metrics in super admin panel
- [ ] Demo data uses pseudonyms or initials (no real student names)

---

## 6. Pilot School Setup

- [ ] Pilot school created in super admin
- [ ] Trial dates set appropriately (14 days default, extend as needed)
- [ ] `subscription_status = 'trial'` confirmed
- [ ] School admin user linked to the school
- [ ] Admin can log in and see the dashboard

---

## 7. Environment Variables

- [ ] `.env.local` is **not** committed to git (`.gitignore` already excludes `.env*.local`)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — production project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — production service role key (server-side only)
- [ ] `NEXT_PUBLIC_APP_URL` — set to production domain (for invite links)
- [ ] If deploying to Vercel: all env vars added to Vercel project settings

---

## 8. Email / Invite Flow

- [ ] Supabase Auth email templates configured (optional but recommended for branding)
- [ ] Invite link base URL resolves correctly (`NEXT_PUBLIC_APP_URL/invite?token=...`)
- [ ] Test invite: admin sends invite → parent receives email → clicks link → account created → linked to student

---

## 9. Audit & Tracking

- [ ] `audit_logs` table exists and has rows after test actions
- [ ] `impersonation_audit_log` table exists
- [ ] `uploaded_files` table exists — rows appear after a file upload
- [ ] Super admin Storage Usage panel shows data after uploads

---

## 10. Backups

- [ ] Supabase Pro plan enabled (includes daily backups) OR backup strategy documented
- [ ] Manual export taken before pilot starts: Dashboard → Database → Backups or pg_dump
- [ ] See `docs/BACKUP_AND_RECOVERY.md` for full guidance

---

## 11. Functional Smoke Test

Complete before handing access to the pilot school:

- [ ] Admin login works
- [ ] Create a class
- [ ] Add a student with guardian email
- [ ] Send guardian invite → guardian accepts → parent login works
- [ ] Mark attendance for a class
- [ ] Post a class update with a photo → parent sees it in parent portal
- [ ] Generate a billing record → record a payment → parent sees it in billing portal
- [ ] Add a proud moment
- [ ] Upload a school logo → appears in sidebar
- [ ] Super admin can impersonate the school and exit

---

## 12. Known Remaining Risks

See `docs/PRIVACY_REVIEW_NOTES.md` for the full list. Summary:

- Profile photos bucket is public (acceptable for pilot)
- No automated media deletion job (orphaned files accumulate — manual cleanup only)
- Impersonation writes are allowed and audited, not blocked
- TypeScript `any` casts in 15+ places (not a security risk, code quality only)
