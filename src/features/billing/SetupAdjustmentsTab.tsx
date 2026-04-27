"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SCOPE_LABELS, TYPE_LABELS } from "./constants";
import type { Discount, DiscountScope, DiscountType, SimpleStudent, StudentCredit } from "./types";

export function SetupAdjustmentsTab({ schoolId }: { schoolId: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [credits, setCredits] = useState<StudentCredit[]>([]);
  const [students, setStudents] = useState<SimpleStudent[]>([]);

  // Discount modal state
  const [showDiscModal, setShowDiscModal] = useState(false);
  const [editingDisc, setEditingDisc] = useState<Discount | null>(null);
  const [discForm, setDiscForm] = useState({ name: "", type: "fixed" as DiscountType, scope: "custom" as DiscountScope, value: "" });
  const [discSaving, setDiscSaving] = useState(false);
  const [discError, setDiscError] = useState("");

  // Credit modal state
  const [showCredModal, setShowCredModal] = useState(false);
  const [credForm, setCredForm] = useState({ studentId: "", amount: "", reason: "" });
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSearch, setCredSearch] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [discRes, credRes, studRes] = await Promise.all([
      supabase.from("discounts").select("id, name, type, scope, value, is_active").eq("school_id", schoolId).order("name"),
      supabase.from("student_credits").select("id, student_id, amount, reason, applied_to, created_at, students(first_name, last_name)").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(50),
      supabase.from("students").select("id, first_name, last_name").eq("school_id", schoolId).order("last_name"),
    ]);
    setDiscounts((discRes.data ?? []).map((d) => ({ id: d.id, name: d.name, type: d.type as DiscountType, scope: d.scope as DiscountScope, value: Number(d.value), isActive: d.is_active })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCredits(((credRes.data ?? []) as any[]).map((c: any) => ({
      id: c.id, studentId: c.student_id,
      studentName: c.students ? `${c.students.last_name}, ${c.students.first_name}` : "Unknown",
      amount: Number(c.amount), reason: c.reason ?? "", appliedTo: c.applied_to, createdAt: c.created_at,
    })));
    setStudents((studRes.data ?? []).map((s) => ({ id: s.id, name: `${s.last_name}, ${s.first_name}` })));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Discount handlers
  function openAddDisc() { setEditingDisc(null); setDiscForm({ name: "", type: "fixed", scope: "custom", value: "" }); setDiscError(""); setShowDiscModal(true); }
  function openEditDisc(d: Discount) { setEditingDisc(d); setDiscForm({ name: d.name, type: d.type, scope: d.scope, value: String(d.value) }); setDiscError(""); setShowDiscModal(true); }
  async function handleSaveDisc() {
    if (!discForm.name.trim() || !discForm.value) { setDiscError("Name and value are required."); return; }
    setDiscSaving(true); setDiscError("");
    if (editingDisc) {
      const { error } = await supabase.from("discounts").update({ name: discForm.name.trim(), type: discForm.type, scope: discForm.scope, value: parseFloat(discForm.value) }).eq("id", editingDisc.id);
      if (error) { setDiscError(error.message); setDiscSaving(false); return; }
    } else {
      const { error } = await supabase.from("discounts").insert({ school_id: schoolId, name: discForm.name.trim(), type: discForm.type, scope: discForm.scope, value: parseFloat(discForm.value) });
      if (error) { setDiscError(error.message); setDiscSaving(false); return; }
    }
    setDiscSaving(false); setShowDiscModal(false); fetchAll();
  }
  async function toggleDisc(d: Discount) { await supabase.from("discounts").update({ is_active: !d.isActive }).eq("id", d.id); fetchAll(); }
  async function deleteDisc(id: string) { if (!confirm("Delete this discount?")) return; await supabase.from("discounts").delete().eq("id", id); fetchAll(); }

  // Credit handlers
  function openAddCred() { setCredForm({ studentId: students[0]?.id ?? "", amount: "", reason: "" }); setCredError(""); setShowCredModal(true); }
  async function handleSaveCred() {
    if (!credForm.studentId || !credForm.amount) { setCredError("Student and amount are required."); return; }
    const parsed = parseFloat(credForm.amount);
    if (isNaN(parsed) || parsed <= 0) { setCredError("Amount must be a positive number."); return; }
    setCredSaving(true); setCredError("");
    const { error } = await supabase.from("student_credits").insert({ school_id: schoolId, student_id: credForm.studentId, amount: parsed, reason: credForm.reason.trim() || null });
    if (error) { setCredError(error.message); setCredSaving(false); return; }
    setCredSaving(false); setShowCredModal(false); fetchAll();
  }

  const filteredCredits = credits.filter((c) =>
    c.studentName.toLowerCase().includes(credSearch.toLowerCase()) ||
    c.reason.toLowerCase().includes(credSearch.toLowerCase())
  );
  const totalCredits = credits.reduce((a, c) => a + c.amount, 0);
  const appliedCredits = credits.filter((c) => c.appliedTo).reduce((a, c) => a + c.amount, 0);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>;

  return (
    <div className="space-y-10">
      {/* Discounts section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-sm">Discounts</p>
            <p className="text-xs text-muted-foreground mt-0.5">{discounts.length} discount{discounts.length !== 1 ? "s" : ""} configured</p>
          </div>
          <Button size="sm" onClick={openAddDisc}><Plus className="w-4 h-4 mr-1" /> Add Discount</Button>
        </div>
        <div className="grid gap-3">
          {discounts.length === 0
            ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No discounts configured.</CardContent></Card>
            : discounts.map((d) => (
              <Card key={d.id}><CardContent className="p-4 flex items-center justify-between">
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
                  <Button size="sm" variant="ghost" onClick={() => toggleDisc(d)}>{d.isActive ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDisc(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => deleteDisc(d.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </CardContent></Card>
            ))}
        </div>
      </div>

      {/* Student Credits section */}
      <div className="border-t border-border pt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-sm">Student Credits</p>
            <p className="text-xs text-muted-foreground mt-0.5">Issued: {formatCurrency(totalCredits)} · Applied: {formatCurrency(appliedCredits)} · Outstanding: {formatCurrency(totalCredits - appliedCredits)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={credSearch} onChange={(e) => setCredSearch(e.target.value)} placeholder="Search…" className="w-44 h-8 text-sm" />
            <Button size="sm" onClick={openAddCred}><Plus className="w-4 h-4 mr-1" /> Issue Credit</Button>
          </div>
        </div>
        <Card><CardContent className="p-0">
          {filteredCredits.length === 0
            ? <p className="p-8 text-center text-sm text-muted-foreground">No credits found.</p>
            : <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Student</th>
                  <th className="text-left px-4 py-3 font-medium">Reason</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {filteredCredits.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.studentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.reason || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(c.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.appliedTo ? <Badge variant="enrolled">Applied</Badge> : <Badge variant="inquiry">Pending</Badge>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-PH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>}
        </CardContent></Card>
      </div>

      {/* Discount modal */}
      <Modal open={showDiscModal} onClose={() => setShowDiscModal(false)} title={editingDisc ? "Edit Discount" : "Add Discount"}>
        <div className="space-y-4">
          {discError && <ErrorAlert message={discError} />}
          <div><label className="block text-sm font-medium mb-1.5">Discount Name *</label>
            <Input value={discForm.name} onChange={(e) => setDiscForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sibling Discount" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5">Type</label>
              <Select value={discForm.type} onChange={(e) => setDiscForm((f) => ({ ...f, type: e.target.value as DiscountType }))}>
                <option value="fixed">Fixed Amount</option><option value="percentage">Percentage</option><option value="credit">Credit</option>
              </Select></div>
            <div><label className="block text-sm font-medium mb-1.5">Scope</label>
              <Select value={discForm.scope} onChange={(e) => setDiscForm((f) => ({ ...f, scope: e.target.value as DiscountScope }))}>
                <option value="custom">Custom</option><option value="full_payment">Full Payment</option>
                <option value="early_enrollment">Early Enrollment</option><option value="sibling">Sibling</option>
                <option value="summer_to_sy">Summer → School Year</option>
              </Select></div>
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Value {discForm.type === "percentage" ? "(%)" : "(PHP)"} *</label>
            <Input type="number" value={discForm.value} onChange={(e) => setDiscForm((f) => ({ ...f, value: e.target.value }))} placeholder={discForm.type === "percentage" ? "e.g. 10" : "e.g. 500"} min="0" /></div>
          <div className="flex justify-end gap-3"><ModalCancelButton /><Button onClick={handleSaveDisc} disabled={discSaving}>{discSaving ? "Saving…" : "Save"}</Button></div>
        </div>
      </Modal>

      {/* Credit modal */}
      <Modal open={showCredModal} onClose={() => setShowCredModal(false)} title="Issue Student Credit">
        <div className="space-y-4">
          {credError && <ErrorAlert message={credError} />}
          <div><label className="block text-sm font-medium mb-1.5">Student *</label>
            <Select value={credForm.studentId} onChange={(e) => setCredForm((f) => ({ ...f, studentId: e.target.value }))}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></div>
          <div><label className="block text-sm font-medium mb-1.5">Amount (PHP) *</label>
            <Input type="number" value={credForm.amount} onChange={(e) => setCredForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" min="0" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Reason</label>
            <Textarea value={credForm.reason} onChange={(e) => setCredForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Converted from sibling discount" rows={2} /></div>
          <div className="flex justify-end gap-3"><ModalCancelButton /><Button onClick={handleSaveCred} disabled={credSaving}>{credSaving ? "Saving…" : "Issue Credit"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
