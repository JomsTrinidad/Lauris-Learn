/**
 * POST /api/iep-assistant/summarize
 *
 * Generates AI summary from extracted text and maps to IEP suggestions.
 * 1. Auth: verify user is authenticated
 * 2. Fetch extraction: get extraction row and verify access
 * 3. Validate: check extraction status is 'done'
 * 4. Summarize: call AI summary service
 * 5. Map: call deterministic mapping to IEP suggestions
 * 6. Store: create summary + suggestion rows
 * 7. Return: summary + suggestions array
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeExtraction,
  mapToIepSuggestions,
} from "@/features/plans/iep-assistant/summary-service";
import { getExtractionConfig } from "@/lib/extraction-guardrails/config";
import type {
  SummarizeRequest,
  SummarizeResponse,
} from "@/features/plans/iep-assistant/types";

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
  let body: SummarizeRequest;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid JSON", 400);
  }

  const { extraction_id } = body;
  if (!extraction_id || !isValidUuid(extraction_id)) {
    return errorJson("extraction_id (UUID) is required", 400);
  }

  // ─── Step 3: Fetch extraction row ────────────────────────────────
  const { data: extractionRaw, error: extractErr } = await serverClient
    .from("iep_report_extractions")
    .select("id, plan_id, student_id, school_id, document_id, status, extracted_text")
    .eq("id", extraction_id)
    .maybeSingle();

  // Cast needed: Supabase generic inference degrades to `never` for this table in server context
  const extraction = extractionRaw as {
    id: string;
    plan_id: string;
    student_id: string;
    school_id: string;
    document_id: string;
    status: string;
    extracted_text: string | null;
  } | null;

  if (extractErr || !extraction) {
    return errorJson("Extraction not found", 404);
  }

  // Verify extraction is done (has extracted text)
  if (extraction.status !== "done" || !extraction.extracted_text) {
    return errorJson(
      "Extraction must be completed before summarizing (status: done, text present)",
      400,
    );
  }

  // ─── Step 3.5: Daily rate-limit checks ───────────────────────────
  // Use adminClient so counts are accurate across all school users, not just
  // the caller's RLS-visible subset.
  const adminClient = createAdminClient();
  const config = getExtractionConfig();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const todayStartIso = todayStart.toISOString();
  const todayEndIso = todayEnd.toISOString();

  // Per-plan daily limit (plan maps 1:1 to a student's current IEP)
  const { count: planCount } = await adminClient
    .from("iep_report_summaries")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", extraction.plan_id)
    .eq("status", "done")
    .gte("created_at", todayStartIso)
    .lte("created_at", todayEndIso);

  if ((planCount ?? 0) >= config.maxAiSummariesPerChildPerDay) {
    return NextResponse.json(
      { error: `Daily AI summary limit reached for this plan (${config.maxAiSummariesPerChildPerDay}/day). Try again tomorrow.` },
      { status: 429, headers: NO_STORE },
    );
  }

  // Per-org daily limit
  const { count: orgCount } = await adminClient
    .from("iep_report_summaries")
    .select("id", { count: "exact", head: true })
    .eq("school_id", extraction.school_id)
    .eq("status", "done")
    .gte("created_at", todayStartIso)
    .lte("created_at", todayEndIso);

  if ((orgCount ?? 0) >= config.maxAiSummariesPerOrgPerDay) {
    return NextResponse.json(
      { error: `Daily AI summary limit reached for this organization (${config.maxAiSummariesPerOrgPerDay}/day). Try again tomorrow.` },
      { status: 429, headers: NO_STORE },
    );
  }

  // ─── Step 4: Call summarization service ──────────────────────────
  const summaryResult = await summarizeExtraction(extraction.extracted_text);

  // ─── Step 5: Create summary row ──────────────────────────────────
  const summaryId = crypto.randomUUID();
  const { error: summaryErr } = await serverClient
    .from("iep_report_summaries")
    .insert({
      id: summaryId,
      extraction_id: extraction.id,
      plan_id: extraction.plan_id,
      school_id: extraction.school_id,
      status: summaryResult.status === "done" ? "done" : "not_configured",
      therapy_focus: summaryResult.sections?.therapy_focus ?? null,
      strengths: summaryResult.sections?.strengths ?? null,
      areas_of_need: summaryResult.sections?.areas_of_need ?? null,
      progress_since_last: summaryResult.sections?.progress_since_last ?? null,
      recommended_supports: summaryResult.sections?.recommended_supports ?? null,
      suggested_goals: summaryResult.sections?.suggested_goals ?? null,
      followup_notes: summaryResult.sections?.followup_notes ?? null,
      summary_error: summaryResult.message ?? null,
      provider: process.env.IEP_AI_PROVIDER ?? "none",
      created_by: user.id,
    } as any);

  if (summaryErr) {
    return errorJson("Failed to store summary", 500);
  }

  // ─── Step 6: Map suggestions ─────────────────────────────────────
  let suggestions = [];
  if (summaryResult.status === "done" && summaryResult.sections) {
    const suggestionInserts = mapToIepSuggestions(
      summaryResult.sections,
      extraction.document_id,
    );

    // Insert suggestions
    if (suggestionInserts.length > 0) {
      const { error: suggErr } = await serverClient
        .from("iep_ai_suggestions")
        .insert(
          suggestionInserts.map((s) => ({
            id: crypto.randomUUID(),
            summary_id: summaryId,
            plan_id: extraction.plan_id,
            school_id: extraction.school_id,
            source_document_id: extraction.document_id,
            target_section: s.target_section,
            target_field: s.target_field,
            suggested_text: s.suggested_text,
            source_excerpt: s.source_excerpt,
            confidence_label: s.confidence_label,
            status: "pending",
            applied_text: null,
            reviewed_by: null,
            reviewed_at: null,
          })) as any,
        );

      if (suggErr) {
        console.error("Failed to insert suggestions:", suggErr);
        // Non-fatal: continue to return summary even if suggestions failed
      }
    }

    // Fetch inserted suggestions to return
    const { data: suggData } = await serverClient
      .from("iep_ai_suggestions")
      .select("*")
      .eq("summary_id", summaryId);

    suggestions = (suggData || []) as any[];
  }

  // ─── Step 7: Return response ─────────────────────────────────────
  const response: SummarizeResponse = {
    summary_id: summaryId,
    status: summaryResult.status === "done" ? "done" : "not_configured",
    message: summaryResult.message,
  };

  if (summaryResult.sections) {
    response.summary = summaryResult.sections;
  }

  if (suggestions.length > 0) {
    response.suggestions = suggestions;
  }

  return successJson(response);
}
