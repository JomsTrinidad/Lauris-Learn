# Demo Environment — Audit, Seed, Verify & Cleanup (Lauris Learn + Lauris Care)

_Last updated: 2026-05-24_

Lauris Learn and Lauris Care **share one Supabase project** (`eugitbbbtruopxtyhatp`).
These four Node scripts manage the demo/test data across that shared database. They are
**server-side only** — each reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
from `Lauris-Learn/.env.local`. The service-role key never leaves Node.

| Script | What it does | Mutates data? |
|---|---|---|
| `audit.mjs` | Inventories all auth users, profiles, schools, orgs, children, students, grants. | ❌ read-only |
| `seed.mjs` | Builds the Care-workload + transfer + Learn↔Care demo (`de500000`). | ✅ additive; `--reset` re-creates |
| `verify.mjs` | Signs in as the demo users (anon key) and checks workload + RLS + cross-app. | ❌ read-only |
| `cleanup.mjs` | Removes the **superseded** Maple Grove (`de300000`) + Riverside (`de400000`) demos. | ⚠️ **dry-run by default**; `--apply` deletes |

---

## The demo at a glance

- **Learn school = Sunshine Learning Center** (the REAL pilot — reused, never recreated).
  Use the existing `@sunshine.test` logins for the school side.
- **Two Care clinics** under the `de500000-…` namespace:
  - **Maple Grove Therapy Center** — primary clinic (the workload).
  - **Northside Pediatric Therapy** — second clinic, used only for the transfer simulation.
- **Care/parent password:** `LaurisDemo2026!`

### Care staff — `@lauriscare.test`

| Email | Role | Name | Specialty |
|---|---|---|---|
| `admin1@lauriscare.test` | clinic_admin | Dr. Elena Santos | primary clinic director |
| `admin2@lauriscare.test` | clinic_admin | Rafael Domingo | second clinic |
| `therapist1@lauriscare.test` | therapist | Bea Navarro | **Speech** (SLP) |
| `therapist2@lauriscare.test` | therapist | Joaquin Reyes | **Occupational** (OT) — works at **both** clinics; receives the transfer |
| `therapist3@lauriscare.test` | therapist | Carla Mendoza | **Occupational** (OT) |
| `therapist4@lauriscare.test` | therapist | Miguel Torres | **ABA** (behavioral) |

### Parents — `@laurisparent.test`

| Email | Name | Sees |
|---|---|---|
| `parent1@laurisparent.test` | Paolo Cruz | a Sunshine-shared child — school portal (guardian) **and** Care portal (family member) |
| `parent2@laurisparent.test` | Liza Cruz | a second Sunshine-shared child — both portals |

### Lauris Med — **reserved naming only (NOT created)**

`admin1@laurismed.test` · `admin2@laurismed.test` · `doctor1@laurismed.test` · `doctor2@laurismed.test`

### Children (≈27)

| Group | Count | Notes |
|---|---|---|
| Clinic-owned, assigned | 20 | 5 per therapist; `clinic_client` membership; sessions + goals + a parent-visible note each |
| Intake (no therapist) | 3 | `clinic_client` membership only — simulates the onboarding queue |
| Sunshine-linked | 4 | one per therapist; a REAL Sunshine student shared into Care (identity grant + therapy_client membership). 2 of them also carry a **shared IEP** + a portal parent. 1 of them is the **transfer case** (also shared to Northside) |

The Sunshine-linked children are picked deterministically (first 4 Sunshine students by id) and
their names mirror the real students — so they vary with the Sunshine roster, but are stable
across re-runs.

### Preserved (NEVER touched by these scripts)

- `jtrinidad7@gmail.com` (super admin), `joms.trinidad@gmail.com` (Bridgepoint admin).
- All `@sunshine.test` (the pilot) and `@bridgepoint.test`.
- `parent@lauriscare.test` (the existing Sunshine cross-app parent).

---

## How the Sunshine ↔ Care link works (and stays reversible)

Sunshine students have **no `child_profile`** in the live DB, so a cross-app link is impossible
without writing to Sunshine. The seed does this **additively** on a few existing students:

1. Creates a school-origin `child_profiles` row (de500000) mirroring the student's name.
2. Sets `students.child_profile_id` on the REAL student to that profile.
3. Adds an identity grant (Sunshine shadow org → clinic) + a `therapy_client` membership.
4. For 2 of them: adds a `child_documents` IEP (created by the Sunshine admin) + a document grant,
   plus a demo guardian (`parent1`/`parent2`) and a `care_family_members` link.

`seed.mjs --reset` reverses **all** of this: it deletes only the de500000-tagged rows, removes the
demo guardians/IEP, and sets the real students' `child_profile_id` back to `NULL`. The real
student rows and the real roster are otherwise untouched.

---

## 1. Audit (always start here)

```bash
cd Lauris-Learn
node scripts/demo/audit.mjs
```

Read-only ground truth: users by domain, schools, orgs + membership counts, child/student counts,
cross-app grants.

## 2. Seed + verify

```bash
node scripts/demo/seed.mjs             # create / upsert (idempotent)
node scripts/demo/seed.mjs --reset     # remove THIS demo (incl. Sunshine links) then rebuild
node scripts/demo/verify.mjs           # expect: ✓ ALL PASS
```

`verify.mjs` asserts (real anon-key sign-ins): the primary admin sees the full workload + the
shared Sunshine IEPs but **not** school `students`; a therapist sees clinic sessions; the second
clinic admin sees the **transferred** child but **not** the primary clinic's owned children
(cross-clinic isolation); each parent sees their child on the school side **and** parent-visible
therapy notes on the clinic side.

## 3. Cleanup the superseded demos (dry-run first)

```bash
node scripts/demo/cleanup.mjs            # DRY RUN — prints the deletion plan
node scripts/demo/cleanup.mjs --apply    # irreversible
```

Removes the legacy **Maple Grove** (`de300000`) and **Riverside** (`de400000`) demos — by
deterministic fixed UUIDs + the legacy login domains (`@myschool.test`, `@mytherapyclinic.test`,
`@personal.test`, `@laurislearn.test`, `@lauris.demo`) — plus an idempotent `@lauris.demo` clinic
safety-net sweep.

### Cleanup safety

- **Matches by deterministic ID, not by name.** "Maple Grove Therapy Center" is reused as the
  *current* primary clinic (`de500000`), so cleanup targets the *legacy* one by its `de300000`
  UUID. A pre-flight `verifyNamespace` aborts if the legacy orgs aren't exactly what's expected.
- **A plan guard aborts** if any delete step would touch a `de500000` (current demo), Sunshine, or
  Bridgepoint id.
- **`@lauriscare.test` and `@laurisparent.test` are protected** (the current demo reuses them), as
  are the super admin, `parent@lauriscare.test`, `@sunshine.test`, and `@bridgepoint.test`.
- **Users are only deletable if their `school_id` is a legacy demo school** (`de300000`/`de400000`);
  any other `school_id` (Sunshine/Bridgepoint member) is skipped.
- **Dry-run by default.**

> Run order: `audit` → `seed` + `verify` → `cleanup` dry-run → review → `cleanup --apply` →
> `audit` again. After `--apply`, the primary admin will see exactly the `de500000` workload
> (the transient extra children/students from the old Riverside demo disappear).

---

## Idempotency

- `seed.mjs` — re-running upserts/skips by fixed/deterministic UUID + existence checks.
- `cleanup.mjs` — re-running after a successful `--apply` is a no-op.
- `audit.mjs` / `verify.mjs` — read-only.
