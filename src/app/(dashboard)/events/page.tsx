"use client";
import { useEffect, useState } from "react";
import { Plus, Calendar, Clock, Users } from "lucide-react";
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

type AppliesTo = "all" | "class" | "selected";

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
    // Fetch events and enrollment counts in parallel
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

    // Build per-class enrollment count for "no response" calculation
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

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Events & Activities</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage school events, field trips, and activities</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4" /> Add Event
        </Button>
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
                      <div className="mt-3 flex flex-wrap gap-4 text-xs">
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
                          {event.rsvpNotGoing} Can't go
                        </span>
                        {event.rsvpNoResponse > 0 && (
                          <span className="flex items-center gap-1 text-muted-foreground font-medium">
                            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
                            {event.rsvpNoResponse} No response
                          </span>
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

      {/* Add Event Modal */}
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

          {/* All-day toggle */}
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

          {/* RSVP / Informational toggle */}
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
                  Uncheck for informational announcements — parents won't see a response prompt.
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
