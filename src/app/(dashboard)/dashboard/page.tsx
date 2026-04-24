"use client";
import { useEffect, useState } from "react";
import {
  Users, UserCheck, AlertCircle, Calendar, CheckSquare, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { formatCurrency } from "@/lib/utils";

interface DashboardStats {
  totalEnrolled: number;
  presentToday: number;
  absentToday: number;
  unpaidCount: number;
  outstandingBalance: number;
  upcomingEvents: number;
  inquiryCount: number;
  waitlistedCount: number;
  enrolledCount: number;
}

interface TodayClass {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  presentCount: number;
  totalEnrolled: number;
}

interface RecentUpdate {
  id: string;
  authorName: string;
  className: string | null;
  content: string;
  createdAt: string;
}

function formatTime12(t: string) {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function fetchDashboard() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const yearId = activeYear?.id ?? null;

    // Enrolled students count
    const { count: totalEnrolled } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("status", "enrolled")
      .eq("school_year_id", yearId ?? "");

    // Today attendance
    const { count: presentToday } = await supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "present")
      .eq("date", today);

    const { count: absentToday } = await supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "absent")
      .eq("date", today);

    // Unpaid billing
    const { data: billingRows } = await supabase
      .from("billing_records")
      .select("id, amount_due")
      .eq("school_id", schoolId!)
      .in("status", ["unpaid", "overdue", "partial"]);

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("billing_record_id, amount")
      .eq("status", "confirmed")
      .in(
        "billing_record_id",
        (billingRows ?? []).map((b) => b.id)
      );

    const paidByBilling = (paymentRows ?? []).reduce(
      (acc, p) => {
        acc[p.billing_record_id] = (acc[p.billing_record_id] ?? 0) + Number(p.amount);
        return acc;
      },
      {} as Record<string, number>
    );

    const outstandingBalance = (billingRows ?? []).reduce((sum, b) => {
      const paid = paidByBilling[b.id] ?? 0;
      return sum + Math.max(0, Number(b.amount_due) - paid);
    }, 0);

    const unpaidCount = (billingRows ?? []).filter((b) => {
      const paid = paidByBilling[b.id] ?? 0;
      return Number(b.amount_due) - paid > 0;
    }).length;

    // Upcoming events (next 30 days)
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const { count: upcomingEvents } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId!)
      .gte("event_date", today)
      .lte("event_date", future.toISOString().split("T")[0]);

    // Enrollment pipeline counts
    const { data: inquiryRows } = await supabase
      .from("enrollment_inquiries")
      .select("status")
      .eq("school_id", schoolId!);

    const inquiryCount = (inquiryRows ?? []).filter((r) => r.status === "inquiry").length;
    const waitlistedCount = (inquiryRows ?? []).filter((r) => r.status === "waitlisted").length;
    const enrolledCount = totalEnrolled ?? 0;

    setStats({
      totalEnrolled: totalEnrolled ?? 0,
      presentToday: presentToday ?? 0,
      absentToday: absentToday ?? 0,
      unpaidCount,
      outstandingBalance,
      upcomingEvents: upcomingEvents ?? 0,
      inquiryCount,
      waitlistedCount,
      enrolledCount,
    });

    // Today's classes
    if (yearId) {
      const { data: classRows } = await supabase
        .from("classes")
        .select(`
          id, name, start_time, end_time,
          class_teachers(teacher:profiles(full_name)),
          enrollments(count)
        `)
        .eq("school_id", schoolId!)
        .eq("school_year_id", yearId)
        .eq("is_active", true)
        .order("start_time");

      // Get today's present count per class
      const classIds = (classRows ?? []).map((c) => c.id);
      const { data: attRows } = await supabase
        .from("attendance_records")
        .select("class_id, status")
        .in("class_id", classIds)
        .eq("date", today)
        .eq("status", "present");

      const presentByClass: Record<string, number> = {};
      (attRows ?? []).forEach((a) => {
        presentByClass[a.class_id] = (presentByClass[a.class_id] ?? 0) + 1;
      });

      // Get enrolled count per class
      const { data: enrollRows } = await supabase
        .from("enrollments")
        .select("class_id")
        .in("class_id", classIds)
        .eq("status", "enrolled");
      const enrolledByClass: Record<string, number> = {};
      (enrollRows ?? []).forEach((e) => {
        enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
      });

      setTodayClasses(
        (classRows ?? []).map((c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const teachers: string[] = ((c as any).class_teachers ?? []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (t: any) => t.teacher?.full_name ?? ""
          ).filter(Boolean);
          return {
            id: c.id,
            name: c.name,
            startTime: c.start_time,
            endTime: c.end_time,
            teacherName: teachers.join(", ") || "—",
            presentCount: presentByClass[c.id] ?? 0,
            totalEnrolled: enrolledByClass[c.id] ?? 0,
          };
        })
      );
    }

    // Recent parent updates
    const { data: updateRows } = await supabase
      .from("parent_updates")
      .select("id, content, created_at, class:classes(name), author:profiles(full_name)")
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false })
      .limit(3);

    setRecentUpdates(
      (updateRows ?? []).map((u) => ({
        id: u.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authorName: (u as any).author?.full_name ?? "Teacher",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        className: (u as any).class?.name ?? null,
        content: u.content,
        createdAt: u.created_at,
      }))
    );

    setLoading(false);
  }

  if (loading) return <PageSpinner />;

  const summaryCards = [
    {
      label: "Total Students",
      value: String(stats?.totalEnrolled ?? 0),
      icon: Users, color: "bg-blue-500", href: "/students",
    },
    {
      label: "Present Today",
      value: `${stats?.presentToday ?? 0} / ${stats?.totalEnrolled ?? 0}`,
      icon: UserCheck, color: "bg-green-500", href: "/attendance",
    },
    {
      label: "Unpaid Tuition",
      value: String(stats?.unpaidCount ?? 0),
      icon: AlertCircle, color: "bg-orange-500", href: "/billing",
    },
    {
      label: "Upcoming Events",
      value: String(stats?.upcomingEvents ?? 0),
      icon: Calendar, color: "bg-purple-500", href: "/events",
    },
  ];

  const enrollmentSnapshot = [
    { status: "Inquiry", count: stats?.inquiryCount ?? 0, variant: "inquiry" as const },
    { status: "Waitlisted", count: stats?.waitlistedCount ?? 0, variant: "waitlisted" as const },
    { status: "Enrolled", count: stats?.enrolledCount ?? 0, variant: "enrolled" as const },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1>Dashboard</h1>
        {!activeYear && (
          <div className="mt-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            No active school year. Go to <Link href="/settings" className="underline">Settings → School Years</Link> to set one.
          </div>
        )}
        <p className="text-muted-foreground mt-1 text-sm">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-3xl font-semibold mt-1">{card.value}</p>
                  </div>
                  <div className={`${card.color} p-3 rounded-xl text-white`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Classes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <h2>Today's Classes</h2>
            <Link href="/attendance" className="text-sm text-primary hover:underline flex items-center gap-1">
              Mark Attendance <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {todayClasses.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                {activeYear ? "No classes configured for today." : "Set up an active school year to see classes."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {todayClasses.map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium text-sm">{cls.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime12(cls.startTime)} – {formatTime12(cls.endTime)}
                      </p>
                      <p className="text-xs text-muted-foreground">Teacher: {cls.teacherName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm">{cls.presentCount}/{cls.totalEnrolled} present</span>
                      <Link
                        href={`/attendance?class=${cls.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Mark Attendance
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Parent Updates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <h2>Recent Parent Updates</h2>
            <Link href="/updates" className="text-sm text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {recentUpdates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No updates yet.</p>
            ) : (
              recentUpdates.map((u) => (
                <div key={u.id} className="p-4 bg-muted rounded-lg border-l-4 border-primary">
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <p className="font-medium text-sm">{u.authorName}</p>
                      <p className="text-xs text-muted-foreground">{u.className ?? "General"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(u.createdAt)}</span>
                  </div>
                  <p className="text-sm line-clamp-2">{u.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <h2>Payment Overview</h2>
            <Link href="/billing" className="text-sm text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-sm">Unpaid / Overdue</span>
              <span className="text-sm font-medium text-red-700">{stats?.unpaidCount ?? 0} records</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-sm">Outstanding Balance</span>
              <span className="text-sm font-medium text-orange-700">
                {formatCurrency(stats?.outstandingBalance ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment Snapshot */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <h2>Enrollment Snapshot</h2>
            <Link href="/enrollment" className="text-sm text-primary hover:underline flex items-center gap-1">
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrollmentSnapshot.map((item) => (
              <div key={item.status} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <Badge variant={item.variant}>{item.status}</Badge>
                <span className="text-primary font-semibold">{item.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
