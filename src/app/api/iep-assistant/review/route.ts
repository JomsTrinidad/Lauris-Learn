/**
 * POST /api/iep-assistant/review
 *
 * Marks a suggestion as applied, rejected, or edited.
 * 1. Auth: verify user is authenticated
 * 2. Fetch suggestion: get suggestion row and verify access
 * 3. Validate: check action is valid ('apply' | 'reject' | 'edit')
 * 4. Update: set status, applied_text (if edited), reviewed_by, reviewed_at
 * 5. Return: ok response
 *
 * Note: This API only updates the suggestion audit trail.
 * The actual IEP plan fields are updated via React state setters in the modal.
 * The final IEP save goes through the existing savePlan() flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type {
  ReviewRequest,
  ReviewResponse,
} from "@/features/plans/iep-assistant/types";

const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function successJson(body: ReviewResponse) {
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const VALID_ACTIONS = ["apply", "reject", "edit"];

export async function POST(req: NextRequest) {
  const serverClient = await createServerClient();

  // ─── Step 1: Auth ────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return errorJson("Unauthenticated", 401);
  }

  // ─── Step 2: Parse + validate input ──────────────────────────────
  let body: ReviewRequest;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid JSON", 400);
  }

  const { suggestion_id, action, applied_text } = body;

  if (!suggestion_id || !isValidUuid(suggestion_id)) {
    return errorJson("suggestion_id (UUID) is required", 400);
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return errorJson("action must be 'apply', 'reject', or 'edit'", 400);
  }

  if (action === "edit" && !applied_text?.trim()) {
    return errorJson("applied_text is required when action is 'edit'", 400);
  }

  // ─── Step 3: Fetch suggestion row ────────────────────────────────
  const { data: suggestion, error: suggErr } = await serverClient
    .from("iep_ai_suggestions")
    .select("id, plan_id, status")
    .eq("id", suggestion_id)
    .maybeSingle();

  if (suggErr || !suggestion) {
    return errorJson("Suggestion not found or access denied", 404);
  }

  // Don't allow re-reviewing already applied suggestions
  if (suggestion.status !== "pending") {
    return errorJson(
      `Suggestion already reviewed (status: ${suggestion.status})`,
      400,
    );
  }

  // ─── Step 4: Update suggestion ───────────────────────────────────
  const newStatus = action === "reject" ? "rejected" : "applied";
  const updatePayload: Record<string, any> = {
    status: newStatus,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  if (action === "edit" && applied_text) {
    updatePayload.applied_text = applied_text.trim();
  }

  const { error: updateErr } = await serverClient
    .from("iep_ai_suggestions")
    .update(updatePayload)
    .eq("id", suggestion_id);

  if (updateErr) {
    return errorJson("Failed to update suggestion", 500);
  }

  // ─── Step 5: Return response ─────────────────────────────────────
  const response: ReviewResponse = {
    ok: true,
    message: `Suggestion marked as ${newStatus}`,
  };

  return successJson(response);
}
