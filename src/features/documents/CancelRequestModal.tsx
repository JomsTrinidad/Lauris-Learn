"use client";

/**
 * CancelRequestModal — Phase D step D14.
 *
 * Cancels a `document_requests` row by setting status='cancelled' plus
 * cancelled_at and an optional reason. UPDATE policy is school-staff
 * same-school (Phase B 056). Status enum already includes 'cancelled' —
 * no schema change needed.
 *
 * v1 only exposes cancel from the school side; parent / external "decline"
 * paths land with Phase E.
 */

import { useEffect, useMemo, useState } from "react";
import { Ban, AlertTriangle, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { cancelRequest, type RequestListItem } from "./requests-api";
import { DOCUMENT_TYPE_LABELS } from "./constants";

export interface CancelRequestModalProps {
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
  request: RequestListItem | null;
}

export function CancelRequestModal({
  open, onClose, onCancelled, request,
}: CancelRequestModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [reason, setReason]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!request) return null;

  const recipientName =
    request.requested_from_kind === "parent"
      ? request.requested_from_guardian?.full_name ?? "the parent"
      : request.requested_from_kind === "external_contact"
        ? request.requested_from_external_contact?.full_name ?? "the contact"
        : "the recipient";

  async function onConfirm() {
    if (!request || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await cancelRequest(supabase, {
        requestId: request.id,
        reason:    reason.trim() || null,
      });
      setSubmitting(false);
      onCancelled();
    } catch (err) {
      setSubmitting(false);
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cancel Request" className="max-w-md">
      <div className="space-y-4">
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          <p className="font-medium">
            {DOCUMENT_TYPE_LABELS[request.requested_document_type]}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            From <strong>{recipientName}</strong>
          </p>
        </div>

        <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Cancel this request?</p>
            <p className="mt-1 text-xs">
              The recipient will no longer see this as an open ask. The
              request stays visible in the cancelled list for audit.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We received it via email instead."
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton label="Keep request" />
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelling…</>
            ) : (
              <><Ban className="w-4 h-4 mr-2" />Cancel request</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}
