"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, BookOpen, Eye, EyeOff, Search, HelpCircle, X,
  ChevronDown, ChevronRight, AlertTriangle, TrendingUp,
  TrendingDown, Minus, ArrowRight, Clock, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type Visibility = "internal_only" | "parent_visible";
type TrendDirection = "improving" | "consistent" | "declining" | "insufficient";

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Observation {
  id: string;
  studentId: string;
  categoryId: string;
  /** Label stored in DB — could be 'emerging' (legacy) or any scale item label. */
  rating: string;
  /** grading_scales.id used when the observation was recorded; null for legacy. */
  scaleItemId: string | null;
  /** Precomputed rank for trend analysis; uses scale sort_order or legacy fallback. */
  rank: number;
  note: string;
  observedAt: string;
  observedBy: string;
  visibility: Visibility;
}

interface StudentOption {
  id: string;
  name: string;
  classId: string;
  className: string;
  /** class_levels.id for the student's active class; null if class has no level assigned. */
  levelId: string | null;
}

interface ScaleItem {
  id: string;
  scaleSetId: string;
  label: string;
  description: string;
  color: string;
  sortOrder: number;
}

interface ScaleSet {
  id: string;
  name: string;
}

interface GradingScaleAssignment {
  id: string;
  gradingScaleSetId: string;
  assignmentType: "school_default" | "level_default" | "domain_default" | "student_domain_override";
  levelId: string | null;
  domainId: string | null;
  studentId: string | null;
  isActive: boolean;
}

interface ResolvedScale {
  scaleSetId: string;
  scaleSetName: string;
  items: ScaleItem[];
  sourceLabel: string; // e.g. "Domain default", "School default"
}

// ── Legacy rating constants (used for backward-compat display of old observations) ─

type LegacyRating = "emerging" | "developing" | "consistent" | "advanced";

const LEGACY_RATING_META: Record<LegacyRating, { rank: number; colorClass: string; description: string }> = {
  emerging:   { rank: 0, colorClass: "bg-red-100 text-red-700",       description: "Beginning to show this skill — needs significant support." },
  developing: { rank: 1, colorClass: "bg-yellow-100 text-yellow-700", description: "Building this skill with teacher support and prompting."  },
  consistent: { rank: 2, colorClass: "bg-blue-100 text-blue-700",     description: "Demonstrates this skill reliably with minimal prompting."  },
  advanced:   { rank: 3, colorClass: "bg-green-100 text-green-700",   description: "Demonstrates this skill confidently; can model it for peers." },
};

// Maps legacy label → rank for observations without a scale_item_id.
const LEGACY_RATING_RANK: Record<string, number> = Object.fromEntries(
  Object.entries(LEGACY_RATING_META).map(([k, v]) => [k, v.rank])
);

// ── Trend helpers ──────────────────────────────────────────────────────────────

const TREND_STYLES = {
  positive: { icon: TrendingUp,   iconClass: "text-green-600",  textClass: "text-green-700"  },
  neutral:  { icon: Minus,        iconClass: "text-blue-500",   textClass: "text-blue-700"   },
  caution:  { icon: TrendingDown, iconClass: "text-orange-500", textClass: "text-orange-700" },
  info:     { icon: null,         iconClass: "",                textClass: "text-muted-foreground" },
} as const;

function computeTrend(obs: Observation[]): TrendDirection {
  if (obs.length < 2) return "insufficient";
  const sorted = [...obs].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const oldest = sorted[0].rank;
  const newest = sorted[sorted.length - 1].rank;
  if (newest > oldest) return "improving";
  if (newest < oldest) return "declining";
  return "consistent";
}

function buildTrendSummary(obs: Observation[]): { text: string; kind: keyof typeof TREND_STYLES } {
  if (obs.length === 0) return { text: "No observations recorded for this domain yet.", kind: "info" };
  if (obs.length === 1) return { text: "Baseline established. Additional observations will help reveal growth patterns over time.", kind: "info" };

  const sorted = [...obs].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const n = obs.length;
  const from = sorted[0].rating;
  const to   = sorted[sorted.length - 1].rating;
  const cap  = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (sorted[sorted.length - 1].rank > sorted[0].rank) {
    if (n === 2) return { text: `Early signs of growth — moved from ${cap(from)} to ${cap(to)}.`, kind: "positive" };
    if (n <= 4)  return { text: `Steady improvement across ${n} observations — from ${cap(from)} to ${cap(to)}.`, kind: "positive" };
    return { text: `Strong growth trend — progressed from ${cap(from)} to ${cap(to)} across ${n} observations.`, kind: "positive" };
  }
  if (sorted[sorted.length - 1].rank < sorted[0].rank) {
    if (n === 2) return { text: `A shift noted from ${cap(from)} to ${cap(to)}. Worth following up at the next check-in.`, kind: "caution" };
    return { text: `Regression noted across ${n} observations — from ${cap(from)} to ${cap(to)}. Reviewing support strategies may help.`, kind: "caution" };
  }
  if (n <= 3) return { text: `Holding steady at ${cap(to)} across ${n} observations.`, kind: "neutral" };
  return { text: `Consistent pattern across ${n} observations — sustained at ${cap(to)}.`, kind: "neutral" };
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Display helpers ────────────────────────────────────────────────────────────

/** Returns a Tailwind color class pair for a rating label (legacy only; unknown → muted). */
function getLegacyColorClass(rating: string): string {
  return LEGACY_RATING_META[rating as LegacyRating]?.colorClass ?? "bg-muted text-muted-foreground";
}

/** Returns a short plain-text description for a rating in the context of known scale items. */
function getRatingDescription(rating: string, scaleItemId: string | null, itemById: Map<string, ScaleItem>): string {
  if (scaleItemId) {
    const item = itemById.get(scaleItemId);
    if (item?.description) return item.description;
  }
  return LEGACY_RATING_META[rating as LegacyRating]?.description ?? "";
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { schoolId, activeYear, userId } = useSchoolContext();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [scaleAssignments, setScaleAssignments] = useState<GradingScaleAssignment[]>([]);
  const [allScaleItems, setAllScaleItems] = useState<ScaleItem[]>([]);
  const [allScaleSets, setAllScaleSets] = useState<ScaleSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [unobservedOpen, setUnobservedOpen] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    categoryId: "",
    rating: "",
    scaleItemId: null as string | null,
    note: "",
    observedAt: new Date().toISOString().split("T")[0],
    visibility: "parent_visible" as Visibility,
  });
  // undefined = not yet resolved for current student+domain;
  // null = resolved but no assignment found
  const [modalResolvedScale, setModalResolvedScale] = useState<ResolvedScale | null | undefined>(undefined);

  // Derived: fast lookup for scale items by id
  const itemById = useMemo(
    () => new Map(allScaleItems.map((i) => [i.id, i])),
    [allScaleItems],
  );

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([
      loadCategories(),
      loadStudents(),
      loadScaleData(),
    ]);
    setLoading(false);
  }

  async function loadCategories() {
    const { data, error: err } = await supabase
      .from("progress_categories")
      .select("id, name, description")
      .eq("school_id", schoolId!)
      .order("name");
    if (err) { setError(err.message); return; }
    setCategories(data ?? []);
  }

  async function loadStudents() {
    if (!activeYear?.id) { setStudents([]); return; }
    const { data } = await supabase
      .from("enrollments")
      .select("student_id, class_id, students(first_name, last_name), classes(name, level_id)")
      .eq("school_year_id", activeYear.id)
      .eq("status", "enrolled");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: StudentOption[] = ((data ?? []) as any[]).map((e: any) => ({
      id: e.student_id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
      classId: e.class_id ?? "",
      className: e.classes?.name ?? "",
      levelId: e.classes?.level_id ?? null,
    })).sort((a: StudentOption, b: StudentOption) => a.name.localeCompare(b.name));

    setStudents(opts);
  }

  async function loadScaleData() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: assignRows }, { data: itemRows }, { data: setRows }] = await Promise.all([
      sb.from("grading_scale_assignments")
        .select("id, grading_scale_set_id, assignment_type, level_id, domain_id, student_id, is_active")
        .eq("school_id", schoolId),
      sb.from("grading_scales")
        .select("id, scale_set_id, label, description, color, sort_order")
        .eq("school_id", schoolId)
        .order("sort_order"),
      sb.from("grading_scale_sets")
        .select("id, name")
        .eq("school_id", schoolId),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setScaleAssignments(((assignRows ?? []) as any[]).map((r: any) => ({
      id: r.id,
      gradingScaleSetId: r.grading_scale_set_id,
      assignmentType: r.assignment_type,
      levelId: r.level_id ?? null,
      domainId: r.domain_id ?? null,
      studentId: r.student_id ?? null,
      isActive: r.is_active,
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllScaleItems(((itemRows ?? []) as any[]).map((r: any) => ({
      id: r.id,
      scaleSetId: r.scale_set_id,
      label: r.label,
      description: r.description ?? "",
      color: r.color ?? "#6b7280",
      sortOrder: r.sort_order ?? 0,
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllScaleSets(((setRows ?? []) as any[]).map((r: any) => ({ id: r.id, name: r.name })));
  }

  async function loadObservations(studentId: string) {
    if (!studentId) return;
    const { data, error: err } = await supabase
      .from("progress_observations")
      .select(`id, student_id, category_id, rating, scale_item_id, note, observed_at, visibility,
        observer:profiles(full_name)`)
      .eq("student_id", studentId)
      .order("observed_at", { ascending: false });

    if (err) { setError(err.message); return; }

    const obs = (data ?? []).map((o) => {
      // Rank: prefer scale item sort_order; fall back to legacy map
      let rank = 0;
      const sid = (o as unknown as { scale_item_id: string | null }).scale_item_id ?? null;
      if (sid) {
        const item = itemById.get(sid);
        if (item) rank = item.sortOrder;
        else rank = LEGACY_RATING_RANK[o.rating] ?? 0;
      } else {
        rank = LEGACY_RATING_RANK[o.rating] ?? 0;
      }
      return {
        id: o.id,
        studentId: o.student_id,
        categoryId: o.category_id,
        rating: o.rating as string,
        scaleItemId: sid,
        rank,
        note: o.note ?? "",
        observedAt: o.observed_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        observedBy: (o as any).observer?.full_name ?? "—",
        visibility: o.visibility as Visibility,
      };
    });
    setObservations(obs);

    if (categories.length > 0) {
      const firstWithObs = categories.find((c) => obs.some((o) => o.categoryId === c.id));
      setSelectedCategory(firstWithObs?.id ?? categories[0].id);
    }
  }

  useEffect(() => {
    setObservations([]);
    setSelectedCategory(categories[0]?.id ?? "");
    setUnobservedOpen(false);
    if (selectedStudent) loadObservations(selectedStudent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  // ── Scale resolution ───────────────────────────────────────────────────────

  const resolveScaleForStudentDomain = useCallback(
    (studentId: string, domainId: string): ResolvedScale | null => {
      if (!studentId || !domainId) return null;
      const student = students.find((s) => s.id === studentId);
      const studentLevelId = student?.levelId ?? null;
      const active = scaleAssignments.filter((a) => a.isActive);

      // Priority order: student+domain → domain → level → school
      const candidates: Array<{ a: GradingScaleAssignment; sourceLabel: string }> = [
        ...active
          .filter((a) =>
            a.assignmentType === "student_domain_override" &&
            a.studentId === studentId &&
            a.domainId === domainId)
          .map((a) => ({ a, sourceLabel: "Student override" })),
        ...active
          .filter((a) => a.assignmentType === "domain_default" && a.domainId === domainId)
          .map((a) => ({ a, sourceLabel: "Domain default" })),
        ...(studentLevelId
          ? active
              .filter((a) => a.assignmentType === "level_default" && a.levelId === studentLevelId)
              .map((a) => ({ a, sourceLabel: "Level default" }))
          : []),
        ...active
          .filter((a) => a.assignmentType === "school_default")
          .map((a) => ({ a, sourceLabel: "School default" })),
      ];

      for (const { a, sourceLabel } of candidates) {
        const set = allScaleSets.find((s) => s.id === a.gradingScaleSetId);
        const items = allScaleItems
          .filter((i) => i.scaleSetId === a.gradingScaleSetId)
          .sort((x, y) => x.sortOrder - y.sortOrder);
        if (set && items.length > 0) {
          return { scaleSetId: set.id, scaleSetName: set.name, items, sourceLabel };
        }
      }
      return null;
    },
    [students, scaleAssignments, allScaleItems, allScaleSets],
  );

  // ── Modal helpers ──────────────────────────────────────────────────────────

  // Re-resolve scale whenever student or domain changes inside the modal.
  useEffect(() => {
    if (!modalOpen) return;
    const scale = resolveScaleForStudentDomain(form.studentId, form.categoryId);
    setModalResolvedScale(scale);
    // Auto-select first item from new scale when domain/student changes
    const firstItem = scale?.items[0];
    if (firstItem && (form.scaleItemId == null || !scale?.items.some((i) => i.id === form.scaleItemId))) {
      setForm((prev) => ({ ...prev, rating: firstItem.label, scaleItemId: firstItem.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.studentId, form.categoryId, modalOpen]);

  function openModal(preCategory?: string) {
    const catId = preCategory ?? selectedCategory ?? categories[0]?.id ?? "";
    const studentId = selectedStudent;
    const scale = resolveScaleForStudentDomain(studentId, catId);
    const firstItem = scale?.items[0];
    setForm({
      studentId,
      categoryId: catId,
      rating: firstItem?.label ?? "",
      scaleItemId: firstItem?.id ?? null,
      note: "",
      observedAt: new Date().toISOString().split("T")[0],
      visibility: "parent_visible",
    });
    setModalResolvedScale(scale);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.studentId) { setFormError("Select a student."); return; }
    if (!form.categoryId) { setFormError("Select a domain."); return; }
    if (modalResolvedScale === null) {
      setFormError("No grading scale is assigned for this student/domain. Ask an admin to assign one in Settings → Grading.");
      return;
    }
    if (!form.rating) { setFormError("Select a rating."); return; }
    setSaving(true);
    setFormError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: iErr } = await (supabase as any).from("progress_observations").insert({
      student_id: form.studentId,
      category_id: form.categoryId,
      rating: form.rating,
      scale_item_id: form.scaleItemId,
      note: form.note.trim() || null,
      observed_at: form.observedAt,
      observer_id: userId!,
      visibility: form.visibility,
    });

    if (iErr) { setFormError(iErr.message); setSaving(false); return; }
    setSaving(false);
    setModalOpen(false);
    if (form.studentId === selectedStudent) await loadObservations(selectedStudent);
  }

  // ── Derived view-model ─────────────────────────────────────────────────────

  const studentName = students.find((s) => s.id === selectedStudent)?.name ?? "";

  const classOptions = Array.from(
    new Map(students.filter((s) => s.classId).map((s) => [s.classId, { id: s.classId, name: s.className }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredStudents = students.filter((s) =>
    (!classFilter || s.classId === classFilter) &&
    (!studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  const catObs = observations
    .filter((o) => o.categoryId === selectedCategory)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const latestObs = catObs[0];
  const activeCat = categories.find((c) => c.id === selectedCategory);
  const trend = computeTrend(catObs);
  const summary = buildTrendSummary(catObs);
  const progressionObs = catObs.slice(0, 5).reverse();
  const daysSinceLastObs = latestObs ? daysSince(latestObs.observedAt) : null;

  const activeDomainsInNav = categories.filter((c) => observations.some((o) => o.categoryId === c.id));
  const unobservedDomains  = categories.filter((c) => !observations.some((o) => o.categoryId === c.id));
  const showUnobservedSection = unobservedOpen || activeDomainsInNav.length === 0;

  // Whether save is allowed: scale must be resolved (undefined = not yet checked, allowed to proceed)
  const canSave = modalResolvedScale !== null && !!form.rating && !!form.studentId && !!form.categoryId;

  if (loading) return <PageSpinner />;

  // ── Domain nav button ──────────────────────────────────────────────────────

  const renderDomainButton = (cat: Category) => {
    const cObs = observations
      .filter((o) => o.categoryId === cat.id)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = cObs[0];
    const t = computeTrend(cObs);
    const isSelected = selectedCategory === cat.id;
    const colorClass = latest ? getLegacyColorClass(latest.rating) : "";
    const daysSince30 = latest ? daysSince(latest.observedAt) >= 30 : false;

    return (
      <button
        key={cat.id}
        onClick={() => setSelectedCategory(cat.id)}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
          isSelected
            ? "bg-primary/10 border-primary/30"
            : "border-transparent hover:bg-muted hover:border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
            {cat.name}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {daysSince30 && (
              <span title="No update in 30+ days"><Clock className="w-2.5 h-2.5 text-amber-500" /></span>
            )}
            {latest ? (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colorClass}`}
                title={latest.rating}
              >
                {latest.rating[0].toUpperCase()}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {cObs.length > 0 ? `${cObs.length} obs` : "No observations"}
          </span>
          {latest && (
            <span className="text-[10px] text-muted-foreground ml-1">
              · {latest.observedAt}
            </span>
          )}
          {t === "improving"  && <TrendingUp   className="w-3 h-3 text-green-500 ml-1"  />}
          {t === "declining"  && <TrendingDown className="w-3 h-3 text-orange-500 ml-1" />}
          {t === "consistent" && <Minus        className="w-3 h-3 text-blue-400 ml-1"   />}
        </div>
      </button>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Progress Tracking</h1>
          <p className="text-muted-foreground text-sm mt-1">Track student growth across developmental domains</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" /> Help Topics
          </button>
          <Button onClick={() => openModal()} disabled={students.length === 0}>
            <Plus className="w-4 h-4" /> Record Observation
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No enrolled students. Add students first.</p>
      ) : (
        <>
          {/* Student selector */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">View progress for</span>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Select
                  value={classFilter}
                  onChange={(e) => { setClassFilter(e.target.value); setStudentSearch(""); }}
                  className="sm:w-44"
                >
                  <option value="">All Classes</option>
                  {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search student…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                  <option value="">— Select a student —</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.className ? ` · ${s.className}` : ""}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredStudents.length} of {students.length} student{students.length !== 1 ? "s" : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          {!selectedStudent ? (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a student above to view their growth.</p>
            </div>
          ) : (
            <>
              {/* Student subheader */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{studentName}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {observations.length} observation{observations.length !== 1 ? "s" : ""} across{" "}
                    {activeDomainsInNav.length} domain{activeDomainsInNav.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Two-panel layout */}
              <div className="flex flex-col md:flex-row gap-4 items-start">

                {/* Domain navigation */}
                <div className="w-full md:w-56 lg:w-60 md:flex-shrink-0">

                  {/* Mobile: horizontal scrollable pills */}
                  <div className="md:hidden overflow-x-auto pb-1 -mx-1 px-1">
                    <div className="flex gap-2" style={{ width: "max-content" }}>
                      {categories.map((cat) => {
                        const cObs = observations
                          .filter((o) => o.categoryId === cat.id)
                          .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
                        const latest = cObs[0];
                        const isSelected = selectedCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card border-border hover:bg-muted"
                            }`}
                          >
                            {cat.name}
                            {latest && (
                              <span className={`text-[10px] font-semibold px-1 rounded ${
                                isSelected ? "bg-white/20 text-white" : getLegacyColorClass(latest.rating)
                              }`}>
                                {latest.rating[0].toUpperCase()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Desktop: vertical list */}
                  <div className="hidden md:flex flex-col gap-0.5">
                    {activeDomainsInNav.length > 0 && (
                      <>
                        {unobservedDomains.length > 0 && (
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Active · {activeDomainsInNav.length}
                          </p>
                        )}
                        {activeDomainsInNav.map(renderDomainButton)}
                      </>
                    )}

                    {unobservedDomains.length > 0 && (
                      <div className={activeDomainsInNav.length > 0 ? "mt-2" : ""}>
                        {activeDomainsInNav.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setUnobservedOpen((v) => !v)}
                            className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showUnobservedSection
                              ? <ChevronDown  className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                            Not observed yet · {unobservedDomains.length}
                          </button>
                        ) : (
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Domains to observe · {unobservedDomains.length}
                          </p>
                        )}
                        {showUnobservedSection && unobservedDomains.map(renderDomainButton)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Growth detail */}
                <div className="flex-1 min-w-0 space-y-4">
                  {!activeCat ? (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground">
                        <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Select a domain to view growth details.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Domain header */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">{activeCat.name}</h3>
                          {activeCat.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{activeCat.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => openModal(selectedCategory)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border flex-shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>

                      {/* Stale domain alert */}
                      {daysSinceLastObs !== null && daysSinceLastObs >= 30 && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 border border-amber-200 text-amber-900 text-xs">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>No new observations in {daysSinceLastObs} days. Consider recording an update for this domain.</span>
                        </div>
                      )}

                      {/* Empty state */}
                      {catObs.length === 0 ? (
                        <Card>
                          <CardContent className="py-12 text-center">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                              <BookOpen className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium mb-1">No observations yet</p>
                            <p className="text-xs text-muted-foreground mb-4">
                              Record the first observation for <span className="font-medium">{studentName}</span> in {activeCat.name}.
                            </p>
                            <button
                              onClick={() => openModal(selectedCategory)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Record first observation
                            </button>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          {/* Growth Journey */}
                          <Card>
                            <CardContent className="p-5">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                                Growth Journey
                              </p>

                              <div className="mb-4">
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                  <span className="text-sm text-muted-foreground">Currently:</span>
                                  <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getLegacyColorClass(latestObs.rating)}`}>
                                    {latestObs.rating}
                                  </span>
                                </div>
                                {getRatingDescription(latestObs.rating, latestObs.scaleItemId, itemById) && (
                                  <p className="text-xs text-muted-foreground italic mb-1">
                                    {getRatingDescription(latestObs.rating, latestObs.scaleItemId, itemById)}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  as of {latestObs.observedAt} · {latestObs.observedBy}
                                </p>
                              </div>

                              {progressionObs.length >= 2 && (
                                <div className="mb-4">
                                  <p className="text-xs text-muted-foreground mb-3">
                                    Last {progressionObs.length} observations (oldest → newest)
                                  </p>
                                  <div className="flex items-end gap-2 flex-wrap">
                                    {progressionObs.map((obs, idx) => (
                                      <div key={obs.id} className="flex items-center gap-2">
                                        <div className="text-center">
                                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${getLegacyColorClass(obs.rating)}`}>
                                            {obs.rating}
                                          </span>
                                          <p className="text-[10px] text-muted-foreground mt-1">{obs.observedAt.slice(5)}</p>
                                        </div>
                                        {idx < progressionObs.length - 1 && (
                                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mb-4 flex-shrink-0" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className={`${progressionObs.length >= 2 ? "pt-3 border-t border-border" : ""} flex items-start gap-2`}>
                                {(() => {
                                  const style = TREND_STYLES[summary.kind];
                                  const Icon = style.icon;
                                  return (
                                    <>
                                      {Icon && <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${style.iconClass}`} />}
                                      <span className={`text-sm ${style.textClass}`}>{summary.text}</span>
                                    </>
                                  );
                                })()}
                                {catObs.length > 1 && (
                                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0 mt-0.5">
                                    {catObs.length} obs
                                  </span>
                                )}
                              </div>
                            </CardContent>
                          </Card>

                          {/* Recent Evidence */}
                          <Card>
                            <CardHeader className="pb-0 pt-5 px-5">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Evidence</p>
                            </CardHeader>
                            <CardContent className="p-0">
                              <div className="divide-y divide-border">
                                {catObs.slice(0, 10).map((obs) => {
                                  const desc = getRatingDescription(obs.rating, obs.scaleItemId, itemById);
                                  return (
                                    <div key={obs.id} className="px-5 py-4">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize flex-shrink-0 ${getLegacyColorClass(obs.rating)}`}>
                                              {obs.rating}
                                            </span>
                                            {obs.visibility === "internal_only" ? (
                                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                                <EyeOff className="w-3 h-3" /> Internal
                                              </span>
                                            ) : (
                                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                                <Eye className="w-3 h-3" /> Parent visible
                                              </span>
                                            )}
                                          </div>
                                          {desc && (
                                            <p className="text-[11px] text-muted-foreground italic mb-1">{desc}</p>
                                          )}
                                          {obs.note && (
                                            <p className="text-sm text-foreground/80 leading-relaxed">"{obs.note}"</p>
                                          )}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <p className="text-xs font-medium">{obs.observedAt}</p>
                                          <p className="text-xs text-muted-foreground">{obs.observedBy}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {catObs.length > 10 && (
                                <div className="px-5 py-3 text-xs text-muted-foreground border-t border-border">
                                  Showing 10 of {catObs.length} observations for this domain.
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Help Drawer */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Progress Tracking Help</h2>
              </div>
              <button
                type="button"
                onClick={() => { setHelpOpen(false); setHelpSearch(""); }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search topics..."
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
                    <span>{text}</span>
                  </div>
                );
                const Tip = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 text-amber-900 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-100 border border-blue-300 rounded-lg px-3 py-2 text-blue-900 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "workspace-overview",
                    icon: BookOpen,
                    title: "How the growth workspace is organized",
                    searchText: "overview workspace layout domains navigation sidebar panels active unobserved",
                    body: (
                      <div className="space-y-2">
                        <p>Progress Tracking is organized around developmental <strong>domains</strong> — skill areas like Communication, Social Skills, or Fine Motor.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Select a student at the top. The workspace loads all their observations.</span>} />
                          <Step n={2} text={<span>The <strong>left panel</strong> lists domains. <strong>Active domains</strong> (those with at least one observation) are shown first. Domains with no observations appear in a collapsible <strong>"Not observed yet"</strong> section below.</span>} />
                          <Step n={3} text={<span>Click any domain to open the <strong>Growth Journey</strong> and <strong>Recent Evidence</strong> panels on the right.</span>} />
                        </div>
                        <Note>Each rating badge includes a short description of what it means — no need to memorise the scale.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "grading-scale-resolution",
                    icon: Info,
                    title: "Grading scales per domain and level",
                    searchText: "grading scale domain level student override resolution assigned settings",
                    body: (
                      <div className="space-y-2">
                        <p>Rating options in the observation modal are drawn from the <strong>grading scale assigned</strong> for the selected student and domain.</p>
                        <p className="text-xs mt-1">The system resolves the scale automatically, in this priority order:</p>
                        <div className="space-y-1.5 mt-1">
                          {[
                            ["Student + domain override", "Most specific — overrides everything else."],
                            ["Domain default", "Applies to all students in this domain."],
                            ["Level/Class default", "Uses the student's class level as context."],
                            ["School default", "Fallback when nothing more specific is set."],
                          ].map(([label, desc]) => (
                            <div key={label} className="flex gap-2 items-start">
                              <span className="font-semibold text-xs w-40 flex-shrink-0 mt-0.5">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs mt-2">The modal shows <strong>"Using: [Scale Name] · [Source]"</strong> so you always know which scale is active.</p>
                        <Tip>If the modal shows "No grading scale assigned," ask a school admin to set one in <strong>Settings → Grading → Scale Assignments</strong>.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "growth-journey",
                    icon: ArrowRight,
                    title: "Reading the Growth Journey section",
                    searchText: "growth journey progression strip history timeline current status description meaning",
                    body: (
                      <div className="space-y-2">
                        <p>The <strong>Growth Journey</strong> card shows how a student has moved through ratings over time for a specific domain.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Currently:</strong> shows the most recent rating and a plain-language description of what that rating means.</span>} />
                          <Step n={2} text={<span><strong>Progression strip:</strong> up to the last 5 observations displayed oldest → newest with dates. Only appears when there are 2 or more observations.</span>} />
                          <Step n={3} text={<span><strong>Trend summary:</strong> a natural-language sentence at the bottom. Always shown, even for a single observation.</span>} />
                        </div>
                        <Note>The trend sentence references the actual rating labels from your school's scale.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "trend-indicators",
                    icon: TrendingUp,
                    title: "Understanding trend indicators",
                    searchText: "trend improving consistent declining needs attention arrow icon sidebar",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { icon: <TrendingUp className="w-4 h-4 text-green-600" />, label: "Improving", desc: "The most recent observation is at a higher level than the earliest recorded." },
                          { icon: <Minus className="w-4 h-4 text-blue-500" />, label: "Consistent", desc: "The overall level hasn't changed across observations." },
                          { icon: <TrendingDown className="w-4 h-4 text-orange-500" />, label: "Decline noted", desc: "The most recent observation is lower than the earliest." },
                        ].map(({ icon, label, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className="flex-shrink-0 mt-0.5">{icon}</span>
                            <div><span className="font-semibold text-xs text-foreground">{label}</span><p className="text-xs mt-0.5">{desc}</p></div>
                          </div>
                        ))}
                        <Tip>Trend is based on the first and last observations — a middle dip does not register as "declining" if the student ends higher.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "record-observation",
                    icon: Plus,
                    title: "Record an observation",
                    searchText: "record observation add student category rating note date save",
                    body: (
                      <div className="space-y-2">
                        <p>You can record as many observations as you like per student, per domain, over time.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Record Observation</strong> (top right) — or the small <strong>Add</strong> button next to the domain name to pre-select that domain.</span>} />
                          <Step n={2} text={<span>The <strong>grading scale</strong> is resolved automatically for the selected student and domain. The scale name and source are shown below the rating buttons.</span>} />
                          <Step n={3} text={<span>Add a <strong>note</strong> with specific evidence: what you observed, in which activity, and context.</span>} />
                          <Step n={4} text={<span>Set the <strong>date</strong> — defaults to today but you can backdate it.</span>} />
                          <Step n={5} text={<span>Set <strong>visibility</strong>: Parent Visible or Internal Only. Click <strong>Save Observation</strong>.</span>} />
                        </div>
                        <Tip>Observations with notes are far more useful over time than ratings alone. Even a single sentence — "Led the morning circle independently" — creates an evidence trail.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "visibility",
                    icon: Eye,
                    title: "Parent Visible vs Internal Only",
                    searchText: "visibility parent visible internal only private hidden share",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-2.5 mt-1">
                          {[
                            { label: "Parent Visible", icon: "👁", desc: "Parents see this in the parent portal's Progress page. Only the most recent parent-visible observation per domain is shown to parents." },
                            { label: "Internal Only",  icon: "🔒", desc: "Staff-only. Use for sensitive notes, detailed flags, or observations you're not ready to share." },
                          ].map(({ label, icon, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="text-sm w-4 flex-shrink-0 mt-0.5">{icon}</span>
                              <div><span className="font-semibold text-xs text-foreground">{label}</span><p className="text-xs mt-0.5">{desc}</p></div>
                            </div>
                          ))}
                        </div>
                        <Tip>Recording a new Parent Visible observation replaces what parents see for that domain. Internal Only observations still appear in the staff-side evidence list and are counted in trends.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "operational-insights",
                    icon: Clock,
                    title: "Stale domain alerts and domain groups",
                    searchText: "alert stale 30 days no observations reminder insight operational active unobserved not yet",
                    body: (
                      <div className="space-y-2">
                        <p><strong>Stale alert:</strong> when a domain has had no new observations for 30 or more days, an amber notice appears at the top of the growth detail panel. A small clock icon also appears in the left domain list.</p>
                        <p className="text-xs mt-1"><strong>Domain groups:</strong> the left panel separates domains into two sections — <em>Active</em> (at least one observation recorded) and <em>Not observed yet</em> (no observations). The second group is collapsed by default.</p>
                        <Note>The domain list also shows the date of the last observation and a trend arrow for quick scanning.</Note>
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q
                  ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q))
                  : topics;
                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                    <button type="button" onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                  </div>
                );
                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
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
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch
                ? <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span>
                : <span>7 topics · click any to expand</span>}
            </div>
          </div>
        </div>
      )}

      {/* Record Observation Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Observation">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div>
            <label className="block text-sm font-medium mb-1">Student</label>
            <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">— Select student —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Domain</label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">— Select domain —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          {/* Grading scale info / no-scale warning */}
          {form.studentId && form.categoryId && (
            <div>
              {modalResolvedScale === null ? (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-100 border border-amber-200 text-amber-900 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    No grading scale is assigned for this student/domain.
                    Ask an admin to assign one in <strong>Settings → Grading → Scale Assignments</strong>.
                  </span>
                </div>
              ) : modalResolvedScale !== undefined && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Using: <span className="font-medium text-foreground">{modalResolvedScale.scaleSetName}</span>
                    {" · "}
                    <span>{modalResolvedScale.sourceLabel}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Rating buttons — from resolved scale */}
          <div>
            <label className="block text-sm font-medium mb-2">Rating</label>
            {modalResolvedScale === null ? (
              <p className="text-xs text-muted-foreground italic">Select a student and domain with an assigned grading scale to choose a rating.</p>
            ) : modalResolvedScale === undefined || modalResolvedScale.items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Resolving scale…</p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {modalResolvedScale.items.map((item) => {
                    const isSelected = form.scaleItemId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setForm({ ...form, rating: item.label, scaleItemId: item.id })}
                        style={isSelected ? { backgroundColor: item.color, color: "#fff", borderColor: item.color } : {}}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                          isSelected
                            ? "shadow-sm"
                            : "bg-muted hover:bg-accent border-transparent"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {form.scaleItemId && (
                  <p className="text-xs text-muted-foreground italic mt-2">
                    {modalResolvedScale.items.find((i) => i.id === form.scaleItemId)?.description ?? ""}
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date Observed</label>
            <Input
              type="date"
              value={form.observedAt}
              onChange={(e) => setForm({ ...form, observedAt: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Observation Note</label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="What did you observe? Be specific — notes build the evidence record over time."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Visibility</label>
            <Select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}
            >
              <option value="parent_visible">Visible to parents</option>
              <option value="internal_only">Internal only (teachers / admin)</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button
              onClick={handleSave}
              disabled={saving || !canSave}
              title={modalResolvedScale === null ? "No grading scale assigned for this student/domain" : undefined}
            >
              {saving ? "Saving…" : "Save Observation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
