"use client";

import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CareDocumentAccessButton } from "./CareDocumentAccessButton";
import type { SharedDocument } from "./types";

interface Props {
  documents: SharedDocument[];
  /** When true, child column is hidden (already implied by context). */
  hideChildColumn?: boolean;
  /** Map childProfileId → display name for the cross-child documents view. */
  childNamesById?: Record<string, string>;
}

const DOC_TYPE_LABELS: Record<SharedDocument["documentType"], string> = {
  iep: "IEP",
  therapy_evaluation: "Therapy Evaluation",
  therapy_progress: "Therapy Progress",
  school_accommodation: "School Accommodation",
  medical_certificate: "Medical Certificate",
  dev_pediatrician_report: "Dev. Pediatrician Report",
  parent_provided: "Parent Provided",
  other_supporting: "Other Supporting",
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function SharedDocumentsList({
  documents,
  hideChildColumn = false,
  childNamesById,
}: Props) {
  if (documents.length === 0) {
    return (
      <Card className="p-12 text-center">
        <FileText className="w-10 h-10 mx-auto opacity-30 mb-3" />
        <p className="font-medium">No documents shared with this organization yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          The originating school must explicitly grant access to a document.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Document</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              {!hideChildColumn && (
                <th className="text-left px-4 py-2 font-medium">Child</th>
              )}
              <th className="text-left px-4 py-2 font-medium">Version</th>
              <th className="text-left px-4 py-2 font-medium">Size</th>
              <th className="text-left px-4 py-2 font-medium">Granted</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {documents.map((doc) => {
              const childLabel =
                doc.childProfileId && childNamesById?.[doc.childProfileId]
                  ? childNamesById[doc.childProfileId]
                  : "—";
              return (
                <tr key={doc.documentId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.fileName}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">
                      {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </Badge>
                  </td>
                  {!hideChildColumn && (
                    <td className="px-4 py-3">{childLabel}</td>
                  )}
                  <td className="px-4 py-3">v{doc.versionNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatBytes(doc.fileSizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(doc.grantCreatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-2">
                      <CareDocumentAccessButton
                        documentId={doc.documentId}
                        action="view"
                      />
                      {doc.permissions.download && (
                        <CareDocumentAccessButton
                          documentId={doc.documentId}
                          action="download"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
