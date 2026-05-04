/**
 * Phase 6A — Client wrapper around POST /api/care/documents/[id]/access.
 *
 * Mirrors documents-api.ts but routed through the org-pathway RPC
 * (log_document_access_for_organizations) instead of the school-side
 * RPC. The server-side route mints a short-lived signed URL via the
 * service-role client; this wrapper opens it in a new tab and lets it
 * fall out of scope immediately. Never store the URL.
 */

import type {
  CareDocumentAccessAllowed,
  CareDocumentAccessDenied,
  CareDocumentAccessRequestBody,
  DocumentAccessAction,
} from "./types";

export class CareDocumentAccessError extends Error {
  readonly code: CareDocumentAccessDenied["error"];
  readonly status: number;
  constructor(
    code: CareDocumentAccessDenied["error"],
    message: string,
    status: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getCareDocumentAccess(
  docId: string,
  action: DocumentAccessAction,
): Promise<CareDocumentAccessAllowed> {
  let res: Response;
  try {
    res = await fetch(`/api/care/documents/${encodeURIComponent(docId)}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action } satisfies CareDocumentAccessRequestBody),
      cache: "no-store",
    });
  } catch {
    throw new CareDocumentAccessError(
      "server_error",
      "Couldn't reach the server. Check your connection and try again.",
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new CareDocumentAccessError(
      "server_error",
      "Unexpected response from the server.",
      res.status,
    );
  }

  if (!res.ok) {
    const denied = body as Partial<CareDocumentAccessDenied>;
    throw new CareDocumentAccessError(
      denied.error ?? "server_error",
      denied.message ?? defaultMessageForCode(denied.error ?? "server_error"),
      res.status,
    );
  }

  return body as CareDocumentAccessAllowed;
}

export async function openCareDocumentForAccess(
  docId: string,
  action: DocumentAccessAction,
): Promise<void> {
  const result = await getCareDocumentAccess(docId, action);
  window.open(result.url, "_blank", "noopener,noreferrer");
  // result.url goes out of scope here.
}

function defaultMessageForCode(code: CareDocumentAccessDenied["error"]): string {
  switch (code) {
    case "unauthenticated":         return "Sign in to access this document.";
    case "not_found":               return "Document not found.";
    case "forbidden":               return "You don't have access to this document.";
    case "download_not_permitted":  return "Download is not permitted for this document.";
    case "bad_request":             return "Invalid request.";
    case "server_error":
    default:                        return "Something went wrong. Please try again.";
  }
}
