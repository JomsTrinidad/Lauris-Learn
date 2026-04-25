"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, Clock, Bell, CalendarDays, CreditCard, ChevronRight, AlertCircle } from "lucide-react";
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
  const { child, childId, classId } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceToday>({ status: null, time: null });
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [billing, setBilling] = useState<BillingSummary>({ unpaidCount: 0, totalBalance: 0 });

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadAttendance(), loadUpdates(), loadEvents(), loadBilling()]);
    setLoading(false);
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
        <CardContent className="p-4 flex items-center gap-4">
          <AttendanceIcon className={`w-10 h-10 ${attendanceConfig.color} flex-shrink-0`} />
          <div>
            <p className={`font-semibold ${attendanceConfig.color}`}>{attendanceConfig.label}</p>
            <p className="text-sm text-muted-foreground">{attendanceConfig.message}</p>
          </div>
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
