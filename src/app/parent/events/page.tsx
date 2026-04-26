"use client";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { formatTime, formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

type RsvpResponse = "going" | "not_going" | "maybe";

interface Event {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  fee: number | null;
  rsvp: RsvpResponse | null;
  rsvpId: string | null;
  saving: boolean;
}

const RSVP_OPTIONS: { value: RsvpResponse; label: string; active: string; inactive: string }[] = [
  { value: "going",     label: "Going",    active: "bg-green-500 text-white border-green-500",  inactive: "border-border text-muted-foreground hover:border-green-400 hover:text-green-700" },
  { value: "maybe",     label: "Maybe",    active: "bg-yellow-400 text-white border-yellow-400", inactive: "border-border text-muted-foreground hover:border-yellow-400 hover:text-yellow-700" },
  { value: "not_going", label: "Can't go", active: "bg-red-400 text-white border-red-400",       inactive: "border-border text-muted-foreground hover:border-red-400 hover:text-red-600" },
];

export default function ParentEventsPage() {
  const { childId, classId, schoolId } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);

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
      .select("id, title, description, event_date, start_time, end_time, applies_to, class_id, fee")
      .eq("school_id", schoolId)
      .gte("event_date", today)
      .order("event_date");

    // Only show events that apply to this child (all-school or their specific class)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relevant = ((evData ?? []) as any[]).filter((e: any) => {
      if (e.applies_to === "all") return true;
      if (e.applies_to === "class" && classId && e.class_id === classId) return true;
      return false;
    });

    // Fetch existing RSVPs for this child in one query
    const eventIds: string[] = relevant.map((e: any) => e.id);
    const rsvpMap: Record<string, { id: string; response: RsvpResponse }> = {};
    if (eventIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rsvpData } = await (supabase as any)
        .from("event_rsvps")
        .select("id, event_id, response")
        .eq("student_id", childId)
        .in("event_id", eventIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (rsvpData ?? []) as any[]) {
        rsvpMap[r.event_id] = { id: r.id, response: r.response };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEvents(relevant.map((e: any): Event => ({
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      eventDate: e.event_date,
      startTime: e.start_time ?? null,
      endTime: e.end_time ?? null,
      fee: e.fee ?? null,
      rsvp: rsvpMap[e.id]?.response ?? null,
      rsvpId: rsvpMap[e.id]?.id ?? null,
      saving: false,
    })));

    setLoading(false);
  }

  async function handleRsvp(eventId: string, response: RsvpResponse) {
    if (!childId) return;
    setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, saving: true } : e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("event_rsvps")
      .upsert(
        { event_id: eventId, student_id: childId, response },
        { onConflict: "event_id,student_id" }
      )
      .select("id, response")
      .single();

    if (!error && data) {
      setEvents((prev) => prev.map((e) =>
        e.id === eventId
          ? { ...e, rsvp: data.response as RsvpResponse, rsvpId: data.id, saving: false }
          : e
      ));
    } else {
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, saving: false } : e));
    }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="text-muted-foreground text-sm mt-1">Upcoming school events</p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No upcoming events</p>
            <p className="text-sm mt-1">Check back later for school events.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const d = new Date(event.eventDate + "T00:00:00");
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
                      <p className="font-semibold text-sm leading-snug">{event.title}</p>
                      {(event.startTime || event.endTime) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.startTime && formatTime(event.startTime)}
                          {event.startTime && event.endTime && " – "}
                          {event.endTime && formatTime(event.endTime)}
                        </p>
                      )}
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

                  {/* RSVP */}
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
                          {event.saving && event.rsvp !== opt.value ? "…" : opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
