"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

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
}

const EMPTY_FORM: ClassForm = {
  name: "", level: "", startTime: "08:00", endTime: "10:00",
  teacherId: "", capacity: "20", isActive: true,
};

export default function ClassesPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadClasses(), loadTeachers()]);
    setLoading(false);
  }

  async function loadClasses() {
    const yearId = activeYear?.id;
    if (!yearId) { setClasses([]); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classRows, error: classErr } = await supabase
      .from("classes")
      .select(`id, name, level, start_time, end_time, capacity, is_active,
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
          teacherId: ct?.teacher_id ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          teacherName: (ct?.teacher as any)?.full_name ?? "—",
        };
      })
    );
  }

  async function loadTeachers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("school_id", schoolId!)
      .in("role", ["teacher", "school_admin"])
      .order("full_name");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTeachers((data ?? [] as any[]).map((p) => ({ id: p.id, fullName: p.full_name })));
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

    const payload = {
      school_id: schoolId!,
      school_year_id: activeYear.id,
      name: form.name.trim(),
      level: form.level.trim() || null,
      start_time: form.startTime,
      end_time: form.endTime,
      capacity: cap,
      is_active: form.isActive,
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
        <Button onClick={openAdd} disabled={!activeYear}>
          <Plus className="w-4 h-4" /> Add Class
        </Button>
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

                <div className="px-5 pb-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time *</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time *</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
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
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save Class"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
