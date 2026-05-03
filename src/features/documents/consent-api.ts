/**
 * Consent + external-contact queries for Document Coordination (D11 + D12).
 *
 * v1 scope:
 *   - Consents are always document-scoped (`scope.type = 'document'`) so the
 *     UI can do simple equality matching client-side. document_type and
 *     all_for_student scopes still validate at the DB layer (trigger 5.F);
 *     they're just not surfaced in v1's UI.
 *   - External-contact share path always requires a covering consent
 *     (status = 'granted', not expired). Trigger 5.G enforces the recipient
 *     match and grant.expires_at <= consent.expires_at; the client mirrors
 *     these guards so users see a clean error before round-tripping.
 *
 * RLS reminders (056):
 *   - external_contacts: school staff SELECT same-school; school_admin can
 *     INSERT/UPDATE/DELETE; deactivated rows are still readable.
 *   - document_consents: school staff SELECT same-school; school_admin/teacher
 *     INSERT pending where requested_by_user_id = auth.uid(). Teachers can
 *     also UPDATE consents they requested (we only use the INSERT here).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database";
import type {
  DocumentConsentRow,
  ExternalContactRow,
  ConsentScope,
  ConsentRecipient,
} from "./types";

type Client = SupabaseClient<Database>;

// ─── External contacts ─────────────────────────────────────────────────────

export async function listExternalContacts(
  supabase: Client,
  schoolId: string,
): Promise<ExternalContactRow[]> {
  const { data, error } = await supabase
    .from("external_contacts")
    .select("*")
    .eq("school_id", schoolId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExternalContactRow[];
}

export interface CreateExternalContactInput {
  schoolId:         string;
  fullName:         string;
  email:            string;
  organizationName: string | null;
  roleTitle:        string | null;
  phone:            string | null;
}

export async function createExternalContact(
  supabase: Client,
  input: CreateExternalContactInput,
): Promise<ExternalContactRow> {
  // Same client-side UUID convention as the rest of the doc feature, so we
  // never INSERT…RETURNING (which can hit SELECT-policy evaluation).
  const id = crypto.randomUUID();

  const { error: insertErr } = await supabase
    .from("external_contacts")
    .insert({
      id,
      school_id:         input.schoolId,
      full_name:         input.fullName,
      email:             input.email,
      organization_name: input.organizationName,
      role_title:        input.roleTitle,
      phone:             input.phone,
    });
  if (insertErr) throw insertErr;

  // Re-read so the caller has the canonical row (incl. created_at).
  const { data, error: readErr } = await supabase
    .from("external_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!data)   throw new Error("Created external contact but couldn't re-read it.");
  return data as ExternalContactRow;
}


// ─── Consents ──────────────────────────────────────────────────────────────

export interface ConsentRow extends Omit<DocumentConsentRow, "scope" | "recipients"> {
  scope:      ConsentScope;
  recipients: ConsentRecipient[];
}

/**
 * All consents that COULD cover this document, regardless of recipient.
 * Returned newest-first so the UI can pick the most recent valid one.
 *
 * v1 only writes scope='document' consents but the query is shape-agnostic
 * — DB-level scopes (document_type, all_for_student) still match here so
 * future UI can pick them up without changes.
 */
export async function listConsentsForDocument(
  supabase: Client,
  doc: { id: string; document_type: string; student_id: string; school_id: string },
): Promise<ConsentRow[]> {
  // We can't easily filter JSONB scope server-side without raw SQL, so pull
  // candidates by school+student and filter client-side. Volumes are small.
  const { data, error } = await supabase
    .from("document_consents")
    .select("*")
    .eq("school_id",  doc.school_id)
    .eq("student_id", doc.student_id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ConsentRow[];
  return rows.filter((c) => scopeCoversDocument(c.scope, doc));
}

/**
 * Find the most recent consent that:
 *   - covers this document (scope match)
 *   - lists this external_contact_id in recipients
 *   - is in a non-final state (pending or granted) and not yet expired.
 *
 * We return pending consents too so the UI can show "Awaiting parent
 * approval" instead of asking the admin to draft another one.
 */
export function pickValidConsentForExternal(
  consents: ConsentRow[],
  externalContactId: string,
  now: Date = new Date(),
): ConsentRow | null {
  for (const c of consents) {
    if (!isConsentLive(c, now)) continue;
    if (!recipientsInclude(c.recipients, externalContactId)) continue;
    return c;
  }
  return null;
}

export function isConsentLive(c: ConsentRow, now: Date = new Date()): boolean {
  if (c.status !== "pending" && c.status !== "granted") return false;
  try {
    return new Date(c.expires_at) > now;
  } catch {
    return false;
  }
}

function recipientsInclude(rs: ConsentRecipient[], externalContactId: string): boolean {
  return rs.some((r) => r.type === "external_contact" && r.external_contact_id === externalContactId);
}

function scopeCoversDocument(
  scope: ConsentScope,
  doc: { id: string; document_type: string },
): boolean {
  if (scope.type === "document")        return scope.document_id === doc.id;
  if (scope.type === "document_type")   return scope.document_type === doc.document_type;
  if (scope.type === "all_for_student") return true;
  return false;
}


export interface CreateConsentDraftInput {
  schoolId:          string;
  studentId:         string;
  documentId:        string;        // v1 is document-scoped only
  externalContactId: string;
  purpose:           string;
  expiresAt:         string;        // ISO; trigger validates >= now indirectly
  allowDownload:     boolean;
  allowReshare:      boolean;
  /** auth.uid() — required for INSERT policy. */
  requestedByUserId: string;
}

/** Drafts a `document_consents` row in `pending` for an external_contact. */
export async function createConsentDraft(
  supabase: Client,
  input: CreateConsentDraftInput,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();

  const scope: ConsentScope = {
    type:        "document",
    document_id: input.documentId,
  };
  const recipients: ConsentRecipient[] = [
    {
      type:                "external_contact",
      external_contact_id: input.externalContactId,
    },
  ];

  const { error } = await supabase
    .from("document_consents")
    .insert({
      id,
      school_id:            input.schoolId,
      student_id:           input.studentId,
      purpose:              input.purpose,
      scope:                scope as unknown as Json,
      recipients:           recipients as unknown as Json,
      allow_download:       input.allowDownload,
      allow_reshare:        input.allowReshare,
      status:               "pending",
      expires_at:           input.expiresAt,
      requested_by_user_id: input.requestedByUserId,
    });
  if (error) throw error;
  return { id };
}
