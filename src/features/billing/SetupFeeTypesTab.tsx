"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { SetupFeeType } from "./types";

export function SetupFeeTypesTab({ schoolId }: { schoolId: string }) {
  const supabase = createClient();
  const [feeTypes, setFeeTypes] = useState<SetupFeeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SetupFeeType | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchFeeTypes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("fee_types").select("id, name, description, is_active").eq("school_id", schoolId).order("name");
    setFeeTypes((data ?? []).map((f) => ({ id: f.id, name: f.name, description: f.description ?? "", isActive: f.is_active })));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => { fetchFeeTypes(); }, [fetchFeeTypes]);

  function openAdd() { setEditing(null); setForm({ name: "", description: "" }); setFormError(""); setShowModal(true); }
  function openEdit(f: SetupFeeType) { setEditing(f); setForm({ name: f.name, description: f.description }); setFormError(""); setShowModal(true); }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true); setFormError("");
    if (editing) {
      const { error } = await supabase.from("fee_types").update({ name: form.name.trim(), description: form.description.trim() || null }).eq("id", editing.id);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("fee_types").insert({ school_id: schoolId, name: form.name.trim(), description: form.description.trim() || null });
      if (error) { setFormError(error.message); setSaving(false); return; }
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

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{feeTypes.length} fee type{feeTypes.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Fee Type</Button>
      </div>
      <div className="grid gap-3">
        {feeTypes.length === 0
          ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No fee types yet.</CardContent></Card>
          : feeTypes.map((ft) => (
            <Card key={ft.id}><CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ft.name}</span>
                  {!ft.isActive && <Badge variant="default">Inactive</Badge>}
                </div>
                {ft.description && <p className="text-xs text-muted-foreground mt-0.5">{ft.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleActive(ft)}>{ft.isActive ? "Deactivate" : "Activate"}</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(ft)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => handleDelete(ft.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </CardContent></Card>
          ))}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Fee Type" : "Add Fee Type"}>
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}
          <div><label className="block text-sm font-medium mb-1.5">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Tuition, Books" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Description</label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
          <div className="flex justify-end gap-3"><ModalCancelButton /><Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>
    </>
  );
}
