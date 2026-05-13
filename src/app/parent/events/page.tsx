"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Info, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { formatTime, formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

type RsvpResponse = "going" | "not_going" | "maybe";
type EventTypeFilter = "all" | "school_event" | "class_event" | "meeting" | "deadline" | "holiday";

interface Event {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  fee: number | null;
  requiresRsvp: boolean;
  maxCompanions: number | null;
  eventType: string;
  rsvp: RsvpResponse | null;
  rsvpId: string | null;
  companions: number;
  companionNames: string[];
  saving: boolean;
  changedFromGoing: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  school_event: "School Event",
  class_event:  "Class Event",
  holiday:      "No Classes — Holiday",
  deadline:     "Action Needed",
  meeting:      "Meeting",
  online_class: "Online Class",
};

const EVENT_TYPE_BADGE: Record<string, string> = {
  school_event: "bg-blue-50 text-blue-700 border-blue-200",
  class_event:  "bg-primary/10 text-primary border-primary/20",
  holiday:      "bg-muted text-muted-foreground border-border",
  deadline:     "bg-amber-50 text-amber-700 border-amber-200",
  meeting:      "bg-purple-50 text-purple-700 border-purple-200",
  online_class: "bg-sky-50 text-sky-700 border-sky-200",
};

const FILTER_TABS: { value: EventTypeFilter; label: string }[] = [
  { value: "all",          label: "All" },
  { value: "school_event", label: "School Events" },
  { value: "class_event",  label: "Class Events" },
  { value: "meeting",      label: "Meetings" },
  { value: "deadline",     label: "Deadlines" },
  { value: "holiday",      label: "Holidays" },
];

const RSVP_OPTIONS: { value: RsvpResponse; label: string; active: string; inactive: string }[] = [
  { value: "going",     label: "Going",    active: "bg-green-500 text-white border-green-500",   inactive: "border-border text-muted-foreground hover:border-green-400 hover:text-green-700" },
  { value: "maybe",     label: "Maybe",    active: "bg-yellow-400 text-white border-yellow-400", inactive: "border-border text-muted-foreground hover:border-yellow-400 hover:text-yellow-700" },
  { value: "not_going", label: "Can't go", active: "bg-red-400 text-white border-red-400",       inactive: "border-border text-muted-foreground hover:border-red-400 hover:text-red-600" },
];

export default function ParentEventsPage() {
  const { childId, classId, schoolId } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");

  // Local companion name drafts, keyed by eventId — tracks unsaved edits
  const [namesDraft, setNamesDraft] = useState<Record<string, string[]>>({});
  const [namesDirty, setNamesDirty] = useState<Record<string, boolean>>({});
  const [namesSaving, setNamesSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!schoolId || !childId) { setLoading(false); return; }
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId, schoolId]);

  async function loadEvents() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: evData } = await (supabase as any)
      .from("events")
      .select("id, title, description, event_date, start_time, end_time, all_day, applies_to, class_id, fee, requires_rsvp, max_companions, event_type")
      .eq("school_id", schoolId)
      .gte("event_date", today)
      .order("event_date");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relevant = ((evData ?? []) as any[]).filter((e: any) => {
      if (e.applies_to === "all") return true;
      if (e.applies_to === "class" && classId && e.class_id === classId) return true;
      return false;
    });

    const eventIds: string[] = relevant.map((e: any) => e.id);
    const rsvpMap: Record<string, { id: string; response: RsvpResponse; companions: number; companionNames: string[] }> = {};
    if (eventIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rsvpData } = await (supabase as any)
        .from("event_rsvps")
        .select("id, event_id, status, companions, companion_names")
        .eq("student_id", childId)
        .in("event_id", eventIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (rsvpData ?? []) as any[]) {
        rsvpMap[r.event_id] = {
          id: r.id,
          response: r.status,
          companions: r.companions ?? 0,
          companionNames: (r.companion_names as string[] | null) ?? [],
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = relevant.map((e: any): Event => ({
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      eventDate: e.event_date,
      startTime: e.start_time ?? null,
      endTime: e.end_time ?? null,
      allDay: e.all_day ?? false,
      fee: e.fee ?? null,
      requiresRsvp: e.requires_rsvp ?? true,
      maxCompanions: e.max_companions ?? null,
      eventType: e.event_type ?? "school_event",
      rsvp: rsvpMap[e.id]?.response ?? null,
      rsvpId: rsvpMap[e.id]?.id ?? null,
      companions: rsvpMap[e.id]?.companions ?? 0,
      companionNames: rsvpMap[e.id]?.companionNames ?? [],
      saving: false,
      changedFromGoing: false,
    }));

    setEvents(mapped);

    // Seed name drafts from saved data
    const initialDrafts: Record<string, string[]> = {};
    for (const ev of mapped) {
      if (ev.rsvp === "going" && ev.companionNames.length > 0) {
        initialDrafts[ev.id] = [...ev.companionNames];
      }
    }
    setNamesDraft(initialDrafts);
    setNamesDirty({});

    setLoading(false);
  }

  async function handleRsvp(eventId: string, response: RsvpResponse, companions?: number, companionNames?: string[]) {
    if (!childId) return;

    const current = events.find((e) => e.id === eventId);
    const wasGoing = current?.rsvp === "going";
    const changingFromGoing = wasGoing && response !== "going";
    const companionsToSave = companions ?? current?.companions ?? 0;
    const namesToSave = companionNames ?? (response === "going" ? (namesDraft[eventId] ?? current?.companionNames ?? []) : []);

    setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, saving: true } : e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("event_rsvps")
      .upsert(
        {
          event_id: eventId,
          student_id: childId,
          status: response,
          companions: companionsToSave,
          companion_names: response === "going" ? namesToSave : [],
        },
        { onConflict: "event_id,student_id" }
      )
      .select("id, status, companions, companion_names")
      .single();

    if (!error && data) {
      const savedNames = (data.companion_names as string[] | null) ?? [];
      setEvents((prev) => prev.map((e) =>
        e.id === eventId
          ? {
              ...e,
              rsvp: data.status as RsvpResponse,
              rsvpId: data.id,
              companions: data.companions ?? 0,
              companionNames: savedNames,
              saving: false,
              changedFromGoing: changingFromGoing,
            }
          : e
      ));
      // Sync draft to saved state
      setNamesDraft((prev) => ({ ...prev, [eventId]: savedNames }));
      setNamesDirty((prev) => ({ ...prev, [eventId]: false }));
    } else {
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, saving: false } : e));
      alert("Your response couldn't be saved. Please try again or contact your child's teacher.");
    }
  }

  async function handleSaveNames(eventId: string) {
    const ev = events.find((e) => e.id === eventId);
    if (!ev || ev.rsvp !== "going") return;
    setNamesSaving((prev) => ({ ...prev, [eventId]: true }));
    await handleRsvp(eventId, "going", ev.companions, namesDraft[eventId] ?? []);
    setNamesSaving((prev) => ({ ...prev, [eventId]: false }));
  }

  function handleCompanionsChange(eventId: string, delta: number) {
    const ev = events.find((e) => e.id === eventId);
    if (!ev || ev.rsvp !== "going") return;
    const max = ev.maxCompanions ?? 20;
    const next = Math.max(0, Math.min(max, ev.companions + delta));
    if (next === ev.companions) return;

    // Adjust name draft slots to match new count
    const currentDraft = namesDraft[eventId] ?? [];
    const newDraft = Array.from({ length: next }, (_, i) => currentDraft[i] ?? "");
    setNamesDraft((prev) => ({ ...prev, [eventId]: newDraft }));
    setNamesDirty((prev) => ({ ...prev, [eventId]: false }));

    handleRsvp(eventId, "going", next, newDraft);
  }

  function handleNameChange(eventId: string, index: number, value: string) {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const draft = [...(namesDraft[eventId] ?? Array(ev.companions).fill(""))];
    draft[index] = value;
    setNamesDraft((prev) => ({ ...prev, [eventId]: draft }));
    setNamesDirty((prev) => ({ ...prev, [eventId]: true }));
  }

  if (loading) return <PageSpinner />;

  const visibleEvents = typeFilter === "all"
    ? events
    : events.filter((e) => e.eventType === typeFilter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="text-muted-foreground text-sm mt-1">Upcoming school events</p>
      </div>

      {/* Filter tabs */}
      {events.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {FILTER_TABS.map((tab) => {
            const count = tab.value === "all" ? events.length : events.filter((e) => e.eventType === tab.value).length;
            if (count === 0 && tab.value !== "all") return null;
            return (
              <button
                key={tab.value}
                onClick={() => setTypeFilter(tab.value)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  typeFilter === tab.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {tab.label}
                {tab.value !== "all" && count > 0 && (
                  <span className="ml-1 opacity-70">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {visibleEvents.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {typeFilter === "all" ? "No upcoming events" : `No ${EVENT_TYPE_LABELS[typeFilter] ?? typeFilter} events`}
            </p>
            <p className="text-sm mt-1">Check back later for school events.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleEvents.map((event) => {
            const d = new Date(event.eventDate + "T00:00:00");
            const draft = namesDraft[event.id] ?? [];
            const isDirty = !!namesDirty[event.id];
            const isSavingNames = !!namesSaving[event.id];

            return (
              <Card key={event.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Date + title */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 text-center border border-border rounded-lg py-1.5">
                      <p className="text-xs text-muted-foreground uppercase leading-none">
                        {d.toLocaleDateString("en-PH", { month: "short" })}
                      </p>
                      <p className="text-xl font-bold leading-tight">{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${EVENT_TYPE_BADGE[event.eventType] ?? EVENT_TYPE_BADGE.school_event}`}>
                          {EVENT_TYPE_LABELS[event.eventType] ?? "Event"}
                        </span>
                      </div>
                      <p className="font-semibold text-sm leading-snug">{event.title}</p>
                      {event.allDay ? (
                        <p className="text-xs text-muted-foreground mt-0.5">All day</p>
                      ) : (event.startTime || event.endTime) ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.startTime && formatTime(event.startTime)}
                          {event.startTime && event.endTime && " – "}
                          {event.endTime && formatTime(event.endTime)}
                        </p>
                      ) : null}
                      {event.fee != null && event.fee > 0 && (
                        <p className="text-xs text-amber-600 font-medium mt-0.5">
                          Fee: {formatCurrency(event.fee)}
                        </p>
                      )}
                    </div>
                  </div>

                  {event.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {event.description}
                    </p>
                  )}

                  {/* Informational-only events */}
                  {!event.requiresRsvp && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      For your information — no response needed.
                    </div>
                  )}

                  {/* RSVP section */}
                  {event.requiresRsvp && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {event.rsvp ? "Your response:" : "Will you attend?"}
                      </p>
                      <div className="flex gap-2">
                        {RSVP_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleRsvp(event.id, opt.value)}
                            disabled={event.saving}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                              event.rsvp === opt.value ? opt.active : opt.inactive
                            } ${event.saving ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {event.saving ? "…" : opt.label}
                          </button>
                        ))}
                      </div>

                      {event.rsvp && !event.saving && (
                        <p className="text-xs text-green-600 mt-1.5">
                          ✓ Your response has been sent to the school.
                        </p>
                      )}

                      {event.changedFromGoing && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="flex-shrink-0 mt-0.5">⚠</span>
                          <span>
                            You previously said you&apos;re going. If arrangements were already being made, please let the teacher know directly.
                          </span>
                        </div>
                      )}

                      {/* Companions section — shown when event tracks companions and parent is going */}
                      {event.rsvp === "going" && event.maxCompanions !== null && (
                        <div className="mt-3 space-y-3">
                          {/* Stepper */}
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              Companions attending:
                            </span>
                            {event.maxCompanions === 0 ? (
                              <span className="text-xs text-muted-foreground italic">None allowed for this event</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleCompanionsChange(event.id, -1)}
                                  disabled={event.saving || event.companions <= 0}
                                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-sm hover:bg-accent disabled:opacity-40 transition-colors"
                                >
                                  −
                                </button>
                                <span className="text-sm font-semibold w-5 text-center tabular-nums">
                                  {event.companions}
                                </span>
                                <button
                                  onClick={() => handleCompanionsChange(event.id, +1)}
                                  disabled={event.saving || event.companions >= event.maxCompanions}
                                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-sm hover:bg-accent disabled:opacity-40 transition-colors"
                                >
                                  +
                                </button>
                                <span className="text-xs text-muted-foreground">
                                  (max {event.maxCompanions})
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Companion name inputs */}
                          {event.companions > 0 && (
                            <div className="space-y-2 pl-1">
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <UserPlus className="w-3.5 h-3.5" />
                                Companion names <span className="opacity-60">(optional)</span>
                              </p>
                              {Array.from({ length: event.companions }).map((_, i) => (
                                <input
                                  key={i}
                                  type="text"
                                  value={draft[i] ?? ""}
                                  onChange={(e) => handleNameChange(event.id, i, e.target.value)}
                                  placeholder={`Companion ${i + 1} name`}
                                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                />
                              ))}
                              {isDirty && (
                                <button
                                  onClick={() => handleSaveNames(event.id)}
                                  disabled={isSavingNames}
                                  className="text-xs text-primary font-medium hover:underline disabled:opacity-50 transition-opacity"
                                >
                                  {isSavingNames ? "Saving…" : "Save names"}
                                </button>
                              )}
                              {!isDirty && draft.some((n) => n.trim()) && (
                                <p className="text-xs text-green-600">✓ Names saved</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
