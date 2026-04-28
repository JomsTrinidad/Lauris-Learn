"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Eye, Pencil, AlertTriangle, CheckCircle, XCircle, Clock,
  Ban, CreditCard, FlaskConical, HardDrive, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type TrialStatus = "active" | "expired" | "converted";
type SubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
type BillingCycle = "monthly" | "annual";

interface School {
  id: string;
  name: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  trialStatus: TrialStatus;
  subscriptionStatus: SubscriptionStatus;
  billingPlan: string | null;
  billingCycle: BillingCycle;
  isDemo: boolean;
  studentCount: number;
  staffCount: number;
  parentCount: number;
  createdAt: string;
}

interface SchoolForm {
  name: string;
  trialStartDate: string;
  trialEndDate: string;
  trialStatus: TrialStatus;
  subscriptionStatus: SubscriptionStatus;
  billingPlan: string;
  billingCycle: BillingCycle;
  isDemo: boolean;
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

function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
          <CreditCard className="w-3 h-3" /> Active
        </span>
      );
    case "past_due":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
          <AlertTriangle className="w-3 h-3" /> Past Due
        </span>
      );
    case "suspended":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
          <Ban className="w-3 h-3" /> Suspended
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
          <XCircle className="w-3 h-3" /> Cancelled
        </span>
      );
    default: // trial
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
          <Clock className="w-3 h-3" /> Trial
        </span>
      );
  }
}

const EMPTY_FORM: SchoolForm = {
  name: "",
  trialStartDate: new Date().toISOString().split("T")[0],
  trialEndDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
  trialStatus: "active",
  subscriptionStatus: "trial",
  billingPlan: "",
  billingCycle: "monthly",
  isDemo: false,
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
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);

  // Storage stats (loaded separately so main table renders fast)
  interface StorageStat { schoolId: string; fileCount: number; totalBytes: number; byType: Record<string, number>; }
  const [storageStats, setStorageStats] = useState<StorageStat[]>([]);
  const [storageOpen, setStorageOpen] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);

  // Pilot readiness panel
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [auditLogCount, setAuditLogCount] = useState<number | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState<SchoolForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  async function loadStorageStats() {
    setStorageLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("uploaded_files")
      .select("school_id, file_size, related_entity_type, status")
      .eq("status", "active");

    if (data) {
      const bySchool = new Map<string, StorageStat>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((row) => {
        const sid = row.school_id ?? "__none__";
        const stat = bySchool.get(sid) ?? { schoolId: sid, fileCount: 0, totalBytes: 0, byType: {} as Record<string, number> };
        stat.fileCount++;
        stat.totalBytes += row.file_size ?? 0;
        const t = row.related_entity_type ?? "unknown";
        stat.byType[t] = (stat.byType[t] ?? 0) + 1;
        bySchool.set(sid, stat);
      });
      setStorageStats(Array.from(bySchool.values()));
    }
    setStorageLoading(false);
  }

  async function loadReadinessData() {
    setReadinessLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("audit_logs")
      .select("id", { count: "exact", head: true });
    setAuditLogCount(count ?? 0);
    setReadinessLoading(false);
  }

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    setError("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: schoolRows, error: schoolErr } = await (supabase as any)
      .from("schools")
      .select("id, name, trial_start_date, trial_end_date, trial_status, subscription_status, billing_plan, billing_cycle, is_demo, created_at")
      .order("created_at");

    if (schoolErr) { setError(schoolErr.message); setLoading(false); return; }

    // Fetch student counts per school (enrolled students only)
    const { data: enrollRows } = await supabase
      .from("enrollments")
      .select("student_id, students!inner(school_id)")
      .eq("status", "enrolled");

    // Fetch user counts per school, split by role
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("school_id, role")
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

    const staffBySchool: Record<string, number> = {};
    const parentsBySchool: Record<string, number> = {};
    (profileRows ?? []).forEach((p) => {
      if (!p.school_id) return;
      if (p.role === "parent") {
        parentsBySchool[p.school_id] = (parentsBySchool[p.school_id] ?? 0) + 1;
      } else {
        staffBySchool[p.school_id] = (staffBySchool[p.school_id] ?? 0) + 1;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSchools(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (schoolRows ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        trialStartDate: s.trial_start_date,
        trialEndDate: s.trial_end_date,
        trialStatus: (s.trial_status as TrialStatus) ?? "active",
        subscriptionStatus: (s.subscription_status as SubscriptionStatus) ?? "trial",
        billingPlan: s.billing_plan ?? null,
        billingCycle: (s.billing_cycle as BillingCycle) ?? "monthly",
        isDemo: s.is_demo ?? false,
        studentCount: studentsBySchool[s.id]?.size ?? 0,
        staffCount: staffBySchool[s.id] ?? 0,
        parentCount: parentsBySchool[s.id] ?? 0,
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
      subscriptionStatus: school.subscriptionStatus,
      billingPlan: school.billingPlan ?? "",
      billingCycle: school.billingCycle,
      isDemo: school.isDemo,
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

  async function handleUpdateSchool() {
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
          subscriptionStatus: form.subscriptionStatus,
          billingPlan: form.billingPlan || null,
          billingCycle: form.billingCycle,
          isDemo: form.isDemo,
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

  async function handleQuickSubscriptionChange(school: School, newStatus: SubscriptionStatus) {
    setQuickSavingId(school.id);
    try {
      await fetch("/api/super-admin/update-school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: school.id,
          name: school.name,
          trialStartDate: school.trialStartDate || null,
          trialEndDate: school.trialEndDate || null,
          trialStatus: school.trialStatus,
          subscriptionStatus: newStatus,
          billingPlan: school.billingPlan || null,
          billingCycle: school.billingCycle,
          isDemo: school.isDemo,
        }),
      });
    } catch { /* ignore; user can retry via edit */ }
    setQuickSavingId(null);
    fetchSchools();
  }

  async function handleImpersonate(school: School) {
    sessionStorage.setItem("__ll_impersonating", JSON.stringify({
      schoolId: school.id,
      schoolName: school.name,
    }));
    fetch("/api/super-admin/impersonation-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetSchoolId:   school.id,
        targetSchoolName: school.name,
        eventType:        "impersonation_started",
      }),
    }).catch(() => {});
    router.push("/dashboard");
  }

  if (loading) return <PageSpinner />;

  const realSchools    = schools.filter((s) => !s.isDemo);
  const demoCount      = schools.length - realSchools.length;
  const activeSubCount = realSchools.filter((s) => s.subscriptionStatus === "active").length;
  const pastDueCount   = realSchools.filter((s) => s.subscriptionStatus === "past_due").length;
  const suspendedCount = realSchools.filter((s) => s.subscriptionStatus === "suspended" || s.subscriptionStatus === "cancelled").length;
  const trialCount     = realSchools.filter((s) => s.subscriptionStatus === "trial").length;

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

      {/* Summary cards — demo schools excluded from metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Real Schools</p>
            <p className="text-3xl font-semibold mt-1">{realSchools.length}</p>
            {demoCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">+{demoCount} demo</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Paid (Active)</p>
            <p className="text-3xl font-semibold mt-1 text-green-600">{activeSubCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Past Due</p>
            <p className="text-3xl font-semibold mt-1 text-amber-600">{pastDueCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Suspended / Cancelled</p>
            <p className="text-3xl font-semibold mt-1 text-red-600">{suspendedCount}</p>
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
                    <th className="text-left px-4 py-3 font-medium">Trial</th>
                    <th className="text-left px-4 py-3 font-medium">Subscription</th>
                    <th className="text-center px-4 py-3 font-medium">Students</th>
                    <th className="text-center px-4 py-3 font-medium">Staff</th>
                    <th className="text-center px-4 py-3 font-medium">Parents</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{school.name}</span>
                          {school.isDemo && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              <FlaskConical className="w-3 h-3" /> Demo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TrialStatusBadge status={school.trialStatus} endDate={school.trialEndDate} />
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionBadge status={school.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3 text-center">{school.studentCount}</td>
                      <td className="px-4 py-3 text-center">{school.staffCount}</td>
                      <td className="px-4 py-3 text-center">{school.parentCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(school.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {school.subscriptionStatus !== "suspended" && school.subscriptionStatus !== "cancelled" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={quickSavingId === school.id}
                              onClick={() => handleQuickSubscriptionChange(school, "suspended")}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Ban className="w-3.5 h-3.5 mr-1" /> Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={quickSavingId === school.id}
                              onClick={() => handleQuickSubscriptionChange(school, "trial")}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Reactivate
                            </Button>
                          )}
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
      {/* Storage Stats Panel */}
      <Card>
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => {
            if (!storageOpen) loadStorageStats();
            setStorageOpen((v) => !v);
          }}
        >
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">Storage Usage</span>
            <span className="text-xs text-muted-foreground">(active files tracked in uploaded_files)</span>
          </div>
          {storageOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {storageOpen && (
          <CardContent className="p-0 border-t border-border">
            {storageLoading ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Loading storage data…</p>
            ) : storageStats.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No files tracked yet. Files will appear here after uploads occur.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium">School</th>
                      <th className="text-center px-4 py-2.5 font-medium">Files</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total Size</th>
                      <th className="text-left px-4 py-2.5 font-medium">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {storageStats
                      .sort((a, b) => b.totalBytes - a.totalBytes)
                      .map((stat) => {
                        const school = schools.find((s) => s.id === stat.schoolId);
                        const mb = (stat.totalBytes / 1024 / 1024).toFixed(2);
                        const breakdown = Object.entries(stat.byType)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => `${type}: ${count}`)
                          .join(" · ");
                        return (
                          <tr key={stat.schoolId} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">{school?.name ?? stat.schoolId}</td>
                            <td className="px-4 py-2.5 text-center">{stat.fileCount}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs">{mb} MB</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{breakdown || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Pilot Readiness Panel */}
      <Card>
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => {
            if (!readinessOpen) loadReadinessData();
            setReadinessOpen((v) => !v);
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">Pilot Readiness</span>
            <span className="text-xs text-muted-foreground">(platform health snapshot)</span>
          </div>
          {readinessOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {readinessOpen && (
          <CardContent className="p-5 border-t border-border space-y-4">
            {readinessLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Real Schools</p>
                    <p className="text-xl font-semibold">{realSchools.length}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Demo / Test Schools</p>
                    <p className="text-xl font-semibold text-purple-600">{demoCount}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">On Trial</p>
                    <p className="text-xl font-semibold text-blue-600">{trialCount}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Paid (Active)</p>
                    <p className="text-xl font-semibold text-green-600">{activeSubCount}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Past Due</p>
                    <p className="text-xl font-semibold text-amber-600">{pastDueCount}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Suspended / Cancelled</p>
                    <p className="text-xl font-semibold text-red-600">{suspendedCount}</p>
                  </div>
                </div>

                <div className="border border-border rounded-lg divide-y divide-border text-sm">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Audit logs</span>
                    {auditLogCount !== null && auditLogCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Active ({auditLogCount.toLocaleString()} entries)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> No entries yet
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">File tracking (uploaded_files)</span>
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Wired at all upload points
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Impersonation audit log</span>
                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">profile-photos bucket</span>
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" /> Public — migration pending
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Automated storage cleanup</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                      <Clock className="w-3.5 h-3.5" /> Manual only
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Full launch checklist: <code>docs/LAUNCH_READINESS_CHECKLIST.md</code> · Privacy notes: <code>docs/PRIVACY_REVIEW_NOTES.md</code>
                </p>
              </>
            )}
          </CardContent>
        )}
      </Card>

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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="create-is-demo"
              checked={form.isDemo}
              onChange={(e) => setForm((f) => ({ ...f, isDemo: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="create-is-demo" className="text-sm">Mark as demo/test account</label>
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

      {/* Edit / School Management Modal */}
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

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium mb-1.5">Subscription Status</label>
              <Select
                value={form.subscriptionStatus}
                onChange={(e) => setForm((f) => ({ ...f, subscriptionStatus: e.target.value as SubscriptionStatus }))}
              >
                <option value="trial">Trial</option>
                <option value="active">Active (Paid)</option>
                <option value="past_due">Past Due</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Billing Plan</label>
              <Input
                value={form.billingPlan}
                onChange={(e) => setForm((f) => ({ ...f, billingPlan: e.target.value }))}
                placeholder="e.g. starter, growth"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Billing Cycle</label>
              <Select
                value={form.billingCycle}
                onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value as BillingCycle }))}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-is-demo"
              checked={form.isDemo}
              onChange={(e) => setForm((f) => ({ ...f, isDemo: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="edit-is-demo" className="text-sm">Mark as demo/test account</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditingSchool(null)}>Cancel</Button>
            <Button onClick={handleUpdateSchool} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
