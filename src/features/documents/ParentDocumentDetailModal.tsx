"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Ban,
  ShieldCheck,
  Calendar,
  FileText,
  Clock,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  formatDocumentType,
  formatDate,
  formatBytes,
  daysUntil,
} from "./utils";
import { CONSENT_STATUS_LABELS } from "./constants";
import { DocumentAccessButton } from "./DocumentAccessButton";
import {
  getParentDocument,
  listParentVersions,
  listConsentsForStudentDocument,
  findGuardianIdForStudent,
  grantConsent,
  revokeConsent,
  isConsentLive,
  type ParentDocumentListItem,
  type ParentConsentRow,
} from "./parent-api";
import type {
  ChildDocumentVersionRow,
  ConsentRecipient,
} from "./types";

export interface ParentDocumentDetailModalProps {
  docId: string | null;
  onClose: () => void;
  /** Called whenever a consent changes so the parent list can refresh. */
  onChanged?: () => void;
}

type PendingAction =
  | { kind: "grant";  consentId: string }
  | { kind: "revoke"; consentId: string }
  | null;

export function ParentDocumentDetailModal({
  docId,
  onClose,
  onChanged,
}: ParentDocumentDetailModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const [doc, setDoc] = useState<ParentDocumentListItem | null>(null);
  const [versions, setVersions] = useState<ChildDocumentVersionRow[]>([]);
  const [consents, setConsents] = useState<ParentConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mutation state lives at the modal level so confirming one consent
  // collapses any other inline confirmation strip automatically.
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!docId) return;
      setLoading(true);
      setError(null);
      try {
        const d = await getParentDocument(supabase, docId);
        if (signal?.aborted) return;
        setDoc(d);
        if (!d) {
          // Either RLS hides it (correct 404 behavior) or the doc has
          // moved to a state the parent cannot see. Either way we stop.
          setVersions([]);
          setConsents([]);
          return;
        }
        const [vs, cs] = await Promise.all([
          listParentVersions(supabase, d.id),
          listConsentsForStudentDocument(supabase, {
            id:            d.id,
            document_type: d.document_type,
            student_id:    d.student_id,
            school_id:     d.school_id,
          }),
        ]);
        if (signal?.aborted) return;
        setVersions(vs);
        setConsents(cs);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load document.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [docId, supabase],
  );

  useEffect(() => {
    if (!docId) return;
    const ctrl = new AbortController();
    setPending(null);
    setBusy(false);
    setRevokeReason("");
    setActionError(null);
    void reload(ctrl.signal);
    return () => ctrl.abort();
  }, [docId, reload]);

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
    if (!doc) return;
    setBusy(true);
    setActionError(null);
    try {
      const guardianId = await findGuardianIdForStudent(supabase, doc.student_id);
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
    if (!doc) return;
    setBusy(true);
    setActionError(null);
    try {
      const guardianId = await findGuardianIdForStudent(supabase, doc.student_id);
      if (!guardianId) {
        throw new Error(
          "We couldn't match your account to a guardian record for this child. Ask the school to confirm you're listed as a guardian.",
        );
      }
      const reason = revokeReason.trim();
      if (reason.length === 0) {
        // Spec: revoke reason is required. Surface inline rather than
        // round-tripping to the DB.
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

  const currentVersion =
    doc?.current_version_id
      ? versions.find((v) => v.id === doc.current_version_id) ?? null
      : null;

  return (
    <Modal
      open={docId !== null}
      onClose={onClose}
      title={doc?.title ?? "Document"}
      className="max-w-xl"
    >
      {loading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorAlert message={error} />
      ) : !doc ? (
        // 404-shape message — same wording for "doesn't exist" and "not
        // visible" so we don't leak document existence.
        <div className="py-6 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="mt-3 font-medium text-sm">This document isn&apos;t available.</p>
          <p className="text-xs text-muted-foreground mt-1">
            It may have been removed, archived, or it&apos;s no longer shared with you.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={doc.status}>{doc.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatDocumentType(doc.document_type)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <DocumentAccessButton docId={doc.id} action="view"     hidden={!doc.current_version_id} />
              <DocumentAccessButton docId={doc.id} action="download" hidden={!doc.current_version_id} />
            </div>
          </div>

          {/* No-version notice */}
          {!doc.current_version_id && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>This document doesn&apos;t have a file attached yet.</span>
            </div>
          )}

          {/* Description */}
          {doc.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{doc.description}</p>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Type">{formatDocumentType(doc.document_type)}</Field>
            <Field label="Status"><Badge variant={doc.status}>{doc.status}</Badge></Field>
            <Field label="Source">
              {doc.source_kind === "school" && "School"}
              {doc.source_kind === "external_contact" && (doc.source_label || "External contact")}
              {doc.source_kind === "parent" && "You uploaded this"}
            </Field>
            <Field label="Effective date">{formatDate(doc.effective_date)}</Field>
            {doc.review_date && (
              <Field label="Review by">{formatDate(doc.review_date)}</Field>
            )}
            <Field label="Last updated">{formatDate(doc.updated_at)}</Field>
          </div>

          {/* File section */}
          <Section title="File" icon={FileText}>
            {currentVersion ? (
              <div className="px-3 py-2.5 rounded-lg border border-border text-sm">
                <div className="font-medium truncate">
                  {currentVersion.file_name ?? "(no filename)"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  v{currentVersion.version_number} · {formatBytes(currentVersion.file_size)}
                  {" · "}Uploaded {formatDate(currentVersion.created_at)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No file attached.</p>
            )}
          </Section>

          {/* Consents section */}
          <Section
            title="Permissions you control"
            icon={ShieldCheck}
            sub="Decide whether the school can share this document with the people listed below."
          >
            {actionError && <ErrorAlert message={actionError} />}

            {consents.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                No permission requests for this document yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {consents.map((c) => (
                  <ConsentItem
                    key={c.id}
                    consent={c}
                    pending={
                      pending && pending.consentId === c.id ? pending.kind : null
                    }
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
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}


// ── Sections / fields ──────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  sub,
  children,
}: {
  title: string;
  icon: React.ElementType;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="pt-1">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}


// ── Consent row + inline grant/revoke confirmation ─────────────────────────

function ConsentItem({
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
  const live   = isConsentLive(consent);
  const expired = !live && consent.status !== "revoked"
    && (() => {
        try { return new Date(consent.expires_at) <= new Date(); }
        catch { return false; }
      })();
  const effectiveStatus =
    consent.status === "pending" || consent.status === "granted"
      ? expired ? "expired" : consent.status
      : consent.status;

  const recipientSummary = summarizeRecipients(consent.recipients);
  const expiryDays = daysUntil(consent.expires_at);
  const expiringSoon =
    consent.status === "granted" && live && expiryDays != null && expiryDays >= 0 && expiryDays <= 14;

  // Eligible actions per the parent transition guard.
  const canGrant  = consent.status === "pending" && live;
  const canRevoke = consent.status === "granted"  && live;

  const headlineCopy =
    effectiveStatus === "granted"
      ? `Access granted until ${formatDate(consent.expires_at)}`
      : effectiveStatus === "pending"
        ? "Pending your approval"
        : effectiveStatus === "revoked"
          ? `Revoked${consent.revoked_at ? ` on ${formatDate(consent.revoked_at)}` : ""}`
          : effectiveStatus === "expired"
            ? `Expired on ${formatDate(consent.expires_at)}`
            : "";

  const tone =
    effectiveStatus === "granted" ? "granted"
    : effectiveStatus === "pending" ? "pending"
    : effectiveStatus === "revoked" ? "revoked"
    : "expired";

  return (
    <li
      className={cn(
        "rounded-lg border border-border overflow-hidden",
        tone === "pending" && "border-amber-300 bg-amber-50/60",
        tone === "granted" && "border-green-300 bg-green-50/40",
        tone === "revoked" && "bg-muted/30",
        tone === "expired" && "bg-muted/20",
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <ConsentStatusPill status={effectiveStatus} />
          <span className="text-sm font-medium">{headlineCopy}</span>
          {expiringSoon && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
              <Calendar className="w-3 h-3" />
              {expiryDays === 0 ? "Expires today" : `Expires in ${expiryDays}d`}
            </span>
          )}
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Purpose: </span>
          <span className="whitespace-pre-wrap">{consent.purpose}</span>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" /> {recipientSummary}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Valid until {formatDate(consent.expires_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            {consent.allow_download ? "Download allowed" : "View only"}
          </span>
        </div>

        {consent.revoke_reason && consent.status === "revoked" && (
          <div className="text-xs text-muted-foreground italic">
            Reason: {consent.revoke_reason}
          </div>
        )}

        {/* Action bar */}
        {(canGrant || canRevoke) && pending === null && (
          <div className="flex justify-end gap-2 pt-1">
            {canGrant && (
              <Button size="sm" onClick={onStartGrant}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Grant access
              </Button>
            )}
            {canRevoke && (
              <Button size="sm" variant="outline" onClick={onStartRevoke}>
                <Ban className="w-3.5 h-3.5 mr-1.5" />
                Revoke access
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Inline grant confirmation */}
      {pending === "grant" && (
        <div className="border-t border-border px-3 py-3 bg-card space-y-2">
          <p className="text-sm">
            Grant access until <strong>{formatDate(consent.expires_at)}</strong>?
            The school will be able to share this document with the listed
            recipients for the stated purpose.
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

      {/* Inline revoke confirmation */}
      {pending === "revoke" && (
        <div className="border-t border-border px-3 py-3 bg-card space-y-2">
          <p className="text-sm">
            Revoking removes access immediately for everyone listed in this
            permission. This can&apos;t be undone — if you change your mind
            later, the school will need to ask you again.
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
              placeholder="Why are you revoking? Saved for the school's audit trail."
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
              className="bg-red-600 hover:bg-red-700"
            >
              {busy ? "Revoking…" : "Confirm revoke"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}


function ConsentStatusPill({
  status,
}: {
  status: "pending" | "granted" | "revoked" | "expired";
}) {
  const styles =
    status === "granted" ? "bg-green-100 text-green-700"
    : status === "pending" ? "bg-amber-100 text-amber-800"
    : status === "revoked" ? "bg-red-100 text-red-700"
    : "bg-gray-100 text-gray-600"; // expired

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        styles,
      )}
    >
      {CONSENT_STATUS_LABELS[status]}
    </span>
  );
}


// ── Recipient helpers ──────────────────────────────────────────────────────

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

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
