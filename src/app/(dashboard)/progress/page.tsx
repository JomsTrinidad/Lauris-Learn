"use client";
import { useEffect, useState } from "react";
import { Plus, BookOpen, Eye, EyeOff, Search, HelpCircle, X, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
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

const RATING_COLORS: Record<Rating, string> = {
  emerging:   "bg-red-100 text-red-700",
  developing: "bg-yellow-100 text-yellow-700",
  consistent: "bg-blue-100 text-blue-700",
  advanced:   "bg-green-100 text-green-700",
};

const RATINGS: Rating[] = ["emerging", "developing", "consistent", "advanced"];

export default function ProgressPage() {
  const { schoolId, activeYear, userId, userName } = useSchoolContext();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});
  const [studentSearch, setStudentSearch] = useState("");
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

    setObservations(
      (data ?? []).map((o) => ({
        id: o.id,
        studentId: o.student_id,
        categoryId: o.category_id,
        rating: o.rating as Rating,
        note: o.note ?? "",
        observedAt: o.observed_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        observedBy: (o as any).observer?.full_name ?? "—",
        visibility: o.visibility as Visibility,
      }))
    );
  }

  useEffect(() => {
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

    // Refresh observations if we added one for the currently viewed student
    if (form.studentId === selectedStudent) await loadObservations(selectedStudent);
  }

  function openModal() {
    setForm({
      studentId: selectedStudent,
      categoryId: categories[0]?.id ?? "",
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

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Progress Tracking</h1>
          <p className="text-muted-foreground text-sm mt-1">Record and track student developmental progress</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={openModal} disabled={students.length === 0}>
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
                <Select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setStudentSearch(""); }} className="sm:w-44">
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
                <p className="text-xs text-muted-foreground mt-1">{filteredStudents.length} of {students.length} student{students.length !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>

          {!selectedStudent ? (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a student above to view their progress.</p>
            </div>
          ) : <>
          {/* Progress grid by category */}
          <div>
            <h2 className="mb-4">{studentName} – Progress Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const latest = observations
                  .filter((o) => o.categoryId === cat.id)
                  .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
                return (
                  <Card key={cat.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-sm mb-0.5">{cat.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{cat.description}</p>
                      {latest ? (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${RATING_COLORS[latest.rating]}`}>
                              {latest.rating}
                            </span>
                            {latest.visibility === "internal_only" ? (
                              <span title="Internal only" className="text-muted-foreground"><EyeOff className="w-3 h-3" /></span>
                            ) : (
                              <span title="Visible to parents" className="text-muted-foreground"><Eye className="w-3 h-3" /></span>
                            )}
                          </div>
                          {latest.note && <p className="text-xs text-muted-foreground mt-1 italic">"{latest.note}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{latest.observedAt} · {latest.observedBy}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No observations yet</span>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Recent observations list */}
          {observations.length > 0 && (
            <Card>
              <CardHeader>
                <h2>Recent Observations</h2>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {observations.map((obs) => {
                    const cat = categories.find((c) => c.id === obs.categoryId);
                    return (
                      <div key={obs.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium">{cat?.name ?? "—"}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RATING_COLORS[obs.rating]}`}>
                                {obs.rating}
                              </span>
                              {obs.visibility === "internal_only" && (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5"><EyeOff className="w-3 h-3" /> Internal</span>
                              )}
                            </div>
                            {obs.note && <p className="text-sm text-muted-foreground">{obs.note}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground">{obs.observedAt}</p>
                            <p className="text-xs text-muted-foreground">{obs.observedBy}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          </>}
        </>
      )}

      {/* Add Observation Modal */}
      {/* ── Progress Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Progress Tracking Help</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search topics..." value={helpSearch} onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
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
                    id: "record-observation",
                    icon: Plus,
                    title: "Record an observation for a student",
                    searchText: "record observation add student category rating note date",
                    body: (
                      <div className="space-y-2">
                        <p>Observations track how a student is developing across different skill areas. You can record as many as you like per student.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Record Observation</strong> (top right). The student pre-selects to whoever you have open in the panel.</span>} />
                          <Step n={2} text={<span>Choose a <strong>category</strong> — these are the developmental areas set up for your school (Participation, Social Skills, etc.).</span>} />
                          <Step n={3} text={<span>Select a <strong>rating</strong>: Emerging → Developing → Consistent → Advanced.</span>} />
                          <Step n={4} text={<span>Optionally add a <strong>note</strong> with specific context: what you observed, during which activity.</span>} />
                          <Step n={5} text={<span>Set the <strong>date observed</strong> — defaults to today but you can backdate it.</span>} />
                          <Step n={6} text={<span>Choose <strong>visibility</strong>: Parent Visible (parents see it) or Internal Only (staff only).</span>} />
                          <Step n={7} text={<span>Click <strong>Save Observation</strong>.</span>} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "ratings",
                    icon: BookOpen,
                    title: "What each rating means",
                    searchText: "emerging developing consistent advanced rating level scale meaning",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { label: "Emerging", color: "text-red-600", desc: "The student is just beginning to show this skill. Needs significant support and guidance." },
                          { label: "Developing", color: "text-yellow-600", desc: "The student is working on this skill but is not yet consistent. Still needs teacher prompting." },
                          { label: "Consistent", color: "text-blue-600", desc: "The student demonstrates this skill reliably across most situations with minimal prompting." },
                          { label: "Advanced", color: "text-green-600", desc: "The student demonstrates this skill confidently and can often model it for peers." },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-20 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Ratings are developmental checkpoints, not grades. Use them relative to expected milestones for the class level, not a universal standard.</Note>
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
                            { label: "Parent Visible", icon: "👁", desc: "Parents see this in the parent portal's Progress page. Only the most recent observation per category is shown to parents." },
                            { label: "Internal Only", icon: "🔒", desc: "Staff-only. Use for sensitive notes, detailed observations, or flags you're not ready to share." },
                          ].map(({ label, icon, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="text-sm w-4 flex-shrink-0 mt-0.5">{icon}</span>
                              <div><span className="font-semibold text-xs text-foreground">{label}</span><p className="text-xs mt-0.5">{desc}</p></div>
                            </div>
                          ))}
                        </div>
                        <Tip>If you record a new Parent Visible observation for a category, it replaces what parents currently see for that category in their portal.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "view-student",
                    icon: Search,
                    title: "View a student's observation history",
                    searchText: "view history student observations list timeline filter class search",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-2 mt-1">
                          <Step n={1} text={<span>Use the <strong>class filter</strong> and <strong>student search</strong> to find the student.</span>} />
                          <Step n={2} text={<span>Click a student's name to load their observations. All observations appear in reverse chronological order.</span>} />
                          <Step n={3} text={<span>Each row shows category, rating badge, note, date, who recorded it, and visibility (eye = parent visible, lock = internal).</span>} />
                        </div>
                        <Note>There's no cross-student view (e.g. "all students Emerging in Social Skills"). That reporting view is planned for a future version.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "categories",
                    icon: BookOpen,
                    title: "Progress categories — where they come from",
                    searchText: "categories 7 default participation social skills add custom manage",
                    body: (
                      <div className="space-y-2">
                        <p>Categories are the developmental dimensions you evaluate — e.g. Participation, Social Skills, Fine Motor.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Your school starts with <strong>7 default categories</strong> seeded at setup.</span>} />
                          <Step n={2} text={<span>There's no UI to add categories yet. To add a custom one, ask your Super Admin to insert a row into <code className="bg-muted px-1 rounded text-[11px]">progress_categories</code> with your school_id.</span>} />
                        </div>
                        <Note>Category management UI is planned for a future version of this page.</Note>
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q)) : topics;
                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                    <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                  </div>
                );
                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}>
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {open && <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">{item.body}</div>}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch ? <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span> : <span>5 topics · click any to expand</span>}
            </div>
          </div>
        </div>
      )}

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
            <label className="block text-sm font-medium mb-1">Category</label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">— Select category —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Rating</label>
            <div className="flex gap-2 flex-wrap">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, rating: r })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    form.rating === r ? RATING_COLORS[r] : "bg-muted hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date Observed</label>
            <Input type="date" value={form.observedAt} onChange={(e) => setForm({ ...form, observedAt: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Note</label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Describe what you observed..." rows={2} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Visibility</label>
            <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}>
              <option value="parent_visible">Visible to parents</option>
              <option value="internal_only">Internal only (teachers / admin)</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={saving || !form.studentId || !form.categoryId}>
              {saving ? "Saving…" : "Save Observation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
