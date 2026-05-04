/**
 * POST /api/care/clinic-documents/[id]/access
 *
 * Phase 6C — Lauris Care portal access route for clinic-INTERNAL
 * documents (clinic-owned children, uploaded by clinic admins).
 * Twin of /api/care/documents/[id]/access (Phase 6A) but routes
 * through the clinic-internal RPC `log_clinic_document_access` and
 * the parallel `clinic-documents` storage bucket.
 *
 * Disclosure-minimisation posture (matches the school-side and 6A
 * routes):
 *   - Internal denial reasons (doc_not_found, not_owned,
 *     no_visible_version, doc_archived) collapse to 404.
 *   - download_not_permitted surfaces as 403 so the UI can hide the
 *     download button.
 *   - unauthenticated → 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ClinicDocAccessAllowed,
  ClinicDocAccessDenied,
} from "@/features/care/types";

const VALID_ACTIONS = ["preview_opened", "download", "signed_url_issued"] as const;
type ClientAction = (typeof VALID_ACTIONS)[number];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE: HeadersInit = { "Cache-Control": "no-store, private" };

interface RpcResult {
  allowed: boolean;
  denied_reason: string | null;
  storage_path: string | null;
  mime_type: string | null;
  current_version_id: string | null;
  version_number: number | null;
  signed_url_ttl_seconds: number;
}

function deniedJson(body: ClinicDocAccessDenied, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function allowedJson(body: ClinicDocAccessAllowed) {
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
    // doc_not_found, not_owned, no_visible_version, doc_archived,
    // view_not_permitted, super_admin_not_supported_here → 404.
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
  const { id: docId } = await params;
  if (!docId || !UUID_REGEX.test(docId)) {
    return deniedJson(
      { error: "bad_request", message: "Invalid document id." },
      400,
    );
  }

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
        message:
          "action must be 'preview_opened', 'download', or 'signed_url_issued'.",
      },
      400,
    );
  }
  const action = rawAction as ClientAction;

  const serverClient = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return deniedJson(
      { error: "unauthenticated", message: "Sign in to access this document." },
      401,
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const userAgent = req.headers.get("user-agent") || "";

  // The clinic-internal RPC honours the requested action verbatim
  // (unlike the 6A school-side org route which collapses to
  // 'signed_url_issued'). For 'download' the RPC additionally
  // validates the permissions.download / clinic_admin override.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcRaw, error: rpcErr } = await (serverClient as any).rpc(
    "log_clinic_document_access",
    {
      p_doc_id: docId,
      p_action: action,
      p_ip: ip,
      p_user_agent: userAgent,
    },
  );

  if (rpcErr) {
    console.error("[care/clinic-access] RPC failed:", rpcErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  const rpc = rpcRaw as unknown as RpcResult;

  if (!rpc.allowed) {
    return mapDenialToResponse(rpc.denied_reason);
  }

  if (
    !rpc.storage_path ||
    !rpc.current_version_id ||
    rpc.version_number === null
  ) {
    console.error(
      "[care/clinic-access] RPC allowed but returned incomplete metadata",
      {
        docId,
        hasPath: !!rpc.storage_path,
        hasVersion: !!rpc.current_version_id,
        versionNumber: rpc.version_number,
      },
    );
    return deniedJson({ error: "server_error" }, 500);
  }

  const admin = createAdminClient();
  const ttl = rpc.signed_url_ttl_seconds || 60;

  const signOptions: { download?: string | boolean } = {};
  if (action === "download") {
    const { data: versionRow } = await admin
      .from("clinic_document_versions" as never)
      .select("file_name")
      .eq("id", rpc.current_version_id)
      .maybeSingle<{ file_name: string | null }>();
    signOptions.download = versionRow?.file_name || true;
  }

  const { data: urlData, error: urlErr } = await admin.storage
    .from("clinic-documents")
    .createSignedUrl(rpc.storage_path, ttl, signOptions);

  if (urlErr || !urlData?.signedUrl) {
    console.error("[care/clinic-access] Signed URL mint failed:", urlErr);
    return deniedJson({ error: "server_error" }, 500);
  }

  return allowedJson({
    url: urlData.signedUrl,
    expires_in: ttl,
    mime_type: rpc.mime_type ?? "",
    version_number: rpc.version_number,
  });
}
