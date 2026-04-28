import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const VALID_EVENT_TYPES = ["impersonation_started", "impersonation_ended"] as const;
type EventType = (typeof VALID_EVENT_TYPES)[number];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const targetSchoolId   = typeof body.targetSchoolId   === "string" ? body.targetSchoolId   : null;
  const targetSchoolName = typeof body.targetSchoolName === "string" ? body.targetSchoolName : "";
  const rawEventType     = typeof body.eventType        === "string" ? body.eventType        : null;

  if (!targetSchoolId) {
    return NextResponse.json({ error: "targetSchoolId is required." }, { status: 400 });
  }
  if (!rawEventType || !VALID_EVENT_TYPES.includes(rawEventType as EventType)) {
    return NextResponse.json({ error: "eventType must be impersonation_started or impersonation_ended." }, { status: 400 });
  }
  const eventType = rawEventType as EventType;

  // Verify the caller is authenticated.
  const serverClient = await createServerClient();
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify caller is super_admin — do NOT trust any role from the request body.
  const { data: caller } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify the target school exists (prevents logging phantom school IDs).
  const { data: school } = await admin
    .from("schools")
    .select("id, name")
    .eq("id", targetSchoolId)
    .maybeSingle();

  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  // Write to impersonation_audit_log (operational log, never deleted).
  // Use the school name from the database, not from the client, so logs are trustworthy.
  const { error: insertErr } = await admin.from("impersonation_audit_log").insert({
    actor_id:           user.id,
    actor_email:        caller.email,
    target_school_id:   school.id,
    target_school_name: school.name,
    event_type:         eventType,
  });

  if (insertErr) {
    console.error("[impersonation-log] impersonation_audit_log insert failed:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Also write to audit_logs with actor_role = 'super_admin_impersonating' so any
  // writes that happen during the session are attributable to the correct context.
  await insertAuditLog(admin, {
    schoolId:    school.id,
    actorUserId: user.id,
    actorRole:   "super_admin_impersonating",
    tableName:   "impersonation_audit_log",
    recordId:    null,
    action:      "INSERT",
    newValues:   { event_type: eventType, target_school_id: school.id, target_school_name: school.name },
  });

  return NextResponse.json({ ok: true });
}
