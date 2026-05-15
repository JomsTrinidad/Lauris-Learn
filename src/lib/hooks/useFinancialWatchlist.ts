import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface FinancialWatchlistData {
  // Critical
  overdueCount: number;
  overdueAmount: number;
  overdueOver30Count: number;
  overdueStudentCount: number;

  // Action This Week
  dueSoonCount: number;
  dueSoonAmount: number;
  dueSoonStudentCount: number;

  // At Risk
  repeatedLateCount: number; // distinct students with 2+ overdue records

  // Snapshot
  totalOutstanding: number;
  collectionRate: number;
  familiesWithBalances: number;
}

/**
 * useFinancialWatchlist — operational billing attention system for the dashboard.
 *
 * Intentionally fetches ALL billing records for the school (no school-year filter),
 * matching the billing page's scope — so overdue records from prior years appear here
 * exactly as they do on the billing page.
 *
 * Overdue definition mirrors computeStatus() in src/features/billing/utils.ts:
 *   A record is overdue when:
 *     - balance > 0 (amount_due minus confirmed payments)
 *     - NO payments have been made (amountPaid === 0; partial payment → "partial", not "overdue")
 *     - due_date exists and is in the past
 *
 * This means DB status='overdue' records with a partial payment are counted as "partial",
 * not overdue — consistent with how the billing page renders them.
 */
export function useFinancialWatchlist(schoolId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.financialWatchlist.for(schoolId || ""),
    queryFn: async (): Promise<FinancialWatchlistData> => {
      if (!schoolId) throw new Error("schoolId required");

      const today = new Date().toISOString().split("T")[0];
      const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // Fetch ALL active + paid billing records for this school — no year filter.
      // Matches the billing page scope so overdue records from prior years appear here.
      const { data: billingRows, error: billError } = await supabase
        .from("billing_records")
        .select("id, student_id, amount_due, status, due_date")
        .eq("school_id", schoolId)
        .in("status", ["unpaid", "partial", "overdue", "paid"]);
      if (billError) throw billError;

      const records = billingRows ?? [];
      const ids = records.map((b) => b.id);

      // Fetch confirmed payments for all these records (single batch).
      const paidByRecord: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: paymentRows, error: payError } = await supabase
          .from("payments")
          .select("billing_record_id, amount")
          .eq("status", "confirmed")
          .in("billing_record_id", ids);
        if (payError) throw payError;
        (paymentRows ?? []).forEach((p) => {
          paidByRecord[p.billing_record_id] =
            (paidByRecord[p.billing_record_id] ?? 0) + Number(p.amount);
        });
      }

      // ── Helpers ─────────────────────────────────────────────────────────────

      const remaining = (id: string, amountDue: number) =>
        Math.max(0, amountDue - (paidByRecord[id] ?? 0));

      // Mirrors computeStatus() from src/features/billing/utils.ts exactly.
      // Key invariant: if any payment has been made (amountPaid > 0), the effective
      // status is "partial", not "overdue" — even if the DB status column says "overdue".
      const isEffectivelyOverdue = (b: { id: string; status: string; amount_due: number | string; due_date: string | null }) => {
        if (b.status === "cancelled" || b.status === "refunded" || b.status === "waived") return false;
        const paid = paidByRecord[b.id] ?? 0;
        const balance = Number(b.amount_due) - paid;
        if (balance <= 0) return false;   // fully paid
        if (paid > 0) return false;        // partial payment → not overdue (matches computeStatus)
        if (b.status === "paid") return false;
        return !!b.due_date && b.due_date < today;
      };

      // Due soon: has an outstanding balance and due_date falls within the next 7 days.
      const isEffectivelyDueSoon = (b: { id: string; status: string; amount_due: number | string; due_date: string | null }) => {
        if (b.status === "cancelled" || b.status === "refunded" || b.status === "waived") return false;
        const balance = remaining(b.id, Number(b.amount_due));
        if (balance <= 0) return false;
        return !!b.due_date && b.due_date >= today && b.due_date <= sevenDaysLater;
      };

      // ── Categorise ──────────────────────────────────────────────────────────

      const activeRecords = records.filter((b) => b.status !== "paid" || remaining(b.id, Number(b.amount_due)) > 0);
      const overdueRecords = records.filter(isEffectivelyOverdue);
      const dueSoonRecords = records.filter(isEffectivelyDueSoon);

      // ── Amounts ─────────────────────────────────────────────────────────────

      const overdueAmount = overdueRecords.reduce(
        (sum, b) => sum + remaining(b.id, Number(b.amount_due)),
        0,
      );
      const dueSoonAmount = dueSoonRecords.reduce(
        (sum, b) => sum + remaining(b.id, Number(b.amount_due)),
        0,
      );
      // Total outstanding = all records with remaining balance > 0.
      const totalOutstanding = records.reduce(
        (sum, b) => sum + remaining(b.id, Number(b.amount_due)),
        0,
      );

      // ── Severity ────────────────────────────────────────────────────────────

      const overdueOver30Count = overdueRecords.filter(
        (b) => b.due_date !== null && b.due_date < thirtyDaysAgo,
      ).length;

      // ── Student-level aggregation ────────────────────────────────────────────

      const overdueStudentCount = new Set(overdueRecords.map((b) => b.student_id)).size;
      const dueSoonStudentCount = new Set(dueSoonRecords.map((b) => b.student_id)).size;

      // Families with any outstanding balance (activeRecords with balance > 0).
      const recordsWithBalance = records.filter((b) => remaining(b.id, Number(b.amount_due)) > 0);
      const familiesWithBalances = new Set(recordsWithBalance.map((b) => b.student_id)).size;

      // Repeated late payers: students with 2+ overdue records (behavioral signal).
      const overdueByStudent: Record<string, number> = {};
      overdueRecords.forEach((b) => {
        overdueByStudent[b.student_id] =
          (overdueByStudent[b.student_id] ?? 0) + 1;
      });
      const repeatedLateCount = Object.values(overdueByStudent).filter(
        (c) => c >= 2,
      ).length;

      // ── Collection rate ─────────────────────────────────────────────────────
      // totalDue and totalPaid across ALL records (paid + outstanding) for accuracy.

      let totalDue = 0;
      let totalPaid = 0;
      records.forEach((b) => {
        totalDue += Number(b.amount_due);
        totalPaid += paidByRecord[b.id] ?? 0;
      });
      const collectionRate =
        totalDue > 0 ? Math.round((totalPaid / totalDue) * 10000) / 100 : 0;

      return {
        overdueCount: overdueRecords.length,
        overdueAmount,
        overdueOver30Count,
        overdueStudentCount,
        dueSoonCount: dueSoonRecords.length,
        dueSoonAmount,
        dueSoonStudentCount,
        repeatedLateCount,
        totalOutstanding,
        collectionRate,
        familiesWithBalances,
      };
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
