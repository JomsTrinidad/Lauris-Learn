"use client";
import { useEffect, useState } from "react";
import {
  Users, UserCheck, AlertCircle, Calendar, CheckSquare, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, Bell, HelpCircle, Search, X,
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
import { useDashboardStats, useFinancialWatchlist, useAttendanceSignals, usePlanSignals } from "@/lib/hooks";
import { GetStartedGuide } from "@/components/GetStartedGuide";
import { useGetStartedDisplay } from "@/lib/hooks/useGetStartedDisplay";
import { useIepAttentionItems } from "@/features/attention/useAttentionItems";
import type { AttentionItem } from "@/features/attention/types";
import TeacherDashboard from "./TeacherDashboard";

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
  const { userRole } = useSchoolContext();
  // Teachers get a focused day-of-work view. Admin/super-admin keep the full dashboard.
  if (userRole === "teacher") {
    return <TeacherDashboard />;
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { schoolId, activeYear, userRole, userId, iepWorkflowMode } = useSchoolContext();
  const supabase = createClient();
  const { day, date } = useTodayLabel();

  // Use the cached dashboard stats hook
  const statsQuery = useDashboardStats(
    schoolId,
    activeYear?.id || null,
    activeYear?.startDate || null,
    activeYear?.endDate || null,
  );

  // Financial watchlist — operational attention system (replaces flat billingSummary).
  // No year filter — matches the billing page's all-time school scope so prior-year
  // overdue records surface here exactly as they do on the billing page.
  const watchlist = useFinancialWatchlist(schoolId);

  // Plan signals — aggregate draft + awaiting-review counts for Student Support card
  const planSignals = usePlanSignals(schoolId, userRole);

  // IEP attention items — role-gated, fetched once on mount
  const { items: iepItems } = useIepAttentionItems({
    schoolId,
    userId,
    userRole,
    workflowMode: iepWorkflowMode ?? "simple_review",
  });

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
  const [updatesLoaded, setUpdatesLoaded] = useState(false);
  const [todayHolidayName, setTodayHolidayName] = useState<string | null>(null);

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

      // Check if today is a no-class holiday (used to suppress attendance nags)
      if (schoolId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: hDay } = await (supabase as any).from("holidays").select("name").eq("school_id", schoolId).eq("date", today).eq("is_no_class", true).maybeSingle();
        setTodayHolidayName((hDay as { name: string } | null)?.name ?? null);
      }
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const yearId = activeYear?.id ?? null;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch attendance data (billing data comes from useFinancialWatchlist hook)
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

      setStats({
        presentToday: presentToday ?? 0,
        absentToday: absentToday ?? 0,
        outstandingBalance: 0,
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
      setUpdatesLoaded(true);
    } catch (err) {
      console.error("[Dashboard] Failed to fetch complex data:", err);
      setComplexDataError("Failed to load dashboard data. Check your connection and try again.");
    }
  }

  // Pre-compute before early return so hook call order is stable (React rule)
  const isClassMarked = (cls: TodayClass) =>
    cls.totalEnrolled === 0 || (totalAttByClass[cls.id] ?? 0) > 0;
  const allClassesMarked = todayClasses.length > 0 && todayClasses.every(isClassMarked);
  const todayClassIds = todayClasses.map((c) => c.id);
  const todayEnrolledByClass = Object.fromEntries(todayClasses.map((c) => [c.id, c.totalEnrolled]));
  const classNamesById = Object.fromEntries(todayClasses.map((c) => [c.id, c.name]));

  const attendanceSignals = useAttendanceSignals({
    schoolId,
    todayClassIds,
    todayEnrolledByClass,
    classNamesById,
    enabled: allClassesMarked,
  });

  if (statsQuery.isLoading) return <PageSpinner />;

  // ── Derived ────────────────────────────────────────────────────────────────

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

  const todayIsWeekend = (() => { const d = new Date().getDay(); return d === 0 || d === 6; })();
  const todayIsNoClass = todayIsWeekend || !!todayHolidayName;

  const todayStr = new Date().toISOString().split("T")[0];
  const noUpdatesToday = !lastUpdateAt || lastUpdateAt.split("T")[0] < todayStr;
  const noUpdatesRecently =
    !lastUpdateAt || Date.now() - new Date(lastUpdateAt).getTime() > 2 * 24 * 60 * 60 * 1000;

  // ── Needs Attention ────────────────────────────────────────────────────────

  const computedItems: AttentionItem[] = [];

  if (!todayIsNoClass && unmarkedClasses.length > 0) {
    computedItems.push({
      id: "unmarked_att",
      category: "needs_input",
      title: `${unmarkedClasses.length} class${unmarkedClasses.length > 1 ? "es" : ""} haven't marked attendance today`,
      action_href: "/attendance",
      action_label: "Mark Attendance",
      priority: "medium",
    });
  }

  if (!watchlist.isLoading && (watchlist.data?.overdueCount ?? 0) > 0) {
    const n = watchlist.data!.overdueCount;
    computedItems.push({
      id: "overdue_billing",
      category: "needs_review",
      title: `${n} overdue billing record${n > 1 ? "s" : ""} need follow-up`,
      action_href: "/billing",
      action_label: "View Billing",
      priority: "high",
    });
  }

  if ((statsQuery.data?.inquiryCount ?? 0) > 0) {
    computedItems.push({
      id: "pending_inquiries",
      category: "needs_review",
      title: `${statsQuery.data!.inquiryCount} new enrolment inquir${statsQuery.data!.inquiryCount > 1 ? "ies" : "y"} pending review`,
      action_href: "/enrollment",
      action_label: "Review",
      priority: "medium",
    });
  }

  if (!todayIsNoClass && updatesLoaded && noUpdatesRecently && todayClasses.length > 0) {
    computedItems.push({
      id: "no_updates",
      category: "needs_input",
      title: noUpdatesToday ? "No parent update sent today" : "No parent updates in over 2 days",
      action_href: "/updates",
      action_label: "Send Update",
      priority: "low",
    });
  }

  const allAttention = [...iepItems, ...computedItems];

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
          <h1 className="text-[var(--theme-accent)]">Dashboard</h1>
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
            <p className="text-base font-semibold text-[var(--theme-accent)]">{day}</p>
            <p className="text-sm text-[var(--theme-accent)] opacity-70">{date}</p>
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
      {allAttention.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-900">Needs Attention</p>
            </div>
            <div className="space-y-2">
              {allAttention.map((item) => {
                const isHigh = item.priority === "high";
                const rowBg = isHigh
                  ? "bg-red-50 border-red-200"
                  : item.category === "needs_review"
                  ? "bg-blue-50 border-blue-200"
                  : item.category === "needs_input"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-muted border-border";
                const iconColor = isHigh
                  ? "text-red-500"
                  : item.category === "needs_review"
                  ? "text-blue-500"
                  : item.category === "needs_input"
                  ? "text-amber-500"
                  : "text-muted-foreground";
                const btnColor = isHigh
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : item.category === "needs_review"
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200";
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${rowBg}`}
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                        )}
                        {item.detail && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{item.detail}</p>
                        )}
                      </div>
                    </div>
                    <Link
                      href={item.action_href}
                      className={`ml-3 shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors ${btnColor}`}
                    >
                      {item.action_label}
                    </Link>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : activeYear && !watchlist.isLoading ? (
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
                  <p className="text-xs text-muted-foreground mt-1">Enrolled this year</p>
                </div>
                <div className="bg-primary p-2 rounded-lg text-primary-foreground shrink-0">
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
                  {todayIsWeekend ? (
                    <>
                      <p className="text-2xl font-bold mt-1">—</p>
                      <p className="text-xs text-muted-foreground mt-1">Weekend</p>
                    </>
                  ) : todayHolidayName ? (
                    <>
                      <p className="text-2xl font-bold mt-1">—</p>
                      <p className="text-xs text-muted-foreground mt-1">{todayHolidayName} — no class</p>
                    </>
                  ) : todayClasses.length === 0 ? (
                    <>
                      <p className="text-2xl font-bold mt-1">—</p>
                      <p className="text-xs text-muted-foreground mt-1">No classes today</p>
                    </>
                  ) : unmarkedClasses.length > 0 ? (
                    <>
                      <p className="text-2xl font-bold mt-1">{unmarkedClasses.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {unmarkedClasses.length === 1 ? "class" : "classes"} not yet marked
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold mt-1">{presentPercent}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stats?.presentToday ?? 0}/{totalEnrolled} present
                      </p>
                    </>
                  )}
                </div>
                <div className="bg-primary p-2 rounded-lg text-primary-foreground shrink-0">
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
                  <p className="text-2xl font-bold mt-1">{formatCurrency(watchlist.data?.totalOutstanding ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {watchlist.isLoading
                      ? "Loading…"
                      : `${(watchlist.data?.collectionRate ?? 0).toFixed(0)}% collected`}
                  </p>
                </div>
                <div className="bg-primary p-2 rounded-lg text-primary-foreground shrink-0">
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {(statsQuery.data?.upcomingEvents ?? 0) === 0 ? "None scheduled" : "Next 30 days"}
                  </p>
                </div>
                <div className="bg-primary p-2 rounded-lg text-primary-foreground shrink-0">
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
              <h2 className="text-base font-semibold text-[var(--theme-accent)]">Classes Requiring Action</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todayIsWeekend
                  ? "Today is a weekend — attendance not expected"
                  : todayHolidayName
                  ? `${todayHolidayName} today — no class scheduled`
                  : "Mark attendance as classes meet"}
              </p>
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
                {!attendanceSignals.isLoading && (attendanceSignals.data ?? []).length > 0 && (
                  <div className="border-t border-border pt-4 text-left space-y-2">
                    {(attendanceSignals.data ?? []).map((signal) => (
                      <div key={signal.id} className="flex items-start gap-2.5">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                          signal.severity === "risk"
                            ? "bg-amber-500"
                            : signal.severity === "positive"
                            ? "bg-green-500"
                            : "bg-muted-foreground/30"
                        }`} />
                        <p className={`text-xs leading-relaxed ${
                          signal.severity === "risk"
                            ? "text-amber-700"
                            : signal.severity === "positive"
                            ? "text-green-700"
                            : "text-muted-foreground"
                        }`}>{signal.text}</p>
                      </div>
                    ))}
                  </div>
                )}
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-medium hover:bg-primary/15 transition-colors"
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
              <h2 className="text-base font-semibold text-[var(--theme-accent)]">Parent Communication</h2>
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
          <CardContent className="p-0">
            {noUpdatesRecently && !recentUpdates.length && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs border-b border-amber-200 bg-amber-50/60 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {noUpdatesToday ? "No updates sent today" : "No updates in the last 2 days"}
              </div>
            )}
            {recentUpdates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No updates yet</p>
                <p className="text-xs text-muted-foreground mt-1">Keep parents in the loop by sending class updates</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentUpdates.map((u) => (
                  <div key={u.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-none">{u.authorName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{u.className ?? "School-wide"}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{timeAgo(u.createdAt)}</span>
                    </div>
                    <p className="text-xs line-clamp-2 text-foreground/80">{u.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Watchlist — operational attention system */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-[var(--theme-accent)]">Financial Watchlist</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Accounts requiring attention</p>
            </div>
            <Link
              href="/billing"
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              Billing <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>

          {/* Loading skeleton */}
          {watchlist.isLoading && (
            <CardContent className="p-4 space-y-3">
              <div className="h-20 bg-muted/40 rounded-lg animate-pulse" />
              <div className="h-14 bg-muted/30 rounded-lg animate-pulse" />
              <div className="h-10 bg-muted/20 rounded-lg animate-pulse" />
            </CardContent>
          )}

          {/* True all-clear: no urgent items AND no outstanding balance */}
          {!watchlist.isLoading &&
            (watchlist.data?.overdueCount ?? 0) === 0 &&
            (watchlist.data?.dueSoonCount ?? 0) === 0 &&
            (watchlist.data?.repeatedLateCount ?? 0) === 0 &&
            (watchlist.data?.totalOutstanding ?? 0) === 0 && (
              <>
                <CardContent className="px-4 py-4">
                  <div className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">All accounts are in good standing</p>
                  </div>
                </CardContent>
                <div className="px-4 py-3.5 border-t border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding balance</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(watchlist.data?.totalOutstanding ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Collection rate</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {(watchlist.data?.collectionRate ?? 0).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

          {/* Neutral state: no urgent items but balances remain */}
          {!watchlist.isLoading &&
            (watchlist.data?.overdueCount ?? 0) === 0 &&
            (watchlist.data?.dueSoonCount ?? 0) === 0 &&
            (watchlist.data?.repeatedLateCount ?? 0) === 0 &&
            (watchlist.data?.totalOutstanding ?? 0) > 0 && (
              <>
                <CardContent className="px-4 py-4">
                  <div className="flex items-center gap-2.5 p-3 bg-muted/40 border border-border rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground font-medium">Balances remain, but no accounts need urgent follow-up</p>
                  </div>
                </CardContent>
                <div className="px-4 py-3.5 border-t border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding balance</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(watchlist.data?.totalOutstanding ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Collection rate</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {(watchlist.data?.collectionRate ?? 0).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

          {/* Operational watchlist — shown when there are items requiring attention */}
          {!watchlist.isLoading &&
            ((watchlist.data?.overdueCount ?? 0) > 0 ||
              (watchlist.data?.dueSoonCount ?? 0) > 0 ||
              (watchlist.data?.repeatedLateCount ?? 0) > 0) && (
              <>
                <div className="divide-y divide-border">

                  {/* ── OVERDUE ───────────────────────────────────────────── */}
                  {(watchlist.data?.overdueCount ?? 0) > 0 && (
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">
                          Overdue
                        </span>
                      </div>

                      {/* Amount is the primary operational signal */}
                      <p className="text-xl font-bold text-foreground leading-none">
                        {formatCurrency(watchlist.data!.overdueAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {watchlist.data!.overdueStudentCount}{" "}
                        {watchlist.data!.overdueStudentCount === 1 ? "account" : "accounts"} overdue
                        {watchlist.data!.overdueCount > watchlist.data!.overdueStudentCount && (
                          <> · {watchlist.data!.overdueCount} bills</>
                        )}
                      </p>

                      {watchlist.data!.overdueOver30Count > 0 && (
                        <p className="text-xs text-red-600 mt-1.5">
                          {watchlist.data!.overdueOver30Count}{" "}
                          {watchlist.data!.overdueOver30Count === 1 ? "account" : "accounts"} past 30 days
                        </p>
                      )}

                      <Link
                        href="/billing?filter=overdue"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                      >
                        Review overdue accounts <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}

                  {/* ── DUE THIS WEEK ─────────────────────────────────────── */}
                  {(watchlist.data?.dueSoonCount ?? 0) > 0 && (
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
                          Due This Week
                        </span>
                      </div>

                      <p className="text-xl font-bold text-foreground leading-none">
                        {formatCurrency(watchlist.data!.dueSoonAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {watchlist.data!.dueSoonStudentCount}{" "}
                        {watchlist.data!.dueSoonStudentCount === 1 ? "family" : "families"} due in the next 7 days
                        {watchlist.data!.dueSoonCount > watchlist.data!.dueSoonStudentCount && (
                          <> · {watchlist.data!.dueSoonCount} bills</>
                        )}
                      </p>

                      <Link
                        href="/billing?filter=due_soon"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                      >
                        Review upcoming bills <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}

                  {/* ── AT RISK: Repeated late payers ─────────────────────── */}
                  {(watchlist.data?.repeatedLateCount ?? 0) > 0 && (
                    <div className="px-4 py-3">
                      <Link
                        href="/billing?filter=overdue"
                        className="flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {watchlist.data!.repeatedLateCount} repeated late{" "}
                              {watchlist.data!.repeatedLateCount === 1 ? "payer" : "payers"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              2+ overdue bills — worth a check-in
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* ── SNAPSHOT: Accounting summary footer ─────────────────── */}
                {/* Sits outside divide-y so it reads as a distinct footer tier */}
                <div className="px-4 py-3.5 border-t border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding balance</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {formatCurrency(watchlist.data?.totalOutstanding ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Collection rate</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {(watchlist.data?.collectionRate ?? 0).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  {(watchlist.data?.familiesWithBalances ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {watchlist.data!.familiesWithBalances}{" "}
                      {watchlist.data!.familiesWithBalances === 1 ? "family" : "families"} with outstanding balances
                    </p>
                  )}
                </div>
              </>
            )}
        </Card>

        {/* Student & Enrollment Section */}
        {showEnrollmentSnapshot ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-[var(--theme-accent)]">Enrollment Status</h2>
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
                <h2 className="text-base font-semibold text-[var(--theme-accent)]">Student Support</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Attendance, enrollment & support signals</p>
              </div>
              <Link
                href="/students"
                className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {studentAlerts.length === 0 &&
              newEnrollmentsThisWeek === 0 &&
              studentsAbsent2Plus === 0 &&
              (planSignals.data?.draftCount ?? 0) === 0 &&
              (planSignals.data?.awaitingReviewCount ?? 0) === 0 ? (
                <div className="px-4 py-6 text-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">All students accounted for</p>
                  <p className="text-xs text-muted-foreground mt-1">No attendance, enrollment, or support flags this week</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {/* New enrollments — positive operational signal, neutral treatment */}
                  {newEnrollmentsThisWeek > 0 && (
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">New enrollments this week</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Newly enrolled students</p>
                        </div>
                      </div>
                      <span className="text-base font-semibold ml-3 shrink-0">{newEnrollmentsThisWeek}</span>
                    </div>
                  )}

                  {/* High absences — concern signal with amber count, hover to navigate */}
                  {studentsAbsent2Plus > 0 && (
                    <Link href="/attendance" className="block">
                      <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">High absences</p>
                            <p className="text-xs text-muted-foreground mt-0.5">2+ days this week</p>
                          </div>
                        </div>
                        <span className="text-base font-semibold text-amber-600 ml-3 shrink-0">{studentsAbsent2Plus}</span>
                      </div>
                    </Link>
                  )}

                  {/* Other student alerts */}
                  {studentAlerts.map((alert) => (
                    <Link key={alert.type} href={alert.href} className="block">
                      <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{alert.label}</p>
                            {alert.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-base font-semibold text-amber-600 ml-3 shrink-0">{alert.count}</span>
                      </div>
                    </Link>
                  ))}

                  {/* IEP drafts in preparation — calm planning signal */}
                  {(planSignals.data?.draftCount ?? 0) > 0 && (
                    <Link href="/documents?view=plans-forms" className="block">
                      <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {planSignals.data!.draftCount === 1
                                ? "IEP draft in preparation"
                                : `${planSignals.data!.draftCount} IEP drafts in preparation`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">Teacher planning in progress</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )}

                  {/* Support plans awaiting review — coordination signal */}
                  {(planSignals.data?.awaitingReviewCount ?? 0) > 0 && (
                    <Link href="/documents?view=plans-forms" className="block">
                      <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {planSignals.data!.awaitingReviewCount === 1
                                ? "Support plan awaiting review"
                                : `${planSignals.data!.awaitingReviewCount} support plans awaiting review`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">Coordination or review needed</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
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
