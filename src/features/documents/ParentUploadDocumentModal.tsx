"use client";

/**
 * Parent-side upload modal (Phase E2).
 *
 * Mirrors the admin UploadDocumentModal's 5-step transactional shape but
 * with the parent-specific guardrails baked in:
 *
 *   - source_kind = 'parent'
 *   - status      = 'draft' (always; parents cannot mark active or share)
 *   - uploaded_by_kind = 'parent'
 *   - created_by  = auth.uid()
 *   - student_id  comes from the active child (ParentContext) — pre-bound,
 *     not picker-driven, so we never need to filter cross-child options.
 *
 * RLS coverage:
 *   - child_documents INSERT — parent_insert_child_documents
 *   - storage INSERT          — child_documents_parent_insert (path's
 *                               foldername[2] must be in parent_student_ids())
 *   - child_document_versions INSERT — parent_insert_child_document_versions
 *   - child_documents UPDATE (head repoint to new current_version_id)
 *                            — parent_update_own_draft_child_documents
 *
 * Rollback caveat: parents have no storage DELETE policy. If step 3 fails
 * after step 2 succeeded, the blob is orphaned. Same trade-off the admin
 * path documents — orphans are harmless because storage SELECT is default-deny.
 */

import { useEffect, useMemo, useState } from "react";
import { Upload, AlertTriangle, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { trackUpload } from "@/lib/track-upload";
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_TYPE_OPTIONS,
  MAX_FILE_SIZE_BYTES,
} from "./constants";
import { formatBytes } from "./utils";
import { fulfillRequest } from "./requests-api";
import type { DocumentType } from "./types";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

export interface ParentUploadDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful upload so the page can refresh its list. */
  onUploaded: (docId: string) => void;
  /** From ParentContext — the active child the upload is tied to. */
  schoolId:    string;
  studentId:   string;
  studentName: string;
  /** auth.uid() — required for created_by + uploaded_by_user_id. */
  userId:      string;

  // ── Fulfillment mode (optional) ─────────────────────────────────────────
  /** When set, the modal renders in "fulfilling a request" mode: pre-binds
   *  document_type, swaps the banner copy, and after a successful upload
   *  transitions the request to status='submitted' with
   *  fulfilled_with_document_id pointing at the new doc. */
  fulfillingRequestId?:  string | null;
  /** Display label so the parent sees what the school asked for. */
  fulfillingRequestLabel?: string | null;
  /** Pre-fill + lock the document type when fulfilling a request. */
  defaultDocumentType?:  DocumentType | null;
}

export function ParentUploadDocumentModal({
  open,
  onClose,
  onUploaded,
  schoolId,
  studentId,
  studentName,
  userId,
  fulfillingRequestId    = null,
  fulfillingRequestLabel = null,
  defaultDocumentType    = null,
}: ParentUploadDocumentModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isFulfilling = !!fulfillingRequestId;

  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [file, setFile]                 = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [fileError, setFileError]   = useState<string | null>(null);

  // Reset on (re)open. The student is fixed for the parent flow, so we
  // don't reset that — but we do clear the form state. When fulfilling a
  // specific request we also pre-fill the document type.
  useEffect(() => {
    if (!open) return;
    setDocumentType(defaultDocumentType ?? "");
    setTitle("");
    setDescription("");
    setFile(null);
    setError(null);
    setFileError(null);
    setSubmitting(false);
  }, [open, defaultDocumentType]);

  // ── File validation (mirrors admin path + bucket policy) ─────────────────
  function validateFile(f: File): string | null {
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return `File is too large (${formatBytes(f.size)}). Maximum 25 MB.`;
    }
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return `File type .${ext} is not allowed. Use PDF, JPEG, PNG, or WebP.`;
    }
    if (f.type && !(ALLOWED_MIME_TYPES as readonly string[]).includes(f.type)) {
      return `File type "${f.type}" is not allowed.`;
    }
    return null;
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileError(f ? validateFile(f) : null);
  }

  function canSubmit(): boolean {
    return (
      !submitting
      && !!documentType
      && title.trim().length > 0
      && !!file
      && !fileError
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit() || !file) return;

    setSubmitting(true);
    setError(null);

    const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
    // Client-side IDs avoid INSERT…RETURNING (which can hit SELECT-policy
    // evaluation against the just-inserted row — same workaround the admin
    // path uses).
    const docId       = crypto.randomUUID();
    const versionId   = crypto.randomUUID();
    const storagePath = `${schoolId}/${studentId}/${docId}/v1.${ext}`;
    const mimeType    = file.type || guessMimeFromExt(ext);

    // ── Step 1: insert head as parent draft ────────────────────────────────
    const headInsert = await supabase
      .from("child_documents")
      .insert({
        id:             docId,
        school_id:      schoolId,
        student_id:     studentId,
        document_type:  documentType as DocumentType,
        title:          title.trim(),
        description:    description.trim() || null,
        status:         "draft",
        source_kind:    "parent",
        created_by:     userId,
      });

    if (headInsert.error) {
      setError(humanInsertError(headInsert.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 2: upload blob ────────────────────────────────────────────────
    const upload = await supabase.storage
      .from("child-documents")
      .upload(storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (upload.error) {
      // Roll back step 1. parent_delete_own_draft_child_documents allows it.
      await supabase.from("child_documents").delete().eq("id", docId);
      setError(humanStorageError(upload.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 3: insert version row ─────────────────────────────────────────
    const versionInsert = await supabase
      .from("child_document_versions")
      .insert({
        id:                  versionId,
        document_id:         docId,
        school_id:           schoolId,
        version_number:      1,
        storage_path:        storagePath,
        file_name:           file.name,
        file_size:           file.size,
        mime_type:           mimeType,
        uploaded_by_user_id: userId,
        uploaded_by_kind:    "parent",
        is_hidden:           false,
      });

    if (versionInsert.error) {
      // Best-effort blob cleanup (parents can't DELETE — surfaces to console).
      await rollbackBlob(supabase, storagePath);
      await supabase.from("child_documents").delete().eq("id", docId);
      setError(humanInsertError(versionInsert.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 4: repoint head's current_version_id ──────────────────────────
    // Trigger 5.D verifies the version exists, belongs to this doc, isn't
    // hidden. Trigger 5.E (hide-version) doesn't fire on this UPDATE.
    const repoint = await supabase
      .from("child_documents")
      .update({ current_version_id: versionId })
      .eq("id", docId);

    if (repoint.error) {
      await supabase.from("child_document_versions").delete().eq("id", versionId);
      await supabase.from("child_documents").delete().eq("id", docId);
      await rollbackBlob(supabase, storagePath);
      setError(humanInsertError(repoint.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 5: best-effort uploaded_files registration ────────────────────
    // Same posture as the admin path — failures here are silent.
    await trackUpload(supabase, {
      schoolId,
      uploadedBy:  userId,
      entityType:  "child_document_version",
      entityId:    versionId,
      bucket:      "child-documents",
      storagePath: storagePath,
      fileSize:    file.size,
      mimeType:    mimeType,
    });

    // ── Step 6 (optional): link to the request being fulfilled ─────────────
    // Runs only in fulfillment mode. We don't roll back the upload if this
    // fails — the doc is real and visible in the parent's list either way.
    //
    // BUG-FIX: previously we set an error AND immediately called onUploaded
    // here. The page closes the modal in onUploaded, so the parent never
    // saw the warning that the request didn't auto-link. Now we keep the
    // modal open and surface the warning explicitly; the parent dismisses
    // with Cancel and the school still sees the doc plus the open request
    // (admin can manually mark reviewed using the existing flow).
    if (fulfillingRequestId) {
      try {
        await fulfillRequest(supabase, {
          requestId:           fulfillingRequestId,
          fulfilledDocumentId: docId,
        });
      } catch (err) {
        console.warn("[parent-upload-document] fulfillRequest failed:", err);
        setError(
          "Your document was uploaded successfully, but we couldn't link it to the school's request automatically. The school will still see the file — please let them know you've responded so they can close the request.",
        );
        setSubmitting(false);
        return;   // Do NOT call onUploaded — keep modal open to show warning.
      }
    }

    setSubmitting(false);
    onUploaded(docId);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFulfilling ? "Respond to the School's Request" : "Upload for School"}
      className="max-w-xl"
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        {/* Banner — copy depends on whether we're fulfilling a request */}
        {isFulfilling ? (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Replying to the school&apos;s request
                {fulfillingRequestLabel && <>: <span className="font-semibold">{fulfillingRequestLabel}</span></>}.
              </p>
              <p className="mt-1 text-blue-800">
                Once you upload, the school will see this document and review it.
                It will stay marked as <strong>Draft</strong> until the school
                approves it.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                This document will be reviewed by the school before it becomes official.
              </p>
              <p className="mt-1 text-amber-800">
                Upload anything you&apos;d like the school to consider — medical
                certificates, therapy reports, prior school records, etc. The
                school will look it over and decide what to do next.
              </p>
            </div>
          </div>
        )}

        {/* Child — pre-bound from ParentContext, shown as info, not picker */}
        <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
          <p className="text-xs font-medium text-muted-foreground">Uploading for</p>
          <p className="font-medium mt-0.5">{studentName}</p>
        </div>

        {/* Document type — locked when fulfilling a request so the parent
            can't accidentally upload the wrong kind of file. */}
        <Field label="Document type" required>
          <Select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType | "")}
            disabled={submitting || isFulfilling}
            required
          >
            <option value="">Select a type</option>
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          {isFulfilling && (
            <p className="text-xs text-muted-foreground mt-1">
              The type was set by the school&apos;s request and can&apos;t be changed here.
            </p>
          )}
        </Field>

        {/* Title */}
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pediatrician note (Mar 2026)"
            maxLength={200}
            disabled={submitting}
            required
          />
        </Field>

        {/* Description */}
        <Field label="Note for the school">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything the school should know about this document (optional)…"
            rows={2}
            disabled={submitting}
          />
        </Field>

        {/* File */}
        <Field label="File" required>
          <div className="space-y-1.5">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={onFilePicked}
              disabled={submitting}
              className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90 file:cursor-pointer"
            />
            {file && !fileError && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
            {fileError && (
              <p className="text-xs text-red-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {fileError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              PDF, JPEG, PNG, or WebP. Up to 25 MB.
            </p>
          </div>
        </Field>

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit()}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isFulfilling ? "Sending…" : "Uploading…"}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {isFulfilling ? "Send to School" : "Send to School"}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function guessMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "pdf":  return "application/pdf";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png":  return "image/png";
    case "webp": return "image/webp";
    default:     return "application/octet-stream";
  }
}

async function rollbackBlob(
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<void> {
  try {
    await supabase.storage.from("child-documents").remove([storagePath]);
  } catch (err) {
    // Parents have no storage DELETE policy, so this typically silently
    // fails for parent uploads. The orphan blob is harmless: storage
    // SELECT is default-deny and there's no version row pointing at it.
    console.warn("[parent-upload-document] rollbackBlob failed:", err);
  }
}

function humanInsertError(msg?: string): string {
  if (!msg) return "Couldn't save the document. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "We couldn't save this upload. Make sure you're listed as a guardian for this child — ask the school if you're not sure.";
  }
  if (/current_version_id/i.test(msg)) {
    return "Couldn't link the file to the document. The upload may have been interrupted — try again.";
  }
  return msg;
}

function humanStorageError(msg?: string): string {
  if (!msg) return "Couldn't upload the file. Please try again.";
  if (/already exists/i.test(msg)) {
    return "A file with this path already exists. Try the upload again — the document was reset.";
  }
  if (/payload too large|exceeded the maximum/i.test(msg)) {
    return "File is too large. Maximum 25 MB.";
  }
  if (/mime type|not allowed/i.test(msg)) {
    return "This file type is not allowed. Use PDF, JPEG, PNG, or WebP.";
  }
  if (/violates row-level security/i.test(msg)) {
    return "We couldn't upload to this location. Ask the school to confirm you're listed as a guardian for this child.";
  }
  return `Upload failed: ${msg}`;
}
