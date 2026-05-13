"use client";
import { useState, useMemo } from "react";
import {
  Plus, Video, ExternalLink, BookOpen, HelpCircle, X, Search,
  ChevronDown, ChevronRight, AlertTriangle, Copy, Check,
  Calendar, Clock, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStatus = "scheduled" | "live" | "completed" | "cancelled";
type Tab = "today" | "upcoming" | "completed" | "all";

interface OnlineSession {
  id: string;
  className: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
  notes: string;
  status: SessionStatus;
}

interface SessionForm {
  className: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
  notes: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_SESSIONS: OnlineSession[] = [
  {
    id: "1",
    className: "Kinder",
    title: "Phonics Session – Letters A to E",
    date: "2026-04-25",
    startTime: "13:00",
    endTime: "14:30",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    notes: "Please have pencils and workbooks ready.",
    status: "scheduled",
  },
  {
    id: "2",
    className: "Pre-Kinder",
    title: "Colors and Shapes Activity",
    date: "2026-04-24",
    startTime: "10:00",
    endTime: "11:00",
    meetingLink: "https://meet.google.com/pqr-stuv-wx",
    notes: "",
    status: "live",
  },
  {
    id: "3",
    className: "Toddlers",
    title: "Storytime: The Three Little Pigs",
    date: "2026-04-23",
    startTime: "08:00",
    endTime: "09:00",
    meetingLink: "https://meet.google.com/xyz-uvwx-yz",
    notes: "",
    status: "completed",
  },
];

const EMPTY_FORM: SessionForm = {
  className: "Toddlers",
  title: "",
  date: "",
  startTime: "08:00",
  endTime: "09:00",
  meetingLink: "",
  notes: "",
};

const TABS: { id: Tab; label: string }[] = [
  { id: "today",     label: "Today" },
  { id: "upcoming",  label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "all",       label: "All Sessions" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getMeetHost(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500 text-white animate-pulse">
        🔴 Live
      </span>
    );
  }
  const map: Record<Exclude<SessionStatus, "live">, "scheduled" | "completed" | "cancelled"> = {
    scheduled: "scheduled",
    completed:  "completed",
    cancelled:  "cancelled",
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  isActive?: boolean;
  pulse?: boolean;
  onClick?: () => void;
}

function SummaryCard({ label, count, icon, colorClass, bgClass, isActive, pulse, onClick }: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-all bg-card shadow-sm w-full",
        onClick ? "hover:shadow-md hover:border-primary/40 cursor-pointer" : "cursor-default",
        isActive ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center mb-3",
        bgClass,
        colorClass,
        pulse && count > 0 && "animate-pulse",
      )}>
        {icon}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", colorClass)}>{count}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
    </button>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: OnlineSession;
  copiedId: string | null;
  onUpdateStatus: (id: string, status: SessionStatus) => void;
  onCopyLink: (id: string, link: string) => void;
}

function SessionCard({ session, copiedId, onUpdateStatus, onCopyLink }: SessionCardProps) {
  const isCopied = copiedId === session.id;

  return (
    <Card className={cn(
      "overflow-hidden transition-shadow hover:shadow-md",
      session.status === "live" && "ring-2 ring-green-400/40 border-green-200",
    )}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-3">

          {/* Row 1: status + actions */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <StatusBadge status={session.status} />
            <div className="flex items-center gap-2 flex-shrink-0">
              {session.status === "scheduled" && (
                <>
                  <Button size="sm" onClick={() => onUpdateStatus(session.id, "live")}>
                    Start Session
                  </Button>
                  {session.meetingLink && (
                    <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-3.5 h-3.5" /> Link
                      </Button>
                    </a>
                  )}
                </>
              )}
              {session.status === "live" && (
                <>
                  {session.meetingLink && (
                    <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm">
                        <ExternalLink className="w-3.5 h-3.5" /> Join
                      </Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onUpdateStatus(session.id, "completed")}>
                    End
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: title */}
          <h3 className="text-base font-semibold leading-snug">{session.title}</h3>

          {/* Row 3: class badge + date + time */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge variant="default" className="text-xs font-medium">{session.className}</Badge>
            <span className="text-border select-none">&middot;</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {formatDate(session.date)}
            </span>
            <span className="text-border select-none">&middot;</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              {formatTime(session.startTime)} &ndash; {formatTime(session.endTime)}
            </span>
          </div>

          {/* Row 4: meeting link */}
          {session.meetingLink && (
            <div className="flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{getMeetHost(session.meetingLink)}</span>
              <button
                type="button"
                onClick={() => onCopyLink(session.id, session.meetingLink)}
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors flex-shrink-0",
                  isCopied
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-border hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {isCopied
                  ? <><Check className="w-3 h-3" /> Copied!</>
                  : <><Copy className="w-3 h-3" /> Copy Link</>
                }
              </button>
            </div>
          )}

          {/* Row 5: parent notes */}
          {session.notes && (
            <div className="text-xs bg-muted/60 rounded-lg px-3 py-2 text-muted-foreground">
              <span className="font-semibold text-foreground not-italic">Parent Notes: </span>
              {session.notes}
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}

// ── EmptyTabState ─────────────────────────────────────────────────────────────

function EmptyTabState({
  tab,
  hasSearch,
  onSchedule,
}: {
  tab: Tab;
  hasSearch: boolean;
  onSchedule: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Search className="w-10 h-10 text-muted-foreground/30" />
        <div>
          <p className="font-medium">No sessions match your search</p>
          <p className="text-sm text-muted-foreground mt-1">Try a different term or clear the search field.</p>
        </div>
      </div>
    );
  }

  const config: Record<Tab, { icon: React.ReactNode; title: string; desc: string; showCta: boolean }> = {
    today: {
      icon: <Calendar className="w-10 h-10 text-muted-foreground/30" />,
      title: "No sessions today",
      desc: "There are no online sessions scheduled for today.",
      showCta: true,
    },
    upcoming: {
      icon: <Clock className="w-10 h-10 text-muted-foreground/30" />,
      title: "No upcoming sessions",
      desc: "All caught up — schedule a session when you’re ready.",
      showCta: true,
    },
    completed: {
      icon: <Check className="w-10 h-10 text-muted-foreground/30" />,
      title: "No completed sessions yet",
      desc: "Completed sessions will appear here after they wrap up.",
      showCta: false,
    },
    all: {
      icon: <Video className="w-10 h-10 text-muted-foreground/30" />,
      title: "No sessions yet",
      desc: "Schedule your first online class session to get started.",
      showCta: true,
    },
  };

  const { icon, title, desc, showCta } = config[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {icon}
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </div>
      {showCta && (
        <Button variant="outline" onClick={onSchedule}>
          <Plus className="w-4 h-4" /> Schedule Session
        </Button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnlineClassesPage() {
  const [sessions, setSessions] = useState<OnlineSession[]>(DEMO_SESSIONS);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  const today = getTodayStr();

  // Summary counts
  const liveCount      = sessions.filter((s) => s.status === "live").length;
  const todayCount     = sessions.filter((s) => s.date === today || s.status === "live").length;
  const upcomingCount  = sessions.filter((s) => s.status === "scheduled").length;
  const completedCount = sessions.filter((s) => s.status === "completed" || s.status === "cancelled").length;

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...sessions]
      .filter((s) => {
        if (activeTab === "today")     return s.date === today || s.status === "live";
        if (activeTab === "upcoming")  return s.status === "scheduled";
        if (activeTab === "completed") return s.status === "completed" || s.status === "cancelled";
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.title.toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q) ||
          s.notes.toLowerCase().includes(q) ||
          s.date.includes(q)
        );
      })
      .sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        return b.date.localeCompare(a.date);
      });
  }, [sessions, activeTab, search, today]);

  function handleSave() {
    setSessions((prev) => [{ id: Date.now().toString(), ...form, status: "scheduled" }, ...prev]);
    setModalOpen(false);
    setForm(EMPTY_FORM);
  }

  function updateStatus(id: string, status: SessionStatus) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function copyLink(id: string, link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>Online Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">Schedule and manage online class sessions</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            <HelpCircle className="w-4 h-4" /> Help Topics
          </button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Schedule Session
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Live Now"
          count={liveCount}
          icon={<Radio className="w-4 h-4" />}
          colorClass="text-green-600"
          bgClass="bg-green-100"
          pulse
        />
        <SummaryCard
          label="Today"
          count={todayCount}
          icon={<Calendar className="w-4 h-4" />}
          colorClass="text-blue-600"
          bgClass="bg-blue-100"
          isActive={activeTab === "today"}
          onClick={() => setActiveTab("today")}
        />
        <SummaryCard
          label="Upcoming"
          count={upcomingCount}
          icon={<Clock className="w-4 h-4" />}
          colorClass="text-orange-600"
          bgClass="bg-orange-100"
          isActive={activeTab === "upcoming"}
          onClick={() => setActiveTab("upcoming")}
        />
        <SummaryCard
          label="Completed"
          count={completedCount}
          icon={<Check className="w-4 h-4" />}
          colorClass="text-gray-600"
          bgClass="bg-gray-100"
          isActive={activeTab === "completed"}
          onClick={() => setActiveTab("completed")}
        />
      </div>

      {/* ── Search + Tabs ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search by title, class, notes, or date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-lg flex-shrink-0 self-start">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors whitespace-nowrap",
                activeTab === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Session List ── */}
      {sorted.length === 0 ? (
        <EmptyTabState
          tab={activeTab}
          hasSearch={search.trim().length > 0}
          onSchedule={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              copiedId={copiedId}
              onUpdateStatus={updateStatus}
              onCopyLink={copyLink}
            />
          ))}
        </div>
      )}

      {/* ── Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Online Classes Help</h2>
              </div>
              <button
                onClick={() => { setHelpOpen(false); setHelpSearch(""); }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={helpSearch}
                  onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
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
                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "demo-mode",
                    icon: AlertTriangle,
                    title: "⚠️ This page is in demo mode",
                    searchText: "demo mode static not saved database wired local state",
                    body: (
                      <div className="space-y-2">
                        <p>Online Classes is currently running on <strong>local state only</strong> — sessions you schedule here are not saved to the database and will reset when you reload the page.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Sessions added here are for UI demonstration only.</span>} />
                          <Step n={2} text={<span>To use this page in production, the Supabase wiring needs to be completed (see CLAUDE.md — Online Classes is marked ⚠️ Partial).</span>} />
                        </div>
                        <Note>All other pages in the system save to the real database. Online Classes is the only page that has not been wired up yet. Status changes and new sessions will reset on page refresh.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "schedule-session",
                    icon: Plus,
                    title: "Schedule an online session",
                    searchText: "schedule add session title class date time meeting link parent notes",
                    body: (
                      <div className="space-y-2">
                        <p>Use this to pre-schedule upcoming online class sessions so teachers and parents know what is coming.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Schedule Session</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter a <strong>title</strong> describing what the session covers.</span>} />
                          <Step n={3} text={<span>Select the <strong>class</strong> and set the <strong>date</strong>, <strong>start time</strong>, and <strong>end time</strong>.</span>} />
                          <Step n={4} text={<span>Paste the <strong>Google Meet link</strong> parents and teachers will use to join.</span>} />
                          <Step n={5} text={<span>Optionally add <strong>Parent Notes</strong> — shown on each session card.</span>} />
                          <Step n={6} text={<span>Click <strong>Schedule</strong>.</span>} />
                        </div>
                        <Tip>Use the Meet link set on the class (Classes page) as the default for all sessions of that class.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "statuses",
                    icon: Video,
                    title: "Session statuses — what each means",
                    searchText: "status scheduled live completed cancelled badge color start end",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { label: "Scheduled", color: "text-blue-600",  desc: "Session is upcoming. A Start Session button is available when you are ready to begin." },
                          { label: "Live",      color: "text-green-600", desc: "Session is in progress (pulsing green badge). End and Join buttons are shown." },
                          { label: "Completed", color: "text-gray-500",  desc: "Session has ended normally." },
                          { label: "Cancelled", color: "text-red-600",   desc: "Session was cancelled before it started." },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-20 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Once set to Completed or Cancelled, the status cannot be changed back from this page.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "start-session",
                    icon: Video,
                    title: "Start, join, and end a live session",
                    searchText: "start session live join end meet link button go online",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-2 mt-1">
                          <Step n={1} text={<span>When it is time to begin, click <strong>Start Session</strong>. Status changes to Live.</span>} />
                          <Step n={2} text={<span>Click <strong>Join</strong> to open the Google Meet link in a new tab.</span>} />
                          <Step n={3} text={<span>When class is done, click <strong>End</strong> to mark the session as Completed.</span>} />
                          <Step n={4} text={<span>Use <strong>Copy Link</strong> on any card to copy the meeting URL to share with parents.</span>} />
                        </div>
                        <Note>Sharing the session URL with parents is handled through the parent portal (via class Messenger link or a Parent Update post).</Note>
                      </div>
                    ),
                  },
                  {
                    id: "tabs-search",
                    icon: Search,
                    title: "Filtering and searching sessions",
                    searchText: "filter tab search today upcoming completed all find session",
                    body: (
                      <div className="space-y-2">
                        <p>Use the <strong>tabs</strong> and <strong>search bar</strong> together to find sessions quickly.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span><strong>Today</strong> — sessions dated today plus any live sessions.</span>} />
                          <Step n={2} text={<span><strong>Upcoming</strong> — all sessions with Scheduled status.</span>} />
                          <Step n={3} text={<span><strong>Completed</strong> — finished and cancelled sessions.</span>} />
                          <Step n={4} text={<span><strong>All Sessions</strong> — everything regardless of status.</span>} />
                          <Step n={5} text={<span>The <strong>search bar</strong> filters within the selected tab by title, class, notes, or date.</span>} />
                        </div>
                        <Note>Click the Today, Upcoming, or Completed summary cards at the top to jump directly to that tab.</Note>
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q
                  ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q))
                  : topics;
                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                      <p className="text-sm">No topics match &ldquo;<span className="font-medium text-foreground">{helpSearch}</span>&rdquo;</p>
                      <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                    </div>
                  );
                }
                return filtered.map((item) => {
                  const Icon = item.icon;
                  const isOpen = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        }
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                          {item.body}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch
                ? <span>Showing results for &ldquo;<span className="font-medium text-foreground">{helpSearch}</span>&rdquo;</span>
                : <span>5 topics &middot; click any to expand</span>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Online Class">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Phonics Session – Letters A to E"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <Select value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })}>
                <option>Toddlers</option>
                <option>Pre-Kinder</option>
                <option>Kinder</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Google Meet Link</label>
            <Input
              value={form.meetingLink}
              onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
              placeholder="https://meet.google.com/…"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste the class meeting link parents and teachers will use.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Parent Notes</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes visible to parents on the session card…"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={!form.title || !form.date}>
              Schedule
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
