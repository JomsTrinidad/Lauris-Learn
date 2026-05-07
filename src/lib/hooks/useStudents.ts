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
  photo_url: string | null;
}

/**
 * useStudents — fetch all enrolled students for the school.
 *
 * Caching strategy:
 * - staleTime: 30s (operational SaaS — balance between fresh data and DB load)
 * - Deduplication: same schoolId will share a single in-flight request
 * - Automatic retry on network errors only
 *
 * Usage:
 * ```ts
 * const { data: students, isLoading, error } = useStudents(schoolId);
 * ```
 */
export function useStudents(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.students.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, date_of_birth, gender, student_code, photo_url")
        .eq("school_id", schoolId)
        .order("first_name, last_name");

      if (error) throw error;
      return (data || []) as StudentRow[];
    },
    enabled: !!schoolId, // Don't fetch if no schoolId
  });
}

/**
 * useStudent — fetch a single student with detail.
 *
 * Currently loads just the basic fields; detail pages may add more fields.
 */
export function useStudent(studentId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.students.detail(studentId || ""),
    queryFn: async () => {
      if (!studentId) throw new Error("studentId required");

      const { data, error } = await supabase
        .from("students")
        .select(
          "id, first_name, last_name, date_of_birth, gender, student_code, photo_url, " +
            "school_id, created_at, updated_at"
        )
        .eq("id", studentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });
}
