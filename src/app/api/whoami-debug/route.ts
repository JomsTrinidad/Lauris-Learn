/**
 * TEMPORARY debug route — delete after diagnosing the Phase D upload RLS issue.
 *
 * Calls the whoami_debug() SQL function under the caller's session so we can
 * see exactly what Postgres resolves for auth.uid(), profile.role,
 * current_user_role(), and current_user_school_id().
 *
 * Visit http://localhost:3000/api/whoami-debug while signed in.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "not_signed_in", authErr: authErr?.message ?? null }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("whoami_debug");
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    rpc: data,
    rpcError: error?.message ?? null,
  });
}
