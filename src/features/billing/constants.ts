import type { AddForm, BillingStatus, DiscountScope, DiscountType, PaymentForm, PaymentMethod } from "./types";

export const SCOPE_LABELS: Record<DiscountScope, string> = {
  summer_to_sy: "Summer → School Year", full_payment: "Full Payment",
  early_enrollment: "Early Enrollment", sibling: "Sibling", custom: "Custom",
};
export const TYPE_LABELS: Record<DiscountType, string> = {
  fixed: "Fixed Amount", percentage: "Percentage", credit: "Credit",
};

export function currentYearMonth() { return new Date().toISOString().substring(0, 7); }

export const EMPTY_PAYMENT: PaymentForm = {
  amount: "", method: "cash" as PaymentMethod, reference: "", notes: "",
  date: new Date().toISOString().split("T")[0], orNumber: "", receiptFile: null,
};
export const EMPTY_ADD: AddForm = {
  studentId: "", studentSearch: "", description: "", amountDue: "",
  dueDate: new Date().toISOString().split("T")[0],
  billingMonth: currentYearMonth(), feeTypeId: "",
  markAsPaid: false, paymentMethod: "cash" as PaymentMethod,
  paymentDate: new Date().toISOString().split("T")[0], paymentRef: "",
};

export const STATUS_OPTS = [
  { value: "", label: "All Statuses" }, { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" }, { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" }, { value: "refunded", label: "Refunded" },
];
export const EDITABLE_STATUSES: { value: BillingStatus; label: string }[] = [
  { value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" }, { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];
