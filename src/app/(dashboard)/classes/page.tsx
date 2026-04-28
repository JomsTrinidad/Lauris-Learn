"use client";
import { useEffect, useState } from "react";
import { Plus, ExternalLink, BookOpen, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, Search, X, Users, Clock, Link2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

function parseTime24(t: string): { h12: number; min: number; ampm: "AM" | "PM" } {
  const [hStr, mStr] = (t ?? "08:00").split(":");
  const h24 = parseInt(hStr ?? "8");
  const min = parseInt(mStr ?? "0");
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h12, min, ampm };
}
function toTime24(h12: number, min: number, ampm: "AM" | "PM"): string {
  let h = h12 % 12;
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { h12, min, ampm } = parseTime24(value);
  const hours = [1,2,3,4,5,6,7,8,9,10,11,12];
  const mins = [0,15,30,45];
  return (
    <div className="flex gap-1.5">
      <Select
        value={String(h12)}
        onChange={(e) => onChange(toTime24(parseInt(e.target.value), min, ampm))}
        className="w-20"
      >
        {hours.map((h) => <option key={h} value={h}>{h}</option>)}
      </Select>
      <Select
        value={String(min).padStart(2, "0")}
        onChange={(e) => onChange(toTime24(h12, parseInt(e.target.value), ampm))}
        className="w-20"
      >
        {mins.map((m) => <option key={m} value={String(m).padStart(2,"0")}>{String(m).padStart(2,"0")}</option>)}
      </Select>
      <Select
        value={ampm}
        onChange={(e) => onChange(toTime24(h12, min, e.target.value as "AM" | "PM"))}
        className="w-20"
      >
        <option>AM</option>
        <option>PM</option>
      </Select>
    </div>
  );
}

interface ClassRecord {
  id: string;
  name: string;
  level: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
  teacherName: string;
  capacity: number;
  enrolled: number;
  isActive: boolean;
  meetingLink: string;
  messengerLink: string;
  nextClassId: string | null;
}

interface AllClassOption {
  id: string;
  name: string;
  level: string;
  schoolYearName: string;
}

interface TeacherOption {
  id: string;
  fullName: string;
}

interface ClassForm {
  name: string;
  level: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  capacity: string;
  isActive: boolean;
  meetingLink: string;
  messengerLink: string;
  nextClassId: string;
}

const EMPTY_FORM: ClassForm = {
  name: "", level: "", startTime: "08:00", endTime: "10:00",
  teacherId: "", capacity: "20", isActive: true, meetingLink: "", messengerLink: "", nextClassId: "",
};

export default function ClassesPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [allClasses, setAllClasses] = useState<AllClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadClasses(), loadTeachers(), loadAllClasses()]);
    setLoading(false);
  }

  async function loadAllClasses() {
    if (!schoolId || !activeYear?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("classes")
      .select("id, name, level, school_years(name)")
      .eq("school_id", schoolId)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllClasses(((data ?? []) as any[]).map((c: any) => ({
      id: c.id,
      name: c.name,
      level: c.level ?? "",
      schoolYearName: c.school_years?.name ?? "",
    })));
  }

  async function loadClasses() {
    const yearId = activeYear?.id;
    if (!yearId) { setClasses([]); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classRows, error: classErr } = await supabase
      .from("classes")
      .select(`id, name, level, start_time, end_time, capacity, is_active, meeting_link, messenger_link, next_class_id,
        class_teachers(teacher_id, teacher:profiles(full_name))`)
      .eq("school_id", schoolId!)
      .eq("school_year_id", yearId)
      .order("start_time") as { data: any[] | null; error: any };

    if (classErr) { setError(classErr.message); return; }

    const classIds: string[] = (classRows ?? []).map((c: { id: string }) => c.id);
    let enrolledByClass: Record<string, number> = {};

    if (classIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eResult = await supabase.from("enrollments").select("class_id").in("class_id", classIds).eq("status", "enrolled") as any;
      const enrollRows = ((eResult.data ?? []) as any[]) as Array<{ class_id: string }>;
      enrollRows.forEach((e) => {
        enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
      });
    }

    setClasses(
      (classRows ?? []).map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ct = ((c as any).class_teachers ?? [])[0];
        return {
          id: c.id,
          name: c.name,
          level: c.level ?? "",
          startTime: c.start_time,
          endTime: c.end_time,
          capacity: c.capacity ?? 0,
          enrolled: enrolledByClass[c.id] ?? 0,
          isActive: c.is_active,
          meetingLink: c.meeting_link ?? "",
          messengerLink: c.messenger_link ?? "",
          nextClassId: c.next_class_id ?? null,
          teacherId: ct?.teacher_id ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          teacherName: (ct?.teacher as any)?.full_name ?? "—",
        };
      })
    );
  }

  async function loadTeachers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("teacher_profiles")
      .select("id, full_name")
      .eq("school_id", schoolId!)
      .eq("is_active", true)
      .order("full_name");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTeachers((data ?? []).map((p: any) => ({ id: p.id, fullName: p.full_name })));
  }

  function openAdd() {
    setEditingClass(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(cls: ClassRecord) {
    setEditingClass(cls);
    setForm({
      name: cls.name,
      level: cls.level,
      startTime: cls.startTime,
      endTime: cls.endTime,
      teacherId: cls.teacherId ?? "",
      capacity: String(cls.capacity),
      isActive: cls.isActive,
      meetingLink: cls.meetingLink,
      messengerLink: cls.messengerLink,
      nextClassId: cls.nextClassId ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Class name is required."); return; }
    if (form.startTime >= form.endTime) { setFormError("Start time must be before end time."); return; }
    const cap = parseInt(form.capacity);
    if (!cap || cap < 1) { setFormError("Capacity must be at least 1."); return; }
    if (!activeYear?.id) { setFormError("No active school year. Set one in Settings."); return; }

    setSaving(true);
    setFormError(null);

    // Enforce unique class name per school year
    const { data: dupes } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("name", form.name.trim());
    const conflicts = (dupes ?? []).filter((c) => !editingClass || c.id !== editingClass.id);
    if (conflicts.length > 0) {
      setFormError(`"${form.name.trim()}" already exists this school year. Use a unique name (e.g. "Kinder AM" or "Kinder Afternoon").`);
      setSaving(false);
      return;
    }

    const payload = {
      school_id: schoolId!,
      school_year_id: activeYear.id,
      name: form.name.trim(),
      level: form.level.trim() || null,
      start_time: form.startTime,
      end_time: form.endTime,
      capacity: cap,
      is_active: form.isActive,
      meeting_link: form.meetingLink.trim() || null,
      messenger_link: form.messengerLink.trim() || null,
      next_class_id: form.nextClassId || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    if (editingClass) {
      const updateResult = await sb.from("classes").update(payload).eq("id", editingClass.id);
      if (updateResult.error) { setFormError(updateResult.error.message); setSaving(false); return; }

      await sb.from("class_teachers").delete().eq("class_id", editingClass.id);
      if (form.teacherId) {
        await sb.from("class_teachers").insert({ class_id: editingClass.id, teacher_id: form.teacherId });
      }
    } else {
      const insertResult = await sb.from("classes").insert(payload).select("id").single();
      if (insertResult.error || !insertResult.data) { setFormError(insertResult.error?.message ?? "Insert failed."); setSaving(false); return; }
      const inserted = insertResult.data as { id: string };

      if (form.teacherId) {
        await sb.from("class_teachers").insert({ class_id: inserted.id, teacher_id: form.teacherId });
      }
    }

    setSaving(false);
    setModalOpen(false);
    await loadClasses();
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure class schedules and assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" />
            Help
          </button>
          <Button onClick={openAdd} disabled={!activeYear}>
            <Plus className="w-4 h-4" /> Add Class
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {!activeYear && (
        <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          No active school year. Go to Settings → School Years to set one before adding classes.
        </div>
      )}

      {classes.length === 0 && activeYear && (
        <p className="text-sm text-muted-foreground text-center py-12">No classes yet. Click "Add Class" to get started.</p>
      )}

      {/* Class cards */}
      {classes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const slots = cls.capacity - cls.enrolled;
            const pct = cls.capacity > 0 ? Math.round((cls.enrolled / cls.capacity) * 100) : 0;
            const atCapacity = slots <= 0;
            return (
              <Card key={cls.id} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{cls.name}</h3>
                      {cls.level && <p className="text-xs text-muted-foreground">{cls.level}</p>}
                    </div>
                    <Badge variant={cls.isActive ? "active" : "archived"}>
                      {cls.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Time</span>
                      <span>{formatTime(cls.startTime)} – {formatTime(cls.endTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Teacher</span>
                      <span>{cls.teacherName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Enrolled / Capacity</span>
                      <span>{cls.enrolled} / {cls.capacity}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Available slots</span>
                      <span className={atCapacity ? "text-red-600 font-medium" : "text-green-600"}>
                        {atCapacity ? "Full" : `${slots} ${slots === 1 ? "slot" : "slots"}`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${atCapacity ? "bg-red-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{pct}% full</p>
                  </div>
                </div>

                <div className="px-5 pb-4 space-y-2">
                  {cls.meetingLink && (
                    <a
                      href={cls.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Google Meet link
                    </a>
                  )}
                  {cls.messengerLink && (
                    <a
                      href={cls.messengerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Messenger group chat
                    </a>
                  )}
                  <button
                    onClick={() => openEdit(cls)}
                    className="w-full text-sm text-primary hover:underline text-left"
                  >
                    Edit class →
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {classes.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2>All Classes — {activeYear?.name}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Class Name</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Schedule</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Teacher</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Capacity</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-4 font-medium">
                      {cls.name}
                      {cls.level && <span className="text-muted-foreground font-normal"> ({cls.level})</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatTime(cls.startTime)} – {formatTime(cls.endTime)}</td>
                    <td className="px-5 py-4">{cls.teacherName}</td>
                    <td className="px-5 py-4">
                      <span className={cls.enrolled >= cls.capacity ? "text-red-600 font-medium" : ""}>
                        {cls.enrolled}/{cls.capacity}
                      </span>
                    </td>
                    <td className="px-5 py-4"><Badge variant={cls.isActive ? "active" : "archived"}>{cls.isActive ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => openEdit(cls)} className="text-primary text-sm hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Classes Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Classes Help</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
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
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );

                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "add-class",
                    icon: Plus,
                    title: "Create a new class",
                    searchText: "add create new class name level time schedule capacity",
                    body: (
                      <div className="space-y-2">
                        <p>Do this before adding students or taking attendance. Each class belongs to the active school year.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Class</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter a <strong>class name</strong> — it must be unique for the school year. Use descriptive names like "Toddlers AM" or "Kinder A" to avoid confusion.</span>} />
                          <Step n={3} text={<span>Fill in <strong>Level / Age Group</strong> (e.g. "2–3 years" or "Pre-Kinder"). This shows up in enrollment, billing, and reports.</span>} />
                          <Step n={4} text={<span>Set the <strong>start and end time</strong>. The time appears on attendance, online sessions, and parent-facing pages.</span>} />
                          <Step n={5} text={<span>Set the <strong>capacity</strong> — the maximum number of students you'll accept. The enrollment bar turns red when the class is full.</span>} />
                          <Step n={6} text={<span>Assign a <strong>teacher</strong> from the dropdown. Teachers listed here must first be added to the school as users.</span>} />
                          <Step n={7} text={<span>Click <strong>Save Class</strong>.</span>} />
                        </div>
                        <Note>The class is tied to the currently active school year — it won't appear if you switch to a different year. Set the correct active year in Settings first.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "edit-class",
                    icon: Clock,
                    title: "Edit class details (name, time, teacher, capacity)",
                    searchText: "edit update change class name time teacher capacity schedule",
                    body: (
                      <div className="space-y-2">
                        <p>You can change any class detail at any time — it won't affect existing attendance or billing records.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Edit class →</strong> on the class card, or <strong>Edit</strong> in the table row below.</span>} />
                          <Step n={2} text={<span>Update the fields you need — name, time, teacher, capacity, or links.</span>} />
                          <Step n={3} text={<span>Click <strong>Save Class</strong>.</span>} />
                        </div>
                        <Tip>Changing the class name will update it everywhere — attendance logs, billing records, and student profiles — since they all reference the class ID, not the name text.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "deactivate",
                    icon: Users,
                    title: "Deactivate a class (end-of-year or discontinued)",
                    searchText: "deactivate inactive archive disable close class end year",
                    body: (
                      <div className="space-y-2">
                        <p>Inactive classes are hidden from attendance and enrollment dropdowns but remain in historical records.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the class by clicking <strong>Edit class →</strong>.</span>} />
                          <Step n={2} text={<span>Uncheck <strong>Active class</strong> at the bottom of the form.</span>} />
                          <Step n={3} text={<span>Click <strong>Save Class</strong>. The badge on the card changes to "Inactive".</span>} />
                        </div>
                        <Note>Deactivating a class doesn't withdraw its students. Their enrollment records remain. You'd need to manually change enrollment statuses from the Students page if needed.</Note>
                        <Tip>At the start of a new school year, simply create new classes for that year rather than reactivating old ones. Old classes are kept for historical reference.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "capacity",
                    icon: Users,
                    title: "Understanding the enrollment bar and capacity",
                    searchText: "capacity enrollment full slots bar red progress enrolled",
                    body: (
                      <div className="space-y-2">
                        <p>Each class card shows a real-time count of how many students are enrolled vs. how many seats you set.</p>
                        <div className="space-y-2.5 mt-2">
                          {[
                            { label: "Green bar", desc: "Class has available seats." },
                            { label: "Red bar + \"Full\"", desc: "No seats remaining. The system doesn't block further enrollments — it just flags it visually. You can still add students manually." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="font-semibold text-xs w-28 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Note>The enrolled count only includes students with <strong>Enrolled</strong> status. Waitlisted students are not counted against capacity here, but they are shown as demand in the Enrollment → Analytics view.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "links",
                    icon: Link2,
                    title: "Add Google Meet and Messenger chat links",
                    searchText: "meeting link google meet messenger chat group link online class parent",
                    body: (
                      <div className="space-y-2">
                        <p>These links appear on class cards and are surfaced to parents in the parent portal.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the class edit modal.</span>} />
                          <Step n={2} text={<span>Paste the <strong>Google Meet link</strong> (e.g. <code className="bg-muted px-1 rounded text-[11px]">https://meet.google.com/xxx-xxxx-xxx</code>) — used for scheduled online sessions.</span>} />
                          <Step n={3} text={<span>Paste the <strong>Messenger group chat link</strong> (e.g. <code className="bg-muted px-1 rounded text-[11px]">https://m.me/g/...</code>) — parents see a "Join Class Chat" button in the parent portal linking here.</span>} />
                          <Step n={4} text={<span>Save. Both links appear as clickable items on the class card.</span>} />
                        </div>
                        <Tip>To get the Messenger group link: open the group chat on Messenger, click the group name at the top → <strong>Share Link</strong>. Copy and paste that URL here.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "promotion-path",
                    icon: GraduationCap,
                    title: "Set the promotion path (next class)",
                    searchText: "promotion path next class promote year end graduate suggest advance",
                    body: (
                      <div className="space-y-2">
                        <p>The promotion path tells the system which class students in this class should move to next year. This drives the default suggestions in the Promote Students workflow.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the class edit modal.</span>} />
                          <Step n={2} text={<span>In <strong>Promotion Path (Next Class)</strong>, select the class students will typically move to.</span>} />
                          <Step n={3} text={<span>Save. The next year's classes must already exist for them to appear in this dropdown.</span>} />
                        </div>
                        <Note>During the Students → Promote Students workflow, the system pre-fills each student's next class based on this setting. You can still override it per student before confirming.</Note>
                        <Tip>Set promotion paths at the start of the year once you've created the new year's classes. That way the Promote Students bulk action is mostly one click.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "school-year",
                    icon: BookOpen,
                    title: "Classes are per school year — what that means",
                    searchText: "school year active year class not showing missing previous year",
                    body: (
                      <div className="space-y-2">
                        <p>Every class belongs to one school year. This page only shows classes for the currently <strong>active</strong> school year.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>If you don't see a class you created before, check which year is active: go to <strong>Settings → School Years</strong> and confirm the correct year is set to Active.</span>} />
                          <Step n={2} text={<span>Classes from previous years still exist in the database — they're used for historical attendance and billing — they just don't show on this page.</span>} />
                          <Step n={3} text={<span>At the start of each new school year, create fresh classes for that year rather than reusing old ones.</span>} />
                        </div>
                        <Note>When you add a class, it's automatically assigned to the current active school year. You can't manually assign a class to a different year from this page.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "no-teacher",
                    icon: Users,
                    title: "Teacher isn't showing in the dropdown",
                    searchText: "teacher not showing dropdown add teacher staff assign role",
                    body: (
                      <div className="space-y-2">
                        <p>The teacher dropdown only lists users who have the <strong>Teacher</strong> role and are assigned to your school.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Ask the teacher to sign up at the login page, or have an admin create their account.</span>} />
                          <Step n={2} text={<span>In Supabase (or your user management), set their profile's <code className="bg-muted px-1 rounded text-[11px]">role</code> to <strong>teacher</strong> and <code className="bg-muted px-1 rounded text-[11px]">school_id</code> to your school.</span>} />
                          <Step n={3} text={<span>Return to Classes and their name will appear in the dropdown.</span>} />
                        </div>
                        <Note>Each class can only have one assigned teacher. If you need two teachers per class, assign the primary teacher here and use the notes field or an external roster for the secondary.</Note>
                      </div>
                    ),
                  },
                ];

                const q = helpSearch.trim().toLowerCase();
                const filtered = q
                  ? topics.filter((t) =>
                      t.title.toLowerCase().includes(q) ||
                      t.searchText.toLowerCase().includes(q)
                    )
                  : topics;

                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                      <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                      <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                    </div>
                  );
                }

                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button
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
              {helpSearch ? (
                <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span>
              ) : (
                <span>8 topics · click any to expand</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingClass ? "Edit Class" : "Add Class"}
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Class Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Toddlers" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Level / Age Group</label>
              <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="e.g. 2–3 years" />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time *</label>
              <TimePicker value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time *</label>
              <TimePicker value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Assigned Teacher</label>
            <Select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
              <option value="">— None —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Capacity *</label>
              <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">School Year</label>
              <Input value={activeYear?.name ?? "No active year"} disabled className="opacity-60 cursor-not-allowed" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Google Meet Link</label>
            <Input
              value={form.meetingLink}
              onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
              placeholder="https://meet.google.com/..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Messenger Group Chat Link</label>
            <Input
              value={form.messengerLink}
              onChange={(e) => setForm({ ...form, messengerLink: e.target.value })}
              placeholder="https://m.me/g/..."
            />
            <p className="text-xs text-muted-foreground mt-1">Parents will see a "Join Class Chat" button linking here.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Promotion Path (Next Class)</label>
            <Select value={form.nextClassId} onChange={(e) => setForm({ ...form, nextClassId: e.target.value })}>
              <option value="">— None —</option>
              {allClasses
                .filter((c) => !editingClass || c.id !== editingClass.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.level ? ` (${c.level})` : ""}
                  </option>
                ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Students who complete this class will be suggested this next class during promotion.</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="isActive" className="text-sm">Active class</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save Class"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
