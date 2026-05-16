# Care Performance Phase 3 — Documents Filtering

**Status:** Implemented  
**Migration:** `105_care_documents_filtered_rpc.sql`  
**Scope:** Push per-child document filtering into the database for the Care portal. Strictly additive; no existing helper or RPC is modified.

---

## Old Flow

`listSharedDocuments(organizationId, filterChildProfileId?)` shipped the same payload regardless of the caller's intent:

```ts
// src/features/care/queries.ts (pre-Phase 3)
const { data } = await supabase.rpc("list_documents_for_organization", {
  p_org_id: organizationId,           // ← always org-wide
});
return data.filter(row =>
  !filterChildProfileId || row.child_profile_id === filterChildProfileId
).map(...);
```

`list_documents_for_organization` (077) returns every active grant for the clinic. With a typical pilot clinic seeing 50–200 active grants, the per-child detail page on `/care/children/[childProfileId]` was:

1. Asking the DB for **every** doc shared with the clinic.
2. Letting RLS + the SECURITY DEFINER body filter to that clinic's set.
3. Transmitting ~50–100 KB of JSON to the browser.
4. Calling `Array.prototype.filter()` in JS to keep the 1–3 rows for the current child.

The same pattern runs on `/care/documents` (org-wide list — no filter applied, so the over-fetch isn't wasted), but the per-child site multiplies the cost across every child detail mount.

### Call sites

| Surface | Filter | Behaviour pre-Phase 3 |
|---|---|---|
| `/care/documents` | none | Fetch all → render all |
| `/care/children/[childProfileId]` shared-docs card | child_profile_id | Fetch all → filter to 1–3 in JS |
| `listClinicDocumentsForChild` (clinic-owned docs) | child_profile_id | Already filtered DB-side via `.eq()` — out of scope here |

---

## New Flow

A second SECURITY DEFINER STABLE RPC, `get_care_documents_for_organization`, accepts the per-child filter as a parameter and pushes it into the WHERE clause. Same return shape as 077, same access predicate, same disclosure-minimisation posture.

```sql
get_care_documents_for_organization(
  p_org_id            UUID,
  p_child_profile_id  UUID DEFAULT NULL,
  p_limit             INT  DEFAULT 200,
  p_offset            INT  DEFAULT 0
) RETURNS TABLE ( …same columns as list_documents_for_organization… )
```

`listSharedDocuments` calls the new RPC. On RPC error it falls back to the 077 path with the legacy in-JS filter so the page never goes blank during the rollout window. Zero-row responses are **not** treated as failures — they are passed through as a legitimate empty result so real authorization denials are not masked by a fallback retry.

```ts
// src/features/care/queries.ts (Phase 3)
const primary = await supabase.rpc("get_care_documents_for_organization", {
  p_org_id: organizationId,
  p_child_profile_id: filterChildProfileId ?? null,
  p_limit: null,
  p_offset: null,
});
if (!primary.error) return (primary.data ?? []).map(mapSharedDocRow);

// Fallback: legacy 077 + in-JS filter
const fallback = await supabase.rpc("list_documents_for_organization", {
  p_org_id: organizationId,
});
return (fallback.data ?? [])
  .filter(row => !filterChildProfileId || row.child_profile_id === filterChildProfileId)
  .map(mapSharedDocRow);
```

---

## Query Count / Payload Reduction

| Surface | Round-trips | Payload (typical 50-doc clinic) |
|---|---:|---:|
| `/care/documents` — Before | 1 | ~50 KB (50 rows) |
| `/care/documents` — After | 1 | ~50 KB (unchanged — list is genuinely org-wide) |
| Child detail shared-docs — Before | 1 | ~50 KB (50 rows over the wire, 2 used) |
| Child detail shared-docs — After | 1 | **~2 KB** (only the child's rows) |

The round-trip count is unchanged (still 1 RPC). The win is in payload, JSON parsing, and React reconciliation — the per-child detail page now transmits only the rows it renders. For a clinic with 200 active grants and a child with 2 shared docs, payload drops from ~200 KB to ~2 KB (≈99% reduction) on every child mount.

Pagination defaults: `p_limit DEFAULT 200`, clamped to `LEAST(p_limit, 1000)` in the function body. The current UI does not paginate; the bound is purely a runaway-safety guard.

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `supabase/migrations/105_care_documents_filtered_rpc.sql` | The new RPC |
| `supabase/tests/105_care_documents_filtered_rpc_smoke.sql` | 17-scenario smoke test |
| `docs/CARE_PERFORMANCE_PHASE_3_DOCUMENTS_FILTERING.md` | This document |

### Edited files
| File | Change |
|---|---|
| `src/lib/types/database.ts` | Added `Functions.get_care_documents_for_organization` type |
| `src/features/care/queries.ts` | `listSharedDocuments` now calls the new RPC; on error falls back to legacy 077 + in-JS filter; shared `mapSharedDocRow` helper extracted |

### Untouched (per scope)
- `list_documents_for_organization` (077) — byte-clean. Smoke test 105 T-16 enforces this.
- `log_document_access_for_organizations` — byte-clean. Sole signed-URL gate; **unchanged**. T-17 confirms.
- `listClinicDocumentsForChild` — already filters DB-side; no change.
- `useCareSharedDocuments` hook — unchanged. Its query key still keys on `organizationId` only (used by the org-wide `/care/documents` page); the per-child detail page calls `listSharedDocuments` directly so cache keys don't need a new dimension.
- All Care UI components, modals, lists.
- All Learn surfaces.
- Document sharing semantics, RLS policies, parent surfaces.

---

## Security Notes

### Visibility predicate is identical to 077

The new RPC re-implements the 077 access predicate byte-for-byte and adds the child filter as a pure narrowing clause. There is no path by which `p_child_profile_id` widens visibility:

| Caller / state | 077 result | 105 result | Match? |
|---|---|---|---|
| Unauthenticated | 0 rows | 0 rows | ✓ |
| Active member of `p_org_id`, grant active, doc active, version visible | 1 row | 1 row | ✓ |
| Non-member of `p_org_id` | 0 rows | 0 rows | ✓ |
| Active member, grant expired (`valid_until < NOW()`) | 0 rows | 0 rows | ✓ |
| Active member, grant revoked (`status='revoked'`) | 0 rows | 0 rows | ✓ |
| Active member, doc status='draft' | 0 rows | 0 rows | ✓ |
| Active member, current_version hidden | 0 rows | 0 rows | ✓ |
| Active member, `p_child_profile_id` ≠ the doc's `s.child_profile_id` | n/a | 0 rows | narrowing only |
| Active member, `p_child_profile_id` = a child this clinic has no grants for | n/a | 0 rows | narrowing only |

The per-child filter applies AFTER the org-membership and grant predicates. A caller cannot pass a child UUID to learn whether the clinic holds any grants for that child unless they themselves are a member of the clinic — because the membership gate at the top returns zero rows first.

### No raw storage path exposure

The RPC's `RETURNS TABLE` declaration intentionally omits `storage_path`, `storage_object_id`, `signed_url`, and `object_key`. Result columns mirror 077 exactly (`document_id`, `title`, `document_type`, `doc_status`, `current_version_id`, `version_number`, `mime_type`, `file_name`, `file_size_bytes`, `child_profile_id`, `permissions`, `grant_valid_until`, `grant_created_at`). Smoke test T-15 walks `pg_attribute` over the function's return type and asserts no storage columns leak.

### Access logging unchanged

`log_document_access_for_organizations` (5B / 076) remains the sole gate for issuing signed URLs and recording `document_access_events` rows. The new RPC does not return URLs and does not bypass logging — opening a document still routes through `POST /api/care/documents/[id]/access` exactly as before. T-17 mechanically asserts the access-logging RPC body is byte-clean.

### No cross-clinic leakage

Every emitted row's grant has `target_organization_id = p_org_id`, and `p_org_id` itself is bound to an org the caller already belongs to (membership gate at line ~95 of the function body). A clinic B caller cannot probe clinic A by passing `p_org_id = clinic_a` — the function returns zero rows. Smoke test T-7 covers both directions of this case.

### Parent surface unchanged

Parent users have no `organization_memberships` row in any clinic — they fail the membership gate at step 1 and receive zero rows. The Care portal is the only surface that uses this RPC; no parent flow calls it.

### Disclosure minimisation

Unauthenticated callers, non-members, and members asking for arbitrary org/child UUIDs all receive zero rows rather than an exception. This matches the established posture for 077 (`list_documents_for_organization`), 082 (`list_clinic_members`), 103 (`get_care_child_with_details`), and 104 (`get_care_sessions_with_therapists`).

### Strict isolation regression

Smoke test T-16 walks `pg_get_functiondef` over 10 existing helpers/RPCs and asserts none reference `get_care_documents_for_organization`:

- `list_documents_for_organization`
- `log_document_access`
- `log_document_access_for_organizations`
- `accessible_document_ids`
- `caller_visible_child_profile_ids`
- `caller_visible_child_profile_ids_for_identifiers`
- `caller_owned_child_profile_ids`
- `caller_visible_document_ids_for_organizations`
- `get_care_child_with_details` (103)
- `get_care_sessions_with_therapists` (104)

T-17 separately asserts `log_document_access_for_organizations` body is byte-clean. No RLS policy is added, removed, or altered on `child_documents`, `child_document_versions`, `students`, or `document_organization_access_grants`.

---

## Smoke Test Coverage

`supabase/tests/105_care_documents_filtered_rpc_smoke.sql` — 17 scenarios, BEGIN/ROLLBACK harness.

| Test | Scenario | Asserts |
|---|---|---|
| T-1 | Function definition | SECURITY DEFINER, STABLE, REVOKE PUBLIC, GRANT authenticated |
| T-2 | Unauthenticated | 0 rows |
| T-3 | Non-member of `p_org_id` | 0 rows |
| T-4 | Clinic admin org-wide call | Returns exactly the 3 docs with active grants + active status + visible version |
| T-5 | Per-child filter | profile_one → 2 docs, profile_two → 1 doc |
| T-6 | Per-child filter on unrelated child | 0 rows (not an exception) |
| T-7 | Cross-clinic | clinic B → clinic_a returns 0 rows (both unfiltered and per-child) |
| T-8 | Therapist (non-admin) | Same set as admin (membership-based, not role-based) |
| T-9 | Filter consistency | org-wide ⨯ WHERE child = X equals per-child(X) — both return 2 |
| T-10 | Pagination | limit=1 → 1 row; offset=10 → 0; negative offset clamped to 0 |
| T-11 | Expired grant | hidden |
| T-12 | Revoked grant | hidden |
| T-13 | Draft document | hidden |
| T-14 | No storage columns | Result type has no `storage_path` / `signed_url` / `object_key` column |
| T-15 | ★ Strict isolation regression ★ | 10 existing helpers/RPCs byte-clean |
| T-16 | Access logging path untouched | `log_document_access_for_organizations` byte-clean |
| T-17 | Unauthorized cannot infer existence | Random `p_org_id` returns 0 rows |

**Note on hidden-version coverage:** Following the 077 smoke test precedent, T-105 does NOT directly exercise the `cdv.is_hidden = TRUE` clamp. Trigger 5.E (migration 054) either refuses the hide on the only visible version of a non-draft document, or auto-repoints `cd.current_version_id` to a replacement. Combined with the `child_documents_current_version_required_chk` CHECK that forbids non-draft docs with `current_version_id=NULL`, schema invariants make this scenario unreachable through normal SQL. The `cdv.is_hidden IS NOT TRUE` clause in the RPC body stays as defence-in-depth.

Run (non-production project):
```
psql -f supabase/migrations/105_care_documents_filtered_rpc.sql
psql -f supabase/tests/105_care_documents_filtered_rpc_smoke.sql
```
Expected output: `✓ All 105 smoke tests passed.`

---

## Remaining Limitations

1. **Org-wide `/care/documents` still pulls the entire grant set.** This is by design — the page is meant to show every doc shared with the clinic. If a clinic ever crosses a few hundred concurrently-granted docs, pagination on the page should be added in a follow-up (the RPC already supports `p_limit` / `p_offset`).
2. **No document type / search filter in the UI.** The current `/care/documents` view shows a flat list with child-name pills; there is no type chip or search box. Adding those filters is a UI change deferred to a future phase; when they ship, two more optional parameters can be added to the RPC without breaking callers.
3. **`useCareSharedDocuments` cache key is keyed on org only.** The hook is still consumed only by the org-wide page, so the key shape remains correct. If a future per-child cached path is desired, the hook should grow a child-profile dimension and the query key should be extended in parallel.
4. **Fallback path performs the legacy in-JS filter.** During the brief deploy window where migration 105 has not yet been applied to a specific Supabase project, the fallback still over-fetches. This is intentional: behaviour must not regress when the RPC is absent. After confirming the RPC is in place across environments, the fallback can be removed in a follow-up.
5. **Phase 3 does NOT touch continuity or session prep surfaces.** Those land in later phases per scope.
6. **Phase 3 does NOT optimise clinic-internal documents** (`listClinicDocumentsForChild`). That path already filters DB-side via `.eq("child_profile_id", ...)` and was not part of the over-fetch identified in the audit.

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
Lint exits 0 with **958 pre-existing warnings**. No new errors introduced by Phase 3. See `docs/CARE_LINT_RECOVERY_NEXT16.md` for the backlog inventory.

### `npm run build`
```
✓ Compiled successfully
✓ Generating static pages using 7 workers (56/56)
BUILD_EXIT=0
```

### Smoke test
Migration 105 + smoke 105 must be applied + run in a non-production Supabase project. Expected to print `✓ All 105 smoke tests passed.`

---

## Rollback Plan

```sql
DROP FUNCTION IF EXISTS get_care_documents_for_organization(UUID, UUID, INT, INT);
```

The app code already handles RPC absence — `listSharedDocuments` falls back to the legacy 077 + in-JS filter on error. No app-side rollback is required. After confirming the fallback path is healthy, the RPC-side branch can be removed in a follow-up commit.

---

## Out of Scope (Future Phases)

| Surface | Status |
|---|---|
| Continuity page | Future |
| Session prep page | Future |
| `/care/documents` pagination UI | Future (RPC already supports it) |
| Document type / search filter UI | Future (RPC can grow params additively) |
| Clinic-internal document optimisation | Already filters DB-side — no change needed |
| Parent portal | Out of scope |
| Billing | Out of scope |
| Learn repo | Out of scope |
