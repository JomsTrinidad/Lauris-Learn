// Re-export all query hooks for easy imports
export { useStudents, useStudent } from "./useStudents";
export { useClasses } from "./useClasses";
export { useEnrollments, useEnrollmentsForStudent } from "./useEnrollments";
export { useDashboardStats } from "./useDashboardStats";
export { useStudentsList } from "./useStudentsList";
export { useStudentsClasses } from "./useStudentsClasses";
export { useParentStudentDetail } from "./useParentStudentDetail";
export { useStudentAttendance } from "./useStudentAttendance";
export { useSchoolDocuments } from "./useSchoolDocuments";
export { useDocumentRequests } from "./useDocumentRequests";
export { useCareSharedDocuments } from "./useCareSharedDocuments";
export { useGrantedChildren } from "./useGrantedChildren";
export { useParentDocuments } from "./useParentDocuments";

// Billing Setup & Summary (Batch B1.6.1)
export { useBillingSummary } from "./useBillingSummary";
export { useFeeTypes } from "./useFeeTypes";
export { useTuitionConfigs } from "./useTuitionConfigs";
export { useDiscounts } from "./useDiscounts";
export { useAcademicPeriods } from "./useAcademicPeriods";

// Billing Transactions (Batch B1.6.2)
export { useBillingRecords } from "./useBillingRecords";
export { usePayments } from "./usePayments";
export { useStudentBillingRecords } from "./useStudentBillingRecords";
export { useStudentCredits } from "./useStudentCredits";

// Network & Resilience (Batch B1.9)
export { useNetworkStatus } from "./useNetworkStatus";
