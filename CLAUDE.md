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
```

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
