/**
 * POST /api/documents/[id]/access
 *
 * The single server-side choke point for child-document access. This route:
 *   1. Authenticates the caller (cookie session).
 *   2. Validates the body action.
 *   3. Calls the SECURITY DEFINER RPC log_document_access UNDER THE USER'S
 *      SESSION so auth.uid() inside Postgres resolves to the caller. The RPC
 *      makes the access decision AND writes the document_access_events row
 *      atomically (whether the answer is allow or deny).
 *   4. If allowed, mints a 60-second signed URL with the SERVICE ROLE client.
 *
 * Why two clients:
 *   - User-session client is required for the RPC, otherwise auth.uid() is NULL
 *     and every actor would log as 'unauthenticated'.
 *   - Service-role client is required to mint the signed URL because the
 *     `child-documents` bucket has NO client SELECT policy by design (storage
 *     RLS only allows service role to read). This is the choke point that
 *     satisfies "signed URLs only via the RPC path".
 *
 * Audit:
 *   Every accepted request writes one document_access_events row with
 *   action='signed_url_issued' (v1 collapses view/download/preview into one
 *   audit action). Every denied request writes action='access_denied' with
 *   the full reason. Unauthenticated requests are short-circuited at the
 *   route layer and do NOT hit the RPC.
 *
 * Response posture:
 *   Internal denial reasons (e.g. parent_not_visible_state, no_active_grant)
 *   collapse to HTTP 404 to avoid leaking document existence. The exception
 *   is download_not_permitted which surfaces as 403 so the UI can hide the
 *   download button without re-querying.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";
import type {
  DocumentAccessAllowed,
  DocumentAccessDenied,
  LogDocumentAccessResult,
} from "@/features/documents/types";

type LogAccessArgs =
  Database["public"]["Functions"]["log_document_access"]["Args"];

const VALID_ACTIONS = ["view", "download", "preview_opened"] as const;
type ClientAction = (typeof VALID_ACTIONS)[number];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Standard headers for every response from this route.
const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };

function deniedJson(body: DocumentAccessDenied, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function allowedJson(body: DocumentAccessAllowed) {
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

/**
 * Map the RPC's denial reason to a sanitized client response.
 * "Don't reveal existence" reasons collapse to 404; download_not_permitted
 * is the only 403 because the doc IS visible (just not downloadable).
 */
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
    case "unknown_actor":
      return deniedJson({ error: "server_error" }, 500);
    // document_not_found, no_visible_version, not_in_school,
    // teacher_class_scope, parent_not_visible_state, no_path,
    // no_active_grant, super_admin_blocked → all 404
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
  // ── 1. Validate URL param ──────────────────────────────────────────────────
  const { id: docId } = await params;
  if (!docId || !UUID_REGEX.test(docId)) {
    return deniedJson(
      { error: "bad_request", message: "Invalid document id." },
      400,
    );
  }

  // ── 2. Validate body ───────────────────────────────────────────────────────
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

  // ── 3. Authentication: short-circuit before any DB call ────────────────────
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

  // ── 4. Capture audit context from headers (never trusted from body) ────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const userAgent = req.headers.get("user-agent") || "";

  // ── 5. Call the RPC under the caller's session ─────────────────────────────
  // v1 always logs as 'signed_url_issued' regardless of the client's intent.
  // The RPC writes the audit row whether the decision is allow or deny.
  const rpcArgs: LogAccessArgs = {
    p_doc_id: docId,
    p_action: "signed_url_issued",
    p_ip: ip,
    p_user_agent: userAgent,
  };
  // The Database['public'] type in this project doesn't satisfy Supabase's
  // GenericSchema constraint (Views: Record<string, never> doesn't match
  // Record<string, GenericView>), so the Schema generic on .rpc falls back to
  // `any` and the Args param resolves to `never`. The runtime call is correct;
  // narrow the cast to bypass the static-type quirk. Same pragma used in
  // students/enroll/route.ts for .from() calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcRaw, error: rpcErr } = await (serverClient as any).rpc(
    "log_document_access",
    rpcArgs,
  );

  if (rpcErr) {
    console.error("[documents/access] RPC failed:", rpcErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  const rpc = rpcRaw as unknown as LogDocumentAccessResult;

  // ── 6. Denied path ─────────────────────────────────────────────────────────
  if (!rpc.allowed) {
    return mapDenialToResponse(rpc.denied_reason);
  }

  // ── 7. Defensive: allowed but missing metadata is a server bug ─────────────
  if (!rpc.storage_path || !rpc.current_version_id || rpc.version_number === null) {
    console.error(
      "[documents/access] RPC allowed but returned incomplete metadata",
      {
        docId,
        hasPath: !!rpc.storage_path,
        hasVersion: !!rpc.current_version_id,
        versionNumber: rpc.version_number,
      },
    );
    return deniedJson({ error: "server_error" }, 500);
  }

  // ── 8. Mint signed URL with service role ───────────────────────────────────
  const admin = createAdminClient();
  const ttl = rpc.signed_url_ttl_seconds || 60;

  // For 'download' action: force Content-Disposition: attachment with the
  // original file_name. We need the file name and Postgres didn't return it,
  // so do a single admin lookup (RLS-bypass — we already passed the access
  // check). Fall back to `true` (generic attachment) if file_name is unset.
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
    // The RPC already wrote a 'signed_url_issued' event. The URL just couldn't
    // be minted — surface as 500 and rely on server logs for diagnosis. The
    // phantom audit row is acceptable in v1 (no rollback path on the RPC).
    console.error("[documents/access] Signed URL mint failed:", urlErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  return allowedJson({
    url:            urlData.signedUrl,
    expires_in:     ttl,
    mime_type:      rpc.mime_type,
    version_number: rpc.version_number,
  });
}
