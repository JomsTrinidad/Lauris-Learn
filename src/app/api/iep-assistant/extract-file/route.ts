/**
 * POST /api/iep-assistant/extract-file
 *
 * Accepts a multipart/form-data upload for Evidence Assistant.
 * Creates a draft child_document for the uploaded file, then runs extraction.
 *
 * Form fields:
 *   plan_id   — UUID of the student_plan
 *   file      — File (PDF, JPEG, PNG, WebP; max 10 MB)
 *
 * Returns the same ExtractResponse shape as /api/iep-assistant/extract,
 * plus an optional low_trust_warning when the source is image/OCR.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromUrl } from "@/features/plans/iep-assistant/extraction-service";
import { checkFileSize } from "@/lib/extraction-guardrails/guardrails";
import type { ExtractResponse } from "@/features/plans/iep-assistant/types";

const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };
const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard limit

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg":      "jpg",
    "image/png":       "png",
    "image/webp":      "webp",
  };
  return map[mime] ?? "bin";
}

export async function POST(req: NextRequest) {
  const serverClient = await createClient();

  // ─── Auth ────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return errorJson("Unauthenticated", 401);
  }

  // ─── Parse multipart ─────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorJson("Expected multipart/form-data", 400);
  }

  const planId = (formData.get("plan_id") as string | null)?.trim();
  const file = formData.get("file") as File | null;

  if (!planId || !isValidUuid(planId)) {
    return errorJson("plan_id (UUID) is required", 400);
  }
  if (!file || file.size === 0) {
    return errorJson("file is required", 400);
  }

  // ─── File type guard ──────────────────────────────────────────────────
  const mimeType = file.type;
  if (!ALLOWED_MIMES.includes(mimeType)) {
    return errorJson(`Unsupported file type: ${mimeType}. Allowed: PDF, JPEG, PNG, WebP.`, 400);
  }

  // ─── File size guardrail ──────────────────────────────────────────────
  const sizeCheck = checkFileSize(file.size);
  if (sizeCheck.status === "hard_limit") {
    return errorJson(sizeCheck.message, 400);
  }
  // Soft-limit: caller may send X-Accept-Extraction-Warning: true to proceed
  if (sizeCheck.status === "soft_limit") {
    const confirmed = req.headers.get("X-Accept-Extraction-Warning") === "true";
    if (!confirmed) {
      return NextResponse.json(
        { error: "soft_limit", message: sizeCheck.message, details: sizeCheck.details },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  // ─── Check plan access ───────────────────────────────────────────────
  const { data: planRowRaw, error: planErr } = await serverClient
    .from("student_plans")
    .select("id, school_id, student_id")
    .eq("id", planId)
    .maybeSingle();

  const planRow = planRowRaw as { id: string; school_id: string; student_id: string } | null;
  if (planErr || !planRow) {
    return errorJson("Plan not found or access denied", 403);
  }

  // ─── Fetch user role (required for version insert RLS) ───────────────
  const { data: profileRaw } = await serverClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const userRole = (profileRaw as { role: string } | null)?.role;
  if (!userRole || !["school_admin", "teacher"].includes(userRole)) {
    return errorJson("Insufficient permissions to upload evidence", 403);
  }
  const uploaderKind = userRole as "school_admin" | "teacher";

  // ─── Upload file to child-documents bucket ───────────────────────────
  const adminClient = createAdminClient();
  const docId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ext = extFromMime(mimeType);
  const storagePath = `${planRow.school_id}/${planRow.student_id}/${docId}/evidence_v1.${ext}`;

  const fileBytes = await file.arrayBuffer();

  const { error: uploadErr } = await adminClient.storage
    .from("child-documents")
    .upload(storagePath, fileBytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadErr) {
    return errorJson("Failed to upload file to storage", 500);
  }

  // ─── Create child_document head ──────────────────────────────────────
  // Title: filename without extension, capped at 120 chars
  const rawName = file.name.replace(/\.[^/.]+$/, "").substring(0, 120) || "Evidence Upload";
  const docTitle = `Evidence: ${rawName}`;

  const { error: docInsertErr } = await (serverClient.from("child_documents") as any).insert({
    id: docId,
    school_id: planRow.school_id,
    student_id: planRow.student_id,
    document_type: "other_supporting",
    title: docTitle,
    status: "draft",
    current_version_id: null,
    created_by: user.id,
  });

  if (docInsertErr) {
    // Best-effort cleanup of the orphan blob
    void adminClient.storage.from("child-documents").remove([storagePath]);
    return errorJson("Failed to create document record", 500);
  }

  // ─── Create version row ──────────────────────────────────────────────
  const { error: verInsertErr } = await (serverClient.from("child_document_versions") as any).insert({
    id: versionId,
    document_id: docId,
    school_id: planRow.school_id,
    version_number: 1,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: file.size,
    file_name: file.name,
    uploaded_by_user_id: user.id,
    uploaded_by_kind: uploaderKind,
    is_hidden: false,
  });

  if (verInsertErr) {
    void adminClient.storage.from("child-documents").remove([storagePath]);
    return errorJson("Failed to create version record", 500);
  }

  // ─── Point head at version ───────────────────────────────────────────
  const { error: headUpdateErr } = await (serverClient.from("child_documents") as any)
    .update({ current_version_id: versionId })
    .eq("id", docId);

  if (headUpdateErr) {
    // Non-fatal: extraction can still proceed with a signed URL
    console.error("Failed to set current_version_id:", headUpdateErr.message);
  }

  // ─── Get signed URL for extraction ───────────────────────────────────
  // 1-hour expiry: OpenAI Responses API fetches the file_url server-side after the
  // request is received, so the URL must remain valid long enough for that round-trip.
  // Do not reduce below 3600 seconds.
  const { data: signedData, error: signErr } = await adminClient.storage
    .from("child-documents")
    .createSignedUrl(storagePath, 3600);

  if (signErr || !signedData?.signedUrl) {
    return errorJson("Failed to generate signed URL for extraction", 500);
  }

  // ─── Extract text ─────────────────────────────────────────────────────
  const extractionResult = await extractFromUrl(signedData.signedUrl, mimeType, file.size);

  // ─── Determine low-trust warning ─────────────────────────────────────
  const isImageSource = mimeType.startsWith("image/");
  const isOcr = extractionResult.extractionMethod === "image_ocr";
  let lowTrustWarning: string | undefined;
  if (isImageSource || isOcr) {
    lowTrustWarning =
      "This evidence was processed from an image via AI vision. Results may be less accurate for " +
      "handwritten documents or low-quality photos. Review suggestions carefully before applying.";
  }

  // ─── Store extraction row ─────────────────────────────────────────────
  const extractionId = crypto.randomUUID();
  await (serverClient.from("iep_report_extractions") as any).insert({
    id: extractionId,
    school_id: planRow.school_id,
    plan_id: planRow.id,
    student_id: planRow.student_id,
    document_id: docId,
    status: extractionResult.status === "done" ? "done" : "not_configured",
    extracted_text: extractionResult.text ?? null,
    extraction_error: extractionResult.message ?? null,
    provider: process.env.IEP_EXTRACTION_PROVIDER ?? "none",
    extraction_method: extractionResult.extractionMethod ?? (isImageSource ? "image_ocr" : "uploaded_file"),
    page_count: extractionResult.pageCount ?? null,
    processed_page_count: extractionResult.processedPageCount ?? null,
    image_count: extractionResult.imageCount ?? (isImageSource ? 1 : null),
    extracted_character_count: extractionResult.extractedCharCount ?? null,
    ai_character_count: extractionResult.aiCharCount ?? null,
    skipped_reason: extractionResult.skippedReason ?? null,
    created_by: user.id,
  });

  // ─── Return response ──────────────────────────────────────────────────
  const response: ExtractResponse = {
    extraction_id: extractionId,
    status: extractionResult.status === "done" ? "done" : "not_configured",
    message: extractionResult.message,
    ...(extractionResult.text ? { extracted_text: extractionResult.text } : {}),
    ...(lowTrustWarning ? { low_trust_warning: lowTrustWarning } : {}),
  };

  return NextResponse.json(response, { status: 200, headers: NO_STORE });
}
