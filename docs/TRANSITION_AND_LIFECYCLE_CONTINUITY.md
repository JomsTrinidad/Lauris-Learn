# Transition & Lifecycle Continuity — Phase 5E

**Status.** Architectural normalization + one surgical continuity-coherence
fix. The system's lifecycle handling is mostly implicit but mostly correct;
this phase names the lifecycle classes, confirms there is no cold lifecycle
wording, and fixes the one place where a transitioned child can be re-framed
by their *oldest* placement instead of their most recent one.

**Scope.** Defines how continuity survives lifecycle change — school-year
rollover, classroom changes, therapist changes, support gaps, graduation,
organization changes, re-entry after inactivity — without rupture, emotional
reset, or re-framing the child from zero.

**Out of scope.** No CRM. No case-management. No workflow engines. No
discharge / graduation ceremonies. No predictive dropout / attendance-risk
systems. No "case closed" mechanics. No lifecycle dashboards. No inactivity
scoring. No support-status automation. No new tables. No new RPCs. No
background jobs. No notification infrastructure.

---

## 1. The lifecycle question

Continuity matters MOST at the moments of change — a child moving up a
class, a therapist leaving, a family returning after months away, a child
graduating. A continuity system that resets at these moments fails exactly
when it's needed.

**The Lauris answer:** continuity is anchored to the *child*, not to the
*operational state*. Memory (proud moments, milestones, progress history,
reflections) is keyed on the child and persists across every lifecycle
transition. Operational surfaces (today's attendance, upcoming events) go
quiet when there's nothing operationally active — they don't display
errors, "inactive" banners, or "case closed" notices. The child's identity
anchor (their displayed class) reflects where they most recently were, not
where they started.

There is no lifecycle WORKFLOW. There are only lifecycle SEMANTICS: what
stays visible, what goes quiet, what persists as memory.

---

## 2. Current lifecycle handling (observed)

### 2.1 Learn-side lifecycle state

| State | Source | How it surfaces today |
|---|---|---|
| `enrollment.status` | `inquiry / waitlisted / enrolled / withdrawn / completed` | Drives the parent layout's `activeEnrollment` resolution |
| Active year | `school_years.status = 'active'` | Preferred in `activeEnrollment` resolution |
| Year-end snapshot | `school_year_completions` (write-once) | Staff-side; not parent-facing |
| Class placement over time | `student_class_assignments` (effective-dated) | Staff-side historical; not parent-facing |
| Enrollment lifecycle log | `enrollment_transitions` (supplementary) | Staff-side; not parent-facing |
| Viewing year (admin) | `SchoolContext.viewingYear` | Staff-side presentation hint |

### 2.2 How the parent layout resolves a child's "current" class

```ts
const activeEnrollment =
  enrollments.find(e => e.status === "enrolled" && e.classes?.school_years?.status === "active") ??
  enrollments.find(e => e.status === "enrolled") ??
  enrollments[0];   // ← unordered fallback
```

- **Currently-enrolled, active year** → correct class. ✅
- **Enrolled, non-active year** (e.g., a year that hasn't been activated yet) → that enrollment's class. ✅
- **Graduated / withdrawn / completed** (no `enrolled` row) → `enrollments[0]`, which is **unordered** — PostgREST returns enrollments in unspecified (typically insertion / oldest-first) order.

**The gap.** A child who progressed Toddler → Pre-Kinder → Kinder and then
graduated has three historical enrollments, none `enrolled`. `enrollments[0]`
likely returns the OLDEST ("Toddler"). The parent of a graduated child opens
the app and sees their child framed by the class they were in *years ago*,
not where they finished. This is precisely the directive's "re-framing the
child from zero" rupture — the child's identity anchor regresses to their
starting point at the moment of transition.

### 2.3 What persists correctly across lifecycle transitions (verified)

| Surface | Keyed on | Survives graduation / withdrawal? |
|---|---|---|
| Proud moments (`/parent/proud-moments`) | `student_id` | ✅ persists — Memory class |
| Progress observations (`/parent/progress`) | `student_id` | ✅ persists |
| Class updates (`/parent/updates`) | `class_id` / `school_id` | ✅ historical posts remain queryable |
| Therapy summaries / voice notes | `child_profile_id` | ✅ persists (Care RLS, not enrollment-gated) |
| Care milestones | `child_profile_id` | ✅ persists |
| Continuity-echo / resonance reflections | localStorage by `childId` | ✅ persists locally |
| Guardian → student link | `guardians.email` | ✅ persists — parent keeps access after graduation |
| Care family link | `care_family_members` (no status column) | ✅ persists indefinitely |

**This is the system's lifecycle strength.** None of the memory surfaces are
gated on enrollment status. A parent whose child graduated last spring can
still open the app and scroll their child's proud moments, progress history,
and therapy journey. Memory is child-bound, not enrollment-bound.

### 2.4 Cold lifecycle wording — none found

A grep across all parent surfaces for `withdrawn / graduated / inactive /
completed / no longer / case closed / discharged / not enrolled / former`
found **zero** cold lifecycle wording. (The "inactive" matches are RSVP
button styling; the "no longer" matches are code comments.) The system has
never adopted "case closed," "discharged," "inactive child," or
"support failure" framing. This is a clean baseline that must be preserved.

### 2.5 Care-side lifecycle structure

- `care_family_members` (migration 089) is a pure persistent link:
  `(id, profile_id, child_profile_id, clinic_organization_id, relationship)`.
  **No status / ended_at column.** A parent's link to a child's clinic
  persists until the row is deleted. There is no "ended therapy" state on
  the link itself.
- Clinic membership lifecycle lives on `organization_memberships.status`
  (`active / suspended / ended`), not on the family link. A therapist who
  leaves a clinic flips their membership to `ended`; the child's family
  link is untouched.
- Session gaps (`>21d`) are computed in `assembleContinuityData` and
  surfaced ONLY on therapist-side continuity timelines. Not parent-facing.
- Therapist changes: `therapy_sessions.therapist_profile_id` is per-session.
  A new therapist simply authors new sessions; the child's session history
  (and parent-visible summaries) persists across the change. No re-framing.

**Care lifecycle strength:** because the family link has no lifecycle state
and memory is keyed on `child_profile_id`, a child who pauses therapy and
returns 3 months later — even with a new therapist — keeps their entire
continuity. The new therapist's first session appends to the existing
journey rather than starting a fresh one.

---

## 3. Lifecycle taxonomy

The directive proposed seven classes. After mapping onto the codebase,
**six** are load-bearing; *Archived Operational State* folds into Historical
because the operational tables (enrollments, attendance) already retain
their rows — "archived" is just "historical and not foregrounded."

| Class | Visibility | Hero | Signal | Reflection | Parent visibility | Resurfacing | Emotional framing |
|---|---|---|---|---|---|---|---|
| **Active Continuity** | front-stage | yes | yes | yes | yes | within windows | present voice |
| **Transitioning Continuity** | front-stage, anchored to most-recent placement | calm default | low | yes | yes | per cadence | "where they are now / most recently were" |
| **Paused Continuity** | quiet; memory accessible | calm default | no | yes | yes | none proactive | "resting, not ended" |
| **Dormant Continuity** | quiet; memory accessible on visit | calm default | no | yes (visit-driven) | yes | none proactive | neutral, no "inactive" label |
| **Historical Continuity** | per-domain pages | no | no | yes (visit-driven) | yes | scroll-driven | past-with-warmth |
| **Memory Continuity** | per-domain pages; permanent | no | no | yes | yes | none proactive | identity / memory |

### 3.1 Class assignment for current entities

| Entity / state | Lifecycle class |
|---|---|
| Currently-enrolled child, active year | Active Continuity |
| Enrolled child, pre-activation year | Transitioning Continuity |
| Graduated / completed child | Transitioning → Historical (memory persists) |
| Withdrawn child | Transitioning → Historical |
| Child returning after a gap | Dormant → Active (re-entry) |
| Therapy paused (no recent sessions) | Paused Continuity (Care) |
| Therapist changed | Active Continuity (session history persists) |
| Proud moments / milestones | Memory Continuity |
| Progress history / updates / Care journey | Historical Continuity |
| Old support context (≥45d) | Historical (Phase 5B quiet fade) |
| Operational records (attendance, billing) | Historical (retained, not foregrounded) |

---

## 4. Transition principles

### 4.1 How continuity survives transitions

1. **Memory is child-bound.** Proud moments, milestones, progress history,
   Care journey — all keyed on the child (`student_id` / `child_profile_id`),
   never gated on enrollment or membership status. They survive every
   transition automatically.
2. **The identity anchor follows the most recent placement.** A child's
   displayed class reflects where they most recently were, not where they
   started (Phase 5E §7 fix).
3. **Operational surfaces go quiet, not broken.** A graduated child's
   dashboard shows the calm Tier-F default ("All quiet for {N} today"),
   not an error, not an "inactive" banner.
4. **Re-entry appends, never resets.** A returning child's new activity
   appends to their existing journey. The old continuity is still there;
   the new activity joins it.
5. **Therapist / org changes preserve the journey.** Per-session therapist
   attribution + child-bound memory means a new provider continues the
   story rather than starting one.

### 4.2 How gaps should behave

- **Quiet, not alarmed.** A child with no recent activity shows the calm
  default. No "we haven't heard from you" prompt. No "it's been N days"
  counter. No re-engagement nudge.
- **Memory remains one tap away.** The proud-moments / progress / journey
  pages are unchanged during a gap; the parent can always look back.
- **Stale operational context fades** (Phase 5B 45d gate) but **memory
  never fades.** A 6-month gap means the support-context line is gone, but
  every proud moment is still there.

### 4.3 How re-entry should feel

- **Continuous, not re-onboarded.** The child is the same child; their
  history is intact; new activity simply resumes the feed.
- **No "welcome back!" interstitial.** No celebration of return. No "you've
  been away" framing. The app behaves as though the parent never left —
  because the child's continuity never left.

### 4.4 Anti-patterns (permanent rules)

- **No "case closed."** No terminal state surfaced to the parent.
- **No "restart from zero."** Re-entry never resets the child's framing.
- **No punitive inactivity framing.** No "you haven't visited in N days,"
  no "your child has been inactive," no re-engagement guilt.
- **No support-failure framing.** A withdrawal or paused therapy is never
  framed as a failure — not "support ended," not "discharged," not
  "dropped out."
- **No abrupt continuity loss.** Memory never disappears at a transition;
  it persists by being child-bound.
- **No cold archival semantics.** No "this child is archived," no greyed-out
  "former student" treatment, no "inactive" badge.
- **No graduation ceremony / milestone-completion fanfare.** Graduation is
  a quiet transition, not an achievement event.
- **No "former / ex-student" labeling.** The child is the child.
- **No re-framing the child by their starting point.** The identity anchor
  follows the most recent placement (Phase 5E §7).

### 4.5 Voice patterns to keep

- **"the child is the child."** Identity is child-bound, persistent, not
  reset by operational state.
- **"quiet, not broken."** Inactive surfaces go calm, never error.
- **"memory is always one tap away."** The pages persist through every
  transition.
- **"resumes, never restarts."** Re-entry continues the existing story.

---

## 5. Cross-organization continuity rules

What belongs to the child, the organization, and the parent — and what
persists or stays bounded across organization changes.

| Continuity item | Belongs to | Persists across org change? | Notes |
|---|---|---|---|
| Proud moments | child (within school) | Bounded to the school that authored them | A child moving schools doesn't carry proud moments to the new school; the old school's moments remain visible to the parent as long as the guardian link persists. |
| Milestones (Care) | child (within clinic) | Bounded to the clinic that authored them | Same shape; clinic-authored. |
| Progress observations | child (within school) | Bounded to authoring school | School-scoped. |
| Reinforcement / support context | organization (school or clinic) | Org-bound; not transferred | A new school's support context is its own; the old one stays with the old school. |
| Operational records (attendance, billing) | organization | Org-bound; never transferred | Stay with the authoring org. |
| Parent reflections (continuity-echo) | parent (private, localStorage) | Parent-bound; device-local | Never transfers anywhere; not even to staff. |
| Care parent observations | parent → clinic | Parent-bound for read; clinic-bound for context | Parent reads own; clinic reads all for their org. Not transferred to a new clinic. |
| Therapist notes (clinical) | organization (clinic) | Org-bound; NEVER parent-visible, NEVER cross-org | Stay clinical, stay in Care. |
| Child identity (`child_profiles`) | child (cross-org shared layer) | Persists — it's the shared identity spine | The one thing that DOES span orgs, by design (Phases 1–6). Gated by explicit consent grants for cross-org reads. |
| Cross-org access grants | explicit consent record | Per-grant; revocable | Clinic-to-clinic identity sharing requires `child_profile_access_grants`; never automatic. |

### 5.1 What should NEVER transfer

- Raw clinical notes across clinics (only via explicit document grants — Phase 5B 076).
- School discipline / operational detail to any other org.
- Parent reflections (localStorage; never leaves the device).
- One org's support context becoming another org's context (each authors its own).
- Operational records (attendance, billing) across orgs.

### 5.2 What's safe to persist

- The shared `child_profiles` identity spine (the cross-app continuity
  foundation; consent-gated for cross-org reads).
- Each org's own authored memory, visible to the parent for as long as the
  parent-org link persists.
- The parent's own private reflections (parent-bound, device-local).

### 5.3 No cross-org surveillance

- No org sees another org's continuity without an explicit consent grant.
- No "this child also attends clinic X" surfaced to a school.
- No automatic continuity sharing at a transition — every cross-org read
  goes through the Phase 4 consent grant tables.

---

## 6. Continuity during gaps

| Gap scenario | Behaviour | Lifecycle class |
|---|---|---|
| Returning after 3 months (school break) | Memory intact; operational surfaces resume as activity returns; calm default during the quiet period | Dormant → Active |
| New therapist after long gap | Session history persists; new therapist appends; no re-framing | Active (Care) |
| Returning after school break | Class anchor follows most-recent enrollment; memory intact | Transitioning → Active |
| Moving schools | Old school's memory remains visible while guardian link persists; new school authors fresh continuity | Historical (old) + Active (new) |
| Changing therapy providers | Old clinic's memory persists (family link has no end state); new clinic requires its own family link + grants | Historical (old) + Active (new) |
| Long inactivity (no logins) | Nothing changes; no re-engagement nudge; memory waits patiently | Dormant |

**The gap rule:** continuity *waits*. It does not decay (memory), it does
not nag (no re-engagement), and it does not reset (child-bound). When
activity resumes, it resumes — the feed picks up where it left off.

---

## 7. Implementation in this phase — most-recent-placement anchor

The audit identifies one lifecycle continuity-coherence gap worth fixing:
the parent layout's `enrollments[0]` fallback re-frames a transitioned
child by an unordered (typically oldest) historical enrollment instead of
their most recent placement.

**Fix.** In `src/app/parent/layout.tsx`:

1. Add `start_date` to the `school_years` sub-select so enrollments carry
   an orderable date.
2. Replace the `enrollments[0]` fallback with a most-recent-by-start_date
   pick, so a graduated / withdrawn child's identity anchor reflects where
   they most recently were (their endpoint), not where they started.

```ts
// Most recent placement by school-year start date — the child's identity
// anchor follows where they most recently were, never their starting point.
const mostRecentEnrollment = [...enrollments].sort((a, b) =>
  (b.classes?.school_years?.start_date ?? "").localeCompare(
    a.classes?.school_years?.start_date ?? ""))[0];

const activeEnrollment =
  enrollments.find(e => e.status === "enrolled" && e.classes?.school_years?.status === "active") ??
  enrollments.find(e => e.status === "enrolled") ??
  mostRecentEnrollment;
```

**Why this is the right minimum.**

1. **Directly addresses the directive's "re-framing the child from zero"
   rupture.** A graduated child showing their Toddler class instead of
   their Kinder graduation class IS re-framing from the start.
2. **Active-enrolled children are unaffected** — the first two resolution
   arms are unchanged; only the fallback for transitioned children
   improves.
3. **Deterministic.** `enrollments[0]` was unordered; the new fallback is
   explicitly sorted by school-year start date.
4. **Pure presentation.** No data change, no schema change, no new query
   beyond adding one already-existing column (`start_date`) to a sub-select.
5. **No new types, no new RPCs, no new RLS, no new components.** ~6-line diff.

**Out of scope, intentionally.**

- Lifecycle-aware hero default for inactive children ("Sofia's journey at
  {school}" instead of "All quiet today"). Would couple the hero to
  enrollment lifecycle state and require context plumbing — broader surface.
- A "graduated" / "completed" visual treatment or badge — borders on the
  forbidden cold-archival semantics; the calm default is the right
  behaviour.
- Filtering withdrawn / completed children out of the child list — they
  should remain visible so the parent can look back (memory access).
- Care-side lifecycle changes (different repo; family link already
  persists correctly).
- Re-entry / "welcome back" surfaces — anti-pattern.
- Any cross-org continuity transfer at a transition — gated by Phase 4
  consent grants, unchanged.
- Staff-side lifecycle surfaces (`school_year_completions`,
  `enrollment_transitions`) — out of parent scope.

---

## 8. Emotional transition risks identified

| # | Risk | Status |
|---|---|---|
| 8.1 | Transitioned child re-framed by oldest enrollment | **Fixed this phase** — most-recent-placement anchor |
| 8.2 | Cold lifecycle wording ("inactive," "case closed," "discharged") | Verified absent; clean baseline preserved |
| 8.3 | Memory loss at graduation / withdrawal | Verified clean — memory is child-bound, survives all transitions |
| 8.4 | Re-engagement nudges / inactivity guilt | Verified absent — no such surfaces exist; documented forbidden |
| 8.5 | Hero "today" framing for a graduated child | Calm default is acceptable; lifecycle-aware default deferred (would need context plumbing) |
| 8.6 | Cross-org surveillance / automatic continuity sharing | Verified clean — Phase 4 consent grants gate all cross-org reads |
| 8.7 | Therapist change rupturing the Care journey | Verified clean — per-session attribution + child-bound memory |
| 8.8 | Care family link persisting forever (no end state) | Acceptable — favours memory access; clinic lifecycle lives on `organization_memberships.status` |

---

## 9. Files inspected (Phase 5E)

**Learn**
- `src/app/parent/layout.tsx` — enrollment resolution + `activeEnrollment` fallback (the §7 fix site)
- `src/app/parent/dashboard/page.tsx` — hero calm default for inactive children; memory surfaces
- `src/app/parent/proud-moments/page.tsx` — Memory class persistence (child-bound)
- `src/app/parent/progress/page.tsx` — historical persistence (child-bound)
- `src/app/parent/updates/page.tsx` — historical posts persistence
- `src/features/parent-journey/helpers.ts` — Tier F calm default
- CLAUDE.md "Historical Foundation Architecture" — `enrollment.status`, `school_year_completions`, `enrollment_transitions`, `student_class_assignments`, `viewingYear`

**Care**
- `supabase/migrations/089_care_family_members.sql` — confirmed no status / ended_at column (persistent link)
- `lib/api/continuity-api.ts` — `>21d` gap markers therapist-side only; child-bound continuity
- `lib/api/sessions-api.ts` (referenced) — per-session therapist attribution

---

## 10. Future transition / lifecycle work intentionally not started

- **Lifecycle-aware hero default for graduated/inactive children.** A calm
  past-tense framing ("{Name}'s journey at {school}") instead of the present-
  tense "All quiet today." Needs an `isActive` flag through ParentContext +
  a hero branch. Deferred — context plumbing is broader than this phase's
  surgical scope.
- **Age-cue on `/parent/progress`** for months-old observations (also flagged
  in CONTINUITY_FRESHNESS_AND_DECAY.md §7.3 and CONTINUITY_REFLECTION_AND_MEMORY.md §10).
- **Care family-link lifecycle** (if a "paused therapy" state is ever needed,
  it belongs on a new column or on `organization_memberships`, not on a new
  workflow).
- **Cross-school memory portability** — when a child changes schools, should
  the new school optionally see prior proud moments? Requires explicit
  consent design; out of scope and likely undesirable.
- **Three-domain re-entry coherence when Med ships** — generalises the
  child-bound memory pattern.
- **A parent-facing "looking back" / year-review surface** — anti-pattern
  per CONTINUITY_REFLECTION_AND_MEMORY.md unless explicitly justified.

---

## 11. Permanent lifecycle rules (codified)

1. The child is the child — identity is child-bound, never reset by operational state.
2. Memory survives every transition — it is keyed on the child, not on enrollment / membership.
3. The identity anchor follows the most recent placement, never the starting point.
4. Inactive surfaces go quiet, never broken, never cold-labeled.
5. Re-entry resumes; it never restarts.
6. No re-engagement nudges, no inactivity guilt, no "case closed."
7. Cross-org continuity moves only through explicit consent grants — never automatically at a transition.
8. Each org owns its authored memory; the parent keeps reading it for as long as the link persists.
9. Therapist / staff changes preserve the journey — new authors append, they don't reset.
10. Graduation and withdrawal are quiet transitions, not events — no fanfare, no failure framing.
