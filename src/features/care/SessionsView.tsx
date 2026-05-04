"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { TherapySessionsList } from "./TherapySessionsList";
import { EditSessionModal } from "./EditSessionModal";
import {
  listSessionIdsWithNotes,
  listSessionsForClinic,
} from "./sessions-api";
import type {
  SessionStatus,
  TherapySession,
  TherapyType,
} from "./types";

interface Props {
  organizationId: string;
  /** Caller's profile id, threaded into EditSessionModal as the
   *  authored_by for new note rows. */
  callerProfileId?: string | null;
}

const STATUS_OPTIONS: { value: SessionStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS: { value: TherapyType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "speech", label: "Speech" },
  { value: "occupational", label: "Occupational" },
  { value: "behavioral", label: "Behavioral" },
  { value: "other", label: "Other" },
];

function defaultRange(): { fromIso: string; toIso: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(now.getDate() + 14);
  to.setHours(23, 59, 59, 999);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function isoToDate(iso: string): string {
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "";
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

export function SessionsView({ organizationId, callerProfileId }: Props) {
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [sessionsWithNotes, setSessionsWithNotes] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);

  const initial = defaultRange();
  const [fromDate, setFromDate] = useState<string>(isoToDate(initial.fromIso));
  const [toDate, setToDate] = useState<string>(isoToDate(initial.toIso));
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<TherapyType | "">("");

  const [editTarget, setEditTarget] = useState<TherapySession | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const fromIso = fromDate
      ? new Date(`${fromDate}T00:00:00`).toISOString()
      : undefined;
    const toIso = toDate
      ? new Date(`${toDate}T23:59:59.999`).toISOString()
      : undefined;
    const rows = await listSessionsForClinic({
      organizationId,
      fromIso,
      toIso,
      status: statusFilter,
      therapyType: typeFilter,
    });
    setSessions(rows);
    if (rows.length > 0) {
      const noteIds = await listSessionIdsWithNotes(rows.map((r) => r.id));
      setSessionsWithNotes(noteIds);
    } else {
      setSessionsWithNotes(new Set());
    }
    setLoading(false);
  }, [organizationId, fromDate, toDate, statusFilter, typeFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              From
            </label>
            <DatePicker value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              To
            </label>
            <DatePicker value={toDate} onChange={setToDate} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Status
            </label>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as SessionStatus | "")
              }
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Therapy type
            </label>
            <Select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as TherapyType | "")
              }
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TherapySessionsList
          sessions={sessions}
          showChildColumn
          sessionsWithNotes={sessionsWithNotes}
          onSelect={(s) => setEditTarget(s)}
        />
      )}

      <EditSessionModal
        open={editTarget !== null}
        session={editTarget}
        callerProfileId={callerProfileId ?? null}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          void reload();
        }}
      />
    </div>
  );
}
