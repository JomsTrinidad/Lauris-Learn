import type { SupabaseClient } from "@supabase/supabase-js";
import { isHighlightStillFeatured } from "../parent-journey/helpers";

// ── Family continuity signals ────────────────────────────────────────────────
// Lightweight per-child compression for the family drawer. Keeps a parent
// with multiple kids from having to open each profile in turn just to learn
// "did anything happen here today?" The signals are intentionally calm —
// counts of fresh items in the last 72 hours, plus a featured-highlight
// boolean. No unread state, no inbox counters, no badge pulsing.
//
// Performance: regardless of family size, this is 2 batched queries against
// parent_updates (by class_id IN) and proud_moments (by student_id IN) with
// a `created_at >= now - 72h` window. A typical family fetch is <500 rows
// uncached.

const FRESH_WINDOW_HOURS = 72;

export interface FamilyChildInput {
  /** students.id */
  id: string;
  /** active enrollment's class_id, used for parent_updates lookup */
  classId: string | null;
  /** shared child_profiles.id, used for cross-app service presence check */
  childProfileId: string | null;
}

export interface FamilyActiveDomains {
  /** Always true when the child has an active school enrollment. */
  school: boolean;
  /** Connected via list_parent_child_connected_services RPC. */
  therapy: boolean;
  /** Connected via list_parent_child_connected_services RPC. */
  medical: boolean;
}

export interface FamilySignal {
  /** Items in the last 72 hours across school updates + proud moments. */
  freshCount: number;
  /** True when there's a proud_moment within the featured window (7d). */
  hasFeaturedHighlight: boolean;
  /** ISO timestamp of the most recent activity, or null if nothing exists. */
  lastActivityIso: string | null;
  /** Which continuity domains are connected for this child. Drives the
   *  drawer's per-child subtitle ("School · Therapy") and the dashboard's
   *  multi-domain badge visibility rule. */
  activeDomains: FamilyActiveDomains;
}

const EMPTY_SIGNAL: FamilySignal = {
  freshCount: 0,
  hasFeaturedHighlight: false,
  lastActivityIso: null,
  activeDomains: { school: false, therapy: false, medical: false },
};

export async function fetchFamilySignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  children: FamilyChildInput[],
): Promise<Map<string, FamilySignal>> {
  const result = new Map<string, FamilySignal>();
  if (children.length === 0) return result;

  const since = new Date(Date.now() - FRESH_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const childIds = children.map((c) => c.id);
  const classIds = children.map((c) => c.classId).filter((v): v is string => v !== null);

  // Run the two queries in parallel. parent_updates is class-scoped, so the
  // result needs to be re-mapped to children by matching the child's classId
  // back against each update's class_id. proud_moments is student-scoped and
  // joins directly. We also pull recent (not-just-fresh) proud_moments so the
  // featured-highlight check honours the full 7d window even when nothing has
  // happened in the last 72h.
  const sinceFeatured = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Per-child service presence RPC. Fires in parallel — small families
  // (1-4 kids) are the typical case so the parallel fan-out is cheap. The
  // RPC itself is gated to the calling parent's guardianed children, so
  // unauthorized callers naturally get an empty payload.
  const presencePromises = children.map(async (child) => {
    if (!child.id) return { childId: child.id, therapy: false, medical: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc(
      "list_parent_child_connected_services",
      { p_student_id: child.id },
    );
    const services = (data ?? []) as Array<{ source_category: string }>;
    return {
      childId: child.id,
      therapy: services.some((s) => s.source_category === "therapy"),
      medical: services.some((s) => s.source_category === "medical"),
    };
  });

  const [updatesRes, freshMomentsRes, featuredMomentsRes, presenceList] = await Promise.all([
    classIds.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("parent_updates")
          .select("class_id, created_at")
          .in("class_id", classIds)
          .eq("status", "posted")
          .gte("created_at", since)
      : Promise.resolve({ data: [], error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("proud_moments")
      .select("student_id, created_at")
      .in("student_id", childIds)
      .is("deleted_at", null)
      .gte("created_at", since),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("proud_moments")
      .select("student_id, created_at")
      .in("student_id", childIds)
      .is("deleted_at", null)
      .gte("created_at", sinceFeatured),
    Promise.all(presencePromises),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates = (updatesRes.data ?? []) as Array<{ class_id: string; created_at: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freshMoments = (freshMomentsRes.data ?? []) as Array<{ student_id: string; created_at: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const featuredMoments = (featuredMomentsRes.data ?? []) as Array<{ student_id: string; created_at: string }>;
  const presenceByChild = new Map(presenceList.map((p) => [p.childId, p]));

  for (const child of children) {
    const childUpdates = child.classId
      ? updates.filter((u) => u.class_id === child.classId)
      : [];
    const childFreshMoments = freshMoments.filter((m) => m.student_id === child.id);
    const childFeaturedMoments = featuredMoments.filter((m) => m.student_id === child.id);

    const allFresh = [
      ...childUpdates.map((u) => u.created_at),
      ...childFreshMoments.map((m) => m.created_at),
    ];
    const lastActivityIso = allFresh.length > 0
      ? allFresh.sort().reverse()[0]
      : null;

    const hasFeaturedHighlight = childFeaturedMoments.some((m) =>
      isHighlightStillFeatured(m.created_at),
    );

    const presence = presenceByChild.get(child.id);
    const activeDomains: FamilyActiveDomains = {
      // "School connected" follows the same rule as fetchServicePresence:
      // a child with an active enrollment has a school. We use classId
      // presence as the proxy — every enrolled child has one.
      school: child.classId !== null,
      therapy: presence?.therapy ?? false,
      medical: presence?.medical ?? false,
    };

    result.set(child.id, {
      freshCount: allFresh.length,
      hasFeaturedHighlight,
      lastActivityIso,
      activeDomains,
    });
  }

  // Fill in any children that didn't have rows so callers can assume the map
  // is complete.
  for (const child of children) {
    if (!result.has(child.id)) result.set(child.id, EMPTY_SIGNAL);
  }

  return result;
}

// ── Human-readable label derivation ──────────────────────────────────────────
// One short sentence per child for the drawer card. Priority order:
//   1. Featured highlight in the last 7 days → "New highlight"
//   2. Fresh items in the last 72h → "N new this week"
//   3. Has any historical activity → "Quiet · Xd ago"
//   4. Nothing ever → null (calm by absence, no label rendered)

export type FamilyPulseTone = "highlight" | "fresh" | "quiet" | "empty";

export interface FamilyPulse {
  tone: FamilyPulseTone;
  text: string | null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

// ── Active-domain label ──────────────────────────────────────────────────────
// Compresses the boolean activeDomains map into a calm semantic subtitle:
// "School", "School · Therapy", "School · Therapy · Medical", "Therapy · Medical"
// (the latter for a child with no school enrollment). Returns null when no
// domains are connected — caller renders no subtitle (calm by absence).

export function deriveActiveDomainsLabel(signal: FamilySignal | undefined): string | null {
  if (!signal) return null;
  const { school, therapy, medical } = signal.activeDomains;
  const parts: string[] = [];
  if (school) parts.push("School");
  if (therapy) parts.push("Therapy");
  if (medical) parts.push("Medical");
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ── Multi-domain count ───────────────────────────────────────────────────────
// Used by the dashboard to decide whether to show the per-card source badge.
// Single-domain children hide it (the colored avatar already encodes source);
// multi-domain children show it (the badge actually differentiates).

export function countActiveDomains(signal: FamilySignal | undefined): number {
  if (!signal) return 0;
  const { school, therapy, medical } = signal.activeDomains;
  return (school ? 1 : 0) + (therapy ? 1 : 0) + (medical ? 1 : 0);
}

export function deriveFamilyPulse(signal: FamilySignal | undefined): FamilyPulse {
  if (!signal) return { tone: "empty", text: null };
  if (signal.hasFeaturedHighlight) {
    return { tone: "highlight", text: "New highlight" };
  }
  if (signal.freshCount > 0) {
    const n = signal.freshCount;
    return { tone: "fresh", text: `${n} new this week` };
  }
  if (signal.lastActivityIso) {
    const d = daysSince(signal.lastActivityIso);
    if (d === 0) return { tone: "quiet", text: "Quiet today" };
    return { tone: "quiet", text: `Quiet · ${d}d ago` };
  }
  return { tone: "empty", text: null };
}
