# Production Continuity Integrity & Operational Resilience — Phase 6D

**Status.** Architecture + safety normalization, plus one surgical
graceful-degradation fix. **No observability platform, no SRE tooling, no
monitoring, no caching rewrite.** This document defines how continuity
preserves trust when the system is stale, delayed, or partially failing —
and closes the one place where a load failure could leave a parent on an
infinite spinner or show a misleading "all quiet" state.

**Scope.** Define integrity classes, stale-state behavior, partial-failure
behavior, revocation/expiry integrity, and quiet-failure principles — so the
sophisticated continuity philosophy of Phases 3–6C survives real-world
imperfection without eroding trust.

**Out of scope.** No enterprise observability, SRE infrastructure, incident
management, metrics platforms, monitoring dashboards, distributed tracing,
uptime analytics, microservices, or global query/caching rewrites. No new
tables, RLS, or RPCs.

---

## 1. The integrity question

The continuity philosophy is now sophisticated enough that small operational
inconsistencies can damage trust: a support context shown on one surface but
gated on another, a revoked grant lingering in a cached list, an infinite
spinner on a single failed fetch, or a calm "All quiet" headline rendered when
the data simply didn't load. Each is a quiet trust-eroder.

**The Lauris answer:** three integrity properties, applied per data class:

1. **Access decisions are always fresh and fail-closed.** The thing that
   matters most — whether a person may actually open a document or mint a
   signed URL — is re-checked server-side on every request through the RPC
   choke point. Cache never grants access.
2. **Displays may be eventually consistent, but never confidently wrong.** A
   list may briefly lag (cache), but the system never presents a load failure
   as genuine quiet, never foregrounds expired reinforcement, and never
   contradicts itself across surfaces in a trust-breaking way.
3. **Degradation is calm and quiet.** When something fails, the surface fails
   softly (calm retry, calm empty) — never an infinite spinner, never a
   technical error, never a "data corruption" feeling.

---

## 2. Current integrity behaviour (verified)

### 2.1 Cache / staleness semantics (`src/lib/query-client.ts`)

- `staleTime: 30s` — data fresh for 30s, then stale-but-cached.
- `gcTime: 5m` — cached data kept 5 minutes for fast back-navigation.
- `refetchOnMount: false`, `refetchOnWindowFocus: false` — respects user
  intent; no aggressive auto-refresh.
- `retry` — transient only (5xx, 408, 429, network); never 4xx (auth/permission
  errors don't retry — they fail closed). Exponential backoff.
- `mutations.retry: 0` — writes never auto-retry (non-idempotent).

**Implication:** a list backed by TanStack Query (e.g., Care shared documents,
parent documents) can show data up to ~5 minutes stale after a revocation.
**But access is not granted by the cache** — see §2.3.

### 2.2 Parent dashboard load (`src/app/parent/dashboard/page.tsx`)

- `loadAll` is a manual `Promise.all` over 11 fetches (not TanStack Query) →
  always fetches fresh on mount; no cache staleness.
- Most fetch helpers are **defensive**: Supabase returns `{ data, error }`
  (does not throw on query errors), and helpers return calm defaults on error
  (`fetchAttendanceToday` → null status; `fetchServicePresence` → base
  presence; `fetchNeedsAttention` → `Promise.allSettled`, explicitly graceful).
- **Gap (the §8 fix):** `loadAll` has **no try/catch/finally**. A thrown error
  (e.g., `auth.getUser()` network rejection, a storage `createSignedUrls`
  rejection, a malformed-date parse) rejects `loadAll`, the trailing
  `setLoading(false)` never runs → **infinite `<PageSpinner />`** (total
  continuity loss). The teacher dashboard already has try/catch + ErrorAlert +
  retry; the parent dashboard does not. And on a thrown failure, falling
  through to the calm-default "All quiet" headline would present a load
  failure as genuine quiet — partial truth presented confidently.

### 2.3 Access decisions fail closed (verified)

- Signed-URL minting always routes through `log_document_access` /
  `log_document_access_for_organizations` / `log_clinic_document_access` /
  `log_care_voice_note_access` — SECURITY DEFINER RPCs that re-check the grant,
  status, expiry, and version on **every** request. A revoked or expired grant
  is denied at mint time regardless of any cached list entry.
- Helper expiry is **inline** (`valid_until > NOW()`) — an expired grant stops
  granting even before any status flip.
- So the worst cache effect is a stale **list row** that, when tapped, fails
  closed (the document won't open). Display lags; access does not.

### 2.4 Freshness gates (Phases 5B/5C)

- Support context fades from the parent home past 45d (`SUPPORT_CONTEXT_FRESHNESS_DAYS`).
- Succession-by-recency orders the two reinforcement lines (Phase 5C).
- Hero cooldowns (2/2/3d), signal windows (7d), recurring window (14d) all
  bound how long anything is foregrounded.

### 2.5 Care fallback states (verified)

- Session prep: `LoadingState` ("Preparing session brief…"), "Session not
  found" fallback, capped + hidden-when-empty sections.
- Parent child detail: loading spinner, "Child not found" fallback.
- At-risk: loading + error ("Could not load risk scores. Please try again.") +
  calm green empty state.
- Care is reasonably resilient already.

### 2.6 ErrorBoundary

- The parent dashboard renders inside `<ErrorBoundary section="parent-dashboard"
  fallback="minimal">` — catches **render** errors, but NOT async rejections in
  effects (which is why §2.2's loadAll gap matters: the boundary can't save it).

---

## 3. Integrity audit summary

| Area | State |
|---|---|
| Access decisions | ✅ fresh + fail-closed every request (RPC choke point) |
| Grant expiry | ✅ inline `valid_until > NOW()` — no stale grant grants access |
| Revocation | ✅ immediate server-side; cached list may lag ≤5m but access denied |
| Parent dashboard partial failure | ⚠️ helpers degrade gracefully, BUT a thrown error → infinite spinner + would fall through to misleading "All quiet" — **§8 fix** |
| Teacher dashboard failure | ✅ try/catch + ErrorAlert + retry |
| Care surfaces | ✅ loading / not-found / error / empty states present |
| Freshness | ✅ 45d support-context gate, cooldowns, signal windows |
| Cross-surface support-context consistency | ⚠️ Learn home gates at 45d; Care detail page does not (documented Care-repo gap, 5B §7.2) — a context can show on Care but be hidden on Learn |
| Cache | ✅ conservative (30s/5m), no aggressive refetch, retry only transient |

---

## 4. Integrity taxonomy

Seven classes. Each defines consistency requirement, stale tolerance, cache
behavior, fallback, visibility, trust sensitivity, and suppression.

| Class | Consistency | Stale tolerance | Cache | Fallback | Trust sensitivity | Suppression |
|---|---|---|---|---|---|---|
| **Strongly Consistent** (access decisions, revocation effect, Med-sensitive gates) | strong, per-request | none | never grants | fail closed | highest | deny on uncertainty |
| **Softly Consistent** (journey feed, document/child lists) | eventual | ≤ gcTime (5m) | cache-OK | show cached, refetch | medium | hide row only if it would mislead |
| **Freshness-Sensitive** (support context, signals, hero) | window-bounded | within window only | fetch-fresh on mount | calm default | high (stale framing erodes trust) | gate past window (45d/7d/cooldowns) |
| **Quietly Expirable** (grants, signals, reinforcement) | time-bounded | until `valid_until` | n/a | disappears silently | high | inline expiry, no banner |
| **Cache-Tolerant** (connected-service presence, recurring categories) | eventual | generous | cache-OK | calm presence | low | none needed |
| **Fail-Closed** (signed URLs, sensitive/Med, consent reads) | strong | none | never | deny + calm 404/403 | highest | deny silently (disclosure-minimizing) |
| **Gracefully Degradable** (dashboard load, prep load) | best-effort | n/a | fresh on mount | calm retry / calm empty — never hang, never mislead | high | quiet retry state |

---

## 5. Stale-state semantics

1. **Freshness-sensitive continuity hides past its window** rather than
   showing stale framing (45d support-context gate; 7d signals; hero
   cooldowns). No "this might be old" banner — it simply isn't foregrounded.
2. **Softly-consistent lists may lag briefly** (≤5m cache) but the access
   decision behind any row is always fresh — a stale row fails closed when
   tapped.
3. **Stale never masquerades as current.** Expired reinforcement is not
   foregrounded; a load failure is not shown as "All quiet" (§8).
4. **No red stale indicators, no panic, no "data may be outdated" banners** —
   staleness is handled by quiet disappearance, not by alarming the user.

---

## 6. Partial-failure & degradation principles

1. **Access fails closed.** When a grant/consent/version check is uncertain,
   deny. Disclosure-minimizing (collapse to 404), never "you're not allowed"
   detail.
2. **Displays fail soft.** A failed sub-fetch degrades that one surface to a
   calm empty/absent state; it does not blank the page or hang it.
3. **The page never hangs.** Every loader clears its spinner in a `finally`
   (§8 brings the parent dashboard in line with the teacher dashboard).
4. **Failure never masquerades as quiet.** A total load failure shows a calm,
   non-technical retry — never the "All quiet" default headline (§8).
5. **Degradation is silent and reassuring**, never technical. "We couldn't
   load … just now. Your information is safe. Try again." — no stack trace, no
   HTTP code, no "corruption."

### 6.1 Anti-patterns (permanent rules)

- **No contradictory continuity** across surfaces presented as equally
  authoritative.
- **No stale emotional framing** — expired reinforcement / proud moments never
  foregrounded past their window.
- **No revoked access lingering as usable** — a cached list row must fail
  closed when acted on; never mint access from cache.
- **No partial truth presented confidently** — a load failure is never shown
  as "All quiet" or as a complete picture.
- **No noisy technical failure states** — no error codes, stack traces,
  "corruption," or red panic to parents.
- **No infinite spinners** — every loader resolves to content, calm empty, or
  calm retry.
- **No inconsistent cross-surface continuity** that a reasonable person would
  read as contradictory (cross-surface support-context gating is the one known
  gap — documented, Care-repo deferred).

---

## 7. Continuity consistency matrix

| Data type | Consistency model | On staleness | On failure |
|---|---|---|---|
| **Support context** | Freshness-sensitive (45d gate) | hide past 45d (Learn home) | absent (calm) |
| **Grants / visibility** | Strongly consistent (access) + softly consistent (list) | list ≤5m lag; access fresh | fail closed |
| **Therapy continuity** (parent_visible_summary) | Softly consistent | feed may lag ≤5m | absent / calm empty |
| **Parent signals** (priority cards) | Freshness-sensitive / fresh-on-mount | bounded by windows | absent (no card) |
| **Reflection surfaces** (proud moments, progress) | Cache-tolerant + memory | newest-wins push-down | calm empty |
| **Lifecycle states** (enrollment anchor) | Softly consistent | most-recent placement (5E) | "—" fallback |
| **Med-sensitive continuity** | Fail-closed / strongly consistent | never stale-shown | deny, never expose |
| **Connected-service presence** | Cache-tolerant | generous | absent chip |
| **Signed-URL access** | Strongly consistent, per-request | never cached | fail closed (404/403) |

---

## 8. Implementation in this phase — parent dashboard graceful degradation

The audit identifies one LIVE integrity gap: the parent dashboard's `loadAll`
has no try/catch/finally. A thrown error leaves the parent on an infinite
spinner, and any fall-through would render the calm "All quiet" headline over a
load failure (partial truth presented confidently).

**Fix.** Wrap `loadAll` in `try / catch / finally`:

- `finally { setLoading(false) }` — the spinner always clears; no infinite
  hang.
- `catch` — set a `loadFailed` flag and quietly `console.error` (no technical
  exposure to the parent).
- A calm render branch (after the loading guard) shows, when `loadFailed`:
  *"We couldn't load {child}'s updates just now. This is usually temporary —
  your information is safe."* + a "Try again" button that re-runs `loadAll`.
  This branch returns **before** the main dashboard render, so the misleading
  "All quiet" default never shows on a failure.

**Why this is the right minimum.**

1. **Closes a real total-continuity-loss failure mode** (infinite spinner on
   any thrown error).
2. **Matches the directive's quiet-failure principles** — calm, non-technical,
   reassuring, with retry; no red panic, no error codes.
3. **Avoids "partial truth presented confidently"** — distinguishes "couldn't
   load" from "genuinely quiet."
4. **Brings the parent dashboard in line with the teacher dashboard** (which
   already try/catches), removing an inconsistency.
5. **Surgical** — one new boolean state, a try/catch/finally around the
   existing body, and one calm render branch in one file. No logic change to
   any fetch, no schema/RLS/RPC/cache change.

**Deliberately NOT done (out of scope / would over-reach).**

- Cross-surface support-context gating on the Care detail page (Care-repo;
  documented 5B §7.2) — a real but lower-urgency cross-surface gap.
- Any TanStack Query cache-invalidation rework (the access-fail-closed posture
  already protects the thing that matters).
- A loud parent-facing error system / toast infrastructure.
- Retry/backoff changes (the query-client config is sound).
- Any monitoring, observability, or SRE tooling.

---

## 9. Files inspected (Phase 6D)

**Learn**
- `src/lib/query-client.ts` — staleTime/gcTime/retry/refetch config + query-key factory
- `src/app/parent/dashboard/page.tsx` — `loadAll` (the §8 fix site), loading guard, ErrorBoundary wrapper
- `src/features/parent-journey/queries.ts` — `fetchNeedsAttention` (`Promise.allSettled`), defensive `{data,error}` helpers, freshness gate
- `src/app/(dashboard)/dashboard/TeacherDashboard.tsx` — try/catch + ErrorAlert + retry (the resilience pattern the parent dashboard should match)
- `supabase/migrations/074/076/091` (per CLAUDE.md) — inline `valid_until > NOW()` expiry; RPC choke-point access decisions

**Care**
- `app/session/[id]/prep/page.tsx` — LoadingState, not-found fallback, capped sections
- `app/admin/at-risk/page.tsx` — loading / error / empty states
- `lib/api/continuity-api.ts` — pure assembly; defensive shape

**Cross-references**
- `docs/CROSS_ORG_TRUST_AND_CONSENT.md` (revocation), `docs/CONTINUITY_FRESHNESS_AND_DECAY.md` (45d gate), `docs/MED_READINESS_AND_SENSITIVE_CONTINUITY.md` (fail-closed sensitive), `docs/TRANSITION_AND_LIFECYCLE_CONTINUITY.md` (most-recent placement)

---

## 10. Future integrity work intentionally not started

- **Care detail-page support-context freshness gate** — the cross-surface
  consistency gap (Learn home gates at 45d, Care does not). Care-repo change;
  documented since 5B.
- **Targeted cache invalidation on revocation** — invalidate the relevant
  TanStack query keys when a grant is revoked so the list updates immediately
  rather than after gcTime. Low urgency (access already fails closed); a clean
  follow-up using the existing `queryKeys` factory.
- **A shared calm "couldn't load" component** — if more parent surfaces need
  graceful-failure states, factor the §8 pattern into a reusable component.
- **Stale-while-revalidate cue** on long-cached lists — only if a real
  confusion case emerges; avoid adding "this may be outdated" noise speculatively.
- **Offline / connection-loss handling** — out of scope; would need a
  connectivity layer.

---

## 11. Permanent continuity-integrity rules (codified)

1. Access decisions are always fresh and fail-closed — cache never grants access.
2. Displays may be eventually consistent, but never confidently wrong.
3. A load failure is never shown as genuine quiet — "couldn't load" ≠ "all quiet."
4. Every loader resolves to content, calm empty, or calm retry — never an infinite spinner.
5. Stale framing hides rather than showing with a warning — quiet disappearance, not alarm.
6. Expired/revoked continuity disappears silently; the receiving side never sees it as usable.
7. Degradation is calm, non-technical, and reassuring — no codes, stack traces, "corruption," or red panic.
8. Cross-surface continuity must never contradict in a trust-breaking way; known gaps are documented, not hidden.
9. Sensitive/Med continuity is fail-closed under any uncertainty.
10. Resilience scales by applying these per-class rules consistently — not by adding monitoring or infrastructure.
