import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  school_year_id: string;
  status: "enrolled" | "waitlisted" | "inquiry" | "withdrawn" | "completed";
  enrolled_at: string | null;
}

/**
 * useEnrollments — fetch all enrollments for the school in the active year.
 *
 * High-traffic read: Students page uses this to show class assignments.
 * Caching reduces DB hits when navigating between student detail and list.
 */
export function useEnrollments(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.enrollments.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, class_id, school_year_id, status, enrolled_at")
        .eq("school_year_id", schoolYearId)
        .in("status", ["enrolled", "waitlisted", "inquiry", "withdrawn", "completed"]);

      if (error) throw error;
      return (data || []) as EnrollmentRow[];
    },
    enabled: !!(schoolId && schoolYearId),
  });
}

/**
 * useEnrollmentsForStudent — fetch all enrollments for a specific student.
 *
 * Used on student detail page to show enrollment history.
 */
export function useEnrollmentsForStudent(studentId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.enrollments.byStudent(studentId || ""),
    queryFn: async () => {
      if (!studentId) throw new Error("studentId required");

      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, class_id, school_year_id, status, enrolled_at")
        .eq("student_id", studentId)
        .order("school_year_id DESC, created_at DESC");

      if (error) throw error;
      return (data || []) as EnrollmentRow[];
    },
    enabled: !!studentId,
  });
}
