# Architecture Note — Parent Portal Strategy & Future "Lauris Child" Repo

_Last updated: 2026-05-23_

## Decision

**Do not build a separate "Lauris Child" repo now.** Parent access continues through the
**existing portals**:

- **Lauris Learn parent portal** (`/parent`) — school side: attendance, updates, billing,
  progress, events, RSVP, and (already live) parent-safe therapy updates surfaced from Care.
- **Lauris Care parent views** (`/parent` in the Care app) — clinic side: parent-visible
  session notes, milestones, home activities for a linked child.

When a dedicated parent app ("Lauris Child") is eventually justified, it points at the **same
Supabase project** and reads the **same child / guardian / document model** — no data
migration, no schema fork.

## Why the demo seed is app-neutral

`scripts/demo/seed.mjs` deliberately writes only **shared, app-agnostic** rows. Nothing in the
demo is specific to a "parent app." The identity/guardian/document graph that any future
Lauris Child app would consume already exists:

| Concern | Shared table(s) | How a parent app resolves it |
|---|---|---|
| Parent identity | `auth.users` (one account per human) | Parent signs in with anon key + password |
| School-side child link | `guardians.email` → `students.child_profile_id` → `child_profiles` | Match `guardians.email = jwt email` (existing RLS) |
| Clinic-side child link | `care_family_members.profile_id` → `child_profile_id` → `child_profiles` | Match `profile_id = auth.uid()` (existing RLS) |
| Canonical child identity | `child_profiles`, `child_identifiers` | School-agnostic; shared across apps |
| Documents | `child_documents` + parent-safe RPCs | `list_parent_visible_therapy_updates`, `list_parent_child_connected_services` |
| Cross-app sharing record | `child_profile_access_grants`, `document_organization_access_grants` | Read-only context; not parent-writable |

The demo's two parent accounts (`parent1@laurisparent.test`, `parent2@laurisparent.test`) each
demonstrate the **unified** experience — a single human linked as **both** a Learn guardian
**and** a Care `care_family_members` row of the same shared child (Mateo Cruz):

- `parent1@laurisparent.test` (Paolo Cruz, father) → Learn guardian **and** Care family member.
- `parent2@laurisparent.test` (Liza Cruz, mother) → Learn guardian **and** Care family member.

A future unified Lauris Child / Lauris Parent app would let **one human** see both halves by
linking the same `auth.users` row as a Learn guardian **and** a Care family member of the same
`child_profile`. The model already supports this (the existing `parent@lauriscare.test` does the
same across the Sunshine pilot). Parent demo accounts carry **no** `profiles.school_id` — the
Learn parent portal resolves the child (and its school) via `guardians.email = jwt email`, never
via `profiles.school_id` (see `src/app/parent/layout.tsx`), so the accounts stay app-neutral.

## RLS posture for a future Lauris Child app

A parent app needs **no schema changes and no weakened RLS** to launch:

- It authenticates with the **anon key** and parent sign-in — never the service role.
- Reads are already scoped by existing policies:
  - **School side** — guardian-email gating via `parent_student_ids()` (migration 026).
  - **Clinic side** — `care_family_members` gating + `parent_visible = true` flags (Care
    migration 089). Parents only ever see explicitly published notes.
  - **Cross-app documents** — parent-safe `SECURITY DEFINER` RPCs return only whitelisted
    columns (no raw clinical notes, no storage paths).
- ⚠️ Reminder (from `CLAUDE.md`): `guardians.email` matching is **case-sensitive** against the
  JWT email claim. Seed guardian emails lowercase (the seed does this) or parent reads return
  zero rows.

## If Lauris Child ever needs its own tables

Follow the **shared migration-numbering convention** documented in `CLAUDE.md` (check the
highest committed number across *both* Learn and Care before picking the next integer — the
number space is shared by convention, not enforcement). Prefer additive, parent-safe
`SECURITY DEFINER` RPCs over new parent-writable tables, mirroring the existing
`list_parent_visible_*` pattern.

## Summary

The parent experience is **already shippable** through the two existing portals. The shared
child/guardian/document model is the durable contract; a Lauris Child repo is a future
*presentation layer* over it, not a new data model. The demo seed is built to be consumed
unchanged by that future app.
