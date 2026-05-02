"use client";

import { useEffect, useState } from "react";
import { FileText, Layers, AlertTriangle, EyeOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  formatDocumentType,
  formatDate,
  formatBytes,
  studentDisplay,
  daysUntil,
  relativeWindow,
} from "./utils";
import { getDocument, listVersions } from "./queries";
import type { DocumentListItem } from "./queries";
import type { ChildDocumentVersionRow } from "./types";
import { DocumentAccessButton } from "./DocumentAccessButton";

type Tab = "overview" | "versions";

export interface DocumentDetailModalProps {
  docId: string | null;
  onClose: () => void;
}

export function DocumentDetailModal({ docId, onClose }: DocumentDetailModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [doc, setDoc] = useState<DocumentListItem | null>(null);
  const [versions, setVersions] = useState<ChildDocumentVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTab("overview");
    Promise.all([getDocument(supabase, docId), listVersions(supabase, docId)])
      .then(([d, vs]) => {
        if (cancelled) return;
        setDoc(d);
        setVersions(vs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load document.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  return (
    <Modal
      open={docId !== null}
      onClose={onClose}
      title={doc?.title ?? "Document"}
      className="max-w-2xl"
    >
      {loading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorAlert message={error} />
      ) : !doc ? (
        <ErrorAlert message="Document not found." />
      ) : (
        <div className="space-y-4">
          {/* Header summary */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={doc.status}>{doc.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatDocumentType(doc.document_type)}
              </span>
              <span className="text-sm text-muted-foreground">
                · {studentDisplay(doc.student)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <DocumentAccessButton
                docId={doc.id}
                action="view"
                hidden={!doc.current_version_id}
              />
              <DocumentAccessButton
                docId={doc.id}
                action="download"
                hidden={!doc.current_version_id}
              />
            </div>
          </div>

          {/* No-version notice (draft state) */}
          {!doc.current_version_id && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>No file uploaded yet. Use Upload to add the first version.</span>
            </div>
          )}

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-border">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
              <FileText className="w-3.5 h-3.5" /> Overview
            </TabButton>
            <TabButton active={tab === "versions"} onClick={() => setTab("versions")}>
              <Layers className="w-3.5 h-3.5" /> Versions ({versions.length})
            </TabButton>
          </div>

          {tab === "overview" && <OverviewTab doc={doc} />}
          {tab === "versions" && <VersionsTab versions={versions} />}
        </div>
      )}
    </Modal>
  );
}


function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}


function OverviewTab({ doc }: { doc: DocumentListItem }) {
  const reviewWindow = relativeWindow(doc.review_date);
  const reviewDays = daysUntil(doc.review_date);
  const reviewOverdue = reviewDays != null && reviewDays < 0;
  const reviewSoon    = reviewDays != null && reviewDays >= 0 && reviewDays <= 14;

  return (
    <div className="space-y-3 text-sm">
      {doc.description && (
        <Field label="Description">
          <p className="text-foreground whitespace-pre-wrap">{doc.description}</p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Type">{formatDocumentType(doc.document_type)}</Field>
        <Field label="Status"><Badge variant={doc.status}>{doc.status}</Badge></Field>
        <Field label="Student">{studentDisplay(doc.student)}</Field>
        <Field label="Source">
          {doc.source_kind === "school" && "School"}
          {doc.source_kind === "external_contact" && (doc.source_label || "External contact")}
          {doc.source_kind === "parent" && "Parent-uploaded"}
        </Field>
        <Field label="Effective date">{formatDate(doc.effective_date)}</Field>
        <Field label="Review by">
          {doc.review_date ? (
            <span
              className={
                reviewOverdue ? "text-red-700"
                : reviewSoon ? "text-orange-700"
                : undefined
              }
            >
              {formatDate(doc.review_date)}
              {(reviewOverdue || reviewSoon) && (
                <span className="ml-1.5 text-xs">({reviewWindow})</span>
              )}
            </span>
          ) : "—"}
        </Field>
        <Field label="Created">{formatDate(doc.created_at)}</Field>
        <Field label="Last updated">{formatDate(doc.updated_at)}</Field>
        {doc.archived_at && (
          <Field label="Archived">{formatDate(doc.archived_at)}</Field>
        )}
        {doc.archive_reason && (
          <Field label="Archive reason"><span className="italic">{doc.archive_reason}</span></Field>
        )}
        {doc.revoked_at && (
          <Field label="Revoked">{formatDate(doc.revoked_at)}</Field>
        )}
        {doc.revoke_reason && (
          <Field label="Revoke reason"><span className="italic">{doc.revoke_reason}</span></Field>
        )}
      </div>
    </div>
  );
}


function VersionsTab({ versions }: { versions: ChildDocumentVersionRow[] }) {
  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No versions uploaded yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {versions.map((v) => (
        <li
          key={v.id}
          className={cn(
            "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border",
            v.is_hidden && "bg-muted/40 opacity-70",
          )}
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs text-muted-foreground flex-shrink-0 mt-0.5">
              v{v.version_number}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate">{v.file_name ?? "(no filename)"}</span>
                {v.is_hidden && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                    <EyeOff className="w-3 h-3" /> hidden
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(v.created_at)} · {formatBytes(v.file_size)}
                {v.upload_note && <> · {v.upload_note}</>}
              </div>
              {v.is_hidden && v.hidden_reason && (
                <div className="text-xs text-muted-foreground italic mt-0.5">
                  Hidden: {v.hidden_reason}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
