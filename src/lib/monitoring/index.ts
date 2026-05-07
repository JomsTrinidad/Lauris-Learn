/**
 * Monitoring & observability utilities
 *
 * Exports:
 * - reportError/reportWarning — error reporting with context
 * - generateRequestId — correlation IDs for tracing
 * - validateEnvironment — deployment safety checks
 * - auditLog — structured logging for high-risk mutations
 * - ErrorBoundary — React component error boundary
 */

export {
  reportError,
  reportWarning,
  generateRequestId,
  type ErrorContext,
  type ErrorReport,
} from "./reportError";

export {
  validateEnvironment,
  isEnvironmentSafe,
  type EnvironmentIssue,
} from "./validateEnvironment";

export {
  auditLog,
  auditBillingMutation,
  auditEnrollmentChange,
  auditDocumentAccess,
  withAuditLogging,
  type AuditLogEntry,
  type AuditActionType,
} from "./auditLog";
