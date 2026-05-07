/**
 * reportError — lightweight app-side error reporting utility
 *
 * Goals:
 * - Normalize error logging across the app
 * - Add operational context without logging sensitive data
 * - Support development mode (console) and future production mode (external service)
 * - Provide structured error data for support/debugging
 *
 * Principles:
 * - Never log sensitive student/child data
 * - Always include actionable context (module, action, user role)
 * - Development: log to console
 * - Production: prepare for external service integration (not yet enabled)
 * - Keep payloads lightweight
 */

export interface ErrorContext {
  /** Module/page name (e.g., "billing", "documents", "enrollment") */
  module?: string;
  /** Action being performed (e.g., "record_payment", "upload_document", "convert_inquiry") */
  action?: string;
  /** User role (e.g., "school_admin", "teacher", "parent") */
  userRole?: string;
  /** School ID (for multi-tenant filtering in logs) */
  schoolId?: string;
  /** User ID (for audit trail) */
  userId?: string;
  /** Additional safe metadata (NO student/child data) */
  metadata?: Record<string, unknown>;
  /** Whether to also log to console in production */
  logToConsole?: boolean;
}

export interface ErrorReport {
  timestamp: string;
  level: "error" | "warn";
  module?: string;
  action?: string;
  userRole?: string;
  schoolId?: string;
  userId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  isDevelopment: boolean;
}

/**
 * reportError — Report an error with operational context
 *
 * Usage:
 * ```ts
 * try {
 *   await recordPayment(...)
 * } catch (err) {
 *   reportError(err, {
 *     module: "billing",
 *     action: "record_payment",
 *     userRole: userRole || undefined,
 *     schoolId: schoolId || undefined,
 *     metadata: { billingRecordId: recordId, amount: 1000 },
 *   });
 *   setError("Failed to record payment. Please try again.");
 * }
 * ```
 */
export function reportError(
  error: unknown,
  context: ErrorContext = {},
): ErrorReport {
  const isDevelopment = process.env.NODE_ENV === "development";
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const report: ErrorReport = {
    timestamp: new Date().toISOString(),
    level: "error",
    module: context.module,
    action: context.action,
    userRole: context.userRole,
    schoolId: context.schoolId,
    userId: context.userId,
    message,
    metadata: context.metadata,
    isDevelopment,
  };

  // Development: log to console
  if (isDevelopment) {
    const label = `[${context.module || "app"}${context.action ? ":" + context.action : ""}]`;
    console.error(label, message, {
      stack,
      context,
      metadata: context.metadata,
    });
  }

  // Production: prepare for external service (hook for future integration)
  if (!isDevelopment && context.logToConsole !== false) {
    // Future: send to external error tracking service (Sentry, etc.)
    // For now, just prepare the payload
    // await sendToErrorTracker(report);
  }

  return report;
}

/**
 * reportWarning — Report a non-fatal warning with context
 *
 * Usage for graceful degradations, fallbacks, or edge cases that don't block the user.
 */
export function reportWarning(
  message: string,
  context: ErrorContext = {},
): ErrorReport {
  const isDevelopment = process.env.NODE_ENV === "development";

  const report: ErrorReport = {
    timestamp: new Date().toISOString(),
    level: "warn",
    module: context.module,
    action: context.action,
    userRole: context.userRole,
    schoolId: context.schoolId,
    userId: context.userId,
    message,
    metadata: context.metadata,
    isDevelopment,
  };

  if (isDevelopment) {
    const label = `[${context.module || "app"}${context.action ? ":" + context.action : ""}]`;
    console.warn(label, message, context.metadata);
  }

  return report;
}

/**
 * generateRequestId — Create a correlation ID for tracing related errors/requests
 *
 * Format: YYYYMMDD-HHMMSS-RANDOM (e.g., "20260507-143022-a7f3")
 * Used for linking multiple errors from the same operation.
 */
export function generateRequestId(): string {
  const now = new Date();
  const date = now
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, "");
  const time = now.toISOString().substring(11, 19).replace(/:/g, "");
  const random = Math.random().toString(16).substring(2, 6);
  return `${date}-${time}-${random}`;
}
