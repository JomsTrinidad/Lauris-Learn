"use client";
import { useState } from "react";
import { Plus, Video, ExternalLink } from "lucide-react";
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
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Schedule Session
        </Button>
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
