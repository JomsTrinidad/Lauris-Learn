export type SourceCategory = "school" | "therapy" | "medical" | "system";
export type JourneyItemType =
  | "milestone"
  | "update"
  | "progress"
  | "session_summary"
  | "document"
  | "action_required"
  | "recommendation";
export type JourneySentiment = "positive" | "neutral" | "informational" | "requires_action";
export type JourneyFilter = "all" | "school" | "therapy" | "medical";

export interface ParentJourneyItem {
  id: string;
  childId: string;
  sourceCategory: SourceCategory;
  organizationName: string;
  providerName?: string;
  itemType: JourneyItemType;
  title: string;
  summary: string;
  occurredAt: string;
  sentiment: JourneySentiment;
  actionHref?: string;
  actionLabel?: string;
  mediaCount?: number;
  mediaThumbnailUrls?: string[];
}

export interface ServicePresence {
  school:
    | { connected: true; schoolName: string; className: string }
    | { connected: false };
  therapy: { connected: boolean; clinicName?: string };
  // Phase 6B — Med readiness. A medical practice NAME is diagnosis-revealing
  // ("Pediatric Neurology Associates," "Child Psychiatry Center"). The parent
  // home only ever needs `connected` (the journey filter chip + the generic
  // "with medical care" service line both read the boolean). The name is
  // intentionally NOT carried into client state to avoid sensitive-context
  // overexposure. A future Lauris Med phase that needs the name re-introduces
  // it deliberately, behind a safety review (tap-through detail, never a
  // home-glance). See docs/MED_READINESS_AND_SENSITIVE_CONTINUITY.md §8.
  medical: { connected: boolean };
}

export interface UpcomingItem {
  id: string;
  title: string;
  date: string;
  time: string | null;
  category: SourceCategory;
  organizationName: string;
  actionHref?: string;
  eventType: string;
}

export interface AttendanceTodayResult {
  status: "present" | "late" | "absent" | "excused" | null;
  /** Localized human-readable check-in time, e.g. "8:32 AM". */
  checkedInAt: string | null;
  /** Raw ISO timestamp of the check-in row. Used by the hero priority chain
   *  to compute freshness (Phase 3 Tier C cutoff). Null when not present. */
  checkedInAtIso: string | null;
}

export interface NeedsAttentionCounts {
  billingCount: number;
  billingTotal: number;
  docRequestCount: number;
  docApprovalCount: number;
}

/**
 * Phase 3B — minimal parent-safe shape for the "Voice note from therapist"
 * priority signal. Carries only what the priority card needs to render and
 * deep-link to Care. Storage paths, mime type, and clinic-only metadata are
 * intentionally NOT surfaced to Learn. The signed URL is minted on the Care
 * side via its existing `log_care_voice_note_access` RPC; this signal only
 * tells the parent "there is one — tap to listen."
 */
export interface RecentVoiceNoteSignal {
  id: string;
  /** ISO timestamp the voice note was created in Care. Used for freshness gate + relative subtitle. */
  createdAt: string;
  /** Optional human-authored title from Care; may be null. Card never blocks on this. */
  title: string | null;
}

export interface LatestHighlight {
  id: string;
  category: string;
  note: string | null;
  createdAt: string;
  myReaction: string | null;
  /** true when the highlight is within the featured window (see HIGHLIGHT_FEATURED_WINDOW_DAYS) */
  isFeatured: boolean;
}

/** A recent positive progress observation used as fallback when no featured highlight exists. */
export interface FallbackHighlight {
  category: string;
  summary: string;
  occurredAt: string;
}

// ── Priority cards ────────────────────────────────────────────────────────────

export type PriorityCardType =
  | "urgent_action"    // parent action required (consent, doc request)
  | "todays_session"   // therapy or school session happening today (future: Care data)
  | "upcoming_meeting" // scheduled meeting
  | "balance_due"      // outstanding billing balance
  | "upcoming_event"   // class-specific or school event
  | "school_event"     // school-wide event
  | "holiday"          // no-class day
  | "all_clear";       // billing all-clear filler

export type PriorityCardAccent = "urgent" | "info" | "warning" | "purple" | "muted" | "success";

export interface PriorityCard {
  id: string;
  cardType: PriorityCardType;
  title: string;
  subtitle: string;
  detail?: string;
  actionHref: string;
  accentVariant: PriorityCardAccent;
}
