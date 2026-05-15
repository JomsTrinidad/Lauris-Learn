import { QueryClient, DefaultOptions } from "@tanstack/react-query";

/**
 * Conservative query defaults for Lauris Learn operational SaaS dashboard.
 *
 * Strategy:
 * - staleTime: 30s for operational data (school context, lists) — fast enough for real-time feedback
 *   but reduces redundant DB hits during normal navigation
 * - cacheTime: 5m — keep data around for quick back-navigation
 * - retry: Only transient errors (5xx, network timeouts), not 4xx errors
 * - refetchOnWindowFocus: false — dashboards shouldn't auto-refresh when regaining focus
 *   (user expects manual refresh for critical operations like billing/attendance)
 *
 * Note: Individual queries can override these defaults as needed.
 */

const defaultOptions: DefaultOptions = {
  queries: {
    // Data is considered fresh for 30 seconds. After that, stale but cached.
    // Re-fetches only happen if you navigate away and back within 5m, or explicitly refetch.
    staleTime: 30 * 1000, // 30 seconds

    // Cached data kept for 5 minutes before garbage collection.
    // Allows fast back-navigation without re-fetching.
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)

    // Intelligent retry strategy for read queries.
    // Retries transient failures (network, server errors) but not auth/permission errors.
    // Uses exponential backoff: retry 1 waits ~100ms, retry 2 waits ~400ms, etc.
    retry: (failureCount, error: any) => {
      if (failureCount >= 3) return false; // Max 3 retries
      const status = error?.status;
      if (!status) return true; // Network errors (timeout, no status code), retry

      // Server errors (5xx) are transient — retry
      if (status >= 500) return true;

      // Specific transient HTTP status codes
      if (status === 408 || status === 429) return true; // Request timeout or rate limit

      // Auth/permission errors (4xx except 408) are NOT transient — don't retry
      // 401 (unauthorized), 403 (forbidden), 404 (not found), etc.
      return false;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff: 100ms * (2 ^ attemptIndex)
      // Retry 1: ~100ms, Retry 2: ~200ms, Retry 3: ~400ms
      return Math.min(100 * Math.pow(2, attemptIndex), 5000);
    },

    // Disable aggressive refetch on window focus.
    // Operational SaaS dashboards should respect user intent, not auto-refresh.
    // Staff will explicitly click a Refresh button if needed.
    refetchOnWindowFocus: false,

    // Don't refetch on re-mount. Use the cached data.
    // This prevents duplicate fetches when navigating back to a page.
    refetchOnMount: false,
  },
  mutations: {
    // Mutations should NOT auto-retry by default.
    // Writes are not idempotent; failed mutations should surface errors and let the user retry.
    // Only network-level retries (connection recovery) happen via middleware, not here.
    retry: 0,
  },
};

export const queryClient = new QueryClient({
  defaultOptions,
});

/**
 * Query key factory for type-safe, consistent query naming.
 * Allows coordinating invalidation across multiple hooks.
 */
export const queryKeys = {
  // School context
  school: {
    all: ["school"] as const,
    list: () => [...queryKeys.school.all, "list"] as const,
    byId: (id: string) => [...queryKeys.school.all, "byId", id] as const,
  },

  // Students
  students: {
    all: ["students"] as const,
    list: (schoolId: string) => [...queryKeys.students.all, "list", schoolId] as const,
    byId: (id: string) => [...queryKeys.students.all, "byId", id] as const,
    detail: (id: string) => [...queryKeys.students.byId(id), "detail"] as const,
  },

  // Classes
  classes: {
    all: ["classes"] as const,
    list: (schoolId: string) => [...queryKeys.classes.all, "list", schoolId] as const,
    byId: (id: string) => [...queryKeys.classes.all, "byId", id] as const,
  },

  // Enrollments
  enrollments: {
    all: ["enrollments"] as const,
    list: (schoolId: string) => [...queryKeys.enrollments.all, "list", schoolId] as const,
    byStudent: (studentId: string) => [...queryKeys.enrollments.all, "byStudent", studentId] as const,
  },

  // Dashboard
  dashboard: {
    all: ["dashboard"] as const,
    stats: (schoolId: string, date: string) => [...queryKeys.dashboard.all, "stats", schoolId, date] as const,
  },

  // Documents
  documents: {
    all: ["documents"] as const,
    list: (schoolId: string, filters?: Record<string, any>) =>
      filters
        ? [...queryKeys.documents.all, "list", schoolId, JSON.stringify(filters)]
        : [...queryKeys.documents.all, "list", schoolId],
    byId: (id: string) => [...queryKeys.documents.all, "byId", id] as const,
  },

  // Document Requests
  documentRequests: {
    all: ["documentRequests"] as const,
    list: (schoolId: string, filters?: Record<string, any>) =>
      filters
        ? [...queryKeys.documentRequests.all, "list", schoolId, JSON.stringify(filters)]
        : [...queryKeys.documentRequests.all, "list", schoolId],
  },

  // Billing
  billing: {
    all: ["billing"] as const,
    records: (schoolId: string) => [...queryKeys.billing.all, "records", schoolId] as const,
    payments: (schoolId: string) => [...queryKeys.billing.all, "payments", schoolId] as const,
  },

  // Parent updates
  parentUpdates: {
    all: ["parentUpdates"] as const,
    list: (schoolId: string, classId?: string) =>
      classId
        ? [...queryKeys.parentUpdates.all, "list", schoolId, classId]
        : [...queryKeys.parentUpdates.all, "list", schoolId],
  },

  // Events
  events: {
    all: ["events"] as const,
    list: (schoolId: string) => [...queryKeys.events.all, "list", schoolId] as const,
  },

  // Attendance
  attendance: {
    all: ["attendance"] as const,
    forClass: (classId: string, date: string) => [...queryKeys.attendance.all, "forClass", classId, date] as const,
    forStudent: (studentId: string) => [...queryKeys.attendance.all, "forStudent", studentId] as const,
    signals: (schoolId: string, classKey: string) => [...queryKeys.attendance.all, "signals", schoolId, classKey] as const,
  },

  // Care (Lauris Care clinic portal)
  careDocuments: {
    all: ["careDocuments"] as const,
    shared: (organizationId: string) => [...queryKeys.careDocuments.all, "shared", organizationId] as const,
  },

  // Care granted children
  careGrantedChildren: {
    all: ["careGrantedChildren"] as const,
    list: (organizationId: string) => [...queryKeys.careGrantedChildren.all, "list", organizationId] as const,
  },

  // Parent Documents
  parentDocuments: {
    all: ["parentDocuments"] as const,
    list: (studentId: string) => [...queryKeys.parentDocuments.all, "list", studentId] as const,
  },

  // Billing Setup & Summary (Batch B1.6.1 — Setup/Config Reads)
  billingSummary: {
    all: ["billingSummary"] as const,
    for: (schoolId: string, schoolYearId: string) => [...queryKeys.billingSummary.all, schoolId, schoolYearId] as const,
  },

  // Financial Watchlist — operational attention system for the dashboard
  financialWatchlist: {
    all: ["financialWatchlist"] as const,
    for: (schoolId: string) => [...queryKeys.financialWatchlist.all, schoolId] as const,
  },

  // Plan signals — draft + awaiting-review counts for Student Support card
  planSignals: {
    all: ["planSignals"] as const,
    for: (schoolId: string) => [...queryKeys.planSignals.all, schoolId] as const,
  },

  feeTypes: {
    all: ["feeTypes"] as const,
    list: (schoolId: string) => [...queryKeys.feeTypes.all, schoolId] as const,
  },

  tuitionConfigs: {
    all: ["tuitionConfigs"] as const,
    list: (schoolId: string) => [...queryKeys.tuitionConfigs.all, schoolId] as const,
  },

  discounts: {
    all: ["discounts"] as const,
    list: (schoolId: string) => [...queryKeys.discounts.all, schoolId] as const,
  },

  academicPeriods: {
    all: ["academicPeriods"] as const,
    list: (schoolId: string) => [...queryKeys.academicPeriods.all, schoolId] as const,
  },

  // Billing Transactions (Batch B1.6.2 — Transaction Reads)
  billingRecords: {
    all: ["billingRecords"] as const,
    list: (schoolId: string, schoolYearId: string) => [...queryKeys.billingRecords.all, schoolId, schoolYearId] as const,
  },

  payments: {
    all: ["payments"] as const,
    list: (schoolId: string, schoolYearId: string) => [...queryKeys.payments.all, schoolId, schoolYearId] as const,
  },

  studentBillingRecords: {
    all: ["studentBillingRecords"] as const,
    for: (studentId: string) => [...queryKeys.studentBillingRecords.all, studentId] as const,
  },

  studentCredits: {
    all: ["studentCredits"] as const,
    list: (schoolId: string) => [...queryKeys.studentCredits.all, schoolId] as const,
  },
};
