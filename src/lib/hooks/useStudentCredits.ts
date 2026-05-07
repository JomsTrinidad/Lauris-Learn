import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface StudentCredit {
  id: string;
  studentId: string;
  amount: number;
  description: string;
  createdAt: string;
}

/**
 * useStudentCredits — fetch student credits for a school
 *
 * Used by: Billing page (Adjustments tab, credit application modals)
 *
 * Returns all student credit records scoped to a school (for admin display/application).
 * Limit defaults to 1000; can be adjusted if needed.
 *
 * Caches for 2 minutes (setup/reference data, infrequent writes).
 * After credit mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.studentCredits.list(schoolId) })
 *
 * Returns: StudentCredit[] (id, studentId, amount, description, createdAt)
 */
export function useStudentCredits(schoolId: string | null, limit: number = 1000) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.studentCredits.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("student_credits")
        .select("id, student_id, amount, description, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as unknown[]).map((c: any) => ({
        id: c.id,
        studentId: c.student_id,
        amount: Number(c.amount),
        description: c.description ?? "",
        createdAt: c.created_at,
      })) as StudentCredit[];
    },
    enabled: !!schoolId,
    staleTime: 2 * 60 * 1000, // 2 minutes — setup/reference data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
