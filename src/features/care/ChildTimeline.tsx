"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  Calendar,
  FileText,
  Share2,
  StickyNote,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ClinicDocument,
  SessionStatus,
  SharedDocument,
  TherapySession,
  TherapyType,
} from "./types";

interface Props {
  sessions: TherapySession[];
  clinicDocuments: ClinicDocument[];
  sharedDocuments: SharedDocument[];
  /** Set of session ids that have an attached note row. */
  sessionsWithNotes: Set<string>;
  onSelectSession?: (s: TherapySession) => void;
}

type TimelineKind = "session" | "clinic_document" | "shared_document";

interface TimelineItem {
  key: string;
  kind: TimelineKind;
  timestamp: string;
  // Discriminated payload — one of three.
  session?: TherapySession;
  clinicDoc?: ClinicDocument;
  sharedDoc?: SharedDocument;
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

function formatTs(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return iso;
  }
}

const MAX_ITEMS = 50;

export function ChildTimeline({
  sessions,
  clinicDocuments,
  sharedDocuments,
  sessionsWithNotes,
  onSelectSession,
}: Props) {
  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = [];
    for (const s of sessions) {
      merged.push({
        key: `session:${s.id}`,
        kind: "session",
        timestamp: s.scheduledAt,
        session: s,
      });
    }
    for (const d of clinicDocuments) {
      merged.push({
        key: `clinic_doc:${d.id}`,
        kind: "clinic_document",
        timestamp: d.createdAt,
        clinicDoc: d,
      });
    }
    for (const d of sharedDocuments) {
      merged.push({
        key: `shared_doc:${d.documentId}`,
        kind: "shared_document",
        timestamp: d.grantCreatedAt,
        sharedDoc: d,
      });
    }
    merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return merged.slice(0, MAX_ITEMS);
  }, [sessions, clinicDocuments, sharedDocuments]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sessions or documents yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-sm">Timeline</h2>
        <p className="text-xs text-muted-foreground">
          {items.length === MAX_ITEMS
            ? `Showing the latest ${MAX_ITEMS} entries.`
            : `${items.length} ${items.length === 1 ? "entry" : "entries"}.`}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <TimelineRow
              key={item.key}
              item={item}
              hasNote={
                item.kind === "session" && item.session
                  ? sessionsWithNotes.has(item.session.id)
                  : false
              }
              onSelectSession={onSelectSession}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TimelineRow({
  item,
  hasNote,
  onSelectSession,
}: {
  item: TimelineItem;
  hasNote: boolean;
  onSelectSession?: (s: TherapySession) => void;
}) {
  if (item.kind === "session" && item.session) {
    const s = item.session;
    const interactive = !!onSelectSession;
    const inner = (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {TYPE_LABEL[s.therapyType]} therapy
          </span>
          {statusBadge(s.status)}
          {hasNote && (
            <Badge variant="planned" className="gap-1">
              <StickyNote className="w-3 h-3" />
              Notes
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTs(s.scheduledAt)}
          {s.therapistName && <> · {s.therapistName}</>}
        </p>
      </>
    );
    if (interactive) {
      return (
        <li>
          <button
            type="button"
            onClick={() => onSelectSession?.(s)}
            className="w-full text-left py-2 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
          >
            {inner}
          </button>
        </li>
      );
    }
    return <li className="py-2">{inner}</li>;
  }

  if (item.kind === "clinic_document" && item.clinicDoc) {
    const d = item.clinicDoc;
    return (
      <li className="py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{d.title}</span>
          <Badge variant="planned">Clinic doc</Badge>
          {d.status === "archived" && (
            <Badge variant="archived">Archived</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTs(d.createdAt)}
          {d.documentKind && <> · {d.documentKind}</>}
        </p>
      </li>
    );
  }

  if (item.kind === "shared_document" && item.sharedDoc) {
    const d = item.sharedDoc;
    return (
      <li className="py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{d.title}</span>
          <Badge variant="planned">Shared by school</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTs(d.grantCreatedAt)}
          {d.documentType && (
            <> · {d.documentType.replace(/_/g, " ")}</>
          )}
        </p>
      </li>
    );
  }

  return null;
}
