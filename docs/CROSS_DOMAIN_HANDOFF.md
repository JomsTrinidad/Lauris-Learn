# Cross-Domain Continuity Handoff — Phase 5A

**Status.** Architectural normalization + one surgical carry-over. Not an
orchestration layer. Implementation in this phase brings the Care
therapist's parent-visible "current focus" line into the Learn parent home
as a calm second reinforcement line — the exact item that Phase 3C §5.3 and
Phase 4B §7.3 had flagged as the natural next handoff.

**Scope.** Define what context should follow the child across environments
without becoming surveillance, profiling, or coordination paperwork.

**Out of scope.** No shared child-state engine. No "360 monitoring." No
cross-domain dashboards. No AI inference. No risk scores. No automated
recommendations. No coordination inbox. No parent-as-coordinator workflow.
No exposing raw therapy / medical / school discipline detail. No giant
prep summaries. No new tables. No new RPCs. No notification infrastructure.

---

## 1. The handoff question

When a child moves between environments — home, school, therapy, future
medical — what context should travel with them?

The Lauris-Parent answer is **narrow, narrative, and parent-visible**.

- Travelable: short reinforcement narratives ("we're working on X"), parent observations the parent already wrote in the appropriate domain.
- Domain-private: raw clinical notes, raw discipline detail, internal staff workflow, telemetry, billing detail, scheduling internals.
- Parent-driven: nothing. The parent never has to act as messenger between domains. The continuity travels through Lauris itself, parent-visibly, via parent-safe RPCs and RLS-protected reads.

---

## 2. Handoff taxonomy

The directive proposed seven classes. After mapping them to existing data:

| Class | Description | Propagates across domains? | Parent-visible? | Freshness | Decay |
|---|---|---|---|---|---|
| **Reinforcement Context** | Plain-language "what we're working on" set by domain staff. | Selectively (parent-visible only, never staff-to-staff). | Yes. | Rolling current; replaced not aged. | Replaced. |
| **Prep Context** | What deserves reviewing before the next interaction (visit, meeting, conference). | Not propagated as a packet; derived per-visit from existing data. | Parent-visible inside the relevant detail page. | ≤7d typical. | Naturally as feeds advance. |
| **Transition Context** | Immediate handoff information (e.g. "had a rough morning at school" before a therapy session). | Out of scope in v1; no mechanism today. | Would be parent-visible only when shipped. | ≤24h. | Day-of. |
| **Parent Reflection** | What the parent wrote / acknowledged inside one domain. | Stays in the domain the parent chose. | Yes, to that domain. | n/a. | Persistent within domain. |
| **Domain-Private Detail** | Clinical notes, telemetry, discipline detail, billing internals, scheduling internals. | NEVER. | NEVER. | n/a. | n/a. |
| **Memory Context** | Long-term milestones, proud moments. | Domain-internal page. | Yes within its own page. | Persistent. | None. |
| **Operational Context** | Day-of administrative state (absence, billing due, consent pending). | Stays in the domain that owns the operation. | Yes. | Until resolved. | Resolves. |

The taxonomy collapses one of the directive's seven into "not yet implemented":
**Transition Context** is named but has no code path today, and adding one
would be exactly the "please update all providers" parent burden the
directive forbids. Documented as a deliberate future placeholder; no
implementation in this phase.

---

## 3. Current handoff behaviours (observed, not speculated)

### 3.1 Existing cross-domain reads from Learn to Care

| Path | Direction | Mechanism | Class | Status |
|---|---|---|---|---|
| Therapy session summary | Care → Learn parent home | `list_parent_visible_therapy_updates` RPC (migration 091 + fix 106) | Memory / Journey Event | ✅ shipped (Phase 2) |
| Therapist voice note | Care → Learn priority signal | direct SELECT on `care_voice_notes` under parent RLS (`cvn_parent_select`) | Reinforcement / Signal | ✅ shipped (Phase 3B) |
| Voice note deep-link landing | Learn → Care `#voice-notes` | external anchor | n/a | ✅ Phase 3C |

### 3.2 Existing Care-side reads from Care to Learn

NONE. Care's RLS does not allow Care surfaces to read school-side tables
(`parent_updates`, `progress_observations`, `attendance_records`, `events`,
`billing_records`). This is intentional and stays unchanged.

### 3.3 Care-side reinforcement that is NOT yet surfaced in Learn

- `care_support_context.focus_text` — therapist-set, parent-visible, plain language.
- Linked home activities (`care_home_activities`) — assigned/in_progress.
- Recent milestones — Care-internal continuity page.
- Parent observations the parent wrote in Care — by design, never propagate (the parent wrote them; surfacing them back to the same parent is the directive's "no inbox" anti-pattern).

**Phase 5A action:** Bring `care_support_context.focus_text` into the Learn
parent home as a second reinforcement line. See §8.

### 3.4 School-side reinforcement that is NOT propagated to Care

- `student_support_context` — school-set, parent-visible.
- `progress_observations` (parent_visible) — school-set, parent-visible.
- `proud_moments` — school-set, parent-visible.
- `parent_updates` — school-set, parent-visible.

**Phase 5A action:** none. Care does not need school reinforcement context —
the therapist's view of the child is therapy-scoped, and adding school
context to Care would be the same "360 monitoring" anti-pattern the
directive forbids. If school-to-therapy carry-over ever becomes necessary,
it should be **parent-driven explicit sharing**, not automatic propagation.

### 3.5 Carry-over discipline confirmed

- Parent observations on Care (`care_parent_observations`) — `cpo_parent_select_own` RLS ensures parents read ONLY their own submissions, NEVER each other's. Therapists read all observations for their org's children. **Never propagates to school.**
- Care `therapy_sessions.notes` — clinical, NOT parent-visible, NOT surfaced. The `parent_visible_summary` is the explicit safe carve-out.
- Care `care_session_events` — telemetry, parent-invisible (verified in `continuity-api.ts` exclusion list).
- Care `care_session_notes.progress_notes` / `key_behaviors` — clinical. The `parent_note` field (when `parent_visible=true`) is the explicit safe carve-out.
- Voice notes — RLS gates `parent_visible=true` only; storage paths never reach the Learn client.

---

## 4. Cross-domain privacy matrix

The matrix specifies, for every direction of context flow, what travels
and what does not.

### 4.1 Therapy → School

| Item | Propagates? | Notes |
|---|---|---|
| Therapy session summary (`parent_visible_summary`) | NO — Care-to-school staff path does not exist. Surfaces parent-visibly on Learn home and Care detail. | School staff have zero Care access. |
| Therapist voice note | NO. | School staff have zero Care access. |
| Care reinforcement focus (`care_support_context.focus_text`) | NO. | Parent sees it (Phase 5A adds Learn home line); school staff do not. |
| Care milestones / home activities | NO. | Parent sees them on Care; school staff don't. |
| Clinical detail (raw notes, telemetry, cancellations) | NEVER. | Stays in Care. |

### 4.2 School → Therapy

| Item | Propagates? | Notes |
|---|---|---|
| School support context (`student_support_context.focus_text`) | NO. | Therapists do not get a school-context surface. |
| `progress_observations` (parent_visible=true) | NO. | Same. |
| Attendance | NO. | Same. |
| Proud moments | NO. | Same. |
| Class updates | NO. | Same. |
| Operational (billing, consents, doc requests) | NEVER. | Stays in school side. |

### 4.3 Parent (writing) → School

| Item | Propagates? | Notes |
|---|---|---|
| Absence notification | YES (already exists). | Parent submits, school staff see. |
| Reactions on proud moments | YES (already exists). | Reaction stored; school sees aggregated. |
| Parent observation in Care | NEVER. | Domain-isolated. |

### 4.4 Parent (writing) → Therapy

| Item | Propagates? | Notes |
|---|---|---|
| Care parent observation | YES (already exists). | Parent writes in Care, therapist reads. Never surfaces back to parent as a "you wrote this" reminder. |
| Reaction echo / continuity-echo phrases | NO. | LocalStorage-only by design (Learn dashboard); never reaches school or therapist. |
| Voice playback signed-URL fetch | n/a. | Audit-logged on Care side via `log_care_voice_note_access`. |

### 4.5 Future Med → School / Therapy / Parent

| Item | Propagates? | Notes |
|---|---|---|
| Medical diagnosis detail | NEVER to school or therapy staff. Parent sees on Med page only. |
| Medical reinforcement context (e.g. "currently on a 2-week elimination diet — daycare should know") | Selectively, parent-visibly. Mirrors the §8 Care-support-context pattern. |
| Allergy info | Parent-visible everywhere it's clinically necessary (this is a future operational signal, not a continuity item). |
| Appointment metadata | NEVER cross-domain. |

### 4.6 Cross-clinic propagation (Phase 4 schema)

The `child_profile_access_grants` table allows clinic-to-clinic identity
sharing under explicit consent. **None of those grants surface to the parent
UI as orchestration signals.** They exist for clinic-staff visibility, not
for parent-facing prep packets. Maintain this boundary.

---

## 5. Prep & transition model

Prep context is **derived per-visit from existing data**, never stored as a
prepared packet. There is no "child summary" object. There is no
"recommendation engine." Prep emerges from the reinforcement line + recent
journey entries + the parent's existing observation history within the
relevant domain.

### 5.1 Where prep already happens implicitly

| Audience | Where they prep | What they see |
|---|---|---|
| Parent | Learn dashboard hero + Care `/parent/[childId]` hero/strip | Today's most relevant moment; recent therapy summary; voice note nudge; school support context line; (Phase 5A:) Care support context line |
| Therapist | Care `/session/[id]/prep` page (Care-side, not parent-facing) | Therapist-side continuity; not in scope for Lauris Parent |
| Teacher | School staff views | School-side only |
| Future Med staff | Med staff views | Future |

### 5.2 Prep continuity rules

- **No prepared "summary documents."** A parent-visible session prep should never be a pre-rendered report.
- **No "things to mention to your therapist" lists.** Prep is observation, not instruction.
- **No "before next session" checklists.** Lauris doesn't enqueue tasks for the parent.
- **No predictive scoring of any kind.** "Risk packets" are explicitly forbidden in the directive.
- **Reinforcement context is the prep surface.** A parent reads "we're working on transitions this week" and that IS the prep — no separate prep view needed.
- **Recent journey items are the second prep surface.** Already present; not duplicated.
- **The parent's own observations are the third prep surface (in Care).** Already present; the parent writes one, the therapist reads it, the parent is not pinged.

### 5.3 Prep continuity windows (recommended)

| Item | Resurface during prep within | Notes |
|---|---|---|
| Active reinforcement context | While current (rolling). | Already-fresh by definition. |
| Recent therapy session summary | ≤7d. | Already capped in journey feed. |
| Recent parent observation | ≤14d. | Already on Care detail page. |
| Recent voice note | ≤7d. | Already gated. |
| Milestone / proud moment | Without window — page-internal only. | Don't resurface milestones unbidden. |
| Continuity gap (>21d) | Therapist-side only. | Not parent-facing. |

### 5.4 Prep surfaces that must NOT be added

- Centralised "Visit Prep" page that aggregates across domains.
- "What's worth knowing before therapy" auto-generated card.
- "Risk profile" / "behaviour summary" report.
- "Recommended discussion topics."
- "Things you haven't reviewed."

---

## 6. Parent role in handoff

The parent NEVER becomes a coordinator. Lauris does the carry-over; the
parent does the parenting.

### 6.1 What parents actively contribute

- Mark absence (already exists; one-tap from family drawer).
- React to proud moments (already exists; optional).
- Write a parent observation in Care (already exists; voluntary).
- Save a private reflection / continuity echo (already exists; localStorage-only, never propagates).
- Acknowledge a support-focus chip in Care (already exists; voluntary).

### 6.2 What parents should NEVER be burdened with

- "Please update both providers."
- "Forward this to your therapist."
- "Add this to the school's notes."
- "Share with care team."
- "Synchronize your providers."
- "Confirm receipt at all locations."
- "Read your X new updates across N domains."
- "You haven't responded to N items."
- "Complete N tasks before tomorrow's session."

Any future feature wanting "the parent should…" verbs must be rejected at
the design phase.

### 6.3 What happens passively (no parent action)

- Care therapist-set support context becomes visible on Learn parent home (Phase 5A — see §8).
- Care therapist-shared voice note shows up as a Learn priority signal (Phase 3B).
- Care therapy session summary appears in Learn journey feed (Phase 2 RPC).
- School support context already shows on Learn dashboard.
- Cross-app deep-links go to the right anchor (Phase 3C).
- Silence rules apply automatically when conflicting domains stack (Phase 4B).

### 6.4 What stays optional

- Continuity echo / private reflection — parent toggles; local-only.
- Acknowledgement chips on support focus — parent taps; tagged observation row.
- Reactions on proud moments — parent taps; school sees aggregated.
- Voice-note listening — parent opens link; signed URL is minted once per request.

The pattern: the parent's optional actions affect THEIR experience (or
quietly inform the relevant domain), never cascade across domains.

---

## 7. Continuity handoff audit summary

### 7.1 What's working

- **Carry-over discipline is correct today.** Two parent-visible cross-app reads exist (therapy summary + voice note). Both go through RLS-protected paths. Neither surfaces clinical detail.
- **No staff-to-staff cross-org propagation exists.** Each side's staff sees only their own org. The Phase 4 cross-org grant table only authorises clinic-to-clinic identity for clinic-staff visibility, not parent-facing.
- **Parent observations stay in their writing domain.** Care parent observations never surface to school; school reactions never surface to therapy.
- **The parent is never a coordinator.** No "please forward" UI.

### 7.2 What's missing (audit finding for §8)

- **Care reinforcement context does not yet reach Learn.** A parent looking at the Learn home today sees the school's "current focus" line if set, but no equivalent surface for the therapist's current focus. The therapist's line lives only on Care, requiring the parent to switch apps to read it.
- This is precisely the carry-over Phase 3C §5.3 and Phase 4B §7.3 flagged
  as deferred. The audit now supports adding it because:
  - `care_support_context.focus_text` is already parent-visible by Care RLS (`csc_parent_select`).
  - It is plain-language, parent-safe content authored explicitly for parent reading.
  - Bringing it to Learn does not change visibility — same RLS, same data, different surface.
  - It respects the §3 carry-over rule (Reinforcement Context propagates parent-visibly).
  - It respects the §4 privacy matrix (Care → Learn parent home, not to school staff).
  - It respects Phase 4A §3 "one line per domain" cadence (school + Care = two lines, max).
  - It respects Phase 4B §7.3 ("reinforcement strips don't silence under operational state").

### 7.3 Reinforcement carry-over findings

| Direction | Implemented today | After Phase 5A |
|---|---|---|
| School reinforcement → Learn parent home | ✅ (existing) | unchanged |
| Care reinforcement → Care parent detail page | ✅ (existing) | unchanged |
| **Care reinforcement → Learn parent home** | ❌ | ✅ added |
| School reinforcement → Care | ❌ (and should stay so — staff don't read each other's contexts) | unchanged |
| Care reinforcement → School staff view | ❌ (and should stay so) | unchanged |

### 7.4 Privacy boundary findings

All confirmed clean:
- `care_parent_observations.cpo_parent_select_own` — parents read only their own.
- `care_support_context.csc_parent_select` — gated by `care_family_members`.
- `care_voice_notes.cvn_parent_select` — gated by `care_family_members` + `parent_visible=true`.
- `therapy_sessions.notes` — clinical, not exposed by `list_parent_visible_therapy_updates`.
- `care_session_events` — explicitly excluded from continuity feeds.
- Cross-org `child_profile_access_grants` — clinic-staff visibility only; never parent-UI.

### 7.5 Parent burden risks identified

| Risk | Status |
|---|---|
| "Please update all providers" | Forbidden in §6.2; not in code. |
| Task / checklist UI for parents | Forbidden; not in code. |
| Coordination inbox | Forbidden; not in code. |
| Cross-app messaging UI | Forbidden; not in code. |
| Required reactions / mandatory acknowledgements | Forbidden; current reactions are optional. |
| "Read N updates" counter | Forbidden; not in code (Phase 4A §6.1). |

### 7.6 Over-sharing risks identified

| Risk | Status |
|---|---|
| Raw clinical notes leaking to parent UI | Mitigated — only `parent_visible_summary` / `parent_note` / `parent_visible=true` fields surface. |
| Staff cross-org visibility | Mitigated — RLS scoped per org; cross-org via explicit grants only. |
| Therapy attribution leaking sensitive provider data | Mitigated — Care's support context exposes `set_by_profile_id` but Learn renders only "From your therapist" without resolving to a name. |
| Storage paths to client | Mitigated — voice-note storage path stays Care-side; signed URL minted once. |
| Care-to-school staff propagation | Mitigated — no code path. |

### 7.7 Under-sharing risks identified

| Risk | Status |
|---|---|
| Parent unaware of therapist's current focus while in Learn | **Fixed in Phase 5A §8.** |
| Parent unaware of recent therapy session | Already handled (journey feed + voice note signal). |
| Parent unaware of school context while in Care | Out of scope; Care intentionally stays therapy-only by design. |

### 7.8 Emotional safety risks identified

| Risk | Status |
|---|---|
| Two stacking reinforcement lines feeling "heavy" | Phase 4A "one line per domain" rule preserved; max 2 lines today, max 3 when Med ships. |
| The Care reinforcement line being interpretively coupled to acute school state | Reinforcement lines never re-colour under operational state (§4.6 rule from 4B; §6.4 from 4A). |
| Cross-domain "concerning trend" inference | Anti-pattern; never implemented; documented forbidden. |
| Mis-attribution (the parent reading the Care line as a school message) | Mitigated by explicit "From your therapist" attribution. |

---

## 8. Implementation in this phase — one reinforcement carry-over

The audit identifies exactly one defensible handoff worth adding now:
bring Care's `care_support_context.focus_text` into the Learn parent home
as a calm second reinforcement line, paired with the existing school
`student_support_context` line.

**Why this is the right minimum.**

1. **Single new fetch** — `fetchCareSupportContext` selects only
   `focus_text` and `updated_at` from `care_support_context` filtered by
   `child_profile_id` (no clinic_organization_id filter — RLS already
   gates by `care_family_members`, and the most recent updated row wins
   when a child is associated with multiple clinics).
2. **Single new state slot + single new render block** in the dashboard.
3. **Zero new tables, zero new RPCs, zero new RLS.** Care's existing
   `csc_parent_select` policy does the gating.
4. **Zero new disclosure** — the Care reinforcement line is already
   parent-visible on Care. Surfacing it on Learn is the same data on a
   different page; the parent reads it without switching apps.
5. **Care-unlinked parents (school-only) naturally see nothing** — RLS
   returns zero rows.
6. **Therapist attribution stays generic** — Learn renders "From your
   therapist · updated Nd ago" without resolving `set_by_profile_id` to
   a name (would require joining `profiles`, which is RLS-restricted for
   the parent). Matches the voice the Care side already uses.
7. **Phase 4A "one line per domain" rule preserved** — school + therapy
   stack to two narrative lines, max.
8. **Phase 4B silence rules preserved** — the line is Reinforcement
   Context, not a Signal; reinforcement never silences under operational
   state.

**Out of scope, intentionally:**

- Med support-context slot (premature; no Med data exists).
- Resolving therapist attribution to a name (would require a parent-safe RPC; out of scope).
- Multi-clinic UI when a child has more than one Care clinic (the RLS-most-recent fallback is acceptable for v1; a future "two clinics, two focuses" surface would need its own design).
- A unified "Reinforcement strip" combining school + therapy + medical (the convergence target named in Phase 3C; still premature — Med isn't shipped).
- Care home activities surfacing on Learn (different cadence class; not Reinforcement).
- School support context surfacing on Care (Care intentionally therapy-only).
- A "Visit Prep" page (anti-pattern per §5.4).

---

## 9. Future Med readiness

When Lauris Med ships:

1. **The §4.5 row of the privacy matrix is the contract.** Medical reinforcement (e.g. "currently on elimination diet — daycare aware") propagates parent-visibly through the same pattern this phase establishes for Care. Medical diagnosis detail does not.
2. **A third reinforcement line is added to the Learn dashboard.** The "one line per domain" cap accommodates exactly this; Phase 5A doesn't pre-build it.
3. **The §6 "no parent-as-coordinator" rule extends.** Medical staff never instruct the parent to forward to therapy or school via Lauris UI.
4. **Acute medical state** uses the placeholder reserved in Phase 4B §4.2 (top-of-hero slot). Not built.
5. **The §8 fetch pattern generalises** — `fetchMedicalReinforcementContext` would be a single select with RLS gating, no new RPC.

---

## 10. Files inspected (Phase 5A)

**Learn**
- `src/app/parent/dashboard/page.tsx` — hero + SupportContextBlock placement + loadAll fetch wiring
- `src/features/parent-journey/queries.ts` — `fetchSupportContext` (school side) for shape parity
- `src/features/parent-journey/helpers.ts` — Tier D35 (therapy) referenced for cadence
- `src/features/parent-journey/types.ts` — `SchoolSupportContext` shape

**Care**
- `lib/api/support-context-api.ts` — confirms parent SELECT path + columns
- `supabase/migrations/094_parent_reinforcement.sql` — confirms RLS policy `csc_parent_select` gates on `care_family_members`
- `lib/api/parent-api.ts` — confirms `care_family_members` is the parent-linkage table
- `app/parent/[childId]/page.tsx` — confirms Care-side support-focus card rendering for voice/style parity

---

## 11. Future handoff work intentionally not started

- Transition Context surface ("had a rough morning before therapy").
- Cross-clinic reinforcement (parent has therapy at two clinics; whose context wins).
- Therapist name resolution in Learn (`set_by_profile_id` → readable name).
- Care home activities surfaced in Learn home.
- School observations surfaced to Care.
- A "Visit Prep" surface aggregating across domains (anti-pattern unless ever explicitly justified).
- Medical reinforcement propagation (waits until Med ships).
- Cross-domain "concerning trend" inference (anti-pattern — forbidden).
