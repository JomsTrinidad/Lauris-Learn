import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resend an invite OR send a password reset email to an existing school_admin.
 *
 * Body:    { schoolId, email }
 * Returns: { ok: true, mode: "invite_email_sent" | "reset_email_sent" }
 *
 * Behavior:
 *   - If the target user has NEVER confirmed their email (still pending the
 *     original invite) → re-call `auth.admin.inviteUserByEmail()`, which
 *     triggers the Supabase invite email.
 *   - Otherwise → call `auth.resetPasswordForEmail()` against an anon-key
 *     client, which triggers the Supabase recovery email.
 *
 * Both methods rely on Supabase's built-in mailer (or whatever SMTP provider
 * is configured in Supabase Dashboard → Authentication → Email). We do NOT
 * use `auth.admin.generateLink()` here — that method only mints a URL and
 * does NOT send an email; using it would make the UI label inaccurate.
 *
 * Super-admin only.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!schoolId) return NextResponse.json({ error: "schoolId is required." }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  // Verify caller
  const serverClient = await createServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Confirm target is actually a school_admin of this school
  const { data: target } = await admin
    .from("profiles")
    .select("id, school_id, role")
    .eq("email", email)
    .maybeSingle();
  if (!target || target.school_id !== schoolId || target.role !== "school_admin") {
    return NextResponse.json({ error: "Admin not found for this school." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: au } = await (admin as any).auth.admin.getUserById(target.id);
  const isPending = !au?.user?.email_confirmed_at && !au?.user?.last_sign_in_at;

  if (isPending) {
    // Re-invite — sends the email via Supabase's mailer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: au?.user?.user_metadata?.full_name ?? email },
    });
    if (error) {
      console.error("[admins/resend-invite] inviteUserByEmail failed:", error);
      return NextResponse.json(
        { error: error.message || "Failed to resend invite email." },
        { status: 500 }
      );
    }

    await insertAuditLog(admin, {
      schoolId,
      actorUserId: user.id,
      actorRole:   "super_admin",
      tableName:   "profiles",
      recordId:    target.id,
      action:      "UPDATE",
      newValues:   { resent: "invite_email_sent", email },
    });

    return NextResponse.json({ ok: true, mode: "invite_email_sent" });
  }

  // Active user — send a password recovery email via the anon-key client.
  // resetPasswordForEmail() actually triggers the Supabase email; generateLink
  // would only mint a URL and would NOT send anything.
  const anonClient = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: resetErr } = await anonClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetErr) {
    console.error("[admins/resend-invite] resetPasswordForEmail failed:", resetErr);
    return NextResponse.json(
      { error: resetErr.message || "Failed to send reset email." },
      { status: 500 }
    );
  }

  await insertAuditLog(admin, {
    schoolId,
    actorUserId: user.id,
    actorRole:   "super_admin",
    tableName:   "profiles",
    recordId:    target.id,
    action:      "UPDATE",
    newValues:   { resent: "reset_email_sent", email },
  });

  return NextResponse.json({ ok: true, mode: "reset_email_sent" });
}
