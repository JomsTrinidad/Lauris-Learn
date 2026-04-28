"use client";
import { useEffect, useState } from "react";
import {
  Search, Plus, Banknote, Pencil, CheckSquare, History,
  Printer, AlertTriangle, Wand2, Check, ImageIcon, HelpCircle,
  ChevronDown, ChevronRight, BookOpen, Tag, FileText, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";
import { MonthPicker } from "@/components/ui/monthpicker";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import { validateUpload, contentTypeFromExt, RECEIPT_MAX_BYTES } from "@/lib/upload-validate";
import { trackUpload } from "@/lib/track-upload";
import {
  type MainTab, type SetupSubTab, type BillingStatus, type PaymentMethod,
  type BillingRecord, type StudentOption, type PaymentRecord, type AllPayment,
  type PaymentForm, type AddForm, type EditForm, type FeeType, type ClassOption, type StatementRow,
} from "@/features/billing/types";
import { EMPTY_PAYMENT, EMPTY_ADD, STATUS_OPTS, EDITABLE_STATUSES, currentYearMonth } from "@/features/billing/constants";
import { formatMonth, computeStatus, getMonthRange, getAgingDays, agingLabel, agingClass, printContent, computeNthWeekday } from "@/features/billing/utils";
import { StudentCombobox } from "@/features/billing/StudentCombobox";
import { SetupFeeTypesTab } from "@/features/billing/SetupFeeTypesTab";
import { SetupTuitionTab } from "@/features/billing/SetupTuitionTab";
import { SetupAdjustmentsTab } from "@/features/billing/SetupAdjustmentsTab";


// ─── BillingPage ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { schoolId, schoolName, activeYear, userId } = useSchoolContext();
  const supabase = createClient();

  // Core data
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [allPayments, setAllPayments] = useState<AllPayment[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Tab state
  const [mainTab, setMainTab] = useState<MainTab>("bills");
  const [setupSubTab, setSetupSubTab] = useState<SetupSubTab>("tuition");

  // Bills tab filters
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Payments tab filters
  const [paymentsSearch, setPaymentsSearch] = useState("");
  const [paymentsMethodFilter, setPaymentsMethodFilter] = useState("");
  const [paymentsDateFrom, setPaymentsDateFrom] = useState("");
  const [paymentsDateTo, setPaymentsDateTo] = useState("");
  const [payBillSelectModal, setPayBillSelectModal] = useState(false);
  const [payBillSearch, setPayBillSearch] = useState("");

  // Payment modal
  const [paymentModal, setPaymentModal] = useState<BillingRecord | null>(null);
  const [payment, setPayment] = useState<PaymentForm>(EMPTY_PAYMENT);
  const [paymentSequenceWarning, setPaymentSequenceWarning] = useState<string | null>(null);
  const [paymentOverrideReason, setPaymentOverrideReason] = useState("");

  // Add record modal
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [addDuplicateWarning, setAddDuplicateWarning] = useState<string | null>(null);
  const [addOverrideReason, setAddOverrideReason] = useState("");

  // Edit record modal
  const [editModal, setEditModal] = useState<BillingRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ description: "", amountDue: "", dueDate: "", billingMonth: "", status: "unpaid", notes: "", changeReason: "" });

  // Bulk confirm
  const [bulkConfirmModal, setBulkConfirmModal] = useState<{ records: BillingRecord[]; total: number } | null>(null);

  // Generate billing modal
  const [genModal, setGenModal] = useState(false);
  const [genMode, setGenMode] = useState<"configs" | "flat">("configs");
  const [genAcademicPeriodId, setGenAcademicPeriodId] = useState("");
  const [genAllPeriods, setGenAllPeriods] = useState<Array<{ id: string; name: string }>>([]);
  const [genMonthFrom, setGenMonthFrom] = useState("");
  const [genMonthTo, setGenMonthTo] = useState("");
  const [genFeeTypeId, setGenFeeTypeId] = useState("");
  const [genDueDate, setGenDueDate] = useState("");
  const [genDueDateMode, setGenDueDateMode] = useState<"none" | "fixed" | "nth-weekday">("none");
  const [genDueDateNth, setGenDueDateNth] = useState(1);
  const [genDueDateWeekday, setGenDueDateWeekday] = useState(5);
  const [genSkipExisting, setGenSkipExisting] = useState(true);
  const [genMarkAsPaid, setGenMarkAsPaid] = useState(false);
  const [genPaymentMethod, setGenPaymentMethod] = useState<PaymentMethod>("cash");
  const [genPaymentDate, setGenPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [genLoading, setGenLoading] = useState(false);
  const [genSaving, setGenSaving] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(null);
  const [genClasses, setGenClasses] = useState<Array<{ classId: string; className: string; level: string; studentCount: number; configRate: number | null; overrideRate: string; include: boolean }>>([]);
  const [genFlatAmount, setGenFlatAmount] = useState("");
  const [genFlatClassIds, setGenFlatClassIds] = useState<string[]>([]);

  // Help drawer
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  // Payment history modal
  const [historyModal, setHistoryModal] = useState<BillingRecord | null>(null);
  const [historyPayments, setHistoryPayments] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Receipt modal
  const [receiptData, setReceiptData] = useState<{ payment: PaymentRecord; record: BillingRecord } | null>(null);

  // Edit payment modal (OR# + receipt photo)
  const [editPaymentModal, setEditPaymentModal] = useState<PaymentRecord | null>(null);
  const [editPaymentRecord, setEditPaymentRecord] = useState<BillingRecord | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState<{ orNumber: string; receiptFile: File | null }>({ orNumber: "", receiptFile: null });
  const [editPaymentSaving, setEditPaymentSaving] = useState(false);
  const [editPaymentError, setEditPaymentError] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  // Statement modal
  const [statementStudentId, setStatementStudentId] = useState<string | null>(null);
  const [statementStudentName, setStatementStudentName] = useState("");
  const [statementData, setStatementData] = useState<StatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadRecords(): Promise<{ list: BillingRecord[]; ids: string[] } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bResult = await (supabase as any)
      .from("billing_records")
      .select("id, student_id, class_id, amount_due, status, due_date, billing_month, description, notes, students(first_name, last_name), classes(name)")
      .eq("school_id", schoolId!)
      .order("billing_month", { ascending: true });
    if (bResult.error) { setError(bResult.error.message); return null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billingRows = (bResult.data ?? []) as any[];
    const ids: string[] = billingRows.map((b: { id: string }) => b.id);
    let paidByRecord: Record<string, number> = {};
    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pResult = await (supabase as any).from("payments").select("billing_record_id, amount").eq("status", "confirmed").in("billing_record_id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pResult.data ?? []) as any[]).forEach((p: { billing_record_id: string; amount: number }) => {
        paidByRecord[p.billing_record_id] = (paidByRecord[p.billing_record_id] ?? 0) + Number(p.amount);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: BillingRecord[] = billingRows.map((b: any) => {
      const amountPaid = paidByRecord[b.id] ?? 0;
      return {
        id: b.id, studentId: b.student_id,
        studentName: b.students ? `${b.students.first_name} ${b.students.last_name}` : "—",
        classId: b.class_id ?? null, className: b.classes?.name ?? "—",
        description: b.description ?? "", dueDate: b.due_date ?? null,
        billingMonth: b.billing_month ? b.billing_month.substring(0, 7) : "", amountDue: Number(b.amount_due), amountPaid,
        status: computeStatus(b.status as BillingStatus, Number(b.amount_due), amountPaid, b.due_date),
        notes: b.notes ?? null,
      };
    });
    setRecords(list);
    return { list, ids };
  }

  async function loadAllPayments(allRecords: BillingRecord[], ids: string[]) {
    if (ids.length === 0) { setAllPayments([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("payments")
      .select("id, billing_record_id, amount, payment_method, payment_date, reference_number, or_number, notes, receipt_photo_path")
      .in("billing_record_id", ids)
      .order("payment_date", { ascending: false });
    const recordMap = new Map(allRecords.map((r) => [r.id, r]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllPayments(((data ?? []) as any[]).map((p: any) => {
      const rec = recordMap.get(p.billing_record_id);
      return {
        id: p.id, billingRecordId: p.billing_record_id,
        studentName: rec?.studentName ?? "—", className: rec?.className ?? "—",
        description: rec?.description ?? "", billingMonth: rec?.billingMonth ?? "",
        amount: Number(p.amount), method: p.payment_method as PaymentMethod,
        date: p.payment_date, reference: p.reference_number ?? null,
        orNumber: p.or_number ?? null, notes: p.notes ?? null,
        receiptPhotoPath: p.receipt_photo_path ?? null,
      };
    }));
  }

  async function refreshData() {
    const result = await loadRecords();
    if (result) await loadAllPayments(result.list, result.ids);
  }

  async function loadStudents() {
    if (!activeYear?.id) { setStudentOptions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any)
      .from("enrollments")
      .select("student_id, class_id, students(first_name, last_name, student_code), classes(name, level)")
      .eq("school_year_id", activeYear.id).eq("status", "enrolled");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStudentOptions(((result.data ?? []) as any[]).map((e: any) => ({
      id: e.student_id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
      studentCode: e.students?.student_code ?? null,
      classId: e.class_id ?? null, className: e.classes?.name ?? "—", level: e.classes?.level ?? "",
    })).sort((a: StudentOption, b: StudentOption) => a.name.localeCompare(b.name)));
  }

  async function loadFeeTypes() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any).from("fee_types").select("id, name, default_amount").eq("school_id", schoolId).eq("is_active", true).order("name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFeeTypes(((result.data ?? []) as any[]).map((f: any) => ({ id: f.id, name: f.name, defaultAmount: f.default_amount ?? null })));
  }

  async function loadClasses() {
    if (!activeYear?.id || !schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("classes").select("id, name, level")
      .eq("school_id", schoolId).eq("school_year_id", activeYear.id).eq("is_active", true).order("name");
    const rows = (data ?? []) as { id: string; name: string; level: string | null }[];
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: enr } = await (supabase as any).from("enrollments").select("class_id").in("class_id", rows.map((r) => r.id)).eq("status", "enrolled");
      const countByClass: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((enr ?? []) as any[]).forEach((e: { class_id: string }) => { countByClass[e.class_id] = (countByClass[e.class_id] ?? 0) + 1; });
      setClassOptions(rows.map((r) => ({ id: r.id, name: r.name, level: r.level ?? "", enrolled: countByClass[r.id] ?? 0 })));
    } else { setClassOptions([]); }
  }

  async function loadAll() {
    setLoading(true); setError(null);
    await Promise.all([loadStudents(), loadFeeTypes(), loadClasses()]);
    const result = await loadRecords();
    if (result) await loadAllPayments(result.list, result.ids);
    setLoading(false);
  }

  async function loadGenConfigs(periodId: string) {
    setGenLoading(true);
    const rateByClassId: Record<string, number> = {};
    const rateByLevel: Record<string, number> = {};
    if (periodId && schoolId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: configs } = await (supabase as any).from("tuition_configs")
        .select("class_id, level, monthly_amount, total_amount, months")
        .eq("school_id", schoolId).eq("academic_period_id", periodId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((configs ?? []) as any[]).forEach((c: any) => {
        const monthly = c.monthly_amount != null ? Number(c.monthly_amount) : c.months > 0 ? Math.round(c.total_amount / c.months) : Number(c.total_amount);
        if (c.class_id) rateByClassId[c.class_id] = monthly;
        if (c.level) rateByLevel[c.level] = monthly;
      });
    }
    const rows = classOptions.filter((c) => c.enrolled > 0).map((c) => {
      const rate = rateByClassId[c.id] ?? (c.level ? (rateByLevel[c.level] ?? null) : null);
      return { classId: c.id, className: c.name, level: c.level ?? "", studentCount: c.enrolled, configRate: rate, overrideRate: rate !== null ? String(rate) : "", include: true };
    });
    setGenClasses(rows);
    setGenFlatClassIds(rows.map((r) => r.classId));
    setGenLoading(false);
  }

  async function openGenModal() {
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    setGenModal(true); setGenMode("configs"); setGenMonthFrom(thisMonth); setGenMonthTo(thisMonth);
    setGenResult(null); setGenError(null); setGenMarkAsPaid(false); setGenSkipExisting(true);
    setGenDueDateMode("none"); setGenDueDate(""); setGenDueDateNth(1); setGenDueDateWeekday(5);
    setGenPaymentDate(new Date().toISOString().split("T")[0]);
    const tuitionType = feeTypes.find((f) => f.name.toLowerCase().includes("tuition"));
    setGenFeeTypeId(tuitionType?.id ?? feeTypes[0]?.id ?? "");
    setGenLoading(true);
    if (activeYear?.id && schoolId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allPeriods } = await (supabase as any).from("academic_periods").select("id, name")
        .eq("school_id", schoolId).eq("school_year_id", activeYear.id).order("start_date");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periods = ((allPeriods ?? []) as any[]).map((p: any) => ({ id: p.id, name: p.name }));
      setGenAllPeriods(periods);
      // Prefer "Regular Term" → any non-summer/non-short → first available
      const best = periods.find((p) => /regular/i.test(p.name))
        ?? periods.find((p) => !/(summer|short)/i.test(p.name))
        ?? periods[0];
      const defaultPeriodId = best?.id ?? "";
      setGenAcademicPeriodId(defaultPeriodId);
      await loadGenConfigs(defaultPeriodId);
    } else {
      setGenLoading(false);
    }
  }

  async function executeGen() {
    if (!schoolId || !activeYear) return;
    if (!genFeeTypeId && feeTypes.length > 0) { setGenError("Select a fee type."); return; }
    if (!genMonthFrom) { setGenError("Select a starting month."); return; }
    if (genMode === "flat") {
      if (!Number(genFlatAmount) || Number(genFlatAmount) <= 0) { setGenError("Enter a valid flat amount."); return; }
      if (genFlatClassIds.length === 0) { setGenError("Select at least one class."); return; }
    } else {
      if (!genClasses.some((c) => c.include && Number(c.overrideRate) > 0)) { setGenError("Select at least one class with a valid amount."); return; }
    }
    setGenSaving(true); setGenError(null);
    function getDueDate(monthStr: string): string | null {
      if (genDueDateMode === "fixed") return genDueDate || null;
      if (genDueDateMode === "nth-weekday") {
        const [y, mo] = monthStr.split("-").map(Number);
        return computeNthWeekday(y, mo - 1, genDueDateNth, genDueDateWeekday) || null;
      }
      return null;
    }
    const months: string[] = [];
    let cur = genMonthFrom;
    const toMonth = genMonthTo || genMonthFrom;
    while (cur <= toMonth) {
      months.push(cur);
      const [y, m] = cur.split("-").map(Number);
      cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      if (months.length > 24) break;
    }
    let totalCreated = 0, totalSkipped = 0;
    const selectedFeeType = feeTypes.find((f) => f.id === genFeeTypeId);
    for (const month of months) {
      const classTargets: Array<{ classId: string; amount: number }> =
        genMode === "configs"
          ? genClasses.filter((c) => c.include && Number(c.overrideRate) > 0).map((c) => ({ classId: c.classId, amount: Number(c.overrideRate) }))
          : genFlatClassIds.map((classId) => ({ classId, amount: Number(genFlatAmount) }));
      for (const target of classTargets) {
        // Filter enrollments by academic period when one is selected; fall back to school_year_id for enrollments without a period
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let enrollQ = (supabase as any).from("enrollments").select("student_id")
          .eq("class_id", target.classId).eq("status", "enrolled");
        if (genAcademicPeriodId) {
          enrollQ = enrollQ.or(`academic_period_id.eq.${genAcademicPeriodId},academic_period_id.is.null`);
        } else {
          enrollQ = enrollQ.eq("school_year_id", activeYear.id);
        }
        const { data: enrolls } = await enrollQ;
        const studentIds = ((enrolls ?? []) as { student_id: string }[]).map((e) => e.student_id);
        if (studentIds.length === 0) continue;
        let existingStudentIds = new Set<string>();
        if (genSkipExisting) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let existQ = (supabase as any).from("billing_records").select("student_id")
            .eq("school_id", schoolId).eq("class_id", target.classId).eq("billing_month", month + "-01").in("student_id", studentIds);
          if (genFeeTypeId) existQ = existQ.eq("fee_type_id", genFeeTypeId);
          const { data: existing } = await existQ;
          existingStudentIds = new Set(((existing ?? []) as { student_id: string }[]).map((e) => e.student_id));
        }
        const description = selectedFeeType ? `${selectedFeeType.name} — ${formatMonth(month + "-01")}` : `Tuition — ${formatMonth(month + "-01")}`;
        for (const studentId of studentIds) {
          if (existingStudentIds.has(studentId)) { totalSkipped++; continue; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: inserted, error: insErr } = await (supabase as any).from("billing_records").insert({
            school_id: schoolId, student_id: studentId, class_id: target.classId,
            school_year_id: activeYear.id, fee_type_id: genFeeTypeId || null,
            amount_due: target.amount, billing_month: month + "-01", due_date: getDueDate(month),
            description, status: genMarkAsPaid ? "paid" : "unpaid",
          }).select("id").single();
          if (insErr) { setGenError(insErr.message); setGenSaving(false); return; }
          totalCreated++;
          if (genMarkAsPaid && inserted?.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("payments").insert({
              billing_record_id: inserted.id, amount: target.amount, payment_method: genPaymentMethod,
              payment_date: genPaymentDate, status: "confirmed", recorded_by: userId || null,
            });
          }
        }
      }
    }
    setGenResult({ created: totalCreated, skipped: totalSkipped });
    setGenSaving(false);
    if (totalCreated > 0) refreshData();
  }

  async function openPaymentModal(record: BillingRecord) {
    setPaymentModal(record); setPayment(EMPTY_PAYMENT); setFormError(null);
    setPaymentSequenceWarning(null); setPaymentOverrideReason("");
    if (!record.billingMonth || !schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: earlier } = await (supabase as any).from("billing_records")
      .select("billing_month").eq("school_id", schoolId).eq("student_id", record.studentId)
      .in("status", ["unpaid", "overdue"]).lt("billing_month", record.billingMonth + "-01");
    const rows = (earlier ?? []) as { billing_month: string }[];
    if (rows.length > 0) {
      const labels = rows.slice(0, 3).map((r) => formatMonth(r.billing_month)).join(", ");
      const extra = rows.length > 3 ? ` (+${rows.length - 3} more)` : "";
      setPaymentSequenceWarning(`This student has ${rows.length} unpaid earlier month${rows.length > 1 ? "s" : ""}: ${labels}${extra}. Settling earlier months first is recommended.`);
    }
  }

  async function handlePayment() {
    if (!paymentModal || !payment.amount) return;
    const amount = parseFloat(payment.amount);
    if (!amount || amount <= 0) { setFormError("Enter a valid payment amount greater than zero."); return; }
    const balance = paymentModal.amountDue - paymentModal.amountPaid;
    if (amount > balance + 0.01) { setFormError(`Payment of ${formatCurrency(amount)} exceeds the remaining balance of ${formatCurrency(balance)}.`); return; }
    if (paymentSequenceWarning && !paymentOverrideReason.trim()) { setFormError("Please provide a reason to proceed despite earlier unpaid months."); return; }
    setSaving(true); setFormError(null);
    const noteParts = [payment.notes.trim(), paymentOverrideReason.trim() ? `Sequence override: ${paymentOverrideReason.trim()}` : ""].filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pResult = await (supabase as any).from("payments").insert({
      billing_record_id: paymentModal.id, amount, payment_method: payment.method,
      reference_number: payment.reference || null, or_number: payment.orNumber || null,
      notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      payment_date: payment.date, status: "confirmed", recorded_by: userId || null,
    }).select("id").single();
    if (pResult.error) { setFormError(pResult.error.message); setSaving(false); return; }
    if (payment.receiptFile && pResult.data?.id) {
      const uploadError = validateUpload(payment.receiptFile, RECEIPT_MAX_BYTES);
      if (uploadError) {
        // Payment is already saved — show the upload error without blocking the payment record
        setFormError(`Payment recorded, but receipt not uploaded: ${uploadError}`);
        setSaving(false);
        setPaymentModal(null);
        setPayment(EMPTY_PAYMENT);
        setPaymentSequenceWarning(null);
        setPaymentOverrideReason("");
        showToast(`Payment of ${formatCurrency(amount)} recorded. To view payment details, go to the Payments tab.`);
        await refreshData();
        return;
      }
      const ext = ("." + (payment.receiptFile.name.split(".").pop() ?? "jpeg")).toLowerCase();
      // School-scoped path keeps receipts separate from class-update photos within the bucket
      const path = `payment-receipts/${schoolId}/${pResult.data.id}${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("updates-media")
        .upload(path, payment.receiptFile, {
          upsert: true,
          contentType: contentTypeFromExt(payment.receiptFile.name),
        });
      if (!uploadErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("payments").update({ receipt_photo_path: path }).eq("id", pResult.data.id);
        await trackUpload(supabase, {
          schoolId, uploadedBy: userId, entityType: "payment_receipt", entityId: pResult.data.id,
          bucket: "updates-media", storagePath: path,
          fileSize: payment.receiptFile!.size, mimeType: contentTypeFromExt(payment.receiptFile!.name),
        });
      }
    }
    const newPaid = paymentModal.amountPaid + amount;
    const newStatus = computeStatus("unpaid", paymentModal.amountDue, newPaid, paymentModal.dueDate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("billing_records").update({ status: newStatus }).eq("id", paymentModal.id);
    setSaving(false); setPaymentModal(null); setPayment(EMPTY_PAYMENT);
    setPaymentSequenceWarning(null); setPaymentOverrideReason("");
    showToast(`Payment of ${formatCurrency(amount)} recorded successfully. To view payment details, go to the Payments tab.`);
    await refreshData();
  }

  async function checkAddDuplicate(studentId: string, billingMonth: string, feeTypeId?: string) {
    setAddDuplicateWarning(null);
    if (!studentId || !billingMonth || !schoolId) return;
    const effectiveFeeTypeId = feeTypeId !== undefined ? feeTypeId : addForm.feeTypeId;
    if (feeTypes.length > 0 && !effectiveFeeTypeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("billing_records").select("id, description, status")
      .eq("school_id", schoolId).eq("student_id", studentId).eq("billing_month", billingMonth + "-01");
    if (feeTypes.length > 0 && effectiveFeeTypeId) q = q.eq("fee_type_id", effectiveFeeTypeId);
    const { data } = await q;
    const active = ((data ?? []) as { id: string; description: string; status: string }[]).filter((r) => r.status !== "cancelled" && r.status !== "waived");
    if (active.length > 0) {
      const ft = feeTypes.find((f) => f.id === effectiveFeeTypeId);
      setAddDuplicateWarning(`A${ft ? ` "${ft.name}"` : ""} billing record already exists for this month: "${active[0].description || "(no description)"}" — status: ${active[0].status}.`);
    }
  }

  async function handleAddRecord() {
    if (!addForm.studentId) { setFormError("Please select a student."); return; }
    if (!addForm.amountDue || parseFloat(addForm.amountDue) <= 0) { setFormError("Enter a valid amount greater than zero."); return; }
    if (!addForm.billingMonth) { setFormError("Please select a billing month."); return; }
    if (feeTypes.length > 0 && !addForm.feeTypeId) { setFormError("Please select a fee type."); return; }
    if (!activeYear?.id) { setFormError("No active school year. Please set one in Settings first."); return; }
    if (addDuplicateWarning && !addOverrideReason.trim()) { setFormError("Enter an override reason to proceed."); return; }
    setSaving(true); setFormError(null);
    const student = studentOptions.find((s) => s.id === addForm.studentId);
    const feeType = feeTypes.find((f) => f.id === addForm.feeTypeId);
    const description = addForm.description.trim() || feeType?.name || null;
    const amount = parseFloat(addForm.amountDue);
    const notesFromOverride = addOverrideReason.trim() ? `Duplicate override: ${addOverrideReason.trim()}` : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rResult = await (supabase as any).from("billing_records").insert({
      school_id: schoolId!, student_id: addForm.studentId, school_year_id: activeYear.id,
      class_id: student?.classId ?? null, amount_due: amount,
      status: addForm.markAsPaid ? "paid" : "unpaid",
      due_date: addForm.dueDate || null, billing_month: addForm.billingMonth + "-01",
      description, notes: notesFromOverride, fee_type_id: addForm.feeTypeId || null,
    }).select("id").single();
    if (rResult.error) { setFormError(rResult.error.message); setSaving(false); return; }
    if (addForm.markAsPaid) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("payments").insert({
        billing_record_id: rResult.data.id, amount, payment_method: addForm.paymentMethod,
        reference_number: addForm.paymentRef || null, payment_date: addForm.paymentDate,
        status: "confirmed", recorded_by: userId || null,
      });
    }
    setSaving(false); setAddModal(false); setAddForm(EMPTY_ADD);
    setAddDuplicateWarning(null); setAddOverrideReason("");
    await refreshData();
  }

  async function handleEditRecord() {
    if (!editModal) return;
    const amount = parseFloat(editForm.amountDue);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount greater than zero."); return; }
    if (!editForm.billingMonth) { setFormError("Billing month is required."); return; }
    const amountChanged = Math.abs(amount - editModal.amountDue) > 0.01;
    const destructiveStatus = (editForm.status === "cancelled" || editForm.status === "waived" || editForm.status === "refunded") && editModal.status !== editForm.status;
    if (amountChanged && editModal.amountPaid > 0 && !editForm.changeReason.trim()) { setFormError(`This record has ${formatCurrency(editModal.amountPaid)} in payments. A change reason is required when modifying the billed amount.`); return; }
    if (destructiveStatus && !editForm.changeReason.trim()) { setFormError(`A reason is required when setting status to "${editForm.status}".`); return; }
    if (editForm.status === "paid" && amount - editModal.amountPaid > 0.01) { setFormError(`Cannot mark as "Paid" — balance of ${formatCurrency(amount - editModal.amountPaid)} remains. Record a payment first.`); return; }
    setSaving(true); setFormError(null);
    const manualStatus = editForm.status === "cancelled" || editForm.status === "refunded" || editForm.status === "waived";
    const newStatus = manualStatus ? editForm.status : computeStatus(editForm.status, amount, editModal.amountPaid, editForm.dueDate || null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      description: editForm.description.trim() || null, amount_due: amount,
      due_date: editForm.dueDate || null, billing_month: editForm.billingMonth + "-01",
      status: newStatus, notes: editForm.notes.trim() || null,
    };
    if (editForm.changeReason.trim()) { updateData.change_reason = editForm.changeReason.trim(); updateData.changed_by = userId || null; updateData.changed_at = new Date().toISOString(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("billing_records").update(updateData).eq("id", editModal.id);
    if (error) { setFormError(error.message); setSaving(false); return; }
    setSaving(false); setEditModal(null);
    await refreshData();
  }

  function initiateBulkMarkPaid() {
    const toUpdate = records.filter((r) => selectedIds.has(r.id) && r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived");
    if (!toUpdate.length) return;
    setBulkConfirmModal({ records: toUpdate, total: toUpdate.reduce((a, r) => a + (r.amountDue - r.amountPaid), 0) });
  }

  async function handleBulkMarkPaid() {
    if (!bulkConfirmModal) return;
    setBulkSaving(true); setBulkConfirmModal(null);
    const today = new Date().toISOString().split("T")[0];
    for (const record of bulkConfirmModal.records) {
      const remaining = record.amountDue - record.amountPaid;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (remaining > 0) await (supabase as any).from("payments").insert({ billing_record_id: record.id, amount: remaining, payment_method: "cash", payment_date: today, status: "confirmed", recorded_by: userId || null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("billing_records").update({ status: "paid", changed_by: userId || null, changed_at: new Date().toISOString(), change_reason: "Bulk mark as paid" }).eq("id", record.id);
    }
    setSelectedIds(new Set()); setBulkSaving(false);
    await refreshData();
  }

  async function openHistoryModal(record: BillingRecord) {
    setHistoryModal(record); setHistoryPayments([]); setHistoryLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("payments")
      .select("id, amount, payment_method, payment_date, reference_number, or_number, notes, status, receipt_photo_path")
      .eq("billing_record_id", record.id).order("payment_date", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHistoryPayments(((data ?? []) as any[]).map((p: any) => ({
      id: p.id, amount: Number(p.amount), method: p.payment_method as PaymentMethod,
      date: p.payment_date, reference: p.reference_number ?? null,
      orNumber: p.or_number ?? null, notes: p.notes ?? null, receiptPhotoPath: p.receipt_photo_path ?? null,
    })));
    setHistoryLoading(false);
  }

  async function openReceiptPhoto(path: string) {
    const { data } = await supabase.storage.from("updates-media").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function openEditPaymentModal(payment: PaymentRecord, record: BillingRecord | null) {
    setEditPaymentModal(payment);
    setEditPaymentRecord(record);
    setEditPaymentForm({ orNumber: payment.orNumber ?? "", receiptFile: null });
    setEditPaymentError(null);
  }

  async function handleEditPayment() {
    if (!editPaymentModal || !schoolId) return;
    setEditPaymentSaving(true); setEditPaymentError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { or_number: editPaymentForm.orNumber.trim() || null };
    if (editPaymentForm.receiptFile) {
      const uploadError = validateUpload(editPaymentForm.receiptFile, RECEIPT_MAX_BYTES);
      if (uploadError) { setEditPaymentError(uploadError); setEditPaymentSaving(false); return; }
      const ext = ("." + (editPaymentForm.receiptFile.name.split(".").pop() ?? "jpeg")).toLowerCase();
      const path = `payment-receipts/${schoolId}/${editPaymentModal.id}${ext}`;
      const { error: uploadErr } = await supabase.storage.from("updates-media").upload(path, editPaymentForm.receiptFile, { upsert: true, contentType: contentTypeFromExt(editPaymentForm.receiptFile.name) });
      if (uploadErr) { setEditPaymentError(uploadErr.message); setEditPaymentSaving(false); return; }
      update.receipt_photo_path = path;
      await trackUpload(supabase, {
        schoolId, uploadedBy: userId, entityType: "payment_receipt", entityId: editPaymentModal.id,
        bucket: "updates-media", storagePath: path,
        fileSize: editPaymentForm.receiptFile.size, mimeType: contentTypeFromExt(editPaymentForm.receiptFile.name),
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("payments").update(update).eq("id", editPaymentModal.id);
    if (error) { setEditPaymentError(error.message); setEditPaymentSaving(false); return; }
    setEditPaymentSaving(false);
    setEditPaymentModal(null);
    // Reopen history modal so the updated row is visible
    if (editPaymentRecord) await openHistoryModal(editPaymentRecord);
    await refreshData();
  }

  async function openStatementModal(studentId: string, studentName: string) {
    setStatementStudentId(studentId); setStatementStudentName(studentName);
    setStatementData([]); setStatementLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recs } = await (supabase as any).from("billing_records")
      .select("id, amount_due, status, due_date, billing_month, description, notes, class_id, classes(name)")
      .eq("school_id", schoolId!).eq("student_id", studentId).order("billing_month", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (recs ?? []) as any[];
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pmts } = await (supabase as any).from("payments")
        .select("id, billing_record_id, amount, payment_method, payment_date, reference_number, or_number")
        .in("billing_record_id", rows.map((r: { id: string }) => r.id)).eq("status", "confirmed");
      const paymentsByRecord: Record<string, PaymentRecord[]> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pmts ?? []) as any[]).forEach((p: any) => {
        if (!paymentsByRecord[p.billing_record_id]) paymentsByRecord[p.billing_record_id] = [];
        paymentsByRecord[p.billing_record_id].push({ id: p.id, amount: Number(p.amount), method: p.payment_method as PaymentMethod, date: p.payment_date, reference: p.reference_number ?? null, orNumber: p.or_number ?? null, notes: null, receiptPhotoPath: null });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setStatementData(rows.map((r: any) => {
        const payments = paymentsByRecord[r.id] ?? [];
        const amountPaid = payments.reduce((a: number, p: PaymentRecord) => a + p.amount, 0);
        return { billingRecord: { id: r.id, studentId, studentName, classId: r.class_id ?? null, className: r.classes?.name ?? "—", description: r.description ?? "", dueDate: r.due_date ?? null, billingMonth: r.billing_month ? r.billing_month.substring(0, 7) : "", amountDue: Number(r.amount_due), amountPaid, status: computeStatus(r.status as BillingStatus, Number(r.amount_due), amountPaid, r.due_date), notes: r.notes ?? null } as BillingRecord, payments };
      }));
    }
    setStatementLoading(false);
  }

  function openEditModal(record: BillingRecord) {
    setEditModal(record);
    setEditForm({ description: record.description, amountDue: String(record.amountDue), dueDate: record.dueDate ?? "", billingMonth: record.billingMonth, status: record.status, notes: record.notes ?? "", changeReason: "" });
    setFormError(null);
  }

  // Derived
  const classNames = Array.from(new Set(records.map((r) => r.className).filter((n) => n !== "—")));
  const SETTLED_STATUSES = new Set<BillingStatus>(["paid", "cancelled", "waived", "refunded"]);
  const filtered = records.filter((r) => {
    if (!showSettled && SETTLED_STATUSES.has(r.status)) return false;
    const matchSearch = !search || r.studentName.toLowerCase().includes(search.toLowerCase());
    const matchClass = !classFilter || r.className === classFilter;
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchMonth = !monthFilter || r.billingMonth === monthFilter;
    return matchSearch && matchClass && matchStatus && matchMonth;
  });
  const selectableFiltered = filtered.filter((r) => r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived");
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((r) => selectedIds.has(r.id));
  const stmtTotalDue = statementData.reduce((a, r) => a + r.billingRecord.amountDue, 0);
  const stmtTotalPaid = statementData.reduce((a, r) => a + r.billingRecord.amountPaid, 0);
  const stmtTotalBalance = stmtTotalDue - stmtTotalPaid;

  const filteredAllPayments = allPayments.filter((p) => {
    const matchSearch = !paymentsSearch || p.studentName.toLowerCase().includes(paymentsSearch.toLowerCase()) || p.description.toLowerCase().includes(paymentsSearch.toLowerCase());
    const matchMethod = !paymentsMethodFilter || p.method === paymentsMethodFilter;
    const matchFrom = !paymentsDateFrom || p.date >= paymentsDateFrom;
    const matchTo = !paymentsDateTo || p.date <= paymentsDateTo;
    return matchSearch && matchMethod && matchFrom && matchTo;
  });

  const unpaidBillsForSelect = records.filter((r) => r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived");
  const filteredBillsForSelect = payBillSearch
    ? unpaidBillsForSelect.filter((r) => r.studentName.toLowerCase().includes(payBillSearch.toLowerCase()) || r.description.toLowerCase().includes(payBillSearch.toLowerCase()))
    : unpaidBillsForSelect;

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); selectableFiltered.forEach((r) => next.delete(r.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); selectableFiltered.forEach((r) => next.add(r.id)); return next; });
    }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Track tuition payments and billing setup</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          {mainTab === "bills" && (
            <>
              <Button variant="outline" onClick={openGenModal}><Wand2 className="w-4 h-4" /> Generate Billing</Button>
              <Button onClick={() => { setAddForm(EMPTY_ADD); setAddDuplicateWarning(null); setAddOverrideReason(""); setFormError(null); setAddModal(true); }}>
                <Plus className="w-4 h-4" /> Add Record
              </Button>
            </>
          )}
          {/* Record Payment is initiated from the Pay button on each bill row */}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Main Tab Bar */}
      <div className="border-b border-border">
        <nav className="flex gap-1">
          {([["bills", "Bills", FileText], ["payments", "Payments", Banknote], ["setup", "Setup", Settings2]] as const).map(([tab, label, Icon]) => (
            <button key={tab} onClick={() => setMainTab(tab as MainTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${mainTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Bills Tab ── */}
      {mainTab === "bills" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground -mt-2">What students owe</p>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search student..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <MonthPicker value={monthFilter} onChange={setMonthFilter} placeholder="All months" className="sm:w-44" />
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-40">
              <option value="">All Classes</option>
              {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-36">
              {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} className="rounded" />
              Show paid/settled
            </label>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button size="sm" onClick={initiateBulkMarkPaid} disabled={bulkSaving}>
                <CheckSquare className="w-3.5 h-3.5" /> Mark as Paid
              </Button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          )}

          {/* Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-4 py-3 text-left w-10">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="rounded" />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Class</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Month</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Due</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Balance</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground text-sm">No billing records found.</td></tr>
                  ) : filtered.map((r) => {
                    const balance = r.amountDue - r.amountPaid;
                    const aging = r.status === "overdue" ? getAgingDays(r.dueDate) : null;
                    const selectable = r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived";
                    return (
                      <tr key={r.id} className={`hover:bg-muted/40 transition-colors ${selectedIds.has(r.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3">
                          {selectable && <input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => setSelectedIds((prev) => { const next = new Set(prev); e.target.checked ? next.add(r.id) : next.delete(r.id); return next; })} className="rounded" />}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openStatementModal(r.studentId, r.studentName)} className="font-medium hover:text-primary hover:underline transition-colors text-left">{r.studentName}</button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.className}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{r.description || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.billingMonth ? formatMonth(r.billingMonth + "-01") : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.amountDue)}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">{balance > 0 && r.status !== "cancelled" && r.status !== "waived" ? formatCurrency(balance) : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={r.status as Parameters<typeof Badge>[0]["variant"]}>{r.status}</Badge>
                            {aging && <span className={agingClass(aging)}>{agingLabel(aging)}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.dueDate ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived" && (
                              <Button size="sm" variant="outline" onClick={() => openPaymentModal(r)}><Banknote className="w-3.5 h-3.5" /> Pay</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openHistoryModal(r)} title="Payment history"><History className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => openEditModal(r)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? "s" : ""}{records.length !== filtered.length ? ` (filtered from ${records.length})` : ""}</p>
          )}
        </div>
      )}

      {/* ── Payments Tab ── */}
      {mainTab === "payments" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground -mt-2">What&apos;s been collected</p>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search student or description..." value={paymentsSearch} onChange={(e) => setPaymentsSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={paymentsMethodFilter} onChange={(e) => setPaymentsMethodFilter(e.target.value)} className="sm:w-40">
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </Select>
            <DatePicker value={paymentsDateFrom} onChange={setPaymentsDateFrom} placeholder="From date" className="sm:w-40" />
            <DatePicker value={paymentsDateTo} onChange={setPaymentsDateTo} placeholder="To date" className="sm:w-40" />
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Month</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Method</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">OR#</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAllPayments.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">No payments found.</td></tr>
                  ) : filteredAllPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{p.description || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.billingMonth ? formatMonth(p.billingMonth + "-01") : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{p.method.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.orNumber || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {p.receiptPhotoPath && (
                            <button onClick={() => openReceiptPhoto(p.receiptPhotoPath!)} className="flex items-center gap-1 text-xs text-primary hover:underline mr-1">
                              <ImageIcon className="w-3.5 h-3.5" /> Photo
                            </button>
                          )}
                          <Button size="sm" variant="ghost" title="Print receipt" onClick={() => {
                            const rec = records.find((r) => r.id === p.billingRecordId) ?? null;
                            if (!rec) return;
                            const pr: PaymentRecord = { id: p.id, amount: p.amount, method: p.method, date: p.date, reference: p.reference, orNumber: p.orNumber, notes: p.notes, receiptPhotoPath: p.receiptPhotoPath };
                            setReceiptData({ payment: pr, record: rec });
                          }}><Printer className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Edit OR# / receipt" onClick={() => {
                            const rec = records.find((r) => r.id === p.billingRecordId) ?? null;
                            const pr: PaymentRecord = { id: p.id, amount: p.amount, method: p.method, date: p.date, reference: p.reference, orNumber: p.orNumber, notes: p.notes, receiptPhotoPath: p.receiptPhotoPath };
                            openEditPaymentModal(pr, rec);
                          }}><Pencil className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {filteredAllPayments.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{filteredAllPayments.length} payment{filteredAllPayments.length !== 1 ? "s" : ""}</span>
              <span className="font-medium text-green-600">Total: {formatCurrency(filteredAllPayments.reduce((a, p) => a + p.amount, 0))}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Setup Tab ── */}
      {mainTab === "setup" && schoolId && (
        <div className="space-y-6">
          {/* Sub-tab bar */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            {([["tuition", "Tuition Rates", BookOpen], ["adjustments", "Adjustments", Tag], ["advanced", "Fee Types", Settings2]] as const).map(([sub, label, Icon]) => (
              <button key={sub} onClick={() => setSetupSubTab(sub as SetupSubTab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${setupSubTab === sub ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
          {setupSubTab === "tuition" && <SetupTuitionTab schoolId={schoolId} />}
          {setupSubTab === "adjustments" && <SetupAdjustmentsTab schoolId={schoolId} />}
          {setupSubTab === "advanced" && <SetupFeeTypesTab schoolId={schoolId} />}
        </div>
      )}

      {/* ── Select Bill to Pay Modal ── */}
      <Modal open={payBillSelectModal} onClose={() => setPayBillSelectModal(false)} title="Select Bill to Pay">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search student or description..." value={payBillSearch} onChange={(e) => setPayBillSearch(e.target.value)} className="pl-9" autoFocus />
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-border border border-border rounded-lg">
            {filteredBillsForSelect.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No unpaid bills found.</p>
            ) : filteredBillsForSelect.map((r) => (
              <button key={r.id} type="button" className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors text-left"
                onClick={() => { setPayBillSelectModal(false); openPaymentModal(r); }}>
                <div>
                  <p className="font-medium text-sm">{r.studentName}</p>
                  <p className="text-xs text-muted-foreground">{r.description || formatMonth(r.billingMonth + "-01")} · {r.className}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-sm font-medium text-red-600">{formatCurrency(r.amountDue - r.amountPaid)}</p>
                  <Badge variant={r.status as Parameters<typeof Badge>[0]["variant"]} className="text-xs">{r.status}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Payment Modal ── */}
      <Modal open={!!paymentModal} onClose={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setPaymentSequenceWarning(null); setPaymentOverrideReason(""); setFormError(null); }} title="Record Payment">
        {paymentModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Student:</span> <strong>{paymentModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Charge:</span> {paymentModal.description || formatMonth(paymentModal.billingMonth + "-01")} — {formatCurrency(paymentModal.amountDue)}</p>
              <p><span className="text-muted-foreground">Balance due:</span> <strong className="text-red-600">{formatCurrency(paymentModal.amountDue - paymentModal.amountPaid)}</strong></p>
            </div>
            {paymentSequenceWarning && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                <p className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{paymentSequenceWarning}</p>
                <div className="mt-2">
                  <label className="block text-xs font-medium mb-1">Reason to proceed *</label>
                  <Input value={paymentOverrideReason} onChange={(e) => setPaymentOverrideReason(e.target.value)} placeholder="e.g. Parent requested to pay current month first" className="text-sm" />
                </div>
              </div>
            )}
            {formError && <ErrorAlert message={formError} />}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (PHP) *</label>
                <Input type="number" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" min="0" step="0.01" />
                {payment.amount && parseFloat(payment.amount) > 0 && parseFloat(payment.amount) < paymentModal.amountDue - paymentModal.amountPaid - 0.01 && (
                  <p className="text-xs text-muted-foreground mt-1">Partial — {formatCurrency(paymentModal.amountDue - paymentModal.amountPaid - parseFloat(payment.amount))} remains after</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Method</label>
                <Select value={payment.method} onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value as PaymentMethod }))}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Date</label>
                <DatePicker value={payment.date} onChange={(v) => setPayment((p) => ({ ...p, date: v }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">OR Number</label>
                <Input value={payment.orNumber} onChange={(e) => setPayment((p) => ({ ...p, orNumber: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Reference / Notes</label>
              <Input value={payment.reference} onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))} placeholder="Transaction ref, check #, etc." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Receipt Photo <span className="text-muted-foreground font-normal">(optional)</span></label>
              <label className="flex items-center gap-2 w-fit cursor-pointer">
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg bg-background hover:bg-muted transition-colors">
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{payment.receiptFile ? payment.receiptFile.name : "Attach photo"}</span>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(e) => setPayment((p) => ({ ...p, receiptFile: e.target.files?.[0] ?? null }))} className="sr-only" />
              </label>
              {payment.receiptFile && (
                <button type="button" onClick={() => setPayment((p) => ({ ...p, receiptFile: null }))} className="mt-1 text-xs text-muted-foreground hover:text-destructive transition-colors">Remove</button>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setPaymentSequenceWarning(null); setPaymentOverrideReason(""); setFormError(null); }}>Cancel</Button>
              <Button onClick={handlePayment} disabled={saving}>{saving ? "Saving…" : "Record Payment"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Record Modal ── */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setAddForm(EMPTY_ADD); setAddDuplicateWarning(null); setAddOverrideReason(""); setFormError(null); }} title="Add Billing Record">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Student *</label>
            <StudentCombobox options={studentOptions} value={addForm.studentId} searchValue={addForm.studentSearch}
              onSearchChange={(v) => setAddForm((f) => ({ ...f, studentSearch: v }))}
              onSelect={(s) => { setAddForm((f) => ({ ...f, studentId: s.id, studentSearch: s.name })); checkAddDuplicate(s.id, addForm.billingMonth); }}
              onClear={() => setAddForm((f) => ({ ...f, studentId: "", studentSearch: "" }))} />
          </div>
          {feeTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Fee Type *</label>
              <Select value={addForm.feeTypeId} onChange={(e) => { const v = e.target.value; setAddForm((f) => ({ ...f, feeTypeId: v, amountDue: feeTypes.find((ft) => ft.id === v)?.defaultAmount?.toString() ?? f.amountDue })); checkAddDuplicate(addForm.studentId, addForm.billingMonth, v); }}>
                <option value="">— Select fee type —</option>
                {feeTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </div>
          )}
          {addDuplicateWarning && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
              <p className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{addDuplicateWarning}</p>
              <div className="mt-2">
                <label className="block text-xs font-medium mb-1">Override reason *</label>
                <Input value={addOverrideReason} onChange={(e) => setAddOverrideReason(e.target.value)} placeholder="e.g. Separate charge for field trip materials" className="text-sm" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <Input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Tuition — May 2025" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount (PHP) *</label>
              <Input type="number" value={addForm.amountDue} onChange={(e) => setAddForm((f) => ({ ...f, amountDue: e.target.value }))} placeholder="0.00" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Billing Month *</label>
              <MonthPicker value={addForm.billingMonth} onChange={(v) => { setAddForm((f) => ({ ...f, billingMonth: v })); checkAddDuplicate(addForm.studentId, v); }} placeholder="Select month" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Due Date</label>
            <DatePicker value={addForm.dueDate} onChange={(v) => setAddForm((f) => ({ ...f, dueDate: v }))} placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer text-sm select-none">
            <input type="checkbox" checked={addForm.markAsPaid} onChange={(e) => setAddForm((f) => ({ ...f, markAsPaid: e.target.checked }))} className="w-4 h-4 rounded" />
            <span>Mark as paid immediately</span>
          </label>
          {addForm.markAsPaid && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Method</label>
                <Select value={addForm.paymentMethod} onChange={(e) => setAddForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Date</label>
                <DatePicker value={addForm.paymentDate} onChange={(v) => setAddForm((f) => ({ ...f, paymentDate: v }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1.5">Reference</label>
                <Input value={addForm.paymentRef} onChange={(e) => setAddForm((f) => ({ ...f, paymentRef: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setAddModal(false); setAddForm(EMPTY_ADD); setAddDuplicateWarning(null); setAddOverrideReason(""); setFormError(null); }}>Cancel</Button>
            <Button onClick={handleAddRecord} disabled={saving}>{saving ? "Saving…" : "Add Record"}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Record Modal ── */}
      <Modal open={!!editModal} onClose={() => { setEditModal(null); setFormError(null); }} title="Edit Billing Record">
        {editModal && (
          <div className="space-y-4">
            {formError && <ErrorAlert message={formError} />}
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><span className="text-muted-foreground">Student:</span> <strong>{editModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Current status:</span> <Badge variant={editModal.status as Parameters<typeof Badge>[0]["variant"]}>{editModal.status}</Badge></p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount Due (PHP) *</label>
                <Input type="number" value={editForm.amountDue} onChange={(e) => setEditForm((f) => ({ ...f, amountDue: e.target.value }))} min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Billing Month *</label>
                <MonthPicker value={editForm.billingMonth} onChange={(v) => setEditForm((f) => ({ ...f, billingMonth: v }))} placeholder="Select month" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Due Date</label>
              <DatePicker value={editForm.dueDate} onChange={(v) => setEditForm((f) => ({ ...f, dueDate: v }))} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Status</label>
              <Select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as BillingStatus }))}>
                {EDITABLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
              {editForm.status === "waived" && <p className="text-xs text-sky-600 mt-1">Waived records are excluded from outstanding balance and revenue totals.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Notes</label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Change Reason <span className="text-muted-foreground font-normal text-xs">(required if amount changed or status is destructive)</span></label>
              <Input value={editForm.changeReason} onChange={(e) => setEditForm((f) => ({ ...f, changeReason: e.target.value }))} placeholder="e.g. Corrected amount per parent agreement" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setEditModal(null); setFormError(null); }}>Cancel</Button>
              <Button onClick={handleEditRecord} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Generate Billing Modal ── */}
      <Modal open={genModal} onClose={() => { setGenModal(false); setGenResult(null); setGenError(null); }} title="Generate Billing">
        <div className="space-y-6">
          {/* Academic Period selector */}
          {genAllPeriods.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold">Academic Period</label>
              <Select value={genAcademicPeriodId} onChange={(e) => { setGenAcademicPeriodId(e.target.value); loadGenConfigs(e.target.value); }}>
                <option value="">— All periods (no filter) —</option>
                {genAllPeriods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Only students enrolled in this period will be billed. Enrollments without a period are always included.</p>
            </div>
          )}

          {/* Section 1: Mode + Month Range */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Billing Mode</p>
            <div className="flex gap-2">
              {([["configs", "Use tuition rates"], ["flat", "Flat amount"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setGenMode(mode)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${genMode === mode ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">From (Month) *</label>
                <MonthPicker value={genMonthFrom} onChange={(v) => { setGenMonthFrom(v); if (genMonthTo && v > genMonthTo) setGenMonthTo(v); }} placeholder="Select month" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">To (Month)</label>
                <MonthPicker value={genMonthTo} onChange={setGenMonthTo} placeholder="Same as From" min={genMonthFrom} />
              </div>
            </div>
          </div>

          {/* Section 2: Class / Amount */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">{genMode === "configs" ? "Classes & Amounts" : "Flat Amount & Classes"}</p>
            {genMode === "configs" && (
              genLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>
              ) : genClasses.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-border rounded-xl text-sm text-muted-foreground">No enrolled students found for the active school year.</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted border-b border-border">
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
                      <div className="col-span-1" /><div className="col-span-4">Class</div><div className="col-span-2">Level</div><div className="col-span-2 text-center">Students</div><div className="col-span-3">Monthly Amount</div>
                    </div>
                  </div>
                  <div className="divide-y divide-border max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                    {genClasses.map((cls) => (
                      <div key={cls.classId} className={`px-4 py-3 ${!cls.include ? "opacity-50" : ""}`}>
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-1 pt-0.5"><input type="checkbox" checked={cls.include} onChange={(e) => setGenClasses((prev) => prev.map((c) => c.classId === cls.classId ? { ...c, include: e.target.checked } : c))} className="rounded" /></div>
                          <div className="col-span-4"><p className="text-sm font-medium">{cls.className}</p></div>
                          <div className="col-span-2"><span className="text-xs text-muted-foreground">{cls.level || "—"}</span></div>
                          <div className="col-span-2 text-center"><span className="text-sm">{cls.studentCount}</span></div>
                          <div className="col-span-3">
                            <Input type="number" min="0" step="0.01" value={cls.overrideRate} onChange={(e) => setGenClasses((prev) => prev.map((c) => c.classId === cls.classId ? { ...c, overrideRate: e.target.value } : c))} disabled={!cls.include} className="h-8 text-sm" placeholder="0.00" />
                            {cls.configRate === null && cls.include && <p className="text-xs text-amber-600 mt-1">No config — enter manually</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {genMode === "flat" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount per student *</label>
                  <Input type="number" min={0} step={100} placeholder="0.00" value={genFlatAmount} onChange={(e) => setGenFlatAmount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Apply to these classes</label>
                  <div className="space-y-2 max-h-44 overflow-y-auto border border-border rounded-lg p-3">
                    {classOptions.length === 0 ? <p className="text-sm text-muted-foreground">No active classes found.</p> : classOptions.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={genFlatClassIds.includes(cls.id)} onChange={(e) => setGenFlatClassIds((prev) => e.target.checked ? [...prev, cls.id] : prev.filter((id) => id !== cls.id))} className="w-4 h-4 rounded" />
                        <span className="font-medium">{cls.name}</span>
                        {cls.level && <span className="text-muted-foreground text-xs">· {cls.level}</span>}
                        <span className="text-muted-foreground text-xs ml-auto">{cls.enrolled} enrolled</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Billing Details */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Billing Details</p>
            {feeTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Fee Type *</label>
                <Select value={genFeeTypeId} onChange={(e) => setGenFeeTypeId(e.target.value)}>
                  <option value="">— Select fee type —</option>
                  {feeTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Due Date</label>
              <div className="flex gap-1.5">
                {(["none", "fixed", "nth-weekday"] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setGenDueDateMode(mode)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${genDueDateMode === mode ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {mode === "none" ? "No due date" : mode === "fixed" ? "Fixed date" : "Nth weekday"}
                  </button>
                ))}
              </div>
              {genDueDateMode === "none" && <p className="text-xs text-muted-foreground">Overdue tracking won&apos;t apply to these bills.</p>}
              {genDueDateMode === "fixed" && (
                <><DatePicker value={genDueDate} onChange={setGenDueDate} placeholder="Select date" /><p className="text-xs text-muted-foreground">All generated bills share this due date.</p></>
              )}
              {genDueDateMode === "nth-weekday" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={String(genDueDateNth)} onChange={(e) => setGenDueDateNth(Number(e.target.value))} className="flex-1">
                      <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="-1">Last</option>
                    </Select>
                    <Select value={String(genDueDateWeekday)} onChange={(e) => setGenDueDateWeekday(Number(e.target.value))} className="flex-1">
                      <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
                    </Select>
                  </div>
                  {genMonthFrom && (() => {
                    const [y, mo] = genMonthFrom.split("-").map(Number);
                    const preview = computeNthWeekday(y, mo - 1, genDueDateNth, genDueDateWeekday);
                    return preview ? <p className="text-xs text-muted-foreground">e.g. {formatMonth(genMonthFrom + "-01")} → due <strong className="text-foreground">{preview}</strong></p> : <p className="text-xs text-amber-600">That weekday doesn&apos;t occur this many times in the month.</p>;
                  })()}
                </div>
              )}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer text-sm select-none">
              <input type="checkbox" checked={genSkipExisting} onChange={(e) => setGenSkipExisting(e.target.checked)} className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />
              <span><span className="font-medium">Skip existing bills for this fee type</span><span className="text-muted-foreground block text-xs mt-0.5">Students who already have a bill for this fee type and month are skipped.</span></span>
            </label>
          </div>

          {/* Section 4: Mark as Paid shortcut */}
          <div className={`border rounded-xl transition-colors ${genMarkAsPaid ? "border-primary/40 bg-primary/5" : "border-border"}`}>
            <label className="flex items-start gap-3 cursor-pointer select-none p-4">
              <input type="checkbox" checked={genMarkAsPaid} onChange={(e) => setGenMarkAsPaid(e.target.checked)} className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />
              <div><p className="text-sm font-medium">Also record payment now</p><p className="text-xs text-muted-foreground mt-0.5">Use only when parents already paid during enrollment or in advance.</p></div>
            </label>
            {genMarkAsPaid && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                <div><label className="block text-sm font-medium mb-1">Payment Method</label>
                  <Select value={genPaymentMethod} onChange={(e) => setGenPaymentMethod(e.target.value as PaymentMethod)}>
                    <option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank Transfer</option><option value="other">Other</option>
                  </Select></div>
                <div><label className="block text-sm font-medium mb-1">Payment Date</label><DatePicker value={genPaymentDate} onChange={setGenPaymentDate} /></div>
              </div>
            )}
          </div>

          {/* Section 5: Preview */}
          {(() => {
            const months = genMonthFrom ? getMonthRange(genMonthFrom, genMonthTo || genMonthFrom) : [];
            let selectedClassesCount = 0, estimatedBills = 0, estimatedTotal = 0;
            if (genMode === "configs") {
              const included = genClasses.filter((c) => c.include && Number(c.overrideRate) > 0);
              selectedClassesCount = included.length;
              estimatedBills = included.reduce((a, c) => a + c.studentCount, 0) * months.length;
              estimatedTotal = included.reduce((a, c) => a + c.studentCount * Number(c.overrideRate), 0) * months.length;
            } else if (Number(genFlatAmount) > 0 && genFlatClassIds.length > 0) {
              selectedClassesCount = genFlatClassIds.length;
              const totalStudents = genFlatClassIds.reduce((a, id) => a + (classOptions.find((c) => c.id === id)?.enrolled ?? 0), 0);
              estimatedBills = totalStudents * months.length;
              estimatedTotal = totalStudents * Number(genFlatAmount) * months.length;
            }
            if (!genMonthFrom || selectedClassesCount === 0) return null;
            const monthLabel = months.length === 1 ? formatMonth(months[0] + "-01") : `${formatMonth(months[0] + "-01")} – ${formatMonth(months[months.length - 1] + "-01")}`;
            return (
              <div className="bg-muted rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Billing period</span><span className="font-medium">{monthLabel}</span>
                  <span className="text-muted-foreground">Classes selected</span><span className="font-medium">{selectedClassesCount} class{selectedClassesCount !== 1 ? "es" : ""}</span>
                  <span className="text-muted-foreground">Bills to create</span><span className="font-medium">up to {estimatedBills} bill{estimatedBills !== 1 ? "s" : ""}</span>
                  {estimatedTotal > 0 && <><span className="text-muted-foreground">Estimated total</span><span className="font-medium">{formatCurrency(estimatedTotal)}</span></>}
                  <span className="text-muted-foreground">Existing bills</span><span className="font-medium">{genSkipExisting ? "Skip duplicates" : "Allow duplicates"}</span>
                  {genMarkAsPaid && <><span className="text-muted-foreground">Payment</span><span className="font-medium text-green-700">Recorded as paid ({genPaymentMethod.replace("_", " ")})</span></>}
                </div>
              </div>
            );
          })()}

          {genError && <ErrorAlert message={genError} />}
          {genResult && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${genResult.created > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-muted text-muted-foreground"}`}>
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{genResult.created > 0 ? <><strong>{genResult.created}</strong> bill{genResult.created !== 1 ? "s" : ""} created{genResult.skipped > 0 ? `, ${genResult.skipped} already existed (skipped)` : ""}.</> : `All ${genResult.skipped} records already existed and were skipped.`}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setGenModal(false); setGenResult(null); setGenError(null); }}>{genResult ? "Close" : "Cancel"}</Button>
            {!genResult && (() => {
              const canGen = genMonthFrom && (genMode === "configs" ? genClasses.some((c) => c.include && Number(c.overrideRate) > 0) : Number(genFlatAmount) > 0 && genFlatClassIds.length > 0);
              return <Button onClick={executeGen} disabled={genSaving || genLoading || !canGen}>{genSaving ? "Creating…" : genMarkAsPaid ? "Create Bills and Record Payment" : "Create Bills"}</Button>;
            })()}
          </div>
        </div>
      </Modal>

      {/* ── Bulk Confirm Modal ── */}
      <Modal open={!!bulkConfirmModal} onClose={() => setBulkConfirmModal(null)} title="Confirm Bulk Mark as Paid">
        {bulkConfirmModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><strong>{bulkConfirmModal.records.length}</strong> record{bulkConfirmModal.records.length > 1 ? "s" : ""} will be marked as Paid.</p>
              <p>Total: <strong className="text-green-600">{formatCurrency(bulkConfirmModal.total)}</strong></p>
              <p className="text-xs text-muted-foreground">Payment method: Cash · Date: {new Date().toLocaleDateString("en-PH")}</p>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-border rounded-lg border border-border text-sm">
              {bulkConfirmModal.records.slice(0, 15).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate text-sm">{r.studentName}</span>
                  <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{r.billingMonth ? formatMonth(r.billingMonth + "-01") : "—"} · {formatCurrency(r.amountDue - r.amountPaid)}</span>
                </div>
              ))}
              {bulkConfirmModal.records.length > 15 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">…and {bulkConfirmModal.records.length - 15} more</div>}
            </div>
            <p className="text-xs text-orange-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />This creates payment records for all selected bills and cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkConfirmModal(null)}>Cancel</Button>
              <Button onClick={handleBulkMarkPaid} disabled={bulkSaving}>{bulkSaving ? "Processing…" : "Confirm Mark as Paid"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Payment History Modal ── */}
      <Modal open={!!historyModal} onClose={() => { setHistoryModal(null); setHistoryPayments([]); }} title="Payment History">
        {historyModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Student:</span> <strong>{historyModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Charge:</span> {historyModal.description || formatMonth(historyModal.billingMonth + "-01")} — {formatCurrency(historyModal.amountDue)}</p>
              <p><span className="text-muted-foreground">Status:</span> <Badge variant={historyModal.status as Parameters<typeof Badge>[0]["variant"]}>{historyModal.status}</Badge></p>
            </div>
            {historyLoading ? <p className="text-sm text-muted-foreground text-center py-4">Loading payments…</p> : historyPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payments recorded for this billing record.</p>
            ) : (
              <div className="space-y-2">
                {historyPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border border-border rounded-lg text-sm">
                    <div>
                      <p className="font-medium">{formatCurrency(p.amount)}</p>
                      <p className="text-muted-foreground text-xs">{p.date} · {p.method.replace("_", " ")}{p.reference ? ` · Ref: ${p.reference}` : ""}</p>
                      {p.orNumber && <p className="text-xs font-mono text-muted-foreground">OR# {p.orNumber}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.receiptPhotoPath && <button onClick={() => openReceiptPhoto(p.receiptPhotoPath!)} className="flex items-center gap-1 text-xs text-primary hover:underline"><ImageIcon className="w-3.5 h-3.5" /> Photo</button>}
                      <Button variant="ghost" size="sm" onClick={() => openEditPaymentModal(p, historyModal)} title="Edit OR# / receipt"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => setReceiptData({ payment: p, record: historyModal })}><Printer className="w-3.5 h-3.5" /> Receipt</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-border text-sm">
              <span className="text-muted-foreground">Total paid: <strong>{formatCurrency(historyModal.amountPaid)}</strong></span>
              <span className="text-muted-foreground">Balance: <strong className={historyModal.amountDue - historyModal.amountPaid > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(historyModal.amountDue - historyModal.amountPaid)}</strong></span>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Receipt Modal ── */}
      <Modal open={!!receiptData} onClose={() => setReceiptData(null)} title="Payment Receipt">
        {receiptData && (
          <div className="space-y-4">
            <div id="receipt-print-content" style={{ display: "none" }}>
              <h1>{schoolName}</h1><h2>Payment Receipt</h2><div className="divider" />
              <div className="meta">
                <div className="meta-block"><p className="label">OR Number</p><p className="value">{receiptData.payment.orNumber || "—"}</p></div>
                <div className="meta-block"><p className="label">Date</p><p className="value">{receiptData.payment.date}</p></div>
                <div className="meta-block"><p className="label">Student</p><p className="value">{receiptData.record.studentName}</p></div>
                <div className="meta-block"><p className="label">Class</p><p className="value">{receiptData.record.className}</p></div>
              </div>
              <div className="divider" />
              <table><thead><tr><th>Description</th><th>Billing Month</th><th className="text-right">Amount</th></tr></thead>
                <tbody><tr><td>{receiptData.record.description || "Tuition Fee"}</td><td>{formatMonth(receiptData.record.billingMonth + "-01")}</td><td className="text-right">{formatCurrency(receiptData.payment.amount)}</td></tr></tbody>
              </table>
              <div className="divider" />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div><p className="label">Payment Method</p><p className="value" style={{ textTransform: "capitalize" }}>{receiptData.payment.method.replace("_", " ")}</p>{receiptData.payment.reference && <p className="label" style={{ marginTop: "4px" }}>Ref: {receiptData.payment.reference}</p>}</div>
                <div style={{ textAlign: "right" }}><p className="label">Amount Paid</p><p style={{ fontSize: "22px", fontWeight: "bold" }}>{formatCurrency(receiptData.payment.amount)}</p></div>
              </div>
              <p className="footer">Thank you for your payment! — {schoolName}</p>
            </div>
            <div className="p-4 border border-border rounded-lg bg-muted/30 text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">OR#:</span> <strong>{receiptData.payment.orNumber || "—"}</strong></div>
                <div><span className="text-muted-foreground">Date:</span> {receiptData.payment.date}</div>
                <div><span className="text-muted-foreground">Student:</span> {receiptData.record.studentName}</div>
                <div><span className="text-muted-foreground">Method:</span> {receiptData.payment.method.replace("_", " ")}</div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-muted-foreground text-xs">{receiptData.record.description || formatMonth(receiptData.record.billingMonth + "-01")}</span>
                <span className="font-semibold">{formatCurrency(receiptData.payment.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReceiptData(null)}>Close</Button>
              <Button onClick={() => printContent("receipt-print-content", `Receipt — ${receiptData.record.studentName}`)}><Printer className="w-4 h-4" /> Print Receipt</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Billing Statement Modal ── */}
      <Modal open={!!statementStudentId} onClose={() => { setStatementStudentId(null); setStatementData([]); }} title={`Statement — ${statementStudentName}`}>
        <div className="space-y-4">
          {statementLoading ? <p className="text-sm text-muted-foreground text-center py-6">Loading statement…</p> : (
            <>
              <div id="statement-print-content" style={{ display: "none" }}>
                <h1>{schoolName}</h1><h2>Billing Statement</h2><div className="divider" />
                <div className="meta">
                  <div className="meta-block"><p className="label">Student</p><p className="value">{statementStudentName}</p></div>
                  <div className="meta-block"><p className="label">School Year</p><p className="value">{activeYear?.name ?? "—"}</p></div>
                </div>
                <div className="divider" />
                {statementData.length === 0 ? <p style={{ color: "#666", textAlign: "center" }}>No billing records for this student.</p> : (
                  <table>
                    <thead><tr><th>Month</th><th>Description</th><th className="text-right">Amount Due</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
                    <tbody>
                      {statementData.map((row) => {
                        const bal = row.billingRecord.amountDue - row.billingRecord.amountPaid;
                        return (
                          <tr key={row.billingRecord.id}>
                            <td style={{ whiteSpace: "nowrap" }}>{row.billingRecord.billingMonth ? formatMonth(row.billingRecord.billingMonth + "-01") : "—"}</td>
                            <td>{row.billingRecord.description || "—"}</td>
                            <td className="text-right">{formatCurrency(row.billingRecord.amountDue)}</td>
                            <td className="text-right" style={{ color: "#16a34a" }}>{formatCurrency(row.billingRecord.amountPaid)}</td>
                            <td className="text-right" style={{ color: bal > 0 && row.billingRecord.status !== "cancelled" && row.billingRecord.status !== "waived" ? "#dc2626" : undefined }}>{formatCurrency(bal)}</td>
                            <td><span className={`status-${row.billingRecord.status}`}>{row.billingRecord.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr className="total-row"><td colSpan={2}>Total</td><td className="text-right">{formatCurrency(stmtTotalDue)}</td><td className="text-right">{formatCurrency(stmtTotalPaid)}</td><td className="text-right" style={{ color: stmtTotalBalance > 0 ? "#dc2626" : "#16a34a" }}>{formatCurrency(stmtTotalBalance)}</td><td /></tr></tfoot>
                  </table>
                )}
                <p className="footer">Generated {new Date().toLocaleDateString("en-PH")} — {schoolName}</p>
              </div>
              <div className="text-sm">
                <div className="mb-3"><p className="font-medium">{statementStudentName}</p><p className="text-xs text-muted-foreground">{activeYear?.name}</p></div>
                {statementData.length === 0 ? <p className="text-muted-foreground text-sm text-center py-4">No billing records for this student in the current school year.</p> : (
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted border-b border-border"><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Month</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th><th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Due</th><th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Paid</th><th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Balance</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {statementData.map((row) => {
                          const bal = row.billingRecord.amountDue - row.billingRecord.amountPaid;
                          return (
                            <tr key={row.billingRecord.id} className="hover:bg-muted/40">
                              <td className="px-3 py-2 whitespace-nowrap">{row.billingRecord.billingMonth ? formatMonth(row.billingRecord.billingMonth + "-01") : "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{row.billingRecord.description || "—"}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.billingRecord.amountDue)}</td>
                              <td className="px-3 py-2 text-right text-green-600">{formatCurrency(row.billingRecord.amountPaid)}</td>
                              <td className={`px-3 py-2 text-right ${bal > 0 && row.billingRecord.status !== "cancelled" && row.billingRecord.status !== "waived" ? "text-red-600 font-medium" : ""}`}>{formatCurrency(bal)}</td>
                              <td className="px-3 py-2"><Badge variant={row.billingRecord.status as Parameters<typeof Badge>[0]["variant"]}>{row.billingRecord.status}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot><tr className="bg-muted font-medium"><td colSpan={2} className="px-3 py-2 text-sm">Total</td><td className="px-3 py-2 text-right">{formatCurrency(stmtTotalDue)}</td><td className="px-3 py-2 text-right text-green-600">{formatCurrency(stmtTotalPaid)}</td><td className={`px-3 py-2 text-right ${stmtTotalBalance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(stmtTotalBalance)}</td><td /></tr></tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setStatementStudentId(null); setStatementData([]); }}>Close</Button>
                <Button onClick={() => printContent("statement-print-content", `Statement — ${statementStudentName}`)}><Printer className="w-4 h-4" /> Print Statement</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Edit Payment Modal (OR# + receipt photo) ── */}
      <Modal open={!!editPaymentModal} onClose={() => setEditPaymentModal(null)} title="Edit Payment">
        {editPaymentModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Amount:</span> <strong>{formatCurrency(editPaymentModal.amount)}</strong> · {editPaymentModal.date} · <span className="capitalize">{editPaymentModal.method.replace("_", " ")}</span></p>
              {editPaymentModal.reference && <p className="text-muted-foreground text-xs">Ref: {editPaymentModal.reference}</p>}
            </div>
            {editPaymentError && <ErrorAlert message={editPaymentError} />}
            <div>
              <label className="block text-sm font-medium mb-1.5">OR Number</label>
              <Input value={editPaymentForm.orNumber} onChange={(e) => setEditPaymentForm((f) => ({ ...f, orNumber: e.target.value }))} placeholder="e.g. OR-00123" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Receipt Photo
                {editPaymentModal.receiptPhotoPath && <button type="button" onClick={() => openReceiptPhoto(editPaymentModal.receiptPhotoPath!)} className="ml-2 text-xs text-primary hover:underline font-normal">View current</button>}
              </label>
              <label className="flex items-center gap-2 w-fit cursor-pointer">
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg bg-background hover:bg-muted transition-colors">
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{editPaymentForm.receiptFile ? editPaymentForm.receiptFile.name : editPaymentModal.receiptPhotoPath ? "Replace photo" : "Attach photo"}</span>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(e) => setEditPaymentForm((f) => ({ ...f, receiptFile: e.target.files?.[0] ?? null }))} className="sr-only" />
              </label>
              {editPaymentForm.receiptFile && (
                <button type="button" onClick={() => setEditPaymentForm((f) => ({ ...f, receiptFile: null }))} className="mt-1 text-xs text-muted-foreground hover:text-destructive transition-colors">Remove</button>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditPaymentModal(null)}>Cancel</Button>
              <Button onClick={handleEditPayment} disabled={editPaymentSaving}>{editPaymentSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Help Drawer ── */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Billing Help">
        <div className="space-y-3 text-sm">
          {[
            { id: "bills", title: "Bills Tab", body: "View and manage all billing records. Use filters to narrow by student, month, class, or status. Select records to bulk mark as paid. Click a student name to view their full billing statement." },
            { id: "payments", title: "Payments Tab", body: 'View all payment transactions across all billing records. Click "Record Payment" to select an unpaid bill and record a payment against it.' },
            { id: "setup", title: "Setup Tab", body: "Configure tuition rates per academic period and level, discounts, student credits, and fee types. Tuition rates are used by Generate Billing to pre-fill amounts." },
            { id: "generate", title: "Generate Billing", body: "Bulk-create billing records for a month range. Choose 'Use tuition rates' to pull amounts from your tuition config, or 'Flat amount' to apply a single amount to selected classes." },
            { id: "status", title: "Billing Statuses", body: "Unpaid: No payments. Partial: Some paid. Paid: Fully settled. Overdue: Past due date with balance. Waived: Excluded from totals. Cancelled: Voided. Refunded: Money returned." },
          ].map((item) => (
            <div key={item.id} className="border border-border rounded-lg overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted transition-colors"
                onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}>
                <span className="font-medium">{item.title}</span>
                {helpExpanded[item.id] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {helpExpanded[item.id] && <div className="px-4 pb-3 text-muted-foreground text-sm border-t border-border pt-3">{item.body}</div>}
            </div>
          ))}
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
