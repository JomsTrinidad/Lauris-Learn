import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * List school_admin profiles for a school, augmented with auth.users invite
 * status (confirmed vs pending). Super-admin only.
 *
 * GET /api/super-admin/admins/list?schoolId=<uuid>
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const schoolId = (url.searchParams.get("schoolId") ?? "").trim();
  if (!schoolId) return NextResponse.json({ error: "schoolId is required." }, { status: 400 });

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

  // Fetch school_admin profiles for this school
  const { data: admins, error: listErr } = await admin
    .from("profiles")
    .select("id, email, full_name, created_at, updated_at")
    .eq("school_id", schoolId)
    .eq("role", "school_admin")
    .order("created_at", { ascending: true });

  if (listErr) {
    console.error("[admins/list] Profile fetch failed:", listErr);
    return NextResponse.json({ error: "Failed to load admins." }, { status: 500 });
  }

  // Augment with auth.users confirmation status so the UI can show pending invites
  const enriched = await Promise.all(
    (admins ?? []).map(async (p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: au } = await (admin as any).auth.admin.getUserById(p.id);
      const u = au?.user;
      const emailConfirmedAt: string | null = u?.email_confirmed_at ?? null;
      const lastSignInAt:     string | null = u?.last_sign_in_at ?? null;
      const invitedAt:        string | null = u?.invited_at ?? null;
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        createdAt: p.created_at,
        emailConfirmedAt,
        lastSignInAt,
        invitedAt,
        pending: !emailConfirmedAt && !lastSignInAt,
      };
    })
  );

  return NextResponse.json({ ok: true, admins: enriched });
}
