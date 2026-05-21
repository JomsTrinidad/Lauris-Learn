# Cross-Domain Continuity Orchestration — Phase 4B

**Status.** Architectural normalization. Not an orchestration engine. Implementation
in this phase is limited to a single silence rule (see §8).

**Scope.** Phase 3 fixed fragmentation; Phase 4A fixed cadence and emotional
load. This phase names the rules for how *school*, *therapy*, and future
*medical* coexist on the parent home without drowning each other. The audit
preserves the parent-first calm posture: orchestration is conflict resolution
between domains, not optimisation across them.

**Out of scope.** No orchestration engine. No global scoring. No AI
arbitration. No real-time. No notification infrastructure. No Med wiring
(Med columns are reserved in types but no Med fetches exist yet). No
parent dashboard redesign. No new tables. No personalisation.

---

## 1. The orchestration question

When multiple domains speak at once, how should Lauris behave?

The current code answers this *implicitly* — through tier ordering in the
hero, through the 9-tier priority chain, through dedup contracts within each
app. This phase makes the rules explicit so future Med work can be placed on
the right side of each rule without re-deriving it.

The directive's surfaces:

1. **Domain Dominance** — who gets the hero / signal / feed slot when multiple are eligible?
2. **Coexistence** — how should simultaneous events stack without anxiety amplification?
3. **Carry-Over** — what propagates across domain boundaries (school → therapy, parent → all)?
4. **Silence** — when should a domain intentionally stay quiet?
5. **Emotional Coherence** — how does the tone stay calm across heterogeneous facts?

Each is answered below in §3–§7 against actual code state.

---

## 2. Current orchestration behaviour (observed, not speculated)

### 2.1 Hero is single-entity, tier-ordered, school-weighted

`getChildStatusHeadline` in `src/features/parent-journey/helpers.ts` runs a
strict tier chain:

| Tier | Domain | Window | Owns when fresh |
|---|---|---|---|
| A10/A11/A12 | school operational (absent / late / excused) | day-of | always wins when present |
| B20/B21 | school operational (meeting / online class today) | day-of | wins under no Tier A |
| C25 | school operational (present, ≤4h) | hours | "fresh check-in" beat |
| D30 | school continuity (proud moment ≤2d) | 2d cooldown | first emotional tier |
| **D35** | **therapy** (session ≤2d) | 2d cooldown | **the only therapy slot in the hero chain** |
| D40 | school continuity (positive observation ≤3d) | 3d cooldown | second emotional tier |
| E45 | school background (school update ≤3d) | 3d | ambient continuity |
| F50 | calm default | n/a | quiet day |

**Observation.** The hero implements school dominance over therapy by tier
ordering, NOT by suppression. Tier D30 (school proud moment, 2-day cooldown)
outranks Tier D35 (therapy session, 2-day cooldown). When both fire on the
same day, the proud moment wins; the therapy summary moves to the journey
feed below.

**Implication.** When Med ships, the question is: where does it sit in the
chain? See §3 for the recommendation.

### 2.2 Priority surface (`getFeaturedParentCards`) — top 2 of 10 tiers

| Tier | Domain | Card |
|---|---|---|
| P10 | school | Consent Needed (urgent_action) |
| P20 | school | Document Requested (urgent_action) |
| P25 | school | Meeting Tomorrow |
| P30 | school | Meeting Today |
| P31 | school | Online Class Today |
| **P35** | **therapy** | **Voice Note from Therapist** |
| P40 | school | Top Upcoming Event |
| P50 | school | Outstanding Billing |
| P60 | school | Second Upcoming Event |
| P70 | school | Holiday |

Sliced to 2 cards (§ Phase 3B + 4A guardrail).

**Observation.** Therapy carries exactly one priority slot (P35 voice note).
Operational urgent_actions (P10/P20) outrank it; today-scheduled school items
(P25/P30/P31) outrank it; school events (P40) outrank it. The voice note
only reaches the priority surface when school is quiet.

**Observation.** Currently, when both P10 consent AND P35 voice note fire,
the slice takes both. The page shows: amber consent card (school action
asking the parent to act) + purple voice note card (therapy signal asking
the parent to listen). Two parent-attention asks on one scroll.

**This is the only cross-domain collision worth fixing in this phase.** See §8.

### 2.3 Journey feed — chronological, multi-domain natively

`fetchJourneyFeed` merges:
- school `parent_updates`
- school `progress_observations` (parent_visible)
- therapy sessions via `list_parent_visible_therapy_updates` RPC
into one `ParentJourneyItem[]` array sorted newest-first, capped at 15.

`sourceCategory` ∈ `school | therapy | medical | system` already exists.
Medical slot is pre-allocated.

**Observation.** Cross-domain coexistence in the feed is solved: each item
carries its `sourceCategory`, the journey row renders the brand label
(School / Therapy / Medical), and the filter chips (`all` / `school` /
`therapy` / `medical`) let the parent scope.

**No orchestration conflict here.** Chronological order IS the orchestration.

### 2.4 Care side — therapy-only by design

Care's `lib/parent-attention/helpers.ts` operates entirely inside the
therapy domain. Hero and attention strip see therapy data only. School
data is not queryable from Care's RLS view. This is a CORRECT asymmetry
— Care is the specialist surface; Learn is the unified home.

### 2.5 What's already deduplicated within a single visit

| Risk | Dedup mechanism |
|---|---|
| Hero + proud-moment card showing the same moment | `consumedHighlightId` |
| Hero + Recent Growth card showing the same observation | `consumedFallback` |
| Care hero + Care attention strip | `consumedAttentionId` |
| Voice note appearing as Learn signal + Care hero + Care strip after cross-app jump | Phase 3C: deep-link anchored at `#voice-notes` |
| Two amber urgent rows in Learn priority surface | Phase 4A: `softened` render |

Cross-domain duplication risks are now mostly managed within each app.
The orchestration gap is **between-app coexistence of asks** rather than
within-app duplication.

---

## 3. Orchestration class model

The directive proposed six classes. After mapping them onto existing
implementation:

| Class | Description | Hero | Signal | Feed | Persistence | Decay |
|---|---|---|---|---|---|---|
| **Dominant** | The single hero. One per visit. | yes (Tier-winner) | n/a (hero already wins) | yes | per cadence | per cadence |
| **Supporting** | Below the hero; in priority signals or feed groups. | no | yes (1–2 cards) | yes | per cadence | per cadence |
| **Background** | In the journey feed, no specific call-out. | no | no | yes | per feed cap | push-down |
| **Reinforcement** | Active "what we're working on" context. One line per domain. | partial (Tier D-class only when fresh) | low | no | rolling current | replaced |
| **Memory-only** | Long-term, page-internal. Never resurfaces unbidden. | no | no | no | permanent | none |
| **Silent** | Defers in this visit. Still queryable on its owning surface. | no | no | no | unaffected | unaffected |

**Silent ≠ Hidden.** A Silent item still exists on its owning domain
surface (Care `/parent/[childId]`, future Med page). It just does not
compete in Learn's hero or priority surface during conditions where it
would amplify another domain's ask. The deferral is per-visit, not
permanent.

**Class assignment is conditional, not fixed.** A voice note is normally
*Supporting* in Learn's priority surface. When Learn already has an
urgent school action pending, the same voice note becomes *Silent* — it
defers to the Care surface. Class is what role the item plays in *this*
parent's *this* visit.

---

## 4. Domain interaction matrix

The matrix is the contract for who wins, who steps back, and who carries
across when two domains have something to say simultaneously. Read left
column = "the domain whose state is acute." Read row = "the domain that
also has something."

### 4.1 school ↔ therapy

| When school is… | Therapy behaves as… | Rule |
|---|---|---|
| Acute (absent/late/excused today, Tier A) | Silent in Learn priority surface; full visibility on Care `/parent/[childId]` | Operational urgency does not get a competing therapy nudge. Therapy memory stays in the journey feed. |
| Acute action pending (P10 consent / P20 doc request) | **Silent in Learn priority surface; full visibility on Care** | The fix in §8. Otherwise both ask for parent attention in different voices on the same scroll. |
| Today-scheduled (P25/P30/P31) | Supporting in Learn priority surface (P35 voice note may still appear under the 2-card cap) | Operational scheduling doesn't conflict emotionally with therapy signals; both can coexist calmly. |
| Quiet | Supporting (P35 voice note can fill a slot) | Default case. Therapy signal earns its priority slot. |
| Continuity (proud moment, observation) in hero | Supporting in priority surface; therapy can lead hero on alternate days via cooldown | Hero alternates by cooldown; priority surface is independent. |

### 4.2 school ↔ medical (future)

Medical is not implemented; this is the placement guideline for when it
ships. Mirror therapy's relationship to school **with one exception**:

| When school is… | Medical behaves as… | Rule |
|---|---|---|
| Acute (Tier A) | Silent in Learn priority surface; full visibility on Med page | Same as therapy. |
| Acute action (P10/P20) | Silent in Learn priority surface; full visibility on Med page | Same as therapy. |
| **Anything** | **Acute medical (allergic reaction, ER, urgent vaccine, etc.) DOMINATES** | Medical acute trumps school acute. The hero chain gains a Tier-A-medical at the top; the priority surface gains a medical-acute slot above P10. **Not implemented yet — codify here so the slot is reserved.** |
| Quiet | Supporting (Med signal may take a priority slot) | Default. |

The asymmetry: Medical is the only domain whose acute state outranks
school's acute state. Therapy never reaches that level because acute
therapy events do not exist in the parent-visible model (Care's RLS
explicitly excludes cancellations / no-shows / telemetry from parent
visibility).

### 4.3 therapy ↔ medical (future)

Both are specialist domains. Both yield to school acute. Between them:

| Therapy state | Medical state | Behaviour |
|---|---|---|
| Quiet | Quiet | no priority cards from either; hero falls through to calm default |
| Quiet | Acute medical | medical wins hero + priority slot |
| Therapy signal (voice note) | Acute medical | medical wins; therapy goes Silent |
| Therapy signal | Medical signal (e.g. vaccine reminder) | both Supporting; priority cap is 2; ordering by P-score |
| Therapy continuity (hero D35) | Medical continuity | tie-break by recency (newest wins; cooldowns apply) |

### 4.4 Parent observations ↔ all domains

Parent observations are a Care-only feature today (`care_parent_observations`).
They are NEVER a priority signal in Learn (the parent wrote them — surfacing
them to the parent who wrote them is the directive's "no inbox" anti-pattern).
They show up in Care's attention strip as an *echo* ("Your observation was
shared") with a 3-day calm window, capped at P40, and as journey entries on
the therapist-side continuity timeline.

| Direction | Behaviour |
|---|---|
| Parent obs → Learn parent surfaces | NEVER. Echo lives in Care only. |
| Parent obs → Care therapist's journey | Yes (existing). |
| Parent obs → school staff visibility | NEVER. School staff do not read Care parent observations. |
| Future Med staff visibility of Care parent obs | Out of scope; would require explicit cross-org consent grant per Phase 5 schema. |

### 4.5 Operational ↔ Milestone interactions

This is the most directive-load-bearing rule: **milestones survive
operational noise.**

| Combination | Behaviour |
|---|---|
| Operational acute + Milestone moment (same day) | Hero shows operational; milestone STAYS in proud-moments page and in journey feed; nothing about the milestone is suppressed or dimmed. |
| Operational urgent action (consent) + Milestone moment | Same as above; the proud moment is unaffected. |
| Billing urgent + Recent therapy breakthrough milestone | Same; billing is one P50 card; milestone lives in feed + page. |
| Acute medical + Milestone | Acute medical wins hero; milestone preserved everywhere else. |

The directive's "milestones should survive operational noise" is honored
automatically because milestones live in surfaces (journey feed, proud-
moments page) that operational items never reach. The fix is NOT
needed in code; the rule is **architectural** — never let operational
state into the milestone-owning surfaces.

### 4.6 Reinforcement ↔ Operational interactions

Reinforcement context is rolling-current. Operational events come and go.

| Combination | Behaviour |
|---|---|
| Operational acute + Active reinforcement | Reinforcement stays calm and visible; the operational item is in its own surface (hero or priority). The reinforcement line never escalates because of operational state. |
| Operational urgent action + Active reinforcement | Same. Reinforcement doesn't get re-coloured amber to match. |
| Multiple reinforcements (school + therapy) | One line per domain; never stack into a wall. Future Med: same. |
| Reinforcement contradicts operational state (e.g. "working on separation anxiety" + "absent today") | NO automatic interpretation. The reinforcement is the school/therapist's current framing; the operational fact is the day's fact. The parent reads both. Lauris does not editorialise. |

---

## 5. Calm conflict rules (anti-patterns)

Beyond the matrix above, these are the cross-domain anti-patterns Lauris
must never adopt.

### 5.1 Forbidden patterns

- **No simultaneous multi-domain panic.** At most one amber surface vertically in the parent home at any given scroll position (Phase 4A guardrail handles within-priority; this phase handles within-priority-cross-domain via §8).
- **No "your child has issues in 3 domains" framing.** Domain pills exist for navigation; never as a problem-summary surface.
- **No cross-domain escalation cascades.** A school concern does NOT raise the visual urgency of therapy items. A therapy concern does NOT raise the visual urgency of school items.
- **No cross-domain inference UI.** "Your child's therapy goal seems related to your child's school behaviour" — Lauris does NOT make these connections in the parent home. Therapists / teachers / parents make connections in person; the app does not synthesize them.
- **No "X domains active this week" summary.** Domain status pills are about navigation, not load.
- **No urgency inheritance.** Operational urgency in one domain doesn't make signals from another domain *appear* urgent. The therapy voice note never goes amber because billing is overdue.
- **No "concerning trend" across domains.** Lauris does not detect or surface "trends" of any kind in the parent home. If the data supports one, that's a clinician's job.
- **No "stress score." No "well-being indicator." No composite metric.** The parent reads each domain's state directly.
- **No cross-domain suppression of milestones.** A proud moment is never hidden because billing is overdue.
- **No cross-app referrer awareness.** Care does not change its rendering based on whether the parent came from Learn (this was considered + rejected in Phase 3C §7).
- **No "you also have items in Care" footer in Learn.** The unified home does not advertise the sibling app; deep-links from individual cards do.
- **No domain accent stealing.** Therapy uses purple; school uses primary/blue; medical (future) uses emerald. These never overlap; never get reassigned for "consistency."
- **No timezone unification across domains.** School "today" is the parent's local day; therapy sessions are appointment timestamps. They are NOT the same concept; do not force a shared "today" abstraction (see Phase 3C §5.5).

### 5.2 Voice patterns to preserve

- **"defers, doesn't disappear."** A silenced cross-domain signal still lives on its owning surface; "Silent" is a visit-level decision, not a delete.
- **"domain owns its tone."** School's tone is teacher-warmth. Therapy's tone is clinician-care. Medical's tone (future) is family-physician-trust. Lauris does not normalise these into one voice.
- **"acute is rare, by design."** Both Tier A in the hero and amber treatment in priority are deliberately reserved for items the parent must act on now. They earn their colour by being rare.
- **"continuity carries calm."** Reinforcement Context lines should always read calmly even when operational state is acute. The school support context line does not shift colour because the child is absent today.

---

## 6. Continuity carry-over rules

Carry-over = information from one domain influencing how a parent reads
another domain's surface.

| Item | Carries to | Visibility | Rule |
|---|---|---|---|
| Care `care_support_context` (therapist's current focus) | Learn parent home? | NO (today) | Out of scope; would require Care → Learn read path. The school support context line (`student_support_context`) is the only reinforcement currently surfaced in Learn. |
| Learn `student_support_context` (school's current focus) | Care? | NO | Care does not pull school-side data. Therapists see the child in Care only. |
| Care `care_voice_notes` (parent_visible=true) | Learn priority surface | YES (Phase 3B) | One signal per child; ≤7d window; suppressed when school urgent action is pending (Phase 4B §8). |
| Care `therapy_sessions.parent_visible_summary` | Learn journey feed | YES (Phase 2 RPC) | Parent-safe RPC `list_parent_visible_therapy_updates`. |
| Learn `parent_updates` / `progress_observations` | Care | NO | Care doesn't read school-side. |
| Future Med vaccine reminder | Learn priority surface | YES (when shipped) | Same pattern as Care voice note — single signal, ≤window. |
| Future Med diagnosis / chart data | Anywhere parent-facing | NO | Medical records are read on the Med page only; Lauris Parent home does not interpret medical content. |
| Parent observation (Care) | Learn | NO | "no inbox" anti-pattern: the parent does not need to be told they wrote something. |
| Cross-domain consent (Phase 4 grant table) | UI | Not in parent-facing surfaces | The grant exists for clinic visibility, not for parent UX. |

The carry-over story is intentionally minimal: **only items the parent
explicitly cares about reading cross the boundary, and they always carry
through parent-safe RPC paths, not through cross-app component imports.**

---

## 7. Silence rule recommendations

### 7.1 Therapy stands down when school has an acute parent action

**Implemented this phase.** When `needs.docApprovalCount > 0` or
`needs.docRequestCount > 0`, the voice-note signal does NOT compete in
Learn's priority surface. The same voice note remains fully visible on
Care `/parent/[childId]`'s `#voice-notes` section (Phase 3C deep-link).
The parent who lands on Care via any path sees it normally; the parent
who is looking at Learn sees one operational ask, not one ask + one
nudge.

**Why this rule:** the parent-action urgency (consent / doc request)
demands a focused tap. The voice note is an emotional/educational signal
that benefits from a relaxed read. Putting both on one scroll splits the
attention budget and makes both feel less important.

**Why only urgent_action (not also Tier B today-scheduled):** a meeting
today / online class today is informational; it doesn't ASK for an action
in the same way. P30/P31 + P35 stacking is fine; the parent reads "you
have a meeting today; therapist also sent a voice note" without
emotional tension.

### 7.2 Future Med should follow the same silence rule

When a future Med signal layer ships:
- Med signals defer to school urgent_action (mirror of §7.1).
- Therapy signals defer to acute Med (the medical-acute slot reserved in §4.2).
- School operational continues to defer to acute Med (the asymmetry already coded into the hero chain).

### 7.3 Reinforcement strips do not silence

The support-focus card on Care + the support-context line on Learn are
ALWAYS visible when set. They are Reinforcement Context, not Signals;
they don't compete with operational urgency. They calm the parent's
reading of operational state, they don't get suppressed by it.

### 7.4 Journey feed never silences

The journey feed is a record; nothing in it ever gets silenced by
operational state in another domain. This is the "milestones survive
operational noise" rule generalised to all journey events.

### 7.5 Memory pages never silence

`/parent/proud-moments`, `/parent/progress`, `/parent/updates` are
visited intentionally. They never modify their rendering based on what
else is happening in the home.

---

## 8. Implementation in this phase — one silence rule

The audit identifies exactly one cross-domain orchestration gap worth
addressing now: when a parent has a pending consent (P10) or document
request (P20) AND a recent voice note (P35), the Learn priority surface
currently renders BOTH as priority cards. The parent reads:

- **"Consent Needed"** (amber, school action)
- **"Voice Note from Therapist"** (purple, therapy nudge)

Two parent-asks in two different voices on the same scroll.

**Fix.** In `getFeaturedParentCards`, suppress the voice-note candidate
when any school urgent_action exists. The voice note still appears in
Care's `/parent/[childId]` page (its owning surface), where it lives
between the Care hero and the `#voice-notes` section. The Care deep-link
remains in place for when the parent later visits Care directly.

Single point of change: the existing voice-note candidate block in
`src/features/parent-journey/helpers.ts`. One additional condition.

**Why this is the right minimum:**
- It implements an actual cross-domain coexistence rule with one
  predicate (`hasSchoolUrgentAction`).
- The Care surface is untouched — Care continues to show the voice
  note normally.
- No new data model, no new types, no new queries.
- The rule generalises cleanly: when Med ships its own signal layer,
  the same predicate (or a generalised "any acute parent-action in
  any prior domain") gates Med signals identically.
- Reversal is a 3-line diff.

**Out of scope for this phase, intentionally:**
- Cross-domain ranking / scoring layer.
- Suppression of therapy signals when hero is Tier A acute (would couple priority surface to hero state — broader surface area).
- Suppression of feed items by domain state (feed is chronological by contract; never re-ranked).
- Carry-over of Care reinforcement (`care_support_context`) into Learn (deferred until both domains' reinforcement strips are stable; would need a parent-safe RPC).
- A Med-acute placeholder slot in the hero chain (no Med data, premature).
- A general "Silent class" enum surfaced in `PriorityCard` (no consumer needs to read it; the suppression happens at construction time).

---

## 9. Future Med readiness

When Lauris Med ships, this audit assumes Med follows the same pattern as Care:

1. **Reserves no new hero tier without a parent-safe RPC** providing the data.
2. **Inherits silence rule §7.1** — Med signals defer to school urgent_action in Learn.
3. **Earns one acute slot** at the top of both hero chain and priority chain for genuinely acute medical states (allergic reaction, urgent vaccine, ER visit). That slot does not exist in current code and should not be added speculatively.
4. **Uses `sourceCategory: "medical"`** which is already reserved in `ParentJourneyItem`.
5. **Renders with emerald accent** in CAT_STYLES.medical (already reserved in `src/app/parent/dashboard/page.tsx`).
6. **Deep-links to its own surface** for full detail; never tries to render full medical context in Learn.
7. **Owns its own attention layer** mirroring Care's `lib/parent-attention/helpers.ts` rather than being driven by Learn's helpers.

When Med ships, this doc is the orchestration contract the new module
plugs into. No engine. No registry. Just consistent application of the
same five rules at the points where Med touches Learn's hero and
priority surfaces.

---

## 10. Files inspected (Phase 4B)

**Learn**
- `src/app/parent/dashboard/page.tsx` — hero rendering, `OperationalSection`, source-styles (CAT_STYLES already reserves `medical` accent)
- `src/app/parent/layout.tsx` — family drawer, "Today for X", child switching
- `src/features/parent-journey/helpers.ts` — `getChildStatusHeadline` tier chain, `getFeaturedParentCards` 9-tier priority chain, `getContinuitySignals`
- `src/features/parent-journey/queries.ts` — feed merge (school + therapy + future medical slot), `fetchRecentParentVisibleVoiceNote`, `fetchServicePresence` (cross-org connection probe)
- `src/features/parent-journey/types.ts` — `SourceCategory` already includes `medical`; `PriorityCardType` enum
- `src/features/parent-journey/adapters.ts` — therapy session adapter (`sourceCategory: "therapy"`); update/observation adapters (`sourceCategory: "school"`)

**Care**
- `app/parent/[childId]/page.tsx` — Care hero ↔ strip dedup, support-focus card, voice-notes section anchor (`#voice-notes`)
- `lib/parent-attention/helpers.ts` — Care attention tier chain (P10 support focus → P20 voice note → P30 session update → P40 observation echo)
- `lib/api/continuity-api.ts` — therapist-side continuity excludes telemetry + cancelled/no-show sessions
