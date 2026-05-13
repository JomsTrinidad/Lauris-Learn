/**
 * Pure synchronous helpers for the parent dashboard.
 * No Supabase or async code — safe for unit tests.
 */

import type {
  UpcomingItem,
  AttendanceTodayResult,
  NeedsAttentionCounts,
  PriorityCard,
  PriorityCardType,
  PriorityCardAccent,
} from "./types";

// ── Highlight recency ─────────────────────────────────────────────────────────

/** Days a positive highlight (proud moment) stays featured on the home dashboard. */
export const HIGHLIGHT_FEATURED_WINDOW_DAYS = 7;

/**
 * Returns true if a highlight created at `createdAt` is still within the
 * featured window and should appear on the home card.
 * After this window the highlight stays in the Journey feed (history) but
 * is not pinned as the featured card.
 */
export function isHighlightStillFeatured(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= HIGHLIGHT_FEATURED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// ── Child status headline ─────────────────────────────────────────────────────

export type StatusIconKind = "check" | "clock" | "x" | "calendar";

export interface StatusHeadline {
  heading: string;
  detail: string;
  detailColor: string;
  iconKind: StatusIconKind;
}

/**
 * Returns the child status headline shown below the parent greeting.
 *
 * Priority:
 *  1. Known school attendance (present / late / absent / excused)
 *  2. Scheduled meeting or online class today (from events)
 *  3. Pending fallback
 *
 * The `todayEvents` param is intentionally generic — therapy/medical sessions
 * can be passed here in future without changing the signature.
 */
export function getChildStatusHeadline(
  firstName: string,
  attendance: AttendanceTodayResult,
  todayEvents: UpcomingItem[] = [],
): StatusHeadline {
  if (attendance.status === "present") return {
    heading: `${firstName} is in school.`,
    detail: attendance.checkedInAt ? `Checked in at ${attendance.checkedInAt}` : "Marked present",
    detailColor: "text-green-600",
    iconKind: "check",
  };
  if (attendance.status === "late") return {
    heading: `${firstName} arrived late today.`,
    detail: attendance.checkedInAt ? `Arrived at ${attendance.checkedInAt}` : "Marked late",
    detailColor: "text-amber-600",
    iconKind: "clock",
  };
  if (attendance.status === "absent") return {
    heading: `${firstName} is absent today.`,
    detail: "Not in school today",
    detailColor: "text-red-600",
    iconKind: "x",
  };
  if (attendance.status === "excused") return {
    heading: `${firstName} has an excused absence today.`,
    detail: "Excused from school",
    detailColor: "text-muted-foreground",
    iconKind: "x",
  };

  // Attendance not yet marked — surface any scheduled event for today as context.
  const todayMeeting = todayEvents.find(e => e.eventType === "meeting");
  if (todayMeeting) {
    return {
      heading: `${firstName} has a meeting today.`,
      detail: todayMeeting.title,
      detailColor: "text-purple-600",
      iconKind: "calendar",
    };
  }
  const todayOnline = todayEvents.find(e => e.eventType === "online_class");
  if (todayOnline) {
    return {
      heading: `${firstName} has an online class today.`,
      detail: todayOnline.title,
      detailColor: "text-blue-600",
      iconKind: "calendar",
    };
  }

  return {
    heading: `${firstName}'s attendance is pending.`,
    detail: "Will update once the school marks it",
    detailColor: "text-muted-foreground",
    iconKind: "clock",
  };
}

// ── Priority cards ────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 0,
  }).format(n);
}

function fmtDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric",
  });
}

const EVENT_CARD_LABELS: Partial<Record<string, string>> = {
  school_event: "School Event",
  class_event:  "Class Event",
  holiday:      "No Classes",
  deadline:     "Action Needed",
  meeting:      "Meeting",
  online_class: "Online Class",
};

interface PriorityCardsInput {
  events: UpcomingItem[];
  needs: NeedsAttentionCounts;
}

type Candidate = {
  id: string;
  cardType: PriorityCardType;
  title: string;
  subtitle: string;
  detail?: string;
  actionHref: string;
  accentVariant: PriorityCardAccent;
  _p: number; // internal priority score — lower = more important
};

/**
 * Builds an ordered list of up to 2 priority cards from available data.
 * Returns an empty array when there is nothing meaningful to surface —
 * the caller should render a calm "all caught up" state in that case.
 *
 * Priority order (lowest _p wins):
 *  P10  — consent awaiting parent approval    (urgent_action)
 *  P20  — document requested from parent      (urgent_action)
 *  P30  — meeting happening today             (upcoming_meeting)
 *  P31  — online class happening today        (upcoming_event)
 *  P40  — top upcoming event (class-first, fetchUpcomingEvents pre-sorts)
 *  P50  — outstanding billing balance         (balance_due) — only when >0
 *  P60  — second upcoming event               (upcoming_event)
 *  P70  — holiday / no-classes notice         (holiday)
 *
 * Billing is NOT shown when the balance is zero — no "all-clear" filler card.
 * Holidays never outrank child-specific or actionable items.
 */
export function getFeaturedParentCards({ events, needs }: PriorityCardsInput): PriorityCard[] {
  const today = new Date().toISOString().split("T")[0];
  const candidates: Candidate[] = [];

  // P10 — consent awaiting parent approval (most urgent action)
  if (needs.docApprovalCount > 0) {
    candidates.push({
      id: "consent-pending",
      cardType: "urgent_action",
      title: "Consent Needed",
      subtitle: `${needs.docApprovalCount} consent${needs.docApprovalCount > 1 ? "s" : ""} awaiting your approval`,
      detail: "Tap to review",
      actionHref: "/parent/documents",
      accentVariant: "warning",
      _p: 10,
    });
  }

  // P20 — document requested from parent
  if (needs.docRequestCount > 0) {
    candidates.push({
      id: "doc-requested",
      cardType: "urgent_action",
      title: "Document Requested",
      subtitle: `${needs.docRequestCount} file${needs.docRequestCount > 1 ? "s" : ""} from school`,
      detail: "Tap to view",
      actionHref: "/parent/documents",
      accentVariant: "info",
      _p: 20,
    });
  }

  // P30 — meeting scheduled for today
  const todayMeeting = events.find(e => e.date === today && e.eventType === "meeting");
  if (todayMeeting) {
    candidates.push({
      id: `meeting-${todayMeeting.id}`,
      cardType: "upcoming_meeting",
      title: todayMeeting.title,
      subtitle: "Today",
      detail: "Meeting",
      actionHref: "/parent/events",
      accentVariant: "purple",
      _p: 30,
    });
  }

  // P31 — online class scheduled for today
  const todayOnline = events.find(e => e.date === today && e.eventType === "online_class");
  if (todayOnline) {
    candidates.push({
      id: `online-${todayOnline.id}`,
      cardType: "upcoming_event",
      title: todayOnline.title,
      subtitle: "Today",
      detail: "Online Class",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 31,
    });
  }

  // Filler events: exclude holidays and any today-schedule items already captured above
  const todayScheduledIds = new Set<string>([
    ...(todayMeeting ? [todayMeeting.id] : []),
    ...(todayOnline  ? [todayOnline.id]  : []),
  ]);
  const fillerEvents = events.filter(
    e => e.eventType !== "holiday" && !todayScheduledIds.has(e.id)
  );

  // P40 — top upcoming event (fetchUpcomingEvents already sorts class-specific first)
  if (fillerEvents[0]) {
    const ev = fillerEvents[0];
    candidates.push({
      id: `event-${ev.id}`,
      cardType: "upcoming_event",
      title: ev.title,
      subtitle: fmtDateShort(ev.date),
      detail: EVENT_CARD_LABELS[ev.eventType] ?? "Event",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 40,
    });
  }

  // P50 — outstanding billing balance (only when there is something actually due)
  if (needs.billingCount > 0) {
    candidates.push({
      id: "billing-due",
      cardType: "balance_due",
      title: `${fmtCurrency(needs.billingTotal)} due`,
      subtitle: `${needs.billingCount} outstanding bill${needs.billingCount > 1 ? "s" : ""}`,
      actionHref: "/parent/billing",
      accentVariant: "warning",
      _p: 50,
    });
  }

  // P60 — second upcoming event
  if (fillerEvents[1]) {
    const ev = fillerEvents[1];
    candidates.push({
      id: `event2-${ev.id}`,
      cardType: "upcoming_event",
      title: ev.title,
      subtitle: fmtDateShort(ev.date),
      detail: EVENT_CARD_LABELS[ev.eventType] ?? "Event",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 60,
    });
  }

  // P70 — holiday (lowest priority — never outranks actionable or child-specific items)
  const holiday = events.find(e => e.eventType === "holiday");
  if (holiday) {
    candidates.push({
      id: `holiday-${holiday.id}`,
      cardType: "holiday",
      title: holiday.title,
      subtitle: fmtDateShort(holiday.date),
      detail: "No Classes",
      actionHref: "/parent/events",
      accentVariant: "muted",
      _p: 70,
    });
  }

  candidates.sort((a, b) => a._p - b._p);

  return candidates.slice(0, 2).map((c): PriorityCard => ({
    id: c.id,
    cardType: c.cardType,
    title: c.title,
    subtitle: c.subtitle,
    detail: c.detail,
    actionHref: c.actionHref,
    accentVariant: c.accentVariant,
  }));
}
