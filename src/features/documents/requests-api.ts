/**
 * Document-request queries (Phase D step D14).
 *
 * Surfaces:
 *   - list/create/cancel for `document_requests`
 *   - guardian lookup so the modal can show "request from <guardian>" choices
 *
 * RLS reminders (056):
 *   - school staff SELECT same-school
 *   - school staff INSERT (requires requester_user_id = auth.uid())
 *   - school staff UPDATE same-school (used for cancel + mark-reviewed)
 *   - parent / external_contact UPDATE for self-targeted requests — used by
 *     Phase E and not exercised here
 *
 * Out of scope for v1:
 *   - school recipients (`requested_from_kind = 'school'`) — needs a
 *     cross-school directory we don't have yet
 *   - parent / external submission UI — Phase E
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { DocumentRequestRow, DocumentType, RequestStatus } from "./types";

type Client = SupabaseClient<Database>;

// ─── View-models ───────────────────────────────────────────────────────────

export interface RequestListItem extends DocumentRequestRow {
  student:                 { id: string; first_name: string; last_name: string } | null;
  requested_from_guardian: { id: string; full_name: string; email: string | null } | null;
  requested_from_external_contact: { id: string; full_name: string; email: string | null } | null;
  requester_user:          { id: string; full_name: string | null } | null;
}

export interface ListRequestsFilters {
  schoolId:  string;
  studentId?: string | null;
  status?:    RequestStatus | null;
}


// ─── Reads ─────────────────────────────────────────────────────────────────

export async function listRequests(
  supabase: Client,
  f: ListRequestsFilters,
): Promise<RequestListItem[]> {
  let q = supabase
    .from("document_requests")
    .select("*")
    .eq("school_id", f.schoolId)
    .order("created_at", { ascending: false });

  if (f.studentId) q = q.eq("student_id", f.studentId);
  if (f.status)    q = q.eq("status", f.status);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as DocumentRequestRow[];
  if (rows.length === 0) return [];

  return enrichRequests(supabase, rows);
}

interface GuardianRow {
  id:        string;
  full_name: string;
  email:     string | null;
  student_id: string;
}

export async function listGuardiansForStudent(
  supabase: Client,
  studentId: string,
): Promise<GuardianRow[]> {
  const { data, error } = await supabase
    .from("guardians")
    .select("id, full_name, email, student_id")
    .eq("student_id", studentId)
    .order("is_primary", { ascending: false })
    .order("full_name");
  if (error) throw error;
  return ((data ?? []) as unknown as GuardianRow[]);
}


// ─── Mutations ─────────────────────────────────────────────────────────────

export interface CreateRequestInput {
  schoolId:               string;
  studentId:              string;
  requestedDocumentType:  DocumentType;
  /** auth.uid() — required by INSERT policy. */
  requesterUserId:        string;
  reason:                 string;
  dueDate:                string | null; // YYYY-MM-DD
  recipient:
    | { kind: "parent";           guardianId: string }
    | { kind: "external_contact"; externalContactId: string };
}

export async function createRequest(
  supabase: Client,
  input: CreateRequestInput,
): Promise<{ id: string }> {
  // Client-side UUID — same anti INSERT…RETURNING pattern as elsewhere.
  const id = crypto.randomUUID();

  const recipientCols =
    input.recipient.kind === "parent"
      ? {
          requested_from_kind:        "parent" as const,
          requested_from_guardian_id: input.recipient.guardianId,
        }
      : {
          requested_from_kind:                 "external_contact" as const,
          requested_from_external_contact_id:  input.recipient.externalContactId,
        };

  const { error } = await supabase
    .from("document_requests")
    .insert({
      id,
      school_id:              input.schoolId,
      student_id:             input.studentId,
      requested_document_type: input.requestedDocumentType,
      requester_user_id:      input.requesterUserId,
      reason:                 input.reason,
      due_date:               input.dueDate,
      status:                 "requested",
      ...recipientCols,
    });

  if (error) throw error;
  return { id };
}


export interface CancelRequestInput {
  requestId: string;
  reason:    string | null;
}

/** School staff cancel — sets status='cancelled' + cancelled_at + reason. */
export async function cancelRequest(
  supabase: Client,
  input: CancelRequestInput,
): Promise<void> {
  const { error } = await supabase
    .from("document_requests")
    .update({
      status:           "cancelled",
      cancelled_at:     new Date().toISOString(),
      cancelled_reason: input.reason,
    })
    .eq("id", input.requestId);
  if (error) throw error;
}


// ─── Internal helpers ──────────────────────────────────────────────────────

async function enrichRequests(
  supabase: Client,
  rows: DocumentRequestRow[],
): Promise<RequestListItem[]> {
  const studentIds  = unique(rows.map((r) => r.student_id));
  const guardianIds = unique(rows.map((r) => r.requested_from_guardian_id).filter(isNonNull));
  const externalIds = unique(rows.map((r) => r.requested_from_external_contact_id).filter(isNonNull));
  const requesterIds = unique(rows.map((r) => r.requester_user_id).filter(isNonNull));

  const [studentsRes, guardiansRes, externalsRes, requestersRes] = await Promise.all([
    studentIds.length
      ? supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    guardianIds.length
      ? supabase.from("guardians").select("id, full_name, email").in("id", guardianIds)
      : Promise.resolve({ data: [], error: null }),
    externalIds.length
      ? supabase.from("external_contacts").select("id, full_name, email").in("id", externalIds)
      : Promise.resolve({ data: [], error: null }),
    requesterIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", requesterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  type StudentLite    = { id: string; first_name: string; last_name: string };
  type GuardianLite   = { id: string; full_name: string; email: string | null };
  type ExternalLite   = { id: string; full_name: string; email: string | null };
  type RequesterLite  = { id: string; full_name: string | null };

  const studentMap   = mapBy<StudentLite>((studentsRes.data as StudentLite[] | null) ?? []);
  const guardianMap  = mapBy<GuardianLite>((guardiansRes.data as GuardianLite[] | null) ?? []);
  const externalMap  = mapBy<ExternalLite>((externalsRes.data as ExternalLite[] | null) ?? []);
  const requesterMap = mapBy<RequesterLite>((requestersRes.data as RequesterLite[] | null) ?? []);

  return rows.map((r) => ({
    ...r,
    student:                          studentMap.get(r.student_id) ?? null,
    requested_from_guardian:          r.requested_from_guardian_id
      ? guardianMap.get(r.requested_from_guardian_id) ?? null
      : null,
    requested_from_external_contact:  r.requested_from_external_contact_id
      ? externalMap.get(r.requested_from_external_contact_id) ?? null
      : null,
    requester_user: r.requester_user_id ? requesterMap.get(r.requester_user_id) ?? null : null,
  }));
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function isNonNull<T>(x: T | null | undefined): x is T { return x != null; }
function mapBy<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
