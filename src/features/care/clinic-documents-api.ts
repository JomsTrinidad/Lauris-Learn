/**
 * Phase 6C — clinic-internal documents API.
 *
 * Twin of care-documents-api.ts but routed through the clinic-internal
 * RPC (log_clinic_document_access) and the parallel `clinic-documents`
 * storage bucket. Strictly isolated from school-shared documents.
 *
 * Upload follows the same 5-step transactional pattern as the school
 * side's UploadDocumentModal (D7), with client-side UUIDs to avoid
 * the INSERT...RETURNING / SELECT-policy interaction documented there.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ClinicDocument,
  ClinicDocumentPermissions,
  ClinicDocumentStatus,
  ClinicDocAccessAllowed,
  ClinicDocAccessDenied,
  ClinicDocumentAccessAction,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const BUCKET = "clinic-documents";
const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const DEFAULT_PERMISSIONS: ClinicDocumentPermissions = {
  view: true,
  download: false,
};

// ── Read paths ──────────────────────────────────────────────────────────

export async function listClinicDocumentsForChild(
  childProfileId: string,
): Promise<ClinicDocument[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("clinic_documents")
    .select(
      `id, origin_organization_id, child_profile_id, document_kind, title,
       description, status, permissions, effective_date, review_date,
       current_version_id, created_at, updated_at,
       clinic_document_versions:current_version_id (
         version_number, mime_type, file_name, file_size
       )`,
    )
    .eq("child_profile_id", childProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[care] listClinicDocumentsForChild:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map<ClinicDocument>((row) => ({
    id: row.id,
    originOrganizationId: row.origin_organization_id,
    childProfileId: row.child_profile_id,
    documentKind: row.document_kind,
    title: row.title,
    description: row.description ?? null,
    status: row.status as ClinicDocumentStatus,
    permissions: normalizePermissions(row.permissions),
    effectiveDate: row.effective_date ?? null,
    reviewDate: row.review_date ?? null,
    currentVersionId: row.current_version_id ?? null,
    versionNumber: row.clinic_document_versions?.version_number ?? null,
    mimeType: row.clinic_document_versions?.mime_type ?? null,
    fileName: row.clinic_document_versions?.file_name ?? null,
    fileSize: row.clinic_document_versions?.file_size ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ── Upload path (transactional with rollback) ──────────────────────────

export interface CreateClinicDocumentInput {
  originOrganizationId: string;
  childProfileId: string;
  uploaderProfileId: string;
  documentKind: string;
  title: string;
  description?: string | null;
  /** Defaults to { view: true, download: false }. */
  permissions?: ClinicDocumentPermissions;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  /** Defaults to 'draft'. */
  initialStatus?: ClinicDocumentStatus;
  file: File;
}

export interface CreateClinicDocumentResult {
  documentId: string;
}

export async function createClinicDocument(
  input: CreateClinicDocumentInput,
): Promise<CreateClinicDocumentResult | { error: string }> {
  const supabase = createClient() as AnyClient;

  // Pre-flight validation.
  if (!ACCEPTED_MIME.includes(input.file.type)) {
    return { error: "Unsupported file type. Use PDF, JPEG, PNG, or WebP." };
  }
  if (input.file.size > MAX_FILE_BYTES) {
    return { error: "File is too large. Maximum is 25 MB." };
  }
  if (!input.title.trim()) {
    return { error: "Title is required." };
  }
  if (!input.documentKind.trim()) {
    return { error: "Document kind is required." };
  }

  // Step 1: client-side UUIDs.
  const docId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ext = extensionFor(input.file);
  const storagePath =
    `${input.originOrganizationId}/${input.childProfileId}/${docId}/v1${ext}`;

  // Step 2: blob upload.
  const uploaded = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploaded.error) {
    console.error("[care] createClinicDocument upload:", uploaded.error);
    return { error: uploaded.error.message };
  }

  // Step 3: head INSERT (no RETURNING — same workaround as D7).
  const { error: headErr } = await supabase.from("clinic_documents").insert({
    id: docId,
    origin_organization_id: input.originOrganizationId,
    child_profile_id: input.childProfileId,
    document_kind: input.documentKind,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: input.initialStatus ?? "draft",
    permissions: input.permissions ?? DEFAULT_PERMISSIONS,
    effective_date: input.effectiveDate || null,
    review_date: input.reviewDate || null,
    created_by_profile_id: input.uploaderProfileId,
  });
  if (headErr) {
    console.error("[care] createClinicDocument head insert:", headErr);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: headErr.message };
  }

  // Step 4: version INSERT.
  const { error: verErr } = await supabase
    .from("clinic_document_versions")
    .insert({
      id: versionId,
      document_id: docId,
      version_number: 1,
      storage_path: storagePath,
      mime_type: input.file.type,
      file_name: input.file.name,
      file_size: input.file.size,
      uploaded_by_profile_id: input.uploaderProfileId,
    });
  if (verErr) {
    console.error("[care] createClinicDocument version insert:", verErr);
    // Best-effort rollback. The head DELETE will fail under RLS (no
    // DELETE policy) — accept that and clean the blob.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: verErr.message };
  }

  // Step 5: repoint head's current_version_id (and flip to 'active'
  // automatically since the doc has a usable version).
  const { error: repointErr } = await supabase
    .from("clinic_documents")
    .update({
      current_version_id: versionId,
      status: input.initialStatus ?? "active",
    })
    .eq("id", docId);
  if (repointErr) {
    console.error("[care] createClinicDocument repoint:", repointErr);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: repointErr.message };
  }

  return { documentId: docId };
}

// ── Lifecycle ──────────────────────────────────────────────────────────

export async function setClinicDocumentStatus(
  documentId: string,
  next: ClinicDocumentStatus,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase
    .from("clinic_documents")
    .update({ status: next })
    .eq("id", documentId);
  if (error) {
    console.error("[care] setClinicDocumentStatus:", error);
    return { error: error.message };
  }
  return { ok: true };
}

export async function setClinicDocumentDownload(
  documentId: string,
  allowDownload: boolean,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase
    .from("clinic_documents")
    .update({
      permissions: { view: true, download: allowDownload },
    })
    .eq("id", documentId);
  if (error) {
    console.error("[care] setClinicDocumentDownload:", error);
    return { error: error.message };
  }
  return { ok: true };
}

// ── Access route wrapper ───────────────────────────────────────────────

export class ClinicDocAccessError extends Error {
  readonly code: ClinicDocAccessDenied["error"];
  readonly status: number;
  constructor(
    code: ClinicDocAccessDenied["error"],
    message: string,
    status: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getClinicDocumentAccess(
  docId: string,
  action: ClinicDocumentAccessAction,
): Promise<ClinicDocAccessAllowed> {
  let res: Response;
  try {
    res = await fetch(
      `/api/care/clinic-documents/${encodeURIComponent(docId)}/access`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
      },
    );
  } catch {
    throw new ClinicDocAccessError(
      "server_error",
      "Couldn't reach the server. Check your connection and try again.",
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ClinicDocAccessError(
      "server_error",
      "Unexpected response from the server.",
      res.status,
    );
  }

  if (!res.ok) {
    const denied = body as Partial<ClinicDocAccessDenied>;
    throw new ClinicDocAccessError(
      denied.error ?? "server_error",
      denied.message ?? defaultMessageForCode(denied.error ?? "server_error"),
      res.status,
    );
  }

  return body as ClinicDocAccessAllowed;
}

export async function openClinicDocumentForAccess(
  docId: string,
  action: ClinicDocumentAccessAction,
): Promise<void> {
  const result = await getClinicDocumentAccess(docId, action);
  window.open(result.url, "_blank", "noopener,noreferrer");
  // Signed URL goes out of scope here.
}

function defaultMessageForCode(
  code: ClinicDocAccessDenied["error"],
): string {
  switch (code) {
    case "unauthenticated":         return "Sign in to access this document.";
    case "not_found":               return "Document not found.";
    case "forbidden":               return "You don't have access to this document.";
    case "download_not_permitted":  return "Download is not permitted for this document.";
    case "doc_archived":            return "This document is archived.";
    case "no_visible_version":      return "No visible version on this document.";
    case "bad_request":             return "Invalid request.";
    case "server_error":
    default:                        return "Something went wrong. Please try again.";
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizePermissions(raw: unknown): ClinicDocumentPermissions {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    view: p.view !== false,
    download: p.download === true,
  };
}

function extensionFor(file: File): string {
  switch (file.type) {
    case "application/pdf":  return ".pdf";
    case "image/jpeg":       return ".jpg";
    case "image/png":        return ".png";
    case "image/webp":       return ".webp";
    default:                 return "";
  }
}
