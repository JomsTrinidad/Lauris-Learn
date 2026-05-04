/**
 * Phase 6E — therapy sessions API.
 *
 * All operations run under the caller's session. RLS does the gating
 * (082 policies). Member name resolution flows through the
 * SECURITY DEFINER list_clinic_members RPC since the base profiles
 * SELECT only exposes the caller's own row.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ChildClinicMembershipState,
  ClinicMember,
  SessionStatus,
  TherapySession,
  TherapySessionNote,
  TherapySessionNotePatch,
  TherapyType,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// ── Member directory ────────────────────────────────────────────────────

export async function listClinicMembers(
  organizationId: string,
): Promise<ClinicMember[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase.rpc("list_clinic_members", {
    p_org_id: organizationId,
  });
  if (error) {
    console.error("[care] listClinicMembers:", error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    fullName: row.full_name ?? null,
    email: row.email,
    role: row.role,
    status: row.status,
  }));
}

// ── Session CRUD ────────────────────────────────────────────────────────

interface ListSessionsForClinicParams {
  organizationId: string;
  fromIso?: string;
  toIso?: string;
  status?: SessionStatus | "";
  therapyType?: TherapyType | "";
}

export async function listSessionsForClinic(
  params: ListSessionsForClinicParams,
): Promise<TherapySession[]> {
  const supabase = createClient() as AnyClient;
  let q = supabase
    .from("therapy_sessions")
    .select(
      `id, clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, duration_minutes, status, notes,
       parent_visible_summary, created_at, updated_at,
       child_profiles:child_profile_id ( display_name )`,
    )
    .eq("clinic_organization_id", params.organizationId)
    .order("scheduled_at", { ascending: false });

  if (params.fromIso) q = q.gte("scheduled_at", params.fromIso);
  if (params.toIso) q = q.lte("scheduled_at", params.toIso);
  if (params.status) q = q.eq("status", params.status);
  if (params.therapyType) q = q.eq("therapy_type", params.therapyType);

  const { data, error } = await q;
  if (error) {
    console.error("[care] listSessionsForClinic:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  // Resolve therapist names via list_clinic_members.
  const members = await listClinicMembers(params.organizationId);
  const memberMap = new Map<string, ClinicMember>();
  for (const m of members) memberMap.set(m.id, m);

  return rows.map<TherapySession>((row) => mapRow(row, memberMap));
}

export async function listSessionsForChild(
  organizationId: string,
  childProfileId: string,
): Promise<TherapySession[]> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("therapy_sessions")
    .select(
      `id, clinic_organization_id, child_profile_id, therapist_profile_id,
       therapy_type, scheduled_at, duration_minutes, status, notes,
       parent_visible_summary, created_at, updated_at,
       child_profiles:child_profile_id ( display_name )`,
    )
    .eq("clinic_organization_id", organizationId)
    .eq("child_profile_id", childProfileId)
    .order("scheduled_at", { ascending: false });

  if (error) {
    console.error("[care] listSessionsForChild:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const members = await listClinicMembers(organizationId);
  const memberMap = new Map<string, ClinicMember>();
  for (const m of members) memberMap.set(m.id, m);

  return rows.map<TherapySession>((row) => mapRow(row, memberMap));
}

export interface CreateSessionInput {
  clinicOrganizationId: string;
  childProfileId: string;
  therapistProfileId: string;
  createdByProfileId: string;
  therapyType: TherapyType;
  scheduledAt: string;
  durationMinutes?: number | null;
  notes?: string | null;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<{ id: string } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const id = crypto.randomUUID();
  const { error } = await supabase.from("therapy_sessions").insert({
    id,
    clinic_organization_id: input.clinicOrganizationId,
    child_profile_id: input.childProfileId,
    therapist_profile_id: input.therapistProfileId,
    therapy_type: input.therapyType,
    scheduled_at: input.scheduledAt,
    duration_minutes: input.durationMinutes ?? null,
    notes: input.notes?.trim() || null,
    created_by_profile_id: input.createdByProfileId,
  });
  if (error) {
    console.error("[care] createSession:", error);
    return { error: mapSessionError(error) };
  }
  return { id };
}

export interface UpdateSessionInput {
  therapistProfileId?: string;
  therapyType?: TherapyType;
  scheduledAt?: string;
  durationMinutes?: number | null;
  status?: SessionStatus;
  notes?: string | null;
}

export async function updateSession(
  sessionId: string,
  patch: UpdateSessionInput,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const row: Record<string, unknown> = {};
  if (patch.therapistProfileId !== undefined)
    row.therapist_profile_id = patch.therapistProfileId;
  if (patch.therapyType !== undefined) row.therapy_type = patch.therapyType;
  if (patch.scheduledAt !== undefined) row.scheduled_at = patch.scheduledAt;
  if (patch.durationMinutes !== undefined)
    row.duration_minutes = patch.durationMinutes;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;

  if (Object.keys(row).length === 0) return { error: "No changes to save." };

  const { error } = await supabase
    .from("therapy_sessions")
    .update(row)
    .eq("id", sessionId);
  if (error) {
    console.error("[care] updateSession:", error);
    return { error: mapSessionError(error) };
  }
  return { ok: true };
}

// ── Acceptance flow ─────────────────────────────────────────────────────

/** Inserts a 'therapy_client' membership for a school-shared child the
 *  active clinic has an active identity grant on. RLS enforces both
 *  conditions; the call surfaces a friendly error otherwise. */
export async function acceptChildAsTherapyClient(
  organizationId: string,
  childProfileId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;
  const { error } = await supabase.from("child_profile_memberships").insert({
    child_profile_id: childProfileId,
    organization_id: organizationId,
    relationship_kind: "therapy_client",
    status: "active",
    started_at: new Date().toISOString(),
    created_in_app: "lauris_care",
  });
  if (error) {
    console.error("[care] acceptChildAsTherapyClient:", error);
    if (error.code === "23505") {
      return { error: "This child is already accepted as a therapy client." };
    }
    if (/violates row-level security/i.test(error.message ?? "")) {
      return {
        error:
          "Acceptance failed. Confirm there's an active identity grant for this child to your clinic.",
      };
    }
    return { error: error.message };
  }
  return { ok: true };
}

/** Resolves the child↔clinic membership state for the active clinic
 *  (used to branch the detail-page UI). */
export async function getChildClinicMembershipState(
  organizationId: string,
  childProfileId: string,
): Promise<ChildClinicMembershipState> {
  const supabase = createClient() as AnyClient;

  // 1) Active membership in the clinic (any kind).
  const { data: cpmRows } = await supabase
    .from("child_profile_memberships")
    .select("relationship_kind, status")
    .eq("child_profile_id", childProfileId)
    .eq("organization_id", organizationId)
    .eq("status", "active");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((cpmRows ?? []) as any[])) {
    if (r.relationship_kind === "clinic_client") return "owned";
    if (r.relationship_kind === "therapy_client") return "accepted";
  }

  // 2) No membership. Check active grant.
  const { data: grants } = await supabase
    .from("child_profile_access_grants")
    .select("id")
    .eq("child_profile_id", childProfileId)
    .eq("target_organization_id", organizationId)
    .eq("status", "active")
    .gt("valid_until", new Date().toISOString())
    .limit(1);
  if (grants && grants.length > 0) return "shared_pending";

  return "shared_no_grant";
}

// ── Phase 6E.1 — Session notes ──────────────────────────────────────────

const NOTE_COLUMNS =
  "id, therapy_session_id, authored_by_profile_id, " +
  "session_objective, activities, child_response, progress_observed, " +
  "home_practice, private_internal_note, created_at, updated_at";

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNoteRow(row: any, authorName: string | null): TherapySessionNote {
  return {
    id: row.id,
    therapySessionId: row.therapy_session_id,
    authoredByProfileId: row.authored_by_profile_id,
    authorName,
    sessionObjective: row.session_objective ?? null,
    activities: row.activities ?? null,
    childResponse: row.child_response ?? null,
    progressObserved: row.progress_observed ?? null,
    homePractice: row.home_practice ?? null,
    privateInternalNote: row.private_internal_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns the single note row for a session, or null if none exists. */
export async function getNoteForSession(
  sessionId: string,
  organizationId: string,
): Promise<TherapySessionNote | null> {
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("therapy_session_notes")
    .select(NOTE_COLUMNS)
    .eq("therapy_session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("[care] getNoteForSession:", error);
    return null;
  }
  if (!data) return null;

  const members = await listClinicMembers(organizationId);
  const author = members.find((m) => m.id === data.authored_by_profile_id);
  return mapNoteRow(data, author?.fullName ?? author?.email ?? null);
}

/** Returns the set of session ids in `sessionIds` that have a note row.
 *  Used to drive the small "has notes" indicator on session list rows. */
export async function listSessionIdsWithNotes(
  sessionIds: string[],
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const supabase = createClient() as AnyClient;
  const { data, error } = await supabase
    .from("therapy_session_notes")
    .select("therapy_session_id")
    .in("therapy_session_id", sessionIds);
  if (error) {
    console.error("[care] listSessionIdsWithNotes:", error);
    return new Set();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Set(((data ?? []) as any[]).map((r) => r.therapy_session_id));
}

/** Creates a new note (if none exists) or updates the existing one.
 *  Last-write-wins; no optimistic locking in v1. The parent session
 *  must NOT be in status='cancelled' (RLS rejects the write). */
export async function upsertSessionNote(
  sessionId: string,
  authorProfileId: string,
  patch: TherapySessionNotePatch,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient() as AnyClient;

  // Resolve existing note (1:1).
  const { data: existing, error: lookupErr } = await supabase
    .from("therapy_session_notes")
    .select("id")
    .eq("therapy_session_id", sessionId)
    .maybeSingle();
  if (lookupErr) {
    console.error("[care] upsertSessionNote lookup:", lookupErr);
    return { error: mapNoteError(lookupErr) };
  }

  const fields = {
    session_objective: emptyToNull(patch.sessionObjective ?? null),
    activities: emptyToNull(patch.activities ?? null),
    child_response: emptyToNull(patch.childResponse ?? null),
    progress_observed: emptyToNull(patch.progressObserved ?? null),
    home_practice: emptyToNull(patch.homePractice ?? null),
    private_internal_note: emptyToNull(patch.privateInternalNote ?? null),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("therapy_session_notes")
      .update(fields)
      .eq("id", existing.id);
    if (error) {
      console.error("[care] upsertSessionNote update:", error);
      return { error: mapNoteError(error) };
    }
    return { ok: true };
  }

  const { error } = await supabase.from("therapy_session_notes").insert({
    id: crypto.randomUUID(),
    therapy_session_id: sessionId,
    authored_by_profile_id: authorProfileId,
    ...fields,
  });
  if (error) {
    console.error("[care] upsertSessionNote insert:", error);
    return { error: mapNoteError(error) };
  }
  return { ok: true };
}

function mapNoteError(err: { code?: string; message?: string }): string {
  if (err.message && /violates row-level security/i.test(err.message)) {
    return "Couldn't save these notes. Notes can't be added to cancelled sessions.";
  }
  if (err.code === "42501") {
    return "This change isn't allowed. Some fields are locked once a note is created.";
  }
  if (err.code === "23505") {
    return "A note already exists for this session.";
  }
  return err.message || "Failed to save session notes.";
}

// ── Helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any, memberMap: Map<string, ClinicMember>): TherapySession {
  const m = memberMap.get(row.therapist_profile_id);
  return {
    id: row.id,
    clinicOrganizationId: row.clinic_organization_id,
    childProfileId: row.child_profile_id,
    childDisplayName: row.child_profiles?.display_name ?? null,
    therapistProfileId: row.therapist_profile_id,
    therapistName: m?.fullName ?? m?.email ?? null,
    therapyType: row.therapy_type as TherapyType,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? null,
    status: row.status as SessionStatus,
    notes: row.notes ?? null,
    parentVisibleSummary: row.parent_visible_summary ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionError(err: { code?: string; message?: string }): string {
  if (err.message && /violates row-level security/i.test(err.message)) {
    return "Couldn't save this session. The child must be a clinic client or accepted therapy client first.";
  }
  if (err.code === "42501") {
    return "This change isn't allowed. Some fields are immutable after the session is created.";
  }
  if (err.code === "23514") {
    return "Invalid value. Check the therapy type and status.";
  }
  return err.message || "Failed to save session.";
}
