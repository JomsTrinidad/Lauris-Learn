// ─── Billing types ────────────────────────────────────────────────────────────

export type MainTab = "bills" | "payments" | "setup";
export type SetupSubTab = "tuition" | "adjustments" | "advanced";
export type BillingStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled" | "refunded" | "waived";
export type PaymentMethod = "cash" | "bank_transfer" | "gcash" | "maya" | "other";

export interface BillingRecord {
  id: string; studentId: string; studentName: string;
  classId: string | null; className: string; description: string;
  dueDate: string | null; billingMonth: string;
  amountDue: number; amountPaid: number; status: BillingStatus; notes: string | null;
}
export interface StudentOption {
  id: string; name: string; studentCode: string | null;
  classId: string | null; className: string; level: string;
}
export interface PaymentRecord {
  id: string; amount: number; method: PaymentMethod; date: string;
  reference: string | null; orNumber: string | null; notes: string | null; receiptPhotoPath: string | null;
}
export interface AllPayment {
  id: string; billingRecordId: string; studentName: string; className: string;
  description: string; billingMonth: string; amount: number; method: PaymentMethod;
  date: string; reference: string | null; orNumber: string | null;
  notes: string | null; receiptPhotoPath: string | null;
}
export interface PaymentForm {
  amount: string; method: PaymentMethod; reference: string; notes: string;
  date: string; orNumber: string; receiptFile: File | null;
}
export interface AddForm {
  studentId: string; studentSearch: string; description: string; amountDue: string;
  dueDate: string; billingMonth: string; feeTypeId: string;
  markAsPaid: boolean; paymentMethod: PaymentMethod; paymentDate: string; paymentRef: string;
}
export interface EditForm {
  description: string; amountDue: string; dueDate: string; billingMonth: string;
  status: BillingStatus; notes: string; changeReason: string;
}
export interface FeeType { id: string; name: string; defaultAmount: number | null; }
export interface ClassOption { id: string; name: string; level: string; enrolled: number; }
export interface StatementRow { billingRecord: BillingRecord; payments: PaymentRecord[]; }

// ─── Setup types ──────────────────────────────────────────────────────────────

export interface AcademicPeriod {
  id: string; name: string; schoolYearId: string; schoolYearName: string;
  startDate: string; endDate: string;
}
export interface SetupFeeType { id: string; name: string; description: string; isActive: boolean; securesPlacement: boolean; isEnrollmentMandatory: boolean; }
export interface TuitionConfig {
  id: string; academicPeriodId: string; periodName: string; level: string;
  totalAmount: number; months: number; classId: string | null; className: string | null; monthlyAmount: number;
}
export interface SetupClassOption { id: string; name: string; level: string; schoolYearId: string; }
export type DiscountType = "fixed" | "percentage" | "credit";
export type DiscountScope = "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom";
export interface Discount { id: string; name: string; type: DiscountType; scope: DiscountScope; value: number; isActive: boolean; }
export interface StudentCredit {
  id: string; studentId: string; studentName: string; amount: number;
  reason: string; appliedTo: string | null; createdAt: string;
}
export interface SimpleStudent { id: string; name: string; }
