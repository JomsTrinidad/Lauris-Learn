"use client";

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

  return (
    <tr
      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
    >
      <td className="px-5 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {doc.title}
        </button>
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
