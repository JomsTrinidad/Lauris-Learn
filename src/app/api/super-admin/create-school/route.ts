import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

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
  // `existingProfile` is null when the email belongs to no one yet — in that case
  // we'll send a Supabase invite AFTER the school is created.
  let existingProfileId: string | null = null;
  if (adminEmail) {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, role, school_id")
      .eq("email", adminEmail)
      .maybeSingle();

    if (targetProfile) {
      // Never touch a super_admin profile — refuse rather than silently overwrite
      if (targetProfile.role === "super_admin") {
        return NextResponse.json(
          { error: "Cannot assign a super_admin account as a school admin." },
          { status: 409 }
        );
      }
      // Refuse to silently steal an admin from another tenant
      if (targetProfile.school_id) {
        return NextResponse.json(
          { error: "This user is already linked to another school. Use the Admin Access panel on that school to unlink them first." },
          { status: 409 }
        );
      }
      existingProfileId = targetProfile.id;
    }
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

  // ── Admin handling ────────────────────────────────────────────────────────
  // adminMode tells the client what to message:
  //   "none"     — no email provided; admin can be added later
  //   "assigned" — existing user, profile linked + role set
  //   "invited"  — new user, Supabase invite email sent
  let adminMode: "none" | "assigned" | "invited" = "none";

  if (existingProfileId) {
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        school_id: newSchool.id,
        role: "school_admin",
        full_name: adminName || adminEmail,
      })
      .eq("id", existingProfileId);

    if (profileErr) {
      console.error("[create-school] Profile update failed:", profileErr);
      return NextResponse.json(
        { error: "School created but admin assignment failed. Please assign the admin manually from the Admin Access panel." },
        { status: 207 }
      );
    }
    adminMode = "assigned";
  } else if (adminEmail) {
    // New user — send Supabase invite, then link the auto-created profile to the school.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inviteData, error: inviteErr } = await (admin as any).auth.admin.inviteUserByEmail(
      adminEmail,
      { redirectTo, data: { full_name: adminName || adminEmail } }
    );

    if (inviteErr || !inviteData?.user) {
      console.error("[create-school] inviteUserByEmail failed:", inviteErr);
      return NextResponse.json(
        { error: "School created, but the admin invite could not be sent. Use the Admin Access panel to retry." },
        { status: 207 }
      );
    }

    const { error: linkErr } = await admin
      .from("profiles")
      .update({
        school_id: newSchool.id,
        role: "school_admin",
        full_name: adminName || adminEmail,
      })
      .eq("id", inviteData.user.id);
    if (linkErr) {
      console.error("[create-school] Post-invite profile link failed:", linkErr);
      return NextResponse.json(
        { error: "School created and invite sent, but role assignment failed. Use Admin Access → Resend Invite." },
        { status: 207 }
      );
    }
    adminMode = "invited";
  }

  // Audit — service-role bypasses auth.uid() so triggers can't fire; write manually
  await insertAuditLog(admin, {
    schoolId:    newSchool.id,
    actorUserId: user.id,
    actorRole:   "super_admin",
    tableName:   "schools",
    recordId:    newSchool.id,
    action:      "INSERT",
    newValues:   {
      name,
      trial_status: trialStatus,
      trial_start_date: trialStartDate,
      trial_end_date:   trialEndDate,
      admin_email:      adminEmail || null,
      admin_mode:       adminMode,
    },
  });

  return NextResponse.json({ ok: true, schoolId: newSchool.id, adminMode });
}
