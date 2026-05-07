/**
 * auditLog — Structured logging for high-risk mutations
 *
 * Goals:
 * - Create a unified audit trail for critical operations
 * - Track who did what, when, where, and (safely) why
 * - Support debugging and compliance without logging sensitive data
 * - Prepare for integration with database audit tables
 *
 * Operations tracked:
 * - Upload operations (documents, receipts, photos)
 * - Billing mutations (payment recording, amount changes, waives)
 * - Enrollment state changes (inquiry → enrolled, promoting)
 * - Impersonation start/end
 * - Permission/access grants
 * - Document access decisions
 */

export type AuditActionType =
  | "upload_start"
  | "upload_success"
  | "upload_fail"
  | "payment_recorded"
  | "amount_changed"
  | "status_changed"
  | "enrollment_converted"
  | "student_promoted"
  | "impersonation_start"
  | "impersonation_end"
  | "access_granted"
  | "access_revoked"
  | "document_accessed";

export interface AuditLogEntry {
  timestamp: string;
  action: AuditActionType;
  module: string; // e.g., "billing", "enrollment", "documents"
  schoolId?: string;
  userId?: string;
  userRole?: string;
  /** Resource ID being modified (e.g., payment_id, billing_record_id) */
  resourceId?: string;
  /** Resource type (e.g., "payment", "enrollment", "document_version") */
  resourceType?: string;
  /** Operation result: success, fail, partial */
  status: "success" | "fail" | "partial";
  /** Human-readable summary (no sensitive data) */
  summary: string;
  /** Safe metadata for debugging */
  metadata?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  requestId?: string; // Correlation ID for linking related logs
}

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Log an audit event
 *
 * Usage:
 * ```ts
 * auditLog({
 *   action: "payment_recorded",
 *   module: "billing",
 *   schoolId,
 *   userId,
 *   userRole,
 *   resourceId: paymentId,
 *   resourceType: "payment",
 *   status: "success",
 *   summary: `Recorded payment of ₱1,000 for billing record #123`,
 *   metadata: { amount: 1000, method: "cash" },
 *   requestId: correlationId,
 * });
 * ```
 */
export function auditLog(entry: Omit<AuditLogEntry, "timestamp">): void {
  const log: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Development: log to console
  if (isDevelopment) {
    const emoji = {
      upload_start: "📤",
      upload_success: "✅",
      upload_fail: "❌",
      payment_recorded: "💳",
      amount_changed: "📝",
      status_changed: "🔄",
      enrollment_converted: "✍️",
      student_promoted: "📈",
      impersonation_start: "👁️",
      impersonation_end: "👁️‍🗨️",
      access_granted: "🔓",
      access_revoked: "🔒",
      document_accessed: "📄",
    }[entry.action];

    console.log(
      `${emoji} [AUDIT] ${entry.module.toUpperCase()}: ${entry.summary}`,
      {
        action: entry.action,
        status: entry.status,
        resourceType: entry.resourceType,
        metadata: entry.metadata,
        requestId: entry.requestId,
      },
    );

    if (entry.error) {
      console.error(`  Error: ${entry.error}`);
    }
  }

  // Production: prepare for external audit service
  // Future: send to audit log table or external service
  // await sendToAuditService(log);
}

/**
 * Wrap an upload operation with audit logging
 *
 * Usage:
 * ```ts
 * const result = await withAuditLogging(
 *   async () => {
 *     const { data, error } = await supabase.storage.from("bucket").upload(path, file);
 *     if (error) throw error;
 *     return data;
 *   },
 *   {
 *     module: "documents",
 *     action: "upload_success",
 *     schoolId,
 *     userId,
 *     resourceType: "document_version",
 *     summary: `Uploaded document version`,
 *     requestId,
 *   }
 * );
 * ```
 */
export async function withAuditLogging<T>(
  operation: () => Promise<T>,
  entry: Omit<AuditLogEntry, "timestamp" | "status">,
): Promise<T> {
  const startAction =
    entry.action === "upload_success"
      ? ("upload_start" as const)
      : entry.action;

  auditLog({
    ...entry,
    action: startAction,
    status: "success",
  });

  try {
    const result = await operation();

    auditLog({
      ...entry,
      status: "success",
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    auditLog({
      ...entry,
      status: "fail",
      error,
    });

    throw err;
  }
}

/**
 * Track a billing mutation with standard fields
 *
 * Logs: amount, method, student reference (NOT student name), record status
 */
export function auditBillingMutation(
  action: "payment_recorded" | "amount_changed" | "status_changed",
  details: {
    schoolId?: string;
    userId?: string;
    userRole?: string;
    billingRecordId: string;
    studentId: string; // ID only, not name
    amount?: number;
    method?: string;
    reason?: string;
    requestId?: string;
  },
): void {
  const actionLabels = {
    payment_recorded: "Recorded payment",
    amount_changed: "Changed amount due",
    status_changed: "Changed billing status",
  };

  auditLog({
    action,
    module: "billing",
    schoolId: details.schoolId,
    userId: details.userId,
    userRole: details.userRole,
    resourceId: details.billingRecordId,
    resourceType: "billing_record",
    status: "success",
    summary: `${actionLabels[action]} for student ${details.studentId}`,
    metadata: {
      amount: details.amount,
      method: details.method,
      reason: details.reason,
    },
    requestId: details.requestId,
  });
}

/**
 * Track an enrollment state change
 */
export function auditEnrollmentChange(
  action: "enrollment_converted" | "student_promoted",
  details: {
    schoolId?: string;
    userId?: string;
    userRole?: string;
    studentId: string;
    enrollmentId?: string;
    fromStatus?: string;
    toStatus?: string;
    requestId?: string;
  },
): void {
  const actionLabels = {
    enrollment_converted: "Converted inquiry to enrollment",
    student_promoted: "Promoted student to next level",
  };

  auditLog({
    action,
    module: "enrollment",
    schoolId: details.schoolId,
    userId: details.userId,
    userRole: details.userRole,
    resourceId: details.enrollmentId || details.studentId,
    resourceType: "enrollment",
    status: "success",
    summary: `${actionLabels[action]} for student ${details.studentId}`,
    metadata: {
      fromStatus: details.fromStatus,
      toStatus: details.toStatus,
    },
    requestId: details.requestId,
  });
}

/**
 * Track document access decisions
 */
export function auditDocumentAccess(
  details: {
    schoolId?: string;
    userId?: string;
    userRole?: string;
    documentId: string;
    action: "view" | "download" | "denied";
    denyReason?: string;
    requestId?: string;
  },
): void {
  const actionLabels = {
    view: "Preview opened",
    download: "Download requested",
    denied: "Access denied",
  };

  auditLog({
    action: "document_accessed",
    module: "documents",
    schoolId: details.schoolId,
    userId: details.userId,
    userRole: details.userRole,
    resourceId: details.documentId,
    resourceType: "document",
    status: details.action === "denied" ? "fail" : "success",
    summary: `${actionLabels[details.action]} for document ${details.documentId}`,
    metadata: {
      denyReason: details.denyReason,
    },
    requestId: details.requestId,
  });
}
