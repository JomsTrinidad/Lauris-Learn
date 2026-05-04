/**
 * POST /api/care/documents/[id]/access
 *
 * Phase 6A — Lauris Care portal access route. Mirrors
 * /api/documents/[id]/access (Phase C) but routes through the
 * org-pathway RPC `log_document_access_for_organizations` instead of
 * the school-side `log_document_access`. The route is otherwise
 * identical in shape:
 *   1. Authenticates the caller via cookie session.
 *   2. Validates body action.
 *   3. Calls the SECURITY DEFINER RPC under the user's session so
 *      auth.uid() resolves and the audit row carries the right actor.
 *   4. If allowed, mints a 60-second signed URL with the SERVICE ROLE
 *      client (the child-documents bucket has no client SELECT).
 *
 * Disclosure-minimisation posture:
 *   Internal denial reasons collapse to 404 to avoid leaking
 *   document existence; download_not_permitted surfaces as 403 so the
 *   UI can hide the download button.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";
import type {
  CareDocumentAccessAllowed,
  CareDocumentAccessDenied,
  LogDocumentAccessForOrgsResult,
} from "@/features/care/types";

type LogAccessArgs =
  Database["public"]["Functions"]["log_document_access_for_organizations"]["Args"];

const VALID_ACTIONS = ["view", "download", "preview_opened"] as const;
type ClientAction = (typeof VALID_ACTIONS)[number];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };

function deniedJson(body: CareDocumentAccessDenied, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function allowedJson(body: CareDocumentAccessAllowed) {
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

function mapDenialToResponse(reason: string | null): NextResponse {
  switch (reason) {
    case "unauthenticated":
      return deniedJson(
        { error: "unauthenticated", message: "Sign in to access this document." },
        401,
      );
    case "download_not_permitted":
      return deniedJson(
        {
          error: "download_not_permitted",
          message:
            "Download is not permitted for this document. You can still view it.",
        },
        403,
      );
    // not_authorized, doc_not_found, doc_revoked, no_visible_version,
    // org_grant_not_found, org_grant_revoked, org_grant_expired
    // → all 404 (don't reveal existence)
    default:
      return deniedJson(
        { error: "not_found", message: "Document not found." },
        404,
      );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Validate URL param
  const { id: docId } = await params;
  if (!docId || !UUID_REGEX.test(docId)) {
    return deniedJson(
      { error: "bad_request", message: "Invalid document id." },
      400,
    );
  }

  // 2. Validate body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return deniedJson(
      { error: "bad_request", message: "Body must be valid JSON." },
      400,
    );
  }

  const rawAction = typeof body.action === "string" ? body.action : "";
  if (!VALID_ACTIONS.includes(rawAction as ClientAction)) {
    return deniedJson(
      {
        error: "bad_request",
        message: "action must be 'view', 'download', or 'preview_opened'.",
      },
      400,
    );
  }
  const action = rawAction as ClientAction;

  // 3. Authentication
  const serverClient = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return deniedJson(
      {
        error: "unauthenticated",
        message: "Sign in to access this document.",
      },
      401,
    );
  }

  // 4. Audit context (never trusted from body)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const userAgent = req.headers.get("user-agent") || "";

  // 5. Call the org-pathway RPC under the user's session.
  // v1 always logs as 'signed_url_issued' regardless of client intent.
  const rpcArgs: LogAccessArgs = {
    p_doc_id: docId,
    p_action: "signed_url_issued",
    p_ip: ip,
    p_user_agent: userAgent,
  };

  // The Database['public'] type doesn't satisfy Supabase's GenericSchema
  // constraint in this codebase — same workaround as the school-side
  // route at src/app/api/documents/[id]/access/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcRaw, error: rpcErr } = await (serverClient as any).rpc(
    "log_document_access_for_organizations",
    rpcArgs,
  );

  if (rpcErr) {
    console.error("[care/access] RPC failed:", rpcErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  const rpc = rpcRaw as unknown as LogDocumentAccessForOrgsResult;

  // 6. Denied path
  if (!rpc.allowed) {
    return mapDenialToResponse(rpc.denied_reason);
  }

  // 7. Sanity check on metadata
  if (
    !rpc.storage_path ||
    !rpc.current_version_id ||
    rpc.version_number === null
  ) {
    console.error(
      "[care/access] RPC allowed but returned incomplete metadata",
      {
        docId,
        hasPath: !!rpc.storage_path,
        hasVersion: !!rpc.current_version_id,
        versionNumber: rpc.version_number,
      },
    );
    return deniedJson({ error: "server_error" }, 500);
  }

  // 8. Mint signed URL with service-role
  const admin = createAdminClient();
  const ttl = rpc.signed_url_ttl_seconds || 60;

  const signOptions: { download?: string | boolean } = {};
  if (action === "download") {
    const { data: versionRow } = await admin
      .from("child_document_versions")
      .select("file_name")
      .eq("id", rpc.current_version_id)
      .maybeSingle<{ file_name: string | null }>();
    signOptions.download = versionRow?.file_name || true;
  }

  const { data: urlData, error: urlErr } = await admin.storage
    .from("child-documents")
    .createSignedUrl(rpc.storage_path, ttl, signOptions);

  if (urlErr || !urlData?.signedUrl) {
    console.error("[care/access] Signed URL mint failed:", urlErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  return allowedJson({
    url: urlData.signedUrl,
    expires_in: ttl,
    mime_type: rpc.mime_type,
    version_number: rpc.version_number,
  });
}
