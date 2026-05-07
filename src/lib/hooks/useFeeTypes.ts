import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface FeeType {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * useFeeTypes — fetch fee types for a school
 *
 * Used by: Billing page (Add Record modal, Generate modal), Finance page
 *
 * Returns all fee types including inactive ones (filters handled by components).
 *
 * Caches fee types for 3 minutes (setup data, changes infrequently).
 * After fee type mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.feeTypes.list(schoolId) })
 *
 * Returns: FeeType[] (id, name, description, isActive)
 */
export function useFeeTypes(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.feeTypes.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const { data, error } = await supabase
        .from("fee_types")
        .select("id, name, description, is_active")
        .eq("school_id", schoolId)
        .order("name");

      if (error) throw error;

      return (data ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description ?? "",
        isActive: f.is_active,
      })) as FeeType[];
    },
    enabled: !!schoolId,
    staleTime: 3 * 60 * 1000, // 3 minutes — setup data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
