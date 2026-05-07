import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface ClassOption {
  id: string;
  name: string;
  level: string;
  enrolled: number;
  capacity: number;
}

/**
 * useStudentsClasses — fetch classes for the active school year with enrollment counts.
 *
 * Used by Students page for the class picker and enrollment UI.
 * Requires activeYear.id because classes are scoped to school year.
 */
export function useStudentsClasses(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.classes.list(schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: classRows, error: classError } = await (supabase as any)
        .from("classes")
        .select("id, name, capacity, class_levels(name)")
        .eq("school_id", schoolId)
        .eq("school_year_id", schoolYearId)
        .eq("is_active", true)
        .eq("is_system", false)
        .order("start_time");

      if (classError) throw classError;

      const classIds = ((classRows ?? []) as Array<{
        id: string;
        name: string;
        capacity: number;
        class_levels: { name: string } | null;
      }>).map((c) => c.id);

      // Count enrolled students per class
      let enrolledByClass: Record<string, number> = {};
      if (classIds.length > 0) {
        const { data: enrollRows, error: enrollError } = await supabase
          .from("enrollments")
          .select("class_id")
          .in("class_id", classIds)
          .eq("status", "enrolled");

        if (enrollError) throw enrollError;

        (enrollRows ?? []).forEach((e) => {
          enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
        });
      }

      return (classRows ?? []).map((c: {
        id: string;
        name: string;
        capacity: number;
        class_levels: { name: string } | null;
      }) => ({
        id: c.id,
        name: c.name,
        level: c.class_levels?.name ?? "",
        capacity: c.capacity ?? 0,
        enrolled: enrolledByClass[c.id] ?? 0,
      })) as ClassOption[];
    },
    enabled: !!(schoolId && schoolYearId),
    staleTime: 30 * 1000,      // 30 seconds
    gcTime: 5 * 60 * 1000,     // 5 minutes
  });
}
