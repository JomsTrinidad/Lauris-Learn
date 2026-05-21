"use client";
import { useEffect, useState } from "react";
import {
  UserCheck,
  Calendar,
  CheckSquare,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  School,
  ListChecks,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { usePlanSignals } from "@/lib/hooks";

interface TodayClass {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  presentCount: number;
  totalEnrolled: number;
  totalMarked: number;
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

function useTodayLabel() {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { day, date };
}

function getClassTimeStatus(
  startTime: string,
  endTime: string,
): "upcoming" | "in_progress" | "completed" {
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

export default function TeacherDashboard() {
  const { schoolId, activeYear, userId, userName, userRole } = useSchoolContext();
  const supabase = createClient();
  const { day, date } = useTodayLabel();

  // Plan signals — already RLS-scoped so teachers see only their students' plans.
  const planSignals = usePlanSignals(schoolId, userRole);

  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [todayHolidayName, setTodayHolidayName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0);
  const [upcomingEventsSoon, setUpcomingEventsSoon] = useState<
    Array<{ id: string; title: string; eventDate: string }>
  >([]);

  useEffect(() => {
    if (!schoolId || !userId) return;
    fetchTeacherData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, userId, activeYear?.id]);

  async function fetchTeacherData() {
    try {
      setLoadError(null);
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // ── Batch A: 4 independent queries fire in parallel ──────────────────
      // Previously these were sequential awaits costing 4 round-trips.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sbAny = supabase as any;
      const [
        eventsCountRes,
        soonEventsRes,
        holidayRes,
        teacherProfileRes,
      ] = await Promise.all([
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .gte("event_date", today)
          .lte("event_date", in30Days),
        supabase
          .from("events")
          .select("id, title, event_date")
          .eq("school_id", schoolId)
          .gte("event_date", today)
          .lte("event_date", in7Days)
          .order("event_date")
          .limit(3),
        sbAny
          .from("holidays")
          .select("name")
          .eq("school_id", schoolId)
          .eq("date", today)
          .eq("is_no_class", true)
          .maybeSingle(),
        sbAny
          .from("teacher_profiles")
          .select("id")
          .eq("auth_user_id", userId)
          .eq("school_id", schoolId)
          .maybeSingle(),
      ]);

      setUpcomingEventsCount(eventsCountRes.count ?? 0);
      setUpcomingEventsSoon(
        ((soonEventsRes.data ?? []) as Array<{ id: string; title: string; event_date: string }>).map(
          (e) => ({ id: e.id, title: e.title, eventDate: e.event_date }),
        ),
      );
      setTodayHolidayName((holidayRes.data as { name: string } | null)?.name ?? null);

      const tpId = (teacherProfileRes.data as { id: string } | null)?.id ?? null;
      setTeacherProfileId(tpId);

      if (!tpId || !activeYear?.id) {
        setTodayClasses([]);
        setRecentUpdates([]);
        setLastUpdateAt(null);
        setLoading(false);
        return;
      }

      // ── Sequential: my class assignments → classes (these chain by id) ───
      const { data: ctRows } = await supabase
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_id", tpId);

      const myClassIds = (ctRows ?? []).map(
        (c: { class_id: string }) => c.class_id,
      );

      let classRows: Array<{
        id: string;
        name: string;
        start_time: string;
        end_time: string;
      }> = [];

      if (myClassIds.length > 0) {
        const { data } = await sbAny
          .from("classes")
          .select("id, name, start_time, end_time")
          .in("id", myClassIds)
          .eq("school_id", schoolId)
          .eq("school_year_id", activeYear.id)
          .eq("is_active", true)
          .eq("is_system", false)
          .order("start_time");
        classRows = (data ?? []) as typeof classRows;
      }

      const classIds = classRows.map((c) => c.id);

      // ── Batch B: 3 independent queries fire in parallel ──────────────────
      // attendance + enrollments + parent updates all depend on classIds only.
      const updatesBase = supabase
        .from("parent_updates")
        .select(
          "id, content, created_at, class:classes(name), author:profiles(full_name)",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(3);

      const [attRes, enrollRes, updateRes] = await Promise.all([
        classIds.length > 0
          ? supabase
              .from("attendance_records")
              .select("class_id, status")
              .in("class_id", classIds)
              .eq("date", today)
          : Promise.resolve({ data: [] as Array<{ class_id: string; status: string }> }),
        classIds.length > 0
          ? supabase
              .from("enrollments")
              .select("class_id")
              .in("class_id", classIds)
              .eq("status", "enrolled")
          : Promise.resolve({ data: [] as Array<{ class_id: string }> }),
        classIds.length > 0
          ? updatesBase.in("class_id", classIds)
          : updatesBase.eq("author_id", userId),
      ]);

      const attRows = attRes.data;
      const enrollRows = enrollRes.data;
      const updateRows = updateRes.data;

      const presentByClass: Record<string, number> = {};
      const markedByClass: Record<string, number> = {};
      ((attRows ?? []) as Array<{ class_id: string; status: string }>).forEach(
        (a) => {
          markedByClass[a.class_id] = (markedByClass[a.class_id] ?? 0) + 1;
          if (a.status === "present") {
            presentByClass[a.class_id] = (presentByClass[a.class_id] ?? 0) + 1;
          }
        },
      );

      const enrolledByClass: Record<string, number> = {};
      ((enrollRows ?? []) as Array<{ class_id: string }>).forEach((e) => {
        enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
      });

      setTodayClasses(
        classRows.map((c) => ({
          id: c.id,
          name: c.name,
          startTime: c.start_time,
          endTime: c.end_time,
          presentCount: presentByClass[c.id] ?? 0,
          totalEnrolled: enrolledByClass[c.id] ?? 0,
          totalMarked: markedByClass[c.id] ?? 0,
        })),
      );

      const updates = ((updateRows ?? []) as Array<{
        id: string;
        content: string;
        created_at: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        class: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        author: any;
      }>).map((u) => ({
        id: u.id,
        authorName: u.author?.full_name ?? "Teacher",
        className: u.class?.name ?? null,
        content: u.content,
        createdAt: u.created_at,
      }));
      setRecentUpdates(updates);
      setLastUpdateAt(updates[0]?.createdAt ?? null);
      setLoading(false);
    } catch (err) {
      console.error("[TeacherDashboard] Failed to load:", err);
      setLoadError("Failed to load dashboard data. Check your connection and try again.");
      setLoading(false);
    }
  }

  if (loading) return <PageSpinner />;

  const todayIsWeekend = (() => {
    const d = new Date().getDay();
    return d === 0 || d === 6;
  })();
  const todayIsNoClass = todayIsWeekend || !!todayHolidayName;

  const isClassMarked = (cls: TodayClass) =>
    cls.totalEnrolled === 0 || cls.totalMarked > 0;
  const allClassesMarked =
    todayClasses.length > 0 && todayClasses.every(isClassMarked);
  const unmarkedClasses = todayClasses.filter(
    (cls) => !isClassMarked(cls) && cls.totalEnrolled > 0,
  );
  const totalPresentAll = todayClasses.reduce(
    (sum, c) => sum + c.presentCount,
    0,
  );
  const totalEnrolledAll = todayClasses.reduce(
    (sum, c) => sum + c.totalEnrolled,
    0,
  );
  const presentPercent = totalEnrolledAll
    ? Math.round((totalPresentAll / totalEnrolledAll) * 100)
    : 0;

  // ── Pending Teacher Tasks — derived from already-fetched teacher-scoped state ──
  type Task = {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    cta: string;
  };
  const tasks: Task[] = [];

  if (!todayIsNoClass && unmarkedClasses.length > 0) {
    tasks.push({
      id: "task_attendance",
      icon: CheckSquare,
      label:
        unmarkedClasses.length === 1
          ? `Attendance not taken for ${unmarkedClasses[0].name}`
          : `Attendance not taken for ${unmarkedClasses.length} of your classes`,
      href:
        unmarkedClasses.length === 1
          ? `/attendance?class=${unmarkedClasses[0].id}`
          : "/attendance",
      cta: "Take Attendance",
    });
  }

  // Phase 6A — Staff cognitive rhythm. The parent-communication cadence
  // nudge ("No parent update sent today" / "...in over 2 days") was removed
  // from the pending-task list. Framing the *absence* of an optional action
  // as an unresolved task — stacked at the same visual weight as genuinely
  // time-sensitive operational tasks — is the directive's "productivity
  // pressure" / "you missed X" anti-pattern (see docs/STAFF_COGNITIVE_RHYTHM.md
  // §8). Parent-communication cadence stays calmly visible in the dedicated
  // "Parent Communication" card below (which shows "Last update {timeAgo}" +
  // a "New Parent Update" CTA), so no capability is lost — only the pressure
  // framing. A pending-task list should contain genuinely pending, actionable
  // work, not optional-action cadence reminders.

  if ((planSignals.data?.awaitingReviewCount ?? 0) > 0) {
    const n = planSignals.data!.awaitingReviewCount;
    tasks.push({
      id: "task_plan_review",
      icon: BookOpen,
      label:
        n === 1
          ? "1 support plan awaiting your review"
          : `${n} support plans awaiting review`,
      href: "/documents?view=plans-forms",
      cta: "Review Support Plan",
    });
  }

  if ((planSignals.data?.draftCount ?? 0) > 0) {
    const n = planSignals.data!.draftCount;
    tasks.push({
      id: "task_plan_draft",
      icon: BookOpen,
      label: n === 1 ? "IEP draft in progress" : `${n} IEP drafts in progress`,
      href: "/documents?view=plans-forms",
      cta: "Continue Draft",
    });
  }

  upcomingEventsSoon.forEach((ev) => {
    const eventDateLabel = (() => {
      const d = new Date(ev.eventDate + "T00:00:00");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    })();
    tasks.push({
      id: `task_event_${ev.id}`,
      icon: Calendar,
      label: `${ev.title} — ${eventDateLabel}`,
      href: "/events",
      cta: "View Event",
    });
  });

  const groupedClasses = {
    in_progress: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "in_progress",
    ),
    upcoming: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "upcoming",
    ),
    completed: todayClasses.filter(
      (c) => getClassTimeStatus(c.startTime, c.endTime) === "completed",
    ),
  };

  const hasNoTeacherProfile = teacherProfileId === null;

  return (
    <ErrorBoundary section="dashboard" fallback="minimal">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-2">
          <div>
            <h1 className="text-[var(--theme-accent)]">My Day</h1>
            {!activeYear && (
              <div className="mt-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                No active school year set for this school.
              </div>
            )}
            <p className="text-muted-foreground mt-2 text-sm font-medium">
              {userName ? `Welcome back, ${userName.split(" ")[0]}.` : "Welcome back."}{" "}
              Here&apos;s a quick look at your day.
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-base font-semibold text-[var(--theme-accent)]">{day}</p>
            <p className="text-sm text-[var(--theme-accent)] opacity-70">{date}</p>
          </div>
        </div>

        {loadError && (
          <ErrorAlert message={loadError} onRetry={fetchTeacherData} />
        )}

        {hasNoTeacherProfile && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Your account isn&apos;t linked to a teacher profile yet
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Ask your school admin to link your email to a teacher profile in Settings → Teachers.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI cards (3): My Classes, Attendance, Upcoming Events */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link href="/classes?scope=my" className="h-full">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 h-full">
                <div className="flex items-start justify-between gap-3 h-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      My Classes
                    </p>
                    <p className="text-2xl font-bold mt-1">{todayClasses.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalEnrolledAll} student{totalEnrolledAll === 1 ? "" : "s"} enrolled
                    </p>
                  </div>
                  <div className="bg-primary p-2 rounded-lg text-primary-foreground shrink-0">
                    <School className="w-4 h-4" />
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
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Attendance Today
                    </p>
                    {todayIsWeekend ? (
                      <>
                        <p className="text-2xl font-bold mt-1">—</p>
                        <p className="text-xs text-muted-foreground mt-1">Weekend</p>
                      </>
                    ) : todayHolidayName ? (
                      <>
                        <p className="text-2xl font-bold mt-1">—</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {todayHolidayName} — no class
                        </p>
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
                          {unmarkedClasses.length === 1 ? "class" : "classes"} not yet taken
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold mt-1">{presentPercent}%</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {totalPresentAll}/{totalEnrolledAll} present
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

          <Link href="/events" className="h-full">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 h-full">
                <div className="flex items-start justify-between gap-3 h-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Upcoming Events
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {upcomingEventsCount}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {upcomingEventsCount === 0
                        ? "None scheduled"
                        : "Next 30 days"}
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

        {/* Pending Teacher Tasks — derived from already-fetched teacher state */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-primary/10 bg-primary/5">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[var(--theme-accent)]" />
              <h2 className="text-base font-semibold text-[var(--theme-accent)]">
                Pending Teacher Tasks
              </h2>
            </div>
            {tasks.length > 0 && (
              <span className="text-xs font-medium text-primary shrink-0">
                {tasks.length} {tasks.length === 1 ? "item" : "items"}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">
                  No pending teacher tasks right now.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {todayIsWeekend
                    ? "Enjoy your weekend."
                    : todayHolidayName
                      ? `${todayHolidayName} — no class today.`
                      : "Check back later as the day progresses."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => {
                  const Icon = t.icon;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <p className="text-sm text-foreground truncate">{t.label}</p>
                      </div>
                      <Link
                        href={t.href}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                      >
                        {t.cta}
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Classes Requiring Action — teacher's classes only */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-[var(--theme-accent)]">
                  Classes Requiring Action
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {todayIsWeekend
                    ? "Today is a weekend — attendance not expected"
                    : todayHolidayName
                      ? `${todayHolidayName} today — no class scheduled`
                      : "Take attendance as your classes meet"}
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
              {todayIsNoClass ? (
                <div className="px-6 py-8 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {todayIsWeekend
                      ? "It's the weekend — enjoy the day off."
                      : `${todayHolidayName} — no class today.`}
                  </p>
                </div>
              ) : todayClasses.length === 0 ? (
                <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                  {hasNoTeacherProfile
                    ? "Your account isn't linked to any classes yet."
                    : "You aren't assigned to any classes for this school year."}
                </p>
              ) : allClassesMarked ? (
                <div className="px-6 py-8 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="bg-green-100 p-4 rounded-full">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-base">
                      All your classes are done today
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {todayClasses.length}{" "}
                      {todayClasses.length === 1 ? "class" : "classes"} &middot;{" "}
                      {totalPresentAll} present
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
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
                              {formatTime12(cls.startTime)} – {formatTime12(cls.endTime)}
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
                            <CheckSquare className="w-3.5 h-3.5" /> Take Attendance
                          </Link>
                        )}
                      </div>
                    );
                  })}

                  {groupedClasses.upcoming.map((cls) => {
                    const marked = isClassMarked(cls);
                    return (
                      <div
                        key={cls.id}
                        className="flex items-center justify-between px-6 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{cls.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Starts {formatTime12(cls.startTime)}
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
                            <CheckSquare className="w-3.5 h-3.5" /> Take Attendance
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

          {/* Parent Communication */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-[var(--theme-accent)]">
                  Parent Communication
                </h2>
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
                New Parent Update <ArrowRight className="w-3 h-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recentUpdates.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-muted-foreground">No parent updates yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentUpdates.map((u) => (
                    <div key={u.id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-none">
                            {u.authorName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {u.className ?? "School-wide"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {timeAgo(u.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2 text-foreground/80">{u.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Student Support — calm informational summary; urgency lives in Pending Teacher Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-[var(--theme-accent)]">
                Student Support
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Open plans for your students
              </p>
            </div>
            <Link
              href="/documents?view=plans-forms"
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              All Plans <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {(planSignals.data?.draftCount ?? 0) === 0 &&
            (planSignals.data?.awaitingReviewCount ?? 0) === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No open plans for your students.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(planSignals.data?.draftCount ?? 0) > 0 && (
                  <li>
                    <Link
                      href="/documents?view=plans-forms"
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <p className="text-sm text-foreground">
                        {planSignals.data!.draftCount === 1
                          ? "1 IEP draft in progress"
                          : `${planSignals.data!.draftCount} IEP drafts in progress`}
                      </p>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                )}
                {(planSignals.data?.awaitingReviewCount ?? 0) > 0 && (
                  <li>
                    <Link
                      href="/documents?view=plans-forms"
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <p className="text-sm text-foreground">
                        {planSignals.data!.awaitingReviewCount === 1
                          ? "1 support plan in review"
                          : `${planSignals.data!.awaitingReviewCount} support plans in review`}
                      </p>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
