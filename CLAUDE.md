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
      settings/page.tsx         — School years + holidays
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
2. Run all migrations in order (`001` → `017`) in SQL Editor
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
- `payment-receipts/{payment_id}.{ext}` — payment receipt photos

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
| Billing — receipt photo upload | ✅ Complete | Record Payment modal has optional photo upload; stored in updates-media/payment-receipts/; viewable via signed URL in payment history |
| Billing — auto-generate | ✅ Complete | Reads tuition configs per level, pre-fills per-class amounts, skips existing records; defaults fee type to "Tuition" |

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
- [x] **Billing — generate modal** ⚠️ Pending merge: Auto-Generate + Bulk Generate are two separate modals with overlapping functionality. Plan is to merge into one "Generate Billing" modal with a "Use tuition configs / Flat amount" toggle and month range support. See Session Log 2026-04-26.
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

---

## Schema Additions (Migrations 016–017)

### Migration 016 — Parent Features
- `absence_notifications` table: `school_id`, `student_id`, `class_id`, `date`, `reason`; UNIQUE(student_id, date); RLS: parents insert/select via guardian email, staff select via school_id
- `event_rsvps`: added UNIQUE INDEX on (event_id, student_id) — required for upsert with onConflict
- `progress_observations`: added parent SELECT policy where `visibility = 'parent_visible'`

### Migration 017 — Payment Receipt Photo
- `payments`: added `receipt_photo_path TEXT` — stores storage path in `updates-media/payment-receipts/{payment_id}.{ext}`

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

## Session Log

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

**Billing — generate modal merge (PLANNED, not yet implemented):**
- Auto-Generate + Bulk Generate are two separate modals with overlapping logic; plan is to merge into one "Generate Billing" modal
- Toggle: "Use tuition configs" (per-class pre-filled amounts) vs "Flat amount" (single amount, all classes)
- Month range (From/To, same month = single month); fee type defaults to Tuition; due date optional
- "Skip existing" checkbox (default on); "Mark as paid" checkbox (edge case, always available in both modes)
- Single `executeGen()` function replaces `executeAutoGen()` and `handleBulkGenerate()`
- Header: one "Generate Billing" button replaces both "Auto-Generate" and "Bulk Generate"

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
