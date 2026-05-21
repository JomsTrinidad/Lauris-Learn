"use client";

import { useState } from "react";
import { Loader2, Info } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { revokeIdentityGrant, revokeDocumentGrant } from "./queries";

export type RevokeKind = "identity" | "document";

interface Props {
  open: boolean;
  kind: RevokeKind;
  grantId: string | null;
  /** Free-text summary line shown in the modal body. */
  summary: string;
  userId: string;
  onClose: () => void;
  onRevoked: () => void;
}

export function RevokeClinicGrantModal({
  open,
  kind,
  grantId,
  summary,
  userId,
  onClose,
  onRevoked,
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grantId) return;
    setSubmitting(true);
    setError(null);
    const trimmedReason = reason.trim() || null;
    const result =
      kind === "identity"
        ? await revokeIdentityGrant(grantId, userId, trimmedReason)
        : await revokeDocumentGrant(grantId, userId, trimmedReason);
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setReason("");
    onRevoked();
  }

  function handleClose() {
    setReason("");
    setError(null);
    setSubmitting(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Revoke Access" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Phase 6C — revocation is the trust-protective action; it should
            feel safe and reversible, not dangerous. The previous amber
            "This can't be undone." framing discouraged the very action that
            protects the child (and contradicted its own "issue a new grant"
            line). Calm, factual, reassuring copy instead. The destructive
            button below still carries the appropriate weight. See
            docs/CROSS_ORG_TRUST_AND_CONSENT.md §9. */}
        <div className="px-3 py-3 bg-primary/[0.04] border border-primary/15 rounded-lg text-sm text-foreground flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary/70" />
          <div>
            <p className="font-medium">The clinic loses access right away.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is reversible — you can issue a new grant later if they
              need access again.
            </p>
          </div>
        </div>

        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          {summary}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reason <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Therapist no longer involved"
            rows={3}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={submitting || !grantId} variant="destructive">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Revoking…
              </>
            ) : (
              "Revoke access"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
