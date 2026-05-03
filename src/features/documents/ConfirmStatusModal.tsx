"use client";

/**
 * Status transition confirmation modal (Phase D step D9).
 *
 * Handles two transitions in v1:
 *   - draft     → active   ("Mark as Active")
 *   - active    → archived ("Archive")
 *   - shared    → archived ("Archive" with extra warning about external loss)
 *
 * NOT exposed in v1 (per scope):
 *   - any → revoked
 *   - archived/revoked → anything
 *
 * Phase B RLS gates the actual UPDATE:
 *   - school_admin: any child_document in their school
 *   - teacher: only docs where created_by = auth.uid()
 * Buttons in DocumentDetailModal hide for non-eligible roles, but RLS is the
 * source of truth — surface its rejection clearly when it fires.
 *
 * Phase A CHECK on child_documents requires:
 *   status = 'draft' OR current_version_id IS NOT NULL
 * So Mark-as-Active is only shown when the doc has a current_version_id; the
 * trigger 5.D guard validates again server-side.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Archive as ArchiveIcon, AlertTriangle, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { DocumentStatus } from "./types";

export type StatusTransition = "mark_active" | "archive";

export interface ConfirmStatusModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  transition: StatusTransition | null;
  doc: {
    id: string;
    title: string;
    status: DocumentStatus;
  } | null;
}

export function ConfirmStatusModal({
  open,
  onClose,
  onConfirmed,
  transition,
  doc,
}: ConfirmStatusModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!doc || !transition) return null;

  const isMarkActive = transition === "mark_active";
  const isArchive    = transition === "archive";
  const wasShared    = isArchive && doc.status === "shared";

  const title =
    isMarkActive ? "Mark as Active" :
    wasShared    ? "Archive Shared Document" :
                   "Archive Document";

  async function onConfirm() {
    if (!doc || !transition) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    const update: Record<string, unknown> =
      isMarkActive
        ? { status: "active" }
        : {
            status:         "archived",
            archived_at:    new Date().toISOString(),
            archive_reason: reason.trim() || null,
          };

    const { error: updateErr } = await supabase
      .from("child_documents")
      .update(update)
      .eq("id", doc.id);

    if (updateErr) {
      setError(humanStatusError(updateErr.message, transition));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onConfirmed();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-4">
        {/* Doc summary */}
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          <p className="font-medium truncate">{doc.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Current status: <span className="font-medium">{doc.status}</span>
          </p>
        </div>

        {/* Mark-as-Active explainer */}
        {isMarkActive && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This makes the document part of the school's official record.</p>
              <p className="mt-1 text-xs">
                Parents and external contacts still won't see it until you
                share or grant access — being Active just means it's no longer
                a draft.
              </p>
            </div>
          </div>
        )}

        {/* Archive (non-shared) warning */}
        {isArchive && !wasShared && (
          <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Archive this document?</p>
              <p className="mt-1 text-xs">
                It won't appear in the active list anymore. The document and
                its versions stay in the audit trail and can be referenced
                later.
              </p>
            </div>
          </div>
        )}

        {/* Archive shared — sharper warning */}
        {wasShared && (
          <div className="px-3 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">External recipients will lose access.</p>
              <p className="mt-1 text-xs">
                Archiving stops all current grants from resolving. If you only
                want to remove specific people, revoke their individual grants
                instead (in the Access tab — coming in a later step).
              </p>
            </div>
          </div>
        )}

        {/* Optional reason — archive only */}
        {isArchive && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Reason <span className="text-muted-foreground font-normal">(optional, saved to audit)</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Superseded by 2026 IEP."
              rows={2}
              maxLength={500}
              disabled={submitting}
            />
          </div>
        )}

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            variant={isArchive ? "destructive" : "primary"}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : isMarkActive ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark as Active
              </>
            ) : (
              <>
                <ArchiveIcon className="w-4 h-4 mr-2" />
                Archive
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}


function humanStatusError(msg: string | undefined, transition: StatusTransition): string {
  if (!msg) return "Couldn't update the document. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    if (transition === "mark_active") {
      return "You don't have permission to change this document's status. Only school admins (or the teacher who created it) can.";
    }
    return "You don't have permission to archive this document. Only a school admin can.";
  }
  if (/current_version_id/i.test(msg) || /current_version_required_chk/i.test(msg)) {
    return "This document has no current version yet. Upload a file first, then Mark as Active.";
  }
  return msg;
}
