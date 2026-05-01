"use client";
import { useEffect, useState, useRef } from "react";
import {
  Plus, ArrowRight, Search, TrendingUp, Pencil,
  X, BookOpen, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, UserCheck, Tag,
  RefreshCw, Check, Users, CreditCard,
} from "lucide-react";
import { DatePicker } from "@/components/ui/datepicker";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type InquiryStatus =
  | "inquiry"
  | "assessment_scheduled"
  | "waitlisted"
  | "offered_slot"
  | "enrolled"
  | "not_proceeding";

interface Inquiry {
  id: string;
  childName: string;
  parentName: string;
  contact: string;
  email: string;
  desiredClass: string;
  desiredClassId: string | null;
  desiredClassLevel: string | null;
  schoolYear: string;
  inquirySource: string;
  status: InquiryStatus;
  notes: string;
  nextFollowUp: string | null;
  createdAt: string;
}

interface ClassOption {
  id: string;
  name: string;
  level: string;
  startTime: string | null;
  enrolled: number;
  capacity: number;
}

interface InquiryForm {
  childName: string;
  parentName: string;
  contact: string;
  email: string;
  desiredClassId: string;
  inquirySource: string;
  notes: string;
  nextFollowUp: string;
}

const EMPTY_FORM: InquiryForm = {
  childName: "", parentName: "", contact: "", email: "",
  desiredClassId: "", inquirySource: "", notes: "", nextFollowUp: "",
};

interface PendingPlacement {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  level: string;
  hasPaid: boolean;
}

// ── Returning student types ────────────────────────────────────────────────

type ReturnDerivedStatus =
  | "eligible_not_enrolled"   // eligible + no active-year enrollment  ← primary happy path
  | "already_enrolled"        // any enrollment exists in active year
  | "not_eligible_retained"
  | "not_eligible_other"
  | "graduated"
  | "not_continuing"
  | "no_classification";       // progression_status is null

interface ReturnStudent {
  id: string;
  firstName: string; lastName: string;
  preferredName: string | null;
  studentCode: string | null;
  guardianName: string; guardianPhone: string;
  lastSchoolYearName: string;
  lastClassName: string; lastClassLevel: string;
  progressionStatus: string | null;
  progressionNotes: string | null;
  recommendedNextLevel: string | null;
  derivedStatus: ReturnDerivedStatus;
  activeYearClassName: string | null;
}

const PIPELINE: { status: InquiryStatus; label: string; badge: Parameters<typeof Badge>[0]["variant"] }[] = [
  { status: "inquiry",              label: "Inquiry",           badge: "inquiry" },
  { status: "assessment_scheduled", label: "Assessment Sched.", badge: "default" },
  { status: "waitlisted",           label: "Waitlisted",        badge: "waitlisted" },
  { status: "offered_slot",         label: "Offered Slot",      badge: "default" },
  { status: "enrolled",             label: "Enrolled",          badge: "enrolled" },
  { status: "not_proceeding",       label: "Not Proceeding",    badge: "withdrawn" },
];

const STATUS_FLOW: Record<InquiryStatus, InquiryStatus | null> = {
  inquiry:              "assessment_scheduled",
  assessment_scheduled: "waitlisted",
  waitlisted:           "offered_slot",
  offered_slot:         "enrolled",
  enrolled:             null,
  not_proceeding:       null,
};

const LEVEL_ORDER = [
  "Toddler", "Nursery", "Pre-Kinder", "Kinder",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
];
function levelRank(level: string): number {
  const i = LEVEL_ORDER.findIndex((l) => l.toLowerCase() === level.toLowerCase());
  return i === -1 ? 999 : i;
}

export default function EnrollmentPage() {
  const { schoolId, activeYear, userRole, userId } = useSchoolContext();
  const supabase = createClient();

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "">("");
  const [levelFilter, setLevelFilter] = useState("");
  const [view, setView] = useState<"pipeline" | "table" | "funnel">("pipeline");
  const [showSummary, setShowSummary] = useState(false);
  const [actionItemsOnly, setActionItemsOnly] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<InquiryForm>(EMPTY_FORM);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  // Edit form state
  const [editForm, setEditForm] = useState<InquiryForm>(EMPTY_FORM);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  // Convert-to-enrolled confirmation modal
  const [convertInquiry, setConvertInquiry] = useState<Inquiry | null>(null);
  const [convertLevel, setConvertLevel] = useState("");
  const [convertDob, setConvertDob] = useState("");
  const [convertGender, setConvertGender] = useState("");

  // ── Billing setup gate ────────────────────────────────────────────────────
  const [billingSetup, setBillingSetup] = useState<{ feeTypesOk: boolean; tuitionConfigsOk: boolean } | null>(null);
  const [billingSetupChecking, setBillingSetupChecking] = useState(false);

  // ── Fork picker + returning student flow ──────────────────────────────────
  const [forkOpen, setForkOpen] = useState(false);
  const [returningOpen, setReturningOpen] = useState(false);
  const [returningSearch, setReturningSearch] = useState("");
  const [returningResults, setReturningResults] = useState<ReturnStudent[]>([]);
  const [returningSearching, setReturningSearching] = useState(false);
  const [returningSelected, setReturningSelected] = useState<ReturnStudent | null>(null);
  const [returningLevel, setReturningLevel] = useState("");
  const [returningOverride, setReturningOverride] = useState("");
  const [returningSaving, setReturningSaving] = useState(false);
  const [returningError, setReturningError] = useState<string | null>(null);
  const [returningReserved, setReturningReserved] = useState<{ studentId: string; studentName: string; classId: string | null } | null>(null);
  const [returningPreloaded, setReturningPreloaded] = useState<ReturnStudent[]>([]);
  const [enrollmentNotes, setEnrollmentNotes] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [reservePayment, setReservePayment] = useState({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
  const [itemizedAmounts, setItemizedAmounts] = useState<Record<string, string>>({});
  const [feeTypes, setFeeTypes] = useState<{ id: string; name: string; defaultAmount: number | null; isEnrollmentMandatory: boolean }[]>([]);
  const [reservePaymentSaving, setReservePaymentSaving] = useState(false);
  const [reservePaymentError, setReservePaymentError] = useState<string | null>(null);
  const [reservePaymentDone, setReservePaymentDone] = useState(false);
  const [enrollPayChecked, setEnrollPayChecked] = useState<Record<string, boolean>>({});
  const [enrollPayReceiptFile, setEnrollPayReceiptFile] = useState<File | null>(null);
  const [lastPaymentSummary, setLastPaymentSummary] = useState<{ studentName: string; items: { name: string; amount: number }[]; method: string; date: string; orNumber: string } | null>(null);
  const [accelConfirmed, setAccelConfirmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  function toggleAllEnrollFees() {
    const optional = feeTypes.filter((ft) => !ft.isEnrollmentMandatory);
    const allOptChecked = optional.every((ft) => enrollPayChecked[ft.id]);
    const updates: Record<string, boolean> = {};
    if (allOptChecked) {
      // Uncheck optional only; mandatory stays checked (disabled anyway)
      optional.forEach((ft) => { updates[ft.id] = false; });
    } else {
      // Check everything
      feeTypes.forEach((ft) => { updates[ft.id] = true; });
    }
    setEnrollPayChecked((prev) => ({ ...prev, ...updates }));
  }

  const [pendingPlacements, setPendingPlacements] = useState<PendingPlacement[]>([]);
  const [placementClassId, setPlacementClassId] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [placementGateActive, setPlacementGateActive] = useState(false);
  const [placementFeeTypeName, setPlacementFeeTypeName] = useState<string | null>(null);
  const [placementPayRow, setPlacementPayRow] = useState<string | null>(null);
  const [placementPayForm, setPlacementPayForm] = useState<{ amount: string; feeTypeId: string; method: string; date: string; orNumber: string; receiptFile: File | null }>({ amount: "", feeTypeId: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "", receiptFile: null });
  const [placementPaySaving, setPlacementPaySaving] = useState(false);
  const [placementPayError, setPlacementPayError] = useState<string | null>(null);
  const [placementPayType, setPlacementPayType] = useState<"full" | "installment">("installment");
  const [tuitionMonths, setTuitionMonths] = useState("10");

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (returningSearch.trim().length < 2) { setReturningResults([]); return; }
    searchDebounceRef.current = setTimeout(() => { searchReturningStudents(returningSearch); }, 350);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningSearch, schoolId]);

  useEffect(() => {
    if (returningOpen && schoolId) { loadFeeTypes(); loadPreloadedStudents(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningOpen, schoolId]);

  useEffect(() => {
    if (placementPayRow && schoolId) { loadFeeTypes(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementPayRow, schoolId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadInquiries(), loadClasses(), loadPendingPlacements()]);
    setLoading(false);
  }

  async function loadInquiries() {
    const { data, error: err } = await supabase
      .from("enrollment_inquiries")
      .select(`id, child_name, parent_name, contact, email, desired_class_id, inquiry_source,
        status, notes, next_follow_up, created_at, school_year_id,
        classes(name, level), school_years(name)`)
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false });

    if (err) { setError(err.message); return; }

    setInquiries(
      (data ?? []).map((i) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cls = (i as any).classes;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const yr = (i as any).school_years;
        return {
          id: i.id,
          childName: i.child_name,
          parentName: i.parent_name,
          contact: i.contact ?? "",
          email: i.email ?? "",
          desiredClass: cls?.name ?? "—",
          desiredClassId: i.desired_class_id ?? null,
          desiredClassLevel: cls?.level ?? null,
          schoolYear: yr?.name ?? "—",
          inquirySource: i.inquiry_source ?? "",
          status: i.status as InquiryStatus,
          notes: i.notes ?? "",
          nextFollowUp: i.next_follow_up ?? null,
          createdAt: i.created_at.split("T")[0],
        };
      })
    );
  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("classes")
      .select("id, name, level, start_time, capacity")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .eq("is_system", false)
      .order("name");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (data ?? []).map((c: any) => c.id);
    let enrolledByClass: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: eRows } = await supabase.from("enrollments").select("class_id").in("class_id", ids).eq("status", "enrolled");
      (eRows ?? []).forEach((e) => { enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1; });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setClassOptions((data ?? []).map((c: any) => ({ id: c.id, name: c.name, level: c.level ?? "", startTime: c.start_time ?? null, capacity: c.capacity ?? 0, enrolled: enrolledByClass[c.id] ?? 0 })));
  }

  async function loadPendingPlacements() {
    if (!activeYear?.id || !schoolId) { setPendingPlacements([]); return; }

    // Check if a placement gate fee type is configured for this school
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: gateFt } = await (supabase as any)
      .from("fee_types")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("secures_placement", true)
      .maybeSingle();

    const gateActive = !!gateFt;
    setPlacementGateActive(gateActive);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlacementFeeTypeName((gateFt as any)?.name ?? null);

    // Get system (Unassigned) class IDs for this year
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sysCls } = await (supabase as any)
      .from("classes")
      .select("id, level")
      .eq("school_id", schoolId)
      .eq("school_year_id", activeYear.id)
      .eq("is_system", true);

    if (!sysCls || sysCls.length === 0) { setPendingPlacements([]); return; }

    const levelByClassId: Record<string, string> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sysCls as any[]).forEach((c: { id: string; level: string }) => { levelByClassId[c.id] = c.level ?? "—"; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sysIds = (sysCls as any[]).map((c: { id: string }) => c.id);

    const { data: enrRows } = await supabase
      .from("enrollments")
      .select("id, student_id, class_id, students(first_name, last_name)")
      .in("class_id", sysIds)
      .eq("status", "enrolled");

    if (!enrRows || enrRows.length === 0) { setPendingPlacements([]); return; }

    // Always check payment status — payment is required regardless of gate configuration.
    // When a specific fee type is configured (gateActive), only that fee type's paid record counts.
    // Otherwise, any paid billing record in the current school year suffices.
    const paidStudentIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentIds = (enrRows as any[]).map((e: any) => e.student_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let paidQuery = (supabase as any)
      .from("billing_records")
      .select("student_id")
      .in("student_id", studentIds)
      .eq("school_year_id", activeYear.id)
      .in("status", ["paid"]);
    if (gateActive && (gateFt as any)?.id) {
      paidQuery = paidQuery.eq("fee_type_id", (gateFt as any).id);
    }
    const { data: paidBrs } = await paidQuery;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((paidBrs ?? []) as any[]).forEach((b: any) => paidStudentIds.add(b.student_id));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPendingPlacements(((enrRows ?? []) as any[]).map((e) => ({
      enrollmentId: e.id,
      studentId: e.student_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      studentName: `${(e as any).students?.first_name ?? ""} ${(e as any).students?.last_name ?? ""}`.trim() || "Unknown",
      level: levelByClassId[e.class_id] ?? "—",
      hasPaid: paidStudentIds.has(e.student_id),
    })));
  }

  async function handlePlace(enrollmentId: string, newClassId: string) {
    if (!newClassId) return;
    const placement = pendingPlacements.find((p) => p.enrollmentId === enrollmentId);
    if (!placement?.hasPaid) return;
    setPlacing(enrollmentId);
    const { error: placeErr } = await supabase
      .from("enrollments")
      .update({ class_id: newClassId })
      .eq("id", enrollmentId);
    setPlacing(null);
    if (placeErr) { setError(placeErr.message); return; }
    setPlacementClassId((prev) => { const next = { ...prev }; delete next[enrollmentId]; return next; });
    await Promise.all([loadPendingPlacements(), loadClasses()]);
  }

  async function handleSave() {
    if (!form.childName.trim() || !form.parentName.trim()) { setFormError("Child name and parent name are required."); return; }
    if (!activeYear?.id) { setFormError("No active school year."); return; }

    setSaving(true);
    setFormError(null);

    const { error: iErr } = await supabase.from("enrollment_inquiries").insert({
      school_id: schoolId!,
      school_year_id: activeYear.id,
      child_name: form.childName.trim(),
      parent_name: form.parentName.trim(),
      contact: form.contact.trim() || null,
      email: form.email.trim() || null,
      desired_class_id: form.desiredClassId || null,
      inquiry_source: form.inquirySource || null,
      notes: form.notes.trim() || null,
      next_follow_up: form.nextFollowUp || null,
      status: "inquiry",
    });

    if (iErr) { setFormError(iErr.message); setSaving(false); return; }
    setSaving(false);
    setModalOpen(false);
    setForm(EMPTY_FORM);
    await loadInquiries();
  }

  async function advanceStatus(inquiry: Inquiry) {
    const next = STATUS_FLOW[inquiry.status];
    if (!next) return;

    // When advancing to "enrolled", open conversion dialog
    if (next === "enrolled") {
      setConvertInquiry(inquiry);
      setConvertLevel(inquiry.desiredClassLevel ?? "");
      setConvertDob("");
      setConvertGender("");
      return;
    }

    await supabase.from("enrollment_inquiries").update({ status: next }).eq("id", inquiry.id);
    await loadInquiries();
  }

  async function handleConvertToEnrolled() {
    if (!convertInquiry) return;
    if (!activeYear?.id) { setFormError("No active school year."); return; }

    setSaving(true);
    setFormError(null);

    // Create student record
    const nameParts = convertInquiry.childName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || nameParts[0];

    const { data: student, error: sErr } = await supabase
      .from("students")
      .insert({
        school_id: schoolId!,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: convertDob || null,
        gender: convertGender || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (sErr || !student) { setFormError(sErr?.message ?? "Failed to create student."); setSaving(false); return; }

    // Create guardian
    await supabase.from("guardians").insert({
      student_id: student.id,
      full_name: convertInquiry.parentName,
      relationship: "Guardian",
      phone: convertInquiry.contact || null,
      email: convertInquiry.email || null,
      is_primary: true,
    });

    // Create enrollment via level-based API (auto-creates Unassigned class if needed)
    if (convertLevel) {
      const enrollRes = await fetch("/api/students/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          schoolYearId: activeYear.id,
          level: convertLevel,
          status: "enrolled",
        }),
      });
      if (!enrollRes.ok) {
        const j = await enrollRes.json();
        setFormError(j.error ?? "Enrollment failed.");
        setSaving(false);
        return;
      }
    }

    // Mark inquiry as enrolled
    await supabase.from("enrollment_inquiries").update({ status: "enrolled" }).eq("id", convertInquiry.id);

    setSaving(false);
    setConvertInquiry(null);
    await loadAll();
  }

  // ── Returning student search ───────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapRawToReturnStudent(s: any, activeYearId: string | null): ReturnStudent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guardians: any[] = s.guardians ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrollments: any[] = s.enrollments ?? [];
    const primaryG = guardians.find((g: { is_primary: boolean }) => g.is_primary) ?? guardians[0] ?? null;
    const classifiedEnroll = enrollments
      .filter((e) => e.status === "completed" && e.progression_status)
      .sort((a, b) => (b.school_years?.name ?? "").localeCompare(a.school_years?.name ?? ""))
    [0] ?? null;
    const latestEnroll = [...enrollments]
      .sort((a, b) => (b.school_years?.name ?? "").localeCompare(a.school_years?.name ?? ""))
    [0] ?? null;
    const displayEnroll = classifiedEnroll ?? latestEnroll;
    const progressionStatus: string | null = classifiedEnroll?.progression_status ?? null;
    const progressionNotes: string | null = classifiedEnroll?.progression_notes ?? null;
    const recommendedNextLevel: string | null = displayEnroll?.classes?.next_level ?? null;
    const activeYearEnroll = activeYearId
      ? enrollments.find((e) => e.school_year_id === activeYearId && e.status !== "withdrawn" && e.status !== "completed")
      : null;
    const alreadyEnrolled = !!activeYearEnroll;
    const activeYearClassName: string | null = activeYearEnroll?.classes?.name ?? null;
    let derivedStatus: ReturnDerivedStatus;
    if (alreadyEnrolled)                              derivedStatus = "already_enrolled";
    else if (progressionStatus === "eligible")        derivedStatus = "eligible_not_enrolled";
    else if (progressionStatus === "not_eligible_retained") derivedStatus = "not_eligible_retained";
    else if (progressionStatus === "not_eligible_other")    derivedStatus = "not_eligible_other";
    else if (progressionStatus === "graduated")       derivedStatus = "graduated";
    else if (progressionStatus === "not_continuing")  derivedStatus = "not_continuing";
    else                                              derivedStatus = "no_classification";
    return {
      id: s.id, firstName: s.first_name, lastName: s.last_name,
      preferredName: s.preferred_name ?? null, studentCode: s.student_code ?? null,
      guardianName: primaryG?.full_name ?? "—", guardianPhone: primaryG?.phone ?? "—",
      lastSchoolYearName: displayEnroll?.school_years?.name ?? "—",
      lastClassName: displayEnroll?.classes?.name ?? "—",
      lastClassLevel: displayEnroll?.classes?.level ?? "—",
      progressionStatus, progressionNotes, recommendedNextLevel, derivedStatus, activeYearClassName,
    };
  }

  async function searchReturningStudents(q: string) {
    if (!schoolId || q.trim().length < 2) { setReturningResults([]); return; }
    setReturningSearching(true);

    const like = `%${q.trim()}%`;

    const [directRes, guardianRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("students")
        .select(`
          id, first_name, last_name, preferred_name, student_code,
          guardians(full_name, phone, is_primary),
          enrollments(
            id, status, progression_status, progression_notes, school_year_id,
            classes(name, level, next_level),
            school_years(name)
          )
        `)
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .or(`first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},student_code.ilike.${like}`)
        .limit(15),

      supabase
        .from("guardians")
        .select("student_id, full_name, phone")
        .or(`full_name.ilike.${like},phone.ilike.${like}`)
        .limit(15),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guardianStudentIds: string[] = ((guardianRes.data ?? []) as any[]).map((g: any) => g.student_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let guardianStudents: any[] = [];
    if (guardianStudentIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("students")
        .select(`
          id, first_name, last_name, preferred_name, student_code,
          guardians(full_name, phone, is_primary),
          enrollments(
            id, status, progression_status, progression_notes, school_year_id,
            classes(name, level, next_level),
            school_years(name)
          )
        `)
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .in("id", guardianStudentIds);
      guardianStudents = data ?? [];
    }

    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];
    for (const s of [...(directRes.data ?? []), ...guardianStudents]) {
      if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
    }

    const results: ReturnStudent[] = merged.slice(0, 15).map((s) => mapRawToReturnStudent(s, activeYear?.id ?? null));

    results.sort((a, b) => {
      const rank = (r: ReturnStudent) =>
        r.derivedStatus === "eligible_not_enrolled" ? 0 :
        r.derivedStatus === "no_classification" ? 1 : 2;
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    setReturningResults(results);
    setReturningSearching(false);
  }

  async function loadPreloadedStudents() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("students")
      .select(`
        id, first_name, last_name, preferred_name, student_code,
        guardians(full_name, phone, is_primary),
        enrollments(
          id, status, progression_status, progression_notes, school_year_id,
          classes(name, level, next_level),
          school_years(name)
        )
      `)
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .limit(40);
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: ReturnStudent[] = (data as any[]).map((s) => mapRawToReturnStudent(s, activeYear?.id ?? null));
    // Sort: eligible first, then no_classification (fill to 5), graduated last
    mapped.sort((a, b) => {
      const rank = (r: ReturnStudent) =>
        r.derivedStatus === "eligible_not_enrolled" ? 0 :
        r.derivedStatus === "no_classification"     ? 1 :
        r.derivedStatus === "graduated"             ? 2 : 3;
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
    setReturningPreloaded(mapped.slice(0, 5));
  }

  async function checkBillingSetup() {
    if (!schoolId || billingSetup !== null) return;
    setBillingSetupChecking(true);
    const [ftRes, tcRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("fee_types").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("tuition_configs").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    ]);
    setBillingSetup({
      feeTypesOk:      (ftRes.count  ?? 0) > 0,
      tuitionConfigsOk: (tcRes.count ?? 0) > 0,
    });
    setBillingSetupChecking(false);
  }

  function openFork() {
    setForkOpen(true);
    checkBillingSetup();
  }

  function openReturning() {
    setForkOpen(false);
    setReturningOpen(true);
    setReturningSearch("");
    setReturningResults([]);
    setReturningPreloaded([]);
    setReturningSelected(null);
    setReturningLevel("");
    setReturningOverride("");
    setReturningError(null);
    setReturningReserved(null);
    setEnrollmentNotes("");
    setShowPaymentForm(false);
    setEnrollPayChecked({});
    setEnrollPayReceiptFile(null);
    setLastPaymentSummary(null);
    setReservePayment({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
    setReservePaymentDone(false);
    setReservePaymentError(null);
  }

  function selectReturning(student: ReturnStudent) {
    const isRet = student.derivedStatus === "not_eligible_retained";
    const curRank = levelRank(student.lastClassLevel ?? "");
    const allowedLevels = uniqueLevels.filter((lvl) => isRet || levelRank(lvl) > curRank);
    const safeDefault =
      student.recommendedNextLevel && allowedLevels.includes(student.recommendedNextLevel)
        ? student.recommendedNextLevel
        : "";
    setReturningSelected(student);
    setReturningError(null);
    setReturningOverride("");
    setReturningLevel(safeDefault);
    setAccelConfirmed(false);
  }

  async function handleReturningEnroll() {
    if (!returningSelected || !activeYear?.id) return;
    if (!returningLevel) { setReturningError("Please select a level."); return; }

    // Guard: ensure the submitted level is actually in the allowed set for this student.
    // Prevents stale state or a manipulated client from submitting a blocked level.
    const isRet = returningSelected.derivedStatus === "not_eligible_retained";
    const curRank = levelRank(returningSelected.lastClassLevel ?? "");
    const allowedLevels = uniqueLevels.filter((lvl) => isRet || levelRank(lvl) > curRank);
    if (!allowedLevels.includes(returningLevel)) {
      setReturningError(`"${returningLevel}" is not a valid level selection for this student.`);
      return;
    }

    const needsOverride =
      returningSelected.derivedStatus === "not_eligible_retained" ||
      returningSelected.derivedStatus === "not_eligible_other" ||
      returningSelected.derivedStatus === "graduated" ||
      returningSelected.derivedStatus === "not_continuing";
    if (needsOverride && !returningOverride.trim()) {
      setReturningError("An override reason is required for this student.");
      return;
    }

    setReturningSaving(true);
    setReturningError(null);

    const res = await fetch("/api/students/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: returningSelected.id,
        level: returningLevel,
        schoolYearId: activeYear.id,
        status: "enrolled",
      }),
    });

    const j = await res.json();
    if (!res.ok) {
      setReturningError(j.error ?? "Enrollment failed.");
      setReturningSaving(false);
      return;
    }

    const reservedName = `${returningSelected.firstName} ${returningSelected.lastName}`;
    setReturningReserved({
      studentId: returningSelected.id,
      studentName: reservedName,
      classId: null,
    });
    showToast(`Slot reserved for ${reservedName} (${returningLevel}). Assign a section below.`);
    setAccelConfirmed(false);
    setShowPaymentForm(false);
    setReservePayment({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
    setReservePaymentError(null);
    setReservePaymentDone(false);
    setReturningSaving(false);
    await loadAll();
  }

  async function loadFeeTypes() {
    // Fetch fee types + school-year-specific prices in parallel
    const [typesRes, pricesRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("fee_types")
        .select("id, name, default_amount, is_enrollment_mandatory")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        // mandatory fees first, then alphabetical
        .order("is_enrollment_mandatory", { ascending: false })
        .order("name"),
      activeYear?.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (supabase as any)
            .from("fee_type_prices")
            .select("fee_type_id, amount")
            .eq("school_id", schoolId!)
            .eq("school_year_id", activeYear.id)
        : Promise.resolve({ data: [] }),
    ]);

    // Build a map of year-specific prices
    const yearPriceMap: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((pricesRes.data ?? []) as any[]).forEach((p: any) => { yearPriceMap[p.fee_type_id] = Number(p.amount); });

    const items: { id: string; name: string; defaultAmount: number | null; isEnrollmentMandatory: boolean }[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((typesRes.data ?? []) as any[]).map((ft: any) => {
        // Year-specific price takes precedence over the global default_amount
        const yearAmt = yearPriceMap[ft.id] !== undefined ? yearPriceMap[ft.id] : null;
        return {
          id: ft.id, name: ft.name,
          defaultAmount: yearAmt !== null ? yearAmt : (ft.default_amount ?? null),
          isEnrollmentMandatory: ft.is_enrollment_mandatory ?? false,
        };
      });
    setFeeTypes(items);
    const initAmounts: Record<string, string> = {};
    const initChecked: Record<string, boolean> = {};
    items.forEach((ft) => {
      initAmounts[ft.id] = ft.defaultAmount != null ? ft.defaultAmount.toString() : "";
      initChecked[ft.id] = ft.isEnrollmentMandatory;
    });
    setItemizedAmounts(initAmounts);
    setEnrollPayChecked(initChecked);
  }

  async function handleReservationPayment() {
    if (!returningReserved || !activeYear?.id || !schoolId) return;
    setReservePaymentSaving(true);
    setReservePaymentError(null);

    const checkedItems = feeTypes.filter((ft) => {
      const a = parseFloat(itemizedAmounts[ft.id] ?? "");
      return enrollPayChecked[ft.id] && !isNaN(a) && a > 0;
    });
    if (checkedItems.length === 0) {
      setReservePaymentError("Please enter an amount for at least one fee type.");
      setReservePaymentSaving(false);
      return;
    }
    if (!reservePayment.date) {
      setReservePaymentError("Please select a payment date.");
      setReservePaymentSaving(false);
      return;
    }

    const currentMonth = new Date().toISOString().substring(0, 7) + "-01";
    const notes = enrollmentNotes.trim() || null;
    const summaryItems: { name: string; amount: number }[] = [];

    try {
      for (const ft of checkedItems) {
        const monthlyRate = parseFloat(itemizedAmounts[ft.id]);
        const isTuition = ft.name.toLowerCase().includes("tuition");
        // Full payment = pay entire year upfront; monthly = pay this month, rest billed separately
        const months = parseInt(tuitionMonths) || 1;
        const amtDue = (isTuition && placementPayType === "full") ? monthlyRate * months : monthlyRate;
        const description = (isTuition && placementPayType === "full")
          ? `${ft.name} (Full Year — ${months} months)`
          : ft.name;

        let receiptPath: string | null = null;
        if (enrollPayReceiptFile) {
          const ext = enrollPayReceiptFile.name.split(".").pop() ?? "jpg";
          const tempId = crypto.randomUUID();
          const path = `payment-receipts/${schoolId}/${tempId}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("updates-media")
            .upload(path, enrollPayReceiptFile, { upsert: true });
          if (!uploadErr) receiptPath = path;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: br, error: brErr } = await (supabase as any)
          .from("billing_records")
          .insert({
            school_id: schoolId,
            student_id: returningReserved.studentId,
            class_id: returningReserved.classId,
            school_year_id: activeYear.id,
            billing_month: currentMonth,
            amount_due: amtDue,
            status: "paid",
            description,
            fee_type_id: ft.id,
            notes,
          })
          .select("id")
          .single();
        if (brErr) throw new Error(brErr.message);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: payErr } = await (supabase as any)
          .from("payments")
          .insert({
            billing_record_id: br.id,
            amount: amtDue,
            payment_method: reservePayment.method,
            payment_date: reservePayment.date,
            or_number: reservePayment.orNumber || null,
            receipt_photo_path: receiptPath,
            status: "confirmed",
            recorded_by: userId ?? null,
          });
        if (payErr) throw new Error(payErr.message);
        summaryItems.push({ name: description, amount: amtDue });
      }

      setLastPaymentSummary({
        studentName: returningReserved.studentName,
        items: summaryItems,
        method: reservePayment.method,
        date: reservePayment.date,
        orNumber: reservePayment.orNumber,
      });
      setReservePaymentDone(true);
    } catch (err: unknown) {
      setReservePaymentError(err instanceof Error ? err.message : "Payment recording failed.");
    }
    setReservePaymentSaving(false);
  }

  function printEnrollmentReceipt(summary: { studentName: string; items: { name: string; amount: number }[]; method: string; date: string; orNumber: string }) {
    const total = summary.items.reduce((s, i) => s + i.amount, 0);
    const methodLabel: Record<string, string> = { cash: "Cash", gcash: "GCash", maya: "Maya", bank_transfer: "Bank Transfer", card: "Card", other: "Other" };
    const rows = summary.items.map((i) => `<tr><td>${i.name}</td><td class="text-right">₱${i.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr>`).join("");
    const win = window.open("", "_blank", "width=640,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Enrollment Receipt</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
    h1{font-size:18px;margin-bottom:2px}
    .sub{color:#555;font-size:13px;margin-bottom:20px}
    .meta{margin-bottom:4px}
    .label{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    .value{font-weight:600;font-size:14px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:12px;border-bottom:2px solid #ddd}
    td{padding:8px 10px;border-bottom:1px solid #eee;font-size:13px}
    .text-right{text-align:right}
    .total-row td{font-weight:bold;background:#f9f9f9;border-top:2px solid #ddd}
    .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}
    @media print{body{padding:20px}}
  </style></head><body>
    <h1>Enrollment Payment Receipt</h1>
    <p class="sub">${new Date(summary.date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p>
    <p class="label">Student</p><p class="value">${summary.studentName}</p>
    <p class="label">Payment Method</p><p class="value">${methodLabel[summary.method] ?? summary.method}</p>
    ${summary.orNumber ? `<p class="label">OR Number</p><p class="value">${summary.orNumber}</p>` : ""}
    <table>
      <thead><tr><th>Description</th><th class="text-right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row"><td>Total</td><td class="text-right">₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr></tfoot>
    </table>
    <p class="footer">Thank you for your payment.</p>
  </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 350);
  }

  async function handlePlacementPayment(enrollmentId: string, studentId: string, studentName: string) {
    if (!schoolId || !activeYear?.id) return;

    const checkedItems = feeTypes.filter((ft) => {
      const a = parseFloat(itemizedAmounts[ft.id] ?? "");
      return enrollPayChecked[ft.id] && !isNaN(a) && a > 0;
    });
    if (checkedItems.length === 0) {
      setPlacementPayError("Please enter an amount for at least one fee type.");
      return;
    }
    if (!placementPayForm.date) {
      setPlacementPayError("Please select a payment date.");
      return;
    }

    setPlacementPaySaving(true);
    setPlacementPayError(null);

    const currentMonth = new Date().toISOString().substring(0, 7) + "-01";
    const summaryItems: { name: string; amount: number }[] = [];

    // Upload receipt photo once before the loop
    let sharedReceiptPath: string | null = null;
    if (placementPayForm.receiptFile) {
      const ext = placementPayForm.receiptFile.name.split(".").pop() ?? "jpg";
      const tempId = crypto.randomUUID();
      const path = `payment-receipts/${schoolId}/${tempId}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("updates-media")
        .upload(path, placementPayForm.receiptFile, { upsert: true });
      if (!uploadErr) sharedReceiptPath = path;
    }

    try {
      for (const ft of checkedItems) {
        const monthlyRate = parseFloat(itemizedAmounts[ft.id]);
        const isTuition = ft.name.toLowerCase().includes("tuition");
        const months = parseInt(tuitionMonths) || 1;
        const amtDue = (isTuition && placementPayType === "full") ? monthlyRate * months : monthlyRate;
        const description = (isTuition && placementPayType === "full")
          ? `${ft.name} (Full Year — ${months} months)`
          : ft.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: br, error: brErr } = await (supabase as any)
          .from("billing_records")
          .insert({
            school_id: schoolId,
            student_id: studentId,
            school_year_id: activeYear.id,
            billing_month: currentMonth,
            amount_due: amtDue,
            status: "paid",
            description,
            fee_type_id: ft.id,
          })
          .select("id")
          .single();
        if (brErr) throw new Error(brErr.message);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: payErr } = await (supabase as any)
          .from("payments")
          .insert({
            billing_record_id: br.id,
            amount: amtDue,
            payment_method: placementPayForm.method,
            payment_date: placementPayForm.date,
            or_number: placementPayForm.orNumber || null,
            receipt_photo_path: sharedReceiptPath,
            status: "confirmed",
            recorded_by: userId ?? null,
          });
        if (payErr) throw new Error(payErr.message);
        summaryItems.push({ name: description, amount: amtDue });
      }

      setLastPaymentSummary({
        studentName,
        items: summaryItems,
        method: placementPayForm.method,
        date: placementPayForm.date,
        orNumber: placementPayForm.orNumber,
      });
      setPlacementPayRow(null);
      setPlacementPayType("installment");
      setTuitionMonths("10");
      setPlacementPayForm({ amount: "", feeTypeId: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "", receiptFile: null });
      showToast(`Payment recorded for ${studentName}. Full details in Billing → Payments.`);
      await loadPendingPlacements();
    } catch (err: unknown) {
      setPlacementPayError(err instanceof Error ? err.message : "Payment recording failed.");
    }
    setPlacementPaySaving(false);
  }

  async function markNotProceeding(id: string) {
    await supabase.from("enrollment_inquiries").update({ status: "not_proceeding" }).eq("id", id);
    await loadInquiries();
  }

  function openDetail(inquiry: Inquiry) {
    setSelectedInquiry(inquiry);
    setEditForm({
      childName: inquiry.childName,
      parentName: inquiry.parentName,
      contact: inquiry.contact,
      email: inquiry.email,
      desiredClassId: inquiry.desiredClassId ?? "",
      inquirySource: inquiry.inquirySource,
      notes: inquiry.notes,
      nextFollowUp: inquiry.nextFollowUp ?? "",
    });
    setEditFormError(null);
  }

  async function handleEditSave() {
    if (!selectedInquiry) return;
    if (!editForm.childName.trim() || !editForm.parentName.trim()) {
      setEditFormError("Child name and parent name are required.");
      return;
    }
    setEditSaving(true);
    setEditFormError(null);
    const { error } = await supabase
      .from("enrollment_inquiries")
      .update({
        child_name: editForm.childName.trim(),
        parent_name: editForm.parentName.trim(),
        contact: editForm.contact.trim() || null,
        email: editForm.email.trim() || null,
        desired_class_id: editForm.desiredClassId || null,
        inquiry_source: editForm.inquirySource || null,
        notes: editForm.notes.trim() || null,
        next_follow_up: editForm.nextFollowUp || null,
      })
      .eq("id", selectedInquiry.id);
    if (error) { setEditFormError(error.message); setEditSaving(false); return; }
    setEditSaving(false);
    setSelectedInquiry(null);
    await loadInquiries();
  }

  const uniqueLevels = [...new Set(classOptions.map((c) => c.level).filter(Boolean))].sort();

  // Aggregate capacity + enrollment across all sections per level (system classes excluded from classOptions)
  const levelStats: Record<string, { capacity: number; enrolled: number }> = {};
  classOptions.forEach((c) => {
    if (!c.level) return;
    if (!levelStats[c.level]) levelStats[c.level] = { capacity: 0, enrolled: 0 };
    levelStats[c.level].capacity += c.capacity;
    levelStats[c.level].enrolled += c.enrolled;
  });

  const filtered = inquiries.filter((i) => {
    const matchSearch = !search || i.childName.toLowerCase().includes(search.toLowerCase()) || i.parentName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || i.status === statusFilter;
    const matchLevel = !levelFilter || i.desiredClassLevel === levelFilter;
    return matchSearch && matchStatus && matchLevel;
  });

  const getStatusLabel = (s: InquiryStatus) => PIPELINE.find((p) => p.status === s)?.label ?? s;

  // Analytics uses level+search filter only (not status filter — that's for pipeline navigation)
  const analyticsData = inquiries.filter((i) => {
    const matchSearch = !search || i.childName.toLowerCase().includes(search.toLowerCase()) || i.parentName.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !levelFilter || i.desiredClassLevel === levelFilter;
    return matchSearch && matchLevel;
  });

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Enrollment</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage inquiries, waitlist, and enrollment pipeline</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSummary((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${showSummary ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <TrendingUp className="w-4 h-4" />
            Summary Stats
          </button>
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={openFork}>
            <Plus className="w-4 h-4" /> Start Enrollment
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Pending Section Placement — action-required, shown above pipeline */}
      {pendingPlacements.length > 0 && (
        <Card className="border-amber-300 overflow-hidden">
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <h3 className="font-semibold text-sm text-amber-900">
                Blocked Enrollments ({pendingPlacements.length})
              </h3>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              These students are enrolled but need one more step before section placement can happen.{" "}
              {placementGateActive && placementFeeTypeName
                ? <>A paid <strong>{placementFeeTypeName}</strong> is required before you can assign them to a section.</>
                : <>A paid billing record for the current school year is required before section placement can proceed.</>
              }
            </p>
          </div>
          <div className="p-4 space-y-2">
            {pendingPlacements.map((p) => {
              const levelClasses = classOptions.filter((c) => c.level === p.level);
              const selectedClassId = placementClassId[p.enrollmentId] ?? "";
              return (
                <div
                  key={p.enrollmentId}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                    p.hasPaid && !selectedClassId
                      ? "border-green-400 bg-green-50"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{p.studentName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.level}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {p.hasPaid
                        ? <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                              <Check className="w-3 h-3" /> Paid
                            </span>
                            {!selectedClassId && (
                              <span className="text-xs text-green-700 font-semibold animate-pulse">
                                ← Select a section to place
                              </span>
                            )}
                          </>
                        : <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                              Payment Required
                            </span>
                            <button
                              onClick={() => {
                                if (feeTypes.length === 0) loadFeeTypes();
                                setPlacementPayRow(p.enrollmentId);
                                setPlacementPayError(null);
                                setPlacementPayForm({ amount: "", feeTypeId: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "", receiptFile: null });
                              }}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                            >
                              <CreditCard className="w-3 h-3" /> Record Payment
                            </button>
                          </>
                      }
                    </div>
                  </div>
                  <Select
                    value={selectedClassId}
                    onChange={(e) => setPlacementClassId({ ...placementClassId, [p.enrollmentId]: e.target.value })}
                    className={`w-52 ${p.hasPaid && !selectedClassId ? "ring-2 ring-green-400 ring-offset-1 rounded-md" : ""}`}
                    disabled={!p.hasPaid}
                  >
                    <option value="">— Select section —</option>
                    {levelClasses.map((c) => {
                      const seatsLeft = c.capacity - c.enrolled;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""} ({seatsLeft > 0 ? `${seatsLeft} seats left` : "Full"})
                        </option>
                      );
                    })}
                    {levelClasses.length === 0 && (
                      <option disabled value="">No sections for {p.level}</option>
                    )}
                  </Select>
                  <Button
                    size="sm"
                    disabled={!selectedClassId || placing === p.enrollmentId || !p.hasPaid}
                    onClick={() => handlePlace(p.enrollmentId, selectedClassId)}
                  >
                    {placing === p.enrollmentId ? "Placing…" : "Place"}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Pipeline summary — compact filter strip always visible; counts behind toggle */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filter by stage:</span>
          <button
            onClick={() => setStatusFilter("")}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-medium ${!statusFilter ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            All
          </button>
          {PIPELINE.map((stage) => {
            const count = inquiries.filter((i) => i.status === stage.status).length;
            return (
              <button
                key={stage.status}
                onClick={() => setStatusFilter(statusFilter === stage.status ? "" : stage.status)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-medium ${statusFilter === stage.status ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {stage.label}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        {showSummary && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {PIPELINE.map((stage) => {
              const count = inquiries.filter((i) => i.status === stage.status).length;
              return (
                <Card
                  key={stage.status}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === stage.status ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setStatusFilter(statusFilter === stage.status ? "" : stage.status)}
                >
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-semibold">{count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{stage.label}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Search + filters + view toggle */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search child or parent name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 bg-muted p-1 rounded-lg border border-border">
            {([
              { v: "pipeline" as const, label: "Pipeline" },
              { v: "table" as const, label: "Table" },
              { v: "funnel" as const, label: "Analytics" },
            ]).map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                  view === v
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {v === "funnel" && <TrendingUp className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {uniqueLevels.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Level:</span>
              <button
                onClick={() => setLevelFilter("")}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-medium ${!levelFilter ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                All
              </button>
              {uniqueLevels.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(levelFilter === lvl ? "" : lvl)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors font-medium ${levelFilter === lvl ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none ml-auto">
            <input
              type="checkbox"
              checked={actionItemsOnly}
              onChange={(e) => setActionItemsOnly(e.target.checked)}
              className="rounded border-border"
            />
            Show action items only
          </label>
        </div>
      </div>

      {/* Pipeline View */}
      {view === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PIPELINE.filter((s) => s.status !== "not_proceeding" && (!actionItemsOnly || s.status !== "enrolled")).map((stage) => {
            const stageItems = filtered.filter((i) => i.status === stage.status);
            return (
              <div key={stage.status}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={stage.badge}>{stage.label}</Badge>
                  <span className="text-xs text-muted-foreground">({stageItems.length})</span>
                </div>
                <div className="space-y-3">
                  {stageItems.map((inquiry) => (
                    <Card key={inquiry.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-sm">{inquiry.childName}</p>
                            <p className="text-xs text-muted-foreground">{inquiry.parentName}</p>
                          </div>
                          <Badge variant="default" className="text-xs">{inquiry.desiredClass}</Badge>
                        </div>
                        {inquiry.contact && <p className="text-xs text-muted-foreground mb-2">{inquiry.contact}</p>}
                        {inquiry.notes && <p className="text-xs text-muted-foreground italic mb-3">"{inquiry.notes}"</p>}
                        {inquiry.nextFollowUp && (
                          <p className="text-xs text-orange-600 mb-2">Follow up: {inquiry.nextFollowUp}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {STATUS_FLOW[inquiry.status] && (
                            <button
                              onClick={() => advanceStatus(inquiry)}
                              className="flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-md transition-colors font-medium"
                            >
                              {STATUS_FLOW[inquiry.status] === "enrolled" ? "Enroll Student" : `Move to ${getStatusLabel(STATUS_FLOW[inquiry.status]!)}`}
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={() => openDetail(inquiry)} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
                            Details
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {stageItems.length === 0 && (
                    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center text-xs text-muted-foreground">
                      No inquiries here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {view === "table" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Child Name</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Parent</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Class</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Follow Up</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.filter((i) => !actionItemsOnly || (i.status !== "enrolled" && i.status !== "not_proceeding")).map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-4 font-medium">{i.childName}</td>
                    <td className="px-5 py-4">{i.parentName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{i.contact || "—"}</td>
                    <td className="px-5 py-4">{i.desiredClass}</td>
                    <td className="px-5 py-4">
                      <Badge variant={PIPELINE.find((p) => p.status === i.status)?.badge ?? "default"}>
                        {getStatusLabel(i.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{i.nextFollowUp ?? "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {STATUS_FLOW[i.status] && (
                          <button onClick={() => advanceStatus(i)} className="text-xs text-primary hover:underline">
                            {STATUS_FLOW[i.status] === "enrolled" ? "Enroll" : "Advance"}
                          </button>
                        )}
                        {i.status !== "not_proceeding" && i.status !== "enrolled" && (
                          <button onClick={() => markNotProceeding(i.id)} className="text-xs text-red-500 hover:underline">
                            Not Proceeding
                          </button>
                        )}
                        <button onClick={() => openDetail(i)} className="text-xs text-muted-foreground hover:text-foreground">
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Analytics / Funnel View */}
      {view === "funnel" && (() => {
        const total = analyticsData.length;
        const notProceeding = analyticsData.filter((i) => i.status === "not_proceeding").length;
        const enrolled = analyticsData.filter((i) => i.status === "enrolled").length;
        const active = total - notProceeding;
        const conversionRate = total > 0 ? Math.round((enrolled / total) * 100) : 0;
        const dropOffRate = total > 0 ? Math.round((notProceeding / total) * 100) : 0;

        // Stage counts (active pipeline only)
        const activePipeline = PIPELINE.filter((s) => s.status !== "not_proceeding");
        const stageCounts = activePipeline.map((s) => ({
          ...s,
          count: analyticsData.filter((i) => i.status === s.status).length,
        }));
        const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);

        // Source breakdown
        const sourceCounts: Record<string, number> = {};
        analyticsData.forEach((i) => {
          const src = i.inquirySource || "Unknown";
          sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
        });
        const sources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
        const maxSource = Math.max(...sources.map((s) => s[1]), 1);

        // Stage-to-stage conversion (forward progression)
        const stageConversions = activePipeline.slice(0, -1).map((s, i) => {
          const fromCount = stageCounts.slice(i).reduce((sum, x) => sum + x.count, 0);
          const toCount = stageCounts.slice(i + 1).reduce((sum, x) => sum + x.count, 0);
          return {
            from: s.label,
            to: activePipeline[i + 1].label,
            rate: fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0,
          };
        });

        return (
          <div className="space-y-6">
            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Inquiries", value: total, sub: "All time" },
                { label: "Active Pipeline", value: active, sub: "Excl. not proceeding" },
                { label: "Overall Conversion", value: `${conversionRate}%`, sub: "Inquiry → Enrolled" },
                { label: "Drop-off Rate", value: `${dropOffRate}%`, sub: "Marked not proceeding" },
              ].map((m) => (
                <Card key={m.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-2xl font-bold mt-1">{m.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Funnel stages */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-sm mb-4">Pipeline Funnel</h3>
                  <div className="space-y-3">
                    {stageCounts.map((stage, idx) => {
                      const widthPct = maxCount > 0 ? Math.max(Math.round((stage.count / maxCount) * 100), 4) : 4;
                      const pctOfTotal = total > 0 ? Math.round((stage.count / total) * 100) : 0;
                      return (
                        <div key={stage.status}>
                          <div className="flex items-center justify-between mb-1 text-xs">
                            <span className="font-medium">{stage.label}</span>
                            <span className="text-muted-foreground">{stage.count} · {pctOfTotal}%</span>
                          </div>
                          <div className="h-7 bg-muted rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-primary/80 rounded-lg transition-all flex items-center pl-2"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          {idx < stageConversions.length && stageConversions[idx] && (
                            <p className="text-xs text-muted-foreground mt-0.5 text-right">
                              ↓ {stageConversions[idx].rate}% continue
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {notProceeding > 0 && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Not Proceeding</span>
                      <span className="font-medium text-red-600">{notProceeding}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Source breakdown */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-sm mb-4">Inquiry Sources</h3>
                  {sources.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No source data yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {sources.map(([src, count]) => {
                        const widthPct = Math.max(Math.round((count / maxSource) * 100), 6);
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={src}>
                            <div className="flex items-center justify-between mb-1 text-xs">
                              <span className="font-medium">{src}</span>
                              <span className="text-muted-foreground">{count} · {pct}%</span>
                            </div>
                            <div className="h-5 bg-muted rounded-lg overflow-hidden">
                              <div
                                className="h-full bg-blue-400/70 rounded-lg"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Class demand */}
            {classOptions.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-sm mb-4">Class Demand vs. Capacity</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Class</th>
                          <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Inquiries</th>
                          <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Enrolled</th>
                          <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Capacity</th>
                          <th className="text-right pb-2 text-xs text-muted-foreground font-medium">Seats Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classOptions.map((cls) => {
                          const classInquiries = analyticsData.filter(
                            (i) => i.desiredClassId === cls.id && i.status !== "not_proceeding"
                          ).length;
                          const seatsLeft = cls.capacity - cls.enrolled;
                          return (
                            <tr key={cls.id} className="border-b border-border last:border-0">
                              <td className="py-2.5 font-medium">{cls.name}</td>
                              <td className="py-2.5 text-right text-muted-foreground">{classInquiries}</td>
                              <td className="py-2.5 text-right">{cls.enrolled}</td>
                              <td className="py-2.5 text-right text-muted-foreground">{cls.capacity}</td>
                              <td className={`py-2.5 text-right font-medium ${seatsLeft <= 0 ? "text-red-600" : seatsLeft <= 3 ? "text-amber-600" : "text-green-600"}`}>
                                {seatsLeft <= 0 ? "Full" : seatsLeft}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}


      {/* Inquiry Edit Modal */}
      <Modal open={!!selectedInquiry} onClose={() => setSelectedInquiry(null)} title="Edit Inquiry">
        {selectedInquiry && (
          <div className="space-y-4">
            {editFormError && <ErrorAlert message={editFormError} />}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={PIPELINE.find((p) => p.status === selectedInquiry.status)?.badge ?? "default"}>
                {getStatusLabel(selectedInquiry.status)}
              </Badge>
              <span className="text-xs text-muted-foreground ml-1">· {selectedInquiry.schoolYear}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Child Name *</label>
                <Input value={editForm.childName} onChange={(e) => setEditForm({ ...editForm, childName: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Parent / Guardian *</label>
                <Input value={editForm.parentName} onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Number</label>
                <Input value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} placeholder="09XXXXXXXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="parent@email.com" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Desired Class</label>
                <Select value={editForm.desiredClassId} onChange={(e) => setEditForm({ ...editForm, desiredClassId: e.target.value })}>
                  <option value="">— Not specified —</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""}{c.level ? ` (${c.level})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Inquiry Source</label>
                <Select value={editForm.inquirySource} onChange={(e) => setEditForm({ ...editForm, inquirySource: e.target.value })}>
                  <option value="">Select...</option>
                  <option>Facebook</option>
                  <option>Instagram</option>
                  <option>Referral</option>
                  <option>Walk-in</option>
                  <option>Flyer</option>
                  <option>Other</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Next Follow Up</label>
              <DatePicker value={editForm.nextFollowUp} onChange={(v) => setEditForm({ ...editForm, nextFollowUp: v })} placeholder="Pick a date" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                {STATUS_FLOW[selectedInquiry.status] && (
                  <button
                    onClick={() => { advanceStatus(selectedInquiry); setSelectedInquiry(null); }}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {STATUS_FLOW[selectedInquiry.status] === "enrolled" ? "Enroll Student" : `Move to ${getStatusLabel(STATUS_FLOW[selectedInquiry.status]!)}`}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedInquiry(null)}>Cancel</Button>
                <Button onClick={handleEditSave} disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Convert to Enrolled Modal */}
      <Modal open={!!convertInquiry} onClose={() => setConvertInquiry(null)} title="Enroll Student" className="max-w-lg">
        {convertInquiry && (
          <div className="space-y-4">
            {formError && <ErrorAlert message={formError} />}
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Child:</span> <strong>{convertInquiry.childName}</strong></p>
              <p><span className="text-muted-foreground">Parent:</span> {convertInquiry.parentName}</p>
              <p className="text-xs text-muted-foreground mt-1">This will create a student record, guardian, and enrollment. You can edit full details from the Students page after.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <Input type="date" value={convertDob} onChange={(e) => setConvertDob(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <Select value={convertGender} onChange={(e) => setConvertGender(e.target.value)}>
                  <option value="">Select...</option>
                  <option>Male</option>
                  <option>Female</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Assign to Level *</label>
              <Select value={convertLevel} onChange={(e) => setConvertLevel(e.target.value)}>
                <option value="">— Select level —</option>
                {uniqueLevels.map((lvl) => {
                  const stats = levelStats[lvl] ?? { capacity: 0, enrolled: 0 };
                  const full = stats.capacity > 0 && stats.enrolled >= stats.capacity;
                  return (
                    <option key={lvl} value={lvl}>
                      {lvl} — {stats.enrolled}/{stats.capacity} enrolled{full ? " · Full" : ""}
                    </option>
                  );
                })}
              </Select>
              {convertLevel && (() => {
                const st = levelStats[convertLevel];
                if (!st) return null;
                const full = st.capacity > 0 && st.enrolled >= st.capacity;
                return full ? (
                  <p className="text-xs text-amber-600 mt-1">This level is at capacity. The student will need section assignment via Pending Placement once space opens.</p>
                ) : null;
              })()}
              <p className="text-xs text-muted-foreground mt-1">Section assignment happens separately after enrollment.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConvertInquiry(null)}>Cancel</Button>
              <Button onClick={handleConvertToEnrolled} disabled={saving}>
                {saving ? "Enrolling…" : "Confirm Enrollment"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Enrollment Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Enrollment Help</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
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

            {/* Topics */}
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
                    id: "page-overview",
                    icon: BookOpen,
                    title: "What this page is for",
                    searchText: "overview purpose enrollment pipeline waitlist assessment offered slot billing add student profile",
                    body: (
                      <div className="space-y-2">
                        <p>This is where you manage everything related to enrolling students — from the first inquiry all the way to class placement.</p>
                        <p className="mt-1">All of the following happen here, not in the Students page:</p>
                        <div className="mt-2 space-y-1.5 pl-1">
                          <p className="text-xs">• <strong>Inquiry</strong> — a parent expresses interest</p>
                          <p className="text-xs">• <strong>Assessment / Waitlist</strong> — you&apos;re evaluating or holding a spot</p>
                          <p className="text-xs">• <strong>Offered Slot</strong> — a class seat has been offered</p>
                          <p className="text-xs">• <strong>Enrollment confirmed</strong> — student record, guardian, and class assignment are all created</p>
                          <p className="text-xs">• <strong>Section placement</strong> — assigning the enrolled student to a specific section</p>
                        </div>
                        <Note><strong>Add Student Profile</strong> (in the Students page) is not for enrollment. It creates a profile with no school year, class, or billing — use it only when you need to store information before enrollment is ready.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "add-inquiry",
                    icon: Plus,
                    title: "Enroll New Student — log an inquiry to start",
                    searchText: "enroll new student add inquiry log walk-in facebook referral source parent child pipeline",
                    body: (
                      <div className="space-y-2">
                        <p>Use this for any child who is new to the school. The inquiry is your first record of their interest — you move it through the pipeline until enrollment is confirmed.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Start Enrollment → Enroll New Student</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter the <strong>child's name</strong> and <strong>parent/guardian name</strong> — these are required.</span>} />
                          <Step n={3} text={<span>Add a <strong>contact number</strong> or email so you can follow up later.</span>} />
                          <Step n={4} text={<span>Select the <strong>desired class</strong> if the parent has a preference. This feeds into the Analytics view's class demand table.</span>} />
                          <Step n={5} text={<span>Select the <strong>inquiry source</strong> (Facebook, Referral, Walk-in, etc.). This powers the source breakdown in Analytics — fill it in consistently for useful data.</span>} />
                          <Step n={6} text={<span>Set a <strong>follow-up date</strong> if you agreed to call them back on a specific day.</span>} />
                          <Step n={7} text={<span>Click <strong>Save</strong>. The card appears in the Inquiry column of the pipeline.</span>} />
                        </div>
                        <Note>You don&apos;t need all details upfront. Log just name + contact now and fill in the rest later by clicking <strong>Details</strong> on the card.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "pipeline-stages",
                    icon: Tag,
                    title: "What each pipeline stage means",
                    searchText: "stages inquiry assessment waitlisted offered slot enrolled not proceeding status meaning pipeline",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { label: "Inquiry", color: "text-blue-600", desc: "Parent has expressed interest. Initial contact made, no commitment yet." },
                          { label: "Assessment Sched.", color: "text-yellow-600", desc: "Assessment or visit has been scheduled. Waiting for it to happen." },
                          { label: "Waitlisted", color: "text-orange-600", desc: "No slot available right now. Parent is waiting for a seat to open." },
                          { label: "Offered Slot", color: "text-purple-600", desc: "A class slot has been offered. Waiting for the parent to confirm." },
                          { label: "Enrolled", color: "text-green-600", desc: "Parent confirmed. Student record, guardian, and enrollment have been created in the system." },
                          { label: "Not Proceeding", color: "text-red-600", desc: "Parent withdrew interest. Removed from the active pipeline but kept in records for analytics." },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-28 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Not Proceeding is a terminal stage — there's no button to move it further. These entries are excluded from the Pipeline view but still visible in Table view and counted in Analytics drop-off rate.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "advance-stage",
                    icon: ArrowRight,
                    title: "Move an inquiry to the next stage",
                    searchText: "advance move stage next progress pipeline card arrow",
                    body: (
                      <div className="space-y-2">
                        <p>Each inquiry moves forward one stage at a time — you can't skip stages.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Find the inquiry card in the <strong>Pipeline view</strong> (or the row in Table view).</span>} />
                          <Step n={2} text={<span>Click the <strong>→ Move to [Next Stage]</strong> link at the bottom of the card.</span>} />
                          <Step n={3} text={<span>The card moves to the next column immediately. No confirmation is needed until the final step (Enroll).</span>} />
                        </div>
                        <Tip>You can also advance from inside the Details edit modal — there's a Move button at the bottom left. This is handy when you need to update notes and advance in one go.</Tip>
                        <Note>The pipeline flows: Inquiry → Assessment Scheduled → Waitlisted → Offered Slot → Enrolled. If a stage doesn't apply (e.g. you never waitlisted them), just advance through it — the stage history isn't tracked, only the current status matters.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "enroll-student",
                    icon: UserCheck,
                    title: "Confirm enrollment — create the official student record",
                    searchText: "enroll student convert confirm enrollment class assign create student record official",
                    body: (
                      <div className="space-y-2">
                        <p><strong>Enrollment is the official process</strong> — it assigns the student to a school year, class, and billing. Always enroll through this page, not by creating a student manually in Students.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Find the inquiry at the <strong>Offered Slot</strong> stage and click <strong>Enroll Student →</strong>.</span>} />
                          <Step n={2} text={<span>A confirmation modal opens. Optionally enter the child's <strong>date of birth</strong> and <strong>gender</strong> now (you can add more details from the Students page later).</span>} />
                          <Step n={3} text={<span>Select the <strong>class</strong> to assign the student to. The dropdown shows current enrolment vs. capacity so you can see which classes have seats.</span>} />
                          <Step n={4} text={<span>Click <strong>Confirm Enrollment</strong>. The system automatically creates: a student record, a guardian record using the parent info from the inquiry, and an enrollment linking the student to the class and school year.</span>} />
                        </div>
                        <Tip>Enrollment assigns the school year, class, and billing — without it, the student won&apos;t appear in attendance or billing even if their profile exists in Students.</Tip>
                        <Note>After enrollment, go to <strong>Students</strong> to complete the profile (address, medical notes, additional guardians) and send the parent portal invite.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "not-proceeding",
                    icon: X,
                    title: "Mark an inquiry as Not Proceeding",
                    searchText: "not proceeding cancelled withdrew no longer interested remove drop off",
                    body: (
                      <div className="space-y-2">
                        <p>Use this when a parent confirms they're no longer interested, chose another school, or can't be reached after several follow-ups.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Switch to <strong>Table view</strong> (Pipeline view doesn't show a Not Proceeding button).</span>} />
                          <Step n={2} text={<span>Find the row and click <strong>Not Proceeding</strong> on the right side.</span>} />
                          <Step n={3} text={<span>The inquiry is removed from the active pipeline immediately. No confirmation prompt — it's instant.</span>} />
                        </div>
                        <Note>Not Proceeding inquiries are not deleted. They're counted in the Analytics view's drop-off rate and still appear in Table view when no status filter is applied. This preserves your historical data for source analysis.</Note>
                        <Tip>There's no undo button — if you mark one by mistake, open the Details modal and you won't find a way to un-set it from the UI currently. Be deliberate before clicking.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "edit-inquiry",
                    icon: Pencil,
                    title: "Update an inquiry's details or notes",
                    searchText: "edit update details notes contact follow up class source change",
                    body: (
                      <div className="space-y-2">
                        <p>Use this any time you gather new information — a corrected contact number, a class preference change, notes from a call, or a new follow-up date.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>In <strong>Pipeline view</strong>, click <strong>Details</strong> at the bottom of the card. In <strong>Table view</strong>, click <strong>Edit</strong> on the right.</span>} />
                          <Step n={2} text={<span>Update any fields — name, contact, class preference, source, notes, or follow-up date.</span>} />
                          <Step n={3} text={<span>You can also <strong>advance the stage</strong> from this modal using the Move button at the bottom left — saves opening two things.</span>} />
                          <Step n={4} text={<span>Click <strong>Save Changes</strong>.</span>} />
                        </div>
                        <Note>Notes are free-text and appear as italicised quotes on the pipeline card — keep them short and actionable (e.g. "Prefers morning class, will confirm by Friday").</Note>
                      </div>
                    ),
                  },
                  {
                    id: "follow-up",
                    icon: Search,
                    title: "Manage follow-up dates",
                    searchText: "follow up date reminder orange overdue callback call back",
                    body: (
                      <div className="space-y-2">
                        <p>A follow-up date is a reminder you set for yourself — when to call or message the parent next.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Set or update it in the <strong>Enroll New Student</strong> form or the <strong>Details / Edit modal</strong> using the Next Follow Up date picker.</span>} />
                          <Step n={2} text={<span>When set, it shows in <strong>orange</strong> on the pipeline card ("Follow up: YYYY-MM-DD") as a visual cue.</span>} />
                          <Step n={3} text={<span>In <strong>Table view</strong> the Follow Up column is sortable by eye — scan for today's or past dates to see who needs a call.</span>} />
                        </div>
                        <Tip>There's no automated notification for follow-ups — it's a visual flag only. Make it a habit to scan the Table view at the start of each day and filter by status to find pending follow-ups.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "find-filter",
                    icon: Search,
                    title: "Find a specific inquiry or filter the list",
                    searchText: "search filter find status level class look up narrow",
                    body: (
                      <div className="space-y-2">
                        <p>Several ways to narrow down what you're looking at:</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Search bar</strong> — filters by child name or parent name across all statuses. Works in all three views.</span>} />
                          <Step n={2} text={<span><strong>Status cards</strong> (the six count cards at the top) — click any card to filter to just that stage. Click again to clear. Useful for quickly seeing all Waitlisted or all Offered Slot inquiries.</span>} />
                          <Step n={3} text={<span><strong>Level chips</strong> (below the search bar) — filter by the class level the child is interested in (Pre-Kinder, Kinder, etc.). Only appears if classes with levels exist.</span>} />
                        </div>
                        <Note>The status filter and level filter stack with the search bar — you can combine them. To see all Waitlisted inquiries for Kinder, click the Waitlisted card and the Kinder chip at the same time.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "views",
                    icon: TrendingUp,
                    title: "Pipeline vs Table vs Analytics — which to use",
                    searchText: "pipeline table analytics funnel view switch kanban board column",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          {
                            label: "Pipeline",
                            desc: "Kanban-style columns — one column per stage. Best for day-to-day work: seeing where everything stands at a glance and moving cards forward. This is your default working view.",
                          },
                          {
                            label: "Table",
                            desc: "Flat list with all details in columns. Best when you need to scan follow-up dates, sort by class, or perform bulk actions like marking multiple inquiries as Not Proceeding. Also the only view that shows Not Proceeding entries in context.",
                          },
                          {
                            label: "Analytics",
                            desc: "Funnel chart, source breakdown, and class demand table. Use this for reporting to management, deciding whether to open an extra class, or reviewing which marketing channel is sending the most inquiries.",
                          },
                        ].map(({ label, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className="font-semibold text-xs w-16 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Switching views preserves your active search and level filter. The status filter is respected in Pipeline and Table views but ignored in Analytics (which always counts all statuses for accurate funnel math).</Note>
                      </div>
                    ),
                  },
                  {
                    id: "analytics",
                    icon: TrendingUp,
                    title: "Reading the Analytics view",
                    searchText: "analytics funnel conversion rate drop off source breakdown class demand seats",
                    body: (
                      <div className="space-y-2">
                        <p>Switch to <strong>Analytics</strong> (top right toggle) for a snapshot of how your enrollment pipeline is performing.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Overall Conversion</strong> — percentage of all inquiries that reached Enrolled status. A healthy rate varies, but anything below 30% is worth investigating at each stage drop-off.</span>} />
                          <Step n={2} text={<span><strong>Pipeline Funnel</strong> — bar chart per stage. The "↓ X% continue" label between bars tells you what percentage of inquiries at that stage made it to the next. A large drop between Offered Slot → Enrolled usually means pricing or timing friction.</span>} />
                          <Step n={3} text={<span><strong>Inquiry Sources</strong> — which channel brought in the most leads. Use this to decide where to focus your marketing spend next enrolment season.</span>} />
                          <Step n={4} text={<span><strong>Class Demand vs. Capacity</strong> — how many active inquiries are interested in each class vs. how many seats remain. Red "Full" means no seats — consider opening a new section or redirecting interest to another class.</span>} />
                        </div>
                        <Tip>The Analytics view uses your current <strong>level filter</strong> but ignores the status filter. To see funnel data for Kinder only, click the Kinder chip first, then switch to Analytics.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "returning-student",
                    icon: UserCheck,
                    title: "Enroll Returning Student — re-enroll a student from a past year",
                    searchText: "returning student re-enroll eligible classification year-end existing promote",
                    body: (
                      <div className="space-y-2">
                        <p>Use <strong>Enroll Returning Student</strong> when a student from a previous school year is coming back. This reuses their existing profile and avoids creating a duplicate record.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Start Enrollment → Enroll Returning Student</strong>.</span>} />
                          <Step n={2} text={<span>Search by student name, nickname, student code, or parent name. Results appear after 2 characters.</span>} />
                          <Step n={3} text={<span>Students tagged as <strong>Eligible — ready to enroll</strong> (green) are cleared from Year-End Classification. These are your primary targets.</span>} />
                          <Step n={4} text={<span>Select a student. The <strong>Assign to Level</strong> dropdown only shows levels higher than the student's current level — downgrades are blocked. The recommended next level is pre-selected and marked with ★.</span>} />
                          <Step n={5} text={<span>Click <strong>Reserve Slot</strong>. A confirmation toast appears and the student moves to the <strong>Blocked Enrollments</strong> panel at the top of the page.</span>} />
                          <Step n={6} text={<span>Click <strong>Record Payment</strong> in the reservation confirmation screen. The fee breakdown shows all active fee types — mandatory fees are pre-checked. Enter the amount collected for each, pick the payment method and date, then click <strong>Confirm Payment</strong>. Each fee creates a separate billing record automatically.</span>} />
                        </div>
                        <Tip>Fee type amounts are pre-filled from the school-year prices you set in <strong>Billing → Setup → Fee Types</strong>. Edit them per payment if the actual amount differs.</Tip>
                        <Tip>Students classified as <strong>Retained</strong> can be assigned to the same or a lower level — all levels are shown in the dropdown.</Tip>
                        <Tip>If you select a level that <strong>skips</strong> the recommended next level (accelerated placement), an amber confirmation prompt appears. Tick the checkbox to confirm before the Reserve Slot button becomes active.</Tip>
                        <Tip>Students with non-eligible classifications (Graduated, Not Continuing, etc.) show a warning and require an override reason from a school admin before enrolling.</Tip>
                        <Note>If a student is <strong>already enrolled</strong> in the active year, enrollment is blocked outright — no override is possible. Check the Students page to view their current enrollment.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "promote-reenroll",
                    icon: ArrowRight,
                    title: "Promote / Re-enroll — move a student to their next class",
                    searchText: "promote re-enroll year-end classification eligible next class level advance",
                    body: (
                      <div className="space-y-2">
                        <p>Promoting a student means enrolling them in a new class for the new school year, based on their Year-End Classification outcome.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Go to <strong>Students → Year-End Classification</strong> tab and classify each student (Eligible, Retain, Graduate, etc.) at the end of the school year.</span>} />
                          <Step n={2} text={<span>In the new school year, go to <strong>Students</strong> and open the student&apos;s profile panel.</span>} />
                          <Step n={3} text={<span>In the <strong>Enrollments</strong> section, click <strong>+ Add Enrollment</strong> and select the new class.</span>} />
                          <Step n={4} text={<span>Or, use <strong>Start Enrollment → Enroll Returning Student</strong> on this page to do the same thing — it will pre-suggest the recommended next level.</span>} />
                        </div>
                        <Tip>Students classified as <strong>Eligible</strong> are your first priority for re-enrollment — they appear with a green badge in the Returning Student search results.</Tip>
                        <Note>Promotion does not happen automatically — each student needs to be re-enrolled individually (or in bulk via the Returning Student flow).</Note>
                      </div>
                    ),
                  },
                  {
                    id: "pending-placement",
                    icon: UserCheck,
                    title: "Blocked Enrollments — assign students to a class section",
                    searchText: "blocked enrollment pending placement section assign class unassigned level payment required",
                    body: (
                      <div className="space-y-2">
                        <p>When a student is enrolled but not yet assigned to a specific section, they appear in the <strong>Blocked Enrollments</strong> panel at the top of this page.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Each row shows the student&apos;s name, level, and payment status. A <strong>Payment Required</strong> badge means you need to record a payment before you can assign a section.</span>} />
                          <Step n={2} text={<span>If payment is needed, click <strong>Record Payment</strong> to open the fee breakdown. Check the fees collected, enter the amount for each, then confirm. Mandatory fees are pre-selected.</span>} />
                          <Step n={3} text={<span>Once paid (green <strong>Paid</strong> badge), use the dropdown to select a <strong>class section</strong> — available seats are shown next to each option.</span>} />
                          <Step n={4} text={<span>Click <strong>Place</strong>. The student moves to the selected section immediately.</span>} />
                        </div>
                        <Note>Once placed, the student will appear in Attendance and can receive Billing records for their section. Students showing as blocked are still counted as enrolled in the dashboard.</Note>
                        <Tip>If no sections exist for a level yet, create them first in the <strong>Classes</strong> page, then come back here to place students.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "inquiry-source",
                    icon: Tag,
                    title: "Why inquiry source matters",
                    searchText: "source facebook referral walk-in flyer instagram marketing analytics tracking",
                    body: (
                      <div className="space-y-2">
                        <p>The inquiry source field is optional when logging an inquiry, but it's the only way to know which marketing channels are working.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>When adding or editing an inquiry, always select the <strong>Inquiry Source</strong> from the dropdown (Facebook, Instagram, Referral, Walk-in, Flyer, Other).</span>} />
                          <Step n={2} text={<span>After a few weeks of data, go to <strong>Analytics view → Inquiry Sources</strong> to see the breakdown. The bar chart shows which source is sending the most leads.</span>} />
                          <Step n={3} text={<span>Use this to make decisions: if Referral drives 60% of leads, invest in a referral reward program. If Facebook is low, revisit your ads targeting.</span>} />
                        </div>
                        <Note>Inquiries with no source selected are counted as "Unknown" in Analytics. Going back and filling in source on old inquiries will make your analytics more accurate.</Note>
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

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch ? (
                <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span>
              ) : (
                <span>13 topics · click any to expand</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Fork Picker Modal ─────────────────────────────────────────────── */}
      <Modal open={forkOpen} onClose={() => setForkOpen(false)} title="Start Enrollment" className="max-w-sm">
        <div className="space-y-3 pt-1">

          {/* Billing setup gate — shown while checking or when incomplete */}
          {(billingSetupChecking || (billingSetup && (!billingSetup.feeTypesOk || !billingSetup.tuitionConfigsOk))) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              {billingSetupChecking ? (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
                  Checking billing setup…
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-amber-800">Billing setup required</p>
                  </div>
                  <p className="text-xs text-amber-700 pl-6">
                    Complete billing setup before enrolling students so fees can be properly recorded.
                  </p>
                  <ul className="pl-6 space-y-0.5">
                    {!billingSetup?.feeTypesOk && (
                      <li className="text-xs text-amber-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        No active fee types defined
                      </li>
                    )}
                    {!billingSetup?.tuitionConfigsOk && (
                      <li className="text-xs text-amber-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        No tuition rates configured
                      </li>
                    )}
                  </ul>
                  <div className="pl-6 pt-1">
                    <a
                      href="/billing"
                      onClick={() => setForkOpen(false)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                    >
                      Go to Billing → Setup
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Enroll Returning Student — blocked when fee types are missing */}
          {(() => {
            const blocked = billingSetup !== null && !billingSetup.feeTypesOk;
            return (
              <button
                onClick={blocked ? undefined : openReturning}
                disabled={billingSetupChecking || blocked}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-colors text-left group
                  ${blocked
                    ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                    : "border-border hover:border-primary hover:bg-primary/5"
                  }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
                  ${blocked ? "bg-muted" : "bg-primary/10 group-hover:bg-primary/20"}`}>
                  <UserCheck className={`w-5 h-5 ${blocked ? "text-muted-foreground" : "text-primary"}`} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Enroll Returning Student</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blocked
                      ? "Set up fee types in Billing → Setup first."
                      : "Search for an existing student and create a new enrollment for this school year."}
                  </p>
                </div>
              </button>
            );
          })()}

          <button
            onClick={() => { setForkOpen(false); setModalOpen(true); setForm(EMPTY_FORM); setFormError(null); }}
            className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-accent transition-colors mt-0.5">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm">Enroll New Student</p>
              <p className="text-xs text-muted-foreground mt-0.5">For a child new to the school. Logs their inquiry and moves them through the admissions pipeline to enrollment.</p>
            </div>
          </button>

          <div className="border-t border-border pt-3 mt-1">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Re-enrolling a returning student?</p>
            <button
              onClick={() => { setForkOpen(false); window.location.href = "/students"; }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left text-xs"
            >
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span><strong>Promote / Re-enroll</strong> — go to Students → Year-End Classification to classify students, then use <strong>Add Enrollment</strong> on their profile.</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Returning Student Modal ────────────────────────────────────────── */}
      <Modal
        open={returningOpen}
        onClose={() => {
          setReturningOpen(false);
          setReturningSelected(null);
          setReturningReserved(null);
          setEnrollmentNotes("");
          setShowPaymentForm(false);
          setEnrollPayChecked({});
          setEnrollPayReceiptFile(null);
          setLastPaymentSummary(null);
          setReservePaymentDone(false);
          setReservePaymentError(null);
        }}
        title="Enroll Returning Student"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {/* ── Slot reserved state ── */}
          {returningReserved && (() => {
            const slotExpiry = (() => {
              if (!activeYear?.startDate) return null;
              const d = new Date(activeYear.startDate + "T00:00:00");
              d.setDate(d.getDate() - 7);
              return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
            })();

            if (reservePaymentDone) {
              return (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm text-green-800">Payment recorded</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        The slot for <strong>{returningReserved.studentName}</strong> is now secured.
                        Full payment history is available in <strong>Billing → Payments</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {lastPaymentSummary && (
                      <Button variant="outline" onClick={() => printEnrollmentReceipt(lastPaymentSummary!)}>
                        Print Receipt
                      </Button>
                    )}
                    <Button onClick={() => { setReturningOpen(false); setReturningReserved(null); setReservePaymentDone(false); setLastPaymentSummary(null); }}>
                      Done
                    </Button>
                  </div>
                </div>
              );
            }

            if (showPaymentForm) {
              const checkedTotal = feeTypes
                .filter((ft) => enrollPayChecked[ft.id])
                .reduce((sum, ft) => {
                  const v = parseFloat(itemizedAmounts[ft.id] ?? "");
                  if (isNaN(v)) return sum;
                  const isTuition = ft.name.toLowerCase().includes("tuition");
                  const m = parseInt(tuitionMonths) || 1;
                  return sum + (isTuition && placementPayType === "full" ? v * m : v);
                }, 0);
              const canSubmit = checkedTotal > 0 && !!reservePayment.date;

              return (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back
                  </button>
                  <p className="text-sm font-medium">Record initial payment for <strong>{returningReserved.studentName}</strong></p>

                  {feeTypes.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      No fee types defined. Add fee types in <strong>Billing → Setup → Fee Types</strong> first.
                    </p>
                  ) : (
                    <div>
                      {(() => {
                        const optional = feeTypes.filter((ft) => !ft.isEnrollmentMandatory);
                        const allOptChecked = optional.length > 0 && optional.every((ft) => enrollPayChecked[ft.id]);
                        return optional.length > 0 ? (
                          <div className="flex justify-start mb-1">
                            <button
                              type="button"
                              onClick={toggleAllEnrollFees}
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              {allOptChecked ? "Unselect optional" : "Select all"}
                            </button>
                          </div>
                        ) : null;
                      })()}
                    <div className="border border-border rounded-lg overflow-hidden">
                      {feeTypes.map((ft, i) => {
                        const isTuition = ft.name.toLowerCase().includes("tuition");
                        const tuitionAmt = parseFloat(itemizedAmounts[ft.id] ?? "0") || 0;
                        return (
                          <div key={ft.id}>
                            <div className={`flex items-center gap-2.5 px-3 py-1.5 ${i > 0 ? "border-t border-border" : ""}`}>
                              <input
                                type="checkbox"
                                id={`ep-${ft.id}`}
                                checked={!!enrollPayChecked[ft.id]}
                                disabled={ft.isEnrollmentMandatory}
                                onChange={(e) => setEnrollPayChecked((prev) => ({ ...prev, [ft.id]: e.target.checked }))}
                                className="w-4 h-4 accent-primary flex-shrink-0"
                              />
                              <label htmlFor={`ep-${ft.id}`} className={`flex-1 text-sm min-w-0 cursor-pointer ${ft.isEnrollmentMandatory ? "font-medium" : "text-muted-foreground"}`}>
                                {ft.name}
                                {ft.isEnrollmentMandatory && <span className="ml-1.5 text-xs text-muted-foreground font-normal">required</span>}
                              </label>
                              <div className="relative flex-shrink-0">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₱</span>
                                <Input
                                  type="number" min="0" step="0.01" placeholder="0.00"
                                  value={itemizedAmounts[ft.id] ?? ""}
                                  onChange={(e) => setItemizedAmounts({ ...itemizedAmounts, [ft.id]: e.target.value })}
                                  className="w-28 text-right pl-6 h-8 text-sm"
                                  disabled={!enrollPayChecked[ft.id]}
                                />
                              </div>
                            </div>
                            {isTuition && enrollPayChecked[ft.id] && tuitionAmt > 0 && (
                              <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-2">
                                <p className="text-xs text-muted-foreground font-medium">Tuition payment plan</p>
                                <div className="flex gap-2">
                                  {([
                                    { value: "full" as const, label: "Full Payment", sub: "Pay full year upfront" },
                                    { value: "installment" as const, label: "Monthly", sub: "Pay per month" },
                                  ]).map(({ value, label, sub }) => (
                                    <button key={value} type="button"
                                      onClick={() => setPlacementPayType(value)}
                                      className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors flex-1 ${placementPayType === value ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:bg-muted"}`}>
                                      <span className="text-xs font-medium">{label}</span>
                                      <span className={`text-xs mt-0.5 ${placementPayType === value ? "text-primary/70" : "text-muted-foreground"}`}>{sub}</span>
                                    </button>
                                  ))}
                                </div>
                                {placementPayType === "full" && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">₱{tuitionAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ×</span>
                                      <Input
                                        type="number" min="1" max="24" step="1"
                                        value={tuitionMonths}
                                        onChange={(e) => setTuitionMonths(e.target.value)}
                                        className="w-16 h-7 text-xs text-center px-2"
                                      />
                                      <span className="text-xs text-muted-foreground">months</span>
                                    </div>
                                    <p className="text-sm font-semibold text-primary">
                                      Total: ₱{(tuitionAmt * (parseInt(tuitionMonths) || 0)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                )}
                                {placementPayType === "installment" && (
                                  <p className="text-xs text-muted-foreground">₱{tuitionAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })} billed each month — remaining months collected via Billing.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2.5 px-3 py-1.5 border-t border-border bg-muted/40">
                        <span className="flex-1 text-sm font-semibold">Total</span>
                        <span className="w-28 text-right text-sm font-semibold pr-0.5">
                          ₱{checkedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Payment Method *</label>
                      <Select value={reservePayment.method} onChange={(e) => setReservePayment({ ...reservePayment, method: e.target.value })}>
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="maya">Maya</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Date *</label>
                      <DatePicker value={reservePayment.date} onChange={(v) => setReservePayment({ ...reservePayment, date: v })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">OR Number <span className="text-muted-foreground font-normal">(optional)</span></label>
                      <Input
                        placeholder="e.g. OR-001"
                        value={reservePayment.orNumber}
                        onChange={(e) => setReservePayment({ ...reservePayment, orNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Receipt Photo <span className="text-muted-foreground font-normal">(optional)</span></label>
                      {enrollPayReceiptFile ? (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-xs">
                          <span className="flex-1 truncate">{enrollPayReceiptFile.name}</span>
                          <button onClick={() => setEnrollPayReceiptFile(null)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => setEnrollPayReceiptFile(e.target.files?.[0] ?? null)} />
                          <span>Attach photo</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {reservePaymentError && <ErrorAlert message={reservePaymentError} />}
                  <div className="flex justify-end gap-2 pt-1 border-t border-border">
                    <Button variant="outline" onClick={() => setShowPaymentForm(false)} disabled={reservePaymentSaving}>Cancel</Button>
                    <Button onClick={handleReservationPayment} disabled={reservePaymentSaving || !canSubmit}>
                      {reservePaymentSaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Confirm Payment</>}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-blue-800">Slot reserved for {returningReserved.studentName}</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      A slot has been reserved for {activeYear?.name ?? "the upcoming school year"}.
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-amber-800">Slot is not yet guaranteed</p>
                  </div>
                  <p className="text-xs text-amber-700 pl-6">
                    This reservation does not confirm the student&apos;s enrollment. The slot will only be secured once payment has been received.
                  </p>
                  {slotExpiry && (
                    <p className="text-xs text-amber-700 pl-6 font-medium">
                      This slot will be held until <strong>{slotExpiry}</strong>. Unreserved slots may be released after this date.
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={() => setShowPaymentForm(true)} className="flex-1">
                    Record Payment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setReturningOpen(false); setReturningReserved(null); }}
                    className="flex-1"
                  >
                    Done
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">Full billing and payment history is available in the Billing section.</p>
              </div>
            );
          })()}

          {/* ── Search + results step ── */}
          {!returningReserved && !returningSelected && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search by student name, student code, or parent name…"
                  value={returningSearch}
                  onChange={(e) => setReturningSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {returningSearch.trim().length > 0 && returningSearch.trim().length < 2 && (
                <p className="text-xs text-muted-foreground px-1">Type at least 2 characters to search.</p>
              )}
              {returningSearching && (
                <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Searching…
                </div>
              )}
              {!returningSearching && returningSearch.trim().length >= 2 && returningResults.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No students found. Try a different name or student code.
                </div>
              )}
              {returningResults.length > 0 && (
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                  {returningResults.map((s) => {
                    const statusBadge = (() => {
                      switch (s.derivedStatus) {
                        case "eligible_not_enrolled":  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium"><Check className="w-3 h-3" /> Eligible — ready to enroll</span>;
                        case "already_enrolled":       return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Already enrolled · {s.activeYearClassName}</span>;
                        case "not_eligible_retained":  return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Retained</span>;
                        case "not_eligible_other":     return <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">Not eligible — other</span>;
                        case "graduated":              return <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">Graduated</span>;
                        case "not_continuing":         return <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Not continuing</span>;
                        default:                       return <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">No classification</span>;
                      }
                    })();
                    return (
                      <button
                        key={s.id}
                        onClick={() => selectReturning(s)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {s.firstName} {s.lastName}
                              {s.preferredName && <span className="text-muted-foreground font-normal"> "{s.preferredName}"</span>}
                            </span>
                            {s.studentCode && <span className="font-mono text-xs text-muted-foreground">{s.studentCode}</span>}
                            {statusBadge}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                            <p>{s.guardianName} · {s.guardianPhone}</p>
                            <p>Last: {s.lastSchoolYearName} · {s.lastClassName}{s.lastClassLevel && s.lastClassLevel !== "—" ? ` (${s.lastClassLevel})` : ""}</p>
                            {s.recommendedNextLevel && <p className="text-primary">→ Recommended next: {s.recommendedNextLevel}</p>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </button>
                    );
                  })}
                </div>
              )}
              {!returningSearching && returningSearch.trim().length === 0 && (
                returningPreloaded.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground px-1">
                      Showing eligible students ready to enroll — search by name or parent name to see all students.
                    </p>
                    <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                      {returningPreloaded.map((s) => {
                        const statusBadge = (() => {
                          switch (s.derivedStatus) {
                            case "eligible_not_enrolled":  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium"><Check className="w-3 h-3" /> Eligible — ready to enroll</span>;
                            case "already_enrolled":       return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Already enrolled · {s.activeYearClassName}</span>;
                            case "not_eligible_retained":  return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Retained</span>;
                            case "not_eligible_other":     return <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">Not eligible — other</span>;
                            case "graduated":              return <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">Graduated</span>;
                            case "not_continuing":         return <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Not continuing</span>;
                            default:                       return <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">No classification</span>;
                          }
                        })();
                        return (
                          <button
                            key={s.id}
                            onClick={() => selectReturning(s)}
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {s.firstName} {s.lastName}
                                  {s.preferredName && <span className="text-muted-foreground font-normal"> "{s.preferredName}"</span>}
                                </span>
                                {s.studentCode && <span className="font-mono text-xs text-muted-foreground">{s.studentCode}</span>}
                                {statusBadge}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                <p>{s.guardianName} · {s.guardianPhone}</p>
                                <p>Last: {s.lastSchoolYearName} · {s.lastClassName}{s.lastClassLevel && s.lastClassLevel !== "—" ? ` (${s.lastClassLevel})` : ""}</p>
                                {s.recommendedNextLevel && <p className="text-primary">→ Recommended next: {s.recommendedNextLevel}</p>}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                          </button>
                        );
                      })}
                      <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">Search above to find more students</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">Search for a student to begin. Results show year-end classification status.</p>
                )
              )}
            </>
          )}

          {/* ── Enrollment confirmation step ── */}
          {!returningReserved && returningSelected && (() => {
            const s = returningSelected;
            const isBlocked = s.derivedStatus === "already_enrolled";
            const needsOverride =
              s.derivedStatus === "not_eligible_retained" ||
              s.derivedStatus === "not_eligible_other" ||
              s.derivedStatus === "graduated" ||
              s.derivedStatus === "not_continuing";
            const canOverride = userRole === "school_admin" || userRole === "super_admin";

            // Retained students may go to same/lower level; all others block downgrade
            const isRetained = s.derivedStatus === "not_eligible_retained";
            const currentRank = levelRank(s.lastClassLevel ?? "");
            const recommendedRank = s.recommendedNextLevel ? levelRank(s.recommendedNextLevel) : currentRank + 1;

            // Levels sorted: recommended first, then by progression order; downgrade levels hidden unless retained
            const sortedLevels = [...uniqueLevels]
              .filter((lvl) => isRetained || levelRank(lvl) > currentRank)
              .sort((a, b) => {
                const aRec = a === s.recommendedNextLevel ? 0 : 1;
                const bRec = b === s.recommendedNextLevel ? 0 : 1;
                return aRec - bRec || levelRank(a) - levelRank(b);
              });

            const isAccelerated = !!returningLevel && !!s.recommendedNextLevel && levelRank(returningLevel) > recommendedRank;

            return (
              <div className="space-y-4">
                <button
                  onClick={() => { setReturningSelected(null); setReturningError(null); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to search
                </button>

                {/* Student info summary */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-1 text-sm">
                  <p className="font-semibold">
                    {s.firstName} {s.lastName}
                    {s.preferredName && <span className="font-normal text-muted-foreground ml-1">"{s.preferredName}"</span>}
                    {s.studentCode && <span className="font-mono text-xs text-muted-foreground ml-2">{s.studentCode}</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">{s.guardianName} · {s.guardianPhone}</p>
                  <p className="text-muted-foreground text-xs">
                    Last enrolled: {s.lastSchoolYearName} · {s.lastClassName}
                    {s.lastClassLevel && s.lastClassLevel !== "—" && (
                      <span className="ml-1 text-muted-foreground">({s.lastClassLevel})</span>
                    )}
                  </p>
                  {s.recommendedNextLevel && (
                    <p className="text-xs text-primary font-medium">→ Recommended next level: {s.recommendedNextLevel}</p>
                  )}
                </div>

                {/* Warn when the saved recommended level has no active class this school year */}
                {s.recommendedNextLevel && !sortedLevels.includes(s.recommendedNextLevel) && !isBlocked && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-semibold">Recommended level not available</p>
                      <p className="text-xs mt-0.5">
                        The promotion path for this student points to <strong>{s.recommendedNextLevel}</strong>, but there are no active classes at that level for {activeYear?.name}. Select a level manually, or create a class for {s.recommendedNextLevel} in the Classes page first.
                      </p>
                    </div>
                  </div>
                )}

                {/* Derived status banners */}
                {s.derivedStatus === "eligible_not_enrolled" && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 space-y-1">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 flex-shrink-0" />
                      <span>This student is <strong>eligible for next level</strong>.</span>
                    </div>
                  </div>
                )}
                {s.derivedStatus === "no_classification" && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    No year-end classification found for this student. You may still proceed with enrollment.
                  </div>
                )}
                {isBlocked && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Already enrolled this year</p>
                      <p className="text-xs mt-0.5">{s.firstName} is already enrolled in <strong>{s.activeYearClassName}</strong> for {activeYear?.name}. Duplicate enrollments are not allowed.</p>
                    </div>
                  </div>
                )}
                {needsOverride && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        {s.derivedStatus === "not_eligible_retained" && "Student is marked as retained"}
                        {s.derivedStatus === "not_eligible_other" && "Student is not eligible — other reason"}
                        {s.derivedStatus === "graduated" && "Student is marked as graduated"}
                        {s.derivedStatus === "not_continuing" && "Student is not continuing"}
                      </p>
                      {canOverride
                        ? <p className="text-xs mt-1">You can override this as school admin. An override reason is required.</p>
                        : <p className="text-xs mt-1">Only a school admin can override this classification to proceed with enrollment.</p>
                      }
                    </div>
                  </div>
                )}

                {/* Override reason (non-eligible, admin only) */}
                {needsOverride && canOverride && !isBlocked && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Override Reason *</label>
                    <Textarea
                      value={returningOverride}
                      onChange={(e) => setReturningOverride(e.target.value)}
                      placeholder="Required — explain why you are enrolling despite the classification…"
                      rows={2}
                    />
                  </div>
                )}

                {/* Level selector — not shown if blocked */}
                {!isBlocked && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Assign to Level *
                      {s.recommendedNextLevel && (
                        <span className="ml-1.5 text-xs font-normal text-primary">— {s.recommendedNextLevel} recommended</span>
                      )}
                    </label>
                    <Select
                      value={returningLevel}
                      onChange={(e) => { setReturningLevel(e.target.value); setAccelConfirmed(false); }}
                    >
                      <option value="">— Select level —</option>
                      {sortedLevels.map((lvl) => {
                        const stats = levelStats[lvl] ?? { capacity: 0, enrolled: 0 };
                        const full = stats.capacity > 0 && stats.enrolled >= stats.capacity;
                        return (
                          <option key={lvl} value={lvl}>
                            {lvl}{lvl === s.recommendedNextLevel ? " ★" : ""} — {stats.enrolled}/{stats.capacity} enrolled{full ? " · Full" : ""}
                          </option>
                        );
                      })}
                    </Select>
                    {returningLevel && (() => {
                      const st = levelStats[returningLevel];
                      if (!st) return null;
                      const full = st.capacity > 0 && st.enrolled >= st.capacity;
                      return full ? (
                        <p className="text-xs text-amber-600 mt-1">This level is at capacity. The student can still be enrolled — assign to a section via Section Placement once space opens.</p>
                      ) : null;
                    })()}
                    {isRetained && (
                      <p className="text-xs text-muted-foreground mt-1">All levels available — student is classified as Retained.</p>
                    )}
                    {isAccelerated && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                          <div>
                            <p className="font-semibold">Accelerated placement — level skipped</p>
                            <p className="text-xs mt-0.5">
                              The recommended next level is <strong>{s.recommendedNextLevel}</strong>, but you are assigning to <strong>{returningLevel}</strong>.
                              This skips a level. Are you sure this is correct?
                            </p>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={accelConfirmed}
                            onChange={(e) => setAccelConfirmed(e.target.checked)}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <span className="text-xs font-medium">Yes, I confirm this accelerated placement</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Reference / Notes */}
                <div>
                  <label className="block text-sm font-medium mb-1">Reference / Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Textarea
                    value={enrollmentNotes}
                    onChange={(e) => setEnrollmentNotes(e.target.value)}
                    placeholder="e.g. Early bird registrant · referred by John Smith · scholarship applicant…"
                    rows={2}
                  />
                </div>

                {returningError && <ErrorAlert message={returningError} />}

                <div className="flex justify-end gap-2 pt-1 border-t border-border">
                  <Button variant="outline" onClick={() => { setReturningSelected(null); setReturningError(null); setEnrollmentNotes(""); }}>Back</Button>
                  {!isBlocked && !(needsOverride && !canOverride) && (
                    <Button
                      onClick={handleReturningEnroll}
                      disabled={returningSaving || !returningLevel || (needsOverride && canOverride && !returningOverride.trim()) || (isAccelerated && !accelConfirmed)}
                    >
                      {returningSaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Reserving…</> : <><Check className="w-4 h-4" /> Reserve Slot</>}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* Placement Payment Modal */}
      {(() => {
        const pp = pendingPlacements.find((p) => p.enrollmentId === placementPayRow);
        const months = parseInt(tuitionMonths) || 1;
        const ppTotal = feeTypes
          .filter((ft) => enrollPayChecked[ft.id])
          .reduce((sum, ft) => {
            const v = parseFloat(itemizedAmounts[ft.id] ?? "");
            if (isNaN(v)) return sum;
            const isTuition = ft.name.toLowerCase().includes("tuition");
            return sum + (isTuition && placementPayType === "full" ? v * months : v);
          }, 0);
        const tuitionFt = feeTypes.find((ft) => ft.name.toLowerCase().includes("tuition") && enrollPayChecked[ft.id]);
        const tuitionAmt = tuitionFt ? (parseFloat(itemizedAmounts[tuitionFt.id] ?? "0") || 0) : 0;
        const tuitionFullOk = placementPayType === "installment" || !tuitionFt || tuitionAmt === 0 || months >= 1;
        const ppCanSubmit = ppTotal > 0 && !!placementPayForm.date && tuitionFullOk;
        return (
          <Modal
            open={!!placementPayRow}
            onClose={() => { setPlacementPayRow(null); setPlacementPayError(null); setPlacementPayType("installment"); setTuitionMonths("10"); }}
            title={pp ? `Record Payment — ${pp.studentName}` : "Record Payment"}
            className="max-w-lg"
          >
            {pp && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-2.5 bg-muted rounded-lg text-sm">
                  <div><span className="text-muted-foreground">Student: </span><strong>{pp.studentName}</strong></div>
                  <div className="text-muted-foreground">·</div>
                  <div><span className="text-muted-foreground">Level: </span>{pp.level}</div>
                </div>

                {/* Fee breakdown */}
                {feeTypes.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No fee types defined. Add fee types in <strong>Billing → Setup → Fee Types</strong> first.
                  </p>
                ) : (
                  <div>
                    {(() => {
                      const optional = feeTypes.filter((ft) => !ft.isEnrollmentMandatory);
                      const allOptChecked = optional.length > 0 && optional.every((ft) => enrollPayChecked[ft.id]);
                      return optional.length > 0 ? (
                        <div className="flex justify-start mb-1">
                          <button
                            type="button"
                            onClick={toggleAllEnrollFees}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            {allOptChecked ? "Unselect optional" : "Select all"}
                          </button>
                        </div>
                      ) : null;
                    })()}
                  <div className="border border-border rounded-lg overflow-hidden">
                    {feeTypes.map((ft, i) => {
                      const isTuition = ft.name.toLowerCase().includes("tuition");
                      const tuitionAmt = parseFloat(itemizedAmounts[ft.id] ?? "0") || 0;
                      return (
                        <div key={ft.id}>
                          <div className={`flex items-center gap-2.5 px-3 py-1.5 ${i > 0 ? "border-t border-border" : ""}`}>
                            <input
                              type="checkbox"
                              id={`pp-${ft.id}`}
                              checked={!!enrollPayChecked[ft.id]}
                              disabled={ft.isEnrollmentMandatory}
                              onChange={(e) => setEnrollPayChecked((prev) => ({ ...prev, [ft.id]: e.target.checked }))}
                              className="w-4 h-4 accent-primary flex-shrink-0"
                            />
                            <label
                              htmlFor={`pp-${ft.id}`}
                              className={`flex-1 text-sm min-w-0 cursor-pointer ${ft.isEnrollmentMandatory ? "font-medium" : "text-muted-foreground"}`}
                            >
                              {ft.name}
                              {ft.isEnrollmentMandatory && <span className="ml-1.5 text-xs text-muted-foreground font-normal">required</span>}
                            </label>
                            <div className="relative flex-shrink-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₱</span>
                              <Input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                value={itemizedAmounts[ft.id] ?? ""}
                                onChange={(e) => setItemizedAmounts({ ...itemizedAmounts, [ft.id]: e.target.value })}
                                className="w-28 text-right pl-6 h-8 text-sm"
                                disabled={!enrollPayChecked[ft.id]}
                              />
                            </div>
                          </div>
                          {isTuition && enrollPayChecked[ft.id] && tuitionAmt > 0 && (
                            <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Tuition payment type</p>
                              <div className="flex gap-2">
                                {([
                                  { value: "full" as const, label: "Full Payment", sub: "Pay full year upfront" },
                                  { value: "installment" as const, label: "Monthly", sub: "Pay per month" },
                                ]).map(({ value, label, sub }) => (
                                  <button key={value} type="button"
                                    onClick={() => setPlacementPayType(value)}
                                    className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors flex-1 ${placementPayType === value ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:bg-muted"}`}>
                                    <span className="text-xs font-medium">{label}</span>
                                    <span className={`text-xs mt-0.5 ${placementPayType === value ? "text-primary/70" : "text-muted-foreground"}`}>{sub}</span>
                                  </button>
                                ))}
                              </div>
                              {placementPayType === "full" && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">₱{tuitionAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ×</span>
                                    <Input
                                      type="number" min="1" max="24" step="1"
                                      value={tuitionMonths}
                                      onChange={(e) => setTuitionMonths(e.target.value)}
                                      className="w-16 h-7 text-xs text-center px-2"
                                    />
                                    <span className="text-xs text-muted-foreground">months</span>
                                  </div>
                                  <p className="text-sm font-semibold text-primary">
                                    Total: ₱{(tuitionAmt * (parseInt(tuitionMonths) || 0)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              )}
                              {placementPayType === "installment" && (
                                <p className="text-xs text-muted-foreground">₱{tuitionAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })} billed each month — remaining months collected via Billing.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2.5 px-3 py-1.5 border-t border-border bg-muted/40">
                      <span className="flex-1 text-sm font-semibold">Total</span>
                      <span className="w-28 text-right text-sm font-semibold pr-0.5">
                        ₱{ppTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Payment Method</label>
                    <Select value={placementPayForm.method} onChange={(e) => setPlacementPayForm((prev) => ({ ...prev, method: e.target.value }))}>
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                      <option value="maya">Maya</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Date *</label>
                    <DatePicker value={placementPayForm.date} onChange={(v) => setPlacementPayForm((prev) => ({ ...prev, date: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">OR # <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input
                      placeholder="Official receipt number"
                      value={placementPayForm.orNumber}
                      onChange={(e) => setPlacementPayForm((prev) => ({ ...prev, orNumber: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Receipt Photo <span className="text-muted-foreground font-normal">(optional)</span></label>
                    {placementPayForm.receiptFile ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-xs">
                        <span className="flex-1 truncate">{placementPayForm.receiptFile.name}</span>
                        <button onClick={() => setPlacementPayForm((prev) => ({ ...prev, receiptFile: null }))} className="text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPlacementPayForm((prev) => ({ ...prev, receiptFile: e.target.files?.[0] ?? null }))} />
                        <span>Attach photo</span>
                      </label>
                    )}
                  </div>
                </div>

                {placementPayError && <ErrorAlert message={placementPayError} />}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => { setPlacementPayRow(null); setPlacementPayError(null); setPlacementPayType("installment"); setTuitionMonths("10"); }}>Cancel</Button>
                  <Button onClick={() => handlePlacementPayment(pp.enrollmentId, pp.studentId, pp.studentName)} disabled={placementPaySaving || !ppCanSubmit}>
                    {placementPaySaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Confirm Payment</>}
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Enroll New Student — Inquiry Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); setFormError(null); }} title="Enroll New Student — Log Inquiry">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Child Name *</label>
              <Input value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} placeholder="Child's full name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Parent / Guardian *</label>
              <Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} placeholder="Parent name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Contact Number</label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="09XXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="parent@email.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Desired Class</label>
              <Select value={form.desiredClassId} onChange={(e) => setForm({ ...form, desiredClassId: e.target.value })}>
                <option value="">— Not specified —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""}{c.level ? ` (${c.level})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Inquiry Source</label>
              <Select value={form.inquirySource} onChange={(e) => setForm({ ...form, inquirySource: e.target.value })}>
                <option value="">Select...</option>
                <option>Facebook</option>
                <option>Instagram</option>
                <option>Referral</option>
                <option>Walk-in</option>
                <option>Flyer</option>
                <option>Other</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Next Follow Up</label>
            <DatePicker value={form.nextFollowUp} onChange={(v) => setForm({ ...form, nextFollowUp: v })} placeholder="Pick a date" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={saving || !form.childName || !form.parentName}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background text-sm font-medium px-5 py-3 rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 flex-shrink-0 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
