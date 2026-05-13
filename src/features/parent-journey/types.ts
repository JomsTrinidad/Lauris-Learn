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
  medical: { connected: boolean; practiceName?: string };
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
  checkedInAt: string | null;
}

export interface NeedsAttentionCounts {
  billingCount: number;
  billingTotal: number;
  docRequestCount: number;
  docApprovalCount: number;
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
