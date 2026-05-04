/**
 * Phase 6D — school-side clinic-sharing types.
 *
 * The school admin issues two distinct kinds of grants to a clinic /
 * medical_practice organization:
 *
 *   - IDENTITY  — child_profile_access_grants
 *                 scope ∈ ('identity_only' | 'identity_with_identifiers')
 *
 *   - DOCUMENT  — document_organization_access_grants
 *                 per-document scope, immutable permissions JSONB
 *
 * Both follow a revoke-and-re-share lifecycle. Scope (for identity)
 * and permissions (for documents) are immutable post-insert.
 */

export type ClinicOrgKind = "clinic" | "medical_practice";

export interface ClinicOrgOption {
  id: string;
  name: string;
  kind: ClinicOrgKind;
  countryCode: string | null;
  createdAt: string;
}

/** Lightweight resolution of target_organization_id → name for the
 *  audit tables. Returned by lookup_clinic_organizations RPC. */
export interface ClinicOrgLookup {
  id: string;
  name: string;
  kind: ClinicOrgKind;
}

export type IdentityGrantScope =
  | "identity_only"
  | "identity_with_identifiers";

export type GrantStatus = "active" | "revoked" | "expired";

export interface IdentityGrantRow {
  id: string;
  childProfileId: string;
  childDisplayName: string | null;
  studentName: string | null;
  targetOrganizationId: string;
  targetOrganizationName: string | null;
  targetOrganizationKind: ClinicOrgKind | null;
  scope: IdentityGrantScope;
  status: GrantStatus;
  purpose: string | null;
  validFrom: string;
  validUntil: string;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface DocumentGrantPermissions {
  view: boolean;
  download: boolean;
  comment: boolean;
  upload_new_version: boolean;
}

export interface DocumentGrantRow {
  id: string;
  documentId: string;
  documentTitle: string | null;
  documentType: string | null;
  childProfileId: string | null;
  studentName: string | null;
  targetOrganizationId: string;
  targetOrganizationName: string | null;
  targetOrganizationKind: ClinicOrgKind | null;
  permissions: DocumentGrantPermissions;
  status: GrantStatus;
  purpose: string | null;
  validFrom: string;
  validUntil: string;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface SchoolStudentForSharing {
  id: string;
  childProfileId: string;
  fullName: string;
  className: string | null;
}

export interface SchoolDocumentForSharing {
  id: string;
  title: string;
  documentType: string;
  studentId: string;
  studentName: string | null;
  status: "active" | "shared";
}
