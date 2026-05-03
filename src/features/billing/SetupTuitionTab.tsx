"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { AcademicPeriod, SetupClassOption, TuitionConfig } from "./types";

export function SetupTuitionTab({ schoolId }: { schoolId: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [tuitionConfigs, setTuitionConfigs] = useState<TuitionConfig[]>([]);
  const [classes, setClasses] = useState<SetupClassOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TuitionConfig | null>(null);
  const [form, setForm] = useState({ classId: "", totalAmount: "", months: "10" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [periodsRes, tuitionRes, classesRes] = await Promise.all([
      supabase.from("academic_periods").select("id, name, school_year_id, start_date, end_date, school_years(name)").eq("school_id", schoolId).order("start_date", { ascending: false }),
      supabase.from("tuition_configs").select("id, academic_period_id, level, total_amount, months, monthly_amount, class_id, academic_periods(name), classes(name)").eq("school_id", schoolId).order("level"),
      supabase.from("classes").select("id, name, school_year_id, class_levels(name)").eq("school_id", schoolId).eq("is_active", true).order("name"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periods = ((periodsRes.data ?? []) as any[]).map((p: any) => ({
      id: p.id, name: p.name, schoolYearId: p.school_year_id,
      schoolYearName: p.school_years?.name ?? "", startDate: p.start_date, endDate: p.end_date,
    })).sort((a, b) => {
      // School year descending (newest year first), then start_date ascending within same year
      const yearCmp = b.schoolYearName.localeCompare(a.schoolYearName);
      if (yearCmp !== 0) return yearCmp;
      return a.startDate.localeCompare(b.startDate);
    });
    setAcademicPeriods(periods);
    if (periods.length > 0) setSelectedPeriodId((prev) => prev || periods[0].id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTuitionConfigs(((tuitionRes.data ?? []) as any[]).map((t: any) => ({
      id: t.id, academicPeriodId: t.academic_period_id, periodName: t.academic_periods?.name ?? "",
      level: t.level ?? "", totalAmount: Number(t.total_amount), months: t.months,
      classId: t.class_id ?? null, className: t.classes?.name ?? null,
      monthlyAmount: t.monthly_amount != null ? Number(t.monthly_amount) : t.months > 0 ? Number(t.total_amount) / t.months : Number(t.total_amount),
    })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setClasses(((classesRes.data ?? []) as any[]).map((c: any) => ({ id: c.id, name: c.name, level: c.class_levels?.name ?? "", schoolYearId: c.school_year_id })));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = tuitionConfigs.filter((t) => t.academicPeriodId === selectedPeriodId);
  const selectedPeriod = academicPeriods.find((p) => p.id === selectedPeriodId);
  const periodClasses = selectedPeriod ? classes.filter((c) => c.schoolYearId === selectedPeriod.schoolYearId) : [];
  const configuredClassIds = new Set(filtered.map((t) => t.classId).filter((id): id is string => !!id && id !== editing?.classId));
  const availableClasses = periodClasses.filter((c) => !configuredClassIds.has(c.id));

  function openAdd() { setEditing(null); setForm({ classId: "", totalAmount: "", months: "10" }); setFormError(""); setShowModal(true); }
  function openEdit(t: TuitionConfig) { setEditing(t); setForm({ classId: t.classId ?? "", totalAmount: String(t.totalAmount), months: String(t.months) }); setFormError(""); setShowModal(true); }

  async function handleSave() {
    if (!form.classId || !form.totalAmount || !selectedPeriodId) { setFormError("Class, amount, and academic period are required."); return; }
    setSaving(true); setFormError("");
    const selectedClass = periodClasses.find((c) => c.id === form.classId);
    const totalAmount = parseFloat(form.totalAmount);
    const months = parseInt(form.months) || 1;
    const monthlyAmount = Math.round((totalAmount / months) * 100) / 100;
    if (editing) {
      const { error } = await supabase.from("tuition_configs").update({ class_id: form.classId, level: selectedClass?.level ?? "", total_amount: totalAmount, months, monthly_amount: monthlyAmount }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("tuition_configs").insert({ school_id: schoolId, academic_period_id: selectedPeriodId, class_id: form.classId, level: selectedClass?.level ?? "", total_amount: totalAmount, months, monthly_amount: monthlyAmount });
      if (error) { setFormError(error.message); setSaving(false); return; }
    }
    setSaving(false); setShowModal(false); fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tuition config?")) return;
    await supabase.from("tuition_configs").delete().eq("id", id);
    fetchAll();
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Academic Period:</label>
          <Select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)}>
            {academicPeriods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.schoolYearName})</option>)}
          </Select>
        </div>
        {selectedPeriodId && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Class</Button>}
      </div>
      {academicPeriods.length === 0
        ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No academic periods found. Set them up in Settings → Academic Periods.</CardContent></Card>
        : <div className="grid gap-3">
            {filtered.length === 0
              ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No tuition configured for this period.</CardContent></Card>
              : filtered.map((t) => (
                <Card key={t.id}><CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.className ?? t.level}</p>
                    {t.className && t.level && <p className="text-xs text-muted-foreground">{t.level}</p>}
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatCurrency(t.totalAmount)} total · {t.months} months · <span className="text-foreground font-medium">{formatCurrency(t.monthlyAmount)}/mo</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </CardContent></Card>
              ))}
          </div>
      }
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Tuition Config" : "Add Tuition Config"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Class *</label>
            <Select value={form.classId} onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}>
              <option value="">— Select class —</option>
              {availableClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ""}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5">Total Amount (PHP) *</label>
              <Input type="number" value={form.totalAmount} onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))} placeholder="e.g. 25000" min="0" /></div>
            <div><label className="block text-sm font-medium mb-1.5">No. of Months</label>
              <Input type="number" value={form.months} onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))} placeholder="e.g. 10" min="1" max="12" /></div>
          </div>
          {form.totalAmount && form.months && (
            <p className="text-sm text-muted-foreground">Monthly: <strong>{formatCurrency(parseFloat(form.totalAmount) / parseInt(form.months || "1"))}</strong></p>
          )}
          <div className="flex justify-end gap-3"><ModalCancelButton /><Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>
    </>
  );
}
