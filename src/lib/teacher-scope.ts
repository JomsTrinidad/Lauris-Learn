/**
 * Centralized teacher-scope helpers.
 *
 * Used by Classes / Progress / Proud Moments / Students to derive the same
 * "what was this teacher connected to during a given school year" answer
 * without duplicating the lookup chain at each call site.
 *
 * The chain:
 *   auth_user_id
 *     → teacher_profiles.id (via the migration-066 bridge column)
 *     → class_teachers.class_id
 *     → classes (filtered by school_year_id)
 *     → enrollments (filtered by class_id + school_year_id) → student_id
 *
 * Notes:
 *   - These helpers do NOT replace RLS. They are convenience filters.
 *   - For HISTORICAL years, pass the historical school_year_id and the chain
 *     returns the teacher's instructional context as of that year.
 *   - "No assignment" / "no enrollment" returns an empty array. Callers decide
 *     whether to treat that as a hard-empty page (no rows) or fall through to
 *     a different code path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/**
 * Resolve the teacher_profiles.id for the signed-in auth user.
 * Returns null when the auth user has no teacher_profiles bridge row
 * (e.g. a teacher whose email was never linked to a teacher_profiles row).
 */
export async function fetchTeacherProfileId(
  supabase: Client,
  userId: string,
  schoolId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("teacher_profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Resolve the class IDs a teacher was assigned to during a SPECIFIC school year.
 * Inner-joins class_teachers with classes filtered by school_year_id, so this
 * naturally honors historical assignments.
 *
 * Returns [] when the teacher was not assigned to any class in that year.
 */
export async function fetchTeacherClassIdsForYear(
  supabase: Client,
  teacherProfileId: string,
  schoolId: string,
  schoolYearId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("class_teachers")
    .select("class_id, classes!inner(school_id, school_year_id, is_system)")
    .eq("teacher_id", teacherProfileId)
    .eq("classes.school_id", schoolId)
    .eq("classes.school_year_id", schoolYearId)
    .eq("classes.is_system", false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => r.class_id as string);
}

/**
 * Resolve the student IDs enrolled in a teacher's classes during a specific
 * school year. Deduplicates across classes.
 *
 * Returns [] when the teacher taught no classes (or no enrolled students) that year.
 */
export async function fetchTeacherStudentIdsForYear(
  supabase: Client,
  classIds: string[],
  schoolYearId: string,
): Promise<string[]> {
  if (classIds.length === 0) return [];
  const { data } = await supabase
    .from("enrollments")
    .select("student_id")
    .in("class_id", classIds)
    .eq("status", "enrolled")
    .eq("school_year_id", schoolYearId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((data ?? []) as any[]).map((r) => r.student_id as string);
  return Array.from(new Set(ids));
}

/**
 * Whether a (role, viewingYearId, activeYearId) combination should lock teacher
 * pages to historical/read-only mode.
 *
 * Pure helper — no I/O. Used to gate save handlers and toggle visibility.
 */
export function isTeacherHistorical(args: {
  userRole: string | null | undefined;
  viewingYearId: string | null | undefined;
  activeYearId: string | null | undefined;
}): boolean {
  if (args.userRole !== "teacher") return false;
  if (!args.activeYearId) return false;
  if (!args.viewingYearId) return false;
  return args.viewingYearId !== args.activeYearId;
}
