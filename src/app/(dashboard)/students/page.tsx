"use client";
import { useEffect, useState } from "react";
import {
  Search, Plus, Pencil, ChevronDown, ChevronUp,
  Link as LinkIcon, Copy, Check, BookOpen,
  ArrowRight, RefreshCw, Users, GraduationCap,
} from "lucide-react";
import { DatePicker } from "@/components/ui/datepicker";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials, cn } from "@/lib/utils";
import { compressImage, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrollmentStatus = "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed";
type CommPref = "app" | "sms_phone" | "printed_note" | "in_person" | "assisted_by_school";
type PromoteAction = "promote" | "repeat" | "skip";

const COMM_PREF_LABELS: Record<CommPref, string> = {
  app: "App",
  sms_phone: "SMS / Phone",
  printed_note: "Printed Note",
  in_person: "In-Person",
  assisted_by_school: "Assisted by School",
};

function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return "—";
  if (years === 0) return `${months} mo${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  return `${years} yr${years !== 1 ? "s" : ""} ${months} mo`;
}

interface AcademicPeriod { id: string; name: string; }

interface EnrollmentEntry {
  id: string; classId: string; className: string;
  periodId: string | null; periodName: string | null;
  status: EnrollmentStatus; startDate: string | null; endDate: string | null;
}

interface Student {
  id: string; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null;
  studentCode: string | null; preferredName: string | null;
  classId: string | null; className: string;
  enrollmentId: string | null; enrollmentStatus: EnrollmentStatus | null;
  allEnrollments: EnrollmentEntry[];
  guardianId: string | null; guardianName: string; guardianPhone: string;
  guardianEmail: string; guardianRelationship: string; guardianCommPref: CommPref | null;
  allergies: string | null; medicalConditions: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  authorizedPickups: string | null; primaryLanguage: string | null;
  specialNeeds: string | null; teacherNotes: string | null; adminNotes: string | null;
  progressionStatus: string | null; progressionNotes: string | null;
  photoUrl: string | null;
}

interface ClassOption { id: string; name: string; enrolled: number; capacity: number; }

interface StudentForm {
  firstName: string; lastName: string; preferredName: string;
  dateOfBirth: string; gender: string; classId: string; periodId: string;
  enrollmentStatus: string; parentName: string; relationship: string;
  contact: string; email: string; commPref: CommPref;
  allergies: string; medicalConditions: string; emergencyContactName: string;
  emergencyContactPhone: string; specialNeeds: string; teacherNotes: string;
  adminNotes: string; authorizedPickups: string; primaryLanguage: string;
  progressionStatus: string; progressionNotes: string; photoUrl: string;
}

// Promote tab types
interface PromotePeriod { id: string; name: string; schoolYearId: string; schoolYearName: string; }
interface PromoteClassOption { id: string; name: string; level: string; schoolYearId: string; }
interface PromoteRow {
  studentId: string; studentName: string;
  currentEnrollmentId: string; currentClassId: string; currentClassName: string;
  suggestedClassId: string | null; suggestedClassName: string | null;
  selectedClassId: string; action: PromoteAction;
}
interface PromoteResult { created: number; skipped: number; errors: string[]; }

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: StudentForm = {
  firstName: "", lastName: "", preferredName: "", dateOfBirth: "", gender: "",
  classId: "", periodId: "", enrollmentStatus: "enrolled",
  parentName: "", relationship: "Mother", contact: "", email: "",
  commPref: "app",
  allergies: "", medicalConditions: "", emergencyContactName: "",
  emergencyContactPhone: "", specialNeeds: "", teacherNotes: "", adminNotes: "",
  authorizedPickups: "", primaryLanguage: "",
  progressionStatus: "", progressionNotes: "",
  photoUrl: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "enrolled", label: "Enrolled" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "inquiry", label: "Inquiry" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "completed", label: "Completed" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionToggle({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold bg-muted hover:bg-accent transition-colors text-left"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function ActionBtn({ active, onClick, className, children }: {
  active: boolean; onClick: () => void; className: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-medium
        ${active ? className : "border-border text-muted-foreground hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

interface SchoolCodeConfig { prefix: string; padding: number; includeYear: boolean; }

// ─── Page component ───────────────────────────────────────────────────────────

export default function StudentsPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  // Tab
  const [activeTab, setActiveTab] = useState<"students" | "promote">("students");

  // Students tab state
  const [students, setStudents] = useState<Student[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [codeConfig, setCodeConfig] = useState<SchoolCodeConfig>({ prefix: "LL", padding: 4, includeYear: false });

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

  const [addPhotoFile, setAddPhotoFile] = useState<File | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);

  const [enrollmentModal, setEnrollmentModal] = useState<Student | null>(null);
  const [enrollmentForm, setEnrollmentForm] = useState({ periodId: "", classId: "", status: "enrolled", startDate: "", endDate: "" });
  const [enrollmentFormError, setEnrollmentFormError] = useState<string | null>(null);
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);

  const [inviteStudent, setInviteStudent] = useState<Student | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Promote tab state
  const [promoteInitialized, setPromoteInitialized] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [allPeriods, setAllPeriods] = useState<PromotePeriod[]>([]);
  const [allPromoteClasses, setAllPromoteClasses] = useState<PromoteClassOption[]>([]);
  const [sourcePeriodId, setSourcePeriodId] = useState("");
  const [targetPeriodId, setTargetPeriodId] = useState("");
  const [promoteRows, setPromoteRows] = useState<PromoteRow[]>([]);
  const [promoteRowsLoading, setPromoteRowsLoading] = useState(false);
  const [promoteRowsError, setPromoteRowsError] = useState<string | null>(null);
  const [promoteSaving, setPromoteSaving] = useState(false);
  const [promoteResult, setPromoteResult] = useState<PromoteResult | null>(null);

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  useEffect(() => {
    if (activeTab === "promote" && !promoteInitialized && schoolId) {
      loadPromoteSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, promoteInitialized, schoolId]);

  // ─── Students tab functions ────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadStudents(), loadClasses(), loadCodeConfig(), loadAcademicPeriods()]);
    setLoading(false);
  }

  async function loadAcademicPeriods() {
    if (!schoolId || !activeYear?.id) return;
    const { data } = await supabase
      .from("academic_periods")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("school_year_id", activeYear.id)
      .order("start_date");
    setAcademicPeriods((data ?? []).map((p) => ({ id: p.id, name: p.name })));
  }

  async function loadCodeConfig() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("schools")
      .select("student_code_prefix, student_code_padding, student_code_include_year")
      .eq("id", schoolId)
      .single();
    if (data) {
      setCodeConfig({
        prefix: data.student_code_prefix ?? "LL",
        padding: data.student_code_padding ?? 4,
        includeYear: data.student_code_include_year ?? false,
      });
    }
  }

  async function uploadProfilePhoto(studentId: string, file: File): Promise<string | null> {
    const compressed = await compressImage(file, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES);
    const path = `students/${studentId}.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (error) return null;
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function generateStudentCode(studentId: string) {
    const { prefix, padding, includeYear } = codeConfig;
    const { data: existing } = await supabase
      .from("students")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("student_code") as any;
    let maxNum = 0;
    ((existing ?? []) as Array<{ student_code: string | null }>).forEach((s) => {
      if (!s.student_code) return;
      const match = s.student_code.match(/(\d+)$/);
      if (match) { const n = parseInt(match[1]); if (n > maxNum) maxNum = n; }
    });
    const nextNum = maxNum + 1;
    const yearPart = includeYear ? String(new Date().getFullYear()).slice(-2) : "";
    const numStr = String(nextNum).padStart(padding, "0");
    const code = yearPart ? `${prefix}-${yearPart}-${numStr}` : `${prefix}-${numStr}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("students").update({ student_code: code }).eq("id", studentId);
  }

  async function loadStudents() {
    const yearId = activeYear?.id ?? null;
    const { data, error: err } = await supabase
      .from("students")
      .select(`
        id, first_name, last_name, date_of_birth, gender,
        student_code, preferred_name, photo_url,
        allergies, medical_conditions, emergency_contact_name, emergency_contact_phone,
        authorized_pickups, primary_language, special_needs, teacher_notes, admin_notes,
        guardians(id, full_name, relationship, phone, email, is_primary, communication_preference),
        enrollments(id, status, class_id, school_year_id, academic_period_id, start_date, end_date, progression_status, progression_notes, classes(name), academic_periods(name))
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
          ? (enrollments.find((e) => e.school_year_id === yearId && e.status === "enrolled") ??
             enrollments.find((e) => e.school_year_id === yearId))
          : enrollments[0] ?? null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allEnrollments: EnrollmentEntry[] = enrollments.map((e: any) => ({
          id: e.id,
          classId: e.class_id,
          className: e.classes?.name ?? "—",
          periodId: e.academic_period_id ?? null,
          periodName: e.academic_periods?.name ?? null,
          status: e.status as EnrollmentStatus,
          startDate: e.start_date ?? null,
          endDate: e.end_date ?? null,
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sx = s as any;
        return {
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          dateOfBirth: s.date_of_birth ?? null,
          gender: s.gender ?? null,
          studentCode: sx.student_code ?? null,
          preferredName: sx.preferred_name ?? null,
          classId: activeEnrollment?.class_id ?? null,
          className: activeEnrollment?.classes?.name ?? "—",
          enrollmentId: activeEnrollment?.id ?? null,
          enrollmentStatus: activeEnrollment?.status ?? null,
          allEnrollments,
          guardianId: primaryGuardian?.id ?? null,
          guardianName: primaryGuardian?.full_name ?? "—",
          guardianPhone: primaryGuardian?.phone ?? "—",
          guardianEmail: primaryGuardian?.email ?? "",
          guardianRelationship: primaryGuardian?.relationship ?? "",
          guardianCommPref: primaryGuardian?.communication_preference ?? null,
          allergies: sx.allergies ?? null,
          medicalConditions: sx.medical_conditions ?? null,
          emergencyContactName: sx.emergency_contact_name ?? null,
          emergencyContactPhone: sx.emergency_contact_phone ?? null,
          authorizedPickups: sx.authorized_pickups ?? null,
          primaryLanguage: sx.primary_language ?? null,
          specialNeeds: sx.special_needs ?? null,
          teacherNotes: sx.teacher_notes ?? null,
          adminNotes: sx.admin_notes ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progressionStatus: (activeEnrollment as any)?.progression_status ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progressionNotes: (activeEnrollment as any)?.progression_notes ?? null,
          photoUrl: sx.photo_url ?? null,
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
        id: c.id, name: c.name, capacity: c.capacity ?? 0, enrolled: enrolledByClass[c.id] ?? 0,
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
        preferred_name: form.preferredName.trim() || null,
        allergies: form.allergies.trim() || null,
        medical_conditions: form.medicalConditions.trim() || null,
        emergency_contact_name: form.emergencyContactName.trim() || null,
        emergency_contact_phone: form.emergencyContactPhone.trim() || null,
        authorized_pickups: form.authorizedPickups.trim() || null,
        primary_language: form.primaryLanguage.trim() || null,
        special_needs: form.specialNeeds.trim() || null,
        teacher_notes: form.teacherNotes.trim() || null,
        admin_notes: form.adminNotes.trim() || null,
        is_active: true,
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("id")
      .single();

    if (sErr || !student) { setFormError(sErr?.message ?? "Failed to create student."); setSaving(false); return; }

    await generateStudentCode(student.id);

    if (addPhotoFile) {
      const photoUrl = await uploadProfilePhoto(student.id, addPhotoFile);
      if (photoUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("students").update({ photo_url: photoUrl }).eq("id", student.id);
      }
      setAddPhotoFile(null);
    }

    await supabase.from("guardians").insert({
      student_id: student.id,
      full_name: form.parentName.trim(),
      relationship: form.relationship,
      phone: form.contact.trim() || null,
      email: form.email.trim() || null,
      is_primary: true,
      communication_preference: form.commPref,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (form.classId) {
      await supabase.from("enrollments").insert({
        student_id: student.id,
        class_id: form.classId,
        school_year_id: activeYear.id,
        academic_period_id: form.periodId || null,
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
      firstName: student.firstName, lastName: student.lastName,
      preferredName: student.preferredName ?? "", dateOfBirth: student.dateOfBirth ?? "",
      gender: student.gender ?? "", classId: student.classId ?? "", periodId: "",
      enrollmentStatus: student.enrollmentStatus ?? "enrolled",
      parentName: student.guardianName === "—" ? "" : student.guardianName,
      relationship: student.guardianRelationship || "Mother",
      contact: student.guardianPhone === "—" ? "" : student.guardianPhone,
      email: student.guardianEmail, commPref: student.guardianCommPref ?? "app",
      allergies: student.allergies ?? "", medicalConditions: student.medicalConditions ?? "",
      emergencyContactName: student.emergencyContactName ?? "",
      emergencyContactPhone: student.emergencyContactPhone ?? "",
      authorizedPickups: student.authorizedPickups ?? "",
      primaryLanguage: student.primaryLanguage ?? "",
      specialNeeds: student.specialNeeds ?? "",
      teacherNotes: student.teacherNotes ?? "", adminNotes: student.adminNotes ?? "",
      progressionStatus: student.progressionStatus ?? "",
      progressionNotes: student.progressionNotes ?? "",
      photoUrl: student.photoUrl ?? "",
    });
    setEditPhotoFile(null);
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

    const { error: sErr } = await supabase
      .from("students")
      .update({
        first_name: editForm.firstName.trim(), last_name: editForm.lastName.trim(),
        date_of_birth: editForm.dateOfBirth || null, gender: editForm.gender || null,
        preferred_name: editForm.preferredName.trim() || null,
        allergies: editForm.allergies.trim() || null,
        medical_conditions: editForm.medicalConditions.trim() || null,
        emergency_contact_name: editForm.emergencyContactName.trim() || null,
        emergency_contact_phone: editForm.emergencyContactPhone.trim() || null,
        authorized_pickups: editForm.authorizedPickups.trim() || null,
        primary_language: editForm.primaryLanguage.trim() || null,
        special_needs: editForm.specialNeeds.trim() || null,
        teacher_notes: editForm.teacherNotes.trim() || null,
        admin_notes: editForm.adminNotes.trim() || null,
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .eq("id", editingStudent.id);

    if (sErr) { setEditFormError(sErr.message); setSaving(false); return; }

    if (editingStudent.guardianId) {
      await supabase.from("guardians").update({
        full_name: editForm.parentName.trim(), relationship: editForm.relationship,
        phone: editForm.contact.trim() || null, email: editForm.email.trim() || null,
        communication_preference: editForm.commPref,
      } as any).eq("id", editingStudent.guardianId); // eslint-disable-line @typescript-eslint/no-explicit-any
    } else {
      await supabase.from("guardians").insert({
        student_id: editingStudent.id, full_name: editForm.parentName.trim(),
        relationship: editForm.relationship, phone: editForm.contact.trim() || null,
        email: editForm.email.trim() || null, is_primary: true,
        communication_preference: editForm.commPref,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    const progressionPayload = {
      progression_status: editForm.progressionStatus || null,
      progression_notes: editForm.progressionNotes.trim() || null,
      slot_reserved_at: editForm.progressionStatus === "slot_reserved" ? new Date().toISOString() : undefined,
    };
    if (editingStudent.enrollmentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("enrollments").update(progressionPayload).eq("id", editingStudent.enrollmentId);
    }

    if (editPhotoFile) {
      const photoUrl = await uploadProfilePhoto(editingStudent.id, editPhotoFile);
      if (photoUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("students").update({ photo_url: photoUrl }).eq("id", editingStudent.id);
      }
      setEditPhotoFile(null);
    }

    setSaving(false);
    setEditModalOpen(false);
    setEditingStudent(null);
    await loadAll();
  }

  async function handleAddEnrollment() {
    if (!enrollmentModal) return;
    if (!enrollmentForm.classId) { setEnrollmentFormError("Please select a class."); return; }
    if (!activeYear?.id) { setEnrollmentFormError("No active school year."); return; }
    setEnrollmentSaving(true);
    setEnrollmentFormError(null);
    const { error } = await supabase.from("enrollments").insert({
      student_id: enrollmentModal.id,
      class_id: enrollmentForm.classId,
      school_year_id: activeYear.id,
      academic_period_id: enrollmentForm.periodId || null,
      status: enrollmentForm.status as EnrollmentStatus,
      start_date: enrollmentForm.startDate || null,
      end_date: enrollmentForm.endDate || null,
    });
    if (error) { setEnrollmentFormError(error.message); setEnrollmentSaving(false); return; }
    setEnrollmentSaving(false);
    setEnrollmentModal(null);
    await loadAll();
  }

  async function handleGenerateInvite(student: Student) {
    if (!schoolId) return;
    setInviteGenerating(true);
    setInviteLink(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: iErr } = await (supabase as any).from("guardian_invites").insert({
      school_id: schoolId, student_id: student.id,
      guardian_id: student.guardianId || null, email: student.guardianEmail || null,
    }).select("token").single();
    setInviteGenerating(false);
    if (iErr || !data) return;
    const token = (data as { token: string }).token;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setInviteLink(`${origin}/invite?token=${encodeURIComponent(token)}`);
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  // ─── Promote tab functions ─────────────────────────────────────────────────

  async function loadPromoteSetup() {
    setPromoteLoading(true);
    setPromoteError(null);
    const [periodsRes, classesRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("academic_periods")
        .select("id, name, school_year_id, school_years(name)")
        .eq("school_id", schoolId!)
        .order("start_date"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("classes")
        .select("id, name, level, school_year_id")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("name"),
    ]);
    if (periodsRes.error) { setPromoteError(periodsRes.error.message); setPromoteLoading(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllPeriods(((periodsRes.data ?? []) as any[]).map((p: any) => ({
      id: p.id, name: p.name, schoolYearId: p.school_year_id,
      schoolYearName: p.school_years?.name ?? "",
    })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllPromoteClasses(((classesRes.data ?? []) as any[]).map((c: any) => ({
      id: c.id, name: c.name, level: c.level ?? "", schoolYearId: c.school_year_id,
    })));
    setPromoteInitialized(true);
    setPromoteLoading(false);
  }

  async function loadStudentsForPromote() {
    if (!sourcePeriodId) { setPromoteRowsError("Select a source academic period."); return; }
    if (!targetPeriodId) { setPromoteRowsError("Select a target academic period."); return; }
    if (sourcePeriodId === targetPeriodId) { setPromoteRowsError("Source and target periods must be different."); return; }
    setPromoteRowsLoading(true);
    setPromoteRowsError(null);
    setPromoteRows([]);
    setPromoteResult(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollments, error: enrollErr } = await (supabase as any)
      .from("enrollments")
      .select(`
        id, student_id, class_id,
        students(first_name, last_name),
        classes(id, name, next_class_id, next_class:classes!next_class_id(id, name))
      `)
      .eq("academic_period_id", sourcePeriodId)
      .eq("status", "enrolled");

    if (enrollErr) { setPromoteRowsError(enrollErr.message); setPromoteRowsLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const built: PromoteRow[] = ((enrollments ?? []) as any[]).map((e: any) => {
      const student = e.students;
      const cls = e.classes;
      const nextCls = cls?.next_class;
      const studentName = student ? `${student.first_name} ${student.last_name}` : e.student_id;
      const suggestedClassId = nextCls?.id ?? null;
      const suggestedClassName = nextCls?.name ?? null;
      return {
        studentId: e.student_id,
        studentName,
        currentEnrollmentId: e.id,
        currentClassId: e.class_id,
        currentClassName: cls?.name ?? "—",
        suggestedClassId,
        suggestedClassName,
        selectedClassId: suggestedClassId ?? "",
        action: suggestedClassId ? "promote" : "skip",
      };
    });

    built.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setPromoteRows(built);
    setPromoteRowsLoading(false);
  }

  function setPromoteRowAction(studentId: string, action: PromoteAction) {
    setPromoteRows((prev) => prev.map((r) => {
      if (r.studentId !== studentId) return r;
      return {
        ...r, action,
        selectedClassId:
          action === "repeat" ? r.currentClassId :
          action === "skip" ? "" :
          r.suggestedClassId ?? "",
      };
    }));
  }

  function setPromoteRowClass(studentId: string, classId: string) {
    setPromoteRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, selectedClassId: classId } : r));
  }

  function setPromoteBulkAction(action: PromoteAction) {
    setPromoteRows((prev) => prev.map((r) => ({
      ...r, action,
      selectedClassId:
        action === "repeat" ? r.currentClassId :
        action === "skip" ? "" :
        r.suggestedClassId ?? r.selectedClassId,
    })));
  }

  async function handlePromoteConfirm() {
    if (!schoolId || !targetPeriodId) return;
    const toPromote = promoteRows.filter((r) => r.action !== "skip" && r.selectedClassId);
    if (toPromote.length === 0) { setPromoteRowsError("No students selected for promotion."); return; }

    setPromoteSaving(true);
    setPromoteRowsError(null);

    const targetPeriod = allPeriods.find((p) => p.id === targetPeriodId);
    const targetSchoolYearId = targetPeriod?.schoolYearId ?? "";
    let created = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of toPromote) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("enrollments")
        .select("id")
        .eq("student_id", row.studentId)
        .eq("class_id", row.selectedClassId)
        .eq("academic_period_id", targetPeriodId)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any).from("enrollments").insert({
        student_id: row.studentId,
        class_id: row.selectedClassId,
        school_year_id: targetSchoolYearId,
        academic_period_id: targetPeriodId,
        status: "upcoming",
      });

      if (insErr) { errors.push(`${row.studentName}: ${insErr.message}`); } else { created++; }
    }

    setPromoteResult({ created, skipped, errors });
    setPromoteSaving(false);
  }

  // ─── Derived values ────────────────────────────────────────────────────────

  const filtered = students.filter((s) => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const code = (s.studentCode ?? "").toLowerCase();
    const matchSearch = !search || fullName.includes(search.toLowerCase()) || s.guardianName.toLowerCase().includes(search.toLowerCase()) || code.includes(search.toLowerCase());
    const matchClass = !classFilter || s.classId === classFilter;
    const matchStatus = !statusFilter || s.enrollmentStatus === statusFilter;
    return matchSearch && matchClass && matchStatus;
  });

  const periodsByYear = allPeriods.reduce<Record<string, PromotePeriod[]>>((acc, p) => {
    const key = p.schoolYearName || p.schoolYearId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const targetPeriod = allPeriods.find((p) => p.id === targetPeriodId);
  const promoteCount = promoteRows.filter((r) => r.action !== "skip" && r.selectedClassId).length;
  const skipCount = promoteRows.filter((r) => r.action === "skip").length;

  if (loading) return <PageSpinner />;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Students</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage student information and enrollment</p>
        </div>
        {activeTab === "students" && (
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setAddModalOpen(true); }}>
            <Plus className="w-4 h-4" /> Add Student
          </Button>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-border -mt-2">
        <button
          onClick={() => setActiveTab("students")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "students"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4" />
          Students
        </button>
        <button
          onClick={() => setActiveTab("promote")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "promote"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GraduationCap className="w-4 h-4" />
          Promote Students
        </button>
      </div>

      {/* ── Students tab ─────────────────────────────────────────────────── */}
      {activeTab === "students" && (
        <>
          {error && <ErrorAlert message={error} />}

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, student code, or parent..."
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
                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                              {student.photoUrl
                                ? <img src={student.photoUrl} alt={student.firstName} className="w-full h-full object-cover" />
                                : getInitials(`${student.firstName} ${student.lastName}`)
                              }
                            </div>
                            <div>
                              <span className="font-medium">{student.firstName} {student.lastName}</span>
                              {student.studentCode && (
                                <span className="ml-2 text-xs text-muted-foreground font-mono">{student.studentCode}</span>
                              )}
                            </div>
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
        </>
      )}

      {/* ── Promote tab ──────────────────────────────────────────────────── */}
      {activeTab === "promote" && (
        <div className="space-y-6">
          {promoteLoading && <PageSpinner />}
          {promoteError && <ErrorAlert message={promoteError} />}

          {!promoteLoading && (
            <>
              {/* Period selectors */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <p className="text-sm font-semibold">Step 1 — Select periods</p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-sm font-medium">From (source period)</label>
                      <Select
                        value={sourcePeriodId}
                        onChange={(e) => { setSourcePeriodId(e.target.value); setPromoteRows([]); setPromoteResult(null); }}
                      >
                        <option value="">— Select source period —</option>
                        {Object.entries(periodsByYear).map(([yearName, periods]) => (
                          <optgroup key={yearName} label={yearName}>
                            {periods.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </div>

                    <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block mb-2" />

                    <div className="flex-1 space-y-1.5">
                      <label className="text-sm font-medium">To (target period)</label>
                      <Select
                        value={targetPeriodId}
                        onChange={(e) => { setTargetPeriodId(e.target.value); setPromoteRows([]); setPromoteResult(null); }}
                      >
                        <option value="">— Select target period —</option>
                        {Object.entries(periodsByYear).map(([yearName, periods]) => (
                          <optgroup key={yearName} label={yearName}>
                            {periods.filter((p) => p.id !== sourcePeriodId).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </div>

                    <Button onClick={loadStudentsForPromote} disabled={!sourcePeriodId || !targetPeriodId || promoteRowsLoading}>
                      <RefreshCw className={`w-4 h-4 ${promoteRowsLoading ? "animate-spin" : ""}`} />
                      Load Students
                    </Button>
                  </div>

                  {allPeriods.length === 0 && (
                    <p className="text-sm text-amber-600">
                      No academic periods found. Set them up in Settings → Academic Periods first.
                    </p>
                  )}
                </CardContent>
              </Card>

              {promoteRowsError && <ErrorAlert message={promoteRowsError} />}

              {/* Student promotion table */}
              {promoteRows.length > 0 && !promoteResult && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Step 2 — Review and confirm ({promoteRows.length} student{promoteRows.length !== 1 ? "s" : ""})
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Promoting to <strong>{targetPeriod?.name}</strong>
                        {targetPeriod?.schoolYearName ? ` · ${targetPeriod.schoolYearName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Set all:</span>
                      <button
                        onClick={() => setPromoteBulkAction("promote")}
                        className="px-2.5 py-1 text-xs rounded-lg border border-primary/40 text-primary hover:bg-primary/5 transition-colors font-medium"
                      >
                        Promote
                      </button>
                      <button
                        onClick={() => setPromoteBulkAction("repeat")}
                        className="px-2.5 py-1 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Repeat
                      </button>
                      <button
                        onClick={() => setPromoteBulkAction("skip")}
                        className="px-2.5 py-1 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Skip
                      </button>
                    </div>
                  </div>

                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted border-b border-border">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Current Class</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Next Class</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {promoteRows.map((row) => {
                            const targetClasses = allPromoteClasses.filter((c) => c.schoolYearId === targetPeriod?.schoolYearId);
                            return (
                              <tr key={row.studentId} className={`transition-colors ${row.action === "skip" ? "opacity-50 bg-muted/30" : "hover:bg-muted/40"}`}>
                                <td className="px-4 py-3 font-medium">{row.studentName}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.currentClassName}</td>
                                <td className="px-4 py-3">
                                  {row.action === "skip" ? (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  ) : row.action === "repeat" ? (
                                    <span className="text-muted-foreground italic text-xs">Same class ({row.currentClassName})</span>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <Select
                                        value={row.selectedClassId}
                                        onChange={(e) => setPromoteRowClass(row.studentId, e.target.value)}
                                        className="text-sm h-8"
                                      >
                                        <option value="">— Select class —</option>
                                        {(targetClasses.length > 0 ? targetClasses : allPromoteClasses).map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}{c.level ? ` (${c.level})` : ""}
                                          </option>
                                        ))}
                                      </Select>
                                      {row.suggestedClassId && row.selectedClassId === row.suggestedClassId && (
                                        <Badge variant="enrolled" className="text-xs whitespace-nowrap">suggested</Badge>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <ActionBtn active={row.action === "promote"} onClick={() => setPromoteRowAction(row.studentId, "promote")}
                                      className="text-primary border-primary/40 bg-primary/5">
                                      Promote
                                    </ActionBtn>
                                    <ActionBtn active={row.action === "repeat"} onClick={() => setPromoteRowAction(row.studentId, "repeat")}
                                      className="text-amber-600 border-amber-300 bg-amber-50">
                                      Repeat
                                    </ActionBtn>
                                    <ActionBtn active={row.action === "skip"} onClick={() => setPromoteRowAction(row.studentId, "skip")}
                                      className="text-muted-foreground border-border">
                                      Skip
                                    </ActionBtn>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <div className="flex items-center justify-between bg-muted rounded-xl px-5 py-4">
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="font-semibold text-primary">{promoteCount} student{promoteCount !== 1 ? "s" : ""}</span>
                        {" "}will be enrolled in the new period
                      </p>
                      {skipCount > 0 && (
                        <p className="text-muted-foreground text-xs">{skipCount} student{skipCount !== 1 ? "s" : ""} skipped</p>
                      )}
                    </div>
                    <Button onClick={handlePromoteConfirm} disabled={promoteSaving || promoteCount === 0} className="min-w-[160px]">
                      {promoteSaving ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Promoting…</>
                      ) : (
                        <><Check className="w-4 h-4" /> Promote {promoteCount} Student{promoteCount !== 1 ? "s" : ""}</>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* Empty state */}
              {promoteRows.length === 0 && !promoteRowsLoading && sourcePeriodId && targetPeriodId && !promoteResult && (
                <Card>
                  <CardContent className="p-12 text-center text-sm text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    No enrolled students found for the selected source period.
                  </CardContent>
                </Card>
              )}

              {/* Result */}
              {promoteResult && (
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold">Promotion complete</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          <strong className="text-foreground">{promoteResult.created}</strong> enrollment{promoteResult.created !== 1 ? "s" : ""} created
                          {promoteResult.skipped > 0 && <>, <strong className="text-foreground">{promoteResult.skipped}</strong> already existed (skipped)</>}
                        </p>
                      </div>
                    </div>
                    {promoteResult.errors.length > 0 && (
                      <div className="border border-destructive/30 rounded-lg p-3 text-sm text-destructive space-y-1">
                        <p className="font-medium">Some records failed:</p>
                        {promoteResult.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                      </div>
                    )}
                    <Button variant="outline" onClick={() => { setPromoteResult(null); setPromoteRows([]); }}>
                      Promote Another Batch
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modals (students tab) ─────────────────────────────────────────── */}

      {/* Student Profile Modal */}
      <Modal open={!!selectedStudent} onClose={() => setSelectedStudent(null)} title="Student Profile" className="max-w-xl">
        {selectedStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold overflow-hidden">
                {selectedStudent.photoUrl
                  ? <img src={selectedStudent.photoUrl} alt={selectedStudent.firstName} className="w-full h-full object-cover" />
                  : getInitials(`${selectedStudent.firstName} ${selectedStudent.lastName}`)
                }
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                  {selectedStudent.preferredName && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">"{selectedStudent.preferredName}"</span>
                  )}
                </h3>
                {selectedStudent.studentCode && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 bg-muted px-2 py-0.5 rounded inline-block">
                    ID: {selectedStudent.studentCode}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-0.5">{selectedStudent.className}</p>
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Age</p>
                  <p className="mt-0.5">{calcAge(selectedStudent.dateOfBirth)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
                  <p className="mt-0.5">{selectedStudent.gender ?? "—"}</p>
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Comm. Preference</p>
                  <p className="mt-0.5">{selectedStudent.guardianCommPref ? COMM_PREF_LABELS[selectedStudent.guardianCommPref] : "—"}</p>
                </div>
              </div>
            </div>

            {(selectedStudent.allergies || selectedStudent.medicalConditions || selectedStudent.emergencyContactName || selectedStudent.specialNeeds) && (
              <div className="border border-border rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Health & Emergency</p>
                {selectedStudent.allergies && <div><span className="text-muted-foreground">Allergies:</span> {selectedStudent.allergies}</div>}
                {selectedStudent.medicalConditions && <div><span className="text-muted-foreground">Medical Conditions:</span> {selectedStudent.medicalConditions}</div>}
                {selectedStudent.emergencyContactName && (
                  <div>
                    <span className="text-muted-foreground">Emergency Contact:</span>{" "}
                    {selectedStudent.emergencyContactName}
                    {selectedStudent.emergencyContactPhone && ` · ${selectedStudent.emergencyContactPhone}`}
                  </div>
                )}
                {selectedStudent.specialNeeds && <div><span className="text-muted-foreground">Special Needs:</span> {selectedStudent.specialNeeds}</div>}
              </div>
            )}

            {selectedStudent.teacherNotes && (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Teacher Notes</p>
                <p className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-yellow-900">{selectedStudent.teacherNotes}</p>
              </div>
            )}

            {selectedStudent.progressionStatus && (
              <div className="border border-border rounded-lg p-4 text-sm">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Next Year Progression</p>
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    selectedStudent.progressionStatus === "slot_reserved" ? "bg-green-100 text-green-700" :
                    selectedStudent.progressionStatus === "not_continuing" ? "bg-red-100 text-red-700" :
                    selectedStudent.progressionStatus === "intent_confirmed" ? "bg-blue-100 text-blue-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {selectedStudent.progressionStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>
                {selectedStudent.progressionNotes && (
                  <p className="mt-1 text-muted-foreground">{selectedStudent.progressionNotes}</p>
                )}
              </div>
            )}

            <div className="border border-border rounded-lg p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Enrollments
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEnrollmentModal(selectedStudent);
                    setEnrollmentForm({ periodId: "", classId: "", status: "enrolled", startDate: "", endDate: "" });
                    setEnrollmentFormError(null);
                    setSelectedStudent(null);
                  }}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {selectedStudent.allEnrollments.length === 0 ? (
                <p className="text-muted-foreground text-xs">No enrollments yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.allEnrollments.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{e.className}</span>
                        {e.periodName && <span className="text-muted-foreground ml-1.5 text-xs">· {e.periodName}</span>}
                        {(e.startDate || e.endDate) && (
                          <span className="text-muted-foreground ml-1.5 text-xs">· {e.startDate ?? "?"} – {e.endDate ?? "?"}</span>
                        )}
                      </div>
                      <Badge variant={e.status}>{e.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-4 space-y-2 text-sm">
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Parent Portal Access</p>
              {inviteStudent?.id === selectedStudent.id && inviteLink ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Share this link with the guardian to give them access:</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={inviteLink} className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-muted font-mono truncate" />
                    <button onClick={copyInviteLink} className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-accent transition-colors">
                      {inviteCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {inviteCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Link expires in 30 days.</p>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setInviteStudent(selectedStudent); setInviteLink(null); handleGenerateInvite(selectedStudent); }} disabled={inviteGenerating}>
                  <LinkIcon className="w-3.5 h-3.5" />
                  {inviteGenerating ? "Generating…" : "Generate Invite Link"}
                </Button>
              )}
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

      {/* Add / Edit Student Modals */}
      {[
        { open: editModalOpen, onClose: () => { setEditModalOpen(false); setEditingStudent(null); }, title: "Edit Student", fErr: editFormError, f: editForm, setF: setEditForm, onSave: handleEdit, isEdit: true, photoFile: editPhotoFile, setPhotoFile: setEditPhotoFile },
        { open: addModalOpen, onClose: () => { setAddModalOpen(false); setForm(EMPTY_FORM); }, title: "Add Student", fErr: formError, f: form, setF: setForm, onSave: handleAdd, isEdit: false, photoFile: addPhotoFile, setPhotoFile: setAddPhotoFile },
      ].map(({ open, onClose, title, fErr, f, setF, onSave, isEdit, photoFile, setPhotoFile }) => (
        <Modal key={title} open={open} onClose={onClose} title={title} className="max-w-2xl">
          <div className="space-y-4">
            {fErr && <ErrorAlert message={fErr} />}

            <div className="flex items-center gap-4">
              <AvatarUpload
                currentUrl={photoFile ? URL.createObjectURL(photoFile) : (f.photoUrl || null)}
                name={`${f.firstName} ${f.lastName}`}
                size="lg"
                onFileSelect={(file) => setPhotoFile(file)}
              />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Student Photo</p>
                <p>Click the photo to upload an image.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name *</label>
                <Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} placeholder="First name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name *</label>
                <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} placeholder="Last name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Preferred Name / Nickname</label>
                <Input value={f.preferredName} onChange={(e) => setF({ ...f, preferredName: e.target.value })} placeholder="What the child goes by" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                  <option value="">Select...</option>
                  <option>Male</option>
                  <option>Female</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <Input type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} min="1990-01-01" max="2099-12-31" />
                {f.dateOfBirth && <p className="text-xs text-muted-foreground mt-1">Age: {calcAge(f.dateOfBirth)}</p>}
              </div>
              {!isEdit && (
                <div>
                  <label className="block text-sm font-medium mb-1">Class (Initial Enrollment)</label>
                  <Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
                    <option value="">— No class —</option>
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.enrolled}/{c.capacity})</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            {!isEdit && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Academic Period</label>
                  <Select value={f.periodId} onChange={(e) => setF({ ...f, periodId: e.target.value })}>
                    <option value="">— No period —</option>
                    {academicPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Enrollment Status</label>
                  <Select value={f.enrollmentStatus} onChange={(e) => setF({ ...f, enrollmentStatus: e.target.value })}>
                    <option value="enrolled">Enrolled</option>
                    <option value="inquiry">Inquiry</option>
                    <option value="waitlisted">Waitlisted</option>
                  </Select>
                </div>
              </div>
            )}

            <hr className="border-border" />
            <p className="text-sm font-semibold">Parent / Guardian</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <Input value={f.parentName} onChange={(e) => setF({ ...f, parentName: e.target.value })} placeholder="Parent name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Relationship</label>
                <Select value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>
                  <option>Mother</option><option>Father</option><option>Guardian</option>
                  <option>Grandparent</option><option>Other</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="09XXXXXXXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="parent@email.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Communication Preference</label>
              <Select value={f.commPref} onChange={(e) => setF({ ...f, commPref: e.target.value as CommPref })}>
                {(Object.entries(COMM_PREF_LABELS) as [CommPref, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>

            <SectionToggle title="Health & Medical Info">
              <div>
                <label className="block text-sm font-medium mb-1">Allergies</label>
                <Input value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="e.g. Peanuts, Dairy (leave blank if none)" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Medical Conditions</label>
                <Textarea value={f.medicalConditions} onChange={(e) => setF({ ...f, medicalConditions: e.target.value })} rows={2} placeholder="e.g. Asthma, Epilepsy (leave blank if none)" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Special Needs / Accommodations</label>
                <Textarea value={f.specialNeeds} onChange={(e) => setF({ ...f, specialNeeds: e.target.value })} rows={2} placeholder="IEP, therapy schedule, learning accommodations..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Primary Language Spoken at Home</label>
                <Input value={f.primaryLanguage} onChange={(e) => setF({ ...f, primaryLanguage: e.target.value })} placeholder="e.g. Filipino, English" />
              </div>
            </SectionToggle>

            <SectionToggle title="Emergency Contact & Authorized Pickups">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Emergency Contact Name</label>
                  <Input value={f.emergencyContactName} onChange={(e) => setF({ ...f, emergencyContactName: e.target.value })} placeholder="If different from guardian" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Emergency Contact Phone</label>
                  <Input value={f.emergencyContactPhone} onChange={(e) => setF({ ...f, emergencyContactPhone: e.target.value })} placeholder="09XXXXXXXXX" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Authorized Pickup Persons</label>
                <Textarea value={f.authorizedPickups} onChange={(e) => setF({ ...f, authorizedPickups: e.target.value })} rows={2} placeholder="Names of people allowed to pick up the child (besides guardian)" />
              </div>
            </SectionToggle>

            <SectionToggle title="Notes">
              <div>
                <label className="block text-sm font-medium mb-1">Notes for Teachers</label>
                <Textarea value={f.teacherNotes} onChange={(e) => setF({ ...f, teacherNotes: e.target.value })} rows={2} placeholder="Visible to class teachers" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Admin Notes (Internal)</label>
                <Textarea value={f.adminNotes} onChange={(e) => setF({ ...f, adminNotes: e.target.value })} rows={2} placeholder="Internal notes — not shared with parents" />
              </div>
            </SectionToggle>

            {isEdit && (
              <SectionToggle title="Next Year Progression">
                <div>
                  <label className="block text-sm font-medium mb-1">Progression Status</label>
                  <Select value={f.progressionStatus} onChange={(e) => setF({ ...f, progressionStatus: e.target.value })}>
                    <option value="">— Not set —</option>
                    <option value="eligible">Eligible for Next Level</option>
                    <option value="intent_confirmed">Parent Expressed Intent to Continue</option>
                    <option value="slot_reserved">Slot Reserved</option>
                    <option value="not_continuing">Not Continuing</option>
                    <option value="undecided">Undecided</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Progression Notes</label>
                  <Textarea value={f.progressionNotes} onChange={(e) => setF({ ...f, progressionNotes: e.target.value })} rows={2} placeholder="Notes about next year enrollment intent..." />
                </div>
              </SectionToggle>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <ModalCancelButton />
              <Button onClick={onSave} disabled={saving || !f.firstName || !f.lastName || !f.parentName}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Student"}
              </Button>
            </div>
          </div>
        </Modal>
      ))}

      {/* Add Enrollment Modal */}
      <Modal open={!!enrollmentModal} onClose={() => setEnrollmentModal(null)} title="Add Enrollment" className="max-w-md">
        {enrollmentModal && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adding enrollment for <strong>{enrollmentModal.firstName} {enrollmentModal.lastName}</strong>
            </p>
            {enrollmentFormError && <ErrorAlert message={enrollmentFormError} />}
            <div>
              <label className="block text-sm font-medium mb-1">Academic Period</label>
              <Select value={enrollmentForm.periodId} onChange={(e) => setEnrollmentForm({ ...enrollmentForm, periodId: e.target.value })}>
                <option value="">— No period —</option>
                {academicPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Class *</label>
              <Select value={enrollmentForm.classId} onChange={(e) => setEnrollmentForm({ ...enrollmentForm, classId: e.target.value })}>
                <option value="">— Select class —</option>
                {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.enrolled}/{c.capacity})</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <Select value={enrollmentForm.status} onChange={(e) => setEnrollmentForm({ ...enrollmentForm, status: e.target.value })}>
                <option value="enrolled">Enrolled</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="inquiry">Inquiry</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <DatePicker value={enrollmentForm.startDate} onChange={(v) => setEnrollmentForm({ ...enrollmentForm, startDate: v })} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <DatePicker value={enrollmentForm.endDate} onChange={(v) => setEnrollmentForm({ ...enrollmentForm, endDate: v })} placeholder="Optional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ModalCancelButton />
              <Button onClick={handleAddEnrollment} disabled={enrollmentSaving || !enrollmentForm.classId}>
                {enrollmentSaving ? "Saving…" : "Add Enrollment"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
