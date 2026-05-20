# Parent Cognitive Rhythm — Phase 4A

**Status:** architectural normalization. Not a redesign. Implementation in this
phase is limited to one surgical quietness guardrail (see §8).

**Scope.** Phase 3A defined the parent boundary, 3B added the cross-domain
signal layer, 3C aligned continuity semantics. The fragmentation problem is
no longer the dominant risk. The dominant risk now is **continuity overload**:
multiple meaningful surfaces firing simultaneously, all calm individually, but
emotionally heavy in aggregate. This phase defines the **cadence and quiet
periods** so Learn / Care / Med converge without parents experiencing fatigue.

**Out of scope.** No notifications. No streaks. No engagement loops. No
unread counts. No personalization engines. No AI prioritization. No infinite
feeds. No "X new since you last visited" pressure. No dashboard rewrite. No
new tables. No real-time.

---

## 1. What "rhythm" means here

A parent's cognitive rhythm on the Lauris Parent home has three time scales:

| Scale | Span | Cognitive job |
|---|---|---|
| **Daily** | hours → end of day | "What do I need to know right now?" |
| **Weekly** | a few days → 1 week | "What's been going on this week?" |
| **Longitudinal** | months → years | "Who is my child becoming?" |

The current code already implements these as separate surfaces with
overlapping windows. Phase 4A names the rhythm classes so future work can be
placed on the right surface without re-deriving the rules each time.

---

## 2. Continuity cadence model

The directive proposed seven cadence classes. After mapping them onto the
current implementation, six are load-bearing. *Immediate* and *Today* fold
into a single Daily class because the codebase already treats "happening
right now" and "happening today" as one tier (Tier A acute + Tier B today-
scheduled in the hero, plus P25/P30/P31 in priority cards). Re-splitting
them would introduce a distinction the UI never honors.

### 2.1 Cadence classes (final)

| Class | Window | Surfaces | Hero | Signal | Feed | Decay rule |
|---|---|---|---|---|---|---|
| **Daily** | ≤24h (acute + today-scheduled) | hero Tier A/B, priority P25/P30/P31, drawer "Today for X" | yes (Tier A/B) | yes (P25–P31) | no (operational not in journey) | day-of: resolves or rolls over |
| **Active Reinforcement** | rolling current | Care support-focus card; Learn support-context line; active home activities | no (Tier D-class only when fresh) | low (≤14d) | no (context, not event) | replaced by next current value |
| **This Week** | 3–7d | hero Tier D30/D35/D40 + Phase-3B voice-note P35 + journey-group "Earlier this week" + featured proud moment | yes (Tier D, with cooldown 2/2/3d) | yes (P35 voice note ≤7d) | yes (Earlier this week group) | hero cooldown shorter than surface window |
| **Recent Journey** | feed depth, not age | journey feed rows, `/parent/updates`, `/parent/progress` latest-per-category | no | no | yes | pushed down by newer items, never aged out |
| **Long-Term Memory** | months → years | `/parent/proud-moments` history, `/parent/progress` history, milestones, weekly proud-moment summary | no | no | per-domain page | never decays; ordering only |
| **Archive** | indefinite | per-domain page browsing, historical search | no | no | no (page-internal only) | passive — search/scroll surfaces it on demand |

### 2.2 Eligibility matrix

For each cadence class:

| Class | Hero-eligible | Signal-eligible | Feed-eligible | Reflection-eligible | Notification-eligible |
|---|---|---|---|---|---|
| Daily | yes | yes | no | no | **no** (never) |
| Active Reinforcement | partial (Tier D when fresh) | low | no | partial | no |
| This Week | yes (cooldown) | yes (≤7d) | yes (group "Earlier this week") | yes | no |
| Recent Journey | no | no | yes | yes (per-domain) | no |
| Long-Term Memory | no | no | per-domain page | yes (annual review concept) | no |
| Archive | no | no | no | searchable | no |

"Notification-eligible" is always **no** by design — Lauris Parent does not
emit notifications. The parent visits when they choose; the home re-organises
to match the moment of visit.

### 2.3 Cooldown semantics already in place

The Phase-5 hero cooldowns (`HERO_PROUD_MOMENT_WINDOW_DAYS = 2`,
`HERO_THERAPY_WINDOW_DAYS = 2`,
`HERO_POSITIVE_OBSERVATION_WINDOW_DAYS = 3`) are explicit
quiet-cadence guardrails:

- Hero ROTATES across days. A meaningful Monday moment doesn't keep
  declaring itself on Friday; the page reads as "meaningful day / ordinary
  day / quiet day" rather than "always meaningful."
- Surface windows are LONGER than hero windows (proud moment 7d feed vs 2d
  hero; therapy 3d journey vs 2d hero; observation 7d page vs 3d hero) so
  things don't *vanish*, just stop *shouting*.
- Tier F "calm default" exists. The hero is allowed to be quiet.

These are the kind of rhythm rules Phase 4A wants to PRESERVE and *extend by
naming*, not replace.

---

## 3. Current cadence patterns observed

### 3.1 Hero — well-paced

Tier A → F chain in `getChildStatusHeadline` already implements
acute-then-cooldown rhythm. Tier F neutral state is the calm-by-default
posture. No fixes needed in this phase.

### 3.2 Priority signals — 2-card cap, mostly clean

`getFeaturedParentCards` caps at 2. The 9-tier ordering (P10 consent → P20
doc request → P25 meeting tomorrow → P30 meeting today → P31 online class
today → P35 voice note → P40 upcoming → P50 billing → P60 second event →
P70 holiday) is well-tuned. Phase 3B added the cross-domain signals; Phase 3C
fixed the deep-link landing.

**One residual fatigue risk** (see §5.1 and §8): two `urgent_action` cards
(consent + doc request) currently render with **twin amber containers** in
`OperationalRow`, because the urgent treatment is driven by `cardType`, not
by stacking order. This is the only concrete cadence inconsistency justifying
implementation in this phase.

### 3.3 Continuity signals strip — quiet-aware

`getContinuitySignals` caps at `SIGNAL_CAP = 3`, emits at most one
`domain_quiet` signal, and uses softened wording ("quieter recently," not
"nothing happening"). Recurring-categories strip is observational, not
ranked.

### 3.4 Recurring proud-moment "Lately" strip — observational by design

`fetchRecurringMomentCategories` returns up to 3 category names; threshold
is 2 occurrences in 14 days; explicitly returns **only category names**, no
counts, no percentages. The "label IS the message" rule in the helper's
docstring is exactly the quiet-UX posture we want everywhere.

### 3.5 Featured proud moment card — 7d visibility

`HIGHLIGHT_FEATURED_WINDOW_DAYS = 7` for the surface (card stays visible),
2d hero cooldown for the headline. Reactions are persisted but never trigger
a count.

### 3.6 Feed grouping — calendar-week, not rolling 7-day

`groupFeedByRecency` uses Monday-start calendar buckets ("Today" /
"Earlier this week" / "Older"). Group labels only render when ≥2 groups
have items. This is a calm Weekly cadence already; no fixes needed.

### 3.7 Family drawer "Today for X" — calm by absence

When attendance is already marked, the section hides entirely. When absence
is reported, it shows a single calm confirmation row. No retries, no
"undo," no escalation language.

### 3.8 Care attention strip — symmetric to Learn

Care's `getCareAttentionCards` caps at 2; cooldown windows of 14d / 7d / 3d
match the rhythm intent. `consumedAttentionId` deduplicates hero ↔ strip
inside one app.

### 3.9 Care continuity-api — operational items excluded

`care_session_events` (button-press telemetry) and cancelled/no-show
sessions are explicitly excluded from the continuity feed.

---

## 4. Surface rhythm recommendations

For each parent surface, the recommended emotional purpose, intended cadence,
cognitive-load cap, and forbidden material.

### Hero (top-of-page sentence)
- **Emotional purpose:** Anchor today's most relevant message. One sentence.
- **Cadence:** Tier A (acute today) > Tier B (scheduled today) > Tier C (≤4h fresh present) > Tier D (≤2/2/3d cooldown) > Tier E (background continuity) > Tier F (calm default).
- **Max load:** 1 entity, 1 headline, 1 detail line.
- **Never:** counts, "X new", stacked subtitles, multi-entity headlines, identity-only statements ("Your child's journey"), product names ("Lauris Learn says…").
- **Decay:** rotates daily via cooldown; quiet days are PART of the design.
- **Persistence:** none. The hero is for now, not for memory.

### Priority signals ("Coming up" / Care attention strip)
- **Emotional purpose:** Up to two short attention nudges. Calm, actionable.
- **Cadence:** Daily for operational items (consent / doc request / meeting / billing); This Week for voice notes (≤7d).
- **Max load:** 2 cards. **At most 1 amber-tinted card.** (Implementation guardrail in §8.)
- **Never:** count badges, "unread", "X waiting", "overdue!", red text, emoji escalation, second-hand reminders ("don't forget…"), stacked urgents with same color treatment.
- **Decay:** signal-eligible window (operational: resolution; signal: 7d).
- **Persistence:** none. The card lives at most for its cadence window.

### Reinforcement strip (Care support-focus card / Learn ambient context line)
- **Emotional purpose:** One quiet line per domain. "What is shaping this week."
- **Cadence:** Active Reinforcement — rolling current, replaced not aged.
- **Max load:** 1 line per domain (school / therapy / future medical).
- **Never:** call-to-action verbs ("Try this!"), urgency framing, completion percentages, dates as pressure, count-of-items, multiple stacked focuses per domain.
- **Decay:** replaced by next current value; previous focus disappears quietly.
- **Persistence:** only the current value is surfaced; history lives in domain detail.

### Journey feed
- **Emotional purpose:** "What's been happening." Chronology IS the meaning.
- **Cadence:** Recent Journey — capped by depth (15 items), not by age.
- **Max load:** scroll-paced; no per-row decoration that demands action.
- **Never:** "Important!" pills, ranking by importance (only by time + domain filter), reaction prompts, suggestion overlays, AI-generated summaries inline.
- **Decay:** pushed down by newer items, never aged out within the cap.
- **Persistence:** archival via per-domain pages.

### `/parent/proud-moments`
- **Emotional purpose:** Long-Term Memory. Identity-of-the-child surface.
- **Cadence:** Longitudinal — list of all moments, newest first.
- **Max load:** unbounded scroll OK because the parent VISITS this page intentionally.
- **Never:** weekly leaderboards, category ranking, "most celebrated trait" pressure, comparative framing across children (the "This Week" summary is acceptable because it summarises WITHIN the visited child only).
- **Decay:** never. Proud moments are memory.
- **Persistence:** permanent. Reactions persist with the moment.

### `/parent/progress`
- **Emotional purpose:** Latest-per-category snapshot of where the child stands.
- **Cadence:** Active Reinforcement (current rating per category) + Long-Term Memory (older observations are archival via the page's natural pagination).
- **Max load:** one row per category, latest only.
- **Never:** trend arrows, week-over-week deltas, rating drop alerts, "regression detected" language. Rating is observation, not score.
- **Decay:** older observations of the same category disappear quietly (only latest is shown).

### `/parent/updates`
- **Emotional purpose:** Recent Journey of school posts.
- **Cadence:** Recent Journey + Long-Term Memory (cap at 50 historically).
- **Max load:** reverse-chronological feed; cards expand on demand.
- **Never:** "X unread", read/unread tracking, like/heart prompts, share-out CTAs.

### `/parent/events`
- **Emotional purpose:** Daily + This Week — upcoming schedule.
- **Cadence:** Daily (today/tomorrow) + This Week (upcoming) + Archive (past).
- **Max load:** vertical list, no overlay banners.
- **Never:** countdown timers, "deadline approaching!" amber bars, RSVP escalation prompts.

### Therapy detail (Care `/parent/[childId]`)
- **Emotional purpose:** Therapy continuity hub. Care's hero / strip already paced.
- **Cadence:** Daily + This Week + Recent Journey, all inside one page because the parent VISITED Care to dig into therapy.
- **Max load:** vertical scroll; hero ↔ strip dedup already enforced via `consumedAttentionId`.
- **Never:** clinical jargon, raw chart data, internal therapist notes.

### Future Lauris Med integration
- **Emotional purpose:** Medical continuity, NOT medical-record portal.
- **Cadence:** likely similar to Care — appointment-based, no "today" concept on its own surface, but emits Signals into the Learn parent home when relevant (next vaccine, recent visit summary parent-safe, allergy alert as Operational).
- **Pre-allocated:** `ParentJourneyItem.sourceCategory: "medical"` is already reserved in Learn types.
- **Never** (when it ships): risk-scoring UI for parents, longitudinal symptom dashboards, "concerning trend" surfaces, AI medical interpretation in the parent home.

---

## 5. Emotional fatigue risks identified

### 5.1 Twin amber treatment when both urgent_action cards fire

**Risk.** `OperationalRow` derives its amber container from
`cardType === "urgent_action"`. When both P10 consent + P20 doc-request
fire, BOTH cards render with amber borders + amber-tinted backgrounds.
Combined with a potentially amber hero (Tier A "absent today"), the page
can present 3 amber strips in one scroll. This is the directive's
"too many 'needs attention' states" anti-pattern.

**Disposition:** fix in this phase (§8). At most one priority-card row
carries the amber container treatment at a time. Second urgent demotes to
neutral container while keeping its semantics + position. The information
isn't hidden; it's tonally reduced.

### 5.2 Same-fact stacking across hero + signal + feed

**Risk.** A recent therapy session appears on:
- Learn hero Tier D35 (≤2d)
- Learn journey feed row
- Care hero (P30 sparkle)
- Care attention strip (when not consumed by hero)
- Care journey feed

**Disposition:** Phase 3C documented this; cross-app stacking is acceptable
(each app's hero is independent). Within-app dedup is enforced by
`consumedHighlightId` / `consumedAttentionId`. The recommendation stands:
do NOT add a same-session priority card to Learn — Phase 3B respected this.

### 5.3 Concurrent school + therapy concern

**Risk.** A parent could see "Sofia is absent today" (hero Tier A) + a
support-focus card ("working on transitions") + a therapy summary mentioning
the same behaviour. Three surfaces all about a fragile moment.

**Disposition:** the support-focus card is Reinforcement Context (always
visible), the therapy summary is a Journey Event (chronological), and the
absence is Operational. They are each in their correct surface; combined
weight is real but they are not duplicating. Suppressing one would distort
truth. No fix this phase. Future Med work should respect that the
**Reinforcement strip is capped at one line per domain** so the stack
doesn't grow with each new domain.

### 5.4 Recurring "Lately" strip + featured proud moment + Recent Growth card

**Risk.** All three can fire together when the parent has 2+ recent
moments in the same category. The page reads as celebrating the same thing
in three voices.

**Disposition:** the helper already dedups within-app:
- `consumedHighlightId` suppresses the featured card's heading line when the hero promoted it.
- `consumedFallback` suppresses the Recent Growth card entirely when the hero promoted the fallback observation.
- The "Lately" strip is observational only ("Kindness, Effort") with no count, so it doesn't echo the same MOMENT, only the CATEGORY.

These are functioning dedup contracts. No fix this phase. Document that the
"label IS the message" rule for the recurring strip MUST be preserved — adding
counts later would re-introduce the fatigue this currently prevents.

### 5.5 Cross-app duplicate when arriving from a Learn signal

**Risk.** Tap voice-note priority card in Learn → land at Care page root →
see Care hero + Care strip both echoing the same voice note before
reaching the playback section.

**Disposition:** fixed in Phase 3C by anchoring the deep-link at
`#voice-notes`. Documented in `PARENT_CONTINUITY_SEMANTICS.md` §7.

### 5.6 First-visit lookback creating cascade tints

**Risk.** A parent who hasn't visited in 24h could see every feed row
tinted as "fresh" (the `FIRST_VISIT_LOOKBACK_HOURS = 24` default).

**Disposition:** already capped by `FRESH_WINDOW_HOURS = 72` and computed
once-per-mount (`freshComputedRef` lock). The cap means a 2-week-absent
parent doesn't see 14 days of tinted rows. Acceptable behaviour.

---

## 6. Quiet UX rules (anti-patterns)

These are the rules Lauris Parent should follow forever. They're codified
here so future contributors don't need to re-derive them.

### 6.1 Forbidden patterns

- **No unread counts.** Anywhere. Not on the bell. Not on the bottom-nav. Not on cards. The page re-organises on visit; it doesn't track.
- **No "X new since you last visited."** The fresh-item tint is a soft cue; it doesn't translate to a number.
- **No "X things need attention" header.** The priority section is capped at 2 because 2 is calm. Counting them defeats the cap.
- **No streaks.** Not for posting, not for reading, not for reactions, not for attendance.
- **No engagement metrics surfaced to the parent.** Time-spent, frequency-of-visit, response-rates — none of these get surfaced as UI.
- **No "missed update" / "missed session" language.** A parent who didn't open the app yesterday hasn't *failed*; they were busy.
- **No productivity framing.** "Tasks," "to-do," "completed today" belong in operations apps, not in a parent's emotional continuity home.
- **No leaderboards.** No comparisons across children. No "compared to other parents."
- **No reaction obligations.** The parent CAN react to a proud moment; they don't OWE one. No "you haven't reacted to Sofia's moments this week" prompts. Ever.
- **No gamification.** No points, levels, badges, progress bars (except observational rating display), achievements, "completion," confetti, congratulatory copy beyond what a real-world reasonable person would say.
- **No dopamine loops.** No randomized rewards. No surprise mechanics. No pull-to-refresh-and-discover.
- **No anxiety amplification.** No red banners. No flashing. No "URGENT." No skull / alarm iconography. No countdown timers. No "deadline missed!"
- **No "you missed N updates."** Updates aren't messages waiting to be opened — they're a record of the week.
- **No infinite scroll on the home page.** Capped feeds, capped signals, capped cards. Detail pages can be longer because they're visited intentionally.
- **No engagement-based ranking.** Cards are ranked by emotional + operational relevance to THIS parent, not by what the platform wants amplified.
- **No "people loved this!"** Reactions on proud moments are between the parent and the school, not a public count.
- **No notification escalation.** Lauris Parent emits zero push, zero email, zero SMS by default. If they ship someday, they emit exactly once per signal, never re-emit.
- **No A/B test surfaces shown to parents.** The parent home is not an experimentation surface.
- **No social presence indicators.** No "teacher is typing." No "online now."

### 6.2 Voice patterns to keep

- **"label IS the message."** When a chip or card title says enough, the card needs no count, no extra context, no decoration.
- **"calm by absence."** Empty states are valid. An empty priority section means there is nothing to act on — not "all caught up!" (which is productivity language).
- **"observation, not conclusion."** "Doing well in kindness" is fine. "Best at kindness" is ranking. "Improving most in kindness" is metric.
- **"earned color."** Amber containers are reserved for actually-urgent items. Their value comes from being rare.
- **"calm cadence."** Hero rotates. Quiet days happen. The same item doesn't shout twice.

### 6.3 Implementation discipline

When tempted to add a count, ask: "would removing this count weaken the
message?" If no — remove it. Counts are usually noise.

When tempted to add a CTA, ask: "would the parent want this prompt if they
were tired tonight?" If no — remove it.

When tempted to add resurfacing logic, ask: "is the item itself worth
returning to, or are we re-renting the parent's attention?" If the latter
— don't add it.

When tempted to add color, ask: "what's the calmest color that still
carries the meaning?" Usually that's `text-muted-foreground`.

---

## 7. Future cadence work intentionally not started here

Out of scope for Phase 4A. Each item belongs to a later phase if it earns
its weight.

- **Per-parent quiet hours.** No infrastructure to honor a time window. Notifications don't exist yet, so this is premature.
- **"Memory thread" or annual review surface.** Long-Term Memory category is reserved; the surface ships only when the per-domain pages aren't enough on their own.
- **Cross-domain Reinforcement strip.** When Care and Med both ship full reinforcement contexts, a unified strip is the convergence target. Defer until both are live.
- **Per-child cooldown personalisation.** A parent of three children with very different therapy intensities may want different windows per child. No data; defer.
- **Signal lifecycle audit log.** Useful for diagnosis someday; not now.
- **Visit-prep view.** ("Here's what's worth reviewing before Sofia's parent-teacher meeting.") Powerful Longitudinal cadence surface, but it's a new page; out of scope.
- **Shared cadence enum between Learn and Care.** Premature — both apps still stabilising.

---

## 8. Implementation in this phase — one quietness guardrail

The audit surfaces exactly one cadence inconsistency worth fixing now:
`OperationalSection` renders both `urgent_action` cards with the same amber
container treatment. When P10 consent + P20 doc-request both fire, the
priority surface produces twin amber strips — the directive's
"too many 'needs attention' states" pattern.

**Fix.** Cap the amber container treatment to ONE card per render. The second
(and further) urgent items keep their semantic `cardType` and their position,
but render with the neutral non-urgent container so the page only carries
one amber row at a time. The information stays; the visual stacking softens.

Single point of change: the `OperationalRow` component picks up an optional
`softened` boolean; `OperationalSection` passes `softened` to the second-and-
beyond urgent rows.

**Why this is the right minimum:** the helper / scoring / cap (2 cards
total) stays untouched. The data model is untouched. No `cardType` changes
hands. Only the visual tonality is normalised when stacking. Reversing it is
a 3-line revert. This is the kind of intervention the directive's
"add one quietness guardrail" example points at.

**Out of scope for this phase, intentionally:**
- Suppressing urgent_action cards entirely when the hero is also amber (Tier A acute). That coupling would let the hero hide real action items — wrong tradeoff.
- Aggregating two urgent_actions into one combined card. Aggregation hides which one is which; the parent loses the destination of each tap.
- Re-ranking by emotional weight across surfaces. Out of scope — that's the deferred orchestration layer.
- Adding a quiet-hours preference. Premature.

---

## 9. Files inspected (Phase 4A)

**Learn**
- `src/app/parent/dashboard/page.tsx` (hero, OperationalSection, OperationalRow, journey rendering, freshness lock, family-drawer wiring)
- `src/app/parent/layout.tsx` (family drawer, Today for X, switch-child cadence)
- `src/app/parent/updates/page.tsx` (Recent Journey rendering)
- `src/app/parent/progress/page.tsx` (latest-per-category model)
- `src/app/parent/proud-moments/page.tsx` (Long-Term Memory + this-week summary + reactions)
- `src/features/parent-journey/helpers.ts` (hero tiers, cooldowns, priority chain, continuity signals, feed grouping, quiet wording rules)
- `src/features/parent-journey/queries.ts` (recurring-categories cap + threshold + window)
- `src/features/parent-family/queries.ts` (drawer fresh-window constant)

**Care**
- `app/parent/[childId]/page.tsx` (hero ↔ strip dedup, voice-notes section, journey feed, observation flow)
- `lib/parent-attention/helpers.ts` (Care attention windows, hero builder, continuity fallback)
- `lib/parent-attention/types.ts`
- `lib/api/continuity-api.ts` (telemetry exclusion confirmed)
