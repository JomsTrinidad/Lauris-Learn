# Continuity Renewal & Succession — Phase 5C

**Status.** Architectural normalization + one surgical succession rule.
Most renewal mechanics already exist in the system from prior phases; this
phase names them, identifies the one remaining cross-domain succession gap,
and adds a single "newer reinforcement leads" reading-order rule on the
parent home.

**Scope.** Defines how Lauris allows continuity to evolve gracefully —
how older support framing gives way to newer framing, how growth surfaces
without becoming a performance-tracking system, how positive momentum
persists without toxic positivity.

**Out of scope.** No "resolved" workflows. No achievement systems. No
behavioural grading. No scoring. No badges. No streaks. No progress
metrics. No recovery dashboards. No AI growth summaries. No "fixed"
states. No comparison framing. No new tables. No new RPCs. No background
jobs. No notification infrastructure. No deletion of any data ever.

---

## 1. The renewal question

A continuity system that only ACCUMULATES context turns into a problem-
memory system. A child's parent home reads as a permanent ledger of past
struggles. Phase 5B's freshness gate fixed the foreground-only fossilization
risk; this phase names *how* renewal happens across the architecture so
future surfaces (Med, additional reinforcement strips, new domains) don't
re-introduce the fossilization pattern in a different shape.

**The Lauris answer to renewal:** Time + Replacement, not Workflow. The
system never asks "is this concern resolved?" — workflow framing pressures
staff into binary judgements about an ongoing child. Instead, three quiet
renewal mechanics already in place cooperate:

- **Direct overwrite.** A staff member updates the support focus; the old
  framing is replaced. No archive. No version history. No "previous focus"
  drawer.
- **Time-based fade.** Phase 5B's 45-day freshness gate causes
  unrefreshed framings to silently disappear from the parent home. The DB
  row persists; the foregrounding fades.
- **Push-down by newer same-kind.** Progress observations show
  latest-per-category; older observations of the same category drop off
  the rendered surface naturally.

This phase adds one more mechanic: **newer reinforcement context leads
the reading order** when two domains' contexts exist with a meaningful
recency gap. See §8.

---

## 2. Current renewal / succession behaviour (observed)

### 2.1 Existing succession mechanics (verified in code)

| Entity | Succession mechanism | Constants / surface |
|---|---|---|
| `student_support_context` | UPSERT on `(student_id)` — overwrite | Replacement instantaneous |
| `care_support_context` | UPSERT on `(child_profile_id, clinic_organization_id)` — overwrite | Replacement instantaneous |
| Both support contexts on parent home | 45d freshness gate (Phase 5B) | `SUPPORT_CONTEXT_FRESHNESS_DAYS=45` in `queries.ts` |
| Progress observations on `/parent/progress` | Latest per category surfaced; older same-category naturally dominated | render-level dedup by category in `progress/page.tsx` |
| Hero items | Tier-based + per-tier cooldown | `HERO_PROUD_MOMENT_WINDOW_DAYS=2`, `HERO_THERAPY_WINDOW_DAYS=2`, `HERO_POSITIVE_OBSERVATION_WINDOW_DAYS=3` |
| Recurring "Lately" categories | 14d sliding window | `RECURRENCE_WINDOW_DAYS=14`, `RECURRENCE_THRESHOLD=2` |
| Voice notes | 7d signal window; Care detail surface persists | `VOICE_NOTE_SIGNAL_DAYS=7` |
| Featured proud moment | 7d featured window; cumulative on `/parent/proud-moments` | `HIGHLIGHT_FEATURED_WINDOW_DAYS=7` |
| Journey feed | Depth cap (15 on dashboard, 50 on `/parent/updates`) — newer items push older down | runtime arrays |
| Operational events (consent, doc request, billing) | Resolve to terminal state — succession by event, not time | DB state transitions |
| Attendance | Day-keyed — rolls over with calendar day | `attendance_records.date` |
| Proud moments | Cumulative only — never displaced | Memory class |

### 2.2 Where renewal already happens correctly

- **Concern → Calm:** when a teacher updates from "Difficulty with transitions" to "Transitioning more independently," the old line is gone instantly; the new line appears. No fanfare, no arrow, no "recovery!" celebration. The directive's "no dramatic recovery arcs" rule is honoured by the simplest possible mechanism (overwrite).
- **Fresh hero, no echo:** the hero rotates daily via cooldown; a Monday concern doesn't keep declaring itself on Friday. Tier F neutral default is a valid hero state.
- **Lately strip self-resets:** if a category stops occurring, the 14d window slides past it; the chip disappears without comment.
- **Resolved billing disappears:** paid bills drop out of the priority surface; no "complete!" badge.

### 2.3 The remaining cross-domain succession gap

When **both** support-context lines exist on the parent home (school + therapy, post-Phase 5A), they always render in static order: school first, therapy second.

This is correct as a default — Learn is the school-anchored unified parent home.

But when the relative recency gap is large, the static order foregrounds older framing:

- **Scenario.** School support context was set 40 days ago: "Practicing waiting turns at circle time." Care support context was set 2 days ago: "Showing more confidence during group activities."
- **Current rendering.** School line first ("From Maria · updated 40d ago"), then Care line ("From your therapist · updated 2d ago").
- **Cognitive read.** The parent sees the 40-day-old framing as the leading "current focus" before reading the fresher one below. The older framing dominates by position; the newer framing reads as supplementary.
- **Renewal failure.** The Phase 5B gate eventually drops the school line at 45d. But during the intervening 5 days, the renewal is invisible to the parent — they keep reading "Practicing waiting turns" as the primary frame.

This is the succession gap. **The fix in §8 lets the newer context lead when the gap is meaningful** (≥14 days; one full Care signal-window's worth of staleness on the older side).

---

## 3. Renewal taxonomy

The directive proposed seven classes. Mapped onto code state, **six** are
load-bearing.

| Class | Visibility | Hero | Signal | Reinforcement strip | Persistence | Resurfacing | Emotional framing |
|---|---|---|---|---|---|---|---|
| **Active Support** | front-stage | yes (its tier) | yes | yes | rolling current | within window | present voice |
| **Emerging Progress** | front-stage | yes (Tier D40, ≤3d, positive observation; Tier D30 proud moment) | optional | indirect | 7d featured / 14d "Lately" / 3d hero | within window | warm observational |
| **Stable Reinforcement** | front-stage (continuing support context within freshness) | maybe (depending on tier) | no | yes | until replaced or aged | n/a | calm continuity |
| **Positive Momentum** | front-stage | yes (proud moment + observation tiers) | optional | yes (latest progress observation per category) | per surface window | within window | celebratory but observational |
| **Milestone Growth** | per-domain memory pages | no | no | no | permanent | none proactive | identity / memory |
| **Historical Concern** | per-domain pages (`/parent/progress` history, `/parent/updates`) — never proactive on home | no | no | no | DB persists; not foregrounded | never proactive | observational past tense |
| **Quietly Replaced** | parent home stops foregrounding; data persists | no | no | no | DB row preserved | none | invisible to parent |

**Quietly Replaced ≠ Deleted.** A support context that has been
overwritten by a newer one or has aged past the freshness gate is still
in the DB. Staff admin / future history surfaces can still query it.
The parent home simply stops featuring it as current.

### 3.1 Class assignment for renewal-relevant entities

| Entity | Class today | After this phase |
|---|---|---|
| Fresh support context | Active Support | unchanged |
| Stale support context (≥45d old) | Quietly Replaced (since Phase 5B) | unchanged |
| Older-but-still-in-window support context paired with much-newer counterpart | Active Support (but reading-order static) | **Stable Reinforcement** (reading-order yields to newer counterpart) |
| Proud moment | Positive Momentum → Milestone Growth | unchanged |
| Progress observation (consistent/advanced rating) | Positive Momentum (via fallback highlight) | unchanged |
| Operational concern (resolved) | Quietly Replaced | unchanged |
| Therapy session summary | Positive Momentum (when fresh) → Historical Concern (when push-down) | unchanged |
| Voice note | Active Support (signal layer) → Historical Concern (past window) | unchanged |

---

## 4. Continuity succession rules

### 4.1 Succession by direct overwrite (existing)

A staff member writes a new support focus → the old is gone instantly.
This is the **primary** renewal mechanism. It is intentionally simple:
no "are you sure?" prompt, no archive copy, no audit trail surfaced to
the parent. The parent reads the truth as the school / therapist
currently frames it.

**Anti-patterns avoided:**
- No "previous focus" expandable. The parent's mental model is "this is
  what we're working on now" — past framings are not load-bearing.
- No version history sidebar. If staff need history, that's an admin
  feature (out of scope).
- No "context change!" notification. The new line just appears.

### 4.2 Succession by time-based fade (Phase 5B)

After 45 days without refresh, support context fades from the parent
home. This handles the case where staff set a focus and never updated
it — the system doesn't keep declaring it current beyond reasonable
freshness.

### 4.3 Succession by reading order — newer leads (Phase 5C §8)

When two reinforcement lines exist (school + Care), the meaningfully-newer
one reads first. Threshold: **14 days**. Below that, default school-first
order applies.

**Why 14 days.**
- Longer than Care's own signal window (14d) — the older side has been
  stale for at least one Care-signal-cycle while the newer side has been
  refreshed.
- Short enough to trigger before the 45d freshness gate kicks in.
- Long enough that minor write-order variance (school updated Monday,
  Care updated Wednesday) doesn't constantly flip the order — calm
  cadence is preserved.

**Why directional asymmetry.**
- Default keeps school first (the Learn parent home is school-anchored).
- Care leads ONLY when meaningfully newer. The reverse case (school newer
  than Care by 14+d) is the default direction anyway — no flip needed.

### 4.4 Succession by push-down (existing)

For progress observations, the latest per category is what's shown on
`/parent/progress`. A newer "consistent" rating in "Independence"
naturally displaces an older "developing" rating in the same category.
Older observations remain queryable through scroll / pagination on the
page itself; the dashboard's "Recent Growth" fallback always picks the
fresh positive one.

### 4.5 No succession for milestones

Proud moments and `care_milestones` are Memory class. They accumulate.
New ones do not displace old ones. A child's "First independent toilet
visit" milestone from age 3 remains forever, alongside their "First
sentence" milestone from age 18 months. Memory is cumulative; concern
framing is rolling. Different decay classes; different rules.

### 4.6 Contradictory old/new contexts coexist; system does not synthesise

The system never says "the new focus replaces the old one." It just
renders the new one and lets the old one fade by overwrite, gate, or
push-down. Two contexts that read as contradictory (e.g., 10d-old "Working
on transitions" + 2d-old "Transitioning more independently") both appear.
The parent reads both. Lauris does not editorialise. Lauris does not
claim resolution.

---

## 5. Positive continuity principles

### 5.1 Growth surfacing rules

- **Observational, not evaluative.** "Doing well in kindness" is fine.
  "Best at kindness" is ranking. "Most improved in kindness" is metric.
- **Earned warmth.** Hero D30 (proud moment) uses celebratory phrasing.
  Hero D40 ("showing growth in {category}") is observational.
- **Persistence of memory, ephemerality of foregrounding.** Proud moments
  live forever on their dedicated page; they only own the dashboard for
  short windows. The cadence prevents stale celebration.
- **No achievement framing.** No "Sofia earned X this week." Proud moments
  are noted, not awarded.
- **No comparison.** No "doing better than last month." No "top trait."
- **No "fixed" / "resolved."** A child who is transitioning more
  independently this month is not a child whose "transition issue is
  resolved." The new context doesn't deny the old one ever existed.

### 5.2 Anti-patterns forbidden

- **Achievement systems.** Badges, points, levels.
- **Grading.** Stars, scores, marks.
- **Normalization framing.** "Now within typical range." The system does
  not know typical; it does not measure deviation; it does not
  pronounce normalisation.
- **Comparison framing.** "Doing better than peers / classmates / other
  children at the clinic." Never.
- **Pressure-based positivity.** "You should be proud!" Never.
- **Success metrics.** "Improvement rate," "growth velocity," "recovery
  percentage." Never.
- **Recovery arcs.** "From struggling to thriving in 6 weeks." Never.
- **AI growth summaries.** No machine-written progress narratives.
- **Toxic positivity.** Pretending challenges never existed; reframing
  every concern as growth opportunity.
- **Performance dashboards.** No "your child's progress dashboard."
- **Resolved-issue workflows.** No "mark resolved" button. No "close
  this concern." No status states like "Open / Resolved."
- **Streaks of positive moments.** Memory is cumulative; cadence is
  individual.

### 5.3 What positive continuity SHOULD do

- **Persist quietly.** Proud moments and milestones never go away.
- **Surface during natural reading.** When the parent opens the home, a
  recent moment surfaces if within window; otherwise the page is quiet.
  Quiet days are part of the cadence.
- **Frame in past-with-warmth, not future-with-pressure.** "Sofia stayed
  focused during class." NOT: "Sofia is on a focus streak. Keep going!"
- **Trust the parent to celebrate or not.** Reaction picks are optional;
  there is no "react to this moment" obligation.
- **Replace concern context by overwriting, not by celebrating.** Renewal
  is "the focus has been updated to X," not "We did it! Old focus
  resolved!"

---

## 6. Concern replacement rules

### 6.1 When old concern framing should disappear from parent home

1. When a fresh context overwrites it (UPSERT).
2. When 45 days pass without refresh (Phase 5B freshness gate).
3. When a newer reinforcement context from another domain leads the
   reading order by ≥14 days (Phase 5C §8 — the line still renders, but
   no longer leads).

### 6.2 When old concern framing should remain accessible only

- The DB row persists across all three succession mechanisms above. Staff
  admin surfaces (when built) can still query it.
- The parent home does not surface it after expiration / replacement.
- No "history" link is exposed to the parent. The parent's continuity is
  forward-looking.

### 6.3 How contradictory old/new support context behaves

- Both render when both are within the freshness window.
- Reading order goes to the newer one when the gap is ≥14 days (§4.3).
- Otherwise, school first / Care second (Learn parent home is school-anchored).
- Neither is suppressed by the other. Neither is reconciled.
- The parent reads both. The school's and therapist's framings stand
  independently.

### 6.4 What never crosses the line into "concern replacement workflow"

- No "resolve" verb anywhere in the UI.
- No "close concern" action.
- No "concern history" page.
- No "this concern has been addressed" notice.
- No "concerns over time" timeline.
- No "outstanding concerns" count.

---

## 7. Cross-domain succession findings

### 7.1 School ↔ Care reinforcement reading order

| State | Before this phase | After this phase |
|---|---|---|
| Only school context | school renders | unchanged |
| Only Care context | Care renders | unchanged |
| Both, ≤14d apart | school first, Care second | unchanged (school still first) |
| Both, Care newer by 14+d | school first, Care second (static) | **Care first, school second** |
| Both, school newer by 14+d | school first, Care second | unchanged (already correct direction) |
| Both stale (≥45d) | both hidden (Phase 5B) | unchanged |
| Both fresh, near-simultaneous updates | school first | unchanged (default school-anchor preserved) |

### 7.2 Future Med inherits the same succession pattern

When Lauris Med ships:
- Med reinforcement enters the parent home as a third line.
- The reading-order rule generalises: any domain that is meaningfully
  newer than the others leads.
- With three lines, the rule still applies pairwise: lines sort by
  `updated_at` descending if the gap to the next-newest exceeds 14d;
  otherwise, default order (school → Care → Med) preserves a
  stable home-anchored sequence.
- This phase does not pre-build that 3-way logic. The §8 implementation
  is school ↔ Care only; Med's slot inherits the architecture when shipped.

### 7.3 Care side reading order unchanged

The Care `/parent/[childId]` page renders its own support-focus card
unconditionally. That card represents Care's own framing of the child
inside Care's domain page; succession order is not meaningful there
(there's only one context). The Phase 5C order rule applies only to
the unified Learn parent home where multiple reinforcement lines stack.

### 7.4 Renewal does not cascade

- A succession-by-recency on the school line does not trigger anything
  on the Care side.
- A fresh Care write does not modify, mute, or annotate the school line.
- Each domain's reinforcement remains independent. The reading order is
  a presentation-layer decision, not a data-layer relationship.

---

## 8. Implementation in this phase — one succession-by-recency rule

The audit identifies one defensible succession gap: when both support
context lines render on the parent home, static "school first" ordering
foregrounds older framing in the 5-day window before the Phase 5B
freshness gate kicks in (or longer, if both contexts remain within the
45d window with a large gap).

**Fix.** In `src/app/parent/dashboard/page.tsx`, compute a `careLeadsByRecency`
boolean: `true` when both contexts exist AND Care's `updatedAt` is at
least 14 days newer than the school's `updatedAt`. When true, render
the Care line first and the school line second. Otherwise, preserve the
current school-first / Care-second order.

Single conditional render block. ~10 lines including comments.

**Why this is the right minimum.**

1. **Pure presentation layer.** Zero data changes, zero schema changes,
   zero new queries, zero new RPCs, zero RLS changes.
2. **Default preserved.** When the gap is <14d (the common case), the
   parent's familiar order is unchanged. The flip happens only when the
   gap is meaningful.
3. **Directional asymmetry preserved.** The reverse case (school newer
   than Care) is already the default direction — no flip needed.
4. **Aligns with the directive's "newer reinforcement supersedes older
   framing"** in a way that respects all anti-patterns: no celebration,
   no arrow, no annotation, no "concern resolved" framing, no recovery
   arc. The newer line just reads first.
5. **Phase 5B compatible.** A 50d-old school context paired with a fresh
   Care context: the school line is already hidden by the freshness
   gate; only Care renders, no reorder needed. A 40d-old school context
   paired with a 2d-old Care context: both render, Care leads. A 5d-old
   school context paired with a 2d-old Care context: both render, school
   leads (within 14d window).
6. **Easily revertible.** Three lines, three deletions.

**Out of scope, intentionally.**

- 3-way ordering when Med ships (Med not shipped).
- Visual decoration of the "leading" line (no badge, no arrow, no
  "current" tag — that would be a "newest" UI marker which approaches
  the forbidden achievement framing).
- Suppression of the older line when the newer leads (the older still
  renders second; Phase 5B handles its eventual fade).
- Render-layer aging-opacity ramp (the older line uses the same opacity
  it always did until it hits the freshness gate).
- Staff-side "your context has aged" prompt (different surface, different
  repo).
- Changes to `/parent/progress` (already handles renewal via latest-per-
  category push-down).
- A unified Reinforcement strip across school + therapy + medical (the
  convergence target — Phase 3C §5.3; still premature, awaits Med).
- Any concept of "growth events" / "improvement events" — anti-pattern.
- Any "the focus has been updated" notification — anti-pattern (no
  notification infrastructure exists, and shouldn't).

---

## 9. Files inspected (Phase 5C)

**Learn**
- `src/app/parent/dashboard/page.tsx` — `SupportContextBlock` + `CareSupportContextBlock` placement (Phase 5A); the render order is the focus of the §8 fix
- `src/features/parent-journey/queries.ts` — Phase 5B freshness gate + `SchoolSupportContext` / `CareSupportContext` shapes (both carry `updatedAt`)
- `src/features/parent-journey/helpers.ts` — hero tier cooldowns, recurring window, all existing renewal mechanics
- `src/app/parent/proud-moments/page.tsx` — Memory class behaviour verified
- `src/app/parent/progress/page.tsx` — latest-per-category push-down verified
- `src/app/parent/updates/page.tsx` — depth cap verified

**Care**
- `lib/api/support-context-api.ts` — UPSERT replacement pattern confirmed
- `lib/parent-attention/helpers.ts` — Care attention windows (no succession at Care surface; out of scope)
- `lib/api/continuity-api.ts` — Care continuity (Memory + Journey Event handling; no parent-facing renewal feature)
- Migration 094 — RLS / parent-visibility confirmation

---

## 10. Future renewal work intentionally not started

- **Care detail page render order** when Care has multiple clinic
  contexts (out of scope; only relevant when a child has two clinics —
  documented future work in CROSS_DOMAIN_HANDOFF.md too).
- **Aging-opacity ramp on the older reinforcement line** (gradual visual
  decay). Current behaviour is binary at the §8 reorder boundary and at
  the Phase 5B 45d fade boundary — both binary thresholds. Opacity ramps
  add complexity for marginal calm benefit.
- **Staff-side "support focus has aged" admin nudge** (Phase 5B §11
  follow-up).
- **Versioned support context history** for staff audit timelines
  (out of scope — requires schema change).
- **Three-way reinforcement reading order** when Med ships (extends the
  §8 logic pairwise).
- **A "recently refreshed" muted tag** on the leading line ("Updated 2d
  ago"). Already there as the existing attribution sub-line — no
  duplication needed.
- **Progress observation age display** on `/parent/progress`
  (CONTINUITY_FRESHNESS_AND_DECAY.md §7.3 — different surface).
- **Therapy session summary "old session" fade** beyond the journey
  depth cap (already handled by the cap).
- **Surfacing milestone counts / growth tallies** — anti-pattern;
  forbidden by §5.2.

---

## 11. Future cross-domain renewal patterns flagged

- When Care ships its own support-focus-card freshness gate (Phase 5B
  §11 follow-up), the Care detail surface stops foregrounding stale
  focus too. Combined with this phase's §8 reorder, the Learn parent
  home + Care detail page both consistently foreground the freshest
  framing.
- When Lauris Med ships, the §8 pattern generalises to a three-way
  pairwise comparison. Implementing in advance is premature.
- Future "succession-by-replacement" semantics for parent observations
  (if a parent writes multiple observations on the same theme in one
  week, do older ones quietly subside?). Out of scope; observations
  today live in Care detail page as chronological list; no foregrounding
  on parent home exists.
