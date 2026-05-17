/**
 * Activity feature — shared types.
 *
 * Future-ready classification for an event system that powers:
 *   - Activity History (school-facing operational traceability)
 *   - Ops Intelligence (platform analytics, future feature)
 *
 * The two are kept conceptually separate via `visibility_scope` and
 * `activity_domain` so a future platform-admin module can consume the same
 * event stream without leaking platform-ops events into school UIs.
 */

import type { Json } from "@/lib/types/database";

/**
 * Audit log row shape (mirrors database.ts but with parsed JSON types).
 * This is what the underlying audit_logs table emits today.
 */
export type AuditLogRow = {
  id: string;
  school_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

/**
 * activity_domain — the conceptual domain an event belongs to.
 *
 *   - "school_activity": something a school user did inside their tenant
 *     (a teacher submitted attendance, an admin finalized an IEP).
 *   - "platform_ops": platform-level operational signal (failed invite spike,
 *     storage growth, onboarding event). NOT emitted today; reserved for the
 *     future Ops Intelligence module.
 */
export type ActivityDomain = "school_activity" | "platform_ops";

/**
 * visibility_scope — who should see this event surfaced in a UI.
 *
 *   - "school": visible to school_admin in their own school's Activity History.
 *   - "platform": visible only to platform_admin / super_admin in Ops Intelligence.
 *
 * Today every audit_logs row maps to "school" because the audit trigger only
 * captures tenant-scoped tables. Reserved for the future.
 */
export type VisibilityScope = "school" | "platform";

/**
 * event_severity — for future Ops Intelligence prioritization
 * (e.g. "warning" for storage approaching cap, "info" for routine activity).
 * Reserved.
 */
export type EventSeverity = "info" | "notice" | "warning" | "critical";

/**
 * MVP school-facing activity categories. These are operational, not technical:
 * they bundle related tables into a category a school admin understands.
 */
export type ActivityCategory =
  | "students"
  | "attendance"
  | "plans"
  | "communication"
  | "enrollment"
  | "documents"
  | "other";

/**
 * Formatted, presentation-ready activity entry. Produced by `formatActivity()`
 * from a raw AuditLogRow.
 */
export type FormattedActivity = {
  id: string;
  createdAt: string;
  actorLabel: string;
  actorIsSelf: boolean;
  actorIsImpersonating: boolean;
  category: ActivityCategory;
  categoryLabel: string;
  /** One-line conversational summary suitable for a list row. */
  summary: string;
  /** Optional secondary detail (e.g. a short value snippet). */
  detail: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  /** The raw row, kept for the detail drawer. */
  raw: AuditLogRow;
  /** Future-ready classification — always school/school_activity for audit_logs today. */
  domain: ActivityDomain;
  scope: VisibilityScope;
};

/** Re-export for convenience. */
export type { Json };
