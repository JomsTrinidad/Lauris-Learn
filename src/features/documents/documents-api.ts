/**
 * Client wrapper around POST /api/documents/[id]/access (Phase C route).
 *
 * Security contract:
 *   - The signed URL returned by the API is opened immediately (window.open
 *     with rel=noopener,noreferrer) and goes out of scope at the end of the
 *     call. It is NOT stored in React state, props, query cache, or logs.
 *   - All access — view, download, preview — must go through this wrapper.
 *     There is no client-side path to mint a signed URL for child-documents.
 */

import type {
  DocumentAccessAllowed,
  DocumentAccessDenied,
  DocumentAccessRequestBody,
} from "./types";

export type DocumentAccessAction = DocumentAccessRequestBody["action"];

export class DocumentAccessError extends Error {
  readonly code: DocumentAccessDenied["error"];
  readonly status: number;
  constructor(code: DocumentAccessDenied["error"], message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Calls the access route. On success returns the metadata block including
 * the signed URL. On any non-2xx response throws DocumentAccessError with a
 * sanitized error code (matches the route's error mapping).
 *
 * NOTE: Callers should prefer openDocumentForAccess() unless they specifically
 * need the URL for an inline element. Holding the URL in scope longer than
 * necessary increases leak surface.
 */
export async function getDocumentAccess(
  docId: string,
  action: DocumentAccessAction,
): Promise<DocumentAccessAllowed> {
  let res: Response;
  try {
    res = await fetch(`/api/documents/${encodeURIComponent(docId)}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action } satisfies DocumentAccessRequestBody),
      cache: "no-store",
    });
  } catch {
    throw new DocumentAccessError(
      "server_error",
      "Couldn't reach the server. Check your connection and try again.",
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new DocumentAccessError(
      "server_error",
      "Unexpected response from the server.",
      res.status,
    );
  }

  if (!res.ok) {
    const denied = body as Partial<DocumentAccessDenied>;
    throw new DocumentAccessError(
      denied.error ?? "server_error",
      denied.message ?? defaultMessageForCode(denied.error ?? "server_error"),
      res.status,
    );
  }

  return body as DocumentAccessAllowed;
}

/**
 * Open a document via the access route in a new tab. The signed URL is
 * dereferenced immediately after window.open returns. For 'download' the
 * server already adds Content-Disposition: attachment, so the browser will
 * save instead of render.
 */
export async function openDocumentForAccess(
  docId: string,
  action: DocumentAccessAction,
): Promise<void> {
  const result = await getDocumentAccess(docId, action);
  // 'noopener,noreferrer' keeps the new page from accessing window.opener and
  // strips the referrer (which would otherwise leak the docId in some setups).
  window.open(result.url, "_blank", "noopener,noreferrer");
  // result.url goes out of scope here.
}

function defaultMessageForCode(code: DocumentAccessDenied["error"]): string {
  switch (code) {
    case "unauthenticated":         return "Sign in to access this document.";
    case "not_found":               return "Document not found.";
    case "forbidden":               return "You don't have access to this document.";
    case "download_not_permitted":  return "Download is not permitted for this document.";
    case "bad_request":              return "Invalid request.";
    case "server_error":
    default:                          return "Something went wrong. Please try again.";
  }
}
