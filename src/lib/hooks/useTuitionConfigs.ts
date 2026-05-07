import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface TuitionConfig {
  id: string;
  academicPeriodId: string;
  periodName: string;
  level: string;
  totalAmount: number;
  months: number;
  classId: string | null;
  className: string | null;
  monthlyAmount: number;
}

/**
 * useTuitionConfigs — fetch tuition configurations with period/class joins
 *
 * Used by: Billing page (Generate modal rate lookup), Finance page (setup tab)
 *
 * Caches for 3 minutes (setup data, stable within session).
 * After config mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.tuitionConfigs.list(schoolId) })
 *
 * Returns: TuitionConfig[] (with computed monthlyAmount when not explicit)
 */
export function useTuitionConfigs(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.tuitionConfigs.list(schoolId || ""),
    queryFn: async () => {
      if (!schoolId) throw new Error("schoolId required");

      const { data, error } = await supabase
        .from("tuition_configs")
        .select(
          "id, academic_period_id, level, total_amount, months, monthly_amount, class_id, academic_periods(name), classes(name)"
        )
        .eq("school_id", schoolId)
        .order("level");

      if (error) throw error;

      return (data ?? []).map((t: any) => {
        const monthlyAmount =
          t.monthly_amount != null
            ? Number(t.monthly_amount)
            : t.months > 0
              ? Math.round(Number(t.total_amount) / t.months)
              : Number(t.total_amount);

        return {
          id: t.id,
          academicPeriodId: t.academic_period_id,
          periodName: t.academic_periods?.name ?? "",
          level: t.level ?? "",
          totalAmount: Number(t.total_amount),
          months: t.months,
          classId: t.class_id ?? null,
          className: t.classes?.name ?? null,
          monthlyAmount,
        } as TuitionConfig;
      });
    },
    enabled: !!schoolId,
    staleTime: 3 * 60 * 1000, // 3 minutes — setup data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
