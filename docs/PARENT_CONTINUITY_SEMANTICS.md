# Parent Continuity Semantics — Phase 3C Architectural Normalization

**Status:** architectural normalization doc. Not a refactor plan. Implementation
in this phase is limited to one surgical change (see §7).

**Scope.** Defines shared semantics for everything a parent sees that has a
continuity dimension across Lauris Learn (school), Lauris Care (therapy), and
future Lauris Med (medical continuity). Phase 3A defined the parent-app
boundary; Phase 3B added signal-layer wiring; this phase fixes the vocabulary
so Learn / Care / Med can converge without timeline fragmentation.

**Out of scope.** No new tables. No notification center. No inbox. No real-time.
No event bus. No AI orchestration. No analytics layer. No timeline rewrite.

---

## 1. Continuity taxonomy

The directive proposed six categories. After auditing the actual codebase,
**five** are load-bearing today; *Historical Reference* is real but emerges
automatically once items age past their lifecycle window — it is not a
storage category that needs its own surface.

| Category | What it is | Lifetime | Emotional weight | Operational weight |
|---|---|---|---|---|
| **Signal** | Short-lived attention nudge. Action-worthy *or* emotionally important *right now*. Decays inside days. | ≤7d typical, ≤14d max | Variable | High |
| **Journey Event** | Narrative continuity moment. Builds the child's story over time. Always chronological. | Persistent (feed cap by depth, not age) | Medium–high | Low |
| **Reinforcement Context** | Active guidance shaping how the parent reads other surfaces *this week*. One per child per domain. | Rolling current (replaced, not aged) | Medium | Low |
| **Milestone** | Concrete progress moment retained long-term. A subset of Journey Events that earns extra durability. | Long-term (years) | High | Low |
| **Operational Event** | Administrative / system fact. Low emotional weight; needed for action or compliance. | Lifecycle-bound (closes/expires) | Low | High |
| **Historical Reference** | Automatically emerges: any item past its surface window that remains queryable but is no longer surfaced. | Indefinite (archival, not displayed) | n/a | n/a |

**Key rule:** an item has exactly ONE primary category. Where a single entity
appears to span two (e.g. a milestone IS a journey event), the more specific
category wins for surface-ownership decisions.

---

## 2. Item-by-item audit

Each row shows: the entity, where it lives in storage, what currently surfaces
it, the recommended category, and the recommended lifecycle.

| Entity | Source(s) | Current surfaces | Category | Lifecycle |
|---|---|---|---|---|
| **Absence today** | Learn `absence_notifications` (parent-emitted) + `attendance_records` (school-emitted) | Learn hero Tier A; Learn drawer "Today for X"; Learn attendance page | **Operational Event** | Expires end-of-day; archival in attendance history |
| **Meeting today** | Learn `events` (event_type=meeting, date=today) | Learn priority card (P30) | **Operational Event** | Expires end-of-day; archival in events history |
| **Meeting tomorrow** | Learn `events` (event_type=meeting, date=tomorrow) | Learn priority card (P25) [Phase 3B] | **Operational Event** | Becomes "Meeting today" tomorrow; otherwise expires |
| **Online class today** | Learn `events` (event_type=online_class, date=today) | Learn priority card (P31) | **Operational Event** | Expires end-of-day |
| **Holiday / no-class day** | Learn `events` (event_type=holiday) | Learn priority card (P70) | **Operational Event** | Expires end-of-day |
| **Consent request** | Learn `document_consents` (pending) | Learn priority card (P10); `/parent/documents` | **Operational Event** | Persists until resolved (granted / revoked / expired) |
| **Document request** | Learn `document_requests` (status=requested) | Learn priority card (P20); `/parent/documents` | **Operational Event** | Persists until submitted / reviewed / cancelled |
| **Outstanding billing** | Learn `billing_records` (unpaid/partial/overdue) | Learn priority card (P50); `/parent/billing` | **Operational Event** | Persists until paid; aging is a sub-state, not a separate signal |
| **Voice note from therapist** | Care `care_voice_notes` (parent_visible=true) | Learn priority card (P35) [Phase 3B]; Care hero (P20); Care attention strip; Care `#voice-notes` section; Care continuity-api entry | **Signal** (transition to Journey Event after the freshness window) | Signal-window 7d (Learn) / 7d (Care attention) / 14d (Care support-focus equivalent); after window: Journey Event, persisted in Care detail page only |
| **Support focus (therapist-set)** | Care `care_support_context` | Care hero (P10); Care attention strip; Care `#home-support-focus` card; Care continuity fallback | **Reinforcement Context** | Rolling current — replaced, not aged. The previous focus is overwritten, not archived as history. |
| **Support focus (school-set)** | Learn `student_support_context` | Learn dashboard ambient line | **Reinforcement Context** | Same — rolling current |
| **Therapy session summary** | Care `therapy_sessions.parent_visible_summary` (via `list_parent_visible_therapy_updates` RPC) | Learn hero Tier D35 (≤2d); Learn journey feed (therapy row); Care hero (P30); Care attention strip; Care journey feed; Care continuity entry | **Journey Event** | Persisted; hero window 2–3d on each app; feed: keeps |
| **Therapist parent note (published)** | Care `care_session_notes` (parent_visible=true) | Care continuity entry (`parent_note_published`) | **Journey Event** | Persisted |
| **Milestone** | Care `care_milestones` | Care journey feed (linkedMilestones); Care continuity fallback ("Recent milestone"); Care continuity entry | **Milestone** | Long-term retained; resurfaces during visit prep / annual review |
| **Home activity (assigned / in_progress)** | Care `care_home_activities` | Care journey feed (linkedActivities); Care continuity fallback ("Try at home"); Care continuity entry | **Reinforcement Context** (while active) → **Journey Event** (after completion or archive) | Active while open; completion is a Journey Event; archived = Historical Reference |
| **Home activity (completed)** | Care `care_home_activities` (status=completed) | Care continuity entry (`home_activity_completed`) | **Journey Event** | Persisted; not signal-surfaced |
| **Parent observation** | Care `care_parent_observations` | Care attention strip P40 (echo); Care `#observations` section; Care continuity entry (`parent_observation`) | **Journey Event** (with **Signal** echo for 3d) | Echo signal ≤3d; long-term Journey Event |
| **Proud moment** | Learn `proud_moments` | Learn hero Tier D30 (≤2d); Learn dashboard Positive Highlight card (≤7d); Learn `/parent/proud-moments` page | **Milestone** (within proud-moments domain) | Hero 2d; featured card 7d; persists permanently in proud-moments page |
| **Progress observation (parent_visible)** | Learn `progress_observations` | Learn hero Tier D40 (≤3d, positive only); Learn dashboard Recent Growth card; Learn `/parent/progress` page (latest per category) | **Journey Event** | Hero 3d; latest-per-category cached on progress page; older = Historical Reference |
| **Class update / parent_update** | Learn `parent_updates` | Learn dashboard journey feed; Learn `/parent/updates` page | **Journey Event** | Feed cap; older = Historical Reference |
| **School broadcast (class_id NULL)** | Learn `parent_updates` (class_id=NULL) | Learn `/parent/updates` page (announcements) | **Journey Event** | Same |
| **Schedule change** | Not surfaced as a distinct entity today | — | **Signal** (when implemented) | Window ≤72h; not built |
| **No-show / cancelled therapy** | Care `therapy_sessions` (status=no_show/cancelled) | Excluded from continuity by `continuity-api.ts` | **Operational Event** (clinic side) | Not parent-surfaced |
| **`care_session_events` (button presses)** | Care `care_session_events` | Excluded from continuity by `continuity-api.ts` | **Operational Event** (telemetry) | Recovery only; never parent-surfaced |
| **Continuity gap (>21d between sessions)** | Derived in `assembleContinuityData` | Care therapist-side journey | **Journey Event** | Stays; not parent-surfaced |
| **Overdue form** | Not surfaced as a distinct entity today | — | **Operational Event** | Not built |
| **Reinforcement reminder** | Not surfaced as a distinct entity today | — | **Reinforcement Context** | Not built |

---

## 3. Surface ownership matrix

Each surface owns a specific cognitive job. An entity that appears on more
than one surface is acceptable only when each surface plays a different job
on the same entity (e.g. signal → journey row is the same fact in two roles
across time). Appearing on the same surface type in BOTH apps is the
duplication risk this matrix targets.

| Surface | Owns | Job | Cap |
|---|---|---|---|
| **Hero** | Top-of-page sentence | "What should this parent read first?" | 1 sentence; one entity max |
| **Priority Signals** | Attention nudges | "What needs the parent's attention soon?" | 2 cards (Learn), 2 cards (Care) |
| **Reinforcement strip** | Active guidance | "What is shaping this week?" | 1 line per domain (Learn support context; Care support focus card) |
| **Journey feed** | Chronological narrative | "What's been happening?" | Cap by depth (15 items in Learn `fetchJourneyFeed`; comparable in Care) |
| **Detail pages** | Per-domain depth | "Where do I dig into one domain?" | `/parent/updates`, `/parent/progress`, `/parent/billing`, `/parent/events`, `/parent/proud-moments`, `/parent/student`, `/parent/plans`, `/parent/documents` (Learn); `/parent/[childId]` (Care) |
| **Deep-link entry** | Cross-app jump | "Where does the parent land when arriving from a signal?" | Always an anchor or scoped surface, never the app root |
| **Archive / history** | Searchable, not surfaced | "Where do older items live without nudging?" | Per-domain page browsing |

**Cross-app rule.** A signal that opens a sibling app MUST land on the sibling
surface that already shows the same entity, not on the sibling's app root.
This avoids the "I tapped a voice-note nudge and now I have to scroll" failure
mode. See §7 for the surgical fix to the current voice-note path.

---

## 4. Event lifecycle rules

Lifecycles are tunable single constants per item, not a scoring system. The
goal is calm cadence, not orchestration.

| Dimension | Operational Event | Signal | Reinforcement Context | Journey Event | Milestone |
|---|---|---|---|---|---|
| **Freshness window (hero-eligible)** | Day-of (Operational A tier) | 7d typical | While current | 2–3d | 7d |
| **Surface window (feed/card visible)** | Until resolved | 7d signal layer | While current | Feed cap by depth, not age | 7d featured, persistent in page |
| **Decay rule** | Resolves to terminal state | Drops off after window; becomes Journey Event if persistent | Replaced by next current value | Never decays; pushed down by newer items | Never decays |
| **Archive threshold** | Resolved or older than 30d | Past window | When superseded | Past feed cap | Never |
| **Visit-prep resurfacing** | Active unresolved items | No | Current value | Most-recent 1–3 per domain | Top 1–2 milestones per domain |
| **Memory-worthy?** | No | No (signals are ephemeral by design) | No (the new one is what matters) | Yes (chronological) | Yes (long-term) |
| **Should disappear quietly?** | Yes (when resolved) | Yes (past window) | Yes (when replaced) | No (always traceable) | No |

**Calm-cadence guard rails:**

- A Signal never carries a count badge. "3 new" reads as inbox; "Voice note from therapist" reads as continuity.
- A Reinforcement Context surface never reads "X new this week." The point is that the same idea has been *current*, not that it has been *active*.
- A Journey Event row never carries an "Important!" pill. The chronology is the importance.
- A Milestone never decays. It can be deprioritised in scroll order but never aged out.
- An Operational Event never lives in the Journey feed once resolved. A paid bill is not a story; it is a closed task.

---

## 5. Duplication risks identified

The audit found four concrete duplication patterns. Each is documented with
the entity, the surfaces involved, and the recommended disposition.

### 5.1 Voice note — 4 surfaces for one entity

| Surface | App | Job |
|---|---|---|
| Priority card P35 (Phase 3B) | Learn dashboard | Signal nudge |
| Hero (P20 mic) | Care `/parent/[childId]` | Hero attention |
| Attention strip card | Care `/parent/[childId]` | Signal nudge |
| `#voice-notes` section card | Care `/parent/[childId]` | Detail / playback |
| Continuity entry (`voice_note_shared`) | Care therapist-side journey | Therapist-only journey |

**Within Care**, hero + attention strip already dedup via `consumedAttentionId`
(documented contract in `lib/parent-attention/helpers.ts`). The `#voice-notes`
section is the playback surface — different job, not duplication.

**Across apps**, Learn's priority card and Care's hero render the same fact in
the same role (signal nudge). This is acceptable because they live on
different screens, BUT the Learn deep-link currently lands the parent on Care's
*page root*, where they see the hero version of the same nudge they just
tapped. **Fix: anchor the deep-link at `#voice-notes` (the playback surface).**
This is the one surgical change in this phase — see §7.

### 5.2 Therapy session summary — 6 potential surfaces

| Surface | App | Job |
|---|---|---|
| Hero Tier D35 (≤2d) | Learn dashboard | Hero attention |
| Journey feed therapy row | Learn dashboard | Journey Event |
| Hero P30 sparkle (≤3d) | Care `/parent/[childId]` | Hero attention |
| Attention strip P30 | Care `/parent/[childId]` | Signal nudge |
| Journey feed | Care `/parent/[childId]` | Journey Event |
| Continuity entry (`session_completed`) | Care therapist-side journey | Therapist-only |

Same pattern as voice notes. The therapy summary is a true cross-app
Journey Event — it earns appearance on both apps' feeds because each app
has its own journey scroll. The hero-tier duplication is *expected* within
each app (each hero independently chooses its own top item).

**No fix needed today** beyond the rule that the priority-card layer in Learn
should NOT surface a therapy-summary card (it's already in the hero or feed).
Phase 3B respected this — no therapy-summary card was added.

### 5.3 Support focus — parallel, not duplicated

| Surface | App | Source |
|---|---|---|
| Care support-focus card | Care `/parent/[childId]` | `care_support_context` (therapist-set) |
| Learn ambient context line | Learn dashboard | `student_support_context` (school-set) |

These are **two different reinforcement contexts** (school vs therapy). They
are not duplicates of one entity; they are siblings.

**Future work flag:** when Lauris Med ships, a *third* reinforcement source
will exist. The parent should not be reading three "what we're working on"
lines stacked. A single Reinforcement strip with up-to-three domain pills
(school / therapy / medical) is the convergence target. Out of scope here.

### 5.4 Operational items leaking into the Journey feed

The Care `assembleContinuityData` function correctly excludes
`care_session_events` (telemetry) and cancelled/no-show sessions. Verified
clean.

The Learn dashboard journey adapters do not pull operational items
(billing / events / consents) into the feed. Verified clean.

The remaining leak risk is *home activities*: they appear as Journey Event
entries on the therapist-side continuity timeline (`continuity-api.ts`) but
they have an operational lifecycle (assigned → completed). The
recommendation is: the *assignment* event and the *completion* event are
each one Journey Event. The "active assignment" between those two moments
is Reinforcement Context, not a feed item. The current Care code already
treats this correctly — assignment and completion become two distinct
entries. Verified clean.

### 5.5 Conflicting "today" semantics across apps

- **Learn** has a strong `today` concept (date string, attendance day, school day).
- **Care** has no `today` concept; therapy is appointment-based, not daily.

This is not a duplication risk — it is a deliberate semantic asymmetry that
each app should preserve. The unified parent should NOT see "Today on Care"
because Care does not have a calendar day. Future Med will likely behave like
Care (appointment-based) rather than Learn (daily).

**Recommendation:** keep `today` as a Learn-only concept. Cross-app aggregator
should not invent a global `today` view.

### 5.6 Cross-app feed shape divergence

- Learn `ParentJourneyItem.sourceCategory` ∈ `school | therapy | medical | system`.
- Care `LaurisFamilyFeedItem` is therapy-only (no `sourceCategory`).
- Care `ContinuityEntry.kind` enumerates 9 kinds.
- Learn `JourneyItemType` enumerates 7 types.
- Learn `PriorityCardType` enumerates 8 types.
- Care `AttentionKind` enumerates 5 kinds.

No taxonomy crosses the line today. A future cross-app aggregator will need a
shared semantic enum. **Recommendation:** when that aggregator ships, anchor
on the §1 taxonomy here (Signal / Journey Event / Reinforcement Context /
Milestone / Operational Event / Historical Reference) as the *abstract*
category, with the existing per-app enums as concrete subtypes. Do NOT
pre-build the abstract enum in either app — both Care and Learn already
document this in their helper docstrings ("match shape, not code"). Adding a
shared enum before either app stabilises locks in semantics neither has
earned.

---

## 6. Surface ownership recommendations

Rules below should hold across all current and future continuity work on the
parent side. They are conventions, not enforcement.

1. **Each entity has one primary surface owner per app.** Other surfaces are
   "views into the same fact" but never re-rank it.
2. **Hero is exclusive within an app.** Only one entity per hero tier, and the
   chosen entity owns the hero for its window. The same entity does not also
   appear in priority signals during its hero window (the Care attention strip
   already deduplicates via `consumedAttentionId`; the Learn hero already
   deduplicates via `consumedHighlightId` / `consumedFallback`). Hero
   duplication across apps is acceptable because each app's hero is independent.
3. **Priority signals are short-lived nudges.** Once an item passes the signal
   window or moves to terminal state, drop it from this surface. Do not
   "remember" it here — the Journey feed and detail pages own memory.
4. **Reinforcement strip is one line per domain.** Replaced, not aged.
5. **Journey feed is chronological.** Never re-ranked by importance, only
   filtered by domain. Operational events do not appear here.
6. **Cross-app deep-links land on the sibling's surface that owns that entity.**
   For voice notes: Care `#voice-notes`. For therapy summary: Care
   `/parent/[childId]` (the journey is the right surface). For documents,
   billing, events: each is owned by its Learn page.
7. **Detail pages are the archival home.** `/parent/updates`, `/parent/progress`,
   `/parent/proud-moments`, `/parent/billing`, `/parent/documents`, Care
   `/parent/[childId]` (and future Med equivalents) are where older items
   continue to live without nudging.

---

## 7. Implementation in this phase — one surgical change

The audit surfaces exactly one concrete code-level duplication risk worth
addressing now: when a parent taps the **Voice Note from Therapist** priority
card in Learn (Phase 3B), Learn opens Care at the page root (`/parent/{childProfileId}`).
Care then renders its own hero / attention-strip echo of the same voice note
*and* the playback section further down. The parent has to scroll past their
own nudge to reach the audio.

**Surgical fix:** change the Learn deep-link from
`{CARE_BASE_URL}/parent/{childProfileId}` to
`{CARE_BASE_URL}/parent/{childProfileId}#voice-notes`. The `#voice-notes`
anchor already exists in Care (`app/parent/[childId]/page.tsx` line 540 —
`<div id="voice-notes" className="space-y-2 scroll-mt-20">`), and Care's
layout already implements a hashchange + scrollIntoView listener
(`app/parent/layout.tsx`). The parent now lands directly on the playback
surface that owns the entity. Care's hero/strip dedup still works because
the hero / strip echo the same entity the user came to see — at that
landing point, they read as "yes, you're in the right place," not as
duplicates of a tap they just made.

This change touches one helper (`src/features/parent-journey/helpers.ts`,
voice-note card builder).

**Out of scope for this phase, intentionally:**

- Adding a `semanticCategory` field to `ParentJourneyItem` or `PriorityCard`.
- Building a shared enum / type package between Learn and Care.
- Promoting Care's `AttentionCard` or Learn's `PriorityCard` to a cross-app
  abstraction.
- Adding cross-app dedup logic that detects "the parent just came from
  Learn so suppress Care's matching hero" — requires referrer detection
  and would compromise Care standalone behaviour.
- Refactoring Care's `assembleContinuityData` or Learn's `fetchJourneyFeed`.
- Touching RLS / RPC contracts.

---

## 8. Future convergence path

When Lauris Med ships:

1. The §1 taxonomy already covers it — Reinforcement Context, Journey Event,
   Milestone, Operational Event, Signal, Historical Reference apply unchanged
   to medical continuity (e.g. "current medication regimen" = Reinforcement
   Context; "annual physical complete" = Journey Event; "vaccine due" =
   Operational Event; "first allergic reaction recorded" = Milestone).
2. The hero / signal / feed surfaces already exist in Learn. Med items wire
   into them the same way Care therapy items did in Phase 2 — via parent-safe
   SECURITY DEFINER RPCs and the same `sourceCategory: "medical"` slot
   already reserved in `ParentJourneyItem`.
3. The shared semantic enum, when extracted, anchors on §1.
4. Each app's hero / strip dedup contract continues to operate inside the
   app. Cross-app dedup remains a non-goal — see §6 rule 6 for the cross-app
   landing-surface convention.

---

## 9. Surfaces / files inspected (Phase 3C)

**Learn**
- `src/app/parent/dashboard/page.tsx` — hero, priority cards, journey, continuity blocks, drawer wiring
- `src/app/parent/layout.tsx` — family drawer, "Today for X", absence flow
- `src/app/parent/updates/page.tsx` — flat reverse-chrono feed + media gallery
- `src/app/parent/progress/page.tsx` — latest-per-category observations
- `src/app/parent/proud-moments/page.tsx` — full history + this-week summary + reactions
- `src/features/parent-journey/helpers.ts` — `getChildStatusHeadline` (hero tiers), `getFeaturedParentCards` (7→9 tier priority chain), `groupFeedByRecency`, `getContinuitySignals`
- `src/features/parent-journey/queries.ts` — `fetchJourneyFeed`, `fetchUpcomingEvents`, `fetchNeedsAttention`, `fetchRecentParentVisibleVoiceNote`, `fetchSupportContext`
- `src/features/parent-journey/types.ts`, `adapters.ts`

**Care**
- `app/parent/[childId]/page.tsx` — hero + attention strip + support-focus card + voice-notes section + journey + observation surfaces
- `app/parent/layout.tsx` — hashchange/anchor scrolling, Phase 3A boundary
- `lib/parent-attention/helpers.ts` — `getCareAttentionCards`, `getCareHeroState`, `getCareContinuityCards`
- `lib/parent-attention/types.ts`
- `lib/api/continuity-api.ts` — therapist-side `assembleContinuityData`
- `lib/api/voice-notes-api.ts`, `lib/api/parent-api.ts`
- `supabase/migrations/093_care_session_events.sql` — confirms telemetry exclusion
- `supabase/migrations/095_voice_notes.sql` — confirms RLS contract
