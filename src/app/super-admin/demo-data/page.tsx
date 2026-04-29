"use client";
import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical, RefreshCw, Trash2, Plus, CheckCircle, AlertTriangle,
  Users, GraduationCap, BookOpen, CalendarDays, Receipt, Star, Eye,
  ChevronDown, ChevronUp, Clock, XCircle, Loader2,
  HelpCircle, X, Search, ChevronRight, Key, School as SchoolIcon,
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

  const [helpOpen, setHelpOpen]           = useState(false);
  const [helpSearch, setHelpSearch]       = useState("");
  const [helpExpanded, setHelpExpanded]   = useState<Record<string, boolean>>({});

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
      <div className="flex items-start justify-between gap-4">
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
        <button
          onClick={() => setHelpOpen(true)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          title="Demo data help"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
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

      {/* ── Demo Data Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Demo Data Help</h2>
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
                const Code = ({ children }: { children: string }) => (
                  <pre className="bg-muted rounded-lg p-2.5 text-xs font-mono text-foreground overflow-x-auto border border-border my-2 whitespace-pre-wrap break-all">{children}</pre>
                );
                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "overview",
                    icon: FlaskConical,
                    title: "What is demo data?",
                    searchText: "overview what demo data fake realistic isolated safe school is_demo",
                    body: (
                      <div className="space-y-2">
                        <p>Demo data is a set of realistic but entirely fake records — students, classes, billing, attendance, updates, and user accounts — seeded into a designated demo school for walkthroughs and testing.</p>
                        <p>All operations (generate, refresh, clear) are restricted to schools flagged as <code className="bg-muted px-1 rounded text-xs">is_demo = true</code>. The server rejects any request targeting a real school.</p>
                        <Note>Demo schools appear on this page. Regular schools managed in the Schools page are never touched by any operation here.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "setup",
                    icon: SchoolIcon,
                    title: "Setting up a demo school",
                    searchText: "setup create demo school is_demo mark schools page prerequisite before generate",
                    body: (
                      <div className="space-y-2">
                        <p>A demo school must exist before you can generate data. If this page shows no schools, create one first.</p>
                        <div className="space-y-2 mt-1">
                          <Step n={1} text={<span>Go to <strong className="text-foreground">Schools</strong> in the sidebar.</span>} />
                          <Step n={2} text={<span>Click <strong className="text-foreground">+ New School</strong> and fill in the school name and trial dates.</span>} />
                          <Step n={3} text={<span>Check <strong className="text-foreground">Mark as demo/test account</strong> — this sets <code className="bg-muted px-1 rounded">is_demo = true</code>.</span>} />
                          <Step n={4} text={<span>Save. The school will appear on this page, ready for data generation.</span>} />
                        </div>
                        <Tip>You can also convert an existing school to demo by editing it in the Schools page and checking the demo checkbox.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "scenarios",
                    icon: Users,
                    title: "Choosing a scenario",
                    searchText: "scenario small preschool compliance heavy trial new which use best for sales walkthrough",
                    body: (
                      <div className="space-y-2">
                        <p>Each scenario seeds a different volume and type of data. Pick based on your presentation goal:</p>
                        <div className="space-y-2 mt-1">
                          {[
                            {
                              name: "Small Preschool",
                              key: "small_preschool",
                              size: "4 classes · ~38 students · 4 teachers · 10 parents",
                              best: "General walkthroughs and sales demos — balanced and easy to navigate.",
                            },
                            {
                              name: "Compliance-Heavy",
                              key: "compliance_heavy",
                              size: "8 classes · ~80 students · 8 teachers · 15 parents",
                              best: "Showing reporting, media workflows, and billing at scale.",
                            },
                            {
                              name: "New Trial School",
                              key: "trial_new",
                              size: "2 classes · 15 students · 2 teachers · 5 parents",
                              best: "Onboarding demos — shows an incomplete, real-looking setup.",
                            },
                          ].map(({ name, key, size, best }) => (
                            <div key={key} className="bg-muted/50 rounded-lg p-2.5 border border-border space-y-0.5">
                              <p className="text-xs font-semibold text-foreground">{name} <code className="font-mono text-primary ml-1 text-[10px]">{key}</code></p>
                              <p className="text-xs text-muted-foreground">{size}</p>
                              <p className="text-xs text-muted-foreground italic">Best for: {best}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "actions",
                    icon: RefreshCw,
                    title: "Generate, Refresh, and Clear",
                    searchText: "generate refresh clear data actions difference what happens replace wipe reset",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-2.5 mt-1">
                          {[
                            {
                              label: "Generate Demo Data",
                              color: "text-primary",
                              desc: "First-time seeding. Clears any prior data and seeds a full fresh dataset for the chosen scenario. Use this when the school has no demo data yet.",
                            },
                            {
                              label: "Refresh",
                              color: "text-foreground",
                              desc: "Re-seeds the school with a fresh dataset (same as generate, but labeled for repeat use). The school shell is preserved. Use to reset after a messy walkthrough.",
                            },
                            {
                              label: "Clear Data",
                              color: "text-destructive",
                              desc: "Removes all demo-generated records — students, billing, attendance, updates, user accounts — but leaves the school record intact. Use to empty out without re-generating.",
                            },
                          ].map(({ label, color, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className={`font-semibold text-xs w-28 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Tip>If a generation run fails partway through, click <strong>Generate</strong> again — the route auto-clears partial data before retrying. Check the run history panel for the error message.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "credentials",
                    icon: Key,
                    title: "Demo login credentials",
                    searchText: "credentials login password email teacher parent batch id accounts demo users find",
                    body: (
                      <div className="space-y-2">
                        <p>Every generation run creates a unique <strong className="text-foreground">batch ID</strong> — a 7-character base-36 timestamp (e.g. <code className="bg-muted px-1 rounded text-xs">abc1x3f</code>). All demo user credentials use this batch ID.</p>
                        <div className="space-y-1.5">
                          <div className="bg-muted/50 rounded-lg p-2.5 border border-border">
                            <p className="text-xs font-semibold text-foreground mb-1">Teacher accounts</p>
                            <p className="text-xs font-mono">Email: teacher.demo.{"{batchId}"}.01@example.com</p>
                            <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
                            <p className="text-xs text-muted-foreground mt-1">Numbered 01, 02… up to the teacher count for the scenario.</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2.5 border border-border">
                            <p className="text-xs font-semibold text-foreground mb-1">Parent accounts</p>
                            <p className="text-xs font-mono">Email: parent.demo.{"{batchId}"}.01@example.com</p>
                            <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
                            <p className="text-xs text-muted-foreground mt-1">Numbered 01, 02… up to the parent count for the scenario.</p>
                          </div>
                        </div>
                        <Tip>The batch ID changes every time you generate or refresh. To find the current batch ID: Supabase Dashboard → Authentication → Users, filter by <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">@example.com</code> to see the current emails.</Tip>
                        <Code>{`-- Find demo user emails for a school
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
                    id: "history",
                    icon: Clock,
                    title: "Reading the run history",
                    searchText: "run history log status completed failed generating pending timestamps scenario",
                    body: (
                      <div className="space-y-2">
                        <p>Each school card shows a <strong className="text-foreground">Run History</strong> toggle at the bottom. Expand it to see the last 10 runs for that school.</p>
                        <div className="space-y-2 mt-1">
                          {[
                            { label: "Generating…", desc: "Run is currently in progress. Refresh the page in a few seconds to see the updated status." },
                            { label: "Generated", desc: "Completed successfully. The stat pills above show what was seeded." },
                            { label: "Cleared", desc: "A clear operation completed — all data was removed." },
                            { label: "Failed", desc: "An error occurred. The error message is shown on the card. Run again to retry — partial data is auto-cleaned." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="font-semibold text-xs w-24 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Note>The stat pills (Students, Teachers, Bills, etc.) on the card reflect the <strong>last successful generate run</strong>, not the current live count. They don&apos;t update after a clear.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "safety",
                    icon: AlertTriangle,
                    title: "Safety & isolation",
                    searchText: "safety isolation real school data protect block server side is_demo guard",
                    body: (
                      <div className="space-y-2">
                        <p>Demo operations have multiple layers of protection to prevent accidental changes to real school data:</p>
                        <div className="space-y-1.5 mt-1">
                          {[
                            "The generate and clear API routes verify is_demo = true before running. Any request targeting a non-demo school is rejected with a 403 error.",
                            "This page only lists schools where is_demo = true — real schools never appear here.",
                            "Demo user accounts use @example.com emails and are immediately identifiable in Supabase Auth.",
                            "Each run is logged to demo_data_runs with the school ID, scenario, action, and timestamp for a full audit trail.",
                          ].map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" /><span>{item}</span>
                            </div>
                          ))}
                        </div>
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
              {helpSearch ? <span>Showing results for &quot;<span className="font-medium text-foreground">{helpSearch}</span>&quot;</span> : <span>7 topics · click any to expand</span>}
            </div>
          </div>
        </div>
      )}

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
