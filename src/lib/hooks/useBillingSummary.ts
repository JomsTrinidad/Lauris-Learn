import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface BillingSummary {
  outstandingBalance: number;
  unpaidCount: number;
  collectionRate: number;
}

/**
 * useBillingSummary — fetch billing summary (outstanding balance, unpaid count, collection rate)
 *
 * Used by: Dashboard billing card
 *
 * Computes:
 * - outstandingBalance = SUM(amount_due - paid) WHERE status IN ('unpaid','partial','overdue')
 * - unpaidCount = COUNT WHERE status IN ('unpaid','partial','overdue')
 * - collectionRate = (paid / due) * 100 WHERE status IN ('unpaid','partial','overdue','paid')
 *
 * Cached for 30 seconds to prevent re-fetches on dashboard navigation.
 * After mutations affecting billing_records/payments, call queryClient.invalidateQueries
 * with this query key to refresh.
 *
 * Returns: { outstandingBalance, unpaidCount, collectionRate }
 */
export function useBillingSummary(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.billingSummary.for(schoolId || "", schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      // Fetch all billing records with unpaid/partial/overdue status
      const { data: billingRows, error: billError } = await supabase
        .from("billing_records")
        .select("id, amount_due, status")
        .eq("school_id", schoolId)
        .in("status", ["unpaid", "partial", "overdue", "paid"]);

      if (billError) throw billError;

      const ids = (billingRows ?? []).map((b) => b.id);
      let paidByRecord: Record<string, number> = {};

      // Fetch confirmed payments for these records
      if (ids.length > 0) {
        const { data: paymentRows, error: payError } = await supabase
          .from("payments")
          .select("billing_record_id, amount")
          .eq("status", "confirmed")
          .in("billing_record_id", ids);

        if (payError) throw payError;

        (paymentRows ?? []).forEach((p) => {
          paidByRecord[p.billing_record_id] = (paidByRecord[p.billing_record_id] ?? 0) + Number(p.amount);
        });
      }

      // Compute summary metrics
      let outstandingBalance = 0;
      let unpaidCount = 0;
      let totalDue = 0;
      let totalPaid = 0;

      (billingRows ?? []).forEach((b) => {
        const amountDue = Number(b.amount_due);
        const amountPaid = paidByRecord[b.id] ?? 0;
        const remaining = Math.max(0, amountDue - amountPaid);

        if (b.status === "unpaid" || b.status === "partial" || b.status === "overdue") {
          outstandingBalance += remaining;
          unpaidCount += 1;
        }

        if (b.status === "unpaid" || b.status === "partial" || b.status === "overdue" || b.status === "paid") {
          totalDue += amountDue;
          totalPaid += amountPaid;
        }
      });

      const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

      return {
        outstandingBalance,
        unpaidCount,
        collectionRate: Math.round(collectionRate * 100) / 100,
      } as BillingSummary;
    },
    enabled: !!(schoolId && schoolYearId),
    staleTime: 30 * 1000, // 30 seconds — balance is operational
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
