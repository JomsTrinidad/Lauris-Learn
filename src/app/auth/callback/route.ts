import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Auth callback for Supabase email links (invite, magic link, password recovery).
 * Exchanges the PKCE `?code=` for a session cookie, then forwards to `next`.
 *
 * Used by:
 *   - inviteUserByEmail() links            → redirected to /reset-password (first-time set)
 *   - resetPasswordForEmail() links        → redirected to /reset-password
 *   - magic links (future)                 → redirected to /dashboard
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/reset-password";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
