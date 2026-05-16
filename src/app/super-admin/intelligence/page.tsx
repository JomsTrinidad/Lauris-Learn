"use client";

import { useState, useEffect, useCallback } from "react";
import { subDays, formatDistanceToNow, format } from "date-fns";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  RefreshCw,
  TrendingDown,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// ─── Area mapping (mirrors the activity log viewer) ───────────────────────────

const AREA_MAP: Record<string, string> = {
  students: "Students",
  guardians: "Students",
  enrollments: "Enrollment",
  enrollment_inquiries: "Enrollment",
  enrollment_transitions: "Enrollment",
  student_class_assignments: "Enrollment",
  school_year_completions: "Enrollment",
  attendance_records: "Attendance",
  absence_notifications: "Attendance",
  billing_records: "Billing",
  payments: "Billing",
  billing_discounts: "Billing",
  student_credits: "Finance Setup",
  fee_types: "Finance Setup",
  tuition_configs: "Finance Setup",
  discounts: "Finance Setup",
  parent_updates: "Communication",
  events: "Events",
  event_rsvps: "Events",
  progress_observations: "Progress",
  proud_moments: "Progress",
  grading_scale_sets: "Progress",
  grading_scales: "Progress",
  grading_scale_assignments: "Progress",
  classes: "Classes",
  class_teachers: "Classes",
  class_levels: "Settings",
  school_years: "Settings",
  academic_periods: "Settings",
  holidays: "Settings",
  teacher_profiles: "Settings",
  online_class_sessions: "Online Classes",
  student_plans: "Support Plans",
  student_plan_goals: "Support Plans",
  student_plan_interventions: "Support Plans",
  student_plan_progress_entries: "Support Plans",
  student_plan_attachments: "Support Plans",
  child_documents: "Documents",
  child_document_versions: "Documents",
  document_consents: "Documents",
  document_access_grants: "Documents",
  document_requests: "Documents",
  external_contacts: "Documents",
};

// Display order for operational areas (most operationally critical first)
const AREA_ORDER = [
  "Attendance",
  "Billing",
  "Enrollment",
  "Students",
  "Communication",
  "Support Plans",
  "Documents",
  "Progress",
  "Events",
  "Classes",
  "Finance Setup",
  "Settings",
  "Online Classes",
];

// Feature areas to check for potential discovery gaps.
// Maps area label → primary table names that indicate usage.
const GAP_CHECK_AREAS: Record<string, string[]> = {
  Communication: ["parent_updates"],
  Events: ["events", "event_rsvps"],
  "Support Plans": ["student_plans"],
  Documents: ["child_documents"],
  Progress: ["progress_observations"],
};

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRangeKey = 7 | 30 | 90;

type RawRow = {
  table_name: string;
  activity_count: number;
  active_users: number;
  active_schools: number;
  last_activity: string | null;
};

type AreaSummary = {
  area: string;
  activity_count: number;
  active_users: number;
  active_schools: number;
  last_activity: string | null;
};

type BottleneckData = {
  plans_awaiting_review: number;
  billing_overdue_30d: number;
  inquiries_open_7d: number;
};

type GapSignal = {
  area: string;
  active_schools: number;
  total_schools: number;
};

type WorkflowSignals = {
  plan_drafts_idle_7d: number;
  plan_drafts_idle_14d: number;
  plans_review_7d: number;
  plans_review_14d: number;
  plans_review_30d: number;
  inquiries_open_7d: number;
  inquiries_open_14d: number;
  inquiries_open_30d: number;
  att_corrections: number;
  att_markings: number;
  billing_corrections: number;
  billing_created: number;
  high_touch_plans: number;
  high_touch_billing: number;
  high_touch_att: number;
};

type RecentEntry = {
  id: string;
  school_id: string | null;
  actor_role: string | null;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  created_at: string;
  // PostgREST returns FK joins as arrays even for many-to-one relationships
  school: { name: string }[] | { name: string } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "—";
  }
}

function num(n: number): string {
  return n.toLocaleString();
}

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
};

const ACTION_VARIANTS = {
  INSERT: "active",
  UPDATE: "info",
  DELETE: "revoked",
} as const;

function parseWorkflowSignals(raw: unknown): WorkflowSignals | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  function n(key: string): number {
    const v = r[key];
    return typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;
  }
  return {
    plan_drafts_idle_7d: n("plan_drafts_idle_7d"),
    plan_drafts_idle_14d: n("plan_drafts_idle_14d"),
    plans_review_7d: n("plans_review_7d"),
    plans_review_14d: n("plans_review_14d"),
    plans_review_30d: n("plans_review_30d"),
    inquiries_open_7d: n("inquiries_open_7d"),
    inquiries_open_14d: n("inquiries_open_14d"),
    inquiries_open_30d: n("inquiries_open_30d"),
    att_corrections: n("att_corrections"),
    att_markings: n("att_markings"),
    billing_corrections: n("billing_corrections"),
    billing_created: n("billing_created"),
    high_touch_plans: n("high_touch_plans"),
    high_touch_billing: n("high_touch_billing"),
    high_touch_att: n("high_touch_att"),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationalIntelligencePage() {
  const supabase = createClient();

  const [range, setRange] = useState<DateRangeKey>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [areaSummaries, setAreaSummaries] = useState<AreaSummary[]>([]);
  const [bottlenecks, setBottlenecks] = useState<BottleneckData | null>(null);
  const [gapSignals, setGapSignals] = useState<GapSignal[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentEntry[]>([]);
  const [workflowSignals, setWorkflowSignals] = useState<WorkflowSignals | null>(null);

  const load = useCallback(
    async (r: DateRangeKey) => {
      setRefreshing(true);
      setError(null);
      try {
        const from = subDays(new Date(), r).toISOString();
        const to = new Date().toISOString();
        // 30-day cutoff for "overdue billing" is always fixed, not relative to range
        const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
        const sevenDaysAgo = subDays(new Date(), 7).toISOString();

        const [
          actRes,
          plansRes,
          billingRes,
          inquiriesRes,
          schoolsRes,
          recentRes,
          workflowRes,
        ] = await Promise.all([
          // Activity summary aggregated by table_name (super_admin gated in function)
          supabase.rpc("get_operational_activity_summary", {
            p_from: from,
            p_to: to,
          }),

          // Plans stuck in review > 7 days (stale regardless of date range filter)
          supabase
            .from("student_plans")
            .select("id", { count: "exact", head: true })
            .in("status", ["submitted", "in_review"])
            .lt("updated_at", sevenDaysAgo),

          // Billing records marked overdue with due_date > 30 days ago
          supabase
            .from("billing_records")
            .select("id", { count: "exact", head: true })
            .eq("status", "overdue")
            .not("due_date", "is", null)
            .lt("due_date", thirtyDaysAgo),

          // Enrollment inquiries open (not progressed) for > 7 days
          supabase
            .from("enrollment_inquiries")
            .select("id", { count: "exact", head: true })
            .in("status", ["inquiry", "assessment_scheduled", "waitlisted"])
            .lt("created_at", sevenDaysAgo),

          // Total schools (exclude permanently cancelled)
          supabase
            .from("schools")
            .select("id", { count: "exact", head: true })
            .neq("subscription_status", "cancelled"),

          // Recent changes — last 10 entries platform-wide, with school name
          supabase
            .from("audit_logs")
            .select(
              "id, school_id, actor_role, table_name, action, created_at, school:schools(name)"
            )
            .order("created_at", { ascending: false })
            .limit(10),

          // Workflow health signals (super_admin gated in function; returns {} for others)
          supabase.rpc("get_workflow_health_signals", {
            p_from: from,
            p_to: to,
          }),
        ]);

        if (actRes.error) throw actRes.error;

        // Aggregate per-table rows into operational areas.
        // active_users and active_schools are MAXIMUMS across tables in the area
        // (true distinct counts require raw data; max is a safe lower bound).
        const areaMap = new Map<string, AreaSummary>();
        for (const row of (actRes.data as RawRow[]) ?? []) {
          const area = AREA_MAP[row.table_name] ?? "Other";
          const prev = areaMap.get(area);
          if (prev) {
            prev.activity_count += Number(row.activity_count);
            prev.active_users = Math.max(
              prev.active_users,
              Number(row.active_users)
            );
            prev.active_schools = Math.max(
              prev.active_schools,
              Number(row.active_schools)
            );
            if (
              row.last_activity &&
              (!prev.last_activity || row.last_activity > prev.last_activity)
            ) {
              prev.last_activity = row.last_activity;
            }
          } else {
            areaMap.set(area, {
              area,
              activity_count: Number(row.activity_count),
              active_users: Number(row.active_users),
              active_schools: Number(row.active_schools),
              last_activity: row.last_activity,
            });
          }
        }

        // Sort by canonical order, append any unmapped areas at the end
        const sorted: AreaSummary[] = [
          ...AREA_ORDER.filter((a) => areaMap.has(a)).map((a) => areaMap.get(a)!),
          ...[...areaMap.entries()]
            .filter(([a]) => !AREA_ORDER.includes(a))
            .map(([, v]) => v),
        ];
        setAreaSummaries(sorted);

        // Bottleneck signals (point-in-time, not date-range-filtered)
        setBottlenecks({
          plans_awaiting_review: plansRes.count ?? 0,
          billing_overdue_30d: billingRes.count ?? 0,
          inquiries_open_7d: inquiriesRes.count ?? 0,
        });

        // Gap analysis: for each key feature area, measure how many schools had
        // activity in the selected period. Gaps = schools with none.
        const totalSchools = schoolsRes.count ?? 0;
        if (totalSchools > 0 && actRes.data) {
          const rows = actRes.data as RawRow[];
          const gaps: GapSignal[] = Object.entries(GAP_CHECK_AREAS)
            .map(([area, tables]) => {
              // Take the max school count across the area's tables
              const activeSchools = tables.reduce((max, tbl) => {
                const row = rows.find((r) => r.table_name === tbl);
                return Math.max(max, row ? Number(row.active_schools) : 0);
              }, 0);
              return { area, active_schools: activeSchools, total_schools: totalSchools };
            })
            .filter((g) => g.active_schools < g.total_schools);
          setGapSignals(gaps);
        } else {
          setGapSignals([]);
        }

        setRecentChanges((recentRes.data ?? []) as unknown as RecentEntry[]);

        if (workflowRes.error) {
          console.warn("[OI] workflow signals error:", workflowRes.error);
        }
        setWorkflowSignals(parseWorkflowSignals(workflowRes.data));
      } catch (err) {
        console.error("[OI] load error:", err);
        setError("Failed to load operational data. Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    load(range);
  }, [range, load]);

  if (loading) return <PageSpinner />;
  if (error)
    return (
      <div className="p-6">
        <ErrorAlert message={error} />
      </div>
    );

  const totalActivity = areaSummaries.reduce((s, a) => s + a.activity_count, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Operational Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform-wide operational signals · Internal use only
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {([7, 30, 90] as DateRangeKey[]).map((d) => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  range === d
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => load(range)}
            disabled={refreshing}
            title="Refresh"
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Section 1: Operational Activity ─────────────────────────────────── */}
      <Card>
        <CardHeader className="py-4 px-5">
          <h2 className="font-semibold text-sm text-foreground">Operational Activity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {num(totalActivity)} event{totalActivity !== 1 ? "s" : ""} across all schools
            in the last {range} days
          </p>
        </CardHeader>

        {areaSummaries.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              No audit activity recorded in this period.
            </p>
          </CardContent>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex items-center gap-4 px-5 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground font-medium">
              <span className="flex-1">Area</span>
              <span className="w-24 text-right">Events</span>
              <span className="w-20 text-right hidden sm:block">Users ≥</span>
              <span className="w-20 text-right hidden sm:block">Schools ≥</span>
              <span className="w-32 text-right hidden md:block">Last activity</span>
            </div>
            <div className="divide-y divide-border">
              {areaSummaries.map((a) => (
                <div
                  key={a.area}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors"
                >
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {a.area}
                  </span>
                  <span className="w-24 text-right text-sm tabular-nums font-semibold">
                    {num(a.activity_count)}
                  </span>
                  <span className="w-20 text-right text-sm tabular-nums text-muted-foreground hidden sm:flex items-center justify-end gap-1">
                    <Users className="w-3 h-3 opacity-50" />
                    {a.active_users}
                  </span>
                  <span className="w-20 text-right text-sm tabular-nums text-muted-foreground hidden sm:flex items-center justify-end gap-1">
                    <Building2 className="w-3 h-3 opacity-50" />
                    {a.active_schools}
                  </span>
                  <span className="w-32 text-right text-xs text-muted-foreground hidden md:block">
                    {relTime(a.last_activity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-2 border-t border-border bg-muted/10">
              <p className="text-xs text-muted-foreground">
                Users and Schools show the maximum distinct count across tables in each
                area — actual totals may be higher when multiple tables contribute.
              </p>
            </div>
          </>
        )}
      </Card>

      {/* ── Section 2: Bottleneck Signals ───────────────────────────────────── */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Bottleneck Signals</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Point-in-time counts — not filtered by the period selector above
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BottleneckCard
            icon={AlertTriangle}
            count={bottlenecks?.plans_awaiting_review ?? 0}
            label="support plans awaiting review"
            sublabel="Submitted or in review, not updated in 7+ days"
            okMessage="No aging plans in review"
          />
          <BottleneckCard
            icon={Clock}
            count={bottlenecks?.billing_overdue_30d ?? 0}
            label="billing records 30+ days overdue"
            sublabel="Status is overdue, due date passed 30 days ago"
            okMessage="No deeply overdue billing"
          />
          <BottleneckCard
            icon={TrendingDown}
            count={bottlenecks?.inquiries_open_7d ?? 0}
            label="enrollment inquiries open 7+ days"
            sublabel="Inquiry, waitlisted, or assessment scheduled"
            okMessage="No aging open inquiries"
          />
        </div>
      </div>

      {/* ── Section 3: Workflow Health & Friction ───────────────────────────── */}
      <Card>
        <CardHeader className="py-4 px-5">
          <h2 className="font-semibold text-sm text-foreground">
            Workflow Health &amp; Friction
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aging, correction frequency, and repeated operational touches ·
            Plan and inquiry signals are point-in-time; correction and high-touch
            counts are filtered by the selected period
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1 space-y-5">
          {workflowSignals === null ? (
            <p className="text-sm text-muted-foreground py-2">
              Workflow signals unavailable.
            </p>
          ) : (
            <>
              {/* A + B: Plan Lifecycle */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Plan Lifecycle
                </p>
                <div className="border border-border rounded-lg divide-y divide-border px-4">
                  <SignalRow
                    label="Draft plans inactive 7+ days"
                    value={workflowSignals.plan_drafts_idle_7d}
                    sublabel="Not updated since first save — may warrant a follow-up"
                  />
                  <SignalRow
                    label="Draft plans inactive 14+ days"
                    value={workflowSignals.plan_drafts_idle_14d}
                    context
                  />
                  <SignalRow
                    label="Plans awaiting review 7+ days"
                    value={workflowSignals.plans_review_7d}
                    sublabel="Submitted or in review, not updated in 7+ days"
                  />
                  <SignalRow
                    label="Plans awaiting review 14+ days"
                    value={workflowSignals.plans_review_14d}
                    context
                  />
                  <SignalRow
                    label="Plans awaiting review 30+ days"
                    value={workflowSignals.plans_review_30d}
                    context
                  />
                </div>
              </div>

              {/* C + D: Correction Frequency */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Correction Frequency{" "}
                  <span className="font-normal normal-case">
                    (in selected period)
                  </span>
                </p>
                <div className="border border-border rounded-lg divide-y divide-border px-4">
                  <SignalRow
                    label="Attendance corrections (updates)"
                    value={workflowSignals.att_corrections}
                    sublabel={
                      workflowSignals.att_markings > 0
                        ? `vs ${num(workflowSignals.att_markings)} markings — ${Math.round(
                            (workflowSignals.att_corrections /
                              workflowSignals.att_markings) *
                              100
                          )}% correction rate`
                        : "No attendance markings recorded in this period"
                    }
                  />
                  <SignalRow
                    label="Billing record corrections (updates)"
                    value={workflowSignals.billing_corrections}
                    sublabel={
                      workflowSignals.billing_created > 0
                        ? `vs ${num(workflowSignals.billing_created)} new billing records created`
                        : "No billing records created in this period"
                    }
                  />
                </div>
              </div>

              {/* E: Inquiry Follow-through */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Inquiry Follow-through
                </p>
                <div className="border border-border rounded-lg divide-y divide-border px-4">
                  <SignalRow
                    label="Open inquiries awaiting follow-up 7+ days"
                    value={workflowSignals.inquiries_open_7d}
                    sublabel="Inquiry, waitlisted, or assessment scheduled — not yet progressed"
                  />
                  <SignalRow
                    label="Open inquiries awaiting follow-up 14+ days"
                    value={workflowSignals.inquiries_open_14d}
                    context
                  />
                  <SignalRow
                    label="Open inquiries awaiting follow-up 30+ days"
                    value={workflowSignals.inquiries_open_30d}
                    context
                  />
                </div>
              </div>

              {/* F: Frequently Revised Records */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Frequently Revised Records{" "}
                  <span className="font-normal normal-case">
                    (3+ updates per record, in selected period)
                  </span>
                </p>
                <div className="border border-border rounded-lg divide-y divide-border px-4">
                  <SignalRow
                    label="Support plan records"
                    value={workflowSignals.high_touch_plans}
                    sublabel="Distinct plans updated 3 or more times — may reflect iterative drafting or repeated revisions"
                  />
                  <SignalRow
                    label="Billing records"
                    value={workflowSignals.high_touch_billing}
                    sublabel="Distinct billing or payment records updated 3 or more times"
                  />
                  <SignalRow
                    label="Attendance records"
                    value={workflowSignals.high_touch_att}
                    sublabel="Distinct attendance entries updated 3 or more times — may indicate frequent corrections"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Potential Discovery Gaps ─────────────────────────────── */}
      <Card>
        <CardHeader className="py-4 px-5">
          <h2 className="font-semibold text-sm text-foreground">
            Potential Discovery Gaps
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Feature areas with no audit activity from some schools in the selected
            period. Low or zero usage is not automatically a problem — schools may not
            yet need a feature.
          </p>
        </CardHeader>
        <CardContent className="py-0 px-0">
          {gapSignals.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              All monitored feature areas have been active across all schools in this
              period.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {gapSignals.map((g) => {
                const inactiveCount = g.total_schools - g.active_schools;
                return (
                  <li key={g.area} className="flex items-start gap-3 px-5 py-3.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {g.area}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inactiveCount} of {g.total_schools}{" "}
                        {g.total_schools === 1 ? "school" : "schools"} with no recent
                        activity — may need onboarding or has not yet adopted this
                        feature
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                      {g.active_schools}/{g.total_schools} active
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Section 5: Recent Operational Changes ───────────────────────────── */}
      <Card>
        <CardHeader className="py-4 px-5">
          <h2 className="font-semibold text-sm text-foreground">
            Recent Operational Changes
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last 10 events platform-wide · For detailed history see Activity Log
          </p>
        </CardHeader>
        <div className="divide-y divide-border">
          {recentChanges.length === 0 ? (
            <div className="px-5 py-6 text-sm text-center text-muted-foreground">
              No recent events.
            </div>
          ) : (
            recentChanges.map((entry) => {
              const area = AREA_MAP[entry.table_name] ?? "Other";
              const variant =
                ACTION_VARIANTS[entry.action as keyof typeof ACTION_VARIANTS] ??
                "default";
              const schoolObj = Array.isArray(entry.school)
                ? entry.school[0]
                : entry.school;
              const schoolName = schoolObj?.name ?? null;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Badge variant={variant} className="flex-shrink-0 capitalize">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </Badge>
                  <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                    <span className="text-sm text-foreground truncate">{area}</span>
                    {schoolName && (
                      <span className="text-xs text-muted-foreground truncate hidden sm:block">
                        · {schoolName}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {relTime(entry.created_at)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── SignalRow ────────────────────────────────────────────────────────────────

function SignalRow({
  label,
  value,
  sublabel,
  context,
}: {
  label: string;
  value: number;
  sublabel?: string;
  context?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-2.5", context && "pl-3")}>
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm",
            context ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {label}
        </span>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </div>
      <span
        className={cn(
          "text-sm tabular-nums font-semibold flex-shrink-0 mt-0.5",
          value === 0 || context
            ? "text-muted-foreground"
            : "text-foreground"
        )}
      >
        {num(value)}
      </span>
    </div>
  );
}

// ─── BottleneckCard ───────────────────────────────────────────────────────────

function BottleneckCard({
  icon: Icon,
  count,
  label,
  sublabel,
  okMessage,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  sublabel: string;
  okMessage: string;
}) {
  const isOk = count === 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-4 bg-card",
        isOk ? "border-border" : "border-amber-200 bg-amber-50/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "p-2 rounded-lg flex-shrink-0",
            isOk ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          {isOk ? (
            <p className="text-sm font-medium text-green-700">{okMessage}</p>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums text-amber-700">
                {num(count)}
              </p>
              <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
            </>
          )}
          <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}
