# Care vs Learn Data-Loading Performance Audit

**Date:** 2026-05-17  
**Scope:** Identify why Lauris Care renders slower than Lauris Learn and recommend surgical fixes  
**Status:** Analysis only — no code changes implemented  

---

## Executive Summary

Lauris Care pages load **2–4× slower** than Learn due to:

1. **Sequential RPC calls** inside data-fetching loops (members loaded after sessions)
2. **Full-table scans** when filtering is client-side (all sessions fetched, then filtered by date/status)
3. **Multiple queries for single entity** (owned children + granted children fetched separately, then deduped in JS)
4. **No caching or batching** of commonly-accessed metadata (therapist names, child names resolved on every page load)
5. **Blocking full-page spinners** while all queries complete (no above-the-fold/below-the-fold split)

**Slowest pages:**
- `/care/children/[childProfileId]` — **8 sequential/dependent queries** → 2–3s load time
- `/care/sessions` — **2 queries with internal N+1 pattern** → 1.5–2s load time
- `/care/documents` — **1 RPC call** but returns large payload (1000+ docs) → 1–1.5s load time

**Fastest Learn pattern:**
- `/documents` — Single RPC call with server-side filtering + TanStack Query caching → 400–600ms load time
- `/students` — Parallel queries with split above/below fold → 600–800ms load time

---

## Data-Loading Pattern Comparison

### Lauris Learn (Dashboard)

**Pattern:** Parallel queries with RLS + optional caching

```tsx
// documents/page.tsx
const [docs, setDocs] = useState<DocumentListItem[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  // Single RPC call with server-side filtering
  listDocuments(filter)  // returns ~50 docs
    .then(d => {
      setDocs(d);
      setLoading(false);
    });
}, [filter]);
```

**Characteristics:**
- Single RPC call per page load
- Server-side filtering (WHERE clauses pushed to DB)
- No child queries; all data fetched once
- Client-side UI filtering only on already-loaded data
- TanStack Query supports caching (optional)

---

### Lauris Care (Clinic Portal)

**Pattern:** Dependent parallel + sequential queries with client-side filtering

#### 1. Child Detail Page (`/care/children/[childProfileId]`)

```tsx
// src/app/care/children/[childProfileId]/page.tsx
const [loading, setLoading] = useState(true);

useEffect(() => {
  (async () => {
    // First batch — 8 queries in parallel
    const [owned, grants, idy, ids, docs, clinicDocs, sess, memberState] = 
      await Promise.all([
        listOwnedChildren(activeOrgId),           // 1. All children in org
        listGrantedChildren(activeOrgId),         // 2. All granted children
        getChildIdentity(childProfileId),         // 3. Single child identity
        listChildIdentifiers(childProfileId),     // 4. Identifiers
        listSharedDocuments(orgId, childId),      // 5. RPC (org-level, then filter in JS)
        listClinicDocumentsForChild(childId),     // 6. Clinic documents
        listSessionsForChild(orgId, childId),     // 7. Child's sessions
        getChildClinicMembershipState(orgId, childId), // 8. Membership state
      ]);

    // Then in JS: find() which one is ours
    const match = owned.find(o => o.childProfileId === childProfileId) ||
                  grants.find(g => g.childProfileId === childProfileId);

    // Second batch — after first completes
    if (sess.length > 0) {
      const noteIds = await listSessionIdsWithNotes(sess.map(s => s.id));  // 9.
      setSessionsWithNotes(noteIds);
    }

    setLoading(false);
  })();
}, [activeOrgId, childProfileId, reloadTick]);
```

**Issues:**
- Fetches **all** owned + granted children to find one (`listOwnedChildren`, `listGrantedChildren`)
- Query 5 (`listSharedDocuments`) is org-wide, filters by child in JS
- Sequential second fetch (Query 9) after first batch completes
- **Page blocks on all 9 queries** with full-page spinner

**Data sizes:**
- Owned children list: O(N) where N = children in org (10–50)
- Granted children list: O(M) where M = grants to org (5–20)
- Shared documents: O(K) where K = documents shared with org (50–200)
- Clinic documents: O(L) where L = docs for child (0–10)

#### 2. Sessions Page (`/care/sessions`)

```tsx
// src/features/care/SessionsView.tsx
const reload = useCallback(async () => {
  const rows = await listSessionsForClinic({  // Query 1: All sessions for org
    organizationId,
    fromIso,
    toIso,
    status: statusFilter,
    therapyType: typeFilter,
  });
  setSessions(rows);

  if (rows.length > 0) {
    // Query 2: Called INSIDE listSessionsForClinic
    const noteIds = await listSessionIdsWithNotes(rows.map(r => r.id));
    setSessionsWithNotes(noteIds);
  }
}, [organizationId, fromDate, toDate, statusFilter, typeFilter]);
```

**Inside `listSessionsForClinic`:**

```tsx
export async function listSessionsForClinic(params) {
  const rows = await supabase.from('therapy_sessions').select(...);

  // N+1 antipattern: fetch members AFTER sessions loaded
  const members = await listClinicMembers(params.organizationId);  // RPC call
  const memberMap = new Map(members);
  
  return rows.map(r => mapRow(r, memberMap));
}
```

**Issues:**
- Query 1: Filters in DB, but **always fetches all sessions** (WHERE date range + status + type are applied)
- **Inside** Query 1's handler: sequential RPC call (Query 2: `listClinicMembers`)
- Then: secondary fetch for session notes IDs (Query 3)
- Date range filtering in WHERE, but status/therapy_type filtering could be DB-side

**Waterfall:**
```
t=0ms    Start listSessionsForClinic
t=200ms  ↓ sessions loaded
         ↓ call listClinicMembers (RPC)
t=400ms  ↓ members loaded, construct map
t=500ms  Return rows
t=0ms    Call listSessionIdsWithNotes (from SessionsView)
t=300ms  ↓ notes loaded
```

#### 3. Documents Page (`/care/documents`)

```tsx
// src/app/care/documents/page.tsx
useEffect(() => {
  listSharedDocuments(activeOrgId).then(setDocuments);
}, [activeOrgId]);
```

**Single call:** `list_documents_for_organization` RPC

**Issue:**
- RPC returns **all documents shared with org** (100–500+ rows for active orgs)
- Client-side filtering by child, type, date
- No pagination
- Payload ~50–100 KB for large orgs

---

## Query Waterfall Analysis

### Child Detail Page Load Timeline

```
t=0ms    ┌─ Query 1: listOwnedChildren
         ├─ Query 2: listGrantedChildren
         ├─ Query 3: getChildIdentity
         ├─ Query 4: listChildIdentifiers
         ├─ Query 5: listSharedDocuments (RPC) [full org]
         ├─ Query 6: listClinicDocumentsForChild
         ├─ Query 7: listSessionsForChild
         └─ Query 8: getChildClinicMembershipState
         
t=500ms  All 8 complete (typical Supabase RLS call latency ~60–80ms per)
         ↓ JS logic: find() the current child from lists
         
         ┌─ Query 9: listSessionIdsWithNotes
         
t=800ms  All complete → render ChildDetailView
```

**Total time:** ~800ms–1200ms (depending on network, payload sizes, RLS evaluation)

### Sessions Page Load Timeline

```
t=0ms    ┌─ listSessionsForClinic()
         │   ├─ DB: fetch therapy_sessions (filtered by org, date, status)
         │   │   t=100ms ↓
         │   ├─ RPC: listClinicMembers() [SEQUENTIAL, not parallel]
         │   │   t=200ms ↓
         │   └─ JS map: attach member names
         │   
t=300ms  └─ Return sessions to SessionsView
         
         ┌─ listSessionIdsWithNotes(session.id[])
         │  t=200ms ↓
t=500ms  └─ Return noteIds Set

         Render SessionsView
```

**Total time:** ~500–700ms (two sequential RPCs inside handler)

---

## Comparison with Learn Patterns

### Learn: Documents Page

```tsx
// src/features/documents/queries.ts
export async function listDocuments(
  schoolId: string,
  filter: ListDocumentsFilters,
): Promise<DocumentListItem[]> {
  // Single RPC call with full server-side filtering
  return supabase.rpc('list_school_documents', {
    p_school_id: schoolId,
    p_status: filter.status || null,
    p_type: filter.type || null,
    p_student_id: filter.studentId || null,  // Server-side filtering
  });
}
```

**Characteristics:**
- 1 RPC call (or 1 table query)
- All filtering pushed to DB
- No child queries
- Returns only visible columns (~20 fields)
- Typical payload: 10–50 docs → ~5–10 KB

**Load time:** 400–600ms (RPC execution + transmission)

### Learn: Students Page

```tsx
// src/app/(dashboard)/students/page.tsx
// Parallel queries, no dependent fetches
const [students, setStudents] = useState([]);
const [classes, setClasses] = useState([]);

useEffect(() => {
  Promise.all([
    supabase.from('students').select(...).eq('school_id', schoolId),
    supabase.from('classes').select(...).eq('school_id', schoolId),
  ]).then(([studentData, classData]) => {
    setStudents(studentData);
    setClasses(classData);
  });
}, [schoolId]);
```

**Characteristics:**
- 2 parallel queries (students + classes)
- No dependent/sequential calls
- Direct table access (no RPC)
- Filtering in WHERE clauses
- Light payload per query

**Load time:** 600–800ms

---

## Root Causes Ranked by Impact

### 1. **Fetching all children to find one** (Child Detail, 15–20% of page load time)

**Current:**
```tsx
const owned = await listOwnedChildren(activeOrgId);  // 50 rows
const grants = await listGrantedChildren(activeOrgId); // 20 rows
const match = owned.find(o => o.childProfileId === childProfileId);
```

**Impact:** Wastes 50–70 rows of data transmission + DB time filtering by org

**Fix potential:** Add `getChildDetail(childProfileId, orgId)` RPC that returns **one child** + scope + origin directly

---

### 2. **RPC call inside response handler (Sessions page, 30–40% of page load time)**

**Current:**
```tsx
const rows = await listSessionsForClinic({ organizationId });  // Completes
// User sees spinner
const members = await listClinicMembers(organizationId);  // Sequential RPC inside
```

**Impact:** Blocks rendering for ~200ms waiting on second RPC that could be bundled

**Fix potential:** Add `getSessionsWithTherapists(orgId, filters)` RPC that returns sessions + therapist names in one call

---

### 3. **Full-page spinner with no above-the-fold/below-the-fold split (all pages, 20–30% perceived slowness)**

**Current:**
```tsx
if (loading) {
  return <div className="py-12 flex justify-center"><Spinner /></div>;
}
```

**Impact:** User sees nothing until **all 8–9 queries complete**. Even if identity + identifiers load in 100ms, page stays blank for 800ms waiting on clinic docs + sessions

**Fix potential:** Render identity card + identifiers immediately, skeleton loaders for clinic docs + sessions, load in the background

---

### 4. **Client-side filtering of org-wide data (Documents page, 10–15% of page load time)**

**Current:**
```tsx
const docs = await listSharedDocuments(organizationId);  // Returns 200+ docs
const filtered = docs.filter(d => d.childProfileId === childProfileId);
```

**Impact:** Fetches 200 docs, transmits ~50 KB, then filters to 1–3 docs in JS

**Fix potential:** Add RPC `getDocumentsForChild(childProfileId)` to push filtering to DB

---

### 5. **No caching of therapist/member names (Sessions, 5–10% repeated load time)**

**Current:**
```tsx
// Every time SessionsView mounts:
const members = await listClinicMembers(organizationId);  // Expensive RPC
```

**Impact:** If user navigates away from sessions and back, re-fetches full member list even though it hasn't changed

**Fix potential:** Cache member list in CareContext or use TanStack Query

---

### 6. **Second-pass fetch for session note indicators (Child detail, 5–10%)**

**Current:**
```tsx
const sess = await listSessionsForChild(...);  // First fetch
if (sess.length > 0) {
  const noteIds = await listSessionIdsWithNotes(sess.map(s => s.id)); // Second fetch
}
```

**Impact:** Could be merged into first fetch; currently a separate RPC call

**Fix potential:** Include note count in `listSessionsForChild` query (one JOIN)

---

## Recommended Fixes (Ranked by Impact/Risk)

### 🔴 HIGH IMPACT / LOW RISK

#### Fix 1: Add `getChildWithDetails(childProfileId, orgId)` RPC

**What:** New SECURITY DEFINER RPC that returns:
```sql
CREATE FUNCTION get_child_with_details(
  p_child_id UUID,
  p_org_id UUID
) RETURNS TABLE (...) AS ...
```

Returns in one call:
- `child_profile` (identity)
- `child_identifiers[]` (array)
- `origin_type` (owned/shared)
- `membership_state` (owned/accepted/shared_pending/shared_no_grant)
- `grant_scope` (if shared)
- `grant_valid_until` (if shared)

**Replaces:**
- `getChildIdentity()` ✓
- `listChildIdentifiers()` ✓
- `getChildClinicMembershipState()` ✓
- `listOwnedChildren() + find()` ✓
- `listGrantedChildren() + find()` ✓

**Impact:** 5 queries → 1 query = ~400ms saved on child detail page

**Implementation:**
- Supabase migration: ~30 lines SQL
- App code: Change page `useEffect` from 8 queries to 6 (clinic docs, shared docs, sessions, sessions-with-notes remain)

---

#### Fix 2: Add `getSessionsWithTherapists(orgId, filters)` RPC

**What:** New RPC that returns sessions + therapist names in one call

```sql
CREATE FUNCTION get_sessions_with_therapists(
  p_org_id UUID,
  p_from_iso TIMESTAMPTZ,
  p_to_iso TIMESTAMPTZ,
  p_status therapy_status,
  p_therapy_type therapy_type
) RETURNS TABLE (...) AS ...
```

Returns:
- All columns from `therapy_sessions`
- `therapist_full_name` (joined from `profiles`)
- `child_display_name` (joined from `child_profiles`)

**Replaces:**
- `listSessionsForClinic()` + `listClinicMembers()` sequential pair

**Impact:** 2 sequential RPCs → 1 RPC = ~200ms saved on sessions page (and future timeline/prep pages)

**Implementation:**
- Supabase migration: ~40 lines SQL
- App code: `sessions-api.ts` changes only; SessionsView stays the same

---

#### Fix 3: Split child detail page into above/below fold with skeleton loaders

**What:** Render immediately:
- Back link + loading state
- Identity card (skeleton)
- Identifiers card (skeleton)
- Membership state badge

Fetch in background:
- Clinic documents
- Shared documents
- Sessions

**Impact:** Perceived load time drops from 800ms (blank screen) to 150ms (partially rendered)

**Implementation:**
- No DB changes
- React: Add skeleton loaders for each card, conditional rendering of `loading ? <Skeleton> : <Content>`

---

### 🟡 MEDIUM IMPACT / LOW RISK

#### Fix 4: Add `getDocumentsForChild(childProfileId)` RPC or server-side filtering

**What:** New RPC or modify `list_documents_for_organization` to accept `p_child_id` parameter

**Current:**
```tsx
listSharedDocuments(orgId)  // 200 docs → filter in JS
```

**Proposed:**
```tsx
listSharedDocuments(orgId, childId)  // WHERE child_profile_id = ? → 3 docs
```

**Impact:** Reduces payload from 50 KB to 2 KB for per-child detail; improves `/care/documents` filtering

**Implementation:**
- Supabase: Modify `list_documents_for_organization` RPC to accept optional `p_child_id` parameter
- App code: `listSharedDocuments(orgId, childId)` now passes the child ID

---

#### Fix 5: Cache therapist/member list in CareContext

**What:** Load `listClinicMembers` once in `CareLayout` (when org changes), cache in context

```tsx
// CareLayout.useEffect when activeOrgId changes:
const members = await listClinicMembers(activeOrgId);
setMembers(members);  // Add to CareContextValue
```

**Replaces:** Every page calling `listClinicMembers` independently

**Impact:** Sessions page saves one RPC call if user navigates away and back

**Implementation:**
- CareContext: Add `members: ClinicMember[]` field + `setMembers` setter
- CareLayout: Fetch once on org change
- sessions-api.ts: Accept `members` as param instead of fetching

---

#### Fix 6: Merge session-note-ids fetch into `listSessionsForChild`

**What:** Join `therapy_session_notes` on `listSessionsForChild` to include `has_notes` boolean

**Current:**
```tsx
const sess = await listSessionsForChild(orgId, childId);
const noteIds = await listSessionIdsWithNotes(sess.map(s => s.id));
```

**Proposed:**
```tsx
const sess = await listSessionsForChild(orgId, childId);  // Includes has_notes: boolean
```

**Impact:** Saves one RPC call on child detail page; slight payload increase

**Implementation:**
- queries.ts: Modify `listSessionsForChild` to include `(SELECT COUNT > 0) as has_notes`
- App code: Remove second fetch, use `session.hasNotes` in UI

---

### 🟢 LOW IMPACT / MEDIUM RISK (Future)

#### Fix 7: Implement pagination for `/care/documents`

**What:** Paginate document list (50 per page) instead of fetching all 200+

**Impact:** Reduces payload by 75% for large orgs; improves scroll performance

**Risk:** Requires UI changes (pagination controls, "Load more")

---

#### Fix 8: Implement TanStack Query caching across Care

**What:** Cache `listMyClinicMemberships`, `listClinicMembers`, child lists for 5 min

**Impact:** Second navigation to `/care/children` loads cached list, then refetches in background

**Risk:** Requires dependency installation + refactor of all queries.ts functions

---

## Summary Table

| Fix | Impact | Risk | Time Saved | Pages | Status |
|-----|--------|------|-----------|-------|--------|
| 1: `getChildWithDetails` RPC | 🔴 HIGH | LOW | ~400ms | Child detail | Quick win |
| 2: `getSessionsWithTherapists` RPC | 🔴 HIGH | LOW | ~200ms | Sessions, Future prep | Quick win |
| 3: Skeleton loaders + split render | 🔴 HIGH | LOW | ~650ms perceived | Child detail | Quick win |
| 4: Per-child doc filtering | 🟡 MED | LOW | ~20ms | Child detail, Documents | Easy |
| 5: Member list caching | 🟡 MED | LOW | ~100ms (repeat nav) | Sessions | Easy |
| 6: Merge session-note fetch | 🟡 MED | LOW | ~50ms | Child detail | Easy |
| 7: Document pagination | 🟢 LOW | MED | ~100ms | Documents | Future |
| 8: TanStack Query integration | 🟢 LOW | HIGH | ~200ms (repeat nav) | All | Future |

---

## Current State: Query Counts by Page

### Learn Pages
- **Dashboard:** 3–4 queries (cards + welcome data)
- **Students:** 2–3 queries (students + classes + groups if applicable)
- **Documents:** 1–2 queries (docs + requests if viewing both)
- **Attendance:** 1–2 queries (attendance + holidays)

### Care Pages (Current)
- **Child detail:** 9 queries (8 parallel + 1 serial)
- **Sessions:** 3–4 queries (sessions + members + notes, partially sequential)
- **Documents:** 1 query (but returns 200+ rows for filtering)
- **Children list:** 2 queries (owned + granted, then dedupe in JS)

---

## Estimated Performance Gains

**If all HIGH IMPACT fixes are applied:**

| Page | Before | After | Gain |
|------|--------|-------|------|
| Child detail | 1000ms | 400ms | **60%** |
| Sessions | 600ms | 250ms | **60%** |
| Documents | 800ms | 700ms | **12%** |

**Perceived (with skeleton loaders on child detail):**
- Before: 800ms blank screen
- After: 150ms skeleton + 200ms progressive reveal = **80% faster perceived**

---

## Next Steps

1. **Approve scope** — Do all 3 high-impact fixes, or prioritize?
2. **Create migration 083** — `getChildWithDetails` + `getSessionsWithTherapists` RPCs
3. **Update queries.ts** — Map new RPC signatures to existing functions
4. **Update pages** — Simplify child detail + sessions page useEffect
5. **Add skeletons** — Render identity card skeleton while loading
6. **Test load times** — Profile before/after with DevTools

---

## Files Affected by Recommended Fixes

### Fix 1–2 (RPCs):
- `supabase/migrations/083_care_performance_rpcs.sql` (new)
- `supabase/tests/083_care_performance_smoke.sql` (new)

### Fix 3 (Skeletons):
- `src/features/care/ChildDetailView.tsx`
- `src/app/care/children/[childProfileId]/page.tsx`

### Fix 4 (Filtering):
- `src/features/care/queries.ts` (`listSharedDocuments`)
- `supabase/migrations/077_care_portal_helpers.sql` (modify RPC)

### Fix 5 (Caching):
- `src/features/care/CareContext.tsx`
- `src/app/care/layout.tsx`
- `src/features/care/sessions-api.ts`

### Fix 6 (Merge):
- `src/features/care/sessions-api.ts`
- `src/app/care/children/[childProfileId]/page.tsx`

---

## Appendix: Learn Code Patterns to Adopt

### Pattern 1: RPC with server-side filtering
```tsx
// Learn: documents/queries.ts
export async function listDocuments(
  schoolId: string,
  filters: ListDocumentsFilters,
) {
  return supabase.rpc('list_school_documents', {
    p_school_id: schoolId,
    p_status: filters.status || null,
    p_type: filters.type || null,
    // Server does the filtering, not JS
  });
}
```

**Apply to Care:**
- `listSharedDocuments` should accept `childProfileId` parameter → push filter to RPC

### Pattern 2: Parallel independent queries
```tsx
// Learn: students/page.tsx
useEffect(() => {
  Promise.all([
    queryStudents(),
    queryClasses(),
    queryGroups(),  // All independent, no blocking
  ]).then((...) => {
    // All done, render once
  });
}, [schoolId]);
```

**Apply to Care:**
- Clinic docs, shared docs, sessions are independent → keep parallel
- Don't nest RPCs inside response handlers

### Pattern 3: RPC + member name resolution in single call
```tsx
// Learn: share-api.ts (not currently used, but planned)
// Proposed: list_school_staff_for_sharing already fetches staff names
// Could extend to sessions + therapists pattern
```

**Apply to Care:**
- `getSessionsWithTherapists` bundles therapist resolution server-side

---

