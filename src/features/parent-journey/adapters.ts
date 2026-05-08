import type { ParentJourneyItem, JourneySentiment } from "./types";

export function updateToJourney(
  u: { id: string; content: string; created_at: string; author?: { full_name?: string } | null; class?: { name?: string } | null },
  childId: string,
  schoolName: string
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
    title: "Class update",
    summary: u.content,
    occurredAt: u.created_at,
    sentiment: "informational",
    actionHref: "/parent/updates",
    actionLabel: "See all updates",
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
