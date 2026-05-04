/**
 * Phase 6A — Lauris Care portal queries.
 *
 * All functions run under the caller's session (RLS does the gating).
 * No service-role escalation. No writes.
 *
 * Document enumeration goes through list_documents_for_organization()
 * (migration 077) — anchored on document_organization_access_grants,
 * NOT on students.* (clinic users have no SELECT on students).
 */

import { createClient } from "@/lib/supabase/client";
import type {
  CareChildRow,
  ChildIdentifier,
  ChildIdentity,
  ClinicMembership,
  GrantScope,
  GrantedChild,
  OwnedChild,
  SharedDocument,
  DocPermissions,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Returns the caller's active memberships in clinic / medical_practice
 * organizations. Used to drive both the auth gate and the in-header
 * org switcher when the user belongs to multiple clinics.
 */
export async function listMyClinicMemberships(): Promise<ClinicMembership[]> {
  const supabase = createClient() as AnyClient;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];

  const { data, error } = await supabase
    .from("organization_memberships")
    .select(
      `
      id, role, organization_id,
      organizations:organization_id ( name, kind )
    `,
    )
    .eq("profile_id", auth.user.id)
    .eq("status", "active");

  if (error) {
    console.error("[care] listMyClinicMemberships:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((row) => {
      const kind = row.organizations?.kind;
      return kind === "clinic" || kind === "medical_practice";
    })
    .map((row) => ({
      membershipId: row.id,
      organizationId: row.organization_id,
      organizationName: row.organizations?.name ?? "Unnamed organization",
      organizationKind: row.organizations.kind as "clinic" | "medical_practice",
      role: row.role,
    }));
}

/**
 * Returns children whose child_profile is currently shared with the
 * caller's clinic via an active, currently-valid identity grant.
 *
 * RLS does the heavy lifting:
 *   - child_profile_access_grants clinic-side SELECT clamps to status='active'
 *   - child_profiles SELECT honours caller_visible_child_profile_ids() 5th arm
 */
export async function listGrantedChildren(
  organizationId: string,
): Promise<GrantedChild[]> {
  const supabase = createClient() as AnyClient;

  const { data, error } = await supabase
    .from("child_profile_access_grants")
    .select(
      `
      child_profile_id, scope, valid_until,
      child_profiles:child_profile_id ( display_name, preferred_name, date_of_birth )
    `,
    )
    .eq("target_organization_id", organizationId)
    .eq("status", "active")
    .gt("valid_until", new Date().toISOString());

  if (error) {
    console.error("[care] listGrantedChildren:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((row) => row.child_profiles)
    .map((row) => ({
      childProfileId: row.child_profile_id,
      displayName: row.child_profiles?.display_name ?? "Unknown",
      preferredName: row.child_profiles?.preferred_name ?? null,
      dateOfBirth: row.child_profiles?.date_of_birth ?? null,
      scope: row.scope as GrantScope,
      grantValidUntil: row.valid_until,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Phase 6B — children OWNED by the caller's clinic (origin_organization_id
 *  match + active membership). RLS does the gating via the new
 *  caller_visible_child_profile_ids_for_ownership() helper.
 *
 *  Note: server-side WHERE on origin_organization_id is for query
 *  efficiency only. RLS would already filter to the same set. */
export async function listOwnedChildren(
  organizationId: string,
): Promise<OwnedChild[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("child_profiles")
    .select("id, display_name, preferred_name, date_of_birth")
    .eq("origin_organization_id", organizationId)
    .order("display_name");

  if (error) {
    console.error("[care] listOwnedChildren:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    childProfileId: row.id,
    displayName: row.display_name,
    preferredName: row.preferred_name ?? null,
    dateOfBirth: row.date_of_birth ?? null,
  }));
}

/** Combined view-model for /care/children. Fetches owned and shared
 *  children in parallel and dedupes by child_profile_id (preferring the
 *  owned representation if a child happens to be both — rare but
 *  possible). */
export async function listCareChildren(
  organizationId: string,
): Promise<CareChildRow[]> {
  const [owned, shared] = await Promise.all([
    listOwnedChildren(organizationId),
    listGrantedChildren(organizationId),
  ]);

  const seen = new Set<string>();
  const rows: CareChildRow[] = [];

  for (const c of owned) {
    seen.add(c.childProfileId);
    rows.push({
      childProfileId: c.childProfileId,
      displayName: c.displayName,
      preferredName: c.preferredName,
      dateOfBirth: c.dateOfBirth,
      originType: "owned",
    });
  }
  for (const c of shared) {
    if (seen.has(c.childProfileId)) continue;
    rows.push({
      childProfileId: c.childProfileId,
      displayName: c.displayName,
      preferredName: c.preferredName,
      dateOfBirth: c.dateOfBirth,
      originType: "shared",
      scope: c.scope,
      grantValidUntil: c.grantValidUntil,
    });
  }

  return rows.sort((a, b) => {
    if (a.originType !== b.originType) return a.originType === "owned" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

/** Phase 6B — clinic-admin write path. Inserts the child_profile and
 *  the matching 'clinic_client' membership. Returns the new
 *  child_profile_id on success.
 *
 *  Best-effort rollback: if the membership insert fails after the
 *  profile lands, the profile is deleted (best-effort — RLS may not
 *  allow it, in which case it stays as a clean orphan that the clinic
 *  admin can re-link via SQL or a future repair UI). */
export interface NewChildInput {
  displayName: string;
  legalName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  preferredName?: string;
  dateOfBirth?: string;
  sexAtBirth?: string;
  primaryLanguage?: string;
  countryCode?: string;
  identifiers?: Array<{
    identifierType: string;
    identifierValue: string;
    countryCode?: string;
  }>;
}

export async function createOwnedChild(
  organizationId: string,
  input: NewChildInput,
): Promise<{ childProfileId: string } | { error: string }> {
  const supabase = createClient() as AnyClient;

  const profileId = crypto.randomUUID();

  const { error: insErr } = await supabase.from("child_profiles").insert({
    id: profileId,
    display_name: input.displayName.trim(),
    legal_name: input.legalName?.trim() || null,
    first_name: input.firstName?.trim() || null,
    middle_name: input.middleName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    preferred_name: input.preferredName?.trim() || null,
    date_of_birth: input.dateOfBirth || null,
    sex_at_birth: input.sexAtBirth || null,
    primary_language: input.primaryLanguage?.trim() || null,
    country_code: input.countryCode?.trim() || null,
    origin_organization_id: organizationId,
    created_in_app: "lauris_care",
  });

  if (insErr) {
    console.error("[care] createOwnedChild profile insert:", insErr);
    return { error: insErr.message };
  }

  const { error: memErr } = await supabase
    .from("child_profile_memberships")
    .insert({
      child_profile_id: profileId,
      organization_id: organizationId,
      relationship_kind: "clinic_client",
      status: "active",
      started_at: new Date().toISOString(),
      created_in_app: "lauris_care",
    });

  if (memErr) {
    console.error("[care] createOwnedChild membership insert:", memErr);
    // Best-effort rollback. May fail under RLS — that's acceptable;
    // the orphan profile is still owned by this clinic and recoverable.
    await supabase.from("child_profiles").delete().eq("id", profileId);
    return { error: memErr.message };
  }

  // Optional identifiers — best-effort. If any fails, we surface the
  // first error but the child_profile + membership stay in place.
  if (input.identifiers && input.identifiers.length > 0) {
    const rows = input.identifiers
      .filter((id) => id.identifierType.trim() && id.identifierValue.trim())
      .map((id) => ({
        child_profile_id: profileId,
        identifier_type: id.identifierType.trim(),
        identifier_value: id.identifierValue.trim(),
        country_code: id.countryCode?.trim() || null,
      }));
    if (rows.length > 0) {
      const { error: idErr } = await supabase
        .from("child_identifiers")
        .insert(rows);
      if (idErr) {
        console.error("[care] createOwnedChild identifiers insert:", idErr);
        return { error: `Profile created but identifier insert failed: ${idErr.message}` };
      }
    }
  }

  return { childProfileId: profileId };
}

/** Phase 6B.1 — clinic-admin edit path. Patches the editable fields on
 *  a clinic-owned child_profile. Caller must be clinic_admin of the
 *  child's origin org; RLS denies otherwise. The trigger
 *  cp_clinic_owned_noop_guard rejects updates that change zero fields
 *  (SQLSTATE 22000); the trigger cp_origin_immutable_guard already
 *  rejects any origin change. */
export interface UpdateOwnedChildPatch {
  displayName?: string;
  legalName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  dateOfBirth?: string | null;
  sexAtBirth?: string | null;
  genderIdentity?: string | null;
  primaryLanguage?: string | null;
  countryCode?: string | null;
}

export async function updateOwnedChild(
  childProfileId: string,
  patch: UpdateOwnedChildPatch,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;

  // Map camelCase → snake_case. Only include fields present in the patch
  // so we never overwrite an unspecified column with NULL. origin_*
  // intentionally not included — defense in depth on top of the trigger.
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.legalName !== undefined) row.legal_name = patch.legalName;
  if (patch.firstName !== undefined) row.first_name = patch.firstName;
  if (patch.middleName !== undefined) row.middle_name = patch.middleName;
  if (patch.lastName !== undefined) row.last_name = patch.lastName;
  if (patch.preferredName !== undefined) row.preferred_name = patch.preferredName;
  if (patch.dateOfBirth !== undefined) row.date_of_birth = patch.dateOfBirth;
  if (patch.sexAtBirth !== undefined) row.sex_at_birth = patch.sexAtBirth;
  if (patch.genderIdentity !== undefined) row.gender_identity = patch.genderIdentity;
  if (patch.primaryLanguage !== undefined) row.primary_language = patch.primaryLanguage;
  if (patch.countryCode !== undefined) row.country_code = patch.countryCode;

  if (Object.keys(row).length === 0) {
    return { error: "No changes to save." };
  }

  const { error } = await supabase
    .from("child_profiles")
    .update(row)
    .eq("id", childProfileId);

  if (error) {
    console.error("[care] updateOwnedChild:", error);
    if (error.code === "22000") {
      return { error: "No changes detected. Update at least one field before saving." };
    }
    return { error: error.message };
  }

  return { ok: true };
}

/** Friendly mapping for identifier-uniqueness collisions. */
function mapIdentifierError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "Unknown error.";
  if (err.code === "23505") {
    return "This identifier is already registered. If this is the same child, contact support to link records.";
  }
  if (err.code === "22000") {
    return "No changes detected. Update at least one field before saving.";
  }
  if (err.code === "42501") {
    return "Not allowed to change the child this identifier belongs to.";
  }
  return err.message || "Unknown error.";
}

export interface IdentifierInput {
  identifierType: string;
  identifierValue: string;
  countryCode?: string | null;
}

export async function addIdentifier(
  childProfileId: string,
  input: IdentifierInput,
): Promise<{ identifierId: string } | { error: string }> {
  const supabase = createClient() as AnyClient;

  const id = crypto.randomUUID();
  const { error } = await supabase.from("child_identifiers").insert({
    id,
    child_profile_id: childProfileId,
    identifier_type: input.identifierType.trim(),
    identifier_value: input.identifierValue.trim(),
    country_code: input.countryCode?.trim() || null,
  });

  if (error) {
    console.error("[care] addIdentifier:", error);
    return { error: mapIdentifierError(error) };
  }

  return { identifierId: id };
}

export async function updateIdentifier(
  identifierId: string,
  patch: Partial<IdentifierInput>,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;

  const row: Record<string, unknown> = {};
  if (patch.identifierType !== undefined) row.identifier_type = patch.identifierType.trim();
  if (patch.identifierValue !== undefined) row.identifier_value = patch.identifierValue.trim();
  if (patch.countryCode !== undefined) {
    row.country_code = patch.countryCode?.trim() || null;
  }

  if (Object.keys(row).length === 0) {
    return { error: "No changes to save." };
  }

  const { error } = await supabase
    .from("child_identifiers")
    .update(row)
    .eq("id", identifierId);

  if (error) {
    console.error("[care] updateIdentifier:", error);
    return { error: mapIdentifierError(error) };
  }

  return { ok: true };
}

export async function deleteIdentifier(
  identifierId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase
    .from("child_identifiers")
    .delete()
    .eq("id", identifierId);

  if (error) {
    console.error("[care] deleteIdentifier:", error);
    return { error: mapIdentifierError(error) };
  }

  return { ok: true };
}

/** Reads the child_profile row directly (RLS lets it through if the
 *  caller has any active grant for this profile, OR the caller is an
 *  active member of the profile's origin_organization_id). */
export async function getChildIdentity(
  childProfileId: string,
): Promise<ChildIdentity | null> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("child_profiles")
    .select(
      `id, display_name, legal_name, preferred_name,
       first_name, middle_name, last_name,
       date_of_birth, sex_at_birth, gender_identity,
       primary_language, country_code`,
    )
    .eq("id", childProfileId)
    .maybeSingle();

  if (error) {
    console.error("[care] getChildIdentity:", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    legalName: data.legal_name ?? null,
    preferredName: data.preferred_name ?? null,
    firstName: data.first_name ?? null,
    middleName: data.middle_name ?? null,
    lastName: data.last_name ?? null,
    dateOfBirth: data.date_of_birth ?? null,
    sexAtBirth: data.sex_at_birth ?? null,
    genderIdentity: data.gender_identity ?? null,
    primaryLanguage: data.primary_language ?? null,
    countryCode: data.country_code ?? null,
  };
}

/** Identifiers are only visible to the clinic when the active grant has
 *  scope='identity_with_identifiers' — enforced by the
 *  caller_visible_child_profile_ids_for_identifiers() helper on the
 *  child_identifiers SELECT policy (migration 075). The query is the
 *  same regardless; an identity_only grant simply returns 0 rows. */
export async function listChildIdentifiers(
  childProfileId: string,
): Promise<ChildIdentifier[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("child_identifiers")
    .select("id, identifier_type, identifier_value, country_code")
    .eq("child_profile_id", childProfileId);

  if (error) {
    console.error("[care] listChildIdentifiers:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    identifierType: row.identifier_type,
    identifierValue: row.identifier_value,
    countryCode: row.country_code ?? null,
  }));
}

/** Documents shared with the caller's clinic, anchored on
 *  document_organization_access_grants via the migration-077 RPC. */
export async function listSharedDocuments(
  organizationId: string,
  filterChildProfileId?: string,
): Promise<SharedDocument[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase.rpc("list_documents_for_organization", {
    p_org_id: organizationId,
  });

  if (error) {
    console.error("[care] listSharedDocuments:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  return rows
    .filter((row) => {
      if (!filterChildProfileId) return true;
      return row.child_profile_id === filterChildProfileId;
    })
    .map<SharedDocument>((row) => ({
      documentId: row.document_id,
      title: row.title,
      documentType: row.document_type,
      docStatus: row.doc_status,
      versionNumber: row.version_number,
      mimeType: row.mime_type,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes ?? null,
      childProfileId: row.child_profile_id ?? null,
      permissions: normalizePermissions(row.permissions),
      grantValidUntil: row.grant_valid_until,
      grantCreatedAt: row.grant_created_at,
    }));
}

function normalizePermissions(raw: unknown): DocPermissions {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    view: p.view === true,
    download: p.download === true,
    comment: p.comment === true,
    upload_new_version: p.upload_new_version === true,
  };
}
