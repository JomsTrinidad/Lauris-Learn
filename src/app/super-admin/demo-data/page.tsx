"use client";
import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical, RefreshCw, Trash2, Plus, CheckCircle, AlertTriangle,
  Users, GraduationCap, BookOpen, CalendarDays, Receipt, Star, Eye,
  ChevronDown, ChevronUp, Clock, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { type DemoScenario, DEMO_SCENARIOS, getScenarioLabel, getScenarioDescription } from "@/lib/demo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoRunSummary {
  studentCount:       number;
  teacherCount:       number;
  parentCount:        number;
  classCount:         number;
  attendanceCount:    number;
  billingCount:       number;
  paymentCount:       number;
  updatesCount:       number;
  proudMomentsCount:  number;
  observationCount:   number;
  uploadedFilesCount: number;
}

interface DemoRun {
  id:           string;
  scenario:     DemoScenario;
  action:       string;
  status:       "pending" | "running" | "completed" | "failed";
  summary:      DemoRunSummary | null;
  createdAt:    string;
  completedAt:  string | null;
  errorMessage: string | null;
}

interface DemoSchool {
  id:                 string;
  name:               string;
  subscriptionStatus: string;
  createdAt:          string;
  lastRun:            DemoRun | null;
}

// ─── Scenario selector ────────────────────────────────────────────────────────

const SCENARIO_INFO: Record<DemoScenario, { color: string; who: string }> = {
  small_preschool:  { color: "bg-blue-50 border-blue-200",   who: "General walkthroughs & sales demos" },
  compliance_heavy: { color: "bg-purple-50 border-purple-200", who: "Showing reporting & media workflows" },
  trial_new:        { color: "bg-amber-50 border-amber-200",  who: "Onboarding & trial conversion demos" },
};

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/60 rounded-lg">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

// ─── Run status badge ─────────────────────────────────────────────────────────

function RunStatusBadge({ run }: { run: DemoRun }) {
  if (run.status === "running" || run.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
        <Loader2 className="w-3 h-3 animate-spin" /> Generating…
      </span>
    );
  }
  if (run.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  if (run.action === "clear") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs font-medium">
        <Trash2 className="w-3 h-3" /> Cleared
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
      <CheckCircle className="w-3 h-3" /> Generated
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DemoDataPage() {
  const supabase = createClient();

  const [demoSchools, setDemoSchools] = useState<DemoSchool[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Generate modal state
  const [generateTarget, setGenerateTarget] = useState<DemoSchool | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>("small_preschool");
  const [isRefresh, setIsRefresh]       = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState("");

  // Clear modal state
  const [clearTarget, setClearTarget]   = useState<DemoSchool | null>(null);
  const [clearing, setClearing]         = useState(false);
  const [clearError, setClearError]     = useState("");

  // Expanded history panel per school
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [historyMap, setHistoryMap]     = useState<Record<string, DemoRun[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    // Fetch demo schools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: schools, error: schoolErr } = await (supabase as any)
      .from("schools")
      .select("id, name, subscription_status, created_at")
      .eq("is_demo", true)
      .order("created_at");

    if (schoolErr) { setError(schoolErr.message); setLoading(false); return; }

    // Fetch latest run per school
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runs } = await (supabase as any)
      .from("demo_data_runs")
      .select("id, school_id, scenario, action, status, summary, created_at, completed_at, error_message")
      .in("school_id", (schools ?? []).map((s: any) => s.id))
      .order("created_at", { ascending: false });

    // Group runs by school, take the latest per school
    const latestBySchool: Record<string, DemoRun> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runs ?? []).forEach((r: any) => {
      if (!latestBySchool[r.school_id]) {
        latestBySchool[r.school_id] = {
          id: r.id, scenario: r.scenario, action: r.action, status: r.status,
          summary: r.summary ?? null, createdAt: r.created_at,
          completedAt: r.completed_at ?? null, errorMessage: r.error_message ?? null,
        };
      }
    });

    setDemoSchools(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (schools ?? []).map((s: any) => ({
        id: s.id, name: s.name,
        subscriptionStatus: s.subscription_status ?? "trial",
        createdAt: s.created_at,
        lastRun: latestBySchool[s.id] ?? null,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadHistory(schoolId: string) {
    setHistoryLoading(schoolId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("demo_data_runs")
      .select("id, scenario, action, status, summary, created_at, completed_at, error_message")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistoryMap((prev) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [schoolId]: (data ?? []).map((r: any) => ({
        id: r.id, scenario: r.scenario, action: r.action, status: r.status,
        summary: r.summary ?? null, createdAt: r.created_at,
        completedAt: r.completed_at ?? null, errorMessage: r.error_message ?? null,
      })),
    }));
    setHistoryLoading(null);
  }

  function toggleHistory(schoolId: string) {
    if (expandedId === schoolId) {
      setExpandedId(null);
    } else {
      setExpandedId(schoolId);
      if (!historyMap[schoolId]) loadHistory(schoolId);
    }
  }

  function openGenerate(school: DemoSchool, refresh = false) {
    setGenerateTarget(school);
    setIsRefresh(refresh);
    setSelectedScenario(school.lastRun?.scenario ?? "small_preschool");
    setGenError("");
  }

  async function handleGenerate() {
    if (!generateTarget) return;
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/super-admin/demo-data/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: generateTarget.id,
          scenario: selectedScenario,
          action: isRefresh ? "refresh" : "generate",
        }),
      });
      const json = await res.json();
      if (!res.ok) { setGenError(json.error ?? "Generation failed."); return; }
      setGenerateTarget(null);
      fetchData();
    } catch {
      setGenError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function openClear(school: DemoSchool) {
    setClearTarget(school);
    setClearError("");
  }

  async function handleClear() {
    if (!clearTarget) return;
    setClearing(true);
    setClearError("");
    try {
      const res = await fetch("/api/super-admin/demo-data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: clearTarget.id }),
      });
      const json = await res.json();
      if (!res.ok) { setClearError(json.error ?? "Clear failed."); return; }
      setClearTarget(null);
      fetchData();
    } catch {
      setClearError("Network error. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  function hasActiveData(school: DemoSchool): boolean {
    const r = school.lastRun;
    if (!r) return false;
    if (r.status !== "completed") return false;
    if (r.action === "clear") return false;
    return true;
  }

  if (loading) return <PageSpinner />;
  if (error)   return <ErrorAlert message={error} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          Demo Data Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate realistic fake data for demo schools. Operations are strictly isolated to schools marked{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">is_demo = true</code>.
        </p>
      </div>

      {/* Safety notice */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Demo data is isolated from real schools.</p>
          <p className="text-amber-700 mt-0.5">
            Generate, refresh, and clear operations only run against demo schools. Any attempt to operate on a
            non-demo school is blocked server-side.
          </p>
        </div>
      </div>

      {/* No demo schools */}
      {demoSchools.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No demo schools found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a school in the Schools page and mark it as <strong>Demo School</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Demo school cards */}
      <div className="space-y-4">
        {demoSchools.map((school) => {
          const active  = hasActiveData(school);
          const lastRun = school.lastRun;
          const summary = lastRun?.status === "completed" && lastRun.action !== "clear"
            ? lastRun.summary : null;

          return (
            <Card key={school.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  {/* School info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-base">{school.name}</h2>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                        <FlaskConical className="w-3 h-3" /> Demo
                      </span>
                      {lastRun && <RunStatusBadge run={lastRun} />}
                    </div>
                    {lastRun && lastRun.status === "completed" && lastRun.action !== "clear" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Scenario: <strong>{getScenarioLabel(lastRun.scenario)}</strong>
                        {" · "}Last generated:{" "}
                        {new Date(lastRun.completedAt ?? lastRun.createdAt).toLocaleDateString("en-PH", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    )}
                    {!lastRun && (
                      <p className="text-xs text-muted-foreground mt-1">No demo data generated yet.</p>
                    )}
                    {lastRun?.status === "failed" && (
                      <p className="text-xs text-destructive mt-1 truncate max-w-md">
                        Error: {lastRun.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!active && (
                      <Button size="sm" onClick={() => openGenerate(school, false)} className="flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Generate Demo Data
                      </Button>
                    )}
                    {active && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openGenerate(school, true)} className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5" />
                          Refresh
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openClear(school)} className="flex items-center gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5">
                          <Trash2 className="w-3.5 h-3.5" />
                          Clear Data
                        </Button>
                      </>
                    )}
                    {lastRun?.status === "failed" && !active && (
                      <Button size="sm" variant="outline" onClick={() => openGenerate(school, false)} className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Stats summary */}
              {summary && (
                <CardContent className="pt-0 pb-3">
                  <div className="flex flex-wrap gap-2">
                    <StatPill icon={Users}        label="Students"      value={summary.studentCount} />
                    <StatPill icon={GraduationCap} label="Teachers"      value={summary.teacherCount} />
                    <StatPill icon={Users}         label="Parents"       value={summary.parentCount} />
                    <StatPill icon={BookOpen}      label="Classes"       value={summary.classCount} />
                    <StatPill icon={CalendarDays}  label="Attendance"    value={summary.attendanceCount.toLocaleString()} />
                    <StatPill icon={Receipt}       label="Bills"         value={summary.billingCount} />
                    <StatPill icon={Receipt}       label="Payments"      value={summary.paymentCount} />
                    <StatPill icon={Eye}           label="Updates"       value={summary.updatesCount} />
                    <StatPill icon={Star}          label="Proud Moments" value={summary.proudMomentsCount} />
                    <StatPill icon={CheckCircle}   label="Observations"  value={summary.observationCount} />
                  </div>
                </CardContent>
              )}

              {/* History toggle */}
              <div className="border-t border-border">
                <button
                  onClick={() => toggleHistory(school.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Run History
                  </span>
                  {historyLoading === school.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : expandedId === school.id
                    ? <ChevronUp className="w-3.5 h-3.5" />
                    : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedId === school.id && (
                  <div className="px-4 pb-3 space-y-2">
                    {(historyMap[school.id] ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No runs recorded yet.</p>
                    )}
                    {(historyMap[school.id] ?? []).map((run) => (
                      <div key={run.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <RunStatusBadge run={run} />
                          <span className="text-xs text-muted-foreground">
                            {run.action === "clear" ? "Cleared data" : `${getScenarioLabel(run.scenario)} · ${run.action}`}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(run.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Generate / Refresh Modal */}
      <Modal
        open={!!generateTarget}
        onClose={() => !generating && setGenerateTarget(null)}
        title={isRefresh ? `Refresh Demo Data — ${generateTarget?.name}` : `Generate Demo Data — ${generateTarget?.name}`}
        className="max-w-lg"
      >
        <div className="space-y-5">
          {isRefresh && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Refreshing will <strong>replace all demo-generated data</strong> for this school with fresh data. The school itself is preserved.</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Choose a scenario</p>
            <div className="space-y-2">
              {DEMO_SCENARIOS.map((s) => {
                const info = SCENARIO_INFO[s];
                return (
                  <label
                    key={s}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedScenario === s
                        ? "border-primary bg-primary/5"
                        : `border-border ${info.color} hover:border-muted-foreground/30`
                    }`}
                  >
                    <input
                      type="radio"
                      name="scenario"
                      value={s}
                      checked={selectedScenario === s}
                      onChange={() => setSelectedScenario(s)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-tight">{getScenarioLabel(s)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getScenarioDescription(s)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 italic">Best for: {info.who}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Scenario details */}
          <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground space-y-1">
            {selectedScenario === "small_preschool" && (
              <>
                <p>• ~38 students across 4 classes (Toddler → Kinder)</p>
                <p>• 4 teachers, 10 parent accounts</p>
                <p>• 4 months billing, 6 weeks attendance, 8 parent updates, 15 proud moments</p>
              </>
            )}
            {selectedScenario === "compliance_heavy" && (
              <>
                <p>• ~80 students across 8 classes (Nursery → Grade 1)</p>
                <p>• 8 teachers, 15 parent accounts</p>
                <p>• 6 months billing, 1 month attendance, 20 parent updates, 40 proud moments, 25 media records</p>
              </>
            )}
            {selectedScenario === "trial_new" && (
              <>
                <p>• 15 students across 2 classes (Playgroup, Pre-Kinder)</p>
                <p>• 2 teachers, 5 parent accounts — minimal setup</p>
                <p>• 2 months billing (mostly unpaid), 3 weeks attendance, 3 updates, 5 proud moments</p>
              </>
            )}
          </div>

          {genError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {genError}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setGenerateTarget(null)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {isRefresh ? "Refreshing…" : "Generating…"}</>
                : <><FlaskConical className="w-4 h-4" /> {isRefresh ? "Refresh Demo Data" : "Generate Demo Data"}</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear Confirmation Modal */}
      <Modal
        open={!!clearTarget}
        onClose={() => !clearing && setClearTarget(null)}
        title="Clear Demo Data"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This will delete all demo-generated records for:</p>
              <p className="font-bold mt-1">{clearTarget?.name}</p>
              <p className="mt-2 text-red-600">
                Students, classes, billing, attendance, parent updates, proud moments, and demo user accounts
                will be permanently removed. The school itself is kept.
              </p>
            </div>
          </div>

          {clearError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {clearError}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setClearTarget(null)} disabled={clearing}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-2"
            >
              {clearing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Clearing…</>
                : <><Trash2 className="w-4 h-4" /> Yes, Clear Data</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
