"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { cn } from "@/lib/utils";
import {
  getNoteForSession,
  listClinicMembers,
  updateSession,
  upsertSessionNote,
} from "./sessions-api";
import type {
  ClinicMember,
  SessionStatus,
  TherapySession,
  TherapySessionNote,
  TherapyType,
} from "./types";

interface Props {
  open: boolean;
  session: TherapySession | null;
  /** Caller's profile id — used as authored_by when saving notes. */
  callerProfileId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const THERAPY_TYPES: { value: TherapyType; label: string }[] = [
  { value: "speech", label: "Speech" },
  { value: "occupational", label: "Occupational" },
  { value: "behavioral", label: "Behavioral" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: SessionStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

function splitIso(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { date: "", time: "09:00" };
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export function EditSessionModal({
  open,
  session,
  callerProfileId,
  onClose,
  onSaved,
}: Props) {
  const [members, setMembers] = useState<ClinicMember[]>([]);

  const [therapistId, setTherapistId] = useState<string>("");
  const [therapyType, setTherapyType] = useState<TherapyType>("speech");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("09:00");
  const [duration, setDuration] = useState<string>("");
  const [status, setStatus] = useState<SessionStatus>("scheduled");
  const [notes, setNotes] = useState<string>("");

  // Phase 6E.1 — structured note fields
  const [existingNote, setExistingNote] = useState<TherapySessionNote | null>(null);
  const [sessionObjective, setSessionObjective] = useState<string>("");
  const [activities, setActivities] = useState<string>("");
  const [childResponse, setChildResponse] = useState<string>("");
  const [progressObserved, setProgressObserved] = useState<string>("");
  const [homePractice, setHomePractice] = useState<string>("");
  const [privateInternalNote, setPrivateInternalNote] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    setError(null);
    setSubmitting(false);
    setTherapistId(session.therapistProfileId);
    setTherapyType(session.therapyType);
    const { date: d, time: t } = splitIso(session.scheduledAt);
    setDate(d);
    setTime(t);
    setDuration(session.durationMinutes != null ? String(session.durationMinutes) : "");
    setStatus(session.status);
    setNotes(session.notes ?? "");

    // Reset notes block before fetch.
    setExistingNote(null);
    setSessionObjective("");
    setActivities("");
    setChildResponse("");
    setProgressObserved("");
    setHomePractice("");
    setPrivateInternalNote("");

    let cancelled = false;
    listClinicMembers(session.clinicOrganizationId).then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    getNoteForSession(session.id, session.clinicOrganizationId).then((note) => {
      if (cancelled) return;
      if (!note) return;
      setExistingNote(note);
      setSessionObjective(note.sessionObjective ?? "");
      setActivities(note.activities ?? "");
      setChildResponse(note.childResponse ?? "");
      setProgressObserved(note.progressObserved ?? "");
      setHomePractice(note.homePractice ?? "");
      setPrivateInternalNote(note.privateInternalNote ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  const scheduledAtIso = useMemo<string | null>(() => {
    if (!date || !time) return null;
    const dt = new Date(`${date}T${time}`);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }, [date, time]);

  const canSubmit = !!session && !submitting && !!therapistId && !!scheduledAtIso;

  const noteFields = {
    sessionObjective,
    activities,
    childResponse,
    progressObserved,
    homePractice,
    privateInternalNote,
  };
  const noteFieldsDirty =
    !!existingNote
      ? sessionObjective !== (existingNote.sessionObjective ?? "") ||
        activities !== (existingNote.activities ?? "") ||
        childResponse !== (existingNote.childResponse ?? "") ||
        progressObserved !== (existingNote.progressObserved ?? "") ||
        homePractice !== (existingNote.homePractice ?? "") ||
        privateInternalNote !== (existingNote.privateInternalNote ?? "")
      : Object.values(noteFields).some((v) => v.trim() !== "");

  const notesLocked = status === "cancelled";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session || !scheduledAtIso) return;

    const durationVal = duration.trim() === "" ? null : Number(duration);
    if (durationVal !== null && (!Number.isFinite(durationVal) || durationVal <= 0)) {
      setError("Duration must be a positive number of minutes.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await updateSession(session.id, {
      therapistProfileId: therapistId,
      therapyType,
      scheduledAt: scheduledAtIso,
      durationMinutes: durationVal,
      status,
      notes: notes.trim() || null,
    });
    if ("error" in result) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    // Save structured notes when (a) anything changed and (b) the
    // resulting status is not 'cancelled'. App-side mirror of the
    // RLS hard block — surfaces a friendlier error than waiting for
    // the policy to reject.
    if (noteFieldsDirty) {
      if (status === "cancelled") {
        setSubmitting(false);
        setError(
          "Session is cancelled — notes can't be added or changed. Restore the session to scheduled or completed first.",
        );
        return;
      }
      if (!callerProfileId) {
        setSubmitting(false);
        setError("Couldn't identify the author. Please refresh and try again.");
        return;
      }
      const noteResult = await upsertSessionNote(
        session.id,
        callerProfileId,
        noteFields,
      );
      if ("error" in noteResult) {
        setSubmitting(false);
        setError(noteResult.error);
        return;
      }
    }

    setSubmitting(false);
    onSaved();
  }

  if (!session) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Session" className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          For <strong>{session.childDisplayName ?? "child"}</strong>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Time</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Therapist</label>
          {members.length === 0 ? (
            <Select disabled value="">
              <option value="">{session.therapistName ?? "Loading…"}</option>
            </Select>
          ) : (
            <Select
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              disabled={submitting}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName ?? m.email} · {m.role}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Therapy type</label>
          <div className="flex flex-wrap gap-2">
            {THERAPY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTherapyType(t.value)}
                disabled={submitting}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  therapyType === t.value
                    ? "bg-primary text-white border-primary"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                disabled={submitting}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  status === s.value
                    ? "bg-primary text-white border-primary"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Duration <span className="text-xs text-muted-foreground font-normal">(minutes, optional)</span>
          </label>
          <Input
            type="number"
            min="1"
            step="15"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            disabled={submitting}
          />
        </div>

        {/* Phase 6E.1 — Structured session notes */}
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Session notes</h3>
            {existingNote && (
              <p className="text-xs text-muted-foreground">
                {existingNote.authorName ? (
                  <>By {existingNote.authorName} · </>
                ) : null}
                Updated {new Date(existingNote.updatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {notesLocked && (
            <div className="flex items-start gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>
                Session is cancelled. Notes can&apos;t be added or changed.
                Restore the session to scheduled or completed to edit.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                Session objective
              </label>
              <Textarea
                value={sessionObjective}
                onChange={(e) => setSessionObjective(e.target.value)}
                rows={3}
                disabled={submitting || notesLocked}
                placeholder="What was this session aiming for?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Activities</label>
              <Textarea
                value={activities}
                onChange={(e) => setActivities(e.target.value)}
                rows={3}
                disabled={submitting || notesLocked}
                placeholder="What did you do?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Child response
              </label>
              <Textarea
                value={childResponse}
                onChange={(e) => setChildResponse(e.target.value)}
                rows={3}
                disabled={submitting || notesLocked}
                placeholder="How did the child respond?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Progress observed
              </label>
              <Textarea
                value={progressObserved}
                onChange={(e) => setProgressObserved(e.target.value)}
                rows={3}
                disabled={submitting || notesLocked}
                placeholder="What changed since last session?"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">
                Home practice / recommendation
              </label>
              <Textarea
                value={homePractice}
                onChange={(e) => setHomePractice(e.target.value)}
                rows={2}
                disabled={submitting || notesLocked}
                placeholder="Suggested practice between sessions"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">
                Private internal note
                <span className="ml-1.5 text-muted-foreground font-normal">
                  · Internal — never shared
                </span>
              </label>
              <Textarea
                value={privateInternalNote}
                onChange={(e) => setPrivateInternalNote(e.target.value)}
                rows={2}
                disabled={submitting || notesLocked}
                placeholder="Visible only to clinic staff"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
