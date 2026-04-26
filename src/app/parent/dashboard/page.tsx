"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, Clock, Bell, CalendarDays, CreditCard, ChevronRight, AlertCircle, AlertTriangle, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
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
    await Promise.all([loadAttendance(), loadAnnouncements(), loadUpdates(), loadEvents(), loadBilling(), loadAbsenceStatus()]);
    setLoading(false);
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
