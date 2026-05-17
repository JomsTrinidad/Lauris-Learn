"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import type { Json } from "@/lib/types/database";
import {
  AREA_MAP,
  CATEGORY_LABELS,
  ENTITY_MAP,
  FIELD_LABELS,
  MVP_CATEGORIES,
  SENSITIVE_FIELDS,
  SKIP_IN_DIFF,
  TABLES_BY_CATEGORY,
  UUID_PATTERN,
  formatActivity,
  formatActivityTimestamp,
  shouldSuppress,
} from "@/features/activity";
import type {
  ActivityCategory,
  AuditLogRow,
  FormattedActivity,
} from "@/features/activity";

const PAGE_SIZE = 25;

// ─── Detail-drawer helpers (kept local — power-user view of raw changes) ──────

function humanizeField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(field: string, val: unknown): string {
  if (SENSITIVE_FIELDS.has(field)) return "•••";
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "string") {
    // Mask raw UUID values — they're internal references with no UX value.
    if (UUID_PATTERN.test(val)) return "—";
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

function getChangedFields(log: AuditLogRow) {
  if (log.action !== "UPDATE" || !log.old_values || !log.new_values) return [];
  const o = log.old_values;
  const n = log.new_values;
  const allKeys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const result: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const key of allKeys) {
    if (SKIP_IN_DIFF.has(key)) continue;
    if (JSON.stringify(o[key]) !== JSON.stringify(n[key])) {
      result.push({ field: key, before: o[key], after: n[key] });
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

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: "INSERT" | "UPDATE" | "DELETE" }) {
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
      label: "Removed",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };
  const c = cfg[action];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}
    >
      {c.label}
    </span>
  );
}

// ─── Help drawer content ──────────────────────────────────────────────────────

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
      title: "What is Activity History?",
      searchText: "what activity history overview purpose",
      body: (
        <p>
          Activity History gives you a friendly, plain-English feed of what
          happened in your school recently — who added a student, who
          submitted attendance, who finalized an IEP, who posted an update.
          Use it for traceability and to spot anything unexpected.
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
          <p>Only school admins and platform admins can view Activity History.</p>
          <p>Teachers and parents cannot access this page.</p>
          <p>
            Each school sees only its own activity — there is no cross-school
            visibility.
          </p>
        </div>
      ),
    },
    {
      id: "categories",
      icon: Layers,
      title: "What's in the feed?",
      searchText: "categories students attendance plans communication enrollment documents",
      body: (
        <div className="space-y-1.5">
          <p>The MVP feed focuses on high-value operational categories:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Students</strong> — student and guardian records</li>
            <li><strong>Attendance</strong> — daily attendance and absence reports</li>
            <li><strong>Plans &amp; IEP</strong> — support plans, goals, interventions</li>
            <li><strong>Communication</strong> — parent updates, events, announcements</li>
            <li><strong>Enrollment</strong> — enrollments, inquiries, classifications</li>
            <li><strong>Documents</strong> — uploaded documents, consents, sharing</li>
          </ul>
          <p className="text-xs mt-2">
            System-level technical events (auth refreshes, internal bookkeeping)
            are not shown here.
          </p>
        </div>
      ),
    },
    {
      id: "reading-entries",
      icon: FileText,
      title: "Reading an entry",
      searchText: "reading entry summary actor action time",
      body: (
        <div className="space-y-1.5">
          <p>Each row reads like a sentence — for example:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>"School Admin added student Gianna Aquino"</li>
            <li>"Teacher submitted an attendance record for Oct 14, 2026"</li>
            <li>"School Admin finalized IEP &quot;Q2 Plan&quot;"</li>
            <li>"Teacher posted an update to a class"</li>
          </ul>
          <p className="text-xs mt-2">
            If you made the change yourself, &quot;(you)&quot; appears next to
            your role.
          </p>
        </div>
      ),
    },
    {
      id: "detail-view",
      icon: Info,
      title: "Detail view: what changed",
      searchText: "detail view before after changes fields diff",
      body: (
        <div className="space-y-1.5">
          <p>Click any row to open the detail panel.</p>
          <p>
            For an <strong>Updated</strong> entry, the panel shows only the
            fields that changed — with the old value on the left and the new
            value on the right.
          </p>
          <p>
            For a <strong>Created</strong> entry, the panel shows the full
            record as it was saved.
          </p>
          <p>
            For a <strong>Removed</strong> entry, the panel shows what the
            record looked like before it was deleted.
          </p>
        </div>
      ),
    },
    {
      id: "filtering",
      icon: Filter,
      title: "Filtering the feed",
      searchText: "filter search date range area action user",
      body: (
        <div className="space-y-1.5">
          <p>The filter bar lets you narrow down the feed:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Category</strong> — All Activity, Students, Attendance, Plans &amp; IEP, Communication, Enrollment, Documents</li>
            <li><strong>Date range</strong> — From and To dates (defaults to the last 7 days)</li>
            <li><strong>Who</strong> — filter by role (School Admin, Teacher, Parent)</li>
            <li><strong>Search</strong> — keyword search within the current page</li>
          </ul>
        </div>
      ),
    },
    {
      id: "limitations",
      icon: AlertCircle,
      title: "Known limitations",
      searchText: "limitations actor names search page privacy",
      body: (
        <div className="space-y-1.5">
          <p>
            <strong>Actor names:</strong> the feed currently shows the role of
            who made a change (e.g. &quot;School Admin&quot;) rather than the
            person's full name. If you made the change yourself, &quot;(you)&quot;
            is appended.
          </p>
          <p>
            <strong>Search scope:</strong> keyword search applies to the current
            page only (25 entries). Use the Category, Date, and Who filters to
            narrow the dataset first.
          </p>
          <p>
            <strong>Privacy:</strong> sensitive blob references (photos,
            receipts) are stripped from the audit trail. You'll only see field
            values that are safe to display.
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
  const [dateFrom, setDateFrom] = useState(() =>
    format(subDays(new Date(), 7), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">(
    "all",
  );
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<FormattedActivity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorNames, setActorNames] = useState<Map<string, string> | null>(null);

  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  const isAdmin = userRole === "school_admin" || userRole === "super_admin";

  // Resolve staff names for the current school once via the existing
  // SECURITY DEFINER RPC. school_admin only; the RPC returns 0 rows for any
  // other caller, so super_admin and unscoped contexts fall back to role labels.
  // Parents are never returned (RPC restricts to school_admin/teacher) — that
  // matches expectations: parent actions are rare and parent names should not
  // surface in a school-internal activity feed without consent.
  useEffect(() => {
    if (!isAdmin || userRole !== "school_admin" || !schoolId) {
      setActorNames(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcErr } = await supabase.rpc(
          "list_school_staff_for_sharing",
          { p_school_id: schoolId },
        );
        if (cancelled) return;
        if (rpcErr || !data) {
          setActorNames(null);
          return;
        }
        const map = new Map<string, string>();
        for (const row of data as Array<{ id: string; full_name: string | null }>) {
          if (row.full_name && row.full_name.trim()) {
            map.set(row.id, row.full_name.trim());
          }
        }
        setActorNames(map);
      } catch {
        if (!cancelled) setActorNames(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userRole, schoolId]);

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

      // School scoping. school_admin is also gated by RLS, but we add the
      // explicit filter as defense in depth and to keep totalCount accurate.
      if (schoolId) query = query.eq("school_id", schoolId);

      // Category narrows the underlying table set.
      if (categoryFilter !== "all") {
        const tables = TABLES_BY_CATEGORY[categoryFilter] ?? [];
        if (tables.length === 0) {
          setRows([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        query = query.in("table_name", tables);
      }

      if (actorFilter !== "all") query = query.eq("actor_role", actorFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom + "T00:00:00.000Z");
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");

      const { data, count, error: qErr } = await query;
      if (qErr) throw qErr;

      const parsed = (
        (data ?? []) as Array<
          AuditLogRow & { old_values: Json | null; new_values: Json | null }
        >
      ).map((row) => ({
        ...row,
        old_values: row.old_values as Record<string, unknown> | null,
        new_values: row.new_values as Record<string, unknown> | null,
      }));

      const formatted = parsed
        .filter((r) => !shouldSuppress(r))
        .map((r) => formatActivity(r, userId, actorNames));

      setRows(formatted);
      setTotalCount(count ?? 0);
    } catch {
      setError("Could not load activity. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    isAdmin,
    schoolId,
    page,
    categoryFilter,
    actorFilter,
    dateFrom,
    dateTo,
    userId,
    actorNames,
  ]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [categoryFilter, actorFilter, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.summary.toLowerCase().includes(q) ||
        r.categoryLabel.toLowerCase().includes(q) ||
        r.actorLabel.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const helpTopics = buildHelpTopics();
  const visibleTopics = helpSearch.trim()
    ? helpTopics.filter(
        (t) =>
          t.searchText.toLowerCase().includes(helpSearch.toLowerCase()) ||
          t.title.toLowerCase().includes(helpSearch.toLowerCase()),
      )
    : helpTopics;

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            You don&apos;t have permission to view activity history.
          </p>
        </div>
      </div>
    );
  }

  const defaultFrom = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const hasFilters =
    (dateFrom && dateFrom !== defaultFrom) ||
    dateTo ||
    categoryFilter !== "all" ||
    actorFilter !== "all" ||
    search;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-muted-foreground flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Activity History
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              A plain-English record of recent changes in your school.
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

      {/* ─── Category chips ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip
          active={categoryFilter === "all"}
          onClick={() => setCategoryFilter("all")}
          label="All Activity"
        />
        {MVP_CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat}
            active={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
            label={CATEGORY_LABELS[cat]}
          />
        ))}
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
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setDateFrom(defaultFrom);
              setDateTo("");
              setCategoryFilter("all");
              setActorFilter("all");
              setSearch("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* ─── Results ─────────────────────────────────────────────────────── */}
      {loading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadLogs} />
      ) : filteredRows.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <History className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
          <p className="text-muted-foreground">No activity to show yet.</p>
          {hasFilters ? (
            <p className="text-sm text-muted-foreground">
              Try adjusting or clearing your filters.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Changes made in your school will appear here.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {search.trim() ? (
                <>
                  <span className="font-medium text-foreground">
                    {filteredRows.length}
                  </span>{" "}
                  of {totalCount.toLocaleString()} on this page
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

          <ul className="rounded-lg border border-border divide-y divide-border overflow-hidden bg-card">
            {filteredRows.map((row) => (
              <ActivityFeedRow
                key={row.id}
                row={row}
                onSelect={() => setSelectedLog(row.raw)}
              />
            ))}
          </ul>

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
        <DetailDrawer
          log={selectedLog}
          userId={userId}
          actorNames={actorNames}
          onClose={() => setSelectedLog(null)}
        />
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
              <p className="font-semibold text-sm">Help · Activity History</p>
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

// ─── Feed row ─────────────────────────────────────────────────────────────────

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
        active
          ? "bg-[var(--theme-accent)] text-white border-[var(--theme-accent)]"
          : "bg-card text-foreground border-border hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function ActivityFeedRow({
  row,
  onSelect,
}: {
  row: FormattedActivity;
  onSelect: () => void;
}) {
  const ts = formatActivityTimestamp(row.createdAt);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-start gap-3"
      >
        <div className="flex-shrink-0 mt-0.5">
          <ActionBadge action={row.action} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">
            {row.summary}
            {row.actorIsImpersonating && (
              <span className="ml-1.5 text-xs text-amber-600">
                · impersonating
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span>{row.categoryLabel}</span>
            <span className="opacity-50"> · </span>
            <span>{ts.date}</span>
            <span className="opacity-50"> · </span>
            <span>{ts.time}</span>
          </p>
        </div>
      </button>
    </li>
  );
}

// ─── Detail drawer (power-user view of raw field-level changes) ───────────────

function DetailDrawer({
  log,
  userId,
  actorNames,
  onClose,
}: {
  log: AuditLogRow;
  userId: string | null;
  actorNames: Map<string, string> | null;
  onClose: () => void;
}) {
  const ts = formatActivityTimestamp(log.created_at);
  const formatted = formatActivity(log, userId, actorNames);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-xl animate-in slide-in-from-right duration-200 flex flex-col">
        {/* Detail header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <ActionBadge action={log.action} />
            <span className="font-semibold text-foreground truncate">
              {ENTITY_MAP[log.table_name] ?? log.table_name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detail body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Summary */}
          <p className="text-sm text-foreground leading-relaxed">
            {formatted.summary}
          </p>

          {/* Meta row */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>{ts.full}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4 flex-shrink-0" />
              <span>
                {formatted.actorLabel}
                {formatted.detail && (
                  <span className="ml-1.5 text-xs opacity-70">
                    · {formatted.detail}
                  </span>
                )}
                {formatted.actorIsSelf && (
                  <span className="ml-1 text-xs">(you)</span>
                )}
                {formatted.actorIsImpersonating && (
                  <span className="ml-1 text-xs text-amber-600">
                    · impersonating
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>
                {formatted.categoryLabel}
                <span className="opacity-50 mx-1.5">·</span>
                {AREA_MAP[log.table_name] ?? log.table_name}
              </span>
            </div>
          </div>

          {/* UPDATE: changes table */}
          {log.action === "UPDATE" &&
            (() => {
              const changed = getChangedFields(log);
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
                              {formatValue(field, before)}
                            </td>
                            <td className="px-3 py-2.5 text-foreground font-medium align-top break-all">
                              {formatValue(field, after)}
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
          {log.action === "INSERT" &&
            (() => {
              const fields = getRecordFields(log.new_values);
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
                              {formatValue(field, value)}
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
          {log.action === "DELETE" &&
            (() => {
              const fields = getRecordFields(log.old_values);
              return fields.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Removed Record
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
                              {formatValue(field, value)}
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
  );
}
