"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle, XCircle, Clock, CalendarDays,
  Bell, CreditCard, ChevronRight, AlertTriangle,
  Star, BookOpen, TrendingUp, ShieldCheck, Inbox, Camera,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";
import {
  fetchJourneyFeed,
  fetchAttendanceToday,
  fetchUpcomingEvents,
  fetchNeedsAttention,
  fetchLatestHighlight,
  fetchFallbackHighlight,
  fetchServicePresence,
} from "@/features/parent-journey/queries";
import {
  getChildStatusHeadline,
  getFeaturedParentCards,
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

function JourneyRow({ item }: { item: ParentJourneyItem }) {
  const cat = CAT_STYLES[item.sourceCategory] ?? CAT_STYLES.system;
  const dot = SENTIMENT_DOT[item.sentiment] ?? "bg-gray-400";
  const { Icon } = cat;
  const hasMedia = (item.mediaCount ?? 0) > 0;
  const thumbUrls = item.mediaThumbnailUrls ?? [];
  const extra = Math.max(0, (item.mediaCount ?? 0) - 3);
  return (
    <div className="flex gap-3 py-3.5 border-b border-border/40 last:border-0">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.iconBg}`}>
        <Icon className={`w-4 h-4 ${cat.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${cat.labelColor}`}>
            {item.organizationName}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 leading-tight">
            {timeAgo(item.occurredAt)}
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug mt-0.5">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {item.summary}
        </p>

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

        {item.actionHref && item.itemType !== "update" && (
          <Link
            href={item.actionHref}
            className="mt-1 text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="flex-shrink-0 pt-2">
        <span className={`w-2 h-2 rounded-full block ${dot}`} />
      </div>
    </div>
  );
}

// ── priority card rendering ───────────────────────────────────────────────────

const COMPACT_CARD_HEADER: Partial<Record<PriorityCardType, string>> = {
  upcoming_meeting: "Meeting",
  balance_due:      "Balance",
  upcoming_event:   "Upcoming",
  school_event:     "School Event",
  holiday:          "Upcoming",
  all_clear:        "Balance",
  todays_session:   "Session Today",
};

const COMPACT_CARD_ICON: Partial<Record<PriorityCardType, React.ElementType>> = {
  upcoming_meeting: CalendarDays,
  balance_due:      CreditCard,
  upcoming_event:   CalendarDays,
  school_event:     CalendarDays,
  holiday:          CalendarDays,
  all_clear:        CheckCircle,
  todays_session:   CalendarDays,
};

function CompactCard({ card }: { card: PriorityCard }) {
  const Icon = COMPACT_CARD_ICON[card.cardType] ?? CalendarDays;
  const isWarning = card.accentVariant === "warning";
  const isSuccess = card.accentVariant === "success";
  const isPurple  = card.accentVariant === "purple";

  return (
    <Link href={card.actionHref} className="block h-full">
      <Card className={`h-full hover:bg-accent/20 transition-colors ${
        isWarning ? "border-amber-200 bg-amber-50/50" :
        isSuccess ? "border-green-100 bg-green-50/30" : ""
      }`}>
        <CardContent className="p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon className={`w-3.5 h-3.5 ${
              isWarning ? "text-amber-500" :
              isSuccess ? "text-green-600" :
              isPurple  ? "text-purple-500" :
              "text-muted-foreground"
            }`} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {COMPACT_CARD_HEADER[card.cardType] ?? "Upcoming"}
            </p>
          </div>
          <p className={`font-semibold text-sm leading-snug line-clamp-2 ${
            isWarning ? "text-amber-800" :
            isSuccess ? "text-green-700" : ""
          }`}>{card.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          {card.detail && (
            <p className={`text-[10px] font-medium mt-1 ${
              isPurple  ? "text-purple-600" :
              card.accentVariant === "muted" ? "text-muted-foreground" :
              "text-primary"
            }`}>{card.detail}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function UrgentBanner({ card }: { card: PriorityCard }) {
  const isWarning = card.accentVariant === "warning";
  const baseClass  = isWarning ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200";
  const sidebar    = isWarning ? "bg-orange-500" : "bg-blue-500";
  const titleClass = isWarning ? "text-orange-900" : "text-blue-900";
  const subClass   = isWarning ? "text-orange-700" : "text-blue-700";
  const iconClass  = isWarning ? "text-orange-600" : "text-blue-600";
  const chevClass  = isWarning ? "text-orange-500" : "text-blue-500";
  const Icon = card.id === "consent-pending" ? ShieldCheck : Inbox;

  return (
    <Link
      href={card.actionHref}
      className={`relative flex items-start gap-3 pl-5 pr-4 py-3.5 border ${baseClass} rounded-xl text-sm hover:opacity-90 transition-opacity overflow-hidden`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${sidebar} rounded-l-xl`} />
      <Icon className={`w-5 h-5 ${iconClass} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${titleClass} text-sm`}>{card.title}</p>
        <p className={`text-xs ${subClass} mt-0.5`}>{card.subtitle}</p>
      </div>
      <ChevronRight className={`w-4 h-4 ${chevClass} flex-shrink-0 mt-0.5`} />
    </Link>
  );
}

function PriorityCardsSection({ cards }: { cards: PriorityCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-muted/50 text-sm text-muted-foreground">
        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
        <span>You&apos;re all caught up — no urgent items today.</span>
      </div>
    );
  }
  const urgentCards = cards.filter(c => c.cardType === "urgent_action");
  const normalCards = cards.filter(c => c.cardType !== "urgent_action");

  return (
    <div className="space-y-3">
      {urgentCards.map(c => <UrgentBanner key={c.id} card={c} />)}
      {normalCards.length > 0 && (
        <div className={normalCards.length === 1 ? "" : "grid grid-cols-2 gap-3"}>
          {normalCards.map(c => <CompactCard key={c.id} card={c} />)}
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

const MOMENT_HEADINGS: Partial<Record<string, (n: string) => string>> = {
  "Kindness":       (n) => `${n} showed kindness today.`,
  "Effort":         (n) => `${n} gave it their all today.`,
  "Focus":          (n) => `${n} stayed focused during class.`,
  "Participation":  (n) => `${n} was active and engaged today.`,
  "Independence":   (n) => `${n} worked independently today.`,
  "Creativity":     (n) => `${n} showed wonderful creativity today.`,
  "Improvement":    (n) => `${n} made great progress today.`,
  "Helping Others": (n) => `${n} helped a classmate today.`,
};

function getMomentHeading(firstName: string, category: string): string {
  const fn = MOMENT_HEADINGS[category];
  return fn ? fn(firstName) : `${firstName} earned a positive highlight.`;
}

// ── filter config ─────────────────────────────────────────────────────────────

const JOURNEY_FILTERS: JourneyFilter[] = ["all", "school", "therapy", "medical"];

const FILTER_LABELS: Record<JourneyFilter, string> = {
  all:     "All",
  school:  "School",
  therapy: "Therapy",
  medical: "Medical",
};

const FILTER_EMPTY: Partial<Record<JourneyFilter, string>> = {
  therapy: "No therapy updates yet. Completed session notes from your child's therapist will appear here when shared.",
  medical: "No medical updates yet. Assessment summaries and specialist notes will appear here when shared.",
  school:  "No school updates yet. Teacher posts and progress notes will appear here.",
};

// ── icon map for status headline ──────────────────────────────────────────────

const STATUS_ICON_MAP = {
  check:    CheckCircle,
  clock:    Clock,
  x:        XCircle,
  calendar: CalendarDays,
} as const;

// ── main component ────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const { child, childId, classId, schoolId, schoolName } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [parentName, setParentName] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTodayResult>({ status: null, checkedInAt: null });
  const [events, setEvents] = useState<UpcomingItem[]>([]);
  const [needs, setNeeds] = useState<NeedsAttentionCounts>({ billingCount: 0, billingTotal: 0, docRequestCount: 0, docApprovalCount: 0 });
  const [highlight, setHighlight] = useState<LatestHighlight | null>(null);
  const [fallbackHighlight, setFallbackHighlight] = useState<FallbackHighlight | null>(null);
  const [feed, setFeed] = useState<ParentJourneyItem[]>([]);
  const [servicePresence, setServicePresence] = useState<ServicePresence>({
    school: { connected: false }, therapy: { connected: false }, medical: { connected: false },
  });
  const [activeFilter, setActiveFilter] = useState<JourneyFilter>("all");
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [reactSaving, setReactSaving] = useState(false);

  // Absence reporting
  const [absenceReported, setAbsenceReported] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [absenceError, setAbsenceError] = useState<string | null>(null);

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

    const [att, evts, needsData, hlData, fbData, feedData, spData] = await Promise.all([
      fetchAttendanceToday(supabase, childId),
      fetchUpcomingEvents(supabase, resolvedSchool, { schoolId, classId }),
      fetchNeedsAttention({ supabase, childId }),
      fetchLatestHighlight({ supabase, childId, userId }),
      fetchFallbackHighlight({ supabase, childId }),
      fetchJourneyFeed({ supabase, childId, classId, schoolName: resolvedSchool }),
      fetchServicePresence(supabase, childId, resolvedSchool, resolvedClass),
    ]);

    setAttendance(att);
    setEvents(evts);
    setNeeds(needsData);
    setHighlight(hlData);
    setFallbackHighlight(fbData);
    setFeed(feedData);
    setServicePresence(spData);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId]);

  useEffect(() => { loadAll(); }, [loadAll]);

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

  // ── Derived: status headline ─────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const todayEvents = events.filter(e => e.date === today);
  const statusHeadline = getChildStatusHeadline(firstName, attendance, todayEvents);
  const StatusIcon = STATUS_ICON_MAP[statusHeadline.iconKind];

  // ── Derived: priority cards ──────────────────────────────────────────────
  const priorityCards = getFeaturedParentCards({ events, needs });

  // ── Derived: highlight state ─────────────────────────────────────────────
  const showFeaturedHighlight = highlight !== null && highlight.isFeatured;
  const showFallbackHighlight = !showFeaturedHighlight && fallbackHighlight !== null;

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
      </div>

      {/* ── Priority cards (dynamic — max 2) ──────────────────────────────── */}
      {/* Urgent action banners render full-width; non-urgent render as compact cards.    */}
      {/* Priority: consent > doc request > meeting today > balance > event > holiday.   */}
      <PriorityCardsSection cards={priorityCards} />

      {/* ── Positive Highlight ────────────────────────────────────────────── */}

      {/* Featured highlight — within the 7-day window */}
      {showFeaturedHighlight && highlight && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
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
            <p className="text-sm text-amber-800 mt-2 leading-relaxed italic">
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
          <Link
            href="/parent/proud-moments"
            className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors"
          >
            View all highlights <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Fallback — no featured highlight, show recent progress observation */}
      {showFallbackHighlight && fallbackHighlight && (
        <div className="bg-green-50/60 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
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

      {/* ── Child's Journey ───────────────────────────────────────────────── */}
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
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm px-6 leading-relaxed">
              {FILTER_EMPTY[activeFilter] ?? "No updates yet."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="px-4 py-2">
              {filteredFeed.map((item) => (
                <JourneyRow key={item.id} item={item} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

    </div>
    </ErrorBoundary>
  );
}
