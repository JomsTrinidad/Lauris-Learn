/**
 * Server-only utilities for the Supabase service-role client.
 * Import ONLY from API routes (src/app/api/**). Never import from client components.
 *
 * This module provides:
 *   createAdminClient() — RLS-bypassing admin client for server-side validation
 *   insertAuditLog()    — writes to audit_logs on behalf of service-role routes
 *                         (audit triggers cannot fire when auth.uid() is NULL)
 */

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

// Large/binary fields excluded from logged values (mirrors the trigger in 036_audit_logs.sql)
const STRIP_FIELDS = new Set([
  "photo_path", "receipt_photo_path", "avatar_url", "logo_url", "photos", "branding",
]);

function stripBinary(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !STRIP_FIELDS.has(k))
  );
}

export interface AuditEntry {
  schoolId:    string | null;
  actorUserId: string | null;
  actorRole:   string | null;
  tableName:   string;
  recordId:    string | null;
  action:      AuditAction;
  oldValues?:  Record<string, unknown> | null;
  newValues?:  Record<string, unknown> | null;
}

/**
 * Insert an audit log row using the service-role client.
 * Failures are logged but never thrown — audit must not block the main operation.
 */
export async function insertAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    school_id:     entry.schoolId,
    actor_user_id: entry.actorUserId,
    actor_role:    entry.actorRole,
    table_name:    entry.tableName,
    record_id:     entry.recordId,
    action:        entry.action,
    old_values:    entry.oldValues ? stripBinary(entry.oldValues) : null,
    new_values:    entry.newValues ? stripBinary(entry.newValues) : null,
  });
  if (error) {
    console.error("[audit_log] Insert failed:", { table: entry.tableName, action: entry.action, error });
  }
}
