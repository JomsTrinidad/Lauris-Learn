"use client";
import { useEffect, useState } from "react";
import { Star, Plus, Trash2, Search, BookOpen, HelpCircle, X, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
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
  createdBy: string | null;
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
  const { schoolId, userId, userRole } = useSchoolContext();
  const supabase = createClient();

  const [moments, setMoments] = useState<ProudMoment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});
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
        id, student_id, category, note, created_at, created_by,
        students(first_name, last_name),
        created_by_profile:profiles!created_by(full_name),
        proud_moment_reactions(reaction_type)
      `)
      .eq("school_id", schoolId)
      .is("deleted_at", null)
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
        createdBy: m.created_by ?? null,
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
    // Soft-delete: set deleted_at so parents immediately lose visibility.
    // RLS UPDATE policy allows creator and school_admin to perform this update.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("proud_moments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", momentId);
    if (!err) setMoments((prev) => prev.filter((m) => m.id !== momentId));
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
        <div className="flex items-center gap-2">
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Moment
          </Button>
        </div>
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
                    {(m.createdBy === userId || userRole === "school_admin" || userRole === "super_admin") && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-1"
                        title="Remove moment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Proud Moments Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Proud Moments Help</h2>
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
                    id: "add-moment",
                    icon: Star,
                    title: "Record a proud moment",
                    searchText: "add record moment student achievement celebrate category note",
                    body: (
                      <div className="space-y-2">
                        <p>Use Proud Moments to celebrate a student's positive behavior or achievement and share it with their parents.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Moment</strong> (top right).</span>} />
                          <Step n={2} text={<span>Select the <strong>student</strong> from the dropdown.</span>} />
                          <Step n={3} text={<span>Choose a <strong>category</strong> by clicking one of the coloured chips: Effort, Kindness, Focus, Participation, Independence, Creativity, Improvement, or Helping Others.</span>} />
                          <Step n={4} text={<span>Optionally add a <strong>note</strong> — a short sentence about what the student did. This is the most meaningful part for parents (e.g. "Juan helped a classmate tie their shoes today").</span>} />
                          <Step n={5} text={<span>Click <strong>Save Moment</strong>. It immediately appears in the parent's portal.</span>} />
                        </div>
                        <Note>Proud moments are always visible to parents — there's no internal-only option here (use Progress Tracking for that). Keep notes positive and specific.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "categories",
                    icon: Star,
                    title: "What the categories mean",
                    searchText: "effort kindness focus participation independence creativity improvement helping others category",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { label: "Effort", desc: "Student tried hard even when something was difficult." },
                          { label: "Kindness", desc: "Student showed care, compassion, or generosity toward others." },
                          { label: "Focus", desc: "Student stayed on task and was attentive during an activity." },
                          { label: "Participation", desc: "Student actively engaged, volunteered answers, or joined in activities." },
                          { label: "Independence", desc: "Student completed a task without needing prompting or assistance." },
                          { label: "Creativity", desc: "Student showed original thinking or an imaginative approach." },
                          { label: "Improvement", desc: "Student showed noticeable growth from a previous attempt." },
                          { label: "Helping Others", desc: "Student assisted a classmate or contributed positively to the group." },
                        ].map(({ label, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className="font-semibold text-xs w-28 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    id: "reactions",
                    icon: Star,
                    title: "Reactions — what they are",
                    searchText: "reaction emoji proud great job keep going heart clap star parent",
                    body: (
                      <div className="space-y-2">
                        <p>Parents can react to proud moments from their portal using three reaction types.</p>
                        <div className="space-y-2.5 mt-2">
                          {[
                            { emoji: "❤️", label: "Proud", desc: "Parent is proud of their child." },
                            { emoji: "👏", label: "Great Job", desc: "Parent is cheering the achievement." },
                            { emoji: "🌟", label: "Keep Going", desc: "Parent is encouraging continued effort." },
                          ].map(({ emoji, label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="text-base w-6 flex-shrink-0">{emoji}</span>
                              <div><span className="font-semibold text-xs text-foreground">{label}</span><p className="text-xs mt-0.5">{desc}</p></div>
                            </div>
                          ))}
                        </div>
                        <Note>Reaction counts are shown on each moment card (e.g. "❤️ 2"). You can see at a glance which moments parents engaged with most.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "delete",
                    icon: Trash2,
                    title: "Delete a proud moment",
                    searchText: "delete remove trash icon soft delete hide parent",
                    body: (
                      <div className="space-y-2">
                        <p>If you need to remove a proud moment (e.g. wrong student selected), use the delete action.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Find the moment card and click the <strong>trash icon</strong> on the right side of the card.</span>} />
                          <Step n={2} text={<span>The moment is soft-deleted immediately — it disappears from this view and from the parent portal.</span>} />
                        </div>
                        <Tip>Deletion is instant with no confirmation dialog — be deliberate. The record is soft-deleted (not permanently erased) so it can be recovered from the database by a Super Admin if needed.</Tip>
                        <Note>Only the creator of a moment and school admins can delete it. Teachers can delete their own entries.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "search-filter",
                    icon: Search,
                    title: "Find a proud moment",
                    searchText: "search filter find student category name look up",
                    body: (
                      <div className="space-y-2">
                        <p>Use the search bar at the top to filter moments by student name or category.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Type a <strong>student name</strong> to see only that student's moments.</span>} />
                          <Step n={2} text={<span>Type a <strong>category name</strong> (e.g. "Kindness") to see all moments of that type across all students.</span>} />
                        </div>
                        <Note>The list shows the 100 most recent moments. There's no date filter — if you need to find older entries, search by the student's name to narrow the list.</Note>
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
