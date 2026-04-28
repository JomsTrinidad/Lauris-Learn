import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";
import { generateDemoData, clearDemoData, type DemoScenario, type DemoAction } from "@/lib/demo";

const VALID_SCENARIOS: DemoScenario[] = ["small_preschool", "compliance_heavy", "trial_new"];
const VALID_ACTIONS:   DemoAction[]   = ["generate", "refresh", "reset"];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }

  const schoolId = typeof body.schoolId  === "string" ? body.schoolId.trim() : "";
  const scenario = body.scenario as DemoScenario;
  const action   = (body.action ?? "generate") as DemoAction;

  if (!schoolId) return NextResponse.json({ error: "schoolId is required." }, { status: 400 });
  if (!VALID_SCENARIOS.includes(scenario)) return NextResponse.json({ error: "Invalid scenario." }, { status: 400 });
  if (!VALID_ACTIONS.includes(action))     return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  // Auth check
  const serverClient = await createServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Role check
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Verify school is a demo school
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: school } = await (admin as any).from("schools").select("id, name, is_demo").eq("id", schoolId).single();
  if (!school)        return NextResponse.json({ error: "School not found." }, { status: 404 });
  if (!school.is_demo) return NextResponse.json({ error: "School is not marked as a demo school. Operation blocked." }, { status: 403 });

  // Block concurrent runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: running } = await (admin as any)
    .from("demo_data_runs").select("id").eq("school_id", schoolId).eq("status", "running").maybeSingle();
  if (running) return NextResponse.json({ error: "A demo data run is already in progress for this school." }, { status: 409 });

  // Create run record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runRow, error: runErr } = await (admin as any)
    .from("demo_data_runs")
    .insert({ school_id: schoolId, scenario, action, status: "running", created_by: user.id })
    .select("id").single();
  if (runErr) return NextResponse.json({ error: "Failed to create run record." }, { status: 500 });
  const runId: string = runRow.id;

  try {
    // Always clear first — makes retries after failed runs safe (generate is idempotent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lastRun } = await (admin as any)
      .from("demo_data_runs")
      .select("summary")
      .eq("school_id", schoolId)
      .eq("status", "completed")
      .not("action", "eq", "clear")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevUserIds: string[] = lastRun?.summary?.demoUserIds ?? [];
    await clearDemoData(admin, schoolId, prevUserIds);

    // Generate demo data
    const summary = await generateDemoData(admin, schoolId, scenario, user.id);

    // Mark run completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("demo_data_runs").update({
      status: "completed", summary, completed_at: new Date().toISOString(),
    }).eq("id", runId);

    await insertAuditLog(admin, {
      schoolId, actorUserId: user.id, actorRole: "super_admin",
      tableName: "demo_data_runs", recordId: runId, action: "INSERT",
      newValues: { school_id: schoolId, scenario, action, status: "completed" },
    });

    return NextResponse.json({ ok: true, runId, summary });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[demo-data/generate]", msg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("demo_data_runs").update({
      status: "failed", error_message: msg, completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
