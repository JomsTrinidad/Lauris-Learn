"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Pencil, ChevronDown, ChevronUp,
  Link as LinkIcon, Copy, Check, BookOpen,
  ArrowRight, RefreshCw, Users, GraduationCap,
  HelpCircle, AlertTriangle, ChevronRight, X, UserPlus, UserCheck, FileText,
  Share2, MoreHorizontal, Printer, Heart, Hash,
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
import { queryKeys } from "@/lib/query-client";
import { ShareIdentityWithClinicModal } from "@/features/clinic-sharing/ShareIdentityWithClinicModal";
import { getSchoolOrganizationId } from "@/features/clinic-sharing/queries";
import { useStudentsList, useStudentsClasses } from "@/lib/hooks";
import { reportError, generateRequestId } from "@/lib/monitoring";
import { insertEnrollmentTransitionClient } from "@/lib/enrollment-transitions";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrollmentStatus = "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed";
type CommPref = "app" | "sms_phone" | "printed_note" | "in_person" | "assisted_by_school";
type ClassificationAction = "eligible" | "not_eligible_retained" | "not_eligible_other" | "graduated" | "not_continuing" | "withdrawn" | "unset";
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
  return `${years} yr${years !== 1 ? "s" : ""} ${months} mo${months !== 1 ? "s" : ""}`;
}

function diffYM(fromStr: string, toStr: string): { years: number; months: number } {
  const f = new Date(fromStr + "T00:00:00");
  const t = new Date(toStr + "T00:00:00");
  let years = t.getFullYear() - f.getFullYear();
  let months = t.getMonth() - f.getMonth();
  if (t.getDate() < f.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

function fmtYM(years: number, months: number): string {
  if (years === 0 && months === 0) return "< 1 mo";
  if (years === 0) return `${months} mo${months !== 1 ? "s" : ""}`;
  return `${years} yr${years !== 1 ? "s" : ""} ${months} mo${months !== 1 ? "s" : ""}`;
}

function calcTenure(
  enrollments: EnrollmentEntry[],
  schoolYears: { id: string; startDate: string; endDate: string }[],
): { text: string; gapText: string | null } {
  if (enrollments.length === 0) return { text: "—", gapText: null };

  const syMap = new Map(schoolYears.map((sy) => [sy.id, sy]));
  const today = new Date().toISOString().slice(0, 10);

  // Resolve date intervals — enrollment dates take priority, school year dates are the fallback
  const intervals = enrollments
    .map((e) => {
      const sy = syMap.get(e.schoolYearId);
      const start = e.startDate ?? sy?.startDate ?? null;
      const end = e.status === "enrolled" ? today : (e.endDate ?? sy?.endDate ?? null);
      if (!start || !end) return null;
      return { start, end };
    })
    .filter((i): i is { start: string; end: string } => i !== null)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (intervals.length === 0) return { text: "—", gapText: null };

  const { years, months } = diffYM(intervals[0].start, intervals[intervals.length - 1].end);
  if (years < 0) return { text: "—", gapText: null };
  const text = fmtYM(years, months);

  // Gaps: any break between consecutive intervals longer than 90 days (more than a summer break)
  let totalGapDays = 0;
  let gapCount = 0;
  for (let i = 0; i < intervals.length - 1; i++) {
    const prevEnd = new Date(intervals[i].end + "T00:00:00");
    const nextStart = new Date(intervals[i + 1].start + "T00:00:00");
    const gapDays = (nextStart.getTime() - prevEnd.getTime()) / 86_400_000;
    if (gapDays > 90) { totalGapDays += gapDays; gapCount++; }
  }

  let gapText: string | null = null;
  if (gapCount > 0) {
    const gapMonths = Math.round(totalGapDays / 30.44);
    const gd = fmtYM(Math.floor(gapMonths / 12), gapMonths % 12);
    gapText = gapCount === 1 ? `${gd} gap` : `${gapCount} gaps (${gd} total)`;
  }

  return { text, gapText };
}

interface AcademicPeriod { id: string; name: string; }

interface EnrollmentEntry {
  id: string; classId: string; className: string; classLevel: string;
  periodId: string | null; periodName: string | null;
  schoolYearId: string; schoolYearName: string;
  status: EnrollmentStatus; startDate: string | null; endDate: string | null;
}

interface Student {
  id: string; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null;
  studentCode: string | null; preferredName: string | null;
  classId: string | null; className: string; classLevel: string;
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
  childProfileId: string | null;
  lrn: string | null;
  lrnIdentifierId: string | null;
}

interface ClassOption { id: string; name: string; level: string; enrolled: number; capacity: number; }

interface StudentForm {
  firstName: string; lastName: string; preferredName: string;
  dateOfBirth: string; gender: string; classId: string; periodId: string;
  enrollmentStatus: string; parentName: string; relationship: string;
  contact: string; email: string; commPref: CommPref;
  allergies: string; medicalConditions: string; emergencyContactName: string;
  emergencyContactPhone: string; specialNeeds: string; teacherNotes: string;
  adminNotes: string; authorizedPickups: string; primaryLanguage: string;
  progressionStatus: string; progressionNotes: string; photoUrl: string;
  lrn: string;
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
  isTerminalLevel: boolean;
  suggestedNextLevelName: string;
}
interface ClassifyResult { classified: number; errors: string[]; }
interface LevelCatalogEntry { id: string; name: string; kind: string; progressionOrder: number | null; }

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
  lrn: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "Active Students" },
  { value: "enrolled", label: "Enrolled" },
  { value: "__pending__", label: "Pending Placement" },
  { value: "graduated", label: "Graduated" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "__all__", label: "All Students" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionToggle({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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

// === LRN DATA LOGIC (Phase 1.5) ===
//
// Isolated upsert/update/delete path for a student's Learner Reference Number.
// Kept top-level (not embedded in a UI handler) so it can be extracted to a
// dedicated module later without touching the page's render logic.
//
// Storage model (from migration 071):
//   - LRN lives in `child_identifiers` keyed on a `child_profile_id`.
//   - `child_profiles` is school-agnostic; the link to a school student is
//     `students.child_profile_id` (nullable FK). Post-migration NEW students
//     have NULL until something explicitly links them.
//   - This helper lazy-creates a `child_profiles` row + UPDATEs the student
//     link the first time an LRN is set. RLS requires the link to exist
//     BEFORE the identifier write, so the order is strictly sequential.
//
// Empty-string `lrnInput` means "clear the LRN" — deletes the existing
// identifier row (if any) but leaves the child_profile alone.
async function upsertStudentLrn(
  supabase: ReturnType<typeof createClient>,
  args: {
    studentId: string;
    lrnInput: string;
    currentChildProfileId: string | null;
    currentLrnIdentifierId: string | null;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    dateOfBirth: string | null;
  }
): Promise<{ ok: boolean; error: string | null; childProfileId?: string | null; identifierId?: string | null }> {
  const lrn = args.lrnInput.trim();

  // Clear path
  if (!lrn) {
    if (args.currentLrnIdentifierId) {
      const { error } = await supabase
        .from("child_identifiers")
        .delete()
        .eq("id", args.currentLrnIdentifierId);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, error: null, childProfileId: args.currentChildProfileId, identifierId: null };
  }

  // Lazy-create child_profile if the student isn't linked yet.
  let cpid = args.currentChildProfileId;
  if (!cpid) {
    const first = (args.firstName ?? "").trim();
    const last = (args.lastName ?? "").trim();
    const display = `${first} ${last}`.trim() || "Unknown";
    // Pre-mint the UUID client-side so we avoid INSERT...RETURNING.
    // The SELECT policy on child_profiles requires the row to be linked to a
    // student before it's visible — a RETURNING select on an unlinked row is
    // blocked by RLS. Same workaround as UploadDocumentModal (D7).
    const newCpId = crypto.randomUUID();
    const { error: cpErr } = await supabase
      .from("child_profiles")
      .insert({
        id: newCpId,
        display_name: display,
        first_name: first || null,
        last_name: last || null,
        preferred_name: (args.preferredName ?? "").trim() || null,
        date_of_birth: args.dateOfBirth || null,
        created_in_app: "lauris_learn",
      } as never);
    if (cpErr) {
      return { ok: false, error: cpErr.message };
    }
    cpid = newCpId;

    const { error: linkErr } = await supabase
      .from("students")
      .update({ child_profile_id: cpid } as never)
      .eq("id", args.studentId);
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  // Update existing identifier (no other fields).
  if (args.currentLrnIdentifierId) {
    const { error } = await supabase
      .from("child_identifiers")
      .update({ identifier_value: lrn } as never)
      .eq("id", args.currentLrnIdentifierId);
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return { ok: false, error: "This LRN is already registered to another child." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null, childProfileId: cpid, identifierId: args.currentLrnIdentifierId };
  }

  // Insert new identifier.
  const { data: insRow, error: insErr } = await supabase
    .from("child_identifiers")
    .insert({
      child_profile_id: cpid,
      identifier_type: "lrn",
      identifier_value: lrn,
      country_code: "PH",
    } as never)
    .select("id")
    .single();
  if (insErr || !insRow) {
    if (insErr?.code === "23505" || /duplicate|unique/i.test(insErr?.message ?? "")) {
      return { ok: false, error: "This LRN is already registered to another child." };
    }
    return { ok: false, error: insErr?.message ?? "Failed to save LRN." };
  }
  return { ok: true, error: null, childProfileId: cpid, identifierId: (insRow as { id: string }).id };
}

// ─── Page component ───────────────────────────────────────────────────────────

// ── Row overflow menu ─────────────────────────────────────────────────────────

function RowMenu({
  student,
  onEdit,
  onShare,
  onGraduate,
}: {
  student: Student;
  onEdit: () => void;
  onShare: (() => void) | null;
  onGraduate: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const extraItems = (onShare ? 1 : 0) + (onGraduate ? 1 : 0);
    const menuH = 68 + extraItems * 40;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > menuH ? rect.bottom + 4 : rect.top - menuH - 4;
    setPos({ top, left: rect.right - 192 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); openMenu(); }}
        aria-label="More actions"
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 192 }}
          className="bg-card border border-border rounded-lg shadow-lg py-1 text-sm"
        >
          <Link
            href={`/documents?student=${student.id}`}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-foreground"
            onClick={() => setOpen(false)}
          >
            <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            Documents
          </Link>
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-foreground text-left"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            Edit Student
          </button>
          {onGraduate && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => { setOpen(false); onGraduate(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-foreground text-left"
              >
                <GraduationCap className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                Mark as Graduated
              </button>
            </>
          )}
          {onShare && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => { setOpen(false); onShare(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-foreground text-left"
              >
                <Share2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                Share with Clinic
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function StudentsPage() {
  const { schoolId, schoolName, activeYear, viewingYear: ctxViewingYear, userId, userRole, isReadOnly, allSchoolYears: schoolYearList } = useSchoolContext();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pendingEditStudentId, setPendingEditStudentId] = useState<string | null>(null);
  const [returnToPath, setReturnToPath] = useState<string | null>(null);
  const [pendingEditLoading, setPendingEditLoading] = useState(false);
  const openEditCalledRef = useRef(false);

  // Use cached query hooks for students and classes
  const studentsQuery = useStudentsList(schoolId);
  const classesQuery = useStudentsClasses(schoolId, (ctxViewingYear?.id ?? activeYear?.id) || null);

  // Helper to invalidate both students and classes queries
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.list(schoolId || "") });
    void queryClient.invalidateQueries({ queryKey: queryKeys.classes.list(schoolId || "") });
  }, [queryClient, schoolId]);

  // Phase 6D — Share-with-Clinic shortcut state.
  const [shareClinicTarget, setShareClinicTarget] = useState<{
    childProfileId: string;
    name: string;
  } | null>(null);
  const [schoolOrgId, setSchoolOrgId] = useState<string | null>(null);
  useEffect(() => {
    if (userRole !== "school_admin" || !schoolId) {
      setSchoolOrgId(null);
      return;
    }
    let cancelled = false;
    getSchoolOrganizationId(schoolId).then((id) => {
      if (!cancelled) setSchoolOrgId(id);
    });
    return () => { cancelled = true; };
  }, [schoolId, userRole]);

  // Tab
  const [activeTab, setActiveTab] = useState<StudentsTab>("students");

  // Students tab state
  const [students, setStudents] = useState<Student[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [codeConfig, setCodeConfig] = useState<SchoolCodeConfig>({ prefix: "LL", padding: 4, includeYear: false });

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
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

  // Graduate workflow state
  const [graduateTarget, setGraduateTarget] = useState<Student | null>(null);
  const [graduationDate, setGraduationDate] = useState("");
  const [graduationNote, setGraduationNote] = useState("");
  const [graduateSaving, setGraduateSaving] = useState(false);
  const [graduateError, setGraduateError] = useState<string | null>(null);

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
  const [levelCatalog, setLevelCatalog] = useState<LevelCatalogEntry[]>([]);
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

  // Year completion snapshots (historical view only)
  // Keyed by student_id; populated when viewing a closed historical year.
  const [yearCompletions, setYearCompletions] = useState<Record<string, {
    completionStatus: string;
    progressionStatus: string | null;
    finalClassName: string | null;
    finalLevelName: string | null;
  }>>({});

  // ─── Effects ───────────────────────────────────────────────────────────────

  // On mount: read URL params
  //   ?editStudent=<id>&returnTo=<path> — open edit modal immediately
  //   ?tab=promote — switch to Year-End Classification tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editStudent");
    const returnTo = params.get("returnTo");
    const tab = params.get("tab");
    window.history.replaceState(null, "", window.location.pathname);
    if (tab === "promote") {
      setActiveTab("promote");
    }
    if (editId) {
      setPendingEditStudentId(editId);
      setReturnToPath(returnTo ?? null);
      openEditCalledRef.current = false;
      // Open modal right away so the user never sees the page list
      setPendingEditLoading(true);
      setEditModalOpen(true);
    }
  }, []);

  // Once students array is populated, populate the edit form and clear the loading state
  useEffect(() => {
    if (!pendingEditStudentId || students.length === 0 || openEditCalledRef.current) return;
    const student = students.find((s) => s.id === pendingEditStudentId);
    if (!student) return;
    openEditCalledRef.current = true;
    setPendingEditStudentId(null);
    openEdit(student);
    setPendingEditLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEditStudentId, students]);

  // On mount / school change: load code config and academic periods (still direct queries)
  // Students and classes now come from hooks
  useEffect(() => {
    if (!schoolId || !activeYear?.id) return;
    setViewingYearId(activeYear.id);
    Promise.all([loadCodeConfig(), loadAcademicPeriods()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  // Sync Header year-switcher (global context) into the page's local year filter.
  // When the user picks a non-active year from the Header dropdown, show that
  // year's enrollment data on this page without needing the in-page year picker.
  useEffect(() => {
    if (ctxViewingYear?.id) setViewingYearId(ctxViewingYear.id);
  }, [ctxViewingYear?.id]);

  // Load year-end completion snapshots when viewing a historical year.
  // Clears when returning to the active year.
  // Note: isHistoricalView is derived lower in this component; we compute
  // the same predicate inline here to avoid a TDZ reference.
  useEffect(() => {
    const inHistoricalView = !!viewingYearId && viewingYearId !== activeYear?.id;
    if (!inHistoricalView || !viewingYearId || !schoolId) {
      setYearCompletions({});
      return;
    }
    loadYearCompletions(viewingYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingYearId, activeYear?.id, schoolId]);

  async function loadYearCompletions(yearId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("school_year_completions")
      .select("student_id, completion_status, progression_status, final_class_name, final_level_name")
      .eq("school_year_id", yearId)
      .eq("school_id", schoolId);
    const map: Record<string, { completionStatus: string; progressionStatus: string | null; finalClassName: string | null; finalLevelName: string | null }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data ?? []) as any[]).forEach((row: any) => {
      map[row.student_id] = {
        completionStatus: row.completion_status,
        progressionStatus: row.progression_status,
        finalClassName: row.final_class_name,
        finalLevelName: row.final_level_name,
      };
    });
    setYearCompletions(map);
  }

  // Transform hook data into students state
  useEffect(() => {
    if (studentsQuery.data) {
      const { students: rawStudents, lrnByProfile } = studentsQuery.data;
      const yearId = activeYear?.id ?? null;

      setStudents(
        (rawStudents ?? []).map((s) => {
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
            classLevel: e.classes?.class_levels?.name ?? "",
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

          // Most recent enrollment with a classification
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
            classLevel: activeEnrollment?.classes?.class_levels?.name ?? "",
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
            progressionStatus: (activeEnrollment as any)?.progression_status ??
              (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll.progression_status : null),
            progressionNotes: (activeEnrollment as any)?.progression_notes ??
              (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll.progression_notes : null),
            recommendedNextLevel: (activeEnrollment as any)?.classes?.next_level ??
              (classifiedEnroll && classifiedEnroll.id === activeEnrollment?.id ? classifiedEnroll?.classes?.next_level : null),
            photoUrl: sx.photo_url ?? null,
            childProfileId: sx.child_profile_id ?? null,
            lrn: sx.child_profile_id ? (lrnByProfile.get(sx.child_profile_id)?.value ?? null) : null,
            lrnIdentifierId: sx.child_profile_id ? (lrnByProfile.get(sx.child_profile_id)?.id ?? null) : null,
          };
        })
      );
      setError(null);
    }
    if (studentsQuery.error) {
      setError((studentsQuery.error as Error).message || "Failed to load students");
    }
  }, [studentsQuery.data, studentsQuery.error, activeYear?.id]);

  // Update classes state from hook
  useEffect(() => {
    if (classesQuery.data) {
      setClassOptions(classesQuery.data);
    }
  }, [classesQuery.data]);

  useEffect(() => {
    if (!schoolId) return;
    if (activeTab === "promote" && !promoteInitialized) {
      loadPromoteSetup();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, promoteInitialized, schoolId]);


  // ─── Students tab functions ────────────────────────────────────────────────

  // Note: loadAll() is no longer used. Hook data automatically populates students + classes.
  // This function is kept for compatibility with internal reload paths (e.g., after student creation).

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

    const createStudentRequestId = generateRequestId();
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

    if (sErr || !student) {
      reportError(new Error(sErr?.message ?? "Failed to create student."), {
        module: "students",
        action: "student_creation",
        schoolId: schoolId || undefined,
        metadata: {
          childName: `${form.firstName} ${form.lastName}`,
          requestId: createStudentRequestId,
        },
      });
      setFormError(sErr?.message ?? "Failed to create student.");
      setSaving(false);
      return;
    }

    await generateStudentCode(student.id);

    // LRN — Phase 1.5. Lazy-create child_profile + identifier when LRN is set.
    if (form.lrn.trim()) {
      const lrnRes = await upsertStudentLrn(supabase, {
        studentId: student.id,
        lrnInput: form.lrn,
        currentChildProfileId: null,
        currentLrnIdentifierId: null,
        firstName: form.firstName,
        lastName: form.lastName,
        preferredName: form.preferredName,
        dateOfBirth: form.dateOfBirth || null,
      });
      if (!lrnRes.ok) {
        setFormError(lrnRes.error ?? "Failed to save LRN.");
        setSaving(false);
        invalidateAll();
        return;
      }
    }

    if (addPhotoFile) {
      const photoUrl = await uploadProfilePhoto(student.id, addPhotoFile);
      if (photoUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("students").update({ photo_url: photoUrl }).eq("id", student.id);
      }
      setAddPhotoFile(null);
    }

    const { error: gErr } = await supabase.from("guardians").insert({
      student_id: student.id,
      full_name: form.parentName.trim(),
      relationship: form.relationship,
      phone: form.contact.trim() || null,
      email: form.email.trim() || null,
      is_primary: true,
      communication_preference: form.commPref,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (gErr) {
      reportError(new Error(gErr.message), {
        module: "students",
        action: "guardian_creation",
        schoolId: schoolId || undefined,
        metadata: {
          studentId: student.id,
          requestId: createStudentRequestId,
        },
      });
    }

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
        reportError(new Error(j.error ?? "Enrollment failed."), {
          module: "students",
          action: "student_enrollment_creation",
          schoolId: schoolId || undefined,
          metadata: {
            studentId: student.id,
            classId: form.classId,
            requestId: createStudentRequestId,
          },
        });
        setFormError(j.error ?? "Student created but enrollment failed.");
        setSaving(false);
        invalidateAll();
        return;
      }
    }

    setSaving(false);
    setAddModalOpen(false);
    setForm(EMPTY_FORM);
    invalidateAll();
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
      lrn: student.lrn ?? "",
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

    // LRN — Phase 1.5. Insert / update / delete in one helper call.
    {
      const lrnRes = await upsertStudentLrn(supabase, {
        studentId: editingStudent.id,
        lrnInput: editForm.lrn,
        currentChildProfileId: editingStudent.childProfileId,
        currentLrnIdentifierId: editingStudent.lrnIdentifierId,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        preferredName: editForm.preferredName,
        dateOfBirth: editForm.dateOfBirth || null,
      });
      if (!lrnRes.ok) {
        setEditFormError(lrnRes.error ?? "Failed to save LRN.");
        setSaving(false);
        return;
      }
    }

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

    // Mirror /api/students/promote so the per-student override behaves the
    // same as bulk Year-End Classification:
    //   - 'withdrawn'   → enrollments.status = 'withdrawn' (mid-year exit)
    //   - any other classification → enrollments.status = 'completed' (year done)
    //   - clearing the classification → leave status untouched (don't auto-revert
    //     a previously completed/withdrawn enrollment back to enrolled)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressionPayload: any = {
      progression_status: editForm.progressionStatus || null,
      progression_notes: editForm.progressionNotes.trim() || null,
    };
    if (editForm.progressionStatus) {
      progressionPayload.status = editForm.progressionStatus === "withdrawn" ? "withdrawn" : "completed";
    }
    if (editingStudent.enrollmentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: progErr } = await (supabase as any).from("enrollments").update(progressionPayload).eq("id", editingStudent.enrollmentId);
      if (!progErr && editForm.progressionStatus) {
        await insertEnrollmentTransitionClient(supabase, {
          enrollmentId:        editingStudent.enrollmentId,
          transitionKind:      "progression_classified",
          fromStatus:          "enrolled",
          toStatus:            progressionPayload.status ?? "enrolled",
          toProgressionStatus: editForm.progressionStatus,
          changedBy:           userId ?? null,
          changeReason:        editForm.progressionNotes.trim() || null,
        });
      }
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
    invalidateAll();
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
    invalidateAll();
  }

  async function handleUpdateEnrollmentStatus(enrollmentId: string, newStatus: string) {
    setEnrollmentStatusUpdating(enrollmentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase as any).from("enrollments").update({ status: newStatus }).eq("id", enrollmentId);
    if (!upErr) {
      await insertEnrollmentTransitionClient(supabase, {
        enrollmentId,
        transitionKind: "status_change",
        toStatus:       newStatus,
        changedBy:      userId ?? null,
      });
    }
    setEnrollmentStatusUpdating(null);
    invalidateAll();
  }

  async function handleMarkGraduated() {
    if (!graduateTarget?.enrollmentId) return;
    setGraduateSaving(true);
    setGraduateError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("enrollments")
      .update({
        status: "completed",
        progression_status: "graduated",
        progression_notes: graduationNote.trim() || null,
        ...(graduationDate ? { end_date: graduationDate } : {}),
      })
      .eq("id", graduateTarget.enrollmentId);
    setGraduateSaving(false);
    if (error) { setGraduateError(error.message); return; }
    await insertEnrollmentTransitionClient(supabase, {
      enrollmentId:        graduateTarget.enrollmentId,
      transitionKind:      "progression_classified",
      fromStatus:          "enrolled",
      toStatus:            "completed",
      toProgressionStatus: "graduated",
      changedBy:           userId ?? null,
      changeReason:        graduationNote.trim() || null,
    });
    setGraduateTarget(null);
    setGraduationDate("");
    setGraduationNote("");
    invalidateAll();
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
        classes(name, class_levels(name)),
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
        currentLevel: e.classes?.class_levels?.name ?? "",
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
    if (!src || !schoolId) return;
    void tgt; // target is informational only in classification flow
    setPromoteRowsLoading(true);
    setPromoteRowsError(null);
    setPromoteRows([]);
    setPromoteResult(null);
    setPromoteSearch("");
    setSelectedClassId("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Load enrollments and the school's active level catalog in parallel
    const [{ data: enrollments, error: enrollErr }, { data: levels }] = await Promise.all([
      sb.from("enrollments")
        .select(`
          id, student_id, class_id,
          students(first_name, last_name),
          classes(id, name, next_level, class_levels(id, name, kind, progression_order))
        `)
        .eq("school_year_id", src)
        .eq("status", "enrolled")
        .is("progression_status", null),
      sb.from("class_levels")
        .select("id, name, kind, progression_order")
        .eq("school_id", schoolId)
        .is("archived_at", null),
    ]);

    if (enrollErr) { setPromoteRowsError(enrollErr.message); setPromoteRowsLoading(false); return; }

    // Build level catalog and compute the max progression_order for core levels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog: LevelCatalogEntry[] = ((levels ?? []) as any[]).map((l: any) => ({
      id: l.id, name: l.name, kind: l.kind, progressionOrder: l.progression_order ?? null,
    }));
    setLevelCatalog(catalog);

    const coreOrdered = catalog
      .filter((l) => l.kind === "core" && l.progressionOrder != null)
      .sort((a, b) => (a.progressionOrder ?? 0) - (b.progressionOrder ?? 0));
    const maxCoreOrder = coreOrdered.length > 0 ? coreOrdered[coreOrdered.length - 1].progressionOrder : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const built: PromoteRow[] = ((enrollments ?? []) as any[]).map((e: any) => {
      const student = e.students;
      const cls = e.classes;
      const studentName = student ? `${student.first_name} ${student.last_name}` : e.student_id;
      const nextLevel = cls?.next_level ?? "";
      const levelMeta = cls?.class_levels as { id?: string; name?: string; kind?: string; progression_order?: number | null } | null;

      // Determine classification suggestion:
      // 1. If next_level is explicitly configured on the class → use existing sentinel logic.
      // 2. If next_level is empty but the class has a core level with progression_order → derive from ordering.
      let suggestedClassification: ClassificationAction = "unset";
      let isTerminalLevel = false;
      let suggestedNextLevelName = "";

      if (nextLevel === "GRADUATE") {
        suggestedClassification = "graduated";
        isTerminalLevel = true;
      } else if (nextLevel && nextLevel !== "NON_PROMOTIONAL") {
        suggestedClassification = "eligible";
        suggestedNextLevelName = nextLevel;
      } else if (!nextLevel && levelMeta?.kind === "core" && levelMeta.progression_order != null) {
        // No explicit next_level configured — derive from progression_order
        const thisOrder = levelMeta.progression_order;
        if (maxCoreOrder != null && thisOrder === maxCoreOrder) {
          suggestedClassification = "graduated";
          isTerminalLevel = true;
        } else {
          const nextLevel_ = coreOrdered.find((l) => (l.progressionOrder ?? 0) > thisOrder);
          if (nextLevel_) {
            suggestedClassification = "eligible";
            suggestedNextLevelName = nextLevel_.name;
          }
        }
      }

      return {
        studentId: e.student_id,
        studentName,
        currentEnrollmentId: e.id,
        currentClassId: e.class_id,
        currentClassName: cls?.name ?? "—",
        currentClassLevel: levelMeta?.name ?? "",
        nextLevel,
        classification: suggestedClassification,
        isTerminalLevel,
        suggestedNextLevelName,
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

    const promoteRequestId = generateRequestId();

    // Auto-populate notes from classification + level context
    function autoNotes(r: PromoteRow): string {
      const nextLevelLabel = r.suggestedNextLevelName || (r.nextLevel && r.nextLevel !== "GRADUATE" && r.nextLevel !== "NON_PROMOTIONAL" ? r.nextLevel : "");
      switch (r.classification) {
        case "eligible":             return nextLevelLabel ? `Eligible for ${nextLevelLabel}` : "Eligible for next level";
        case "not_eligible_retained": return `Retained in ${r.currentClassLevel || "current level"}`;
        case "not_eligible_other":   return "Requires review";
        case "graduated":            return `Graduated from ${r.currentClassLevel || "current level"}`;
        case "not_continuing":       return "Not continuing next school year";
        case "withdrawn":            return "Withdrawn during school year";
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
        reportError(new Error(j.error ?? "Classification failed."), {
          module: "students",
          action: "bulk_classification",
          schoolId: schoolId || undefined,
          metadata: {
            studentCount: toClassify.length,
            requestId: promoteRequestId,
          },
        });
        setPromoteRowsError(j.error ?? "Classification failed.");
        setPromoteSaving(false);
        return;
      }

      setPromoteResult(j.result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Network error. Please try again.";
      reportError(
        err instanceof Error ? err : new Error(errorMsg),
        {
          module: "students",
          action: "bulk_classification",
          schoolId: schoolId || undefined,
          metadata: {
            studentCount: toClassify.length,
            requestId: promoteRequestId,
          },
        }
      );
      setPromoteRowsError(errorMsg);
    }

    setPromoteSaving(false);
  }

  // ─── Derived values ────────────────────────────────────────────────────────

  // True when the admin has selected a school year that is not the currently-active one.
  // Used to drive the historical banner, filter defaults, and row-level "current status" hints.
  const isHistoricalView = !!viewingYearId && viewingYearId !== activeYear?.id;
  const viewingYear = schoolYearList.find((y) => y.id === viewingYearId) ?? null;

  // Resolve which enrollment to display for a student given the viewing year.
  // For the active year, fall back to a "pending" state for students who were
  // classified to continue (eligible / retained / not_eligible_other) but
  // haven't been re-enrolled yet — otherwise they'd disappear from the active
  // year filter at the start of the new school year.
  const effectiveViewingYearId = viewingYearId || activeYear?.id || null;
  const CONTINUING_CLASSIFICATIONS = new Set(["eligible", "not_eligible_retained", "not_eligible_other"]);
  function getDisplayEnrollment(s: Student, overrideYearId?: string | null) {
    const yearId = overrideYearId !== undefined ? overrideYearId : effectiveViewingYearId;
    if (!yearId) {
      return { classId: s.classId, className: s.className, classLevel: s.classLevel, enrollmentStatus: s.enrollmentStatus, enrollmentYearId: s.enrollmentYearId, isPending: false };
    }
    const found =
      s.allEnrollments.find((e) => e.schoolYearId === yearId && e.status === "enrolled") ??
      s.allEnrollments.find((e) => e.schoolYearId === yearId) ?? null;
    if (found) {
      return {
        classId: found.classId,
        className: found.className,
        classLevel: found.classLevel,
        enrollmentStatus: found.status,
        enrollmentYearId: found.schoolYearId,
        isPending: false,
      };
    }
    if (yearId === activeYear?.id && s.progressionStatus && CONTINUING_CLASSIFICATIONS.has(s.progressionStatus)) {
      // Eligible-to-graduate students have no next class to be placed into.
      // Showing "Pending placement" would be misleading — the school has no higher level.
      if (s.progressionStatus === "eligible" && s.recommendedNextLevel === "GRADUATE") {
        return { classId: null, className: "—", classLevel: "", enrollmentStatus: null, enrollmentYearId: yearId, isPending: false };
      }
      return {
        classId: null,
        className: "—",
        classLevel: "",
        enrollmentStatus: null,
        enrollmentYearId: yearId,
        isPending: true,
      };
    }
    return { classId: null, className: "—", classLevel: "", enrollmentStatus: null, enrollmentYearId: null, isPending: false };
  }

  // Distinct levels for the filter dropdown — sourced from the active year's
  // class catalog plus any levels seen on existing student enrollments (so
  // historical-year levels still appear when viewing prior years).
  const levelOptions = (() => {
    const set = new Set<string>();
    for (const c of classOptions) if (c.level) set.add(c.level);
    for (const s of students) for (const e of s.allEnrollments) if (e.classLevel) set.add(e.classLevel);
    return [...set].sort((a, b) => a.localeCompare(b));
  })();

  // Distinct classes for the class filter — built from actual display enrollments
  // so the list always reflects the currently-selected viewing year.
  const classFilterOptions = (() => {
    const map = new Map<string, string>(); // classId → className
    for (const s of students) {
      const disp = getDisplayEnrollment(s);
      if (disp.classId && disp.className && disp.className !== "—") {
        map.set(disp.classId, disp.className);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  })();

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

    // Special-sentinel filters that bypass the normal year/enrollment filter.
    if (statusFilter === "graduated") {
      return matchSearch && s.progressionStatus === "graduated";
    }
    if (statusFilter === "__all__") {
      return matchSearch;
    }
    // "Pending Placement" is a computed state (no DB enrollment row yet in the active year),
    // so it can't be matched via enrollmentStatus — match on disp.isPending instead.
    if (statusFilter === "__pending__") {
      return matchSearch && disp.isPending;
    }

    // Year filter narrows to students with an enrollment in the selected year —
    // the combined "School Year + Status" column shows that enrollment's status.
    const matchYear = !viewingYearId || disp.enrollmentYearId === viewingYearId;
    const matchClass = !levelFilter || disp.classLevel === levelFilter;
    const matchClassFilter = !classFilter || (classFilter === "__unassigned__" ? !disp.classId : disp.classId === classFilter);
    const matchReturning = !returningFilter || returningEnrolledIds.has(s.id);

    // Active-year default ("Active Students"): hide completed and withdrawn enrollments
    // so graduated/inactive records don't pollute the operational list.
    // Historical years show all statuses by default (admin is explicitly browsing history).
    if (!statusFilter && !isHistoricalView) {
      const isActiveParticipant =
        disp.isPending ||
        (disp.enrollmentYearId === activeYear?.id &&
          disp.enrollmentStatus !== null &&
          disp.enrollmentStatus !== "completed" &&
          disp.enrollmentStatus !== "withdrawn");
      return matchSearch && isActiveParticipant && matchClass && matchClassFilter && matchReturning;
    }

    const matchStatus = !statusFilter || disp.enrollmentStatus === statusFilter;
    return matchSearch && matchYear && matchClass && matchClassFilter && matchStatus && matchReturning;
  });

  function printRoster() {
    const viewingYearName = viewingYear?.name ?? activeYear?.name ?? "—";
    const now = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

    const classLabel = (() => {
      if (!classFilter) return null;
      if (classFilter === "__unassigned__") return "Not Assigned";
      return classFilterOptions.find(([id]) => id === classFilter)?.[1] ?? classFilter;
    })();
    const statusLabel = (() => {
      if (!statusFilter) return "Active Students";
      if (statusFilter === "__pending__") return "Pending Placement";
      if (statusFilter === "__all__") return "All Students";
      return STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter;
    })();
    const filterParts = [
      levelFilter && `Level: ${levelFilter}`,
      classLabel && `Class: ${classLabel}`,
      `Status: ${statusLabel}`,
      returningFilter && "Returning only",
      search && `Search: "${search}"`,
    ].filter(Boolean);
    const filterSummary = filterParts.join(" · ") || "All Active Students";

    const rows = filtered.map((s, i) => {
      const disp = getDisplayEnrollment(s);
      const classDisplay = disp.isPending
        ? "Pending placement"
        : disp.className
          ? `${disp.className}${disp.classLevel ? ` / ${disp.classLevel}` : ""}`
          : "—";
      return `<tr>
        <td>${i + 1}</td>
        <td>
          <strong>${s.firstName} ${s.lastName}</strong>
          ${s.studentCode ? `<br><span class="code">${s.studentCode}</span>` : ""}
        </td>
        <td>${classDisplay}</td>
        <td>
          ${s.guardianName || "—"}
          ${s.guardianPhone ? `<br><span class="sub">${s.guardianPhone}</span>` : ""}
        </td>
        <td class="center">☐</td>
        <td></td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=960,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Student Roster — ${schoolName}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:12px}
        h1{font-size:18px;font-weight:bold}
        .sub-head{color:#555;margin-top:3px;font-size:11px}
        .meta{display:flex;gap:24px;margin:12px 0 4px;font-size:11px;color:#666;flex-wrap:wrap}
        .meta strong{color:#333}
        .count{font-size:11px;color:#555;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:4px}
        th{background:#f0f0f0;padding:7px 8px;text-align:left;font-size:11px;font-weight:bold;border-bottom:2px solid #ccc}
        td{padding:6px 8px;border-bottom:1px solid #e5e5e5;vertical-align:top;font-size:12px}
        tr:nth-child(even) td{background:#fafafa}
        .code{color:#888;font-size:10px;font-family:monospace}
        .sub{color:#555;font-size:10px}
        .center{text-align:center;font-size:14px}
        .footer{margin-top:24px;font-size:10px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:8px}
        @media print{
          body{padding:0}
          @page{size:A4 landscape;margin:12mm}
        }
      </style>
    </head><body>
      <h1>${schoolName}</h1>
      <p class="sub-head">Student Roster · ${viewingYearName}</p>
      <div class="meta">
        <span><strong>Filters:</strong> ${filterSummary}</span>
        <span><strong>Generated:</strong> ${now}</span>
      </div>
      <p class="count">${filtered.length} student${filtered.length !== 1 ? "s" : ""}</p>
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Student Name</th>
            <th>Class / Level</th>
            <th>Parent / Guardian &amp; Contact</th>
            <th style="width:56px;text-align:center">Attend.</th>
            <th style="width:160px">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Printed ${now} · ${schoolName} · ${filtered.length} student${filtered.length !== 1 ? "s" : ""}</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

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

  // Classes whose promotion path is truly unset — no next_level AND no progression_order suggestion.
  // Used for the warning banner and picker badges.
  const classIdsWithMissingPath = new Set(
    promoteRows.filter((r) => !r.nextLevel && !r.isTerminalLevel && !r.suggestedNextLevelName).map((r) => r.currentClassId)
  );

  const selectedClassGroup = classBulkGroups.find((g) => g.currentClassId === selectedClassId) ?? null;
  const classPromoteRows   = selectedClassId ? promoteRows.filter((r) => r.currentClassId === selectedClassId) : [];
  const filteredPromoteRows = classPromoteRows.filter((r) =>
    !promoteSearch || r.studentName.toLowerCase().includes(promoteSearch.toLowerCase())
  );

  // Derived from the class's own Promotion Path (same for all rows in the class)
  const classNextLevel = classPromoteRows[0]?.nextLevel ?? "";
  // isTerminalLevel is true when progression_order identifies this as the final core level
  const classIsTerminalLevel = classPromoteRows.length > 0 && classPromoteRows[0].isTerminalLevel;
  const classSuggestedNextLevel = classPromoteRows[0]?.suggestedNextLevelName ?? "";
  // Graduating when explicitly tagged GRADUATE or when progression_order marks it as terminal
  const isGraduatingClass = classNextLevel === "GRADUATE" || classIsTerminalLevel;

  const eligibleCount   = classPromoteRows.filter((r) => r.classification === "eligible").length;
  const retainedCount   = classPromoteRows.filter((r) => r.classification === "not_eligible_retained").length;
  const otherCount      = classPromoteRows.filter((r) => r.classification === "not_eligible_other").length;
  const graduatedCount  = classPromoteRows.filter((r) => r.classification === "graduated").length;
  const notContCount    = classPromoteRows.filter((r) => r.classification === "not_continuing").length;
  const withdrawnCount  = classPromoteRows.filter((r) => r.classification === "withdrawn").length;
  const unsetCount      = classPromoteRows.filter((r) => r.classification === "unset").length;
  const classifiedCount = classPromoteRows.length - unsetCount;

  if (studentsQuery.isLoading || classesQuery.isLoading) return <PageSpinner />;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--theme-accent)]">Students</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage student information and enrollment</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" />
            Help Topics
          </button>
          {activeTab === "students" && (
            <>
              <button
                onClick={printRoster}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
                title="Print filtered student roster"
              >
                <Printer className="w-4 h-4" />
                Print Roster
              </button>
              <Button
                disabled={isHistoricalView}
                title={isHistoricalView ? "Switch to the active school year to add students." : undefined}
                onClick={() => { setForm(EMPTY_FORM); setFormError(null); setAddModalOpen(true); }}
              >
                <Plus className="w-4 h-4" /> Add Student
              </Button>
            </>
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
          {error && (
            <ErrorAlert
              message={error}
              onRetry={() => studentsQuery.refetch()}
            />
          )}

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
              onChange={(e) => { setViewingYearId(e.target.value); setLevelFilter(""); setClassFilter(""); setStatusFilter(""); }}
              className="sm:w-48"
            >
              {schoolYearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.id === activeYear?.id ? `${y.name} (Active)` : y.name}
                </option>
              ))}
            </Select>
            <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="sm:w-44">
              <option value="">All Levels</option>
              {levelOptions.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </Select>
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-44">
              <option value="">All Classes</option>
              {classFilterOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              <option value="__unassigned__">Not Assigned</option>
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

          {/* Historical year view banner */}
          {isHistoricalView && viewingYear && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
              <AlertTriangle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800">
                <strong>Historical view — {viewingYear.name}.</strong> These records reflect enrollment and status during that school year. Graduated or inactive students from that year are included.
              </p>
            </div>
          )}

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Student</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Class</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Guardian</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Classification</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-muted-foreground">
                        {students.length === 0 ? 'No students yet. Use "Enroll Student" to enroll through the pipeline, or "Add Student Profile" to create a record only.' : "No students match your filters."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((student) => {
                      const disp = getDisplayEnrollment(student);
                      const yearsAsc = [...schoolYearList].sort((a, b) => a.startDate.localeCompare(b.startDate));
                      const srcIdx = student.enrollmentYearId
                        ? yearsAsc.findIndex((y) => y.id === student.enrollmentYearId)
                        : -1;
                      const nextLevelYear = srcIdx >= 0 && srcIdx + 1 < yearsAsc.length ? yearsAsc[srcIdx + 1] : null;
                      const dispYearName = schoolYearList.find((y) => y.id === disp.enrollmentYearId)?.name ?? "";
                      const isActiveYear = disp.enrollmentYearId === activeYear?.id;

                      return (
                      <tr
                        key={student.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedStudent(student)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedStudent(student);
                          }
                        }}
                        className={`border-b border-border last:border-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                          disp.isPending
                            ? "bg-amber-50/40 hover:bg-amber-50/60"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        {/* Student — primary identifier, name is the only bold element */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                              {student.photoUrl
                                ? <img src={student.photoUrl} alt={student.firstName} className="w-full h-full object-cover" />
                                : getInitials(`${student.firstName} ${student.lastName}`)
                              }
                            </div>
                            <div>
                              <p className="font-medium leading-snug">{student.firstName} {student.lastName}</p>
                              {student.studentCode && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{student.studentCode}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Class — stacked className / classLevel; amber cue for pending */}
                        <td className="px-5 py-4">
                          {disp.isPending ? (
                            <div>
                              <p className="text-xs font-medium text-amber-700 leading-snug">Pending placement</p>
                              {dispYearName && (
                                <p className="text-xs text-muted-foreground mt-0.5">{dispYearName}</p>
                              )}
                            </div>
                          ) : disp.classId ? (
                            <div>
                              <p className="text-sm text-foreground leading-snug">{disp.className}</p>
                              {disp.classLevel && (
                                <p className="text-xs text-muted-foreground mt-0.5">{disp.classLevel}</p>
                              )}
                            </div>
                          ) : student.progressionStatus === "eligible" && student.recommendedNextLevel === "GRADUATE" ? (
                            <p className="text-xs text-muted-foreground">Graduating</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Not assigned</p>
                          )}
                        </td>

                        {/* Status — enrollment status; + "Current: …" hint when in historical view */}
                        <td className="px-5 py-4">
                          {(() => {
                            // For historical rows: compute what the student's status is NOW.
                            const currentHint = (() => {
                              if (!isHistoricalView) return null;
                              const activeEnroll = student.allEnrollments.find(
                                (e) => e.schoolYearId === activeYear?.id && e.status === "enrolled"
                              );
                              if (activeEnroll) return "Enrolled now";
                              const ps = student.progressionStatus;
                              if (ps === "graduated") return "Graduated / Alumni";
                              if (ps === "not_continuing") return "Not continuing";
                              if (ps === "withdrawn") return "Withdrawn";
                              if (ps === "eligible") return "Pending placement";
                              if (ps === "not_eligible_retained") return "Retained";
                              return null;
                            })();

                            if (disp.isPending) return <p className="text-xs text-muted-foreground">—</p>;
                            if (!disp.enrollmentStatus) return <p className="text-xs text-muted-foreground">—</p>;
                            return (
                              <div>
                                <p className={`text-xs font-medium ${
                                  disp.enrollmentStatus === "waitlisted" ? "text-amber-700" :
                                  disp.enrollmentStatus === "withdrawn"  ? "text-muted-foreground" :
                                  "text-muted-foreground"
                                }`}>
                                  {disp.enrollmentStatus.charAt(0).toUpperCase() + disp.enrollmentStatus.slice(1)}
                                </p>
                                {currentHint && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{currentHint}</p>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Guardian — name + phone stacked */}
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-sm text-foreground leading-snug">{student.guardianName}</p>
                            {student.guardianPhone && (
                              <p className="text-xs text-muted-foreground mt-0.5">{student.guardianPhone}</p>
                            )}
                          </div>
                        </td>

                        {/* Classification — text-only, no pills */}
                        <td className="px-5 py-4">
                          {student.progressionStatus ? (() => {
                            const ps = student.progressionStatus;
                            const nl = student.recommendedNextLevel;

                            if (ps === "graduated") return (
                              <p className="text-xs text-muted-foreground">Graduated</p>
                            );
                            if (ps === "not_continuing") return (
                              <p className="text-xs text-muted-foreground">Not continuing</p>
                            );
                            if (ps === "withdrawn") return (
                              <p className="text-xs text-muted-foreground">Withdrawn</p>
                            );
                            if (ps === "not_eligible_other") return (
                              <p className="text-xs font-medium text-orange-600">Needs review</p>
                            );
                            if (ps === "not_eligible_retained") return (
                              <div>
                                <p className="text-xs font-medium text-amber-700">Retained</p>
                                {student.classLevel && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {student.classLevel}
                                    {nextLevelYear && <span> · {nextLevelYear.name}</span>}
                                  </p>
                                )}
                              </div>
                            );
                            if (ps === "eligible" && nl) {
                              if (nl === "GRADUATE") return (
                                <div>
                                  <p className="text-xs text-foreground">Moving up</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Graduating</p>
                                </div>
                              );
                              if (nl === "NON_PROMOTIONAL") return (
                                <p className="text-xs text-muted-foreground">Non-promotional</p>
                              );
                              return (
                                <div>
                                  <p className="text-xs text-foreground">Moving up to {nl}</p>
                                  {nextLevelYear && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{nextLevelYear.name}</p>
                                  )}
                                </div>
                              );
                            }
                            return <p className="text-xs text-muted-foreground">—</p>;
                          })() : <p className="text-xs text-muted-foreground">—</p>}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <RowMenu
                              student={student}
                              onEdit={() => openEdit(student)}
                              onGraduate={
                                userRole === "school_admin" &&
                                !isHistoricalView &&
                                student.progressionStatus === "eligible" &&
                                student.recommendedNextLevel === "GRADUATE"
                                  ? () => {
                                      setGraduateTarget(student);
                                      setGraduationDate(new Date().toISOString().split("T")[0]);
                                      setGraduationNote("");
                                      setGraduateError(null);
                                    }
                                  : null
                              }
                              onShare={
                                userRole === "school_admin" && student.childProfileId
                                  ? () => setShareClinicTarget({
                                      childProfileId: student.childProfileId!,
                                      name: `${student.firstName} ${student.lastName}`.trim(),
                                    })
                                  : null
                              }
                            />
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
          {promoteError && (
            <ErrorAlert
              message={promoteError}
              onRetry={() => loadPromoteSetup()}
            />
          )}

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

              {promoteRowsError && (
                <ErrorAlert
                  message={promoteRowsError}
                  onRetry={() => loadStudentsForPromote()}
                />
              )}

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
                        const firstRow = promoteRows.find((r) => r.currentClassId === g.currentClassId);
                        const isTerminal = firstRow?.isTerminalLevel ?? false;
                        return (
                          <button
                            key={g.currentClassId}
                            onClick={() => setSelectedClassId(g.currentClassId)}
                            className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              {missingPath && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                              {isTerminal && <GraduationCap className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                              <span className="text-sm font-medium">{g.currentClassName}</span>
                              {g.currentClassLevel && <span className="text-xs text-muted-foreground">({g.currentClassLevel})</span>}
                              {isTerminal && <span className="text-xs text-green-700 font-medium">Graduating level</span>}
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
                                    : classNextLevel ? classNextLevel
                                    : classIsTerminalLevel ? <span className="text-green-700">Final Level (by progression order)</span>
                                    : classSuggestedNextLevel ? <span className="text-primary">{classSuggestedNextLevel} (by progression order)</span>
                                    : <span className="text-amber-600">⚠ Not set</span>}
                                </span>
                              </p>
                              <p>
                                <span className="text-muted-foreground">Recommended Outcome: </span>
                                <span className={`font-medium ${
                                  isGraduatingClass ? "text-green-700" :
                                  classNextLevel === "NON_PROMOTIONAL" ? "text-amber-600" :
                                  (classNextLevel || classSuggestedNextLevel) ? "text-primary" : "text-amber-600"
                                }`}>
                                  {isGraduatingClass ? "Graduating / Completed Final Level"
                                    : classNextLevel === "NON_PROMOTIONAL" ? "Needs Review"
                                    : classNextLevel ? `Eligible for ${classNextLevel}`
                                    : classSuggestedNextLevel ? `Eligible for ${classSuggestedNextLevel}`
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
                              Current Level
                              {sourceYear && <p className="text-xs font-normal text-muted-foreground/60 mt-0.5">{sourceYear.name}</p>}
                            </th>
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
                                <span className="text-xs font-medium">{row.currentClassLevel || "—"}</span>
                              </td>
                              <td className="px-4 py-3">
                                {row.classification === "graduated" || row.classification === "not_continuing" || row.classification === "withdrawn" ? (
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
                                  <ActionBtn active={row.classification === "not_eligible_retained"} onClick={() => setRowClassification(row.studentId, "not_eligible_retained")}
                                    className="text-amber-600 border-amber-300 bg-amber-50">
                                    Retain
                                  </ActionBtn>
                                  <ActionBtn active={row.classification === "not_eligible_other"} onClick={() => setRowClassification(row.studentId, "not_eligible_other")}
                                    className="text-orange-600 border-orange-300 bg-orange-50">
                                    Needs Review
                                  </ActionBtn>
                                  {/* Not Continuing only makes sense when the student is finishing a year that has a real next level to continue to.
                                       Hide for graduating classes (nextLevel === "GRADUATE") and unset paths (no nextLevel).
                                       Keep visible if the row already has the value saved, so legacy picks aren't lost. */}
                                  {((row.nextLevel && row.nextLevel !== "GRADUATE") || row.classification === "not_continuing") && (
                                    <ActionBtn active={row.classification === "not_continuing"} onClick={() => setRowClassification(row.studentId, "not_continuing")}
                                      className="text-rose-600 border-rose-300 bg-rose-50">
                                      Not Continuing
                                    </ActionBtn>
                                  )}
                                  {(!isGraduatingClass || row.classification === "withdrawn") && (
                                    <ActionBtn active={row.classification === "withdrawn"} onClick={() => setRowClassification(row.studentId, "withdrawn")}
                                      className="text-red-700 border-red-300 bg-red-50">
                                      Withdrawn
                                    </ActionBtn>
                                  )}
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
                        <p><span className="font-semibold text-orange-600">{otherCount} student{otherCount !== 1 ? "s" : ""}</span> needs review</p>
                      )}
                      {graduatedCount > 0 && (
                        <p><span className="font-semibold text-green-700">{graduatedCount} student{graduatedCount !== 1 ? "s" : ""}</span> graduated</p>
                      )}
                      {notContCount > 0 && (
                        <p className="text-muted-foreground text-xs">{notContCount} not continuing</p>
                      )}
                      {withdrawnCount > 0 && (
                        <p className="text-muted-foreground text-xs">{withdrawnCount} withdrawn (mid-year)</p>
                      )}
                      {unsetCount > 0 && (
                        <p className="text-muted-foreground text-xs">{unsetCount} not yet classified</p>
                      )}
                    </div>
                    <Button
                      onClick={handleClassifyConfirm}
                      disabled={isReadOnly || isHistoricalView || promoteSaving || classifiedCount === 0}
                      title={isHistoricalView ? "Switch to the active school year to run year-end classification." : undefined}
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
      <Modal open={!!selectedStudent} onClose={() => setSelectedStudent(null)} title="Student Profile" className="max-w-3xl">
        {selectedStudent && (() => {
          const selDisp = getDisplayEnrollment(selectedStudent, activeYear?.id ?? null);
          return (
          <div className="flex flex-col -mx-6 -mb-6">
            {/* Two-column layout */}
            <div className="flex min-h-0 border-b border-border">

              {/* ── Left sidebar ─────────────────────────── */}
              <div className="w-[220px] shrink-0 border-r border-border px-5 pt-5 pb-5 overflow-y-auto flex flex-col gap-4 max-h-[65vh] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {/* Avatar + name */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-semibold overflow-hidden ring-4 ring-primary/10">
                    {selectedStudent.photoUrl
                      ? <img src={selectedStudent.photoUrl} alt={selectedStudent.firstName} className="w-full h-full object-cover" />
                      : getInitials(`${selectedStudent.firstName} ${selectedStudent.lastName}`)
                    }
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-snug">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                    </h3>
                    {selectedStudent.preferredName && (
                      <p className="text-xs text-muted-foreground mt-0.5">"{selectedStudent.preferredName}"</p>
                    )}
                  </div>
                  {selDisp.classId ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                      {selDisp.className}
                      {selDisp.classLevel && <span className="text-primary/60">· {selDisp.classLevel}</span>}
                    </span>
                  ) : !selDisp.enrollmentStatus ? (
                    <span className="text-xs text-muted-foreground">Not Enrolled</span>
                  ) : null}
                  {selDisp.enrollmentStatus && (
                    <Badge variant={selDisp.enrollmentStatus as "enrolled" | "completed" | "withdrawn" | "waitlisted" | "inquiry"}>{selDisp.enrollmentStatus}</Badge>
                  )}
                </div>

                {/* Key stats */}
                {(() => {
                  const tenure = calcTenure(selectedStudent.allEnrollments, schoolYearList);
                  return (
                    <div className="border-t border-border pt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Age</span>
                        <span className="font-medium">{calcAge(selectedStudent.dateOfBirth)}</span>
                      </div>
                      {selectedStudent.gender && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Gender</span>
                          <span className="font-medium">{selectedStudent.gender}</span>
                        </div>
                      )}
                      {selectedStudent.dateOfBirth && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Born</span>
                          <span className="font-medium tabular-nums">{selectedStudent.dateOfBirth}</span>
                        </div>
                      )}
                      {tenure.text !== "—" && (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Tenure</span>
                          <div className="text-right">
                            <span className="font-medium">{tenure.text}</span>
                            {tenure.gapText && (
                              <p className="text-[10px] text-amber-600 mt-0.5">{tenure.gapText}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Enrollments */}
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Enrollments</p>
                    {!isHistoricalView && (
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollmentModal(selectedStudent);
                          setEnrollmentForm({ periodId: "", classId: "", status: "enrolled", startDate: "", endDate: "" });
                          setEnrollmentFormError(null);
                          setSelectedStudent(null);
                        }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-2.5 h-2.5" /> New Enrollment
                      </button>
                    )}
                  </div>
                  {selectedStudent.allEnrollments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No enrollments yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedStudent.allEnrollments.map((e) => {
                        const isCurrent = e.schoolYearId === activeYear?.id;
                        if (isCurrent) {
                          return (
                            <div key={e.id} className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full leading-none shrink-0">Current</span>
                                <Badge variant={e.status as "enrolled" | "completed" | "withdrawn" | "waitlisted" | "inquiry"} className="text-[10px] leading-none px-1.5 py-0.5">{e.status}</Badge>
                              </div>
                              <p className="text-xs font-semibold leading-snug">{e.className}</p>
                              {e.schoolYearName && (
                                <p className="text-[10px] text-muted-foreground">
                                  {e.schoolYearName}{e.periodName ? ` · ${e.periodName}` : ""}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div key={e.id} className="flex items-center gap-1.5 px-1 py-1">
                            <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                            <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">{e.className}</span>
                            <Badge variant={e.status as "enrolled" | "completed" | "withdrawn" | "waitlisted" | "inquiry"} className="text-[9px] leading-none px-1.5 py-0.5 shrink-0">{e.status}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Identifiers — lightweight metadata rows */}
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Identifiers</p>
                  {!selectedStudent.studentCode && !selectedStudent.lrn ? (
                    <p className="text-xs text-muted-foreground italic">No identifiers assigned</p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Student ID</span>
                        <span className={cn("font-mono text-right truncate", !selectedStudent.studentCode && "text-muted-foreground")}>
                          {selectedStudent.studentCode ?? "—"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">LRN</span>
                        <span className={cn("font-mono text-right truncate", !selectedStudent.lrn && "text-muted-foreground")}>
                          {selectedStudent.lrn ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Parent Portal Access */}
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Parent Portal</p>
                  {inviteStudent?.id === selectedStudent.id && inviteLink ? (
                    <div className="space-y-1.5 text-xs">
                      <p className="text-muted-foreground">Share with guardian:</p>
                      <div className="flex items-center gap-1">
                        <input readOnly value={inviteLink} className="flex-1 min-w-0 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted font-mono truncate" />
                        <button
                          type="button"
                          onClick={copyInviteLink}
                          className="shrink-0 flex items-center gap-1 px-2 py-1.5 border border-border rounded-lg hover:bg-accent transition-colors"
                        >
                          {inviteCopied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      {inviteCopied && <p className="text-[10px] text-green-600 font-medium">Copied!</p>}
                      <p className="text-[10px] text-muted-foreground">Expires in 30 days.</p>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 gap-1"
                      onClick={() => { setInviteStudent(selectedStudent); setInviteLink(null); handleGenerateInvite(selectedStudent); }}
                      disabled={inviteGenerating}
                    >
                      <LinkIcon className="w-3 h-3 shrink-0" />
                      {inviteGenerating ? "Generating…" : "Generate Invite Link"}
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Right content ─────────────────────────── */}
              <div className="flex-1 px-5 pt-5 pb-5 overflow-y-auto space-y-3 max-h-[65vh] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">

                {/* Personal Information */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Personal Information</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className={cn("mt-0.5", !selectedStudent.dateOfBirth && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.dateOfBirth ?? "Not recorded"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="mt-0.5">{calcAge(selectedStudent.dateOfBirth)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className={cn("mt-0.5", !selectedStudent.gender && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.gender ?? "Not recorded"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <UserCheck className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Parent / Guardian</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className={cn("mt-0.5 font-medium", !selectedStudent.guardianName && "text-muted-foreground italic text-xs font-normal")}>
                        {selectedStudent.guardianName || "Not provided"}
                      </p>
                      {selectedStudent.guardianRelationship && (
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedStudent.guardianRelationship}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className={cn("mt-0.5", !selectedStudent.guardianPhone && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.guardianPhone || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className={cn("mt-0.5", !selectedStudent.guardianEmail && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.guardianEmail || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comm. Preference</p>
                      <p className={cn("mt-0.5", !selectedStudent.guardianCommPref && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.guardianCommPref ? COMM_PREF_LABELS[selectedStudent.guardianCommPref] : "Not set"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Health & Medical */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <Heart className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Health & Medical</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Allergies</p>
                      <p className={cn("mt-0.5", !selectedStudent.allergies && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.allergies || "None recorded"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Medical Conditions</p>
                      <p className={cn("mt-0.5", !selectedStudent.medicalConditions && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.medicalConditions || "None recorded"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Special Needs</p>
                      <p className={cn("mt-0.5", !selectedStudent.specialNeeds && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.specialNeeds || "None recorded"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Primary Language</p>
                      <p className={cn("mt-0.5", !selectedStudent.primaryLanguage && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.primaryLanguage || "Not specified"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact & Pickups */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Emergency Contact & Pickups</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Emergency Contact</p>
                      <p className={cn("mt-0.5", !selectedStudent.emergencyContactName && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.emergencyContactName
                          ? `${selectedStudent.emergencyContactName}${selectedStudent.emergencyContactPhone ? ` · ${selectedStudent.emergencyContactPhone}` : ""}`
                          : "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Authorized Pickups</p>
                      <p className={cn("mt-0.5", !selectedStudent.authorizedPickups && "text-muted-foreground italic text-xs")}>
                        {selectedStudent.authorizedPickups || "Not specified"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Notes</span>
                  </div>
                  <div className="px-4 py-3 space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Teacher Notes</p>
                      {selectedStudent.teacherNotes
                        ? <p className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-yellow-900">{selectedStudent.teacherNotes}</p>
                        : <p className="text-muted-foreground italic text-xs">No teacher notes recorded.</p>
                      }
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Admin Notes <span className="normal-case font-normal">(internal)</span></p>
                      {selectedStudent.adminNotes
                        ? <p className="bg-muted border border-border rounded-lg px-3 py-2">{selectedStudent.adminNotes}</p>
                        : <p className="text-muted-foreground italic text-xs">No admin notes recorded.</p>
                      }
                    </div>
                  </div>
                </div>

                {/* Year-End Classification (conditional) */}
                {selectedStudent.progressionStatus && (() => {
                  const ps = selectedStudent.progressionStatus;
                  const color =
                    ps === "eligible"              ? "bg-green-100 text-green-700" :
                    ps === "not_eligible_retained" ? "bg-amber-100 text-amber-700" :
                    ps === "not_eligible_other"    ? "bg-orange-100 text-orange-700" :
                    ps === "graduated"             ? "bg-muted text-muted-foreground" :
                    ps === "not_continuing"        ? "bg-rose-100 text-rose-700" :
                    ps === "withdrawn"             ? "bg-red-100 text-red-700" :
                                                     "bg-muted text-muted-foreground";
                  const label =
                    ps === "eligible"              ? "Eligible" :
                    ps === "not_eligible_retained" ? "Retained" :
                    ps === "not_eligible_other"    ? "Needs Review" :
                    ps === "graduated"             ? "Graduated" :
                    ps === "not_continuing"        ? "Not Continuing" :
                    ps === "withdrawn"             ? "Withdrawn" :
                      ps.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const completion = yearCompletions[selectedStudent.id];
                  return (
                    <div className="rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                        <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-3.5 h-3.5 text-sky-600" />
                        </div>
                        <span className="text-sm font-semibold">Year-End Classification</span>
                      </div>
                      <div className="px-4 py-3 text-sm space-y-1.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
                        {selectedStudent.progressionNotes && (
                          <p className="text-muted-foreground text-xs">{selectedStudent.progressionNotes}</p>
                        )}
                        {completion && isHistoricalView && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            Snapshotted at year close
                            {completion.finalLevelName && (
                              <span> · {completion.finalLevelName}{completion.finalClassName ? ` · ${completion.finalClassName}` : ""}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* No progression_status but a snapshot exists: unclassified at close */}
                {!selectedStudent.progressionStatus && isHistoricalView && yearCompletions[selectedStudent.id]?.completionStatus === "enrolled_at_close" && (
                  <div className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                      <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-3.5 h-3.5 text-sky-600" />
                      </div>
                      <span className="text-sm font-semibold">Year-End Classification</span>
                    </div>
                    <div className="px-4 py-3 text-sm space-y-1.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        No classification recorded
                      </span>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        Enrolled at year close — was not classified before the year ended
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setSelectedStudent(null)}>Close</Button>
              <Button onClick={() => openEdit(selectedStudent)}>
                <Pencil className="w-4 h-4" /> Edit Student
              </Button>
            </div>
          </div>
          );
        })()}
      </Modal>

      {/* ── Edit Student Modal (two-column, matches Profile view layout) ── */}
      <Modal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingStudent(null); setPendingEditLoading(false); if (returnToPath) { const p = returnToPath; setReturnToPath(null); openEditCalledRef.current = false; router.push(p); } }}
        title="Edit Student"
        className="max-w-3xl"
      >
        {pendingEditLoading ? (
          <div className="py-16 flex justify-center items-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col -mx-6 -mb-6">
            <div className="flex min-h-0 border-b border-border">

              {/* ── Left sidebar (context rail — mostly read-only) ── */}
              <div className="w-[220px] shrink-0 border-r border-border px-5 pt-5 pb-5 overflow-y-auto flex flex-col gap-4 max-h-[65vh] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {/* Photo upload + live name preview */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <AvatarUpload
                    currentUrl={editPhotoFile ? URL.createObjectURL(editPhotoFile) : (editForm.photoUrl || null)}
                    name={`${editForm.firstName} ${editForm.lastName}`}
                    size="lg"
                    onFileSelect={(file) => setEditPhotoFile(file)}
                    onValidationError={(msg) => setEditFormError(msg)}
                  />
                  <div>
                    <p className="text-sm font-semibold leading-snug">
                      {(editForm.firstName || editingStudent?.firstName || "").trim()}{" "}
                      {(editForm.lastName || editingStudent?.lastName || "").trim()}
                    </p>
                    {editForm.preferredName && (
                      <p className="text-xs text-muted-foreground mt-0.5">"{editForm.preferredName}"</p>
                    )}
                  </div>
                  {/* Current enrollment context — read-only */}
                  {editingStudent && (() => {
                    const disp = getDisplayEnrollment(editingStudent);
                    return disp.classId ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                        {disp.className}
                        {disp.classLevel && <span className="text-primary/60">· {disp.classLevel}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not Enrolled</span>
                    );
                  })()}
                  {editingStudent?.enrollmentStatus && (
                    <Badge variant={editingStudent.enrollmentStatus}>{editingStudent.enrollmentStatus}</Badge>
                  )}
                </div>

                {/* Student ID — read-only identifier */}
                {editingStudent?.studentCode && (
                  <div className="space-y-1.5">
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Student ID</p>
                      <p className="text-xs font-mono font-medium mt-0.5">{editingStudent.studentCode}</p>
                    </div>
                  </div>
                )}

                {/* Live stats preview (updates as user edits) */}
                <div className="border-t border-border pt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Age</span>
                    <span className="font-medium">{calcAge(editForm.dateOfBirth)}</span>
                  </div>
                  {editForm.gender && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Gender</span>
                      <span className="font-medium">{editForm.gender}</span>
                    </div>
                  )}
                  {editForm.dateOfBirth && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Born</span>
                      <span className="font-medium tabular-nums">{editForm.dateOfBirth}</span>
                    </div>
                  )}
                </div>

                {/* Enrollment history — read-only context */}
                {editingStudent && editingStudent.allEnrollments.length > 0 && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Enrollments</p>
                    <div className="space-y-1.5">
                      {editingStudent.allEnrollments.map((e) => (
                        <div key={e.id} className="rounded-lg border border-border bg-background px-2.5 py-2">
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-xs font-medium leading-snug">{e.className}</span>
                            <Badge variant={e.status as "enrolled" | "completed" | "withdrawn" | "waitlisted" | "inquiry"} className="text-[10px] leading-none px-1.5 py-0.5 shrink-0">{e.status}</Badge>
                          </div>
                          {e.schoolYearName && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {e.schoolYearName}{e.periodName ? ` · ${e.periodName}` : ""}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right content (editable cards) ── */}
              <div className="flex-1 px-5 pt-5 pb-5 overflow-y-auto space-y-3 max-h-[65vh] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {editFormError && <ErrorAlert message={editFormError} />}

                {/* Personal Information */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Personal Information</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">First Name *</label>
                        <Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} placeholder="First name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name *</label>
                        <Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} placeholder="Last name" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nickname / Preferred Name</label>
                        <Input value={editForm.preferredName} onChange={(e) => setEditForm({ ...editForm, preferredName: e.target.value })} placeholder="Goes by…" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Gender</label>
                        <Select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                          <option value="">Select…</option>
                          <option>Male</option>
                          <option>Female</option>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Date of Birth</label>
                        <Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} min="1990-01-01" max="2099-12-31" />
                        {editForm.dateOfBirth && <p className="text-xs text-muted-foreground mt-1">Age: {calcAge(editForm.dateOfBirth)}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <UserCheck className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Parent / Guardian</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name *</label>
                        <Input value={editForm.parentName} onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })} placeholder="Parent name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Relationship</label>
                        <Select value={editForm.relationship} onChange={(e) => setEditForm({ ...editForm, relationship: e.target.value })}>
                          <option>Mother</option><option>Father</option><option>Guardian</option>
                          <option>Grandparent</option><option>Other</option>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                        <Input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} placeholder="09XXXXXXXXX" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                        <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="parent@email.com" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Communication Preference</label>
                      <Select value={editForm.commPref} onChange={(e) => setEditForm({ ...editForm, commPref: e.target.value as CommPref })}>
                        {(Object.entries(COMM_PREF_LABELS) as [CommPref, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Government Identifiers */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <Hash className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Government Identifiers</span>
                  </div>
                  <div className="px-4 py-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Learner Reference Number (LRN)</label>
                    <Input value={editForm.lrn} onChange={(e) => setEditForm({ ...editForm, lrn: e.target.value })} placeholder="e.g. 123456789012" inputMode="numeric" />
                    <p className="text-xs text-muted-foreground mt-1">Optional. 12-digit DepEd learner ID. Leave blank if not applicable.</p>
                  </div>
                </div>

                {/* Health & Medical */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <Heart className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Health & Medical</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Allergies</label>
                        <Input value={editForm.allergies} onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })} placeholder="e.g. Peanuts, Dairy" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Primary Language at Home</label>
                        <Input value={editForm.primaryLanguage} onChange={(e) => setEditForm({ ...editForm, primaryLanguage: e.target.value })} placeholder="e.g. Filipino, English" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Medical Conditions</label>
                      <Textarea value={editForm.medicalConditions} onChange={(e) => setEditForm({ ...editForm, medicalConditions: e.target.value })} rows={2} placeholder="e.g. Asthma, Epilepsy (leave blank if none)" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Special Needs / Accommodations</label>
                      <Textarea value={editForm.specialNeeds} onChange={(e) => setEditForm({ ...editForm, specialNeeds: e.target.value })} rows={2} placeholder="IEP, therapy schedule, learning accommodations…" />
                    </div>
                  </div>
                </div>

                {/* Emergency Contact & Pickups */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Emergency Contact & Pickups</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Emergency Contact Name</label>
                        <Input value={editForm.emergencyContactName} onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })} placeholder="If different from guardian" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Emergency Contact Phone</label>
                        <Input value={editForm.emergencyContactPhone} onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })} placeholder="09XXXXXXXXX" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Authorized Pickup Persons</label>
                      <Textarea value={editForm.authorizedPickups} onChange={(e) => setEditForm({ ...editForm, authorizedPickups: e.target.value })} rows={2} placeholder="Names allowed to pick up the child (besides guardian)" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <span className="text-sm font-semibold">Notes</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Teacher Notes</label>
                      <Textarea value={editForm.teacherNotes} onChange={(e) => setEditForm({ ...editForm, teacherNotes: e.target.value })} rows={2} placeholder="Visible to class teachers" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Admin Notes (Internal)</label>
                      <Textarea value={editForm.adminNotes} onChange={(e) => setEditForm({ ...editForm, adminNotes: e.target.value })} rows={2} placeholder="Internal notes — not shared with parents" />
                    </div>
                  </div>
                </div>

                {/* Year-End Classification — admin-toned, visually distinct */}
                <div className="rounded-xl border border-border bg-muted/40 shadow-sm">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                    <div className="w-7 h-7 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center shrink-0">
                      <GraduationCap className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Year-End Classification</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium px-1.5 py-0.5 bg-muted rounded">Admin</span>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-xs text-muted-foreground">Override an individual student's outcome — typically when bulk classification flagged them as <strong>Needs Review</strong>.</p>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Classification</label>
                        <Select value={editForm.progressionStatus} onChange={(e) => setEditForm({ ...editForm, progressionStatus: e.target.value })}>
                          <option value="">— Not set —</option>
                          <option value="eligible">Eligible for Next Level</option>
                          <option value="graduated">Graduate</option>
                          <option value="not_eligible_retained">Retain</option>
                          <option value="not_continuing">Not Continuing</option>
                          <option value="withdrawn">Withdrawn</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                        <Textarea value={editForm.progressionNotes} onChange={(e) => setEditForm({ ...editForm, progressionNotes: e.target.value })} rows={2} placeholder="Reason for this classification…" />
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4">
              <ModalCancelButton />
              <Button onClick={handleEdit} disabled={saving || !editForm.firstName || !editForm.lastName || !editForm.parentName}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Student Modal (single-column, new-record form) ── */}
      <Modal open={addModalOpen} onClose={() => { setAddModalOpen(false); setForm(EMPTY_FORM); }} title="Add Student" className="max-w-2xl">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <strong>Returning students should go through the Enrollment process.</strong>{" "}
            Add Student only creates a student record without a school year, class, or billing.
            To enroll a student, {" "}
            <button
              type="button"
              className="underline font-medium cursor-pointer hover:text-amber-600 transition-colors"
              onClick={() => { setAddModalOpen(false); setForm(EMPTY_FORM); window.location.href = "/enrollment?startEnrollment=1"; }}
            >
              start an enrollment instead
            </button>.
          </div>

          <div className="flex items-center gap-4">
            <AvatarUpload
              currentUrl={addPhotoFile ? URL.createObjectURL(addPhotoFile) : (form.photoUrl || null)}
              name={`${form.firstName} ${form.lastName}`}
              size="lg"
              onFileSelect={(file) => setAddPhotoFile(file)}
              onValidationError={(msg) => setFormError(msg)}
            />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Student Photo</p>
              <p>Click the photo to upload an image.</p>
            </div>
          </div>

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
              <label className="block text-sm font-medium mb-1">Preferred Name / Nickname</label>
              <Input value={form.preferredName} onChange={(e) => setForm({ ...form, preferredName: e.target.value })} placeholder="What the child goes by" />
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
              <label className="block text-sm font-medium mb-1">Date of Birth</label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} min="1990-01-01" max="2099-12-31" />
              {form.dateOfBirth && <p className="text-xs text-muted-foreground mt-1">Age: {calcAge(form.dateOfBirth)}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Class (Initial Enrollment)</label>
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">— No class —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.enrolled}/{c.capacity})</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Academic Period</label>
              <Select value={form.periodId} onChange={(e) => setForm({ ...form, periodId: e.target.value })}>
                <option value="">— No period —</option>
                {academicPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enrollment Status</label>
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
                <option>Mother</option><option>Father</option><option>Guardian</option>
                <option>Grandparent</option><option>Other</option>
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

          <div>
            <label className="block text-sm font-medium mb-1">Communication Preference</label>
            <Select value={form.commPref} onChange={(e) => setForm({ ...form, commPref: e.target.value as CommPref })}>
              {(Object.entries(COMM_PREF_LABELS) as [CommPref, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>

          <SectionToggle title="Government Identifiers">
            <div>
              <label className="block text-sm font-medium mb-1">Learner Reference Number (LRN)</label>
              <Input value={form.lrn} onChange={(e) => setForm({ ...form, lrn: e.target.value })} placeholder="e.g. 123456789012" inputMode="numeric" />
              <p className="text-xs text-muted-foreground mt-1">Optional. The 12-digit Department of Education learner ID (Philippines). Leave blank if not applicable.</p>
            </div>
          </SectionToggle>

          <SectionToggle title="Health & Medical Info">
            <div>
              <label className="block text-sm font-medium mb-1">Allergies</label>
              <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. Peanuts, Dairy (leave blank if none)" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Medical Conditions</label>
              <Textarea value={form.medicalConditions} onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })} rows={2} placeholder="e.g. Asthma, Epilepsy (leave blank if none)" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Special Needs / Accommodations</label>
              <Textarea value={form.specialNeeds} onChange={(e) => setForm({ ...form, specialNeeds: e.target.value })} rows={2} placeholder="IEP, therapy schedule, learning accommodations..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Primary Language Spoken at Home</label>
              <Input value={form.primaryLanguage} onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })} placeholder="e.g. Filipino, English" />
            </div>
          </SectionToggle>

          <SectionToggle title="Emergency Contact & Authorized Pickups">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Contact Name</label>
                <Input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="If different from guardian" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Contact Phone</label>
                <Input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} placeholder="09XXXXXXXXX" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Authorized Pickup Persons</label>
              <Textarea value={form.authorizedPickups} onChange={(e) => setForm({ ...form, authorizedPickups: e.target.value })} rows={2} placeholder="Names of people allowed to pick up the child (besides guardian)" />
            </div>
          </SectionToggle>

          <SectionToggle title="Notes">
            <div>
              <label className="block text-sm font-medium mb-1">Notes for Teachers</label>
              <Textarea value={form.teacherNotes} onChange={(e) => setForm({ ...form, teacherNotes: e.target.value })} rows={2} placeholder="Visible to class teachers" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Admin Notes (Internal)</label>
              <Textarea value={form.adminNotes} onChange={(e) => setForm({ ...form, adminNotes: e.target.value })} rows={2} placeholder="Internal notes — not shared with parents" />
            </div>
          </SectionToggle>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleAdd} disabled={saving || !form.firstName || !form.lastName || !form.parentName}>
              {saving ? "Saving…" : "Save Student"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Enrollment Modal */}
      <Modal open={!!enrollmentModal} onClose={() => setEnrollmentModal(null)} title="New Enrollment" className="max-w-md">
        {enrollmentModal && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creating a new enrollment for <strong>{enrollmentModal.firstName} {enrollmentModal.lastName}</strong>
            </p>

            {/* Contextual guidance */}
            <div className="rounded-lg bg-muted/50 border border-border px-3.5 py-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">When to use this</p>
              <ul className="space-y-1 list-none">
                <li className="flex items-start gap-1.5"><span className="text-green-600 mt-px">✓</span> Enrolling in a new school year or program</li>
                <li className="flex items-start gap-1.5"><span className="text-green-600 mt-px">✓</span> Re-enrolling after withdrawal</li>
                <li className="flex items-start gap-1.5"><span className="text-amber-600 mt-px">✕</span> Moving between classes — use <span className="font-medium">Edit Student → Enroll / Edit Enrollment</span> instead</li>
              </ul>
            </div>

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
                {enrollmentSaving ? "Saving…" : "Create Enrollment"}
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
                  <div className="mt-3 flex gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 text-amber-900 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-100 border border-blue-300 rounded-lg px-3 py-2 text-blue-900 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );

                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "enrollment-vs-profile",
                    icon: UserCheck,
                    title: "Add Student vs. Enroll — which to use",
                    searchText: "enroll enrollment add student profile difference new returning class billing school year waitlist pending",
                    body: (
                      <div className="space-y-2">
                        <p className="font-semibold text-foreground text-xs">Simple rule: if it involves a school year, use Enrollment. If it does not, use Add Student.</p>
                        <div className="mt-2 space-y-3">
                          <div className="rounded-lg border border-border p-3 space-y-1">
                            <p className="text-xs font-semibold">Add Student</p>
                            <p className="text-xs text-muted-foreground">Creates a basic student record only — no school year, no class, no billing. Use this when you need to store student information without enrolling them yet (e.g. a walk-in inquiry you want to track before an active school year begins).</p>
                          </div>
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                            <p className="text-xs font-semibold">Enrollment (recommended for most cases)</p>
                            <p className="text-xs text-muted-foreground">Use for everything that involves a school year — including waitlisting, class assignment, and billing. Returning students should always go through the Enrollment process. Pre-registration is an enrollment with status <em>Waitlisted</em>.</p>
                          </div>
                        </div>
                        <Note>To start an enrollment, go to the <strong>Enrollment</strong> page and click <strong>Start Enrollment</strong>. You can also reach it directly from the banner inside the Add Student modal.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "add-student-profile",
                    icon: UserPlus,
                    title: "Add Student — how to use it",
                    searchText: "add student record no school year no class how to save",
                    body: (
                      <div className="space-y-2">
                        <p>Creates a student record without a school year, class, or billing. Use this only when you need to store information and enrollment isn&apos;t happening yet.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Student</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter <strong>First Name</strong>, <strong>Last Name</strong>, and the <strong>Parent/Guardian name</strong> — required.</span>} />
                          <Step n={3} text={<span>Fill in the guardian&apos;s <strong>contact number</strong> and <strong>email</strong> — needed later to send the parent portal invite.</span>} />
                          <Step n={4} text={<span>Expand optional sections (Medical, Emergency Contact, etc.) for additional details.</span>} />
                          <Step n={5} text={<span>Click <strong>Save Student</strong>.</span>} />
                        </div>
                        <Tip>When you&apos;re ready to enroll this student, go to the <strong>Enrollment</strong> page and use <strong>Start Enrollment → Enroll Returning Student</strong> to assign them to a school year and class.</Tip>
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
                        <Tip>Changing the class here changes the student's <em>enrollment</em> assignment. Use the <strong>+ New Enrollment</strong> button in the profile instead if the student is enrolling in a new school year or re-enrolling after withdrawal.</Tip>
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
                    searchText: "enrollment class enroll add change status period history multiple new enrollment create current card two tier compact",
                    body: (
                      <div className="space-y-2">
                        <p>A student can have enrollment history across school years. All of it is tracked under their profile's <strong>Enrollments</strong> section in the left sidebar.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the student's profile panel and click <strong>+ New Enrollment</strong> in the Enrollments section header.</span>} />
                          <Step n={2} text={<span>In the modal, select the <strong>class</strong> and set the <strong>status</strong>: Enrolled, Waitlisted, or Inquiry. An academic period and start/end dates are optional.</span>} />
                          <Step n={3} text={<span>Click <strong>Create Enrollment</strong>.</span>} />
                        </div>
                        <div className="mt-3 space-y-1.5 rounded-lg border border-border p-3">
                          <p className="text-xs font-semibold">When to use New Enrollment</p>
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="text-green-600 mt-px">✓</span> Enrolling in a new school year or program</p>
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="text-green-600 mt-px">✓</span> Re-enrolling after a withdrawal</p>
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="text-amber-600 mt-px">✕</span> Moving between classes in the same year — use <strong>Edit Student → Enroll / Edit Enrollment</strong> instead (this keeps the class transfer history intact)</p>
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="text-amber-600 mt-px">✕</span> Setting status to Withdrawn or Completed — those are set by editing an existing enrollment, not creating a new one</p>
                        </div>
                        <div className="mt-3 space-y-1.5 rounded-lg border border-border p-3">
                          <p className="text-xs font-semibold">Reading the enrollment history cards</p>
                          <p className="text-xs text-muted-foreground">The current school year's enrollment appears as a highlighted card. All prior enrollments are compact single-line rows below it.</p>
                          <p className="text-xs text-muted-foreground">The <strong>Current</strong> label always reflects the <em>active</em> school year — it does not change when you browse a historical year in the list view.</p>
                        </div>
                        <Note>The class filter and enrollment count on the student list are based on the student's active enrollment for the selected school year. If a student has no enrollment for that year, they appear with no class assigned.</Note>
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
                    id: "quick-facts",
                    icon: Heart,
                    title: "Student profile — quick facts, age, and tenure",
                    searchText: "quick facts age years months tenure gap school time enrolled since profile sidebar",
                    body: (
                      <div className="space-y-2">
                        <p>The left sidebar of the student profile panel shows key facts about the student at a glance.</p>
                        <div className="space-y-2 mt-2">
                          <div className="rounded-lg border border-border p-3 space-y-1">
                            <p className="text-xs font-semibold">Age</p>
                            <p className="text-xs text-muted-foreground">Always shown in <strong>years and months</strong> (e.g. "5 yrs 3 mos" or "8 mos"). Calculated from the student's date of birth to today.</p>
                          </div>
                          <div className="rounded-lg border border-border p-3 space-y-1">
                            <p className="text-xs font-semibold">Tenure</p>
                            <p className="text-xs text-muted-foreground">The student's <strong>total time at the school</strong> from their earliest enrollment to today — shown in years and months (e.g. "2 yrs 4 mos").</p>
                            <p className="text-xs text-muted-foreground mt-1">If the student skipped a school year, an amber note shows the gap (e.g. "8 mos gap"). Only gaps longer than 3 months are counted as gaps — normal summer breaks are excluded.</p>
                            <p className="text-xs text-muted-foreground mt-1">Tenure is a lifetime metric — it does not change when you switch the year selector to browse historical data.</p>
                          </div>
                        </div>
                        <Note>These facts reflect the student's <em>current</em> state, not the historical year being browsed in the list. The profile sidebar is always current.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "filter-search",
                    icon: Search,
                    title: "Find a student or filter the list",
                    searchText: "search filter find class status code name lookup narrow active students enrolled pending placement graduated withdrawn all",
                    body: (
                      <div className="space-y-2">
                        <p>Several ways to find who you're looking for:</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Search bar</strong> — searches by student name, student code, or guardian name. Works across all statuses and classes.</span>} />
                          <Step n={2} text={<span><strong>School Year selector</strong> — defaults to the Active year. Switch to a past year to see historical enrollment and class assignments for that year.</span>} />
                          <Step n={3} text={<span><strong>Class filter</strong> — shows students in a specific class only. Reflects the selected school year.</span>} />
                          <Step n={4} text={<span><strong>Status filter</strong> — choose from: <em>Active Students</em> (default — hides completed and withdrawn), <em>Enrolled</em>, <em>Pending Placement</em> (classified but not yet enrolled for next year), <em>Graduated</em>, <em>Withdrawn</em>, or <em>All Students</em>.</span>} />
                        </div>
                        <Note>The default <strong>Active Students</strong> view hides completed and withdrawn records to keep the list clean during the school year. Use <strong>All Students</strong> to see everyone regardless of status.</Note>
                        <Note>All filters work together. To see all enrolled students in Kinder AM, set both the class filter and the Enrolled status at the same time.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "historical-view",
                    icon: Search,
                    title: "Viewing a past school year",
                    searchText: "historical view past year previous school year archive enrolled status current lifecycle banner blue profile sidebar current enrollment",
                    body: (
                      <div className="space-y-2">
                        <p>Switch the <strong>School Year</strong> selector to any past year to browse records from that time — class assignments, enrollment status, and year-end outcomes exactly as they were.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open the <strong>School Year</strong> dropdown at the top of the Students page and pick a past year.</span>} />
                          <Step n={2} text={<span>A <strong>blue Historical View banner</strong> appears below the search and filter controls as a reminder that list results reflect that year.</span>} />
                          <Step n={3} text={<span>Each student row shows their class and status <em>for that year</em>. A sub-line below the status shows their <strong>current lifecycle status</strong> (e.g. "Enrolled now", "Graduated / Alumni") so you can see where they are today.</span>} />
                          <Step n={4} text={<span>Graduated or withdrawn students from that year are included — the filter automatically switches to <strong>All Students</strong> when you select a historical year.</span>} />
                        </div>
                        <div className="mt-3 rounded-lg border border-border p-3 space-y-1.5">
                          <p className="text-xs font-semibold">What changes vs. what stays the same</p>
                          <p className="text-xs text-muted-foreground"><strong>Changes:</strong> The student list rows — class name, status, enrollment badge — all reflect the selected historical year.</p>
                          <p className="text-xs text-muted-foreground"><strong>Stays the same:</strong> The student profile panel (opened by clicking a row) always shows the student's <em>current</em> enrollment, class, and status — regardless of which year you're browsing. This is intentional so you always see their present state when you open the profile.</p>
                        </div>
                        <Tip>Adding new enrollments and year-end classifications are disabled in historical view. Switch back to the Active year to make changes.</Tip>
                        <Note>Switch back to the Active year using the School Year selector to return to normal operations.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "promote",
                    icon: GraduationCap,
                    title: "Year-End Classification — review and confirm outcomes",
                    searchText: "classify classification year-end eligible retain graduate not continuing withdrawn needs review mid-year exit permanent leave end year promotion path next level section placement review recommendations exceptions outcome refresh seq progression order auto-suggest",
                    body: (
                      <div className="space-y-2">
                        <p>The system auto-suggests an outcome for each student based on the class's <strong>Promotion Path</strong> and your class level <strong>Seq</strong> numbers. Review, override exceptions, and save.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open <strong>Year-End Classification</strong> and select a class.</span>} />
                          <Step n={2} text={<span><strong>Step 1</strong> shows the Promotion Path and auto-suggested outcome. The suggested next level is derived from the class level's Seq number — the level with Seq+1 is proposed as the next level. The highest Seq level auto-suggests <strong>Graduate</strong>.</span>} />
                          <Step n={3} text={<span>Wrong suggestion? Set or update the Promotion Path in <strong>Classes</strong> and the Seq in <strong>Settings → Class Levels</strong>, then click <strong>Refresh</strong> in Step 1.</span>} />
                          <Step n={4} text={<span><strong>Step 2</strong>: students default to the suggested outcome. Override individuals only as needed — Retain, Needs Review, Not Continuing, Withdrawn, or Graduate.</span>} />
                          <Step n={5} text={<span>Click <strong>Save Year-End Classifications</strong>.</span>} />
                        </div>
                        <div className="space-y-1.5 mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcomes</p>
                          <p className="text-sm"><strong>Eligible</strong> — student moves up to the recommended next level.</p>
                          <p className="text-sm"><strong>Graduate</strong> — student finishes the program (only on graduating classes).</p>
                          <p className="text-sm"><strong>Retain</strong> — student stays in the same level next year.</p>
                          <p className="text-sm"><strong>Needs Review</strong> — outcome undecided; requires further evaluation before promotion.</p>
                          <p className="text-sm"><strong>Not Continuing</strong> — student completed the year but will not return next school year.</p>
                          <p className="text-sm"><strong>Withdrawn</strong> — student left before completing the school year and may return later. Remains eligible for future enrollment.</p>
                        </div>
                        <Note><strong>Recommended Next Level</strong> shows a level, not a section. Section assignment happens at enrollment.</Note>
                        <Tip>Classifications don&apos;t create enrollments. You still need to enroll returning students separately after classification is complete.</Tip>
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
                        <p>Student codes are optional internal reference numbers (e.g. SL-0001) used on billing statements and reports.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Codes are auto-generated when a student is saved — based on your school's code format configured in Settings.</span>} />
                          <Step n={2} text={<span>The code appears in the student list below their name. It's also searchable in the search bar.</span>} />
                          <Step n={3} text={<span>To configure the code format (prefix, padding), go to <strong>Settings → Student Code Format</strong>.</span>} />
                        </div>
                        <Note>If a student was added before code generation was configured, they may not have a code. You can edit the student and save again to trigger code generation, or assign a custom code manually through the database.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "lrn",
                    icon: FileText,
                    title: "Learner Reference Number (LRN)",
                    searchText: "lrn learner reference number deped department of education government identifier philippines",
                    body: (
                      <div className="space-y-2">
                        <p>The LRN is the 12-digit DepEd learner ID assigned to every Philippine student. Lauris Learn stores it as an optional government identifier, separate from the internal student code.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Open <strong>Add Student Profile</strong> or <strong>Edit Student</strong> and expand <strong>Government Identifiers</strong>.</span>} />
                          <Step n={2} text={<span>Enter the LRN and save. You can leave it blank — it's not required.</span>} />
                          <Step n={3} text={<span>The LRN appears next to the internal ID at the top of the student profile modal.</span>} />
                        </div>
                        <Note>LRNs are unique nationally. If you enter an LRN that's already on another child's record, the save will be rejected with an explanation. Only school admins can view or edit LRNs — parents and teachers don't see them in their portals.</Note>
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
                <span>10 topics · click any to expand</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase 6D — Share-with-Clinic shortcut. Locks the modal to the
          student's child_profile_id. Only mounts for school_admin. */}
      {userRole === "school_admin" && schoolOrgId && (
        <ShareIdentityWithClinicModal
          open={!!shareClinicTarget}
          schoolId={schoolId ?? ""}
          schoolOrganizationId={schoolOrgId}
          userId={userId ?? ""}
          lockedChildProfileId={shareClinicTarget?.childProfileId}
          lockedStudentName={shareClinicTarget?.name}
          onClose={() => setShareClinicTarget(null)}
          onShared={() => setShareClinicTarget(null)}
        />
      )}

      {/* Mark as Graduated confirmation modal */}
      <Modal
        open={!!graduateTarget}
        onClose={() => { setGraduateTarget(null); setGraduateError(null); }}
        title="Mark as Graduated"
        className="max-w-sm"
      >
        {graduateTarget && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">{graduateTarget.firstName} {graduateTarget.lastName}</p>
              {graduateTarget.classLevel && (
                <p className="text-xs text-muted-foreground mt-0.5">{graduateTarget.classLevel}</p>
              )}
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              This student will no longer appear in the default active student list. Their profile, history, and documents remain fully accessible.
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Graduation date</label>
              <DatePicker
                value={graduationDate}
                onChange={setGraduationDate}
                placeholder="Select date"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea
                value={graduationNote}
                onChange={(e) => setGraduationNote(e.target.value)}
                placeholder="e.g. Completed Kinder program — SY 2025–2026"
                rows={2}
              />
            </div>

            {graduateError && (
              <p className="text-sm text-red-600">{graduateError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <ModalCancelButton />
              <Button onClick={handleMarkGraduated} disabled={graduateSaving}>
                <GraduationCap className="w-4 h-4" />
                {graduateSaving ? "Saving…" : "Mark Graduated"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
