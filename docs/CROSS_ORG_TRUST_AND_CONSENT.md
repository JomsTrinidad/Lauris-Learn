# Cross-Organization Trust, Consent & Visibility — Phase 6C

**Status.** Architecture + safety normalization, plus one surgical
consent-framing softening. **No new permission system, no visibility
dashboard, no IAM.** This document establishes the human-readable trust
semantics that keep cross-org visibility comprehensible and emotionally safe
as Lauris grows across school, therapy, and (future) Med — and softens the one
revocation-framing pattern that currently makes the trust-protective action
feel dangerous.

**Scope.** Define how parents and staff understand and trust continuity
visibility over time: what is explicit, what is quietly discoverable, what is
bounded, what requires action, and what must never silently propagate.

**Out of scope.** No legal/compliance systems. No HIPAA implementation. No
enterprise IAM. No permissions dashboards. No consent-automation engines. No
role explosion. No centralized access-control rewrite. No sharing analytics.
No new tables. No new RLS. No new grant types.

---

## 1. The trust question

As visibility spans school → therapy → Med, the danger is not technical
(the RLS + grant architecture is sound) — it is **comprehension**. Parents
must never feel that data moves invisibly, that they can't tell who sees
what, or that they're being asked to consent constantly. Staff must never
feel that revoking access is dangerous, or that sharing is the default.

**The Lauris answer:** trust is preserved by THREE properties already mostly
present in the architecture, made explicit here:

1. **Sharing is intentional.** Every cross-org grant is a deliberate,
   per-(child, org) action — never a bulk default, never automatic.
2. **Sharing is bounded.** Every grant is scoped, time-bounded
   (`valid_until`), and revocable. Nothing is permanent by default.
3. **Revocation is safe and reversible.** Pulling access is the
   trust-protective action; it must feel calm and re-shareable, never
   like a dangerous, irreversible mistake.

---

## 2. Current trust architecture (two consent models)

Inspected directly. Lauris has **two distinct, intentionally separate**
consent models. Conflating them is the main comprehension risk.

### 2.1 Model A — Parent → external contact (document consent)

- Tables: `document_consents` (054), `document_access_grants`.
- **Parent-driven.** The parent authorizes a specific external contact
  (doctor/therapist) to see specific documents.
- **Parent-visible.** Surfaces on the parent dashboard as the "Consent
  Needed" priority card (P10) and in `/parent/documents`.
- Scope: document / document_type / all_for_student. External grants
  always require a `consent_id`; cascade-revoked when the parent revokes.

### 2.2 Model B — School-admin → clinic/medical org (org grants)

- Tables: `child_profile_access_grants` (074, identity) +
  `document_organization_access_grants` (076, per-document).
- **School-admin-driven.** A school admin grants a clinic / medical-practice
  ORG read access to a child's identity and/or specific documents.
- Managed in the `src/features/clinic-sharing/` module (the "Clinic Sharing"
  tab in `/documents`, school-admin only).
- Time-bounded (`valid_until`, default 1y), revocable, auditable; one active
  grant per (child, target_org); scope (identity) and permissions
  (documents) are immutable post-insert (revoke-and-re-share lifecycle).
- **Asymmetric SELECT** (074): the school side sees all grants (incl.
  revoked/expired) for audit; the clinic side sees only ACTIVE grants.
- **NOT surfaced to the parent.** The parent home shows that a clinic is
  "connected" (via `list_parent_child_connected_services` → servicePresence)
  but not WHAT the school shared with it. (See §4.1 risk.)

### 2.3 The parent's window into cross-org connections

- `fetchServicePresence` → `list_parent_child_connected_services` (091)
  → `servicePresence.{therapy,medical}.connected`.
- Rendered as `getServiceContextLine` ("supported at school and in therapy
  and with medical care") when ≥2 services are connected, and as the
  journey filter chips (School / Therapy / Medical).
- This is **presence-only**: the parent learns their child is connected to a
  therapy/medical org. It does not (and should not) enumerate documents or
  identity fields.

---

## 3. Trust strengths (verified)

1. **Sharing is per-(child, org), never bulk.** Each grant is one child to
   one org, deliberately issued. No "share all students with clinic X"
   path exists.
2. **Everything is time-bounded.** `valid_until` defaults to 1 year; the
   helpers enforce `valid_until > NOW()` inline — expired grants stop
   granting access even before any status flip.
3. **Everything is revocable, immediately.** Revocation sets status='revoked';
   the clinic-side helper drops access at once.
4. **Scope/permissions are immutable post-insert.** Changing what's shared
   requires revoke-and-re-share — no silent scope creep on an existing grant.
5. **Cross-org reads are consent-gated, never automatic.** A relationship
   (membership) alone grants nothing; identity/document visibility requires
   an explicit grant.
6. **Asymmetric audit visibility.** The school keeps a full audit trail
   (revoked/expired grants stay visible school-side); the clinic only ever
   sees active grants.
7. **Presence-only parent cue.** The parent home reveals connection
   existence ("connected services") without leaking document lists or
   identity fields — calm and bounded.
8. **Med inherits all of the above** (Phase 6B): medical_practice is a
   first-class grant target with the same bounds.

---

## 4. Trust-fragility risks (verified)

### 4.1 Org-to-org grants (Model B) are invisible to the parent

A school admin can grant a clinic read access to a child's identity and
documents; the parent home shows only that the clinic is "connected," never
WHAT was shared. This is the architecture's principal comprehension gap.

**Disposition.** A parent-facing "who can see what" surface would be a
visibility dashboard — explicitly forbidden by this phase. Two factors lower
the urgency: (a) the parent already authorizes these relationships at
enrollment / clinic intake (offline consent); (b) the presence cue is honest
("connected services"). **Documented as the priority future-work item (§11)
for a calm, parent-readable "connected & shared" cue — NOT a dashboard.** Not
built this phase.

### 4.2 Revocation framed as dangerous / irreversible (LIVE)

The `RevokeClinicGrantModal` leads with an amber alert + "This can't be
undone." Revocation is the **trust-protective** action — the thing a school
admin (or, in future, a parent) does to stop sharing. Framing it as a scary,
irreversible mistake discourages it, which feeds **silent persistence** of
stale access (an explicit anti-pattern). The copy also contradicts itself:
the next line says "To restore, you'll need to issue a new grant" — i.e., it
IS restorable. **Fixed in §9.**

### 4.3 Two consent models can be conflated

Model A (parent→contact, parent-driven, parent-visible) and Model B
(school→org, admin-driven, not parent-visible) are distinct but both called
"sharing." A future contributor could wire Model B into the parent's
consent surface, or vice versa, blurring who controls what. **Documented
(§6, §7) so the boundary stays explicit; no code change needed today.**

### 4.4 Grant expiry is bounded but its "temporariness" is quiet

Grants expire (`valid_until`), but the time-bounded nature is not loudly
surfaced — a school admin may not realize a grant lapses in a year.
Acceptable (calm by default), and the document-consent system already shows
"Expires in Nd" badges within 14 days. Documented (§6) as the model for the
clinic-sharing tables if expiry-awareness ever needs strengthening; not
changed this phase.

### 4.5 No silent propagation creep found

Verified: there is no code path where a grant to one org cascades to another,
where membership auto-creates a grant, or where school data flows to clinics
without a grant. The smoke tests across 074–082 mechanically assert helper
byte-cleanliness. The architecture resists propagation creep.

---

## 5. Trust & visibility taxonomy

Seven classes. Each defines emotional framing, discoverability, parent
visibility, propagation eligibility, expiration, revocation, and resurfacing.

| Class | Emotional framing | Discoverable by parent? | Propagation | Expiry | Revocation | Resurfacing |
|---|---|---|---|---|---|---|
| **Parent-Controlled Visibility** | "you decide" | yes — parent grants it | only by parent action | per consent | parent revokes anytime; cascades | "Consent Needed" card until acted |
| **Explicitly Shared Visibility** | "shared with {org}" | presence-discoverable (connected-services cue) | per-(child, org), deliberate | `valid_until` (1y default) | immediate, re-shareable | none auto |
| **Connected-Service Visibility** | "connected with your care team" | yes — calm presence chip | none (presence only) | follows membership | follows membership | none auto |
| **Organization-Bounded Visibility** | "stays within {org}" | not applicable (internal) | none cross-org without a grant | n/a | n/a | n/a |
| **Sensitive Visibility** (Med / identifiers / clinical) | "protected; shared only with explicit consent" | never enumerated to parent home | grant-gated only; diagnosis detail never propagates (6B) | `valid_until` | immediate | never auto |
| **Temporary Visibility** | "for now, not forever" | bounded by `valid_until` | per grant | inline `valid_until > NOW()` | immediate | none auto |
| **Revoked Visibility** | "access stopped; re-shareable" | school-side audit retains it | none (access gone) | n/a | already revoked | stays in school audit only |

**Bright line (carried from 6B §5):** Sensitive Visibility — diagnoses,
identifiers, clinical detail — is never enumerated to the parent home and
never propagates cross-org except through an explicit, scoped, time-bounded
grant.

---

## 6. Consent evolution principles

How sharing behaves over time, so trust stays durable across years.

1. **Sharing is always a deliberate act.** Per-(child, org); never a bulk
   default; never automatic from a relationship.
2. **Sharing is always bounded.** Scoped + time-bounded. A grant lapses
   on `valid_until` even if no one revokes it — temporariness is the default,
   permanence is never assumed.
3. **Revocation is safe, immediate, and reversible-via-re-grant.** It is the
   trust-protective action and must feel calm, not dangerous (§9 fix). A
   revoked grant drops clinic access at once; access can be restored later
   with a new grant.
4. **Scope never creeps silently.** Scope (identity) and permissions
   (documents) are immutable post-insert; changing them = revoke-and-re-share,
   a fresh deliberate act.
5. **The parent controls Model A; the school controls Model B — and the two
   never blur.** Parent-driven document consent and admin-driven org grants
   stay separate surfaces with separate semantics.
6. **Expired ≠ deleted.** Expired/revoked grants persist school-side for
   audit but grant nothing; the clinic side sees only active grants.

### 6.1 Anti-patterns (permanent rules)

- **No invisible sharing.** Every grant is a deliberate, attributable,
  audited act. (Future: a calm parent-readable cue — §11 — never a silent flow.)
- **No silent persistence.** Time-bounded by default; revocation must feel
  safe so stale access gets pulled, not left out of fear.
- **No consent spam.** No repeated permission prompts; the parent acts once
  per consent (Model A), and Model B is an admin decision, not a parent
  interruption.
- **No "everyone can see this."** No bulk/all-orgs sharing; each grant is one
  org.
- **No hidden propagation.** No grant cascades to another org; no membership
  auto-creates a grant.
- **No ambiguous visibility.** Connected-service cues are presence-only and
  honest; they never overstate or understate what is shared.
- **No over-broad sharing.** Scope is the minimum (identity_only is the
  default; identifiers + documents are separate, deliberate escalations).
- **No fear-heavy consent/revocation wording.** Revocation should feel like a
  safe, normal trust action (§9), not a dangerous irreversible one.
- **No surveillance feeling.** No "this org is watching" framing; cues are
  warm ("connected with your care team"), bounded, and calm.

---

## 7. Visibility & safety matrix

What is always explicit, intentionally quiet, bounded, action-gated, or
never-crossing — across school, therapy, Med, parent, and future external
providers.

| Item | Always explicit | Intentionally quiet | Bounded to | Requires explicit action | Never crosses orgs |
|---|---|---|---|---|---|
| **Parent document consent** (Model A) | yes — "Consent Needed" card | — | parent + named contact | yes — parent grants | beyond the named contact |
| **School identity grant → clinic/Med** (Model B) | school-side audit + (future) calm parent cue | parent home today (presence only) | the one target org | yes — school admin issues | beyond the target org |
| **School document grant → clinic/Med** | school-side audit | parent home (presence only) | the one target org + permissions | yes — school admin issues | beyond the target org |
| **Connected-service presence** | yes — calm chip / "with care" line | — | the child's parent | no (derived from membership) | — (presence only, no data) |
| **Reinforcement context** (school/therapy) | parent home (the line itself) | — | parent + authoring org | no (authored by staff) | each org authors its own; never propagates |
| **Therapy continuity** (parent_visible_summary) | parent home (feed) | internal notes stay hidden | parent + clinic | provider publishes it | raw notes never cross |
| **Med-sensitive continuity** (6B) | nothing diagnostic | all clinical detail | the Med provider | provider publishes parent-safe only | diagnoses/codes never cross, ever |
| **Parent observations** (Care) | the writing parent only | — | parent + their clinic | parent writes | never to school; never to other clinics |
| **Future external providers** | must use the same grant model | presence cue only | the one granted org | explicit grant | beyond the granted org |

---

## 8. Emotional safety findings

| # | Concern | Status |
|---|---|---|
| 8.1 | Revocation feels dangerous/irreversible → discourages the protective action | **Fixed this phase** (§9) |
| 8.2 | Parent uncertainty about org-to-org sharing | Mitigated by honest presence cue; calm parent "connected & shared" cue documented as future work (not a dashboard) |
| 8.3 | Consent fatigue | Verified absent — Model A is act-once; Model B is an admin decision, not a parent interruption; no repeated prompts |
| 8.4 | Surveillance feeling | Verified absent — cues are warm + presence-only; no "watching" framing |
| 8.5 | Silent propagation creep | Verified absent — no cascade, no auto-grant; smoke-test-enforced isolation |
| 8.6 | Over-broad sharing | Verified absent — per-(child, org), minimum scope by default |
| 8.7 | Ambiguous visibility | Connected-service cue is honest presence-only; two consent models documented to stay un-blurred |

---

## 9. Implementation in this phase — soften revocation framing

The audit identifies one LIVE consent-framing issue: `RevokeClinicGrantModal`
frames revocation — the trust-protective action — as a dangerous,
irreversible mistake ("This can't be undone," amber alert), which discourages
it and feeds silent persistence of stale access. The copy also contradicts
its own next line, which says access IS restorable via a new grant.

**Fix.** Reframe the revoke modal so revocation reads as a calm, safe,
immediate, re-shareable trust action:

- Header: "This can't be undone." → "The clinic loses access right away."
  (factual, not fear-heavy).
- Body: keep the immediacy, but reframe restoration as reassurance —
  "This is reversible — issue a new grant later if they need access again."
- Swap the amber `AlertTriangle` alarm for a calm neutral `Info` treatment.
  The destructive (red) "Revoke access" button still carries the
  appropriate weight, so the action never feels trivial — it simply stops
  feeling like a regretful, irreversible error.

**Why this is the right minimum.**

1. **Matches the directive's explicit goals** — "how revocation should feel"
   + "without fear-heavy wording" + reduce "silent persistence."
2. **Removes a self-contradiction** — the old header ("can't be undone")
   directly contradicted the old body ("To restore, issue a new grant").
3. **Surgical** — one modal's confirmation box: copy + icon + box styling.
   No logic change, no schema change, no behaviour change to the revoke
   action itself.
4. **Trust-protective** — making revocation feel safe encourages pulling
   stale access, which is the trust-preserving behaviour the whole phase is
   about.
5. **Reversible** — a few lines.

**Deliberately NOT done (would exceed scope / be forbidden).**

- A parent-facing "who can see what" visibility dashboard (§4.1) — forbidden
  ("no permissions dashboards"); documented as future work as a calm cue.
- Wiring Model B (org grants) into the parent consent surface — would blur
  the two models; deliberately kept separate.
- Adding expiry badges to the clinic-sharing tables — calm-by-default is
  acceptable; documented as an option (§6).
- Any new grant type, RLS change, or permission model change.

---

## 10. Files inspected (Phase 6C)

**Schema / grants / RLS**
- `supabase/migrations/074_child_profile_access_grants.sql` — identity grant table, asymmetric SELECT, immutable scope, lifecycle
- `supabase/migrations/076_*` (per CLAUDE.md) — `document_organization_access_grants`, immutable permissions
- `supabase/migrations/091_parent_safe_service_rpcs.sql` — `list_parent_child_connected_services` (presence-only), `list_parent_visible_therapy_updates`

**Learn — clinic-sharing (Model B, staff side)**
- `src/features/clinic-sharing/types.ts` — IdentityGrantRow / DocumentGrantRow, scope/permissions, lifecycle fields
- `src/features/clinic-sharing/RevokeClinicGrantModal.tsx` — the §9 fix site
- (cross-referenced) `ClinicSharingView`, `IdentityGrantsTable`, `DocumentGrantsTable`, `ShareIdentityWithClinicModal`, `ShareDocumentWithClinicModal`, `ClinicOrganizationPicker`, `queries.ts`

**Learn — parent side (visibility cues)**
- `src/app/parent/dashboard/page.tsx` — servicePresence usage (presence-only), serviceContextLine, journey filter chips, FILTER_EMPTY
- `src/features/parent-journey/queries.ts` — `fetchServicePresence` (presence-only after 6B)
- `src/features/parent-journey/helpers.ts` — `getServiceContextLine` ("with medical care" generic)
- `src/app/parent/documents/page.tsx` — parent document visibility (Model A)

**Cross-references**
- `docs/MED_READINESS_AND_SENSITIVE_CONTINUITY.md` (sensitive boundaries), `docs/CROSS_DOMAIN_HANDOFF.md` (propagation matrix), `docs/CONTINUITY_FRESHNESS_AND_DECAY.md` (temporariness)

---

## 11. Future cross-org trust work intentionally not started

- **Calm parent-readable "connected & shared" cue** (NOT a dashboard) — a
  single, optional, tap-through line on the child profile that says, in
  human terms, "{Child}'s school shares basic info with {clinic} so they can
  coordinate care," with a way to ask the school about it. Must stay calm,
  presence-level, and never enumerate documents/identifiers. The highest-value
  future trust improvement; deliberately deferred (it needs careful copy +
  a parent-safe RPC, and risks dashboard drift if rushed).
- **Parent self-revoke of Model B grants** — Phase 4 deferred parent-initiated
  org grants/revokes; a future phase could let parents revoke a school→clinic
  grant. Needs an INSERT/UPDATE policy arm + careful UX.
- **Expiry-awareness on clinic-sharing tables** — "Expires in Nd" badges (the
  document-consent system already has this pattern).
- **Unified "sharing" vocabulary** across Model A + Model B so staff/parents
  read consistent language — copy-only, no model merge.
- **Med + future external-provider grant surfaces** — inherit the same
  bounded, time-limited, revocable, per-(child, org) model.

---

## 12. Permanent cross-org trust rules (codified)

1. Sharing is always a deliberate, per-(child, org) act — never bulk, never automatic.
2. Sharing is always scoped and time-bounded — permanence is never assumed.
3. Revocation is safe, immediate, and reversible-via-re-grant — it must feel calm, never dangerous.
4. Scope never creeps silently — changing what's shared is a fresh deliberate act.
5. Parent-driven consent (Model A) and admin-driven org grants (Model B) stay distinct and never blur.
6. Connected-service cues are honest and presence-only — never enumerate documents or identifiers.
7. Sensitive/clinical/diagnostic detail never propagates cross-org except by explicit, scoped, time-bounded grant — and diagnoses never reach the parent home (6B).
8. No invisible sharing, no silent persistence, no consent spam, no "everyone can see this," no surveillance feeling.
9. Expired/revoked grants persist for audit but grant nothing; the receiving org sees only active grants.
10. Every future provider domain (Med, external) inherits this exact bounded, revocable, consent-gated model — trust scales by repetition, not by new mechanisms.
