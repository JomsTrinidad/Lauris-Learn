"use client";
import { useEffect, useState } from "react";
import { Plus, ArrowRight, Search, TrendingUp, Pencil } from "lucide-react";
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
  const { schoolId, activeYear } = useSchoolContext();
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

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

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
        <Button onClick={() => { setModalOpen(true); setForm(EMPTY_FORM); setFormError(null); }}>
          <Plus className="w-4 h-4" /> Add Inquiry
        </Button>
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
