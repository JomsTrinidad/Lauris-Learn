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
}

export interface ServicePresence {
  school:
    | { connected: true; schoolName: string; className: string }
    | { connected: false };
  therapy: { connected: boolean; clinicName?: string };
  medical: { connected: false };
}

export interface UpcomingItem {
  id: string;
  title: string;
  date: string;
  time: string | null;
  category: SourceCategory;
  organizationName: string;
  actionHref?: string;
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
}
