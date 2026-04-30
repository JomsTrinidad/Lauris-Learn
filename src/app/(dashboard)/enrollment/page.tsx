"use client";
import { useEffect, useState, useRef } from "react";
import {
  Plus, ArrowRight, Search, TrendingUp, Pencil,
  X, BookOpen, HelpCircle, AlertTriangle, ChevronDown, ChevronRight, UserCheck, Tag,
  RefreshCw, Check, Users,
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
  const [convertClassId, setConvertClassId] = useState("");
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
  const [returningClassId, setReturningClassId] = useState("");
  const [returningOverride, setReturningOverride] = useState("");
  const [returningSaving, setReturningSaving] = useState(false);
  const [returningError, setReturningError] = useState<string | null>(null);
  const [returningReserved, setReturningReserved] = useState<{ studentId: string; studentName: string; classId: string } | null>(null);
  const [returningPreloaded, setReturningPreloaded] = useState<ReturnStudent[]>([]);
  const [enrollmentNotes, setEnrollmentNotes] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"simple" | "itemized">("simple");
  const [reservePayment, setReservePayment] = useState({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
  const [itemizedAmounts, setItemizedAmounts] = useState<Record<string, string>>({});
  const [feeTypes, setFeeTypes] = useState<{ id: string; name: string; defaultAmount: number | null }[]>([]);
  const [reservePaymentSaving, setReservePaymentSaving] = useState(false);
  const [reservePaymentError, setReservePaymentError] = useState<string | null>(null);
  const [reservePaymentDone, setReservePaymentDone] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadInquiries(), loadClasses()]);
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
    const { data } = await supabase
      .from("classes")
      .select("id, name, level, start_time, capacity")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("name");

    const ids = (data ?? []).map((c) => c.id);
    let enrolledByClass: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: eRows } = await supabase.from("enrollments").select("class_id").in("class_id", ids).eq("status", "enrolled");
      (eRows ?? []).forEach((e) => { enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1; });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setClassOptions((data ?? []).map((c: any) => ({ id: c.id, name: c.name, level: c.level ?? "", startTime: c.start_time ?? null, capacity: c.capacity ?? 0, enrolled: enrolledByClass[c.id] ?? 0 })));
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
      setConvertClassId(inquiry.desiredClassId ?? "");
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

    // Create enrollment
    if (convertClassId) {
      await supabase.from("enrollments").insert({
        student_id: student.id,
        class_id: convertClassId,
        school_year_id: activeYear.id,
        status: "enrolled",
      });
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
    const recommendedNextLevel: string | null = displayEnroll?.classes?.next_class?.level ?? null;
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
            classes(name, level, next_class:classes!next_class_id(level)),
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
            classes(name, level, next_class:classes!next_class_id(level)),
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
          classes(name, level, next_class:classes!next_class_id(level)),
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
    setReturningClassId("");
    setReturningOverride("");
    setReturningError(null);
    setReturningReserved(null);
    setEnrollmentNotes("");
    setShowPaymentForm(false);
    setPaymentMode("simple");
    setReservePayment({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
    setReservePaymentDone(false);
    setReservePaymentError(null);
  }

  function selectReturning(student: ReturnStudent) {
    setReturningSelected(student);
    setReturningError(null);
    setReturningOverride("");
    // Default class: first class whose level matches the recommended next level
    const match = classOptions.find((c) => student.recommendedNextLevel && c.level === student.recommendedNextLevel);
    setReturningClassId(match?.id ?? "");
  }

  async function handleReturningEnroll() {
    if (!returningSelected || !activeYear?.id) return;
    if (!returningClassId) { setReturningError("Please select a class."); return; }

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
        classId: returningClassId,
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

    setReturningReserved({
      studentId: returningSelected.id,
      studentName: `${returningSelected.firstName} ${returningSelected.lastName}`,
      classId: returningClassId,
    });
    setShowPaymentForm(false);
    setReservePayment({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], orNumber: "" });
    setReservePaymentError(null);
    setReservePaymentDone(false);
    setReturningSaving(false);
    await loadAll();
  }

  async function loadFeeTypes() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("fee_types")
      .select("id, name, default_amount")
      .eq("school_id", schoolId!)
      .eq("is_active", true)
      .order("name");
    const items = (data ?? []).map((ft: { id: string; name: string; default_amount: number | null }) => ({
      id: ft.id, name: ft.name, defaultAmount: ft.default_amount ?? null,
    }));
    setFeeTypes(items);
    const init: Record<string, string> = {};
    items.forEach((ft: { id: string; defaultAmount: number | null }) => {
      init[ft.id] = ft.defaultAmount != null ? ft.defaultAmount.toString() : "";
    });
    setItemizedAmounts(init);
  }

  async function handleReservationPayment() {
    if (!returningReserved || !activeYear?.id || !schoolId) return;
    setReservePaymentSaving(true);
    setReservePaymentError(null);

    const currentMonth = new Date().toISOString().substring(0, 7) + "-01";
    const notes = enrollmentNotes.trim() || null;

    try {
      if (paymentMode === "itemized") {
        const items = feeTypes.filter((ft) => {
          const a = parseFloat(itemizedAmounts[ft.id] ?? "");
          return !isNaN(a) && a > 0;
        });
        if (items.length === 0) {
          setReservePaymentError("Please enter an amount for at least one fee type.");
          setReservePaymentSaving(false);
          return;
        }
        for (const ft of items) {
          const amt = parseFloat(itemizedAmounts[ft.id]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: br, error: brErr } = await (supabase as any)
            .from("billing_records")
            .insert({
              school_id: schoolId,
              student_id: returningReserved.studentId,
              class_id: returningReserved.classId,
              school_year_id: activeYear.id,
              billing_month: currentMonth,
              amount_due: amt,
              status: "paid",
              description: ft.name,
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
              amount: amt,
              payment_method: reservePayment.method,
              payment_date: reservePayment.date,
              or_number: reservePayment.orNumber || null,
              status: "confirmed",
              recorded_by: userId ?? null,
            });
          if (payErr) throw new Error(payErr.message);
        }
      } else {
        const amt = parseFloat(reservePayment.amount);
        if (isNaN(amt) || amt <= 0) {
          setReservePaymentError("Please enter a valid amount.");
          setReservePaymentSaving(false);
          return;
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
            amount_due: amt,
            status: "paid",
            description: "Registration / Reservation Fee",
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
            amount: amt,
            payment_method: reservePayment.method,
            payment_date: reservePayment.date,
            or_number: reservePayment.orNumber || null,
            status: "confirmed",
            recorded_by: userId ?? null,
          });
        if (payErr) throw new Error(payErr.message);
      }

      setReservePaymentDone(true);
    } catch (err: unknown) {
      setReservePaymentError(err instanceof Error ? err.message : "Payment recording failed.");
    }
    setReservePaymentSaving(false);
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
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={openFork}>
            <Plus className="w-4 h-4" /> Start Enrollment
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Pipeline summary */}
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
      </div>

      {/* Pipeline View */}
      {view === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PIPELINE.filter((s) => s.status !== "not_proceeding").map((stage) => {
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
                        <div className="flex gap-2">
                          {STATUS_FLOW[inquiry.status] && (
                            <button
                              onClick={() => advanceStatus(inquiry)}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
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
                {filtered.map((i) => (
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
              <label className="block text-sm font-medium mb-1">Assign to Class *</label>
              <Select value={convertClassId} onChange={(e) => setConvertClassId(e.target.value)}>
                <option value="">— No class yet —</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""}{c.level ? ` (${c.level})` : ""} — {c.enrolled}/{c.capacity} enrolled
                  </option>
                ))}
              </Select>
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
                    id: "add-inquiry",
                    icon: Plus,
                    title: "Log a new inquiry",
                    searchText: "add inquiry new log walk-in facebook referral source parent child",
                    body: (
                      <div className="space-y-2">
                        <p>Do this the moment a parent expresses interest — by phone, walk-in, social media message, or referral.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Inquiry</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter the <strong>child's name</strong> and <strong>parent/guardian name</strong> — these are required.</span>} />
                          <Step n={3} text={<span>Add a <strong>contact number</strong> or email so you can follow up later.</span>} />
                          <Step n={4} text={<span>Select the <strong>desired class</strong> if the parent has a preference. This feeds into the Analytics view's class demand table.</span>} />
                          <Step n={5} text={<span>Select the <strong>inquiry source</strong> (Facebook, Referral, Walk-in, etc.). This powers the source breakdown in Analytics — fill it in consistently for useful data.</span>} />
                          <Step n={6} text={<span>Set a <strong>follow-up date</strong> if you agreed to call them back on a specific day.</span>} />
                          <Step n={7} text={<span>Click <strong>Save Inquiry</strong>. The card appears in the Inquiry column of the pipeline.</span>} />
                        </div>
                        <Note>You don't need all details upfront. You can log just name + contact now and fill in the rest later by clicking <strong>Details</strong> on the card.</Note>
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
                    title: "Formally enroll a student",
                    searchText: "enroll student convert confirm enrollment class assign create student record",
                    body: (
                      <div className="space-y-2">
                        <p>When a parent confirms and you're ready to create the student's official record, use the Enroll action — don't create the student manually in the Students page.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Find the inquiry at the <strong>Offered Slot</strong> stage and click <strong>Enroll Student →</strong>.</span>} />
                          <Step n={2} text={<span>A confirmation modal opens. Optionally enter the child's <strong>date of birth</strong> and <strong>gender</strong> now (you can add more details from the Students page later).</span>} />
                          <Step n={3} text={<span>Select the <strong>class</strong> to assign the student to. The dropdown shows current enrolment vs. capacity so you can see which classes have seats.</span>} />
                          <Step n={4} text={<span>Click <strong>Confirm Enrollment</strong>. The system automatically creates: a student record, a guardian record using the parent info from the inquiry, and an enrollment linking the student to the class.</span>} />
                        </div>
                        <Note>After enrollment, go to <strong>Students</strong> to add the full student profile (address, additional guardians, medical notes, etc.) and to send the parent portal invite.</Note>
                        <Tip>If you skip assigning a class during enrollment, the student is created without a class. You can assign them from the Students page later, but they won't appear in attendance or billing until enrolled in a class.</Tip>
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
                          <Step n={1} text={<span>Set or update it in the <strong>Add Inquiry</strong> form or the <strong>Details / Edit modal</strong> using the Next Follow Up date picker.</span>} />
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
                    title: "Enroll a returning student",
                    searchText: "returning student re-enroll eligible classification year-end existing",
                    body: (
                      <div className="space-y-2">
                        <p>Use <strong>Enroll Returning Student</strong> when a student from a previous year is coming back — this reuses their existing profile and avoids creating a duplicate.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Start Enrollment</strong> → <strong>Enroll Returning Student</strong>.</span>} />
                          <Step n={2} text={<span>Search by student name, nickname, student code, or parent name. Results appear after 2 characters.</span>} />
                          <Step n={3} text={<span>Students tagged as <strong>Eligible — ready to enroll</strong> (green) are cleared from Year-End Classification. These are your primary targets.</span>} />
                          <Step n={4} text={<span>Select a student to proceed. The class selector defaults to classes matching the <strong>recommended next level</strong> but you can choose any class.</span>} />
                          <Step n={5} text={<span>Click <strong>Reserve Slot</strong>. The slot is reserved but not confirmed until payment is made. Use <strong>Record Payment</strong> in the next screen to collect a registration fee and secure the slot.</span>} />
                        </div>
                        <Tip>Students with non-eligible classifications (Retained, Graduated, etc.) show a warning and require an override reason from a school admin before enrolling.</Tip>
                        <Note>If a student is <strong>already enrolled</strong> in the active year, enrollment is blocked outright — no override is possible. Check the Students page to view their current enrollment.</Note>
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
                <span>12 topics · click any to expand</span>
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
              <p className="font-semibold text-sm">Add New Inquiry</p>
              <p className="text-xs text-muted-foreground mt-0.5">Log a new inquiry for a child who is not yet in the system.</p>
            </div>
          </button>
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
          setPaymentMode("simple");
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
                  <div className="flex justify-end">
                    <Button onClick={() => { setReturningOpen(false); setReturningReserved(null); setReservePaymentDone(false); }}>
                      Done
                    </Button>
                  </div>
                </div>
              );
            }

            if (showPaymentForm) {
              const itemizedTotal = feeTypes.reduce((sum, ft) => {
                const v = parseFloat(itemizedAmounts[ft.id] ?? "");
                return sum + (isNaN(v) ? 0 : v);
              }, 0);
              const canSubmit = paymentMode === "itemized"
                ? itemizedTotal > 0 && !!reservePayment.date
                : !!reservePayment.amount && !!reservePayment.date;

              return (
                <div className="space-y-4">
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back
                  </button>
                  <p className="text-sm font-medium">Record initial payment for <strong>{returningReserved.studentName}</strong></p>

                  {/* Payment mode toggle */}
                  <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => setPaymentMode("simple")}
                      className={`flex-1 py-2 transition-colors ${paymentMode === "simple" ? "bg-primary text-white font-medium" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                    >
                      Single payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode("itemized")}
                      className={`flex-1 py-2 transition-colors ${paymentMode === "itemized" ? "bg-primary text-white font-medium" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                    >
                      Itemize by fee type
                    </button>
                  </div>

                  {/* Simple mode: single amount */}
                  {paymentMode === "simple" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Amount *</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={reservePayment.amount}
                        onChange={(e) => setReservePayment({ ...reservePayment, amount: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Itemized mode: per fee type */}
                  {paymentMode === "itemized" && (
                    <div className="space-y-2">
                      {feeTypes.length === 0 ? (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          No fee types defined yet. Add fee types in Billing → Setup → Fee Types, or use Single Payment instead.
                        </p>
                      ) : (
                        <>
                          <div className="border border-border rounded-lg overflow-hidden">
                            {feeTypes.map((ft, i) => (
                              <div key={ft.id} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                                <span className="flex-1 text-sm">{ft.name}</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={itemizedAmounts[ft.id] ?? ""}
                                  onChange={(e) => setItemizedAmounts({ ...itemizedAmounts, [ft.id]: e.target.value })}
                                  className="w-32 text-right"
                                />
                              </div>
                            ))}
                            <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border bg-muted/50">
                              <span className="flex-1 text-sm font-semibold">Total</span>
                              <span className="w-32 text-right text-sm font-semibold">
                                ₱{itemizedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Common fields: method, date, OR# */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Method *</label>
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
                      <label className="block text-sm font-medium mb-1">Date *</label>
                      <DatePicker value={reservePayment.date} onChange={(v) => setReservePayment({ ...reservePayment, date: v })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">OR Number <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input
                      placeholder="e.g. OR-001"
                      value={reservePayment.orNumber}
                      onChange={(e) => setReservePayment({ ...reservePayment, orNumber: e.target.value })}
                    />
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

            // Build sorted class list: recommended level first, then rest
            const sortedClasses = [...classOptions].sort((a, b) => {
              const aMatch = s.recommendedNextLevel && a.level === s.recommendedNextLevel ? 0 : 1;
              const bMatch = s.recommendedNextLevel && b.level === s.recommendedNextLevel ? 0 : 1;
              return aMatch - bMatch || a.name.localeCompare(b.name);
            });

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
                  <p className="text-muted-foreground text-xs">Last enrolled: {s.lastSchoolYearName} · {s.lastClassName}</p>
                  {s.recommendedNextLevel && (
                    <p className="text-xs text-primary font-medium">→ Recommended next level: {s.recommendedNextLevel}</p>
                  )}
                </div>

                {/* Derived status banners */}
                {s.derivedStatus === "eligible_not_enrolled" && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>This student is <strong>eligible for next level</strong>. {s.progressionNotes && `(${s.progressionNotes})`}</span>
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
                      {s.progressionNotes && <p className="text-xs mt-0.5">{s.progressionNotes}</p>}
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

                {/* Class selector — not shown if blocked */}
                {!isBlocked && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Assign to Class *
                      {s.recommendedNextLevel && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">({s.recommendedNextLevel} classes listed first)</span>
                      )}
                    </label>
                    <Select
                      value={returningClassId}
                      onChange={(e) => setReturningClassId(e.target.value)}
                    >
                      <option value="">— Select class —</option>
                      {s.recommendedNextLevel && (
                        <optgroup label={`${s.recommendedNextLevel} (recommended)`}>
                          {sortedClasses.filter((c) => c.level === s.recommendedNextLevel).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""} — {c.enrolled}/{c.capacity} enrolled
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label={s.recommendedNextLevel ? "Other classes" : "All classes"}>
                        {sortedClasses.filter((c) => !s.recommendedNextLevel || c.level !== s.recommendedNextLevel).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""}{c.level ? ` (${c.level})` : ""} — {c.enrolled}/{c.capacity} enrolled
                          </option>
                        ))}
                      </optgroup>
                    </Select>
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
                      disabled={returningSaving || !returningClassId || (needsOverride && canOverride && !returningOverride.trim())}
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

      {/* Add Inquiry Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); setFormError(null); }} title="Add Inquiry">
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
            <Button onClick={handleSave} disabled={saving || !form.childName || !form.parentName}>{saving ? "Saving…" : "Save Inquiry"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
