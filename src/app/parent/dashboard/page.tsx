"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, Clock, Bell, CalendarDays, CreditCard, ChevronRight, AlertCircle, AlertTriangle, Megaphone, Star, ShieldCheck, Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { listPendingConsentsForStudent } from "@/features/documents/parent-api";
import { listOpenRequestsForStudent } from "@/features/documents/requests-api";
import { useParentContext } from "../layout";

interface AttendanceToday {
  status: "present" | "late" | "absent" | "excused" | null;
  time: string | null;
}

interface RecentUpdate {
  id: string;
  content: string;
  author: string;
  className: string;
  createdAt: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  eventDate: string;
}

interface BillingSummary {
  unpaidCount: number;
  totalBalance: number;
}

interface Announcement {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

interface LatestMoment {
  id: string;
  category: string;
  note: string | null;
  createdAt: string;
  myReaction: string | null;
}

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
  { type: "proud",     emoji: "❤️", label: "Proud" },
  { type: "great_job", emoji: "👏", label: "Great Job" },
  { type: "keep_going",emoji: "🌟", label: "Keep Going" },
];

const MOMENT_HEADINGS: Partial<Record<string, (name: string) => string>> = {
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
  return fn ? fn(firstName) : `${firstName} earned a proud moment.`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(n);
}

export default function ParentDashboard() {
  const { child, childId, classId, schoolId } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceToday>({ status: null, time: null });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [billing, setBilling] = useState<BillingSummary>({ unpaidCount: 0, totalBalance: 0 });
  const [pendingDocApprovals, setPendingDocApprovals] = useState(0);
  // Open requests = status='requested'. Parents notice these via the same
  // home-screen surface used for pending consents.
  const [openDocRequests, setOpenDocRequests] = useState(0);

  const [latestMoment, setLatestMoment] = useState<LatestMoment | null>(null);
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [reactSaving, setReactSaving] = useState(false);

  // Absence reporting
  const [absenceReported, setAbsenceReported] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [absenceError, setAbsenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId]);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    setParentUserId(userId);
    await Promise.all([
      loadAttendance(),
      loadAnnouncements(),
      loadUpdates(),
      loadEvents(),
      loadBilling(),
      loadAbsenceStatus(),
      loadLatestMoment(userId),
      loadPendingDocApprovals(),
      loadOpenDocRequests(),
    ]);
    setLoading(false);
  }

  async function loadPendingDocApprovals() {
    if (!childId) return;
    try {
      const rows = await listPendingConsentsForStudent(supabase, childId);
      setPendingDocApprovals(rows.length);
    } catch {
      // Non-fatal — dashboard still renders without the alert.
      setPendingDocApprovals(0);
    }
  }

  async function loadOpenDocRequests() {
    if (!childId) return;
    try {
      const rows = await listOpenRequestsForStudent(supabase, childId);
      // Only count rows still 'requested' — submitted means the parent
      // already responded and is waiting on the school.
      setOpenDocRequests(rows.filter((r) => r.status === "requested").length);
    } catch {
      setOpenDocRequests(0);
    }
  }

  async function loadLatestMoment(userId: string | null) {
    if (!childId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("proud_moments")
      .select("id, category, note, created_at, proud_moment_reactions(reaction_type, parent_id)")
      .eq("student_id", childId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reactions = (data.proud_moment_reactions ?? []) as any[];
    const myReaction = userId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? reactions.find((r: any) => r.parent_id === userId)?.reaction_type ?? null
      : null;
    setLatestMoment({ id: data.id, category: data.category, note: data.note ?? null, createdAt: data.created_at, myReaction });
  }

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
    setLatestMoment((prev) => prev ? { ...prev, myReaction: reactionType } : null);
    setReactSaving(false);
  }

  async function loadAbsenceStatus() {
    if (!childId) return;
    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("absence_notifications")
      .select("id")
      .eq("student_id", childId)
      .eq("date", today)
      .maybeSingle();
    setAbsenceReported(!!data);
  }

  async function loadAnnouncements() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("parent_updates")
      .select("id, content, created_at, author:profiles(full_name)")
      .is("class_id", null)
      .order("created_at", { ascending: false })
      .limit(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAnnouncements(((data ?? []) as any[]).map((a: any) => ({
      id: a.id,
      content: a.content,
      author: a.author?.full_name ?? "School",
      createdAt: a.created_at,
    })));
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

  async function loadAttendance() {
    if (!childId) return;
    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("attendance_records")
      .select("status, created_at")
      .eq("student_id", childId)
      .eq("date", today)
      .maybeSingle();
    if (data) {
      setAttendance({
        status: data.status,
        time: new Date(data.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
      });
    }
  }

  async function loadUpdates() {
    if (!classId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("parent_updates")
      .select("id, content, created_at, author:profiles(full_name), class:classes(name)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(3);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setUpdates(((data ?? []) as any[]).map((u: any) => ({
      id: u.id,
      content: u.content,
      author: u.author?.full_name ?? "Teacher",
      className: u.class?.name ?? "",
      createdAt: u.created_at,
    })));
  }

  async function loadEvents() {
    if (!child) return;
    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("events")
      .select("id, title, event_date")
      .gte("event_date", today)
      .order("event_date")
      .limit(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEvents(((data ?? []) as any[]).map((e: any) => ({
      id: e.id,
      title: e.title,
      eventDate: e.event_date,
    })));
  }

  async function loadBilling() {
    if (!childId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("billing_records")
      .select("amount_due, status")
      .eq("student_id", childId)
      .in("status", ["unpaid", "partial", "overdue"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    setBilling({
      unpaidCount: rows.length,
      totalBalance: rows.reduce((sum: number, r: any) => sum + Number(r.amount_due), 0),
    });
  }

  if (loading) return <PageSpinner />;

  const firstName = child?.firstName ?? "Your child";
  const attendanceConfig = attendance.status === "present"
    ? { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: `${firstName} is in school today`, message: attendance.time ? `Checked in at ${attendance.time}` : "Marked present" }
    : attendance.status === "late"
    ? { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: `${firstName} arrived late today`, message: attendance.time ? `Arrived at ${attendance.time}` : "Marked late" }
    : attendance.status === "absent"
    ? { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: `${firstName} is absent today`, message: "Not in school today" }
    : { icon: AlertCircle, color: "text-muted-foreground", bg: "bg-muted", label: "Attendance not yet recorded", message: "Will be updated by the school once marked" };

  const AttendanceIcon = attendanceConfig.icon;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">
          Hello! 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {child ? `${child.firstName}'s school day` : "Your school portal"}
        </p>
      </div>

      {/* Attendance card */}
      <Card className={attendanceConfig.bg}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <AttendanceIcon className={`w-10 h-10 ${attendanceConfig.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${attendanceConfig.color}`}>{attendanceConfig.label}</p>
              <p className="text-sm text-muted-foreground">{attendanceConfig.message}</p>
            </div>
          </div>

          {/* Absence reporting — only show when attendance hasn't been marked yet */}
          {attendance.status === null && (
            <div className="mt-3 pt-3 border-t border-border/50">
              {absenceReported ? (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
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
                  {absenceError && (
                    <p className="text-xs text-red-600">{absenceError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={submitAbsence}
                      disabled={submittingAbsence}
                      className="flex-1 text-sm font-medium bg-amber-500 text-white rounded-lg py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
                    >
                      {submittingAbsence ? "Sending…" : "Notify School"}
                    </button>
                    <button
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
                  className="text-sm text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Report {firstName} absent today
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document request alert — school is asking the parent to send a
          file. Distinct blue-tone treatment so it doesn't compete with
          the orange "approval required" card below for the same eye. */}
      {openDocRequests > 0 && (
        <Link
          href="/parent/documents"
          className="relative flex items-start gap-3 pl-5 pr-4 py-4 bg-blue-50 border border-blue-300 rounded-xl text-sm hover:bg-blue-100 transition-colors overflow-hidden"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-blue-500" />
          <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-600 text-white">
                School request
              </span>
              <p className="font-semibold text-blue-900">
                {openDocRequests} document{openDocRequests > 1 ? "s" : ""} requested by the school
              </p>
            </div>
            <p className="text-blue-800">
              The school is asking you to send {openDocRequests > 1 ? "a few documents" : "a document"}. Tap to reply.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-blue-700 flex-shrink-0 mt-1" />
        </Link>
      )}

      {/* Document approval alert — needs to read as "act on this first",
          so it gets a stronger treatment than the soft-amber Proud Moment
          card below: deeper background, accent-stripe on the left, and
          an explicit "Action required" tag so two amber blocks aren't
          competing for attention with the same urgency. */}
      {pendingDocApprovals > 0 && (
        <Link
          href="/parent/documents"
          className="relative flex items-start gap-3 pl-5 pr-4 py-4 bg-orange-100 border border-orange-300 rounded-xl text-sm hover:bg-orange-200 transition-colors overflow-hidden"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-orange-500" />
          <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-600 text-white">
                Action required
              </span>
              <p className="font-semibold text-orange-900">
                {pendingDocApprovals} document approval{pendingDocApprovals > 1 ? "s" : ""} waiting for you
              </p>
            </div>
            <p className="text-orange-800">
              The school is asking permission to share {pendingDocApprovals > 1 ? "documents" : "a document"}. Tap to review.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-orange-700 flex-shrink-0 mt-1" />
        </Link>
      )}

      {/* Billing alert */}
      {billing.unpaidCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm">
          <CreditCard className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-700">
              {billing.unpaidCount} unpaid bill{billing.unpaidCount > 1 ? "s" : ""}
            </p>
            <p className="text-red-600">Total due: {formatCurrency(billing.totalBalance)}</p>
          </div>
        </div>
      )}

      {/* Proud Moments */}
      {latestMoment && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-amber-900 text-sm">Proud Moment</h2>
          </div>
          <p className="font-medium text-sm text-amber-900 leading-snug">
            {getMomentHeading(firstName, latestMoment.category)}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[latestMoment.category] ?? "bg-gray-100 text-gray-700"}`}>
              {latestMoment.category}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(latestMoment.createdAt)}</span>
          </div>
          {latestMoment.note && (
            <p className="text-sm text-amber-800 mt-1.5 leading-relaxed italic">&ldquo;{latestMoment.note}&rdquo;</p>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                onClick={() => handleMomentReaction(latestMoment.id, r.type)}
                disabled={reactSaving}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  latestMoment.myReaction === r.type
                    ? "bg-amber-400 border-amber-400 text-white"
                    : "border-amber-300 text-amber-700 hover:bg-amber-100"
                } disabled:opacity-50`}
              >
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
          {latestMoment.myReaction && (
            <p className="text-xs text-green-700 mt-2">✓ Your reaction has been shared with the school.</p>
          )}
          <Link href="/parent/proud-moments" className="mt-3 text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors">
            View all moments <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* School-wide announcements */}
      {announcements.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Announcements</h2>
          </div>
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="flex gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed line-clamp-3">{a.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{a.author} · {timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent updates */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Recent Updates</h2>
          <Link href="/parent/updates" className="text-xs text-primary hover:underline flex items-center gap-1">
            See all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {updates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No recent updates from the school.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs text-muted-foreground">{u.author} · {u.className}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(u.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-3">{u.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Upcoming</h2>
          </div>
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 border border-border rounded-xl text-sm">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-medium">{e.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.eventDate + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
