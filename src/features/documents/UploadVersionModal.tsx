"use client";

/**
 * Upload Version modal (Phase D step D8).
 *
 * Adds version N+1 to an existing document. Triggered from
 * DocumentDetailModal → Versions tab.
 *
 * Flow (transactional, with rollback):
 *   1. Upload file to {school_id}/{student_id}/{doc_id}/v{N+1}.{ext}
 *   2. Insert child_document_versions row (client-side UUID, no RETURNING)
 *   3. Update child_documents.current_version_id = <new version id>
 *      (Phase A trigger 5.D verifies the version exists, belongs to this doc,
 *      and is not hidden)
 *   4. Best-effort trackUpload() into uploaded_files
 *
 * Validation matches D7: PDF/JPEG/PNG/WebP, ≤ 25 MB.
 *
 * Rollback ordering respects FK + CHECK constraints:
 *   - Step 2 fails → remove blob.
 *   - Step 3 fails → delete the just-inserted version, remove blob.
 *     (Head's current_version_id was untouched, so the head's CHECK still
 *     holds.)
 */

import { useEffect, useMemo, useState } from "react";
import { Upload, AlertTriangle, Layers, Loader2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { trackUpload } from "@/lib/track-upload";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./constants";
import { formatBytes } from "./utils";

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

export interface UploadVersionModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful upload so the parent can refresh detail + list. */
  onUploaded: (newVersionId: string) => void;
  /** The document we're adding a version to. */
  doc: {
    id: string;
    school_id: string;
    student_id: string;
    title: string;
    /** Highest existing version_number on the doc; the next upload becomes N+1. */
    latestVersionNumber: number;
  };
  userId: string;
  /** 'school_admin' or 'teacher' — used as uploaded_by_kind on the version row. */
  uploaderKind: "school_admin" | "teacher";
}

export function UploadVersionModal({
  open,
  onClose,
  onUploaded,
  doc,
  userId,
  uploaderKind,
}: UploadVersionModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const nextVersionNumber = doc.latestVersionNumber + 1;

  const [file, setFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setUploadNote("");
    setError(null);
    setFileError(null);
    setSubmitting(false);
  }, [open]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || fileError || submitting) return;

    setSubmitting(true);
    setError(null);

    const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
    const versionId   = crypto.randomUUID();
    const storagePath = `${doc.school_id}/${doc.student_id}/${doc.id}/v${nextVersionNumber}.${ext}`;

    // ── Step 1: upload blob ─────────────────────────────────────────────────
    const upload = await supabase.storage
      .from("child-documents")
      .upload(storagePath, file, {
        contentType: file.type || guessMimeFromExt(ext),
        upsert: false,
      });

    if (upload.error) {
      setError(humanStorageError(upload.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 2: insert version row (no RETURNING) ───────────────────────────
    const versionInsert = await supabase
      .from("child_document_versions")
      .insert({
        id:                  versionId,
        document_id:         doc.id,
        school_id:           doc.school_id,
        version_number:      nextVersionNumber,
        storage_path:        storagePath,
        file_name:           file.name,
        file_size:           file.size,
        mime_type:           file.type || guessMimeFromExt(ext),
        uploaded_by_user_id: userId,
        uploaded_by_kind:    uploaderKind,
        upload_note:         uploadNote.trim() || null,
        is_hidden:           false,
      });

    if (versionInsert.error) {
      await rollbackBlob(supabase, storagePath);
      setError(humanInsertError(versionInsert.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 3: repoint head to the new version ─────────────────────────────
    const repoint = await supabase
      .from("child_documents")
      .update({ current_version_id: versionId })
      .eq("id", doc.id);

    if (repoint.error) {
      await supabase.from("child_document_versions").delete().eq("id", versionId);
      await rollbackBlob(supabase, storagePath);
      setError(humanInsertError(repoint.error.message));
      setSubmitting(false);
      return;
    }

    // ── Step 4: best-effort uploaded_files registration ─────────────────────
    await trackUpload(supabase, {
      schoolId:    doc.school_id,
      uploadedBy:  userId,
      entityType:  "child_document_version",
      entityId:    versionId,
      bucket:      "child-documents",
      storagePath: storagePath,
      fileSize:    file.size,
      mimeType:    file.type || guessMimeFromExt(ext),
    });

    setSubmitting(false);
    onUploaded(versionId);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Upload Version ${nextVersionNumber}`} className="max-w-lg">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
          <Layers className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Adds <strong>v{nextVersionNumber}</strong> to <strong>{doc.title}</strong>.
            The new version becomes the active one; existing grants and consents
            continue to work because they reference the document, not the version.
          </span>
        </div>

        {/* File */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            File <span className="text-red-600">*</span>
          </label>
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
        </div>

        {/* Upload note */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Upload note <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={uploadNote}
            onChange={(e) => setUploadNote(e.target.value)}
            placeholder="What changed in this version?"
            rows={2}
            disabled={submitting}
            maxLength={500}
          />
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!file || !!fileError || submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload v{nextVersionNumber}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────────

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
    console.warn("[upload-version] rollbackBlob failed:", err);
  }
}

function humanInsertError(msg?: string): string {
  if (!msg) return "Couldn't save the new version. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to upload a version to this document.";
  }
  if (/duplicate key.*version_number/i.test(msg) || /unique.*doc_version/i.test(msg)) {
    return "Someone else just uploaded a version. Please refresh and try again.";
  }
  if (/current_version_id/i.test(msg)) {
    return "Couldn't link the new version to the document. Try again.";
  }
  return msg;
}

function humanStorageError(msg?: string): string {
  if (!msg) return "Couldn't upload the file. Please try again.";
  if (/already exists/i.test(msg)) {
    return "A file already exists at that path. Please refresh and try again.";
  }
  if (/payload too large|exceeded the maximum/i.test(msg)) {
    return "File is too large. Maximum 25 MB.";
  }
  if (/mime type|not allowed/i.test(msg)) {
    return "This file type is not allowed. Use PDF, JPEG, PNG, or WebP.";
  }
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to upload to this location.";
  }
  return `Upload failed: ${msg}`;
}
