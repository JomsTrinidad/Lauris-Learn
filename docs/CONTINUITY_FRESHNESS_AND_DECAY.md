# Continuity Freshness & Decay — Phase 5B

**Status.** Architectural normalization + one surgical decay gate. Not a
cleanup engine. Implementation in this phase adds a freshness gate to the
reinforcement-context fetch helpers so support-focus lines stop appearing
on the parent home when they have aged past the point of being trustworthy
as "current" framing. The data is preserved; only the parent-home foregrounding
fades.

**Scope.** Defines how continuity ages without losing meaning. Prevents the
"fossilization" pattern where a child stays emotionally framed by an old
support context, a months-old struggle, or a stale reinforcement narrative
because no surface ever stops repeating it.

**Out of scope.** No background jobs. No cleanup workers. No auto-delete.
No expiry triggers in Postgres. No archival tables. No "outdated" banners.
No warning colors. No staff-side refresh-reminder system (out of scope —
parent home only). No real-time. No new tables. No new RPCs. No new
schema. No notifications.

---

## 1. The freshness question

A continuity surface that never lets context fade silently turns into a
fossil. The child is permanently framed by an old observation. A teacher's
September "practicing transitions" line keeps reading as the truth in
December. A therapist's "responding well to visual schedules" sits on the
parent home through the spring when the child is in a different phase.

The Lauris-Parent answer:

- **Time gates the foregrounding, not the data.** Aging context disappears
  from the parent home; the row stays in the table for staff review.
- **Different categories age differently.** Operational items resolve to
  terminal state. Reinforcement context ages on a clock. Milestones
  never age.
- **Decay is silent.** No "OUTDATED" badge. No "stale" red. No "review
  due!" CTA. The line just stops appearing once it crosses the freshness
  threshold.

---

## 2. Current freshness / decay behaviour (observed)

### 2.1 Already-paced surfaces

| Surface | Constant | Behaviour | Status |
|---|---|---|---|
| Hero proud-moment cooldown | `HERO_PROUD_MOMENT_WINDOW_DAYS = 2` | Hero rotates after 2d; card stays for 7d | ✅ paced |
| Hero therapy cooldown | `HERO_THERAPY_WINDOW_DAYS = 2` | Same | ✅ paced |
| Hero positive observation cooldown | `HERO_POSITIVE_OBSERVATION_WINDOW_DAYS = 3` | Same | ✅ paced |
| Attendance "fresh present" | `ATTENDANCE_PRESENT_FRESH_HOURS = 4` | Hero owns for 4h | ✅ paced |
| Featured proud moment card | `HIGHLIGHT_FEATURED_WINDOW_DAYS = 7` | Card fades from dashboard after 7d; persists in `/parent/proud-moments` | ✅ paced |
| Recent-story tier E | `RECENT_STORY_WINDOW_DAYS = 3` | Hero stops promoting school update after 3d; feed unaffected | ✅ paced |
| Recurring "Lately" categories | `RECURRENCE_WINDOW_DAYS = 14`, threshold 2 | Strip self-decays as 14d window slides forward | ✅ paced |
| Voice-note signal | `VOICE_NOTE_SIGNAL_DAYS = 7` | Signal expires after 7d; full visibility persists on Care detail page | ✅ paced |
| Care voice-note attention | `VOICE_NOTE_WINDOW_DAYS = 7` (Care side) | Same | ✅ paced |
| Care support focus signal | `SUPPORT_FOCUS_WINDOW_DAYS = 14` (Care side) | Attention strip drops signal after 14d; the support-focus card on Care detail still renders | partial |
| Care session update signal | `SESSION_UPDATE_WINDOW_DAYS = 3` (Care side) | Same | ✅ paced |
| Care observation echo | `OBSERVATION_ECHO_WINDOW_DAYS = 3` (Care side) | Same | ✅ paced |
| Freshness tint (feed) | `FRESH_WINDOW_HOURS = 72` + `FIRST_VISIT_LOOKBACK_HOURS = 24` | Per-item tint on items posted since last visit, capped at 72h | ✅ paced |
| Operational items (consent, doc request, billing) | n/a | Resolve to terminal state; no time-based decay needed | ✅ event-driven |
| Operational events (meeting today, holiday) | day-of | Date-keyed; roll off automatically | ✅ paced |

### 2.2 The decay gap

**Support context lines on the parent home have NO freshness gate.**

- `student_support_context.focus_text` (school side) — surfaced on the Learn dashboard via `SupportContextBlock`. Renders unconditionally whenever set.
- `care_support_context.focus_text` (Care side) — surfaced on the Learn dashboard via the Phase 5A `CareSupportContextBlock`. Renders unconditionally whenever set.

Both write a tiny "updated Nd ago" attribution line, but the attribution
is informational — it does not gate rendering. A context set 6 months ago
and never refreshed shows on the parent home today with identical
prominence to one set yesterday.

**Risk.** A teacher writes "Practicing waiting turns at circle time" in
mid-September because the class is rough during transitions. By December,
the child has settled; nobody updates the line. The parent reads
"Practicing waiting turns at circle time · From Maria · updated 3 months
ago" through the holidays and into the spring. The line has fossilised
into the child's parental framing despite being stale.

This is the exact emotional-fossilization pattern the directive warns
about ("an old support focus", "a historical struggle", "a temporary
difficult period").

### 2.3 What does NOT need a freshness gate

- **Proud moments** — Memory class. Never decay. The featured card already
  rotates off after 7d; the moment itself persists in `/parent/proud-moments`
  permanently. Correct.
- **Progress observations** — `progress/page.tsx` only renders the latest
  per category. Older observations are naturally pushed down by newer
  ones; no time-based decay needed. Correct.
- **Therapy session summaries** — Journey feed is depth-capped (15 items);
  older sessions naturally roll off. Hero cooldown already enforced.
  Correct.
- **Voice notes** — already gated at 7d for the signal layer; remain
  reachable on Care detail page. Correct.
- **Operational events** — resolve to terminal state. Date-keyed events
  (meeting today, holiday) auto-roll. Correct.
- **Care home activities** — already have status states
  (assigned / in_progress / completed / archived). Decay is event-driven,
  not time-driven. Correct.
- **Parent observations (Care)** — never resurface to the parent who wrote
  them; only the therapist reads them. Correct.

### 2.4 What's almost-but-not-quite gated

- **Care `care_support_context` on Care's own detail page** — the Care
  attention strip drops the "new support focus" SIGNAL after 14d, but
  the `#home-support-focus` CARD itself renders forever. Same
  fossilization risk on Care side. Out of scope for this phase — Care
  is a separate repo and Phase 5B's surgical change is Learn-side only;
  documented as future work in §11.

---

## 3. Decay taxonomy

The directive proposed seven decay classes. After mapping them onto the
actual codebase, **five** are load-bearing; *Archived* and *Quietly Expired*
fold into the same operational outcome (data persists, parent home stops
foregrounding).

| Class | Visibility | Hero | Signal | Feed | Reinforcement strip | Parent visibility | Resurfacing | Emotional framing |
|---|---|---|---|---|---|---|---|---|
| **Active** | front-stage | yes (its tier) | yes | yes | yes | yes | within window | current voice |
| **Recent** | front-stage; cooldown applied | demoted via cooldown | yes | yes | yes | yes | one-pass through hero, then page-resident | warm past tense |
| **Aging** | back-stage; quieter visual treatment if rendered at all | no | softer | yes | reaches the decay threshold | yes | searchable; no proactive resurface | observational, no current-tense framing |
| **Historical** | per-domain pages only | no | no | feed cap by depth | no | yes (when visited) | searchable | "from earlier" framing |
| **Memory** | per-domain pages only; permanent | no | no | per-domain page | no | yes | never | celebratory / identity |
| **Quietly Expired** | parent home stops foregrounding; data persists | no | no | no | no | not on parent home; staff or admin can still query | none | invisible to parent |

**Active vs Aging vs Quietly Expired** is the new vocabulary this phase
introduces. Currently the codebase has Active and Memory cleanly handled
but lets Reinforcement Context drift from Active → ??? without naming
where it goes. The §8 implementation gives it a destination: **Aging at
the freshness threshold, Quietly Expired past it**.

### 3.1 Class assignment by entity (existing surfaces, post-Phase-5B)

| Entity | Active window | Aging window | Quietly Expired threshold | Memory? |
|---|---|---|---|---|
| Attendance | day-of | n/a | next day | n/a |
| Meeting today / online class today | day-of | n/a | next day | n/a |
| Holiday | day-of | n/a | next day | n/a |
| Consent / doc request | until terminal state | n/a | resolution | n/a |
| Billing | until paid | aging classes on bill itself, not Lauris UI | terminal state | n/a |
| Voice note (signal) | ≤7d | n/a | >7d | Care detail page persists |
| Therapy session summary | hero ≤2d | feed up to 15 items | beyond feed cap | n/a (no dedicated memory page yet) |
| Proud moment | featured ≤7d | hero ≤2d (cooldown) | from dashboard after 7d | yes (`/parent/proud-moments`) |
| Progress observation | latest per category | older same-category | superseded by newer | yes (`/parent/progress`) |
| Class update | feed up to 50 | beyond 50 | beyond `/parent/updates` cap | yes (`/parent/updates` page) |
| **Support context (school)** | **≤45d (Phase 5B)** | **n/a** | **>45d (Phase 5B)** | data persists; not on parent home |
| **Support context (therapy)** | **≤45d (Phase 5B)** | **n/a** | **>45d (Phase 5B)** | data persists; Care detail page still shows (out of scope) |
| Recurring "Lately" categories | 14d window | n/a | beyond 14d | n/a |
| Milestone | hero D-class ≤ window | feed | beyond feed cap | yes (Care milestone page) |
| Parent observation (Care) | never echoed to writer | n/a | n/a | yes (Care detail page) |

---

## 4. Freshness trust model

How the parent / staff know whether context is still current, without any
"OUTDATED" banner, red badge, or anxiety-inducing indicator.

### 4.1 Three trust mechanisms (use these only)

1. **Passive presence.** If the line is visible, it's considered current
   enough by the system. If it has aged past the freshness threshold, it
   simply isn't on the page anymore. The parent's perception is
   calibrated to "what's there is current; what's not there isn't."
2. **Subtle attribution.** "Updated 3d ago" / "Updated 2 weeks ago" is the
   *only* age indicator. It is one small line in muted text. No coloring.
   No urgency.
3. **Replacement is the strongest fresh signal.** When a teacher updates
   the focus, the new text appears with a fresh stamp. No notification
   to the parent; the next visit shows the new framing.

### 4.2 Three trust mechanisms forbidden

- **No "this context may be outdated" banners.** Anxiety.
- **No "review due" prompts for parents.** Parent burden anti-pattern.
- **No red / amber decay coloring.** Earned-color rule (Phase 4A).
- **No "X days since last update" countdowns.** Pressure framing.
- **No "stale" / "fresh" badges.** Binary judgments masquerade as info.
- **No staleness leaderboards** (e.g., "5 children with stale focus"). Surveillance UI.

### 4.3 Staff-side trust mechanisms — out of scope for this phase

A future phase could add a staff-side "support focus is X days old — refresh?"
nudge inside the school/therapy admin surface. That would belong on the
authoring side, not the parent home. Not implemented here; documented as
future work (§11).

---

## 5. Domain decay matrix

For each entity, the freshness/persistence/fade/archive/memory rules.

| Entity | Freshness on parent home | Persistence | Fade strategy | Archive | Memory-worthy? | Resurfacing? |
|---|---|---|---|---|---|---|
| Reinforcement (school support context) | **≤45d (Phase 5B)** | DB row persists | Hard cutoff at threshold | n/a — staff sees in admin | No | Only via fresh write |
| Reinforcement (therapy support context) | **≤45d (Phase 5B)** | DB row persists | Hard cutoff at threshold | Care detail page still shows | No | Only via fresh write |
| Reinforcement (future Med context) | ≤45d (same rule) | DB row persists | Same | Med detail page (future) | No | Same |
| Operational concern (consent, doc request) | Until resolved | n/a | Resolve to terminal state | Document history | No | Re-fires only on new operational events |
| Operational concern (billing) | Until paid | n/a | Mark paid → disappears | Payment history | No | Per-billing-cycle |
| Operational concern (attendance) | Day-of | n/a | Day rolls | Attendance history | No | Per-day |
| Milestone (Care `care_milestones`) | Always parent-visible on Care + via journey | Permanent | Pushed down by newer milestones; never aged out | Care milestone page | YES | Annual / per-visit |
| Proud moment | Featured ≤7d; hero ≤2d | Permanent | Drops from dashboard after 7d; lives in `/parent/proud-moments` | Proud-moments page | YES | Page-internal only |
| Therapy summary (parent_visible_summary) | Hero ≤2d; journey ≤15 items | Permanent | Push-down by newer | Care detail page | No | Page-internal only |
| Voice note (parent_visible) | Signal ≤7d; Care surface always | Permanent | Drops from signal after 7d; lives on Care detail page | Care detail page | No | Per-fresh-note |
| Parent observation (Care, parent → therapist) | Never on parent home | Permanent | n/a | Care detail page | No (privacy class) | Never to writer |
| Recurring "Lately" categories | 14d window, threshold 2 | n/a | Window slides forward | Implicit in proud-moments history | No | Only on continued recurrence |
| Progress observation (parent_visible) | Latest per category | Permanent in history | Newer same-category supersedes | `/parent/progress` history (page-internal pagination) | Soft yes | Page-internal only |
| Class update (parent_updates) | Feed ≤15 items on dashboard; ≤50 on `/parent/updates` | Permanent within school | Push-down by newer | `/parent/updates` history | No | Page-internal only |

---

## 6. Cross-domain decay rules

### 6.1 Reinforcement decay must apply per domain independently

A 50-day-old school support context should fade from the parent home even
if the Care support context is fresh. A fresh school support context
should still display even if the therapy context is 70 days old. The
two lines age on independent clocks.

**Confirmed by §8 implementation.** The freshness gate runs separately on
each fetch (school + Care).

### 6.2 Decay does not cascade

A fading school context does not trigger anything on the therapy side.
A stale Care context does not affect school. No cross-domain "the child
has stale reinforcement everywhere — flag the parent" surface. Anti-pattern.

### 6.3 Old context must not contradict fresh context emotionally

If both a school line and a Care line are visible, they may say very
different things ("transitioning back to in-person well" vs "responding
to home practice on emotional regulation"). The system does NOT
synthesize or reconcile them. Each line speaks for its domain. The
parent reads both. Lauris does not editorialise.

### 6.4 Quietly expired data remains queryable, never deleted

The §8 implementation gates *parent-home rendering*, not the underlying
SELECT. Staff admin UIs (when built) can still query the row by
clicking through to a detail surface. Lauris does not delete continuity
context.

### 6.5 Future Med follows the same pattern

When Lauris Med ships, its reinforcement context (e.g. "currently
managing a 2-week elimination diet — daycare informed") will inherit
the 45-day freshness gate, the silent-fade rule, and the no-banner
trust mechanism. The §8 pattern generalises with no new infrastructure.

---

## 7. Stale framing risks identified

### 7.1 Support context fossilization (the headline risk)

**Identified.** Without a freshness gate, support contexts can sit
indefinitely. Direct emotional fossilization risk per the directive's
"an old concern, an outdated support focus, a historical struggle, a
temporary difficult period."

**Disposition.** Fixed in this phase (§8). 45-day gate at the fetch
layer suppresses parent-home rendering; data persists.

### 7.2 Care detail page still surfaces stale support focus

The Care `/parent/[childId]` page renders `care_support_context.focus_text`
unconditionally. Even after Phase 5B fixes the Learn parent home, the
parent who navigates to Care will still see a stale line there.

**Disposition.** Out of scope this phase (different repo, different
fetch, different render path). Documented as future work (§11). The
risk is mitigated by the cross-app continuity boundary — most Phase 3A
Learn-linked parents see the Learn home and only deep-link to Care for
voice notes (Phase 3C anchor target). Care-only parents remain at
elevated risk; the future Care patch is identical in shape.

### 7.3 Progress observation latest-per-category never ages out

`progress/page.tsx` shows the latest observation per category, regardless
of how old. A "developing" rating set 6 months ago and never refreshed
still appears as the current row for that category.

**Disposition.** Mostly correct behaviour — the latest is the latest by
definition, and the parent visits `/parent/progress` intentionally
(unlike the parent-home ambient lines). However, the page could
benefit from a "noted 6mo ago" muted note rather than the current
date-only attribution. Out of scope this phase; documented as future
work.

### 7.4 Featured proud-moment cooldown already correct

The featured card respects `HIGHLIGHT_FEATURED_WINDOW_DAYS = 7` and the
hero respects `HERO_PROUD_MOMENT_WINDOW_DAYS = 2`. The moment lives
permanently in `/parent/proud-moments` but stops dominating the
dashboard after 7d. Correct.

### 7.5 Recurring "Lately" strip already self-decays

`RECURRENCE_WINDOW_DAYS = 14` slides forward; old categories naturally
drop off. Threshold of 2 occurrences prevents one-off categories from
ever appearing. Correct.

### 7.6 No staff-side "refresh me" prompt for support contexts

Both `student_support_context` and `care_support_context` lack any
staff-side "your focus context has aged — refresh?" prompt inside the
authoring surfaces. This means well-meaning teachers / therapists set
a focus and forget to revisit it.

**Disposition.** Staff-side surfaces are out of scope for this phase.
Documented as future work (§11). The Phase 5B parent-home gate is
sufficient to prevent emotional fossilization in the meantime.

---

## 8. Implementation in this phase — one freshness gate

The audit identifies exactly one decay gap worth fixing now: support
context lines on the Learn parent home render forever, creating
emotional fossilization risk.

**Fix.** Add a 45-day freshness gate at the fetch layer in
`src/features/parent-journey/queries.ts`. Both `fetchSupportContext`
(school) and the Phase 5A `fetchCareSupportContext` (therapy) return
`null` when the row's `updated_at` is older than the threshold. The
underlying data is unchanged; only the parent-home foregrounding
fades. Render code in the dashboard is unchanged (it already guards
on `null`).

**Why 45 days.**
- Long enough that a refreshed-weekly support focus never hits the gate.
- Long enough that a quarterly review cadence touches it once before
  fade (gives staff a refresh signal naturally, via the parent's
  reaction or absence of reaction).
- Short enough that a one-off focus statement stops appearing
  ~6 weeks later — well before "frozen for a season" territory.
- Longer than Care's signal window (`SUPPORT_FOCUS_WINDOW_DAYS = 14`)
  because the parent-home REINFORCEMENT LINE is a longer-cadence surface
  than the Care attention-strip SIGNAL.

**Why fetch-layer not render-layer.**
- The decay is a data semantics decision, not a UI decision.
- Keeps the dashboard render code clean.
- A future fetch could be reused in other surfaces (e.g., a "current
  focus" pill in the family drawer) and would inherit the gate
  automatically.

**Why "hard cutoff" not "soft opacity ramp."**
- Surgical: one number, one comparison.
- Avoids "what shade of muted means stale" debates.
- Aligns with the directive's "what fades silently" rule — silent fade
  is binary at the gate, not gradient.

**Out of scope, intentionally.**
- Aging-opacity ramp (UI-level decay treatment).
- Care side support-focus gate (different repo).
- Staff-side "your context has aged" prompt (authoring surface).
- Progress observation age display ("noted 6mo ago").
- Background scheduled job to "expire" contexts (no cleanup needed —
  the data stays; only foregrounding fades).
- Auto-deletion of any data.
- Resolution workflow ("mark resolved" for support focuses).
- AI freshness ranking.

---

## 9. Files inspected (Phase 5B)

**Learn**
- `src/features/parent-journey/queries.ts` — `fetchSupportContext` (school), `fetchCareSupportContext` (Phase 5A), constants
- `src/features/parent-journey/helpers.ts` — existing decay constants
  (`HERO_PROUD_MOMENT_WINDOW_DAYS=2`, `HERO_THERAPY_WINDOW_DAYS=2`,
  `HERO_POSITIVE_OBSERVATION_WINDOW_DAYS=3`, `HIGHLIGHT_FEATURED_WINDOW_DAYS=7`,
  `ATTENDANCE_PRESENT_FRESH_HOURS=4`, `RECENT_STORY_WINDOW_DAYS=3`,
  `RECURRENCE_WINDOW_DAYS=14`, `RECURRENCE_THRESHOLD=2`, `CATEGORY_LIMIT=3`,
  `SIGNAL_CAP=3`)
- `src/app/parent/dashboard/page.tsx` — `SupportContextBlock`, `CareSupportContextBlock`, `loadAll` wiring
- `src/app/parent/proud-moments/page.tsx` — Memory class confirmed
- `src/app/parent/progress/page.tsx` — latest-per-category confirmed
- `src/app/parent/updates/page.tsx` — depth cap (50) confirmed
- Existing `isWithinDays` / `isWithinHours` utilities (helpers.ts)

**Care**
- `lib/parent-attention/helpers.ts` — Care signal windows
  (`SUPPORT_FOCUS_WINDOW_DAYS=14`, `VOICE_NOTE_WINDOW_DAYS=7`,
  `SESSION_UPDATE_WINDOW_DAYS=3`, `OBSERVATION_ECHO_WINDOW_DAYS=3`)
- `app/parent/[childId]/page.tsx` — confirms Care support focus card renders unconditionally (out-of-scope fossilization risk)
- `lib/api/support-context-api.ts` — Care-side fetch shape
- Migration 094 — RLS confirmation
- Migration 095 — voice notes (signal gating already in place)

---

## 10. Future freshness/decay work intentionally not started

- **Care side support-focus card freshness gate.** Same pattern as §8;
  ships in a Care-repo phase.
- **Staff-side "your support focus has aged" prompt.** Authoring surface
  in school admin / Care admin UIs. Soft nudge, not a blocking workflow.
- **Aging-opacity ramp on rendered support context lines** (e.g.,
  text-foreground/60 between 30–45d). Render-layer decay.
- **Progress observation age display.** Replace the bare date with
  "noted 6mo ago" in muted text when the latest-per-category row is
  older than ~60d.
- **Therapy session summary fossilization** — currently the journey
  feed cap of 15 keeps it under control, but a child without recent
  sessions would see an old summary persist. Probably fine; the
  parent-home tier C/D/E cooldowns already prevent the hero from
  promoting it.
- **Future Med reinforcement gate** (same pattern as §8 when Med ships).
- **Staff-side "support focus history" timeline** for clinicians who
  want to see prior framings. Out of scope; would require a versioned
  `support_context_history` table or similar.
- **Lauris-wide retention policy doc** for `child_documents` / proud
  moments / observation history — different scope (compliance), not
  parent UX.

---

## 11. Future work flagged from §7

- §7.2 — Care detail page support-focus card gate (Care-repo follow-up).
- §7.3 — Progress observation age display on `/parent/progress`.
- §7.6 — Staff-side support-context "refresh me" nudge.

Each is small and shippable on its own when the respective repo's
next reinforcement-pass lands.
