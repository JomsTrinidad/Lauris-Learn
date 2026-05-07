import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface DashboardStats {
  totalEnrolled: number;
  unpaidCount: number;
  overdueCount: number;
  upcomingEvents: number;
  inquiryCount: number;
  waitlistedCount: number;
  enrolledCount: number;
}

/**
 * useDashboardStats — fetch summary stats for the dashboard.
 *
 * High-traffic read: Dashboard page loads multiple stats.
 * Breaking these out as separate queries allows them to be:
 * - Cached independently
 * - Fetched in parallel
 * - Retried individually if one fails
 *
 * Note: This is currently a composite hook. In the future, it can be split
 * into individual hooks (useEnrolledCount, useUnpaidCount, etc.) for finer control.
 */
export function useDashboardStats(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.dashboard.stats(schoolId || "", schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      // Fetch all stats in parallel
      const [enrolled, unpaid, overdue, upcoming, inquiry, waitlisted] = await Promise.all([
        // Enrolled students
        supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("school_year_id", schoolYearId)
          .eq("status", "enrolled"),

        // Unpaid billing records
        supabase
          .from("billing_records")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .in("status", ["unpaid", "partial"]),

        // Overdue billing records
        supabase
          .from("billing_records")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "overdue"),

        // Upcoming events (next 30 days)
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .gte("event_date", new Date().toISOString().split("T")[0])
          .lte("event_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),

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
        unpaidCount: unpaid.count || 0,
        overdueCount: overdue.count || 0,
        upcomingEvents: upcoming.count || 0,
        inquiryCount: inquiry.count || 0,
        waitlistedCount: waitlisted.count || 0,
        enrolledCount: enrolled.count || 0,
      };

      return stats;
    },
    enabled: !!(schoolId && schoolYearId),
    // Refresh stats every 60 seconds on the dashboard
    // (slower than default staleTime but prevents excessive polling)
    staleTime: 60 * 1000,
  });
}
