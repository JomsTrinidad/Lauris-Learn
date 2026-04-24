"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type SchoolYearStatus = "draft" | "active" | "archived";

interface SchoolYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SchoolYearStatus;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  appliesToAll: boolean;
  isNoClass: boolean;
  notes: string;
}

const SECTIONS = ["School Information", "School Years", "Academic Periods", "Holidays"] as const;
type Section = (typeof SECTIONS)[number];

interface AcademicPeriod {
  id: string;
  schoolYearId: string;
  schoolYearName: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export default function SettingsPage() {
  const { schoolId, schoolName: ctxSchoolName, refresh: refreshCtx } = useSchoolContext();
  const supabase = createClient();

  const [activeSection, setActiveSection] = useState<Section>("School Information");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // School info
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: "", branchName: "", address: "", phone: "", email: "",
  });

  // School years
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [syModal, setSyModal] = useState(false);
  const [editingSy, setEditingSy] = useState<SchoolYear | null>(null);
  const [syForm, setSyForm] = useState({ name: "", startDate: "", endDate: "", status: "draft" as SchoolYearStatus });

  // Academic Periods
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [periodModal, setPeriodModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<AcademicPeriod | null>(null);
  const [periodForm, setPeriodForm] = useState({ schoolYearId: "", name: "", startDate: "", endDate: "", isActive: false });

  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayModal, setHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", appliesToAll: true, isNoClass: true, notes: "" });

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const [{ data: school }, { data: branches }, { data: years }, { data: hols }, { data: periods }] =
      await Promise.all([
        supabase.from("schools").select("name").eq("id", schoolId).single(),
        supabase.from("branches").select("name, address").eq("school_id", schoolId).limit(1).maybeSingle(),
        supabase.from("school_years").select("id, name, start_date, end_date, status").eq("school_id", schoolId).order("start_date", { ascending: false }),
        supabase.from("holidays").select("id, name, date, applies_to_all, is_no_class, notes").eq("school_id", schoolId).order("date"),
        supabase.from("academic_periods").select("id, school_year_id, name, start_date, end_date, is_active, school_years(name)").eq("school_id", schoolId).order("start_date"),
      ]);

    setSchoolInfo({
      schoolName: school?.name ?? "",
      branchName: (branches as { name: string; address: string } | null)?.name ?? "",
      address: (branches as { name: string; address: string } | null)?.address ?? "",
      phone: "", email: "",
    });

    setSchoolYears((years ?? []).map((y) => ({
      id: y.id, name: y.name,
      startDate: y.start_date, endDate: y.end_date,
      status: y.status as SchoolYearStatus,
    })));

    setHolidays((hols ?? []).map((h) => ({
      id: h.id, name: h.name, date: h.date,
      appliesToAll: h.applies_to_all, isNoClass: h.is_no_class,
      notes: h.notes ?? "",
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAcademicPeriods((periods ?? []).map((p: any) => ({
      id: p.id,
      schoolYearId: p.school_year_id,
      schoolYearName: p.school_years?.name ?? "",
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
      isActive: p.is_active,
    })));

    setLoading(false);
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── School Info ──
  async function saveSchoolInfo() {
    if (!schoolId) return;
    setSaving(true);
    const { error: e1 } = await supabase.from("schools").update({ name: schoolInfo.schoolName }).eq("id", schoolId);
    // Upsert branch (simplified: update first branch or create)
    const { data: existing } = await supabase.from("branches").select("id").eq("school_id", schoolId).limit(1).maybeSingle();
    if (existing?.id) {
      await supabase.from("branches").update({ name: schoolInfo.branchName, address: schoolInfo.address }).eq("id", existing.id);
    } else if (schoolInfo.branchName) {
      await supabase.from("branches").insert({ school_id: schoolId, name: schoolInfo.branchName, address: schoolInfo.address });
    }
    if (e1) { setError(e1.message); } else { refreshCtx(); }
    setSaving(false);
  }

  // ── School Years ──
  function openAddSy() {
    setEditingSy(null);
    setSyForm({ name: "", startDate: "", endDate: "", status: "draft" });
    setSyModal(true);
  }
  function openEditSy(sy: SchoolYear) {
    setEditingSy(sy);
    setSyForm({ name: sy.name, startDate: sy.startDate, endDate: sy.endDate, status: sy.status });
    setSyModal(true);
  }
  async function saveSy() {
    if (!schoolId) return;
    setSaving(true);
    setError(null);

    // If setting active, first demote any current active year
    if (syForm.status === "active") {
      await supabase.from("school_years").update({ status: "draft" }).eq("school_id", schoolId).eq("status", "active");
    }

    if (editingSy) {
      const { error: e } = await supabase.from("school_years").update({
        name: syForm.name, start_date: syForm.startDate, end_date: syForm.endDate, status: syForm.status,
      }).eq("id", editingSy.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("school_years").insert({
        school_id: schoolId, name: syForm.name,
        start_date: syForm.startDate, end_date: syForm.endDate, status: syForm.status,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setSyModal(false);
    setSaving(false);
    if (syForm.status === "active") refreshCtx();
    await load();
  }

  async function setActiveSy(id: string) {
    if (!schoolId) return;
    await supabase.from("school_years").update({ status: "draft" }).eq("school_id", schoolId).eq("status", "active");
    await supabase.from("school_years").update({ status: "active" }).eq("id", id);
    refreshCtx();
    await load();
  }

  // ── Academic Periods ──
  function openAddPeriod() {
    setEditingPeriod(null);
    setPeriodForm({ schoolYearId: schoolYears[0]?.id ?? "", name: "", startDate: "", endDate: "", isActive: false });
    setPeriodModal(true);
  }
  function openEditPeriod(p: AcademicPeriod) {
    setEditingPeriod(p);
    setPeriodForm({ schoolYearId: p.schoolYearId, name: p.name, startDate: p.startDate, endDate: p.endDate, isActive: p.isActive });
    setPeriodModal(true);
  }
  async function savePeriod() {
    if (!schoolId || !periodForm.schoolYearId || !periodForm.name.trim() || !periodForm.startDate || !periodForm.endDate) {
      setError("School year, name, start date, and end date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    if (editingPeriod) {
      const { error: e } = await supabase.from("academic_periods").update({
        school_year_id: periodForm.schoolYearId,
        name: periodForm.name.trim(),
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
        is_active: periodForm.isActive,
      }).eq("id", editingPeriod.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("academic_periods").insert({
        school_id: schoolId,
        school_year_id: periodForm.schoolYearId,
        name: periodForm.name.trim(),
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
        is_active: periodForm.isActive,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setPeriodModal(false);
    setSaving(false);
    await load();
  }
  async function deletePeriod(id: string) {
    if (!confirm("Delete this academic period?")) return;
    await supabase.from("academic_periods").delete().eq("id", id);
    setAcademicPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Holidays ──
  function openAddHoliday() {
    setEditingHoliday(null);
    setHolidayForm({ name: "", date: "", appliesToAll: true, isNoClass: true, notes: "" });
    setHolidayModal(true);
  }
  function openEditHoliday(h: Holiday) {
    setEditingHoliday(h);
    setHolidayForm({ name: h.name, date: h.date, appliesToAll: h.appliesToAll, isNoClass: h.isNoClass, notes: h.notes });
    setHolidayModal(true);
  }
  async function saveHoliday() {
    if (!schoolId) return;
    setSaving(true);
    setError(null);
    if (editingHoliday) {
      const { error: e } = await supabase.from("holidays").update({
        name: holidayForm.name, date: holidayForm.date,
        applies_to_all: holidayForm.appliesToAll, is_no_class: holidayForm.isNoClass,
        notes: holidayForm.notes,
      }).eq("id", editingHoliday.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("holidays").insert({
        school_id: schoolId, name: holidayForm.name, date: holidayForm.date,
        applies_to_all: holidayForm.appliesToAll, is_no_class: holidayForm.isNoClass,
        notes: holidayForm.notes,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setHolidayModal(false);
    setSaving(false);
    await load();
  }
  async function deleteHoliday(id: string) {
    await supabase.from("holidays").delete().eq("id", id);
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  if (!schoolId) {
    return (
      <div className="space-y-4">
        <h1>Settings</h1>
        <ErrorAlert message="Your account is not linked to a school yet. Ask your Super Admin to assign you to a school." />
      </div>
    );
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your school, school years, and holidays</p>
      </div>
      {error && <ErrorAlert message={error} />}

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-52 flex-shrink-0">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => setActiveSection(s)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeSection === s ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 min-w-0 space-y-6">

          {/* ── School Information ── */}
          {activeSection === "School Information" && (
            <Card>
              <CardHeader><h2>School Information</h2></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">School Name</label>
                  <Input value={schoolInfo.schoolName} onChange={(e) => setSchoolInfo({ ...schoolInfo, schoolName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Branch Name</label>
                  <Input value={schoolInfo.branchName} onChange={(e) => setSchoolInfo({ ...schoolInfo, branchName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <Textarea value={schoolInfo.address} onChange={(e) => setSchoolInfo({ ...schoolInfo, address: e.target.value })} rows={2} />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={saveSchoolInfo} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── School Years ── */}
          {activeSection === "School Years" && (
            <>
              <div className="flex items-center justify-between">
                <h2>School Years</h2>
                <Button size="sm" onClick={openAddSy}><Plus className="w-4 h-4" /> Add School Year</Button>
              </div>
              {schoolYears.length === 0 && <p className="text-sm text-muted-foreground">No school years yet. Add one to get started.</p>}
              <div className="space-y-3">
                {schoolYears.map((sy) => (
                  <Card key={sy.id} className={sy.status === "active" ? "ring-2 ring-primary" : ""}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{sy.name}</h3>
                          <Badge variant={sy.status}>{sy.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{sy.startDate} — {sy.endDate}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {sy.status !== "active" && (
                          <button onClick={() => setActiveSy(sy.id)} className="text-xs text-primary hover:underline">Set Active</button>
                        )}
                        <button onClick={() => openEditSy(sy)} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── Academic Periods ── */}
          {activeSection === "Academic Periods" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>Academic Periods</h2>
                  <p className="text-sm text-muted-foreground mt-1">Periods within a school year, e.g. Regular Term, Summer Program.</p>
                </div>
                <Button size="sm" onClick={openAddPeriod}><Plus className="w-4 h-4" /> Add Period</Button>
              </div>
              {academicPeriods.length === 0 && (
                <p className="text-sm text-muted-foreground">No academic periods yet.</p>
              )}
              <div className="space-y-3">
                {academicPeriods.map((p) => (
                  <Card key={p.id} className={p.isActive ? "ring-2 ring-primary" : ""}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{p.name}</h3>
                          {p.isActive && <Badge variant="active">Active</Badge>}
                          <span className="text-xs text-muted-foreground">({p.schoolYearName})</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{p.startDate} — {p.endDate}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditPeriod(p)} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => deletePeriod(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── Holidays ── */}
          {activeSection === "Holidays" && (
            <>
              <div className="flex items-center justify-between">
                <h2>Holidays & No-Class Days</h2>
                <Button size="sm" onClick={openAddHoliday}><Plus className="w-4 h-4" /> Add Holiday</Button>
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Holiday Name</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Applies To</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">No Class</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {holidays.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No holidays configured.</td></tr>
                      ) : holidays.map((h) => (
                        <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium">{h.name}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">{h.date}</td>
                          <td className="px-5 py-3.5">{h.appliesToAll ? "All Classes" : "Selected Classes"}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-medium ${h.isNoClass ? "text-red-600" : "text-green-600"}`}>{h.isNoClass ? "Yes" : "No"}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => openEditHoliday(h)} className="p-1.5 hover:bg-accent rounded-lg">
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteHoliday(h.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Academic Period Modal */}
      <Modal open={periodModal} onClose={() => setPeriodModal(false)} title={editingPeriod ? "Edit Academic Period" : "Add Academic Period"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">School Year *</label>
            <Select value={periodForm.schoolYearId} onChange={(e) => setPeriodForm({ ...periodForm, schoolYearId: e.target.value })}>
              {schoolYears.map((sy) => <option key={sy.id} value={sy.id}>{sy.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Period Name *</label>
            <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder="e.g. Regular Term, Summer Program" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <Input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <Input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={periodForm.isActive} onChange={(e) => setPeriodForm({ ...periodForm, isActive: e.target.checked })} className="w-4 h-4 rounded" />
            Mark as Active Period
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPeriodModal(false)}>Cancel</Button>
            <Button onClick={savePeriod} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* School Year Modal */}
      <Modal open={syModal} onClose={() => setSyModal(false)} title={editingSy ? "Edit School Year" : "Add School Year"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">School Year Name *</label>
            <Input value={syForm.name} onChange={(e) => setSyForm({ ...syForm, name: e.target.value })} placeholder="e.g. SY 2026–2027" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <Input type="date" value={syForm.startDate} onChange={(e) => setSyForm({ ...syForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <Input type="date" value={syForm.endDate} onChange={(e) => setSyForm({ ...syForm, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select value={syForm.status} onChange={(e) => setSyForm({ ...syForm, status: e.target.value as SchoolYearStatus })}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            {syForm.status === "active" && (
              <p className="text-xs text-orange-600 mt-1">Setting this as Active will demote the current active year to Draft.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSyModal(false)}>Cancel</Button>
            <Button onClick={saveSy} disabled={!syForm.name || !syForm.startDate || !syForm.endDate || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Holiday Modal */}
      <Modal open={holidayModal} onClose={() => setHolidayModal(false)} title={editingHoliday ? "Edit Holiday" : "Add Holiday"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Holiday Name *</label>
            <Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Labor Day" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={holidayForm.appliesToAll} onChange={(e) => setHolidayForm({ ...holidayForm, appliesToAll: e.target.checked })} className="w-4 h-4 rounded" />
              Applies to all classes
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={holidayForm.isNoClass} onChange={(e) => setHolidayForm({ ...holidayForm, isNoClass: e.target.checked })} className="w-4 h-4 rounded" />
              No classes on this day
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea value={holidayForm.notes} onChange={(e) => setHolidayForm({ ...holidayForm, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setHolidayModal(false)}>Cancel</Button>
            <Button onClick={saveHoliday} disabled={!holidayForm.name || !holidayForm.date || saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
