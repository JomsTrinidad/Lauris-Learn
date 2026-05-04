"use client";

/**
 * ShareDocumentWithClinicModal — issues a
 * document_organization_access_grants row for a school document
 * targeting a clinic / medical_practice org.
 *
 * Phase 6D scope:
 *   - Document picker filtered to status IN ('active','shared') in
 *     the school's docs.
 *   - Permissions: view (always on), download (opt-in). Comment +
 *     upload_new_version locked off in v1 — they're enforced
 *     immutable post-insert by the column-guard trigger.
 *   - Expiry presets + custom.
 */

import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, Lock, AlertTriangle } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import { cn } from "@/lib/utils";
import {
  createDocumentGrant,
  listSchoolDocumentsForSharing,
} from "./queries";
import { ClinicOrganizationPicker } from "./ClinicOrganizationPicker";
import type {
  ClinicOrgOption,
  DocumentGrantPermissions,
  SchoolDocumentForSharing,
} from "./types";

interface Props {
  open: boolean;
  schoolId: string;
  userId: string;
  /** When provided, the doc picker is locked to this id (per-doc entry
   *  point from DocumentDetailModal). */
  lockedDocumentId?: string | null;
  lockedDocumentTitle?: string | null;
  onClose: () => void;
  onShared: () => void;
}

interface ExpiryPreset {
  days: number;
  label: string;
}

const PRESETS: ExpiryPreset[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
];

const DEFAULT_DAYS = 90;

const DEFAULT_PERMS: DocumentGrantPermissions = {
  view: true,
  download: false,
  comment: false,
  upload_new_version: false,
};

export function ShareDocumentWithClinicModal({
  open,
  schoolId,
  userId,
  lockedDocumentId,
  lockedDocumentTitle,
  onClose,
  onShared,
}: Props) {
  const [docs, setDocs] = useState<SchoolDocumentForSharing[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [documentId, setDocumentId] = useState<string>("");

  const [clinic, setClinic] = useState<ClinicOrgOption | null>(null);
  const [perms, setPerms] = useState<DocumentGrantPermissions>(DEFAULT_PERMS);
  const [presetDays, setPresetDays] = useState<number | "custom">(DEFAULT_DAYS);
  const [customDate, setCustomDate] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setClinic(null);
    setPerms(DEFAULT_PERMS);
    setPresetDays(DEFAULT_DAYS);
    setCustomDate("");
    setPurpose("");
    if (lockedDocumentId) {
      setDocumentId(lockedDocumentId);
      setDocs([]);
      return;
    }
    setDocumentId("");
    let cancelled = false;
    setDocsLoading(true);
    listSchoolDocumentsForSharing(schoolId).then((rows) => {
      if (cancelled) return;
      setDocs(rows);
      setDocsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, schoolId, lockedDocumentId]);

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
    if (target.getTime() <= Date.now()) return null;
    return { iso: target.toISOString(), date: target };
  }, [presetDays, customDate]);

  const canSubmit = !!documentId && !!clinic && !!resolvedExpiry && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !clinic || !resolvedExpiry) return;
    setSubmitting(true);
    setError(null);
    const result = await createDocumentGrant({
      documentId,
      schoolId,
      targetOrganizationId: clinic.id,
      grantedByProfileId: userId,
      permissions: perms,
      validUntil: resolvedExpiry.iso,
      purpose: purpose.trim() || null,
    });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onShared();
  }

  const documentTitle = useMemo(() => {
    if (lockedDocumentTitle) return lockedDocumentTitle;
    return docs.find((d) => d.id === documentId)?.title ?? null;
  }, [docs, documentId, lockedDocumentTitle]);

  return (
    <Modal open={open} onClose={onClose} title="Share Document With Clinic" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Document picker */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Document <span className="text-red-600">*</span>
          </label>
          {lockedDocumentId ? (
            <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
              {lockedDocumentTitle ?? "Selected document"}
            </div>
          ) : docsLoading ? (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                No active documents to share. Mark a draft as Active first.
              </p>
            </div>
          ) : (
            <Select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="">Select a document…</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                  {d.studentName ? ` — ${d.studentName}` : ""}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Clinic picker */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Clinic / medical practice <span className="text-red-600">*</span>
          </label>
          <ClinicOrganizationPicker
            value={clinic}
            onChange={setClinic}
            disabled={submitting}
          />
        </div>

        {/* Permissions */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Permissions</label>
          <div className="space-y-2 px-3 py-3 bg-muted/30 border border-border rounded-lg text-sm">
            <label className="flex items-start gap-2 cursor-not-allowed opacity-80">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="font-medium">View</p>
                <p className="text-xs text-muted-foreground">
                  Always on. The clinic can open the file.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={perms.download}
                onChange={(e) =>
                  setPerms((p) => ({ ...p, download: e.target.checked }))
                }
                disabled={submitting}
                className="rounded mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="font-medium">Download</p>
                <p className="text-xs text-muted-foreground">
                  Allow saving the file locally. Off by default.
                </p>
              </div>
            </label>

            <div className="flex items-start gap-2 opacity-60">
              <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                Comments and uploading new versions stay off in this version
                of clinic sharing.
              </p>
            </div>

            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
              Permissions can&apos;t change later. To adjust, revoke this grant
              and issue a new one.
            </p>
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Access expires <span className="text-red-600">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
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
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Purpose <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Therapy progress review"
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        {/* Confirmation */}
        {clinic && resolvedExpiry && documentTitle && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>{clinic.name}</strong> will be able to view{" "}
              <strong>{documentTitle}</strong>
              {perms.download ? <> (with download)</> : null} until{" "}
              <strong>{format(resolvedExpiry.date, "MMM d, yyyy")}</strong>.
            </span>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sharing…
              </>
            ) : (
              "Share document"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
