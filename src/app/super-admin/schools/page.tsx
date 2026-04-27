"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Eye, Pencil, AlertTriangle, CheckCircle, XCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";

type TrialStatus = "active" | "expired" | "converted";

interface School {
  id: string;
  name: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  trialStatus: TrialStatus;
  studentCount: number;
  userCount: number;
  createdAt: string;
}

interface SchoolForm {
  name: string;
  trialStartDate: string;
  trialEndDate: string;
  trialStatus: TrialStatus;
  adminEmail: string;
  adminName: string;
}

function trialDaysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

function TrialStatusBadge({ status, endDate }: { status: TrialStatus; endDate: string | null }) {
  const days = trialDaysLeft(endDate);

  if (status === "converted") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <CheckCircle className="w-3 h-3" /> Converted
      </span>
    );
  }
  if (status === "expired" || (days !== null && days <= 0)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
        <XCircle className="w-3 h-3" /> Expired
      </span>
    );
  }
  if (days !== null && days <= 5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
        <AlertTriangle className="w-3 h-3" /> {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
      <Clock className="w-3 h-3" /> Trial {days !== null ? `${days}d` : "active"}
    </span>
  );
}

const EMPTY_FORM: SchoolForm = {
  name: "",
  trialStartDate: new Date().toISOString().split("T")[0],
  trialEndDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
  trialStatus: "active",
  adminEmail: "",
  adminName: "",
};

export default function SuperAdminSchoolsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState<SchoolForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: schoolRows, error: schoolErr } = await supabase
      .from("schools")
      .select("id, name, trial_start_date, trial_end_date, trial_status, created_at")
      .order("created_at");

    if (schoolErr) { setError(schoolErr.message); setLoading(false); return; }

    // Fetch student counts per school
    const { data: enrollRows } = await supabase
      .from("enrollments")
      .select("student_id, students!inner(school_id)")
      .eq("status", "enrolled");

    // Fetch user counts per school
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("school_id")
      .not("school_id", "is", null);

    const studentsBySchool: Record<string, Set<string>> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enrollRows ?? []).forEach((r: any) => {
      const sid = r.students?.school_id;
      if (sid) {
        if (!studentsBySchool[sid]) studentsBySchool[sid] = new Set();
        studentsBySchool[sid].add(r.student_id);
      }
    });

    const usersBySchool: Record<string, number> = {};
    (profileRows ?? []).forEach((p) => {
      if (p.school_id) usersBySchool[p.school_id] = (usersBySchool[p.school_id] ?? 0) + 1;
    });

    setSchools(
      (schoolRows ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        trialStartDate: s.trial_start_date,
        trialEndDate: s.trial_end_date,
        trialStatus: (s.trial_status as TrialStatus) ?? "active",
        studentCount: studentsBySchool[s.id]?.size ?? 0,
        userCount: usersBySchool[s.id] ?? 0,
        createdAt: s.created_at,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowCreateModal(true);
  }

  function openEdit(school: School) {
    setEditingSchool(school);
    setForm({
      name: school.name,
      trialStartDate: school.trialStartDate ?? "",
      trialEndDate: school.trialEndDate ?? "",
      trialStatus: school.trialStatus,
      adminEmail: "",
      adminName: "",
    });
    setFormError("");
  }

  async function handleCreate() {
    if (!form.name.trim()) { setFormError("School name is required."); return; }
    setSaving(true);
    setFormError("");

    try {
      const res = await fetch("/api/super-admin/create-school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          trialStartDate: form.trialStartDate || null,
          trialEndDate: form.trialEndDate || null,
          trialStatus: form.trialStatus,
          adminEmail: form.adminEmail.trim(),
          adminName: form.adminName.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setFormError(json.error ?? "Failed to create school.");
        setSaving(false);
        return;
      }

      // Partial success (207): school created but admin assignment failed
      if (res.status === 207) {
        setFormError(json.error ?? "School created but admin assignment failed.");
        setSaving(false);
        fetchSchools();
        return;
      }
    } catch {
      setFormError("Network error. Please try again.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowCreateModal(false);
    fetchSchools();
  }

  async function handleUpdateTrial() {
    if (!editingSchool) return;
    if (!form.name.trim()) { setFormError("School name is required."); return; }
    setSaving(true);
    setFormError("");

    try {
      const res = await fetch("/api/super-admin/update-school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: editingSchool.id,
          name: form.name.trim(),
          trialStartDate: form.trialStartDate || null,
          trialEndDate: form.trialEndDate || null,
          trialStatus: form.trialStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok) { setFormError(json.error ?? "Failed to update school."); setSaving(false); return; }
    } catch {
      setFormError("Network error. Please try again.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditingSchool(null);
    fetchSchools();
  }

  async function handleImpersonate(school: School) {
    sessionStorage.setItem("__ll_impersonating", JSON.stringify({
      schoolId: school.id,
      schoolName: school.name,
    }));
    // Fire-and-forget audit log — navigation proceeds regardless of log outcome.
    fetch("/api/super-admin/impersonation-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetSchoolId:   school.id,
        targetSchoolName: school.name,
        eventType:        "impersonation_started",
      }),
    }).catch(() => { /* audit failure must not block impersonation UX */ });
    router.push("/dashboard");
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Schools</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all schools on the platform</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New School
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Schools</p>
            <p className="text-3xl font-semibold mt-1">{schools.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active Trials</p>
            <p className="text-3xl font-semibold mt-1 text-blue-600">
              {schools.filter((s) => s.trialStatus === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="text-3xl font-semibold mt-1 text-green-600">
              {schools.filter((s) => s.trialStatus === "converted").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Schools table */}
      <Card>
        <CardHeader className="py-4">
          <h2>All Schools</h2>
        </CardHeader>
        <CardContent className="p-0">
          {schools.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No schools yet. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">School</th>
                    <th className="text-left px-4 py-3 font-medium">Trial Status</th>
                    <th className="text-left px-4 py-3 font-medium">Trial Ends</th>
                    <th className="text-center px-4 py-3 font-medium">Students</th>
                    <th className="text-center px-4 py-3 font-medium">Users</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{school.name}</td>
                      <td className="px-4 py-3">
                        <TrialStatusBadge status={school.trialStatus} endDate={school.trialEndDate} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {school.trialEndDate ? formatDate(school.trialEndDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">{school.studentCount}</td>
                      <td className="px-4 py-3 text-center">{school.userCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(school.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleImpersonate(school)}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(school)}>
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create School Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New School"
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div>
            <label className="block text-sm font-medium mb-1.5">School Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sunshine Learning Center"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Trial Start</label>
              <Input
                type="date"
                value={form.trialStartDate}
                onChange={(e) => setForm((f) => ({ ...f, trialStartDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Trial End</label>
              <Input
                type="date"
                value={form.trialEndDate}
                onChange={(e) => setForm((f) => ({ ...f, trialEndDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium mb-3 text-muted-foreground">Admin User (optional)</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Admin Email</label>
                <Input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="admin@school.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The user must already have an account. Their profile will be linked to this school.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Admin Full Name</label>
                <Input
                  value={form.adminName}
                  onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create School"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit / Trial Management Modal */}
      <Modal
        open={!!editingSchool}
        onClose={() => setEditingSchool(null)}
        title={`Edit: ${editingSchool?.name}`}
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div>
            <label className="block text-sm font-medium mb-1.5">School Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Trial Status</label>
            <Select
              value={form.trialStatus}
              onChange={(e) => setForm((f) => ({ ...f, trialStatus: e.target.value as TrialStatus }))}
            >
              <option value="active">Active Trial</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted (Paid)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Trial Start</label>
              <Input
                type="date"
                value={form.trialStartDate}
                onChange={(e) => setForm((f) => ({ ...f, trialStartDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Trial End</label>
              <Input
                type="date"
                value={form.trialEndDate}
                onChange={(e) => setForm((f) => ({ ...f, trialEndDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditingSchool(null)}>Cancel</Button>
            <Button onClick={handleUpdateTrial} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
