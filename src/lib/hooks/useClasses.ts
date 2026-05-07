import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface ClassRow {
  id: string;
  name: string;
  level: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  is_active: boolean;
}

/**
 * useClasses — fetch all classes for the school in the active year.
 *
 * High-traffic read: used by Students page, Attendance page, Classes page, Billing page.
 * Caching prevents redundant fetches across these pages.
 */
export function useClasses(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.classes.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level, start_time, end_time, capacity, is_active")
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .order("name");

      if (error) throw error;
      return (data || []) as ClassRow[];
    },
    enabled: !!(schoolId && schoolYearId),
  });
}
