"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { SetupFeeType } from "./types";

interface FeeTypeYearPrice { fee_type_id: string; amount: number; }

export function SetupFeeTypesTab({
  schoolId,
  schoolYearId,
  schoolYearName,
}: {
  schoolId: string;
  schoolYearId?: string | null;
  schoolYearName?: string | null;
}) {
  const supabase = createClient();
  const [feeTypes, setFeeTypes] = useState<SetupFeeType[]>([]);
  const [yearPrices, setYearPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SetupFeeType | null>(null);
  const [form, setForm] = useState({ name: "", description: "", isEnrollmentMandatory: false, yearPrice: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchFeeTypes = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("fee_types")
      .select("id, name, description, is_active, secures_placement, is_enrollment_mandatory")
      .eq("school_id", schoolId)
      .order("is_enrollment_mandatory", { ascending: false })
      .order("name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFeeTypes((data ?? []).map((f: any) => ({
      id: f.id, name: f.name, description: f.description ?? "",
      isActive: f.is_active, securesPlacement: f.secures_placement ?? false,
      isEnrollmentMandatory: f.is_enrollment_mandatory ?? false,
    })));

    // Load year-specific prices if we have a school year
    if (schoolYearId && data && data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feeTypeIds = (data as any[]).map((f: any) => f.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prices } = await (supabase as any)
        .from("fee_type_prices")
        .select("fee_type_id, amount")
        .eq("school_year_id", schoolYearId)
        .in("fee_type_id", feeTypeIds);
      const map: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((prices ?? []) as FeeTypeYearPrice[]).forEach((p) => { map[p.fee_type_id] = p.amount; });
      setYearPrices(map);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, schoolYearId]);

  useEffect(() => { fetchFeeTypes(); }, [fetchFeeTypes]);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", description: "", isEnrollmentMandatory: false, yearPrice: "" });
    setFormError(""); setShowModal(true);
  }
  function openEdit(f: SetupFeeType) {
    setEditing(f);
    const existing = yearPrices[f.id];
    setForm({
      name: f.name, description: f.description,
      isEnrollmentMandatory: f.isEnrollmentMandatory,
      yearPrice: existing != null ? existing.toString() : "",
    });
    setFormError(""); setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true); setFormError("");

    let feeTypeId: string | null = editing?.id ?? null;

    if (editing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("fee_types").update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_enrollment_mandatory: form.isEnrollmentMandatory,
      }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error } = await (supabase as any).from("fee_types").insert({
        school_id: schoolId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_enrollment_mandatory: form.isEnrollmentMandatory,
      }).select("id").single();
      if (error) { setFormError(error.message); setSaving(false); return; }
      feeTypeId = inserted?.id ?? null;
    }

    // Save year-specific price if school year is set
    if (schoolYearId && feeTypeId && form.yearPrice.trim() !== "") {
      const amt = parseFloat(form.yearPrice);
      if (!isNaN(amt) && amt >= 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("fee_type_prices").upsert({
          fee_type_id: feeTypeId,
          school_year_id: schoolYearId,
          school_id: schoolId,
          amount: amt,
        }, { onConflict: "fee_type_id,school_year_id" });
      }
    }

    setSaving(false); setShowModal(false); fetchFeeTypes();
  }

  async function toggleActive(f: SetupFeeType) {
    await supabase.from("fee_types").update({ is_active: !f.isActive }).eq("id", f.id);
    fetchFeeTypes();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this fee type?")) return;
    await supabase.from("fee_types").delete().eq("id", id);
    fetchFeeTypes();
  }

  async function toggleSecures(ft: SetupFeeType) {
    if (ft.securesPlacement) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("fee_types").update({ secures_placement: false }).eq("id", ft.id);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("fee_types").update({ secures_placement: false }).eq("school_id", schoolId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("fee_types").update({ secures_placement: true }).eq("id", ft.id);
    }
    fetchFeeTypes();
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">{feeTypes.length} fee type{feeTypes.length !== 1 ? "s" : ""}</p>
          {schoolYearName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Prices shown are for <span className="font-medium text-foreground">{schoolYearName}</span>. Prices per year are independent.
            </p>
          )}
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Fee Type</Button>
      </div>
      <div className="grid gap-3">
        {feeTypes.length === 0
          ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No fee types yet.</CardContent></Card>
          : feeTypes.map((ft) => {
            const yearPrice = yearPrices[ft.id];
            return (
              <Card key={ft.id}><CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{ft.name}</span>
                    {!ft.isActive && <Badge variant="default">Inactive</Badge>}
                    {ft.securesPlacement && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        <Lock className="w-3 h-3" /> Secures slot
                      </span>
                    )}
                    {ft.isEnrollmentMandatory && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        Mandatory at enrollment
                      </span>
                    )}
                  </div>
                  {ft.description && <p className="text-xs text-muted-foreground mt-0.5">{ft.description}</p>}
                  {schoolYearName && (
                    <p className="text-xs mt-1">
                      <span className="text-muted-foreground">{schoolYearName} price: </span>
                      <span className="font-medium">
                        {yearPrice != null ? `₱${yearPrice.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : <span className="text-muted-foreground italic">not set</span>}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleSecures(ft)}
                    title={ft.securesPlacement ? "Remove slot gate" : "Set as slot payment gate"}
                    className={`p-1.5 rounded-md border transition-colors text-xs ${ft.securesPlacement ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {ft.securesPlacement ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(ft)}>{ft.isActive ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(ft)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(ft.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </CardContent></Card>
            );
          })}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Fee Type" : "Add Fee Type"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div>
            <label className="block text-sm font-medium mb-1.5">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Registration Fee, Books & Materials" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enrollment-mandatory"
              checked={form.isEnrollmentMandatory}
              onChange={(e) => setForm((f) => ({ ...f, isEnrollmentMandatory: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="enrollment-mandatory" className="text-sm font-medium cursor-pointer">
              Mandatory at enrollment
            </label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Pre-checked and required when recording enrollment payments.</p>
          {schoolYearId && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Price for {schoolYearName ?? "current year"} <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.yearPrice}
                  onChange={(e) => setForm((f) => ({ ...f, yearPrice: e.target.value }))}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sets the default amount for this fee type in {schoolYearName ?? "the selected year"}. Prices for other years are not affected.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
