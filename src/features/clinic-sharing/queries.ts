/**
 * Phase 6D — school-side clinic-sharing queries.
 *
 * All operations run under the caller's session.
 *   - Org directory uses three migration-080 RPCs because RLS on
 *     `organizations` hides clinic/medical_practice rows from
 *     school_admin direct SELECT.
 *   - Grant CRUD is plain table operations — RLS in migrations 074 +
 *     076 already permits school_admin INSERT/UPDATE on both grant
 *     tables and rejects DELETE.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ClinicOrgKind,
  ClinicOrgLookup,
  ClinicOrgOption,
  DocumentGrantPermissions,
  DocumentGrantRow,
  GrantStatus,
  IdentityGrantRow,
  IdentityGrantScope,
  SchoolDocumentForSharing,
  SchoolStudentForSharing,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Resolves the school's shadow organization id (kind='school',
 *  school_id={schoolId}). The school_admin can SELECT this row via
 *  `caller_visible_organization_ids()`. */
export async function getSchoolOrganizationId(
  schoolId: string,
): Promise<string | null> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("school_id", schoolId)
    .eq("kind", "school")
    .maybeSingle();
  if (error) {
    console.error("[clinic-sharing] getSchoolOrganizationId:", error);
    return null;
  }
  return (data?.id as string) ?? null;
}

// ── Org directory ──────────────────────────────────────────────────────

export async function searchClinicOrganizations(
  query: string | null,
  limit = 50,
): Promise<ClinicOrgOption[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase.rpc(
    "list_clinic_organizations_for_sharing",
    { p_query: query, p_limit: limit },
  );
  if (error) {
    console.error("[clinic-sharing] searchClinicOrganizations:", error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as ClinicOrgKind,
    countryCode: row.country_code ?? null,
    createdAt: row.created_at,
  }));
}

export async function createClinicOrganization(input: {
  kind: ClinicOrgKind;
  name: string;
  countryCode?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase.rpc(
    "create_clinic_organization_for_sharing",
    {
      p_kind: input.kind,
      p_name: input.name,
      p_country_code: input.countryCode ?? null,
    },
  );
  if (error) {
    console.error("[clinic-sharing] createClinicOrganization:", error);
    return { error: error.message };
  }
  return { id: data as string };
}

export async function lookupClinicOrganizations(
  ids: string[],
): Promise<Map<string, ClinicOrgLookup>> {
  const map = new Map<string, ClinicOrgLookup>();
  if (ids.length === 0) return map;

  const dedup = Array.from(new Set(ids));
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase.rpc(
    "lookup_clinic_organizations",
    { p_ids: dedup },
  );
  if (error) {
    console.error("[clinic-sharing] lookupClinicOrganizations:", error);
    return map;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      kind: row.kind as ClinicOrgKind,
    });
  }
  return map;
}

// ── School-side pickers ─────────────────────────────────────────────────

export async function listSchoolStudentsForSharing(
  schoolId: string,
): Promise<SchoolStudentForSharing[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("students")
    .select("id, child_profile_id, first_name, last_name")
    .eq("school_id", schoolId)
    .not("child_profile_id", "is", null)
    .order("last_name");
  if (error) {
    console.error("[clinic-sharing] listSchoolStudentsForSharing:", error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    childProfileId: row.child_profile_id as string,
    fullName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unknown",
    className: null,
  }));
}

export async function listSchoolDocumentsForSharing(
  schoolId: string,
): Promise<SchoolDocumentForSharing[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("child_documents")
    .select(
      `id, title, document_type, status, student_id,
       students:student_id ( first_name, last_name )`,
    )
    .eq("school_id", schoolId)
    .in("status", ["active", "shared"])
    .order("title");
  if (error) {
    console.error("[clinic-sharing] listSchoolDocumentsForSharing:", error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    studentId: row.student_id,
    studentName: row.students
      ? `${row.students.first_name ?? ""} ${row.students.last_name ?? ""}`.trim() || null
      : null,
    status: row.status as "active" | "shared",
  }));
}

// ── Grant CRUD ──────────────────────────────────────────────────────────

interface ListIdentityGrantsParams {
  schoolId: string;
  schoolOrganizationId: string;
  /** Optional: scope to a single child_profile_id (used by per-student
   *  entry points). */
  childProfileId?: string;
}

export async function listIdentityGrants({
  schoolId,
  schoolOrganizationId,
  childProfileId,
}: ListIdentityGrantsParams): Promise<IdentityGrantRow[]> {
  const supabase = createClient() as AnyClient;

  let q = supabase
    .from("child_profile_access_grants")
    .select(
      `id, child_profile_id, scope, target_organization_id,
       purpose, status, valid_from, valid_until,
       revoked_at, revoke_reason, created_at,
       child_profiles:child_profile_id ( display_name )`,
    )
    .eq("source_organization_id", schoolOrganizationId)
    .order("created_at", { ascending: false });

  if (childProfileId) q = q.eq("child_profile_id", childProfileId);

  const { data, error } = await q;
  if (error) {
    console.error("[clinic-sharing] listIdentityGrants:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  // Resolve student names by joining grants → students for the school.
  const childIds = Array.from(
    new Set(rows.map((r) => r.child_profile_id).filter(Boolean)),
  );
  const studentNameMap = new Map<string, string>();
  if (childIds.length > 0) {
    const { data: students } = await supabase
      .from("students")
      .select("child_profile_id, first_name, last_name")
      .eq("school_id", schoolId)
      .in("child_profile_id", childIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (students ?? []) as any[]) {
      const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
      if (name && s.child_profile_id) studentNameMap.set(s.child_profile_id, name);
    }
  }

  // Resolve target org names via the SECURITY DEFINER RPC.
  const orgIds = rows.map((r) => r.target_organization_id);
  const orgMap = await lookupClinicOrganizations(orgIds);

  return rows.map<IdentityGrantRow>((row) => {
    const org = orgMap.get(row.target_organization_id);
    return {
      id: row.id,
      childProfileId: row.child_profile_id,
      childDisplayName: row.child_profiles?.display_name ?? null,
      studentName: studentNameMap.get(row.child_profile_id) ?? null,
      targetOrganizationId: row.target_organization_id,
      targetOrganizationName: org?.name ?? null,
      targetOrganizationKind: org?.kind ?? null,
      scope: row.scope as IdentityGrantScope,
      status: row.status as GrantStatus,
      purpose: row.purpose ?? null,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      revokedAt: row.revoked_at ?? null,
      revokeReason: row.revoke_reason ?? null,
      createdAt: row.created_at,
    };
  });
}

interface CreateIdentityGrantInput {
  childProfileId: string;
  schoolOrganizationId: string;
  targetOrganizationId: string;
  grantedByProfileId: string;
  scope: IdentityGrantScope;
  validUntil: string;
  purpose?: string | null;
}

export async function createIdentityGrant(
  input: CreateIdentityGrantInput,
): Promise<{ id: string } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const id = crypto.randomUUID();
  const { error } = await supabase.from("child_profile_access_grants").insert({
    id,
    child_profile_id: input.childProfileId,
    scope: input.scope,
    source_organization_id: input.schoolOrganizationId,
    target_organization_id: input.targetOrganizationId,
    granted_by_profile_id: input.grantedByProfileId,
    granted_by_kind: "school_admin",
    purpose: input.purpose ?? null,
    valid_until: input.validUntil,
  });
  if (error) {
    console.error("[clinic-sharing] createIdentityGrant:", error);
    return { error: mapGrantError(error) };
  }
  return { id };
}

interface ListDocumentGrantsParams {
  schoolId: string;
  /** Optional: scope to a single document. */
  documentId?: string;
}

export async function listDocumentGrants({
  schoolId,
  documentId,
}: ListDocumentGrantsParams): Promise<DocumentGrantRow[]> {
  const supabase = createClient() as AnyClient;

  let q = supabase
    .from("document_organization_access_grants")
    .select(
      `id, document_id, target_organization_id, permissions,
       purpose, status, valid_from, valid_until,
       revoked_at, revoke_reason, created_at,
       child_documents:document_id (
         title, document_type, student_id,
         students:student_id ( first_name, last_name, child_profile_id )
       )`,
    )
    .eq("source_school_id", schoolId)
    .order("created_at", { ascending: false });

  if (documentId) q = q.eq("document_id", documentId);

  const { data, error } = await q;
  if (error) {
    console.error("[clinic-sharing] listDocumentGrants:", error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const orgIds = rows.map((r) => r.target_organization_id);
  const orgMap = await lookupClinicOrganizations(orgIds);

  return rows.map<DocumentGrantRow>((row) => {
    const org = orgMap.get(row.target_organization_id);
    const studentRow = row.child_documents?.students;
    const studentName = studentRow
      ? `${studentRow.first_name ?? ""} ${studentRow.last_name ?? ""}`.trim() || null
      : null;
    return {
      id: row.id,
      documentId: row.document_id,
      documentTitle: row.child_documents?.title ?? null,
      documentType: row.child_documents?.document_type ?? null,
      childProfileId: studentRow?.child_profile_id ?? null,
      studentName,
      targetOrganizationId: row.target_organization_id,
      targetOrganizationName: org?.name ?? null,
      targetOrganizationKind: org?.kind ?? null,
      permissions: normalizePerms(row.permissions),
      status: row.status as GrantStatus,
      purpose: row.purpose ?? null,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      revokedAt: row.revoked_at ?? null,
      revokeReason: row.revoke_reason ?? null,
      createdAt: row.created_at,
    };
  });
}

interface CreateDocumentGrantInput {
  documentId: string;
  schoolId: string;
  targetOrganizationId: string;
  grantedByProfileId: string;
  permissions: DocumentGrantPermissions;
  validUntil: string;
  purpose?: string | null;
}

export async function createDocumentGrant(
  input: CreateDocumentGrantInput,
): Promise<{ id: string } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("document_organization_access_grants")
    .insert({
      id,
      document_id: input.documentId,
      scope: "document",
      source_school_id: input.schoolId,
      target_organization_id: input.targetOrganizationId,
      granted_by_profile_id: input.grantedByProfileId,
      granted_by_kind: "school_admin",
      permissions: input.permissions,
      purpose: input.purpose ?? null,
      valid_until: input.validUntil,
    });
  if (error) {
    console.error("[clinic-sharing] createDocumentGrant:", error);
    return { error: mapGrantError(error) };
  }
  return { id };
}

export async function revokeIdentityGrant(
  grantId: string,
  revokedByProfileId: string,
  reason: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase
    .from("child_profile_access_grants")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by_profile_id: revokedByProfileId,
      revoke_reason: reason,
    })
    .eq("id", grantId);
  if (error) {
    console.error("[clinic-sharing] revokeIdentityGrant:", error);
    return { error: error.message };
  }
  return { ok: true };
}

export async function revokeDocumentGrant(
  grantId: string,
  revokedByProfileId: string,
  reason: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase
    .from("document_organization_access_grants")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by_profile_id: revokedByProfileId,
      revoke_reason: reason,
    })
    .eq("id", grantId);
  if (error) {
    console.error("[clinic-sharing] revokeDocumentGrant:", error);
    return { error: error.message };
  }
  return { ok: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizePerms(raw: unknown): DocumentGrantPermissions {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    view: p.view === true,
    download: p.download === true,
    comment: p.comment === true,
    upload_new_version: p.upload_new_version === true,
  };
}

function mapGrantError(err: { code?: string; message?: string }): string {
  if (err.code === "23505") {
    return "Already shared with this clinic. Revoke the existing grant first to issue a new one.";
  }
  if (err.message && /violates row-level security/i.test(err.message)) {
    return "You don't have permission to issue this grant. Only school admins can.";
  }
  return err.message || "Failed to issue grant.";
}
