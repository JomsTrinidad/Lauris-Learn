import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

// NOTE: No audit log table exists yet. When audit infrastructure is added (Phase 2),
// insert a row here recording: actor_id, action='update_school', target_school_id, changes, timestamp.

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const VALID_TRIAL_STATUSES = ["active", "expired", "converted"] as const;
type TrialStatus = (typeof VALID_TRIAL_STATUSES)[number];

export async function POST(req: NextRequest) {
  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const trialStartDate = typeof body.trialStartDate === "string" ? body.trialStartDate : null;
  const trialEndDate = typeof body.trialEndDate === "string" ? body.trialEndDate : null;
  const trialStatus: TrialStatus = VALID_TRIAL_STATUSES.includes(body.trialStatus as TrialStatus)
    ? (body.trialStatus as TrialStatus)
    : "active";

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "School name is required." }, { status: 400 });
  }

  // Verify the caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify the caller is a super_admin (checked against the database, not the JWT)
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify the target school actually exists
  const { data: targetSchool } = await admin
    .from("schools")
    .select("id")
    .eq("id", schoolId)
    .maybeSingle();
  if (!targetSchool) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  // Update the school
  const { error: updateErr } = await admin
    .from("schools")
    .update({
      name,
      trial_start_date: trialStartDate || null,
      trial_end_date: trialEndDate || null,
      trial_status: trialStatus,
    })
    .eq("id", schoolId);

  if (updateErr) {
    console.error("[update-school] Update failed:", updateErr);
    return NextResponse.json({ error: "Failed to update school." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
