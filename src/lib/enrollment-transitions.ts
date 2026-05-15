import type { SupabaseClient } from "@supabase/supabase-js";

export type TransitionKind =
  | "enrolled"
  | "status_change"
  | "progression_classified"
  | "correction";

export interface EnrollmentTransitionInput {
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
 * Insert an enrollment transition row from a browser (RLS-enforced) Supabase client.
 * Non-blocking: logs a console.warn on failure but never throws.
 * Use this in client components (students/page.tsx).
 *
 * Call this EVERY TIME enrollments.status or enrollments.progression_status is written
 * from a client component. enrollment_transitions is the queryable lifecycle log for
 * those fields. Missing a call doesn't break current state, but degrades audit history.
 * Server-side routes should use insertEnrollmentTransition() from admin.ts instead.
 */
export async function insertEnrollmentTransitionClient(
  supabase: SupabaseClient,
  entry: EnrollmentTransitionInput,
): Promise<void> {
  const { error } = await supabase.from("enrollment_transitions").insert({
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
    console.warn("[enrollment_transition] Non-blocking client insert failed:", {
      enrollmentId: entry.enrollmentId,
      kind:         entry.transitionKind,
      error:        error.message,
    });
  }
}
