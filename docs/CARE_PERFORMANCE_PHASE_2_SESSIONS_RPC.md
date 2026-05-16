# Care Performance Phase 2 — Sessions List RPC

**Status:** Implemented  
**Migration:** `104_care_sessions_with_therapists_rpc.sql`  
**Scope:** Eliminate the sequential sessions → therapist-name N+1-style waterfall on `/care/sessions` and on the per-child sessions card. Strictly additive — no schema changes, no RLS changes, no other surfaces touched.

---

## Old Query Flow (Pre-Phase 2)

Both `listSessionsForClinic` and `listSessionsForChild` followed the same 2-call shape:

```
t=0ms    ┌─ SELECT therapy_sessions ⨝ child_profiles
         │     .eq('clinic_organization_id', orgId)
         │     [+ optional date range / status / therapy_type / child filters]
         │     .order('scheduled_at', desc)
t≈100ms  └─ resolves with rows[]
         ↓ rows handler triggers
         ┌─ RPC list_clinic_members(orgId)
         │     ← needed ONLY to map therapist_profile_id → display name
t≈200ms  └─ resolves with members[]
         ↓ JS builds memberMap
         ↓ rows.map(row → mapRow(row, memberMap))
         render
```

**Sequencing problem:** the second call only fires after the first resolves, even though the two reads are logically independent. With Supabase's typical ~80–100ms RLS round-trip, the sessions list spends ~200ms blocking on this pair before the UI can update — every filter change (date range, status, therapy_type), every navigation in/out, every reload.

**Why the second call existed:** `therapy_sessions.therapist_profile_id` is a `profiles.id`. The base `profiles` SELECT policy only exposes the caller's own row, so a client-side join `profiles!therapist_profile_id ( full_name )` returns null for every row except the caller's own sessions. The existing escape hatch was `list_clinic_members` (SECURITY DEFINER, mints clinic-scoped member rows for the caller). Phase 2 inlines that resolution into the sessions read.

---

## New RPC Query Flow

```
t=0ms    ┌─ RPC get_care_sessions_with_therapists(
         │      p_org_id, p_from_iso, p_to_iso,
         │      p_status, p_therapy_type, p_child_profile_id
         │   )
         │     ← server-side: applies the 082 §3.A SELECT predicate,
         │       LEFT JOINs child_profiles + profiles, applies filters,
         │       orders by scheduled_at DESC
t≈100ms  └─ resolves with rows[ ... therapist_full_name, therapist_email,
                                  child_display_name, ... ]
         render
```

One round-trip. Same filters, same sort, same visible fields. Same RLS outcome — the function body re-applies the predicate the `select_therapy_sessions` policy enforces, so visibility is byte-identical to a direct SELECT.

---

## Migration Added

**`supabase/migrations/104_care_sessions_with_therapists_rpc.sql`** — additive, strictly isolated.

```sql
CREATE OR REPLACE FUNCTION get_care_sessions_with_therapists(
  p_org_id           UUID,
  p_from_iso         TIMESTAMPTZ DEFAULT NULL,
  p_to_iso           TIMESTAMPTZ DEFAULT NULL,
  p_status           TEXT        DEFAULT NULL,
  p_therapy_type     TEXT        DEFAULT NULL,
  p_child_profile_id UUID        DEFAULT NULL
)
RETURNS TABLE (
  id                     UUID,
  clinic_organization_id UUID,
  child_profile_id       UUID,
  child_display_name     TEXT,
  therapist_profile_id   UUID,
  therapist_full_name    TEXT,
  therapist_email        TEXT,
  therapy_type           TEXT,
  scheduled_at           TIMESTAMPTZ,
  duration_minutes       INT,
  status                 TEXT,
  notes                  TEXT,
  parent_visible_summary TEXT,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
```

The body re-applies the `select_therapy_sessions` policy predicate (082 §3.A):
1. caller is authenticated AND
2. caller has an active `organization_memberships` row in `p_org_id` AND
3. per-session: an active `(clinic_client | therapy_client)` membership on `(child_profile_id, p_org_id)`

`REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`. Body-level `auth.uid()` gate. Mirrors the established 077 / 082 / 103 pattern.

**Smoke test:** `supabase/tests/104_care_sessions_with_therapists_smoke.sql` — 11 scenarios.

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `supabase/migrations/104_care_sessions_with_therapists_rpc.sql` | The new RPC |
| `supabase/tests/104_care_sessions_with_therapists_smoke.sql` | 11-scenario smoke test |
| `docs/CARE_PERFORMANCE_PHASE_2_SESSIONS_RPC.md` | This document |

### Edited files
| File | Change |
|---|---|
| `src/lib/types/database.ts` | Added `Functions.get_care_sessions_with_therapists` type |
| `src/features/care/sessions-api.ts` | `listSessionsForClinic` + `listSessionsForChild` now call the new RPC. On RPC failure, both fall back to the legacy 2-call path (`listSessionsViaLegacyPath`) so the page stays functional during the rollout window. The legacy `mapRow` helper, `listClinicMembers`, and `ClinicMember` import are kept because the fallback path and `getNoteForSession` still use them. |

### Untouched (per scope)
- `SessionsView.tsx`, `TherapySessionsList`, `EditSessionModal`, `ScheduleSessionModal` — no UI changes. Same props, same callbacks.
- `ChildDetailView`, `/care/children/[childProfileId]` — Phase 1 lives here; only the data flow inside `listSessionsForChild` changes.
- All other Care features (documents, clinic documents, identity grants, sharing).
- All Learn features.

---

## Expected Query Reduction

| Surface | Before | After (RPC) | After (fallback) |
|---|---:|---:|---:|
| `/care/sessions` initial load | 2 round-trips | **1 round-trip** | 2 round-trips |
| Filter change on `/care/sessions` | 2 round-trips | **1 round-trip** | 2 round-trips |
| Per-child sessions card on child detail | 2 round-trips | **1 round-trip** | 2 round-trips |
| Typical blocking time | ~200ms | **~100ms** | identical to old |

Child detail page total (Phase 1 + Phase 2):

| Phase | Before | Now |
|---|---:|---:|
| Phase 1 primary (identity bundle) | 5 round-trips | 1 round-trip |
| Phase 2 secondary (sessions) | 2 round-trips | **1 round-trip** |
| Secondary (clinic + shared docs) | 2 round-trips | 2 round-trips (unchanged) |
| Session notes follow-up | 1 round-trip | 1 round-trip (unchanged) |
| **Total** | 10 | **5** |

---

## Security Notes

### Visibility matches the existing SELECT policy byte-for-byte

The function body re-implements the `select_therapy_sessions` policy predicate. The relevant defence matrix:

| Caller / state | Direct RLS result | RPC result | Match? |
|---|---|---|---|
| Unauthenticated | denied | 0 rows | ✓ |
| Authenticated, not member of `p_org_id` | denied | 0 rows | ✓ |
| Active clinic admin of `p_org_id`, child has active `clinic_client` membership | session visible | row returned | ✓ |
| Active clinic admin of `p_org_id`, child has active `therapy_client` membership | session visible | row returned | ✓ |
| Active therapist of `p_org_id`, same child predicate | session visible | row returned | ✓ |
| Active member of `p_org_id`, child membership flipped to `'ended'` | session hidden | 0 rows | ✓ |
| Member of clinic A asking about a clinic A session whose child only has a clinic B membership | session hidden | 0 rows | ✓ |
| Member of clinic A querying with `p_org_id = clinic_b` | denied (no membership in B) | 0 rows | ✓ |
| `school_admin` of an unrelated school | session hidden | 0 rows | ✓ |

### No new write paths

The RPC is read-only. INSERT / UPDATE / DELETE on `therapy_sessions` still flow through the existing 082 policies under direct table access. The RPC cannot be used to bypass those policies.

### No cross-clinic leakage

Every emitted row's `clinic_organization_id` equals `p_org_id`. The membership gate at the top of the function short-circuits the body before any query if the caller isn't an active member of `p_org_id`, so a cross-clinic caller cannot probe for clinic A's sessions by passing `p_org_id = clinic_a`.

### No new parent-visible surface

`parent_visible_summary` is included in the return shape because it's already part of `TherapySession` and was already returned by the legacy SELECT. The RPC does not expose it to parent users — parent users have no `organization_memberships` row in any clinic, so they fail the membership gate at step 1 and receive zero rows.

### Fallback path does NOT mask auth errors

`listSessionsViaLegacyPath` only fires when the RPC itself errors (network blip, `rpc()` call throws). It does **not** fire when the RPC returns zero rows — zero rows is treated as a legitimate empty result. So a real authorization denial (non-member of org, ended child membership, etc.) produces zero rows on both paths and renders as an empty list, which is the same behaviour the page had before. Sentry / dev console will see an explicit `[care] listSessionsForClinic RPC failed; falling back to legacy path:` warning if a real RPC plumbing failure occurs.

### Strict isolation regression

Smoke test T-10 walks `pg_get_functiondef` over `list_clinic_members`, `get_care_child_with_details`, `list_documents_for_organization`, `accessible_document_ids`, `log_document_access`, `log_document_access_for_organizations`, `caller_owned_child_profile_ids`, `caller_visible_child_profile_ids`, `caller_visible_child_profile_ids_for_identifiers`, and `log_clinic_document_access`, asserting that none reference the new RPC. T-10 also re-confirms the `select_therapy_sessions` policy still exists, so a future migration that accidentally drops/replaces it would be caught.

---

## Smoke Test Coverage

`supabase/tests/104_care_sessions_with_therapists_smoke.sql` — 11 scenarios, BEGIN/ROLLBACK harness.

| Test | Scenario | Asserts |
|---|---|---|
| T-1 | Function definition | SECURITY DEFINER, STABLE, REVOKE PUBLIC, GRANT authenticated |
| T-2 | Unauthenticated | 0 rows |
| T-3 | Non-member of `p_org_id` | 0 rows |
| T-4 | Clinic admin happy path | 4 sessions for clinic A; child name + therapist full name + therapist email resolve correctly |
| T-5 | Therapist (non-admin) | Same 4 sessions visible (matches SELECT policy) |
| T-6 | Cross-clinic: clinic B admin → `p_org_id = clinic_a` | 0 rows |
| T-7 | Clinic B own-org call | Only clinic B sessions visible |
| T-8 | Filters | status=`completed`, therapy_type=`occupational`, date range, child_profile_id filter — all narrow correctly |
| T-9 | Ended membership | Session for child whose membership flipped to `'ended'` is hidden |
| T-10 | ★ Strict isolation regression ★ | 10 existing helpers/RPCs byte-clean; `select_therapy_sessions` policy still present |
| T-11 | School isolation | `school_admin` sees 0 sessions via direct SELECT and via the RPC |

Run (non-production project):

```
psql -f supabase/migrations/104_care_sessions_with_therapists_rpc.sql
psql -f supabase/tests/104_care_sessions_with_therapists_smoke.sql
```

Expected output: `✓ All 104 smoke tests passed.`

---

## Performance Expectation

| Metric | Before | After |
|---|---:|---:|
| `/care/sessions` blocking round-trips per render | 2 (sequential) | **1** |
| Per-child sessions card blocking round-trips | 2 (sequential) | **1** |
| Typical blocking time (Supabase ~80–100ms RTT) | ~200ms | **~100ms** |
| Time-to-interactive on filter change | unchanged UI; ~200ms wait | **~100ms wait** |

The savings compound on filter-heavy use: changing the date range, flipping the status filter, or switching therapy_type each used to fire 2 round-trips. They now fire 1 each.

---

## Test Results

### `npx tsc --noEmit`
```
TSC_EXIT=0
```

### `npm run lint`
```
✖ 958 problems (0 errors, 958 warnings)
LINT_EXIT=0
```
Pre-existing warning backlog (see `docs/CARE_LINT_RECOVERY_NEXT16.md`). No new errors introduced.

### `npm run build`
```
✓ Compiled successfully
✓ Generating static pages using 7 workers (56/56)
BUILD_EXIT=0
```

### Smoke test
Must be applied + run manually in a non-production Supabase project; smoke test asserts all 11 scenarios.

---

## Rollback Plan

```sql
DROP FUNCTION IF EXISTS get_care_sessions_with_therapists(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID
);
```

The app code already handles RPC absence — `listSessionsForClinic` / `listSessionsForChild` fall back to the legacy 2-call path on RPC error. No app-side rollback is required. After confirming the fallback path is healthy, the RPC-side branch can be removed in a follow-up commit.

---

## Out of Scope (Future Phases)

| Surface | Status |
|---|---|
| `/care/documents` (org-wide doc list, single RPC that returns 200+ rows) | Phase 3 candidate — server-side filtering / pagination |
| Continuity page | Future |
| Session prep page | Future |
| Parent portal | Out of scope |
| Billing | Out of scope |
| Learn repo | Out of scope |
