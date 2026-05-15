import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";
import { PENDING_REVIEW_STATUSES } from "@/features/plans/review-queue";

export interface PlanSignals {
  /** student_plans with status='draft' — active planning underway */
  draftCount: number;
  /** student_plans with status in ['submitted','in_review'] — pending coordination */
  awaitingReviewCount: number;
}

/**
 * Lightweight plan-signal counts for the dashboard Student Support section.
 *
 * Returns aggregate counts (not per-plan items) — the per-plan review queue
 * lives in the Needs Attention card and in Plans & Forms. This hook surfaces
 * the ambient coordination state: "work is being prepared" and "review needed."
 *
 * Enabled for staff roles only (school_admin / teacher / super_admin).
 * Parents don't have RLS access to student_plans so it's disabled for them.
 */
export function usePlanSignals(
  schoolId: string | null,
  userRole: string | null,
): UseQueryResult<PlanSignals> {
  const supabase = createClient();
  const isStaff =
    userRole === "school_admin" ||
    userRole === "teacher" ||
    userRole === "super_admin";

  return useQuery({
    queryKey: queryKeys.planSignals.for(schoolId ?? ""),
    queryFn: async (): Promise<PlanSignals> => {
      if (!schoolId) throw new Error("schoolId required");

      const [draftRes, reviewRes] = await Promise.all([
        supabase
          .from("student_plans")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "draft"),
        supabase
          .from("student_plans")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .in("status", [...PENDING_REVIEW_STATUSES]),
      ]);

      return {
        draftCount: draftRes.count ?? 0,
        awaitingReviewCount: reviewRes.count ?? 0,
      };
    },
    enabled: !!schoolId && isStaff,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
