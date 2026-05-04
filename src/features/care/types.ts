/**
 * Phase 6A — Lauris Care portal types.
 *
 * The portal is strictly READ-ONLY. Every shape here mirrors what the
 * underlying RLS / RPC permits a clinic-org member to see:
 *   - ClinicMembership: row from organization_memberships ⨝ organizations
 *   - GrantedChild:     row from child_profile_access_grants ⨝ child_profiles
 *   - ChildIdentifier:  row from child_identifiers (only when the grant
 *                       scope is 'identity_with_identifiers')
 *   - SharedDocument:   row from list_documents_for_organization() RPC,
 *                       which is anchored on document_organization_access_grants
 *                       and resolves child context via SECURITY DEFINER.
 */

import type { Database } from "@/lib/types/database";

export type DocumentAccessAction = "view" | "download" | "preview_opened";

export type GrantScope = "identity_only" | "identity_with_identifiers";
export type GrantStatus = "active" | "revoked" | "expired";

export interface ClinicMembership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationKind: "clinic" | "medical_practice";
  role: string;
}

export type ChildOriginType = "owned" | "shared";

export interface CareChildRow {
  childProfileId: string;
  displayName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  originType: ChildOriginType;
  /** Only set when originType === 'shared' (Phase 6A grant). */
  scope?: GrantScope;
  /** Only set when originType === 'shared'. Owned children have no expiry. */
  grantValidUntil?: string;
}

/** Legacy shape for the Phase 6A shared-only path (still used internally
 *  by listGrantedChildren). New consumers should prefer CareChildRow. */
export interface GrantedChild {
  childProfileId: string;
  displayName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  scope: GrantScope;
  grantValidUntil: string;
}

export interface OwnedChild {
  childProfileId: string;
  displayName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
}

export interface ChildIdentity {
  id: string;
  displayName: string;
  legalName: string | null;
  preferredName: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  sexAtBirth: string | null;
  genderIdentity: string | null;
  primaryLanguage: string | null;
  countryCode: string | null;
}

export interface ChildIdentifier {
  id: string;
  identifierType: string;
  identifierValue: string;
  countryCode: string | null;
}

export interface DocPermissions {
  view: boolean;
  download: boolean;
  comment: boolean;
  upload_new_version: boolean;
}

export interface SharedDocument {
  documentId: string;
  title: string;
  documentType:
    | "iep"
    | "therapy_evaluation"
    | "therapy_progress"
    | "school_accommodation"
    | "medical_certificate"
    | "dev_pediatrician_report"
    | "parent_provided"
    | "other_supporting";
  docStatus: "active" | "shared";
  versionNumber: number;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number | null;
  childProfileId: string | null;
  permissions: DocPermissions;
  grantValidUntil: string;
  grantCreatedAt: string;
}

// API contract for /api/care/documents/[id]/access
export interface CareDocumentAccessRequestBody {
  action: DocumentAccessAction;
}

export interface CareDocumentAccessAllowed {
  url: string;
  expires_in: number;
  mime_type: string;
  version_number: number;
}

export interface CareDocumentAccessDenied {
  error:
    | "unauthenticated"
    | "not_found"
    | "forbidden"
    | "download_not_permitted"
    | "bad_request"
    | "server_error";
  message?: string;
}

/** Phase 6C — clinic-internal documents (uploaded by clinic admins,
 *  scoped to a single clinic-owned child). Strictly separate from
 *  the school-shared `SharedDocument` shape. */
export interface ClinicDocumentPermissions {
  view: boolean;
  download: boolean;
}

export type ClinicDocumentStatus = "draft" | "active" | "archived";

export interface ClinicDocument {
  id: string;
  originOrganizationId: string;
  childProfileId: string;
  documentKind: string;
  title: string;
  description: string | null;
  status: ClinicDocumentStatus;
  permissions: ClinicDocumentPermissions;
  effectiveDate: string | null;
  reviewDate: string | null;
  currentVersionId: string | null;
  versionNumber: number | null;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ClinicDocumentAccessAction =
  | "preview_opened"
  | "download"
  | "signed_url_issued";

export interface ClinicDocAccessAllowed {
  url: string;
  expires_in: number;
  mime_type: string;
  version_number: number;
}

export interface ClinicDocAccessDenied {
  error:
    | "unauthenticated"
    | "not_found"
    | "forbidden"
    | "download_not_permitted"
    | "doc_archived"
    | "no_visible_version"
    | "bad_request"
    | "server_error";
  message?: string;
}

// RPC return shape (from log_document_access_for_organizations)
export type LogDocumentAccessForOrgsResult =
  | {
      allowed: true;
      denied_reason: null;
      storage_path: string;
      mime_type: string;
      current_version_id: string;
      version_number: number;
      signed_url_ttl_seconds: number;
    }
  | {
      allowed: false;
      denied_reason: string;
      storage_path: null;
      mime_type: null;
      current_version_id: null;
      version_number: null;
      signed_url_ttl_seconds: number;
    };

// Helper alias for the typed list_documents_for_organization rows.
export type ListDocsForOrgRow =
  Database["public"]["Functions"]["list_documents_for_organization"]["Returns"][number];
