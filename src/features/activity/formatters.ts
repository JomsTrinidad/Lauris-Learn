/**
 * Activity feature — human-readable formatters.
 *
 * Centralized so list rows can read like sentences ("School Admin updated a
 * progress note for Gianna Aquino") instead of SQL-shaped jargon
 * ("UPDATE progress_observations …"). Both the Activity History page and any
 * future Ops Intelligence transcript can consume these helpers.
 *
 * Design rules:
 *   - Never invent information not present in the audit row.
 *   - Prefer specificity when the row carries a name; degrade gracefully otherwise.
 *   - No raw SQL, no internal IDs in user-facing strings.
 *
 * Future Ops Intelligence (not implemented):
 *   - Inactive school detection (no audit rows for N days for a school).
 *   - Failed-invite spikes (would need a new event source, not audit_logs).
 *   - Onboarding completion (composite signal across multiple INSERT events).
 *   - Attendance submission trends (count attendance_records INSERTs per day).
 *   - Parent engagement (parent_updates view events — not captured today).
 *   - Draft IEP abandonment (student_plans status='draft' aged > N days).
 *   - Storage growth (would need a new event source for child_documents bytes).
 *   - Schools with no active teachers (cross-tenant scan, super_admin only).
 *
 * These signals would all consume the same AuditLogRow stream (plus extensions)
 * via this formatter module, keeping the UX layers separate.
 */

import { format } from "date-fns";
import {
  ACTION_LABELS,
  ACTOR_LABELS,
  CATEGORY_LABELS,
  CATEGORY_MAP,
  ENTITY_MAP,
  SUPPRESSED_TABLES,
} from "./constants";
import type {
  ActivityCategory,
  AuditLogRow,
  FormattedActivity,
} from "./types";

// ─── Small helpers ────────────────────────────────────────────────────────────

function pickString(
  vals: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!vals) return null;
  for (const k of keys) {
    const v = vals[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickBoolean(
  vals: Record<string, unknown> | null,
  key: string
): boolean | null {
  if (!vals) return null;
  const v = vals[key];
  return typeof v === "boolean" ? v : null;
}

function pickNumber(
  vals: Record<string, unknown> | null,
  key: string
): number | null {
  if (!vals) return null;
  const v = vals[key];
  return typeof v === "number" ? v : null;
}

function fieldChanged(log: AuditLogRow, field: string): boolean {
  if (log.action !== "UPDATE") return false;
  const o = log.old_values?.[field];
  const n = log.new_values?.[field];
  return JSON.stringify(o) !== JSON.stringify(n);
}

function actorRoleLabel(log: AuditLogRow): string {
  return (
    ACTOR_LABELS[log.actor_role ?? ""] ??
    (log.actor_role ? log.actor_role.replace(/_/g, " ") : "System")
  );
}

/**
 * Resolve an actor display label, preferring a real name when available and
 * falling back to the role label otherwise.
 *
 * Name resolution is intentionally limited: the only safely available source
 * today is the `list_school_staff_for_sharing` RPC (school_admin → staff in
 * own school only). Parents, super_admins, and the caller themselves are not
 * returned by that RPC — those callers fall back to the role label, and
 * "(you)" is appended separately when relevant.
 */
function actorDisplay(
  log: AuditLogRow,
  actorNames: Map<string, string> | null,
): { label: string; resolvedName: boolean } {
  const roleLabel = actorRoleLabel(log);
  if (!log.actor_user_id || !actorNames) {
    return { label: roleLabel, resolvedName: false };
  }
  const name = actorNames.get(log.actor_user_id);
  if (!name) return { label: roleLabel, resolvedName: false };
  return { label: name, resolvedName: true };
}

function formatBillingMonth(val: string): string {
  try {
    return format(new Date(val.substring(0, 7) + "-01T00:00:00"), "MMMM yyyy");
  } catch {
    return val;
  }
}

// ─── Per-table summary builders ───────────────────────────────────────────────
//
// Each builder produces { verb, object, detail? }.
//  - verb: the action phrasing ("added", "updated", "removed", or something
//    table-specific like "submitted", "posted", "finalized")
//  - object: the noun phrase describing what was touched ("an attendance record")
//  - detail: optional short context ("for Gianna Aquino", "for October 2026")

type Phrase = { verb: string; object: string; detail?: string | null };

function defaultVerb(action: AuditLogRow["action"]): string {
  if (action === "INSERT") return "added";
  if (action === "DELETE") return "removed";
  return "updated";
}

function buildPhrase(log: AuditLogRow): Phrase {
  const vals =
    log.action === "DELETE" ? log.old_values : log.new_values ?? log.old_values;
  const entity = ENTITY_MAP[log.table_name] ?? log.table_name.replace(/_/g, " ");
  const fallback: Phrase = {
    verb: defaultVerb(log.action),
    object: `a ${entity}`,
  };

  switch (log.table_name) {
    // ─── Students ──────────────────────────────────────────────────────────
    case "students": {
      const composed =
        [pickString(vals, "first_name"), pickString(vals, "last_name")]
          .filter(Boolean)
          .join(" ")
          .trim() || null;
      const name = pickString(vals, "full_name") ?? composed;
      if (log.action === "INSERT") {
        return { verb: "added student", object: name ?? "a new student" };
      }
      if (log.action === "DELETE") {
        return { verb: "removed student", object: name ?? "a student record" };
      }
      return {
        verb: "updated",
        object: name ? `${name}'s student record` : "a student record",
      };
    }

    case "guardians": {
      const name = pickString(vals, "full_name");
      if (log.action === "INSERT") {
        return {
          verb: "added guardian",
          object: name ?? "a new guardian",
        };
      }
      if (log.action === "DELETE") {
        return {
          verb: "removed guardian",
          object: name ?? "a guardian record",
        };
      }
      return {
        verb: "updated",
        object: name ? `guardian ${name}` : "a guardian record",
      };
    }

    // ─── Attendance ────────────────────────────────────────────────────────
    case "attendance_records": {
      const date = pickString(vals, "date");
      const detail = date
        ? `for ${format(new Date(date + "T00:00:00"), "MMM d, yyyy")}`
        : null;
      if (log.action === "INSERT") {
        return { verb: "submitted", object: "an attendance record", detail };
      }
      return {
        verb: log.action === "DELETE" ? "removed" : "updated",
        object: "an attendance record",
        detail,
      };
    }

    case "absence_notifications": {
      const date = pickString(vals, "date");
      const detail = date
        ? `for ${format(new Date(date + "T00:00:00"), "MMM d, yyyy")}`
        : null;
      return {
        verb: log.action === "INSERT" ? "reported" : defaultVerb(log.action),
        object: "an absence notice",
        detail,
      };
    }

    // ─── Plans & IEP ───────────────────────────────────────────────────────
    case "student_plans": {
      const title = pickString(vals, "title");
      const planTypeRaw = pickString(vals, "plan_type");
      const planType =
        planTypeRaw === "iep" ? "IEP" : planTypeRaw ?? "support plan";
      // status transitions get special verbs
      if (log.action === "UPDATE" && fieldChanged(log, "status")) {
        const newStatus = pickString(log.new_values, "status");
        if (newStatus === "approved" || newStatus === "active") {
          return {
            verb: "finalized",
            object: title ? `${planType} "${title}"` : `an ${planType}`,
          };
        }
        if (newStatus === "archived") {
          return {
            verb: "archived",
            object: title ? `${planType} "${title}"` : `an ${planType}`,
          };
        }
        if (newStatus === "submitted" || newStatus === "in_review") {
          return {
            verb: "submitted",
            object: title
              ? `${planType} "${title}" for review`
              : `an ${planType} for review`,
          };
        }
      }
      if (log.action === "INSERT") {
        return {
          verb: "started",
          object: title ? `${planType} draft "${title}"` : `a new ${planType}`,
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: title ? `${planType} "${title}"` : `a ${planType}`,
      };
    }

    case "student_plan_goals":
      return {
        verb: defaultVerb(log.action),
        object: "a plan goal",
      };
    case "student_plan_interventions":
      return {
        verb: defaultVerb(log.action),
        object: "a plan intervention",
      };
    case "student_plan_progress_entries":
      return {
        verb: log.action === "INSERT" ? "logged" : defaultVerb(log.action),
        object: "a progress entry on a plan",
      };
    case "student_plan_attachments":
      return {
        verb: log.action === "INSERT" ? "attached" : defaultVerb(log.action),
        object: "a document to a plan",
      };

    // ─── Communication ────────────────────────────────────────────────────
    case "parent_updates": {
      const content = pickString(vals, "content");
      const isBroadcast = vals && vals["class_id"] === null;
      const audience = isBroadcast ? "the school" : "a class";
      if (log.action === "INSERT") {
        return {
          verb: isBroadcast ? "broadcast an announcement to" : "posted an update to",
          object: audience,
          detail: content
            ? `"${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"`
            : null,
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: isBroadcast ? "a broadcast announcement" : "a parent update",
      };
    }

    case "events": {
      const title = pickString(vals, "title");
      if (log.action === "INSERT") {
        return {
          verb: "scheduled",
          object: title ? `event "${title}"` : "a new event",
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: title ? `event "${title}"` : "an event",
      };
    }

    case "event_rsvps":
      return { verb: defaultVerb(log.action), object: "an event RSVP" };

    // ─── Enrollment ───────────────────────────────────────────────────────
    case "enrollments": {
      const status = pickString(vals, "status");
      if (log.action === "INSERT") {
        return {
          verb: "enrolled",
          object: "a student",
          detail: status ? `(${status})` : null,
        };
      }
      if (log.action === "UPDATE" && fieldChanged(log, "status")) {
        return {
          verb: "changed enrollment status to",
          object: pickString(log.new_values, "status") ?? "a new status",
        };
      }
      return { verb: defaultVerb(log.action), object: "an enrollment" };
    }

    case "enrollment_inquiries": {
      const name = pickString(vals, "student_name");
      if (log.action === "INSERT") {
        return {
          verb: "added inquiry",
          object: name ?? "a new prospective student",
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: name ? `inquiry for ${name}` : "an inquiry",
      };
    }

    case "enrollment_transitions":
      return {
        verb: log.action === "INSERT" ? "recorded" : defaultVerb(log.action),
        object: "an enrollment update",
      };

    case "student_class_assignments":
      return {
        verb: log.action === "INSERT" ? "assigned" : defaultVerb(log.action),
        object: "a student to a class",
      };

    case "school_year_completions":
      return {
        verb: log.action === "INSERT" ? "snapshotted" : defaultVerb(log.action),
        object: "a year-end record",
      };

    case "classes": {
      const name = pickString(vals, "name");
      if (log.action === "INSERT") {
        return { verb: "created class", object: name ?? "a new class" };
      }
      return {
        verb: defaultVerb(log.action),
        object: name ? `class "${name}"` : "a class",
      };
    }

    case "class_teachers":
      return {
        verb: log.action === "INSERT" ? "assigned" : defaultVerb(log.action),
        object: "a teacher to a class",
      };

    // ─── Documents ────────────────────────────────────────────────────────
    case "child_documents": {
      const title = pickString(vals, "title");
      if (log.action === "UPDATE" && fieldChanged(log, "status")) {
        const ns = pickString(log.new_values, "status");
        if (ns === "active") {
          return {
            verb: "activated",
            object: title ? `document "${title}"` : "a document",
          };
        }
        if (ns === "archived") {
          return {
            verb: "archived",
            object: title ? `document "${title}"` : "a document",
          };
        }
      }
      if (log.action === "INSERT") {
        return {
          verb: "uploaded",
          object: title ? `document "${title}"` : "a new document",
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: title ? `document "${title}"` : "a document",
      };
    }

    case "child_document_versions": {
      const isHidden = pickBoolean(vals, "is_hidden");
      if (
        log.action === "UPDATE" &&
        fieldChanged(log, "is_hidden") &&
        isHidden === true
      ) {
        return { verb: "hid", object: "a document version" };
      }
      if (log.action === "INSERT") {
        const v = pickNumber(vals, "version_number");
        return {
          verb: "uploaded",
          object: v != null ? `version ${v} of a document` : "a document version",
        };
      }
      return {
        verb: defaultVerb(log.action),
        object: "a document version",
      };
    }

    case "document_consents": {
      const status = pickString(vals, "status");
      if (log.action === "UPDATE" && fieldChanged(log, "status")) {
        if (status === "granted") {
          return { verb: "granted consent for", object: "a document" };
        }
        if (status === "revoked") {
          return { verb: "revoked consent for", object: "a document" };
        }
      }
      if (log.action === "INSERT") {
        return { verb: "requested consent for", object: "a document" };
      }
      return { verb: defaultVerb(log.action), object: "a document consent" };
    }

    case "document_access_grants": {
      if (log.action === "INSERT") {
        return { verb: "shared", object: "a document" };
      }
      if (log.action === "UPDATE" && fieldChanged(log, "revoked_at")) {
        return { verb: "revoked access to", object: "a document" };
      }
      return {
        verb: defaultVerb(log.action),
        object: "a document access grant",
      };
    }

    case "document_requests":
      return {
        verb: log.action === "INSERT" ? "requested" : defaultVerb(log.action),
        object: "a document",
      };

    case "external_contacts":
      return {
        verb: defaultVerb(log.action),
        object: "an external contact",
      };

    // ─── Progress (not in MVP categories but still renderable) ────────────
    case "progress_observations":
      return {
        verb: log.action === "INSERT" ? "recorded" : defaultVerb(log.action),
        object: "a progress note",
      };

    case "proud_moments":
      return {
        verb: log.action === "INSERT" ? "shared" : defaultVerb(log.action),
        object: "a proud moment",
      };

    // ─── Default ──────────────────────────────────────────────────────────
    default:
      return fallback;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format a raw audit_logs row into a presentation-ready entry.
 *
 * @param log         The raw row.
 * @param userId      The current viewer's user id, so we can mark self-actions.
 * @param actorNames  Optional map from auth user id → full name, used to
 *                    resolve actor names. Currently sourced from the
 *                    `list_school_staff_for_sharing` RPC; missing entries
 *                    fall back to the role label.
 */
export function formatActivity(
  log: AuditLogRow,
  userId: string | null,
  actorNames: Map<string, string> | null = null,
): FormattedActivity {
  const category = CATEGORY_MAP[log.table_name] ?? "other";
  const isSelf = !!userId && log.actor_user_id === userId;
  const isImpersonating = log.actor_role === "super_admin_impersonating";
  const { label: actor, resolvedName } = isSelf
    ? { label: actorRoleLabel(log), resolvedName: false }
    : actorDisplay(log, actorNames);
  const phrase = buildPhrase(log);

  // "Jose Lopez submitted an attendance record for Oct 14, 2026"
  // or fallback: "School Admin submitted an attendance record for Oct 14, 2026"
  const detailPart = phrase.detail ? ` ${phrase.detail}` : "";
  const selfSuffix = isSelf ? " (you)" : "";
  const summary = `${actor}${selfSuffix} ${phrase.verb} ${phrase.object}${detailPart}`;

  return {
    id: log.id,
    createdAt: log.created_at,
    actorLabel: actor,
    actorIsSelf: isSelf,
    actorIsImpersonating: isImpersonating,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    summary,
    detail: resolvedName ? actorRoleLabel(log) : null,
    action: log.action,
    raw: log,
    domain: "school_activity",
    scope: "school",
  };
}

/**
 * True if this row should be hidden from the school-facing feed. Examples:
 * RLS bookkeeping, high-frequency low-signal churn. See SUPPRESSED_TABLES.
 */
export function shouldSuppress(log: AuditLogRow): boolean {
  return SUPPRESSED_TABLES.has(log.table_name);
}

/** Format a timestamp consistently across the feed. */
export function formatActivityTimestamp(iso: string): {
  date: string;
  time: string;
  full: string;
} {
  const d = new Date(iso);
  return {
    date: format(d, "MMM d, yyyy"),
    time: format(d, "h:mm a"),
    full: format(d, "MMMM d, yyyy 'at' h:mm a"),
  };
}

/** Re-export labels for callers that don't want to import from constants directly. */
export { ACTION_LABELS, ACTOR_LABELS, CATEGORY_LABELS };

/** Re-export category bookkeeping for the page. */
export type ActivityCategoryAlias = ActivityCategory;
