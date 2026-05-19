"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  CheckCircle, XCircle, Clock, CalendarDays,
  Bell, CreditCard, ChevronRight, AlertTriangle,
  Star, BookOpen, TrendingUp, ShieldCheck, Inbox, Camera, Sparkles,
  StickyNote, X as XIcon,
} from "lucide-react";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";
import { useResonance, buildResonancePhrases } from "@/features/proud-moments/resonance";
import {
  fetchJourneyFeed,
  fetchAttendanceToday,
  fetchUpcomingEvents,
  fetchNeedsAttention,
  fetchLatestHighlight,
  fetchFallbackHighlight,
  fetchServicePresence,
  fetchRecurringMomentCategories,
} from "@/features/parent-journey/queries";
import {
  getChildStatusHeadline,
  getFeaturedParentCards,
  getServiceContextLine,
} from "@/features/parent-journey/helpers";
import type {
  ParentJourneyItem,
  AttendanceTodayResult,
  UpcomingItem,
  NeedsAttentionCounts,
  LatestHighlight,
  FallbackHighlight,
  JourneyFilter,
  ServicePresence,
  PriorityCard,
  PriorityCardType,
} from "@/features/parent-journey/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── source category styles ────────────────────────────────────────────────────

const CAT_STYLES: Record<string, {
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  labelColor: string;
}> = {
  school:  { Icon: BookOpen,    iconBg: "bg-primary/10",  iconColor: "text-primary",          labelColor: "text-primary/80" },
  therapy: { Icon: TrendingUp,  iconBg: "bg-purple-100",  iconColor: "text-purple-600",       labelColor: "text-purple-600" },
  medical: { Icon: ShieldCheck, iconBg: "bg-emerald-100", iconColor: "text-emerald-600",      labelColor: "text-emerald-600" },
  system:  { Icon: Bell,        iconBg: "bg-muted",        iconColor: "text-muted-foreground", labelColor: "text-muted-foreground" },
};

const SENTIMENT_DOT: Record<string, string> = {
  positive:        "bg-green-500",
  neutral:         "bg-blue-400",
  informational:   "bg-gray-400",
  requires_action: "bg-orange-500",
};

// ── journey row ───────────────────────────────────────────────────────────────

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function JourneyRow({
  item,
  isFresh = false,
  isContinuation = false,
}: {
  item: ParentJourneyItem;
  isFresh?: boolean;
  /** Phase 8 — true when the previous visible row shares the same
   *  organizationName, marking this row as part of the same passive
   *  cluster. Triggers chrome softening (hide repeated source label,
   *  dim icon, tighter top padding) without any explicit grouping
   *  header, count, or accordion. */
  isContinuation?: boolean;
}) {
  const cat = CAT_STYLES[item.sourceCategory] ?? CAT_STYLES.system;
  const dot = SENTIMENT_DOT[item.sentiment] ?? "bg-gray-400";
  const { Icon } = cat;
  const hasMedia = (item.mediaCount ?? 0) > 0;
  const thumbUrls = item.mediaThumbnailUrls ?? [];
  const extra = Math.max(0, (item.mediaCount ?? 0) - 3);
  // Therapy items get an external URL to Care (Phase 2 deep-link). Internal
  // routes (e.g. /parent/updates) stay on Next Link. External must open in a
  // new tab with noopener so the Lauris Parent context is preserved.
  const ahref = item.actionHref;
  const ahrefIsExternal = ahref ? isExternalHref(ahref) : false;
  // Phase 7 — Ambient freshness tint. Intentionally very light (`bg-accent/20`)
  // so multiple adjacent fresh rows don't visually merge into a band. No
  // border modification — the existing `border-b border-border/40` between
  // rows preserves scan rhythm regardless of fresh state.
  const freshCls = isFresh ? "bg-accent/20" : "";
  // Phase 8 — Continuation rows tighten their top padding so the visual gap
  // between cluster members is smaller than the gap between clusters. The
  // bottom stays full so each row keeps internal breathing room — clusters
  // don't collapse into flat blobs.
  const topPad = isContinuation ? "pt-2" : "pt-3.5";
  // Phase 8 — Icon stays visible at reduced opacity. The colored column of
  // icons reads as a "cluster spine" while signalling that this row is a
  // continuation rather than a fresh source claim.
  const iconOpacity = isContinuation ? "opacity-60" : "";
  return (
    <div className={`flex gap-3 ${topPad} pb-3.5 border-b border-border/40 last:border-0 ${freshCls}`}>
      {/* Phase 7 — Neutral, factual screen-reader label. Deliberately avoids
          "New" / "unread" / "alert" inbox vocabulary. Pure accessibility
          parity with the visual tint. */}
      {isFresh && (
        <span className="sr-only">Posted since your last visit.</span>
      )}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.iconBg} ${iconOpacity}`}>
        <Icon className={`w-4 h-4 ${cat.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          {/* Phase 8 — Source label hidden on continuation rows. The first
              row in a cluster carries the source identity; subsequent rows
              would just be repeating "BRIGHT KIDS · BRIGHT KIDS · BRIGHT
              KIDS" — cognitive tax with no information gain. timeAgo on the
              right still varies per row and stays visible. */}
          {!isContinuation && (
            <span className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${cat.labelColor}`}>
              {item.organizationName}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground flex-shrink-0 leading-tight ml-auto">
            {timeAgo(item.occurredAt)}
          </span>
        </div>
        {/* Phase 9 — Title is rendered only when meaningful. When `item.title`
            is empty (e.g. school updates — see `updateToJourney` adapter),
            the summary itself is promoted to the row's semantic anchor at a
            calm semibold/foreground weight. NOT headline-weight — same
            text-sm size, font-medium not font-bold, foreground color. The
            row still feels conversational and observational, not like a
            content-publishing card. line-clamp stays at 2 so row density
            doesn't grow.

            Sources that still emit titles (therapy: "Speech Therapy",
            observation: "Kindness — Consistent") render exactly as before. */}
        {item.title && item.title.trim() !== "" ? (
          <>
            <p className="text-sm font-semibold leading-snug mt-0.5">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {item.summary}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-foreground leading-snug mt-0.5 line-clamp-2">
            {item.summary}
          </p>
        )}

        {hasMedia && (
          <Link href={item.actionHref ?? "/parent/updates"} className="mt-2 flex items-center gap-1.5 group">
            {thumbUrls.slice(0, 3).map((url, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img
                  src={url}
                  alt=""
                  className="w-14 h-14 rounded-lg object-cover ring-1 ring-border"
                />
                {i === 2 && extra > 0 && (
                  <div className="absolute inset-0 bg-black/55 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-semibold">+{extra}</span>
                  </div>
                )}
              </div>
            ))}
            {thumbUrls.length === 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                <Camera className="w-3 h-3 flex-shrink-0" />
                {item.mediaCount} photo{item.mediaCount !== 1 ? "s" : ""}
              </span>
            )}
            {thumbUrls.length > 0 && (
              <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                {item.mediaCount} photo{item.mediaCount !== 1 ? "s" : ""}
              </span>
            )}
          </Link>
        )}

        {ahref && item.itemType !== "update" && (
          ahrefIsExternal ? (
            <a
              href={ahref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
            </a>
          ) : (
            <Link
              href={ahref}
              className="mt-1 text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
            </Link>
          )
        )}
      </div>
      <div className="flex-shrink-0 pt-2">
        <span className={`w-2 h-2 rounded-full block ${dot}`} />
      </div>
    </div>
  );
}

// ── operational row rendering ─────────────────────────────────────────────────
// Phase 4 — Continuity Surfaces.
// Operational triage no longer uses bordered Card components. Each item
// becomes a compressed row so the page's emotional center of gravity sits
// on continuity surfaces (hero + spotlight + journey feed) rather than on
// dashboard cards. Urgent items still pop visually (left accent + subtle
// amber tint), but at roughly one-third the visual mass of the old
// `UrgentBanner` + `CompactCard` pair. Non-urgent items are plain rows.

const OPERATIONAL_ICON: Partial<Record<PriorityCardType, React.ElementType>> = {
  upcoming_meeting: CalendarDays,
  balance_due:      CreditCard,
  upcoming_event:   CalendarDays,
  school_event:     CalendarDays,
  holiday:          CalendarDays,
  all_clear:        CheckCircle,
  todays_session:   CalendarDays,
};

function OperationalRow({ card, isLast }: { card: PriorityCard; isLast: boolean }) {
  const isUrgent  = card.cardType === "urgent_action";
  const isWarning = card.accentVariant === "warning";
  const isPurple  = card.accentVariant === "purple";

  // Urgent rows: subtle amber tint + left accent so they still interrupt
  // visually, but compressed (py-2, not card padding) so they no longer
  // dominate the page.
  // Non-urgent rows: plain row, faint border-b between siblings.
  const containerCls = isUrgent
    ? "flex items-start gap-2.5 pl-3 pr-2 py-2 rounded-r-md border-l-2 border-amber-400 bg-amber-50/40 hover:bg-amber-50/70 transition-colors"
    : `flex items-start gap-2.5 pl-1 pr-2 py-2 hover:bg-accent/10 transition-colors ${isLast ? "" : "border-b border-border/40"}`;

  const titleCls = isUrgent
    ? "text-sm font-semibold text-amber-900 leading-snug"
    : isWarning
      ? "text-sm font-medium text-amber-800 leading-snug"
      : "text-sm font-medium leading-snug";

  const iconCls = isUrgent
    ? "text-amber-600"
    : isWarning
      ? "text-amber-500"
      : isPurple
        ? "text-purple-500"
        : "text-muted-foreground";

  const chevCls = isUrgent ? "text-amber-500" : "text-muted-foreground/60";

  const Icon = isUrgent
    ? (card.id === "consent-pending" ? ShieldCheck : Inbox)
    : (OPERATIONAL_ICON[card.cardType] ?? CalendarDays);

  // Subtitle + optional detail merged inline so non-urgent rows stay 2-line max.
  const subtitle = card.detail && card.detail.trim()
    ? `${card.subtitle} · ${card.detail}`
    : card.subtitle;

  return (
    <Link href={card.actionHref} className={containerCls}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className={titleCls}>{card.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>
      </div>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${chevCls}`} />
    </Link>
  );
}

function OperationalSection({ cards }: { cards: PriorityCard[] }) {
  if (cards.length === 0) {
    // Calm "all caught up" — quiet text line, no pill, no card.
    return (
      <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-muted-foreground">
        <CheckCircle className="w-3.5 h-3.5 text-green-500/80 flex-shrink-0" />
        <span>You&apos;re all caught up — no urgent items today.</span>
      </div>
    );
  }
  const urgent = cards.filter(c => c.cardType === "urgent_action");
  const others = cards.filter(c => c.cardType !== "urgent_action");
  return (
    <div className="space-y-2">
      {urgent.map((c) => <OperationalRow key={c.id} card={c} isLast={true} />)}
      {others.length > 0 && (
        <div>
          {others.map((c, i) => (
            <OperationalRow key={c.id} card={c} isLast={i === others.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── positive highlight ────────────────────────────────────────────────────────

const REACTIONS = [
  { type: "proud",      emoji: "❤️", label: "Proud" },
  { type: "great_job",  emoji: "👏", label: "Great Job" },
  { type: "keep_going", emoji: "🌟", label: "Keep Going" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Effort":         "bg-blue-100 text-blue-700",
  "Kindness":       "bg-pink-100 text-pink-700",
  "Focus":          "bg-purple-100 text-purple-700",
  "Participation":  "bg-amber-100 text-amber-700",
  "Independence":   "bg-green-100 text-green-700",
  "Creativity":     "bg-orange-100 text-orange-700",
  "Improvement":    "bg-teal-100 text-teal-700",
  "Helping Others": "bg-rose-100 text-rose-700",
};

// Phase 10 — De-saturated palette for the continuity-memory "Lately" strip.
// Pairs the same hue families as CATEGORY_COLORS but at /50 background + /600
// text, so chips read as softened / weathered / atmospheric — visually
// subordinate to active surfaces (hero, spotlight, feed rows). The memory
// strip should never look like an analytics panel or "important signals."
const CATEGORY_COLORS_MEMORY: Record<string, string> = {
  "Effort":         "bg-blue-50 text-blue-600",
  "Kindness":       "bg-pink-50 text-pink-600",
  "Focus":          "bg-purple-50 text-purple-600",
  "Participation":  "bg-amber-50 text-amber-600",
  "Independence":   "bg-green-50 text-green-600",
  "Creativity":     "bg-orange-50 text-orange-600",
  "Improvement":    "bg-teal-50 text-teal-600",
  "Helping Others": "bg-rose-50 text-rose-600",
};

// Phase 5 — "today" dropped from the standalone Positive Highlight card so
// the heading reads correctly when the cooldown has pushed the moment past
// hero-eligibility but the card is still showing a 3–6 day old moment. The
// card already renders `timeAgo(highlight.createdAt)` in its top-right
// corner ("3d") — that's where freshness lives now. Voice aligned with the
// hero-side `getProudMomentHeroHeading` map in helpers.ts.
const MOMENT_HEADINGS: Partial<Record<string, (n: string) => string>> = {
  "Kindness":       (n) => `${n} showed kindness.`,
  "Effort":         (n) => `${n} gave it their all.`,
  "Focus":          (n) => `${n} stayed focused during class.`,
  "Participation":  (n) => `${n} was active and engaged.`,
  "Independence":   (n) => `${n} worked independently.`,
  "Creativity":     (n) => `${n} showed wonderful creativity.`,
  "Improvement":    (n) => `${n} made great progress.`,
  "Helping Others": (n) => `${n} helped a classmate.`,
};

function getMomentHeading(firstName: string, category: string): string {
  const fn = MOMENT_HEADINGS[category];
  return fn ? fn(firstName) : `${firstName} earned a positive highlight.`;
}

// ── Phase 11 — Quiet parent resonance picker ──────────────────────────────────
// Rendered inside the Positive Highlight card (both attached spotlight and
// standalone block). Three states: collapsed (small link), open (5 phrase
// chips), saved (small chip with × to clear). localStorage-only persistence
// via `useResonance` — no backend, no teacher visibility, no notifications.
//
// Voice: reflective, not reactive. "This stayed with us." energy.
// The StickyNote icon is inward-facing (personal note-to-self metaphor),
// deliberately not a heart, paper plane, or chat bubble.

function ResonancePicker({
  childId, momentId, firstName,
}: {
  childId: string | null;
  momentId: string;
  firstName: string;
}) {
  const { phrase, setPhrase, hydrated } = useResonance(childId, momentId);
  const [isOpen, setIsOpen] = useState(false);

  // Don't render anything until localStorage has been read — avoids the
  // saved chip flickering away on first paint then back on the second.
  if (!hydrated) return null;

  const phrases = buildResonancePhrases(firstName);

  // Saved state — single small chip with × to clear. No "shared" label,
  // no celebration, no animation.
  if (phrase) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-50/70 text-amber-900 border border-amber-100">
          <StickyNote className="w-3 h-3 flex-shrink-0 opacity-70" />
          {phrase}
        </span>
        <button
          type="button"
          onClick={() => setPhrase(null)}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="Remove note"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Open state — 5 preset phrase chips. Tap one to save and collapse.
  if (isOpen) {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {phrases.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPhrase(p); setIsOpen(false); }}
              className="px-2.5 py-1 rounded-full text-xs border border-amber-200/60 text-amber-800/90 hover:bg-amber-50 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Never mind
        </button>
      </div>
    );
  }

  // Collapsed state — small inviting link, no button styling. Reads as
  // optional reflection, not action item. Empty by default to avoid
  // creating engagement pressure.
  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="mt-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
    >
      + Add a note from home
    </button>
  );
}

// ── filter config ─────────────────────────────────────────────────────────────

const JOURNEY_FILTERS: JourneyFilter[] = ["all", "school", "therapy", "medical"];

const FILTER_LABELS: Record<JourneyFilter, string> = {
  all:     "All",
  school:  "School",
  therapy: "Therapy",
  medical: "Medical",
};

// Empty-state copy — calm, source-aware, never implies failure. The "all"
// state lands on parents who haven't built up activity in any source yet;
// the three source filters describe what arrives when that source contributes.
const FILTER_EMPTY: Record<JourneyFilter, string> = {
  all:     "No updates yet. New posts from school and therapy will appear here as they come in.",
  school:  "No school updates yet.",
  therapy: "No therapy updates yet.",
  medical: "Medical updates are not connected yet.",
};

// ── icon map for status headline ──────────────────────────────────────────────

const STATUS_ICON_MAP = {
  check:    CheckCircle,
  clock:    Clock,
  x:        XCircle,
  calendar: CalendarDays,
  sparkle:  Sparkles,
} as const;

// ── Phase 7 — Gentle freshness cues ──────────────────────────────────────────
// localStorage-only "last seen" model. Each visit reads the previous
// lastSeen, computes which feed items have arrived since then, then
// immediately writes Date.now() back so the NEXT visit naturally consumes
// today's freshness. No backend, no read-state table, no inbox semantics.
//
// Cap: a feed item older than FRESH_WINDOW_HOURS never gets the tint, even
// if the parent has been away for weeks — old continuity remains calm
// background context.
//
// First-visit fallback: when no lastSeen exists in localStorage, behave as
// though the parent visited FIRST_VISIT_LOOKBACK_HOURS ago — surfaces only
// today's items, not the whole feed history.

const FRESH_WINDOW_HOURS = 72;
const FIRST_VISIT_LOOKBACK_HOURS = 24;

function lastSeenKey(childId: string): string {
  return `parent-journey-last-seen:${childId}`;
}

// ── main component ────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const { child, childId, classId, schoolId, schoolName, childProfileId } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [parentName, setParentName] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTodayResult>({ status: null, checkedInAt: null, checkedInAtIso: null });
  const [events, setEvents] = useState<UpcomingItem[]>([]);
  const [needs, setNeeds] = useState<NeedsAttentionCounts>({ billingCount: 0, billingTotal: 0, docRequestCount: 0, docApprovalCount: 0 });
  const [highlight, setHighlight] = useState<LatestHighlight | null>(null);
  const [fallbackHighlight, setFallbackHighlight] = useState<FallbackHighlight | null>(null);
  const [feed, setFeed] = useState<ParentJourneyItem[]>([]);
  const [servicePresence, setServicePresence] = useState<ServicePresence>({
    school: { connected: false }, therapy: { connected: false }, medical: { connected: false },
  });
  // Phase 10 — Continuity memory. Names of proud_moment categories that
  // have recurred (≥2 times) in the last 14 days, sorted by most recent.
  // Cap of 3. Renders as a quiet "Lately" strip at the top of the journey
  // section. Empty array hides the strip entirely.
  const [recurringCategories, setRecurringCategories] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<JourneyFilter>("all");
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [reactSaving, setReactSaving] = useState(false);

  // Absence reporting
  const [absenceReported, setAbsenceReported] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [absenceError, setAbsenceError] = useState<string | null>(null);

  // Phase 7 — Gentle freshness cues. `freshItemIds` is the snapshot of
  // journey items that have arrived since the parent's previous visit
  // (per-child, localStorage-only). Computed ONCE per mount via the ref
  // lock below so filter changes / refetches within a single visit don't
  // re-flicker the tint.
  const [freshItemIds, setFreshItemIds] = useState<Set<string>>(new Set());
  const freshComputedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (!childId) { setLoading(false); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    setParentUserId(userId);

    const rawName = ((user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "") as string).trim();
    setParentName(rawName ? rawName.split(" ")[0] : null);

    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: absRow } = await (supabase as any)
      .from("absence_notifications")
      .select("id")
      .eq("student_id", childId)
      .eq("date", today)
      .maybeSingle();
    setAbsenceReported(!!absRow);

    const resolvedSchool = schoolName || "School";
    const resolvedClass = child?.className ?? "";

    const [att, evts, needsData, hlData, fbData, feedData, spData, recurringCats] = await Promise.all([
      fetchAttendanceToday(supabase, childId),
      fetchUpcomingEvents(supabase, resolvedSchool, { schoolId, classId }),
      fetchNeedsAttention({ supabase, childId }),
      fetchLatestHighlight({ supabase, childId, userId }),
      fetchFallbackHighlight({ supabase, childId }),
      fetchJourneyFeed({ supabase, childId, classId, schoolName: resolvedSchool, childProfileId }),
      fetchServicePresence(supabase, childId, resolvedSchool, resolvedClass),
      // Phase 10 — continuity memory (recurring proud-moment categories ≥2 in 14d).
      fetchRecurringMomentCategories(supabase, childId),
    ]);

    setAttendance(att);
    setEvents(evts);
    setNeeds(needsData);
    setHighlight(hlData);
    setFallbackHighlight(fbData);
    setFeed(feedData);
    setServicePresence(spData);
    setRecurringCategories(recurringCats);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId, childProfileId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Phase 7 — Compute the freshness snapshot ONCE per mount, after `feed` is
  // populated. Subsequent re-renders (filter changes, reload button) keep the
  // same snapshot so the tint doesn't flicker mid-visit. lastSeen is written
  // back immediately so the NEXT visit naturally consumes today's freshness.
  useEffect(() => {
    if (!childId) return;
    if (feed.length === 0) return;
    if (freshComputedRef.current) return;
    if (typeof window === "undefined") return;

    let prevLastSeenMs: number;
    try {
      const stored = window.localStorage.getItem(lastSeenKey(childId));
      prevLastSeenMs = stored
        ? new Date(stored).getTime()
        : Date.now() - FIRST_VISIT_LOOKBACK_HOURS * 60 * 60 * 1000;
    } catch {
      // localStorage unavailable (private browsing edge case) — fall back to
      // first-visit lookback so the experience stays calm.
      prevLastSeenMs = Date.now() - FIRST_VISIT_LOOKBACK_HOURS * 60 * 60 * 1000;
    }

    // Cap: freshness can never exceed FRESH_WINDOW_HOURS regardless of how
    // long the parent has been away — old continuity stays calm.
    const freshCutoffMs = Math.max(
      prevLastSeenMs,
      Date.now() - FRESH_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const fresh = new Set<string>();
    for (const item of feed) {
      if (new Date(item.occurredAt).getTime() > freshCutoffMs) {
        fresh.add(item.id);
      }
    }
    setFreshItemIds(fresh);
    freshComputedRef.current = true;

    // Consume on visit: write current timestamp back so the NEXT visit
    // treats today's items as already seen. No N-second dwell timer — the
    // simpler "consumed on mount" model is cleaner.
    try {
      window.localStorage.setItem(lastSeenKey(childId), new Date().toISOString());
    } catch {
      // Silent — write failure just means freshness won't persist; UX still works.
    }
  }, [childId, feed]);

  // Reset the freshness lock when the parent switches to a different child,
  // so the new child's first feed-render computes its own snapshot.
  useEffect(() => {
    freshComputedRef.current = false;
    setFreshItemIds(new Set());
  }, [childId]);

  async function handleMomentReaction(momentId: string, reactionType: string) {
    if (!parentUserId) return;
    setReactSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("proud_moment_reactions")
      .upsert(
        { proud_moment_id: momentId, parent_id: parentUserId, reaction_type: reactionType },
        { onConflict: "proud_moment_id,parent_id" }
      );
    setHighlight((prev) => prev ? { ...prev, myReaction: reactionType } : null);
    setReactSaving(false);
  }

  async function submitAbsence() {
    if (!childId || !schoolId) return;
    setSubmittingAbsence(true);
    setAbsenceError(null);
    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("absence_notifications")
      .insert({
        school_id: schoolId,
        student_id: childId,
        class_id: classId,
        date: today,
        reason: absenceReason.trim() || null,
      });
    setSubmittingAbsence(false);
    if (error) {
      if (error.code === "23505") {
        setAbsenceReported(true);
        setShowAbsenceForm(false);
      } else {
        setAbsenceError("Could not send notification. Please try again.");
      }
    } else {
      setAbsenceReported(true);
      setShowAbsenceForm(false);
      setAbsenceReason("");
    }
  }

  if (loading) return <PageSpinner />;

  const firstName = child?.firstName ?? "Your child";

  // ── Derived: status headline (cross-domain + continuity-weighted, Phase 3) ──
  // The hero is built by a tier-based priority chain in helpers.ts:
  //   Tier A acute operational  → Tier B today scheduled  → Tier C fresh present
  //   → Tier D continuity (proud moment / therapy / positive observation)
  //   → Tier E background continuity → Tier F calm default.
  //
  // We pass highlight + fallbackHighlight so the helper can promote a Tier-D
  // continuity signal *over* a stale "present" check-in. When it does, it
  // returns `consumedHighlightId` / `consumedFallback` so we can suppress
  // the duplicated content below (heading line on Positive Highlight card;
  // entire Recent Growth card).
  const today = new Date().toISOString().split("T")[0];
  const todayEvents = events.filter(e => e.date === today);
  const recentFeedItem = feed[0] ?? null;
  const statusHeadline = getChildStatusHeadline(
    firstName, attendance, todayEvents, recentFeedItem, highlight, fallbackHighlight,
  );
  const StatusIcon = STATUS_ICON_MAP[statusHeadline.iconKind];

  // Cross-domain context line — single, subtle, only when ≥2 services connected.
  const serviceContextLine = getServiceContextLine(servicePresence);

  // Phase 3 — operational details moved into a secondary line.
  // When the hero is not attendance-driven AND the child IS marked present
  // today, surface a small grounding line so parents quietly know the
  // operational fact without it dominating. Renders only in this one case;
  // absent / late / excused are already in Tier A and own the hero.
  const heroOwnsAttendance =
    attendance.status === "absent" ||
    attendance.status === "late" ||
    attendance.status === "excused" ||
    (attendance.status === "present" &&
      attendance.checkedInAtIso !== null &&
      Date.now() - new Date(attendance.checkedInAtIso).getTime() <= 4 * 60 * 60 * 1000);
  const showSecondaryAttendance = !heroOwnsAttendance && attendance.status === "present";

  // ── Derived: priority cards ──────────────────────────────────────────────
  const priorityCards = getFeaturedParentCards({ events, needs });

  // ── Derived: highlight state ─────────────────────────────────────────────
  const showFeaturedHighlight = highlight !== null && highlight.isFeatured;
  // Phase 3 — when the hero already carried the proud-moment headline, the
  // card still renders for category chip + note + reactions, but suppresses
  // its heading <p> so the same sentence doesn't appear twice on the page.
  const highlightHeadingSuppressed =
    showFeaturedHighlight && statusHeadline.consumedHighlightId === highlight!.id;
  // Phase 3 — when the hero lifted the fallback positive observation, the
  // Recent Growth card is suppressed entirely (its only meaningful content
  // was the heading + summary the hero now carries).
  const showFallbackHighlight =
    !showFeaturedHighlight && fallbackHighlight !== null && !statusHeadline.consumedFallback;

  // ── Journey feed ─────────────────────────────────────────────────────────
  const filteredFeed = activeFilter === "all"
    ? feed
    : feed.filter((i) => i.sourceCategory === activeFilter);

  const sp = servicePresence;

  return (
    <ErrorBoundary section="parent-dashboard" fallback="minimal">
    <div className="space-y-5 pb-6">

      {/* ── Greeting + Status Headline ────────────────────────────────────── */}
      <div className="pt-1">
        <p className="text-sm text-muted-foreground">
          {parentName ? `Hi, ${parentName}!` : "Hi there!"}
        </p>
        <h1 className="text-2xl font-bold leading-tight mt-0.5">
          {statusHeadline.heading}
        </h1>
        <div className={`flex items-center gap-1 mt-1 ${statusHeadline.detailColor}`}>
          <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <p className="text-xs">{statusHeadline.detail}</p>
        </div>

        {/* Cross-domain framing — single, subtle. Hidden when only one
            service is connected so single-domain parents don't see an
            "integration platform" line they don't need. */}
        {serviceContextLine && (
          <p className="text-[11px] text-muted-foreground/80 mt-1.5">
            {serviceContextLine}
          </p>
        )}

        {/* Phase 3 — secondary operational line. Only renders when hero is
            continuity-driven AND child is marked present today. Keeps the
            operational grounding without letting it own the emotional tone. */}
        {showSecondaryAttendance && (
          <p className="text-[11px] text-muted-foreground/80 mt-1.5">
            {attendance.checkedInAt
              ? `${firstName} is in school today — checked in at ${attendance.checkedInAt}.`
              : `${firstName} is in school today.`}
          </p>
        )}

        {/* Absence reporting — only when attendance not yet marked */}
        {attendance.status === null && (
          <div className="mt-2.5">
            {absenceReported ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Absence reported to school for today.</span>
              </div>
            ) : showAbsenceForm ? (
              <div className="space-y-2 mt-1">
                <input
                  type="text"
                  placeholder="Reason (optional) — e.g. Sick, family emergency…"
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {absenceError && <p className="text-xs text-red-600">{absenceError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitAbsence}
                    disabled={submittingAbsence}
                    className="flex-1 text-sm font-medium bg-amber-500 text-white rounded-lg py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    {submittingAbsence ? "Sending…" : "Notify School"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAbsenceForm(false); setAbsenceReason(""); setAbsenceError(null); }}
                    className="px-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAbsenceForm(true)}
                className="mt-0.5 text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors"
              >
                <AlertTriangle className="w-3 h-3" />
                Report {firstName} absent today
              </button>
            )}
          </div>
        )}

        {/* ── Phase 4 — continuity spotlight attached to hero ─────────────── */}
        {/* When Phase 3's hero lifted a proud moment (Tier D30), the
            supporting content (chip + note + reactions + link) flows
            directly from the hero, anchored by a hairline separator. No
            card frame, no "Positive Highlight" h2 — the hero IS the
            spotlight. Calm continuation, not celebration. */}
        {highlightHeadingSuppressed && highlight && (
          <div className="mt-3 pt-3 border-t border-amber-200/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[highlight.category] ?? "bg-gray-100 text-gray-700"}`}>
                {highlight.category}
              </span>
            </div>
            {highlight.note && (
              <p className="text-sm text-amber-900/85 mt-2 leading-relaxed italic">
                &ldquo;{highlight.note}&rdquo;
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  onClick={() => handleMomentReaction(highlight.id, r.type)}
                  disabled={reactSaving}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    highlight.myReaction === r.type
                      ? "bg-amber-400 border-amber-400 text-white"
                      : "border-amber-300 text-amber-700 hover:bg-amber-100"
                  } disabled:opacity-50`}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
            {highlight.myReaction && (
              <p className="text-xs text-green-700 mt-2">✓ Your reaction has been shared with the school.</p>
            )}
            {/* Phase 11 — Quiet parent resonance. Optional, private to this
                device, no teacher notification. Rendered below reactions so
                it reads as "if you also want to softly mark this from your
                side." Closed-by-default minimizes visual weight. */}
            <ResonancePicker
              childId={childId}
              momentId={highlight.id}
              firstName={firstName}
            />
            <Link
              href="/parent/proud-moments"
              className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors"
            >
              View all highlights <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>

      {/* ── Phase 4 — standalone Positive Highlight ─────────────────────────── */}
      {/* Renders only when the hero did NOT consume the proud moment (i.e. hero
          is in Tier A/B/C/E/F). Above the operational strip so continuity
          gravity wins vertical order. Demoted from card frame to a left-accent
          treatment so warmth is communicated by the bar + icon + colored text,
          not a filled container. */}
      {showFeaturedHighlight && highlight && !highlightHeadingSuppressed && (
        <div className="border-l-2 border-amber-300 pl-3 py-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <h2 className="font-semibold text-amber-900 text-sm">Positive Highlight</h2>
            <span className="text-xs text-amber-600 ml-auto">{timeAgo(highlight.createdAt)}</span>
          </div>
          <p className="font-medium text-sm text-amber-900 leading-snug">
            {getMomentHeading(firstName, highlight.category)}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[highlight.category] ?? "bg-gray-100 text-gray-700"}`}>
              {highlight.category}
            </span>
          </div>
          {highlight.note && (
            <p className="text-sm text-amber-900/85 mt-2 leading-relaxed italic">
              &ldquo;{highlight.note}&rdquo;
            </p>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                onClick={() => handleMomentReaction(highlight.id, r.type)}
                disabled={reactSaving}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  highlight.myReaction === r.type
                    ? "bg-amber-400 border-amber-400 text-white"
                    : "border-amber-300 text-amber-700 hover:bg-amber-100"
                } disabled:opacity-50`}
              >
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
          {highlight.myReaction && (
            <p className="text-xs text-green-700 mt-2">✓ Your reaction has been shared with the school.</p>
          )}
          {/* Phase 11 — Quiet parent resonance (standalone block variant).
              Same component, same private-to-device storage, same calm
              voice contract as the attached spotlight variant above. */}
          <ResonancePicker
            childId={childId}
            momentId={highlight.id}
            firstName={firstName}
          />
          <Link
            href="/parent/proud-moments"
            className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors"
          >
            View all highlights <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── Phase 4 — standalone Recent Growth (fallback) ───────────────────── */}
      {/* Above the operational strip for the same continuity-gravity reason.
          Demoted to a left-accent green block. */}
      {showFallbackHighlight && fallbackHighlight && (
        <div className="border-l-2 border-green-300 pl-3 py-1">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
            <h2 className="font-semibold text-green-900 text-sm">Recent Growth</h2>
            <span className="text-xs text-green-600 ml-auto">{timeAgo(fallbackHighlight.occurredAt)}</span>
          </div>
          <p className="font-medium text-sm text-green-900 leading-snug">
            {firstName} is making progress in {fallbackHighlight.category}.
          </p>
          <p className="text-xs text-green-800 mt-1.5 leading-relaxed">
            {fallbackHighlight.summary}
          </p>
          <Link
            href="/parent/progress"
            className="mt-3 text-xs text-green-700 hover:text-green-900 font-medium flex items-center gap-1 transition-colors"
          >
            View progress <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── Operational strip (Phase 4 — compressed rows, not cards) ────────── */}
      {/* Operational triage still surfaces here, but at roughly one-third the
          visual mass of the old Card-based PriorityCardsSection. Urgent items
          (consent / doc request) get a left accent + subtle amber tint so they
          still interrupt visually; non-urgent items are plain rows. */}
      <OperationalSection cards={priorityCards} />

      {/* ── Child's Journey (Phase 4 — no card frame; rows on page surface) ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-base">{firstName}&apos;s Journey</h2>
          <Link
            href="/parent/updates"
            className="text-xs text-primary flex items-center gap-0.5 hover:underline flex-shrink-0"
          >
            View updates <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Phase 10 — Continuity memory ("Lately" strip).
            Surfaces proud-moment categories that have recurred (≥2 times)
            in the last 14 days. No counts, no ranking, no narration — just
            the category labels themselves, in most-recent-first order, in
            a de-saturated palette so the strip reads as quiet memory
            texture rather than an active control or analytics surface.
            Renders only when at least one category meets the recurrence
            bar — calm by default. */}
        {recurringCategories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Lately
            </span>
            {recurringCategories.map((cat) => (
              <span
                key={cat}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  CATEGORY_COLORS_MEMORY[cat] ?? "bg-muted/30 text-muted-foreground"
                }`}
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {JOURNEY_FILTERS.map((f) => {
            const isActive = activeFilter === f;
            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors flex-shrink-0 ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {FILTER_LABELS[f]}
                {f === "therapy" && sp.therapy.connected && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-purple-200" : "bg-purple-500"}`} />
                )}
                {f === "medical" && sp.medical.connected && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-emerald-200" : "bg-emerald-500"}`} />
                )}
              </button>
            );
          })}
        </div>
        {filteredFeed.length === 0 ? (
          // Calm centered empty state — no card frame.
          <div className="py-6 text-center text-muted-foreground text-sm px-4 leading-relaxed">
            {FILTER_EMPTY[activeFilter]}
          </div>
        ) : (
          // Rows render directly on the page surface. Each `JourneyRow` carries
          // its own border-b separator (border-border/40, last:border-0).
          <div className="px-1">
            {filteredFeed.map((item, idx) => {
              // Phase 8 — Passive clustering by adjacency on organizationName.
              // Computed against the VISIBLE filtered feed so cluster shape
              // adapts naturally when the parent toggles filter chips.
              const prev = idx > 0 ? filteredFeed[idx - 1] : null;
              const isContinuation = prev !== null && prev.organizationName === item.organizationName;
              return (
                <JourneyRow
                  key={item.id}
                  item={item}
                  isFresh={freshItemIds.has(item.id)}
                  isContinuation={isContinuation}
                />
              );
            })}
          </div>
        )}
      </div>

    </div>
    </ErrorBoundary>
  );
}
