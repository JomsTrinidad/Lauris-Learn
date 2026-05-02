/**
 * Constants for the Document Coordination feature.
 * Labels, presets, and validation thresholds. No runtime logic here.
 */

import type {
  DocumentType,
  DocumentStatus,
  ConsentStatus,
  RequestStatus,
  GranteeKind,
  ActorKind,
} from "./types";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  iep:                      "IEP",
  therapy_evaluation:       "Therapy Evaluation",
  therapy_progress:         "Therapy Progress",
  school_accommodation:     "School Accommodation Plan",
  medical_certificate:      "Medical Certificate",
  dev_pediatrician_report:  "Developmental Pediatrician Report",
  parent_provided:          "Parent-Provided Document",
  other_supporting:         "Other Supporting Document",
};

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] =
  (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((value) => ({
    value,
    label: DOCUMENT_TYPE_LABELS[value],
  }));

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft:    "Draft",
  active:   "Active",
  shared:   "Shared",
  archived: "Archived",
  revoked:  "Revoked",
};

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  pending: "Pending",
  granted: "Granted",
  revoked: "Revoked",
  expired: "Expired",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  requested: "Requested",
  submitted: "Submitted",
  reviewed:  "Reviewed",
  cancelled: "Cancelled",
};

export const GRANTEE_KIND_LABELS: Record<GranteeKind, string> = {
  school:           "School",
  school_user:      "Staff member",
  external_contact: "External contact",
};

export const ACTOR_KIND_LABELS: Record<ActorKind, string> = {
  school_admin:     "School admin",
  teacher:          "Teacher",
  parent:           "Parent",
  external_contact: "External contact",
  super_admin:      "Platform admin",
  unauthenticated:  "Unauthenticated",
};

/** Used by Share / Consent modals as quick-pick expiry options. */
export const EXPIRY_PRESETS: { days: number; label: string }[] = [
  { days: 30,  label: "30 days" },
  { days: 90,  label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
];

/** Mirrors migration 055 storage bucket config. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
