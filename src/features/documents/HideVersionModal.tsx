"use client";

/**
 * Hide Version modal (Phase D step D8).
 *
 * Sets is_hidden = true (plus hidden_reason, hidden_at) on the chosen version.
 * Triggered from DocumentDetailModal → Versions tab.
 *
 * The DB enforces correctness via Phase A trigger 5.E:
 *   - If the version being hidden is the head's current_version_id, the head
 *     auto-repoints to the next-most-recent non-hidden version.
 *   - If no other visible version exists AND the document is not 'draft',
 *     the trigger raises:
 *       "cannot hide the only visible version of a non-draft document … —
 *        upload a replacement first"
 *     We catch this exact phrasing and surface a clear, actionable message.
 *
 * After success the parent re-fetches both the doc head (current_version_id
 * may have changed) and the versions list.
 */

import { useEffect, useState } from "react";
import { EyeOff, AlertTriangle, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { formatBytes, formatDate } from "./utils";
import type { ChildDocumentVersionRow } from "./types";

export interface HideVersionModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the version is successfully hidden. */
  onHidden: () => void;
  version: ChildDocumentVersionRow | null;
  /** Whether this version is currently the head's current_version_id. */
  isCurrent: boolean;
  /** Document status — drives the warning copy when this is the only visible version. */
  documentStatus: "draft" | "active" | "shared" | "archived" | "revoked" | null;
  /** Number of OTHER non-hidden versions on the same document. */
  otherVisibleCount: number;
}

export function HideVersionModal({
  open,
  onClose,
  onHidden,
  version,
  isCurrent,
  documentStatus,
  otherVisibleCount,
}: HideVersionModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  const willOrphanNonDraft =
    otherVisibleCount === 0 && documentStatus !== null && documentStatus !== "draft";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version || submitting) return;
    if (reason.trim().length === 0) {
      setError("Please give a short reason — it goes into the audit trail.");
      return;
    }

    // Pre-flight client check; the DB trigger is the source of truth, but
    // catching this client-side avoids a round-trip with a confusing error.
    if (willOrphanNonDraft) {
      setError(
        "This is the only visible version of a non-draft document. Upload a replacement first, then hide this version.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("child_document_versions")
      .update({
        is_hidden:     true,
        hidden_reason: reason.trim(),
        hidden_at:     new Date().toISOString(),
      })
      .eq("id", version.id);

    if (updateErr) {
      setError(humanHideError(updateErr.message));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onHidden();
  }

  if (!version) return null;

  return (
    <Modal open={open} onClose={onClose} title="Hide Version" className="max-w-md">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              v{version.version_number}
            </span>
            <span className="truncate font-medium">
              {version.file_name ?? "(no filename)"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Uploaded {formatDate(version.created_at)} · {formatBytes(version.file_size)}
          </div>
        </div>

        {willOrphanNonDraft ? (
          <div className="px-3 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Cannot hide this version</p>
              <p className="mt-1">
                It's the only visible version of a {documentStatus} document.
                Upload a replacement version first, then hide this one.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              {isCurrent ? (
                <>
                  This is the current version. Once hidden, the document will
                  automatically point at v
                  {(version.version_number > 1 ? version.version_number - 1 : "—") as React.ReactNode}
                  {" "}or the next-most-recent visible version.
                </>
              ) : (
                <>
                  Hiding removes this version from default views. School staff
                  can still see it in the audit trail.
                </>
              )}
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reason <span className="text-red-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong file uploaded; replaced with v2."
            rows={3}
            disabled={submitting || willOrphanNonDraft}
            maxLength={500}
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            Saved to the version's audit record.
          </p>
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button
            type="submit"
            variant="destructive"
            disabled={submitting || willOrphanNonDraft || reason.trim().length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Hiding…
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide version
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


function humanHideError(msg?: string): string {
  if (!msg) return "Couldn't hide the version. Please try again.";
  // Phase A trigger 5.E rejection on last visible version of non-draft doc.
  if (/cannot hide the only visible version/i.test(msg)) {
    return "This is the only visible version of a non-draft document. Upload a replacement version first, then try again.";
  }
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to hide this version. Only school admins can.";
  }
  return msg;
}
