# Staff Cognitive Rhythm & Emotional Load — Phase 6A

**Status.** Architectural normalization + one surgical de-pressuring fix.
This is the first phase to focus on the STAFF experience (teachers in Learn,
therapists / clinic admins in Care) rather than the parent home. The audit
names the staff rhythm classes, confirms the surfaces are mostly calm, and
removes the one productivity-pressure pattern on the teacher dashboard.

**Scope.** Defines how staff experience continuity sustainably — what they
see immediately vs. during prep vs. only when digging in — without constant
interruption, emotional stacking, or "everything urgent" syndrome.

**Out of scope.** No productivity scoring. No staff surveillance. No task-
management engine. No workforce analytics. No burnout scoring. No SLA
dashboards. No intervention-escalation systems. No gamification. No
performance-management tooling. No staff ranking. No new tables. No new
RPCs. No background jobs. No dashboard rewrites.

---

## 1. The staff rhythm question

If staff continuity surfaces become noisy, emotionally dense, or constantly
interruptive, continuity QUALITY collapses upstream — a fatigued teacher or
therapist writes thinner support context, skips reflections, and rushes
prep. That degradation eventually reaches the parent. So staff calm is not a
nicety; it is a precondition for the parent-side continuity the prior phases
built.

**The Lauris answer for staff:** the staff surfaces mirror the parent
philosophy — calm by default, capped density, progressive disclosure, no
guilt mechanics. Operational urgency (attendance to take, a plan awaiting
review) earns attention; the *absence* of an optional action (a parent
update not yet posted) does NOT get framed as a pending task.

---

## 2. Staff rhythm taxonomy

The directive proposed seven classes. After mapping onto the codebase, all
seven are load-bearing (staff surfaces are richer than the parent home, so
the finer-grained classes earn their place).

| Class | Visibility | Interruption | Emotional weight | Prep-eligible | Signal-eligible | Persistence | Suppression |
|---|---|---|---|---|---|---|---|
| **Immediate Attention** | front-stage on dashboard | high (but only genuinely operational) | low–medium | no | yes | until resolved | resolves on action |
| **Prep Context** | session/class prep surface only | none (visited deliberately) | low | yes | no | per-session | hidden when empty |
| **Active Continuity** | profile / continuity surfaces | none | medium | yes | low | rolling current | per cadence |
| **Background Continuity** | secondary cards, progressive disclosure | none | low | partial | no | feed-cap | collapses |
| **Reflection Context** | reflection / review surfaces | none | medium | yes (review) | no | persistent | visit-driven |
| **Historical Context** | per-domain history, scroll-driven | none | low | partial | no | permanent | scroll |
| **Quiet State** | nothing surfaced | none | none | n/a | n/a | n/a | the default |

**Quiet State is the default.** When there is nothing operationally pending,
the dashboard shows a calm empty state ("No pending teacher tasks right
now"), not a fabricated to-do.

---

## 3. Current staff continuity behaviour (observed)

### 3.1 Learn — Teacher dashboard (`TeacherDashboard.tsx`)

Largely calm and well-structured:

- **Header "My Day"** — warm, personal ("Welcome back, {first name}").
- **3 KPI cards** (My Classes, Attendance Today, Upcoming Events) — operational counts, not emotional. Attendance card shows calm states ("Weekend," "{Holiday} — no class," "No classes today").
- **Pending Teacher Tasks** — derived from already-fetched teacher-scoped state, with a `{N} items` chip and a calm empty state ("No pending teacher tasks right now. Enjoy your weekend.").
- **Classes Requiring Action** — attendance status grouped by in-progress / upcoming / completed; calm empty states; amber only on genuinely-unmarked completed classes.
- **Parent Communication** — recent updates + "Last update {timeAgo}" + "New Parent Update" CTA.
- **Student Support** — open plans (drafts / awaiting review); explicit comment in code: *"calm informational summary; urgency lives in Pending Teacher Tasks."*

**The one pressure pattern.** The Pending Teacher Tasks list includes a
parent-communication nudge:

```ts
label: noUpdatesToday
  ? "No parent update sent today"
  : "No parent updates in over 2 days",
```

This frames the ABSENCE of an optional action as an unresolved pending task,
stacked at the same visual weight as genuinely time-sensitive operational
tasks (attendance not taken). It is the directive's "productivity pressure"
/ "you missed X" anti-pattern. A teacher who spent the day teaching (not
posting) is told they have a pending task because they haven't communicated.

This is the §8 fix target.

### 3.2 Learn — other staff surfaces

- **Plan signals** (`usePlanSignals`) — RLS-scoped so teachers see only their own students' plans; counts presented calmly ("1 support plan awaiting your review").
- **Attendance urgency** — `absence_notifications` surfaces an amber per-student badge on the attendance page; intentional and operationally time-bound. Calm.
- **Historical viewing mode** — `SchoolContext.viewingYear` is a presentation hint; write guards are independent. Not a continuity-pressure surface.

### 3.3 Care — Session prep (`session/[id]/prep`)

Carefully calm:

- 9 sections, each **capped** (observations / milestones / voice notes sliced to 3; "showing 3 of N").
- Sections **hidden entirely when empty** (no "0 observations" filler).
- Section 4 (Active goals): explicit comment *"Positive hints only (addressed last session, active reinforcement) — gap patterns are surfaced separately."*
- Section 8 (Goal continuity): *"Framed as gentle observations, not alerts or action items. Only surfaced when signals exist — hidden entirely otherwise."* The `GoalSignalRow` severity is only `info` or muted — there is no `alert` / `urgent` / `critical` severity.
- The prep page is **visited deliberately** (Prep Context class) — it does not interrupt; the therapist opens it before a session.

### 3.4 Care — At-risk clients (`admin/at-risk`)

A clinic-admin attendance-retention tool (no-show / gap / first-appointment
scoring over 90 days):

- Red "High Risk" badges + numeric score badges; section counts ("High Risk · {N}").
- Calm green empty state ("All clients are low-risk").
- Transparent methodology note (the scoring formula is shown).
- **Admin-navigated, not interruptive** — a clinic admin opens this page deliberately; it does not push into the dashboard or interrupt a workflow.

**Disposition.** This is a deliberate operational retention tool, admin-only,
opt-in by navigation. Softening or removing its scoring would be opinionated
and risks degrading a legitimate clinical workflow — and this phase forbids
"broad rewrites" and altering working clinical functionality without
confirming intent. **Not touched.** Documented as a future-review item (§10)
if the clinic team ever finds the red framing emotionally heavy in practice.

### 3.5 Care — Continuity timeline + observation surfaces

- `assembleContinuityData` computes `riskLevel` / `riskFlags` (therapist-side)
  and inserts `>21d gap` markers — all on therapist surfaces, never parent-facing.
- Parent observations: therapists read all for their org; calm chronological list.
- Support-context authoring: a single focus paragraph per (child, clinic);
  upsert-replace model.

### 3.6 Where quietness already works

- Calm empty states everywhere (no fabricated to-dos).
- Capped prep sections (no infinite lists).
- Hidden-when-empty sections (no "0 of X" noise).
- Info-only goal-continuity severity (no alert escalation).
- RLS-scoped signals (teachers see only their own students).
- Admin-navigated risk tool (opt-in, not interruptive).

---

## 4. Emotional load findings

| # | Finding | Disposition |
|---|---|---|
| 4.1 | Parent-update nudge framed as a pending task ("you haven't posted") | **Fixed this phase** — removed from task list; calm visibility stays in the Parent Communication card |
| 4.2 | Upcoming events mixed into the Pending Teacher Tasks list | Acceptable — capped at 3, next 7 days, framed as "View Event"; they carry real heads-up value and aren't pressure. Left as-is to avoid a dashboard restructure. |
| 4.3 | Care at-risk red "High Risk" scoring | Left as-is — deliberate admin-navigated retention tool; altering it is opinionated and risks a working clinical workflow |
| 4.4 | Care session-prep "Current support focus" shows regardless of age | Documented (§10) — staff fossilization risk; the prep page already shows "Updated {date}"; a freshness/aging cue is deferred to a Care-repo pass (consistent with CONTINUITY_FRESHNESS_AND_DECAY.md §7.2/§11) |
| 4.5 | Pending Teacher Tasks "{N} items" count chip | Acceptable — small, with a calm empty state; not obsessive. Removing the parent-update task (4.1) reduces false inflation of this count. |
| 4.6 | Multiple plan signals + attendance + events stacking | Acceptable — capped, calmly styled (primary/10 chips, no red), distinct CTAs |

---

## 5. Staff emotional safety principles

### 5.1 How continuity should feel for staff

- **Operational, not evaluative.** "Attendance not taken for Sunflowers" is
  a fact + an action. "You're behind on attendance" would be a judgement.
- **Pending = genuinely pending.** A task list contains things that are
  actually unresolved and actionable now — not the absence of optional
  actions, not informational awareness.
- **Prep is calm and deliberate.** Prep surfaces are visited, not pushed.
  They cap density and hide empty sections.
- **Quiet is valid.** "No pending teacher tasks right now" is a healthy,
  intended state — not an empty dashboard to be filled.

### 5.2 Anti-patterns (permanent rules)

- **No productivity pressure.** No "you haven't posted today," no "you're
  behind," no cadence-enforcement framing.
- **No "you missed X."** The absence of an optional action is not a task.
- **No unresolved-count obsession.** Counts are calm summaries, never
  badges of guilt; no red count bubbles, no "N overdue."
- **No interruption overload.** Genuinely-operational items earn attention;
  informational/optional items don't push.
- **No "high-risk caseload" framing as a default surface.** Retention tools
  are admin-navigated, opt-in, never pushed into the daily view.
- **No emotional exhaustion mechanics.** No streaks of responsiveness, no
  "fastest responder," no response-time leaderboards.
- **No gamified responsiveness.** No points for posting, no badges for
  attendance streaks, no "engagement" scoring.
- **No staff comparison metrics.** Never across teachers, never across
  therapists, never "you vs. the team."
- **No SLA framing.** No "respond within N hours," no "overdue response"
  timers on staff continuity.
- **No intervention-pressure framing.** Goal-continuity hints stay
  observational ("addressed last session"), never "you must act."
- **No burnout / wellness scoring of staff.** Lauris does not measure or
  surface staff emotional state.

### 5.3 Voice patterns to keep

- **"operational earns attention; optional does not push."**
- **"pending means actually pending."**
- **"quiet is a valid state."**
- **"prep is visited, not pushed."**
- **"observation, not instruction"** (goal-continuity hints).

---

## 6. Quietness rules for staff

1. **When nothing is operationally pending, say so calmly** — and stop.
   Don't manufacture tasks to fill the list.
2. **Optional actions live in their own calm surface,** not in the urgent
   task list. (Parent communication → the Parent Communication card, not
   the task list.)
3. **Operational urgency suppresses continuity density.** During a busy
   teaching day, the dashboard leads with attendance/operational items;
   reflective continuity stays secondary.
4. **Retention / risk tools are opt-in.** They live on their own
   admin-navigated page; they never push into the daily view or interrupt.
5. **Prep surfaces defer to the moment of prep.** They are not shown until
   the staff member opens them; they cap density and hide empty sections.
6. **Reflection is never guilt.** Goal-continuity hints, plan signals, and
   support-context prompts are observational; none frame staff as failing.

---

## 7. Continuity density rules

1. **The daily dashboard caps actionable items** to what's genuinely
   operational. Informational items (events) are limited (next 7 days,
   max 3) and optional nudges (parent-update cadence) do not occupy the
   task list (§8 fix).
2. **Prep sections cap at 3 visible** with "showing 3 of N" + a link to the
   full view. No infinite lists in prep.
3. **Empty sections disappear** — they don't render as "0 of X."
4. **Progressive disclosure for depth** — the dashboard summarises ("1 IEP
   draft in progress"); the full plans / continuity views carry the detail.
5. **One emotional surface at a time** — like the parent home (Phase 4A),
   the staff dashboard avoids stacking multiple emotionally-heavy surfaces;
   amber/red is reserved for genuinely time-sensitive operational state.

---

## 8. Implementation in this phase — remove one productivity-pressure task

The audit identifies one staff productivity-pressure pattern worth removing:
the parent-communication nudge in the Learn teacher dashboard's "Pending
Teacher Tasks" list.

```ts
// Removed:
if (!todayIsNoClass && updatesLoaded && noUpdatesRecently && todayClasses.length > 0) {
  tasks.push({
    id: "task_update",
    label: noUpdatesToday ? "No parent update sent today" : "No parent updates in over 2 days",
    href: "/updates", cta: "Send Parent Update",
  });
}
```

**Fix.** Remove the `task_update` push (and the now-unused `noUpdatesToday`
/ `noUpdatesRecently` derived booleans). Parent-communication cadence stops
appearing as a pending TASK stacked with operational urgency.

**No capability lost.** The dashboard's dedicated **Parent Communication**
card already shows recent updates, "Last update {timeAgo}" in its header,
and a "New Parent Update" CTA. A teacher who wants to post has a calm,
always-present path; the cadence is still visible — it's simply no longer
framed as an unresolved task with a count.

**Why this is the right minimum.**

1. **Directly matches the directive's explicit anti-patterns** —
   "productivity pressure" and "you missed X." Framing not-posting as a
   pending task is precisely that.
2. **Surgical** — removes one `tasks.push` block + two now-unused derived
   constants. The dashboard structure, layout, and every other section are
   untouched. Not a rewrite.
3. **Safe and reversible** — no data change, no schema change, no query
   change. The Parent Communication card preserves calm visibility. A
   3-line revert restores the nudge if the product owner prefers it.
4. **Reduces false task-count inflation** — the "{N} items" chip no longer
   counts a non-task, so the operational task count reads truer.

**Why other findings were NOT changed.**

- **Care at-risk scoring** — deliberate admin-navigated retention tool;
  altering its framing is opinionated and risks a working clinical
  workflow. Out of scope.
- **Care session-prep support-focus freshness** — staff fossilization risk,
  but the prep page already shows "Updated {date}," and a freshness/aging
  cue is a Care-repo change deferred consistently with CONTINUITY_FRESHNESS_AND_DECAY.md
  §7.2/§11.
- **Events in the task list** — capped, real heads-up value, not pressure;
  moving them would be a dashboard restructure.
- **Plan signals / attendance** — genuinely operational; calm already.

**Out of scope, intentionally.**

- Any Care-repo change this phase.
- Restructuring the dashboard's section layout.
- Removing the events-in-tasks behaviour.
- Touching the at-risk retention tool.
- Adding a staff "freshness" cue to the Care prep support-focus card.
- Any new staff surface, signal, or count.

---

## 9. Files inspected (Phase 6A)

**Learn**
- `src/app/(dashboard)/dashboard/TeacherDashboard.tsx` — the §8 fix site; KPI cards, Pending Teacher Tasks, Classes Requiring Action, Parent Communication, Student Support
- `src/app/(dashboard)/dashboard/page.tsx` — dashboard entry (role routing)
- `src/lib/hooks` (`usePlanSignals`) — RLS-scoped plan counts
- `SchoolContext` (`viewingYear`) — historical viewing mode (not a pressure surface)

**Care**
- `app/session/[id]/prep/page.tsx` — calm capped prep; info-only goal-continuity severity
- `app/admin/at-risk/page.tsx` — admin-navigated retention scoring tool
- `lib/api/continuity-api.ts` — therapist-side risk/gap markers (not parent-facing)
- `lib/parent-attention/helpers.ts` (referenced) — therapist/parent attention shapes

---

## 10. Future staff cognitive-rhythm work intentionally not started

- **Care at-risk emotional-load review.** If the clinic team finds the red
  "High Risk" framing heavy in practice, a softer treatment (muted scores,
  "needs follow-up" instead of "high risk") could be considered — with the
  clinic team's input, since it's a working retention tool. Not changed
  unilaterally.
- **Care session-prep support-focus freshness/aging cue.** A gentle "set a
  while ago — worth refreshing?" prompt when the focus exceeds a staleness
  threshold. Care-repo change; consistent with CONTINUITY_FRESHNESS_AND_DECAY.md
  §7.2/§11.
- **Events vs. tasks separation** on the teacher dashboard. If the
  "everything is a task" density ever proves heavy, events could move to
  their own calm informational strip. Deferred — current capping makes it
  acceptable.
- **Staff reflection surface** (a calm "what's been happening with your
  students lately" review). Tempting but risks productivity-report drift;
  defer until clearly justified.
- **Cross-domain staff continuity** when Med ships — generalises the
  per-surface calm pattern.
- **A unified staff "today" pacing** mirroring the parent cadence classes
  (Phase 4A) — larger normalization; defer.

---

## 11. Permanent staff cognitive-rhythm rules (codified)

1. Operational urgency earns attention; the absence of an optional action does not.
2. A pending-task list contains genuinely pending, actionable items only.
3. Quiet is a valid, healthy state — never manufacture tasks to fill a list.
4. Optional actions (parent communication) live in their own calm surface, not the urgent task list.
5. Retention / risk tools are admin-navigated and opt-in — never pushed into the daily view.
6. Prep surfaces are visited, cap density, and hide empty sections.
7. Reflection and continuity hints are observational, never guilt or instruction.
8. No productivity scoring, no staff comparison, no responsiveness gamification, no SLA framing, ever.
9. Amber/red is reserved for genuinely time-sensitive operational state — earned by being rare.
10. Staff calm is upstream of parent continuity quality — protecting it protects the whole system.
