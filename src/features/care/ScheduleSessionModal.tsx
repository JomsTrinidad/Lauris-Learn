"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { cn } from "@/lib/utils";
import { createSession, listClinicMembers } from "./sessions-api";
import type { ClinicMember, TherapyType } from "./types";

interface Props {
  open: boolean;
  organizationId: string;
  /** Child profile id. Locked when the modal is launched from a child
   *  detail page; required in v1 (no child picker yet). */
  childProfileId: string;
  childName: string;
  /** Caller's profile id; used as both `created_by` and the default
   *  therapist when the caller is themselves an active member. */
  callerProfileId: string;
  onClose: () => void;
  onCreated: () => void;
}

const THERAPY_TYPES: { value: TherapyType; label: string }[] = [
  { value: "speech", label: "Speech" },
  { value: "occupational", label: "Occupational" },
  { value: "behavioral", label: "Behavioral" },
  { value: "other", label: "Other" },
];

export function ScheduleSessionModal({
  open,
  organizationId,
  childProfileId,
  childName,
  callerProfileId,
  onClose,
  onCreated,
}: Props) {
  const [members, setMembers] = useState<ClinicMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [therapistId, setTherapistId] = useState<string>("");
  const [therapyType, setTherapyType] = useState<TherapyType>("speech");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("09:00");
  const [duration, setDuration] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setTherapyType("speech");
    setDate("");
    setTime("09:00");
    setDuration("");
    setNotes("");

    let cancelled = false;
    setMembersLoading(true);
    listClinicMembers(organizationId).then((rows) => {
      if (cancelled) return;
      setMembers(rows);
      setMembersLoading(false);
      // Default to caller if caller is a member.
      const callerIsMember = rows.some((m) => m.id === callerProfileId);
      setTherapistId(
        callerIsMember
          ? callerProfileId
          : rows.length > 0
            ? rows[0].id
            : "",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, callerProfileId]);

  const scheduledAtIso = useMemo<string | null>(() => {
    if (!date || !time) return null;
    const dt = new Date(`${date}T${time}`);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }, [date, time]);

  const canSubmit =
    !!therapistId && !!therapyType && !!scheduledAtIso && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !scheduledAtIso) return;
    setSubmitting(true);
    setError(null);
    const durationVal = duration.trim() === "" ? null : Number(duration);
    if (durationVal !== null && (!Number.isFinite(durationVal) || durationVal <= 0)) {
      setSubmitting(false);
      setError("Duration must be a positive number of minutes.");
      return;
    }

    const result = await createSession({
      clinicOrganizationId: organizationId,
      childProfileId,
      therapistProfileId: therapistId,
      createdByProfileId: callerProfileId,
      therapyType,
      scheduledAt: scheduledAtIso,
      durationMinutes: durationVal,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  const therapistName = useMemo(() => {
    const m = members.find((x) => x.id === therapistId);
    return m?.fullName ?? m?.email ?? null;
  }, [members, therapistId]);

  return (
    <Modal open={open} onClose={onClose} title="Schedule Session" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          For <strong>{childName}</strong>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Date <span className="text-red-600">*</span>
            </label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Time <span className="text-red-600">*</span>
            </label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Therapist <span className="text-red-600">*</span>
          </label>
          {membersLoading ? (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading clinic members…
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-amber-700">
              No active clinic members found. Add a therapist first.
            </p>
          ) : (
            <Select
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              disabled={submitting}
              required
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
          <label className="block text-sm font-medium mb-1.5">
            Therapy type <span className="text-red-600">*</span>
          </label>
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
          <label className="block text-sm font-medium mb-1.5">
            Duration <span className="text-xs text-muted-foreground font-normal">(minutes, optional)</span>
          </label>
          <Input
            type="number"
            min="1"
            step="15"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 45"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Plan, materials, focus areas…"
            disabled={submitting}
          />
        </div>

        {scheduledAtIso && therapistName && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>{therapistName}</strong> will see <strong>{childName}</strong>{" "}
              on <strong>{format(new Date(scheduledAtIso), "MMM d, yyyy 'at' h:mm a")}</strong>.
            </span>
          </div>
        )}

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
                Scheduling…
              </>
            ) : (
              "Schedule"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
