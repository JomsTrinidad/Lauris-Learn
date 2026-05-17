/**
 * Activity feature — shared mapping constants.
 *
 * Single source of truth for translating raw audit_logs.table_name values into
 * human-readable areas/entities and operational categories. Consumed by:
 *   - /activity (Activity History page, school-facing)
 *   - /super-admin/intelligence (Ops Intelligence, platform-facing — future-ready)
 *
 * If you add a new audited table in a migration, add it here too so it gets a
 * friendly label instead of falling through to the raw table name.
 */

import type { ActivityCategory } from "./types";

/** AREA_MAP groups tables into broad system areas (used by detail drawer / Ops Intelligence). */
export const AREA_MAP: Record<string, string> = {
  students: "Students",
  guardians: "Students",
  enrollments: "Enrollment",
  enrollment_inquiries: "Enrollment",
  enrollment_transitions: "Enrollment",
  student_class_assignments: "Enrollment",
  school_year_completions: "Enrollment",
  attendance_records: "Attendance",
  absence_notifications: "Attendance",
  billing_records: "Billing",
  payments: "Billing",
  billing_discounts: "Billing",
  student_credits: "Finance Setup",
  fee_types: "Finance Setup",
  tuition_configs: "Finance Setup",
  discounts: "Finance Setup",
  parent_updates: "Communication",
  events: "Events",
  event_rsvps: "Events",
  progress_observations: "Progress",
  proud_moments: "Progress",
  grading_scale_sets: "Progress",
  grading_scales: "Progress",
  grading_scale_assignments: "Progress",
  classes: "Classes",
  class_teachers: "Classes",
  class_levels: "Settings",
  school_years: "Settings",
  academic_periods: "Settings",
  holidays: "Settings",
  teacher_profiles: "Settings",
  online_class_sessions: "Online Classes",
  student_plans: "Support Plans",
  student_plan_goals: "Support Plans",
  student_plan_interventions: "Support Plans",
  student_plan_progress_entries: "Support Plans",
  student_plan_attachments: "Support Plans",
  child_documents: "Documents",
  child_document_versions: "Documents",
  document_consents: "Documents",
  document_access_grants: "Documents",
  document_requests: "Documents",
  external_contacts: "Documents",
};

/** ENTITY_MAP gives the singular noun for one record in each audited table. */
export const ENTITY_MAP: Record<string, string> = {
  students: "student",
  guardians: "guardian",
  enrollments: "enrollment",
  enrollment_inquiries: "inquiry",
  enrollment_transitions: "enrollment update",
  student_class_assignments: "class assignment",
  school_year_completions: "year-end snapshot",
  attendance_records: "attendance record",
  absence_notifications: "absence notice",
  billing_records: "billing record",
  payments: "payment",
  billing_discounts: "applied discount",
  student_credits: "student credit",
  fee_types: "fee type",
  tuition_configs: "tuition config",
  discounts: "discount",
  parent_updates: "parent update",
  events: "event",
  event_rsvps: "event RSVP",
  progress_observations: "progress note",
  proud_moments: "proud moment",
  grading_scale_sets: "grading scale set",
  grading_scales: "grading scale",
  grading_scale_assignments: "scale assignment",
  classes: "class",
  class_teachers: "teacher assignment",
  class_levels: "class level",
  school_years: "school year",
  academic_periods: "academic period",
  holidays: "holiday",
  teacher_profiles: "teacher",
  online_class_sessions: "online session",
  student_plans: "support plan",
  student_plan_goals: "plan goal",
  student_plan_interventions: "plan intervention",
  student_plan_progress_entries: "progress entry",
  student_plan_attachments: "plan attachment",
  child_documents: "document",
  child_document_versions: "document version",
  document_consents: "document consent",
  document_access_grants: "document access grant",
  document_requests: "document request",
  external_contacts: "external contact",
};

/** ACTOR_LABELS maps the audit role string to a readable role name. */
export const ACTOR_LABELS: Record<string, string> = {
  super_admin: "Platform Admin",
  school_admin: "School Admin",
  teacher: "Teacher",
  parent: "Parent",
  super_admin_impersonating: "Platform Admin",
};

/** ACTION_LABELS maps the SQL action verb to a friendly verb. */
export const ACTION_LABELS: Record<"INSERT" | "UPDATE" | "DELETE", string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Removed",
};

/**
 * CATEGORY_MAP — MVP school-facing categories.
 *
 * Maps audited tables to the operational category a school admin understands.
 * The category controls top-level filter chips in Activity History.
 *
 * Anything not listed here falls into "other" and is excluded from the MVP
 * category filters by default (still visible under "All Activity").
 */
export const CATEGORY_MAP: Record<string, ActivityCategory> = {
  // Students
  students: "students",
  guardians: "students",

  // Attendance
  attendance_records: "attendance",
  absence_notifications: "attendance",

  // Plans & IEP
  student_plans: "plans",
  student_plan_goals: "plans",
  student_plan_interventions: "plans",
  student_plan_progress_entries: "plans",
  student_plan_attachments: "plans",

  // Communication
  parent_updates: "communication",
  events: "communication",
  event_rsvps: "communication",

  // Enrollment / classifications
  enrollments: "enrollment",
  enrollment_inquiries: "enrollment",
  enrollment_transitions: "enrollment",
  student_class_assignments: "enrollment",
  school_year_completions: "enrollment",
  classes: "enrollment",
  class_teachers: "enrollment",

  // Documents
  child_documents: "documents",
  child_document_versions: "documents",
  document_consents: "documents",
  document_access_grants: "documents",
  document_requests: "documents",
  external_contacts: "documents",
};

/**
 * CATEGORY_LABELS — display label for each category chip.
 */
export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  students: "Students",
  attendance: "Attendance",
  plans: "Plans & IEP",
  communication: "Communication",
  enrollment: "Enrollment",
  documents: "Documents",
  other: "Other",
};

/**
 * MVP categories shown as filter chips on the Activity History page.
 * Order is significant — left-to-right in the UI.
 */
export const MVP_CATEGORIES: ActivityCategory[] = [
  "students",
  "attendance",
  "plans",
  "communication",
  "enrollment",
  "documents",
];

/**
 * Tables intentionally NOT surfaced in Activity History.
 *
 * These either represent infrastructure noise, low-value churn, or system
 * bookkeeping that doesn't help a school admin understand "what happened today
 * in my school." They remain in the audit_logs table for forensic use.
 *
 * To stay strictly ship-safe, the current audit triggers don't write these
 * anyway — this list documents intent and acts as a defensive client-side
 * filter so any future audit-trigger expansion doesn't surprise the UI.
 */
export const SUPPRESSED_TABLES = new Set<string>([
  // system / RLS bookkeeping (none audited today; reserved):
  "impersonation_audit_log",
  // technical churn we don't want to clutter the feed:
  "event_rsvps", // parents tapping going/not-going is high-frequency low-signal
]);

/** All tables that map to a given category — derived once. */
export const TABLES_BY_CATEGORY: Record<ActivityCategory, string[]> = (() => {
  const out: Record<ActivityCategory, string[]> = {
    students: [],
    attendance: [],
    plans: [],
    communication: [],
    enrollment: [],
    documents: [],
    other: [],
  };
  for (const [table, category] of Object.entries(CATEGORY_MAP)) {
    out[category].push(table);
  }
  return out;
})();

/**
 * Skip list for the field-level diff view in the detail drawer.
 *
 * Three groups:
 *   1. Bookkeeping columns that don't represent user-facing changes.
 *   2. Internal FK references (UUIDs that are noise without joined display values).
 *   3. Audit-side actor/author columns that duplicate the row's actor metadata.
 *
 * Anything matched here is dropped from the diff entirely — not just masked —
 * to keep the drawer focused on what actually changed in human terms.
 */
export const SKIP_IN_DIFF = new Set([
  // 1. bookkeeping
  "id",
  "school_id",
  "created_at",
  "updated_at",
  "set_at",
  "changed_at",
  // 2. internal FK references
  "record_id",
  "actor_user_id",
  "student_id",
  "class_id",
  "guardian_id",
  "enrollment_id",
  "fee_type_id",
  "academic_period_id",
  "school_year_id",
  "level_id",
  "current_version_id",
  "document_id",
  "branch_id",
  "child_profile_id",
  "organization_id",
  "source_organization_id",
  "target_organization_id",
  "next_class_id",
  "previous_class_id",
  "billing_record_id",
  "event_id",
  "consent_id",
  "grant_id",
  "scale_set_id",
  "scale_item_id",
  // 3. actor/author audit columns
  "created_by",
  "updated_by",
  "changed_by",
  "recorded_by",
  "requester_user_id",
  "granted_by_profile_id",
  "approved_by",
  "submitted_by",
  "reviewed_by_teacher",
  "reviewed_by_admin",
  "revoked_by_profile_id",
  "revoked_by",
  "uploaded_by",
  "auth_user_id",
]);

/**
 * Fields whose values must be masked even when shown, regardless of context.
 * Defensive — the audit trigger already strips most of these (photo_path,
 * receipt_photo_path, avatar_url, logo_url, photos, branding), but we mask
 * client-side too so any future trigger expansion can't quietly leak them.
 */
export const SENSITIVE_FIELDS = new Set([
  "storage_path",
  "signed_url",
  "password",
  "session_token",
  "auth_token",
  "api_key",
  "ip_address",
  "user_agent",
  "photo_path",
  "receipt_photo_path",
  "avatar_url",
  "logo_url",
]);

/** Cheap UUID v4-shape detection — used to mask raw IDs that leak into JSONB. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human-readable field labels for the detail drawer. */
export const FIELD_LABELS: Record<string, string> = {
  billing_month: "Billing Month",
  or_number: "OR Number",
  class_id: "Class",
  student_id: "Student",
  guardian_id: "Guardian",
  fee_type_id: "Fee Type",
  academic_period_id: "Academic Period",
  school_year_id: "School Year",
  level_id: "Level",
  enrollment_id: "Enrollment",
  is_active: "Active",
  is_primary: "Primary Guardian",
  is_hidden: "Hidden",
  allow_download: "Allow Download",
  allow_reshare: "Allow Reshare",
  parent_visible: "Visible to Parents",
  full_name: "Full Name",
  first_name: "First Name",
  last_name: "Last Name",
  birth_date: "Date of Birth",
  student_code: "Student Code",
  due_date: "Due Date",
  start_date: "Start Date",
  end_date: "End Date",
  review_date: "Review Date",
  expires_at: "Expires At",
  revoked_at: "Revoked At",
  revoke_reason: "Revoke Reason",
  archive_reason: "Archive Reason",
  change_reason: "Change Reason",
  progression_status: "Progression Status",
};
