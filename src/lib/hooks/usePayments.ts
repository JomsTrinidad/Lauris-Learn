import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface PaymentRow {
  id: string;
  billingRecordId: string;
  studentName: string;
  className: string;
  description: string;
  billingMonth: string;
  amount: number;
  method: string;
  date: string;
  reference: string | null;
  orNumber: string | null;
  notes: string | null;
  receiptPhotoPath: string | null;
}

/**
 * usePayments — fetch all payments for a school with billing record context
 *
 * Used by: Billing page (Payments tab, analytics, summaries)
 *
 * Returns all payments ordered by date descending, enriched with billing record details.
 * Payments are fetched for records in the current school year (computed from records hook).
 *
 * Caches for 30 seconds (transactional, high-frequency reads).
 * After payment mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.payments.list(schoolId, schoolYearId) })
 *
 * Returns: PaymentRow[] (id, amount, method, date, orNumber, receiptPhotoPath, etc.)
 */
export function usePayments(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.payments.list(schoolId || "", schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      // First fetch billing records in this school year to get their IDs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bResult = await (supabase as any)
        .from("billing_records")
        .select("id")
        .eq("school_id", schoolId);

      if (bResult.error) throw bResult.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordIds: string[] = ((bResult.data ?? []) as any[]).map((b: any) => b.id);

      // Fetch all payments for those records
      if (recordIds.length === 0) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pResult = await (supabase as any)
        .from("payments")
        .select("id, billing_record_id, amount, payment_method, payment_date, reference_number, or_number, notes, receipt_photo_path")
        .in("billing_record_id", recordIds)
        .order("payment_date", { ascending: false });

      if (pResult.error) throw pResult.error;

      // Now fetch billing records again to enrich payments with context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bDetailResult = await (supabase as any)
        .from("billing_records")
        .select("id, student_id, class_id, description, billing_month, students(first_name, last_name), classes(name)")
        .in("id", recordIds);

      if (bDetailResult.error) throw bDetailResult.error;

      const recordMap = new Map();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (bDetailResult.data ?? []).forEach((b: any) => {
        recordMap.set(b.id, {
          studentName: b.students ? `${b.students.first_name} ${b.students.last_name}` : "—",
          className: b.classes?.name ?? "—",
          description: b.description ?? "",
          billingMonth: b.billing_month ? b.billing_month.substring(0, 7) : "",
        });
      });

      // Map payments with billing context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((pResult.data ?? []) as any[]).map((p: any) => {
        const context = recordMap.get(p.billing_record_id) || {
          studentName: "—",
          className: "—",
          description: "",
          billingMonth: "",
        };
        return {
          id: p.id,
          billingRecordId: p.billing_record_id,
          studentName: context.studentName,
          className: context.className,
          description: context.description,
          billingMonth: context.billingMonth,
          amount: Number(p.amount),
          method: p.payment_method,
          date: p.payment_date,
          reference: p.reference_number ?? null,
          orNumber: p.or_number ?? null,
          notes: p.notes ?? null,
          receiptPhotoPath: p.receipt_photo_path ?? null,
        };
      }) as PaymentRow[];
    },
    enabled: !!schoolId && !!schoolYearId,
    staleTime: 30 * 1000, // 30 seconds — transactional data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
