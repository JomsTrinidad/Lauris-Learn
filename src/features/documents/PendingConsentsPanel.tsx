"use client";

/**
 * Page-level "Permissions awaiting your approval" panel for the parent
 * portal. Lives ABOVE the document list so a parent can grant or revoke
 * consent without first having to open a document.
 *
 * Why surfaced at the page level: the spec hides docs that aren't in
 * 'shared' / 'archived' / parent-uploaded, but external-share requests
 * are drafted as 'pending' consents BEFORE the underlying doc is
 * transitioned to 'shared'. Without this panel, a parent would never
 * see those pending requests.
 *
 * Scope:
 *   - Lists `document_consents` rows in status='pending' for the student,
 *     filtered out if past expires_at (the parent transition guard would
 *     reject the UPDATE in that case anyway).
 *   - Inline grant/revoke confirmations — same shape as the doc detail
 *     modal so the interaction is consistent across both surfaces.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Ban,
  Calendar,
  Users,
  Clock,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatDate, daysUntil, formatDocumentType } from "./utils";
import {
  listPendingConsentsForStudent,
  findGuardianIdForStudent,
  grantConsent,
  revokeConsent,
  isConsentLive,
  type ParentConsentRow,
} from "./parent-api";
import type { ConsentRecipient, ConsentScope, DocumentType } from "./types";


type PendingAction =
  | { kind: "grant";  consentId: string }
  | { kind: "revoke"; consentId: string }
  | null;

export interface PendingConsentsPanelProps {
  studentId: string | null;
  /** Bump this to force a reload — used by the page after the detail
   *  modal grants/revokes a consent that also lives in this panel. */
  refreshKey?: number;
  /** Notified after a successful grant / revoke so the page can re-load
   *  the document list (a granted consent may unlock a doc soon after). */
  onChanged?: () => void;
}

export function PendingConsentsPanel({
  studentId,
  refreshKey = 0,
  onChanged,
}: PendingConsentsPanelProps) {
  const supabase = useMemo(() => createClient(), []);

  const [consents, setConsents] = useState<ParentConsentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [pending, setPending]           = useState<PendingAction>(null);
  const [busy, setBusy]                 = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [actionError, setActionError]   = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!studentId) {
        setConsents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rows = await listPendingConsentsForStudent(supabase, studentId);
        if (signal?.aborted) return;
        setConsents(rows);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't load permission requests.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [studentId, supabase],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void reload(ctrl.signal);
    return () => ctrl.abort();
    // refreshKey is in the dep list so a page-level bump (e.g. after the
    // detail modal grants/revokes a consent) forces a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, refreshKey]);

  function startGrant(consentId: string) {
    setActionError(null);
    setRevokeReason("");
    setPending({ kind: "grant", consentId });
  }
  function startRevoke(consentId: string) {
    setActionError(null);
    setRevokeReason("");
    setPending({ kind: "revoke", consentId });
  }
  function cancelPending() {
    if (busy) return;
    setPending(null);
    setRevokeReason("");
    setActionError(null);
  }

  async function confirmGrant(consent: ParentConsentRow) {
    setBusy(true);
    setActionError(null);
    try {
      const guardianId = await findGuardianIdForStudent(supabase, consent.student_id);
      if (!guardianId) {
        throw new Error(
          "We couldn't match your account to a guardian record for this child. Ask the school to confirm you're listed as a guardian.",
        );
      }
      await grantConsent(supabase, { consentId: consent.id, guardianId });
      setPending(null);
      await reload();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't grant consent.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke(consent: ParentConsentRow) {
    setBusy(true);
    setActionError(null);
    try {
      const guardianId = await findGuardianIdForStudent(supabase, consent.student_id);
      if (!guardianId) {
        throw new Error(
          "We couldn't match your account to a guardian record for this child. Ask the school to confirm you're listed as a guardian.",
        );
      }
      const reason = revokeReason.trim();
      if (reason.length === 0) {
        setActionError("Please add a short reason — it helps the school understand why.");
        setBusy(false);
        return;
      }
      await revokeConsent(supabase, {
        consentId:  consent.id,
        guardianId,
        reason,
      });
      setPending(null);
      setRevokeReason("");
      await reload();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't revoke consent.");
    } finally {
      setBusy(false);
    }
  }

  // Hide the whole panel when there's nothing pending — keeps the page
  // quiet for parents with no outstanding decisions.
  if (loading || (!error && consents.length === 0)) return null;

  return (
    <Card className="border-amber-300">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-amber-700" />
          <h2 className="text-sm font-semibold">Pending your approval</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {consents.length} request{consents.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          The school is asking for your permission to share a document.
          Review the details below and decide whether to grant or decline.
        </p>

        {error && <ErrorAlert message={error} />}
        {actionError && <ErrorAlert message={actionError} />}

        <ul className="space-y-2">
          {consents.map((c) => (
            <PendingConsentItem
              key={c.id}
              consent={c}
              pending={pending && pending.consentId === c.id ? pending.kind : null}
              busy={busy}
              revokeReason={revokeReason}
              onChangeRevokeReason={setRevokeReason}
              onStartGrant={() => startGrant(c.id)}
              onStartRevoke={() => startRevoke(c.id)}
              onCancel={cancelPending}
              onConfirmGrant={() => confirmGrant(c)}
              onConfirmRevoke={() => confirmRevoke(c)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}


function PendingConsentItem({
  consent,
  pending,
  busy,
  revokeReason,
  onChangeRevokeReason,
  onStartGrant,
  onStartRevoke,
  onCancel,
  onConfirmGrant,
  onConfirmRevoke,
}: {
  consent: ParentConsentRow;
  pending: "grant" | "revoke" | null;
  busy: boolean;
  revokeReason: string;
  onChangeRevokeReason: (v: string) => void;
  onStartGrant: () => void;
  onStartRevoke: () => void;
  onCancel: () => void;
  onConfirmGrant: () => void;
  onConfirmRevoke: () => void;
}) {
  const live          = isConsentLive(consent);
  const recipientLine = summarizeRecipients(consent.recipients);
  const scopeLine     = describeScope(consent.scope);
  const expiryDays    = daysUntil(consent.expires_at);
  const expiringSoon  = live && expiryDays != null && expiryDays >= 0 && expiryDays <= 14;

  return (
    <li className="rounded-lg border border-amber-300 bg-amber-50/60 overflow-hidden">
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="w-4 h-4 text-amber-700" />
          <span className="text-sm font-medium">Pending your approval</span>
          {expiringSoon && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
              <Calendar className="w-3 h-3" />
              {expiryDays === 0 ? "Request expires today" : `Request expires in ${expiryDays}d`}
            </span>
          )}
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Purpose: </span>
          <span className="whitespace-pre-wrap">{consent.purpose}</span>
        </div>

        <div className="text-xs text-muted-foreground">{scopeLine}</div>

        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" /> {recipientLine}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Valid until {formatDate(consent.expires_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            {consent.allow_download ? "Download allowed" : "View only"}
          </span>
        </div>

        {pending === null && live && (
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" onClick={onStartGrant}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Grant access
            </Button>
            <Button size="sm" variant="outline" onClick={onStartRevoke}>
              <Ban className="w-3.5 h-3.5 mr-1.5" />
              Decline
            </Button>
          </div>
        )}
      </div>

      {pending === "grant" && (
        <div className="border-t border-amber-300 px-3 py-3 bg-card space-y-2">
          <p className="text-sm">
            Grant access until <strong>{formatDate(consent.expires_at)}</strong>?
            The school will be able to share this with the listed recipients
            for the stated purpose.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirmGrant} disabled={busy}>
              {busy ? "Granting…" : "Confirm grant"}
            </Button>
          </div>
        </div>
      )}

      {pending === "revoke" && (
        <div className="border-t border-amber-300 px-3 py-3 bg-card space-y-2">
          <p className="text-sm">
            Decline this request? The school won&apos;t be able to share with
            these recipients. They can ask again later if needed.
          </p>
          <label className="block text-xs">
            <span className="text-muted-foreground">
              Reason <span className="text-red-600">*</span>
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              rows={2}
              value={revokeReason}
              onChange={(e) => onChangeRevokeReason(e.target.value)}
              maxLength={500}
              placeholder="Why are you declining? Saved for the school's audit trail."
              disabled={busy}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onConfirmRevoke}
              disabled={busy || revokeReason.trim().length === 0}
              className={cn("bg-red-600 hover:bg-red-700")}
            >
              {busy ? "Declining…" : "Confirm decline"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}


function summarizeRecipients(rs: ConsentRecipient[]): string {
  if (!rs || rs.length === 0) return "No recipients listed";
  const counts = { external: 0, staff: 0, school: 0 };
  for (const r of rs) {
    if (r.type === "external_contact") counts.external += 1;
    else if (r.type === "school_user") counts.staff   += 1;
    else if (r.type === "school")      counts.school  += 1;
  }
  const parts: string[] = [];
  if (counts.external) parts.push(plural(counts.external, "external recipient", "external recipients"));
  if (counts.staff)    parts.push(plural(counts.staff,    "staff member",       "staff members"));
  if (counts.school)   parts.push(plural(counts.school,   "school",             "schools"));
  return parts.join(" + ") || `${rs.length} recipient${rs.length === 1 ? "" : "s"}`;
}

function plural(n: number, s: string, p: string): string {
  return `${n} ${n === 1 ? s : p}`;
}

function describeScope(scope: ConsentScope): string {
  if (scope.type === "document")        return "Covers: this specific document";
  if (scope.type === "document_type")   return `Covers: all ${formatDocumentType(scope.document_type as DocumentType)} documents`;
  if (scope.type === "all_for_student") return "Covers: all documents about your child";
  return "";
}
