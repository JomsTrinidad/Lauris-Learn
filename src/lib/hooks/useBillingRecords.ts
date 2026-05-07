import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface BillingRecordRow {
  id: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string;
  description: string;
  dueDate: string | null;
  billingMonth: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  notes: string | null;
}

/**
 * useBillingRecords — fetch billing records with computed amountPaid per record
 *
 * Used by: Billing page (Bills tab, Payments tab, analytics, statements)
 *
 * Returns all billing records scoped to school, with amountPaid computed from confirmed payments.
 * Status is NOT computed here — that is left to consumers via computeStatus() utility.
 *
 * Caches for 30 seconds (transactional, high-frequency reads).
 * After billing mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.billingRecords.list(schoolId, schoolYearId) })
 *
 * Returns: BillingRecordRow[] (id, studentId, amountDue, amountPaid, status, dueDate, etc.)
 */
export function useBillingRecords(schoolId: string | null, schoolYearId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.billingRecords.list(schoolId || "", schoolYearId || ""),
    queryFn: async () => {
      if (!schoolId || !schoolYearId) throw new Error("schoolId and schoolYearId required");

      // Fetch billing records
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bResult = await (supabase as any)
        .from("billing_records")
        .select("id, student_id, class_id, amount_due, status, due_date, billing_month, description, notes, students(first_name, last_name), classes(name)")
        .eq("school_id", schoolId);

      if (bResult.error) throw bResult.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const billingRows = (bResult.data ?? []) as any[];
      const recordIds: string[] = billingRows.map((b) => b.id);

      // Fetch confirmed payments for all records
      let paidByRecord: Record<string, number> = {};
      if (recordIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pResult = await (supabase as any)
          .from("payments")
          .select("billing_record_id, amount")
          .eq("status", "confirmed")
          .in("billing_record_id", recordIds);

        if (pResult.error) throw pResult.error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((pResult.data ?? []) as any[]).forEach((p) => {
          paidByRecord[p.billing_record_id] = (paidByRecord[p.billing_record_id] ?? 0) + Number(p.amount);
        });
      }

      // Map to BillingRecordRow format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return billingRows.map((b: any) => ({
        id: b.id,
        studentId: b.student_id,
        studentName: b.students ? `${b.students.first_name} ${b.students.last_name}` : "—",
        classId: b.class_id ?? null,
        className: b.classes?.name ?? "—",
        description: b.description ?? "",
        dueDate: b.due_date ?? null,
        billingMonth: b.billing_month ? b.billing_month.substring(0, 7) : "",
        amountDue: Number(b.amount_due),
        amountPaid: paidByRecord[b.id] ?? 0,
        status: b.status,
        notes: b.notes ?? null,
      })) as BillingRecordRow[];
    },
    enabled: !!schoolId && !!schoolYearId,
    staleTime: 30 * 1000, // 30 seconds — transactional data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
