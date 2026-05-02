"use client";
import { useEffect, useState } from "react";
import {
  Search, Plus, Pencil, ChevronDown, ChevronUp,
  Link as LinkIcon, Copy, Check, BookOpen,
  ArrowRight, RefreshCw, Users, GraduationCap,
  HelpCircle, AlertTriangle, ChevronRight, X, UserPlus, UserCheck, FileText,
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
import { trackUpload } from "@/lib/track-upload";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrollmentStatus = "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed";
type CommPref = "app" | "sms_phone" | "printed_note" | "in_person" | "assisted_by_school";
type ClassificationAction = "eligible" | "not_eligible_retained" | "not_eligible_other" | "graduated" | "not_continuing" | "unset";
type StudentsTab = "students" | "promote";

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
  schoolYearId: string; schoolYearName: string;
  status: EnrollmentStatus; startDate: string | null; endDate: string | null;
}

interface Student {
  id: string; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null;
  studentCode: string | null; preferredName: string | null;
  classId: string | null; className: string;
  enrollmentId: string | null; enrollmentStatus: EnrollmentStatus | null;
  enrollmentYearId: string | null;
  allEnrollments: EnrollmentEntry[];
  guardianId: string | null; guardianName: string; guardianPhone: string;
  guardianEmail: string; guardianRelationship: string; guardianCommPref: CommPref | null;
  allergies: string | null; medicalConditions: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
  authorizedPickups: string | null; primaryLanguage: string | null;
  specialNeeds: string | null; teacherNotes: string | null; adminNotes: string | null;
  progressionStatus: string | null; progressionNotes: string | null;
  recommendedNextLevel: string | null;
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

// Pending placement tab types
interface PendingPlacementRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  currentLevel: string;
  progressionNotes: string | null;
  sourceYearName: string;
  sourceClassName: string;
}

// Year-End Classification tab types
interface PromoteYear { id: string; name: string; }
interface PromoteRow {
  studentId: string; studentName: string;
  currentEnrollmentId: string; currentClassId: string; currentClassName: string; currentClassLevel: string;
  nextLevel: string;
  classification: ClassificationAction;
}
interface ClassifyResult { classified: number; errors: string[]; }

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
  const { schoolId, activeYear, userId, isReadOnly, allSchoolYears: schoolYearList } = useSchoolContext();
  const supabase = createClient();

  // Tab
  const [activeTab, setActiveTab] = useState<StudentsTab>("students");

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
  const [returningFilter, setReturningFilter] = useState(false);
  // Year selector: which school year's enrollment data to display (default = activeYear)
  const [viewingYearId, setViewingYearId] = useState<string>("");

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
  const [enrollmentStatusUpdating, setEnrollmentStatusUpdating] = useState<string | null>(null);

  const [inviteStudent, setInviteStudent] = useState<Student | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  // Pending placement tab state
  const [pendingRows, setPendingRows] = useState<PendingPlacementRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingLevelFilter, setPendingLevelFilter] = useState("all");
  const [placementClassId, setPlacementClassId] = useState<Record<string, string>>({});
  const [placementSaving, setPlacementSaving] = useState<Record<string, boolean>>({});
  const [placementDone, setPlacementDone] = useState<Record<string, boolean>>({});
  const [placementError, setPlacementError] = useState<Record<string, string | null>>({});

  // Promote tab state
  const [promoteInitialized, setPromoteInitialized] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [allSchoolYears, setAllSchoolYears] = useState<PromoteYear[]>([]);
  const [sourceYearId, setSourceYearId] = useState("");
  const [targetYearId, setTargetYearId] = useState("");
  const [promoteLevel, setPromoteLevel] = useState("all");
  const [promoteSearch, setPromoteSearch] = useState("");
  const [promoteRows, setPromoteRows] = useState<PromoteRow[]>([]);
  const [promoteRowsLoading, setPromoteRowsLoading] = useState(false);
  const [promoteRowsError, setPromoteRowsError] = useState<string | null>(null);
  const [promoteSaving, setPromoteSaving] = useState(false);
  const [promoteResult, setPromoteResult] = useState<ClassifyResult | null>(null);
  const [selectedClassId, setSelectedClassId] = useState("");

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    setViewingYearId(activeYear?.id ?? "");
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
    // Include schoolId in the path so storage policies can scope access by tenant
    const path = `students/${schoolId}/${studentId}.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (error) return null;
    await trackUpload(supabase, {
      schoolId, uploadedBy: userId, entityType: "student", entityId: studentId,
      bucket: "profile-photos", storagePath: path,
      fileSize: compressed.size, mimeType: "image/jpeg",
    });
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
        enrollments(id, status, class_id, school_year_id, academic_period_id, start_date, end_date, created_at, progression_status, progression_notes, classes(name, next_level), academic_periods(name), school_years(name))
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
             enrollments.find((e) => e.school_year_id === yearId) ??
             enrollments.find((e) => e.status === "enrolled") ??
             enrollments[0] ?? null)
          : enrollments[0] ?? null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allEnrollments: EnrollmentEntry[] = enrollments.map((e: any) => ({
          id: e.id,
          classId: e.class_id,
          className: e.classes?.name ?? "—",
          periodId: e.academic_period_id ?? null,
          periodName: e.academic_periods?.name ?? null,
          schoolYearId: e.school_year_id,
          schoolYearName: e.school_years?.name ?? "",
          status: e.status as EnrollmentStatus,
          startDate: e.start_date ?? null,
          endDate: e.end_date ?? null,
        })).sort((a: EnrollmentEntry, b: EnrollmentEntry) =>
          b.schoolYearName.localeCompare(a.schoolYearName)
        );

        // Most recent enrollment with a classification (prefer active year, then any prior)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const classifiedEnroll = [...enrollments].filter((e: any) => e.progression_status !== null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => (b.school_years?.name ?? "").localeCompare(a.school_years?.name ?? ""))[0] ?? null;

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
          enrollmentYearId: activeEnrollment?.school_year_id ?? null,
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
          // Only fall back to classifiedEnroll's progression if it's the same enrollment as the active one.
          // If the student already moved to a newer class, the old "Eligible" classification is stale.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progressionStatus: (activeEnrollment as any)?.progression_status ??
            (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll.progression_status : null),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progressionNotes: (activeEnrollment as any)?.progression_notes ??
            (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll.progression_notes : null),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recommendedNextLevel: (activeEnrollment as any)?.classes?.next_level ??
            (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll?.classes?.next_level : null),
          photoUrl: sx.photo_url ?? null,
        };
      })
    );

  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("classes")
      .select("id, name, capacity")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .eq("is_system", false)
      .order("start_time");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const classIds = (data ?? []).map((c: any) => c.id);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((c: any) => ({
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
      const enrollRes = await fetch("/api/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          classId: form.classId,
          schoolYearId: activeYear.id,
          academicPeriodId: form.periodId || null,
          status: form.enrollmentStatus,
        }),
      });
      if (!enrollRes.ok) {
        const j = await enrollRes.json();
        setFormError(j.error ?? "Student created but enrollment failed.");
        setSaving(false);
        await loadAll();
        return;
      }
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
    try {
      const res = await fetch("/api/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: enrollmentModal.id,
          classId: enrollmentForm.classId,
          schoolYearId: activeYear.id,
          academicPeriodId: enrollmentForm.periodId || null,
          status: enrollmentForm.status,
          startDate: enrollmentForm.startDate || null,
          endDate: enrollmentForm.endDate || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setEnrollmentFormError(j.error ?? "Enrollment failed."); setEnrollmentSaving(false); return; }
    } catch {
      setEnrollmentFormError("Network error. Please try again.");
      setEnrollmentSaving(false);
      return;
    }
    setEnrollmentSaving(false);
    setEnrollmentModal(null);
    await loadAll();
  }

  async function handleUpdateEnrollmentStatus(enrollmentId: string, newStatus: string) {
    setEnrollmentStatusUpdating(enrollmentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("enrollments").update({ status: newStatus }).eq("id", enrollmentId);
    setEnrollmentStatusUpdating(null);
    await loadStudents();
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

  // ─── Pending Placement tab functions ──────────────────────────────────────

  async function loadPendingPlacements() {
    if (!schoolId || !activeYear?.id) return;
    setPendingLoading(true);
    setPendingError(null);
    setPendingRows([]);
    setPlacementDone({});
    setPlacementError({});
    setPlacementClassId({});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollments, error } = await (supabase as any)
      .from("enrollments")
      .select(`
        id, student_id, progression_notes,
        students(first_name, last_name, school_id),
        classes(name, level),
        school_years(name)
      `)
      .eq("status", "completed")
      .eq("progression_status", "promoted_pending_placement");

    if (error) { setPendingError(error.message); setPendingLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schoolEnrollments = ((enrollments ?? []) as any[]).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.students?.school_id === schoolId
    );

    if (schoolEnrollments.length === 0) { setPendingRows([]); setPendingLoading(false); return; }

    // Filter out students already enrolled in the active year
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentIds = [...new Set(schoolEnrollments.map((e: any) => e.student_id as string))];
    const { data: activeEnrollments } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("school_year_id", activeYear.id)
      .in("student_id", studentIds);

    const alreadyPlacedIds = new Set((activeEnrollments ?? []).map((e) => e.student_id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: PendingPlacementRow[] = schoolEnrollments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => !alreadyPlacedIds.has(e.student_id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => ({
        enrollmentId: e.id,
        studentId: e.student_id,
        studentName: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
        currentLevel: e.classes?.level ?? "",
        progressionNotes: e.progression_notes ?? null,
        sourceYearName: e.school_years?.name ?? "—",
        sourceClassName: e.classes?.name ?? "—",
      }));

    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setPendingRows(rows);
    setPendingLoading(false);
  }

  async function handlePlace(row: PendingPlacementRow) {
    const classId = placementClassId[row.studentId];
    if (!classId || !activeYear?.id) return;

    setPlacementSaving((prev) => ({ ...prev, [row.studentId]: true }));
    setPlacementError((prev) => ({ ...prev, [row.studentId]: null }));

    try {
      const res = await fetch("/api/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          classId,
          schoolYearId: activeYear.id,
          status: "enrolled",
          sourceEnrollmentId: row.enrollmentId,
        }),
      });

      const j = await res.json();
      if (!res.ok) {
        setPlacementError((prev) => ({ ...prev, [row.studentId]: j.error ?? "Enrollment failed." }));
        setPlacementSaving((prev) => ({ ...prev, [row.studentId]: false }));
        return;
      }

      setPlacementDone((prev) => ({ ...prev, [row.studentId]: true }));
    } catch {
      setPlacementError((prev) => ({ ...prev, [row.studentId]: "Network error. Please try again." }));
    }

    setPlacementSaving((prev) => ({ ...prev, [row.studentId]: false }));
  }

  // ─── Promote tab functions ─────────────────────────────────────────────────

  async function loadPromoteSetup() {
    setPromoteLoading(true);
    setPromoteError(null);
    const yearsRes = await supabase
      .from("school_years")
      .select("id, name, start_date")
      .eq("school_id", schoolId!)
      .order("start_date", { ascending: false });
    if (yearsRes.error) { setPromoteError(yearsRes.error.message); setPromoteLoading(false); return; }
    const seen = new Set<string>();
    const years = (yearsRes.data ?? [])
      .filter((y) => { if (seen.has(y.id)) return false; seen.add(y.id); return true; })
      .map((y) => ({ id: y.id, name: y.name }));
    setAllSchoolYears(years);
    // Auto-detect: years sorted desc — index 0 = most recent (target context), index 1 = source to classify
    const autoSrcId = years.length >= 2 ? years[1].id : years.length === 1 ? years[0].id : "";
    const autoTgtId = years.length >= 2 ? years[0].id : "";
    setSourceYearId(autoSrcId);
    setTargetYearId(autoTgtId);
    setPromoteInitialized(true);
    setPromoteLoading(false);
    if (autoSrcId) {
      await loadStudentsForPromote(autoSrcId, autoTgtId);
    }
  }

  async function loadStudentsForPromote(srcId?: string, tgtId?: string) {
    const src = srcId ?? sourceYearId;
    const tgt = tgtId ?? targetYearId;
    if (!src) return;
    void tgt; // target is informational only in classification flow
    setPromoteRowsLoading(true);
    setPromoteRowsError(null);
    setPromoteRows([]);
    setPromoteResult(null);
    setPromoteSearch("");
    setSelectedClassId("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollments, error: enrollErr } = await (supabase as any)
      .from("enrollments")
      .select(`
        id, student_id, class_id,
        students(first_name, last_name),
        classes(id, name, level, next_level)
      `)
      .eq("school_year_id", src)
      .eq("status", "enrolled")
      .is("progression_status", null);

    if (enrollErr) { setPromoteRowsError(enrollErr.message); setPromoteRowsLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const built: PromoteRow[] = ((enrollments ?? []) as any[]).map((e: any) => {
      const student = e.students;
      const cls = e.classes;
      const studentName = student ? `${student.first_name} ${student.last_name}` : e.student_id;
      const nextLevel = cls?.next_level ?? "";
      return {
        studentId: e.student_id,
        studentName,
        currentEnrollmentId: e.id,
        currentClassId: e.class_id,
        currentClassName: cls?.name ?? "—",
        currentClassLevel: cls?.level ?? "",
        nextLevel,
        classification: (nextLevel === "GRADUATE" ? "graduated" : nextLevel && nextLevel !== "NON_PROMOTIONAL" ? "eligible" : "unset") as ClassificationAction,
      };
    });

    built.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setPromoteRows(built);
    setPromoteRowsLoading(false);
  }

  function setRowClassification(studentId: string, classification: ClassificationAction) {
    setPromoteRows((prev) => prev.map((r) =>
      r.studentId === studentId ? { ...r, classification } : r
    ));
  }

  function applyBulkClassification(currentClassId: string, value: ClassificationAction | "") {
    if (value === "") return; // "varied" — no-op
    setPromoteRows((prev) => prev.map((r) =>
      r.currentClassId === currentClassId ? { ...r, classification: value } : r
    ));
  }

  function setClassificationBulkAction(classification: ClassificationAction) {
    setPromoteRows((prev) => prev.map((r) => {
      if (promoteLevel !== "all" && r.currentClassLevel !== promoteLevel) return r;
      return { ...r, classification };
    }));
  }

  async function handleClassifyConfirm() {
    if (!schoolId) return;

    const toClassify = filteredPromoteRows.filter((r) => r.classification !== "unset");
    if (toClassify.length === 0) {
      setPromoteRowsError("No students classified yet. Use the buttons to set each student's outcome.");
      return;
    }

    setPromoteSaving(true);
    setPromoteRowsError(null);

    // Auto-populate notes from classification + level context
    function autoNotes(r: PromoteRow): string {
      switch (r.classification) {
        case "eligible":             return r.nextLevel && r.nextLevel !== "GRADUATE" && r.nextLevel !== "NON_PROMOTIONAL"
                                      ? `Eligible for ${r.nextLevel}` : "Eligible for next level";
        case "not_eligible_retained": return `Retained in ${r.currentClassLevel || "current level"}`;
        case "not_eligible_other":   return "Not eligible — other reason";
        case "graduated":            return `Graduated from ${r.currentClassLevel || "current level"}`;
        case "not_continuing":       return "Withdrawn";
        default: return "";
      }
    }

    try {
      const res = await fetch("/api/students/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classify: toClassify.map((r) => ({
            enrollmentId:         r.currentEnrollmentId,
            studentName:          r.studentName,
            classificationStatus: r.classification,
            notes:                autoNotes(r),
          })),
        }),
      });

      const j = await res.json();
      if (!res.ok) {
        setPromoteRowsError(j.error ?? "Classification failed.");
        setPromoteSaving(false);
        return;
      }

      setPromoteResult(j.result);
    } catch {
      setPromoteRowsError("Network error. Please try again.");
    }

    setPromoteSaving(false);
  }

  // ─── Derived values ────────────────────────────────────────────────────────

  // Resolve which enrollment to display for a student given the viewing year.
  // Falls back to the pre-computed values when viewingYearId matches activeYear.
  const effectiveViewingYearId = viewingYearId || activeYear?.id || null;
  function getDisplayEnrollment(s: Student) {
    const yearId = effectiveViewingYearId;
    if (!yearId || yearId === activeYear?.id) {
      return { classId: s.classId, className: s.className, enrollmentStatus: s.enrollmentStatus, enrollmentYearId: s.enrollmentYearId };
    }
    const found =
      s.allEnrollments.find((e) => e.schoolYearId === yearId && e.status === "enrolled") ??
      s.allEnrollments.find((e) => e.schoolYearId === yearId) ?? null;
    return {
      classId: found?.classId ?? null,
      className: found?.className ?? "—",
      enrollmentStatus: found?.status ?? null,
      enrollmentYearId: found?.schoolYearId ?? null,
    };
  }

  const isHistoricalYearView = !!viewingYearId && viewingYearId !== (activeYear?.id ?? "");

  // Detect students enrolled in 2+ school years simultaneously (mixed-year data)
  const mixedYearStudentCount = students.filter((s) => {
    const enrolledYearIds = new Set(s.allEnrollments.filter((e) => e.status === "enrolled").map((e) => e.schoolYearId));
    return enrolledYearIds.size > 1;
  }).length;

  const totalEnrolled = students.filter((s) => s.enrollmentStatus === "enrolled" && s.enrollmentYearId === activeYear?.id).length;

  const returningEnrolledIds = new Set(
    students.filter((s) => {
      const enrolledThisYear = s.enrollmentStatus === "enrolled" && s.enrollmentYearId === activeYear?.id;
      const hasPriorEnrollment = s.allEnrollments.some((e) => e.schoolYearId !== activeYear?.id);
      return enrolledThisYear && hasPriorEnrollment;
    }).map((s) => s.id)
  );
  const returningEnrolledCount = returningEnrolledIds.size;

  const filtered = students.filter((s) => {
    const disp = getDisplayEnrollment(s);
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const code = (s.studentCode ?? "").toLowerCase();
    const matchSearch = !search || fullName.includes(search.toLowerCase()) || s.guardianName.toLowerCase().includes(search.toLowerCase()) || code.includes(search.toLowerCase());
    // Year filter narrows to students with an enrollment in the selected year —
    // the combined "School Year + Status" column shows that enrollment's status.
    const matchYear = !viewingYearId || disp.enrollmentYearId === viewingYearId;
    const matchClass = !classFilter || disp.classId === classFilter;
    const matchStatus = !statusFilter || disp.enrollmentStatus === statusFilter;
    const matchReturning = !returningFilter || returningEnrolledIds.has(s.id);
    return matchSearch && matchYear && matchClass && matchStatus && matchReturning;
  });

  const sourceYear = allSchoolYears.find((y) => y.id === sourceYearId);
  const targetYear = allSchoolYears.find((y) => y.id === targetYearId);

  // One entry per unique current class — used for the class picker and Step 1
  const classBulkGroups = promoteRows.reduce<Array<{
    currentClassId: string; currentClassName: string; currentClassLevel: string;
    studentCount: number; bulkClassification: ClassificationAction | "";
  }>>((acc, r) => {
    const g = acc.find((x) => x.currentClassId === r.currentClassId);
    if (g) {
      g.studentCount++;
      if (g.bulkClassification !== r.classification) g.bulkClassification = ""; // varied
    } else {
      acc.push({ currentClassId: r.currentClassId, currentClassName: r.currentClassName,
        currentClassLevel: r.currentClassLevel, studentCount: 1, bulkClassification: r.classification });
    }
    return acc;
  }, []).sort((a, b) => a.currentClassName.localeCompare(b.currentClassName));

  // Classes whose promotion path is unset — used for warning banner and picker badges
  const classIdsWithMissingPath = new Set(
    promoteRows.filter((r) => !r.nextLevel).map((r) => r.currentClassId)
  );

  const selectedClassGroup = classBulkGroups.find((g) => g.currentClassId === selectedClassId) ?? null;
  const classPromoteRows   = selectedClassId ? promoteRows.filter((r) => r.currentClassId === selectedClassId) : [];
  const filteredPromoteRows = classPromoteRows.filter((r) =>
    !promoteSearch || r.studentName.toLowerCase().includes(promoteSearch.toLowerCase())
  );

  // Derived from the class's own Promotion Path (same for all rows in the class)
  const classNextLevel = classPromoteRows[0]?.nextLevel ?? "";
  // Graduating only when the class itself is the terminal level
  const isGraduatingClass = classNextLevel === "GRADUATE";

  const eligibleCount   = classPromoteRows.filter((r) => r.classification === "eligible").length;
  const retainedCount   = classPromoteRows.filter((r) => r.classification === "not_eligible_retained").length;
  const otherCount      = classPromoteRows.filter((r) => r.classification === "not_eligible_other").length;
  const graduatedCount  = classPromoteRows.filter((r) => r.classification === "graduated").length;
  const notContCount    = classPromoteRows.filter((r) => r.classification === "not_continuing").length;
  const unsetCount      = classPromoteRows.filter((r) => r.classification === "unset").length;
  const classifiedCount = classPromoteRows.length - unsetCount;

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" />
            Help
          </button>
          {activeTab === "students" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setForm(EMPTY_FORM); setFormError(null); setAddModalOpen(true); }}>
                <Plus className="w-4 h-4" /> Add Student Profile
              </Button>
              <Button onClick={() => { window.location.href = "/enrollment"; }}>
                <UserCheck className="w-4 h-4" /> Enroll Student
              </Button>
            </div>
          )}
        </div>
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
          Year-End Classification
        </button>
      </div>

      {/* ── Students tab ─────────────────────────────────────────────────── */}
      {activeTab === "students" && (
        <>
          {error && <ErrorAlert message={error} />}

          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Enrolled ({activeYear?.name ?? "—"})</p>
                <p className="text-2xl font-bold mt-1">{totalEnrolled}</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all hover:shadow-md ${returningFilter ? "ring-2 ring-primary" : ""}`}
              onClick={() => setReturningFilter((v) => !v)}
            >
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Enrolled Returning</p>
                <p className="text-2xl font-bold mt-1">{returningEnrolledCount}</p>
                <p className={`text-xs mt-0.5 font-medium ${returningFilter ? "text-primary" : "text-muted-foreground"}`}>
                  {returningFilter ? "Filtering — click to clear" : "Click to filter"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Mixed-year data warning */}
          {mixedYearStudentCount > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>{mixedYearStudentCount} student{mixedYearStudentCount !== 1 ? "s have" : " has"}</strong> an &quot;Enrolled&quot; status in more than one school year simultaneously. This may be legacy data from before lifecycle guardrails were applied. Use the Year selector below to review each year&apos;s enrollments.
              </p>
            </div>
          )}

          {/* Historical year view banner */}
          {isHistoricalYearView && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
              <span className="text-blue-800">
                Showing enrollment data for <strong>{schoolYearList.find((y) => y.id === viewingYearId)?.name ?? "a past year"}</strong>.
                {" "}Class and status columns reflect that year.
              </span>
              <button
                onClick={() => setViewingYearId(activeYear?.id ?? "")}
                className="ml-auto text-xs text-blue-700 hover:underline whitespace-nowrap"
              >
                Back to Active Year
              </button>
            </div>
          )}

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
            <Select
              value={viewingYearId}
              onChange={(e) => { setViewingYearId(e.target.value); setClassFilter(""); }}
              className="sm:w-48"
            >
              {schoolYearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.id === activeYear?.id ? `${y.name} (Active)` : y.name}
                </option>
              ))}
            </Select>
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-44">
              <option value="">All Classes</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            {returningFilter && (
              <button
                onClick={() => setReturningFilter(false)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-primary bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
              >
                Returning only <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Student</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Class</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">School Year - Status</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Parent / Guardian</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Next Level</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-muted-foreground">
                        {students.length === 0 ? 'No students yet. Use "Enroll Student" to enroll through the pipeline, or "Add Student Profile" to create a record only.' : "No students match your filters."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((student) => {
                      const disp = getDisplayEnrollment(student);
                      return (
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
                        <td className="px-5 py-4 text-muted-foreground">{disp.className}</td>
                        <td className="px-5 py-4">
                          {disp.enrollmentYearId || disp.enrollmentStatus ? (
                            <span className={`text-xs font-medium whitespace-nowrap ${disp.enrollmentYearId === activeYear?.id ? "text-foreground" : "text-muted-foreground"}`}>
                              {schoolYearList.find((y) => y.id === disp.enrollmentYearId)?.name ?? "—"}
                              {disp.enrollmentStatus ? ` - ${disp.enrollmentStatus.charAt(0).toUpperCase()}${disp.enrollmentStatus.slice(1)}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">{student.guardianName}</td>
                        <td className="px-5 py-4 text-muted-foreground">{student.guardianPhone}</td>
                        <td className="px-5 py-4">
                          {student.progressionStatus ? (() => {
                            const ps = student.progressionStatus;
                            const color =
                              ps === "eligible"              ? "text-green-700 bg-green-50 border-green-200" :
                              ps === "not_eligible_retained" ? "text-amber-700 bg-amber-50 border-amber-200" :
                              ps === "not_eligible_other"    ? "text-orange-700 bg-orange-50 border-orange-200" :
                              ps === "graduated"             ? "text-muted-foreground bg-muted border-border" :
                              ps === "not_continuing"        ? "text-red-700 bg-red-50 border-red-200" :
                                                              "text-muted-foreground bg-muted border-border";
                            const label =
                              ps === "eligible"              ? "Eligible" :
                              ps === "not_eligible_retained" ? "Retained" :
                              ps === "not_eligible_other"    ? "Not Eligible" :
                              ps === "graduated"             ? "Graduated" :
                              ps === "not_continuing"        ? "Not Continuing" : ps;
                            return (
                              <div className="space-y-0.5">
                                <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${color}`}>{label}</span>
                                {student.recommendedNextLevel && (
                                  <p className="text-xs text-muted-foreground">→ {student.recommendedNextLevel}</p>
                                )}
                              </div>
                            );
                          })() : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => setSelectedStudent(student)} className="text-primary text-sm hover:underline">
                              View
                            </button>
                            <a
                              href={`/documents?student=${student.id}`}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Documents"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText className="w-4 h-4" />
                            </a>
                            <button onClick={() => openEdit(student)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── Year-End Classification tab ───────────────────────────────────── */}
      {activeTab === "promote" && (
        <div className="space-y-6">
          {promoteLoading && <PageSpinner />}
          {promoteError && <ErrorAlert message={promoteError} />}

          {!promoteLoading && (
            <>
              {/* Banner */}
              <Card>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold">Year-End Classification</p>
                    </div>
                    {sourceYearId && (
                      <button
                        onClick={() => loadStudentsForPromote()}
                        disabled={promoteRowsLoading}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
                        title="Reload students"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${promoteRowsLoading ? "animate-spin" : ""}`} />
                      </button>
                    )}
                  </div>

                  {allSchoolYears.length >= 1 ? (
                    <div className="bg-muted/50 rounded-lg px-4 py-3">
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Classifying students in</p>
                      <p className="text-sm font-semibold">{sourceYear?.name ?? "—"}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600">
                      No school years found. Add a school year in Settings → School Year &amp; Terms.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Saves to the current enrollment. Does not create new enrollments.
                  </p>
                </CardContent>
              </Card>

              {promoteRowsError && <ErrorAlert message={promoteRowsError} />}

              {promoteRowsLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading students…
                </div>
              )}

              {/* Missing promotion path warning */}
              {classIdsWithMissingPath.size > 0 && !selectedClassId && !promoteResult && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Promotion Path not set</strong> on {classBulkGroups
                      .filter((g) => classIdsWithMissingPath.has(g.currentClassId))
                      .map((g) => g.currentClassName).join(", ")}.
                    {" "}Edit each class in <strong>Classes</strong> to assign a Promotion Path.
                  </span>
                </div>
              )}

              {/* Class picker */}
              {promoteRows.length > 0 && !selectedClassId && !promoteResult && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Select a class to review</p>
                      <p className="text-xs text-muted-foreground mt-1">Work through one class at a time.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {classBulkGroups.map((g) => {
                        const missingPath = classIdsWithMissingPath.has(g.currentClassId);
                        return (
                          <button
                            key={g.currentClassId}
                            onClick={() => setSelectedClassId(g.currentClassId)}
                            className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              {missingPath && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                              <span className="text-sm font-medium">{g.currentClassName}</span>
                              {g.currentClassLevel && <span className="text-xs text-muted-foreground">({g.currentClassLevel})</span>}
                            </div>
                            <span className="text-xs text-muted-foreground">{g.studentCount} student{g.studentCount !== 1 ? "s" : ""} →</span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedClassGroup && !promoteResult && (
                <>
                  {/* Step 1 — Review recommendations */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Step 1 — Review Promotion Recommendations</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Recommendations are pre-filled from the class Promotion Path. Review only — handle exceptions in Step 2.
                        </p>
                      </div>

                      {/* Read-only summary */}
                      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">{selectedClassGroup.currentClassName}</span>
                              {selectedClassGroup.currentClassLevel && (
                                <span className="text-xs text-muted-foreground">({selectedClassGroup.currentClassLevel})</span>
                              )}
                            </div>
                            <div className="text-xs space-y-0.5">
                              <p>
                                <span className="text-muted-foreground">Promotion Path: </span>
                                <span className="font-medium">
                                  {classNextLevel === "GRADUATE" ? "Graduate / Moving Up"
                                    : classNextLevel === "NON_PROMOTIONAL" ? "Non-promotional"
                                    : classNextLevel || <span className="text-amber-600">⚠ Not set</span>}
                                </span>
                              </p>
                              <p>
                                <span className="text-muted-foreground">Recommended Outcome: </span>
                                <span className={`font-medium ${
                                  classNextLevel === "GRADUATE" ? "text-green-700" :
                                  classNextLevel === "NON_PROMOTIONAL" ? "text-amber-600" :
                                  classNextLevel ? "text-primary" : "text-amber-600"
                                }`}>
                                  {classNextLevel === "GRADUATE" ? "Graduated / Moving Up"
                                    : classNextLevel === "NON_PROMOTIONAL" ? "Needs Review"
                                    : classNextLevel ? `Eligible for ${classNextLevel}`
                                    : "Promotion Path Not Set"}
                                </span>
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5 flex-shrink-0">
                            {selectedClassGroup.studentCount} student{selectedClassGroup.studentCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-xs text-primary border-t border-border/50 pt-2">
                          ✓ Pre-filled for all {selectedClassGroup.studentCount} student{selectedClassGroup.studentCount !== 1 ? "s" : ""}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Update Promotion Path in Classes to change this for all students.
                        </p>
                        <button
                          onClick={() => loadStudentsForPromote()}
                          disabled={promoteRowsLoading}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${promoteRowsLoading ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>

                      <button
                        onClick={() => { setSelectedClassId(""); setPromoteSearch(""); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Back to class list
                      </button>
                    </CardContent>
                  </Card>

                  {/* Step 2 header + search */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Step 2 — Handle Exceptions
                        {" "}({filteredPromoteRows.length} student{filteredPromoteRows.length !== 1 ? "s" : ""})
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Update only students who need an exception.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Filter by student name…"
                      value={promoteSearch}
                      onChange={(e) => setPromoteSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Card className="overflow-hidden">
                    <div className="overflow-y-scroll max-h-[480px] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted border-b border-border">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                              Recommended Next Level
                              {targetYear && <p className="text-xs font-normal text-muted-foreground/60 mt-0.5">{targetYear.name}</p>}
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredPromoteRows.map((row) => {
                            return (
                            <tr key={row.studentId} className={`transition-colors ${row.classification === "unset" ? "hover:bg-muted/30" : "hover:bg-muted/40"}`}>
                              <td className="px-4 py-3 font-medium">{row.studentName}</td>
                              <td className="px-4 py-3">
                                {row.classification === "graduated" || row.classification === "not_continuing" ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : row.classification === "not_eligible_retained" ? (
                                  <span className="text-xs font-medium">{row.currentClassLevel || "—"}</span>
                                ) : row.nextLevel === "GRADUATE" ? (
                                  <span className="text-xs font-medium">Graduate / Moving Up</span>
                                ) : row.nextLevel === "NON_PROMOTIONAL" ? (
                                  <span className="text-xs text-muted-foreground italic">Non-promotional</span>
                                ) : row.nextLevel ? (
                                  <span className="text-xs font-medium">{row.nextLevel}</span>
                                ) : (
                                  <span className="text-xs text-amber-600 font-medium">Promotion Path Not Set</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center flex-wrap gap-1">
                                  {!isGraduatingClass && (
                                    <ActionBtn active={row.classification === "eligible"} onClick={() => setRowClassification(row.studentId, "eligible")}
                                      className="text-primary border-primary/40 bg-primary/5">
                                      Eligible
                                    </ActionBtn>
                                  )}
                                  {isGraduatingClass && (
                                    <ActionBtn active={row.classification === "graduated"} onClick={() => setRowClassification(row.studentId, "graduated")}
                                      className="text-green-700 border-green-300 bg-green-50">
                                      Graduate
                                    </ActionBtn>
                                  )}
                                  {!isGraduatingClass && (
                                    <ActionBtn active={row.classification === "not_continuing"} onClick={() => setRowClassification(row.studentId, "not_continuing")}
                                      className="text-rose-600 border-rose-300 bg-rose-50">
                                      Withdrawn
                                    </ActionBtn>
                                  )}
                                  <ActionBtn active={row.classification === "not_eligible_retained"} onClick={() => setRowClassification(row.studentId, "not_eligible_retained")}
                                    className="text-amber-600 border-amber-300 bg-amber-50">
                                    Retain
                                  </ActionBtn>
                                  <ActionBtn active={row.classification === "not_eligible_other"} onClick={() => setRowClassification(row.studentId, "not_eligible_other")}
                                    className="text-orange-600 border-orange-300 bg-orange-50">
                                    Other
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

                  {/* Summary + confirm */}
                  <div className="flex items-center justify-between bg-muted rounded-xl px-5 py-4">
                    <div className="text-sm space-y-1">
                      {eligibleCount > 0 && (
                        <p><span className="font-semibold text-primary">{eligibleCount} student{eligibleCount !== 1 ? "s" : ""}</span> eligible for next level</p>
                      )}
                      {retainedCount > 0 && (
                        <p><span className="font-semibold text-amber-600">{retainedCount} student{retainedCount !== 1 ? "s" : ""}</span> retained</p>
                      )}
                      {otherCount > 0 && (
                        <p><span className="font-semibold text-orange-600">{otherCount} student{otherCount !== 1 ? "s" : ""}</span> not eligible — other reason</p>
                      )}
                      {graduatedCount > 0 && (
                        <p><span className="font-semibold text-green-700">{graduatedCount} student{graduatedCount !== 1 ? "s" : ""}</span> graduated</p>
                      )}
                      {notContCount > 0 && (
                        <p className="text-muted-foreground text-xs">{notContCount} withdrawn</p>
                      )}
                      {unsetCount > 0 && (
                        <p className="text-muted-foreground text-xs">{unsetCount} not yet classified</p>
                      )}
                    </div>
                    <Button
                      onClick={handleClassifyConfirm}
                      disabled={isReadOnly || promoteSaving || classifiedCount === 0}
                      className="min-w-[200px]"
                    >
                      {promoteSaving ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                      ) : (
                        <><Check className="w-4 h-4" /> Save Year-End Classifications</>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* Empty state */}
              {promoteRows.length === 0 && !promoteRowsLoading && sourceYearId && !promoteResult && (
                <Card>
                  <CardContent className="p-12 text-center text-sm text-muted-foreground">
                    <Check className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-medium text-foreground">All classes have been classified</p>
                    <p className="mt-1">No unclassified enrolled students remain in {sourceYear?.name ?? "the selected year"}.</p>
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
                        <p className="font-semibold">Year-end classifications saved</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {promoteResult.classified} student{promoteResult.classified !== 1 ? "s" : ""} classified successfully.
                        </p>
                      </div>
                    </div>
                    {promoteResult.errors.length > 0 && (
                      <div className="border border-destructive/30 rounded-lg p-3 text-sm text-destructive space-y-1">
                        <p className="font-medium">Some records failed:</p>
                        {promoteResult.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                      </div>
                    )}
                    <Button variant="outline" onClick={() => { loadStudentsForPromote(); }}>
                      Classify Another Class
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
                        {e.schoolYearName && <span className="text-muted-foreground ml-1.5 text-xs">· {e.schoolYearName}</span>}
                        {e.periodName && <span className="text-muted-foreground ml-1.5 text-xs">· {e.periodName}</span>}
                        {(e.startDate || e.endDate) && (
                          <span className="text-muted-foreground ml-1.5 text-xs">· {e.startDate ?? "?"} – {e.endDate ?? "?"}</span>
                        )}
                      </div>
                      <Badge variant={e.status as "enrolled" | "completed" | "withdrawn" | "waitlisted" | "inquiry"}>{e.status}</Badge>
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
        { open: editModalOpen, onClose: () => { setEditModalOpen(false); setEditingStudent(null); }, title: "Edit Student", fErr: editFormError, setFErr: setEditFormError, f: editForm, setF: setEditForm, onSave: handleEdit, isEdit: true, photoFile: editPhotoFile, setPhotoFile: setEditPhotoFile },
        { open: addModalOpen, onClose: () => { setAddModalOpen(false); setForm(EMPTY_FORM); }, title: "Add Student Profile", fErr: formError, setFErr: setFormError, f: form, setF: setForm, onSave: handleAdd, isEdit: false, photoFile: addPhotoFile, setPhotoFile: setAddPhotoFile },
      ].map(({ open, onClose, title, fErr, setFErr, f, setF, onSave, isEdit, photoFile, setPhotoFile }) => (
        <Modal key={title} open={open} onClose={onClose} title={title} className="max-w-2xl">
          <div className="space-y-4">
            {fErr && <ErrorAlert message={fErr} />}
            {!isEdit && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <strong>Profile only</strong> — creates a student record without a school year, class, or billing. To enroll a student properly, use <strong>Enroll Student</strong> from the Students page header instead.
              </div>
            )}

            <div className="flex items-center gap-4">
              <AvatarUpload
                currentUrl={photoFile ? URL.createObjectURL(photoFile) : (f.photoUrl || null)}
                name={`${f.firstName} ${f.lastName}`}
                size="lg"
                onFileSelect={(file) => setPhotoFile(file)}
                onValidationError={(msg) => setFErr(msg)}
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
            {enrollmentModal.progressionStatus === "eligible" && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <Check className="w-4 h-4 flex-shrink-0" />
                This student is classified as <strong>eligible for next level</strong>.
              </div>
            )}
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

      {/* ── Students Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Students Help</h2>
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
                    id: "enrollment-vs-profile",
                    icon: UserCheck,
                    title: "Add Student Profile vs. Enroll Student — which to use",
                    searchText: "enroll enrollment add student profile difference new returning class billing school year waitlist pending",
                    body: (
                      <div className="space-y-2">
                        <p className="font-semibold text-foreground text-xs">Simple rule: if it involves a school year, use Enrollment. If it does not, use Add Student Profile.</p>
                        <div className="mt-2 space-y-3">
                          <div className="rounded-lg border border-border p-3 space-y-1">
                            <p className="text-xs font-semibold">Add Student Profile</p>
                            <p className="text-xs text-muted-foreground">Creates a basic student record only — no school year, no class, no billing. Use this when you need to store student information without enrolling them yet.</p>
                          </div>
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                            <p className="text-xs font-semibold">Enroll Student</p>
                            <p className="text-xs text-muted-foreground">Use for everything that involves a school year — including waitlisting, class assignment, and billing. Pre-registration is an enrollment with status <em>Waitlisted</em>.</p>
                          </div>
                        </div>
                        <Note>The <strong>Enroll Student</strong> button at the top of this page takes you to the Enrollment page.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "add-student-profile",
                    icon: UserPlus,
                    title: "Add Student Profile — how to use it",
                    searchText: "add student profile record no school year no class how to save",
                    body: (
                      <div className="space-y-2">
                        <p>Creates a student record without a school year, class, or billing. Use this only when you need to store information and enrollment isn&apos;t happening yet.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Student Profile</strong> (top right, outline button).</span>} />
                          <Step n={2} text={<span>Enter <strong>First Name</strong>, <strong>Last Name</strong>, and the <strong>Parent/Guardian name</strong> — required.</span>} />
                          <Step n={3} text={<span>Fill in the guardian&apos;s <strong>contact number</strong> and <strong>email</strong> — needed later to send the parent portal invite.</span>} />
                          <Step n={4} text={<span>Expand optional sections (Medical, Emergency Contact, etc.) for additional details.</span>} />
                          <Step n={5} text={<span>Click <strong>Save Student</strong>.</span>} />
                        </div>
                        <Tip>When you&apos;re ready to enroll this student, use <strong>Enroll Student → Enroll Returning Student</strong> to assign them to a school year and class.</Tip>
                        <Note>Students added this way will not appear in attendance, billing, or class lists until they are enrolled.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "edit-student",
                    icon: Pencil,
                    title: "Edit a student's details",
                    searchText: "edit update change student details profile class guardian contact photo",
                    body: (
                      <div className="space-y-2">
                        <p>Click the student row to open their profile, then use the Edit button to change any information.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click anywhere on the student's row in the list to open the <strong>profile panel</strong> on the right.</span>} />
                          <Step n={2} text={<span>Click the <strong>pencil icon</strong> (Edit) in the profile panel header.</span>} />
                          <Step n={3} text={<span>Update the fields you need. The form is divided into collapsible sections — expand the ones relevant to your change.</span>} />
                          <Step n={4} text={<span>Click <strong>Save Changes</strong>.</span>} />
                        </div>
                        <Tip>Changing the class here changes the student's <em>enrollment</em> assignment. Use the <strong>Add Enrollment</strong> button in the profile instead if the student is enrolling in an additional class, or if you want to keep the history of prior enrollments.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "guardian",
                    icon: Users,
                    title: "Add or update a guardian",
                    searchText: "guardian parent mother father contact email phone relationship add",
                    body: (
                      <div className="space-y-2">
                        <p>Each student should have at least one primary guardian — this is the person who will receive the parent portal invite.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the student's <strong>profile panel</strong> by clicking their row.</span>} />
                          <Step n={2} text={<span>The <strong>Guardian</strong> section shows the current primary guardian's name, phone, and email.</span>} />
                          <Step n={3} text={<span>To edit guardian details, click <strong>Edit (pencil icon)</strong> on the student and update the Parent / Guardian section.</span>} />
                        </div>
                        <Note>Currently the system supports one guardian per student in the add/edit flow. If a student has multiple guardians (both parents, etc.), note the additional contact in the emergency contact fields for now.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "invite-parent",
                    icon: LinkIcon,
                    title: "Send a parent portal invite",
                    searchText: "invite parent portal link send copy generate access app",
                    body: (
                      <div className="space-y-2">
                        <p>Parents need an invite link to access their child's info in the parent portal. The link is tied to their email address.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the student's <strong>profile panel</strong> by clicking their row.</span>} />
                          <Step n={2} text={<span>Click <strong>Invite Parent</strong> (link icon button in the profile header).</span>} />
                          <Step n={3} text={<span>The system generates a unique invite link. Click <strong>Copy Link</strong>, then share it with the parent via WhatsApp, Messenger, or SMS.</span>} />
                          <Step n={4} text={<span>When the parent opens the link and signs up, they'll see their child's attendance, updates, billing, events, and progress.</span>} />
                        </div>
                        <Tip>The invite link is tied to the guardian's email. Make sure the email on the student record matches what the parent will use to sign up — otherwise the link won't connect to the right student.</Tip>
                        <Note>If the parent loses access or the link expires, you can regenerate it by clicking Invite Parent again — a new link is created each time.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "enrollment",
                    icon: FileText,
                    title: "Manage a student's enrollments",
                    searchText: "enrollment class enroll add change status period history multiple",
                    body: (
                      <div className="space-y-2">
                        <p>A student can be enrolled in multiple classes or have enrollment history across school years. All of this is tracked under their profile.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the student's <strong>profile panel</strong> and find the <strong>Enrollments</strong> section.</span>} />
                          <Step n={2} text={<span>Existing enrollments are listed with class name, period, and status. Click <strong>+ Add Enrollment</strong> to add another.</span>} />
                          <Step n={3} text={<span>In the Add Enrollment modal, select the <strong>class</strong> and set the <strong>status</strong> (Enrolled, Waitlisted, etc.). Adding an academic period is optional.</span>} />
                          <Step n={4} text={<span>To change a student's status (e.g. from Enrolled to Withdrawn), edit the enrollment from this section.</span>} />
                        </div>
                        <Note>The class filter and enrollment count on the student list are based on the student's <em>active</em> enrollment for the current school year. If a student has multiple enrollments, only the most recent enrolled one is shown in the list view.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "photo",
                    icon: UserPlus,
                    title: "Upload a student photo",
                    searchText: "photo profile picture upload avatar image student",
                    body: (
                      <div className="space-y-2">
                        <p>Student photos appear in the attendance list, profile panel, and parent portal.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the student edit modal (pencil icon in profile panel).</span>} />
                          <Step n={2} text={<span>Click the <strong>avatar circle</strong> at the top of the form to upload a photo.</span>} />
                          <Step n={3} text={<span>Supported: JPG, PNG. Photos are auto-compressed and cropped to a square before upload.</span>} />
                          <Step n={4} text={<span>Click <strong>Save Changes</strong> — the new photo takes effect immediately.</span>} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "filter-search",
                    icon: Search,
                    title: "Find a student or filter the list",
                    searchText: "search filter find class status code name lookup narrow",
                    body: (
                      <div className="space-y-2">
                        <p>Several ways to find who you're looking for:</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Search bar</strong> — searches by student name, student code, or guardian name. Works across all statuses and classes.</span>} />
                          <Step n={2} text={<span><strong>School Year selector</strong> — defaults to the Active year. Switch to a past year to view that year&apos;s class and enrollment status for each student.</span>} />
                          <Step n={3} text={<span><strong>Class filter</strong> — shows students in a specific class only. Reflects the selected school year.</span>} />
                          <Step n={4} text={<span><strong>Status filter</strong> — narrows to Enrolled, Waitlisted, Inquiry, Withdrawn, or Completed.</span>} />
                        </div>
                        <Note>All filters work together. To see all Waitlisted students in Kinder AM, set both the class filter and the status filter at the same time.</Note>
                        <Note>If an amber banner says students are enrolled in multiple years simultaneously, use the Year selector to review each year&apos;s enrollments and fix any data inconsistencies.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "promote",
                    icon: GraduationCap,
                    title: "Review and confirm promotion outcomes at year-end",
                    searchText: "classify classification year-end eligible retain graduate not continuing end year promotion path next level section placement review recommendations exceptions outcome refresh",
                    body: (
                      <div className="space-y-2">
                        <p>Promotion outcomes are pre-filled from each class&apos;s Promotion Path. Review recommendations and handle individual exceptions.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open <strong>Year-End Classification</strong> and select a class.</span>} />
                          <Step n={2} text={<span><strong>Step 1</strong> shows the Promotion Path and recommended outcome. No action needed here.</span>} />
                          <Step n={3} text={<span>Wrong recommendation? Update the Promotion Path in <strong>Classes</strong>, then click <strong>Refresh</strong> in Step 1.</span>} />
                          <Step n={4} text={<span><strong>Step 2</strong>: override individual students only — Retain, Withdraw, or Graduate as needed.</span>} />
                          <Step n={5} text={<span>Click <strong>Save Year-End Classifications</strong>.</span>} />
                        </div>
                        <Note><strong>Recommended Next Level</strong> shows a level, not a section. Section assignment happens at enrollment.</Note>
                        <Note>Promotion Path Not Set (amber)? Edit the class in <strong>Classes</strong> first.</Note>
                        <Tip>Classifications don&apos;t create enrollments. Enroll returning students separately.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "student-code",
                    icon: FileText,
                    title: "Student codes — what they are and how they're assigned",
                    searchText: "student code id number generate prefix format auto",
                    body: (
                      <div className="space-y-2">
                        <p>Student codes are optional internal reference numbers (e.g. BK-0001) used on billing statements and reports.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Codes are auto-generated when a student is saved — based on your school's code format configured in Settings.</span>} />
                          <Step n={2} text={<span>The code appears in the student list below their name. It's also searchable in the search bar.</span>} />
                          <Step n={3} text={<span>To configure the code format (prefix, padding), go to <strong>Settings → Student Code Format</strong>.</span>} />
                        </div>
                        <Note>If a student was added before code generation was configured, they may not have a code. You can edit the student and save again to trigger code generation, or assign a custom code manually through the database.</Note>
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
    </div>
  );
}
