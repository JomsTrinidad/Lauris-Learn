/**
 * Feature-level types for the Document Coordination system.
 *
 * Wraps:
 *   - JSONB columns on document_consents (scope, recipients) and
 *     document_access_grants (permissions) with strict shapes.
 *   - The API contract for /api/documents/[id]/access.
 *   - The internal RPC return shape (not exposed to clients).
 *
 * Database Row/Insert/Update types live in src/lib/types/database.ts.
 * Use the wrappers below at the read boundary, e.g.:
 *
 *   const consent = data as DocumentConsentRow;
 *   const scope   = consent.scope as ConsentScope;
 *
 * The strict types DO NOT validate data at runtime — only narrow the static
 * type. Trust the Phase A trigger 5.F (document_consents_validate_jsonb) to
 * enforce shape on writes.
 */

import type { Database } from "@/lib/types/database";

// ─── Document enums (mirrored from migration 054) ──────────────────────────
export type DocumentType =
  | "iep"
  | "therapy_evaluation"
  | "therapy_progress"
  | "school_accommodation"
  | "medical_certificate"
  | "dev_pediatrician_report"
  | "parent_provided"
  | "other_supporting";

export type DocumentStatus =
  | "draft"
  | "active"
  | "shared"
  | "archived"
  | "revoked";

export type ConsentStatus =
  | "pending"
  | "granted"
  | "revoked"
  | "expired";

export type RequestStatus =
  | "requested"
  | "submitted"
  | "reviewed"
  | "cancelled";


// ─── Discriminator strings (TEXT + CHECK in the DB) ─────────────────────────
export type SourceKind        = "school" | "external_contact" | "parent";
export type GranteeKind       = "school" | "school_user" | "external_contact";
export type RequestedFromKind = "parent" | "school" | "external_contact";
export type UploaderKind      = "school_admin" | "teacher" | "parent" | "external_contact";
export type ActorKind         = "school_admin" | "teacher" | "parent" | "external_contact" | "super_admin" | "unauthenticated";


// ─── JSONB shapes ───────────────────────────────────────────────────────────

/** document_consents.scope */
export type ConsentScope =
  | { type: "document";          document_id: string }
  | { type: "document_type";     document_type: DocumentType }
  | { type: "all_for_student" };

/** document_consents.recipients (array element). email is optional metadata. */
export type ConsentRecipient =
  | { type: "school";            school_id: string }
  | { type: "school_user";       school_id: string; user_id: string }
  | { type: "external_contact";  external_contact_id: string; email?: string };

/** document_access_grants.permissions */
export interface GrantPermissions {
  view: boolean;
  download: boolean;
  comment: boolean;
  upload_new_version: boolean;
}


// ─── Convenience aliases for Row types ─────────────────────────────────────
type Tables = Database["public"]["Tables"];

export type ChildDocumentRow            = Tables["child_documents"]["Row"];
export type ChildDocumentVersionRow     = Tables["child_document_versions"]["Row"];
export type ExternalContactRow          = Tables["external_contacts"]["Row"];
export type DocumentConsentRow          = Tables["document_consents"]["Row"];
export type DocumentAccessGrantRow      = Tables["document_access_grants"]["Row"];
export type DocumentRequestRow          = Tables["document_requests"]["Row"];
export type DocumentAccessEventRow      = Tables["document_access_events"]["Row"];


// ─── /api/documents/[id]/access — HTTP contract ────────────────────────────

/** What the browser POSTs. Validated by the route. */
export interface DocumentAccessRequestBody {
  action: "view" | "download" | "preview_opened";
}

/** Response when access was granted. */
export interface DocumentAccessAllowed {
  url:            string;
  expires_in:     number;        // seconds; v1 = 60
  mime_type:      string | null;
  version_number: number;
}

/** Response when access was denied or the request was malformed.
 *  `error` is a sanitized code; `message` is safe to display to the user. */
export interface DocumentAccessDenied {
  error:
    | "bad_request"
    | "unauthenticated"
    | "not_found"
    | "forbidden"
    | "download_not_permitted"
    | "server_error";
  message?: string;
}

export type DocumentAccessResponse = DocumentAccessAllowed | DocumentAccessDenied;


// ─── Internal — RPC return shape (NOT exposed to clients) ──────────────────
/** What log_document_access returns. The route consumes this and decides
 *  what (if anything) to forward to the client. Never serialize as-is. */
export interface LogDocumentAccessResult {
  allowed:                boolean;
  denied_reason:          string | null;
  storage_path:           string | null;
  mime_type:              string | null;
  current_version_id:     string | null;
  version_number:         number | null;
  signed_url_ttl_seconds: number;
}
