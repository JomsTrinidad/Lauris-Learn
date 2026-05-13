import type { SupabaseClient } from "@supabase/supabase-js";
import { updateToJourney, observationToJourney, therapySessionToJourney } from "./adapters";
import type {
  ParentJourneyItem,
  AttendanceTodayResult,
  UpcomingItem,
  NeedsAttentionCounts,
  LatestHighlight,
  ServicePresence,
} from "./types";

interface JourneyFeedParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  childId: string;
  classId: string | null;
  schoolName: string;
}

export async function fetchJourneyFeed({
  supabase,
  childId,
  classId,
  schoolName,
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
    items.push(therapySessionToJourney(ts, childId));
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
  if (!data) return { status: null, checkedInAt: null };
  return {
    status: data.status,
    checkedInAt: new Date(data.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
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
  return { id: data.id, category: data.category, note: data.note ?? null, createdAt: data.created_at, myReaction };
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
    medical: medicalEntry
      ? { connected: true, practiceName: medicalEntry.organization_name }
      : { connected: false },
  };
}
