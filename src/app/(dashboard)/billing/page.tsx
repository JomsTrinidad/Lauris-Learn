"use client";
import { useEffect, useState, useRef } from "react";
import { Search, Plus, DollarSign, X, Pencil, CheckSquare, History, FileText, Printer, AlertTriangle, Wand2, Check, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";
import { MonthPicker } from "@/components/ui/monthpicker";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type BillingStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled" | "refunded" | "waived";
type PaymentMethod = "cash" | "bank_transfer" | "gcash" | "maya" | "other";

interface BillingRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string;
  description: string;
  dueDate: string | null;
  billingMonth: string;
  amountDue: number;
  amountPaid: number;
  status: BillingStatus;
  notes: string | null;
}

interface StudentOption {
  id: string;
  name: string;
  studentCode: string | null;
  classId: string | null;
  className: string;
  level: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  reference: string | null;
  orNumber: string | null;
  notes: string | null;
  receiptPhotoPath: string | null;
}

interface PaymentForm {
  amount: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  date: string;
  orNumber: string;
  receiptFile: File | null;
}

interface AddForm {
  studentId: string;
  studentSearch: string;
  description: string;
  amountDue: string;
  dueDate: string;
  billingMonth: string;
  feeTypeId: string;
  markAsPaid: boolean;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  paymentRef: string;
}

interface EditForm {
  description: string;
  amountDue: string;
  dueDate: string;
  billingMonth: string;
  status: BillingStatus;
  notes: string;
  changeReason: string;
}

interface FeeType {
  id: string;
  name: string;
  defaultAmount: number | null;
}

interface ClassOption {
  id: string;
  name: string;
  level: string;
  enrolled: number;
}

interface StatementRow {
  billingRecord: BillingRecord;
  payments: PaymentRecord[];
}

function currentYearMonth() {
  return new Date().toISOString().substring(0, 7);
}

const EMPTY_PAYMENT: PaymentForm = {
  amount: "", method: "cash", reference: "", notes: "",
  date: new Date().toISOString().split("T")[0],
  orNumber: "", receiptFile: null,
};

const EMPTY_ADD: AddForm = {
  studentId: "", studentSearch: "", description: "", amountDue: "",
  dueDate: new Date().toISOString().split("T")[0],
  billingMonth: currentYearMonth(),
  feeTypeId: "",
  markAsPaid: false, paymentMethod: "cash",
  paymentDate: new Date().toISOString().split("T")[0],
  paymentRef: "",
};

const STATUS_OPTS = [
  { value: "", label: "All Statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const EDITABLE_STATUSES: { value: BillingStatus; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function formatMonth(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

function computeStatus(dbStatus: BillingStatus, amountDue: number, amountPaid: number, dueDate: string | null): BillingStatus {
  if (dbStatus === "cancelled" || dbStatus === "refunded" || dbStatus === "waived") return dbStatus;
  const balance = amountDue - amountPaid;
  if (balance <= 0) return "paid";
  if (amountPaid > 0) return "partial";
  if (dbStatus === "paid") return "paid";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "unpaid";
}

function getMonthRange(from: string, to: string): string[] {
  if (!from) return [];
  const result: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const end = to || from;
  const [ey, em] = end.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
    if (result.length > 24) break;
  }
  return result;
}

function getAgingDays(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const days = Math.floor((Date.now() - new Date(dueDate + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

function agingLabel(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 60) return "30d+";
  if (days < 90) return "60d+";
  return "90d+";
}

function agingClass(days: number): string {
  if (days < 30) return "text-orange-500 text-xs";
  if (days < 60) return "text-orange-600 text-xs font-medium";
  if (days < 90) return "text-red-600 text-xs font-medium";
  return "text-red-700 text-xs font-bold";
}

function printContent(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
    h1{font-size:20px;margin-bottom:2px}
    h2{font-size:15px;color:#555;margin-bottom:16px}
    .divider{border-top:1px solid #ddd;margin:16px 0}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px}
    .meta-block p{margin-bottom:3px}
    .label{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    .value{font-weight:600;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:12px;border-bottom:2px solid #ddd}
    td{padding:8px 10px;border-bottom:1px solid #eee;font-size:13px}
    .text-right{text-align:right}
    .total-row td{font-weight:bold;background:#f9f9f9;border-top:2px solid #ddd}
    .status-paid{color:#16a34a}
    .status-unpaid{color:#666}
    .status-overdue{color:#dc2626}
    .status-partial{color:#d97706}
    .status-cancelled{color:#999}
    .status-waived{color:#0284c7}
    .status-refunded{color:#7c3aed}
    .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}
    @media print{body{padding:20px}}
  </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function computeNthWeekday(year: number, month: number, nth: number, weekday: number): string {
  if (nth === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    const date = lastDay.getDate() - diff;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  }
  const firstDay = new Date(year, month, 1);
  const firstOccurrence = 1 + ((weekday - firstDay.getDay() + 7) % 7) + (nth - 1) * 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (firstOccurrence > daysInMonth) return "";
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(firstOccurrence).padStart(2, "0")}`;
}

function StudentCombobox({
  options, value, searchValue, onSearchChange, onSelect, onClear,
}: {
  options: StudentOption[];
  value: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSelect: (s: StudentOption) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = searchValue
    ? options.filter((s) =>
        s.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        s.className.toLowerCase().includes(searchValue.toLowerCase()) ||
        (s.studentCode ?? "").toLowerCase().includes(searchValue.toLowerCase())
      )
    : options.slice(0, 30);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Input
          placeholder="Search by name, code, or class…"
          value={searchValue}
          onChange={(e) => { onSearchChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className={value ? "pr-8 border-primary/60" : ""}
        />
        {value && (
          <button onClick={onClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" type="button">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && !value && (
        <div className="absolute z-20 w-full bg-[var(--input-background)] border border-border rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No students found.</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors text-sm"
                onMouseDown={() => { onSelect(s); setOpen(false); }}
              >
                <span className="font-medium">{s.name}</span>
                {s.studentCode && <span className="text-muted-foreground ml-1.5 text-xs font-mono">· {s.studentCode}</span>}
                <span className="text-muted-foreground ml-2 text-xs">{s.className}{s.level ? ` · ${s.level}` : ""}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { schoolId, schoolName, activeYear, userId } = useSchoolContext();
  const supabase = createClient();

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentModal, setPaymentModal] = useState<BillingRecord | null>(null);
  const [payment, setPayment] = useState<PaymentForm>(EMPTY_PAYMENT);
  const [paymentSequenceWarning, setPaymentSequenceWarning] = useState<string | null>(null);
  const [paymentOverrideReason, setPaymentOverrideReason] = useState("");

  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [addDuplicateWarning, setAddDuplicateWarning] = useState<string | null>(null);
  const [addOverrideReason, setAddOverrideReason] = useState("");

  const [editModal, setEditModal] = useState<BillingRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    description: "", amountDue: "", dueDate: "", billingMonth: "", status: "unpaid", notes: "", changeReason: "",
  });

  const [bulkConfirmModal, setBulkConfirmModal] = useState<{ records: BillingRecord[]; total: number } | null>(null);

  // Generate Billing modal
  const [genModal, setGenModal] = useState(false);
  const [genMode, setGenMode] = useState<"configs" | "flat">("configs");
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
  const [genClasses, setGenClasses] = useState<Array<{
    classId: string; className: string; level: string;
    studentCount: number; configRate: number | null;
    overrideRate: string; include: boolean;
  }>>([]);
  const [genFlatAmount, setGenFlatAmount] = useState("");
  const [genFlatClassIds, setGenFlatClassIds] = useState<string[]>([]);

  // Payment history
  const [historyModal, setHistoryModal] = useState<BillingRecord | null>(null);
  const [historyPayments, setHistoryPayments] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Receipt
  const [receiptData, setReceiptData] = useState<{ payment: PaymentRecord; record: BillingRecord } | null>(null);

  // Billing statement
  const [statementStudentId, setStatementStudentId] = useState<string | null>(null);
  const [statementStudentName, setStatementStudentName] = useState("");
  const [statementData, setStatementData] = useState<StatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadRecords(), loadStudents(), loadFeeTypes(), loadClasses()]);
    setLoading(false);
  }

  async function loadClasses() {
    if (!activeYear?.id || !schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("classes")
      .select("id, name, level")
      .eq("school_id", schoolId)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("name");
    const rows = (data ?? []) as { id: string; name: string; level: string | null }[];
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: enr } = await (supabase as any)
        .from("enrollments").select("class_id")
        .in("class_id", rows.map((r) => r.id)).eq("status", "enrolled");
      const countByClass: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((enr ?? []) as any[]).forEach((e: { class_id: string }) => {
        countByClass[e.class_id] = (countByClass[e.class_id] ?? 0) + 1;
      });
      setClassOptions(rows.map((r) => ({ id: r.id, name: r.name, level: r.level ?? "", enrolled: countByClass[r.id] ?? 0 })));
    } else {
      setClassOptions([]);
    }
  }

  async function loadRecords() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bResult = await (supabase as any)
      .from("billing_records")
      .select("id, student_id, class_id, amount_due, status, due_date, billing_month, description, notes, students(first_name, last_name), classes(name)")
      .eq("school_id", schoolId!)
      .order("due_date", { ascending: false });
    if (bResult.error) { setError(bResult.error.message); return; }
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
    setRecords(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      billingRows.map((b: any) => {
        const amountPaid = paidByRecord[b.id] ?? 0;
        return {
          id: b.id,
          studentId: b.student_id,
          studentName: b.students ? `${b.students.first_name} ${b.students.last_name}` : "—",
          classId: b.class_id ?? null,
          className: b.classes?.name ?? "—",
          description: b.description ?? "",
          dueDate: b.due_date ?? null,
          billingMonth: b.billing_month ?? "",
          amountDue: Number(b.amount_due),
          amountPaid,
          status: computeStatus(b.status as BillingStatus, Number(b.amount_due), amountPaid, b.due_date),
          notes: b.notes ?? null,
        };
      })
    );
  }

  async function loadStudents() {
    if (!activeYear?.id) { setStudentOptions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any)
      .from("enrollments")
      .select("student_id, class_id, students(first_name, last_name, student_code), classes(name, level)")
      .eq("school_year_id", activeYear.id).eq("status", "enrolled");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (result.data ?? []) as any[];
    setStudentOptions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map((e: any) => ({
        id: e.student_id,
        name: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
        studentCode: e.students?.student_code ?? null,
        classId: e.class_id ?? null,
        className: e.classes?.name ?? "—",
        level: e.classes?.level ?? "",
      })).sort((a: StudentOption, b: StudentOption) => a.name.localeCompare(b.name))
    );
  }

  async function loadFeeTypes() {
    if (!schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase as any).from("fee_types").select("id, name, default_amount").eq("school_id", schoolId).eq("is_active", true).order("name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFeeTypes(((result.data ?? []) as any[]).map((f: any) => ({ id: f.id, name: f.name, defaultAmount: f.default_amount ?? null })));
  }

  async function openGenModal() {
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    setGenModal(true);
    setGenMode("configs");
    setGenMonthFrom(thisMonth);
    setGenMonthTo(thisMonth);
    setGenResult(null);
    setGenError(null);
    setGenMarkAsPaid(false);
    setGenSkipExisting(true);
    setGenDueDateMode("none");
    setGenDueDate("");
    setGenDueDateNth(1);
    setGenDueDateWeekday(5);
    setGenPaymentDate(new Date().toISOString().split("T")[0]);

    const tuitionType = feeTypes.find((f) => f.name.toLowerCase().includes("tuition"));
    setGenFeeTypeId(tuitionType?.id ?? feeTypes[0]?.id ?? "");

    setGenLoading(true);

    // Load tuition configs via active academic period
    const rateByClassId: Record<string, number> = {};
    const rateByLevel: Record<string, number> = {};
    if (activeYear?.id && schoolId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: period } = await (supabase as any)
        .from("academic_periods")
        .select("id")
        .eq("school_id", schoolId)
        .eq("school_year_id", activeYear.id)
        .eq("is_active", true)
        .maybeSingle();

      if (period?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: configs } = await (supabase as any)
          .from("tuition_configs")
          .select("class_id, level, monthly_amount, total_amount, months")
          .eq("school_id", schoolId)
          .eq("academic_period_id", period.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((configs ?? []) as any[]).forEach((c: { class_id: string | null; level: string; monthly_amount: number | null; total_amount: number; months: number }) => {
          const monthly = c.monthly_amount != null
            ? Number(c.monthly_amount)
            : c.months > 0 ? Math.round(c.total_amount / c.months) : Number(c.total_amount);
          if (c.class_id) rateByClassId[c.class_id] = monthly;
          if (c.level) rateByLevel[c.level] = monthly;
        });
      } else {
        setGenError("No active academic period found for this school year. Go to Finance Setup → Academic Periods and mark one as active.");
      }
    }

    // Build rows — prefer class_id match, fall back to level match
    const rows = classOptions
      .filter((c) => c.enrolled > 0)
      .map((c) => {
        const rate = rateByClassId[c.id] ?? (c.level ? (rateByLevel[c.level] ?? null) : null);
        return {
          classId: c.id,
          className: c.name,
          level: c.level ?? "",
          studentCount: c.enrolled,
          configRate: rate,
          overrideRate: rate !== null ? String(rate) : "",
          include: true,
        };
      });

    setGenClasses(rows);
    setGenFlatClassIds(rows.map((r) => r.classId));
    setGenLoading(false);
  }

  async function executeGen() {
    if (!schoolId || !activeYear) return;
    if (!genFeeTypeId && feeTypes.length > 0) { setGenError("Select a fee type."); return; }
    if (!genMonthFrom) { setGenError("Select a starting month."); return; }

    if (genMode === "flat") {
      if (!Number(genFlatAmount) || Number(genFlatAmount) <= 0) { setGenError("Enter a valid flat amount."); return; }
      if (genFlatClassIds.length === 0) { setGenError("Select at least one class."); return; }
    } else {
      if (!genClasses.some((c) => c.include && Number(c.overrideRate) > 0)) {
        setGenError("Select at least one class with a valid amount."); return;
      }
    }

    setGenSaving(true);
    setGenError(null);

    function getDueDate(monthStr: string): string | null {
      if (genDueDateMode === "fixed") return genDueDate || null;
      if (genDueDateMode === "nth-weekday") {
        const [y, mo] = monthStr.split("-").map(Number);
        return computeNthWeekday(y, mo - 1, genDueDateNth, genDueDateWeekday) || null;
      }
      return null;
    }

    // Build months list
    const months: string[] = [];
    let cur = genMonthFrom;
    const toMonth = genMonthTo || genMonthFrom;
    while (cur <= toMonth) {
      months.push(cur);
      const [y, m] = cur.split("-").map(Number);
      cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      if (months.length > 24) break;
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    const selectedFeeType = feeTypes.find((f) => f.id === genFeeTypeId);

    for (const month of months) {
      const classTargets: Array<{ classId: string; amount: number }> =
        genMode === "configs"
          ? genClasses.filter((c) => c.include && Number(c.overrideRate) > 0).map((c) => ({ classId: c.classId, amount: Number(c.overrideRate) }))
          : genFlatClassIds.map((classId) => ({ classId, amount: Number(genFlatAmount) }));

      for (const target of classTargets) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: enrolls } = await (supabase as any)
          .from("enrollments")
          .select("student_id")
          .eq("class_id", target.classId)
          .eq("school_year_id", activeYear.id)
          .eq("status", "enrolled");

        const studentIds = ((enrolls ?? []) as { student_id: string }[]).map((e) => e.student_id);
        if (studentIds.length === 0) continue;

        let existingStudentIds = new Set<string>();
        if (genSkipExisting) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabase as any)
            .from("billing_records")
            .select("student_id")
            .eq("school_id", schoolId)
            .eq("class_id", target.classId)
            .eq("billing_month", month + "-01")
            .in("student_id", studentIds);
          existingStudentIds = new Set(((existing ?? []) as { student_id: string }[]).map((e) => e.student_id));
        }

        const description = selectedFeeType
          ? `${selectedFeeType.name} — ${formatMonth(month + "-01")}`
          : `Tuition — ${formatMonth(month + "-01")}`;

        for (const studentId of studentIds) {
          if (existingStudentIds.has(studentId)) { totalSkipped++; continue; }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: inserted, error: insErr } = await (supabase as any)
            .from("billing_records")
            .insert({
              school_id: schoolId,
              student_id: studentId,
              class_id: target.classId,
              school_year_id: activeYear.id,
              fee_type_id: genFeeTypeId || null,
              amount_due: target.amount,
              billing_month: month + "-01",
              due_date: getDueDate(month),
              description,
              status: genMarkAsPaid ? "paid" : "unpaid",
            })
            .select("id")
            .single();

          if (insErr) { setGenError(insErr.message); setGenSaving(false); return; }
          totalCreated++;

          if (genMarkAsPaid && inserted?.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("payments").insert({
              billing_record_id: inserted.id,
              amount: target.amount,
              payment_method: genPaymentMethod,
              payment_date: genPaymentDate,
              status: "confirmed",
              recorded_by: userId || null,
            });
          }
        }
      }
    }

    setGenResult({ created: totalCreated, skipped: totalSkipped });
    setGenSaving(false);
    if (totalCreated > 0) loadRecords();
  }


  async function openPaymentModal(record: BillingRecord) {
    setPaymentModal(record);
    setPayment(EMPTY_PAYMENT);
    setFormError(null);
    setPaymentSequenceWarning(null);
    setPaymentOverrideReason("");
    if (!record.billingMonth || !schoolId) return;
    // Check for earlier unpaid months
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: earlier } = await (supabase as any).from("billing_records")
      .select("billing_month")
      .eq("school_id", schoolId)
      .eq("student_id", record.studentId)
      .in("status", ["unpaid", "overdue"])
      .lt("billing_month", record.billingMonth);
    const rows = (earlier ?? []) as { billing_month: string }[];
    if (rows.length > 0) {
      const labels = rows.slice(0, 3).map((r) => formatMonth(r.billing_month + "-01")).join(", ");
      const extra = rows.length > 3 ? ` (+${rows.length - 3} more)` : "";
      setPaymentSequenceWarning(
        `This student has ${rows.length} unpaid earlier month${rows.length > 1 ? "s" : ""}: ${labels}${extra}. Settling earlier months first is recommended.`
      );
    }
  }

  async function handlePayment() {
    if (!paymentModal || !payment.amount) return;
    const amount = parseFloat(payment.amount);
    if (!amount || amount <= 0) {
      setFormError("Enter a valid payment amount greater than zero.");
      return;
    }

    const balance = paymentModal.amountDue - paymentModal.amountPaid;
    if (amount > balance + 0.01) {
      setFormError(
        `Payment of ${formatCurrency(amount)} exceeds the remaining balance of ${formatCurrency(balance)}. Please enter an amount equal to or less than the balance due.`
      );
      return;
    }

    if (paymentSequenceWarning && !paymentOverrideReason.trim()) {
      setFormError("Please provide a reason to proceed with payment despite earlier unpaid months.");
      return;
    }

    setSaving(true); setFormError(null);
    const noteParts = [
      payment.notes.trim(),
      paymentOverrideReason.trim() ? `Sequence override: ${paymentOverrideReason.trim()}` : "",
    ].filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pResult = await (supabase as any).from("payments").insert({
      billing_record_id: paymentModal.id, amount, payment_method: payment.method,
      reference_number: payment.reference || null, or_number: payment.orNumber || null,
      notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      payment_date: payment.date, status: "confirmed",
      recorded_by: userId || null,
    }).select("id").single();
    if (pResult.error) { setFormError(pResult.error.message); setSaving(false); return; }

    // Upload receipt photo if provided
    if (payment.receiptFile && pResult.data?.id) {
      const ext = payment.receiptFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `payment-receipts/${pResult.data.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("updates-media").upload(path, payment.receiptFile, { upsert: true });
      if (!uploadErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("payments").update({ receipt_photo_path: path }).eq("id", pResult.data.id);
      }
    }

    const newPaid = paymentModal.amountPaid + amount;
    const newStatus = computeStatus("unpaid", paymentModal.amountDue, newPaid, paymentModal.dueDate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("billing_records").update({ status: newStatus }).eq("id", paymentModal.id);
    setSaving(false);
    setPaymentModal(null); setPayment(EMPTY_PAYMENT);
    setPaymentSequenceWarning(null); setPaymentOverrideReason("");
    await loadRecords();
  }

  async function checkAddDuplicate(studentId: string, billingMonth: string) {
    setAddDuplicateWarning(null);
    if (!studentId || !billingMonth || !schoolId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("billing_records")
      .select("id, description, status")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("billing_month", billingMonth);
    const rows = (data ?? []) as { id: string; description: string; status: string }[];
    const active = rows.filter((r) => r.status !== "cancelled" && r.status !== "waived");
    if (active.length > 0) {
      const existing = active[0];
      setAddDuplicateWarning(
        `A billing record already exists for this month: "${existing.description || "(no description)"}" — status: ${existing.status}.`
      );
    }
  }

  async function handleAddRecord() {
    if (!addForm.studentId) { setFormError("Please select a student."); return; }
    if (!addForm.amountDue || parseFloat(addForm.amountDue) <= 0) {
      setFormError("Enter a valid amount greater than zero."); return;
    }
    if (!addForm.billingMonth) { setFormError("Please select a billing month."); return; }
    if (feeTypes.length > 0 && !addForm.feeTypeId) {
      setFormError("Please select a fee type."); return;
    }
    if (!activeYear?.id) { setFormError("No active school year. Please set one in Settings first."); return; }

    if (addDuplicateWarning && !addOverrideReason.trim()) {
      setFormError("A billing record already exists for this student and month. Enter an override reason below to proceed.");
      return;
    }

    setSaving(true); setFormError(null);
    const student = studentOptions.find((s) => s.id === addForm.studentId);
    const feeType = feeTypes.find((f) => f.id === addForm.feeTypeId);
    const description = addForm.description.trim() || feeType?.name || null;
    const amount = parseFloat(addForm.amountDue);
    const initialStatus: BillingStatus = addForm.markAsPaid ? "paid" : "unpaid";
    const notesFromOverride = addOverrideReason.trim() ? `Duplicate override: ${addOverrideReason.trim()}` : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rResult = await (supabase as any).from("billing_records").insert({
      school_id: schoolId!, student_id: addForm.studentId, school_year_id: activeYear.id,
      class_id: student?.classId ?? null, amount_due: amount, status: initialStatus,
      due_date: addForm.dueDate || null, billing_month: addForm.billingMonth, description,
      notes: notesFromOverride,
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
    await loadRecords();
  }

  async function handleEditRecord() {
    if (!editModal) return;
    const amount = parseFloat(editForm.amountDue);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount greater than zero."); return; }
    if (!editForm.billingMonth) { setFormError("Billing month is required."); return; }

    const amountChanged = Math.abs(amount - editModal.amountDue) > 0.01;
    const destructiveStatus =
      (editForm.status === "cancelled" || editForm.status === "waived" || editForm.status === "refunded") &&
      editModal.status !== editForm.status;

    if (amountChanged && editModal.amountPaid > 0 && !editForm.changeReason.trim()) {
      setFormError(
        `This record has ${formatCurrency(editModal.amountPaid)} in payments recorded. A change reason is required when modifying the billed amount.`
      );
      return;
    }

    if (destructiveStatus && !editForm.changeReason.trim()) {
      setFormError(`A reason is required when setting status to "${editForm.status}".`);
      return;
    }

    if (editForm.status === "paid") {
      const remainingBalance = amount - editModal.amountPaid;
      if (remainingBalance > 0.01) {
        setFormError(
          `Cannot mark as "Paid" — there is still a balance of ${formatCurrency(remainingBalance)}. Record a payment first, or set the status to "Partial".`
        );
        return;
      }
    }

    setSaving(true); setFormError(null);
    const manualStatus = editForm.status === "cancelled" || editForm.status === "refunded" || editForm.status === "waived";
    const newStatus = manualStatus ? editForm.status : computeStatus(editForm.status, amount, editModal.amountPaid, editForm.dueDate || null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      description: editForm.description.trim() || null,
      amount_due: amount,
      due_date: editForm.dueDate || null,
      billing_month: editForm.billingMonth,
      status: newStatus,
      notes: editForm.notes.trim() || null,
    };
    if (editForm.changeReason.trim()) {
      updateData.change_reason = editForm.changeReason.trim();
      updateData.changed_by = userId || null;
      updateData.changed_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("billing_records").update(updateData).eq("id", editModal.id);
    if (error) { setFormError(error.message); setSaving(false); return; }
    setSaving(false); setEditModal(null);
    await loadRecords();
  }

  function initiateBulkMarkPaid() {
    const toUpdate = records.filter(
      (r) => selectedIds.has(r.id) && r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived"
    );
    if (!toUpdate.length) return;
    const total = toUpdate.reduce((a, r) => a + (r.amountDue - r.amountPaid), 0);
    setBulkConfirmModal({ records: toUpdate, total });
  }

  async function handleBulkMarkPaid() {
    if (!bulkConfirmModal) return;
    setBulkSaving(true);
    setBulkConfirmModal(null);
    const today = new Date().toISOString().split("T")[0];
    for (const record of bulkConfirmModal.records) {
      const remaining = record.amountDue - record.amountPaid;
      if (remaining > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("payments").insert({
          billing_record_id: record.id, amount: remaining, payment_method: "cash",
          payment_date: today, status: "confirmed", recorded_by: userId || null,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("billing_records").update({
        status: "paid",
        changed_by: userId || null,
        changed_at: new Date().toISOString(),
        change_reason: "Bulk mark as paid",
      }).eq("id", record.id);
    }
    setSelectedIds(new Set()); setBulkSaving(false);
    await loadRecords();
  }

  async function openHistoryModal(record: BillingRecord) {
    setHistoryModal(record); setHistoryPayments([]); setHistoryLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("payments")
      .select("id, amount, payment_method, payment_date, reference_number, or_number, notes, status, receipt_photo_path")
      .eq("billing_record_id", record.id).order("payment_date", { ascending: false });
    setHistoryPayments(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map((p: any) => ({
        id: p.id, amount: Number(p.amount), method: p.payment_method as PaymentMethod,
        date: p.payment_date, reference: p.reference_number ?? null,
        orNumber: p.or_number ?? null, notes: p.notes ?? null,
        receiptPhotoPath: p.receipt_photo_path ?? null,
      }))
    );
    setHistoryLoading(false);
  }

  async function openReceiptPhoto(path: string) {
    const { data } = await supabase.storage.from("updates-media").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function openStatementModal(studentId: string, studentName: string) {
    setStatementStudentId(studentId); setStatementStudentName(studentName);
    setStatementData([]); setStatementLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recs } = await (supabase as any).from("billing_records")
      .select("id, amount_due, status, due_date, billing_month, description, notes, class_id, classes(name)")
      .eq("school_id", schoolId!).eq("student_id", studentId)
      .order("billing_month", { ascending: true });
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
        paymentsByRecord[p.billing_record_id].push({
          id: p.id, amount: Number(p.amount), method: p.payment_method as PaymentMethod,
          date: p.payment_date, reference: p.reference_number ?? null, orNumber: p.or_number ?? null,
          notes: null, receiptPhotoPath: null,
        });
      });
      setStatementData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows.map((r: any) => {
          const payments = paymentsByRecord[r.id] ?? [];
          const amountPaid = payments.reduce((a: number, p: PaymentRecord) => a + p.amount, 0);
          return {
            billingRecord: {
              id: r.id, studentId, studentName, classId: r.class_id ?? null,
              className: r.classes?.name ?? "—", description: r.description ?? "",
              dueDate: r.due_date ?? null, billingMonth: r.billing_month ?? "",
              amountDue: Number(r.amount_due), amountPaid,
              status: computeStatus(r.status as BillingStatus, Number(r.amount_due), amountPaid, r.due_date),
              notes: r.notes ?? null,
            } as BillingRecord,
            payments,
          };
        })
      );
    }
    setStatementLoading(false);
  }

  function openEditModal(record: BillingRecord) {
    setEditModal(record);
    setEditForm({
      description: record.description, amountDue: String(record.amountDue),
      dueDate: record.dueDate ?? "", billingMonth: record.billingMonth,
      status: record.status, notes: record.notes ?? "", changeReason: "",
    });
    setFormError(null);
  }

  const classNames = Array.from(new Set(records.map((r) => r.className).filter((n) => n !== "—")));

  const filtered = records.filter((r) => {
    const matchSearch = !search || r.studentName.toLowerCase().includes(search.toLowerCase());
    const matchClass = !classFilter || r.className === classFilter;
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchMonth = !monthFilter || r.billingMonth === monthFilter;
    return matchSearch && matchClass && matchStatus && matchMonth;
  });

  const totalDue = records.filter((r) => r.status !== "cancelled" && r.status !== "waived").reduce((a, r) => a + r.amountDue, 0);
  const totalPaid = records.reduce((a, r) => a + r.amountPaid, 0);
  const totalBalance = totalDue - totalPaid;
  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  const selectableFiltered = filtered.filter((r) => r.status !== "paid" && r.status !== "cancelled" && r.status !== "refunded" && r.status !== "waived");
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((r) => selectedIds.has(r.id));

  const stmtTotalDue = statementData.reduce((a, r) => a + r.billingRecord.amountDue, 0);
  const stmtTotalPaid = statementData.reduce((a, r) => a + r.billingRecord.amountPaid, 0);
  const stmtTotalBalance = stmtTotalDue - stmtTotalPaid;

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
      <div className="flex items-center justify-between">
        <div>
          <h1>Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Track tuition payments and balances</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openGenModal}>
            <Wand2 className="w-4 h-4" /> Generate Billing
          </Button>
          <Button onClick={() => { setAddForm(EMPTY_ADD); setAddDuplicateWarning(null); setAddOverrideReason(""); setFormError(null); setAddModal(true); }}>
            <Plus className="w-4 h-4" /> Add Record
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Total Expected</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalDue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Total Collected</p>
          <p className="text-2xl font-semibold mt-1 text-green-600">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Outstanding Balance</p>
          <p className="text-2xl font-semibold mt-1 text-red-600">{formatCurrency(totalBalance)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Collection Rate</p>
          <p className={`text-2xl font-semibold mt-1 ${collectionRate >= 80 ? "text-green-600" : collectionRate >= 50 ? "text-orange-500" : "text-red-600"}`}>
            {collectionRate}%
          </p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search student..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <MonthPicker
          value={monthFilter}
          onChange={setMonthFilter}
          placeholder="All months"
          className="sm:w-44"
        />
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-40">
          <option value="">All Classes</option>
          {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
          {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl text-sm">
          <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium">{selectedIds.size} record{selectedIds.size > 1 ? "s" : ""} selected</span>
          <Button size="sm" onClick={initiateBulkMarkPaid} disabled={bulkSaving}>{bulkSaving ? "Saving…" : "Mark All as Paid"}</Button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} disabled={selectableFiltered.length === 0} className="w-4 h-4 rounded border-border cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Class</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Month</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount Due</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-muted-foreground">No billing records found.</td></tr>
              ) : filtered.map((record) => {
                const balance = record.amountDue - record.amountPaid;
                const selectable = record.status !== "paid" && record.status !== "cancelled" && record.status !== "refunded" && record.status !== "waived";
                const agingDays = record.status === "overdue" ? getAgingDays(record.dueDate) : null;
                return (
                  <tr key={record.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-4">
                      {selectable && (
                        <input type="checkbox" checked={selectedIds.has(record.id)} onChange={(e) => {
                          setSelectedIds((prev) => { const next = new Set(prev); e.target.checked ? next.add(record.id) : next.delete(record.id); return next; });
                        }} className="w-4 h-4 rounded border-border cursor-pointer" />
                      )}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      <button onClick={() => openStatementModal(record.studentId, record.studentName)} className="hover:underline text-left">
                        {record.studentName}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{record.className}</td>
                    <td className="px-4 py-4 text-muted-foreground max-w-[180px]">
                      <span className="truncate block">{record.description || "—"}</span>
                      {record.notes && <span className="text-xs text-muted-foreground/70 italic block truncate">{record.notes}</span>}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{record.billingMonth ? formatMonth(record.billingMonth + "-01") : "—"}</td>
                    <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{record.dueDate ?? "—"}</td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">{formatCurrency(record.amountDue)}</td>
                    <td className="px-4 py-4 text-right text-green-600 whitespace-nowrap">{formatCurrency(record.amountPaid)}</td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <span className={balance > 0 && record.status !== "cancelled" && record.status !== "waived" ? "text-red-600" : ""}>{formatCurrency(balance)}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant={record.status as Parameters<typeof Badge>[0]["variant"]}>{record.status}</Badge>
                        {agingDays !== null && <span className={agingClass(agingDays)}>{agingLabel(agingDays)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        {selectable && (
                          <button onClick={() => openPaymentModal(record)} className="flex items-center gap-1 text-sm text-primary hover:underline">
                            <DollarSign className="w-3.5 h-3.5" /> Pay
                          </button>
                        )}
                        <button onClick={() => openHistoryModal(record)} className="text-muted-foreground hover:text-foreground" title="Payment history">
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEditModal(record)} className="text-muted-foreground hover:text-foreground" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payment Modal */}
      <Modal open={!!paymentModal} onClose={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setPaymentSequenceWarning(null); setPaymentOverrideReason(""); setFormError(null); }} title="Record Payment">
        {paymentModal && (
          <div className="space-y-4">
            {formError && <ErrorAlert message={formError} />}

            {/* Sequence warning */}
            {paymentSequenceWarning && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-800">Earlier months unpaid</p>
                    <p className="text-orange-700 mt-0.5">{paymentSequenceWarning}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-orange-800 mb-1">Override reason * (required to proceed)</label>
                  <Textarea
                    placeholder="e.g. Parent requested to pay this month first; will settle earlier months next week."
                    value={paymentOverrideReason}
                    onChange={(e) => setPaymentOverrideReason(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Student:</span> <strong>{paymentModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Description:</span> {paymentModal.description || formatMonth(paymentModal.billingMonth + "-01")}</p>
              <p><span className="text-muted-foreground">Balance due:</span> <strong className="text-red-600">{formatCurrency(paymentModal.amountDue - paymentModal.amountPaid)}</strong></p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount Paid *</label>
              <Input type="number" min={0} step={0.01} placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
              {(() => {
                const amt = parseFloat(payment.amount);
                const bal = paymentModal.amountDue - paymentModal.amountPaid;
                if (amt > 0 && Math.abs(amt - bal) < 0.01) return <p className="text-xs text-green-600 mt-1">✓ Full balance — will be marked as Paid.</p>;
                if (amt > 0 && amt < bal) return <p className="text-xs text-muted-foreground mt-1">Partial payment — {formatCurrency(bal - amt)} will remain outstanding.</p>;
                return null;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Payment Method *</label>
                <Select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value as PaymentMethod })}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Date *</label>
                <DatePicker value={payment.date} onChange={(v) => setPayment({ ...payment, date: v })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center">
                  OR Number
                  <InfoTooltip text="Official Receipt number for BIR compliance. Printed on the receipt." />
                </label>
                <Input placeholder="e.g. 0001234" value={payment.orNumber} onChange={(e) => setPayment({ ...payment, orNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reference No.</label>
                <Input placeholder="Optional" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <Textarea placeholder="Optional notes..." value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} rows={2} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                Receipt Photo <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPayment({ ...payment, receiptFile: e.target.files?.[0] ?? null })}
                className="w-full text-sm text-muted-foreground cursor-pointer
                  file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                  file:text-xs file:font-medium file:cursor-pointer
                  file:bg-muted file:text-foreground hover:file:bg-muted/70"
              />
              {payment.receiptFile && (
                <p className="text-xs text-green-600 mt-1">✓ {payment.receiptFile.name}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setPaymentSequenceWarning(null); setPaymentOverrideReason(""); setFormError(null); }}>Cancel</Button>
              <Button onClick={handlePayment} disabled={saving || !payment.amount}>{saving ? "Saving…" : "Save Payment"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Record Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setAddDuplicateWarning(null); setAddOverrideReason(""); setFormError(null); }} title="Add Billing Record">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1">Student *</label>
            <StudentCombobox
              options={studentOptions} value={addForm.studentId} searchValue={addForm.studentSearch}
              onSearchChange={(v) => setAddForm({ ...addForm, studentSearch: v, studentId: "" })}
              onSelect={(s) => {
                const newForm = { ...addForm, studentId: s.id, studentSearch: `${s.name}${s.studentCode ? ` · ${s.studentCode}` : ""} (${s.className})` };
                setAddForm(newForm);
                setAddOverrideReason("");
                checkAddDuplicate(s.id, addForm.billingMonth);
              }}
              onClear={() => { setAddForm({ ...addForm, studentId: "", studentSearch: "" }); setAddDuplicateWarning(null); setAddOverrideReason(""); }}
            />
            {addForm.studentId && <p className="text-xs text-green-600 mt-1">✓ {studentOptions.find((s) => s.id === addForm.studentId)?.name}</p>}
          </div>
          {feeTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center">Fee Type * <InfoTooltip text="Selecting one auto-fills the description and amount." /></label>
              <Select value={addForm.feeTypeId} onChange={(e) => {
                const ft = feeTypes.find((f) => f.id === e.target.value);
                setAddForm({ ...addForm, feeTypeId: e.target.value, amountDue: ft?.defaultAmount ? String(ft.defaultAmount) : addForm.amountDue });
              }}>
                <option value="">— Select fee type —</option>
                {feeTypes.map((f) => <option key={f.id} value={f.id}>{f.name}{f.defaultAmount ? ` — ${formatCurrency(f.defaultAmount)}` : ""}</option>)}
              </Select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} placeholder="e.g. Tuition — April 2026 (optional if fee type selected)" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center">Billing Month * <InfoTooltip text="The month this charge applies to." /></label>
              <MonthPicker
                value={addForm.billingMonth}
                onChange={(v) => {
                  setAddForm({ ...addForm, billingMonth: v });
                  setAddOverrideReason("");
                  checkAddDuplicate(addForm.studentId, v);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount Due *</label>
              <Input type="number" min={0} step={100} placeholder="0.00" value={addForm.amountDue} onChange={(e) => setAddForm({ ...addForm, amountDue: e.target.value })} />
            </div>
          </div>

          {/* Duplicate warning */}
          {addDuplicateWarning && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800">Duplicate detected</p>
                  <p className="text-orange-700 mt-0.5">{addDuplicateWarning}</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Override reason * (required to proceed)</label>
                <Textarea
                  placeholder="e.g. Additional fee not covered by the existing record (e.g. books, uniform)."
                  value={addOverrideReason}
                  onChange={(e) => setAddOverrideReason(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center">Due Date <InfoTooltip text="Records past this date will automatically show as Overdue." /></label>
            <DatePicker value={addForm.dueDate} onChange={(v) => setAddForm({ ...addForm, dueDate: v })} placeholder="No due date" />
          </div>
          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={addForm.markAsPaid} onChange={(e) => setAddForm({ ...addForm, markAsPaid: e.target.checked })} className="w-4 h-4 rounded border-border" />
              <span className="text-sm font-medium">Mark as Paid immediately</span>
              <InfoTooltip text="Use when collecting payment upfront at enrollment." />
            </label>
            {addForm.markAsPaid && (
              <div className="space-y-3 pl-6 border-l-2 border-primary/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Method *</label>
                    <Select value={addForm.paymentMethod} onChange={(e) => setAddForm({ ...addForm, paymentMethod: e.target.value as PaymentMethod })}>
                      <option value="cash">Cash</option><option value="gcash">GCash</option>
                      <option value="maya">Maya</option><option value="bank_transfer">Bank Transfer</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Date</label>
                    <DatePicker value={addForm.paymentDate} onChange={(v) => setAddForm({ ...addForm, paymentDate: v })} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reference / Receipt No.</label>
                  <Input placeholder="Optional" value={addForm.paymentRef} onChange={(e) => setAddForm({ ...addForm, paymentRef: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          {!activeYear && <p className="text-xs text-orange-600">⚠ No active school year. Please set one in Settings before adding billing records.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleAddRecord} disabled={saving || !addForm.studentId || !addForm.amountDue || !addForm.billingMonth}>
              {saving ? "Saving…" : addForm.markAsPaid ? "Save & Mark Paid" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Record Modal */}
      <Modal open={!!editModal} onClose={() => { setEditModal(null); setFormError(null); }} title="Edit Billing Record">
        {editModal && (() => {
          const editedAmount = parseFloat(editForm.amountDue || "0");
          const amountChanged = Math.abs(editedAmount - editModal.amountDue) > 0.01;
          const destructiveStatus =
            (editForm.status === "cancelled" || editForm.status === "waived" || editForm.status === "refunded") &&
            editModal.status !== editForm.status;
          const showChangeReason = (amountChanged && editModal.amountPaid > 0) || destructiveStatus;

          return (
            <div className="space-y-4">
              {formError && <ErrorAlert message={formError} />}
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p><span className="text-muted-foreground">Student:</span> <strong>{editModal.studentName}</strong></p>
                <p><span className="text-muted-foreground">Amount paid so far:</span> {formatCurrency(editModal.amountPaid)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="e.g. Tuition — April 2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Billing Month *</label>
                  <MonthPicker value={editForm.billingMonth} onChange={(v) => setEditForm({ ...editForm, billingMonth: v })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Amount Due *</label>
                  <Input type="number" min={0} step={100} value={editForm.amountDue} onChange={(e) => setEditForm({ ...editForm, amountDue: e.target.value })} />
                  {amountChanged && editModal.amountPaid > 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠ Payments already recorded — change reason required below.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <DatePicker value={editForm.dueDate} onChange={(v) => setEditForm({ ...editForm, dueDate: v })} placeholder="No due date" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center">
                  Status
                  <InfoTooltip text="Cancelled and Refunded are manual overrides. Waived = fee intentionally forgiven. Other statuses are auto-computed from payments." />
                </label>
                <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as BillingStatus })}>
                  {EDITABLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
                {editForm.status === "paid" && editModal.amountPaid < editModal.amountDue && (
                  <p className="text-xs text-orange-600 mt-1">⚠ Balance not yet fully paid — recording a payment is recommended instead of manually setting Paid.</p>
                )}
                {(editForm.status === "waived") && (
                  <p className="text-xs text-sky-600 mt-1">Waived fees are excluded from outstanding balance and revenue totals.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center">Admin Notes <InfoTooltip text="Internal notes visible to admins only." /></label>
                <Textarea placeholder="e.g. Student withdrew in March — pro-rated refund issued" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
              </div>

              {/* Contextual change reason */}
              {showChangeReason && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium text-orange-800">
                      {amountChanged && editModal.amountPaid > 0
                        ? "Reason required — amount change with existing payments"
                        : `Reason required — setting status to "${editForm.status}"`}
                    </p>
                  </div>
                  <Textarea
                    placeholder={
                      amountChanged
                        ? "e.g. Pro-rated adjustment for mid-month enrollment."
                        : editForm.status === "cancelled" ? "e.g. Student withdrew — record cancelled."
                        : editForm.status === "waived" ? "e.g. Scholarship — tuition fee waived for this month."
                        : "e.g. Refund issued — overpayment from previous month."
                    }
                    value={editForm.changeReason}
                    onChange={(e) => setEditForm({ ...editForm, changeReason: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setEditModal(null); setFormError(null); }}>Cancel</Button>
                <Button onClick={handleEditRecord} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Generate Billing Modal */}
      <Modal open={genModal} onClose={() => { setGenModal(false); setGenResult(null); setGenError(null); }} title="Generate Billing" className="max-w-2xl">
        <div className="space-y-6">

          {/* Section 1: Billing Period */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Billing Period</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use the same month for one-time billing, or choose a range to generate bills for multiple months at once.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">From Month *</label>
                <MonthPicker value={genMonthFrom} onChange={setGenMonthFrom} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">To Month</label>
                <MonthPicker value={genMonthTo} min={genMonthFrom} onChange={setGenMonthTo} placeholder="Same as From" />
              </div>
            </div>
          </div>

          {/* Section 2: Who to Bill */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Who to Bill</p>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                type="button"
                onClick={() => setGenMode("configs")}
                className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${genMode === "configs" ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Use tuition configs
              </button>
              <button
                type="button"
                onClick={() => setGenMode("flat")}
                className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${genMode === "flat" ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Flat amount for all classes
              </button>
            </div>

            {/* Configs mode: per-class table */}
            {genMode === "configs" && (
              genLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" />
                </div>
              ) : genClasses.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-border rounded-xl text-sm text-muted-foreground">
                  No enrolled students found for the active school year.
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted border-b border-border">
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
                      <div className="col-span-1" />
                      <div className="col-span-4">Class</div>
                      <div className="col-span-2">Level</div>
                      <div className="col-span-2 text-center">Students</div>
                      <div className="col-span-3">Monthly Amount</div>
                    </div>
                  </div>
                  <div className="divide-y divide-border max-h-64 overflow-y-auto">
                    {genClasses.map((cls) => (
                      <div key={cls.classId} className={`px-4 py-3 ${!cls.include ? "opacity-50" : ""}`}>
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-1 pt-0.5">
                            <input type="checkbox" checked={cls.include} onChange={(e) => setGenClasses((prev) => prev.map((c) => c.classId === cls.classId ? { ...c, include: e.target.checked } : c))} className="rounded" />
                          </div>
                          <div className="col-span-4">
                            <p className="text-sm font-medium">{cls.className}</p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">{cls.level || "—"}</span>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="text-sm">{cls.studentCount}</span>
                          </div>
                          <div className="col-span-3">
                            <Input type="number" min="0" step="0.01" value={cls.overrideRate} onChange={(e) => setGenClasses((prev) => prev.map((c) => c.classId === cls.classId ? { ...c, overrideRate: e.target.value } : c))} disabled={!cls.include} className="h-8 text-sm" placeholder="0.00" />
                            {cls.configRate === null && cls.include && (
                              <p className="text-xs text-amber-600 mt-1">No tuition amount set. Enter an amount manually or update tuition settings.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Flat mode: single amount + class checkboxes */}
            {genMode === "flat" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount per student *</label>
                  <Input type="number" min={0} step={100} placeholder="0.00" value={genFlatAmount} onChange={(e) => setGenFlatAmount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Apply to these classes</label>
                  <div className="space-y-2 max-h-44 overflow-y-auto border border-border rounded-lg p-3">
                    {classOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active classes found.</p>
                    ) : classOptions.map((cls) => (
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
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${genDueDateMode === mode ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {mode === "none" ? "No due date" : mode === "fixed" ? "Fixed date" : "Nth weekday"}
                  </button>
                ))}
              </div>
              {genDueDateMode === "none" && (
                <p className="text-xs text-muted-foreground">Overdue tracking won&apos;t apply to these bills.</p>
              )}
              {genDueDateMode === "fixed" && (
                <>
                  <DatePicker value={genDueDate} onChange={setGenDueDate} placeholder="Select date" />
                  <p className="text-xs text-muted-foreground">All generated bills share this due date.</p>
                </>
              )}
              {genDueDateMode === "nth-weekday" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={String(genDueDateNth)} onChange={(e) => setGenDueDateNth(Number(e.target.value))} className="flex-1">
                      <option value="1">1st</option>
                      <option value="2">2nd</option>
                      <option value="3">3rd</option>
                      <option value="4">4th</option>
                      <option value="-1">Last</option>
                    </Select>
                    <Select value={String(genDueDateWeekday)} onChange={(e) => setGenDueDateWeekday(Number(e.target.value))} className="flex-1">
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="0">Sunday</option>
                    </Select>
                  </div>
                  {genMonthFrom && (() => {
                    const [y, mo] = genMonthFrom.split("-").map(Number);
                    const preview = computeNthWeekday(y, mo - 1, genDueDateNth, genDueDateWeekday);
                    return preview ? (
                      <p className="text-xs text-muted-foreground">
                        e.g. {formatMonth(genMonthFrom + "-01")} → due <strong className="text-foreground">{preview}</strong>
                      </p>
                    ) : <p className="text-xs text-amber-600">That weekday doesn&apos;t occur this many times in the month.</p>;
                  })()}
                  <p className="text-xs text-muted-foreground">Each month&apos;s due date is computed from this rule.</p>
                </div>
              )}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer text-sm select-none">
              <input type="checkbox" checked={genSkipExisting} onChange={(e) => setGenSkipExisting(e.target.checked)} className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />
              <span>
                <span className="font-medium">Do not create duplicate bills</span>
                <span className="text-muted-foreground block text-xs mt-0.5">Students who already have a bill for the selected month will be skipped.</span>
              </span>
            </label>
          </div>

          {/* Section 4: Optional Payment Shortcut */}
          <div className={`border rounded-xl transition-colors ${genMarkAsPaid ? "border-primary/40 bg-primary/5" : "border-border"}`}>
            <label className="flex items-start gap-3 cursor-pointer select-none p-4">
              <input type="checkbox" checked={genMarkAsPaid} onChange={(e) => setGenMarkAsPaid(e.target.checked)} className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Also record payment now</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use this only when parents already paid during enrollment or paid in advance.</p>
              </div>
            </label>
            {genMarkAsPaid && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Method</label>
                  <Select value={genPaymentMethod} onChange={(e) => setGenPaymentMethod(e.target.value as PaymentMethod)}>
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Date</label>
                  <DatePicker value={genPaymentDate} onChange={setGenPaymentDate} />
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Preview Summary */}
          {(() => {
            const months = genMonthFrom ? getMonthRange(genMonthFrom, genMonthTo || genMonthFrom) : [];
            let selectedClassesCount = 0;
            let estimatedBills = 0;
            let estimatedTotal = 0;

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

            const monthLabel = months.length === 1
              ? formatMonth(months[0] + "-01")
              : `${formatMonth(months[0] + "-01")} – ${formatMonth(months[months.length - 1] + "-01")}`;

            return (
              <div className="bg-muted rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Billing period</span>
                  <span className="font-medium">{monthLabel}</span>
                  <span className="text-muted-foreground">Classes selected</span>
                  <span className="font-medium">{selectedClassesCount} class{selectedClassesCount !== 1 ? "es" : ""}</span>
                  <span className="text-muted-foreground">Bills to create</span>
                  <span className="font-medium">up to {estimatedBills} bill{estimatedBills !== 1 ? "s" : ""}</span>
                  {estimatedTotal > 0 && (
                    <>
                      <span className="text-muted-foreground">Estimated total</span>
                      <span className="font-medium">{formatCurrency(estimatedTotal)}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Existing bills</span>
                  <span className="font-medium">{genSkipExisting ? "Skip duplicates" : "Allow duplicates"}</span>
                  {genMarkAsPaid && (
                    <>
                      <span className="text-muted-foreground">Payment</span>
                      <span className="font-medium text-green-700">Recorded as paid ({genPaymentMethod.replace("_", " ")})</span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {genError && <ErrorAlert message={genError} />}

          {genResult && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${genResult.created > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-muted text-muted-foreground"}`}>
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>
                {genResult.created > 0
                  ? <><strong>{genResult.created}</strong> bill{genResult.created !== 1 ? "s" : ""} created{genResult.skipped > 0 ? `, ${genResult.skipped} already existed (skipped)` : ""}.</>
                  : `All ${genResult.skipped} student records already existed and were skipped.`
                }
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setGenModal(false); setGenResult(null); setGenError(null); }}>
              {genResult ? "Close" : "Cancel"}
            </Button>
            {!genResult && (() => {
              const canGen = genMonthFrom && (
                genMode === "configs"
                  ? genClasses.some((c) => c.include && Number(c.overrideRate) > 0)
                  : Number(genFlatAmount) > 0 && genFlatClassIds.length > 0
              );
              return (
                <Button onClick={executeGen} disabled={genSaving || genLoading || !canGen}>
                  {genSaving ? "Creating…" : genMarkAsPaid ? "Create Bills and Record Payment" : "Create Bills"}
                </Button>
              );
            })()}
          </div>
        </div>
      </Modal>

      {/* Bulk Confirm Modal */}
      <Modal open={!!bulkConfirmModal} onClose={() => setBulkConfirmModal(null)} title="Confirm Bulk Mark as Paid">
        {bulkConfirmModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><strong>{bulkConfirmModal.records.length}</strong> record{bulkConfirmModal.records.length > 1 ? "s" : ""} will be marked as Paid.</p>
              <p>Total amount being settled: <strong className="text-green-600">{formatCurrency(bulkConfirmModal.total)}</strong></p>
              <p className="text-xs text-muted-foreground">Payment method: Cash · Date: {new Date().toLocaleDateString("en-PH")}</p>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-border rounded-lg border border-border text-sm">
              {bulkConfirmModal.records.slice(0, 15).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate text-sm">{r.studentName}</span>
                  <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">{r.billingMonth ? formatMonth(r.billingMonth + "-01") : "—"} · {formatCurrency(r.amountDue - r.amountPaid)}</span>
                </div>
              ))}
              {bulkConfirmModal.records.length > 15 && (
                <div className="px-3 py-2 text-xs text-muted-foreground text-center">…and {bulkConfirmModal.records.length - 15} more</div>
              )}
            </div>
            <p className="text-xs text-orange-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              This creates payment records for all selected bills. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkConfirmModal(null)}>Cancel</Button>
              <Button onClick={handleBulkMarkPaid} disabled={bulkSaving}>{bulkSaving ? "Processing…" : "Confirm Mark as Paid"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment History Modal */}
      <Modal open={!!historyModal} onClose={() => { setHistoryModal(null); setHistoryPayments([]); }} title="Payment History">
        {historyModal && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p><span className="text-muted-foreground">Student:</span> <strong>{historyModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Charge:</span> {historyModal.description || formatMonth(historyModal.billingMonth + "-01")} — {formatCurrency(historyModal.amountDue)}</p>
              <p><span className="text-muted-foreground">Status:</span> <Badge variant={historyModal.status as Parameters<typeof Badge>[0]["variant"]}>{historyModal.status}</Badge></p>
            </div>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading payments…</p>
            ) : historyPayments.length === 0 ? (
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
                      {p.receiptPhotoPath && (
                        <button
                          onClick={() => openReceiptPhoto(p.receiptPhotoPath!)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                          title="View uploaded receipt photo"
                        >
                          <ImageIcon className="w-3.5 h-3.5" /> Photo
                        </button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setReceiptData({ payment: p, record: historyModal })}>
                        <Printer className="w-3.5 h-3.5" /> Receipt
                      </Button>
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

      {/* Receipt Modal */}
      <Modal open={!!receiptData} onClose={() => setReceiptData(null)} title="Official Receipt">
        {receiptData && (
          <div className="space-y-4">
            <div id="receipt-print-content" style={{ display: "none" }}>
              <h1>{schoolName}</h1>
              <h2>Official Receipt</h2>
              <div className="divider" />
              <div className="meta">
                <div className="meta-block">
                  <p className="label">OR Number</p>
                  <p className="value">{receiptData.payment.orNumber || "—"}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Date</p>
                  <p className="value">{receiptData.payment.date}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Student</p>
                  <p className="value">{receiptData.record.studentName}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Class</p>
                  <p className="value">{receiptData.record.className}</p>
                </div>
              </div>
              <div className="divider" />
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Billing Month</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{receiptData.record.description || "Tuition Fee"}</td>
                    <td>{formatMonth(receiptData.record.billingMonth + "-01")}</td>
                    <td className="text-right">{formatCurrency(receiptData.payment.amount)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="divider" />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p className="label">Payment Method</p>
                  <p className="value" style={{ textTransform: "capitalize" }}>{receiptData.payment.method.replace("_", " ")}</p>
                  {receiptData.payment.reference && <p className="label" style={{ marginTop: "4px" }}>Ref: {receiptData.payment.reference}</p>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="label">Amount Paid</p>
                  <p style={{ fontSize: "22px", fontWeight: "bold" }}>{formatCurrency(receiptData.payment.amount)}</p>
                </div>
              </div>
              <p className="footer">Thank you for your payment! — {schoolName}</p>
            </div>

            {/* Screen preview of receipt */}
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
              <Button onClick={() => printContent("receipt-print-content", `Receipt — ${receiptData.record.studentName}`)}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Billing Statement Modal */}
      <Modal open={!!statementStudentId} onClose={() => { setStatementStudentId(null); setStatementData([]); }} title={`Statement — ${statementStudentName}`}>
        <div className="space-y-4">
          {statementLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading statement…</p>
          ) : (
            <>
              <div id="statement-print-content" style={{ display: "none" }}>
                <h1>{schoolName}</h1>
                <h2>Billing Statement</h2>
                <div className="divider" />
                <div className="meta">
                  <div className="meta-block">
                    <p className="label">Student</p>
                    <p className="value">{statementStudentName}</p>
                  </div>
                  <div className="meta-block">
                    <p className="label">School Year</p>
                    <p className="value">{activeYear?.name ?? "—"}</p>
                  </div>
                </div>
                <div className="divider" />
                {statementData.length === 0 ? (
                  <p style={{ color: "#666", textAlign: "center", padding: "16px 0" }}>No billing records for this student in the current school year.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Description</th>
                        <th className="text-right">Amount Due</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
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
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan={2}>Total</td>
                        <td className="text-right">{formatCurrency(stmtTotalDue)}</td>
                        <td className="text-right">{formatCurrency(stmtTotalPaid)}</td>
                        <td className="text-right" style={{ color: stmtTotalBalance > 0 ? "#dc2626" : "#16a34a" }}>{formatCurrency(stmtTotalBalance)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
                <p className="footer">Generated {new Date().toLocaleDateString("en-PH")} — {schoolName}</p>
              </div>

              {/* Screen-visible statement table */}
              <div className="text-sm">
                <div className="mb-3">
                  <p className="font-medium">{statementStudentName}</p>
                  <p className="text-xs text-muted-foreground">{activeYear?.name}</p>
                </div>
                {statementData.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No billing records for this student in the current school year.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted px-3 py-2 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs font-medium text-muted-foreground">
                      <span>Month / Description</span>
                      <span className="text-right w-24">Amount Due</span>
                      <span className="text-right w-20">Paid</span>
                      <span className="text-right w-20">Balance</span>
                      <span className="w-16">Status</span>
                    </div>
                    {statementData.map((row) => {
                      const bal = row.billingRecord.amountDue - row.billingRecord.amountPaid;
                      return (
                        <div key={row.billingRecord.id} className="px-3 py-2.5 border-t border-border grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{row.billingRecord.billingMonth ? formatMonth(row.billingRecord.billingMonth + "-01") : "—"}</p>
                            {row.billingRecord.description && <p className="text-muted-foreground truncate">{row.billingRecord.description}</p>}
                          </div>
                          <span className="text-right w-24">{formatCurrency(row.billingRecord.amountDue)}</span>
                          <span className="text-right w-20 text-green-600">{formatCurrency(row.billingRecord.amountPaid)}</span>
                          <span className={`text-right w-20 ${bal > 0 && row.billingRecord.status !== "cancelled" && row.billingRecord.status !== "waived" ? "text-red-600" : ""}`}>{formatCurrency(bal)}</span>
                          <span className="w-16"><Badge variant={row.billingRecord.status as Parameters<typeof Badge>[0]["variant"]} className="text-[10px] px-1.5">{row.billingRecord.status}</Badge></span>
                        </div>
                      );
                    })}
                    <div className="px-3 py-2.5 border-t-2 border-border bg-muted/50 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs font-semibold">
                      <span>Total</span>
                      <span className="text-right w-24">{formatCurrency(stmtTotalDue)}</span>
                      <span className="text-right w-20 text-green-600">{formatCurrency(stmtTotalPaid)}</span>
                      <span className={`text-right w-20 ${stmtTotalBalance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(stmtTotalBalance)}</span>
                      <span className="w-16" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Balance: <strong className={stmtTotalBalance > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(stmtTotalBalance)}</strong>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setStatementStudentId(null); setStatementData([]); }}>Close</Button>
                  <Button onClick={() => printContent("statement-print-content", `Statement — ${statementStudentName}`)}>
                    <FileText className="w-4 h-4" /> Print Statement
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
