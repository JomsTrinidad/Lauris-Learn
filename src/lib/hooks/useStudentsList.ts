import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  student_code: string | null;
  preferred_name: string | null;
  photo_url: string | null;
  child_profile_id: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  alternate_contact_number: string | null;
  authorized_pickups: string | null;
  primary_language: string | null;
  special_needs: string | null;
  teacher_notes: string | null;
  admin_notes: string | null;
  guardians: Array<{
    id: string;
    full_name: string;
    relationship: string | null;
    phone: string | null;
    email: string | null;
    is_primary: boolean;
    communication_preference: string | null;
  }>;
  enrollments: Array<{
    id: string;
    status: string;
    class_id: string;
    school_year_id: string;
    academic_period_id: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    progression_status: string | null;
    progression_notes: string | null;
    classes: Array<{
      name: string;
      next_level: string | null;
      class_levels: Array<{ name: string }>;
    }>;
    academic_periods: Array<{ name: string }>;
    school_years: Array<{ name: string }>;
  }>;
}

/**
 * useStudentsList — fetch all students with their enrollments, guardians, and LRN identifiers.
 *
 * High-traffic read: Students page loads this on every navigation.
 * Caching + deduplication prevents re-fetching when navigating back/forward.
 *
 * Returns two parallel queries:
 *   1. Students with nested relationships
 *   2. LRN identifiers (kept separate to avoid schema-cache breakage)
 */
export function useStudentsList(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.students.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      // Students query with relationships
      const { data: studentRows, error: studentsError } = await supabase
        .from("students")
        .select(`
          id, first_name, last_name, date_of_birth, gender,
          student_code, preferred_name, photo_url, child_profile_id,
          allergies, medical_conditions, emergency_contact_name, emergency_contact_phone, alternate_contact_number,
          authorized_pickups, primary_language, special_needs, teacher_notes, admin_notes,
          guardians(id, full_name, relationship, phone, email, is_primary, communication_preference),
          enrollments(id, status, class_id, school_year_id, academic_period_id, start_date, end_date, created_at, progression_status, progression_notes, classes(name, next_level, class_levels(name)), academic_periods(name), school_years(name))
        `)
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("last_name");

      if (studentsError) throw studentsError;

      // LRN identifiers query (kept separate to avoid schema cache issues)
      const profileIds = (studentRows ?? [])
        .map((s: StudentRow) => s.child_profile_id)
        .filter((id): id is string => !!id);

      const lrnByProfile = new Map<string, { id: string; value: string }>();
      if (profileIds.length > 0) {
        const { data: idRows, error: idError } = await supabase
          .from("child_identifiers")
          .select("id, child_profile_id, identifier_value")
          .eq("identifier_type", "lrn")
          .in("child_profile_id", profileIds);

        if (idError) throw idError;

        ((idRows ?? []) as Array<{
          id: string;
          child_profile_id: string;
          identifier_value: string;
        }>).forEach((r) => {
          if (!lrnByProfile.has(r.child_profile_id)) {
            lrnByProfile.set(r.child_profile_id, { id: r.id, value: r.identifier_value });
          }
        });
      }

      return {
        students: (studentRows ?? []) as StudentRow[],
        lrnByProfile,
      };
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,      // 30 seconds — balance freshness with cache hits
    gcTime: 5 * 60 * 1000,     // 5 minutes — keep around for back-navigation
  });
}
