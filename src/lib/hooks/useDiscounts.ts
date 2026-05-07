import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

type DiscountType = "fixed" | "percentage" | "credit";
type DiscountScope = "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom";

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  scope: DiscountScope;
  value: number;
  isActive: boolean;
}

/**
 * useDiscounts — fetch active discounts for a school
 *
 * Used by: Finance page (Adjustments tab)
 *
 * Caches for 3 minutes (setup data, infrequently changed).
 * After discount mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.discounts.list(schoolId) })
 *
 * Returns: Discount[]
 */
export function useDiscounts(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.discounts.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const { data, error } = await supabase
        .from("discounts")
        .select("id, name, type, scope, value, is_active")
        .eq("school_id", schoolId)
        .order("name");

      if (error) throw error;

      return (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type as DiscountType,
        scope: d.scope as DiscountScope,
        value: Number(d.value),
        isActive: d.is_active,
      })) as Discount[];
    },
    enabled: !!schoolId,
    staleTime: 3 * 60 * 1000, // 3 minutes — setup data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
