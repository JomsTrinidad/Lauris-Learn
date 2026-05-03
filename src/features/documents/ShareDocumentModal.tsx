"use client";

/**
 * ShareDocumentModal — internal staff + external contact sharing (D10 + D12).
 *
 * Two target modes:
 *
 *   STAFF (D10):
 *     - grantee_kind = 'school_user', same school
 *     - consent_id = NULL (allowed by trigger 5.G for same-school school_user)
 *     - permissions: view always on, download opt-in; comment / upload_new_version
 *       deferred
 *
 *   EXTERNAL (D12):
 *     - grantee_kind = 'external_contact'
 *     - consent_id REQUIRED — pre-flight checks for a covering live consent
 *       on (document, contact). If none → user is routed to ConsentRequestModal.
 *       If pending → block with explainer. If granted → allow share, with
 *       grant.expires_at clamped to consent.expires_at and download disabled
 *       unless consent.allow_download is true.
 *     - Trigger 5.G validates everything again server-side (recipient match,
 *       expiry bound, scope coverage).
 *
 * v1 still does not expose:
 *   - revocation (D13)
 *   - share-with-school grantee_kind
 *   - cross-school school_user with consent
 *   - comments / version-upload permissions
 */

import { useEffect, useMemo, useState } from "react";
import {
  Share2,
  Calendar,
  AlertTriangle,
  Loader2,
  Lock,
  Users,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { EXPIRY_PRESETS } from "./constants";
import {
  listSchoolStaffForSharing,
  createInternalGrant,
  createExternalGrant,
  type SchoolStaffOption,
} from "./share-api";
import {
  listConsentsForDocument,
  pickValidConsentForExternal,
  type ConsentRow,
} from "./consent-api";
import { ExternalContactPicker } from "./ExternalContactPicker";
import { ConsentRequestModal } from "./ConsentRequestModal";
import type { GrantPermissions, ExternalContactRow } from "./types";

type TargetMode = "staff" | "external";

export interface ShareDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a grant is successfully created. */
  onShared: () => void;
  doc: {
    id:            string;
    school_id:     string;
    student_id:    string;
    document_type: string;
    title:         string;
  } | null;
  /** auth.uid() — required for created_by. */
  userId: string;
}

const DEFAULT_PRESET_DAYS = 90;

const DEFAULT_PERMS: GrantPermissions = {
  view:               true,
  download:           false,
  comment:            false,
  upload_new_version: false,
};

export function ShareDocumentModal({
  open,
  onClose,
  onShared,
  doc,
  userId,
}: ShareDocumentModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // Target mode tab
  const [mode, setMode] = useState<TargetMode>("staff");

  // ── Staff path ─────────────────────────────────────────────────────────
  const [staff, setStaff]                 = useState<SchoolStaffOption[]>([]);
  const [staffLoading, setStaffLoading]   = useState(false);
  const [staffError, setStaffError]       = useState<string | null>(null);
  const [granteeUserId, setGranteeUserId] = useState<string>("");

  // ── External path ──────────────────────────────────────────────────────
  const [contact, setContact]             = useState<ExternalContactRow | null>(null);
  const [consents, setConsents]           = useState<ConsentRow[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(false);
  const [consentsError, setConsentsError] = useState<string | null>(null);
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  // ── Shared form fields ─────────────────────────────────────────────────
  const [perms, setPerms] = useState<GrantPermissions>(DEFAULT_PERMS);
  const [presetDays, setPresetDays] = useState<number | "custom">(DEFAULT_PRESET_DAYS);
  const [customDate, setCustomDate] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Reset on (re)open
  useEffect(() => {
    if (!open) return;
    setMode("staff");
    setGranteeUserId("");
    setContact(null);
    setPerms(DEFAULT_PERMS);
    setPresetDays(DEFAULT_PRESET_DAYS);
    setCustomDate("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  // Load staff (only when staff mode active and modal open)
  useEffect(() => {
    if (!open || !doc || mode !== "staff") return;
    let cancelled = false;
    setStaffLoading(true);
    setStaffError(null);
    listSchoolStaffForSharing(supabase, doc.school_id)
      .then((rows) => { if (!cancelled) setStaff(rows); })
      .catch((err) => { if (!cancelled) setStaffError(err instanceof Error ? err.message : "Failed to load staff list."); })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    return () => { cancelled = true; };
  }, [open, doc, mode, supabase]);

  // Load covering consents (only when external mode active and modal open)
  const reloadConsents = useMemo(() => {
    return async () => {
      if (!doc) return;
      setConsentsLoading(true);
      setConsentsError(null);
      try {
        const rows = await listConsentsForDocument(supabase, {
          id:            doc.id,
          document_type: doc.document_type,
          student_id:    doc.student_id,
          school_id:     doc.school_id,
        });
        setConsents(rows);
      } catch (err) {
        setConsentsError(err instanceof Error ? err.message : "Failed to load consents.");
      } finally {
        setConsentsLoading(false);
      }
    };
  }, [doc, supabase]);

  useEffect(() => {
    if (!open || !doc || mode !== "external") return;
    void reloadConsents();
  }, [open, doc, mode, reloadConsents]);

  // ── Derived state ──────────────────────────────────────────────────────
  const grantee = useMemo(
    () => staff.find((s) => s.id === granteeUserId) ?? null,
    [staff, granteeUserId],
  );

  // Consent that covers (doc + contact). Pending and granted both qualify
  // for "live", but only granted unblocks share.
  const coveringConsent = useMemo<ConsentRow | null>(() => {
    if (!contact) return null;
    return pickValidConsentForExternal(consents, contact.id);
  }, [consents, contact]);

  const grantedConsent = coveringConsent?.status === "granted" ? coveringConsent : null;

  const consentExpiryIso = grantedConsent?.expires_at ?? null;
  const consentAllowsDownload = grantedConsent?.allow_download ?? false;

  // For external mode, clamp the user-chosen expiry to the consent expiry.
  const userChosenExpiry = useMemo<{ iso: string; date: Date } | null>(() => {
    let target: Date | null = null;
    if (presetDays === "custom") {
      if (!customDate) return null;
      try { target = parseISO(customDate); } catch { return null; }
    } else {
      target = addDays(new Date(), presetDays);
    }
    if (!target || isNaN(target.getTime())) return null;
    target.setHours(23, 59, 59, 999);
    return { iso: target.toISOString(), date: target };
  }, [presetDays, customDate]);

  const resolvedExpiry = useMemo<{ iso: string; date: Date } | null>(() => {
    if (mode === "staff") return userChosenExpiry;
    if (!userChosenExpiry) return null;
    if (!consentExpiryIso) return userChosenExpiry;
    const consentDate = new Date(consentExpiryIso);
    if (isNaN(consentDate.getTime())) return userChosenExpiry;
    if (userChosenExpiry.date.getTime() <= consentDate.getTime()) return userChosenExpiry;
    return { iso: consentDate.toISOString(), date: consentDate };
  }, [mode, userChosenExpiry, consentExpiryIso]);

  // If consent disallows download, force perms.download = false.
  const effectivePerms: GrantPermissions = useMemo(() => {
    if (mode === "external" && !consentAllowsDownload) {
      return { ...perms, download: false };
    }
    return perms;
  }, [mode, perms, consentAllowsDownload]);

  const externalReadyToSubmit =
    mode === "external"
    && !!contact
    && !!grantedConsent
    && !!resolvedExpiry;

  const staffReadyToSubmit =
    mode === "staff"
    && !!grantee
    && !!resolvedExpiry
    && !staffLoading;

  const canSubmit = (staffReadyToSubmit || externalReadyToSubmit) && !submitting;

  // ── Submit ─────────────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !doc || !resolvedExpiry) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "staff" && grantee) {
        await createInternalGrant(supabase, {
          documentId:    doc.id,
          schoolId:      doc.school_id,
          granteeUserId: grantee.id,
          createdBy:     userId,
          expiresAt:     resolvedExpiry.iso,
          permissions:   effectivePerms,
        });
      } else if (mode === "external" && contact && grantedConsent) {
        await createExternalGrant(supabase, {
          documentId:        doc.id,
          schoolId:          doc.school_id,
          consentId:         grantedConsent.id,
          externalContactId: contact.id,
          createdBy:         userId,
          expiresAt:         resolvedExpiry.iso,
          permissions:       effectivePerms,
        });
      } else {
        throw new Error("Nothing to submit.");
      }
      setSubmitting(false);
      onShared();
    } catch (err) {
      setSubmitting(false);
      setError(humanShareError(errorMessage(err)));
    }
  }

  if (!doc) return null;

  return (
    <Modal open={open} onClose={onClose} title="Share Document" className="max-w-md">
      <form className="space-y-4" onSubmit={onSubmit}>
        {/* Doc summary */}
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          <p className="font-medium truncate">{doc.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mode === "staff"
              ? "Internal share within your school"
              : "External share — requires a granted consent"}
          </p>
        </div>

        {/* Target tabs */}
        <div className="grid grid-cols-2 gap-2">
          <ModeTab
            active={mode === "staff"}
            onClick={() => setMode("staff")}
            icon={<Users className="w-3.5 h-3.5" />}
            label="Staff member"
          />
          <ModeTab
            active={mode === "external"}
            onClick={() => setMode("external")}
            icon={<Globe className="w-3.5 h-3.5" />}
            label="External contact"
          />
        </div>

        {/* Recipient */}
        {mode === "staff" ? (
          <StaffPickerBlock
            staff={staff}
            staffLoading={staffLoading}
            staffError={staffError}
            granteeUserId={granteeUserId}
            onChange={setGranteeUserId}
            disabled={submitting}
          />
        ) : (
          <ExternalContactBlock
            schoolId={doc.school_id}
            contact={contact}
            onChange={(c) => { setContact(c); }}
            disabled={submitting}
          />
        )}

        {/* External-only: consent state */}
        {mode === "external" && contact && (
          <ConsentStatusBlock
            loading={consentsLoading}
            error={consentsError}
            consent={coveringConsent}
            onRequestConsent={() => setConsentModalOpen(true)}
          />
        )}

        {/* Permissions — same shape both modes; download disabled when consent forbids it */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Permissions</label>
          <div className="space-y-2 px-3 py-3 bg-muted/30 border border-border rounded-lg text-sm">
            <label className="flex items-start gap-2 cursor-not-allowed opacity-80">
              <input type="checkbox" checked disabled className="rounded mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">View</p>
                <p className="text-xs text-muted-foreground">Always on. The recipient can open the file.</p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={effectivePerms.download}
                onChange={(e) => setPerms((p) => ({ ...p, download: e.target.checked }))}
                disabled={
                  submitting
                  || (mode === "external" && !consentAllowsDownload)
                }
                className="rounded mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="font-medium">Download</p>
                <p className="text-xs text-muted-foreground">
                  {mode === "external" && grantedConsent && !consentAllowsDownload
                    ? "Disabled — the parent's consent did not allow downloads."
                    : "Allow saving the file locally. Off by default."}
                </p>
              </div>
            </label>

            <div className="flex items-start gap-2 opacity-60">
              <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs">
                  Comments and uploading new versions stay off in this version of sharing.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Access expires <span className="text-red-600">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPresetDays(p.days)}
                disabled={submitting}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  presetDays === p.days
                    ? "bg-primary text-white border-primary"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPresetDays("custom")}
              disabled={submitting}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md border transition-colors",
                presetDays === "custom"
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
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

          {/* Clamped notice — when external mode trims the user's pick to consent expiry */}
          {mode === "external" && grantedConsent && userChosenExpiry && resolvedExpiry
            && userChosenExpiry.date.getTime() > resolvedExpiry.date.getTime() && (
            <p className="text-xs text-amber-700 mt-2 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Capped to consent expiry — the parent's consent ends{" "}
              {format(resolvedExpiry.date, "MMM d, yyyy")}.
            </p>
          )}
        </div>

        {/* Confirmation strip */}
        {confirmationCopy({
          mode,
          grantee,
          contact,
          resolvedExpiry,
          download: effectivePerms.download,
        })}

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sharing…</>
            ) : (
              <><Share2 className="w-4 h-4 mr-2" />Share</>
            )}
          </Button>
        </div>
      </form>

      {/* Consent draft modal — opens stacked over the share modal */}
      <ConsentRequestModal
        open={consentModalOpen}
        onClose={() => setConsentModalOpen(false)}
        onRequested={() => {
          setConsentModalOpen(false);
          // Refresh consents so the UI immediately shows pending status.
          void reloadConsents();
        }}
        doc={doc ? {
          id:         doc.id,
          school_id:  doc.school_id,
          student_id: doc.student_id,
          title:      doc.title,
        } : null}
        contact={contact}
        userId={userId}
      />
    </Modal>
  );
}


// ── Sub-components ─────────────────────────────────────────────────────────

function ModeTab({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors",
        active
          ? "bg-primary/10 border-primary text-foreground font-medium"
          : "bg-card border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StaffPickerBlock({
  staff, staffLoading, staffError, granteeUserId, onChange, disabled,
}: {
  staff: SchoolStaffOption[];
  staffLoading: boolean;
  staffError: string | null;
  granteeUserId: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        Share with <span className="text-red-600">*</span>
      </label>
      {staffLoading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading staff…
        </div>
      ) : staffError ? (
        <ErrorAlert message={staffError} />
      ) : staff.length === 0 ? (
        <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No other staff to share with.</p>
            <p className="mt-1 text-xs">
              Invite staff (school admin or teacher accounts) for your school first, then come back to share.
            </p>
          </div>
        </div>
      ) : (
        <Select
          value={granteeUserId}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
        >
          <option value="">Select a staff member…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} · {labelForRole(s.role)}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

function ExternalContactBlock({
  schoolId, contact, onChange, disabled,
}: {
  schoolId: string;
  contact: ExternalContactRow | null;
  onChange: (c: ExternalContactRow | null) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        External contact <span className="text-red-600">*</span>
      </label>
      <ExternalContactPicker
        schoolId={schoolId}
        canCreate={true}
        value={contact}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function ConsentStatusBlock({
  loading, error, consent, onRequestConsent,
}: {
  loading: boolean;
  error: string | null;
  consent: ConsentRow | null;
  onRequestConsent: () => void;
}) {
  if (loading) {
    return (
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking consent…
      </div>
    );
  }
  if (error) return <ErrorAlert message={error} />;

  if (!consent) {
    return (
      <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex items-start gap-2">
        <ShieldX className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">No consent yet.</p>
          <p className="mt-1 text-xs">
            External sharing requires a parent's consent. Draft a consent
            request first — once granted, you can come back here to share.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onRequestConsent}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Request consent
          </Button>
        </div>
      </div>
    );
  }

  if (consent.status === "pending") {
    return (
      <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Consent is pending.</p>
          <p className="mt-1 text-xs">
            Awaiting the parent's decision. You'll be able to share this
            document once they grant consent.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Purpose: <em>{consent.purpose}</em>
          </p>
        </div>
      </div>
    );
  }

  // status === 'granted'
  return (
    <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900 flex items-start gap-2">
      <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">Consent granted.</p>
        <p className="mt-1 text-xs">
          Valid until {format(new Date(consent.expires_at), "MMM d, yyyy")} ·{" "}
          {consent.allow_download ? "Download allowed" : "View-only"}
          {consent.allow_reshare && <> · Reshare allowed</>}
        </p>
      </div>
    </div>
  );
}


function confirmationCopy({
  mode, grantee, contact, resolvedExpiry, download,
}: {
  mode: TargetMode;
  grantee: SchoolStaffOption | null;
  contact: ExternalContactRow | null;
  resolvedExpiry: { iso: string; date: Date } | null;
  download: boolean;
}) {
  if (!resolvedExpiry) return null;
  const name = mode === "staff" ? grantee?.full_name : contact?.full_name;
  if (!name) return null;
  return (
    <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-start gap-2">
      <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>
        <strong>{name}</strong> will be able to view this document until{" "}
        <strong>{format(resolvedExpiry.date, "MMM d, yyyy")}</strong>
        {download ? <> (with download).</> : <>.</>}
      </span>
    </div>
  );
}

function labelForRole(role: "school_admin" | "teacher"): string {
  return role === "school_admin" ? "School admin" : "Teacher";
}

/** Supabase rejections are plain PostgrestError objects (not Error
 *  instances), so `String(err)` collapses to "[object Object]". Pull the
 *  human-readable string out of whatever shape we got. */
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

function humanShareError(msg?: string): string {
  if (!msg) return "Couldn't share the document. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to share documents. Only school admins can.";
  }
  if (/cross-school user grants require a consent_id/i.test(msg)) {
    return "That staff member belongs to a different school. Cross-school sharing requires consent and isn't available yet.";
  }
  if (/grant\.expires_at .* must be <= consent\.expires_at/i.test(msg)) {
    return "Pick an expiry on or before the consent's expiry.";
  }
  if (/consent .* is not granted/i.test(msg)) {
    return "The covering consent is no longer in 'granted' status. Refresh and try again.";
  }
  if (/consent .* is expired/i.test(msg)) {
    return "The covering consent has expired. Request a new one before sharing.";
  }
  if (/consent recipients do not include this grantee/i.test(msg)) {
    return "The selected consent doesn't list this contact as a recipient.";
  }
  if (/duplicate key/i.test(msg)) {
    return "This person already has an active share for this document.";
  }
  if (/grant\.school_id .* does not match document school/i.test(msg)) {
    return "Tenant mismatch — please refresh and try again.";
  }
  return msg;
}
