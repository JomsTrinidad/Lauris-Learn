"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle, XCircle, Clock, Bell, CalendarDays, CreditCard,
  ChevronRight, AlertTriangle, Star, GraduationCap, BookOpen, TrendingUp,
  Megaphone, ShieldCheck, Inbox,
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
  buildServicePresence,
} from "@/features/parent-journey/queries";
import type {
  ParentJourneyItem,
  AttendanceTodayResult,
  UpcomingItem,
  NeedsAttentionCounts,
  LatestHighlight,
  JourneyFilter,
} from "@/features/parent-journey/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(n);
}

function formatEventDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

// ── sub-components ────────────────────────────────────────────────────────────

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

const REACTIONS = [
  { type: "proud",      emoji: "❤️", label: "Proud" },
  { type: "great_job",  emoji: "👏", label: "Great Job" },
  { type: "keep_going", emoji: "🌟", label: "Keep Going" },
];

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

function getMomentHeading(firstName: string, category: string) {
  const fn = MOMENT_HEADINGS[category];
  return fn ? fn(firstName) : `${firstName} earned a proud moment.`;
}

const SENTIMENT_STYLES: Record<string, { dot: string; label: string }> = {
  positive:         { dot: "bg-green-500",  label: "text-green-700" },
  neutral:          { dot: "bg-blue-400",   label: "text-blue-700" },
  informational:    { dot: "bg-primary",    label: "text-primary" },
  requires_action:  { dot: "bg-orange-500", label: "text-orange-700" },
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  school:  BookOpen,
  therapy: TrendingUp,
  medical: ShieldCheck,
  system:  Bell,
};

function JourneyCard({ item }: { item: ParentJourneyItem }) {
  const style = SENTIMENT_STYLES[item.sentiment] ?? SENTIMENT_STYLES.informational;
  const Icon = SOURCE_ICONS[item.sourceCategory] ?? Bell;

  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.label}`}>
            {item.organizationName}
          </span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(item.occurredAt)}</span>
        </div>
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{item.summary}</p>
        {item.actionHref && (
          <Link href={item.actionHref} className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
            {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="flex-shrink-0 mt-1.5">
        <span className={`w-2 h-2 rounded-full block ${style.dot}`} />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const { child, childId, classId, schoolId, schoolName } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceTodayResult>({ status: null, checkedInAt: null });
  const [events, setEvents] = useState<UpcomingItem[]>([]);
  const [needs, setNeeds] = useState<NeedsAttentionCounts>({ billingCount: 0, billingTotal: 0, docRequestCount: 0, docApprovalCount: 0 });
  const [highlight, setHighlight] = useState<LatestHighlight | null>(null);
  const [feed, setFeed] = useState<ParentJourneyItem[]>([]);
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

    // Absence pre-check
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

    const [att, evts, needsData, hlData, feedData] = await Promise.all([
      fetchAttendanceToday(supabase, childId),
      fetchUpcomingEvents(supabase, resolvedSchool),
      fetchNeedsAttention({ supabase, childId }),
      fetchLatestHighlight({ supabase, childId, userId }),
      fetchJourneyFeed({ supabase, childId, classId, schoolName: resolvedSchool }),
    ]);

    setAttendance(att);
    setEvents(evts);
    setNeeds(needsData);
    setHighlight(hlData);
    setFeed(feedData);
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
  const sp = buildServicePresence(schoolName, child?.className ?? "");

  // Attendance card config
  const attConfig =
    attendance.status === "present" ? {
      icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200",
      label: `${firstName} is in school today`,
      sub: attendance.checkedInAt ? `Checked in at ${attendance.checkedInAt}` : "Marked present",
    } : attendance.status === "late" ? {
      icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200",
      label: `${firstName} arrived late today`,
      sub: attendance.checkedInAt ? `Arrived at ${attendance.checkedInAt}` : "Marked late",
    } : attendance.status === "absent" ? {
      icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200",
      label: `${firstName} is absent today`,
      sub: "Not in school today",
    } : {
      icon: Clock, color: "text-muted-foreground", bg: "bg-muted border-transparent",
      label: "Attendance not yet recorded",
      sub: "Will update once the school marks attendance",
    };
  const AttIcon = attConfig.icon;

  // Filter pills — only shown when feed has multiple source categories
  const uniqueSources = [...new Set(feed.map((i) => i.sourceCategory))];
  const showFilterPills = uniqueSources.length > 1;
  const filteredFeed = activeFilter === "all" ? feed : feed.filter((i) => i.sourceCategory === activeFilter);

  // Consolidated needs-attention count
  const totalNeeds = needs.billingCount + needs.docRequestCount + needs.docApprovalCount;

  return (
    <ErrorBoundary section="parent-dashboard" fallback="minimal">
    <div className="space-y-5 pb-4">

      {/* ── Greeting + service chips ─────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold">Hello!</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {firstName}&apos;s support journey
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {sp.school.connected && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
              <GraduationCap className="w-3 h-3" />
              {sp.school.schoolName}
            </span>
          )}
          {sp.therapy.connected && sp.therapy.clinicName && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              <TrendingUp className="w-3 h-3" />
              {sp.therapy.clinicName}
            </span>
          )}
        </div>
      </div>

      {/* ── Attendance card ───────────────────────────────────────────────── */}
      <Card className={`border ${attConfig.bg}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <AttIcon className={`w-9 h-9 ${attConfig.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${attConfig.color}`}>{attConfig.label}</p>
              <p className="text-xs text-muted-foreground">{attConfig.sub}</p>
            </div>
          </div>

          {attendance.status === null && (
            <div className="mt-3 pt-3 border-t border-border/40">
              {absenceReported ? (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Absence reported to school for today.</span>
                </div>
              ) : showAbsenceForm ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Reason (optional)</p>
                  <input
                    type="text"
                    placeholder="e.g. Sick, family emergency…"
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
                  className="text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Report {firstName} absent today
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Needs attention — single consolidated card ────────────────────── */}
      {totalNeeds > 0 && (
        <div className="space-y-2">
          {needs.docRequestCount > 0 && (
            <Link
              href="/parent/documents"
              className="relative flex items-start gap-3 pl-5 pr-4 py-3.5 bg-blue-50 border border-blue-200 rounded-xl text-sm hover:bg-blue-100 transition-colors overflow-hidden"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-blue-500 rounded-l-xl" />
              <Inbox className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-blue-900 text-sm">
                  {needs.docRequestCount} document{needs.docRequestCount > 1 ? "s" : ""} requested by school
                </p>
                <p className="text-xs text-blue-700">Tap to view and upload the requested file{needs.docRequestCount > 1 ? "s" : ""}.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            </Link>
          )}
          {needs.docApprovalCount > 0 && (
            <Link
              href="/parent/documents"
              className="relative flex items-start gap-3 pl-5 pr-4 py-3.5 bg-orange-50 border border-orange-200 rounded-xl text-sm hover:bg-orange-100 transition-colors overflow-hidden"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-orange-500 rounded-l-xl" />
              <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-orange-900 text-sm">
                  {needs.docApprovalCount} consent{needs.docApprovalCount > 1 ? "s" : ""} awaiting your approval
                </p>
                <p className="text-xs text-orange-700">The school needs your permission to share a document.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            </Link>
          )}
          {needs.billingCount > 0 && (
            <Link
              href="/parent/billing"
              className="relative flex items-start gap-3 pl-5 pr-4 py-3.5 bg-red-50 border border-red-200 rounded-xl text-sm hover:bg-red-100 transition-colors overflow-hidden"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-red-500 rounded-l-xl" />
              <CreditCard className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-900 text-sm">
                  {needs.billingCount} unpaid bill{needs.billingCount > 1 ? "s" : ""} · {formatCurrency(needs.billingTotal)}
                </p>
                <p className="text-xs text-red-700">Tap to view billing details.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            </Link>
          )}
        </div>
      )}

      {/* ── Latest highlight (Proud Moment) ──────────────────────────────── */}
      {highlight && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-amber-900 text-sm">Proud Moment</h2>
            <span className="text-xs text-amber-600 ml-auto">{timeAgo(highlight.createdAt)}</span>
          </div>
          <p className="font-medium text-sm text-amber-900 leading-snug">
            {getMomentHeading(firstName, highlight.category)}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[highlight.category] ?? "bg-gray-100 text-gray-700"}`}>
              {highlight.category}
            </span>
          </div>
          {highlight.note && (
            <p className="text-sm text-amber-800 mt-2 leading-relaxed italic">&ldquo;{highlight.note}&rdquo;</p>
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
          <Link href="/parent/proud-moments" className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors">
            View all moments <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── Upcoming events ───────────────────────────────────────────────── */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Upcoming</h2>
            </div>
            <Link href="/parent/events" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              See all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border border-border rounded-xl text-sm">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="font-medium">{e.title}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatEventDate(e.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Child journey feed ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">{firstName}&apos;s Journey</h2>
          </div>
          <Link href="/parent/updates" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            Updates <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {showFilterPills && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["all", ...uniqueSources] as JourneyFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  activeFilter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        {filteredFeed.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No recent updates from {firstName}&apos;s school.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="px-4 py-2">
              {filteredFeed.map((item) => (
                <JourneyCard key={item.id} item={item} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
