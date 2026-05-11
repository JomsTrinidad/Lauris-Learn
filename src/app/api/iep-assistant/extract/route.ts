/**
 * POST /api/iep-assistant/extract
 *
 * Triggers text extraction from a child_document.
 * 1. Auth: verify user is authenticated
 * 2. Validate: check plan_id and document_id UUIDs
 * 3. Check access: verify caller has access to the plan
 * 4. Fetch: get document version to retrieve storage path
 * 5. Extract: call extraction service
 * 6. Store: create/update extraction row with result
 * 7. Return: extraction ID + status + text (if available)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromUrl } from "@/features/plans/iep-assistant/extraction-service";
import { checkFileSize } from "@/lib/extraction-guardrails/guardrails";
import type { ExtractRequest, ExtractResponse } from "@/features/plans/iep-assistant/types";

const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function successJson(body: any) {
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(req: NextRequest) {
  const serverClient = await createClient();

  // ─── Step 1: Auth ────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return errorJson("Unauthenticated", 401);
  }

  // ─── Step 2: Parse + validate input ──────────────────────────────
  let body: ExtractRequest;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid JSON", 400);
  }

  const { plan_id, document_id } = body;
  if (!plan_id || !document_id) {
    return errorJson("plan_id and document_id are required", 400);
  }

  if (!isValidUuid(plan_id) || !isValidUuid(document_id)) {
    return errorJson("Invalid UUID format", 400);
  }

  // ─── Step 3: Check access to plan ────────────────────────────────
  const { data: planRowRaw, error: planErr } = await serverClient
    .from("student_plans")
    .select("id, school_id, student_id")
    .eq("id", plan_id)
    .maybeSingle();

  // Cast needed: Supabase generic inference degrades to `never` for this table in server context
  const planRow = planRowRaw as { id: string; school_id: string; student_id: string } | null;

  if (planErr || !planRow) {
    return errorJson("Plan not found or access denied", 403);
  }

  // ─── Step 4: Fetch document version ──────────────────────────────
  // child_document_versions has no 'current' column — the head pointer lives on child_documents.current_version_id
  const { data: docHeadRaw } = await serverClient
    .from("child_documents")
    .select("current_version_id")
    .eq("id", document_id)
    .maybeSingle();

  const docHead = docHeadRaw as { current_version_id: string | null } | null;
  const currentVersionId = docHead?.current_version_id;

  if (!currentVersionId) {
    return errorJson("Document version not found", 404);
  }

  const { data: docVersionRaw, error: versionErr } = await serverClient
    .from("child_document_versions")
    .select("storage_path, mime_type")
    .eq("id", currentVersionId)
    .maybeSingle();

  const docVersion = docVersionRaw as { storage_path: string | null; mime_type: string | null } | null;

  if (versionErr || !docVersion) {
    return errorJson("Document version not found", 404);
  }

  const storagePath = docVersion.storage_path as string | null;
  const mimeType = docVersion.mime_type as string | null;

  // ─── Step 5: Get signed URL + file size ──────────────────────────
  let signedUrl: string | null = null;
  let fileSizeBytes: number | undefined;

  if (storagePath) {
    const adminClient = createAdminClient();

    // Get file metadata for guardrail checks
    const { data: fileData } = await adminClient.storage
      .from("child-documents")
      .info(storagePath);

    if (fileData?.size) {
      fileSizeBytes = fileData.size;
    }

    const { data, error: signError } = await adminClient.storage
      .from("child-documents")
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (!signError && data?.signedUrl) {
      signedUrl = data.signedUrl;
    }
  }

  // ─── Step 5.5: Check guardrails ─────────────────────────────────
  if (fileSizeBytes !== undefined) {
    const fileSizeCheck = checkFileSize(fileSizeBytes);
    if (fileSizeCheck.status === "hard_limit") {
      return errorJson(fileSizeCheck.message, 400);
    }
    if (fileSizeCheck.status === "soft_limit") {
      // For soft limits, check if user passed confirmation header
      const userConfirmed = req.headers.get("X-Accept-Extraction-Warning") === "true";
      if (!userConfirmed) {
        return NextResponse.json({
          error: "soft_limit",
          message: fileSizeCheck.message,
          details: fileSizeCheck.details,
        }, { status: 400, headers: NO_STORE });
      }
    }
  }

  // ─── Step 6: Call extraction service ─────────────────────────────
  const extractionResult = await extractFromUrl(signedUrl ?? "", mimeType, fileSizeBytes);

  // ─── Step 6: Store extraction row ────────────────────────────────
  const extractionId = crypto.randomUUID();
  const { error: insertErr } = await serverClient
    .from("iep_report_extractions")
    .insert({
      id: extractionId,
      school_id: planRow.school_id,
      plan_id: planRow.id,
      student_id: planRow.student_id,
      document_id,
      status: extractionResult.status === "done" ? "done" : "not_configured",
      extracted_text: extractionResult.text ?? null,
      extraction_error: extractionResult.message ?? null,
      provider: process.env.IEP_EXTRACTION_PROVIDER ?? "none",
      extraction_method: extractionResult.extractionMethod ?? null,
      page_count: extractionResult.pageCount ?? null,
      processed_page_count: extractionResult.processedPageCount ?? null,
      image_count: extractionResult.imageCount ?? null,
      extracted_character_count: extractionResult.extractedCharCount ?? null,
      ai_character_count: extractionResult.aiCharCount ?? null,
      skipped_reason: extractionResult.skippedReason ?? null,
      created_by: user.id,
    } as any);

  if (insertErr) {
    return errorJson("Failed to store extraction", 500);
  }

  // ─── Step 7: Return response ─────────────────────────────────────
  const response: ExtractResponse = {
    extraction_id: extractionId,
    status: extractionResult.status === "done" ? "done" : "not_configured",
    message: extractionResult.message,
  };

  if (extractionResult.text) {
    response.extracted_text = extractionResult.text;
  }

  return successJson(response);
}
