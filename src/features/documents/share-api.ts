/**
 * Share-related queries for Document Coordination (Phase D step D10).
 *
 * v1 scope is internal-only sharing:
 *   - grantee_kind = 'school_user'
 *   - same school (consent_id = NULL)
 *
 * Cross-school sharing, the `school` grantee, external contacts, and consent
 * binding all land in later steps (D11–D13). Keep this file narrow.
 *
 * RLS reminders (migration 056):
 *   - Listing same-school staff is NOT possible via direct SELECT on
 *     `profiles`. We call the `list_school_staff_for_sharing` RPC
 *     (migration 065) which returns staff in the caller's school.
 *   - Listing/creating grants follows the standard policies — direct table
 *     access works for school staff.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  DocumentAccessGrantRow,
  GrantPermissions,
} from "./types";

type Client = SupabaseClient<Database>;

export interface SchoolStaffOption {
  id:        string;
  full_name: string;
  email:     string;
  role:      "school_admin" | "teacher";
}

export async function listSchoolStaffForSharing(
  supabase: Client,
  schoolId: string,
): Promise<SchoolStaffOption[]> {
  // The Supabase generic constraint chokes on this codebase's Database
  // shape (Views: Record<string, never>); cast matches the convention used
  // in src/app/api/documents/[id]/access/route.ts and elsewhere.
  const { data, error } = await (supabase as any).rpc(
    "list_school_staff_for_sharing",
    { p_school_id: schoolId },
  );
  if (error) throw error;
  // RPC restricts roles to school_admin/teacher — narrow accordingly.
  return ((data ?? []) as SchoolStaffOption[]);
}


/** Same as DocumentAccessGrantRow but with the JSONB permissions narrowed.
 *  The DB enforces the shape on insert (we always write a GrantPermissions
 *  literal); reads are a typed view of the same. */
export type InternalGrantRow =
  Omit<DocumentAccessGrantRow, "permissions"> & { permissions: GrantPermissions };

/**
 * All grants on a document — used by the Access tab.
 * RLS for school_admin/teacher returns same-school grants; we sort
 * active-first then by created_at desc client-side.
 */
export async function listGrantsForDocument(
  supabase: Client,
  docId: string,
): Promise<InternalGrantRow[]> {
  const { data, error } = await supabase
    .from("document_access_grants")
    .select("*")
    .eq("document_id", docId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InternalGrantRow[];
}


export interface CreateInternalGrantInput {
  documentId:    string;
  schoolId:      string;
  granteeUserId: string;
  /** Caller's auth.uid — used for created_by. */
  createdBy:     string;
  /** ISO timestamp. The trigger 5.G validates it's in the future implicitly
   *  via consent comparison; for internal grants we just need a non-null
   *  expires_at (the column is NOT NULL). */
  expiresAt:     string;
  permissions:   GrantPermissions;
}

export async function createInternalGrant(
  supabase: Client,
  input: CreateInternalGrantInput,
): Promise<{ id: string }> {
  // Client-side UUID — same pattern as UploadDocumentModal/D7.
  // INSERT…RETURNING via .select().single() triggers SELECT-policy
  // evaluation against the just-inserted row; we keep the round-trip lean
  // and the id known up front.
  const grantId = crypto.randomUUID();

  const { error } = await supabase
    .from("document_access_grants")
    .insert({
      id:                grantId,
      document_id:       input.documentId,
      school_id:         input.schoolId,
      consent_id:        null,                  // internal v1: never required
      grantee_kind:      "school_user",
      grantee_user_id:   input.granteeUserId,
      permissions:       input.permissions as unknown as Database["public"]["Tables"]["document_access_grants"]["Insert"]["permissions"],
      expires_at:        input.expiresAt,
      created_by:        input.createdBy,
    });

  if (error) throw error;
  return { id: grantId };
}


// ─── External grants (D12) ─────────────────────────────────────────────────

export interface CreateExternalGrantInput {
  documentId:        string;
  schoolId:          string;
  consentId:         string;        // REQUIRED — trigger 5.G + accessible_document_ids() both expect it
  externalContactId: string;
  createdBy:         string;
  expiresAt:         string;        // must be ≤ consent.expires_at (trigger 5.G)
  permissions:       GrantPermissions;
}

export async function createExternalGrant(
  supabase: Client,
  input: CreateExternalGrantInput,
): Promise<{ id: string }> {
  const grantId = crypto.randomUUID();

  const { error } = await supabase
    .from("document_access_grants")
    .insert({
      id:                          grantId,
      document_id:                 input.documentId,
      school_id:                   input.schoolId,
      consent_id:                  input.consentId,
      grantee_kind:                "external_contact",
      grantee_external_contact_id: input.externalContactId,
      permissions:                 input.permissions as unknown as Database["public"]["Tables"]["document_access_grants"]["Insert"]["permissions"],
      expires_at:                  input.expiresAt,
      created_by:                  input.createdBy,
    });

  if (error) throw error;
  return { id: grantId };
}


// ─── Revoke (D13) ──────────────────────────────────────────────────────────

export interface RevokeGrantInput {
  grantId:    string;
  revokedBy:  string;            // auth.uid()
  reason:     string | null;     // optional, but worth surfacing in audit
}

/**
 * Revoke a grant by setting (revoked_at, revoked_by, revoke_reason). The
 * column-guard trigger 4.2 permits ONLY these three fields to change after
 * creation, so we explicitly send just those — no permissions, no expiry,
 * no grantee changes. The cascade trigger on document_consents (5.H) is a
 * separate path; this is the manual per-grant revoke.
 */
export async function revokeGrant(
  supabase: Client,
  input: RevokeGrantInput,
): Promise<void> {
  const { error } = await supabase
    .from("document_access_grants")
    .update({
      revoked_at:    new Date().toISOString(),
      revoked_by:    input.revokedBy,
      revoke_reason: input.reason,
    })
    .eq("id", input.grantId);

  if (error) throw error;
}
