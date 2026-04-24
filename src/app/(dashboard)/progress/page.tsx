"use client";
import { useEffect, useState } from "react";
import { Plus, BookOpen, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
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
      .select("student_id, students(first_name, last_name)")
      .eq("school_year_id", activeYear.id)
      .eq("status", "enrolled");

    const opts: StudentOption[] = (data ?? []).map((e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (e as any).students;
      return { id: e.student_id, name: s ? `${s.first_name} ${s.last_name}` : e.student_id };
    }).sort((a, b) => a.name.localeCompare(b.name));

    setStudents(opts);
    if (opts.length > 0 && !selectedStudent) setSelectedStudent(opts[0].id);
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

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Progress Tracking</h1>
          <p className="text-muted-foreground text-sm mt-1">Record and track student developmental progress</p>
        </div>
        <Button onClick={openModal} disabled={students.length === 0}>
          <Plus className="w-4 h-4" /> Record Observation
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No enrolled students. Add students first.</p>
      ) : (
        <>
          {/* Student selector */}
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <BookOpen className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">View progress for</label>
                <Select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-64">
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
            </CardContent>
          </Card>

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
        </>
      )}

      {/* Add Observation Modal */}
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
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.studentId || !form.categoryId}>
              {saving ? "Saving…" : "Save Observation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
