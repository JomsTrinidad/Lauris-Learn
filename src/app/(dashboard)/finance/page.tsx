"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Receipt, BookOpen, Tag, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────
type Tab = "fee-types" | "tuition" | "discounts" | "credits";

interface AcademicPeriod {
  id: string;
  name: string;
  schoolYearName: string;
  startDate: string;
  endDate: string;
}

interface FeeType {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface TuitionConfig {
  id: string;
  academicPeriodId: string;
  periodName: string;
  level: string;
  totalAmount: number;
  months: number;
}

type DiscountType = "fixed" | "percentage" | "credit";
type DiscountScope = "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom";

interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  scope: DiscountScope;
  value: number;
  isActive: boolean;
}

interface StudentCredit {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  reason: string;
  appliedTo: string | null;
  createdAt: string;
}

interface StudentOption {
  id: string;
  name: string;
}

const SCOPE_LABELS: Record<DiscountScope, string> = {
  summer_to_sy: "Summer → School Year",
  full_payment: "Full Payment",
  early_enrollment: "Early Enrollment",
  sibling: "Sibling",
  custom: "Custom",
};

const TYPE_LABELS: Record<DiscountType, string> = {
  fixed: "Fixed Amount",
  percentage: "Percentage",
  credit: "Credit",
};

// ─────────────────────────────────────
// Tab Button
// ─────────────────────────────────────
function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ─────────────────────────────────────
// Main Page
// ─────────────────────────────────────
export default function FinancePage() {
  const { schoolId } = useSchoolContext();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<Tab>("fee-types");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Data
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [tuitionConfigs, setTuitionConfigs] = useState<TuitionConfig[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [credits, setCredits] = useState<StudentCredit[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  const fetchAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError("");

    const [periodsRes, feeRes, tuitionRes, discountRes, creditsRes, studentsRes] = await Promise.all([
      supabase
        .from("academic_periods")
        .select("id, name, start_date, end_date, school_years(name)")
        .eq("school_id", schoolId)
        .order("start_date"),
      supabase
        .from("fee_types")
        .select("id, name, description, is_active")
        .eq("school_id", schoolId)
        .order("name"),
      supabase
        .from("tuition_configs")
        .select("id, academic_period_id, level, total_amount, months, academic_periods(name)")
        .eq("school_id", schoolId)
        .order("level"),
      supabase
        .from("discounts")
        .select("id, name, type, scope, value, is_active")
        .eq("school_id", schoolId)
        .order("name"),
      supabase
        .from("student_credits")
        .select("id, student_id, amount, reason, applied_to, created_at, students(first_name, last_name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId)
        .order("last_name"),
    ]);

    if (periodsRes.error) { setError(periodsRes.error.message); setLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAcademicPeriods((periodsRes.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      schoolYearName: p.school_years?.name ?? "",
      startDate: p.start_date,
      endDate: p.end_date,
    })));

    setFeeTypes((feeRes.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description ?? "",
      isActive: f.is_active,
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTuitionConfigs((tuitionRes.data ?? []).map((t: any) => ({
      id: t.id,
      academicPeriodId: t.academic_period_id,
      periodName: t.academic_periods?.name ?? "",
      level: t.level,
      totalAmount: Number(t.total_amount),
      months: t.months,
    })));

    setDiscounts((discountRes.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type as DiscountType,
      scope: d.scope as DiscountScope,
      value: Number(d.value),
      isActive: d.is_active,
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCredits((creditsRes.data ?? []).map((c: any) => ({
      id: c.id,
      studentId: c.student_id,
      studentName: c.students ? `${c.students.last_name}, ${c.students.first_name}` : "Unknown",
      amount: Number(c.amount),
      reason: c.reason ?? "",
      appliedTo: c.applied_to,
      createdAt: c.created_at,
    })));

    setStudents((studentsRes.data ?? []).map((s) => ({
      id: s.id,
      name: `${s.last_name}, ${s.first_name}`,
    })));

    setLoading(false);
  }, [schoolId, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1>Finance Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure fee types, tuition rates, discounts, and student credits.</p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1 bg-muted rounded-xl">
        <TabButton active={activeTab === "fee-types"}  onClick={() => setActiveTab("fee-types")}  icon={Receipt}    label="Fee Types" />
        <TabButton active={activeTab === "tuition"}    onClick={() => setActiveTab("tuition")}    icon={BookOpen}   label="Tuition Setup" />
        <TabButton active={activeTab === "discounts"}  onClick={() => setActiveTab("discounts")}  icon={Tag}        label="Discounts" />
        <TabButton active={activeTab === "credits"}    onClick={() => setActiveTab("credits")}    icon={CreditCard} label="Student Credits" />
      </div>

      {activeTab === "fee-types" && (
        <FeeTypesTab
          feeTypes={feeTypes}
          schoolId={schoolId!}
          onRefresh={fetchAll}
        />
      )}
      {activeTab === "tuition" && (
        <TuitionTab
          tuitionConfigs={tuitionConfigs}
          academicPeriods={academicPeriods}
          schoolId={schoolId!}
          onRefresh={fetchAll}
        />
      )}
      {activeTab === "discounts" && (
        <DiscountsTab
          discounts={discounts}
          schoolId={schoolId!}
          onRefresh={fetchAll}
        />
      )}
      {activeTab === "credits" && (
        <CreditsTab
          credits={credits}
          students={students}
          schoolId={schoolId!}
          onRefresh={fetchAll}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────
// Fee Types Tab
// ─────────────────────────────────────
function FeeTypesTab({ feeTypes, schoolId, onRefresh }: {
  feeTypes: FeeType[]; schoolId: string; onRefresh: () => void;
}) {
  const supabase = createClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() {
    setEditing(null);
    setForm({ name: "", description: "" });
    setFormError("");
    setShowModal(true);
  }

  function openEdit(f: FeeType) {
    setEditing(f);
    setForm({ name: f.name, description: f.description });
    setFormError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true);
    setFormError("");

    if (editing) {
      const { error } = await supabase.from("fee_types").update({
        name: form.name.trim(), description: form.description.trim() || null,
      }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("fee_types").insert({
        school_id: schoolId, name: form.name.trim(), description: form.description.trim() || null,
      });
      if (error) { setFormError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  async function toggleActive(f: FeeType) {
    await supabase.from("fee_types").update({ is_active: !f.isActive }).eq("id", f.id);
    onRefresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this fee type?")) return;
    await supabase.from("fee_types").delete().eq("id", id);
    onRefresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{feeTypes.length} fee type{feeTypes.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Fee Type</Button>
      </div>

      <div className="grid gap-3">
        {feeTypes.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No fee types yet.</CardContent></Card>
        ) : feeTypes.map((ft) => (
          <Card key={ft.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ft.name}</span>
                  {!ft.isActive && <Badge variant="default">Inactive</Badge>}
                </div>
                {ft.description && <p className="text-xs text-muted-foreground mt-0.5">{ft.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleActive(ft)}>
                  {ft.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(ft)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(ft.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Fee Type" : "Add Fee Type"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Tuition, Books" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────
// Tuition Setup Tab
// ─────────────────────────────────────
function TuitionTab({ tuitionConfigs, academicPeriods, schoolId, onRefresh }: {
  tuitionConfigs: TuitionConfig[];
  academicPeriods: AcademicPeriod[];
  schoolId: string;
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(academicPeriods[0]?.id ?? "");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TuitionConfig | null>(null);
  const [form, setForm] = useState({ level: "", totalAmount: "", months: "10" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const filtered = tuitionConfigs.filter((t) => t.academicPeriodId === selectedPeriodId);

  function openAdd() {
    setEditing(null);
    setForm({ level: "", totalAmount: "", months: "10" });
    setFormError("");
    setShowModal(true);
  }

  function openEdit(t: TuitionConfig) {
    setEditing(t);
    setForm({ level: t.level, totalAmount: String(t.totalAmount), months: String(t.months) });
    setFormError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.level.trim() || !form.totalAmount || !selectedPeriodId) {
      setFormError("Level, amount, and academic period are required.");
      return;
    }
    setSaving(true);
    setFormError("");

    if (editing) {
      const { error } = await supabase.from("tuition_configs").update({
        level: form.level.trim(),
        total_amount: parseFloat(form.totalAmount),
        months: parseInt(form.months),
      }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("tuition_configs").insert({
        school_id: schoolId,
        academic_period_id: selectedPeriodId,
        level: form.level.trim(),
        total_amount: parseFloat(form.totalAmount),
        months: parseInt(form.months),
      });
      if (error) { setFormError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tuition config?")) return;
    await supabase.from("tuition_configs").delete().eq("id", id);
    onRefresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Academic Period:</label>
          <Select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="w-56"
          >
            {academicPeriods.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.schoolYearName})</option>
            ))}
          </Select>
        </div>
        {selectedPeriodId && (
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Level</Button>
        )}
      </div>

      {academicPeriods.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No academic periods found. Set them up in Settings → Academic Periods.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No tuition configured for this period. Click "Add Level" to start.
            </CardContent></Card>
          ) : filtered.map((t) => {
            const monthly = t.months > 0 ? t.totalAmount / t.months : 0;
            return (
              <Card key={t.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.level}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(t.totalAmount)} total · {t.months} months ·{" "}
                      <span className="text-foreground font-medium">{formatCurrency(monthly)}/mo</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Tuition" : "Add Tuition Level"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Level / Class Name *</label>
            <Input
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              placeholder="e.g. Toddlers, Pre-Kinder, Kinder"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Total Amount (PHP) *</label>
              <Input
                type="number"
                value={form.totalAmount}
                onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                placeholder="e.g. 25000"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">No. of Months</label>
              <Input
                type="number"
                value={form.months}
                onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))}
                placeholder="e.g. 10"
                min="1"
                max="12"
              />
            </div>
          </div>
          {form.totalAmount && form.months && (
            <p className="text-sm text-muted-foreground">
              Monthly equivalent: <strong>
                {formatCurrency(parseFloat(form.totalAmount) / parseInt(form.months || "1"))}
              </strong>
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────
// Discounts Tab
// ─────────────────────────────────────
function DiscountsTab({ discounts, schoolId, onRefresh }: {
  discounts: Discount[]; schoolId: string; onRefresh: () => void;
}) {
  const supabase = createClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState({ name: "", type: "fixed" as DiscountType, scope: "custom" as DiscountScope, value: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() {
    setEditing(null);
    setForm({ name: "", type: "fixed", scope: "custom", value: "" });
    setFormError("");
    setShowModal(true);
  }

  function openEdit(d: Discount) {
    setEditing(d);
    setForm({ name: d.name, type: d.type, scope: d.scope, value: String(d.value) });
    setFormError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.value) { setFormError("Name and value are required."); return; }
    setSaving(true);
    setFormError("");

    if (editing) {
      const { error } = await supabase.from("discounts").update({
        name: form.name.trim(), type: form.type, scope: form.scope, value: parseFloat(form.value),
      }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("discounts").insert({
        school_id: schoolId, name: form.name.trim(), type: form.type,
        scope: form.scope, value: parseFloat(form.value),
      });
      if (error) { setFormError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  async function toggleActive(d: Discount) {
    await supabase.from("discounts").update({ is_active: !d.isActive }).eq("id", d.id);
    onRefresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this discount?")) return;
    await supabase.from("discounts").delete().eq("id", id);
    onRefresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{discounts.length} discount{discounts.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Discount</Button>
      </div>

      <div className="grid gap-3">
        {discounts.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No discounts configured.</CardContent></Card>
        ) : discounts.map((d) => (
          <Card key={d.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{d.name}</span>
                  <Badge variant="default">{SCOPE_LABELS[d.scope]}</Badge>
                  {!d.isActive && <Badge variant="default">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {TYPE_LABELS[d.type]}: {d.type === "percentage" ? `${d.value}%` : formatCurrency(d.value)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}>
                  {d.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(d.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Discount" : "Add Discount"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Discount Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sibling Discount" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Type</label>
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DiscountType }))}>
                <option value="fixed">Fixed Amount</option>
                <option value="percentage">Percentage</option>
                <option value="credit">Credit</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Scope</label>
              <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as DiscountScope }))}>
                <option value="custom">Custom</option>
                <option value="full_payment">Full Payment</option>
                <option value="early_enrollment">Early Enrollment</option>
                <option value="sibling">Sibling</option>
                <option value="summer_to_sy">Summer → School Year</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Value {form.type === "percentage" ? "(%)" : "(PHP)"} *
            </label>
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.type === "percentage" ? "e.g. 10" : "e.g. 500"}
              min="0"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────
// Student Credits Tab
// ─────────────────────────────────────
function CreditsTab({ credits, students, schoolId, onRefresh }: {
  credits: StudentCredit[]; students: StudentOption[]; schoolId: string; onRefresh: () => void;
}) {
  const supabase = createClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ studentId: "", amount: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");

  const filtered = credits.filter((c) =>
    c.studentName.toLowerCase().includes(search.toLowerCase()) ||
    c.reason.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setForm({ studentId: students[0]?.id ?? "", amount: "", reason: "" });
    setFormError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.studentId || !form.amount) { setFormError("Student and amount are required."); return; }
    const parsed = parseFloat(form.amount);
    if (isNaN(parsed) || parsed <= 0) { setFormError("Amount must be a positive number."); return; }
    setSaving(true);
    setFormError("");

    const { error } = await supabase.from("student_credits").insert({
      school_id: schoolId,
      student_id: form.studentId,
      amount: parsed,
      reason: form.reason.trim() || null,
    });

    if (error) { setFormError(error.message); setSaving(false); return; }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  const totalCredits = credits.reduce((sum, c) => sum + c.amount, 0);
  const appliedCredits = credits.filter((c) => c.appliedTo).reduce((sum, c) => sum + c.amount, 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Credits Issued</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(totalCredits)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Applied to Billing</p>
          <p className="text-2xl font-semibold mt-1 text-green-600">{formatCurrency(appliedCredits)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Outstanding Credits</p>
          <p className="text-2xl font-semibold mt-1 text-amber-600">{formatCurrency(totalCredits - appliedCredits)}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student or reason…"
          className="max-w-xs"
        />
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Issue Credit</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No credits found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Student</th>
                    <th className="text-left px-4 py-3 font-medium">Reason</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.reason || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(c.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.appliedTo
                          ? <Badge variant="enrolled">Applied</Badge>
                          : <Badge variant="inquiry">Pending</Badge>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("en-PH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Issue Student Credit">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Student *</label>
            <Select value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Amount (PHP) *</label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="e.g. 500"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Reason</label>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Converted from sibling discount"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Issue Credit"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
