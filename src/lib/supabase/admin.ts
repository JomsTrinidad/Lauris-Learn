/**
 * Server-only utilities for the Supabase service-role client.
 * Import ONLY from API routes (src/app/api/**). Never import from client components.
 *
 * This module provides:
 *   createAdminClient()            — RLS-bypassing admin client for server-side validation
 *   insertAuditLog()               — writes to audit_logs on behalf of service-role routes
 *                                    (audit triggers cannot fire when auth.uid() is NULL)
 *   insertEnrollmentTransition()   — writes to enrollment_transitions; non-blocking
 */

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

// Large/binary fields excluded from logged values (mirrors the trigger in 036_audit_logs.sql)
const STRIP_FIELDS = new Set([
  "photo_path", "receipt_photo_path", "avatar_url", "logo_url", "photos", "branding",
]);

function stripBinary(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !STRIP_FIELDS.has(k))
  );
}

export interface AuditEntry {
  schoolId:    string | null;
  actorUserId: string | null;
  actorRole:   string | null;
  tableName:   string;
  recordId:    string | null;
  action:      AuditAction;
  oldValues?:  Record<string, unknown> | null;
  newValues?:  Record<string, unknown> | null;
}

/**
 * Insert an audit log row using the service-role client.
 * Failures are logged but never thrown — audit must not block the main operation.
 */
export async function insertAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    school_id:     entry.schoolId,
    actor_user_id: entry.actorUserId,
    actor_role:    entry.actorRole,
    table_name:    entry.tableName,
    record_id:     entry.recordId,
    action:        entry.action,
    old_values:    entry.oldValues ? stripBinary(entry.oldValues) : null,
    new_values:    entry.newValues ? stripBinary(entry.newValues) : null,
  });
  if (error) {
    console.error("[audit_log] Insert failed:", { table: entry.tableName, action: entry.action, error });
  }
}

import type { TransitionKind } from "@/lib/enrollment-transitions";

// ── Class assignment helper ───────────────────────────────────────────────────

export type AssignmentKind = "initial" | "transfer" | "correction";

export interface ClassAssignmentInput {
  enrollmentId:  string;
  classId:       string;
  studentId:     string;
  schoolYearId:  string;
  startDate:     string;          // YYYY-MM-DD
  kind:          AssignmentKind;
  changedBy?:    string | null;
  changeReason?: string | null;
  /** true = also UPDATE enrollments.class_id (for transfers); false = skip (new enrollments set class_id in INSERT) */
  syncEnrollment: boolean;
}

/**
 * Insert a student_class_assignments row and optionally sync enrollments.class_id.
 *
 * THIS IS THE ONLY SANCTIONED WAY TO CHANGE A STUDENT'S CLASS.
 * Do NOT write to student_class_assignments directly. Do NOT update enrollments.class_id
 * on a transfer without calling this — the assignment record and the enrollment cache
 * must stay in sync or historical attendance queries will return wrong class membership.
 *
 * STRONGLY CONSISTENT — failures propagate to the caller as { error: string }.
 * The caller MUST return HTTP 500 when this returns a non-null error.
 *
 * For transfers (prior open assignment exists, different day):
 *   1. Close the prior open assignment (end_date = startDate - 1).
 *   2. INSERT the new assignment row with the caller-supplied kind.
 *   3. UPDATE enrollments.class_id (only when syncEnrollment=true).
 *   If step 3 fails, best-effort rollback: delete the row just inserted.
 *
 * For same-day corrections (prior open start_date === input startDate):
 *   The prior row is closed with end_date = startDate (one-day inclusive range).
 *   assignment_kind on the closed row is flipped to 'correction'.
 *   The new row also receives assignment_kind = 'correction'.
 *   end_date is never set to a value less than start_date.
 */
export async function assignStudentToClass(
  admin: ReturnType<typeof createAdminClient>,
  input: ClassAssignmentInput,
): Promise<{ error: string | null }> {
  const { enrollmentId, classId, studentId, schoolYearId, startDate, kind, changedBy, changeReason, syncEnrollment } = input;

  // effectiveKind may be promoted to 'correction' for same-day scenarios
  let effectiveKind: AssignmentKind = kind;

  // ── Step 1: close any currently open assignment for this enrollment ──────
  if (kind === "transfer" || kind === "correction") {
    // Find the open row (end_date IS NULL)
    const { data: open, error: openErr } = await admin
      .from("student_class_assignments")
      .select("id, start_date")
      .eq("enrollment_id", enrollmentId)
      .is("end_date", null)
      .maybeSingle();

    if (openErr) {
      console.error("[assignStudentToClass] Failed to query open assignment:", openErr);
      return { error: `Failed to query existing assignment: ${openErr.message}` };
    }

    if (open) {
      // Determine close date. Rule: end_date must never be less than start_date.
      // Normal transfer: close at startDate - 1 (no overlap with new assignment).
      // Same-day: close at startDate itself (inclusive one-day range); flip kind
      //           to 'correction' on both the closed row and the new row.
      const isSameDay = open.start_date === startDate;
      let closeDateStr: string;
      if (isSameDay) {
        closeDateStr = startDate;
        effectiveKind = "correction";
      } else {
        const d = new Date(startDate);
        d.setDate(d.getDate() - 1);
        closeDateStr = d.toISOString().slice(0, 10);
      }

      const { error: closeErr } = await admin
        .from("student_class_assignments")
        .update({
          end_date:        closeDateStr,
          ...(isSameDay ? { assignment_kind: "correction" as const } : {}),
        })
        .eq("id", open.id);

      if (closeErr) {
        console.error("[assignStudentToClass] Failed to close prior assignment:", closeErr);
        return { error: `Failed to close prior assignment: ${closeErr.message}` };
      }
    }
  }

  // ── Step 2: INSERT the new assignment row ────────────────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from("student_class_assignments")
    .insert({
      enrollment_id:   enrollmentId,
      class_id:        classId,
      student_id:      studentId,
      school_year_id:  schoolYearId,
      assignment_kind: effectiveKind,
      start_date:      startDate,
      end_date:        null,
      changed_by:      changedBy ?? null,
      change_reason:   changeReason ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[assignStudentToClass] INSERT failed:", insertErr);
    return { error: `Failed to create assignment record: ${insertErr?.message ?? "unknown"}` };
  }

  // ── Step 3: sync enrollments.class_id (transfers only) ──────────────────
  if (syncEnrollment) {
    const { error: syncErr } = await admin
      .from("enrollments")
      .update({ class_id: classId })
      .eq("id", enrollmentId);

    if (syncErr) {
      console.error("[assignStudentToClass] enrollments.class_id sync failed:", syncErr);
      // Best-effort rollback: remove the assignment row we just inserted
      await admin.from("student_class_assignments").delete().eq("id", inserted.id);
      return { error: `Failed to sync enrollment class: ${syncErr.message}` };
    }
  }

  return { error: null };
}

export interface EnrollmentTransitionEntry {
  enrollmentId:           string;
  transitionKind:         TransitionKind;
  fromStatus?:            string | null;
  toStatus:               string;
  fromProgressionStatus?: string | null;
  toProgressionStatus?:   string | null;
  changedBy?:             string | null;
  changeReason?:          string | null;
}

/**
 * Insert an enrollment transition row using the service-role client.
 * Failures are logged but never thrown — must not block the main operation.
 */
export async function insertEnrollmentTransition(
  admin: ReturnType<typeof createAdminClient>,
  entry: EnrollmentTransitionEntry,
): Promise<void> {
  const { error } = await admin.from("enrollment_transitions").insert({
    enrollment_id:            entry.enrollmentId,
    transition_kind:          entry.transitionKind,
    from_status:              entry.fromStatus             ?? null,
    to_status:                entry.toStatus,
    from_progression_status:  entry.fromProgressionStatus  ?? null,
    to_progression_status:    entry.toProgressionStatus    ?? null,
    changed_by:               entry.changedBy              ?? null,
    change_reason:            entry.changeReason           ?? null,
  });
  if (error) {
    console.error("[enrollment_transition] Insert failed:", {
      enrollmentId: entry.enrollmentId,
      kind:         entry.transitionKind,
      error,
    });
  }
}
