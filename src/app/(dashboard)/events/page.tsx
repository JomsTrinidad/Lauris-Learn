"use client";
import { useEffect, useState } from "react";
import { Plus, Calendar, Clock, Users, BookOpen, HelpCircle, X, Search, ChevronDown, ChevronRight, AlertTriangle, ListChecks } from "lucide-react";
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
import { getInitials } from "@/lib/utils";

type AppliesTo = "all" | "class" | "selected";
type RsvpStatus = "going" | "maybe" | "not_going";

interface Event {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  appliesTo: AppliesTo;
  classId: string | null;
  className: string;
  fee: number | null;
  requiresRsvp: boolean;
  maxCompanions: number | null;
  rsvpGoing: number;
  rsvpMaybe: number;
  rsvpNotGoing: number;
  rsvpNoResponse: number;
  totalCompanions: number;
}

interface RsvpRow {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  status: RsvpStatus;
  companions: number;
  companionNames: string[];
}

interface ClassOption {
  id: string;
  name: string;
}

interface EventForm {
  title: string;
  description: string;
  eventDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  appliesTo: AppliesTo;
  classId: string;
  fee: string;
  requiresRsvp: boolean;
  maxCompanions: string;
}

const EMPTY_FORM: EventForm = {
  title: "", description: "", eventDate: "",
  allDay: false, startTime: "", endTime: "",
  appliesTo: "all", classId: "", fee: "",
  requiresRsvp: true, maxCompanions: "",
};

const STATUS_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Can't go",
};

const STATUS_COLORS: Record<RsvpStatus, string> = {
  going: "bg-green-100 text-green-700 border-green-200",
  maybe: "bg-yellow-100 text-yellow-700 border-yellow-200",
  not_going: "bg-red-100 text-red-600 border-red-200",
};

function formatEventDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr + "T23:59:59") >= new Date();
}

export default function EventsPage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();

  const [events, setEvents] = useState<Event[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");

  // RSVP list modal
  const [rsvpViewEvent, setRsvpViewEvent] = useState<Event | null>(null);
  const [rsvpRows, setRsvpRows] = useState<RsvpRow[]>([]);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpFilter, setRsvpFilter] = useState<"all" | RsvpStatus>("all");

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    await Promise.all([loadEvents(), loadClasses()]);
    setLoading(false);
  }

  async function loadEvents() {
    const [evResult, enrollResult] = await Promise.all([
      supabase
        .from("events")
        .select(`id, title, description, event_date, start_time, end_time, all_day,
          applies_to, class_id, fee, requires_rsvp, max_companions, classes(name),
          event_rsvps(status, companions)`)
        .eq("school_id", schoolId!)
        .order("event_date"),
      supabase
        .from("enrollments")
        .select("class_id")
        .eq("school_id", schoolId!)
        .eq("school_year_id", activeYear?.id ?? "")
        .eq("status", "enrolled"),
    ]);

    if (evResult.error) { setError(evResult.error.message); return; }

    const classCount: Record<string, number> = {};
    for (const e of (enrollResult.data ?? [])) {
      classCount[e.class_id] = (classCount[e.class_id] ?? 0) + 1;
    }
    const totalEnrolled = Object.values(classCount).reduce((a, b) => a + b, 0);

    setEvents(
      (evResult.data ?? []).map((e) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rsvps: any[] = (e as any).event_rsvps ?? [];
        const rsvpGoing    = rsvps.filter((r) => r.status === "going").length;
        const rsvpMaybe    = rsvps.filter((r) => r.status === "maybe").length;
        const rsvpNotGoing = rsvps.filter((r) => r.status === "not_going").length;
        const totalRsvps   = rsvpGoing + rsvpMaybe + rsvpNotGoing;
        const totalCompanions = rsvps
          .filter((r) => r.status === "going")
          .reduce((sum, r) => sum + (r.companions ?? 0), 0);

        let eligible = 0;
        if (e.applies_to === "all") eligible = totalEnrolled;
        else if (e.applies_to === "class" && e.class_id) eligible = classCount[e.class_id] ?? 0;

        const requiresRsvp = (e as any).requires_rsvp ?? true;

        return {
          id: e.id,
          title: e.title,
          description: e.description ?? "",
          eventDate: e.event_date,
          startTime: e.start_time ?? null,
          endTime: e.end_time ?? null,
          allDay: (e as any).all_day ?? false,
          appliesTo: (e.applies_to as AppliesTo) ?? "all",
          classId: e.class_id ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          className: (e as any).classes?.name ?? "",
          fee: e.fee ? Number(e.fee) : null,
          requiresRsvp,
          maxCompanions: (e as any).max_companions ?? null,
          rsvpGoing,
          rsvpMaybe,
          rsvpNotGoing,
          rsvpNoResponse: requiresRsvp ? Math.max(0, eligible - totalRsvps) : 0,
          totalCompanions,
        };
      })
    );
  }

  async function loadClasses() {
    if (!activeYear?.id) { setClassOptions([]); return; }
    const { data } = await supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("name");
    setClassOptions(data ?? []);
  }

  async function openRsvpView(event: Event) {
    setRsvpViewEvent(event);
    setRsvpLoading(true);
    setRsvpFilter("all");
    setRsvpRows([]);

    const { data: rsvpData } = await supabase
      .from("event_rsvps")
      .select("id, student_id, status, companions, companion_names")
      .eq("event_id", event.id);

    const studentIds = (rsvpData ?? [])
      .map((r) => r.student_id)
      .filter((id): id is string => !!id);

    const [studentRes, enrollRes] = await Promise.all([
      studentIds.length > 0
        ? supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0 && activeYear?.id
        ? supabase
            .from("enrollments")
            .select("student_id, classes(name)")
            .in("student_id", studentIds)
            .eq("school_year_id", activeYear.id)
            .eq("status", "enrolled")
        : Promise.resolve({ data: [] }),
    ]);

    const studentMap: Record<string, string> = {};
    for (const s of (studentRes.data ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      studentMap[(s as any).id] = `${(s as any).first_name} ${(s as any).last_name}`;
    }
    const classMap: Record<string, string> = {};
    for (const e of (enrollRes.data ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any).student_id) classMap[(e as any).student_id] = (e as any).classes?.name ?? "—";
    }

    setRsvpRows(
      (rsvpData ?? []).map((r) => ({
        id: r.id,
        studentId: r.student_id ?? "",
        studentName: r.student_id ? (studentMap[r.student_id] ?? "Unknown") : "Unknown",
        className: r.student_id ? (classMap[r.student_id] ?? "—") : "—",
        status: r.status as RsvpStatus,
        companions: r.companions ?? 0,
        companionNames: (r.companion_names as string[] | null) ?? [],
      }))
    );

    setRsvpLoading(false);
  }

  async function handleSave() {
    if (!form.title.trim()) { setFormError("Event name is required."); return; }
    if (!form.eventDate) { setFormError("Event date is required."); return; }
    if (form.appliesTo === "class" && !form.classId) { setFormError("Select a class."); return; }

    setSaving(true);
    setFormError(null);

    const maxComp = form.maxCompanions.trim() !== "" ? parseInt(form.maxCompanions, 10) : null;

    const { error: iErr } = await supabase.from("events").insert({
      school_id: schoolId!,
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.eventDate,
      all_day: form.allDay,
      start_time: form.allDay ? null : (form.startTime || null),
      end_time: form.allDay ? null : (form.endTime || null),
      applies_to: form.appliesTo,
      class_id: form.appliesTo === "class" ? form.classId : null,
      fee: form.fee ? parseFloat(form.fee) : null,
      requires_rsvp: form.requiresRsvp,
      max_companions: form.requiresRsvp ? maxComp : null,
    });

    if (iErr) { setFormError(iErr.message); setSaving(false); return; }
    setSaving(false);
    setModalOpen(false);
    setForm(EMPTY_FORM);
    await loadEvents();
  }

  const displayed = tab === "upcoming"
    ? events.filter((e) => isUpcoming(e.eventDate)).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    : [...events].sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  const filteredRsvpRows = rsvpFilter === "all" ? rsvpRows : rsvpRows.filter((r) => r.status === rsvpFilter);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Events & Activities</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage school events, field trips, and activities</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4" /> Add Event
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {(["upcoming", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "upcoming" ? "Upcoming" : "All Events"}
          </button>
        ))}
      </div>

      {/* Event list */}
      {displayed.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10 text-muted-foreground">
            No events to show.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayed.map((event) => (
            <Card key={event.id} className="overflow-hidden">
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-shrink-0 bg-primary text-primary-foreground rounded-xl p-3 text-center min-w-[72px]">
                    <p className="text-xs font-medium uppercase">
                      {new Date(event.eventDate + "T00:00:00").toLocaleDateString("en-PH", { month: "short" })}
                    </p>
                    <p className="text-2xl font-bold leading-tight">
                      {new Date(event.eventDate + "T00:00:00").getDate()}
                    </p>
                    <p className="text-xs">
                      {new Date(event.eventDate + "T00:00:00").getFullYear()}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold">{event.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {event.appliesTo === "class" && event.className && (
                          <Badge variant="default">{event.className}</Badge>
                        )}
                        {event.appliesTo === "all" && (
                          <Badge variant="default">All Students</Badge>
                        )}
                        {!event.requiresRsvp && (
                          <Badge variant="default">Informational only</Badge>
                        )}
                        {!isUpcoming(event.eventDate) && (
                          <Badge variant="archived">Past</Badge>
                        )}
                      </div>
                    </div>

                    {event.description && (
                      <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatEventDate(event.eventDate)}
                        {event.allDay && <span className="text-xs">(All day)</span>}
                      </div>
                      {!event.allDay && event.startTime && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}
                        </div>
                      )}
                      {event.fee != null && (
                        <span>Fee: ₱{event.fee.toLocaleString()}</span>
                      )}
                    </div>

                    {event.requiresRsvp && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-4 text-xs">
                          <span className="flex items-center gap-1 text-green-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                            {event.rsvpGoing} Going
                            {event.totalCompanions > 0 && (
                              <span className="text-muted-foreground font-normal ml-0.5">
                                (+{event.totalCompanions} companion{event.totalCompanions !== 1 ? "s" : ""})
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                            {event.rsvpMaybe} Maybe
                          </span>
                          <span className="flex items-center gap-1 text-red-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                            {event.rsvpNotGoing} Can&apos;t go
                          </span>
                          {event.rsvpNoResponse > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground font-medium">
                              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
                              {event.rsvpNoResponse} No response
                            </span>
                          )}
                        </div>
                        {(event.rsvpGoing + event.rsvpMaybe + event.rsvpNotGoing) > 0 && (
                          <button
                            onClick={() => openRsvpView(event)}
                            className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            View RSVP list
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* RSVP List Modal */}
      <Modal
        open={!!rsvpViewEvent}
        onClose={() => { setRsvpViewEvent(null); setRsvpRows([]); }}
        title={rsvpViewEvent ? `RSVPs — ${rsvpViewEvent.title}` : "RSVPs"}
      >
        {rsvpLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter tabs */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit text-xs">
              {([
                { key: "all", label: `All (${rsvpRows.length})` },
                { key: "going", label: `Going (${rsvpRows.filter(r => r.status === "going").length})` },
                { key: "maybe", label: `Maybe (${rsvpRows.filter(r => r.status === "maybe").length})` },
                { key: "not_going", label: `Can't go (${rsvpRows.filter(r => r.status === "not_going").length})` },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRsvpFilter(key)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    rsvpFilter === key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredRsvpRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No responses yet.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {filteredRsvpRows.map((row) => (
                  <div key={row.id} className="border border-border rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {getInitials(row.studentName)}
                      </div>
                      {/* Name + class */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{row.studentName}</p>
                        <p className="text-xs text-muted-foreground">{row.className}</p>
                      </div>
                      {/* Status badge */}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                      {/* Companions count */}
                      {row.status === "going" && rsvpViewEvent?.maxCompanions !== null && (
                        <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">
                          +{row.companions} companion{row.companions !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {/* Companion names */}
                    {row.status === "going" && row.companionNames.length > 0 && (
                      <div className="mt-2 ml-11 space-y-0.5">
                        {row.companionNames.map((name, i) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0 inline-block" />
                            {name || <span className="italic">No name given</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => { setRsvpViewEvent(null); setRsvpRows([]); }}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Events Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                <h2 className="font-semibold text-base">Events Help</h2>
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
                    id: "add-event",
                    icon: Plus,
                    title: "Create a new event",
                    searchText: "add create event activity field trip title date time description",
                    body: (
                      <div className="space-y-2">
                        <p>Events appear in the parent portal so parents can see upcoming activities and RSVP.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add Event</strong> (top right).</span>} />
                          <Step n={2} text={<span>Enter the <strong>event name</strong> and <strong>date</strong> — required. Add a description with more details.</span>} />
                          <Step n={3} text={<span>Set the <strong>start and end time</strong>, or check <strong>All-day event</strong> if no specific time applies.</span>} />
                          <Step n={4} text={<span>Choose <strong>Applies to</strong>: All Students (school-wide) or Specific Class (e.g. only Kinder parents see it).</span>} />
                          <Step n={5} text={<span>If the event has a fee, enter it. If you want RSVPs, leave <strong>Require RSVP</strong> checked.</span>} />
                          <Step n={6} text={<span>Click <strong>Save Event</strong>.</span>} />
                        </div>
                        <Note>Events are not editable after saving from this page — if you need to correct details, you'd need to delete and recreate. Plan details before saving.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "rsvp-list",
                    icon: ListChecks,
                    title: "View who RSVP'd",
                    searchText: "rsvp list students going attendance who responded view names companions",
                    body: (
                      <div className="space-y-2">
                        <p>Once parents have submitted their responses, you can see the full list of students and their companion details.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>On any event card, look for the RSVP counts row (Going / Maybe / Can&apos;t go).</span>} />
                          <Step n={2} text={<span>Click <strong>View RSVP list</strong> underneath the counts.</span>} />
                          <Step n={3} text={<span>Filter by status using the tabs at the top: All, Going, Maybe, or Can&apos;t go.</span>} />
                          <Step n={4} text={<span>Each row shows the student&apos;s name, class, response status, companion count, and each companion&apos;s name (if provided by the parent).</span>} />
                        </div>
                        <Tip>The "View RSVP list" link only appears after at least one parent has responded.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "applies-to",
                    icon: Users,
                    title: "Control who sees an event",
                    searchText: "applies to all students class specific audience who sees visibility",
                    body: (
                      <div className="space-y-2">
                        <p>The <strong>Applies to</strong> field controls which parents can see the event in their portal.</p>
                        <div className="space-y-2.5 mt-2">
                          {[
                            { label: "All Students", desc: "Every parent in the school sees this event. Use for school-wide activities: graduation, Family Day, etc." },
                            { label: "Specific Class", desc: "Only parents of students in the selected class see it. Use for class-level activities: field trips, picture day for one class." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="font-semibold text-xs w-28 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Note>There is also a "Selected Students" option in the database schema but it's not yet surfaced in the UI — currently only All Students and Specific Class are supported on this page.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "rsvp",
                    icon: Calendar,
                    title: "Reading RSVP counts",
                    searchText: "rsvp going not going maybe no response count companions track",
                    body: (
                      <div className="space-y-2">
                        <p>Each event card shows a live count of parent responses from the parent portal.</p>
                        <div className="space-y-2.5 mt-2">
                          {[
                            { label: "Going", color: "text-green-600", desc: "Parent confirmed attendance. Companions count (if tracked) shows how many guests they're bringing." },
                            { label: "Not Going", color: "text-red-600", desc: "Parent confirmed their child won't attend." },
                            { label: "Maybe", color: "text-yellow-600", desc: "Parent is unsure." },
                            { label: "No Response", color: "text-muted-foreground", desc: "Eligible students whose parents haven't responded yet." },
                          ].map(({ label, color, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className={`font-semibold text-xs w-24 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Tip>If <strong>Require RSVP</strong> was not checked when creating the event, no RSVP counts appear — the event is marked "Informational only" in the parent portal.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "companions",
                    icon: Users,
                    title: "Track companions / headcount",
                    searchText: "companions headcount guests max limit venue booking names list",
                    body: (
                      <div className="space-y-2">
                        <p>Use the <strong>Max Companions</strong> field when you need a headcount for venue booking — e.g. a field trip where parents can join.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>When creating the event, enter a number in <strong>Max Companions</strong> (e.g. "2" = up to 2 adults per student).</span>} />
                          <Step n={2} text={<span>Leave blank if you're not tracking companions.</span>} />
                          <Step n={3} text={<span>Parents selecting "Going" can set a companion count and optionally enter each companion&apos;s name.</span>} />
                          <Step n={4} text={<span>The total companions count appears on the event card. Click <strong>View RSVP list</strong> to see individual companion names.</span>} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "tabs",
                    icon: Clock,
                    title: "Upcoming vs All Events tabs",
                    searchText: "upcoming past all events tab view filter historical",
                    body: (
                      <div className="space-y-2">
                        <div className="space-y-2.5 mt-1">
                          {[
                            { label: "Upcoming", desc: "Shows only events with a future date (today or later), sorted soonest first. Default view for day-to-day planning." },
                            { label: "All Events", desc: "Shows all events including past ones, sorted newest first. Use this to check RSVP totals for a past event." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="font-semibold text-xs w-20 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "fee",
                    icon: Calendar,
                    title: "Adding a fee to an event",
                    searchText: "fee payment charge field trip cost amount billing",
                    body: (
                      <div className="space-y-2">
                        <p>The event fee is informational — it shows in the parent portal so parents know what to prepare. It does not automatically create a billing record.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>When creating the event, enter the amount in the <strong>Fee (₱)</strong> field.</span>} />
                          <Step n={2} text={<span>It appears on the event card in the parent portal as "Fee: ₱X".</span>} />
                          <Step n={3} text={<span>To actually collect payment, go to <strong>Billing</strong> and add a billing record for each attending student.</span>} />
                        </div>
                        <Note>Automatic fee-to-billing linking (generate billing from event RSVPs) is a planned feature, not yet built.</Note>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); setFormError(null); }} title="Add Event">
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} />}

          <div>
            <label className="block text-sm font-medium mb-1">Event Name *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Recognition Day" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." rows={2} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Event Date *</label>
            <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked, startTime: "", endTime: "" })}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-sm font-medium">All-day event</span>
          </label>

          {!form.allDay && (
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
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Applies to</label>
            <Select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as AppliesTo, classId: "" })}>
              <option value="all">All Students</option>
              <option value="class">Specific Class</option>
            </Select>
          </div>

          {form.appliesTo === "class" && (
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">— Select class —</option>
                {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Optional Fee (₱)</label>
            <Input type="number" min={0} step={50} placeholder="Leave blank if free" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          </div>

          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.requiresRsvp}
                onChange={(e) => setForm({ ...form, requiresRsvp: e.target.checked, maxCompanions: "" })}
                className="w-4 h-4 rounded accent-primary"
              />
              <div>
                <span className="text-sm font-medium">Require RSVP</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uncheck for informational announcements — parents won&apos;t see a response prompt.
                </p>
              </div>
            </label>

            {form.requiresRsvp && (
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Max companions per attendee
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Leave blank — not tracking companions"
                  value={form.maxCompanions}
                  onChange={(e) => setForm({ ...form, maxCompanions: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Set this when booking a venue outside school and you need headcount. 0 = no companions allowed.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={handleSave} disabled={saving || !form.title || !form.eventDate}>
              {saving ? "Saving…" : "Save Event"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
