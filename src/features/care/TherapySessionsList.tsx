"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Calendar, Clock, StickyNote, User as UserIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionStatus, TherapySession, TherapyType } from "./types";

interface Props {
  sessions: TherapySession[];
  /** When false, hide the child column (used inside per-child views). */
  showChildColumn?: boolean;
  /** Phase 6E.1 — set of session ids that already have a note row.
   *  Drives the small pencil indicator next to the status badge. */
  sessionsWithNotes?: Set<string>;
  /** Optional click-to-edit handler. When provided, rows become buttons. */
  onSelect?: (session: TherapySession) => void;
}

const TYPE_LABEL: Record<TherapyType, string> = {
  speech: "Speech",
  occupational: "Occupational",
  behavioral: "Behavioral",
  other: "Other",
};

function statusBadge(status: SessionStatus) {
  if (status === "completed") return <Badge variant="active">Completed</Badge>;
  if (status === "cancelled") return <Badge variant="archived">Cancelled</Badge>;
  if (status === "no_show") return <Badge variant="overdue">No-show</Badge>;
  return <Badge variant="scheduled">Scheduled</Badge>;
}

function formatScheduled(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return iso;
  }
}

export function TherapySessionsList({
  sessions,
  showChildColumn = true,
  sessionsWithNotes,
  onSelect,
}: Props) {
  const noteSet = sessionsWithNotes ?? new Set<string>();
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Calendar className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm font-medium">No sessions yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium">Schedule Session</span> to add
            one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const inner = (
          <CardContent className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  {showChildColumn && (
                    <p className="font-medium truncate">
                      {s.childDisplayName ?? "—"}
                    </p>
                  )}
                  {statusBadge(s.status)}
                  <Badge variant="planned">{TYPE_LABEL[s.therapyType]}</Badge>
                  {noteSet.has(s.id) && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      title="Has session notes"
                    >
                      <StickyNote className="w-3 h-3" />
                      Notes
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {formatScheduled(s.scheduledAt)}
                  {s.durationMinutes != null && (
                    <>
                      <span className="mx-1">·</span>
                      <Clock className="w-3 h-3" />
                      {s.durationMinutes} min
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3" />
                  {s.therapistName ?? "Therapist"}
                </p>
                {s.notes && (
                  <p className="text-xs mt-1.5 line-clamp-2">{s.notes}</p>
                )}
              </div>
            </div>
          </CardContent>
        );

        if (onSelect) {
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className="block w-full text-left rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
            >
              {inner}
            </button>
          );
        }

        if (showChildColumn) {
          return (
            <Link
              key={s.id}
              href={`/care/children/${s.childProfileId}`}
              className="block rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
            >
              {inner}
            </Link>
          );
        }

        return (
          <Card key={s.id}>
            {inner}
          </Card>
        );
      })}
    </div>
  );
}
