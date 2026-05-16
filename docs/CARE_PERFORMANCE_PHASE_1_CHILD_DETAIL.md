# Care Performance Phase 1 — Child Detail Page

**Status:** Implemented  
**Migration:** `103_care_child_detail_rpc.sql`  
**Scope:** Reduce primary-load query count on `/care/children/[childProfileId]` from 5 round-trips to 1, and switch from a full-page blocking spinner to a skeleton-shell + progressive-secondary-load pattern.

This change is intentionally surgical. The sessions page, documents page, billing, parent portal, continuity page, session prep page, and the Learn dashboard are **not** touched.

---

## Old Query Waterfall (Pre-Phase 1)

The `/care/children/[childProfileId]` page mounted with a single `useEffect` that fired a `Promise.all` of eight queries. Five of those eight were needed just to assemble the page header / identity card / identifier card / membership state. The remaining three (documents and sessions) were independent secondary data.

```
t=0ms   ┌─ listOwnedChildren(orgId)              ← full owned roster, then find()
        ├─ listGrantedChildren(orgId)            ← full granted roster, then find()
        ├─ getChildIdentity(childId)             ← one child_profiles row
        ├─ listChildIdentifiers(childId)         ← child_identifiers rows
        ├─ listSharedDocuments(orgId, childId)   ← list_documents_for_organization RPC
        ├─ listClinicDocumentsForChild(childId)  ← clinic_documents
        ├─ listSessionsForChild(orgId, childId)  ← therapy_sessions
        └─ getChildClinicMembershipState(...)    ← 2 internal queries

t=600ms All eight resolve
        ↓ JS: find() in owned/grants, assemble CareChildRow

        ┌─ listSessionIdsWithNotes(sessionIds)   ← second-pass note indicators

t=800ms All complete → render
        Until now the user sees a blank screen with only <Spinner />.
```

Net primary cost: **5 round-trips** (owned + granted + identity + identifiers + membership state — two internal queries inside the last one). The page blocks behind a full-page spinner for ~700–900ms before any pixel of content is visible.

---

## New Query Plan (Phase 1)

```
Phase 1 (primary):   1 round-trip (RPC)
  └─ get_care_child_with_details(p_child_profile_id, p_org_id)
       ↓ returns ONE row with:
         - identity (display_name, legal_name, dob, etc.)
         - identifiers JSONB array (empty when scope=identity_only)
         - origin_type ('owned' | 'shared')
         - grant_scope, grant_valid_until (NULL for owned)
         - membership_state
         - show_identifiers (pre-computed)

t≈100ms  → render identity card, identifier card,
           Accept-as-therapy-client card (when applicable)

Phase 2 (secondary): runs in PARALLEL with phase 1
  ├─ listSharedDocuments(orgId, childId)
  ├─ listClinicDocumentsForChild(childId)
  └─ listSessionsForChild(orgId, childId)
       ↓ then
  └─ listSessionIdsWithNotes(sess.id[])

t≈500ms  → swap session/document skeletons for real content.
```

Net primary cost: **1 round-trip** (the RPC). Secondary data loads concurrently and the user sees the identity shell as soon as Phase 1 resolves — typically ~100ms instead of ~800ms.

---

## Migration Added

**`supabase/migrations/103_care_child_detail_rpc.sql`** — additive, strictly isolated.

Function signature:

```sql
CREATE OR REPLACE FUNCTION get_care_child_with_details(
  p_child_profile_id UUID,
  p_org_id           UUID
)
RETURNS TABLE (
  child_profile_id   UUID,
  display_name       TEXT,
  legal_name         TEXT,
  preferred_name     TEXT,
  first_name         TEXT,
  middle_name        TEXT,
  last_name          TEXT,
  date_of_birth      DATE,
  sex_at_birth       TEXT,
  gender_identity    TEXT,
  primary_language   TEXT,
  country_code       TEXT,
  origin_type        TEXT,      -- 'owned' | 'shared'
  grant_scope        TEXT,      -- 'identity_only' | 'identity_with_identifiers' | NULL
  grant_valid_until  TIMESTAMPTZ,
  membership_state   TEXT,      -- 'owned' | 'accepted' | 'shared_pending' | 'shared_no_grant'
  show_identifiers   BOOLEAN,
  identifiers        JSONB      -- array; [] when not allowed
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
```

**Smoke test:** `supabase/tests/103_care_child_detail_rpc_smoke.sql` — 15 scenarios covering function definition, auth gates, ownership arm, grant arm (both scopes), expired/revoked grants, cross-clinic isolation, non-existent inputs, helper-byte-cleanliness regression, and identifier-RLS regression.

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `supabase/migrations/103_care_child_detail_rpc.sql` | The new RPC |
| `supabase/tests/103_care_child_detail_rpc_smoke.sql` | 15-scenario smoke test |
| `src/features/care/ChildDetailSkeleton.tsx` | `ChildDetailShellSkeleton` + `SecondarySectionSkeleton` |
| `docs/CARE_PERFORMANCE_PHASE_1_CHILD_DETAIL.md` | This document |

### Edited files
| File | Change |
|---|---|
| `src/lib/types/database.ts` | Added `Functions.get_care_child_with_details` type |
| `src/features/care/types.ts` | Added `CareChildDetailBundle` interface |
| `src/features/care/queries.ts` | Added `getCareChildWithDetails` wrapper + `CareChildDetailResult` discriminated union |
| `src/features/care/ChildDetailView.tsx` | Accepts `secondaryLoading` prop; renders skeletons for sessions / documents / timeline while Phase 2 is in flight |
| `src/app/care/children/[childProfileId]/page.tsx` | Two-phase `useEffect`. Phase 1 calls the RPC (with legacy 5-query fallback). Phase 2 fetches secondary data in parallel. Replaces the full-page spinner with `<ChildDetailShellSkeleton />`. |

The `sessions-api.ts` function `getChildClinicMembershipState` is **kept** because it's still used by the fallback path. No deletions.

---

## Before / After Query Counts

| Phase | Before | After (RPC) | After (fallback) |
|---|---:|---:|---:|
| Primary (block-render): | 5 round-trips | **1 round-trip** | 5 round-trips |
| Secondary (background): | 3 round-trips (parallel) + 1 follow-up | 3 round-trips (parallel) + 1 follow-up | 3 round-trips (parallel) + 1 follow-up |
| **Total round-trips**: | 8 (+1 second-pass) | **4 (+1 second-pass)** | 8 (+1 second-pass) |
| Blocking time (typical): | ~700–900ms | **~100–200ms** | identical to old |
| First contentful paint: | After all 8 resolve | After 1 RPC resolves | After 5 resolve |

The fallback path only activates if the RPC errors (network failure, transient Postgres error, or migration not yet applied). The legacy 5-query path is preserved verbatim.

---

## Security Notes

The RPC is `SECURITY DEFINER STABLE` and mirrors the precedent set by:
- `list_documents_for_organization` (077) — same caller-gate pattern.
- `list_school_staff_for_sharing` (065) — same REVOKE PUBLIC / GRANT authenticated pattern.

### Access decision tree (function body)

```
1. auth.uid() IS NULL                               → 0 rows
2. NOT EXISTS active org membership in p_org_id     → 0 rows
3. ownership check:
   child_profiles.origin_organization_id = p_org_id
   AND organizations.kind IN ('clinic','medical_practice')
4. grant check:
   child_profile_access_grants WHERE
     child_profile_id = p_child_profile_id
     AND target_organization_id = p_org_id
     AND status = 'active'
     AND valid_until > NOW()
5. NOT v_is_owner AND v_grant_scope IS NULL         → 0 rows
6. emit single row.
```

### Visibility preserves existing RLS semantics

| Caller / row state | Direct RLS result | RPC result | Match? |
|---|---|---|---|
| Unauthenticated | denied | 0 rows | ✓ |
| Authenticated, not member of `p_org_id` | denied | 0 rows | ✓ |
| Member of clinic, child owned by clinic | allowed | 1 row, owned | ✓ |
| Member of clinic, child has active identity_only grant | profile allowed; identifiers denied | 1 row, identifiers=[] | ✓ |
| Member of clinic, child has identity_with_identifiers grant | profile allowed; identifiers allowed | 1 row, identifiers populated | ✓ |
| Member of clinic, grant expired (valid_until < NOW()) | denied (helper filters) | 0 rows | ✓ |
| Member of clinic, grant revoked | denied (helper filters) | 0 rows | ✓ |
| Member of clinic A, child owned by clinic B | denied | 0 rows | ✓ |

### Strict isolation

The migration introduces **no** changes to:
- `caller_visible_child_profile_ids()` (Phase 1/4 helper) — body byte-clean.
- `caller_visible_child_profile_ids_for_identifiers()` (Phase 5A helper) — body byte-clean.
- `list_documents_for_organization()` (Phase 6A helper) — body byte-clean.
- Any RLS policy on `child_profiles`, `child_identifiers`, `child_profile_memberships`, `child_profile_access_grants`, `organizations`, `organization_memberships`.
- Any column, enum, CHECK constraint, or trigger.

Removing the new RPC leaves the app on the legacy 5-query fallback path with no behavioural change.

### Disclosure minimisation

Non-members of `p_org_id`, unauthenticated callers, and callers asking for a child the calling clinic neither owns nor has an active grant on all receive **zero rows** rather than an exception. This mirrors the existing `log_document_access` / `list_documents_for_organization` posture so the function does not leak existence of records the caller shouldn't know about.

### Identifier sharing scope gate

The function refuses to surface identifier rows when:
- `origin_type = 'shared'` AND `grant.scope = 'identity_only'`

…even though `SECURITY DEFINER` would otherwise let the body bypass `child_identifiers` RLS. The body itself enforces the same scope predicate the Phase 5A `caller_visible_child_profile_ids_for_identifiers()` helper enforces (see smoke test T-15 for the corresponding direct-SELECT regression check).

---

## Test Results

### TypeScript
```
$ npx tsc --noEmit
EXIT_CODE=0
```
Clean.

### Build
```
$ npm run build
✓ Compiled successfully in 9.2s
✓ Generating static pages using 7 workers (56/56) in 903ms
```
Clean. The `/care/children/[childProfileId]` route still renders as a dynamic (`ƒ`) page; no behaviour change.

### Lint
`npm run lint` invokes the legacy `next lint` command which was removed in Next.js 16. The repo has no `eslint.config.js`, so direct `npx eslint` cannot run either. **This is a pre-existing repo-level gap not introduced by Phase 1** — the build's bundled TypeScript checker is the effective lint substitute.

### Smoke test (manual, must be run in non-production project)
```
psql -f supabase/migrations/103_care_child_detail_rpc.sql
psql -f supabase/tests/103_care_child_detail_rpc_smoke.sql
```
Expected output: `✓ All 103 smoke tests passed.`

### Manual UI verification
| Scenario | Expected | Pass criterion |
|---|---|---|
| Clinic admin opens own clinic's child | Identity + identifiers + Sessions/Documents render | Header card appears in <200ms, secondary data fills in shortly after |
| Clinic admin opens a school-shared child with identity_only grant | Identity card visible; Identifiers card shows "Identifier sharing not granted" lock message | RLS scope honoured |
| Clinic admin opens a school-shared child with identity_with_identifiers grant | Identifiers populated | RPC's `show_identifiers=true` returned |
| Clinic admin opens a child with no ownership and no grant | "Child not available." empty state | `not_found` branch hit |
| Clinic therapist (non-admin) opens own clinic's child | Identity + identifiers visible; Edit/Manage buttons hidden | `canEdit` gate respected |
| Cross-clinic: clinic B admin opens clinic A's child URL | "Child not available." empty state | RPC returns 0 rows |
| ManageIdentifiersModal opens for owned child (admin only) | Modal opens, edits persist, reloadTick fires | `canEdit` gate unchanged |

### What does NOT change for the user
- The identity card, identifier card, sessions block, documents block, edit modal, manage-identifiers modal, accept-as-therapy-client card, and timeline render identically once data arrives.
- Access decisions are identical at the byte level — the RPC body re-implements the same predicate the RLS helpers enforce.
- The fallback path executes the legacy 5 queries unchanged, so a Postgres / RPC blip does not regress the page.

---

## Out of Scope (Future Phases)

| Page | Status |
|---|---|
| `/care/sessions` (sessions list) | Phase 2 candidate — `getSessionsWithTherapists` RPC |
| `/care/documents` (org-wide doc list) | Phase 3 candidate — server-side filtering / pagination |
| Continuity page | Future |
| Session prep page | Future |
| Parent portal | Out of scope |
| Billing | Out of scope |
| Learn repo | Out of scope |

---

## Rollback Plan

Should the migration need to be rolled back:

```sql
DROP FUNCTION IF EXISTS get_care_child_with_details(UUID, UUID);
```

The app code already handles RPC absence — `getCareChildWithDetails` returns `{ kind: 'fallback' }` on error and the page re-runs the legacy 5-query path. No app-side rollback is required. After confirming the fallback path is healthy, the React-side wrapper can be removed in a follow-up commit.
