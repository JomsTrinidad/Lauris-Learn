"use client";

/**
 * Upload Document modal (Phase D step D7).
 *
 * Flow (transactional from the user's perspective; we roll back on error):
 *   1. Insert child_documents row (status='draft', current_version_id=NULL).
 *   2. Upload the file to storage at
 *      {school_id}/{student_id}/{doc_id}/v1.{ext}
 *   3. Insert child_document_versions (version_number=1).
 *   4. Update child_documents.current_version_id = <new version id>.
 *   5. Best-effort trackUpload() into uploaded_files (failure does not roll back).
 *
 * Rollback rules — best-effort, ordered to respect FK and CHECK constraints:
 *   - If (3) fails after (2) succeeded: remove blob, delete head.
 *   - If (4) fails after (3) succeeded: delete version (FK from head's
 *     current_version_id is still NULL, no SET NULL chain), then delete head,
 *     then remove blob.
 *   - If (2) fails: delete head only.
 *
 * Status starts as 'draft'. Mark Active is a separate later step (D9).
 *
 * Constraints respected:
 *   - PDF / JPEG / PNG / WebP only (mirrors bucket allowed_mime_types).
 *   - 25 MB max (mirrors bucket file_size_limit).
 *   - storage_path is unique per migration 054 — collisions surface as a
 *     storage error, which we map to a user-friendly message.
 */

import { useEffect, useMemo, useState } from "react";
import { Upload, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { trackUpload } from "@/lib/track-upload";
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_TYPE_OPTIONS,
  MAX_FILE_SIZE_BYTES,
} from "./constants";
import { formatBytes } from "./utils";
import type { DocumentType } from "./types";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

interface StudentOption {
  id: string;
  name: string;
}

export interface UploadDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful upload so the parent can refresh its list. */
  onUploaded: (docId: string) => void;
  /** Pre-selected student id when entering the workspace via ?student=<id>. */
  defaultStudentId?: string | null;
  schoolId: string;
  userId: string;
}

export function UploadDocumentModal({
  open,
  onClose,
  onUploaded,
  defaultStudentId = null,
  schoolId,
  userId,
}: UploadDocumentModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // ── Form state ────────────────────────────────────────────────────────────
  const [studentId, setStudentId]     = useState<string>(defaultStudentId ?? "");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [title, setTitle]              = useState("");
  const [description, setDescription]  = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reviewDate, setReviewDate]    = useState("");
  const [file, setFile]                = useState<File | null>(null);

  const [students, setStudents]        = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [submitting, setSubmitting]    = useState(false);
  const [error, setError]              = useState<string | null>(null);
  const [fileError, setFileError]      = useState<string | null>(null);

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStudentId(defaultStudentId ?? "");
    setDocumentType("");
    setTitle("");
    setDescription("");
    setEffectiveDate("");
    setReviewDate("");
    setFile(null);
    setError(null);
    setFileError(null);
    setSubmitting(false);
  }, [open, defaultStudentId]);

  // ── Load students for picker ──────────────────────────────────────────────
  useEffect(() => {
    if (!open || !schoolId) return;
    let cancelled = false;
    setStudentsLoading(true);
    supabase
      .from("students")
      .select("id, first_name, last_name")
      .eq("school_id", schoolId)
      .order("first_name", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
        } else {
          setStudents(
            (data ?? []).map((s) => ({
              id: s.id,
              name: `${s.first_name} ${s.last_name}`.trim(),
            })),
          );
        }
        setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, schoolId, supabase]);

  // ── File validation ───────────────────────────────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  function canSubmit(): boolean {
    return (
      !submitting
      && !!studentId
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

    // Generate the document id client-side. This avoids INSERT ... RETURNING,
    // which triggers a SELECT policy evaluation against the just-inserted row.
    // The SELECT policy on child_documents calls accessible_document_ids() —
    // depending on Postgres's behavior with STABLE SECURITY DEFINER helpers
    // mid-statement, that can reject the RETURNING even though the INSERT
    // WITH CHECK passes cleanly.
    const docId = crypto.randomUUID();
    const storagePath = `${schoolId}/${studentId}/${docId}/v1.${ext}`;

    // ── Step 1: insert head as draft (no RETURNING) ─────────────────────────
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
        source_kind:    "school",
        effective_date: effectiveDate || null,
        review_date:    reviewDate || null,
        created_by:     userId,
      });

    if (headInsert.error) {
      setError(humanInsertError(headInsert.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 2: upload blob ─────────────────────────────────────────────────
    const upload = await supabase.storage
      .from("child-documents")
      .upload(storagePath, file, {
        contentType: file.type || guessMimeFromExt(ext),
        upsert: false,
      });

    if (upload.error) {
      // Roll back step 1.
      await supabase.from("child_documents").delete().eq("id", docId);
      setError(humanStorageError(upload.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 3: insert version row (no RETURNING — same reason as step 1) ───
    const versionId = crypto.randomUUID();
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
        mime_type:           file.type || guessMimeFromExt(ext),
        uploaded_by_user_id: userId,
        uploaded_by_kind:    "school_admin", // RLS allows 'school_admin' or 'teacher'; matches current_user_role()
        is_hidden:           false,
      });

    if (versionInsert.error) {
      await rollbackBlob(supabase, storagePath);
      await supabase.from("child_documents").delete().eq("id", docId);
      setError(humanInsertError(versionInsert.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 4: repoint head's current_version_id ───────────────────────────
    // Trigger 5.D verifies the version exists, belongs to this doc, isn't hidden.
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

    // ── Step 5: best-effort uploaded_files registration ─────────────────────
    // Failure here is intentionally silent — it's lifecycle metadata only.
    await trackUpload(supabase, {
      schoolId,
      uploadedBy:  userId,
      entityType:  "child_document_version",
      entityId:    versionId,
      bucket:      "child-documents",
      storagePath: storagePath,
      fileSize:    file.size,
      mimeType:    file.type || guessMimeFromExt(ext),
    });

    setSubmitting(false);
    onUploaded(docId);
  }

  // We need to detect whether the student picker should show role errors.
  // RLS will reject the insert if a teacher picks a student outside their
  // class scope; humanInsertError() catches that case.

  return (
    <Modal open={open} onClose={onClose} title="Upload Document" className="max-w-xl">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            New documents start as <strong>Draft</strong>. They become visible
            to other authorized users only after you mark them Active or share
            them with consent.
          </span>
        </div>

        {/* Student */}
        <Field label="Student" required>
          <Select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={studentsLoading || submitting}
            required
          >
            <option value="">{studentsLoading ? "Loading…" : "Select a student"}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* Document type */}
        <Field label="Document type" required>
          <Select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType | "")}
            disabled={submitting}
            required
          >
            <option value="">Select a type</option>
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* Title */}
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Spring 2026 IEP"
            maxLength={200}
            disabled={submitting}
            required
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Internal notes about this document (optional)…"
            rows={2}
            disabled={submitting}
          />
        </Field>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Effective date">
            <DatePicker
              value={effectiveDate}
              onChange={setEffectiveDate}
              placeholder="Optional"
              disabled={submitting}
            />
          </Field>
          <Field label="Review by">
            <DatePicker
              value={reviewDate}
              onChange={setReviewDate}
              placeholder="Optional"
              disabled={submitting}
            />
          </Field>
        </div>

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
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload as Draft
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
    // Best-effort. An orphaned blob is harmless: storage RLS still gates reads,
    // and there's no version row pointing at it. Surface to console for ops.
    console.warn("[upload-document] rollbackBlob failed:", err);
  }
}

function humanInsertError(msg?: string): string {
  if (!msg) return "Couldn't save the document. Please try again.";
  // RLS rejection on teacher class scope.
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to upload a document for this student. Make sure you teach a class they're enrolled in, or ask a school admin.";
  }
  // CHECK constraint feedback for trigger 5.D / current_version validation.
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
    return "You don't have permission to upload to this location. Ask a school admin.";
  }
  return `Upload failed: ${msg}`;
}
