import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

// NOTE: No audit log table exists yet. When audit infrastructure is added (Phase 2),
// insert a row here recording: actor_id, action='create_school', target_school_id, timestamp.

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const trialStartDate = typeof body.trialStartDate === "string" ? body.trialStartDate : null;
  const trialEndDate = typeof body.trialEndDate === "string" ? body.trialEndDate : null;
  const trialStatus: TrialStatus = VALID_TRIAL_STATUSES.includes(body.trialStatus as TrialStatus)
    ? (body.trialStatus as TrialStatus)
    : "active";
  const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
  const adminName = typeof body.adminName === "string" ? body.adminName.trim() : "";

  // Validate required fields
  if (!name) {
    return NextResponse.json({ error: "School name is required." }, { status: 400 });
  }
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    return NextResponse.json({ error: "Invalid admin email address." }, { status: 400 });
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

  // Check for duplicate school name
  const { data: existing } = await admin
    .from("schools")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `A school named "${name}" already exists.` },
      { status: 409 }
    );
  }

  // If adminEmail provided, resolve the target profile before creating the school.
  // We do this first so we can fail fast before any writes.
  let targetProfileId: string | null = null;
  if (adminEmail) {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, role")
      .eq("email", adminEmail)
      .maybeSingle();

    if (!targetProfile) {
      return NextResponse.json(
        { error: `No account found for "${adminEmail}". The user must sign up first.` },
        { status: 404 }
      );
    }
    // Never touch a super_admin profile — refuse rather than silently overwrite
    if (targetProfile.role === "super_admin") {
      return NextResponse.json(
        { error: "Cannot assign a super_admin account as a school admin." },
        { status: 409 }
      );
    }
    targetProfileId = targetProfile.id;
  }

  // Create the school
  const { data: newSchool, error: schoolErr } = await admin
    .from("schools")
    .insert({
      name,
      trial_start_date: trialStartDate || null,
      trial_end_date: trialEndDate || null,
      trial_status: trialStatus,
    })
    .select("id")
    .single();

  if (schoolErr || !newSchool) {
    console.error("[create-school] Insert school failed:", schoolErr);
    return NextResponse.json({ error: "Failed to create school." }, { status: 500 });
  }

  // Seed a default active school year
  await admin.from("school_years").insert({
    school_id: newSchool.id,
    name: "SY 2025–2026",
    start_date: "2025-06-01",
    end_date: "2026-03-31",
    status: "active",
  });

  // Assign admin profile to the new school (role hardcoded server-side to school_admin)
  if (targetProfileId) {
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        school_id: newSchool.id,
        role: "school_admin",
        full_name: adminName || adminEmail,
      })
      .eq("id", targetProfileId);

    if (profileErr) {
      console.error("[create-school] Profile update failed:", profileErr);
      // School was already created — return partial success so caller can retry admin assignment
      return NextResponse.json(
        { error: "School created but admin assignment failed. Please assign the admin manually." },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ ok: true, schoolId: newSchool.id });
}
