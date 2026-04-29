"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Eye, Pencil, AlertTriangle, CheckCircle, XCircle, Clock,
  Ban, CreditCard, FlaskConical, HardDrive, ChevronDown, ChevronUp, ShieldCheck,
  HelpCircle, X, Search, ChevronRight, BookOpen, Layers, School as SchoolIcon,
  Shield, Key, Database, Server, UserCheck, ArrowRight,
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

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Platform docs"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> New School
          </Button>
        </div>
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

      {/* ── Platform Docs Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-lg bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Platform Documentation</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search topics..." value={helpSearch} onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {(() => {
                const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
                  <div className="flex gap-2.5 items-start">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                    <span>{text}</span>
                  </div>
                );
                const Tip = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Danger = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-red-800 dark:text-red-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Code = ({ children }: { children: string }) => (
                  <pre className="bg-muted rounded-lg p-2.5 text-xs font-mono text-foreground overflow-x-auto border border-border my-2 whitespace-pre-wrap break-all">{children}</pre>
                );
                const Check = ({ items }: { items: string[] }) => (
                  <ul className="space-y-1.5 my-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" /><span>{item}</span>
                      </li>
                    ))}
                  </ul>
                );
                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "overview",
                    icon: Layers,
                    title: "Platform Overview",
                    searchText: "platform overview multi-tenant saas school roles permissions school_id rls",
                    body: (
                      <div className="space-y-3">
                        <p>Lauris Learn is a multi-tenant platform. Each <strong className="text-foreground">School</strong> is an independent tenant with its own data, users, branding, and billing. All tables include a <code className="bg-muted px-1 rounded text-xs">school_id</code> column and RLS ensures tenants cannot access each other&apos;s data.</p>
                        <p>Four user roles:</p>
                        <div className="grid grid-cols-1 gap-2 mt-1">
                          {[
                            { role: "super_admin", desc: "Full platform access — create/manage all schools, impersonate admins, generate demo data." },
                            { role: "school_admin", desc: "Full access to their school. Manages students, billing, classes, staff, settings." },
                            { role: "teacher", desc: "Limited to their assigned classes. Records attendance, posts updates, observations." },
                            { role: "parent", desc: "Read-only portal. Views their child&apos;s attendance, updates, billing, progress, events." },
                          ].map(({ role, desc }) => (
                            <div key={role} className="bg-muted/50 rounded-lg p-2.5 border border-border">
                              <p className="text-xs font-mono font-semibold text-primary mb-0.5">{role}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "creating-school",
                    icon: SchoolIcon,
                    title: "Creating a New School",
                    searchText: "create new school record seed default branch year trial admin setup",
                    body: (
                      <div className="space-y-2">
                        <p>Go to <strong className="text-foreground">Schools</strong> and click <strong className="text-foreground">+ New School</strong>. Creating a school automatically:</p>
                        <Check items={[
                          "Creates the schools record with is_demo = false",
                          "Seeds a default School Year (SY 2025–2026, active)",
                          "Seeds a default Branch (Main Branch)",
                          "Sets trial_start_date, trial_end_date, trial_status per your input",
                        ]} />
                        <Tip>After creating a school you must manually create the first <strong>school_admin</strong> user. Have the admin sign up via <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">/login</code>, then update their profile in Supabase SQL Editor (see Onboarding Checklist).</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "trial-system",
                    icon: Clock,
                    title: "Trial System",
                    searchText: "trial system expire active converted days countdown read-only banner school",
                    body: (
                      <div className="space-y-2">
                        <p>Every school has three trial columns on the <code className="bg-muted px-1 rounded text-xs">schools</code> table:</p>
                        <div className="space-y-1.5">
                          {[
                            { col: "trial_start_date", desc: "When the trial began (DATE)" },
                            { col: "trial_end_date",   desc: "When the trial expires (DATE)" },
                            { col: "trial_status",     desc: "active | expired | converted" },
                          ].map(({ col, desc }) => (
                            <div key={col} className="flex gap-3 items-start">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground flex-shrink-0">{col}</code>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs">Dashboard banner logic (SchoolContext) checks on load:</p>
                        <ul className="text-xs space-y-1 list-disc list-inside">
                          <li><strong className="text-foreground">≤ 7 days remaining</strong> — amber warning banner with countdown</li>
                          <li><strong className="text-foreground">Expired</strong> — red banner; all write actions disabled (read-only mode)</li>
                          <li><strong className="text-foreground">Converted</strong> — no banner; full access regardless of dates</li>
                        </ul>
                        <Note>To extend a trial, use the Edit (pencil) button on the school row and update the trial end date. Changes take effect on the school admin&apos;s next page load.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "impersonation",
                    icon: Shield,
                    title: "Impersonation",
                    searchText: "impersonate school admin troubleshoot setup session banner exit",
                    body: (
                      <div className="space-y-2">
                        <p>Click <strong className="text-foreground">View</strong> on any school row to enter that school&apos;s dashboard as a school admin. A blue banner appears at the top confirming you are impersonating. Click <strong className="text-foreground">Exit Impersonation</strong> to return.</p>
                        <p className="text-xs font-medium text-foreground">How it works:</p>
                        <ul className="text-xs space-y-1 list-disc list-inside">
                          <li>State stored in <code className="bg-muted px-1 rounded">sessionStorage.__ll_impersonating</code></li>
                          <li>SchoolContext reads this on load and switches the active school_id</li>
                          <li>Your super_admin auth session is preserved — you are not logged in as the school admin</li>
                          <li>All writes during impersonation are scoped to that school&apos;s data</li>
                        </ul>
                        <Tip>Impersonation is session-scoped — closing the tab ends it automatically. Impersonation events are recorded in the audit log.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "demo-data",
                    icon: FlaskConical,
                    title: "Demo Data",
                    searchText: "demo data seed generate refresh reset clear scenario walkthrough test",
                    body: (
                      <div className="space-y-2">
                        <p>Demo data can only be generated for schools with <code className="bg-muted px-1 rounded text-xs">is_demo = true</code>. This flag is a hard safety block — the API will reject any request targeting a non-demo school.</p>
                        <p className="text-xs font-medium text-foreground">Three scenarios:</p>
                        <div className="space-y-1.5">
                          {[
                            { name: "Small Preschool", key: "small_preschool", detail: "4 classes · ~38 students · 4 teachers · 10 parents" },
                            { name: "Compliance-Heavy", key: "compliance_heavy", detail: "8 classes · ~80 students · 8 teachers · 15 parents" },
                            { name: "New Trial School", key: "trial_new", detail: "2 classes · 15 students · 2 teachers · 5 parents" },
                          ].map(({ name, key, detail }) => (
                            <div key={key} className="bg-muted/50 rounded-lg p-2.5 border border-border">
                              <p className="text-xs font-semibold text-foreground">{name} <code className="font-mono text-primary ml-1">{key}</code></p>
                              <p className="text-xs mt-0.5">{detail}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs font-medium text-foreground">Actions:</p>
                        <ul className="text-xs space-y-1 list-disc list-inside">
                          <li><strong className="text-foreground">Generate</strong> — clears prior data and seeds fresh data</li>
                          <li><strong className="text-foreground">Refresh</strong> — re-seeds with the same scenario</li>
                          <li><strong className="text-foreground">Clear Data</strong> — removes all demo data but leaves the school record</li>
                        </ul>
                        <Note>Each generation run is tracked in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">demo_data_runs</code>. Run history shows status, scenario, and timestamps for the last 10 runs.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "onboarding",
                    icon: CheckCircle,
                    title: "Onboarding Checklist",
                    searchText: "onboarding checklist new school setup admin assign profile sql class student billing go live",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-3">
                          <Step n={1} text={<span><strong>Create the school record</strong> — click + New School. Note the generated School ID (UUID).</span>} />
                          <Step n={2} text={<span><strong>Admin signs up</strong> — have them navigate to <code className="bg-muted px-1 rounded">/login</code> and create an account.</span>} />
                          <Step n={3} text={<span><strong>Assign admin to school</strong> — in Supabase SQL Editor:</span>} />
                        </div>
                        <Code>{`UPDATE profiles
SET
  school_id = '<SCHOOL_UUID>',
  role      = 'school_admin',
  full_name = 'Admin Name'
WHERE email = 'admin@theirschool.com';`}</Code>
                        <Step n={4} text={<span><strong>Admin configures Settings</strong> — School Info, Branding, School Years, Academic Periods.</span>} />
                        <Step n={5} text={<span><strong>Finance Setup</strong> — Fee Types, Tuition Configs, Discounts.</span>} />
                        <Step n={6} text={<span><strong>Classes & Teachers</strong> — create classes, assign teachers, set promotion paths. Teachers use the same sign-up + SQL flow with <code className="bg-muted px-1 rounded">role = &apos;teacher&apos;</code>.</span>} />
                        <Step n={7} text={<span><strong>Add students</strong> — full name, DOB, gender, guardian(s), enroll into class.</span>} />
                        <Step n={8} text={<span><strong>Parent portal (optional)</strong> — generate invite link from Students section. Parents accept at <code className="bg-muted px-1 rounded">/invite?token=...</code>.</span>} />
                        <Step n={9} text={<span><strong>Generate initial billing</strong> — Billing → Generate Billing for the first month.</span>} />
                        <Step n={10} text={<span><strong>Verify & go live</strong> — test login as teacher, parent, and confirm trial dates.</span>} />
                      </div>
                    ),
                  },
                  {
                    id: "trial-to-prod",
                    icon: ArrowRight,
                    title: "Trial → Production Migration",
                    searchText: "trial production convert paid subscription migrate keep data fresh clean status",
                    body: (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-foreground">Option A — Keep trial data (most common)</p>
                        <p className="text-xs">Use when the school entered real students and configured actual data during the trial.</p>
                        <div className="space-y-1.5">
                          <Step n={1} text={<span>Edit the school row — set <code className="bg-muted px-1 rounded">trial_status → converted</code>, <code className="bg-muted px-1 rounded">subscription_status → active</code>, billing plan/cycle.</span>} />
                          <Step n={2} text={<span>Admin&apos;s next page load shows no trial banner and full write access.</span>} />
                          <Step n={3} text={<span>If school was also a demo, clear demo data then set <code className="bg-muted px-1 rounded">is_demo = false</code> in SQL.</span>} />
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-3">Option B — Fresh production school</p>
                        <p className="text-xs">Use when the trial contained only test/demo data and the school wants a clean slate.</p>
                        <div className="space-y-1.5">
                          <Step n={1} text={<span>Create a new school with <code className="bg-muted px-1 rounded">trial_status = converted</code> immediately.</span>} />
                          <Step n={2} text={<span>Re-assign the admin profile&apos;s <code className="bg-muted px-1 rounded">school_id</code> to the new school UUID.</span>} />
                          <Step n={3} text={<span>Admin redoes Settings, Finance Setup, Classes, and Students.</span>} />
                          <Step n={4} text={<span>Decommission the old trial school — leave as expired or delete via SQL (cascades all data).</span>} />
                        </div>
                        <Danger>Deleting a school is irreversible. All cascaded data — students, billing, payments, attendance, enrollments — will be permanently deleted. Always take a Supabase backup first.</Danger>
                        <Note><strong>Which option?</strong> Ask the admin: "Did you enter real student names and configure your actual fee structure during the trial?" Yes → Option A. Just clicked around or used demo data → Option B.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "credentials",
                    icon: Key,
                    title: "Demo Credentials",
                    searchText: "demo credentials login email password batch id teacher parent accounts find",
                    body: (
                      <div className="space-y-2">
                        <p>Each demo generation run creates a unique <strong className="text-foreground">batch ID</strong> (7-char base-36 timestamp, e.g. <code className="bg-muted px-1 rounded text-xs">abc1x3f</code>). All credentials for that run use this batch ID:</p>
                        <div className="space-y-1.5">
                          <div className="bg-muted/50 rounded-lg p-2.5 border border-border">
                            <p className="text-xs font-semibold text-foreground mb-1">Teacher accounts</p>
                            <p className="text-xs font-mono">Email: teacher.demo.{"{batchId}"}.01@example.com</p>
                            <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2.5 border border-border">
                            <p className="text-xs font-semibold text-foreground mb-1">Parent accounts</p>
                            <p className="text-xs font-mono">Email: parent.demo.{"{batchId}"}.01@example.com</p>
                            <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
                          </div>
                        </div>
                        <Tip>The batch ID changes every time you generate or refresh. To find the current batch ID: Supabase Dashboard → Authentication → Users, filter by <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">@example.com</code>.</Tip>
                        <Code>{`-- Find current demo user emails for a school
SELECT au.email, p.role, p.full_name
FROM profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.school_id = '<DEMO_SCHOOL_UUID>'
  AND p.role IN ('teacher', 'parent')
ORDER BY p.role, au.email;`}</Code>
                      </div>
                    ),
                  },
                  {
                    id: "database",
                    icon: Database,
                    title: "Database & Migrations",
                    searchText: "database migrations schema sql supabase rls row level security tables fresh project",
                    body: (
                      <div className="space-y-2">
                        <p>All schema files live in <code className="bg-muted px-1 rounded text-xs">supabase/</code>. Run in order in the Supabase SQL Editor:</p>
                        <div className="space-y-2">
                          <Step n={1} text={<span>Run <code className="bg-muted px-1 rounded">supabase/schema.sql</code> — creates all tables, enums, RLS policies, triggers, and seed data.</span>} />
                          <Step n={2} text={<span>Run migrations <code className="bg-muted px-1 rounded">001_additions.sql</code> → latest file in ascending numeric order. Current sequence: 001 → 043.</span>} />
                          <Step n={3} text={<span>Verify RLS is enabled on all tables:</span>} />
                        </div>
                        <Code>{`SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;`}</Code>
                        <Tip>If you add a new table: (1) enable RLS, (2) add a super_admin bypass policy using <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">is_super_admin()</code>, and (3) add school-member read/write policies.</Tip>
                        <p className="text-xs font-medium text-foreground">Key design rules:</p>
                        <ul className="text-xs space-y-1 list-disc list-inside">
                          <li>Every tenant table has <code className="bg-muted px-1 rounded">school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE</code></li>
                          <li>PKs use <code className="bg-muted px-1 rounded">UUID DEFAULT gen_random_uuid()</code></li>
                          <li>The <code className="bg-muted px-1 rounded">handle_new_user</code> trigger auto-creates a profile row on auth user creation — always upsert profiles, never insert</li>
                        </ul>
                      </div>
                    ),
                  },
                  {
                    id: "storage",
                    icon: Server,
                    title: "Storage Buckets",
                    searchText: "storage bucket updates-media private photos signed url receipt path convention create",
                    body: (
                      <div className="space-y-2">
                        <p>All media uses a single private bucket: <code className="bg-muted px-1 rounded text-xs">updates-media</code>. It must be created manually in the Supabase Dashboard (migrations add policies but not the bucket itself).</p>
                        <Step n={1} text={<span>Supabase Dashboard → Storage → New Bucket: name <strong>updates-media</strong>, Public: <strong>OFF</strong>, 10 MB limit, image/* MIME types.</span>} />
                        <p className="text-xs font-medium text-foreground">Path conventions:</p>
                        <div className="space-y-1.5">
                          {[
                            { path: "updates-media/{post_id}/{filename}", desc: "Class update photos" },
                            { path: "payment-receipts/{schoolId}/{paymentId}.{ext}", desc: "Payment receipt photos" },
                            { path: "proud-moments/{schoolId}/{momentId}/{filename}", desc: "Proud moment media" },
                          ].map(({ path, desc }) => (
                            <div key={path} className="flex gap-2 items-start">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground flex-shrink-0">{path}</code>
                              <span className="text-xs text-muted-foreground">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs">Signed URLs expire after <strong className="text-foreground">1 hour</strong>. Pages generate signed URLs in a single batch on load via <code className="bg-muted px-1 rounded">createSignedUrls()</code>.</p>
                        <Note>Planned (not yet built): split into separate <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">receipts</code> and <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">student-documents</code> buckets when the document hub is built.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "roles",
                    icon: UserCheck,
                    title: "Roles & Permissions",
                    searchText: "roles permissions access control super admin teacher parent school billing attendance",
                    body: (
                      <div className="space-y-2">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left p-2 border border-border font-medium text-foreground">Action</th>
                                <th className="text-center p-1.5 border border-border font-medium text-foreground">SA</th>
                                <th className="text-center p-1.5 border border-border font-medium text-foreground">Admin</th>
                                <th className="text-center p-1.5 border border-border font-medium text-foreground">Teacher</th>
                                <th className="text-center p-1.5 border border-border font-medium text-foreground">Parent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ["Create / delete schools",         "✅", "—", "—", "—"],
                                ["Impersonate school admins",        "✅", "—", "—", "—"],
                                ["Generate demo data",               "✅", "—", "—", "—"],
                                ["Manage all school data",           "✅", "✅", "—", "—"],
                                ["Manage students & guardians",      "✅", "✅", "—", "—"],
                                ["Manage billing & payments",        "✅", "✅", "—", "—"],
                                ["Record attendance",                "✅", "✅", "✅", "—"],
                                ["Post class updates",               "✅", "✅", "✅", "—"],
                                ["Record progress observations",     "✅", "✅", "✅", "—"],
                                ["View child data (read-only)",      "—", "—", "—", "✅"],
                                ["RSVP to events",                   "—", "—", "—", "✅"],
                                ["Report absence",                   "—", "—", "—", "✅"],
                              ].map(([action, ...cols]) => (
                                <tr key={action} className="hover:bg-muted/30 transition-colors">
                                  <td className="p-1.5 border border-border text-muted-foreground">{action}</td>
                                  {cols.map((val, i) => (
                                    <td key={i} className="p-1.5 border border-border text-center">
                                      {val === "✅" ? <span className="text-green-500">✅</span> : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">SA = super_admin</p>
                      </div>
                    ),
                  },
                  {
                    id: "troubleshooting",
                    icon: HelpCircle,
                    title: "Troubleshooting",
                    searchText: "troubleshoot fix issue admin login wrong school parent no data RLS storage photo bucket duplicate trial overlay",
                    body: (
                      <div className="space-y-3">
                        {[
                          {
                            issue: "Admin sees no school data / wrong school",
                            cause: "Profile has wrong school_id or no school_id.",
                            fix: `UPDATE profiles SET school_id = '<SCHOOL_UUID>', role = 'school_admin' WHERE email = 'admin@school.com';`,
                          },
                          {
                            issue: "Parent can't see their child's data",
                            cause: "Guardian record not created, or profile role is not 'parent'.",
                            fix: `-- Check guardian record\nSELECT * FROM guardians WHERE email = 'parent@example.com';\n\n-- Fix role if needed\nUPDATE profiles SET role = 'parent' WHERE email = 'parent@example.com';`,
                          },
                          {
                            issue: "duplicate key: one_active_year_per_school",
                            cause: "School already has an active school year. Only one allowed per school.",
                            fix: `-- Archive the old one first\nUPDATE school_years SET status = 'archived' WHERE id = '<OLD_SY_UUID>';`,
                          },
                          {
                            issue: "Demo data generation fails partway through",
                            cause: "Prior partial run left orphaned data.",
                            fix: "Click Generate again — the route auto-clears partial data before retrying. If it keeps failing, check the run history panel for the error message.",
                          },
                          {
                            issue: "Read-only overlay persists after converting trial",
                            cause: "SchoolContext caches trial state on load.",
                            fix: "Ask the admin to press F5 / hard-refresh. trial_status = 'converted' is picked up on reload.",
                          },
                          {
                            issue: "Photo upload fails silently",
                            cause: "updates-media bucket was not created, or created as public.",
                            fix: "Verify in Supabase Dashboard → Storage that 'updates-media' exists and is set to private.",
                          },
                        ].map(({ issue, cause, fix }) => (
                          <div key={issue} className="border border-border rounded-xl p-3 space-y-1.5">
                            <p className="text-xs font-medium text-foreground flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />{issue}
                            </p>
                            <p className="text-xs text-muted-foreground ml-5.5"><strong className="text-foreground">Cause:</strong> {cause}</p>
                            {fix.includes("\n") || fix.startsWith("UPDATE") || fix.startsWith("SELECT") || fix.startsWith("--") ? (
                              <Code>{fix}</Code>
                            ) : (
                              <p className="text-xs text-muted-foreground"><strong className="text-foreground">Fix:</strong> {fix}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q)) : topics;
                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">No topics match <span className="font-medium text-foreground">&quot;{helpSearch}&quot;</span></p>
                    <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                  </div>
                );
                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}>
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {open && <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">{item.body}</div>}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch ? <span>Showing results for &quot;<span className="font-medium text-foreground">{helpSearch}</span>&quot;</span> : <span>12 topics · click any to expand</span>}
            </div>
          </div>
        </div>
      )}

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
