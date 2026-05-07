import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface AcademicPeriod {
  id: string;
  name: string;
  schoolYearId: string;
  schoolYearName: string;
  startDate: string;
  endDate: string;
}

/**
 * useAcademicPeriods — fetch academic periods with school years
 *
 * Used by: Billing page (Generate modal period selector), Finance page (setup)
 *
 * Caches for 5 minutes (very stable, changes rare mid-session).
 * After period mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.academicPeriods.list(schoolId) })
 *
 * Returns: AcademicPeriod[]
 */
export function useAcademicPeriods(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.academicPeriods.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const { data, error } = await supabase
        .from("academic_periods")
        .select("id, name, school_year_id, start_date, end_date, school_years(name)")
        .eq("school_id", schoolId)
        .order("start_date");

      if (error) throw error;

      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        schoolYearId: p.school_year_id,
        schoolYearName: p.school_years?.name ?? "",
        startDate: p.start_date,
        endDate: p.end_date,
      })) as AcademicPeriod[];
    },
    enabled: !!schoolId,
    staleTime: 5 * 60 * 1000, // 5 minutes — very stable setup data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
