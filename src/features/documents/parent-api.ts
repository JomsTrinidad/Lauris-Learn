/**
 * Parent-side queries + mutations for Document Coordination (Phase E1).
 *
 * Visibility rules — both enforced server-side by RLS (056 helper
 * accessible_document_ids() clause 5) and mirrored client-side as a
 * defensive filter:
 *   - source_kind = 'parent'  (parent-uploaded documents about own child)
 *   - OR status IN ('shared','archived')
 *   - AND status <> 'revoked'
 *   - AND student_id ∈ parent_student_ids()  (i.e. own child)
 *
 * Versions: parents only see the head's current visible version (RLS
 * policy `non_staff_select_current_child_document_version`).
 *
 * Consents: parents see every consent about their children regardless
 * of status, via `parent_select_document_consents`. Mutations go through
 * the parent transition guard (trigger 4.1) — pending→granted or
 * granted→revoked, with the corresponding metadata. Migration 069 marks
 * the cascade trigger 5.H as SECURITY DEFINER so revokes propagate to
 * dependent grants under the parent's RLS context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  ChildDocumentRow,
  ChildDocumentVersionRow,
  DocumentConsentRow,
  ConsentScope,
  ConsentRecipient,
  DocumentAccessGrantRow,
  GrantPermissions,
} from "./types";

type Client = SupabaseClient<Database>;


// ─── View-models ───────────────────────────────────────────────────────────

export interface ParentDocumentListItem extends ChildDocumentRow {
  current_version:
    | { id: string; version_number: number; file_name: string | null; mime_type: string | null }
    | null;
}

export interface ParentConsentRow
  extends Omit<DocumentConsentRow, "scope" | "recipients"> {
  scope:      ConsentScope;
  recipients: ConsentRecipient[];
}

export type ParentGrantRow =
  Omit<DocumentAccessGrantRow, "permissions"> & { permissions: GrantPermissions };


// ─── Document reads ────────────────────────────────────────────────────────

/**
 * All documents for one student that the calling parent is allowed to see.
 * RLS already filters; we apply the same visibility rule client-side so
 * there's no surprise if RLS ever changes.
 */
export async function listParentDocuments(
  supabase: Client,
  studentId: string,
): Promise<ParentDocumentListItem[]> {
  const { data, error } = await supabase
    .from("child_documents")
    .select("*")
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const docs = ((data ?? []) as ChildDocumentRow[]).filter((d) => {
    if (d.status === "revoked") return false;
    return d.source_kind === "parent" || d.status === "shared" || d.status === "archived";
  });
  if (docs.length === 0) return [];

  const versionIds = docs
    .map((d) => d.current_version_id)
    .filter((x): x is string => !!x);

  type VersionLite = {
    id: string; version_number: number; file_name: string | null; mime_type: string | null;
  };
  let versionMap = new Map<string, VersionLite>();
  if (versionIds.length > 0) {
    const { data: vData, error: vErr } = await supabase
      .from("child_document_versions")
      .select("id, version_number, file_name, mime_type")
      .in("id", versionIds);
    if (vErr) throw vErr;
    versionMap = new Map(
      ((vData ?? []) as VersionLite[]).map((v) => [v.id, v]),
    );
  }

  return docs.map((d) => ({
    ...d,
    current_version: d.current_version_id
      ? versionMap.get(d.current_version_id) ?? null
      : null,
  }));
}

export async function getParentDocument(
  supabase: Client,
  docId: string,
): Promise<ParentDocumentListItem | null> {
  const { data, error } = await supabase
    .from("child_documents")
    .select("*")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const d = data as ChildDocumentRow;
  // Mirror the list-side visibility rule. RLS already returns null for
  // non-visible docs, but this defends against a stale URL the parent
  // saved while a doc was 'shared' but is now 'draft'/'revoked'.
  if (d.status === "revoked") return null;
  const isVisible =
    d.source_kind === "parent" || d.status === "shared" || d.status === "archived";
  if (!isVisible) return null;

  let cv: ParentDocumentListItem["current_version"] = null;
  if (d.current_version_id) {
    const { data: v } = await supabase
      .from("child_document_versions")
      .select("id, version_number, file_name, mime_type")
      .eq("id", d.current_version_id)
      .maybeSingle();
    cv = (v as ParentDocumentListItem["current_version"]) ?? null;
  }
  return { ...d, current_version: cv };
}

/**
 * Versions of a document visible to the parent.
 * RLS policy `non_staff_select_current_child_document_version` returns at
 * most one row — the current visible version. We do not expose hidden or
 * older versions to the parent.
 */
export async function listParentVersions(
  supabase: Client,
  docId: string,
): Promise<ChildDocumentVersionRow[]> {
  const { data, error } = await supabase
    .from("child_document_versions")
    .select("*")
    .eq("document_id", docId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChildDocumentVersionRow[];
}


// ─── Consents ──────────────────────────────────────────────────────────────

/**
 * Every consent about THIS document that the parent can see (RLS gates by
 * student_id). Document-scoped consents match by document_id; document_type
 * and all_for_student scopes match by type/student. Newest first.
 */
export async function listConsentsForStudentDocument(
  supabase: Client,
  doc: { id: string; document_type: string; student_id: string; school_id: string },
): Promise<ParentConsentRow[]> {
  const { data, error } = await supabase
    .from("document_consents")
    .select("*")
    .eq("school_id",  doc.school_id)
    .eq("student_id", doc.student_id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ParentConsentRow[];
  return rows.filter((c) => scopeCoversDocument(c.scope, doc));
}

/**
 * All live "pending" consents for the given student — used by the
 * parent-side "Permissions awaiting your approval" panel.
 *
 * Why this exists at the page level (not just inside the doc detail
 * modal): when an admin drafts an external-share consent, the request is
 * pending BEFORE the share completes — meaning the underlying doc is
 * usually still in 'draft' or 'active' status. Per the spec, the parent's
 * doc list only surfaces 'shared' / 'archived' / parent-uploaded docs, so
 * those pending consents would be invisible if we only rendered them
 * inside the doc modal. Parents have RLS SELECT on document_consents
 * independently (via `parent_select_document_consents`), so we can safely
 * pull them directly without exposing the underlying doc.
 */
export async function listPendingConsentsForStudent(
  supabase: Client,
  studentId: string,
): Promise<ParentConsentRow[]> {
  const { data, error } = await supabase
    .from("document_consents")
    .select("*")
    .eq("student_id", studentId)
    .eq("status",     "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Drop expired pending rows — parent transition guard would reject
  // any UPDATE on them anyway, so we don't surface dead-letter rows.
  const now = new Date();
  return ((data ?? []) as unknown as ParentConsentRow[]).filter((c) => {
    try { return new Date(c.expires_at) > now; }
    catch { return false; }
  });
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

/**
 * Look up the calling parent's guardian_id for a specific student. The
 * parent transition guard (trigger 4.1) accepts ANY guardian row that
 * matches the JWT email, but for correctness we want the row tied to the
 * consent's student. Returns null if no row matches — e.g. the email
 * isn't actually a guardian for that student.
 */
export async function findGuardianIdForStudent(
  supabase: Client,
  studentId: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data, error } = await supabase
    .from("guardians")
    .select("id")
    .eq("student_id", studentId)
    .eq("email", user.email)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as { id: string } | undefined;
  return row?.id ?? null;
}


// ─── Grants (read-only) ────────────────────────────────────────────────────

/**
 * Grants on a document the parent's child is the subject of. Used to
 * render a recipient summary alongside each consent. RLS exposes these
 * to parents via `parent_select_document_access_grants`.
 */
export async function listGrantsForDocumentForParent(
  supabase: Client,
  docId: string,
): Promise<ParentGrantRow[]> {
  const { data, error } = await supabase
    .from("document_access_grants")
    .select("*")
    .eq("document_id", docId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ParentGrantRow[];
}


// ─── Mutations ─────────────────────────────────────────────────────────────

export interface GrantConsentInput {
  consentId:  string;
  guardianId: string;   // must be one of the calling parent's guardian rows
}

/**
 * pending → granted. Trigger 4.1 enforces:
 *   - status transition (pending→granted)
 *   - granted_by_guardian_id matches one of parent_guardian_ids()
 *   - granted_at + granted_by_guardian_id both set
 *   - no other terms changed
 */
export async function grantConsent(
  supabase: Client,
  input: GrantConsentInput,
): Promise<void> {
  const { error } = await supabase
    .from("document_consents")
    .update({
      status:                 "granted",
      granted_by_guardian_id: input.guardianId,
      granted_at:             new Date().toISOString(),
    })
    .eq("id", input.consentId);
  if (error) throw error;
}

export interface RevokeConsentInput {
  consentId:  string;
  guardianId: string;
  reason:     string | null;
}

/**
 * granted → revoked. Trigger 4.1 enforces the transition shape; trigger
 * 5.H (made SECURITY DEFINER in migration 069) cascades the revoke to
 * any active grants pointing at this consent — so external recipients
 * lose access immediately, not just at the consent's expiry.
 */
export async function revokeConsent(
  supabase: Client,
  input: RevokeConsentInput,
): Promise<void> {
  const { error } = await supabase
    .from("document_consents")
    .update({
      status:                 "revoked",
      revoked_by_guardian_id: input.guardianId,
      revoked_at:             new Date().toISOString(),
      revoke_reason:          input.reason,
    })
    .eq("id", input.consentId);
  if (error) throw error;
}


// ─── Predicates ────────────────────────────────────────────────────────────

/** Live = pending or granted, not past expires_at. Same shape as the
 *  admin-side helper but inlined to keep parent-api self-contained. */
export function isConsentLive(c: ParentConsentRow, now: Date = new Date()): boolean {
  if (c.status !== "pending" && c.status !== "granted") return false;
  try {
    return new Date(c.expires_at) > now;
  } catch {
    return false;
  }
}
