import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface DashboardStats {
  totalEnrolled: number;
  unpaidOnlyCount: number;
  partialCount: number;
  overdueCount: number;
  dueSoonCount: number;
  upcomingEvents: number;
  inquiryCount: number;
  waitlistedCount: number;
  enrolledCount: number;
}

export function useDashboardStats(
  schoolId: string | null,
  schoolYearId: string | null,
  yearStart: string | null = null,
  yearEnd: string | null = null,
) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.dashboard.stats(schoolId || "", schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      const today = new Date().toISOString().split("T")[0];
      const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const billingBase = () => {
        let q = supabase
          .from("billing_records")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId);
        if (yearStart) q = q.gte("billing_month", yearStart);
        if (yearEnd) q = q.lte("billing_month", yearEnd);
        return q;
      };

      const [enrolled, unpaidOnly, partial, overdue, dueSoon, upcoming, inquiry, waitlisted] =
        await Promise.all([
          // Enrolled students
          supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("school_year_id", schoolYearId)
            .eq("status", "enrolled"),

          // Unpaid but NOT yet overdue
          billingBase()
            .eq("status", "unpaid")
            .or(`due_date.is.null,due_date.gte.${today}`),

          // Partial payments
          billingBase().eq("status", "partial"),

          // Overdue: DB status 'overdue' OR (status 'unpaid' AND due_date < today)
          billingBase().or(
            `status.eq.overdue,and(status.eq.unpaid,due_date.lt.${today})`,
          ),

          // Due soon: unpaid or partial with due_date in the next 7 days
          billingBase()
            .in("status", ["unpaid", "partial"])
            .gte("due_date", today)
            .lte("due_date", sevenDaysLater),

          // Upcoming events (next 30 days)
          supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .gte("event_date", today)
            .lte(
              "event_date",
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            ),

          // Inquiry enrollments
          supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("school_year_id", schoolYearId)
            .eq("status", "inquiry"),

          // Waitlisted enrollments
          supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("school_year_id", schoolYearId)
            .eq("status", "waitlisted"),
        ]);

      const stats: DashboardStats = {
        totalEnrolled: enrolled.count || 0,
        unpaidOnlyCount: unpaidOnly.count || 0,
        partialCount: partial.count || 0,
        overdueCount: overdue.count || 0,
        dueSoonCount: dueSoon.count || 0,
        upcomingEvents: upcoming.count || 0,
        inquiryCount: inquiry.count || 0,
        waitlistedCount: waitlisted.count || 0,
        enrolledCount: enrolled.count || 0,
      };

      return stats;
    },
    enabled: !!(schoolId && schoolYearId),
    staleTime: 60 * 1000,
  });
}
