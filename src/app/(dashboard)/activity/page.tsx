"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import {
  History,
  Search,
  X,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Info,
  ShieldAlert,
  FileText,
  Filter,
  Layers,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import type { Json } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditLog = {
  id: string;
  school_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

// ─── Mapping layer ────────────────────────────────────────────────────────────

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

const ENTITY_MAP: Record<string, string> = {
  students: "Student",
  guardians: "Guardian",
  enrollments: "Enrollment",
  enrollment_inquiries: "Inquiry",
  enrollment_transitions: "Enrollment Transition",
  student_class_assignments: "Class Assignment",
  school_year_completions: "Year-End Snapshot",
  attendance_records: "Attendance Record",
  absence_notifications: "Absence Notification",
  billing_records: "Billing Record",
  payments: "Payment",
  billing_discounts: "Applied Discount",
  student_credits: "Student Credit",
  fee_types: "Fee Type",
  tuition_configs: "Tuition Config",
  discounts: "Discount",
  parent_updates: "Class Update",
  events: "Event",
  event_rsvps: "Event RSVP",
  progress_observations: "Progress Observation",
  proud_moments: "Proud Moment",
  grading_scale_sets: "Grading Scale Set",
  grading_scales: "Grading Scale",
  grading_scale_assignments: "Scale Assignment",
  classes: "Class",
  class_teachers: "Teacher Assignment",
  class_levels: "Class Level",
  school_years: "School Year",
  academic_periods: "Academic Period",
  holidays: "Holiday",
  teacher_profiles: "Teacher",
  online_class_sessions: "Online Session",
  student_plans: "Support Plan",
  student_plan_goals: "Plan Goal",
  student_plan_interventions: "Plan Intervention",
  student_plan_progress_entries: "Progress Entry",
  student_plan_attachments: "Plan Attachment",
  child_documents: "Document",
  child_document_versions: "Document Version",
  document_consents: "Document Consent",
  document_access_grants: "Document Access Grant",
  document_requests: "Document Request",
  external_contacts: "External Contact",
};

const ACTOR_LABELS: Record<string, string> = {
  super_admin: "Platform Admin",
  school_admin: "School Admin",
  teacher: "Teacher",
  parent: "Parent",
  super_admin_impersonating: "Platform Admin",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
};

// Key field to pull from JSONB for a human-readable row summary
const SUMMARY_FIELDS: Record<string, string[]> = {
  students: ["full_name"],
  guardians: ["full_name"],
  classes: ["name"],
  events: ["title"],
  teacher_profiles: ["full_name"],
  fee_types: ["name"],
  discounts: ["name"],
  school_years: ["name"],
  holidays: ["name"],
  academic_periods: ["name"],
  student_plans: ["title"],
  billing_records: ["billing_month"],
  payments: ["amount"],
  attendance_records: ["date"],
  parent_updates: ["content"],
  enrollment_inquiries: ["student_name"],
  child_documents: ["title"],
  document_requests: ["document_type"],
  online_class_sessions: ["title"],
  grading_scale_sets: ["name"],
  grading_scales: ["label"],
  class_levels: ["name"],
  external_contacts: ["full_name", "email"],
};

// Fields to skip in the detail diff view (always shown in header or not meaningful)
const SKIP_IN_DIFF = new Set([
  "id",
  "school_id",
  "created_at",
  "updated_at",
  "set_at",
  "changed_at",
]);

const FIELD_LABELS: Record<string, string> = {
  billing_month: "Billing Month",
  or_number: "OR Number",
  class_id: "Class ID",
  student_id: "Student ID",
  guardian_id: "Guardian ID",
  fee_type_id: "Fee Type ID",
  academic_period_id: "Period ID",
  school_year_id: "School Year ID",
  level_id: "Level ID",
  enrollment_id: "Enrollment ID",
  is_active: "Active",
  is_primary: "Primary Guardian",
  is_hidden: "Hidden",
  allow_download: "Allow Download",
  allow_reshare: "Allow Reshare",
  parent_visible: "Parent Visible",
  full_name: "Full Name",
  first_name: "First Name",
  last_name: "Last Name",
  birth_date: "Date of Birth",
  student_code: "Student Code",
  due_date: "Due Date",
  start_date: "Start Date",
  end_date: "End Date",
  review_date: "Review Date",
  expires_at: "Expires At",
  revoked_at: "Revoked At",
  revoke_reason: "Revoke Reason",
  archive_reason: "Archive Reason",
  change_reason: "Change Reason",
  progression_status: "Progression Status",
};

// ─── Derived constants ────────────────────────────────────────────────────────

const AREA_TABLE_MAP: Record<string, string[]> = {};
for (const [table, area] of Object.entries(AREA_MAP)) {
  if (!AREA_TABLE_MAP[area]) AREA_TABLE_MAP[area] = [];
  AREA_TABLE_MAP[area].push(table);
}
const UNIQUE_AREAS = [...new Set(Object.values(AREA_MAP))].sort();

const PAGE_SIZE = 25;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
      try {
        return format(new Date(val), "MMM d, yyyy 'at' h:mm a");
      } catch {
        return val;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      try {
        return format(new Date(val + "T00:00:00"), "MMM d, yyyy");
      } catch {
        return val;
      }
    }
    if (val.length > 120) return val.slice(0, 120) + "…";
    return val;
  }
  if (typeof val === "object") {
    const str = JSON.stringify(val);
    if (str.length > 120) return str.slice(0, 120) + "…";
    return str;
  }
  return String(val);
}

function formatBillingMonth(val: string): string {
  try {
    const normalized = val.substring(0, 7);
    return format(new Date(normalized + "-01T00:00:00"), "MMMM yyyy");
  } catch {
    return val;
  }
}

function getRecordSummary(log: AuditLog): string {
  const vals = log.action === "DELETE" ? log.old_values : log.new_values;
  if (!vals) return "";
  const fields = SUMMARY_FIELDS[log.table_name] ?? [];
  for (const field of fields) {
    const val = vals[field];
    if (val == null || val === "") continue;
    if (field === "billing_month" && typeof val === "string") {
      return formatBillingMonth(val);
    }
    if (field === "amount" && typeof val === "number") {
      return `₱${val.toLocaleString()}`;
    }
    if (field === "content" && typeof val === "string") {
      return val.slice(0, 60) + (val.length > 60 ? "…" : "");
    }
    return String(val);
  }
  return "";
}

function getChangedFields(log: AuditLog) {
  if (log.action !== "UPDATE" || !log.old_values || !log.new_values) return [];
  const old_vals = log.old_values;
  const new_vals = log.new_values;
  const allKeys = new Set([...Object.keys(old_vals), ...Object.keys(new_vals)]);
  const result: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const key of allKeys) {
    if (SKIP_IN_DIFF.has(key)) continue;
    if (JSON.stringify(old_vals[key]) !== JSON.stringify(new_vals[key])) {
      result.push({ field: key, before: old_vals[key], after: new_vals[key] });
    }
  }
  return result;
}

function getRecordFields(vals: Record<string, unknown> | null) {
  if (!vals) return [];
  return Object.entries(vals)
    .filter(([key]) => !SKIP_IN_DIFF.has(key))
    .map(([field, value]) => ({ field, value }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    INSERT: {
      label: "Created",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    UPDATE: {
      label: "Updated",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    DELETE: {
      label: "Deleted",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };
  const c = cfg[action] ?? {
    label: action,
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}
    >
      {c.label}
    </span>
  );
}

// ─── Help topics ──────────────────────────────────────────────────────────────

type HelpTopic = {
  id: string;
  icon: React.ElementType;
  title: string;
  searchText: string;
  body: React.ReactNode;
};

function buildHelpTopics(): HelpTopic[] {
  return [
    {
      id: "what-is",
      icon: History,
      title: "What is the Activity Log?",
      searchText: "what activity log overview purpose",
      body: (
        <p>
          The Activity Log shows every change made to your school's data — who
          changed it, when, and what the change was. Use it to track edits to
          student records, billing, attendance, settings, and more.
        </p>
      ),
    },
    {
      id: "who-can-see",
      icon: ShieldAlert,
      title: "Who can access this?",
      searchText: "access permission role admin teacher parent",
      body: (
        <div className="space-y-1.5">
          <p>Only school admins and platform admins can view the Activity Log.</p>
          <p>Teachers and parents cannot access this page.</p>
          <p>
            Each school can only see its own activity — logs are never shared
            between schools.
          </p>
        </div>
      ),
    },
    {
      id: "what-is-tracked",
      icon: Layers,
      title: "What actions are tracked?",
      searchText: "tracked actions created updated deleted tables areas",
      body: (
        <div className="space-y-1.5">
          <p>The log captures three types of actions:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Created</strong> — a new record was added
            </li>
            <li>
              <strong>Updated</strong> — an existing record was changed
            </li>
            <li>
              <strong>Deleted</strong> — a record was removed
            </li>
          </ul>
          <p className="mt-2">Covered areas include: Students, Enrollment, Attendance, Billing, Communication, Events, Progress, Classes, Finance Setup, Settings, and Support Plans.</p>
        </div>
      ),
    },
    {
      id: "reading-entries",
      icon: FileText,
      title: "Reading an entry",
      searchText: "reading entry columns when who action area what",
      body: (
        <div className="space-y-1.5">
          <p>Each row in the log shows:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>When</strong> — date and time of the change
            </li>
            <li>
              <strong>Who</strong> — the role of the person who made the change
              (School Admin, Teacher, Parent, or Platform Admin)
            </li>
            <li>
              <strong>Action</strong> — Created, Updated, or Deleted
            </li>
            <li>
              <strong>Area</strong> — which part of the system was affected
            </li>
            <li>
              <strong>What</strong> — the type of record, with a brief
              identifier where available
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: "detail-view",
      icon: Info,
      title: "Detail view: before and after",
      searchText: "detail view before after changes fields diff",
      body: (
        <div className="space-y-1.5">
          <p>Click any row to open the detail panel.</p>
          <p>
            For <strong>Updated</strong> entries, the panel shows only the
            fields that changed — with the old value on the left and the new
            value on the right.
          </p>
          <p>
            For <strong>Created</strong> entries, the panel shows the full
            record as it was saved.
          </p>
          <p>
            For <strong>Deleted</strong> entries, the panel shows what the
            record looked like before it was removed.
          </p>
        </div>
      ),
    },
    {
      id: "filtering",
      icon: Filter,
      title: "Searching and filtering",
      searchText: "filter search date range area action user",
      body: (
        <div className="space-y-1.5">
          <p>Use the filter bar to narrow down the log:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Date range</strong> — pick a From and To date
            </li>
            <li>
              <strong>Area</strong> — filter by a specific part of the system
            </li>
            <li>
              <strong>Action</strong> — show only Created, Updated, or Deleted
            </li>
            <li>
              <strong>Users</strong> — filter by role (School Admin, Teacher,
              etc.)
            </li>
            <li>
              <strong>Search</strong> — filters the current page by keyword
            </li>
          </ul>
          <p className="text-xs mt-2">
            Note: the search box filters within the current page only. Use the
            Area and Action filters to narrow the full dataset first.
          </p>
        </div>
      ),
    },
    {
      id: "limitations",
      icon: Info,
      title: "Known limitations",
      searchText: "limitations actor names search page",
      body: (
        <div className="space-y-1.5">
          <p>
            <strong>Actor names:</strong> the log records the role of who made a
            change (e.g. &ldquo;School Admin&rdquo;) but not their full name.
            If you made the change yourself, the log shows &ldquo;(you)&rdquo;
            next to your role.
          </p>
          <p>
            <strong>Search scope:</strong> keyword search applies to the current
            page of results only (25 entries). For broader searches, use the
            Area or Action filters to reduce the total result set first.
          </p>
        </div>
      ),
    },
  ];
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { schoolId, userRole, userId } = useSchoolContext();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  const isAdmin = userRole === "school_admin" || userRole === "super_admin";

  const loadLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (schoolId) query = query.eq("school_id", schoolId);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (areaFilter !== "all") {
        const tables = AREA_TABLE_MAP[areaFilter] ?? [];
        if (tables.length > 0) query = query.in("table_name", tables);
      }
      if (actorFilter !== "all") query = query.eq("actor_role", actorFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom + "T00:00:00.000Z");
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");

      const { data, count, error: qErr } = await query;
      if (qErr) throw qErr;
      setLogs(
        ((data ?? []) as Array<AuditLog & { old_values: Json | null; new_values: Json | null }>).map(
          (row) => ({
            ...row,
            old_values: row.old_values as Record<string, unknown> | null,
            new_values: row.new_values as Record<string, unknown> | null,
          })
        )
      );
      setTotalCount(count ?? 0);
    } catch {
      setError("Could not load activity log. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, schoolId, page, actionFilter, areaFilter, actorFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [actionFilter, areaFilter, actorFilter, dateFrom, dateTo]);

  const filteredLogs = search.trim()
    ? logs.filter((log) => {
        const q = search.toLowerCase();
        return (
          (ACTOR_LABELS[log.actor_role ?? ""] ?? "").toLowerCase().includes(q) ||
          (ENTITY_MAP[log.table_name] ?? log.table_name).toLowerCase().includes(q) ||
          (AREA_MAP[log.table_name] ?? "").toLowerCase().includes(q) ||
          (ACTION_LABELS[log.action] ?? "").toLowerCase().includes(q) ||
          getRecordSummary(log).toLowerCase().includes(q)
        );
      })
    : logs;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const helpTopics = buildHelpTopics();
  const visibleTopics = helpSearch.trim()
    ? helpTopics.filter((t) =>
        t.searchText.toLowerCase().includes(helpSearch.toLowerCase()) ||
        t.title.toLowerCase().includes(helpSearch.toLowerCase())
      )
    : helpTopics;

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            You don&apos;t have permission to view the activity log.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-muted-foreground flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Activity Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track changes and actions across your school.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Help"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 p-4 bg-card rounded-lg border border-border">
        <DatePicker
          value={dateFrom}
          onChange={setDateFrom}
          placeholder="From date"
          className="w-36"
        />
        <span className="text-muted-foreground text-sm px-1">to</span>
        <DatePicker
          value={dateTo}
          onChange={setDateTo}
          placeholder="To date"
          className="w-36"
        />
        <Select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="w-44"
        >
          <option value="all">All Areas</option>
          {UNIQUE_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </Select>
        <Select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-36"
        >
          <option value="all">All Actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </Select>
        <Select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="w-40"
        >
          <option value="all">All Users</option>
          <option value="school_admin">School Admin</option>
          <option value="teacher">Teacher</option>
          <option value="parent">Parent</option>
          {userRole === "super_admin" && (
            <option value="super_admin">Platform Admin</option>
          )}
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within results…"
            className="pl-9"
          />
        </div>
        {(() => {
          const defaultFrom = format(subDays(new Date(), 7), "yyyy-MM-dd");
          const hasFilters = (dateFrom && dateFrom !== defaultFrom) || dateTo || areaFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" || search;
          return hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setDateFrom(defaultFrom);
                setDateTo("");
                setAreaFilter("all");
                setActionFilter("all");
                setActorFilter("all");
                setSearch("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Clear filters
            </button>
          ) : null;
        })()}
      </div>

      {/* ─── Results ─────────────────────────────────────────────────────── */}
      {loading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadLogs} />
      ) : filteredLogs.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <History className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
          <p className="text-muted-foreground">No activity entries found.</p>
          {(actionFilter !== "all" ||
            areaFilter !== "all" ||
            actorFilter !== "all" ||
            dateFrom ||
            dateTo ||
            search) && (
            <p className="text-sm text-muted-foreground">
              Try adjusting or clearing your filters.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {search.trim() ? (
                <>
                  <span className="font-medium text-foreground">{filteredLogs.length}</span> of{" "}
                  {totalCount.toLocaleString()} on this page
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {totalCount.toLocaleString()}
                  </span>{" "}
                  {totalCount === 1 ? "entry" : "entries"}
                </>
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    When
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Who
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Area
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    What
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map((log) => {
                  const summary = getRecordSummary(log);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {format(new Date(log.created_at), "MMM d, yyyy")}
                        <br />
                        <span className="opacity-70">
                          {format(new Date(log.created_at), "h:mm a")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground text-sm">
                          {ACTOR_LABELS[log.actor_role ?? ""] ??
                            log.actor_role ??
                            "System"}
                        </span>
                        {log.actor_user_id === userId && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                        {log.actor_role === "super_admin_impersonating" && (
                          <span className="ml-1 text-xs text-amber-600">
                            impersonating
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm hidden sm:table-cell">
                        {AREA_MAP[log.table_name] ?? log.table_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-foreground font-medium text-sm">
                          {ENTITY_MAP[log.table_name] ?? log.table_name}
                        </span>
                        {summary && (
                          <span className="text-muted-foreground text-sm">
                            {" · "}
                            {summary}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Detail drawer ────────────────────────────────────────────────── */}
      {selectedLog && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelectedLog(null)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-xl animate-in slide-in-from-right duration-200 flex flex-col">
            {/* Detail header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <ActionBadge action={selectedLog.action} />
                <span className="font-semibold text-foreground truncate">
                  {ENTITY_MAP[selectedLog.table_name] ?? selectedLog.table_name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors flex-shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detail body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {/* Meta row */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {format(
                      new Date(selectedLog.created_at),
                      "MMMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {ACTOR_LABELS[selectedLog.actor_role ?? ""] ??
                      selectedLog.actor_role ??
                      "System"}
                    {selectedLog.actor_user_id === userId && (
                      <span className="ml-1 text-xs">(you)</span>
                    )}
                    {selectedLog.actor_role === "super_admin_impersonating" && (
                      <span className="ml-1 text-xs text-amber-600">
                        · impersonating
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {AREA_MAP[selectedLog.table_name] ?? selectedLog.table_name}
                    {selectedLog.record_id && (
                      <span className="ml-1.5 text-xs font-mono opacity-50">
                        · {selectedLog.record_id.slice(0, 8)}…
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* UPDATE: changes table */}
              {selectedLog.action === "UPDATE" && (() => {
                const changed = getChangedFields(selectedLog);
                return changed.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Changes Made
                    </p>
                    <div className="rounded-md border border-border overflow-hidden text-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-1/3">
                              Field
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-1/3">
                              Before
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-1/3">
                              After
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {changed.map(({ field, before, after }) => (
                            <tr key={field}>
                              <td className="px-3 py-2.5 text-muted-foreground font-medium align-top">
                                {humanizeField(field)}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground align-top break-all">
                                {formatValue(before)}
                              </td>
                              <td className="px-3 py-2.5 text-foreground font-medium align-top break-all">
                                {formatValue(after)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No tracked field changes detected in this update.
                  </p>
                );
              })()}

              {/* INSERT: record fields */}
              {selectedLog.action === "INSERT" && (() => {
                const fields = getRecordFields(selectedLog.new_values);
                return fields.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Record Created
                    </p>
                    <div className="rounded-md border border-border overflow-hidden text-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-2/5">
                              Field
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {fields.map(({ field, value }) => (
                            <tr key={field}>
                              <td className="px-3 py-2.5 text-muted-foreground font-medium align-top">
                                {humanizeField(field)}
                              </td>
                              <td className="px-3 py-2.5 text-foreground align-top break-all">
                                {formatValue(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* DELETE: deleted record fields */}
              {selectedLog.action === "DELETE" && (() => {
                const fields = getRecordFields(selectedLog.old_values);
                return fields.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Deleted Record
                    </p>
                    <div className="rounded-md border border-border/50 overflow-hidden text-sm opacity-80">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-2/5">
                              Field
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {fields.map(({ field, value }) => (
                            <tr key={field}>
                              <td className="px-3 py-2.5 text-muted-foreground font-medium align-top">
                                {humanizeField(field)}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground align-top break-all line-through decoration-muted-foreground/40">
                                {formatValue(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </>
      )}

      {/* ─── Help drawer ──────────────────────────────────────────────────── */}
      {helpOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setHelpOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-80 bg-card border-l border-border shadow-xl animate-in slide-in-from-right duration-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <p className="font-semibold text-sm">Help · Activity Log</p>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
              <input
                type="search"
                value={helpSearch}
                onChange={(e) => setHelpSearch(e.target.value)}
                placeholder="Search help…"
                className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {visibleTopics.map((topic) => (
                <div
                  key={topic.id}
                  className="rounded-md border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      setHelpExpanded((e) => ({
                        ...e,
                        [topic.id]: !e[topic.id],
                      }))
                    }
                  >
                    <topic.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">
                      {topic.title}
                    </span>
                    {helpExpanded[topic.id] ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {helpExpanded[topic.id] && (
                    <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground space-y-1.5 border-t border-border">
                      {topic.body}
                    </div>
                  )}
                </div>
              ))}
              {visibleTopics.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No help topics match your search.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
