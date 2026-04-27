"use client";
import { useEffect, useState } from "react";
import { Star, Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

const CATEGORIES = [
  "Effort", "Kindness", "Focus", "Participation",
  "Independence", "Creativity", "Improvement", "Helping Others",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Effort":         "bg-blue-100 text-blue-700",
  "Kindness":       "bg-pink-100 text-pink-700",
  "Focus":          "bg-purple-100 text-purple-700",
  "Participation":  "bg-amber-100 text-amber-700",
  "Independence":   "bg-green-100 text-green-700",
  "Creativity":     "bg-orange-100 text-orange-700",
  "Improvement":    "bg-teal-100 text-teal-700",
  "Helping Others": "bg-rose-100 text-rose-700",
};

const REACTIONS = [
  { type: "proud",     emoji: "❤️" },
  { type: "great_job", emoji: "👏" },
  { type: "keep_going",emoji: "🌟" },
];

interface ProudMoment {
  id: string;
  studentId: string;
  studentName: string;
  category: string;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  reactionCounts: Record<string, number>;
}

interface StudentOption {
  id: string;
  name: string;
  className: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function ProudMomentsPage() {
  const { schoolId, userId } = useSchoolContext();
  const supabase = createClient();

  const [moments, setMoments] = useState<ProudMoment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ studentId: "", category: "Kindness", note: "" });

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadStudents(), loadMoments()]);
    setLoading(false);
  }

  async function loadStudents() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("students")
      .select("id, first_name, last_name, enrollments(classes(name))")
      .eq("school_id", schoolId)
      .order("first_name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStudents(((data ?? []) as any[]).map((s: any) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      className: s.enrollments?.[0]?.classes?.name ?? "—",
    })));
  }

  async function loadMoments() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from("proud_moments")
      .select(`
        id, student_id, category, note, created_at,
        students(first_name, last_name),
        created_by_profile:profiles!created_by(full_name),
        proud_moment_reactions(reaction_type)
      `)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (err) { setError("Could not load proud moments."); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMoments(((data ?? []) as any[]).map((m: any) => {
      const counts: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (m.proud_moment_reactions ?? []) as any[]) {
        counts[r.reaction_type] = (counts[r.reaction_type] ?? 0) + 1;
      }
      return {
        id: m.id,
        studentId: m.student_id,
        studentName: m.students ? `${m.students.first_name} ${m.students.last_name}` : "Student",
        category: m.category,
        note: m.note ?? null,
        createdAt: m.created_at,
        createdByName: m.created_by_profile?.full_name ?? null,
        reactionCounts: counts,
      };
    }));
  }

  async function handleSave() {
    if (!form.studentId) { setFormError("Please select a student."); return; }
    if (!schoolId || !userId) return;
    setSaving(true);
    setFormError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("proud_moments")
      .insert({
        school_id: schoolId,
        student_id: form.studentId,
        created_by: userId,
        category: form.category,
        note: form.note.trim() || null,
      });
    setSaving(false);
    if (err) { setFormError("Could not save. Please try again."); return; }
    setShowModal(false);
    setForm({ studentId: "", category: "Kindness", note: "" });
    loadMoments();
  }

  async function handleDelete(momentId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("proud_moments").delete().eq("id", momentId);
    setMoments((prev) => prev.filter((m) => m.id !== momentId));
  }

  const filtered = moments.filter((m) =>
    m.studentName.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <PageSpinner />;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proud Moments</h1>
          <p className="text-muted-foreground text-sm mt-1">Celebrate student achievements and share them with parents.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Moment
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by student or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? "No moments match your search." : "No proud moments yet."}</p>
            {!search && <p className="text-sm mt-1">Celebrate a student by adding their first proud moment.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const totalReactions = Object.values(m.reactionCounts).reduce((a, b) => a + b, 0);
            return (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{m.studentName}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[m.category] ?? "bg-gray-100 text-gray-700"}`}>
                          {m.category}
                        </span>
                      </div>
                      {m.note && (
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">"{m.note}"</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(m.createdAt)}{m.createdByName ? ` · ${m.createdByName}` : ""}
                        </span>
                        {totalReactions > 0 && (
                          <div className="flex items-center gap-1.5">
                            {REACTIONS.filter((r) => (m.reactionCounts[r.type] ?? 0) > 0).map((r) => (
                              <span key={r.type} className="text-xs bg-muted rounded-full px-2 py-0.5">
                                {r.emoji} {m.reactionCounts[r.type]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-1"
                      title="Delete moment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setFormError(null); }}
        title="Add Proud Moment"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Student</label>
            <Select
              value={form.studentId}
              onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
            >
              <option value="">Select a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.className}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    form.category === cat
                      ? (CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700") + " border-transparent"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="e.g. Helped a classmate without being asked."
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save Moment"}
            </Button>
            <ModalCancelButton />
          </div>
        </div>
      </Modal>
    </div>
  );
}
