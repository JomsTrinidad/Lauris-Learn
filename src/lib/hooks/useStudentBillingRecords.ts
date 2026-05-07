import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface StudentPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  reference: string | null;
  orNumber: string | null;
}

export interface StudentBillingRecord {
  id: string;
  description: string;
  billingMonth: string;
  amountDue: number;
  amountPaid: number;
  dueDate: string | null;
  status: string;
  payments: StudentPayment[];
}

/**
 * useStudentBillingRecords — fetch all billing records for a student with payment history
 *
 * Used by: Parent billing page (/parent/billing), student billing panels
 *
 * Returns all billing records for a specific student, including all payments per record.
 * Payments are included in the StudentBillingRecord.payments array for expandable display.
 *
 * Caches for 30 seconds (transactional, per-student data).
 * After payment mutations, invalidate with:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.studentBillingRecords.for(studentId) })
 *
 * Returns: StudentBillingRecord[] (id, amountDue, amountPaid, payments[], etc.)
 */
export function useStudentBillingRecords(studentId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.studentBillingRecords.for(studentId || ""),
    queryFn: async () => {
      if (!studentId) throw new Error("studentId required");

      // Fetch billing records for student
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bResult = await (supabase as any)
        .from("billing_records")
        .select("id, description, billing_month, amount_due, due_date, status")
        .eq("student_id", studentId)
        .order("billing_month", { ascending: false });

      if (bResult.error) throw bResult.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const billingRows = (bResult.data ?? []) as any[];
      const recordIds: string[] = billingRows.map((b) => b.id);

      const paymentsByRecord: Record<string, StudentPayment[]> = {};

      // Fetch all payments for these records
      if (recordIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pResult = await (supabase as any)
          .from("payments")
          .select("id, billing_record_id, amount, payment_method, payment_date, reference_number, or_number")
          .eq("status", "confirmed")
          .in("billing_record_id", recordIds)
          .order("payment_date", { ascending: true });

        if (pResult.error) throw pResult.error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((pResult.data ?? []) as any[]).forEach((p: any) => {
          if (!paymentsByRecord[p.billing_record_id]) paymentsByRecord[p.billing_record_id] = [];
          paymentsByRecord[p.billing_record_id].push({
            id: p.id,
            amount: Number(p.amount),
            method: p.payment_method,
            date: p.payment_date,
            reference: p.reference_number ?? null,
            orNumber: p.or_number ?? null,
          });
        });
      }

      // Map to StudentBillingRecord format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return billingRows.map((b: any) => {
        const payments = paymentsByRecord[b.id] ?? [];
        const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        return {
          id: b.id,
          description: b.description ?? "",
          billingMonth: b.billing_month ?? "",
          amountDue: Number(b.amount_due),
          amountPaid,
          dueDate: b.due_date ?? null,
          status: b.status,
          payments,
        };
      }) as StudentBillingRecord[];
    },
    enabled: !!studentId,
    staleTime: 30 * 1000, // 30 seconds — transactional per-student data
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
