import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite or assign a school_admin to a school.
 *
 * Body: { schoolId, email, fullName? }
 *
 * Outcomes:
 *   - { ok: true, mode: "assigned" }  — existing user, profile linked + role set
 *   - { ok: true, mode: "invited"  }  — new user, Supabase invite email sent
 *   - { ok: true, mode: "already_assigned" } — no-op (email already admins this school)
 *
 * Refuses to touch a super_admin profile, parent profile, or a profile already
 * bound to a different school.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

  if (!schoolId) return NextResponse.json({ error: "schoolId is required." }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  // Verify caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify caller is super_admin (looked up server-side; never trusted from client)
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify the target school exists
  const { data: school } = await admin
    .from("schools")
    .select("id, name")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  // Look up existing profile by email
  const { data: existing } = await admin
    .from("profiles")
    .select("id, school_id, role")
    .eq("email", email)
    .maybeSingle();

  // ── Existing user path ────────────────────────────────────────────────────
  if (existing) {
    if (existing.role === "super_admin") {
      return NextResponse.json(
        { error: "Cannot assign a super_admin account as a school admin." },
        { status: 409 }
      );
    }
    if (existing.school_id && existing.school_id !== schoolId) {
      return NextResponse.json(
        { error: "This user is already linked to a different school. Unlink them first." },
        { status: 409 }
      );
    }
    if (existing.school_id === schoolId && existing.role === "school_admin") {
      return NextResponse.json({ ok: true, mode: "already_assigned" });
    }

    const updatePayload: Record<string, unknown> = {
      school_id: schoolId,
      role: "school_admin",
    };
    if (fullName) updatePayload.full_name = fullName;

    const { error: updErr } = await admin
      .from("profiles")
      .update(updatePayload)
      .eq("id", existing.id);
    if (updErr) {
      console.error("[admins/invite] Profile update failed:", updErr);
      return NextResponse.json({ error: "Failed to assign admin." }, { status: 500 });
    }

    await insertAuditLog(admin, {
      schoolId,
      actorUserId: user.id,
      actorRole:   "super_admin",
      tableName:   "profiles",
      recordId:    existing.id,
      action:      "UPDATE",
      newValues:   { school_id: schoolId, role: "school_admin", assigned_via: "admins_invite" },
    });

    return NextResponse.json({ ok: true, mode: "assigned" });
  }

  // ── New user path: send Supabase invite email ─────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inviteData, error: inviteErr } = await (admin as any).auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: { full_name: fullName || email },
    }
  );

  if (inviteErr || !inviteData?.user) {
    console.error("[admins/invite] inviteUserByEmail failed:", inviteErr);
    const msg = inviteErr?.message || "Failed to send invite.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // The handle_new_user trigger created the profile. Link it to the school.
  // (Use the new user's id rather than re-querying by email to avoid race conditions.)
  const newUserId = inviteData.user.id;
  const { error: linkErr } = await admin
    .from("profiles")
    .update({
      school_id: schoolId,
      role: "school_admin",
      ...(fullName ? { full_name: fullName } : {}),
    })
    .eq("id", newUserId);
  if (linkErr) {
    console.error("[admins/invite] Profile link failed after invite:", linkErr);
    return NextResponse.json(
      { error: "Invite sent, but role assignment failed. Try Resend Invite or assign manually." },
      { status: 207 }
    );
  }

  await insertAuditLog(admin, {
    schoolId,
    actorUserId: user.id,
    actorRole:   "super_admin",
    tableName:   "profiles",
    recordId:    newUserId,
    action:      "INSERT",
    newValues:   { email, school_id: schoolId, role: "school_admin", invited: true },
  });

  return NextResponse.json({ ok: true, mode: "invited" });
}
