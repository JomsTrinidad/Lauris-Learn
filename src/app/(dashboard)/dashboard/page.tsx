"use client";
import { useEffect, useState } from "react";
import {
  Users, UserCheck, AlertCircle, Calendar, CheckSquare, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, Bell, HelpCircle, Search, X,
  Settings, GraduationCap, BookOpen, Briefcase, DollarSign, FileText, Lock, Mail, ChevronDown, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { formatCurrency } from "@/lib/utils";
import { useDashboardStats, useBillingSummary } from "@/lib/hooks";

interface DashboardStats {
  presentToday: number;
  absentToday: number;
  outstandingBalance: number;
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
  const { schoolId, activeYear, userRole } = useSchoolContext();
  const supabase = createClient();
  const { day, date } = useTodayLabel();

  // Use the cached dashboard stats hook
  const statsQuery = useDashboardStats(schoolId, activeYear?.id || null);

  // Use the cached billing summary hook (Batch B1.6.1)
  const billingSummaryQuery = useBillingSummary(schoolId, activeYear?.id || null);

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
  const [complexDataError, setComplexDataError] = useState<string | null>(null);

  // Help drawer state
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (statsQuery.data) {
      // Merge cached stats with local computed values
      setStats({
        presentToday: 0, // Will be computed from class attendance below
        absentToday: 0,  // Will be computed from class attendance below
        outstandingBalance: 0, // Will be computed from billing below
      });
      setShowEnrollmentSnapshot(
        (statsQuery.data.inquiryCount ?? 0) > 0 ||
        (statsQuery.data.waitlistedCount ?? 0) > 0
      );
    }
  }, [statsQuery.data]);

  useEffect(() => {
    if (!schoolId) return;
    fetchComplexDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function fetchComplexDashboardData() {
    try {
      setComplexDataError(null);
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const yearId = activeYear?.id ?? null;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch attendance data (billing data now comes from useBillingSummary hook)
      const [
        { count: presentToday },
        { count: absentToday },
        { count: yesterdayPresentCount },
      ] = await Promise.all([
        supabase.from("attendance_records").select("id", { count: "exact", head: true })
          .eq("status", "present").eq("date", today),
        supabase.from("attendance_records").select("id", { count: "exact", head: true })
          .eq("status", "absent").eq("date", today),
        supabase.from("attendance_records").select("id", { count: "exact", head: true })
          .eq("status", "present").eq("date", yesterdayStr),
      ]);

      setYesterdayPresent(yesterdayPresentCount ?? 0);

      // Attendance stats (outstanding balance comes from billingSummaryQuery below)
      setStats({
        presentToday: presentToday ?? 0,
        absentToday: absentToday ?? 0,
        outstandingBalance: 0, // Will use billingSummaryQuery.data instead
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

        // Only show student alerts if enrollment snapshot is not shown (no pending inquiries/waitlist)
        if (!showEnrollmentSnapshot) {
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
    } catch (err) {
      console.error("[Dashboard] Failed to fetch complex data:", err);
      setComplexDataError("Failed to load dashboard data. Check your connection and try again.");
    }
  }

  if (statsQuery.isLoading) return <PageSpinner />;

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

  const totalEnrolled = statsQuery.data?.totalEnrolled ?? 0;
  const presentPercent = totalEnrolled
    ? Math.round(((stats?.presentToday ?? 0) / totalEnrolled) * 100)
    : 0;
  const yesterdayPercent = totalEnrolled
    ? Math.round((yesterdayPresent / totalEnrolled) * 100)
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

  if ((statsQuery.data?.overdueCount ?? 0) > 0) {
    attention.push({
      id: "overdue_billing",
      label: `${statsQuery.data!.overdueCount} overdue billing record${statsQuery.data!.overdueCount > 1 ? "s" : ""} need follow-up`,
      href: "/billing",
      severity: "critical",
    });
  }

  if ((statsQuery.data?.inquiryCount ?? 0) > 0) {
    attention.push({
      id: "pending_inquiries",
      label: `${statsQuery.data!.inquiryCount} new enrolment inquir${statsQuery.data!.inquiryCount > 1 ? "ies" : "y"} pending review`,
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
      count: statsQuery.data?.inquiryCount ?? 0,
      variant: "inquiry" as const,
    },
    {
      label: "Pending Slots",
      sublabel: "Waitlisted",
      count: statsQuery.data?.waitlistedCount ?? 0,
      variant: "waitlisted" as const,
    },
    {
      label: "Active Students",
      sublabel: "Enrolled",
      count: statsQuery.data?.totalEnrolled ?? 0,
      variant: "enrolled" as const,
    },
  ];

  return (
    <ErrorBoundary section="dashboard" fallback="minimal">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-2">
        <div>
          <h1>Dashboard</h1>
          {!activeYear && (
            <div className="mt-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              No active school year. Go to{" "}
              <Link href="/settings" className="underline">Settings → School Years</Link> to set one.
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            What needs your attention today?
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {userRole === "super_admin" && (
            <button
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <HelpCircle className="w-4 h-4" />
              Setup Guide
            </button>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-base font-semibold text-foreground">{day}</p>
            <p className="text-sm text-muted-foreground">{date}</p>
          </div>
        </div>
      </div>

      {/* Error state with retry */}
      {complexDataError && (
        <ErrorAlert
          message={complexDataError}
          onRetry={fetchComplexDashboardData}
        />
      )}

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

      {/* Core Health Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/students" className="h-full">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 h-full">
              <div className="flex items-start justify-between gap-3 h-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Students</p>
                  <p className="text-2xl font-bold mt-1">{totalEnrolled}</p>
                </div>
                <div className="bg-blue-500 p-2 rounded-lg text-white shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/attendance" className="h-full">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 h-full">
              <div className="flex items-start justify-between gap-3 h-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Attendance Today</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <p className="text-2xl font-bold">{stats?.presentToday ?? 0}</p>
                    <p className="text-sm text-muted-foreground">/ {totalEnrolled}</p>
                  </div>
                  <p
                    className={`text-xs mt-1 font-medium ${
                      attendanceTrend === "up"
                        ? "text-green-600"
                        : attendanceTrend === "down"
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {presentPercent}%{" "}
                    {attendanceTrend === "up" ? "↑" : attendanceTrend === "down" ? "↓" : ""}
                  </p>
                </div>
                <div className="bg-green-500 p-2 rounded-lg text-white shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/billing" className="h-full">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 h-full">
              <div className="flex items-start justify-between gap-3 h-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Outstanding Balance</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(billingSummaryQuery.data?.outstandingBalance ?? 0)}</p>
                  {(statsQuery.data?.overdueCount ?? 0) > 0 && (
                    <p className="text-xs mt-1 font-medium text-red-600">
                      {statsQuery.data!.overdueCount} overdue
                    </p>
                  )}
                </div>
                <div
                  className={`${
                    (statsQuery.data?.overdueCount ?? 0) > 0 ? "bg-red-500" : "bg-orange-500"
                  } p-2 rounded-lg text-white shrink-0`}
                >
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/events" className="h-full">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 h-full">
              <div className="flex items-start justify-between gap-3 h-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Upcoming Events</p>
                  <p className="text-2xl font-bold mt-1">{statsQuery.data?.upcomingEvents ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Next 30 days</p>
                </div>
                <div className="bg-purple-500 p-2 rounded-lg text-white shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Operations: Classes Requiring Action */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold">Classes Requiring Action</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Mark attendance as classes meet</p>
            </div>
            <Link
              href="/attendance"
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              Full View <ArrowRight className="w-3 h-3" />
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

        {/* Today's Operations: Recent Parent Communication */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold">Parent Communication</h2>
              {lastUpdateAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last update {timeAgo(lastUpdateAt)}
                </p>
              )}
            </div>
            <Link
              href="/updates"
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              Send Update <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {noUpdatesRecently && !recentUpdates.length && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border bg-amber-50 border-amber-200 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {noUpdatesToday ? "No updates sent today" : "No updates in 2 days"}
              </div>
            )}
            {recentUpdates.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-muted-foreground">No updates yet</p>
              </div>
            ) : (
              recentUpdates.map((u) => (
                <div key={u.id} className="px-4 py-3 bg-muted/40 rounded-lg border-l-2 border-primary hover:bg-muted/60 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">{u.authorName}</p>
                      <p className="text-xs text-muted-foreground">{u.className ?? "School-wide"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(u.createdAt)}</span>
                  </div>
                  <p className="text-xs line-clamp-2 text-foreground/80">{u.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Watchlist */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold">Financial Watchlist</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Accounts requiring follow-up</p>
            </div>
            <Link
              href="/billing"
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {(statsQuery.data?.unpaidCount ?? 0) === 0 ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-xs text-green-700 font-medium">All accounts settled</p>
              </div>
            ) : (
              <>
                {(statsQuery.data?.overdueCount ?? 0) > 0 && (
                  <Link href="/billing" className="block">
                    <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-red-800">Overdue Accounts</p>
                          <p className="text-xs text-red-600">Past due — immediate follow-up</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-700 ml-2 shrink-0">
                        {statsQuery.data!.overdueCount}
                      </span>
                    </div>
                  </Link>
                )}
                {((statsQuery.data?.unpaidCount ?? 0) - (statsQuery.data?.overdueCount ?? 0)) > 0 && (
                  <Link href="/billing" className="block">
                    <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-800">Outstanding Accounts</p>
                          <p className="text-xs text-amber-600">Not yet overdue</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-amber-700 ml-2 shrink-0">
                        {(statsQuery.data?.unpaidCount ?? 0) - (statsQuery.data?.overdueCount ?? 0)}
                      </span>
                    </div>
                  </Link>
                )}
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Outstanding</p>
                  <p className="text-xl font-bold mt-1">
                    {formatCurrency(billingSummaryQuery.data?.outstandingBalance ?? 0)}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Student & Enrollment Section */}
        {showEnrollmentSnapshot ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">Enrollment Status</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pipeline overview</p>
              </div>
              <Link
                href="/enrollment"
                className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
              >
                Review <ArrowRight className="w-3 h-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {enrollmentSnapshot.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <Badge variant={item.variant} className="text-xs">
                      {item.variant === "inquiry"
                        ? "Inquiry"
                        : item.variant === "waitlisted"
                        ? "Waitlisted"
                        : "Enrolled"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  </div>
                  <span className="text-lg font-bold text-primary ml-2 shrink-0">{item.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">Student Support</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Risk & growth</p>
              </div>
              <Link
                href="/students"
                className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {newEnrollmentsThisWeek > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-800">New This Week</p>
                      <p className="text-xs text-blue-600">Newly enrolled students</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-blue-700 ml-2 shrink-0">
                    {newEnrollmentsThisWeek}
                  </span>
                </div>
              )}
              {studentsAbsent2Plus > 0 && (
                <Link href="/attendance" className="block">
                  <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800">High Absences</p>
                        <p className="text-xs text-amber-600">2+ days this week</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-700 ml-2 shrink-0">
                      {studentsAbsent2Plus}
                    </span>
                  </div>
                </Link>
              )}
              {studentAlerts.length === 0 &&
              newEnrollmentsThisWeek === 0 &&
              studentsAbsent2Plus === 0 ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 font-medium">No concerns</p>
                </div>
              ) : (
                studentAlerts.map((alert) => (
                  <Link key={alert.type} href={alert.href} className="block">
                    <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-800">{alert.label}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-amber-700 ml-2 shrink-0">
                        {alert.count}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Help Drawer: School Admin Setup Walkthrough (Super Admin Only) */}
      {helpOpen && userRole === "super_admin" && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Setup Walkthrough</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search steps..."
                  value={helpSearch}
                  onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {(() => {
                const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
                  <div className="flex gap-2.5 items-start">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                    <span className="text-sm">{text}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );
                const Tip = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );

                type HelpTopic = { id: string; icon: React.ElementType; title: string; stepNumber: number; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "overview",
                    icon: BookOpen,
                    title: "Recommended Setup Order",
                    stepNumber: 0,
                    searchText: "overview order sequence steps school year container",
                    body: (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-foreground">Think of the <strong>school year as the operational container for everything else.</strong></p>
                        <p className="text-xs text-muted-foreground">Follow this sequence to set up a new school and school year:</p>
                        <div className="space-y-1.5 mt-3 text-xs bg-muted/50 rounded-lg p-3">
                          <div>1. School Profile</div>
                          <div>2. School Year</div>
                          <div>3. Academic Terms</div>
                          <div>4. Class Levels</div>
                          <div>5. Teachers</div>
                          <div>6. Classes</div>
                          <div>7. Fee Types</div>
                          <div>8. Tuition Rates</div>
                          <div>9. Student ID Format</div>
                          <div>10. Students (Enrollment)</div>
                          <div>11. Class Placement</div>
                          <div>12. Parent Invites</div>
                          <div>13. Daily Operations</div>
                        </div>
                        <Note><strong>Why this order?</strong> Each step builds on the previous ones. You can't create classes without a school year, and you can't enroll students without classes.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-1",
                    icon: Lock,
                    title: "Step 1: Confirm School Profile",
                    stepNumber: 1,
                    searchText: "school profile name branch address logo contact details branding",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Make sure the school's basic information is correct. This makes the system feel branded for the school.</p>
                        <div className="space-y-2 mt-2">
                          <p className="text-xs font-semibold">Verify or update:</p>
                          <ul className="text-xs space-y-1 ml-2 text-muted-foreground">
                            <li>• School name</li>
                            <li>• Branch location</li>
                            <li>• Address</li>
                            <li>• Logo and branding colors</li>
                            <li>• Contact phone number and email</li>
                          </ul>
                        </div>
                        <Note>Go to <strong>Settings → School Information</strong> to edit these details.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-2",
                    icon: Calendar,
                    title: "Step 2: Set Up School Year",
                    stepNumber: 2,
                    searchText: "school year active create start end dates operational container",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">A school year is the operational container for everything else — enrollment, classes, attendance, billing, and dashboards all operate within one school year.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Settings → School Years</strong></>} />
                          <Step n={2} text={<>Click <strong>Add School Year</strong></>} />
                          <Step n={3} text={<>Enter the year name (e.g., <strong>SY 2025–2026</strong>)</>} />
                          <Step n={4} text={<>Set the <strong>start and end dates</strong></>} />
                          <Step n={5} text={<>Check <strong>Mark as Active</strong> — only one year can be active at a time</>} />
                          <Step n={6} text="Save" />
                        </div>
                        <Note><strong>Critical:</strong> A new school year starts empty intentionally. Students do NOT automatically carry over — they must be <strong>enrolled</strong> into the new year.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-3",
                    icon: GraduationCap,
                    title: "Step 3: Add Academic Terms / Periods",
                    stepNumber: 3,
                    searchText: "academic period term semester regular term summer organize operations reporting",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Terms help organize operations and reporting. Examples: Regular Term, Semester, Summer Program.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Settings → Academic Periods</strong></>} />
                          <Step n={2} text={<>Click <strong>Add Period</strong></>} />
                          <Step n={3} text={<>Name it (e.g., <strong>Regular Term, Summer, Semester 1</strong>)</>} />
                          <Step n={4} text={<>Set the <strong>start and end dates</strong></>} />
                          <Step n={5} text="Save" />
                        </div>
                        <Note>Academic periods are used for billing (tuition rates per term) and organizing the calendar.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-4",
                    icon: Users,
                    title: "Step 4: Set Up Class Levels",
                    stepNumber: 4,
                    searchText: "class level age group toddler nursery kinder grade level backend grouping",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Levels are backend groupings that help organize students and billing. Do NOT confuse with Classes, which are actual sections.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Settings → Class Levels</strong></>} />
                          <Step n={2} text={<>Click <strong>Add Level</strong></>} />
                          <Step n={3} text={<>Enter level names like: <strong>Toddler, Nursery, Kinder, Grade 1, Grade 2, etc.</strong></>} />
                          <Step n={4} text="Save" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2"><strong>Difference:</strong></p>
                        <ul className="text-xs space-y-0.5 ml-2 text-muted-foreground">
                          <li>• <strong>Level:</strong> Age grouping (backend — for reports, billing rates)</li>
                          <li>• <strong>Class:</strong> Actual section (e.g., Kinder A, Kinder B, Toddler AM, Toddler PM)</li>
                        </ul>
                      </div>
                    ),
                  },
                  {
                    id: "step-5",
                    icon: Users,
                    title: "Step 5: Add Teachers",
                    stepNumber: 5,
                    searchText: "teacher staff add create account role user",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Teachers should exist before assigning them to classes. You can set up teacher accounts manually or have them sign up.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Settings → Teachers</strong></>} />
                          <Step n={2} text={<>Click <strong>Add Teacher</strong></>} />
                          <Step n={3} text={<>Enter their <strong>name</strong> and <strong>email</strong></>} />
                          <Step n={4} text="Save" />
                        </div>
                        <Note>Teachers must have the <strong>Teacher</strong> role and be assigned to your school in the system.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-6",
                    icon: BookOpen,
                    title: "Step 6: Create Classes",
                    stepNumber: 6,
                    searchText: "class create add classroom section time schedule teacher assign",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Classes are actual sections that belong to the active school year. Examples: Toddler A, Kinder PM, Grade 1-A.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Classes</strong> (main sidebar)</>} />
                          <Step n={2} text={<>Click <strong>Add Class</strong></>} />
                          <Step n={3} text={<>Enter <strong>class name</strong> (unique for the school year)</>} />
                          <Step n={4} text={<>Select <strong>level / age group</strong></>} />
                          <Step n={5} text={<>Set <strong>start and end times</strong></>} />
                          <Step n={6} text={<>Set <strong>capacity</strong> (max students)</>} />
                          <Step n={7} text={<>Assign a <strong>teacher</strong></>} />
                          <Step n={8} text="Save" />
                        </div>
                        <Tip>At the start of each new school year, create fresh classes for that year rather than reusing old ones. Old classes are kept for historical reference.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "step-7",
                    icon: Briefcase,
                    title: "Step 7: Configure Fee Types",
                    stepNumber: 7,
                    searchText: "fee type billing tuition enrollment fee books miscellaneous charge",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Fee types define what you can bill for. Common types: Tuition, Enrollment Fee, Books, Miscellaneous.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Billing (under Finance in the sidebar) → Setup tab → Fee Types sub-tab</strong></>} />
                          <Step n={2} text={<>Click <strong>Add Fee Type</strong></>} />
                          <Step n={3} text={<>Enter the <strong>fee name</strong> (e.g., Tuition, Enrollment Fee, Books)</>} />
                          <Step n={4} text={<>Enter a <strong>description</strong> (optional)</>} />
                          <Step n={5} text="Save" />
                        </div>
                        <Note>Fee types are used when generating billing records. You'll reference them later to set tuition rates per term and level.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-8",
                    icon: DollarSign,
                    title: "Step 8: Set Up Tuition Rates",
                    stepNumber: 8,
                    searchText: "tuition rates billing per term level per academic period class",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Define how much to charge per student for each term and class level. Tuition rates drive automatic billing when you generate invoices.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Billing (under Finance in the sidebar) → Setup tab → Tuition Rates sub-tab</strong></>} />
                          <Step n={2} text={<>Select an <strong>academic term</strong> (e.g., Regular Term)</>} />
                          <Step n={3} text={<>For each <strong>class level</strong>, enter the <strong>monthly tuition amount</strong></>} />
                          <Step n={4} text="Save" />
                        </div>
                        <Note>You must configure tuition rates before generating billing. If you add new terms later, come back here to set rates for the new terms.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-9",
                    icon: Settings,
                    title: "Step 9: Configure Student ID Format",
                    stepNumber: 9,
                    searchText: "student id code format prefix padding year include auto generate identify",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Define how student codes are auto-generated when you add new students. Set your prefix and format before enrolling students so the system generates codes correctly.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Settings → Student IDs</strong></>} />
                          <Step n={2} text={<>Enter the <strong>prefix</strong> (e.g., <strong>LL, BK, ABC</strong>) — this starts all student codes</>} />
                          <Step n={3} text={<>Set the <strong>padding</strong> (number of digits, e.g., 4 means <strong>0001, 0002, etc.</strong>)</>} />
                          <Step n={4} text={<>Optionally check <strong>Include school year</strong> to append the year (e.g., <strong>LL-26-0001</strong> for 2026)</>} />
                          <Step n={5} text="Save" />
                        </div>
                        <Note><strong>Do this before enrolling students.</strong> The format applies only to new students added after the change. Existing student codes are not retroactively updated.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-10",
                    icon: Users,
                    title: "Step 10: Enroll Students",
                    stepNumber: 10,
                    searchText: "student enrollment add new returning enrollment page level enrollment status",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Students require two steps: first create the student profile, then enroll them in the active school year. Students may exist in the system but are not active for a year until enrolled.</p>
                        <div className="space-y-2 mt-2">
                          <p className="text-xs font-semibold"><strong>Create the student profile:</strong></p>
                          <div className="ml-2 space-y-1">
                            <Step n={1} text={<>Go to <strong>Students</strong></>} />
                            <Step n={2} text={<>Click <strong>+ Add Student Profile</strong> (profile only, no enrollment yet)</>} />
                            <Step n={3} text={<>Fill in <strong>name, DOB, level, and other details</strong></>} />
                            <Step n={4} text="Save" />
                          </div>
                          <p className="text-xs font-semibold mt-3"><strong>Enroll in the school year:</strong></p>
                          <div className="ml-2 space-y-1">
                            <Step n={1} text={<>Go to <strong>Enrollment</strong> page</>} />
                            <Step n={2} text={<>Click <strong>+ Enroll Student</strong></>} />
                            <Step n={3} text={<>Select the <strong>student</strong> and confirm their <strong>level</strong></>} />
                            <Step n={4} text="Save" />
                          </div>
                        </div>
                        <Note><strong>Critical:</strong> Students in the system may have zero enrollment records — they only appear on dashboards and in billing when explicitly enrolled for a school year.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-11",
                    icon: GraduationCap,
                    title: "Step 11: Place Students Into Classes",
                    stepNumber: 11,
                    searchText: "class placement student class assignment section enroll enrollment",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Distinguish between enrollment (into the year) and class placement (into a specific section).</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Classes</strong></>} />
                          <Step n={2} text={<>Click a <strong>class card</strong></>} />
                          <Step n={3} text={<>Click <strong>Add Student</strong></>} />
                          <Step n={4} text="Search and select students to add to that class" />
                          <Step n={5} text="Save" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2"><strong>The difference:</strong></p>
                        <ul className="text-xs space-y-0.5 ml-2 text-muted-foreground">
                          <li>• <strong>Enrollment:</strong> Student is active in this school year</li>
                          <li>• <strong>Class Placement:</strong> Student attends this specific section (e.g., Kinder A vs Kinder B)</li>
                        </ul>
                      </div>
                    ),
                  },
                  {
                    id: "step-12",
                    icon: Mail,
                    title: "Step 12: Invite Parents",
                    stepNumber: 12,
                    searchText: "parent invite guardian portal access invite link email",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Parents access the portal to view attendance, progress, billing, events, and updates.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<>Go to <strong>Students</strong></>} />
                          <Step n={2} text={<>Click a <strong>student row</strong> to open details</>} />
                          <Step n={3} text={<>Under <strong>Guardians</strong>, click <strong>Add Guardian</strong></>} />
                          <Step n={4} text={<>Enter the <strong>parent's name and email</strong></>} />
                          <Step n={5} text={<>Check <strong>Send invite</strong> to email the portal link</>} />
                          <Step n={6} text="Save" />
                        </div>
                        <Note>Parents receive an invite link where they can set their own password and access their child's dashboard.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "step-13",
                    icon: CheckCircle2,
                    title: "Step 13: Daily Operations",
                    stepNumber: 13,
                    searchText: "daily operations attendance billing updates events documents dashboard",
                    body: (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Once setup is complete, the dashboard becomes your operational hub. Regular workflows include:</p>
                        <ul className="text-xs space-y-1 ml-2 text-muted-foreground mt-2">
                          <li>• <strong>Attendance:</strong> Mark student presence daily</li>
                          <li>• <strong>Parent Updates:</strong> Send class announcements and photos</li>
                          <li>• <strong>Billing:</strong> Generate and track payment records</li>
                          <li>• <strong>Events:</strong> Create and manage school events</li>
                          <li>• <strong>Documents:</strong> Share IEPs, reports, and medical certificates</li>
                          <li>• <strong>Progress:</strong> Record student observations</li>
                        </ul>
                        <Note><strong>Dashboard:</strong> Returns to this page after daily work. It shows what needs attention today.</Note>
                      </div>
                    ),
                  },
                ];

                const q = helpSearch.trim().toLowerCase();
                const filtered = q
                  ? topics.filter((t) =>
                      t.title.toLowerCase().includes(q) ||
                      t.searchText.toLowerCase().includes(q)
                    )
                  : topics;

                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                      <p className="text-sm">No steps match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                      <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                    </div>
                  );
                }

                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          {item.stepNumber > 0 ? (
                            <span className="text-xs font-bold text-muted-foreground">{item.stepNumber}</span>
                          ) : (
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {open
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                          {item.body}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
