"use client";

/**
 * RevokeAccessModal — Phase D step D13.
 *
 * Per-grant revoke with confirmation + optional reason. Sets
 *   revoked_at    = NOW()
 *   revoked_by    = auth.uid()
 *   revoke_reason = (textarea, optional)
 *
 * RLS / DB enforcement (already in place from Phase B):
 *   - UPDATE policy `school_admin_update_document_access_grants` requires
 *     the caller to be a school_admin in the same school.
 *   - Column-guard trigger 4.2 RAISEs if any field other than the three
 *     revocation columns changes — so we explicitly only send those three.
 *   - Trigger 5.G's UPDATE-OF list does NOT include revoked_*, so the
 *     consent-invariant validator does not re-fire on revoke (correct:
 *     revoking should never be blocked by consent state changes).
 *
 * Out of scope (per D13):
 *   - editing permissions / expiry / grantee — DB rejects regardless.
 *   - hard-delete — grants are revoked, never deleted (no DELETE policy).
 *   - notifying the grantee — N/A in v1.
 *
 * UX shape:
 *   - Recipient + permissions + expiry summary (read-only).
 *   - Optional reason textarea.
 *   - Destructive confirm button.
 *   - The grant stays visible in the Access tab afterwards under
 *     "No longer active" — we do not hide audit history.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Calendar,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { revokeGrant, type InternalGrantRow, type SchoolStaffOption } from "./share-api";
import type { ExternalContactRow, GrantPermissions } from "./types";

export interface RevokeAccessModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the grant was successfully revoked. */
  onRevoked: () => void;
  grant: InternalGrantRow | null;
  /** Lookup maps so we can render the recipient name without re-fetching. */
  staffMap:    Map<string, SchoolStaffOption>;
  externalMap: Map<string, ExternalContactRow>;
  /** auth.uid() — required for revoked_by. */
  userId: string;
}

export function RevokeAccessModal({
  open,
  onClose,
  onRevoked,
  grant,
  staffMap,
  externalMap,
  userId,
}: RevokeAccessModalProps) {
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

  if (!grant) return null;

  const granteeName = describeGrantee(grant, staffMap, externalMap);
  const perms       = grant.permissions as GrantPermissions;

  async function onConfirm() {
    if (!grant || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await revokeGrant(supabase, {
        grantId:   grant.id,
        revokedBy: userId,
        reason:    reason.trim() || null,
      });
      setSubmitting(false);
      onRevoked();
    } catch (err) {
      setSubmitting(false);
      setError(humanRevokeError(errorMessage(err)));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Revoke Access" className="max-w-md">
      <div className="space-y-4">
        {/* Recipient + grant summary */}
        <div className="px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm space-y-1">
          <p className="font-medium truncate">{granteeName}</p>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-3 h-3" />
            Currently valid until {format(new Date(grant.expires_at), "MMM d, yyyy")}
            <span>·</span>
            <span>{describePerms(perms)}</span>
          </p>
        </div>

        {/* Destructive warning */}
        <div className="px-3 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">This stops access immediately.</p>
            <p className="mt-1 text-xs">
              {grant.grantee_kind === "external_contact"
                ? "The external recipient will no longer be able to open this document. The grant stays in the audit trail."
                : "The staff member will no longer see this document via this grant. The grant stays in the audit trail."}
            </p>
          </div>
        </div>

        {/* Optional reason */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reason <span className="text-muted-foreground font-normal">(optional, saved to audit)</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Coordinator left the clinic; access no longer needed."
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Revoking…</>
            ) : (
              <><Ban className="w-4 h-4 mr-2" />Revoke access</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}


// ── Helpers (mirror DocumentDetailModal so the modal is self-contained) ──

function describeGrantee(
  g: InternalGrantRow,
  staffMap: Map<string, SchoolStaffOption>,
  externalMap: Map<string, ExternalContactRow>,
): string {
  if (g.grantee_kind === "school_user" && g.grantee_user_id) {
    return staffMap.get(g.grantee_user_id)?.full_name ?? "Staff member";
  }
  if (g.grantee_kind === "external_contact" && g.grantee_external_contact_id) {
    return externalMap.get(g.grantee_external_contact_id)?.full_name ?? "External contact";
  }
  if (g.grantee_kind === "school") return "Entire school";
  return "Recipient";
}

function describePerms(p: GrantPermissions): string {
  const parts: string[] = ["View"];
  if (p.download)           parts.push("download");
  if (p.comment)            parts.push("comment");
  if (p.upload_new_version) parts.push("upload versions");
  return parts.join(", ");
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.hint    === "string" && o.hint)    return o.hint;
    if (typeof o.details === "string" && o.details) return o.details;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}

function humanRevokeError(msg?: string): string {
  if (!msg) return "Couldn't revoke this access. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to revoke this grant. Only school admins can.";
  }
  if (/document_access_grants UPDATE may only set revoked_at/i.test(msg)) {
    return "Only revocation can be edited on a grant. Please refresh and try again.";
  }
  return msg;
}
