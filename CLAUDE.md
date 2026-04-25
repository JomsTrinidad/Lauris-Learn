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
      enrollment/page.tsx       — Inquiry pipeline
      events/page.tsx           — School events
      billing/page.tsx          — Billing records + payments
      progress/page.tsx         — Student progress observations
      online-classes/page.tsx   — Online session scheduling
      updates/page.tsx          — Parent updates / class feed
      settings/page.tsx         — School years + holidays
  components/
    layout/
      Header.tsx
      Sidebar.tsx
    ui/
      badge.tsx | button.tsx | card.tsx | input.tsx
      modal.tsx | select.tsx | spinner.tsx | textarea.tsx
  contexts/
    SchoolContext.tsx            — schoolId, activeYear, userId, userRole, userName
  lib/
    supabase/client.ts          — Browser client
    supabase/server.ts          — Server client
    supabase/middleware.ts      — Session refresh
    types/database.ts           — Full TypeScript types for all tables
    utils.ts                    — formatCurrency, formatTime, getInitials, cn
  middleware.ts                 — Route protection
supabase/
  schema.sql                    — Full DB schema (run first on fresh project)
  migrations/001_additions.sql  — Indexes + visibility column + seed data
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

---

## Supabase Setup (New Project)

1. Run `supabase/schema.sql` in SQL Editor
2. Run `supabase/migrations/001_additions.sql` in SQL Editor
3. Sign up as admin user via `/login`
4. In SQL Editor, assign the admin to BK school:
   ```sql
   UPDATE profiles
     SET school_id = '00000000-0000-0000-0000-000000000001',
         role      = 'school_admin',
         full_name = 'Your Name'
   WHERE email = 'your@email.com';
   ```
5. Add sample classes if needed (see commented SQL in 001_additions.sql)

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
| Parent updates | ✅ Complete | Post update (text), filter by class, feed display |
| Progress tracking | ✅ Complete | Observations per student, rating + visibility, category-based |
| Online classes | ⚠️ Partial | UI scaffolded, not wired to Supabase (static state only) |
| Settings | ✅ Complete | School years (CRUD, set active), academic periods (CRUD), holidays management |
| Finance Setup | ✅ Complete | Fee types, tuition configs per period/level, discounts, student credits |
| Super Admin Panel | ✅ Complete | Schools list, trial management, create school, impersonation |
| Trial System | ✅ Complete | Trial banner in dashboard, read-only on expiry, days countdown |
| UI component library | ✅ Complete | Button, Card, Input, Modal, Select, Textarea, Badge, Spinner |

---

## What Is NOT Yet Built

### High Priority (Core Features)
- [x] **Multi-school / Super Admin panel** — done: schools list, trial management, create school, impersonation
- [x] **Trial system** — done: 14-day trial, banner, read-only on expiry
- [x] **Academic Period** — done: CRUD in Settings, linked to school year
- [x] **Tuition configuration** — done: per-level, per-period pricing with monthly breakdown
- [x] **Fee types** — done: CRUD in Finance Setup
- [x] **Discounts & promos** — done: fixed, percentage, credit types; scoped presets
- [x] **Credits system** — done: issue credits, track applied vs outstanding
- [x] **Billing enhancements (Phase 1)** — done: month filter, collection rate % card, aging badges (30d/60d/90d+), payment history drawer per record
- [x] **Receipts & statements (Phase 2)** — done: OR number on payments (migration 008), printable official receipt, printable billing statement per student; print opens clean new window
- [x] **Parent billing portal (Phase 3)** — done: `/parent/billing` upgraded with expandable payment history per record, receipt modal per payment (with print), printable billing statement; `schoolName` added to ParentContext
- [x] **Billing validation guardrails (Phase 4)** — done: duplicate billing check with override reason, payment sequence warning (earlier unpaid months), overpayment hard block, paid status consistency guard, amount-change safety with change reason, cancel/waive/refund requires reason, `waived` status added, bulk mark-paid confirmation modal, fee type required, human-friendly error messages; migration 009 adds `change_reason`/`changed_by`/`changed_at` on billing_records and `recorded_by` on payments
- [ ] **Resource / Document Hub** — file uploads, categorized downloads for parents
- [ ] **Online classes** — wire `online-classes` page to Supabase (currently static)

### Billing — Remaining Gaps
- [ ] **Scheduled recurring billing** — set monthly fee per class/level, auto-generate on chosen day each month
- [ ] **Overdue reminders** — bulk email/in-app notification to parents with outstanding balances
- [ ] **Fee schedule at enrollment** — auto-attach tuition config when student is enrolled
- [ ] **Sibling / family grouping** — combined family balance view, sibling discount auto-apply

### Medium Priority
- [ ] **RSVP for events** — per-student RSVP UI
- [ ] **Field trip / event fees** — link fees to events, per-student opt-in
- [ ] **Parent portal / view** — parent-specific read-only dashboard (billing is one piece; also updates feed, progress, events)
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

### 2026-04-25 — Project Kickoff
- Defined full product spec (multi-school SaaS, preschool focus)
- Designed and implemented complete Supabase schema (21 tables, 13 enums)
- Built Next.js app with all 12 dashboard pages functional
- Implemented: Dashboard, Students, Classes, Attendance, Enrollment, Events, Billing, Parent Updates, Progress, Settings
- Created SchoolContext for global school/user/year state
- Added CLAUDE.md project reference file
