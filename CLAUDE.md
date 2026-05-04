# Lauris Learn – Project Reference

**SaaS school operations platform.** Pilot school: Bright Kids Learning and Tutorial Center (BK).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Icons | Lucide React |
| Dates | date-fns |
| UI lib | Custom components in `src/components/ui/` |

---

## Repo Structure

```
src/
  app/
    page.tsx                    — Landing / home
    login/page.tsx              — Login page
    (dashboard)/
      layout.tsx                — Shell: Sidebar + Header + SchoolProvider
      dashboard/page.tsx        — Dashboard overview
      students/page.tsx         — Students + guardian management
      classes/page.tsx          — Class setup
      attendance/page.tsx       — Daily attendance marking
      enrollment/page.tsx       — Inquiry pipeline + funnel analytics
      events/page.tsx           — School events
      billing/page.tsx          — Billing records + payments + generate modal
      progress/page.tsx         — Student progress observations
      online-classes/page.tsx   — Online session scheduling
      updates/page.tsx          — Parent updates / class feed + broadcast
      documents/page.tsx        — Document Coordination workspace (IEPs, therapy reports, etc.)
      settings/page.tsx         — School years + holidays
    api/
      documents/[id]/access/route.ts — Phase C choke point: log_document_access RPC + service-role signed URL
  components/
    layout/
      Header.tsx
      Sidebar.tsx
    ui/
      badge.tsx | button.tsx | card.tsx | input.tsx
      modal.tsx | select.tsx | spinner.tsx | textarea.tsx | tooltip.tsx
      datepicker.tsx            — Custom date picker (portal-based, matches design system)
      monthpicker.tsx           — Custom month picker (portal-based, matches design system)
      avatar-upload.tsx
  contexts/
    SchoolContext.tsx            — schoolId, activeYear, userId, userRole, userName
  lib/
    supabase/client.ts          — Browser client
    supabase/server.ts          — Server client
    supabase/middleware.ts      — Session refresh
    types/database.ts           — Full TypeScript types for all tables
    utils.ts                    — formatCurrency, formatTime, getInitials, cn
  middleware.ts                 — Route protection
  app/
    invite/                     — Invite flow for parents (guardian linking)
    parent/
      layout.tsx                — Parent shell: bottom nav (6 items) + ParentContext
      dashboard/page.tsx        — Parent dashboard: attendance, announcements, updates, billing alert
      student/page.tsx          — Child profile view
      updates/page.tsx          — Class updates feed (with photos + refresh)
      billing/page.tsx          — Billing history + receipts + payment photo
      progress/page.tsx         — Child progress observations (parent_visible only)
      events/page.tsx           — Upcoming events + RSVP (going/not going/maybe)
    care/                       — Phase 6A read-only Lauris Care clinic portal
      layout.tsx                — Care shell: org switcher + bottom nav (Children, Documents) + CareContext; redirects no-membership users to access-denied
      page.tsx                  — Redirects to /care/children
      children/page.tsx         — Granted children list (active child_profile_access_grants)
      children/[childProfileId]/page.tsx — Child detail (identity + identifiers + per-child shared documents)
      documents/page.tsx        — Cross-child shared documents list, anchored on list_documents_for_organization RPC
      access-denied/page.tsx    — Friendly state for authed users with no clinic memberships
    api/care/documents/[id]/access/route.ts — Phase 6A access route: log_document_access_for_organizations RPC + service-role signed URL
supabase/
  schema.sql                    — Full DB schema (run first on fresh project)
  migrations/001_additions.sql  — Indexes + visibility column + seed data
  migrations/014_updates_media_bucket.sql — Storage bucket for update photos (private)
  migrations/015_parent_updates_update_policy.sql — RLS UPDATE policy on parent_updates
  migrations/016_parent_features.sql — absence_notifications table, event_rsvps unique index,
                                        parent RLS on progress_observations
  migrations/017_payment_receipt_photo.sql — receipt_photo_path column on payments
  migrations/033_billing_fee_type_id.sql — fee_type_id UUID column on billing_records (FK → fee_types, ON DELETE SET NULL)
src/features/billing/              — Billing feature module (extracted from billing/page.tsx)
  types.ts                         — All billing TypeScript types
  constants.ts                     — SCOPE_LABELS, TYPE_LABELS, EMPTY_PAYMENT, STATUS_OPTS, etc.
  utils.ts                         — formatMonth, computeStatus, getAgingDays, printContent, etc.
  StudentCombobox.tsx              — Self-contained student search combobox
  SetupFeeTypesTab.tsx             — Fee types CRUD tab
  SetupTuitionTab.tsx              — Tuition configs CRUD tab (per academic period)
  SetupAdjustmentsTab.tsx          — Discounts + student credits CRUD tab
src/features/documents/            — Document Coordination feature module (Phases C–D)
  types.ts                         — DocumentType / Status / ConsentScope / GrantPermissions / API contract types
  constants.ts                     — DOCUMENT_TYPE_LABELS, STATUS_LABELS, EXPIRY_PRESETS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES
  utils.ts                         — formatDocumentType, formatBytes, formatDate, daysUntil, relativeWindow, studentDisplay
  queries.ts                       — listDocuments, getDocument, listVersions; DocumentListItem view-model
  documents-api.ts                 — Phase C wrapper: getDocumentAccess(), openDocumentForAccess(), DocumentAccessError
  DocumentsList.tsx                — Workspace table
  DocumentRow.tsx                  — Single row + per-row View/Download
  DocumentAccessButton.tsx         — Calls Phase C API; signed URL never stored in state
  DocumentDetailModal.tsx          — Overview + Versions tabs (read-only); hidden versions visible to staff only
  UploadDocumentModal.tsx          — D7: 5-step transactional upload with rollback; client-side UUIDs (no INSERT…RETURNING)
  UploadVersionModal.tsx           — D8: adds v(N+1) to existing doc with same transactional/rollback shape
  HideVersionModal.tsx             — D8: sets is_hidden + reason; pre-flight refuses to orphan a non-draft doc
  ConfirmStatusModal.tsx           — D9: draft→active and active|shared→archived, with contextual warnings + optional archive_reason
  ShareDocumentModal.tsx           — D10 + D12: staff or external sharing in one modal, with consent gating
  ConsentRequestModal.tsx          — D11: drafts a `document_consents` row in `pending` for an external contact
  ExternalContactPicker.tsx        — D12: combobox + inline-create form over `external_contacts`
  RevokeAccessModal.tsx            — D13: confirms per-grant revoke; sets revoked_at/revoked_by/revoke_reason
  RequestDocumentModal.tsx         — D14: ask a parent or external contact for a missing document
  RequestsList.tsx                 — D14: table of `document_requests` rows for the workspace's Requests view
  CancelRequestModal.tsx           — D14: confirm cancel with optional reason; sets status='cancelled'
  share-api.ts                     — D10/D12/D13: listSchoolStaffForSharing (RPC), listGrantsForDocument, createInternalGrant, createExternalGrant, revokeGrant
  consent-api.ts                   — D11/D12: listExternalContacts, createExternalContact, listConsentsForDocument, pickValidConsentForExternal, createConsentDraft
  requests-api.ts                  — D14: listRequests, createRequest, cancelRequest, listGuardiansForStudent
  events-api.ts                    — D15: listAccessEvents (newest-first, capped at 50)
supabase/migrations/054_child_documents.sql            — Phase A: 4 enums + 7 tables + integrity triggers, RLS default-deny
supabase/migrations/055_child_documents_storage.sql    — Phase B: child-documents private bucket + storage RLS
supabase/migrations/056_child_documents_rls.sql        — Phase B: helpers + RLS + log_document_access RPC
supabase/migrations/057_document_access_events_actor_fk.sql — actor_user_id FK profiles → auth.users
supabase/migrations/065_list_school_staff_for_sharing.sql   — D10: SECURITY DEFINER RPC for the staff picker
supabase/migrations/066_teacher_profile_auth_bridge.sql     — Adds `teacher_profiles.auth_user_id` and rewrites the 3 teacher RLS helpers/policies to resolve auth.uid() through the bridge (fixes 058 regression)
supabase/migrations/067_doc_triggers_security_definer.sql   — Marks triggers 5.F (consent JSONB) and 5.G (grant invariants) as SECURITY DEFINER so the cross-RLS profile/external_contact lookups they perform actually find their target rows
supabase/migrations/068_consents_parent_guard_null_role.sql — D16-era fix: parent transition guard now uses `IS DISTINCT FROM` so NULL-role callers (SQL editor, service-role) early-return correctly. Also marks the trigger SECURITY DEFINER for forward-compat with cron / admin scripts
src/features/plans/                — Plans & Forms feature module (structured internal plans, distinct from uploaded child_documents)
  types.ts                          — PlanType / PlanStatus, Row aliases, PlanListItem / PlanFull view-models
  constants.ts                      — PLAN_TYPE_LABELS, PLAN_STATUS_LABELS, IEP_SECTIONS, GOAL_DOMAIN_SUGGESTIONS
  queries.ts                        — listPlans, getPlan, savePlan (diff-save sub-rows), setPlanStatus
  PlansAndFormsView.tsx             — entry view: 5 category cards (only IEP active in v1) + IEP plans list + status filter + New IEP Plan button
  IEPPlansList.tsx                  — read-only table of IEP plans with status badges
  IEPPlanModal.tsx                  — create/edit modal with 7 section tabs (Profile / Goals / Interventions / Progress / Parent / Review / Attachments). Save Draft + Submit For Review (all staff); Approve + Archive (admin only); Export PDF placeholder
supabase/migrations/070_student_plans.sql — Plans & Forms schema: 2 enums (plan_type, plan_status), 5 tables (student_plans + goals/interventions/progress_entries/attachments), RLS (school_admin FOR ALL, teacher SELECT + INSERT/UPDATE on visible students for non-terminal statuses, super_admin bypass), reuses set_updated_at + audit_log_trigger. Attachments REFERENCE existing child_documents — no new bucket
supabase/migrations/071_child_identity_layer.sql — Phase 1 shared child identity layer (additive). Adds `child_profiles` (school-agnostic, display_name NOT NULL + nullable legal_name + split first/middle/last/preferred + intl-flexible demographics) and `child_identifiers` (TEXT identifier_type, NULL-safe unique index on `(type, value, COALESCE(country_code,''))`). Adds nullable `students.child_profile_id` FK. Backfills 1:1 via a MATERIALIZED CTE that pre-mints UUIDs (no name/DOB matching). Copies `students.student_code` → `child_identifiers` as `school_internal` with `country_code='PH'` (identifier metadata only; child_profiles.country_code stays NULL). RLS strict default-deny with `is_super_admin()` bypass; visibility helper `caller_visible_child_profile_ids()` reuses existing student-visibility paths. Uses `gen_random_uuid()` (pgcrypto). Does not touch students/child_documents/student_plans behavior
supabase/migrations/072_organizations_and_child_memberships.sql — Phase 2 cross-app foundation (additive). Adds `organizations` (kind TEXT — 'school' | 'clinic' | 'medical_practice' | future kinds; reverse FK `school_id` to schools; partial unique on `(school_id) WHERE kind='school'`; CHECK forbids non-school orgs from carrying a school_id) and `child_profile_memberships` (one row per child↔org relationship — supports one-school + many-clinics + many-doctors). Backfills one school-org per existing school and one active 'enrolled_student' membership per linked student. New helper `caller_visible_organization_ids()` (school_admin/teacher/parent → their school's shadow org). RLS strict default-deny with `is_super_admin()` bypass; clinic/medical writes deferred (no policy → denied) until Phase 3. **No `organization_memberships` table yet — Lauris Learn keeps using `profiles.school_id` for authz; cross-app user identity lands in Phase 3 when Lauris Care users actually exist. No trigger on `schools` — explicit app logic only.** Phase 1 helper `caller_visible_child_profile_ids()` is unmodified
supabase/migrations/073_organization_memberships.sql — Phase 3 linking-only bridge (additive). Adds `organization_memberships` (TEXT role, status IN ('active','suspended','ended'), partial unique on `(org, profile) WHERE status='active'`). Re-emits `caller_visible_organization_ids()` with a fourth arm: any user with an active membership row → that org. **Strictly does NOT modify `caller_visible_child_profile_ids()`** — Phase 1 helper stays frozen because a membership represents a relationship, not consent to read child identity. Clinic users in Phase 3 can see their org, their own membership row, colleagues' memberships, and `child_profile_memberships` rows in their org (bare links — UUIDs they cannot dereference). Clinic users CANNOT see `child_profiles`, `child_identifiers`, or any school-linked data (schools, students, child_documents, student_plans, etc.). Cross-app identity visibility + consent lands in Phase 4. No backfill — Lauris Learn keeps using `profiles.school_id` + `profiles.role` unchanged
supabase/migrations/074_child_profile_access_grants.sql — Phase 4 explicit consent + identity visibility (additive). Adds `child_profile_access_grants` (source_organization_id → target_organization_id, granted_by_profile_id + granted_by_kind audit snapshot, scope IN ('identity_only','identity_with_identifiers') with only the former honoured by Phase 4 RLS, status IN ('active','revoked','expired'), `valid_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + 1 year`, partial unique on `(child_profile, target_org) WHERE status='active'`). Re-emits `caller_visible_child_profile_ids()` with a fifth arm gated by active grant + active membership + currently-valid window. Adds new no-op helper `caller_visible_child_profile_ids_for_identifiers()` (4 arms only — no grant arm) reserved for Phase 5 to flip the `child_identifiers` policy onto. **child_identifiers, child_documents, student_plans, students, schools — all stay HIDDEN to clinics in Phase 4.** Column-guard trigger restricts UPDATE to lifecycle columns only (status, valid_until, revoked_*). SELECT policy is asymmetric on purpose: school side (anyone seeing the child_profile) sees all grants for audit; clinic side (target-org members) sees ACTIVE grants only — defense-in-depth `status='active'` clamp on top of helper filtering. INSERT in Phase 4 is `super_admin` and `school_admin` only; parent self-grant path deferred. No backfill
supabase/migrations/075_identifier_sharing.sql — Phase 5A identifier sharing on the existing grant table (additive). Re-emits `caller_visible_child_profile_ids_for_identifiers()` with a 5th arm gated by `g.scope='identity_with_identifiers' AND g.status='active' AND g.valid_until > NOW() AND m.status='active'` PLUS an explicit target-org-kind guard (`o.kind IN ('clinic','medical_practice')`) so identifier visibility never flows to school or future org kinds even if a grant is mistakenly issued. Switches `child_identifiers` SELECT policy to use the new helper. **No new tables, no schema changes, no changes to child_profile_access_grants, child_profiles policies, or document/plan policies.** `status` remains audit-only; `valid_until` is the inline enforcement; no background expiry job. Updates 074 smoke test T-15 in place: replaces the helper-body assertion with four functional cases (identity_only hides identifiers / identity_with_identifiers exposes them / expired hides / revoked hides)
supabase/migrations/076_document_organization_access_grants.sql — Phase 5B cross-organization document sharing (strictly additive, isolated). Adds `document_organization_access_grants` (per-document only — `scope='document'`; source_school_id → target_organization_id of kind clinic/medical_practice; permissions JSONB `{view,download,comment,upload_new_version}` immutable post-insert; `status IN ('active','revoked','expired')`; `valid_until NOT NULL DEFAULT NOW()+1y`; partial unique on `(document, target_org) WHERE status='active'`; column-guard trigger keeps everything but lifecycle columns immutable). Adds new helper `caller_visible_document_ids_for_organizations()` and new RPC `log_document_access_for_organizations()` — same return shape as `log_document_access`. **`accessible_document_ids()` and `log_document_access` are intentionally NOT modified** — clinic users access docs only through the new helper / new RPC; the existing 6-arm document RLS stays byte-clean. Single existing-table touch is widening the `document_access_events.actor_kind` CHECK to add 'organization_member' for audit. No storage policy changes — service-role still mints signed URLs after RPC approval. Smoke test mechanically asserts the existing helper + RPC bodies don't reference Phase 5B artifacts (regression check). Identity grants and document grants are completely decoupled tables — clinic with identity_with_identifiers grant alone sees zero documents
supabase/migrations/077_care_portal_helpers.sql — Phase 6A enumeration helper for the Lauris Care portal (strictly additive). Adds one SECURITY DEFINER STABLE function `list_documents_for_organization(p_org_id UUID)` — anchored on `document_organization_access_grants`, gated up-front by an active `organization_memberships` row in `p_org_id`, returning enriched rows (title, doc_type, doc_status, current_version_id, version_number, mime_type, file_name, file_size_bytes, child_profile_id, permissions, grant_valid_until, grant_created_at). Resolves `child_profile_id` via `students.child_profile_id` server-side because clinic users have no SELECT on `students`. **Strictly does NOT modify** `accessible_document_ids()`, `log_document_access`, `log_document_access_for_organizations`, or `caller_visible_document_ids_for_organizations()` — smoke T-11 mechanically asserts those four bodies don't reference the new function. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated;` plus body-level `auth.uid()` check. No new tables, no RLS changes, no schema mutations. The Phase 6A `/care` portal anchors document enumeration on this helper instead of joining through `students`
supabase/migrations/078_clinic_origin_children.sql — Phase 6B clinic-origin children (strictly additive). Adds `child_profiles.origin_organization_id UUID NULL REFERENCES organizations(id)` + partial index. Two new triggers: `cp_origin_kind_validate` (kind guard — origin must be clinic or medical_practice org, SECURITY DEFINER for the cross-RLS lookup), and `cp_origin_immutable_guard` (locks origin post-insert in ALL directions — NULL→non-NULL, non-NULL→NULL, non-NULL→other — with `is_super_admin()` the only bypass). **Single consolidated helper `caller_owned_child_profile_ids()` (SECURITY DEFINER STABLE)** — returns child_profile ids where the caller has any active membership in the profile's origin_organization_id (kind=clinic/medical_practice). Role-agnostic; INSERT policies add an inline `role='clinic_admin'` check on top. Scope discipline: helper is for Phase 6B Care-portal ownership ONLY — NOT reused for cross-org sharing, school-side logic, or global APIs. Ownership ≠ grant-based access. **Strictly does NOT modify** `caller_visible_child_profile_ids()` or `caller_visible_child_profile_ids_for_identifiers()` — smoke T-2 mechanically asserts byte-clean preservation. The two SELECT policies on `child_profiles` and `child_identifiers` are re-emitted to OR-in the consolidated helper alongside the existing visibility helper (a POLICY change, not a HELPER change). Three new INSERT policies for clinic admins: `clinic_admin_insert_child_profiles` (origin must be own org, inline EXISTS membership check since row doesn't exist yet), `clinic_admin_insert_child_profile_memberships` (relationship_kind='clinic_client', child in caller's owned set, (child, org) consistent, caller is clinic_admin), `clinic_admin_insert_child_identifiers` (child in caller's owned set, caller is clinic_admin of origin org). UPDATE/DELETE on the clinic side are deferred. School-side policies untouched. Critical isolation: school_admin sees 0 rows for clinic-owned children (T-12); cross-clinic SELECTs return 0 (T-11); LRN collision rejected cross-origin (T-15)
src/features/care/                 — Phase 6A/6B read-only Lauris Care clinic portal feature module
src/features/care/                — Phase 6A read-only Lauris Care portal feature module
  types.ts                          — ClinicMembership / GrantedChild / ChildIdentity / ChildIdentifier / SharedDocument / DocPermissions / API contract types
  queries.ts                        — listMyClinicMemberships, listGrantedChildren, getChildIdentity, listChildIdentifiers, listSharedDocuments (the last calls list_documents_for_organization RPC)
  care-documents-api.ts             — Client wrapper around POST /api/care/documents/[id]/access; openCareDocumentForAccess() opens signed URL in new tab and dereferences
  CareContext.tsx                    — Active org selection + memberships + user identity
  ChildrenList.tsx                   — Combined children table. Phase 6B: 'Clinic client' badge for owned children (originType='owned'); 'Shared · Identity' / 'Shared · Identity + IDs' for grants
  ChildDetailView.tsx                — Identity card + Identifiers card (locked when shared scope=identity_only) + per-child documents. Phase 6B: branches on origin; owned children always show identifiers and an empty-state for documents
  SharedDocumentsList.tsx            — Cross-child or per-child document table with View/Download buttons (Download hidden when permissions.download=false)
  CareDocumentAccessButton.tsx       — Calls /api/care/documents/[id]/access; signed URL never stored in state
  NewChildModal.tsx                  — Phase 6B clinic-admin only. Creates child_profile + 'clinic_client' membership + optional identifiers with best-effort rollback
  EditChildModal.tsx                 — Phase 6B.1 clinic-admin only. Edits the 11 identity/demographic fields on an owned child_profile. Origin and identifiers excluded (origin is immutable; identifiers managed separately)
  ManageIdentifiersModal.tsx         — Phase 6B.1 clinic-admin only. Per-row add/save/delete on an owned child's identifiers; surfaces 23505 collisions as "This identifier is already registered. If this is the same child, contact support to link records."
  clinic-documents-api.ts            — Phase 6C: listClinicDocumentsForChild, createClinicDocument (5-step transactional upload with rollback, client UUIDs to avoid INSERT…RETURNING / SELECT-policy interaction documented in D7), setClinicDocumentStatus, setClinicDocumentDownload, openClinicDocumentForAccess wrapper around POST /api/care/clinic-documents/[id]/access. Twin of care-documents-api.ts but routes through log_clinic_document_access RPC and the parallel clinic-documents bucket.
  UploadClinicDocumentModal.tsx      — Phase 6C clinic-admin only. Title + kind (datalist of common kinds, normalized server-side to LOWER(TRIM)) + description + dates + file (PDF/JPEG/PNG/WebP, ≤25 MB) + allow_download checkbox. Initial status defaults to 'active' once a usable version is attached.
  ClinicDocumentsList.tsx            — per-child clinic-internal document list. Per-row View + Download buttons (Download hidden when permissions.download=false and caller isn't admin); admin actions: toggle download, archive / restore.
  ClinicDocumentAccessButton.tsx    — Calls POST /api/care/clinic-documents/[id]/access. Signed URL never stored in state; opened via window.open with noopener.
```

src/features/clinic-sharing/  — Phase 6D school-side clinic-sharing feature module
  types.ts                          — ClinicOrgOption / IdentityGrantRow / DocumentGrantRow / SchoolStudentForSharing / SchoolDocumentForSharing types
  queries.ts                        — getSchoolOrganizationId, searchClinicOrganizations, createClinicOrganization, lookupClinicOrganizations (all 3 backed by 080 RPCs); listSchoolStudentsForSharing, listSchoolDocumentsForSharing, listIdentityGrants, createIdentityGrant, listDocumentGrants, createDocumentGrant, revokeIdentityGrant, revokeDocumentGrant. 23505 mapped to "Already shared with this clinic. Revoke first to issue a new grant."
  ClinicOrganizationPicker.tsx      — Search-first combobox over clinic/medical_practice orgs. Inline-create form is HIDDEN by default; auto-expands ONLY when search returns zero results AND a query is present (Phase 6D adjustment 2: force search before allow create).
  ShareIdentityWithClinicModal.tsx  — student picker (own-school only) + clinic picker + scope radio (identity_only / identity_with_identifiers) + expiry presets/custom + purpose. Confirmation strip. Used both from the central tab and from per-student row entry (lockedChildProfileId).
  ShareDocumentWithClinicModal.tsx  — document picker (school's docs in active|shared) + clinic picker + permissions (view always on, download opt-in; comment + upload_new_version locked off in v1) + expiry. Used both centrally and from DocumentDetailModal.Access (lockedDocumentId).
  RevokeClinicGrantModal.tsx        — universal revoke modal (kind: 'identity' | 'document') with optional reason. Sets revoked_at / revoked_by_profile_id / revoke_reason / status='revoked'.
  IdentityGrantsTable.tsx           — Active + No-longer-active sections, per-row Revoke action on active grants. Reuses Badge variants (active / revoked / archived).
  DocumentGrantsTable.tsx           — Same shape, with permission pills (View / Download).
  ClinicSharingView.tsx             — Mounts inside /documents as the 4th tab "Clinic Sharing". Two sections (Identity grants, Document grants), each with status filter (Active / All) + New share button. School-admin only.

After migration 081: `supabase/migrations/081_clinic_documents.sql` adds the clinic-internal document subsystem (Phase 6C). Three new tables — `clinic_documents` (head), `clinic_document_versions` (chain), `clinic_document_access_events` (audit). New private storage bucket `clinic-documents` with INSERT/UPDATE policies gated to `clinic_admin` of `foldername(name)[1]`; no client SELECT (service-role-only via the API route, same choke-point pattern as `child-documents`). New SECURITY DEFINER RPC `log_clinic_document_access(p_doc_id, p_action, p_ip, p_user_agent)` returns the same JSONB shape as `log_document_access_for_organizations` (5B); honours per-doc permissions JSONB `{view, download}` with `clinic_admin` of origin always allowed to download (override). Three triggers: origin/child consistency (SECURITY DEFINER), immutability column-guard (origin_organization_id, child_profile_id, created_by_profile_id all locked post-insert with `is_super_admin()` bypass), and document_kind normalization (BEFORE INSERT/UPDATE → `LOWER(TRIM(kind))`). Status enum tightened to `draft|active|archived` (no `shared`/`revoked` — cross-org sharing is deferred). RLS: SELECT for any active member of origin org, INSERT/UPDATE for `clinic_admin` only, no DELETE policy. **Strictly does NOT modify** `accessible_document_ids()`, `log_document_access`, `log_document_access_for_organizations`, `list_documents_for_organization`, `caller_owned_child_profile_ids`, or any existing policy on `child_documents` / `child_document_versions` / `document_access_events` — smoke 081 mechanically asserts this.

After migration 080: `supabase/migrations/080_clinic_sharing_rpcs.sql` adds three SECURITY DEFINER STABLE/VOLATILE RPCs — `list_clinic_organizations_for_sharing(query, limit)`, `create_clinic_organization_for_sharing(kind, name, country)`, `lookup_clinic_organizations(ids[])` — all role-gated to `school_admin`, all REVOKE FROM PUBLIC + GRANT EXECUTE TO authenticated. Required because the 072 `organizations` SELECT policy hides clinic/medical_practice rows from school_admin and INSERT clamps to kind='school'. Same precedent as `doag_is_clinic_or_medical_org` (076) and `list_school_staff_for_sharing` (065). **Strictly does NOT modify** `caller_visible_organization_ids()`, the organizations RLS policies, the existing grant tables, the column-guard triggers, or any Care-portal artifact. Smoke 080 mechanically asserts byte-cleanliness via `pg_get_functiondef` regression check.

After migration 079: `supabase/migrations/079_clinic_admin_child_edits.sql` adds three policies (`clinic_admin_update_child_profiles`, `clinic_admin_update_child_identifiers`, `clinic_admin_delete_child_identifiers`) plus two BEFORE UPDATE triggers scoped to clinic-owned rows. `cp_clinic_owned_noop_guard` rejects no-op UPDATEs on `child_profiles` (SQLSTATE 22000) to avoid audit noise / probing. `ci_clinic_owned_update_guard` locks `child_profile_id` immutable on UPDATE (42501) and rejects identifier no-ops (22000). Both triggers bypass on `is_super_admin()` and only fire when `origin_organization_id IS NOT NULL`. **Strictly does NOT modify** `caller_visible_child_profile_ids()`, the identifier helper, the ownership helper, the 078 origin-immutability trigger, or any school-side policy. **No DELETE on `child_profiles`** — deferred until a future archive lifecycle column.

---

## Database Schema (Key Tables)

All tables include `school_id` for multi-tenant isolation. RLS is enabled on all tables.

| Table | Purpose |
|---|---|
| `schools` | Top-level tenants |
| `branches` | Sub-locations per school |
| `school_years` | Academic years; one `active` per school (enforced by unique index) |
| `profiles` | Extends `auth.users`; roles: `super_admin`, `school_admin`, `teacher`, `parent` |
| `classes` | Scoped to `school_id` + `school_year_id` |
| `class_teachers` | Many-to-many: class ↔ teacher profile |
| `students` | Student records per school |
| `guardians` | Multiple guardians per student; `is_primary` flag |
| `enrollments` | Student ↔ class ↔ school_year; statuses: `inquiry`, `waitlisted`, `enrolled`, `withdrawn`, `completed` |
| `attendance_records` | Per student per class per date; unique constraint prevents duplicates |
| `parent_updates` | Class feed posts by teachers |
| `billing_records` | Monthly billing per student; statuses: `unpaid`, `partial`, `paid`, `overdue` |
| `payments` | Multiple payments per billing record; methods: `cash`, `bank_transfer`, `gcash`, `maya`, `card`, `other` |
| `holidays` | No-class days per school |
| `events` | School events; `applies_to`: `all`, `class`, `selected` |
| `event_rsvps` | Student RSVP per event |
| `enrollment_inquiries` | Lead pipeline; statuses: `inquiry`, `assessment_scheduled`, `waitlisted`, `offered_slot`, `enrolled`, `not_proceeding` |
| `online_class_sessions` | Scheduled online sessions per class |
| `progress_categories` | Observation dimensions (7 default: Participation, Social Skills, etc.) |
| `progress_observations` | Per-student ratings; `visibility`: `internal_only` or `parent_visible` |
| `child_documents` | Document head (logical doc) — IEPs, therapy reports, medical certs, etc. Statuses: `draft`, `active`, `shared`, `archived`, `revoked`. `current_version_id` follows the latest non-hidden version |
| `child_document_versions` | One row per uploaded file. Linked-list versioning via `(document_id, version_number)`. `is_hidden` for wrong-upload recovery |
| `external_contacts` | Doctors, therapists, clinic staff. Email-keyed, school-scoped. Not auth users — they magic-link in |
| `document_consents` | Parent authorization. `granted_by_guardian_id` is the source of truth. JSONB `scope` (`document` / `document_type` / `all_for_student`) and `recipients` array |
| `document_access_grants` | Document-level access for school/school_user/external_contact grantees. External grants always require `consent_id`; cascade-revoked when parent revokes consent |
| `document_requests` | Request-document workflow (school↔parent / school↔external) |
| `document_access_events` | View/download audit. Append-only via `log_document_access` RPC; no client write policy |
| `child_profiles` | Phase 1 shared child identity (school-agnostic). `display_name` NOT NULL fallback for apps that don't capture legal-name detail; `legal_name` + split first/middle/last/preferred optional. Linked from `students.child_profile_id` (nullable). |
| `child_identifiers` | Open identifier table for LRN, passport, national_id, etc. `identifier_type` is TEXT (no enum) for international flexibility. NULL-safe uniqueness via partial unique index. |
| `organizations` | Phase 2 generic tenant for school / clinic / medical_practice. `kind` is TEXT (no enum). Reverse FK `school_id` shadows each existing school; partial unique index enforces 1:1; CHECK forbids non-school orgs from setting `school_id`. Clinic / medical_practice rows have `school_id IS NULL`. |
| `child_profile_memberships` | Phase 2 child↔organization relationships. Models one-school + many-clinics + many-doctors per child. `relationship_kind` TEXT, `status IN ('active','ended')`, partial unique index keeps one active membership per (child, org). |
| `organization_memberships` | Phase 3 user↔organization auth bridge for sister apps (Lauris Care, Lauris Med). `role` TEXT (no enum), `status IN ('active','suspended','ended')`, partial unique on `(org, profile) WHERE status='active'`. Lauris Learn does NOT populate this table; school authz still flows through `profiles.school_id` + `profiles.role`. |
| `child_profile_access_grants` | Phase 4 explicit consent record authorising a target org (clinic / medical practice) to read a `child_profile`. `scope IN ('identity_only','identity_with_identifiers')` — only `identity_only` is honoured by Phase 4 RLS; identifier sharing is Phase 5. `status IN ('active','revoked','expired')`. `valid_until` is NOT NULL with default `NOW() + 1 year`. Partial unique on `(child_profile, target_org) WHERE status='active'`. Column-guard trigger keeps `child_profile_id`, `source_organization_id`, `target_organization_id`, `granted_by_*`, `scope`, `purpose`, `valid_from`, `created_at` immutable post-insert. |
| `document_organization_access_grants` | Phase 5B per-document grant from a school to a clinic / medical-practice org. `scope='document'` only (column kept TEXT for future widening). `permissions` JSONB `{view, download, comment, upload_new_version}` is **immutable** post-insert — change permissions = revoke and re-grant. `status IN ('active','revoked','expired')`, `valid_until NOT NULL DEFAULT NOW()+1y`, partial unique on `(document, target_org) WHERE status='active'`. **Completely separate from `child_profile_access_grants`** — identity grants and document grants are distinct decisions. **Existing `accessible_document_ids()` and `log_document_access` are NOT modified** — clinic users go through the dedicated helper `caller_visible_document_ids_for_organizations()` and RPC `log_document_access_for_organizations()`. |

### Enums

```
school_year_status: draft | active | archived
user_role: super_admin | school_admin | teacher | parent
enrollment_status: inquiry | waitlisted | enrolled | withdrawn | completed
attendance_status: present | late | absent | excused
billing_status: unpaid | partial | paid | overdue
payment_method_type: cash | bank_transfer | gcash | maya | card | other
payment_status_type: pending | confirmed | failed | refunded
event_applies_to: all | class | selected
rsvp_status: going | not_going | maybe
inquiry_status: inquiry | assessment_scheduled | waitlisted | offered_slot | enrolled | not_proceeding
online_class_status: scheduled | live | completed | cancelled
progress_rating: emerging | developing | consistent | advanced
observation_visibility: internal_only | parent_visible
document_type: iep | therapy_evaluation | therapy_progress | school_accommodation
             | medical_certificate | dev_pediatrician_report | parent_provided
             | other_supporting
document_status: draft | active | shared | archived | revoked
consent_status: pending | granted | revoked | expired
request_status: requested | submitted | reviewed | cancelled
```

### Seed Data (from 001_additions.sql)

- School ID: `00000000-0000-0000-0000-000000000001` — "Bright Kids Learning and Tutorial Center"
- Branch: "Main Branch"
- School Year ID: `00000000-0000-0000-0000-000000000002` — "SY 2025–2026" (active)
- 7 default progress categories pre-inserted

---

## SchoolContext

Available everywhere inside `(dashboard)/` via `useSchoolContext()`:

```ts
schoolId: string | null
schoolName: string
activeYear: { id, name, startDate, endDate, status } | null
userId: string | null
userRole: 'super_admin' | 'school_admin' | 'teacher' | 'parent' | null
userName: string
loading: boolean
refresh: () => void   // call after changing school-level settings
```

## ParentContext

Available everywhere inside `app/parent/` via `useParentContext()`:

```ts
childId: string | null       // selected child's student ID
child: ChildInfo | null      // full child object
schoolName: string
schoolId: string | null      // needed for scoped queries in parent pages
classId: string | null       // child's active enrolled class ID
messengerLink: string | null // class messenger link
```

---

## Supabase Setup (New Project)

1. Run `supabase/schema.sql` in SQL Editor
2. Run all migrations in order (`001` → `033`) in SQL Editor
3. In Supabase Dashboard → Storage, create a **private** bucket named `updates-media` (migration 014 adds its RLS policies). Receipt photos also upload here under the `payment-receipts/` prefix.
4. Sign up as admin user via `/login`
5. In SQL Editor, assign the admin to BK school:
   ```sql
   UPDATE profiles
     SET school_id = '00000000-0000-0000-0000-000000000001',
         role      = 'school_admin',
         full_name = 'Your Name'
   WHERE email = 'your@email.com';
   ```
6. Add sample classes if needed (see commented SQL in 001_additions.sql)

### Storage Buckets

Currently all media lives in one private bucket (`updates-media`). Path conventions:
- `updates-media/{post_id}/{filename}` — class update photos
- `payment-receipts/{schoolId}/{paymentId}.{ext}` — payment receipt photos (school-scoped to avoid collisions)

**Future split (not yet done):** Separate `receipts` bucket (admin-only RLS) and `student-documents` bucket when the document hub is built. The current single-bucket approach works but means receipt photos share RLS policies with update photos.

---

## What Is Built and Functional

| Area | Status | Notes |
|---|---|---|
| Project scaffold | ✅ Complete | Next.js 16, TS, Tailwind v4, Supabase wired |
| Auth flow | ✅ Complete | Supabase Auth, middleware, login page |
| SchoolContext | ✅ Complete | schoolId, activeYear, userRole resolved on load |
| Dashboard | ✅ Complete | Live stats: enrolled, attendance, billing, events, enrollment snapshot |
| Students | ✅ Complete | List, search, add/edit student + guardian, filter by class/status |
| Classes | ✅ Complete | List, add/edit/deactivate, assign teacher, capacity tracking |
| Attendance | ✅ Complete | Class + date selector, mark per-student, save bulk, holiday-aware |
| Enrollment pipeline | ✅ Complete | Inquiry list, status progression, add inquiry, notes |
| Events | ✅ Complete | List, add/edit event, applies-to filter |
| Billing | ✅ Complete | Billing records list, record payment modal, status tracking |
| Parent updates | ✅ Complete | Post update (text + photos), filter by class, feed display; photos stored in private bucket with signed URLs |
| Progress tracking | ✅ Complete | Observations per student, rating + visibility, category-based |
| Online classes | ⚠️ Partial | UI scaffolded, not wired to Supabase (static state only) |
| Settings | ✅ Complete | School years (CRUD, set active), academic periods (CRUD), holidays management |
| Finance Setup | ✅ Complete | Fee types, tuition configs per period/level, discounts, student credits |
| Super Admin Panel | ✅ Complete | Schools list, trial management, create school, impersonation |
| Trial System | ✅ Complete | Trial banner in dashboard, read-only on expiry, days countdown |
| UI component library | ✅ Complete | Button, Card, Input, Modal, Select, Textarea, Badge, Spinner, DatePicker, MonthPicker |
| Parent portal — progress | ✅ Complete | `/parent/progress` shows parent_visible observations, latest per category, rating bars |
| Parent portal — events + RSVP | ✅ Complete | `/parent/events` shows upcoming events, RSVP buttons (going/not going/maybe), upsert on conflict |
| Parent portal — absence reporting | ✅ Complete | Parent dashboard: "Report absent today" button → optional reason → notifies school; teacher sees amber badge on attendance page |
| Parent portal — announcements | ✅ Complete | Parent dashboard shows school-wide broadcasts (class_id IS NULL) in a separate Announcements section |
| Enrollment funnel analytics | ✅ Complete | `/enrollment` Analytics view: conversion %, funnel bars, source breakdown, class demand table |
| Broadcast announcements | ✅ Complete | Updates page: Broadcast modal → posts to parent_updates with class_id=null (school-wide) or specific class |
| Billing — receipt photo upload | ✅ Complete | Record Payment modal has optional photo upload; stored in updates-media/payment-receipts/{schoolId}/{paymentId}.ext; viewable via signed URL in payment history |
| Billing — generate modal | ✅ Complete | Merged Generate Billing modal: "Use tuition rates" vs "Flat amount" toggle, month range, fee type, due date modes (none/fixed/nth-weekday), skip existing, mark as paid shortcut |
| Billing — UX restructure | ✅ Complete | Bills tab = "What students owe"; Payments tab = "What's been collected"; paid/settled hidden by default; per-row edit OR#/receipt + print in Payments tab |
| Billing — edit payment | ✅ Complete | Pencil icon per payment row (both Payment History modal and Payments tab) opens Edit OR#/receipt photo modal |
| Document Coordination — schema | ✅ Complete | Migrations 054 + 057. 7 tables, 4 enums, integrity triggers (current_version validation, hide-version repointing, consent JSONB validation, grant↔consent invariant, consent-revoke cascade), chain/head versioning, RLS default-deny |
| Document Coordination — storage | ✅ Complete | Migration 055. Private `child-documents` bucket, 25 MB, PDF/JPEG/PNG/WebP. Path `{school_id}/{student_id}/{doc_id}/v{n}.{ext}`. No client SELECT — service-role only after RPC approval |
| Document Coordination — RLS + RPC | ✅ Complete | Migration 056. Helpers `parent_guardian_ids`/`external_contact_ids_for_caller`/`teacher_visible_student_ids`/`accessible_document_ids`. Per-table RLS for school_admin/teacher/parent/external_contact (no super_admin bypass — strict). Column-level guards on consent transitions and grant revoke. `log_document_access` RPC: gatekeeper + audit logger combined; never returns a signed URL |
| Document Coordination — access route | ✅ Complete | `POST /api/documents/[id]/access`. Authenticates with cookie session, calls RPC under user's session, then service-role mints 60-second signed URL. Sanitized error mapping (404 collapse for "don't reveal existence", 403 for download_not_permitted, 401 unauthenticated) |
| Document Coordination — workspace UI (D1–D6) | ✅ Complete | `/documents` workspace page, sidebar entry, list + filters, status badges, read-only DocumentDetailModal (Overview + Versions tabs), View/Download via Phase C API, `?student=<id>` query param + link from Students page rows |
| Document Coordination — Upload modal (D7) | ✅ Complete | `UploadDocumentModal`: form + 5-step transactional upload with rollback. Client-side UUIDs (no INSERT…RETURNING — that combination + the SELECT policy on the just-inserted row was rejecting in this codebase). New docs land as `draft` |
| Document Coordination — Version modals (D8) | ✅ Complete | `UploadVersionModal` (adds v(N+1), repoints head, transactional rollback). `HideVersionModal` (sets `is_hidden` with required reason; pre-flight client check + Phase A trigger 5.E server-side guard for non-draft last-visible-version) |
| Document Coordination — Status transitions (D9) | ✅ Complete | `ConfirmStatusModal` handles `draft→active` and `active|shared→archived`. Status actions bar in `DocumentDetailModal`. `revoked` intentionally not exposed in v1; archived/revoked are terminal |
| Document Coordination — Internal sharing (D10) | ✅ Complete | `ShareDocumentModal` for `school_user` grantees in the same school, `consent_id = NULL`. Permissions: view always on, download default off, comment + upload_new_version locked off in v1. Required expiry (30/90/180/365/custom). Confirmation copy "{name} will be able to view this document until {date}." Access tab in `DocumentDetailModal` lists active and inactive grants. Migration 065 adds `list_school_staff_for_sharing` SECURITY DEFINER RPC because base `profiles` SELECT only exposes the caller's own row |
| Document Coordination — Consent request (D11) | ✅ Complete | `ConsentRequestModal` drafts a `document_consents` row in `pending` (status enforced by INSERT RLS). Document-scoped only in v1; `purpose`, expiry presets/custom, `allow_download`, `allow_reshare`. Parent-side approval still simulated via SQL until Phase E parent UI |
| Document Coordination — External sharing (D12) | ✅ Complete | `ShareDocumentModal` adds Staff/External target tabs. `ExternalContactPicker` (combobox + inline create). Pre-flight checks for a covering live consent on (document, contact); routes to `ConsentRequestModal` when missing. Pending consent blocks share with explainer; granted consent unblocks. Grant expiry clamped to consent expiry; download disabled when consent.allow_download=false. Trigger 5.G + accessible_document_ids() validate the same invariants server-side |
| Document Coordination — Revoke access (D13) | ✅ Complete | `RevokeAccessModal` from per-row Revoke button on active grants in the Access tab (admin only). Sets `revoked_at`/`revoked_by`/`revoke_reason`; respects column-guard trigger 4.2 (no perms/expiry/grantee mutation). Revoked grants stay visible under "No longer active" with a red Revoked tag for audit. No DELETE policy — grants are revoked, never deleted |
| Document Coordination — Requests (D14) | ✅ Complete | New Documents/Requests view toggle on the workspace page. `RequestDocumentModal` (school staff only — INSERT policy requires `requester_user_id = auth.uid()`). Recipient is a parent (guardian) or an external contact; v1 doesn't expose `requested_from_kind = 'school'` (needs cross-school directory). Required reason, optional due_date with overdue indicator. Cancel via `CancelRequestModal` (status='cancelled' with optional reason). Submitted/reviewed transitions land with Phase E parent/external UI |
| Document Coordination — Activity tab (D15) | ✅ Complete | Read-only Activity tab in `DocumentDetailModal` (staff only). Lists newest 50 `document_access_events` for the doc with friendly action labels (Access Link Issued / Preview Opened / Download Requested / Access Denied), actor name (resolved via shared staff/external maps; falls back to `actor_email` then actor kind), timestamp, and human-readable denied reason for denials. Reuses the access-tab lookup loaders so opening Activity warms the same maps |
| Document Coordination — Polish (D16) | ✅ Complete | Help drawer on `/documents` page (13 topics: lifecycle, sharing, consent states, expiring badges, audit, roles, privacy model). Title-Case modal titles across all document modals. Amber "Expires in Nd" badge on grants in the Access tab when within 14 days. Friendlier empty states on Versions/Access tabs. Migration 068 fixes the parent-transition guard NULL-role bug. Modal cancel/X buttons explicitly typed `button` so they don't accidentally submit the surrounding form |
| Plans & Forms — IEP Plan foundation | ✅ Complete | Third tab inside Document Coordination (alongside Documents and Requests). Distinct from uploaded child_documents — structured IEP Plans authored inside the app. Migration 070 adds 5 tables + 2 enums; UI lives in `src/features/plans/`. v1: 7-section IEP modal (Profile/Goals/Interventions/Progress/Parent/Review/Attachments), Save Draft + Submit For Review for staff, Approve + Archive for admin, attachments REFERENCE child_documents (no new bucket). Placeholder cards for Support Plans / Behavior Plans / Other Forms / Templates. No parent-portal write path; no template builder; PDF export is a disabled placeholder |
| Teacher visibility fix (migration 066) | ✅ Complete | Adds `teacher_profiles.auth_user_id` (UNIQUE, FK to auth.users), backfills via case-insensitive email match against `profiles` (role='teacher'), and rewrites `teacher_visible_student_ids()`, `teacher_student_ids()`, and the `teacher_insert_parent_updates` policy to resolve auth.uid() → teacher_profiles.id → class_teachers.teacher_id. Restores teacher access to `child_documents`, `parent_updates` insert, and `proud_moments` that 058 broke. Demo seeder updated to set `auth_user_id` on each new teacher_profile |

---

## What Is NOT Yet Built

### High Priority (Core Features)
- [x] **Multi-school / Super Admin panel** — done
- [x] **Trial system** — done
- [x] **Academic Period** — done
- [x] **Tuition configuration** — done
- [x] **Fee types** — done
- [x] **Discounts & promos** — done
- [x] **Credits system** — done
- [x] **Billing enhancements (Phase 1–4)** — done (month filter, aging badges, payment history, OR number, printable receipts/statements, validation guardrails)
- [x] **Parent billing portal** — done
- [x] **Parent portal — progress, events, RSVP, absence reporting, announcements** — done
- [x] **Enrollment funnel analytics** — done
- [x] **Broadcast announcements** — done
- [x] **Billing — generate modal** — done (merged into single Generate Billing modal with tuition rates / flat amount toggle, month range, fee type, due date modes)
- [ ] **Viewing School Year** — planned (see Session Log 2026-04-28). Allow browsing prior years without changing DB active year. Requires `viewingYear`/`isHistoricalView` in SchoolContext, Header dropdown, amber banner, per-page query swap + write guards.
- [ ] **Resource / Document Hub** — file uploads, categorized downloads for parents
- [ ] **Online classes** — wire `online-classes` page to Supabase (currently static)
- [ ] **Storage bucket separation** — split `updates-media` into `receipts` (admin-only) + `student-documents` when document hub is built

### Billing — Remaining Gaps
- [ ] **Scheduled recurring billing** — set monthly fee per class/level, auto-generate on chosen day each month
- [ ] **Overdue reminders** — bulk email/in-app notification to parents with outstanding balances
- [ ] **Fee schedule at enrollment** — auto-attach tuition config when student is enrolled
- [ ] **Sibling / family grouping** — combined family balance view, sibling discount auto-apply

### Medium Priority
- [x] **RSVP for events** — done (parent events page)
- [ ] **Field trip / event fees** — link fees to events, per-student opt-in
- [ ] **Waitlist management UI** — explicit waitlist queue, promote-to-enrolled flow
- [ ] **Sibling enrollment** — link students as siblings, auto-apply sibling discount

### Future / Nice to Have
- [ ] **Demo school** — pre-seeded demo data for walkthroughs
- [ ] **Branch management** — multi-branch per school
- [ ] **Push notifications / reminders**
- [ ] **PWA icons** — icon-192.png / icon-512.png missing from public/
- [ ] **Role-based UI gating** — hide admin-only actions from teachers/parents
- [ ] **Tighten RLS policies** — per-role write policies (currently broad "school member" policies)

### Document Coordination — Remaining (school side complete after D16)

Built so far: Phases A (schema), B (RLS + RPC), C (API route + types), D1–D16. The school-side Document Coordination feature is feature-complete. What's left is everything that's not the school side:
- [ ] **D12 — External contact share path** — extend ShareDocumentModal to handle `external_contact` grantees. ExternalContactPicker with inline-create. Phase A trigger 5.G enforces consent invariant
- [ ] **Phase E — Parent portal** — `/parent/documents`: My Child's Documents (visible per Phase B parent rules), grant/revoke consent (uses parent transition guard), upload `parent_provided` drafts
- [ ] **Phase 2 — `document_comments`** — coordination notes per doc with `originating_school_only` vs `all_with_access` visibility
- [ ] **Phase 2 — external-contact "Shared With Me" portal** — needs Lauris Care identity bridging
- [ ] **Phase 2 — sibling consents, expiry-reminder cron, DOCX support, bulk operations, auto-archive on review_date**
- [ ] **Settings → Teachers — auth-link UI** — migration 066 adds the `auth_user_id` bridge column and backfills via email match. Manual re-linking is currently a single SQL UPDATE. A small picker in the teacher edit modal (with a tiny RPC since `profiles` SELECT is self-only) would let admins fix mismatches without DB access

---

## Schema Additions (Migrations 016–017)

### Migration 016 — Parent Features
- `absence_notifications` table: `school_id`, `student_id`, `class_id`, `date`, `reason`; UNIQUE(student_id, date); RLS: parents insert/select via guardian email, staff select via school_id
- `event_rsvps`: added UNIQUE INDEX on (event_id, student_id) — required for upsert with onConflict
- `progress_observations`: added parent SELECT policy where `visibility = 'parent_visible'`

### Migration 017 — Payment Receipt Photo
- `payments`: added `receipt_photo_path TEXT` — stores storage path in `updates-media/payment-receipts/{schoolId}/{payment_id}.{ext}`

### Migration 033 — Billing Fee Type ID
- `billing_records`: added `fee_type_id UUID REFERENCES fee_types(id) ON DELETE SET NULL` (nullable — existing rows get NULL)

### Migration 054 — Child Documents Schema (Phase A)
- 4 enums: `document_type`, `document_status`, `consent_status`, `request_status`
- 7 tables: `external_contacts`, `child_documents`, `child_document_versions`, `document_consents` (JSONB `scope` + `recipients`), `document_access_grants` (JSONB `permissions`), `document_requests`, `document_access_events`
- Versioning model: chain/head — `child_documents.id` is stable; `child_document_versions` rows are linked-list per `(document_id, version_number)`. `current_version_id` on the head points at the latest non-hidden version
- Integrity triggers: 5.D (`current_version_id` validation), 5.E (hide-version repointing — auto-handles head pointer, refuses to orphan a non-draft doc), 5.F (consent JSONB shape + FK validation, including `external_contacts` school-scoping enforcement), 5.G (grant↔consent invariant — field-based recipient match, grant.expiry ≤ consent.expiry), 5.H (consent revoke/expire cascades to grants)
- All 7 tables `ENABLE ROW LEVEL SECURITY` (default-deny — policies follow in 056)

### Migration 055 — child-documents Storage Bucket
- Private, 25 MB limit, MIMEs = PDF + JPEG/PNG/WebP
- Path convention `{school_id}/{student_id}/{document_id}/v{n}.{ext}`
- INSERT/UPDATE/DELETE policies for school-staff + parent (own children's path)
- **No client SELECT policy** — only the service role mints signed URLs after `log_document_access` approves

### Migration 056 — Document RLS + log_document_access RPC (Phase B)
- 4 helpers: `parent_guardian_ids()` (JWT-email → guardian_id binding), `external_contact_ids_for_caller()`, `teacher_visible_student_ids()`, `accessible_document_ids()` (the SELECT-policy primitive)
- ~46 RLS policies across the 7 tables. **No `is_super_admin()` bypass on any of them** — strict no-default-access posture (super_admin gets 42501 on any direct write)
- Column-level guards: parent transition guard on `document_consents` (only `pending→granted` or `granted→revoked`, no terms changes), grant column guard (UPDATE allowed only on `revoked_at`/`revoked_by`/`revoke_reason`)
- `log_document_access(p_doc_id UUID, p_action TEXT, p_ip TEXT, p_user_agent TEXT) RETURNS JSONB` — SECURITY DEFINER. Combines access decision + audit logging atomically. Returns metadata (`storage_path`, `mime_type`, `version_number`, `signed_url_ttl_seconds`); **never returns a signed URL**. Action whitelist: `view | download | signed_url_issued | preview_opened`
- `document_access_events.actor_kind` CHECK extended to include `'super_admin'` and `'unauthenticated'` so denial events for those classes can be logged

### Migration 057 — document_access_events.actor_user_id FK fix
- Re-points FK from `profiles(id)` to `auth.users(id)`. Required because external_contacts have `auth.users` rows but no `profiles` row, so the original FK rejected any external-actor audit insert
- Added super-admin RLS bypass policy `"super_admin_all_billing_records_fee_type"` (FOR ALL)
- **Must be run before Add Record or Generate Billing will work** — both INSERT paths send `fee_type_id`
- Existing billing records with `fee_type_id = NULL` display correctly; skip-existing check in Generate Billing falls back to student+month filter when fee type is unset

### Billing Status Enum (Migration 009)
- Added `waived` status — excluded from outstanding balance and revenue totals; requires change reason

---

## Schema (002 Migration — Implemented)

All implemented in `supabase/migrations/002_super_admin_trial_periods_tuition.sql`:

- `schools` — added `trial_start_date`, `trial_end_date`, `trial_status`
- `academic_periods` — new table (school_id, school_year_id, name, dates, is_active)
- `classes` — added `academic_period_id` (nullable FK)
- `billing_records` — added `academic_period_id` (nullable FK)
- `fee_types` — new table (CRUD per school)
- `tuition_configs` — new table (per academic_period × level, unique constraint)
- `discounts` — new table (type: fixed/percentage/credit, scope: 5 presets)
- `student_credits` — new table (issued credit amounts per student)
- `billing_discounts` — new table (applied discount snapshot on billing records)
- `is_super_admin()` SQL function for RLS bypass
- Super admin SELECT bypass policies on all 21 existing tables

---

## UI Component Conventions

### DatePicker (`src/components/ui/datepicker.tsx`)
- Props: `value: string` (YYYY-MM-DD or ""), `onChange`, `placeholder`, `disabled`, `className`
- Uses `createPortal` to render dropdown on `document.body` — safe inside modals with `overflow-hidden`
- Portal dropdown positions itself above or below the trigger based on available viewport space
- Has "Today" shortcut and "Clear" button (when value is set)
- Replace all `<Input type="date">` with `<DatePicker>` for consistency

### MonthPicker (`src/components/ui/monthpicker.tsx`)
- Props: `value: string` (YYYY-MM or ""), `onChange`, `placeholder`, `min` (YYYY-MM), `disabled`, `className`
- Same portal pattern as DatePicker
- Shows 3×4 month grid with year navigation
- Has "This month" shortcut and "Clear" button
- Replace all `<Input type="month">` with `<MonthPicker>` for consistency

---

## Coding Conventions

- All pages are `"use client"` with `useEffect` + Supabase client for data fetching
- Always scope queries with `school_id` from `useSchoolContext()`
- Always scope school-year-specific queries with `activeYear?.id`
- Use `PageSpinner` for full-page loading, `ErrorAlert` for error states
- Use `Modal` component for add/edit forms
- Filter/search is client-side on fetched data (no server-side pagination yet)
- `formatCurrency(n)` — Philippine Peso formatting
- `formatTime(t)` — 12-hour time string
- `getInitials(name)` — avatar initials

---

## Help Drawer Rule

Every dashboard page has a Help drawer (slide-in right panel, `HelpCircle` button in the page header). **Whenever a new feature, UI change, or behavior is added to any page, the corresponding help drawer topics must be updated to reflect it.** The help drawer is the single source of truth for how to use each page.

- New feature added → add or update the relevant topic in that page's drawer
- Feature removed or renamed → remove or rename the topic
- Behavior changes (e.g. new field, new status, new workflow step) → update the topic body
- New page created → add a help drawer with topics covering all key workflows

Help drawer implementation pattern (consistent across all pages):
- State: `helpOpen`, `helpSearch`, `helpExpanded: Record<string, boolean>`
- Type: `HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode }` — defined inline
- Sub-components `Step`, `Tip`, `Note` defined inside the topic list IIFE
- Fixed overlay + slide-in panel: `animate-in slide-in-from-right duration-200`
- Thin scrollbar: `[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full`
- No `createPortal` — rendered inline at end of page JSX

---

## Session Log

### 2026-05-04 — Clinic-Internal Document Upload (Phase 6C)

Clinic admins can now upload documents for clinic-owned children directly from `/care/children/[id]`. **Strictly additive and isolated** — no schema changes on `child_documents`, no policy changes anywhere, no edits to existing helpers/RPCs/storage policies. The school-side document coordination system is byte-clean.

**Why a parallel system instead of extending `child_documents`.** `child_documents` requires `school_id NOT NULL` + `student_id NOT NULL` + cascades from `students`. Clinic-owned children have neither a `students` row nor a `school_id`. Extending the existing table would have meant: nullable FKs + a CHECK enforcing exactly-one-path, plus rewriting ~12 existing policies to add `IS NULL` clamps, plus widening the path convention `{school_id}/{student_id}/...` in storage RLS. Strictly worse than a parallel table. Mirrors the precedent set by 5B (`document_organization_access_grants` parallel to `document_access_grants`).

**Migration 081.** Three tables + three triggers + RLS + storage bucket + one RPC.
- `clinic_documents` — head. Required: `origin_organization_id` (clinic/medical_practice org owning the doc), `child_profile_id` (must be owned by the same org — enforced by trigger 2.A), `document_kind` TEXT (normalised to `LOWER(TRIM(...))` by trigger 2.C), `title`, `created_by_profile_id`. Lifecycle status enum `draft|active|archived` (no `shared`/`revoked` — sharing deferred). `permissions JSONB` defaults to `{"view":true,"download":false}` (Phase 6C adjustment 1) — the column shape mirrors `document_organization_access_grants.permissions` so a future cross-org-sharing phase reuses the same key set without DDL. CHECK constraint enforces the JSONB shape (object, both keys present, both boolean).
- `clinic_document_versions` — versioning chain (mirrors `child_document_versions`). UNIQUE(document_id, version_number).
- `clinic_document_access_events` — audit. **Separate from `document_access_events`** to avoid touching that table's `actor_kind` CHECK (already amended twice in 057 and 076) and to keep clinic audit fully isolated from school audit.
- `cd_origin_consistency_validate` (BEFORE INSERT, BEFORE UPDATE OF origin_organization_id, child_profile_id; SECURITY DEFINER) — rejects insertions where `child_profile.origin_organization_id` doesn't match `clinic_documents.origin_organization_id`.
- `cd_immutable_columns_guard` (BEFORE UPDATE) — Phase 6C adjustment 3. Rejects any change to `origin_organization_id`, `child_profile_id`, `created_by_profile_id` with 42501. `is_super_admin()` bypasses for support.
- `cd_normalize_kind` (BEFORE INSERT, BEFORE UPDATE OF document_kind) — Phase 6C adjustment 2. Stores `LOWER(TRIM(NEW.document_kind))`. Casing variants like "Therapy Evaluation" / "therapy evaluation" / "  Therapy Evaluation  " collapse.
- New private storage bucket `clinic-documents` (25 MB; PDF/JPEG/PNG/WebP). Path `{origin_organization_id}/{child_profile_id}/{document_id}/v{n}.{ext}`. Storage RLS: INSERT/UPDATE require active `clinic_admin` membership of `foldername(name)[1]`. **No client SELECT policy** — service-role mints signed URLs after RPC approval, same choke-point pattern as `child-documents`.
- `log_clinic_document_access(p_doc_id, p_action, p_ip, p_user_agent)` SECURITY DEFINER. Twin of `log_document_access_for_organizations` (5B). Atomic decision + audit. Action whitelist `signed_url_issued|preview_opened|download`. Decision tree: reject unauthenticated → reject super_admin (matches 5B posture) → reject if doc origin doesn't match any of caller's clinic memberships → reject `status='archived'` → reject if `current_version_id` is null or hidden → for `download` actions, allow if caller is `clinic_admin` OR `permissions.download = true`; otherwise `download_not_permitted`. Always logs the decision into `clinic_document_access_events`.

**RLS posture.**
- `clinic_documents`: SELECT for any active member of origin (via `caller_owned_child_profile_ids()`); INSERT/UPDATE for `clinic_admin` only; no DELETE; super_admin bypass FOR ALL.
- `clinic_document_versions`: SELECT piggybacks on parent visibility; INSERT/UPDATE for `clinic_admin` of parent's origin; no DELETE.
- `clinic_document_access_events`: SELECT only for `clinic_admin` of origin (non-admin members don't see audit history in v1). INSERT/UPDATE/DELETE denied to all clients — only the SECURITY DEFINER RPC writes.

**Critical isolation.** Smoke 081 T-2 mechanically asserts `pg_get_functiondef` of `accessible_document_ids`, `log_document_access`, `log_document_access_for_organizations`, `list_documents_for_organization`, `caller_owned_child_profile_ids`, `caller_visible_child_profile_ids`, `caller_visible_child_profile_ids_for_identifiers`, `caller_visible_document_ids_for_organizations` — none reference any 6C artifact. T-9 verifies school_admin sees zero `clinic_documents` rows.

**App-side additions.**
- `src/features/care/clinic-documents-api.ts` — `listClinicDocumentsForChild`, `createClinicDocument` (5-step transactional upload with best-effort rollback: client-mint UUIDs → blob upload → head INSERT → version INSERT → repoint head's `current_version_id`. Rollback removes the orphan blob if any DB step fails). `setClinicDocumentStatus`, `setClinicDocumentDownload`. `openClinicDocumentForAccess` opens the signed URL in a new tab and lets it fall out of scope.
- `src/features/care/UploadClinicDocumentModal.tsx` — clinic_admin only. Title + kind (datalist + free input — server normalises) + description + effective/review dates + allow_download checkbox + file input. Validates MIME and 25 MB client-side; the bucket enforces both server-side.
- `src/features/care/ClinicDocumentsList.tsx` — per-child list. Per-row View + Download (Download hidden for non-admin when `permissions.download=false`); admin gets toggle-download + archive/restore actions.
- `src/features/care/ClinicDocumentAccessButton.tsx` — twin of `CareDocumentAccessButton`, calls the new route.
- `src/app/api/care/clinic-documents/[id]/access/route.ts` — POST endpoint. Authenticates via cookie session, calls `log_clinic_document_access` under user's session, mints 60s signed URL with service-role from the `clinic-documents` bucket. Disclosure-minimisation: internal denial reasons (`doc_not_found`, `not_owned`, `no_visible_version`, `doc_archived`, `view_not_permitted`, `super_admin_not_supported_here`) collapse to 404; `download_not_permitted` → 403; `unauthenticated` → 401.

**App-side edits.**
- `src/features/care/types.ts` — added `ClinicDocument`, `ClinicDocumentPermissions`, `ClinicDocumentStatus`, `ClinicDocumentAccessAction`, `ClinicDocAccessAllowed`, `ClinicDocAccessDenied`.
- `src/features/care/ChildDetailView.tsx` — branches the documents block: owned children render `ClinicDocumentsList` + Upload Document button (clinic_admin gated); shared children continue to render `SharedDocumentsList` (unchanged).
- `src/app/care/children/[childProfileId]/page.tsx` — fetches clinic documents alongside identity / shared docs; passes `clinicDocuments`, `isClinicAdmin`, `uploaderProfileId` (from CareContext.userId), and `originOrganizationId` (the active clinic org for owned children) into `ChildDetailView`.
- `src/lib/types/database.ts` — added `log_clinic_document_access` Function type.

**Out of scope (deferred).**
- Cross-organization sharing of clinic-internal docs (no `shared` status, no parallel grants table). A future migration adds `shared` to the status CHECK and a `clinic_document_organization_access_grants` table parallel to 076.
- Parent-of-clinic-child portal (no `guardians` row equivalent).
- Version-hide UI / multi-version uploads (the schema supports it via `clinic_document_versions.is_hidden`; UI ships in 6C.1 if needed).
- DOCX support (kept the 25 MB / PDF+image MIME set for parity with `child-documents`).
- Cross-school visibility of clinic-internal docs.
- Audit-tab UI for clinic admins (RLS allows SELECT; the surface ships in a follow-up).

**Manual setup for testing.**
1. Apply migration 081. Confirm in Supabase Dashboard → Storage that `clinic-documents` is private with the right MIME / 25 MB cap.
2. Run `supabase/tests/081_clinic_documents_smoke.sql` — expect `✓ All 081 smoke tests passed.`
3. Sign in as a clinic_admin of an existing clinic, navigate to `/care/children/<owned_child>`. Documents card now reads "Clinic documents" with an Upload Document button.
4. Click Upload Document → fill title/kind ("Therapy Evaluation") / attach a small PDF / leave allow_download OFF → submit. Row appears with View button visible (no Download). Audit row lands (`SELECT * FROM clinic_document_access_events ORDER BY created_at DESC LIMIT 5` from SQL editor).
5. Click View → signed URL opens in new tab. Click Download (admin) → succeeds despite `permissions.download=false` (admin override).
6. Promote a second clinic-A user to `therapist` (non-admin) and sign in as them. Open the same doc → View works. Download button is hidden client-side; manually POST to the access route with `action=download` → 403 with `download_not_permitted`.
7. As clinic-A admin, click the "allow downloads" toggle on the row → therapist refresh shows Download button → works.
8. Click Archive → row badge flips to "Archived"; both View and Download are hidden. RPC denies both with `doc_archived`.
9. Cross-clinic: as clinic-B admin, attempt `SELECT * FROM clinic_documents WHERE origin_organization_id = '<clinic_a>'` → 0 rows. Call `log_clinic_document_access` → `not_owned`.
10. School isolation: as school_admin, `SELECT * FROM clinic_documents` and `SELECT * FROM clinic_document_access_events` → 0 rows. The `/documents` workspace doesn't list any clinic-internal entries.
11. Existing flows unaffected: upload a school doc as school_admin, share with clinic, View on care side — still works.

### 2026-05-04 — School-Side Clinic Sharing UI (Phase 6D)

Schools can now manage identity and document grants to clinics / medical practices through a real UI instead of SQL. **Strictly additive and isolated** — no Care-side changes, no schema mutations, no policy modifications. The migration ships only three SECURITY DEFINER RPCs to bypass the strict `organizations` policy, narrowly gated to `school_admin`.

**Migration 080.** Three RPCs.
- `list_clinic_organizations_for_sharing(p_query TEXT, p_limit INT)` — ILIKE search with prefix-match ranking, capped to 200 rows. Returns empty for non-school_admin callers.
- `create_clinic_organization_for_sharing(p_kind TEXT, p_name TEXT, p_country_code TEXT)` — validates `p_kind IN ('clinic','medical_practice')` (22023), trims+rejects empty name (22023), rejects non-school_admin (42501). Inserts a new `organizations` row with `school_id=NULL` and `created_in_app='lauris_learn'`.
- `lookup_clinic_organizations(p_ids UUID[])` — resolves target_org names by id for the audit tables, since school_admin lacks SELECT on clinic/medical_practice rows directly.
- All three: `SECURITY DEFINER`, `SET search_path = public`, body-level `current_user_role() = 'school_admin'` check, `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`. **No table changes, no policy changes, no triggers touched.** Smoke 080 mechanically asserts byte-cleanliness of `caller_visible_organization_ids`, `doag_is_clinic_or_medical_org`, the Care-portal RPCs, and the existing identity/document helpers.

**Why RPCs and not new policies.** The 072 RLS on `organizations` keeps clinic/medical_practice rows invisible to school_admin direct SELECT and forbids `kind != 'school'` INSERT. Widening either policy would leak Lauris Care directory data globally and let any school_admin write arbitrary org rows. RPCs are the established escape hatch (precedents: `doag_is_clinic_or_medical_org` from 076; `list_school_staff_for_sharing` from 065).

**RLS is sufficient for everything else.** Migrations 074 + 076 already permit `school_admin` INSERT/UPDATE on the two grant tables with the right scoping clauses. The new modals just craft the payloads (granted_by_profile_id = auth.uid(), granted_by_kind = 'school_admin', source = own school's shadow org). Column-guard triggers + partial-unique indexes do server-side enforcement; client-side guards are pure UX.

**Three entry points, one set of modals.**
- **Central tab** (`/documents` → "Clinic Sharing", school_admin only) — `ClinicSharingView` with two sections (Identity grants, Document grants), each filterable Active/All, with per-row Revoke action and "New share" button.
- **Students page row → "Share with Clinic"** (Share2 icon, school_admin only, hidden when student.childProfileId is null) — opens `ShareIdentityWithClinicModal` locked to that child.
- **`DocumentDetailModal` Access tab → "Share with Clinic"** (school_admin only, only when doc.status IN ('active','shared')) — opens `ShareDocumentWithClinicModal` locked to that document.

**Search-first picker** (`ClinicOrganizationPicker`). Per Phase 6D adjustment 2, the inline-create form is **hidden** until the user actively searches. Three branches:
- No query → empty state, prompt to search.
- Query with matches → results list. Tiny "Can't find it? Add new clinic" link expands the create form.
- Query with **zero matches** → create form auto-expands and pre-fills name with the query string.

This forces the user past the directory before typing a duplicate. The DB does not block duplicate names (multiple schools may legitimately reach the same physical clinic; deferred merge/dedupe).

**Lifecycle contracts honoured.**
- Identity scope is **immutable post-insert** (074 column-guard `cpag_column_guard`). Modal copy explicitly states scope upgrade requires revoke-and-re-share.
- Document permissions are **immutable post-insert** (076 column-guard). Same modal copy.
- Partial-unique indexes on `(child, target_org) WHERE status='active'` (074) and `(document, target_org) WHERE status='active'` (076) reject re-grants while one is active. The 23505 maps client-side to *"Already shared with this clinic. Revoke the existing grant first to issue a new one."*
- `valid_until` enforced via inline check in pre-existing helpers; revoked grants drop access immediately on the Care side.

**Files added.**
- `supabase/migrations/080_clinic_sharing_rpcs.sql`, `supabase/tests/080_clinic_sharing_smoke.sql`
- `src/features/clinic-sharing/{types,queries,ClinicOrganizationPicker,ShareIdentityWithClinicModal,ShareDocumentWithClinicModal,RevokeClinicGrantModal,IdentityGrantsTable,DocumentGrantsTable,ClinicSharingView}.{ts,tsx}`

**Files edited.**
- `src/lib/types/database.ts` — three new Function type entries.
- `src/app/(dashboard)/documents/page.tsx` — `ViewMode` extended with `"clinic-sharing"`, 4th tab gated on school_admin, body switch promoted to four-way, filter Card hidden in clinic-sharing view.
- `src/app/(dashboard)/students/page.tsx` — added Share2 icon button per student row (school_admin + childProfileId guard), state for `shareClinicTarget`, useEffect to resolve school org id, modal mounted at component end.
- `src/features/documents/DocumentDetailModal.tsx` — Access tab gains optional `onShareWithClinic` prop. Outline-variant button "Share with Clinic" appears next to the existing "Share" button for school_admin on docs in active|shared. `ShareDocumentWithClinicModal` mounted alongside the existing `ShareDocumentModal`.

**Out of scope (deferred).**
- Per-clinic-org merge / dedupe.
- In-app notification to clinic admins on new grants.
- Parent self-grant for identity / document sharing.
- Clinic-initiated requests for documents.
- `scope='document_type'` and `'all_for_student'` cross-org sharing.
- `comment` and `upload_new_version` permissions for document grants — reserved as `false` in v1.
- Auto-expiry job to flip `status='active' → 'expired'` past `valid_until` — `valid_until > NOW()` is enforced inline by the Care helpers; status flip is purely cosmetic.
- Help drawer topics for the new tab — follow-up.

**Manual setup for testing.**
1. Apply migration 080. Run `supabase/tests/080_clinic_sharing_smoke.sql` — expect `✓ All 080 smoke tests passed.`
2. Sign in as a `school_admin` of BK. Open `/documents` → confirm "Clinic Sharing" tab is visible.
3. Click "New identity share" → pick a student → search "test" in the org picker → results should be empty → create form should auto-expand pre-filled with "test" → set kind=clinic, country=PH, name="TEST 6D Clinic" → click "Add & select" → org auto-selects → pick scope `identity_only` → 90 days → submit. Row appears in Identity grants table.
4. Re-open New identity share, same student, same clinic → submit → friendly error "Already shared with this clinic. Revoke first to issue a new grant."
5. Click Revoke on the row → confirm with optional reason → row moves to inactive section.
6. From `/students` → row's Share2 icon → modal opens with student locked → submit → grant appears in central tab too.
7. Open a document in `/documents`, switch to Access tab, click "Share with Clinic" → modal opens with doc locked → pick clinic, permissions view+download, submit. Row appears in central Document grants section.
8. As a clinic-admin in the granted clinic (use existing care-portal test fixture), open `/care/children` → granted child appears, identifiers honour scope. Open `/care/documents` → shared document appears with View+Download buttons.
9. Back as school_admin → revoke document grant → clinic side empties on next refresh.

### 2026-05-04 — Clinic-Admin Child Edits (Phase 6B.1)

Smallest safe edit surface for clinic-owned children. Phase 6B was INSERT-only on the clinic side; this phase lets clinic admins fix typos and curate identifiers without SQL access. **Strictly additive and isolated** — no existing helpers, triggers, or policies were modified.

**Migration 079.** Three policies + two BEFORE UPDATE triggers.
- `clinic_admin_update_child_profiles` — USING + WITH CHECK both combine `caller_owned_child_profile_ids()` (membership in origin org) with an inline `EXISTS` clamping `role='clinic_admin'`. Same shape as the 078 INSERT policies.
- `clinic_admin_update_child_identifiers` + `clinic_admin_delete_child_identifiers` — same predicate, joining through `child_profiles` to verify the child sits in the caller's owned set and that the caller is `clinic_admin` of its origin.
- `cp_clinic_owned_noop_guard` (BEFORE UPDATE on `child_profiles`) — no-op detector across the 11 editable columns using `IS NOT DISTINCT FROM`. Rejects with SQLSTATE 22000. Scoped to clinic-owned rows (`origin_organization_id IS NOT NULL`); school-origin rows pass through. `is_super_admin()` bypass.
- `ci_clinic_owned_update_guard` (BEFORE UPDATE on `child_identifiers`, SECURITY DEFINER) — locks `child_profile_id` (42501 if attempted) AND no-op detector across identifier columns (22000). Same clinic-owned scoping + super_admin bypass.

**Why triggers, not WITH CHECK, for the no-op + ownership-lock guards.** PostgreSQL row-security `WITH CHECK` clauses can only inspect `NEW`. To compare against `OLD` (no-op detection, child_profile_id immutability), a `BEFORE UPDATE` trigger is the only mechanism. Both triggers self-scope to clinic-owned rows so school-side UPDATE behaviour is byte-clean.

**Defense matrix verified by smoke 079** — clinic-A admin attempting UPDATE:

| target | result |
|---|---|
| own clinic-A child (real change) | ✅ allowed |
| own clinic-A child (every column = OLD) | ❌ trigger 22000 |
| clinic-B child | ❌ RLS: 0 rows (USING fails) |
| school-shared child via grant | ❌ RLS: 0 rows (grant arm doesn't feed ownership helper) |
| school-origin child | ❌ RLS: 0 rows |
| own child, attempting `origin_organization_id` change | ❌ trigger 42501 (078.2.B) |
| identifier UPDATE attempting `child_profile_id` reassignment | ❌ trigger 42501 |
| identifier UPDATE colliding with unique index | ❌ 23505 |
| school_admin attempting UPDATE on clinic-owned | ❌ existing school policy requires students linkage; clinic-owned has none |
| non-admin clinic member (therapist) | ❌ RLS: 0 rows (inline admin EXISTS fails) |

**No DELETE on `child_profiles`.** Deferred until a future archive lifecycle column. Typo'd profiles are edited, not deleted. Cascading delete of identifiers + audit footprint is too destructive for a v1 surface.

**App-side additions.**
- `src/features/care/queries.ts` — adds `updateOwnedChild(childProfileId, patch)` (only sends columns present in the patch; never includes origin), `addIdentifier(childProfileId, input)` (client-side UUID), `updateIdentifier(identifierId, patch)`, `deleteIdentifier(identifierId)`. All four route Postgres errors through `mapIdentifierError`, which surfaces the spec-mandated friendly message on 23505: *"This identifier is already registered. If this is the same child, contact support to link records."*
- `src/features/care/EditChildModal.tsx` — modal mirroring `NewChildModal`'s shape, minus identifiers and origin. Pre-fills from the existing `ChildIdentity`. Surfaces 22000 as "No changes detected. Update at least one field before saving." Adds `gender_identity` field which `NewChildModal` does not expose (kept the create flow byte-stable).
- `src/features/care/ManageIdentifiersModal.tsx` — per-row UI. Each row holds dirty state independently and saves on its own button. Add new row → INSERT; existing row dirty → UPDATE; trash → DELETE (existing) or X → discard (unsaved draft). Save button is disabled when nothing changed.
- `src/features/care/ChildDetailView.tsx` — accepts new `canEdit` and `onChanged` props. Renders a small `Edit` button below the child's display name (header card) and a `Manage` button in the Identifiers card header — both gated on `canEdit && isOwned`. Mounts the two modals only when `showEditControls` is true (zero overhead for shared children).
- `src/app/care/children/[childProfileId]/page.tsx` — pulls `isClinicAdmin` from `useCareContext`, threads it as `canEdit={isClinicAdmin && match.originType === "owned"}`, and adds a `reloadTick` state so save callbacks force a refetch.

**Out of scope (deferred).**
- DELETE on `child_profiles` (use future archive column).
- UPDATE/DELETE for clinic non-admin members (therapist role) — they remain read-only.
- Document upload for clinic-owned children (Phase 6C territory).
- Cross-clinic / clinic→school sharing of clinic-owned children.
- Optimistic locking / ETag conflict detection (last-write-wins for v1).
- Identifier label / issued_by / valid_from / valid_to columns surfaced in UI — RLS allows them but the modal sticks to the three core fields (type, value, country).

**Manual setup for testing.**
1. Apply migration 079. Run `supabase/tests/079_phase6b1_smoke.sql` — expect `✓ All 079 smoke tests passed.`
2. Sign in as clinic_admin → `/care/children/<owned_child>` → confirm `Edit` button below the display name and `Manage` button on the Identifiers card.
3. Click Edit → change display_name → Save changes → modal closes, identity card reflects new value without hard refresh.
4. Click Edit again → click Save with nothing changed → friendly "No changes detected" error.
5. Click Manage → add an LRN row → Save → row persists. Edit the value → Save. Trash the row → row disappears.
6. As clinic-A admin (SQL editor): `UPDATE child_profiles SET origin_organization_id='<clinic_b>' WHERE id='<own_child>'` → 42501 from 078.2.B trigger.
7. Promote a second user in clinic-A to `role='therapist'`. Sign in as them → Edit and Manage buttons hidden.

### 2026-05-04 — Clinic-Origin Children (Phase 6B)

Clinic admins can now create therapy clients who are NOT enrolled in any school — children that exist in `child_profiles` with no `students` row, linked via `child_profile_memberships` to the owning clinic. **Strictly additive and isolated:** no existing helpers were modified; no school flow can see clinic-owned children.

**Migration 078.** Single artifact set, all additive.
- New column `child_profiles.origin_organization_id UUID NULL REFERENCES organizations(id)` (RESTRICT delete). NULL = school-origin (existing rows untouched). Non-NULL = clinic / medical_practice owner. Indexed via partial index `WHERE origin_organization_id IS NOT NULL`.
- Trigger `cp_origin_kind_validate` (BEFORE INSERT/UPDATE OF origin_organization_id, SECURITY DEFINER) — rejects any origin pointing at a non-existent org or an org of kind ∉ ('clinic','medical_practice'). Forbids accidentally setting origin to a school org.
- Trigger `cp_origin_immutable_guard` (BEFORE UPDATE) — **fully locks origin post-insert.** Rejects NULL→non-NULL, non-NULL→NULL, and non-NULL→other transitions. Only `is_super_admin()` bypasses. Prevents clinics from retroactively claiming school-origin children.
- **Single consolidated helper** `caller_owned_child_profile_ids() RETURNS UUID[]` (SECURITY DEFINER STABLE) — returns child_profile ids where the caller has any active membership in the profile's `origin_organization_id` (kind=clinic/medical_practice). Role-agnostic: admin AND non-admin members both see their org's children. **Scope:** Care-only — must NOT be reused for cross-org sharing, school-side flows, or global identity APIs. Ownership ≠ grant-based access.
- **Strictly does NOT modify** `caller_visible_child_profile_ids()` or `caller_visible_child_profile_ids_for_identifiers()`. Smoke test T-2 mechanically asserts both bodies don't reference any Phase 6B artifact (`origin_organization_id`, `caller_owned_child_profile_ids`) via `pg_get_functiondef`.
- The two SELECT policies on `child_profiles` and `child_identifiers` are re-emitted to OR-in `caller_owned_child_profile_ids()` alongside the existing visibility helper. This is a POLICY change, not a HELPER change — the pre-existing helpers stay byte-identical.
- New INSERT policies (clinic-admin only) — each combines `caller_owned_child_profile_ids()` with an inline `EXISTS` clause that narrows to `role='clinic_admin'`:
  - `clinic_admin_insert_child_profiles` — inline EXISTS only (the row doesn't exist yet, so the helper can't apply); requires origin in caller's clinic_admin org set.
  - `clinic_admin_insert_child_profile_memberships` — `relationship_kind='clinic_client'` + child in caller's owned set + (child, org) consistency + caller is clinic_admin of the membership's org.
  - `clinic_admin_insert_child_identifiers` — child in caller's owned set + caller is clinic_admin of child's origin org.
- No DELETE / UPDATE policies for clinic admins in 6B. UPDATE on identity / identifiers is deferred. School-side policies (`school_admin_insert_*`, `school_admin_update_*`, `school_admin_write_*`) are untouched.
- **No changes to documents, students, schools, RPCs, storage, or any other table.**

**Critical isolation guarantees** (all verified in smoke 078):
- A clinic-owned child is invisible to schools. School helper arms route through `students.school_id`; no students row → 0 hits. T-12 confirms `child_profiles`, `child_identifiers`, and `child_profile_memberships` all return 0 for school_admin.
- A clinic-owned child is invisible to other clinics. The new ownership helper requires the caller to be a member of the same `origin_organization_id`. T-11 confirms cross-clinic SELECTs return 0.
- The `caller_visible_child_profile_ids()` body is byte-clean. Phase 1/4 visibility for school-origin children is unchanged.
- LRN collision is enforced cross-origin — the existing partial unique index on `(identifier_type, identifier_value, COALESCE(country_code,''))` rejects an attempt to register a school child's LRN on a clinic child. T-15 verifies.

**App-side additions.**
- `src/features/care/queries.ts` — adds `listOwnedChildren(orgId)`, `listCareChildren(orgId)` (combined view-model with `originType: 'owned' | 'shared'`), and `createOwnedChild(orgId, input)` (transactional: `child_profiles` insert → `child_profile_memberships` insert → optional `child_identifiers` inserts; best-effort rollback of profile if membership fails).
- `src/features/care/types.ts` — adds `CareChildRow`, `OwnedChild`, `ChildOriginType`. The legacy `GrantedChild` shape is preserved for internal use; the layout's combined query yields `CareChildRow`.
- `src/features/care/NewChildModal.tsx` — clinic-admin form. Display name (required), optional legal-name fields, demographics, and identifier rows (TEXT type + value + optional country code).
- `src/features/care/ChildrenList.tsx` — origin-aware row rendering. "Clinic client" green badge for owned; "Shared · Identity" / "Shared · Identity + IDs" blue badges for shared. Expiry pill only on shared rows.
- `src/features/care/ChildDetailView.tsx` — branches on `origin.originType`. Owned children always show identifiers (the ownership helper covers `child_identifiers` SELECT). The documents section shows a "No documents yet — upload arrives in a later phase" empty state for owned children with zero docs.
- `src/features/care/CareContext.tsx` — exposes `activeRole` and convenience flag `isClinicAdmin`.
- `src/app/care/layout.tsx` — passes the new context fields through.
- `src/app/care/children/page.tsx` — switches to the combined `listCareChildren` query, gates the "New child" button on `isClinicAdmin`, mounts `NewChildModal` and reloads on create.
- `src/app/care/children/[childProfileId]/page.tsx` — checks both owned and shared sources to construct the `CareChildRow` for the detail view.
- `src/lib/types/database.ts` — adds `origin_organization_id` to `child_profiles` Row/Insert/Update plus the new FK relationship entry.

**Out of scope (deferred).**
- UPDATE / DELETE on `child_profiles`, `child_identifiers`, `child_profile_memberships` for clinic admins. Typo fixes need SQL today.
- Document upload for clinic-owned children. The `child-documents` bucket and `child_documents` schema have no clinic-write path; `/care/documents` and the per-child Documents section are intentionally read-only for clinic-owned clients.
- Cross-clinic / clinic→school sharing of clinic-owned children. Requires a parent-of-the-clinic-grant flow, deferred.
- Parent-of-clinic-client portal. No `guardians` row equivalent in the clinic side yet.
- Lauris Care domain tables (therapy sessions, scheduling, billing).

**Manual setup for testing.**
1. Apply migration 078. Run `supabase/tests/078_phase6b_smoke.sql` — expect `✓ All 078 smoke tests passed.`
2. Promote the existing test clinic user to admin: `UPDATE organization_memberships SET role='clinic_admin' WHERE organization_id=$clinic AND profile_id=$user;`
3. Sign in as that user → `/care/children` → "New child" button visible (only for clinic_admin role; sign in as a 'therapist' member to confirm the button is hidden).
4. Create a clinic-owned child with optional identifiers. Confirm the row appears with green "Clinic client" badge.
5. Detail page: identifiers card populated (no "Identifier sharing not granted" lock); documents card shows the empty-state placeholder.
6. As school_admin, run `SELECT * FROM child_profiles WHERE id=$new_clinic_child_id` in the SQL editor — expect 0 rows. Same for `child_identifiers` and `child_profile_memberships`.
7. As clinic A admin, attempt `UPDATE child_profiles SET origin_organization_id=$other WHERE id=$existing` — expect rejection (column-guard).

### 2026-05-04 — Lauris Care Read-Only Portal Shell (Phase 6A)

First app-side surface for the cross-org foundation built in 071–076. A read-only clinic portal mounted at `/care`, **strictly isolated** from Lauris Learn: no UI changes inside `(dashboard)`, no edits to `middleware.ts`, no edits to `login/actions.ts` (per approval — login redirects unchanged; clinic users navigate to `/care` explicitly). No domain tables, no writes, no uploads.

**Migration 077.** One new SECURITY DEFINER STABLE function: `list_documents_for_organization(p_org_id UUID)` — anchored on `document_organization_access_grants` (the table clinic users CAN already SELECT via the 5B policy). Walks outward to fetch enrichment fields (title, type, version metadata) and resolves `child_profile_id` via `students.child_profile_id` server-side, since clinic users cannot SELECT `students` directly. Adjustment 2 from approval was the deciding factor — joining through `students` from the client would silently drop rows or fail mysteriously.
- Up-front gate: caller must have an active `organization_memberships` row in `p_org_id`; else returns 0 rows (no exception, mirrors `log_document_access` posture).
- Filter clamps: `grant.status='active'`, `grant.valid_until > NOW()`, `cd.status IN ('active','shared')`, `cd.current_version_id IS NOT NULL`, `cdv.is_hidden IS NOT TRUE`.
- **Strictly does NOT modify** `accessible_document_ids()`, `log_document_access`, `log_document_access_for_organizations`, or `caller_visible_document_ids_for_organizations()`. Smoke test T-11 mechanically asserts those four bodies don't reference the new function via `pg_get_functiondef`.
- `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated;` plus body-level `auth.uid()` gating.

**App routes (all new, no edits to existing files except `database.ts` to add the RPC type).**
- `/care` — redirects to `/care/children`.
- `/care/children` — list of children granted to the active org. `Identity` vs `Identity + IDs` badge per row, expiry pill when grant ≤14d.
- `/care/children/[childProfileId]` — identity card + identifiers card (locked state when scope is `identity_only`) + per-child shared documents. RLS does the gating: `child_profiles` resolves through Phase 4's helper, `child_identifiers` through Phase 5A's helper.
- `/care/documents` — cross-child shared documents list, anchored on the migration-077 RPC.
- `/care/access-denied` — friendly state for authed users with no active clinic/medical-practice memberships. CareLayout short-circuits (no chrome, no nav) when `memberships.length === 0`.
- `POST /api/care/documents/[id]/access` — twin of the school-side route, but calls `log_document_access_for_organizations` instead of `log_document_access`. Same 60-second signed URL minted by service-role after RPC approval. Disclosure-minimisation: internal denial reasons collapse to 404; `download_not_permitted` surfaces as 403 so the UI can hide the download button.

**Auth/role detection.** `CareLayout` calls `listMyClinicMemberships()` on mount under the user's session. Three branches:
- 0 memberships → render `/care/access-denied` (no chrome).
- 1 membership → activate it.
- ≥2 memberships → header dropdown picker; **no silent default** (per adjustment 3). Selection persisted in `sessionStorage`; cleared on sign-out. If session-stored selection no longer maps to an active membership, user must pick again.

`middleware.ts` matcher already covers `/care/*` via the catch-all — no edits needed. `src/app/login/actions.ts` is **untouched** (per adjustment 1) — clinic-only users land on `/dashboard` after login, see an empty school context, and navigate to `/care` manually.

**Files added.**
- `supabase/migrations/077_care_portal_helpers.sql`
- `supabase/tests/077_care_smoke.sql`
- `src/features/care/{types,queries,care-documents-api,CareContext,ChildrenList,ChildDetailView,SharedDocumentsList,CareDocumentAccessButton}.{ts,tsx}`
- `src/app/care/layout.tsx`, `src/app/care/page.tsx`, `src/app/care/children/page.tsx`, `src/app/care/children/[childProfileId]/page.tsx`, `src/app/care/documents/page.tsx`, `src/app/care/access-denied/page.tsx`
- `src/app/api/care/documents/[id]/access/route.ts`

**Files edited.**
- `src/lib/types/database.ts` — added `Functions.list_documents_for_organization` type signature.

**What clinic users can see.** Their org name, granted children's identity and (when scope=`identity_with_identifiers`) identifiers, documents explicitly shared with their org via `document_organization_access_grants`. Open via signed URL through the org-pathway RPC; download only when `permissions.download = true`.

**What stays hidden.** `students`, `schools`, `branches`, `classes`, `enrollments`, `attendance_records`, `parent_updates`, `events`, `progress_observations`, `billing_records`, `payments`, `student_plans` and sub-tables, `external_contacts`, `document_consents`, `document_access_grants`, `document_requests`, the existing 6-arm `accessible_document_ids()` path, `child_documents` direct SELECT (covered by smoke T-12), documents shared with other clinics, children granted to other clinics, `child_identifiers` for `identity_only` grants. All RLS-enforced — no app-side filtering acts as a security gate.

**Out of scope (deferred).**
- Login auto-redirect for clinic-only users (per approval — manual navigation only).
- Lauris Care domain tables (therapy sessions, scheduling, billing, uploads).
- Clinic-side document upload / comment / version paths.
- Clinic-side parent communication.
- Audit trail surface (clinic users don't see `document_access_events`).
- Clinic-admin self-write paths on `organization_memberships` and `child_profile_access_grants`.

### 2026-05-04 — Cross-Organization Document Sharing (Phase 5B, isolated)

Schools can now grant a clinic / medical-practice organization read access to a specific `child_documents` row. **Strictly isolated** — the existing Lauris Learn document coordination system is byte-for-byte unchanged. `accessible_document_ids()` and the `log_document_access` RPC are NOT touched.

**Migration 076.** One new table + one new helper + one new RPC + one CHECK widening.
- `document_organization_access_grants` — per-document grants (`scope='document'` only). Source = school's `school_id`, target = `organizations(kind IN ('clinic','medical_practice'))`. Carries the same `permissions` JSONB shape as `document_access_grants` for parity (`{view, download, comment, upload_new_version}`); only `view` and `download` are honoured by the new RPC in Phase 5B; `permissions` itself is immutable post-insert. `valid_until NOT NULL DEFAULT NOW()+1y`. Partial unique on `(document, target_org) WHERE status='active'`. Column-guard trigger restricts mutations to lifecycle columns only.
- `caller_visible_document_ids_for_organizations()` — new SECURITY DEFINER STABLE helper. Returns doc IDs with active, currently-valid org grants, gated by `o.kind IN ('clinic','medical_practice')` and the caller's active membership. Does NOT gate any existing RLS policy in Phase 5B; exists for the new RPC and future enumeration use cases.
- `log_document_access_for_organizations(p_doc_id, p_action, p_ip, p_user_agent)` — new SECURITY DEFINER RPC. Same return shape as `log_document_access`. Decision tree handles only the org pathway: rejects unauthenticated and `is_super_admin()`, looks up the most recent active grant for the (doc, caller's clinic-org memberships) pair, surfaces granular denial codes (`org_grant_not_found` / `org_grant_revoked` / `org_grant_expired` / `doc_revoked` / `no_visible_version` / `download_not_permitted`), checks `permissions.download` for download actions, logs to `document_access_events` with `actor_kind='organization_member'`, and returns `{ allowed, denied_reason, storage_path, mime_type, current_version_id, version_number, signed_url_ttl_seconds: 60 }`.
- Single existing-table mutation: `document_access_events.actor_kind` CHECK widened to add `'organization_member'`. Strictly additive — no rows affected, no policies touched.
- No storage policy changes. The `child-documents` bucket stays private with no client SELECT — service-role mints 60-second signed URLs after the new RPC approves, exactly the same contract as the existing API route.

**Strict isolation guarantee.** The existing 6-arm `accessible_document_ids()` body is unmodified. The existing `log_document_access` RPC body is unmodified. Smoke test T-2 mechanically asserts neither references Phase 5B artifacts via `pg_get_functiondef`. Existing Lauris Learn document flows behave identically; no regression risk on the school side.

**Decoupling: identity grant ≠ document grant.** Two completely separate tables, two separate helpers, two separate RPCs. A clinic with an active `child_profile_access_grants(scope='identity_with_identifiers')` for child P sees P's name and LRN but **zero documents**, even P's documents — unless an explicit `document_organization_access_grants` row exists per document. Smoke test T-3 verifies this directly.

**RLS.** New table policies follow the 074 asymmetric pattern:
- SELECT: school side (school_admin/teacher of source school) sees all grants for audit including revoked/expired; clinic side (active members of target org of clinic/medical kind) sees ACTIVE grants only — defense-in-depth `status='active'` clamp.
- INSERT: school_admin only, own school's documents, target must be clinic/medical-practice org, granted_by_kind='school_admin', granted_by_profile_id=auth.uid().
- UPDATE: school_admin own school's grants. Column-guard trigger limits mutations to lifecycle.
- DELETE: no policy → denied. Revoke instead.
- `is_super_admin()` bypass FOR ALL.

**RPC contract.** A future Lauris Care UI will:
1. Authenticate via Supabase Auth.
2. SELECT `document_organization_access_grants` to enumerate documents shared with the clinic (returns doc IDs + grant metadata; grant SELECT policy permits this).
3. For each doc, call `POST /api/documents/[id]/access?source=organization` (or a new dedicated route) which internally calls `log_document_access_for_organizations` under the user's session, then service-role mints a 60s signed URL.
The existing `/api/documents/[id]/access` route is **unchanged** in this migration — wiring the new RPC to a route is a future app-code change.

**Test artifact.** `supabase/tests/076_phase5b_smoke.sql` — BEGIN/ROLLBACK harness with 19 scenarios. T-2 mechanical regression check that existing helpers/RPCs are byte-clean. **T-3 critical decoupling test** (identity grant alone yields zero documents). T-4 happy path. T-5/T-6/T-7 expiry / revocation / asymmetric SELECT. T-8 cross-clinic. T-9 unrelated docs invisible. T-10 CHECKs. T-11 INSERT scope. T-12 column-guard. T-13 RPC denies super_admin. T-14 RPC denies unauthenticated. T-15 download permission. T-16 hidden version. T-17 actor_kind CHECK. T-18 storage RLS unchanged. T-19 school-internal tables stay invisible (students, schools, child_documents direct SELECT, child_document_versions, student_plans, document_consents, document_access_grants, document_requests, external_contacts).

**Out of scope (deferred).**
- Wiring the new RPC into an API route — Phase 5B is database-only.
- School-side UI to manage org grants (current `ShareDocumentModal` does not surface them; org grants are in a separate table). Until UI ships, school admins manage org grants via SQL.
- Parent-initiated document sharing with clinics — needs parent-portal UI and a consent decision.
- Clinic-initiated document requests — `document_requests` not extended.
- `comment` and `upload_new_version` permission flags — reserved as `false` in Phase 5B.
- `scope='document_type'` and `'all_for_student'` for cross-org grants — per-document only.
- Auto-expiry job to flip `status='active' → 'expired'` past `valid_until` — `valid_until > NOW()` is the inline enforcement; status flip is cosmetic.

### 2026-05-04 — Identifier Sharing (Phase 5A, additive)

Identifier-level cross-org visibility (LRN, passport, national_id, etc.) now flows through the same `child_profile_access_grants` table introduced in Phase 4. **Single consent table for both identity and identifier sharing — no new tables, no schema changes.**

**Migration 075.** Two surgical changes — one helper, one policy.
- `caller_visible_child_profile_ids_for_identifiers()` re-emitted with a 5th arm. The four existing arms (super_admin / school_admin / teacher / parent) are byte-identical to migration 074's no-op shape. The new arm requires:
  - `g.scope = 'identity_with_identifiers'` (identity_only grants do NOT contribute)
  - `g.status = 'active'`
  - `g.valid_until > NOW()` (inline expiry — no auto-flip needed)
  - `m.profile_id = auth.uid() AND m.status = 'active'` (caller's active org membership)
  - `o.kind IN ('clinic','medical_practice')` — **explicit target-org-kind guard** so identifier visibility never leaks to school orgs or future org kinds even if a grant is mistakenly issued
- `child_identifiers` SELECT policy switched from `caller_visible_child_profile_ids()` to `caller_visible_child_profile_ids_for_identifiers()`. Other policies on the table (`school_admin_write_child_identifiers`, `super_admin_all_child_identifiers`) are NOT touched — write paths and super_admin bypass unchanged.

**Lauris Learn impact: zero.** The four pre-existing arms in the identifier helper match exactly what `caller_visible_child_profile_ids()` returns for school_admin/teacher/parent. Lauris Learn users have no `organization_memberships` rows in production, so the grant arm never matches them anyway.

**Phase 4 contract preserved.** `caller_visible_child_profile_ids()` is unchanged. Identity-only sharing semantics (Phase 4) are exactly as before. Upgrading a grant from `identity_only` to `identity_with_identifiers` requires revoke-then-insert because the column-guard trigger keeps `scope` immutable — that's the explicit consent boundary between the two scope values.

**Lifecycle confirmation.**
- `status` is audit-only. The helper checks `g.status = 'active'` for inline gating but does not flip status itself. A grant with `status='active' AND valid_until < NOW()` is rejected by the helper (no access) but its column stays as-was.
- `valid_until` is the enforcement mechanism. Inline `> NOW()` check.
- No background expiry job. The drift between `status` and `valid_until` is cosmetic and only matters for audit/UX surfaces. A scheduled `'active' → 'expired'` flipper can ship later as a small additive change without touching any RLS.

**Test artifact.** Updated `supabase/tests/074_phase4_smoke.sql` — replaced T-15 in place. Old T-15 (a `pg_get_functiondef` assertion that the identifier helper had no grant arm) was a deliberate Phase 4/5 boundary check; Phase 5A breaks that boundary by design, so the assertion was rewritten to four functional sub-cases:
- T-15a — active `identity_only` grant → 0 identifiers (identifier scope gate honoured).
- T-15b — `identity_with_identifiers` grant (created via revoke-then-insert from the T-15a grant) → identifiers visible, including the LRN row's value.
- T-15c — expired grant → 0 identifiers (inline expiry enforcement).
- T-15d — revoked grant → 0 identifiers (status gate honoured).

**Out of scope (deferred).**
- Background expiry job (`'active' → 'expired'` flipper) — purely cosmetic for now.
- Parent self-grant path + parent-portal UI for the upgrade-to-identifier flow.
- Cross-org document sharing — separate consent surface, much larger lift.
- Lauris Care domain tables.
- A scope-upgrade migration helper (revoke-then-insert is the only supported pattern; the column-guard trigger enforces it).

### 2026-05-04 — Child Profile Access Grants (Phase 4, identity-only consent)

Explicit, time-bounded, revocable consent records that authorise a target organization (clinic / medical practice) to read a child's identity. **Strictly additive — no Lauris Learn behaviour change, no UI, no Lauris Care domain tables.** Phase boundary explicit: Phase 4 = identity_only; Phase 5 = identifiers + cross-org documents.

**Migration 074.** One new table + one helper update + one new no-op helper.
- `child_profile_access_grants` — `(child_profile_id, source_organization_id, target_organization_id, granted_by_profile_id, granted_by_kind, purpose, scope, status, valid_from, valid_until, revoked_*)`. `valid_until` is `NOT NULL DEFAULT NOW() + INTERVAL '1 year'` — every grant expires unless renewed. Per-row CHECKs: `source <> target`, `valid_until > valid_from`, `scope IN ('identity_only','identity_with_identifiers')`, `status IN ('active','revoked','expired')`, `granted_by_kind IN ('parent','school_admin','super_admin')`. Partial unique index on `(child_profile_id, target_organization_id) WHERE status='active'` — replacing a grant means revoke-then-insert.
- `caller_visible_child_profile_ids()` — re-emitted with a fifth arm gated by `(grant.status='active' AND grant.valid_until > NOW() AND member.status='active' AND member.profile_id = auth.uid())`. The four existing arms are byte-identical; Lauris Learn behaviour is unchanged.
- `caller_visible_child_profile_ids_for_identifiers()` — **new** helper, identical to the main helper minus the grant arm. Ships as a NO-OP in Phase 4. Phase 5 will flip the `child_identifiers` SELECT policy to use it; until then it is unused.
- Column-guard trigger `cpag_column_guard_trigger` makes `child_profile_id`, `source_organization_id`, `target_organization_id`, `granted_by_profile_id`, `granted_by_kind`, `scope`, `purpose`, `valid_from`, `created_at` immutable post-insert. Mutable columns: `status`, `valid_until`, `revoked_at`, `revoked_by_profile_id`, `revoke_reason`, `updated_at`. `is_super_admin()` bypasses the guard.

**Asymmetric SELECT policy on the grants table** — school side sees all grants whose `child_profile_id` is in their visibility set, including revoked/expired rows for audit. Clinic side (target-org members) sees `status='active'` rows only — explicit `status='active'` clamp in the policy is defense-in-depth on top of the helper's expiry filter, ensuring revoked rows targeting them disappear from their view immediately.

**Critical Phase 4 invariant.** Clinic users with an active grant gain `child_profiles` visibility for the granted child. They DO NOT gain visibility into `child_identifiers` (LRN etc.), `child_documents`, `student_plans`, `students`, `schools`, or any other Lauris Learn record. The smoke test verifies this in T-5, T-13, T-14 plus T-15's mechanical `pg_get_functiondef` check that the new identifier helper has no grant/membership references.

**Write paths.** INSERT is `super_admin` (full bypass) + `school_admin` (own school's org as source, child linked to a student in own school, granted_by_profile_id = auth.uid(), granted_by_kind = 'school_admin'). UPDATE is `super_admin` + `school_admin` (own school's grants, restricted by column-guard to lifecycle fields). DELETE: no policy → denied. Parent self-grant path deferred to a later phase along with parent-portal UI for Lauris Care invites.

**Test artifact.** `supabase/tests/074_phase4_smoke.sql` — BEGIN/ROLLBACK harness with 15 scenarios. T-1 schema present. T-2 `valid_until` NOT NULL with ~1-year default. T-3 Lauris Learn unchanged. T-4 Phase 3 isolation regression (clinic without grant). **T-5 ★ critical Phase 4 — clinic with grant sees `child_profiles` but NOT `child_identifiers`.** T-6 expiry drops access. **T-7 revocation drops access AND hides the grant row from clinic** (defense-in-depth). T-8 asymmetric audit — school still sees revoked grant. T-9 cross-clinic. T-10 CHECKs. T-11 school_admin INSERT scope (kind-spoofing rejected, granted_by mismatch rejected). T-12 column-guard rejects mutating immutable columns, accepts lifecycle. T-13 documents/plans/students/schools still hidden. T-14 child_identifiers still hidden. **T-15 ★ Phase 5 boundary — `caller_visible_child_profile_ids_for_identifiers` body has no grant/membership refs.**

**Out of scope (Phase 5 will deliver).**
- Identifier sharing — flip `child_identifiers` SELECT to the new helper, then add an identifier-aware grant arm (or a dedicated `child_identifier_access_grants` table).
- Cross-org document sharing — much larger lift; needs its own consent shape distinct from identity grants.
- Parent self-grant path — needs parent-portal UI for the Lauris Care invite flow.
- Clinic-admin self-write paths on `child_profile_access_grants` (bilateral acceptance flows).
- Auto-expiry job — currently `valid_until > NOW()` is enforced inline by the helper; flipping `status='active'` to `'expired'` is left to a future scheduled job, but identity access already drops at the helper level the moment the timestamp passes.

### 2026-05-04 — Organization Memberships (Phase 3, linking only)

Bridge phase that lets Lauris Care users authenticate and see only the bare structural links to their clinic. **No school data, no child identity records, no UI, no Lauris Care domain tables.** Phase boundary is explicit: Phase 3 = LINKING ONLY; Phase 4 = CONSENT + VISIBILITY of `child_profiles` / `child_identifiers` across organizations.

**Migration 073.** One new table + one helper update.
- `organization_memberships` — many-to-many between `profiles` and `organizations`. `role TEXT` (no enum) so Lauris Care can populate richer roles later. `status IN ('active','suspended','ended')`. Partial unique index keeps at most one active row per (org, profile). No backfill — Lauris Learn does NOT populate this table; it keeps using `profiles.school_id` + `profiles.role` for its own authz.
- `caller_visible_organization_ids()` — re-emitted with a fourth arm: `any user with an active organization_memberships row → that organization`. Suspended/ended memberships are excluded from the helper, so org access drops the moment status flips. Existing super_admin / school_admin+teacher / parent arms unchanged.

**Critical phase-boundary decision.** `caller_visible_child_profile_ids()` (the Phase 1 helper) is **NOT modified** in Phase 3. A membership represents a relationship, not consent. Without an explicit consent record, clinic users cannot see `child_profiles` or `child_identifiers` of children linked to their clinic — they only see the link rows themselves (which carry a `child_profile_id` UUID they cannot dereference). The Phase 1 promise to gate cross-app identity visibility behind explicit consent is honoured in full; Phase 4 will introduce the consent model and only then add a fifth arm to the helper.

**Clinic-user visibility matrix (Phase 3).**
- ✅ Their organization row (kind='clinic') — via the new helper arm.
- ✅ Their own `organization_memberships` row, including ended/suspended rows (audit).
- ✅ Colleagues' membership rows in clinics they're an active member of.
- ✅ `child_profile_memberships` rows whose `organization_id` matches one of their orgs (the OR-on-org arm in the Phase 2 policy automatically extends here once the helper is widened).
- ❌ `child_profiles` — Phase 1 helper unchanged, no clinic arm.
- ❌ `child_identifiers` — sub-row policy chains through `child_profiles`.
- ❌ `schools`, `students`, `child_documents`, `student_plans`, `external_contacts`, `enrollments`, `billing_records`, `parent_updates`, `events`, `progress_observations`, `attendance_records`, every Lauris Learn record — gated by school-scoped RLS, no clinic arm anywhere.

**Write paths.** INSERT/UPDATE/DELETE on `organization_memberships` is super_admin only in Phase 3. Lauris Care UI will add clinic-admin self-write paths in a later phase. Existing Phase 2 write paths on `organizations` and `child_profile_memberships` are untouched — clinic creation and child-clinic linking remain super_admin operations executed via SQL until Lauris Care has its own admin UI.

**Test artifact.** `supabase/tests/073_phase3_smoke.sql` — BEGIN/ROLLBACK harness with seven scenarios. T-1 Lauris Learn unchanged for school_admin. T-2 orphan LC-style user has zero visibility (regression of Phase 2 T-8). **T-3 ★ critical linking-only matrix ★** — clinic therapist sees exactly: 1 org, 1 own membership, 1 child_profile_membership; AND zero child_profiles, zero child_identifiers, zero schools/students/docs/plans/external_contacts/enrollments. T-4 cross-clinic isolation. T-5 ending a membership immediately drops org + cp_membership access (own ended row stays visible for audit). T-6 super_admin bypass intact. **T-7 ★ Phase 1 promise check ★** — uses `pg_get_functiondef` to confirm `caller_visible_child_profile_ids()` body still contains no reference to `organization_memberships` or `child_profile_memberships`; the helper is provably frozen.

**Out of scope (Phase 4 will deliver these).**
- Explicit child-profile consent records (`child_profile_share_consents` or similar) — the artifact that authorises a clinic to read a child's identity record.
- Update to `caller_visible_child_profile_ids()` adding the membership+consent arm.
- Clinic-admin self-write paths on `organization_memberships`.
- Lauris Care domain tables (clinic_clients, therapy_sessions, etc.).
- Cross-app document/plan sharing.

### 2026-05-04 — Organizations + Child-Profile Memberships (Phase 2, additive)

Cross-app foundation for future sister apps (Lauris Care = therapy/clinic, Lauris Med = doctors). **Strictly additive — no behavior change in Lauris Learn, no UI changes, no Phase 1 RLS modifications.**

**Migration 072.** Two new tables and one new RLS helper.
- `organizations` — generic tenant. `kind TEXT` (no enum) covers `'school' | 'clinic' | 'medical_practice'` and future kinds without DDL. Reverse FK `school_id` shadows each existing school 1:1 (partial unique on `(school_id) WHERE kind='school' AND school_id IS NOT NULL`). Misuse guard: `CHECK (school_id IS NULL OR kind = 'school')` — prevents a clinic row from carrying a school_id by mistake. `created_in_app` is informational (`'lauris_learn'` for Phase 2 backfill rows). Schools is left **untouched** — no FK column added there. Bridge direction is reverse-FK only.
- `child_profile_memberships` — one row per (child, organization) relationship. Naturally supports the business rules: one child → one school (1 row, kind=school); one child → multiple clinics (N rows, kind=clinic); one child → multiple doctors (N rows, kind=medical_practice). `relationship_kind` is TEXT for future flexibility. `status IN ('active','ended')`; partial unique index keeps at most one active row per (child, org).

**Backfill — idempotent.** (A) one `kind='school'` org per existing school, name copied from `schools.name`; (B) one active `'enrolled_student'` membership per `students.child_profile_id IS NOT NULL`, joining the student's school's shadow org, `started_at = students.created_at::date`. Both blocks guarded by `NOT EXISTS` — re-runs insert 0 rows.

**Deliberate non-decisions.**
- ❌ **No `organization_memberships` table.** Deferred to Phase 3 when Lauris Care users actually exist. Shipping it empty would introduce a second auth model that risks confusion. Lauris Learn continues to use `profiles.school_id` + `profiles.role`.
- ❌ **No AFTER INSERT trigger on `schools`.** Future schools must have their organization row created by application code (or a follow-on backfill). The core Lauris Learn tenant table stays free of hidden side effects.
- ❌ **No changes to `caller_visible_child_profile_ids()`.** Phase 1's helper is frozen. Phase 3 will add an org-membership arm gated by explicit consent.

**RLS — strict, additive only.** New helper `caller_visible_organization_ids()` (SECURITY DEFINER STABLE) unions super_admin, school_admin/teacher (via `current_user_school_id()`), and parent (via `parent_student_ids() → students.school_id`). Each arm only resolves the school's own kind='school' shadow org — clinics and medical practices are invisible to Lauris Learn users in Phase 2.
- `organizations`: SELECT gated by helper. INSERT restricted to `school_admin` for `kind='school'` rows in their own school (clinic/medical INSERTs denied — no policy). UPDATE same constraint. No DELETE. `is_super_admin()` bypass FOR ALL.
- `child_profile_memberships`: SELECT gated by `child_profile_id = ANY(caller_visible_child_profile_ids()) OR organization_id = ANY(caller_visible_organization_ids())`. The OR-on-org arm is forward-compatible — Phase 3 will broaden the org helper, automatically extending cross-app reads without modifying this policy. INSERT restricted to `school_admin` linking own-school students to own-school's org as `enrolled_student`. UPDATE/DELETE super_admin only. `is_super_admin()` bypass FOR ALL.

**Critical isolation guarantee.** A synthetic Lauris-Care-style user (profile with `school_id=NULL`, `role=NULL`) has zero visibility into Lauris Learn data — `organizations`, `child_profile_memberships`, `child_profiles`, `students`, `child_documents`, `student_plans` all return 0 rows. Verified by smoke test T-8.

**Test artifact.** `supabase/tests/072_org_phase2_smoke.sql` — BEGIN/ROLLBACK harness with 11 scenarios: T-1/T-2 backfill counts, T-3 CHECK constraint, T-4 partial-unique, T-5/T-6 school_admin scope on organizations, T-7 child_profile_memberships dual-arm SELECT, **T-8 critical Lauris-Care-style isolation test (zero visibility into Lauris Learn data)**, T-9 Phase 1 helper preserved, T-10 child_documents + student_plans inserts still work, T-11 backfill idempotency.

**Phase 3 (future) will need to:** ship `organization_memberships`, add an org-membership arm to `caller_visible_organization_ids()`, add an org-membership-with-explicit-consent arm to `caller_visible_child_profile_ids()`, and introduce Lauris Care / Lauris Med tables alongside their own RLS policies. None of that lands in Phase 2.

### 2026-05-04 — Shared Child Identity layer (Phase 1, additive)

Foundation for future cross-app identity sharing (Lauris Care for therapy/clinic, Lauris Med for doctors). **Strictly additive — no behavior change in Lauris Learn.**

**Migration 071.** Two new tables and one nullable FK column.
- `child_profiles` — school-agnostic identity head. Required `display_name` for apps that don't capture legal-name detail (Lauris Care). Optional `legal_name` plus split `first_name`/`middle_name`/`last_name`/`preferred_name`. Demographics (`date_of_birth`, `sex_at_birth`, `gender_identity`, `primary_language`, `country_code`) all nullable for international flexibility. `country_code` is NOT defaulted on backfill. `created_in_app` ('lauris_learn' default) is informational provenance, not used for authz.
- `child_identifiers` — open identifier table. `identifier_type TEXT` with non-blank CHECK (not an enum) so future identifier kinds — LRN, passport, national IDs, Lauris Med codes — don't need DDL. NULL-safe uniqueness via partial unique index `(identifier_type, identifier_value, COALESCE(country_code, ''))` so duplicate `(type, value)` rows can't slip through when `country_code` is NULL.
- `students.child_profile_id UUID` — nullable FK to `child_profiles(id) ON DELETE SET NULL`. Indexed.

**UUIDs.** Migration uses `gen_random_uuid()` (pgcrypto), not `uuid_generate_v4()` (uuid-ossp), to avoid an extension-dependency mismatch on Supabase projects where uuid-ossp may not be enabled.

**Backfill — direct deterministic mapping.** Single `WITH minted AS MATERIALIZED` CTE pre-mints `(student_id, profile_id)` pairs; both the INSERT (into `child_profiles`) and the UPDATE (on `students`) consume that materialized table, so each existing student maps 1:1 to exactly one new profile by carried `student_id` — no name/DOB matching, no ROW_NUMBER pairing. `MATERIALIZED` guarantees `gen_random_uuid()` is evaluated once. `display_name` is computed null-safely with `COALESCE(NULLIF(btrim(COALESCE(first,'') || ' ' || COALESCE(last,'')), ''), 'Unknown')` so existing students with missing name fields don't violate the non-blank CHECK. Then for every student with `student_code` set: insert a `child_identifiers` row with `identifier_type='school_internal'`, `country_code='PH'`. Country here is identifier metadata, not child-profile metadata. Idempotent; re-running is a no-op.

**RLS.** Default-deny. New helper `caller_visible_child_profile_ids() RETURNS UUID[]` (SECURITY DEFINER STABLE) unions super_admin, school_admin (via `students.school_id = current_user_school_id()`), teacher (via `teacher_visible_student_ids()`), and parent (via `parent_student_ids()`). Policies on both new tables: SELECT gated by the helper; INSERT/UPDATE on child_profiles restricted to school_admin (UPDATE additionally requires the profile to already be linked to a student in the admin's school); child_identifiers writes piggyback on the same admin-of-linked-school check; `is_super_admin()` bypass FOR ALL on both tables. No DELETE policies in Phase 1 (= denied). Audit triggers (`audit_log_trigger`) on both tables — actor's `profile.school_id` is the fallback for the school-agnostic rows.

**Out of scope (Phase 2):** organizations / organization_memberships / child_profile_memberships, FKs from `child_documents` / `student_plans` to `child_profiles`, parent or external write paths, sister-app schemas. Phase 1 leaves all current student/document/plan behavior untouched.

**Test artifact.** `supabase/tests/071_child_identity_smoke.sql` — BEGIN/ROLLBACK harness covering: T-1 backfill correctness (every student linked, no blank display_name); T-2 school_admin SELECT/UPDATE/INSERT on linked profiles + identifier insert; T-3 cross-tenant isolation; T-4 teacher visibility (only class-visible profiles, INSERT denied); T-5 parent INSERT denial (skipped if no parent profile); T-6 NULL-safe uniqueness via the partial unique index; T-7 child_documents + student_plans inserts still work; T-8 backfill idempotency (re-run inserts 0 rows).

### 2026-05-04 — Plans & Forms (IEP Plan foundation, additive)

Added a third view to the Document Coordination workspace: **Plans & Forms**, alongside the existing Documents and Requests. Distinct from the uploaded-document system — uploaded IEP PDFs continue to live under Documents (`child_documents.document_type = 'iep'`), while structured IEP Plans authored inside Lauris Learn live in the new `student_plans` family.

**Migration 070 (additive only).** Two new enums (`plan_type`, `plan_status`) and five new tables: `student_plans` (head; profile/parent/review fields inline), `student_plan_goals`, `student_plan_interventions`, `student_plan_progress_entries`, `student_plan_attachments` (the linkage table that REFERENCES existing `child_documents.id` so attachments reuse the existing storage bucket and document RLS instead of carrying their own files). RLS follows the project pattern: `school_admin` FOR ALL within their school, `teacher` SELECT + INSERT/UPDATE on plans of students they teach via `teacher_visible_student_ids()` while status is non-terminal, super_admin bypass for parity with migration 002. Sub-row policies piggyback on the head via `EXISTS (SELECT 1 FROM student_plans …)`. Reuses `set_updated_at()` and `audit_log_trigger()`.

**Permissions baked into v1.** Parents have no UI and no RLS write path (deferred until parent portal sharing). Approve / Archive transitions are admin-only — RLS allows teachers to UPDATE only while status is in `('draft','submitted','in_review')`, which means a teacher trying to flip status to `approved` is rejected at the policy level even if the UI somehow exposed the action.

**UI module — `src/features/plans/`.**
- `PlansAndFormsView` — five category cards (IEP Plans active; Support Plans, Behavior Plans, Other Forms, Templates rendered as placeholder cards with a small "Soon" lock badge) + status filter + IEP plans list + New IEP Plan button.
- `IEPPlansList` — table with title, student, school year, status badge (mapped to existing Badge variants: draft/scheduled/waitlisted/active/archived), last-updated.
- `IEPPlanModal` — 7 section tabs in a horizontal strip rather than one long form: Student Profile / Goals / Interventions / Progress / Parent Input / Review & Approval / Attachments. Header strip shows Student / Status / Created By / Last Updated. Action row: Save Draft, Submit For Review, Approve (admin), Archive (admin), Export PDF (disabled placeholder). Goals/Interventions/Progress are repeatable blocks with Add/Trash buttons. Progress entries can optionally link to a goal via dropdown. Attachments tab pulls the student's `child_documents` rows for the picker.

**Save model.** `savePlan` in `queries.ts` upserts the head with a stable client-supplied UUID (`crypto.randomUUID()` minted on modal open for new plans), then performs a diff-save on each sub-row collection: upsert kept rows by id, delete plan-scoped rows whose id is not in the new set. Attachments key on `(plan_id, document_id)`; we read existing rows and compute add/remove sets. Status transitions use a separate `setPlanStatus()` so admins can Approve/Archive without re-saving the entire form.

**Wiring.** `src/app/(dashboard)/documents/page.tsx` — `ViewMode` extended with `"plans-forms"`, third `ViewTab` added with `ClipboardList` icon, body switch promoted from binary to ternary. The existing filter card is hidden in the Plans & Forms view (PlansAndFormsView has its own status filter). Documents and Requests views are untouched. The header's Upload Document / Request Document buttons remain on screen across all three views — clicking them in Plans & Forms still works (opens the existing modals); we didn't gate them since they let the user create across views without re-tabbing.

**StaffPicker reuse.** The Review tab's "Reviewed By Teacher" / "Reviewed By Admin" pickers reuse the existing `list_school_staff_for_sharing` SECURITY DEFINER RPC (migration 065) for the same reason the document share modal does — base `profiles` SELECT only exposes the caller's own row, so we'd otherwise see an empty dropdown.

**Out of scope (intentionally deferred).** No template builder. No parent-portal write path. No PDF export (button is a disabled placeholder). No sidebar entry for Plans & Forms — kept inside Document Coordination per spec. Future work (sibling categories, templates, parent acknowledgement-via-portal) plugs in without DDL because the schema is keyed on `plan_type` and the UI's category cards are placeholders.

**Test steps after applying migration 070.**
1. Run `supabase/migrations/070_student_plans.sql` in the SQL editor.
2. Sign in as a `school_admin` of BK. Navigate to Documents — confirm the third tab "Plans & Forms" appears alongside Documents and Requests.
3. Click "New IEP Plan", pick a student, enter a title, add a goal and an intervention, click Save Draft. Confirm the plan appears in the list with `Draft` badge.
4. Reopen it, switch to Progress, add an entry linked to the goal, Save Draft. Confirm the entry persists. Remove a goal, Save Draft — confirm the dropped goal is deleted server-side and any progress that linked to it now shows `— No specific goal —` (FK is `ON DELETE SET NULL`).
5. Click Submit For Review → Approve. Confirm `approved_at` and `approved_by` populate (visible via `select` in SQL editor) and the badge flips to Active/green.
6. Sign in as a teacher who teaches that student's class. Confirm they can SELECT and create draft/submitted plans but cannot Approve.
7. Confirm uploaded IEP PDFs still appear in the Documents tab and are unchanged. Open one and confirm View/Download still mints a signed URL through the Phase C route.

### 2026-05-03 — Document Coordination D16 (Polish) + bug fixes

Closed out the school-side build with a small batch of polish + two real bugs surfaced during the close-out test pass.

**Bug — Cancel button submitting forms.** During B5 testing, the Cancel button inside a modal with unsaved changes appeared to bypass the discard prompt on second click. Root cause: our `Button` component has no default `type`, so HTML defaults to `type="submit"` when nested in a `<form>`. ModalCancelButton inside any form modal was actually submitting the form on click — first click did nothing because validation failed, but second click after the user had filled enough fields triggered `onSubmit` and closed the modal via the success path. Fix: explicit `type="button"` on `ModalCancelButton`, the Modal's `X` close button, and the discard-strip's "Keep editing" / "Discard changes" buttons. All three are now safe inside forms.

**Bug — Migration 068 (parent transition guard NULL-role).** During B4.5 testing, manually running `UPDATE document_consents SET status='granted' …` in the Supabase SQL editor failed with `granted_by_guardian_id must match one of the calling parent's guardian rows`. Root cause: trigger 4.1 used `IF current_user_role() <> 'parent'` to early-return, but `NULL <> 'parent'` evaluates to NULL (not TRUE), so the early-return didn't fire for SQL-editor sessions where `auth.uid()` is null. Migration 068 switches to `IS DISTINCT FROM 'parent'::user_role` and marks the trigger SECURITY DEFINER so future cron / admin-script paths chain cleanly. Behavior for actual parent callers is unchanged.

**B3.4 clarification (no code change).** When testing internal-revoke, the teacher could still see the document after the grant was revoked. That's expected behavior — the teacher already has access via `teacher_visible_student_ids()` (the class-teacher path), and the grant was redundant. Grants are meaningful for staff who *don't* already have direct access (e.g., a teacher of a different class, or the parent of a different student). Documented in the Help drawer "Who can do what" topic.

**Polish — title consistency.** Modal titles normalized to Title Case across `Hide Version`, `Upload Version N`, `Archive Document` / `Archive Shared Document`, `Share Document`, `Request Consent` / `Consent Requested`, `Revoke Access`, `Cancel Request`. Matches the rest of the dashboard's modal title style.

**Polish — expiring grants.** GrantRow in the Access tab now renders an amber `Expires in Nd` (or `Expires today`) badge when the grant is active and within 14 days of expiry. Same threshold as the existing review-date soon indicator on doc rows.

**Polish — empty states.** Versions tab and Access tab empty states now have an icon, a one-line headline, and a one-line action hint (role-aware on Versions). Helps new users discover the next action.

**Polish — Help drawer.** Documents page now has a Help drawer following the established pattern. 13 topics: what the feature is for, upload, statuses, versions, share with staff, share with external (consent gate), consent states, revoke, expiring badge, request, activity audit, privacy model, role permissions. Searchable. Resolves the "Help Drawer Rule" coverage gap noted in CLAUDE.md.

### 2026-05-03 — Document Coordination D15 (Activity tab)

Read-only Activity tab in `DocumentDetailModal` (staff only). Lists the newest 50 `document_access_events` for the document, newest first, capped at 50 per the spec. No analytics, no export, no comments.

**Action labels follow the spec wording**: signed_url_issued → "Access Link Issued", preview_opened → "Preview Opened", download → "Download Requested", access_denied → "Access Denied" (red treatment). The legacy `view` action is mapped to "Viewed" defensively even though v1 doesn't emit it (the access route always logs `signed_url_issued`).

**Actor name resolution** reuses the same staffMap + externalMap that the Access tab loads — opening Activity also calls `reloadAccess()` so the lookup maps are warm. Resolution order: profiles map (named staff) → external_contacts map (named external contact) → `actor_email` baked into the row → humanized actor_kind ("School admin", "Teacher", "Parent", "External contact", "Platform admin", "Not signed in"). The same `profiles` RLS limitation as the Access tab applies — staff names only resolve for the caller's own row, but the access RPC always populates `actor_email` so the email fallback covers the gap.

**Denied reasons** get a small mapping for the codes the access RPC emits (`no_visible_version`, `not_authorized`, `consent_not_granted`, `consent_expired`, `grant_revoked`, `grant_expired`, `download_not_permitted`, `doc_revoked`, `doc_not_found`). Anything unrecognized renders verbatim.

**Where it lives.** `src/features/documents/events-api.ts` (single `listAccessEvents` query), plus `ActivityTab` + `EventRow` co-located inside `DocumentDetailModal.tsx`. Tab visibility gated by `isStaff`, matching the Access tab gate.

### 2026-05-03 — Document Coordination D14 (Requests)

The workspace page now has a Documents / Requests view toggle. The previously-disabled "Request Document" header button opens `RequestDocumentModal`.

**Modal shape.** Student picker (or pre-locked when launched from a student-scoped URL), document type, recipient mode tabs (Parent / External), then per-mode picker:
- Parent → guardians for the picked student (auto-selects when there's only one).
- External → reuses `ExternalContactPicker`. Inline-create is exposed only when `isAdmin` (school_admin INSERT-only on `external_contacts`); teachers can only pick from existing.
Required reason, optional due date, plus a confirmation strip. Submit calls `createRequest` (`requests-api.ts`) which inserts with `status='requested'`, `requester_user_id = auth.uid()` per the INSERT policy.

**Requests view.** Reuses the workspace's filter card (status filter only; the document-side search/type filters are hidden in this mode). Empty state copy guides the user to the Request Document button. The list is a table — Document type / Student / From / Status / Due / Action. Active rows (`requested`, `submitted`) get a per-row Cancel button (school staff). Inactive rows render as audit-only.

**Cancel.** `CancelRequestModal` confirms with an optional reason and writes `status='cancelled'`, `cancelled_at`, `cancelled_reason`. Inactive rows show the cancellation reason inline.

**Joined-row visibility caveat.** `requester_user.full_name` resolves through `profiles`, which RLS only exposes for the caller's own row. So in the requests list, the requester's name only appears for requests the current admin created themselves. Other rows show no requester — fine for v1; we display the recipient prominently and the requester is the audit-trail concern, not a UX one. Same workaround as the Access tab, and the same Settings UI follow-up applies.

**Out of scope (per D14 spec).** Submitted/reviewed transitions need parent/external-side UI to be useful — that's Phase E. School-recipient requests (`requested_from_kind='school'`) need a cross-school directory we don't have. No DELETE; the existing `school_admin_delete_cancelled_document_requests` policy permits it but the UI doesn't expose it.

### 2026-05-03 — Document Coordination D13 (Revoke access)

`RevokeAccessModal` ships per-grant revoke from the Access tab. Active grants render a small **Revoke** button (admin only) which opens a confirmation modal showing the recipient, current permissions, and expiry, plus an optional reason textarea. Submit calls `revokeGrant` (new in `share-api.ts`) with only the three revocation columns (`revoked_at`, `revoked_by`, `revoke_reason`) — column-guard trigger 4.2 already rejects any other field, so we send the minimum and trust the DB.

The Access tab keeps revoked grants visible under "No longer active" with a red **Revoked** tag (distinguished from expired grants which keep the muted tag), the revoke timestamp, and the reason. No Revoke action renders on already-inactive rows. There is no DELETE policy on the table — grants are revoked, never deleted, so the audit story stays intact.

Phase A trigger 5.G's `UPDATE OF` list omits `revoked_*`, so the consent-invariant validator does not re-run on revoke (correct: revoking should never be blocked by consent state changes). The cascade trigger 5.H is unaffected and continues to handle bulk revoke when a parent revokes a covering consent — that path still needs `SECURITY DEFINER` before parent UI lands (see "Remaining").

### 2026-05-03 — Document Coordination D11 + D12 + teacher-bridge fix

Continued the build past D10 with two consent-gated steps and one schema fix baked in alongside.

**Migration 066 — teacher_profiles ↔ auth.users bridge.** First-time teacher login under D10 surfaced the regression we accepted at migration 058: `class_teachers.teacher_id` references `teacher_profiles(id)`, but the three teacher RLS helpers/policies still compared the join key to `auth.uid()`. Net result: any teacher login got zero rows for `child_documents` reads, `parent_updates` insert, and `proud_moments` visibility. Fix is a nullable, unique `auth_user_id` column on `teacher_profiles` plus a CASE-INSENSITIVE email backfill from `profiles` (role='teacher'), then re-emitting `teacher_visible_student_ids()`, `teacher_student_ids()`, and `teacher_insert_parent_updates` to resolve `auth.uid() → teacher_profiles.id → class_teachers.teacher_id`. Demo seeder updated to populate the column on every teacher_profile it creates. Re-linking after the backfill (e.g. when a teacher's auth email changes) is a single SQL UPDATE today; a Settings UI is queued under "Remaining".

**D11 — ConsentRequestModal.** New modal drafts a `document_consents` row in `pending`. v1 only writes document-scoped consents (`scope.type='document'`); the UI doesn't expose document_type / all_for_student scopes (the trigger 5.F validation still accepts them). Required fields: purpose, expiry; toggles for allow_download / allow_reshare. Inserts respect `school_staff_insert_document_consents` (status='pending', requested_by_user_id=auth.uid()). Parent-side approval still happens via SQL until the Phase E parent UI lands.

**D12 — External sharing in ShareDocumentModal.** The modal now has Staff/External target tabs. Picking External shows `ExternalContactPicker` (combobox over `external_contacts` with an inline "Add new contact" form, school_admin only via INSERT policy). When a contact is picked the modal looks up the most recent live consent that covers (this document, this contact). The pre-flight has three branches:
- **No covering consent** → the share button stays disabled, with a "Request consent" button that opens `ConsentRequestModal` stacked over the share modal. After submit, `reloadConsents()` runs so the share modal immediately reflects the new pending row.
- **Pending consent** → block, show "Awaiting parent's decision" with the original purpose.
- **Granted consent** → unblock; clamp the user-chosen expiry to `consent.expires_at` (with an amber "Capped to consent expiry" notice when it actually clamped); force download checkbox off when `consent.allow_download = false`; submit creates an `external_contact` grant via `createExternalGrant` carrying the consent_id.

The trigger 5.G + `accessible_document_ids()` clauses validate the same invariants server-side (recipient match, grant.expires_at ≤ consent.expires_at, status='granted'), so client-side guards are UX, not security.

**Access tab.** Now also loads `external_contacts` so external grants render their contact's name instead of the generic "External contact" label.

**Files added:** `src/features/documents/consent-api.ts`, `src/features/documents/ConsentRequestModal.tsx`, `src/features/documents/ExternalContactPicker.tsx`, `supabase/migrations/066_teacher_profile_auth_bridge.sql`. Updates to `share-api.ts`, `ShareDocumentModal.tsx`, `DocumentDetailModal.tsx`, `src/lib/demo/index.ts`.

**Where to resume:** D13 — RevokeAccessModal (per-grant revoke with reason; sets revoked_at/revoked_by/revoke_reason via the existing column-guard policy). After D13: D14 (request-document workflow), D15 (Activity tab from `document_access_events`), D16 (polish + Help drawer), then Phase E (parent portal) which finally unblocks live consent grants.

### 2026-05-03 — Document Coordination D8 → D10

Continued the Document Coordination build after D7 in the same date.

**D8 — Version modals.** `UploadVersionModal` adds v(N+1) using the same 5-step transactional pattern as D7 (client-side UUID, no INSERT…RETURNING) and repoints the head's `current_version_id` after the version row lands. `HideVersionModal` flips `is_hidden = true` with a required reason; pre-flight refuses to orphan a non-draft document, and Phase A trigger 5.E provides the matching server-side guard plus auto-repointing the head if the hidden version was current.

**D9 — Status transitions.** `ConfirmStatusModal` covers `draft → active` (any staff, only when `current_version_id IS NOT NULL`) and `active|shared → archived` (admin only). `revoked` is intentionally not exposed; archived/revoked are terminal in v1. Status actions render as a small button bar in the modal header — only when at least one transition is available. Archive captures an optional `archive_reason` saved to the column.

**Modal nested-dirty bug fix.** While testing D8, `UploadVersionModal` would mark the parent `DocumentDetailModal` "dirty" because the parent `Modal` listens to native `input`/`change` events on its content `div` and sub-modals are children of that div. Fix in `src/components/ui/modal.tsx`: tag every overlay with `data-modal-overlay` and ignore events whose nearest `[data-modal-overlay]` isn't the parent modal's own overlay. Each modal now keeps its dirty state private.

**D10 — Internal sharing.** Scope was strictly internal (`grantee_kind='school_user'`, same school, `consent_id=NULL`). Built `ShareDocumentModal` and an Access tab inside `DocumentDetailModal`. Permissions: view is locked on, download defaults off, comment/upload_new_version are deferred and stay false in v1. Expiry is required, with 30/90/180/365 presets and a custom date; the value is pushed to end-of-day so a "30 days" pick really gives 30 days. Confirmation strip uses the exact spec copy: "{name} will be able to view this document until {date}."

**Real blocker hit (D10) — staff picker visibility.** The base `profiles` SELECT policy in `supabase/schema.sql` only allows a user to see their own row, and migration 002 only adds a super-admin bypass. There is no same-school SELECT on `profiles`, so a school_admin building the picker would see zero candidates. `grantee_user_id` is FK to `profiles(id)`, so substituting `teacher_profiles` (standalone IDs) wasn't an option. Two paths considered: (a) add a same-school SELECT policy on profiles, (b) add a tightly scoped SECURITY DEFINER RPC. Picked (b) for minimal surface — **migration 065** adds `list_school_staff_for_sharing(p_school_id UUID)` returning `id, full_name, email, role` for `school_admin`/`teacher` profiles in the caller's school, excluding the caller. The RPC follows the same disclosure-minimization posture as `log_document_access`: a caller who isn't the school_admin of `p_school_id` simply gets zero rows (no exception). Added to `database.ts` Functions block.

**Access tab.** Lists current grants on the document, split into Active and "No longer active" sections (revoked or expired). Grantee names come from the same `list_school_staff_for_sharing` lookup we use for the picker (because direct profile reads are still blocked for non-self rows). Revoke action is intentionally not in this step — that lands in D13.

**Where to resume:** D11 — ConsentRequestModal (drafts a `document_consents` row in `pending`, integrated as the pre-flight when a future ShareDocumentModal targets external/cross-school grantees). The current ShareDocumentModal short-circuits cleanly because trigger 5.G allows `consent_id = NULL` for same-school school_user grants.

### 2026-05-03 — Document Coordination System (Phases A → D7)

Sensitive child-document coordination feature — IEPs, therapy reports, evaluations, medical certificates, school accommodation plans, and parent-provided documents — with consent gates, full audit trail, signed-URL-only access, and strict no-default-access for super_admin.

**Migrations applied (in order):**
- `054_child_documents.sql` — Phase A schema (7 tables, 4 enums, integrity triggers, RLS default-deny)
- `055_child_documents_storage.sql` — Phase B storage bucket + storage RLS
- `056_child_documents_rls.sql` — Phase B helpers, RLS policies, `log_document_access` RPC
- `057_document_access_events_actor_fk.sql` — re-point `actor_user_id` FK to `auth.users`

See "Schema Additions" section above for migration-level details.

**API route:** `src/app/api/documents/[id]/access/route.ts` (Phase C). Single server-side choke point. Authenticates with cookie session, calls `log_document_access` under the user's session (so `auth.uid()` resolves correctly inside Postgres), then service-role mints a 60-second signed URL. v1 always logs `signed_url_issued` regardless of client action. Maps RPC denial reasons to sanitized HTTP codes (404 collapse for "don't reveal existence" cases; 403 for `download_not_permitted`; 401 unauthenticated).

**TypeScript types:** `src/lib/types/database.ts` extended with all 7 tables and `Functions.log_document_access`. `src/features/documents/types.ts` carries strict types for the JSONB columns (`ConsentScope`, `ConsentRecipient`, `GrantPermissions`) and the API contract.

**UI shipped (D1–D7):**
- Sidebar entry "Documents" in Core, between Students and Enrollment.
- Workspace page `/documents` with header (Upload Document button + disabled Request Document), filters (search, status, type), list, empty state, detail modal. Reads `?student=<id>` query param to scope per-student; linked from a `<FileText>` icon on each row of the existing `/students` page.
- Read-only `DocumentDetailModal` with Overview + Versions tabs. Hidden versions are visible to school staff only; parents/externals see only the head's `current_version_id` and only when not hidden.
- View/Download via Phase C access route. **Signed URLs are never assigned to React state, props, or query cache** — `openDocumentForAccess()` opens in a new tab with `noopener,noreferrer` and dereferences immediately.
- `UploadDocumentModal` (D7): two-step lifecycle (upload → draft only; Mark Active is D9). Client-side validation: PDF/JPEG/PNG/WebP, ≤25 MB. 5-step transactional upload with per-step rollback (head insert → blob upload → version insert → repoint head's `current_version_id` → best-effort `trackUpload`).

**RLS-on-RETURNING workaround in UploadDocumentModal:** `INSERT … RETURNING` (via `.select().single()`) triggers a SELECT-policy evaluation against the just-inserted row. In this codebase that combination rejected reliably even though the INSERT WITH CHECK passed every clause cleanly. The modal now generates `crypto.randomUUID()` for both `child_documents.id` and `child_document_versions.id` client-side, inserts without `.select().single()`, and continues with the pre-known IDs. The Phase A trigger 5.D still validates `current_version_id` on the UPDATE step.

**Test artifacts (kept, not migrations):**
- `supabase/tests/054_versioning_scenario.sql` — head/version repoint + hide-last-version rejection (Phase A)
- `supabase/tests/056_phase_b_scenarios.sql` — RLS decision tree across ~10 scenarios (Phase B)
- `supabase/tests/seed_one_document.sql` — full seed: doc + v1 + uploaded_files row (Phase D smoke)
- `supabase/tests/seed_phase_d_minimal.sql` — minimal active doc + v1 (no `uploaded_files` row)

**Constraints / decisions baked in (important for future work):**
- super_admin has **no RLS bypass** on any of the 7 document tables — strict posture confirmed in Phase 1. Super_admin → child_documents writes always fail with 42501 (RLS rejection). **Use a real `school_admin` account for testing.** Impersonation doesn't help because `auth.uid()` server-side still resolves to the super_admin's profile.
- Teachers cannot currently pass `teacher_visible_student_ids()` because of migration 058's accepted side effect (`class_teachers.teacher_id` references `teacher_profiles.id`, while `auth.uid()` resolves to `profiles.id` / `auth.users.id`). Net effect: all teacher-scoped child_documents access fails for teacher logins. School_admin paths unaffected. See "Document Coordination — Remaining" for the planned `auth_user_id` bridge fix.
- The `document_consents` parent transition guard early-returns on `current_user_role() <> 'parent'`. NULL role (service-role connections) is treated like a parent and rejects most updates. Future fix: change the guard to `IS DISTINCT FROM 'parent'::user_role`. Documented in the migration 056 inline comments and listed under "Remaining" above.
- Storage object existence is decoupled from DB metadata. A doc + version row with a valid `storage_path` but no actual blob will mint a signed URL that 404s when followed; the `document_access_events` audit row still lands. Useful for testing the metadata path without a real file.

**Where to resume:** "Document Coordination — Remaining" section above. Next logical step is **D8 — UploadVersionModal + HideVersionModal**.

---

### 2026-05-03 — Class teacher assignment persistence fix (migration 058)

**Symptom:** assigning a teacher in Classes → Edit and clicking Save Class appeared to succeed, but the teacher reverted to "None" on the next page load.

**Root cause:** schema/UI mismatch. The "Assigned Teacher" dropdown on the Classes page is sourced from `teacher_profiles` (the standalone staff roster created in migration 004 and managed in Settings → Teachers, with IDs from `gen_random_uuid()`). But `class_teachers.teacher_id` was still constrained to reference `profiles(id)`. Every UI-driven assignment generated an FK violation that was never inspected (the inserts had no error guard), so the modal closed cleanly while the row never persisted. On reload the join `teacher:profiles(full_name)` returned nothing → "None".

**Fix:**
- **Migration 058** (`058_class_teachers_fk_to_teacher_profiles.sql`) — drops `class_teachers_teacher_id_fkey`, deletes any existing rows whose `teacher_id` does not exist in `teacher_profiles`, then re-adds the FK pointing at `teacher_profiles(id) ON DELETE CASCADE`.
- `schema.sql`: `class_teachers.teacher_id` no longer declares a FK inline (defined post-hoc once `teacher_profiles` exists in migration 004); a comment points at migration 058.
- `src/lib/types/database.ts`: `class_teachers_teacher_id_fkey` now references `teacher_profiles`.
- `src/app/(dashboard)/classes/page.tsx`:
  - select join changed to `class_teachers(teacher_id, teacher:teacher_profiles(full_name))`
  - error guards added to both `class_teachers.delete()` and `class_teachers.insert()` paths so any future FK or RLS failure surfaces in the modal instead of disappearing.
- `src/app/(dashboard)/dashboard/page.tsx`: same join switch (`teacher:teacher_profiles(full_name)`).
- `src/lib/demo/index.ts`: section 8 now mirrors each demo auth-user teacher into a `teacher_profiles` row (collected into `teacherProfileIds`) and uses those IDs for `class_teachers`. Cleaner deletes `teacher_profiles` for the school during teardown.

**Follow-up — migration 059:** after 058 was applied, assigning a teacher in the UI surfaced `new row violates row-level security policy for table "class_teachers"`. The original schema only declared a SELECT policy on `class_teachers`; INSERT/UPDATE/DELETE policies were never added, so writes from the browser client were always blocked. The earlier FK violation was masking it. Migration 059 adds the three missing write policies, restricted to `current_user_role() = 'school_admin'` scoped to their own school (`class_id` resolves to a class with `school_id = current_user_school_id()`), plus `is_super_admin()` bypass — same pattern used in migration 031. Teachers and parents cannot edit `class_teachers` from the client. The migration uses `DROP POLICY IF EXISTS` first so it's safe to re-run.

**Accepted side effect:** three RLS helpers compare `class_teachers.teacher_id` against `auth.uid()` — see [031:218](supabase/migrations/031_rls_tenant_hardening.sql), [037:41](supabase/migrations/037_proud_moments_hardening.sql) (`teacher_student_ids()`), [056:93](supabase/migrations/056_child_documents_rls.sql) (`teacher_visible_student_ids()`). With the new FK these match zero rows for teacher logins. Net effect: any user signed in with `role='teacher'` loses access to `parent_updates` insert, `proud_moments` visibility, and `child_documents` reads through these specific RLS paths. School_admin / super_admin paths are unaffected. Acceptable for now because the active workflow is admin-only; revisit with an `auth_user_id` bridge column on `teacher_profiles` if/when staff logins are reintroduced.

### 2026-04-28 — Billing Refactor, UX Restructure, Generate Billing Fixes

**Billing feature module extracted (`src/features/billing/`):**
- `types.ts` — all billing TypeScript types (MainTab, BillingRecord, PaymentRecord, AllPayment, FeeType, Discount, StudentCredit, etc.)
- `constants.ts` — SCOPE_LABELS, TYPE_LABELS, STATUS_OPTS, EDITABLE_STATUSES, EMPTY_PAYMENT, EMPTY_ADD, currentYearMonth()
- `utils.ts` — formatMonth, computeStatus, getMonthRange, getAgingDays, agingLabel, agingClass, printContent, computeNthWeekday
- `StudentCombobox.tsx` — self-contained student search combobox with click-away
- `SetupFeeTypesTab.tsx` — fee types CRUD (name, description, active toggle)
- `SetupTuitionTab.tsx` — tuition configs CRUD per academic period; periods now sorted by school year name descending then start_date ascending (client-side sort after fetch)
- `SetupAdjustmentsTab.tsx` — discounts CRUD + student credits CRUD

**Generate Billing modal:**
- Merged Auto-Generate + Bulk Generate into single "Generate Billing" modal with:
  - "Use tuition rates" vs "Flat amount" toggle
  - Month range (From → To); single month when both are equal
  - Academic Period dropdown defaulting to: Regular Term → first non-summer/non-short term → first available
  - Fee type dropdown (defaults to fee type whose name includes "Tuition")
  - Due date modes: No due date / Fixed date / Nth weekday (with live preview)
  - Skip existing checkbox (default on); Mark as paid shortcut with method + date
  - Summary panel showing estimated bills count and total
- `loadGenConfigs(periodId)` extracted so period dropdown onChange reloads class rates correctly
- Class list scrollbar: thin styled scrollbar (`[&::-webkit-scrollbar]:w-1.5` etc.)

**Billing date format fix:**
- `billing_month` is stored as PostgreSQL `DATE` (`YYYY-MM-DD`); normalized to `YYYY-MM` on read via `.substring(0, 7)`; `-01` appended on all DB writes and filter queries
- Fixes "Invalid Date" in Month column throughout Bills and Payments tabs

**Migration 033 — `fee_type_id` on `billing_records`:**
- Added `fee_type_id UUID REFERENCES fee_types(id) ON DELETE SET NULL`
- Required for Add Record and Generate Billing to work; must be run in Supabase SQL Editor
- Existing records get `NULL`; all code paths are null-safe

**Bills tab UX:**
- Subtitle added: "What students owe"
- Tab icon changed from `Receipt` to `FileText` (generic document, no currency symbol)
- "Paid" column removed — Balance + Status badge already convey the same information
- Bills sorted ascending by `billing_month` (oldest first)
- Paid/settled bills hidden by default; "Show paid/settled" checkbox toggle added to filter row
- When a full payment is recorded, bill disappears from Bills tab and a toast notification appears: "Payment of ₱X recorded successfully. To view payment details, go to the Payments tab." (auto-dismisses after 4 s)

**Payments tab UX:**
- Subtitle added: "What's been collected"
- "Record Payment" header button removed — payment entry is exclusively via Pay button on each bill row
- "Class" column removed — Student + Description + Month give sufficient bill context
- From/To date range `DatePicker` filters added (client-side on `p.date` YYYY-MM-DD string; lexicographic comparison is timezone-safe)
- Printer icon per row: opens Payment Receipt modal for that payment
- Pencil icon per row: opens Edit OR#/receipt photo modal

**Payment Receipt modal:**
- Renamed from "Official Receipt" to "Payment Receipt" (modal title + print `<h2>`)
- Edit payment modal: updates `or_number` and optionally re-uploads receipt photo with upsert; reopens Payment History modal after save

**Modal component (`src/components/ui/modal.tsx`):**
- Thin styled scrollbar applied to the shared modal scroll container — affects all modals in the app

**Header school year pill:**
- Currently decorative (shows active year name + ChevronDown, no onClick handler)
- Planned: wire to year-switcher dropdown for "Viewing School Year" feature (see below)

**Viewing School Year — planned, not implemented:**
- Goal: browse prior school year data without changing `school_years.status = 'active'` in DB
- Requires: `viewingYear` + `setViewingYear` + `isHistoricalView` + `allSchoolYears` added to SchoolContext
- Header pill becomes dropdown listing all years; selecting one calls `setViewingYear` (no DB write)
- Amber banner shown in layout when `isHistoricalView` is true
- All 10 dashboard pages switch read queries from `activeYear.id` → `viewingYear.id`
- Write actions disabled in historical view via shared `useIsReadOnly()` hook (composes with existing trial-expired read-only)
- Implementation sequence: Context + Header first (zero page impact) → read queries page by page → write guards last
- Full per-page breakdown in session planning notes

### 2026-04-27 — Settings Refinements + Parent Portal RLS + Promote Students UX

**Settings — School Information:**
- Added `phone TEXT` column to `branches` (migration 023)
- Added `phone` field UI in Settings → School Information card (after Address, before Save)
- TypeScript types updated for `branches` Row/Insert/Update

**Settings — School Year & Terms:**
- School years now sorted: active first, then descending by `start_date`
- Delete button (Trash2) added to non-active school year rows; blocks deletion of active SY; handles FK constraint errors
- `savePeriod` no longer sets `is_active` on terms (removed per-term active toggle)
- Active badge removed from term rows in the list
- "Mark as active term" checkbox removed from the term modal

**Branding & Accessibility (completed in prior session):**
- `patchBranding()` added to SchoolContext — patches branding slice in-place without `loading: true`, preventing page unmount/logo revert
- `BrandingApplier` component applies CSS variables + html classes; no cleanup to prevent flash
- Settings → Branding section: logo upload, color pickers, text size scale, spacing scale, live preview

**Parent Portal — RLS (migrations 024–026):**
- Root cause: all tables gated by school-member (requires `school_id` in profile); parents have no `school_id`
- Migration 024: added `parents_select_own_guardian_record` on `guardians` (email match)
- Migration 025: attempted `SETOF UUID` SECURITY DEFINER function — blocked by Postgres ("set-returning functions not allowed in policy expressions")
- Migration 026 (current, correct): `parent_student_ids()` returns `UUID[]` (array), uses `= ANY(parent_student_ids())` in all policies. Covers: guardians, students, enrollments, classes, schools, school_years, attendance_records, parent_updates, events, billing_records, payments, progress_categories
- Invite accept (`/invite/page.tsx`): now also sets `role = 'parent'` on profile after marking invite used
- **To debug parent login**: run `SELECT * FROM guardians WHERE email = 'parent@bk.test'` — if 0 rows, admin must add the guardian email in Students section first

**Promote Students UX (students/page.tsx) — COMPLETED 2026-04-27:**
1. Period dropdowns now show `"SY 2026-2027 · Regular Term"` format (year name in option text, not just optgroup label)
2. Default action changed from `"skip"` (when no next_class_id) to always `"promote"` — rows no longer start grayed out; skip rows use `bg-muted/20` instead of `opacity-50`
3. Step 2 card: bulk next-class assignment per current class — shows each class group with a "→ next class" dropdown; changing it updates all students in that class at once; sourced from `classes.next_class_id` (configurable in Classes → Promotion Path)
4. Level filter chips (All / Toddler / Pre-Kinder / Kinder / etc.) derived from loaded students' class levels; "Set all" bulk actions and Confirm only affect the selected level
- New state: `promoteLevel: string`
- New function: `applyBulkNextClass(currentClassId, nextClassId)`
- New derived: `filteredPromoteRows`, `promoteLevels`, `classBulkGroups`
- `PromoteRow` interface: added `currentClassLevel: string`
- Classes query: added `level` field

### 2026-04-26 — UI Polish + Parent Features + Billing Generate Merge Plan

**Custom date/month pickers:**
- Created `DatePicker` (`src/components/ui/datepicker.tsx`) — portal-based, replaces all `<Input type="date">` across attendance and billing modals; positions above/below trigger based on viewport space
- Created `MonthPicker` (`src/components/ui/monthpicker.tsx`) — same pattern, 3×4 month grid, replaces all `<Input type="month">`; supports `min` prop for range pickers; "This month" shortcut built in
- Both match the app's design tokens (border-border, bg-card, primary for selected, muted for hover)

**Parent dashboard — broadcast announcements:**
- `loadAnnouncements()` queries `parent_updates` where `class_id IS NULL` (school-wide posts)
- Shown in a separate "Announcements" section above class updates, styled with primary tint + Megaphone icon
- Class-specific updates remain in "Recent Updates" section below

**Billing — auto-generate fix:**
- Auto-Generate modal: all classes now default to `include: true` regardless of whether tuition configs exist; classes without configs show amber "No config — enter manually" hint and empty editable amount field
- Fee type now defaults to the first fee type whose name includes "Tuition" (falls back to first fee type)

**Billing — receipt photo upload:**
- `PaymentForm` gained `receiptFile: File | null`; `PaymentRecord` gained `receiptPhotoPath: string | null`
- Record Payment modal: optional file input (image/*) uploads to `updates-media/payment-receipts/{payment_id}.{ext}` on save
- Payment history modal: shows "Photo" link (generates signed URL via `createSignedUrl`) when a receipt photo exists
- Migration 017 adds `receipt_photo_path TEXT` to payments

**Billing cleanup SQL** (run in Supabase SQL Editor to wipe billing data):
```sql
DELETE FROM payments WHERE billing_record_id IN (SELECT id FROM billing_records WHERE school_id = '00000000-0000-0000-0000-000000000001');
DELETE FROM billing_discounts WHERE billing_record_id IN (SELECT id FROM billing_records WHERE school_id = '00000000-0000-0000-0000-000000000001');
DELETE FROM billing_records WHERE school_id = '00000000-0000-0000-0000-000000000001';
```

**Billing — generate modal merge (COMPLETED 2026-04-28):**
- Auto-Generate + Bulk Generate merged into single "Generate Billing" modal — see Session Log 2026-04-28

**Parent portal — new pages:**
- `/parent/progress` — fetches `progress_observations` where `visibility = 'parent_visible'`, deduplicates by category (latest per category), renders rating pills + CSS progress bars; ratings: emerging/developing/consistent/advanced
- `/parent/events` — fetches upcoming events for school, filters to `applies_to = 'all'` or class match, fetches existing RSVPs in one batch, upserts on `(event_id, student_id)` conflict
- Both linked in parent nav (6-item bottom nav: Home, Child, Updates, Events, Progress, Billing)

**Parent portal — absence reporting:**
- `absence_notifications` table (migration 016): UNIQUE(student_id, date) — idempotent; duplicate insert (code 23505) handled gracefully
- Parent dashboard: attendance card expands when status is null → "Report absent today" link → inline form with optional reason → "Notify School" → confirmation state
- Attendance page: loads `absence_notifications` for the selected date, shows amber callout + per-student "parent notified" badge

**Enrollment funnel analytics:**
- New "Analytics" view toggle on enrollment page (alongside Pipeline and Table views)
- Client-side: computes stage counts, conversion rates, source breakdown, class demand vs capacity from already-loaded `inquiries` array — no extra API calls

**Broadcast announcements (admin):**
- Updates page: "Broadcast" button opens modal with target (All Classes or specific class), textarea with 280-char counter, 3 quick-template buttons
- Inserts to `parent_updates` with `class_id = null` for school-wide; auto-closes after 1500ms on success

### 2026-04-25 — Billing Phase 4 (Validation Guardrails)
- Migration 009: added `waived` to billing_status enum; `change_reason`, `changed_by`, `changed_at` on billing_records; `recorded_by` on payments
- Badge component: added `waived` variant (sky-blue)
- Billing page full guardrail implementation:
  - **Duplicate check**: `checkAddDuplicate()` queries for existing non-cancelled records on same student+month; shows orange warning banner with required override reason field in add modal
  - **Payment sequence warning**: `openPaymentModal()` (new async function) checks for earlier unpaid months for same student; shows orange warning with required override reason
  - **Overpayment hard block**: payment > remaining balance returns friendly error before saving
  - **Partial payment hint**: inline text below amount field shows remaining balance after partial entry
  - **Paid status guard**: editing status to "paid" when balance > 0 returns error "record a payment first"
  - **Amount change safety**: editing amount when payments already exist requires `changeReason` (saved to `change_reason` column)
  - **Destructive status reason**: setting cancelled/waived/refunded requires `changeReason`
  - **Waived status**: excluded from outstanding balance and revenue totals; descriptive hint in edit modal
  - **Bulk mark-paid confirmation**: `initiateBulkMarkPaid()` → `bulkConfirmModal` → shows student list + total + irreversibility warning → `handleBulkMarkPaid()` executes
  - **Fee type required**: hard block in add modal and bulk generate when fee types exist
  - **Audit tracking**: `changed_by`/`changed_at`/`change_reason` saved on every edit with reason; `recorded_by` saved on every payment insert
  - **Human-friendly errors**: all error messages written in plain English for admins

### 2026-04-25 — Billing Phase 3 (Parent Portal)
- Parent billing page (`/parent/billing`) fully upgraded:
  - All billing records + payments fetched in one load (no lazy fetch)
  - Each billing card is tappable to expand/collapse individual payment history
  - Each payment row shows amount, method, date, OR#, reference — plus a "Receipt" button
  - Receipt modal: screen-readable summary + hidden print-ready HTML, opens clean print window
  - Statement button (top right): shows full ledger as a screen-visible table + hidden print content
  - Print works via `printContent()` — same pattern as admin billing page
- `ParentContext` updated: added `schoolName: string` field; passed from layout to all child pages

### 2026-04-25 — Billing Phase 1 + 2 (Enhancements & Receipts)
- Migration 008: added `or_number VARCHAR(50)` to `payments` table
- Billing page — Phase 1 quick wins:
  - Month filter (inline clear button) added to filter row
  - 4th summary card: Collection Rate % (green ≥80%, orange ≥50%, red otherwise)
  - Aging badges on overdue records: `${days}d` / `30d+` / `60d+` / `90d+` with escalating color
  - Payment history drawer (clock icon per row): shows all payments for a billing record, each with Print Receipt button
  - Student name in table is now a link that opens the billing statement modal
- Billing page — Phase 2 receipts & statements:
  - OR Number field added to Record Payment modal (stored as `or_number` in payments)
  - Receipt modal: printable official receipt with school name, OR#, student, class, description, amount, method
  - Billing Statement modal: full ledger for a student (all records for current year), running totals, printable
  - Both print via `printContent()` — opens clean new browser window with embedded CSS, then calls `window.print()`
- Bulk generate modal: fixed broken `bulkForm.billingMonth` field → now uses `monthFrom`/`monthTo` range inputs
- `bulkPreview` state type fixed: was `null | array`, now consistently `BulkPreviewSummary | null`

### 2026-04-25 — Super Admin, Trial, Academic Periods, Finance Setup
- Added migration 002: trial columns on schools, academic_periods table, fee_types, tuition_configs, discounts, student_credits, billing_discounts
- Added super admin bypass RLS policies via `is_super_admin()` function (all 21 existing tables)
- Built Super Admin panel at `/super-admin/schools`: schools list, trial status badges, create school, edit trial, impersonate
- Impersonation flow: sessionStorage `__ll_impersonating` → SchoolContext uses it → blue banner with Exit button
- Trial banner in dashboard layout: amber (≤7 days), red (expired), read-only overlay on expired
- SchoolContext extended: trialStatus, trialDaysLeft, isTrialExpired, isReadOnly, isImpersonating, startImpersonation, stopImpersonation
- Finance Setup page `/finance`: 4 tabs — Fee Types, Tuition Setup (per period/level), Discounts, Student Credits
- Settings page: added Academic Periods section (CRUD, grouped by school year)
- Sidebar: added Finance Setup nav item, Super Admin Platform section (super_admin role only)
- Seed data in 002: 2 academic periods for BK (Regular Term + Summer), 5 fee types, 3 tuition configs, 4 discounts
- TypeScript: 0 errors confirmed

### 2026-04-26 — Parent Updates Fixes + Storage + UX
- **Parent updates visibility fix**: query was filtering strictly by `class_id`; changed to `.or("class_id.eq.{id},class_id.is.null")` so school-wide posts (All Classes) also appear in the parent feed
- **`schoolId` added to ParentContext**: parent pages now scope queries by `schoolId`; parent updates page no longer bails when `classId` is null
- **Private storage bucket for photos**: migration 014 creates `updates-media` bucket as private with authenticated-only policies; bucket must be manually created in Supabase Dashboard → Storage as private
- **Signed URLs for photos**: `uploadPhotos` now stores storage paths (not public URLs); both admin feed and parent feed call `createSignedUrls` in one batch on load, using index-based mapping (not `s.path` key) to build the signed URL map; signed URLs expire after 1 hour
- **RLS UPDATE policy fix**: migration 015 adds missing `UPDATE` policy on `parent_updates`; without it all UPDATEs (image path saves, hide/restore/delete) silently returned 204 with no rows modified
- **Scroll-to-top on navigation**: dashboard layout (`<main overflow-y-auto>`) and parent layout both now reset scroll via `usePathname` + `mainRef.current.scrollTo(0,0)` on route change
- **Parent updates refresh button**: subtle `RotateCw` icon next to the heading; spins while reloading; does not trigger full-page spinner

### 2026-04-25 — Project Kickoff
- Defined full product spec (multi-school SaaS, preschool focus)
- Designed and implemented complete Supabase schema (21 tables, 13 enums)
- Built Next.js app with all 12 dashboard pages functional
- Implemented: Dashboard, Students, Classes, Attendance, Enrollment, Events, Billing, Parent Updates, Progress, Settings
- Created SchoolContext for global school/user/year state
- Added CLAUDE.md project reference file
