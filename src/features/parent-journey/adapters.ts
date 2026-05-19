import type { ParentJourneyItem, JourneySentiment } from "./types";

// ── Therapy ───────────────────────────────────────────────────────────────────

const THERAPY_TYPE_LABELS: Record<string, string> = {
  speech:       "Speech Therapy",
  occupational: "Occupational Therapy",
  behavioral:   "Behavioral Therapy",
  other:        "Therapy Session",
};

export function therapySessionToJourney(
  ts: {
    id: string;
    clinic_name: string;
    therapy_type: string;
    scheduled_at: string;
    status: string;
    parent_visible_summary: string;
    therapist_name: string | null;
  },
  childId: string,
  /**
   * Cross-app deep-link parameters. Both must be present for the row to emit
   * an `actionHref` into Care. When either is missing the row degrades
   * gracefully — no link, no broken navigation.
   *
   *   careBaseUrl    — typically `process.env.NEXT_PUBLIC_CARE_BASE_URL`
   *                    (e.g. https://care.lauris.app). Trailing slashes are
   *                    stripped.
   *   childProfileId — the shared `child_profiles.id` for this child. Care
   *                    routes by child_profile_id, not by the school's
   *                    `students.id`.
   */
  opts?: { careBaseUrl?: string | null; childProfileId?: string | null }
): ParentJourneyItem {
  const typeLabel = THERAPY_TYPE_LABELS[ts.therapy_type] ?? "Therapy Session";
  const base = opts?.careBaseUrl?.replace(/\/+$/, "") || null;
  const cpid = opts?.childProfileId || null;
  const actionHref = base && cpid ? `${base}/parent/${cpid}` : undefined;
  return {
    id: `therapy-${ts.id}`,
    childId,
    sourceCategory: "therapy",
    organizationName: ts.clinic_name,
    providerName: ts.therapist_name ?? undefined,
    itemType: "session_summary",
    title: typeLabel,
    summary: ts.parent_visible_summary,
    occurredAt: ts.scheduled_at,
    sentiment: "informational",
    actionHref,
    actionLabel: actionHref ? "Open in Lauris Care" : undefined,
  };
}

export function updateToJourney(
  u: { id: string; content: string; created_at: string; author?: { full_name?: string } | null; class?: { name?: string } | null },
  childId: string,
  schoolName: string,
  mediaCount = 0,
  mediaThumbnailUrls?: string[],
): ParentJourneyItem {
  const className = u.class?.name;
  const orgLabel = className ? `${schoolName} · ${className}` : schoolName;
  return {
    id: `update-${u.id}`,
    childId,
    sourceCategory: "school",
    organizationName: orgLabel,
    providerName: u.author?.full_name ?? "Teacher",
    itemType: "update",
    // Phase 9 — Title intentionally empty for school updates.
    //
    // Every parent_updates row used to render in the parent feed as
    // "Class update" (the hardcoded label), with the teacher's actual
    // content shrunk to the muted summary line below. Result: every
    // post a teacher wrote — "Music day", "Reminder about photos",
    // "Field trip recap" — surfaced identically to parents.
    //
    // By emitting an empty title, JourneyRow promotes the summary
    // (the teacher's actual words) to the row's prominent line —
    // calm semantic weight, not headline weight. The teacher's
    // observation becomes the semantic anchor of the row.
    //
    // Other adapters (therapy, observation) still emit meaningful
    // titles like "Speech Therapy" / "Kindness — Consistent".
    title: "",
    summary: u.content,
    occurredAt: u.created_at,
    sentiment: "informational",
    actionHref: "/parent/updates",
    mediaCount: mediaCount > 0 ? mediaCount : undefined,
    mediaThumbnailUrls: mediaThumbnailUrls && mediaThumbnailUrls.length > 0 ? mediaThumbnailUrls : undefined,
  };
}

const RATING_SENTIMENT: Record<string, JourneySentiment> = {
  advanced: "positive",
  consistent: "positive",
  developing: "neutral",
  emerging: "informational",
};

export function observationToJourney(
  o: { id: string; rating: string; notes?: string | null; observed_at: string; progress_categories?: { name?: string } | null },
  childId: string,
  schoolName: string
): ParentJourneyItem {
  const categoryName = o.progress_categories?.name ?? "Progress";
  const sentiment: JourneySentiment = RATING_SENTIMENT[o.rating] ?? "neutral";
  const ratingLabel = o.rating.charAt(0).toUpperCase() + o.rating.slice(1);
  return {
    id: `obs-${o.id}`,
    childId,
    sourceCategory: "school",
    organizationName: schoolName,
    itemType: "progress",
    title: `${categoryName} — ${ratingLabel}`,
    summary: o.notes ?? `Rated ${ratingLabel.toLowerCase()} in ${categoryName.toLowerCase()}.`,
    occurredAt: o.observed_at,
    sentiment,
    actionHref: "/parent/progress",
    actionLabel: "View progress",
  };
}
