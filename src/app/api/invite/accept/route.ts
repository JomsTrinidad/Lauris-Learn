import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // Parse request body
  let token: string;
  try {
    const body = await req.json();
    token = body.token;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Confirm the caller is authenticated via their cookie session
  const serverClient = await createServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use service role client for all further reads/writes (bypasses RLS)
  const admin = createAdminClient();

  // Look up invite by token
  const { data: invite, error: fetchError } = await admin
    .from("guardian_invites")
    .select("id, used_at, expires_at, email, student_id, school_id")
    .eq("token", token)
    .maybeSingle();

  if (fetchError || !invite) {
    return NextResponse.json({ error: "invalid" }, { status: 404 });
  }

  // Reject if already used
  if (invite.used_at) {
    return NextResponse.json({ error: "used" }, { status: 409 });
  }

  // Reject if expired
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Reject if the authenticated user's email doesn't match the invite email
  if (invite.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  // Mark invite as used atomically — only updates if used_at is still NULL.
  // If another concurrent request already claimed it, data will be empty.
  const { data: claimed, error: claimError } = await admin
    .from("guardian_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("id");

  if (claimError) {
    console.error("[invite/accept] Failed to claim invite:", claimError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    // Race condition: another request marked it used between our check and update
    return NextResponse.json({ error: "used" }, { status: 409 });
  }

  // Assign parent role to the authenticated user
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "parent" })
    .eq("id", user.id);

  if (profileError) {
    console.error("[invite/accept] Failed to set parent role:", profileError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
