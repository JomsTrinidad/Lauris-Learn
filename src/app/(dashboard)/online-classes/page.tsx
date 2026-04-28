"use client";
import { useState } from "react";
import { Plus, Video, ExternalLink, BookOpen, HelpCircle, X, Search, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

type SessionStatus = "scheduled" | "live" | "completed" | "cancelled";

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

const DEMO_SESSIONS: OnlineSession[] = [
  { id: "1", className: "Kinder", title: "Phonics Session – Letters A to E", date: "2026-04-25", startTime: "13:00", endTime: "14:30", meetingLink: "https://meet.google.com/abc-defg-hij", notes: "Please have pencils and workbooks ready.", status: "scheduled" },
  { id: "2", className: "Pre-Kinder", title: "Colors and Shapes Activity", date: "2026-04-24", startTime: "10:00", endTime: "11:00", meetingLink: "https://meet.google.com/pqr-stuv-wx", notes: "", status: "live" },
  { id: "3", className: "Toddlers", title: "Storytime: The Three Little Pigs", date: "2026-04-23", startTime: "08:00", endTime: "09:00", meetingLink: "https://meet.google.com/xyz-uvwx-yz", notes: "", status: "completed" },
];

interface SessionForm {
  className: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingLink: string;
  notes: string;
}

const EMPTY_FORM: SessionForm = {
  className: "Toddlers", title: "", date: "",
  startTime: "08:00", endTime: "09:00",
  meetingLink: "", notes: "",
};

const STATUS_COLORS: Record<SessionStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  live:       "bg-green-500 text-white animate-pulse",
  completed:  "bg-gray-100 text-gray-600",
  cancelled:  "bg-red-100 text-red-700",
};

export default function OnlineClassesPage() {
  const [sessions, setSessions] = useState<OnlineSession[]>(DEMO_SESSIONS);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  function handleSave() {
    const s: OnlineSession = {
      id: Date.now().toString(),
      ...form,
      status: "scheduled",
    };
    setSessions((prev) => [s, ...prev]);
    setModalOpen(false);
    setForm(EMPTY_FORM);
  }

  function updateStatus(id: string, status: SessionStatus) {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Online Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">Schedule and manage online class sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Schedule Session
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {sessions.map((session) => (
          <Card key={session.id} className="overflow-hidden">
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-shrink-0 bg-primary/10 text-primary rounded-xl p-3 w-fit">
                  <Video className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold">{session.title}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[session.status]}`}>
                      {session.status === "live" ? "🔴 LIVE" : session.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {session.className} · {session.date} · {formatTime(session.startTime)} – {formatTime(session.endTime)}
                  </p>
                  {session.notes && <p className="text-xs text-muted-foreground mt-1 italic">{session.notes}</p>}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {session.status === "scheduled" && (
                    <Button size="sm" onClick={() => updateStatus(session.id, "live")}>
                      Start Session
                    </Button>
                  )}
                  {session.status === "live" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(session.id, "completed")}>
                        End
                      </Button>
                      {session.meetingLink && (
                        <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                          <Button size="sm">
                            <ExternalLink className="w-4 h-4" /> Join
                          </Button>
                        </a>
                      )}
                    </>
                  )}
                  {session.meetingLink && session.status === "scheduled" && (
                    <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-3.5 h-3.5" /> Link
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Online Classes Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Online Classes Help</h2>
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
                        <Note>All other pages in the system save to the real database. Online Classes is the only page that hasn't been wired up yet. Status changes and new sessions will reset on page refresh.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "schedule-session",
                    icon: Plus,
                    title: "Schedule an online session",
                    searchText: "schedule add session title class date time meeting link notes",
                    body: (
                      <div className="space-y-2">
                        <p>Use this to pre-schedule upcoming online class sessions so teachers and parents know what's coming.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Schedule Session</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter a <strong>title</strong> describing what the session covers (e.g. "Phonics – Letters A to E").</span>} />
                          <Step n={3} text={<span>Select the <strong>class</strong> and set the <strong>date</strong>, <strong>start time</strong>, and <strong>end time</strong>.</span>} />
                          <Step n={4} text={<span>Paste the <strong>Google Meet link</strong> for the session. Parents and teachers will use this link to join.</span>} />
                          <Step n={5} text={<span>Optionally add <strong>notes</strong> (e.g. "Please have workbooks ready").</span>} />
                          <Step n={6} text={<span>Click <strong>Save Session</strong>.</span>} />
                        </div>
                        <Tip>Use the Meet link set on the class (in Classes → Edit class) as the default for all sessions of that class. Paste it here each time, or set a permanent class-level link.</Tip>
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
                          { label: "Scheduled", color: "text-blue-600", desc: "Session is upcoming. A 'Start Session' button is available when you're ready to begin." },
                          { label: "Live", color: "text-green-600", desc: "Session is in progress (pulsing green badge). End and Join buttons are shown." },
                          { label: "Completed", color: "text-gray-500", desc: "Session has ended normally." },
                          { label: "Cancelled", color: "text-red-600", desc: "Session was cancelled before it started." },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-20 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Note>Status changes are made with the Start Session / End / Cancel buttons on each session card. Once set to Completed or Cancelled, the status can't be changed back from this page.</Note>
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
                          <Step n={1} text={<span>When it's time to begin, click <strong>Start Session</strong> on the Scheduled card. The status changes to Live.</span>} />
                          <Step n={2} text={<span>Click <strong>Join</strong> to open the Google Meet link in a new tab and start the video call.</span>} />
                          <Step n={3} text={<span>When class is done, click <strong>End</strong> to mark the session as Completed.</span>} />
                        </div>
                        <Note>The Join link is the same Google Meet URL you entered when scheduling. Sharing the session URL directly with parents is handled through the parent portal (via the class Messenger link or a Parent Update post).</Note>
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q)) : topics;
                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
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
              {helpSearch ? <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span> : <span>4 topics · click any to expand</span>}
            </div>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Online Class">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Phonics Session – Letters A to E" />
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
            <Input value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} placeholder="https://meet.google.com/..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes for parents..." rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={!form.title || !form.date}>Schedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
