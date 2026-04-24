"use client";
import { useEffect, useState } from "react";
import { Search, Plus, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type BillingStatus = "unpaid" | "partial" | "paid" | "overdue";
type PaymentMethod = "cash" | "bank_transfer" | "gcash" | "maya" | "other";

interface BillingRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string;
  description: string;
  dueDate: string | null;
  amountDue: number;
  amountPaid: number;
  status: BillingStatus;
}

interface StudentOption {
  id: string;
  name: string;
  classId: string | null;
  className: string;
}

interface PaymentForm {
  amount: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  date: string;
}

interface AddForm {
  studentId: string;
  description: string;
  amountDue: string;
  dueDate: string;
}

const EMPTY_PAYMENT: PaymentForm = {
  amount: "", method: "cash", reference: "", notes: "",
  date: new Date().toISOString().split("T")[0],
};

const EMPTY_ADD: AddForm = {
  studentId: "", description: "", amountDue: "",
  dueDate: new Date().toISOString().split("T")[0],
};

const STATUS_OPTS = [
  { value: "", label: "All Statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

function formatMonth(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

function computeStatus(amountDue: number, amountPaid: number, dueDate: string | null): BillingStatus {
  const balance = amountDue - amountPaid;
  if (balance <= 0) return "paid";
  if (amountPaid > 0) return "partial";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "unpaid";
}

export default function BillingPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [paymentModal, setPaymentModal] = useState<BillingRecord | null>(null);
  const [payment, setPayment] = useState<PaymentForm>(EMPTY_PAYMENT);
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadRecords(), loadStudents()]);
    setLoading(false);
  }

  async function loadRecords() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bResult = await supabase.from("billing_records").select(`id, student_id, class_id, amount_due, status, due_date, description, students(first_name, last_name), classes(name)`).eq("school_id", schoolId!).order("due_date", { ascending: false }) as any;
    if (bResult.error) { setError(bResult.error.message); return; }
    const billingRows = ((bResult.data ?? []) as any[]) as Array<{ id: string; student_id: string; class_id: string | null; amount_due: number; status: string; due_date: string | null; description: string | null; students: { first_name: string; last_name: string } | null; classes: { name: string } | null }>;

    const ids: string[] = billingRows.map((b) => b.id);
    let paidByRecord: Record<string, number> = {};

    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pResult = await supabase.from("payments").select("billing_record_id, amount").eq("status", "confirmed").in("billing_record_id", ids) as any;
      const payRows = ((pResult.data ?? []) as any[]) as Array<{ billing_record_id: string; amount: number }>;
      payRows.forEach((p) => {
        paidByRecord[p.billing_record_id] = (paidByRecord[p.billing_record_id] ?? 0) + Number(p.amount);
      });
    }

    setRecords(
      billingRows.map((b) => {
        const amountPaid = paidByRecord[b.id] ?? 0;
        return {
          id: b.id,
          studentId: b.student_id,
          studentName: b.students ? `${b.students.first_name} ${b.students.last_name}` : "—",
          classId: b.class_id ?? null,
          className: b.classes?.name ?? "—",
          description: b.description ?? "",
          dueDate: b.due_date ?? null,
          amountDue: Number(b.amount_due),
          amountPaid,
          status: computeStatus(Number(b.amount_due), amountPaid, b.due_date),
        };
      })
    );
  }

  async function loadStudents() {
    if (!activeYear?.id) { setStudentOptions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await supabase.from("enrollments").select("student_id, class_id, students(first_name, last_name), classes(name)").eq("school_year_id", activeYear.id).eq("status", "enrolled") as any;
    const rows = ((result.data ?? []) as any[]) as Array<{ student_id: string; class_id: string | null; students: { first_name: string; last_name: string } | null; classes: { name: string } | null }>;
    setStudentOptions(
      rows.map((e) => ({
        id: e.student_id,
        name: e.students ? `${e.students.first_name} ${e.students.last_name}` : e.student_id,
        classId: e.class_id ?? null,
        className: e.classes?.name ?? "—",
      })).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function handlePayment() {
    if (!paymentModal || !payment.amount) return;
    const amount = parseFloat(payment.amount);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount."); return; }

    setSaving(true);
    setFormError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pResult = await (supabase.from("payments") as any).insert({
      billing_record_id: paymentModal.id,
      amount,
      payment_method: payment.method,
      reference_number: payment.reference || null,
      notes: payment.notes || null,
      payment_date: payment.date,
      status: "confirmed",
    });
    if (pResult.error) { setFormError(pResult.error.message); setSaving(false); return; }

    // Recalculate and update billing_record status
    const newPaid = paymentModal.amountPaid + amount;
    const newStatus = computeStatus(paymentModal.amountDue, newPaid, paymentModal.dueDate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("billing_records") as any).update({ status: newStatus }).eq("id", paymentModal.id);

    setSaving(false);
    setPaymentModal(null);
    setPayment(EMPTY_PAYMENT);
    await loadRecords();
  }

  async function handleAddRecord() {
    if (!addForm.studentId) { setFormError("Select a student."); return; }
    if (!addForm.amountDue || parseFloat(addForm.amountDue) <= 0) { setFormError("Enter a valid amount."); return; }

    setSaving(true);
    setFormError(null);

    const student = studentOptions.find((s) => s.id === addForm.studentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rResult = await (supabase.from("billing_records") as any).insert({
      school_id: schoolId!,
      student_id: addForm.studentId,
      school_year_id: activeYear?.id ?? null,
      class_id: student?.classId ?? null,
      amount_due: parseFloat(addForm.amountDue),
      status: "unpaid",
      due_date: addForm.dueDate || null,
      description: addForm.description.trim() || null,
    });

    if (rResult.error) { setFormError(rResult.error.message); setSaving(false); return; }

    setSaving(false);
    setAddModal(false);
    setAddForm(EMPTY_ADD);
    await loadRecords();
  }

  // Derive unique class names for filter
  const classNames = Array.from(new Set(records.map((r) => r.className).filter((n) => n !== "—")));

  const filtered = records.filter((r) => {
    const matchSearch = !search || r.studentName.toLowerCase().includes(search.toLowerCase());
    const matchClass = !classFilter || r.className === classFilter;
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchClass && matchStatus;
  });

  const totalDue = records.reduce((a, r) => a + r.amountDue, 0);
  const totalPaid = records.reduce((a, r) => a + r.amountPaid, 0);
  const totalBalance = totalDue - totalPaid;

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Track tuition payments and balances</p>
        </div>
        <Button onClick={() => { setAddForm(EMPTY_ADD); setFormError(null); setAddModal(true); }}>
          <Plus className="w-4 h-4" /> Add Billing Record
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Expected</p>
            <p className="text-2xl font-semibold mt-1">{formatCurrency(totalDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Collected</p>
            <p className="text-2xl font-semibold mt-1 text-green-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Outstanding Balance</p>
            <p className="text-2xl font-semibold mt-1 text-red-600">{formatCurrency(totalBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search student..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-40">
          <option value="">All Classes</option>
          {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-40">
          {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Due</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Amount Due</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Paid</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">No billing records found.</td></tr>
              ) : filtered.map((record) => {
                const balance = record.amountDue - record.amountPaid;
                return (
                  <tr key={record.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-4 font-medium">{record.studentName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{record.className}</td>
                    <td className="px-5 py-4 text-muted-foreground">{record.description || formatMonth(record.dueDate)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{record.dueDate ?? "—"}</td>
                    <td className="px-5 py-4 text-right">{formatCurrency(record.amountDue)}</td>
                    <td className="px-5 py-4 text-right text-green-600">{formatCurrency(record.amountPaid)}</td>
                    <td className="px-5 py-4 text-right text-red-600">{formatCurrency(balance)}</td>
                    <td className="px-5 py-4"><Badge variant={record.status}>{record.status}</Badge></td>
                    <td className="px-5 py-4 text-right">
                      {record.status !== "paid" && (
                        <button
                          onClick={() => { setPaymentModal(record); setPayment(EMPTY_PAYMENT); setFormError(null); }}
                          className="flex items-center gap-1 text-sm text-primary hover:underline ml-auto"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payment Modal */}
      <Modal
        open={!!paymentModal}
        onClose={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setFormError(null); }}
        title="Record Payment"
      >
        {paymentModal && (
          <div className="space-y-4">
            {formError && <ErrorAlert message={formError} />}
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><span className="text-muted-foreground">Student:</span> <strong>{paymentModal.studentName}</strong></p>
              <p><span className="text-muted-foreground">Description:</span> {paymentModal.description || formatMonth(paymentModal.dueDate)}</p>
              <p><span className="text-muted-foreground">Balance due:</span> <strong className="text-red-600">{formatCurrency(paymentModal.amountDue - paymentModal.amountPaid)}</strong></p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount Paid *</label>
              <Input type="number" min={0} step={0.01} placeholder="0.00" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <Select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value as PaymentMethod })}>
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Date</label>
              <Input type="date" value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reference / Receipt No.</label>
              <Input placeholder="Optional" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <Textarea placeholder="Optional notes..." value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setPaymentModal(null); setPayment(EMPTY_PAYMENT); setFormError(null); }}>Cancel</Button>
              <Button onClick={handlePayment} disabled={saving || !payment.amount}>{saving ? "Saving…" : "Save Payment"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Record Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setFormError(null); }} title="Add Billing Record">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1">Student *</label>
            <Select value={addForm.studentId} onChange={(e) => setAddForm({ ...addForm, studentId: e.target.value })}>
              <option value="">— Select student —</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} placeholder="e.g. Tuition — April 2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount Due *</label>
              <Input type="number" min={0} step={100} placeholder="0.00" value={addForm.amountDue} onChange={(e) => setAddForm({ ...addForm, amountDue: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <Input type="date" value={addForm.dueDate} onChange={(e) => setAddForm({ ...addForm, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setAddModal(false); setFormError(null); }}>Cancel</Button>
            <Button onClick={handleAddRecord} disabled={saving || !addForm.studentId || !addForm.amountDue}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
