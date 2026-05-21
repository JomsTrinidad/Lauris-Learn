import type { SupabaseClient } from "@supabase/supabase-js";
import { updateToJourney, observationToJourney, therapySessionToJourney } from "./adapters";
import { isHighlightStillFeatured } from "./helpers";
import type {
  ParentJourneyItem,
  AttendanceTodayResult,
  UpcomingItem,
  NeedsAttentionCounts,
  LatestHighlight,
  FallbackHighlight,
  ServicePresence,
  RecentVoiceNoteSignal,
} from "./types";

interface JourneyFeedParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  childId: string;
  classId: string | null;
  schoolName: string;
  /**
   * The shared `child_profiles.id` for this student (when set). Used only to
   * compose a Care deep-link on therapy rows. When null, therapy rows render
   * without an `actionHref` and degrade gracefully.
   */
  childProfileId?: string | null;
}

// Phase 2 Unified Parent Hub — Care deep-link base URL. Read once at module
// load. When unset, therapy rows simply don't carry an `actionHref`.
const CARE_BASE_URL: string | null =
  (process.env.NEXT_PUBLIC_CARE_BASE_URL ?? "").trim() || null;

export async function fetchJourneyFeed({
  supabase,
  childId,
  classId,
  schoolName,
  childProfileId,
}: JourneyFeedParams): Promise<ParentJourneyItem[]> {
  const items: ParentJourneyItem[] = [];

  // Fetch school updates + progress observations + therapy items in parallel.
  const updatesQuery = classId
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("parent_updates")
        .select("id, content, image_url, image_urls, created_at, author:profiles(full_name), class:classes(name)")
        .or(`class_id.eq.${classId},class_id.is.null`)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(10)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("parent_updates")
        .select("id, content, image_url, image_urls, created_at, author:profiles(full_name), class:classes(name)")
        .is("class_id", null)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(10);

  const obsQuery = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("progress_observations")
      .select("id, rating, notes, observed_at, progress_categories(name)")
      .eq("student_id", childId)
      .eq("visibility", "parent_visible")
      .order("observed_at", { ascending: false })
      .limit(10);

  // Therapy items come from the parent-safe SECURITY DEFINER RPC (migration 091).
  // Only returns completed sessions with a non-empty parent_visible_summary.
  // Returns an empty array when the child has no linked child_profile or no
  // therapy sessions with parent-facing summaries. Never throws.
  const therapyQuery = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("list_parent_visible_therapy_updates", { p_student_id: childId });

  const [
    { data: updatesData },
    { data: obsData },
    { data: therapyData },
  ] = await Promise.all([updatesQuery, obsQuery, therapyQuery]);

  // Sign up to 3 image paths per update for the thumbnail strip in the journey feed.
  // Collect unique paths across all updates (deduped); index-map lets us resolve back.
  const thumbPathsFlat: string[] = [];
  const thumbPathDedup = new Map<string, number>(); // path → index in flat array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateThumbPaths = new Map<string, string[]>(); // updateId → up-to-3 storage paths
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (updatesData ?? []) as any[]) {
    const allPaths: string[] = Array.isArray(u.image_urls) && u.image_urls.length > 0
      ? u.image_urls : (u.image_url ? [u.image_url] : []);
    const storagePaths = allPaths.slice(0, 3).filter((p: string) => p && !p.startsWith("http"));
    if (storagePaths.length > 0) {
      updateThumbPaths.set(u.id, storagePaths);
      for (const p of storagePaths) {
        if (!thumbPathDedup.has(p)) {
          thumbPathDedup.set(p, thumbPathsFlat.length);
          thumbPathsFlat.push(p);
        }
      }
    }
  }
  const thumbSignedMap = new Map<string, string>(); // path → signedUrl
  if (thumbPathsFlat.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signed } = await (supabase as any).storage
      .from("updates-media").createSignedUrls(thumbPathsFlat, 3600);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (signed ?? []).forEach((s: any, i: number) => {
      if (s.signedUrl) thumbSignedMap.set(thumbPathsFlat[i], s.signedUrl);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (updatesData ?? []) as any[]) {
    const mediaCount = Array.isArray(u.image_urls) && u.image_urls.length > 0
      ? u.image_urls.length
      : (u.image_url ? 1 : 0);
    const paths = updateThumbPaths.get(u.id) ?? [];
    const thumbUrls = paths.map((p) => thumbSignedMap.get(p)).filter(Boolean) as string[];
    items.push(updateToJourney(u, childId, schoolName, mediaCount, thumbUrls));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (obsData ?? []) as any[]) {
    items.push(observationToJourney(o, childId, schoolName));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ts of (therapyData ?? []) as any[]) {
    items.push(therapySessionToJourney(ts, childId, {
      careBaseUrl:    CARE_BASE_URL,
      childProfileId: childProfileId ?? null,
    }));
  }

  // Sort merged feed newest first.
  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items.slice(0, 15);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAttendanceToday(supabase: SupabaseClient<any>, childId: string): Promise<AttendanceTodayResult> {
  const today = new Date().toISOString().split("T")[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("attendance_records")
    .select("status, created_at")
    .eq("student_id", childId)
    .eq("date", today)
    .maybeSingle();
  if (!data) return { status: null, checkedInAt: null, checkedInAtIso: null };
  return {
    status: data.status,
    // Localized human-readable time for display.
    checkedInAt: new Date(data.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
    // Raw ISO timestamp so the Phase-3 hero priority chain can compute
    // freshness (Tier C cutoff) without re-parsing the localized string.
    checkedInAtIso: data.created_at,
  };
}

// Priority: class-specific event for child's class > school/meeting/deadline events > holidays.
// Holidays only surface as "Next Event" when no more relevant events exist.
function eventPriority(
  eventType: string,
  appliesTo: string,
  classId: string | null,
  childClassId: string | null,
): number {
  if (eventType === "holiday") return 0;
  if (appliesTo === "class" && childClassId && classId === childClassId) return 3;
  if (eventType === "meeting" || eventType === "deadline") return 2;
  return 1; // school_event, class_event, online_class
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchUpcomingEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  schoolName: string,
  opts?: { schoolId?: string | null; classId?: string | null },
): Promise<UpcomingItem[]> {
  const today = new Date().toISOString().split("T")[0];
  const childClassId = opts?.classId ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("events")
    .select("id, title, event_date, event_type, applies_to, class_id")
    .gte("event_date", today)
    .order("event_date")
    .limit(20); // fetch more so we can prioritise before slicing

  if (opts?.schoolId) {
    query = query.eq("school_id", opts.schoolId);
  }

  const { data } = await query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).filter((e: any) => {
    if (e.applies_to === "all") return true;
    if (e.applies_to === "class" && childClassId && e.class_id === childClassId) return true;
    return false;
  });

  // Sort: highest priority first, then soonest date first.
  rows.sort((a: any, b: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const pa = eventPriority(a.event_type ?? "school_event", a.applies_to, a.class_id, childClassId);
    const pb = eventPriority(b.event_type ?? "school_event", b.applies_to, b.class_id, childClassId);
    if (pb !== pa) return pb - pa;
    return a.event_date.localeCompare(b.event_date);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.slice(0, 3).map((e: any) => ({
    id: e.id,
    title: e.title,
    date: e.event_date,
    time: null,
    category: "school" as const,
    organizationName: schoolName,
    actionHref: "/parent/events",
    eventType: e.event_type ?? "school_event",
  }));
}

interface NeedsAttentionParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  childId: string;
}

export async function fetchNeedsAttention({ supabase, childId }: NeedsAttentionParams): Promise<NeedsAttentionCounts> {
  const [billingResult, consentResult, requestResult] = await Promise.allSettled([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("billing_records")
      .select("amount_due, status")
      .eq("student_id", childId)
      .in("status", ["unpaid", "partial", "overdue"]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("document_consents")
      .select("id")
      .eq("student_id", childId)
      .eq("status", "pending"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("document_requests")
      .select("id, status")
      .eq("student_id", childId)
      .in("status", ["requested", "submitted"]),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const billingRows: any[] = billingResult.status === "fulfilled" ? (billingResult.value.data ?? []) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consentRows: any[] = consentResult.status === "fulfilled" ? (consentResult.value.data ?? []) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestRows: any[] = requestResult.status === "fulfilled" ? (requestResult.value.data ?? []) : [];

  return {
    billingCount: billingRows.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    billingTotal: billingRows.reduce((sum: number, r: any) => sum + Number(r.amount_due), 0),
    docApprovalCount: consentRows.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    docRequestCount: requestRows.filter((r: any) => r.status === "requested").length,
  };
}

interface HighlightParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  childId: string;
  userId: string | null;
}

export async function fetchLatestHighlight({ supabase, childId, userId }: HighlightParams): Promise<LatestHighlight | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("proud_moments")
    .select("id, category, note, created_at, proud_moment_reactions(reaction_type, parent_id)")
    .eq("student_id", childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactions = (data.proud_moment_reactions ?? []) as any[];
  const myReaction = userId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? reactions.find((r: any) => r.parent_id === userId)?.reaction_type ?? null
    : null;
  return {
    id: data.id,
    category: data.category,
    note: data.note ?? null,
    createdAt: data.created_at,
    myReaction,
    isFeatured: isHighlightStillFeatured(data.created_at),
  };
}

interface FallbackHighlightParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  childId: string;
}

/**
 * Returns the most recent parent-visible positive progress observation
 * (rated consistent or advanced) as a fallback card when no featured
 * proud moment exists. Returns null if nothing suitable is found.
 */
export async function fetchFallbackHighlight({ supabase, childId }: FallbackHighlightParams): Promise<FallbackHighlight | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("progress_observations")
    .select("id, rating, notes, observed_at, progress_categories(name)")
    .eq("student_id", childId)
    .eq("visibility", "parent_visible")
    .in("rating", ["consistent", "advanced"])
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const category = (data.progress_categories?.name as string | undefined) ?? "Progress";
  const ratingLabel = (data.rating as string).charAt(0).toUpperCase() + (data.rating as string).slice(1);

  return {
    category,
    summary: (data.notes as string | null) ?? `Doing well in ${category.toLowerCase()} — rated ${ratingLabel.toLowerCase()}.`,
    occurredAt: data.observed_at as string,
  };
}

// ── Phase 10 — Continuity memory (recurring proud_moment categories) ──────────
// Returns the set of proud_moment categories that have RECURRED for this
// child within the last RECURRENCE_WINDOW_DAYS days. "Recurred" = appeared
// at least RECURRENCE_THRESHOLD times.
//
// Voice contract: this surface reflects OBSERVATIONS, not CONCLUSIONS.
// We do not return counts, ranks, percentages, deltas, or any quantification
// — only the category names themselves. Two moments of "Kindness" surface
// the same chip as eight moments of "Kindness". The label IS the message.
//
// Order: by max(created_at) per category, descending — so chips show in
// "most-recently-active first" order, which reads as memory ("what's been
// showing up lately"), not ranking ("most frequent").
//
// Cap: top CATEGORY_LIMIT categories. Single-source for v1 — we deliberately
// do NOT mix proud_moments with progress_observations or therapy_sessions
// because their category taxonomies don't align cleanly, and the evaluative
// rating dimension on observations (consistent/advanced) would leak progress
// language into a memory layer that should stay purely observational.

const RECURRENCE_WINDOW_DAYS = 14;
const RECURRENCE_THRESHOLD = 2;
const CATEGORY_LIMIT = 3;

export async function fetchRecurringMomentCategories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  childId: string,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - RECURRENCE_WINDOW_DAYS * 86_400_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("proud_moments")
    .select("category, created_at")
    .eq("student_id", childId)
    .is("deleted_at", null)
    .gte("created_at", cutoff);

  // Aggregate client-side. For each category, track count + most-recent
  // timestamp. We never return either of these — they're discarded after
  // filtering and sorting. Only the category name reaches the UI.
  type Stat = { count: number; mostRecent: string };
  const stats = new Map<string, Stat>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of ((data ?? []) as any[])) {
    const cat = (row.category as string | undefined)?.trim();
    const ts = row.created_at as string | undefined;
    if (!cat || !ts) continue;
    const existing = stats.get(cat);
    if (existing) {
      existing.count += 1;
      if (ts > existing.mostRecent) existing.mostRecent = ts;
    } else {
      stats.set(cat, { count: 1, mostRecent: ts });
    }
  }

  return Array.from(stats.entries())
    .filter(([, s]) => s.count >= RECURRENCE_THRESHOLD)
    // Sort by max(created_at) descending — recency-of-most-recent-occurrence.
    // NOT by count — that would be ranking / scoring, which the directive forbids.
    .sort((a, b) => b[1].mostRecent.localeCompare(a[1].mostRecent))
    .slice(0, CATEGORY_LIMIT)
    .map(([cat]) => cat);
}

// ── Phase 12 — Continuity context (school-side) ──────────────────────────────
// Returns the current school-set support context for this child (if any).
// Used by the parent dashboard to render a quiet ambient context line below
// the hero, framing how the parent reads the rest of the page.
//
// Schema: `student_support_context` (migration 107). One row per student,
// UNIQUE on student_id. Joined with profiles for the setter's name.
//
// Voice contract: this surface DISPLAYS the school's authored context text.
// We do not interpret, summarize, or paraphrase it. The teacher's words
// surface as written, with a small "From {firstName} · {ago}" footer.

export interface SchoolSupportContext {
  focusText: string;
  setByName: string | null;
  updatedAt: string;
}

// Phase 5B — Continuity Freshness & Decay.
// Support-context lines are Reinforcement Context (per the cadence taxonomy
// in docs/PARENT_COGNITIVE_RHYTHM.md §2) — rolling current, replaced not
// aged in principle, but in practice nothing forces a refresh. Without a
// freshness gate a teacher's "practicing transitions" line from September
// would still appear in December as the parent's framing, fossilizing the
// child in an old support narrative.
//
// The gate: after SUPPORT_CONTEXT_FRESHNESS_DAYS the fetcher returns null
// even when a row exists. The data persists in the DB; only the parent-home
// foregrounding fades. Staff admin / future detail surfaces can still query
// the row directly. No row is mutated; no warning banner is shown; the line
// simply isn't there anymore. See docs/CONTINUITY_FRESHNESS_AND_DECAY.md §8.
//
// 45 days was chosen so:
//   • Refreshed-weekly contexts never hit the gate.
//   • Quarterly-cadence contexts get one or two cycles of visible time
//     before they fade — long enough to remain useful, short enough that
//     "frozen for a season" doesn't happen.
//   • Comfortably longer than Care's signal window (14d) because parent-
//     home reinforcement is a longer-cadence surface than the Care
//     attention-strip signal.
const SUPPORT_CONTEXT_FRESHNESS_DAYS = 45;

function isWithinFreshness(updatedAtIso: string, days: number): boolean {
  return Date.now() - new Date(updatedAtIso).getTime() <= days * 86_400_000;
}

export async function fetchSupportContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  childId: string,
): Promise<SchoolSupportContext | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("student_support_context")
    .select("focus_text, updated_at, set_by:profiles!set_by_profile_id(full_name)")
    .eq("student_id", childId)
    .maybeSingle();

  if (!data) return null;

  // Phase 5B freshness gate — silent fade past the threshold.
  if (!isWithinFreshness(data.updated_at as string, SUPPORT_CONTEXT_FRESHNESS_DAYS)) {
    return null;
  }

  return {
    focusText: data.focus_text as string,
    setByName: (data.set_by?.full_name as string | undefined) ?? null,
    updatedAt: data.updated_at as string,
  };
}

// ── Phase 5A — Care reinforcement context (parent-visible carry-over) ───────
// Surfaces the therapist-set "current focus" line into the Learn parent home
// as a calm second reinforcement line alongside the existing school context.
// See docs/CROSS_DOMAIN_HANDOFF.md §8 for the full audit.
//
// Boundary safety:
//   • Selects ONLY `focus_text` and `updated_at`. No clinic name, no
//     therapist id, no `set_by_profile_id`. Therapist attribution stays
//     intentionally generic ("From your therapist") because resolving names
//     would require joining `profiles`, which is RLS-restricted for parents.
//   • RLS gate: Care's `csc_parent_select` policy (migration 094) requires
//     the caller to have a `care_family_members` row for this child. School-
//     only parents (no Care linkage) silently receive zero rows and the
//     surface degrades to null.
//   • Same RLS path the Care app already uses for the equivalent surface —
//     no new disclosure, no new RPC, no new table.
//   • Multi-clinic fallback: when a child is linked to more than one clinic,
//     the most recent `updated_at` wins. Multi-clinic UX is deferred per
//     the audit; v1 surfaces a single Care reinforcement line.

export interface CareSupportContext {
  focusText: string;
  updatedAt: string;
}

export async function fetchCareSupportContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  childProfileId: string | null,
): Promise<CareSupportContext | null> {
  // Care reinforcement is keyed on the shared child_profiles.id, NOT the
  // school's students.id. Without a profile linkage there is nothing Care
  // could have shared — degrade quietly.
  if (!childProfileId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("care_support_context")
    .select("focus_text, updated_at")
    .eq("child_profile_id", childProfileId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Phase 5B freshness gate — same threshold as the school side. See
  // docs/CONTINUITY_FRESHNESS_AND_DECAY.md §8 for the rationale. Care's own
  // detail page (different repo) still renders this row unconditionally;
  // gating it on the Learn parent home prevents emotional fossilization in
  // the unified continuity surface even when the underlying row is months
  // stale.
  if (!isWithinFreshness(data.updated_at as string, SUPPORT_CONTEXT_FRESHNESS_DAYS)) {
    return null;
  }

  const focusText = ((data.focus_text as string | null) ?? "").trim();
  if (!focusText) return null;
  return {
    focusText,
    updatedAt: data.updated_at as string,
  };
}

// ── Phase 3B — Recent therapist voice note (parent-safe signal) ──────────────
// Surfaces the most recent parent-visible voice note for this child, but ONLY
// when it falls inside the freshness window. Used by the parent dashboard's
// existing priority-card chain (see `getFeaturedParentCards`). Returns null
// when there is nothing recent worth nudging — by design, no card surfaces
// for older notes (they continue to live in the Care therapy detail page).
//
// Boundary safety:
//   • Selects ONLY id, title, created_at. Storage path / mime / duration are
//     never returned to Learn — those stay on the Care side and reach the
//     parent through Care's existing signed-URL RPC.
//   • RLS gate: Care's `cvn_parent_select` policy requires this caller to
//     have a `care_family_members` row for the (child_profile_id, clinic_org)
//     pair. School-only parents (no Care linkage) silently receive zero rows
//     and the signal degrades to null. No error path required.
//   • Cross-app coupling stays minimal: this is a single column-restricted
//     SELECT, not a new RPC or a new table. Aligns with the "prefer existing
//     data" rule from the Phase 3B directive.
//
// Freshness window: a voice note is signal-worthy for VOICE_NOTE_SIGNAL_DAYS.
// After that it stops priority-surfacing but stays viewable on the Care side.
// 7 days is intentionally longer than the journey-feed therapy window (3d on
// Care) because a missed voice note is the kind of emotionally important item
// the spec explicitly calls out — but a single calm card, never a banner.

const VOICE_NOTE_SIGNAL_DAYS = 7;

export async function fetchRecentParentVisibleVoiceNote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  childProfileId: string | null,
): Promise<RecentVoiceNoteSignal | null> {
  // Care voice notes are keyed on the shared child_profiles.id, NOT the
  // school's students.id. When the active student isn't linked to a child
  // profile yet, there is nothing Care could have shared — degrade quietly.
  if (!childProfileId) return null;

  const cutoffIso = new Date(Date.now() - VOICE_NOTE_SIGNAL_DAYS * 86_400_000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("care_voice_notes")
    .select("id, title, created_at")
    .eq("child_profile_id", childProfileId)
    .eq("parent_visible", true)
    .eq("is_deleted", false)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    title: (data.title as string | null) ?? null,
    createdAt: data.created_at as string,
  };
}

// ── Service presence ──────────────────────────────────────────────────────────

// Synchronous helper used only as an initial state seed. Real data comes
// from fetchServicePresence() which calls the parent-safe RPC (migration 091).
export function buildServicePresence(schoolName: string, className: string): ServicePresence {
  return {
    school: schoolName ? { connected: true, schoolName, className } : { connected: false },
    therapy: { connected: false },
    medical: { connected: false },
  };
}

// Async version: calls list_parent_child_connected_services (migration 091) to
// detect active therapy-center or medical-practice relationships for the child.
// Falls back gracefully when the child has no linked child_profile or when
// the RPC returns an empty result. Never surfaces an error to the caller.
export async function fetchServicePresence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  childId: string,
  schoolName: string,
  className: string
): Promise<ServicePresence> {
  const base: ServicePresence = {
    school: schoolName ? { connected: true, schoolName, className } : { connected: false },
    therapy: { connected: false },
    medical: { connected: false },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc(
    "list_parent_child_connected_services",
    { p_student_id: childId }
  );

  if (!data || (data as unknown[]).length === 0) return base;

  const services = data as { source_category: string; organization_name: string }[];
  const therapyEntry = services.find((s) => s.source_category === "therapy");
  const medicalEntry = services.find((s) => s.source_category === "medical");

  return {
    ...base,
    therapy: therapyEntry
      ? { connected: true, clinicName: therapyEntry.organization_name }
      : { connected: false },
    // Phase 6B — Med readiness. Only the boolean `connected` crosses into
    // client state. The medical practice name (diagnosis-revealing) is
    // deliberately NOT carried — see docs/MED_READINESS_AND_SENSITIVE_CONTINUITY.md §8.
    medical: medicalEntry
      ? { connected: true }
      : { connected: false },
  };
}
