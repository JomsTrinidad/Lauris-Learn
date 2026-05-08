"use client";
import { useEffect, useState } from "react";
import {
  Plus, BookOpen, Eye, EyeOff, Search, HelpCircle, X,
  ChevronDown, ChevronRight, AlertTriangle, TrendingUp,
  TrendingDown, Minus, ArrowRight, Clock,
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

type Rating = "emerging" | "developing" | "consistent" | "advanced";
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
  rating: Rating;
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
}

const RATINGS: Rating[] = ["emerging", "developing", "consistent", "advanced"];

// Single source of truth for grading scale metadata.
// rank drives ordering and trend direction; colorClass and description are display properties.
// Replace this map with a runtime lookup when grading scales are wired to observations.
const RATING_META: Record<Rating, { rank: number; colorClass: string; description: string }> = {
  emerging:   { rank: 0, colorClass: "bg-red-100 text-red-700",       description: "Beginning to show this skill — needs significant support." },
  developing: { rank: 1, colorClass: "bg-yellow-100 text-yellow-700", description: "Building this skill with teacher support and prompting."  },
  consistent: { rank: 2, colorClass: "bg-blue-100 text-blue-700",     description: "Demonstrates this skill reliably with minimal prompting."  },
  advanced:   { rank: 3, colorClass: "bg-green-100 text-green-700",   description: "Demonstrates this skill confidently; can model it for peers." },
};

// Derived — keeps all rendering code unchanged when RATING_META is replaced.
const RATING_RANK   = Object.fromEntries(RATINGS.map((r) => [r, RATING_META[r].rank]))       as Record<Rating, number>;
const RATING_COLORS = Object.fromEntries(RATINGS.map((r) => [r, RATING_META[r].colorClass])) as Record<Rating, string>;

// Styling for each trend kind — static objects keep Tailwind class names purgeable.
const TREND_STYLES = {
  positive: { icon: TrendingUp,   iconClass: "text-green-600",  textClass: "text-green-700"  },
  neutral:  { icon: Minus,        iconClass: "text-blue-500",   textClass: "text-blue-700"   },
  caution:  { icon: TrendingDown, iconClass: "text-orange-500", textClass: "text-orange-700" },
  info:     { icon: null,         iconClass: "",                textClass: "text-muted-foreground" },
} as const;

function computeTrend(obs: Observation[]): TrendDirection {
  if (obs.length < 2) return "insufficient";
  // obs is newest-first; sort chronologically for overall direction
  const sorted = [...obs].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const oldest = RATING_RANK[sorted[0].rating];
  const newest = RATING_RANK[sorted[sorted.length - 1].rating];
  if (newest > oldest) return "improving";
  if (newest < oldest) return "declining";
  return "consistent";
}

// Human-readable trend summary. Uses RATING_RANK for direction so the logic
// works regardless of label names — only the description strings in RATING_META
// need updating for a different grading scale.
function buildTrendSummary(
  obs: Observation[]
): { text: string; kind: keyof typeof TREND_STYLES } {
  if (obs.length === 0) return { text: "No observations recorded for this domain yet.", kind: "info" };
  if (obs.length === 1)
    return {
      text: "Baseline established. Additional observations will help reveal growth patterns over time.",
      kind: "info",
    };

  const sorted = [...obs].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const oldestRank = RATING_RANK[sorted[0].rating];
  const newestRank = RATING_RANK[sorted[sorted.length - 1].rating];
  const n = obs.length;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const from = cap(sorted[0].rating);
  const to   = cap(sorted[sorted.length - 1].rating);

  if (newestRank > oldestRank) {
    if (n === 2) return { text: `Early signs of growth — moved from ${from} to ${to}.`, kind: "positive" };
    if (n <= 4)  return { text: `Steady improvement across ${n} observations — from ${from} to ${to}.`, kind: "positive" };
    return { text: `Strong growth trend — progressed from ${from} to ${to} across ${n} observations.`, kind: "positive" };
  }

  if (newestRank < oldestRank) {
    if (n === 2) return { text: `A shift noted from ${from} to ${to}. Worth following up at the next check-in.`, kind: "caution" };
    return { text: `Regression noted across ${n} observations — from ${from} to ${to}. Reviewing support strategies may help.`, kind: "caution" };
  }

  if (n <= 3) return { text: `Holding steady at ${to} across ${n} observations.`, kind: "neutral" };
  return { text: `Consistent pattern across ${n} observations — sustained at ${to}.`, kind: "neutral" };
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function ProgressPage() {
  const { schoolId, activeYear, userId } = useSchoolContext();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
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
    rating: "developing" as Rating,
    note: "",
    observedAt: new Date().toISOString().split("T")[0],
    visibility: "parent_visible" as Visibility,
  });

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadCategories(), loadStudents()]);
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
      .select("student_id, class_id, students(first_name, last_name), classes(name)")
      .eq("school_year_id", activeYear.id)
      .eq("status", "enrolled");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: StudentOption[] = ((data ?? []) as any[]).map((e: any) => ({
      id: e.student_id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
      classId: e.class_id ?? "",
      className: e.classes?.name ?? "",
    })).sort((a: StudentOption, b: StudentOption) => a.name.localeCompare(b.name));

    setStudents(opts);
  }

  async function loadObservations(studentId: string) {
    if (!studentId) return;
    const { data, error: err } = await supabase
      .from("progress_observations")
      .select(`id, student_id, category_id, rating, note, observed_at, visibility,
        observer:profiles(full_name)`)
      .eq("student_id", studentId)
      .order("observed_at", { ascending: false });

    if (err) { setError(err.message); return; }

    const obs = (data ?? []).map((o) => ({
      id: o.id,
      studentId: o.student_id,
      categoryId: o.category_id,
      rating: o.rating as Rating,
      note: o.note ?? "",
      observedAt: o.observed_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      observedBy: (o as any).observer?.full_name ?? "—",
      visibility: o.visibility as Visibility,
    }));
    setObservations(obs);

    // Auto-select first category that has observations; fall back to first category
    if (categories.length > 0) {
      const firstWithObs = categories.find((c) => obs.some((o) => o.categoryId === c.id));
      setSelectedCategory(firstWithObs?.id ?? categories[0].id);
    }
  }

  // Reset when student changes
  useEffect(() => {
    setObservations([]);
    setSelectedCategory(categories[0]?.id ?? "");
    setUnobservedOpen(false);
    if (selectedStudent) loadObservations(selectedStudent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  async function handleSave() {
    if (!form.studentId) { setFormError("Select a student."); return; }
    if (!form.categoryId) { setFormError("Select a category."); return; }
    setSaving(true);
    setFormError(null);

    const { error: iErr } = await supabase.from("progress_observations").insert({
      student_id: form.studentId,
      category_id: form.categoryId,
      rating: form.rating,
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

  function openModal(preCategory?: string) {
    setForm({
      studentId: selectedStudent,
      categoryId: preCategory ?? selectedCategory ?? categories[0]?.id ?? "",
      rating: "developing",
      note: "",
      observedAt: new Date().toISOString().split("T")[0],
      visibility: "parent_visible",
    });
    setFormError(null);
    setModalOpen(true);
  }

  const studentName = students.find((s) => s.id === selectedStudent)?.name ?? "";

  const classOptions = Array.from(
    new Map(students.filter((s) => s.classId).map((s) => [s.classId, { id: s.classId, name: s.className }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredStudents = students.filter((s) =>
    (!classFilter || s.classId === classFilter) &&
    (!studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  // Derived: observations for selected category, newest first
  const catObs = observations
    .filter((o) => o.categoryId === selectedCategory)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const latestObs = catObs[0];
  const activeCat = categories.find((c) => c.id === selectedCategory);
  const trend = computeTrend(catObs);
  const summary = buildTrendSummary(catObs);
  // Progression strip: most recent 5, displayed oldest→newest
  const progressionObs = catObs.slice(0, 5).reverse();
  const daysSinceLastObs = latestObs ? daysSince(latestObs.observedAt) : null;

  // Domain navigation grouping
  const activeDomainsInNav = categories.filter((c) => observations.some((o) => o.categoryId === c.id));
  const unobservedDomains  = categories.filter((c) => !observations.some((o) => o.categoryId === c.id));
  // Expand unobserved section automatically when no active domains exist yet
  const showUnobservedSection = unobservedOpen || activeDomainsInNav.length === 0;

  if (loading) return <PageSpinner />;

  // Shared domain button renderer (used in both active and unobserved sections)
  const renderDomainButton = (cat: Category) => {
    const cObs = observations
      .filter((o) => o.categoryId === cat.id)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = cObs[0];
    const t = computeTrend(cObs);
    const isSelected = selectedCategory === cat.id;
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
          {latest ? (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${RATING_COLORS[latest.rating]}`}>
              {latest.rating[0].toUpperCase()}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">—</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {cObs.length > 0 ? `${cObs.length} obs` : "No observations"}
          </span>
          {t === "improving"  && <TrendingUp   className="w-3 h-3 text-green-500"  />}
          {t === "declining"  && <TrendingDown className="w-3 h-3 text-orange-500" />}
          {t === "consistent" && <Minus        className="w-3 h-3 text-blue-400"   />}
        </div>
      </button>
    );
  };

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

                  {/* Mobile: horizontal scrollable pills (all domains) */}
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
                              <span
                                className={`text-[10px] font-semibold px-1 rounded ${
                                  isSelected ? "bg-white/20 text-white" : RATING_COLORS[latest.rating]
                                }`}
                              >
                                {latest.rating[0].toUpperCase()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Desktop: vertical list, split into active / unobserved */}
                  <div className="hidden md:flex flex-col gap-0.5">

                    {/* Active domains */}
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

                    {/* Unobserved domains — collapsible when active domains exist */}
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

                      {/* Operational insight: stale domain */}
                      {daysSinceLastObs !== null && daysSinceLastObs >= 30 && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
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

                              {/* Current status with inline scale description */}
                              <div className="mb-4">
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                  <span className="text-sm text-muted-foreground">Currently:</span>
                                  <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${RATING_COLORS[latestObs.rating]}`}>
                                    {latestObs.rating}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground italic mb-1">
                                  {RATING_META[latestObs.rating].description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  as of {latestObs.observedAt} · {latestObs.observedBy}
                                </p>
                              </div>

                              {/* Progression strip — only when 2+ observations */}
                              {progressionObs.length >= 2 && (
                                <div className="mb-4">
                                  <p className="text-xs text-muted-foreground mb-3">
                                    Last {progressionObs.length} observations (oldest → newest)
                                  </p>
                                  <div className="flex items-end gap-2 flex-wrap">
                                    {progressionObs.map((obs, idx) => (
                                      <div key={obs.id} className="flex items-center gap-2">
                                        <div className="text-center">
                                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${RATING_COLORS[obs.rating]}`}>
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

                              {/* Trend summary — shown for all observation counts */}
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
                                {catObs.slice(0, 10).map((obs) => (
                                  <div key={obs.id} className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize flex-shrink-0 ${RATING_COLORS[obs.rating]}`}>
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
                                        {/* Inline scale description — subtle, below the badge */}
                                        <p className="text-[11px] text-muted-foreground italic mb-1">
                                          {RATING_META[obs.rating].description}
                                        </p>
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
                                ))}
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
                  <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
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
                          <Step n={3} text={<span><strong>Trend summary:</strong> a natural-language sentence at the bottom — "Improving across 4 observations — progressed from Emerging to Consistent." Always shown, even for a single observation.</span>} />
                        </div>
                        <Note>The trend sentence references the actual rating labels from your school's scale, so it remains accurate even if a different grading framework is in use.</Note>
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
                          { icon: <TrendingUp className="w-4 h-4 text-green-600" />, label: "Improving", desc: "The most recent observation is at a higher level than the earliest recorded. Good news — consider sharing with the family." },
                          { icon: <Minus className="w-4 h-4 text-blue-500" />, label: "Consistent", desc: "The overall level hasn't changed across observations. May reflect a stable plateau or solidified mastery." },
                          { icon: <TrendingDown className="w-4 h-4 text-orange-500" />, label: "Decline noted", desc: "The most recent observation is lower than the earliest. Consider whether this reflects a genuine regression or a difficult period." },
                        ].map(({ icon, label, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className="flex-shrink-0 mt-0.5">{icon}</span>
                            <div><span className="font-semibold text-xs text-foreground">{label}</span><p className="text-xs mt-0.5">{desc}</p></div>
                          </div>
                        ))}
                        <Tip>Trend is based on the first and last observations — a middle dip does not register as "declining" if the student ends higher. Record regularly for accurate trends.</Tip>
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
                          <Step n={2} text={<span>Select a <strong>rating</strong>. A short description appears below the buttons so you can confirm the right level without memorising the scale.</span>} />
                          <Step n={3} text={<span>Add a <strong>note</strong> with specific evidence: what you observed, in which activity, and context.</span>} />
                          <Step n={4} text={<span>Set the <strong>date</strong> — defaults to today but you can backdate it.</span>} />
                          <Step n={5} text={<span>Set <strong>visibility</strong>: Parent Visible or Internal Only. Click <strong>Save Observation</strong>.</span>} />
                        </div>
                        <Tip>Observations with notes are far more useful over time than ratings alone. Even a single sentence — "Led the morning circle independently" — creates an evidence trail.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "ratings",
                    icon: BookOpen,
                    title: "What each rating means",
                    searchText: "emerging developing consistent advanced rating level scale meaning description",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        <p className="text-xs">Each rating badge shows a short description inline — in the Growth Journey card, in the Recent Evidence list, and in the observation modal. The meanings for the current grading scale are:</p>
                        {[
                          { label: "Emerging",   color: "text-red-600",    desc: RATING_META.emerging.description   },
                          { label: "Developing", color: "text-yellow-600", desc: RATING_META.developing.description },
                          { label: "Consistent", color: "text-blue-600",   desc: RATING_META.consistent.description },
                          { label: "Advanced",   color: "text-green-600",  desc: RATING_META.advanced.description   },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-20 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Ratings are developmental checkpoints, not grades. Use them relative to expected milestones for the class level.</Note>
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
                        <p><strong>Stale alert:</strong> when a domain has had no new observations for 30 or more days, an amber notice appears at the top of the growth detail panel. This is a soft reminder only.</p>
                        <p className="text-xs mt-1"><strong>Domain groups:</strong> the left panel separates domains into two sections — <em>Active</em> (at least one observation recorded) and <em>Not observed yet</em> (no observations). The second group is collapsed by default and expands when you click the toggle. If a student has no observations at all, the full list is always visible.</p>
                        <Note>There's no cross-student reporting view (e.g. "all students Emerging in Social Skills"). That view is planned for a future version.</Note>
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

          <div>
            <label className="block text-sm font-medium mb-2">Rating</label>
            <div className="flex gap-2 flex-wrap">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, rating: r })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    form.rating === r ? RATING_COLORS[r] : "bg-muted hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {/* Inline scale description — updates as user selects a rating */}
            <p className="text-xs text-muted-foreground italic mt-2">
              {RATING_META[form.rating].description}
            </p>
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
              disabled={saving || !form.studentId || !form.categoryId}
            >
              {saving ? "Saving…" : "Save Observation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
