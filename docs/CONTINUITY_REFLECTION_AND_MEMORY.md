# Continuity Reflection & Memory — Phase 5D

**Status.** Architectural normalization + one surgical analytics-drift
removal. The codebase has surprisingly good memory architecture already
(Memory class is well-defined across Phases 4A and 5C); this phase names
the reflection rules and removes the single ranking pattern that crept in
on the `/parent/proud-moments` page.

**Scope.** Defines what Lauris helps families remember, how reflection
stays narrative and observational (not analytical), and where the line
sits between memory and analytics drift.

**Out of scope.** No charts. No graphs. No trend lines. No scores. No
"development reports." No "progress dashboards." No AI-generated
narratives. No comparison framing. No percentile language. No "growth
curves." No quantified parenting. No new tables. No new RPCs. No
background jobs. No notification infrastructure.

---

## 1. The reflection question

A continuity system that never lets the parent look back becomes a
flat present-tense feed. A continuity system that tries TOO hard to let
the parent look back drifts into analytics: charts, growth curves,
percentile comparisons, "your child this year" dashboards. The first
fails to preserve meaning; the second creates surveillance and pressure.

**The Lauris answer to reflection:** memory IS the dedicated detail page.
The home is for *now*; the per-domain pages are for *remember*. There
is no separate "Reflection" tab, no "Year in Review" generator, no
"Your Child's Journey Report" PDF, no annual summary email. Memory
lives in:

- **`/parent/proud-moments`** — full cumulative history of every proud
  moment. Permanent. Newest first. No decoration.
- **`/parent/progress`** — latest observation per category (newer
  pushes down older).
- **`/parent/updates`** — capped reverse-chronological school feed
  (50 items).
- **`/parent/events`** — events including past attended events.
- **`/parent/proud-moments` "This Week" card** — a small at-the-top
  summary of recent activity.
- **Care `/parent/[childId]`** — therapy journey + voice notes + parent
  observation history.
- **Care milestones page** — long-term milestone memory.

Reflection happens when the parent *visits* one of these pages. The
home dashboard never proactively surfaces a "remember this?" prompt.

---

## 2. Current memory / reflection behaviour (observed)

### 2.1 Memory-class surfaces already in place

| Surface | Class | Persistence | Resurfacing |
|---|---|---|---|
| `proud_moments` rows | Milestone Memory | permanent | featured ≤7d on dashboard; permanent on page |
| `proud_moment_reactions` | Reflection Memory | permanent | with their moment |
| `care_milestones` rows | Milestone Memory | permanent | Care detail page + journey feed |
| `progress_observations` | Observational Memory | permanent | latest-per-category on `/parent/progress`; older accessible via scroll |
| `parent_updates` | Recent Journey → Historical | permanent within school | feed cap (15 dashboard / 50 page) |
| `therapy_sessions.parent_visible_summary` | Recent Journey → Historical | permanent | journey feed cap |
| `care_voice_notes` (parent_visible) | Recent Journey → Historical | permanent | Care detail page |
| `care_parent_observations` | Reflection Memory (parent → therapist) | permanent | Care detail page (parent sees only own) |
| Continuity-echo phrases (useResonance / useContinuityEcho) | Private Reflection | localStorage only | with the associated support context |
| Recurring "Lately" categories | Quiet Observational Memory | derived (no row) | 14d sliding window |
| `student_support_context` / `care_support_context` | Active → Quietly Replaced | permanent in DB; not foregrounded past 45d | gone from home; queryable by staff |

### 2.2 Reflection mechanics already correctly implemented

- **Continuity echo phrases.** Parent saves a private one-line reflection
  tied to a school support context update. `REFLECTION_MEMORY_THRESHOLD_MS
  = 5 minutes`; the phrase becomes "memory" (gentler styling) after the
  threshold. LocalStorage only — never propagates to staff, never reaches
  Care, never reaches Med.
- **Featured proud moment cooldown.** A moment owns the hero for 2d,
  the dashboard card for 7d, and the proud-moments page forever. The
  hero rotates so the same moment doesn't shout twice; the page
  preserves it.
- **Lately strip discipline.** `RECURRENCE_THRESHOLD = 2` is checked but
  NEVER surfaced as a count — the label IS the message. Documented in
  `queries.ts`: "Sort by max(created_at) descending — recency-of-most-
  recent-occurrence. NOT by count — that would be ranking / scoring,
  which the directive forbids."
- **Hero Tier D40 wording.** "Showing growth in {category}" is
  observational. Not "improved." Not "got better." Not "achieved."
- **No charts anywhere.** The codebase has zero chart-library
  dependencies in any parent surface (verified — no `recharts`,
  `chart.js`, `d3`, `victory`, `nivo`, `apexcharts`, `plotly` etc.
  imported under `src/app/parent/`).
- **Care continuity gap markers** (`>21d gap in sessions`) live
  ONLY on the therapist-side continuity timeline; **not parent-facing**.

### 2.3 The one analytics-drift pattern in current code

**`/parent/proud-moments` "This Week" summary card.**

```tsx
const categoryCounts: Record<string, number> = {};
for (const m of thisWeek) {
  categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1;
}
const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
```

Renders:

> Sofia earned **3 proud moments** this week. **Most celebrated: Kindness**.

The "Most celebrated" line picks ONE category from the week's moments
and labels it as the most-frequent. This is a ranking — exactly the
"ranking growth" pattern the directive lists as forbidden.

The directive enumerates this under Deliverable 4 anti-patterns:

> - “look how far behind/ahead”
> - trend dashboards
> - percentile language
> - developmental scoring
> - “improvement curves”
> - **ranking growth**
> - quantified parenting

"Most celebrated" is internal-category ranking. Even though the category
was celebrated rather than judged, the *picking* of one category as
"most" creates a hierarchy among the child's traits. The Phase 4A §6.1
"no leaderboards" rule applies whether the leaderboard is between
children OR between a child's own categories.

**Phase 5D action:** remove the "Most celebrated" line. Keep the count
(it's a calm observation, not a ranking). See §8.

### 2.4 What's NOT a problem

- **The "3 proud moments this week" count.** This is observational —
  it tells the parent that things have been going well lately. It is
  not a streak (no "consecutive weeks" tracking). It is not an
  engagement metric. It is not a comparison. It carries no badge, no
  trophy, no congratulations. The parent visited the page intentionally
  to celebrate; the count is part of the page's job. Leaving in place.
- **The `/parent/proud-moments` cumulative scroll.** Long history of
  moments, newest first. Visit-driven, not pushed. Correct.
- **`/parent/progress` latest-per-category.** The parent visits the page
  to see where things stand; older same-category observations are
  pushed down by newer ones. This is push-down succession (Phase 5C),
  not ranking.
- **Care milestones cumulative list.** Same shape.

---

## 3. Memory taxonomy

The directive proposed seven classes. After mapping them onto code,
**six** are load-bearing. *Non-Memory* and *Quiet Memory* collapse — the
operational category (Phase 4A) is the practical Non-Memory class,
because operational events resolve and never become memory.

| Class | Persistence | Hero | Feed | Reflection-eligible | Parent visibility | Resurfacing |
|---|---|---|---|---|---|---|
| **Immediate Memory** | hours → day-of | Tier A/B/C | n/a | no | yes | n/a (it IS the present) |
| **Reflection Memory** | session-scoped to permanent | no | no | yes | yes (own only for Care parent observations; private for echo phrases) | with their anchor |
| **Milestone Memory** | permanent | feed-cap only | yes (rare) | yes | yes | per-domain page only |
| **Reinforcement Memory** | replaced or aged (Phase 5B 45d / Phase 5C 14d reorder) | no | no | implicit | yes while current | no |
| **Historical Memory** | permanent within page cap | no | no | passive (visit-driven) | yes | scroll / page-internal |
| **Non-Memory** (operational) | until resolved | yes (its tier) | no | no | yes | none |

### 3.1 Reflection-eligible vs feed-eligible vs hero-eligible

- **Reflection-eligible** = the parent might intentionally seek it out
  ("how is Sofia doing in kindness this year"). Resurfacing is via the
  parent's choice to visit a page, not a system push.
- **Feed-eligible** = appears in the chronological journey feed on the
  dashboard. Memory items past the depth cap are still queryable on
  per-domain pages but stop appearing on the home.
- **Hero-eligible** = the system itself might bring the item to the
  top of the page. Memory items lose hero eligibility past their
  cooldown window (Phase 4A); only Immediate Memory and Reinforcement
  Memory cycle through the hero.

### 3.2 Class assignment for current entities

| Entity | Class |
|---|---|
| Proud moments | Milestone Memory |
| Care milestones | Milestone Memory |
| Progress observations | Historical Memory |
| Parent updates (school posts) | Historical Memory |
| Therapy session summaries (parent-visible) | Historical Memory |
| Voice notes (parent-visible) | Historical Memory |
| Parent observations (Care, parent → therapist) | Reflection Memory |
| Continuity-echo phrases (parent's private one-liner) | Reflection Memory |
| Support contexts (both sides) | Reinforcement Memory (or Quietly Replaced past 45d) |
| Recurring "Lately" categories | derived from Milestone Memory; surfaced via Reflection Memory voice |
| Operational events (consent, doc request, billing) | Non-Memory |
| Attendance | Non-Memory (day-of) |
| Events | Non-Memory (day-of) |
| `care_session_events` (telemetry) | Non-Memory (not parent-visible) |

---

## 4. Reflection principles

### 4.1 How reflection should feel

- **Visit-driven, not push.** A parent who wants to look back opens a
  page. The page reads as memory. The home never says "Want to
  reflect?" or surfaces a year-in-review prompt.
- **Narrative, not numerical.** "Sofia stayed focused during class." NOT
  "Sofia maintained 73% focus this period."
- **Observational, not evaluative.** "Doing well in kindness lately."
  NOT "Best at kindness." NOT "Most improved in kindness."
- **Quiet, not celebratory.** A page of cumulative proud moments is a
  warm record. It doesn't need confetti, badges, or "Look at all
  your moments!" framing.
- **Honest, not curated.** The parent reads every moment in
  chronological order. The system does NOT pick "top 5 moments of
  the year" or recommend favourites.
- **Personal, not comparative.** Reflection happens within the child's
  own history. Never across children, never across families, never
  against a "typical" baseline.

### 4.2 Anti-patterns (permanent rules)

- **No charts.** No bar charts, line charts, pie charts, sparklines,
  trend lines, sankeys, treemaps, radar charts, heat maps, scatter
  plots.
- **No development reports.** No PDF generation. No "Sofia's Year"
  summary emails. No automated newsletters.
- **No AI-generated narratives.** No LLM-written progress summaries.
  The narrative IS the moments + observations as written by the
  humans who set them.
- **No quantified parenting.** No engagement metrics, no time-spent,
  no visit frequency, no response rates, no "you've celebrated N
  moments this year."
- **No comparison framing.** Not across children. Not against peers.
  Not against developmental milestones / norms. Not against the
  child's own past as "before / after" arcs.
- **No percentile language.** "Sofia is in the top X for kindness"
  is the kind of sentence Lauris must never produce.
- **No development scoring.** No A-F grades, no rubrics for parents,
  no "developmental score."
- **No improvement curves.** No "growth velocity," no "trajectory,"
  no "rate of progress."
- **No ranking growth.** No "Top trait," "Most improved category,"
  "Most celebrated this week." (Phase 5D §8 removes the one
  remaining instance.)
- **No streaks.** Not for moments, not for sessions, not for posts,
  not for reactions.
- **No "year in review."** No annual summary surface.
- **No "memory book" / "scrapbook."** No automated keepsake
  generation. (Parents can scroll the proud-moments page themselves.)
- **No "milestones predicted."** No upcoming-milestone prompts based
  on age / development charts.
- **No "this is your child's normal."** No baseline-inference.
- **No social comparison.** No "most parents react to moments within
  N hours," no "X% of children show this milestone by age Y."

### 4.3 Voice patterns to keep

- **"label IS the message."** When a category chip carries enough
  meaning, no count or percentage is needed.
- **"observation, not conclusion."** "Showing growth in X" beats
  "Improved in X."
- **"earned warmth."** Celebratory phrasing (proud-moment hero
  headlines) is reserved for moments — earned by being moments — not
  applied to every observation.
- **"page as memory, home as now."** Detail pages own reflection. The
  home owns presence.
- **"visit-driven resurfacing."** If the parent doesn't visit, the
  memory rests. The system doesn't ping them with reminders.

---

## 5. Longitudinal coherence rules

### 5.1 How memories coexist with current continuity

- The home shows the present (hero, signals, fresh reinforcement, recent
  journey).
- The pages show the past (proud moments, progress, updates, events,
  Care detail).
- The two layers never compete. A 6-month-old proud moment doesn't
  return to the home; it lives on the page. A current support context
  doesn't appear on the proud-moments page; it lives on the home and
  Care detail.

### 5.2 How old support context remains historical only

Phase 5B 45-day freshness gate + Phase 5C succession-by-recency together
ensure:
- Stale support contexts disappear from the home (45d gate).
- Older but in-window contexts step back to second position when a
  much-newer counterpart from another domain exists (14d threshold).
- DB rows persist; the foregrounding fades.

There is **no parent-visible "support context history" page** — that's
admin territory (out of scope) and would risk turning into a "concerns
over time" surface, which the directive forbids.

### 5.3 How milestones persist safely

- Permanent on `/parent/proud-moments` and Care milestone surfaces.
- Pushed off the home by newer items naturally (cooldowns + caps).
- Cumulative ordering only — no "top moments" list, no "highlight reel."
- Reactions on proud moments persist with the moment; they are private
  parent-school communication, not public counts.
- No "anniversary" / "remember this from a year ago" automatic
  resurfacing. If the parent wants to look back, they scroll.

### 5.4 How narrative identity remains flexible

The child is never a row of metrics. The child is a sequence of moments
+ observations + therapist notes + parent observations + reactions, all
in the words of the humans who wrote them. The system does NOT:
- Aggregate identity into a "personality summary."
- Generate "your child is X type" framings.
- Compute a "strengths/needs" profile from observations.
- Tag a child with permanent identity labels based on past concerns
  ("the child who struggled with transitions").

The flexibility comes from the data being narrative all the way down —
nothing the system surfaces *fixes* the child into a category.

### 5.5 How continuity supports understanding without fixation

- The parent can scroll for as long as they like; reading happens in
  the parent's time, not the system's.
- The system has no "are you done reading?" or "did this help?"
  prompts.
- The system has no "based on what you've read, recommend X."
- The system has no "you might want to revisit Y."
- Understanding emerges from cumulative reading, not from system
  recommendation.

---

## 6. Resurfacing rules

### 6.1 What deserves occasional resurfacing

**Only one form of automatic resurfacing exists in code today, and it
is correct:** the Hero Tier D30 occasionally lifts a featured proud
moment back into the top sentence of the dashboard for its
HERO_PROUD_MOMENT_WINDOW_DAYS (2-day) window. That's it. The proud
moment isn't repeatedly pinged; the hero just chooses it as the
calmest valid headline when conditions match.

### 6.2 What should remain passive

- All page-level memory (proud-moments, progress, updates, Care detail).
  Visit-driven only.
- Continuity-echo phrases (private localStorage; surface only with the
  context that anchored them).
- Recurring "Lately" categories — observational, sliding window, no
  auto-prompt.

### 6.3 What should only appear during intentional reflection

- Older proud moments (scroll on the page).
- Older progress observations (scroll on the page).
- Older school updates (scroll on the page).
- Older Care voice notes (scroll on Care detail page).
- Cumulative milestone list.

### 6.4 What should NEVER resurface automatically

- Old concern framings (Phase 5B fade).
- "A year ago today" prompts.
- "Anniversary" notifications.
- "You haven't reacted to N moments" reminders.
- "Sofia hasn't had a proud moment in N days" nudges.
- "We noticed you haven't visited in N days" guilt prompts.
- Old support context as "did this get resolved?" prompt.
- Past sessions / appointments as "did you reflect on this?" prompt.

---

## 7. Emotional safety risks identified

### 7.1 Analytics drift — ranking on proud-moments page

**Identified.** "Most celebrated: {category}" picks one of the child's
trait categories as the top of a leaderboard.

**Disposition.** Fixed in this phase (§8).

### 7.2 Count-based weekly summary on proud-moments page

**Identified.** "Sofia earned 3 proud moments this week."

**Disposition.** Kept. The count is observational on a visit-driven
celebratory page. It is not a streak, not an engagement metric, not a
comparison. The directive's anti-patterns ("no engagement metrics
surfaced", "no streaks") don't apply to this calm summary line on a
page the parent visited specifically for proud moments.

### 7.3 Continuity-gap markers leaking to parent

**Verified clean.** `assembleContinuityData` inserts "N-day gap in
sessions" continuity entries when sessions are >21d apart, but the
output is consumed only by Care therapist-side surfaces. Parent
surfaces filter to therapy items with `parent_visible_summary`
populated — gap markers don't reach them.

### 7.4 Reactions visible as counts to other parents

**Verified clean.** Proud moment reactions are stored per-parent and
visible only between the parent and the school staff. There is no
aggregate count rendered to parents. There is no "X parents reacted
to this." The reaction the parent sees is their own.

### 7.5 Care parent observations resurfacing to the writer

**Verified clean.** Parent observations in Care have an explicit
`cpo_parent_select_own` RLS policy — the parent reads only their own.
The directive's "no inbox" principle is honoured (the parent isn't
told "you wrote N observations this week").

### 7.6 Resonance / continuity-echo phrases drifting into staff surfaces

**Verified clean.** `useResonance` and `useContinuityEcho` are
localStorage-only. No server-side persistence; no propagation; no
staff visibility. The directive's "private reflection" pattern is in
place.

### 7.7 Children frozen into historical framing

**Mostly mitigated.** Phase 5B's 45-day freshness gate, Phase 5C's
succession-by-recency, and Phase 5B/5C documented rules (no resolved-
concern workflow, no recovery-arc framing) together prevent the
"child as a frozen concern" pattern. The remaining risk — `/parent/progress`
page surfacing a months-old "developing" rating without an age cue — is
documented as future work in CONTINUITY_FRESHNESS_AND_DECAY.md §7.3,
NOT addressed here.

### 7.8 Chart / graph infrastructure

**Verified clean.** No chart-library imports anywhere in `src/app/parent/`.
No graph rendering. No sparklines, trend lines, heat maps. The codebase
has resisted analytics infrastructure across all phases.

---

## 8. Implementation in this phase — remove one ranking pattern

The audit identifies one analytics-drift instance worth removing now:
the "Most celebrated: {category}" line on the `/parent/proud-moments`
"This Week" summary card. It picks ONE category from the child's
recent traits and labels it as the most — a leaderboard pattern even
when the verbiage is warm ("celebrated").

**Fix.** Remove the `topCategory` computation and the "Most celebrated"
sentence fragment from `src/app/parent/proud-moments/page.tsx`. The
weekly summary becomes:

> **This Week.** Sofia had 3 proud moments this week.

Calm observation. No ranking. No leaderboard. Count preserved because
it's not a metric — it's an observation on a page the parent visited
to celebrate.

**Why this is the right minimum.**

1. **Single-pattern surgical removal.** One conditional render block
   gone; one derived computation gone.
2. **Aligns with the directive's "ranking growth" anti-pattern.**
   "Most celebrated" is internal-category ranking. The Phase 4A
   "no leaderboards" rule applies across-children OR within-child-traits.
3. **Preserves the warm observation.** The count remains. "Sofia had 3
   proud moments this week" reads as a calm celebratory observation,
   not as a metric.
4. **No new types, no new queries, no new RPCs, no new RLS, no new UI
   components.** Reversal is a 5-line diff.
5. **The unused import `CATEGORY_COLORS`** previously referenced by the
   ranking pill can stay (other uses on the page); the removal is
   purely conditional render + derived value.

**Out of scope, intentionally.**

- Removing the count itself ("3 proud moments"). The count is a calm
  observation on a visit-driven page; the directive's "no engagement
  metrics" rule applies to push-driven home surfaces, not to
  intentional-visit pages.
- Adding an age-cue to `/parent/progress` page rows (a months-old
  "developing" rating without freshness indication). Documented as
  future work in CONTINUITY_FRESHNESS_AND_DECAY.md §7.3.
- Building a "Reflection" tab / "Memory book" surface.
- Building "anniversary" / "remember this" automatic resurfacing.
- Refactoring the proud-moments page layout.
- Removing CATEGORY_COLORS or other still-used utilities.
- Touching `useResonance` / `useContinuityEcho` (private reflection
  patterns already implemented correctly).
- Touching the recurring "Lately" strip (already correct — labels only,
  no counts).

---

## 9. Files inspected (Phase 5D)

**Learn**
- `src/app/parent/proud-moments/page.tsx` — the analytics-drift surface
- `src/app/parent/progress/page.tsx` — latest-per-category model
- `src/app/parent/updates/page.tsx` — depth-capped feed
- `src/app/parent/dashboard/page.tsx` — hero + Lately + featured proud moment + recent growth integration
- `src/features/parent-journey/helpers.ts` — recurring "Lately" already documents the no-count discipline
- `src/features/parent-journey/queries.ts` — `fetchRecurringMomentCategories` already documents the "label IS the message" rule
- `src/features/proud-moments/resonance.ts` — `useResonance` localStorage-only contract
- `src/features/parent-reflection/continuity-echo.ts` (referenced) — `useContinuityEcho` and `REFLECTION_MEMORY_THRESHOLD_MS`

**Care**
- `lib/api/continuity-api.ts` — confirmed `>21d gap` markers are
  therapist-side only; parent surfaces filter therapy items via
  `parent_visible_summary` populated
- `lib/api/voice-notes-api.ts` + migration 095 — confirmed parent
  observations RLS `cpo_parent_select_own` enforces "no resurface to
  writer"
- `lib/parent-attention/helpers.ts` — Care attention layer

---

## 10. Future reflection / memory work intentionally not started

- **Age cue on `/parent/progress` rows.** If the latest observation per
  category is >60d old, render "noted Nd ago" in muted text. Mentioned
  in CONTINUITY_FRESHNESS_AND_DECAY.md §7.3.
- **Memory of support-context history.** Versioned `support_context_history`
  table for staff audit timelines. Out of scope.
- **Visit-prep view aggregating across domains.** Anti-pattern unless
  explicitly justified.
- **"This Month" / "This Year" summary expansions on proud-moments.**
  Tempting but risk of metric drift; defer until clear value.
- **Voice-note replay history surface on Learn.** Currently Learn shows
  only the latest signal-eligible voice note; the full list is in Care.
  Cross-app linking via the Phase 3C `#voice-notes` anchor is
  sufficient.
- **Cumulative milestone view across school + Care.** Each has its own
  page; a unified one risks "your child's milestones dashboard."
- **Reflection prompts** ("would you like to look back at the last
  month?") — anti-pattern; no auto-resurface.
- **Annual review / yearbook PDF generator** — anti-pattern.
- **Surfacing parents' own observation history to themselves on Learn
  parent home.** The "no inbox" rule applies — the parent's own
  observations live in Care detail page; they don't return to Learn.
- **Three-way memory architecture when Med ships.** Generalises the
  current pattern (per-domain pages own memory).

---

## 11. Permanent reflection rules (codified)

1. The home is for now. The pages are for memory.
2. Memory is narrative, never numeric.
3. Visiting a page is the only "request to reflect" Lauris responds to.
4. The system never picks favourites — no "top moments," no "most celebrated category."
5. The system never compares — across children, across time-periods, against developmental norms.
6. The system never quantifies — no scores, no curves, no percentiles, no rates, no rankings.
7. The system never auto-resurfaces — no anniversaries, no nudges, no "remember this."
8. The system never generates narrative — no AI summaries, no auto-written progress reports.
9. The system never visualises with charts — proud moments are read, not graphed.
10. Reflection memory is private when private (echo phrases, parent observations); shared when shared (proud moments + reactions, milestones); never accidentally crossed.
