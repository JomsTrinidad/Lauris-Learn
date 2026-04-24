"use client";
import { useEffect, useState } from "react";
import { Search, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type EnrollmentStatus = "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  classId: string | null;
  className: string;
  enrollmentId: string | null;
  enrollmentStatus: EnrollmentStatus | null;
  guardianId: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianRelationship: string;
}

interface ClassOption {
  id: string;
  name: string;
  enrolled: number;
  capacity: number;
}

interface StudentForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  classId: string;
  enrollmentStatus: string;
  parentName: string;
  relationship: string;
  contact: string;
  email: string;
}

const EMPTY_FORM: StudentForm = {
  firstName: "", lastName: "", dateOfBirth: "", gender: "",
  classId: "", enrollmentStatus: "enrolled",
  parentName: "", relationship: "Mother", contact: "", email: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "enrolled", label: "Enrolled" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "inquiry", label: "Inquiry" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "completed", label: "Completed" },
];

export default function StudentsPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [students, setStudents] = useState<Student[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<StudentForm>(EMPTY_FORM);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadStudents(), loadClasses()]);
    setLoading(false);
  }

  async function loadStudents() {
    const yearId = activeYear?.id ?? null;

    const { data, error: err } = await supabase
      .from("students")
      .select(`
        id, first_name, last_name, date_of_birth, gender,
        guardians(id, full_name, relationship, phone, email, is_primary),
        enrollments(id, status, class_id, school_year_id, classes(name))
      `)
      .eq("school_id", schoolId!)
      .eq("is_active", true)
      .order("last_name");

    if (err) { setError(err.message); return; }

    setStudents(
      (data ?? []).map((s) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const guardians: any[] = (s as any).guardians ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enrollments: any[] = (s as any).enrollments ?? [];

        const primaryGuardian = guardians.find((g) => g.is_primary) ?? guardians[0] ?? null;
        const activeEnrollment = yearId
          ? enrollments.find((e) => e.school_year_id === yearId)
          : enrollments[0] ?? null;

        return {
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          dateOfBirth: s.date_of_birth ?? null,
          gender: s.gender ?? null,
          classId: activeEnrollment?.class_id ?? null,
          className: activeEnrollment?.classes?.name ?? "—",
          enrollmentId: activeEnrollment?.id ?? null,
          enrollmentStatus: activeEnrollment?.status ?? null,
          guardianId: primaryGuardian?.id ?? null,
          guardianName: primaryGuardian?.full_name ?? "—",
          guardianPhone: primaryGuardian?.phone ?? "—",
          guardianEmail: primaryGuardian?.email ?? "",
          guardianRelationship: primaryGuardian?.relationship ?? "",
        };
      })
    );
  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    const { data } = await supabase
      .from("classes")
      .select("id, name, capacity")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("start_time");

    const classIds = (data ?? []).map((c) => c.id);
    let enrolledByClass: Record<string, number> = {};
    if (classIds.length > 0) {
      const { data: enrollRows } = await supabase
        .from("enrollments")
        .select("class_id")
        .in("class_id", classIds)
        .eq("status", "enrolled");
      (enrollRows ?? []).forEach((e) => {
        enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
      });
    }

    setClassOptions(
      (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity ?? 0,
        enrolled: enrolledByClass[c.id] ?? 0,
      }))
    );
  }

  async function handleAdd() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setFormError("First and last name are required."); return; }
    if (!form.parentName.trim()) { setFormError("Parent/guardian name is required."); return; }
    if (!activeYear?.id) { setFormError("No active school year. Set one in Settings."); return; }

    if (form.classId && form.enrollmentStatus === "enrolled") {
      const cls = classOptions.find((c) => c.id === form.classId);
      if (cls && cls.enrolled >= cls.capacity) {
        setFormError(`${cls.name} is at full capacity (${cls.capacity}/${cls.capacity}). Choose another class or set status to Waitlisted.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    const { data: student, error: sErr } = await supabase
      .from("students")
      .insert({
        school_id: schoolId!,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (sErr || !student) { setFormError(sErr?.message ?? "Failed to create student."); setSaving(false); return; }

    await supabase.from("guardians").insert({
      student_id: student.id,
      full_name: form.parentName.trim(),
      relationship: form.relationship,
      phone: form.contact.trim() || null,
      email: form.email.trim() || null,
      is_primary: true,
    });

    if (form.classId) {
      await supabase.from("enrollments").insert({
        student_id: student.id,
        class_id: form.classId,
        school_year_id: activeYear.id,
        status: form.enrollmentStatus,
      });
    }

    setSaving(false);
    setAddModalOpen(false);
    setForm(EMPTY_FORM);
    await loadAll();
  }

  function openEdit(student: Student) {
    setEditingStudent(student);
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth ?? "",
      gender: student.gender ?? "",
      classId: student.classId ?? "",
      enrollmentStatus: student.enrollmentStatus ?? "enrolled",
      parentName: student.guardianName === "—" ? "" : student.guardianName,
      relationship: student.guardianRelationship || "Mother",
      contact: student.guardianPhone === "—" ? "" : student.guardianPhone,
      email: student.guardianEmail,
    });
    setEditFormError(null);
    setSelectedStudent(null);
    setEditModalOpen(true);
  }

  async function handleEdit() {
    if (!editingStudent) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) { setEditFormError("First and last name are required."); return; }
    if (!editForm.parentName.trim()) { setEditFormError("Parent/guardian name is required."); return; }

    setSaving(true);
    setEditFormError(null);

    // Update student record
    const { error: sErr } = await supabase
      .from("students")
      .update({
        first_name: editForm.firstName.trim(),
        last_name: editForm.lastName.trim(),
        date_of_birth: editForm.dateOfBirth || null,
        gender: editForm.gender || null,
      })
      .eq("id", editingStudent.id);

    if (sErr) { setEditFormError(sErr.message); setSaving(false); return; }

    // Update or insert guardian
    if (editingStudent.guardianId) {
      await supabase.from("guardians").update({
        full_name: editForm.parentName.trim(),
        relationship: editForm.relationship,
        phone: editForm.contact.trim() || null,
        email: editForm.email.trim() || null,
      }).eq("id", editingStudent.guardianId);
    } else {
      await supabase.from("guardians").insert({
        student_id: editingStudent.id,
        full_name: editForm.parentName.trim(),
        relationship: editForm.relationship,
        phone: editForm.contact.trim() || null,
        email: editForm.email.trim() || null,
        is_primary: true,
      });
    }

    // Handle enrollment change
    if (editingStudent.enrollmentId) {
      if (editForm.classId) {
        await supabase.from("enrollments").update({
          class_id: editForm.classId,
          status: editForm.enrollmentStatus,
        }).eq("id", editingStudent.enrollmentId);
      } else {
        // No class selected — update status only, keep existing class
        await supabase.from("enrollments").update({
          status: editForm.enrollmentStatus,
        }).eq("id", editingStudent.enrollmentId);
      }
    } else if (editForm.classId && activeYear?.id) {
      // New enrollment
      await supabase.from("enrollments").insert({
        student_id: editingStudent.id,
        class_id: editForm.classId,
        school_year_id: activeYear.id,
        status: editForm.enrollmentStatus,
      });
    }

    setSaving(false);
    setEditModalOpen(false);
    setEditingStudent(null);
    await loadAll();
  }

  const filtered = students.filter((s) => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const matchSearch = !search || fullName.includes(search.toLowerCase()) || s.guardianName.toLowerCase().includes(search.toLowerCase());
    const matchClass = !classFilter || s.classId === classFilter;
    const matchStatus = !statusFilter || s.enrollmentStatus === statusFilter;
    return matchSearch && matchClass && matchStatus;
  });

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Students</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage student information and enrollment</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setAddModalOpen(true); }}>
          <Plus className="w-4 h-4" /> Add Student
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by student or parent name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-44">
          <option value="">All Classes</option>
          {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Student</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Class</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Parent / Guardian</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    {students.length === 0 ? 'No students yet. Click "Add Student" to get started.' : "No students match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr key={student.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {getInitials(`${student.firstName} ${student.lastName}`)}
                        </div>
                        <span className="font-medium">{student.firstName} {student.lastName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{student.className}</td>
                    <td className="px-5 py-4">{student.guardianName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{student.guardianPhone}</td>
                    <td className="px-5 py-4">
                      {student.enrollmentStatus
                        ? <Badge variant={student.enrollmentStatus}>{student.enrollmentStatus}</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setSelectedStudent(student)} className="text-primary text-sm hover:underline">
                          View
                        </button>
                        <button onClick={() => openEdit(student)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Student Profile Modal */}
      <Modal open={!!selectedStudent} onClose={() => setSelectedStudent(null)} title="Student Profile" className="max-w-xl">
        {selectedStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold">
                {getInitials(`${selectedStudent.firstName} ${selectedStudent.lastName}`)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
                <p className="text-sm text-muted-foreground">{selectedStudent.className}</p>
              </div>
              <div className="ml-auto">
                {selectedStudent.enrollmentStatus && <Badge variant={selectedStudent.enrollmentStatus}>{selectedStudent.enrollmentStatus}</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Date of Birth</p>
                  <p className="mt-0.5">{selectedStudent.dateOfBirth ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
                  <p className="mt-0.5">{selectedStudent.gender ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Class</p>
                  <p className="mt-0.5">{selectedStudent.className}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Parent / Guardian</p>
                  <p className="mt-0.5">{selectedStudent.guardianName}</p>
                  {selectedStudent.guardianRelationship && (
                    <p className="text-xs text-muted-foreground">{selectedStudent.guardianRelationship}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contact</p>
                  <p className="mt-0.5">{selectedStudent.guardianPhone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                  <p className="mt-0.5">{selectedStudent.guardianEmail || "—"}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setSelectedStudent(null)}>Close</Button>
              <Button onClick={() => openEdit(selectedStudent)}>
                <Pencil className="w-4 h-4" /> Edit Student
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingStudent(null); }}
        title="Edit Student"
        className="max-w-xl"
      >
        <div className="space-y-4">
          {editFormError && <ErrorAlert message={editFormError} />}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name *</label>
              <Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} placeholder="First name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name *</label>
              <Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} placeholder="Last name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date of Birth</label>
              <Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gender</label>
              <Select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                <option value="">Select...</option>
                <option>Male</option>
                <option>Female</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <Select value={editForm.classId} onChange={(e) => setEditForm({ ...editForm, classId: e.target.value })}>
                <option value="">— No class —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.enrolled}/{c.capacity})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <Select value={editForm.enrollmentStatus} onChange={(e) => setEditForm({ ...editForm, enrollmentStatus: e.target.value })}>
                <option value="enrolled">Enrolled</option>
                <option value="inquiry">Inquiry</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>

          <hr className="border-border" />
          <p className="text-sm font-semibold">Parent / Guardian</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <Input value={editForm.parentName} onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })} placeholder="Parent name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Relationship</label>
              <Select value={editForm.relationship} onChange={(e) => setEditForm({ ...editForm, relationship: e.target.value })}>
                <option>Mother</option>
                <option>Father</option>
                <option>Guardian</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} placeholder="09XXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="parent@email.com" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEditModalOpen(false); setEditingStudent(null); }}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving || !editForm.firstName || !editForm.lastName || !editForm.parentName}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Student Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setForm(EMPTY_FORM); }}
        title="Add Student"
        className="max-w-xl"
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name *</label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name *</label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date of Birth</label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gender</label>
              <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select...</option>
                <option>Male</option>
                <option>Female</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">— No class —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.enrolled}/{c.capacity})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <Select value={form.enrollmentStatus} onChange={(e) => setForm({ ...form, enrollmentStatus: e.target.value })}>
                <option value="enrolled">Enrolled</option>
                <option value="inquiry">Inquiry</option>
                <option value="waitlisted">Waitlisted</option>
              </Select>
            </div>
          </div>

          <hr className="border-border" />
          <p className="text-sm font-semibold">Parent / Guardian</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} placeholder="Parent name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Relationship</label>
              <Select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                <option>Mother</option>
                <option>Father</option>
                <option>Guardian</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="09XXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="parent@email.com" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setAddModalOpen(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.firstName || !form.lastName || !form.parentName}>
              {saving ? "Saving…" : "Save Student"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
