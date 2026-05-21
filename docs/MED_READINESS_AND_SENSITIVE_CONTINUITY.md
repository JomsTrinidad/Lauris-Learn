# Med Readiness & Sensitive Continuity — Phase 6B

**Status.** Architecture + safety normalization, plus one surgical
sensitive-propagation suppression. **No Med feature is built in this phase.**
This document establishes the safety contract that any future Lauris Med
integration must satisfy, and removes one diagnosis-revealing field that is
currently propagated to the parent client but never rendered.

**Scope.** Define the propagation boundaries, consent semantics, orchestration
constraints, and sensitive-continuity taxonomy that protect a child from
being re-framed by medical context once Lauris Med exists. This is the
foundational safety layer that must precede any Med implementation.

**Out of scope.** No Med tables. No Med RPCs. No Med UI. No Med data feed. No
diagnosis storage. No medical record surfaces. No new consent tables. No new
RLS. No background jobs. No notification infrastructure. No speculative Med
scaffolding (per the established "do not pre-build semantics neither app has
earned" rule).

**What Lauris Med will be (so the boundaries are concrete):** a future sibling
app for a child's medical/clinical providers (`organizations.kind =
'medical_practice'`), structurally analogous to Lauris Care, sharing the same
Supabase project, the same `child_profiles` identity spine, and the same
consent-grant infrastructure. This phase prepares the parent-continuity layer
to receive Med safely.

---

## 1. The Med-readiness question

Medical context is the most identity-defining and most sensitive continuity a
child carries. A diagnosis can silently become the lens through which everyone
reads the child — "the child with X" — and once a system foregrounds it, that
framing is very hard to undo. Medical data is also the highest cross-domain
leakage risk: a school or therapy provider seeing a diagnosis they shouldn't
is a real-world harm, not a UX nit.

**The Lauris answer:** Med inherits the existing parent-continuity philosophy
unchanged, plus three Med-specific hard constraints:

1. **Medical never defines identity.** A diagnosis is never the child's
   primary frame, never a hero by default, never a permanent label.
2. **Medical never leaks.** Cross-domain medical visibility flows ONLY through
   the explicit, consent-gated, time-bounded grant infrastructure — never
   automatically, never as a side effect of a relationship.
3. **Medical stays minimal on the parent home.** Only what a medical provider
   explicitly publishes for parents surfaces, and only through the strict
   parent-safe RPC pattern — raw clinical detail never reaches the client.

---

## 2. Current Med surface area (what exists today)

Inspected directly. Med is **not built**, but the cross-app foundation already
treats `medical_practice` as a first-class org kind.

| Surface | State | Notes |
|---|---|---|
| `organizations.kind = 'medical_practice'` | ✅ exists | First-class org kind alongside `school` / `clinic` |
| `child_profile_access_grants` (074) | ✅ exists | Consent spine; `target_organization_id` can be a medical_practice org; `scope ∈ {identity_only, identity_with_identifiers}`; time-bounded (`valid_until`, default 1y); revocable; auditable; one active grant per (child, target_org) |
| `caller_visible_child_profile_ids_for_identifiers()` (075) | ✅ exists | Identifier-sharing helper with explicit `o.kind IN ('clinic','medical_practice')` guard |
| `document_organization_access_grants` (076) | ✅ exists | Per-document cross-org sharing; target can be clinic/medical_practice; immutable permissions JSONB |
| `list_parent_child_connected_services` (091) | ✅ exists | Maps `medical_practice` → `source_category 'medical'`; returns ONLY org name + category + relationship_kind + status; **no clinical data, no identifiers, no documents** |
| `fetchServicePresence` (Learn queries) | ✅ exists | Calls the connected-services RPC; sets `medical: { connected, practiceName }` |
| `getServiceContextLine` (Learn helpers) | ✅ exists | Renders the **generic** phrase "with medical care" — NOT the practice name |
| `sourceCategory: "medical"` (Learn types) | ✅ reserved | In `ParentJourneyItem`; `JourneyFilter` includes `medical` |
| `CAT_STYLES.medical` (emerald) | ✅ reserved | Dashboard source-encoding; brand label "Medical" |
| `getContinuitySignals` medical arm | ✅ exists | Medical participates in domain freshness / quiet signals (presence-driven) |
| **Medical data feed RPC** | ❌ does NOT exist | No `list_parent_visible_medical_updates` — Med has presence detection but **no data feed** |
| **Medical hero tier** | ❌ does NOT exist | Hero chain matches only `school` + `therapy` source categories → medical is feed-only by default |
| **Medical priority-card tier** | ❌ does NOT exist | `getFeaturedParentCards` has no medical tier |
| **Medical reinforcement carry-over** | ❌ does NOT exist | Phase 5A `fetchCareSupportContext` is therapy-only; no medical reinforcement line |
| **Medical-acute hero slot** | ❌ documented-only | Phase 4B §4.2 reserved it; NOT in code |

---

## 3. Med-readiness strengths (verified)

1. **Consent-gated identity sharing already covers medical.** A medical
   practice can only read a child's `child_profiles` row through an active,
   time-bounded, revocable `child_profile_access_grants` row (074). No
   relationship alone grants identity visibility. Verified: the grant table's
   `target_organization_id` is org-kind-agnostic, and 075's identifier helper
   has an explicit `kind IN ('clinic','medical_practice')` guard.

2. **The parent-safe RPC pattern is a strict, proven template.** `list_parent_visible_therapy_updates`
   (091) is SECURITY DEFINER, guarded by `parent_student_ids()`, and returns
   ONLY an explicit allow-list (id, clinic_name, therapy_type, scheduled_at,
   status, parent_visible_summary, therapist_name). It **excludes** internal
   notes, raw clinical data, sub-tables, and documents. A future Med feed RPC
   inherits this template (and §6 tightens it for medical sensitivity).

3. **Cross-org isolation is structural.** School RLS has no clinic/medical arm;
   clinic/medical RLS (when built) has no school arm. Cross-org reads require
   explicit grants. Smoke tests across migrations 074–082 mechanically assert
   the school-side helpers stay byte-clean.

4. **Medical is feed-only by default in orchestration.** The hero tier chain
   matches only `sourceCategory === "school"` (tiers A/B/C/E) and `=== "therapy"`
   (tier D35); there is **no medical tier**. The priority-card chain has no
   medical tier. So even if a future Med feed populated `sourceCategory:
   "medical"` items, they would appear chronologically in the journey feed and
   would **not** auto-promote to hero or priority. Medical cannot dominate the
   narrative without a deliberate future code change — which §5 governs.

5. **Practice names are framed generically.** `getServiceContextLine` says
   "with medical care," never the practice name. The journey filter, domain
   labels, and continuity signals all use the generic "medical" / "Medical
   care" label. No diagnosis-revealing practice name is rendered today.

6. **All prior continuity philosophy generalizes to medical.** Phase 4B
   (silence rules), 5B (freshness/decay), 5C (succession), 5D (reflection/no
   analytics), 5E (lifecycle/child-bound memory) all apply to medical
   continuity unchanged.

---

## 4. Med-readiness risks (verified)

1. **No documented parent-safe medical field allow-list.** When Med ships its
   feed RPC, a developer could surface raw clinical fields (diagnoses,
   medications, lab results, ICD codes, visit reasons) if there is no explicit
   contract. The therapy RPC excludes `notes`; medical needs a **stricter
   allow-list** because medical data is categorically more identity-defining.
   §6 + §7 establish that contract.

2. **No documented medical-dominance prevention.** Phase 4B "reserved" a
   medical-acute hero slot but did not write it. The risk: when Med ships, a
   dev places medical-acute at the TOP of the hero/priority chain (above
   consent), making medical dominate. §5 establishes the rule that medical is
   feed-only by default and only narrowly-scoped acute medical (allergy/ER)
   earns a hero slot, framed neutrally.

3. **Diagnosis-revealing practice name propagated to the client (LIVE).** The
   medical practice name flows from the connected-services RPC into
   `ServicePresence.medical.practiceName` on the parent dashboard. It is
   **never rendered** (only `.connected` is read), but a practice name is
   diagnosis-revealing ("Pediatric Oncology Associates," "Child Psychiatry
   Center"). Carrying it into client state invites future accidental rendering,
   state-inspector exposure, or error-log capture. This is the one LIVE,
   non-speculative sensitive-propagation surface. **Fixed in §8.**

4. **Medical presence surfaces existence before any data exists.** A child with
   a `medical_practice` membership produces `medical.connected = true`, which
   makes "with medical care" appear in the service context line and a "Medical"
   journey filter chip appear. This is calm (Phase 4A "connected but quiet"
   pattern) and acceptable, but §5 documents that medical presence must never
   escalate beyond a neutral chip without published, parent-safe data.

5. **`FILTER_EMPTY.medical` copy will read slightly off once a medical
   membership exists.** The chip renders when `medical.connected`, but the
   empty-state copy says "Medical updates are not connected yet." Minor copy
   nuance, not a safety issue; noted for the future Med phase, not changed here.

---

## 5. Sensitive continuity taxonomy

Medical continuity is classified more conservatively than school/therapy. Each
class defines what may surface, where, and under what consent.

| Class | Example | Parent home | Cross-domain (staff) | Consent required | Identity-defining? |
|---|---|---|---|---|---|
| **Connection presence** | "a medical practice is linked" | neutral chip / "with medical care" only | never to other-domain staff | membership (no grant) | no |
| **Published medical update** | a provider's explicit parent-facing summary | feed-only (never hero by default) | never to other-domain staff | parent-safe RPC + provider published it | no (must be authored non-diagnostically) |
| **Medical reinforcement context** | "currently on a 2-week elimination diet — daycare aware" | one calm reinforcement line (when Med ships), freshness-gated | never auto; parent-driven only | parent-visible by provider | no |
| **Operational medical signal** | "vaccine due," "appointment tomorrow" | priority signal (calm, defers to school urgent action per 4B) | never to other-domain staff | parent-safe RPC | no |
| **Acute medical state** | allergic reaction, ER visit | the ONE narrow case that may lead the hero — framed neutrally ("{Name} needs care today"), never diagnosis-named | never to other-domain staff | parent-safe RPC | no |
| **Diagnosis / clinical detail** | ICD codes, diagnoses, meds, labs, raw notes | **NEVER on the parent home** | **NEVER cross-domain** | stays on the Med provider surface only | **YES — the thing we most protect against** |
| **Medical identifiers** | medical record number, insurance ID | never on parent home; clinic/med side only via `identity_with_identifiers` grant | grant-gated only | explicit grant (075) | partially |

**The bright line:** everything from "Diagnosis / clinical detail" downward
**never** reaches the parent home or any other domain's staff. Only the
provider's explicitly-published, non-diagnostic, parent-facing content (the top
five rows) can surface, and only through the parent-safe RPC pattern.

---

## 6. Med orchestration principles

When Lauris Med ships, its continuity plugs into the existing parent
surfaces under these constraints (extends Phase 4B orchestration + Phase 5
freshness/succession):

1. **Feed-only by default.** Medical items enter the journey feed
   chronologically with `sourceCategory: "medical"`. They do NOT get a hero
   tier or priority-card tier unless §6.3 applies. (This is the current code's
   safe default — preserve it.)

2. **Medical defers in silence conflicts.** Per Phase 4B §7.2: medical signals
   defer to a pending school urgent action (consent / doc request) in the
   priority surface, exactly as the therapy voice-note signal does. Medical
   does not stack a second attention ask alongside a school action.

3. **Only acute medical may lead the hero — and only neutrally.** The single
   exception to feed-only: a genuinely acute medical state (allergic reaction,
   ER, urgent same-day need). When Med ships this, it earns a top hero slot
   (above school acute, per the asymmetry documented in
   CROSS_DOMAIN_ORCHESTRATION.md §4.2) BUT must be framed neutrally and
   action-oriented ("{Name} needs care today — tap for details"), never
   diagnosis-named, never alarmist. Routine medical (a normal checkup summary)
   never leads the hero.

4. **No medical reinforcement stacking.** Per Phase 4A "one line per domain":
   when Med ships a reinforcement line, the parent home shows at most three
   reinforcement lines (school + therapy + medical), each freshness-gated
   (Phase 5B 45d) and succession-ordered (Phase 5C). Medical reinforcement is
   subject to the same fade + recency rules.

5. **Medical never re-frames identity.** No "the child with {diagnosis}"
   surface. No diagnosis tag on the child header. No diagnosis-derived avatar,
   color, or label. The child's identity anchor stays child-bound (Phase 5E),
   never diagnosis-bound.

6. **Medical reflection follows the no-analytics rule.** Per Phase 5D: no
   medical trend charts, no symptom graphs, no "health score," no
   percentile-against-norms, no AI medical summaries. Medical milestones (e.g.,
   "first solid food tolerated") are Memory class — narrative, cumulative,
   never quantified.

7. **Medical inherits lifecycle child-binding.** Per Phase 5E: medical memory
   is keyed on the child, survives provider changes, and never resets. A new
   pediatrician appends to the journey; the old provider's published summaries
   persist for as long as the parent link persists.

---

## 7. Consent & safety matrix

Per direction of medical context flow. "Allowed" means the only sanctioned
path; everything else is forbidden.

| Direction | Allowed | Forbidden | Mechanism |
|---|---|---|---|
| **Med → parent home** | Provider's explicitly-published, non-diagnostic, parent-facing content via a parent-safe RPC | Raw notes, diagnoses, meds, labs, ICD codes, visit reasons, practice name | SECURITY DEFINER RPC guarded by `parent_student_ids()`, explicit allow-list (§7.1) |
| **Med → school staff** | NOTHING | Any medical data | No code path; school RLS has no medical arm |
| **Med → therapy staff** | NOTHING automatic | Any medical data | Cross-org only via explicit `child_profile_access_grants` / `document_organization_access_grants` (clinic-staff visibility, never parent-UI) |
| **School → Med** | NOTHING automatic | School operational/discipline detail | Cross-org via explicit grant only |
| **Therapy → Med** | NOTHING automatic | Clinical therapy notes | Cross-org via explicit grant only |
| **Med identity → other org** | `child_profiles` row, consent-gated | `child_identifiers` unless `identity_with_identifiers` grant | `child_profile_access_grants` (074/075) |
| **Med documents → other org** | Per-document, consent-gated, permissioned | Bulk/automatic document access | `document_organization_access_grants` (076) |
| **Parent → Med** | Parent-authored observations to their own Med provider (when Med ships an equivalent of `care_parent_observations`) | Cross-provider forwarding by the parent (no coordinator burden) | Parent-bound; never auto-propagates |

### 7.1 The future medical-feed RPC contract (binding for the Med phase)

Any `list_parent_visible_medical_updates`-style RPC MUST:

- Be `SECURITY DEFINER STABLE`, `SET search_path = public`.
- Guard with `parent_student_ids()` (return empty for non-guardians).
- Resolve `child_profile_id` from `students` server-side.
- Return ONLY an explicit allow-list of **provider-published, parent-safe,
  non-diagnostic** fields. The allow-list MUST exclude: diagnoses, ICD/SNOMED
  codes, medication names/dosages, lab values, raw clinical notes, visit
  reasons, provider specialty if diagnosis-revealing, and the practice name if
  diagnosis-revealing.
- Require an explicit provider-published flag (the medical analogue of
  `parent_visible_summary IS NOT NULL AND <> ''`) — nothing surfaces unless a
  provider deliberately published it for parents.
- `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`.
- Be accompanied by a smoke test asserting that school-side and therapy-side
  helpers remain byte-clean (the established isolation-regression pattern).

---

## 8. Implementation in this phase — suppress one sensitive propagation

The audit identifies exactly one LIVE, non-speculative sensitive-propagation
surface: the medical practice name flows into the parent dashboard's client
state (`ServicePresence.medical.practiceName`) but is **never rendered**.

A medical practice name is diagnosis-revealing ("Pediatric Neurology
Associates," "Children's Oncology Center," "Child & Adolescent Psychiatry").
Carrying it into client state with no functional use invites future accidental
rendering, exposes it to browser state inspectors, and risks capture in error
logs — directly against the directive's "sensitive-context overexposure" and
"diagnosis-centric identity" concerns.

**Fix.** Remove `practiceName` from the parent-side `ServicePresence.medical`
shape and stop capturing it in `fetchServicePresence`. The parent home reads
only `medical.connected` (boolean) — the journey filter chip and the
generic "with medical care" service line both use the boolean, never the name.
Zero UX change; the diagnosis-revealing field simply stops reaching the client.

**Why this is the right minimum.**

1. **LIVE, not speculative.** The field exists and propagates today; this is
   not Med scaffolding.
2. **Med-safety on-theme.** A practice name is the single most
   diagnosis-revealing piece of medical metadata currently reaching the parent
   client. Removing it is "suppress one sensitive propagation path."
3. **Zero behaviour change.** Verified by grep: `practiceName` is only defined
   (`types.ts`) and assigned (`queries.ts`); it is never read or rendered.
4. **Surgical.** Two edits: drop the field from the type's medical arm; drop
   the assignment in `fetchServicePresence`. `medicalEntry` is still used in
   the ternary, so no orphaned variable.
5. **Reversible.** A future Med phase that genuinely needs the practice name
   re-introduces it deliberately, behind a safety review (e.g., shown only on a
   tap-through detail surface, never on the home glance).

**Deliberately NOT done (would be speculative Med scaffolding).**

- Writing a medical-feed RPC or its allow-list in code (§7.1 documents the
  contract; the RPC ships with Med).
- Adding a medical hero/priority tier (the feed-only default is the safe
  posture; §6 governs the future addition).
- Adding a medical-acute slot (documented in §6.3 + CROSS_DOMAIN_ORCHESTRATION.md
  §4.2; built with Med).
- Removing the therapy `clinicName` (also captured-but-unused, but less
  diagnosis-revealing and out of this phase's Med scope — noted in §11).
- Any Care-repo change.

---

## 9. Sensitive propagation findings

| # | Finding | Status |
|---|---|---|
| 9.1 | Medical practice name propagated to client, never rendered | **Fixed this phase** — removed from `ServicePresence` |
| 9.2 | No documented medical-feed allow-list contract | Documented (§7.1) for the future Med phase |
| 9.3 | No documented medical-dominance prevention | Documented (§6.1–§6.3) — feed-only default, narrow acute exception, neutral framing |
| 9.4 | Diagnosis / clinical detail boundary | Verified clean — no path exists; §5 bright line + §7 matrix codify it |
| 9.5 | Cross-domain medical leakage (school/therapy staff) | Verified clean — no medical arm in school RLS; cross-org only via explicit grants |
| 9.6 | Consent spine covers medical | Verified — `child_profile_access_grants` (074) targets medical_practice; time-bounded, revocable, auditable |
| 9.7 | Generic "medical care" framing | Verified clean — practice name never in rendered copy |
| 9.8 | Therapy `clinicName` also captured-but-unused | Noted (§11) — lower-priority parallel; out of Med scope |
| 9.9 | Parent never a coordinator across providers | Verified — no "forward to your doctor" UI; §7 forbids it |

---

## 10. Files inspected (Phase 6B)

**Learn — schema**
- `supabase/migrations/074_child_profile_access_grants.sql` — consent grant table; medical_practice as target org; identity_only / identity_with_identifiers scope; lifecycle + immutability
- `supabase/migrations/075_identifier_sharing.sql` (per CLAUDE.md) — identifier helper with `kind IN ('clinic','medical_practice')` guard
- `supabase/migrations/091_parent_safe_service_rpcs.sql` — `list_parent_child_connected_services` (maps medical_practice → 'medical'), `list_parent_visible_therapy_updates` (the strict parent-safe RPC template)
- `supabase/migrations/106_fix_parent_safe_rpcs_ambiguous_id.sql` (referenced) — RPC ambiguous-id fix

**Learn — app**
- `src/features/parent-journey/queries.ts` — `fetchServicePresence` (medical.practiceName capture site), `fetchJourneyFeed` (no medical RPC), `fetchCareSupportContext` (therapy-only)
- `src/features/parent-journey/types.ts` — `ServicePresence` (medical.practiceName), `SourceCategory` (medical reserved), `JourneyFilter`
- `src/features/parent-journey/helpers.ts` — `getServiceContextLine` ("with medical care" generic), hero tier chain (no medical tier), `getFeaturedParentCards` (no medical tier), `getContinuitySignals` (medical arm), DOMAIN_LABEL "medical care"
- `src/app/parent/dashboard/page.tsx` — servicePresence usage (only `.connected`), CAT_STYLES.medical (emerald), journey filter chip medical branch, FILTER_EMPTY.medical

**Cross-references**
- `docs/CROSS_DOMAIN_ORCHESTRATION.md` §4.2 (medical-acute reservation), `docs/CROSS_DOMAIN_HANDOFF.md` §4.5 (Med privacy row), `docs/PARENT_COGNITIVE_RHYTHM.md` (one-line-per-domain), `docs/CONTINUITY_FRESHNESS_AND_DECAY.md` (45d gate generalizes), `docs/CONTINUITY_REFLECTION_AND_MEMORY.md` (no-analytics), `docs/TRANSITION_AND_LIFECYCLE_CONTINUITY.md` (child-bound memory)

---

## 11. Future Med work intentionally not started

- **Medical-feed RPC** (`list_parent_visible_medical_updates`) — ships with Med, must satisfy §7.1.
- **Medical reinforcement carry-over** — the medical analogue of Phase 5A `fetchCareSupportContext`; freshness-gated, succession-ordered, one line per domain.
- **Medical-acute hero slot** — narrow, neutral, action-oriented (§6.3).
- **Medical operational signals** (vaccine due, appointment tomorrow) — defers to school urgent action (§6.2).
- **Therapy `clinicName` parallel review** — also captured-but-unused (`ServicePresence.therapy.clinicName`); less diagnosis-revealing, out of Med scope; consider removing in a future cleanup for symmetry.
- **`FILTER_EMPTY.medical` copy** — re-word once a medical membership + feed exist ("connected but quiet" rather than "not connected yet").
- **Parent-authored medical observations** — the Med analogue of `care_parent_observations`; parent-bound; never auto-forwarded.

---

## 12. Permanent Med-safety rules (codified)

1. Medical never defines identity — no diagnosis label, tag, color, or "the child with X" framing, ever.
2. Medical is feed-only by default — no hero, no priority card, unless a narrow, neutral acute exception applies.
3. Only acute medical may lead the hero, framed neutrally and action-oriented, never diagnosis-named.
4. Diagnoses, meds, labs, codes, raw notes never reach the parent home or any other domain's staff — full stop.
5. Cross-domain medical visibility flows ONLY through explicit, time-bounded, revocable consent grants — never automatically.
6. The parent-safe medical RPC returns an explicit, provider-published, non-diagnostic allow-list — nothing implicit.
7. Practice names are diagnosis-revealing — never rendered on the parent home; never carried into client state without a deliberate safety review.
8. Medical reflection obeys the no-analytics rule — no charts, scores, percentiles, trends, or AI summaries.
9. Medical reinforcement is one line per domain, freshness-gated, succession-ordered — it never stacks or dominates.
10. The parent is never a cross-provider coordinator — Lauris carries continuity; the parent does the parenting.
