import type { SupabaseClient } from "@supabase/supabase-js";
import { updateToJourney, observationToJourney } from "./adapters";
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

  // Fetch class updates + school-wide posts in parallel with progress observations
  const updatesQuery = classId
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("parent_updates")
        .select("id, content, created_at, author:profiles(full_name), class:classes(name)")
        .or(`class_id.eq.${classId},class_id.is.null`)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(10)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("parent_updates")
        .select("id, content, created_at, author:profiles(full_name), class:classes(name)")
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

  const [{ data: updatesData }, { data: obsData }] = await Promise.all([
    updatesQuery,
    obsQuery,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (updatesData ?? []) as any[]) {
    items.push(updateToJourney(u, childId, schoolName));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (obsData ?? []) as any[]) {
    items.push(observationToJourney(o, childId, schoolName));
  }

  // Sort merged feed newest first
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchUpcomingEvents(supabase: SupabaseClient<any>, schoolName: string): Promise<UpcomingItem[]> {
  const today = new Date().toISOString().split("T")[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("events")
    .select("id, title, event_date")
    .gte("event_date", today)
    .order("event_date")
    .limit(3);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((e: any) => ({
    id: e.id,
    title: e.title,
    date: e.event_date,
    time: null,
    category: "school" as const,
    organizationName: schoolName,
    actionHref: "/parent/events",
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

export function buildServicePresence(schoolName: string, className: string): ServicePresence {
  return {
    school: schoolName ? { connected: true, schoolName, className } : { connected: false },
    therapy: { connected: false },
    medical: { connected: false },
  };
}
