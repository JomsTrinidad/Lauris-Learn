"use client";
import { useEffect, useState } from "react";
import {
  Users, UserCheck, AlertCircle, Calendar, CheckSquare, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, MessageSquare, Bell, Zap,
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
  overdueCount: number;
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

interface StudentAlert {
  type: string;
  label: string;
  description: string;
  href: string;
  count: number;
}

interface AttentionItem {
  id: string;
  label: string;
  href: string;
  severity: "critical" | "warning" | "info";
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

function useTodayLabel() {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return { day, date };
}

function getClassTimeStatus(startTime: string, endTime: string): "upcoming" | "in_progress" | "completed" {
  const now = new Date();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins < startMins) return "upcoming";
  if (nowMins <= endMins) return "in_progress";
  return "completed";
}

export default function DashboardPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();
  const { day, date } = useTodayLabel();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [totalAttByClass, setTotalAttByClass] = useState<Record<string, number>>({});
  const [showEnrollmentSnapshot, setShowEnrollmentSnapshot] = useState(true);
  const [studentAlerts, setStudentAlerts] = useState<StudentAlert[]>([]);
  const [yesterdayPresent, setYesterdayPresent] = useState(0);
  const [newEnrollmentsThisWeek, setNewEnrollmentsThisWeek] = useState(0);
  const [studentsAbsent2Plus, setStudentsAbsent2Plus] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function fetchDashboard() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yearId = activeYear?.id ?? null;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      { count: totalEnrolled },
      { count: presentToday },
      { count: absentToday },
      { count: yesterdayPresentCount },
    ] = await Promise.all([
      supabase.from("enrollments").select("id", { count: "exact", head: true })
        .eq("status", "enrolled").eq("school_year_id", yearId ?? ""),
      supabase.from("attendance_records").select("id", { count: "exact", head: true })
        .eq("status", "present").eq("date", today),
      supabase.from("attendance_records").select("id", { count: "exact", head: true })
        .eq("status", "absent").eq("date", today),
      supabase.from("attendance_records").select("id", { count: "exact", head: true })
        .eq("status", "present").eq("date", yesterdayStr),
    ]);

    setYesterdayPresent(yesterdayPresentCount ?? 0);

    const { data: billingRows } = await supabase
      .from("billing_records")
      .select("id, amount_due, status")
      .eq("school_id", schoolId!)
      .in("status", ["unpaid", "overdue", "partial"]);

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("billing_record_id, amount")
      .eq("status", "confirmed")
      .in("billing_record_id", (billingRows ?? []).map((b) => b.id));

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

    const overdueCount = (billingRows ?? []).filter((b) => b.status === "overdue").length;

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const { count: upcomingEvents } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId!)
      .gte("event_date", today)
      .lte("event_date", future.toISOString().split("T")[0]);

    const { data: inquiryRows } = await supabase
      .from("enrollment_inquiries")
      .select("status, created_at")
      .eq("school_id", schoolId!);

    const inquiryCount = (inquiryRows ?? []).filter((r) => r.status === "inquiry").length;
    const waitlistedCount = (inquiryRows ?? []).filter((r) => r.status === "waitlisted").length;
    const enrolledCount = totalEnrolled ?? 0;
    const recentActivity = (inquiryRows ?? []).filter(
      (r) => new Date(r.created_at) >= sevenDaysAgo
    ).length;

    const shouldShowSnapshot = inquiryCount > 0 || waitlistedCount > 0 || recentActivity > 0;
    setShowEnrollmentSnapshot(shouldShowSnapshot);

    setStats({
      totalEnrolled: totalEnrolled ?? 0,
      presentToday: presentToday ?? 0,
      absentToday: absentToday ?? 0,
      unpaidCount,
      overdueCount,
      outstandingBalance,
      upcomingEvents: upcomingEvents ?? 0,
      inquiryCount,
      waitlistedCount,
      enrolledCount,
    });

    if (yearId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: classRows } = await (supabase as any)
        .from("classes")
        .select(`
          id, name, start_time, end_time,
          class_teachers(teacher:teacher_profiles(full_name)),
          enrollments(count)
        `)
        .eq("school_id", schoolId!)
        .eq("school_year_id", yearId)
        .eq("is_active", true)
        .eq("is_system", false)
        .order("start_time");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classIds = (classRows ?? []).map((c: any) => c.id);

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

      const { data: totalAttRows } = await supabase
        .from("attendance_records")
        .select("class_id")
        .in("class_id", classIds)
        .eq("date", today);

      const totalAttMap: Record<string, number> = {};
      (totalAttRows ?? []).forEach((a) => {
        totalAttMap[a.class_id] = (totalAttMap[a.class_id] ?? 0) + 1;
      });
      setTotalAttByClass(totalAttMap);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (classRows ?? []).map((c: any) => {
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

      const { count: newEnrollCount } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_year_id", yearId)
        .eq("status", "enrolled")
        .gte("created_at", sevenDaysAgo.toISOString());

      setNewEnrollmentsThisWeek(newEnrollCount ?? 0);

      if (classIds.length > 0) {
        const { data: recentAbsences } = await supabase
          .from("attendance_records")
          .select("student_id")
          .in("class_id", classIds)
          .eq("status", "absent")
          .gte("date", sevenDaysAgo.toISOString().split("T")[0]);

        const absencesByStudent: Record<string, number> = {};
        (recentAbsences ?? []).forEach((r) => {
          absencesByStudent[r.student_id] = (absencesByStudent[r.student_id] ?? 0) + 1;
        });
        setStudentsAbsent2Plus(
          Object.values(absencesByStudent).filter((c) => c >= 2).length
        );
      }

      if (!shouldShowSnapshot) {
        const { data: enrolledForAlerts } = await supabase
          .from("enrollments")
          .select("student_id")
          .eq("school_year_id", yearId)
          .eq("status", "enrolled");

        const allEnrolledIds = [
          ...new Set((enrolledForAlerts ?? []).map((e) => e.student_id)),
        ];

        const alerts: StudentAlert[] = [];

        if (allEnrolledIds.length > 0) {
          const { data: billedStudents } = await supabase
            .from("billing_records")
            .select("student_id")
            .eq("school_id", schoolId!);

          const billedSet = new Set((billedStudents ?? []).map((b) => b.student_id));
          const noBillingCount = allEnrolledIds.filter((id) => !billedSet.has(id)).length;

          if (noBillingCount > 0) {
            alerts.push({
              type: "no_billing",
              label: `${noBillingCount} student${noBillingCount > 1 ? "s" : ""} without billing records`,
              description: "No billing records generated for this school year.",
              href: "/billing",
              count: noBillingCount,
            });
          }

          const { data: guardiansData } = await supabase
            .from("guardians")
            .select("student_id")
            .in("student_id", allEnrolledIds);

          const guardianSet = new Set((guardiansData ?? []).map((g) => g.student_id));
          const noGuardianCount = allEnrolledIds.filter((id) => !guardianSet.has(id)).length;

          if (noGuardianCount > 0) {
            alerts.push({
              type: "no_guardian",
              label: `${noGuardianCount} student${noGuardianCount > 1 ? "s" : ""} missing contact info`,
              description: "No guardian linked to these students.",
              href: "/students",
              count: noGuardianCount,
            });
          }
        }

        setStudentAlerts(alerts);
      }
    }

    const { data: updateRows } = await supabase
      .from("parent_updates")
      .select("id, content, created_at, class:classes(name), author:profiles(full_name)")
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false })
      .limit(3);

    const updates = (updateRows ?? []).map((u) => ({
      id: u.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authorName: (u as any).author?.full_name ?? "Teacher",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      className: (u as any).class?.name ?? null,
      content: u.content,
      createdAt: u.created_at,
    }));
    setRecentUpdates(updates);
    setLastUpdateAt(updates[0]?.createdAt ?? null);

    setLoading(false);
  }

  if (loading) return <PageSpinner />;

  // ── Derived ────────────────────────────────────────────────────────────────

  const isClassMarked = (cls: TodayClass) =>
    cls.totalEnrolled === 0 || (totalAttByClass[cls.id] ?? 0) > 0;

  const allClassesMarked =
    todayClasses.length > 0 && todayClasses.every(isClassMarked);

  const totalPresentAll = todayClasses.reduce((sum, c) => sum + c.presentCount, 0);
  const totalAbsentAll = todayClasses.reduce(
    (sum, c) => sum + Math.max(0, c.totalEnrolled - c.presentCount),
    0
  );

  const presentPercent = stats?.totalEnrolled
    ? Math.round((stats.presentToday / stats.totalEnrolled) * 100)
    : 0;
  const yesterdayPercent = stats?.totalEnrolled
    ? Math.round((yesterdayPresent / stats.totalEnrolled) * 100)
    : 0;
  const attendanceTrend =
    presentPercent > yesterdayPercent ? "up" : presentPercent < yesterdayPercent ? "down" : "same";

  const unmarkedClasses = todayClasses.filter(
    (cls) => !isClassMarked(cls) && cls.totalEnrolled > 0
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const noUpdatesToday = !lastUpdateAt || lastUpdateAt.split("T")[0] < todayStr;
  const noUpdatesRecently =
    !lastUpdateAt || Date.now() - new Date(lastUpdateAt).getTime() > 2 * 24 * 60 * 60 * 1000;

  // ── Needs Attention ────────────────────────────────────────────────────────

  const attention: AttentionItem[] = [];

  if (unmarkedClasses.length > 0) {
    attention.push({
      id: "unmarked_att",
      label: `${unmarkedClasses.length} class${unmarkedClasses.length > 1 ? "es" : ""} haven't marked attendance today`,
      href: "/attendance",
      severity: "warning",
    });
  }

  if ((stats?.overdueCount ?? 0) > 0) {
    attention.push({
      id: "overdue_billing",
      label: `${stats!.overdueCount} overdue billing record${stats!.overdueCount > 1 ? "s" : ""} need follow-up`,
      href: "/billing",
      severity: "critical",
    });
  }

  if ((stats?.inquiryCount ?? 0) > 0) {
    attention.push({
      id: "pending_inquiries",
      label: `${stats!.inquiryCount} new enrolment inquir${stats!.inquiryCount > 1 ? "ies" : "y"} pending review`,
      href: "/enrollment",
      severity: "info",
    });
  }

  if (noUpdatesRecently && todayClasses.length > 0) {
    attention.push({
      id: "no_updates",
      label: noUpdatesToday ? "No parent update sent today" : "No parent updates in over 2 days",
      href: "/updates",
      severity: "info",
    });
  }

  // ── Grouped classes ────────────────────────────────────────────────────────

  const groupedClasses = {
    in_progress: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "in_progress"
    ),
    upcoming: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "upcoming"
    ),
    completed: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "completed"
    ),
  };

  const enrollmentSnapshot = [
    {
      label: "New Inquiries",
      sublabel: "Following up",
      count: stats?.inquiryCount ?? 0,
      variant: "inquiry" as const,
    },
    {
      label: "Pending Slots",
      sublabel: "Waitlisted",
      count: stats?.waitlistedCount ?? 0,
      variant: "waitlisted" as const,
    },
    {
      label: "Active Students",
      sublabel: "Enrolled",
      count: stats?.enrolledCount ?? 0,
      variant: "enrolled" as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>Dashboard</h1>
          {!activeYear && (
            <div className="mt-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              No active school year. Go to{" "}
              <Link href="/settings" className="underline">Settings → School Years</Link> to set one.
            </div>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            Welcome back! Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="text-right flex-shrink-0 hidden sm:block">
          <p className="text-base font-semibold text-foreground">{day}</p>
          <p className="text-sm text-muted-foreground">{date}</p>
        </div>
      </div>

      {/* Needs Attention */}
      {attention.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">Needs Attention</p>
            </div>
            <div className="space-y-2">
              {attention.map((item) => (
                <Link key={item.id} href={item.href}>
                  <div
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${
                      item.severity === "critical"
                        ? "bg-red-50 border-red-200"
                        : item.severity === "warning"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          item.severity === "critical"
                            ? "text-red-500"
                            : item.severity === "warning"
                            ? "text-amber-500"
                            : "text-blue-500"
                        }`}
                      />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : activeYear ? (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              All caught up for today — no items need attention.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/students">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Students</p>
                  <p className="text-3xl font-semibold mt-1">{stats?.totalEnrolled ?? 0}</p>
                </div>
                <div className="bg-blue-500 p-3 rounded-xl text-white">
                  <Users className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/attendance">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Present Today</p>
                  <p className="text-3xl font-semibold mt-1">
                    {stats?.presentToday ?? 0}{" "}
                    <span className="text-lg text-muted-foreground font-normal">
                      / {stats?.totalEnrolled ?? 0}
                    </span>
                  </p>
                  <p
                    className={`text-xs mt-0.5 font-medium ${
                      attendanceTrend === "up"
                        ? "text-green-600"
                        : attendanceTrend === "down"
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {presentPercent}%
                    {attendanceTrend === "up" ? " ↑" : attendanceTrend === "down" ? " ↓" : ""}
                    {attendanceTrend !== "same" && (
                      <span className="text-muted-foreground font-normal">
                        {" "}vs yesterday
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-green-500 p-3 rounded-xl text-white">
                  <UserCheck className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/billing">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Unpaid Tuition</p>
                  <p className="text-3xl font-semibold mt-1">{stats?.unpaidCount ?? 0}</p>
                  {(stats?.overdueCount ?? 0) > 0 ? (
                    <p className="text-xs mt-0.5 font-medium text-red-600">
                      {stats!.overdueCount} overdue
                    </p>
                  ) : (stats?.unpaidCount ?? 0) === 0 ? (
                    <p className="text-xs mt-0.5 font-medium text-green-600">All clear</p>
                  ) : null}
                </div>
                <div
                  className={`${
                    (stats?.overdueCount ?? 0) > 0 ? "bg-red-500" : "bg-orange-500"
                  } p-3 rounded-xl text-white`}
                >
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/events">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Upcoming Events</p>
                  <p className="text-3xl font-semibold mt-1">{stats?.upcomingEvents ?? 0}</p>
                  {(stats?.upcomingEvents ?? 0) === 0 && (
                    <p className="text-xs mt-0.5 text-muted-foreground">None in next 30 days</p>
                  )}
                </div>
                <div className="bg-purple-500 p-3 rounded-xl text-white">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/students"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <Users className="w-4 h-4" />
          Add Student
        </Link>
        <Link
          href="/updates"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Parent Update
        </Link>
        <Link
          href="/billing"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <Zap className="w-4 h-4" />
          Record Payment
        </Link>
        <Link
          href="/attendance"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <CheckSquare className="w-4 h-4" />
          Mark Attendance
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <h2>Today&apos;s Progress</h2>
            <Link
              href="/attendance"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View Attendance <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {todayClasses.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                {activeYear
                  ? "No classes configured for this school year."
                  : "Set up an active school year to see classes."}
              </p>
            ) : allClassesMarked ? (
              <div className="px-6 py-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="bg-green-100 p-4 rounded-full">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-base">All classes completed today</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {todayClasses.length}{" "}
                    {todayClasses.length === 1 ? "class" : "classes"} &middot;{" "}
                    {totalPresentAll} present &middot; {totalAbsentAll} absent
                  </p>
                </div>
                <Link
                  href="/attendance"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  View Attendance Summary <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* In Progress */}
                {groupedClasses.in_progress.map((cls) => {
                  const marked = isClassMarked(cls);
                  return (
                    <div
                      key={cls.id}
                      className="flex items-center justify-between px-6 py-4 bg-green-50/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-2 inline-flex w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{cls.name}</p>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                              In Progress
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatTime12(cls.startTime)} – {formatTime12(cls.endTime)} &middot;{" "}
                            {cls.teacherName}
                          </p>
                          {marked && cls.totalEnrolled > 0 && (
                            <p className="text-xs text-green-600 font-medium mt-0.5">
                              {cls.presentCount}/{cls.totalEnrolled} present
                            </p>
                          )}
                        </div>
                      </div>
                      {marked ? (
                        <Link
                          href={`/attendance?class=${cls.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Update
                        </Link>
                      ) : (
                        <Link
                          href={`/attendance?class=${cls.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          <CheckSquare className="w-3.5 h-3.5" /> Mark
                        </Link>
                      )}
                    </div>
                  );
                })}

                {/* Upcoming */}
                {groupedClasses.upcoming.map((cls) => {
                  const marked = isClassMarked(cls);
                  return (
                    <div key={cls.id} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Starts {formatTime12(cls.startTime)} &middot; {cls.teacherName}
                          </p>
                        </div>
                      </div>
                      {marked ? (
                        <Link
                          href={`/attendance?class=${cls.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Update
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                          Upcoming
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Completed */}
                {groupedClasses.completed.map((cls) => {
                  const marked = isClassMarked(cls);
                  return (
                    <div
                      key={cls.id}
                      className="flex items-center justify-between px-6 py-4 opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        {marked ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime12(cls.startTime)} – {formatTime12(cls.endTime)}
                            {marked && cls.totalEnrolled > 0
                              ? ` · ${cls.presentCount}/${cls.totalEnrolled} present`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {!marked && cls.totalEnrolled > 0 ? (
                        <Link
                          href={`/attendance?class=${cls.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          <CheckSquare className="w-3.5 h-3.5" /> Mark
                        </Link>
                      ) : (
                        <Link
                          href={`/attendance?class=${cls.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Communication Health */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <h2>Parent Updates</h2>
              {lastUpdateAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last update: {timeAgo(lastUpdateAt)}
                </p>
              )}
            </div>
            <Link
              href="/updates"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {noUpdatesRecently && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                  noUpdatesToday
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-orange-50 border-orange-200 text-orange-700"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {noUpdatesToday
                    ? "No updates sent to parents today"
                    : "No parent updates in the last 2 days"}
                </span>
              </div>
            )}
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
            <Link
              href="/billing"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.unpaidCount ?? 0) === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-700">All payments are up to date.</p>
              </div>
            ) : (
              <>
                {(stats?.overdueCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">Overdue</p>
                        <p className="text-xs text-red-600">Past billing date — follow up needed</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-red-700">
                      {stats!.overdueCount} records
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <span className="text-sm">Unpaid / Partial</span>
                  <span className="text-sm font-medium text-orange-700">
                    {stats?.unpaidCount ?? 0} records
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Outstanding Balance</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(stats?.outstandingBalance ?? 0)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Enrollment Snapshot or Student Highlights */}
        {showEnrollmentSnapshot ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <h2>Enrollment Snapshot</h2>
              <Link
                href="/enrollment"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {enrollmentSnapshot.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <Badge variant={item.variant}>
                      {item.variant === "inquiry"
                        ? "Inquiry"
                        : item.variant === "waitlisted"
                        ? "Waitlisted"
                        : "Enrolled"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  </div>
                  <span className="text-primary font-semibold text-lg">{item.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <h2>Student Highlights</h2>
              <Link
                href="/students"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View Students <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {newEnrollmentsThisWeek > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                    <p className="text-sm text-blue-800">New enrollments this week</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">
                    {newEnrollmentsThisWeek}
                  </span>
                </div>
              )}
              {studentsAbsent2Plus > 0 && (
                <Link href="/attendance">
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-900">
                        {studentsAbsent2Plus} student{studentsAbsent2Plus > 1 ? "s" : ""} absent
                        2+ days this week
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">Check attendance records</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  </div>
                </Link>
              )}
              {studentAlerts.length === 0 &&
              newEnrollmentsThisWeek === 0 &&
              studentsAbsent2Plus === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700">All clear — no action items.</p>
                </div>
              ) : (
                studentAlerts.map((alert) => (
                  <Link key={alert.type} href={alert.href}>
                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900">{alert.label}</p>
                        <p className="text-xs text-amber-700 mt-0.5">{alert.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
