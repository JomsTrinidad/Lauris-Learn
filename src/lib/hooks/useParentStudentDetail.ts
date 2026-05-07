import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface ParentStudentDetail {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  studentCode: string | null;
  className: string;
  enrollmentStatus: string | null;
  primaryLanguage: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  photoUrl: string | null;
}

/**
 * useParentStudentDetail — fetch student profile for parent view
 *
 * Returns student identity, enrollment class, and health notes.
 * Cached for 30 seconds to prevent re-fetches on back-navigation.
 * Requires childId (which is the student_id).
 */
export function useParentStudentDetail(childId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.students.detail(childId || ""),
    queryFn: async () => {
      if (!childId) throw new Error("childId required");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("students")
        .select(`
          id, first_name, last_name, date_of_birth, gender, student_code, preferred_name,
          photo_url, allergies, medical_conditions, primary_language,
          enrollments(status, classes(name))
        `)
        .eq("id", childId)
        .single();

      if (!data) throw new Error("Student not found");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const enrollment = (d.enrollments ?? [])[0] ?? null;

      return {
        id: d.id,
        firstName: d.first_name,
        lastName: d.last_name,
        preferredName: d.preferred_name ?? null,
        dateOfBirth: d.date_of_birth ?? null,
        gender: d.gender ?? null,
        studentCode: d.student_code ?? null,
        className: enrollment?.classes?.name ?? "—",
        enrollmentStatus: enrollment?.status ?? null,
        primaryLanguage: d.primary_language ?? null,
        allergies: d.allergies ?? null,
        medicalConditions: d.medical_conditions ?? null,
        photoUrl: d.photo_url ?? null,
      } as ParentStudentDetail;
    },
    enabled: !!childId,
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
