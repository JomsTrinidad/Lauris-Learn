"use client";
import { useEffect, useState } from "react";
import {
  Users, UserCheck, AlertCircle, Calendar, CheckSquare, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, Bell, HelpCircle, Search, X,
  Settings, BookOpen, FileText,
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
import { GetStartedGuide } from "@/components/GetStartedGuide";
import { useGetStartedDisplay } from "@/lib/hooks/useGetStartedDisplay";
import { usePendingReviewCount } from "@/features/plans/review-queue";

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
  const { schoolId, activeYear, userRole, userId } = useSchoolContext();
  const supabase = createClient();
  const { day, date } = useTodayLabel();

  // Use the cached dashboard stats hook
  const statsQuery = useDashboardStats(schoolId, activeYear?.id || null);

  // Use the cached billing summary hook (Batch B1.6.1)
  const billingSummaryQuery = useBillingSummary(schoolId, activeYear?.id || null);

  // Pending IEP review count — school_admin only
  const { count: pendingIepCount } = usePendingReviewCount(
    userRole === "school_admin" ? schoolId : null,
  );

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

  // Profile created at for Getting Started 2-month window
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);

  // Getting Started guide (school admin only)
  const gettingStarted = useGetStartedDisplay(profileCreatedAt);

  // Getting Started guide open state (super admin)
  const [superGuideOpen, setSuperGuideOpen] = useState(false);

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

  // Fetch profile created_at for Getting Started 2-month window
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", userId)
        .single();
      if (data?.created_at) {
        setProfileCreatedAt(data.created_at);
      }
    })();
  }, [userId, supabase]);

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

  if (pendingIepCount > 0) {
    attention.push({
      id: "pending_iep_review",
      label: `${pendingIepCount} IEP plan${pendingIepCount > 1 ? "s" : ""} waiting for admin review`,
      href: "/documents",
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
          {gettingStarted.shouldShowOnDashboard && userRole === "school_admin" && (
            <button
              onClick={() => gettingStarted.setOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors hidden sm:flex"
            >
              <BookOpen className="w-4 h-4" />
              Getting Started
            </button>
          )}
          {userRole === "super_admin" && (
            <button
              onClick={() => setSuperGuideOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <BookOpen className="w-4 h-4" />
              Getting Started
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
                  href="/attendance?view=summary"
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
                      className={`flex items-center justify-between px-6 py-4${marked ? " opacity-60" : ""}`}
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground border border-border rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors"
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

      {/* Getting Started Guide (school admin + super admin — single source of truth) */}
      <GetStartedGuide
        isOpen={userRole === "super_admin" ? superGuideOpen : gettingStarted.open}
        onClose={() => { setSuperGuideOpen(false); gettingStarted.setOpen(false); }}
        onDismiss={gettingStarted.dismiss}
        showDismissOption={userRole === "school_admin" && gettingStarted.shouldShowOnDashboard}
        dismissHint="You can always access Getting Started from the Settings page if you need it again."
      />
    </div>
    </ErrorBoundary>
  );
}
