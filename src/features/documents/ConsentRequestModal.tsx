"use client";

/**
 * ConsentRequestModal — Phase D step D11.
 *
 * Drafts a `document_consents` row in `status='pending'` for an external
 * contact, scoped to a single document (v1 only writes document-scope
 * consents). The DB enforces the rest:
 *   - trigger 5.F validates scope/recipients shape + tenant + contact-school
 *   - RLS `school_staff_insert_document_consents` requires status='pending'
 *     and requested_by_user_id = auth.uid()
 *
 * Parent-side granting is NOT in v1 (no parent UI yet) — admins simulate via
 * SQL. Once a row is in `granted`, ShareDocumentModal can create the grant.
 *
 * UX shape:
 *   - Doc + contact summary at top.
 *   - Required: purpose (non-empty), expiry (preset or custom).
 *   - Optional: allow_download (default true), allow_reshare (default false).
 *   - Submit → success state with explainer of what happens next.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Calendar,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { EXPIRY_PRESETS } from "./constants";
import { createConsentDraft } from "./consent-api";
import type { ExternalContactRow } from "./types";

export interface ConsentRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the consent row is created. The created consent's id is
   *  passed back so the caller can refresh / preselect it in the share flow. */
  onRequested: (consentId: string) => void;
  doc: {
    id:         string;
    school_id:  string;
    student_id: string;
    title:      string;
  } | null;
  contact: ExternalContactRow | null;
  /** auth.uid() — required for the INSERT policy. */
  userId: string;
}

const DEFAULT_PRESET_DAYS = 90;

export function ConsentRequestModal({
  open,
  onClose,
  onRequested,
  doc,
  contact,
  userId,
}: ConsentRequestModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const [purpose,       setPurpose]       = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowReshare,  setAllowReshare]  = useState(false);
  const [presetDays,    setPresetDays]    = useState<number | "custom">(DEFAULT_PRESET_DAYS);
  const [customDate,    setCustomDate]    = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [createdId,  setCreatedId]  = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPurpose("");
    setAllowDownload(true);
    setAllowReshare(false);
    setPresetDays(DEFAULT_PRESET_DAYS);
    setCustomDate("");
    setError(null);
    setCreatedId(null);
    setSubmitting(false);
  }, [open]);

  const resolvedExpiry = useMemo<{ iso: string; date: Date } | null>(() => {
    let target: Date | null = null;
    if (presetDays === "custom") {
      if (!customDate) return null;
      try {
        target = parseISO(customDate);
      } catch {
        return null;
      }
    } else {
      target = addDays(new Date(), presetDays);
    }
    if (!target || isNaN(target.getTime())) return null;
    target.setHours(23, 59, 59, 999);
    return { iso: target.toISOString(), date: target };
  }, [presetDays, customDate]);

  const canSubmit =
    !!doc
    && !!contact
    && purpose.trim().length > 0
    && !!resolvedExpiry
    && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !doc || !contact || !resolvedExpiry) return;

    setSubmitting(true);
    setError(null);

    try {
      const { id } = await createConsentDraft(supabase, {
        schoolId:          doc.school_id,
        studentId:         doc.student_id,
        documentId:        doc.id,
        externalContactId: contact.id,
        purpose:           purpose.trim(),
        expiresAt:         resolvedExpiry.iso,
        allowDownload,
        allowReshare,
        requestedByUserId: userId,
      });
      setSubmitting(false);
      setCreatedId(id);
    } catch (err) {
      setSubmitting(false);
      setError(humanConsentError(errorMessage(err)));
    }
  }

  function handleDone() {
    if (createdId) onRequested(createdId);
    else onClose();
  }

  if (!doc || !contact) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={createdId ? "Consent Requested" : "Request Consent"}
      className="max-w-md"
    >
      {createdId ? (
        <div className="space-y-4">
          <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Consent draft created.</p>
              <p className="mt-1 text-xs">
                The consent is now <strong>pending</strong>. Once a parent
                grants it (parent-side approval lands in a later step), you'll
                be able to share this document with{" "}
                <strong>{contact.full_name}</strong> until{" "}
                {resolvedExpiry && (
                  <strong>{format(resolvedExpiry.date, "MMM d, yyyy")}</strong>
                )}
                .
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" onClick={handleDone}>Done</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {/* Doc + contact summary */}
          <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm space-y-0.5">
            <p className="font-medium truncate">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              Recipient: <strong>{contact.full_name}</strong>
              {contact.organization_name && <> · {contact.organization_name}</>}
              {contact.email && <> · {contact.email}</>}
            </p>
          </div>

          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              You're drafting a consent request. The parent must grant it
              before this contact can actually access the document.
            </span>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Purpose <span className="text-red-600">*</span>
            </label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Share IEP with developmental pediatrician for the May review."
              rows={3}
              maxLength={500}
              disabled={submitting}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              The parent will see this when deciding whether to grant.
            </p>
          </div>

          {/* Allow download / reshare */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Permissions to request</label>
            <div className="space-y-2 px-3 py-3 bg-muted/30 border border-border rounded-lg text-sm">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  disabled={submitting}
                  className="rounded mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-medium">Allow download</p>
                  <p className="text-xs text-muted-foreground">
                    The contact can save the file. Off means view-only in browser.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowReshare}
                  onChange={(e) => setAllowReshare(e.target.checked)}
                  disabled={submitting}
                  className="rounded mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-medium">Allow reshare</p>
                  <p className="text-xs text-muted-foreground">
                    Recorded for now; reshare flows aren't built yet.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Consent expires <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setPresetDays(p.days)}
                  disabled={submitting}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    presetDays === p.days
                      ? "bg-primary text-white border-primary"
                      : "bg-card border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPresetDays("custom")}
                disabled={submitting}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  presetDays === "custom"
                    ? "bg-primary text-white border-primary"
                    : "bg-card border-border text-foreground hover:bg-muted"
                }`}
              >
                Custom
              </button>
            </div>
            {presetDays === "custom" && (
              <div className="mt-2">
                <DatePicker
                  value={customDate}
                  onChange={setCustomDate}
                  placeholder="Pick an expiry date"
                />
              </div>
            )}
            {resolvedExpiry && (
              <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Expires {format(resolvedExpiry.date, "MMM d, yyyy")}
              </p>
            )}
          </div>

          {error && <ErrorAlert message={error} />}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <ModalCancelButton />
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Drafting…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Request consent
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
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

function humanConsentError(msg?: string): string {
  if (!msg) return "Couldn't draft the consent. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to draft a consent for this student.";
  }
  if (/external_contact .* belongs to school .* not consent school/i.test(msg)) {
    return "That external contact belongs to a different school. Pick one in your school.";
  }
  if (/external_contact .* does not exist or is deactivated/i.test(msg)) {
    return "That external contact has been removed or deactivated.";
  }
  if (/scope\.document_id .* does not exist/i.test(msg)) {
    return "Couldn't link the consent to this document. Refresh and try again.";
  }
  if (/scope\.document_id .* belongs to a different school\/student/i.test(msg)) {
    return "Tenant mismatch — please refresh and try again.";
  }
  return msg;
}
