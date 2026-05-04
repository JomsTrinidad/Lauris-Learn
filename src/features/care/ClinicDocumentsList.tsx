"use client";

import { useState } from "react";
import {
  Archive as ArchiveIcon,
  CheckCircle2,
  Download as DownloadIcon,
  FileText,
  Loader2,
  Lock,
  Unlock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClinicDocumentAccessButton } from "./ClinicDocumentAccessButton";
import {
  setClinicDocumentDownload,
  setClinicDocumentStatus,
} from "./clinic-documents-api";
import type { ClinicDocument, ClinicDocumentStatus } from "./types";

interface Props {
  documents: ClinicDocument[];
  isClinicAdmin: boolean;
  onChanged: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadge(status: ClinicDocumentStatus) {
  if (status === "active")
    return <Badge variant="active">Active</Badge>;
  if (status === "draft")
    return <Badge variant="draft">Draft</Badge>;
  return <Badge variant="archived">Archived</Badge>;
}

export function ClinicDocumentsList({
  documents,
  isClinicAdmin,
  onChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="w-8 h-8 mx-auto opacity-30 mb-2" />
        <p className="text-sm font-medium">No documents yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isClinicAdmin
            ? "Click Upload Document to add the first one."
            : "Documents added by clinic admins will appear here."}
        </p>
      </Card>
    );
  }

  async function handleArchive(doc: ClinicDocument) {
    setBusyId(doc.id);
    await setClinicDocumentStatus(doc.id, "archived");
    setBusyId(null);
    onChanged();
  }

  async function handleUnarchive(doc: ClinicDocument) {
    setBusyId(doc.id);
    await setClinicDocumentStatus(doc.id, "active");
    setBusyId(null);
    onChanged();
  }

  async function handleToggleDownload(doc: ClinicDocument) {
    setBusyId(doc.id);
    await setClinicDocumentDownload(doc.id, !doc.permissions.download);
    setBusyId(null);
    onChanged();
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isArchived = doc.status === "archived";
        const downloadVisible =
          isClinicAdmin || doc.permissions.download === true;
        const isBusy = busyId === doc.id;
        return (
          <Card key={doc.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{doc.title}</p>
                    {statusBadge(doc.status)}
                    {!doc.permissions.download && !isArchived && (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        <Lock className="w-3 h-3" />
                        View only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    {doc.documentKind}
                    {doc.versionNumber && (
                      <>
                        <span className="mx-1.5">·</span>
                        v{doc.versionNumber}
                      </>
                    )}
                    {doc.fileSize != null && (
                      <>
                        <span className="mx-1.5">·</span>
                        {formatBytes(doc.fileSize)}
                      </>
                    )}
                    <span className="mx-1.5">·</span>
                    Uploaded {formatDate(doc.createdAt)}
                  </p>
                  {doc.description && (
                    <p className="text-xs mt-1.5">{doc.description}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {!isArchived && doc.currentVersionId && (
                    <div className="inline-flex items-center gap-1.5">
                      <ClinicDocumentAccessButton
                        documentId={doc.id}
                        action="preview_opened"
                      />
                      {downloadVisible && (
                        <ClinicDocumentAccessButton
                          documentId={doc.id}
                          action="download"
                        />
                      )}
                    </div>
                  )}

                  {isClinicAdmin && (
                    <div className="inline-flex items-center gap-1.5">
                      {!isArchived && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleDownload(doc)}
                          disabled={isBusy}
                          title={
                            doc.permissions.download
                              ? "Disable downloads for non-admins"
                              : "Allow downloads for non-admins"
                          }
                        >
                          {doc.permissions.download ? (
                            <DownloadIcon className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      {isArchived ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnarchive(doc)}
                          disabled={isBusy}
                          title="Restore"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleArchive(doc)}
                          disabled={isBusy}
                          title="Archive"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArchiveIcon className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
