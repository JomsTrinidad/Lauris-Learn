"use client";

import { UserCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDocumentType, formatDate, studentDisplay, daysUntil, relativeWindow } from "./utils";
import type { DocumentListItem } from "./queries";
import { DocumentAccessButton } from "./DocumentAccessButton";

export function DocumentRow({
  doc,
  onOpen,
}: {
  doc: DocumentListItem;
  onOpen: () => void;
}) {
  const reviewDays = daysUntil(doc.review_date);
  const reviewSoon = reviewDays != null && reviewDays >= 0 && reviewDays <= 14;
  const reviewOverdue = reviewDays != null && reviewDays < 0;
  const isParentUploaded = doc.source_kind === "parent";
  // Parent-uploaded docs sitting in 'draft' need school review — flag the
  // row so admins can spot them at a glance from the workspace list.
  const needsReview = isParentUploaded && doc.status === "draft";

  return (
    <tr
      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
    >
      <td className="px-5 py-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="text-left text-sm font-medium text-foreground hover:text-primary transition-colors flex-1 min-w-0"
          >
            {doc.title}
          </button>
          {needsReview && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0"
              title="A parent submitted this document. Review and mark it Active or archive it."
            >
              <UserCircle2 className="w-3 h-3" />
              Parent · Review
            </span>
          )}
          {isParentUploaded && !needsReview && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 flex-shrink-0"
              title="Originally submitted by a parent."
            >
              <UserCircle2 className="w-3 h-3" />
              Parent
            </span>
          )}
        </div>
        {doc.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {doc.description}
          </p>
        )}
      </td>
      <td className="px-5 py-3 text-sm text-muted-foreground">
        {formatDocumentType(doc.document_type)}
      </td>
      <td className="px-5 py-3 text-sm">
        {studentDisplay(doc.student)}
      </td>
      <td className="px-5 py-3">
        <Badge variant={doc.status}>{doc.status}</Badge>
      </td>
      <td className="px-5 py-3 text-sm text-muted-foreground">
        {doc.current_version
          ? <span className="font-mono">v{doc.current_version.version_number}</span>
          : <span className="italic">none</span>}
      </td>
      <td className="px-5 py-3 text-sm">
        {doc.review_date ? (
          <span
            className={
              reviewOverdue ? "text-red-700"
              : reviewSoon ? "text-orange-700"
              : "text-muted-foreground"
            }
          >
            {formatDate(doc.review_date)}
            {(reviewOverdue || reviewSoon) && (
              <span className="ml-1.5 text-xs">({relativeWindow(doc.review_date)})</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <DocumentAccessButton
            docId={doc.id}
            action="view"
            compact
            hidden={!doc.current_version_id}
          />
          <DocumentAccessButton
            docId={doc.id}
            action="download"
            compact
            hidden={!doc.current_version_id}
          />
        </div>
      </td>
    </tr>
  );
}
