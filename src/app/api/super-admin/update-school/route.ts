import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const VALID_TRIAL_STATUSES = ["active", "expired", "converted"] as const;
type TrialStatus = (typeof VALID_TRIAL_STATUSES)[number];

const VALID_SUB_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
type SubscriptionStatus = (typeof VALID_SUB_STATUSES)[number];

const VALID_BILLING_CYCLES = ["monthly", "annual"] as const;
type BillingCycle = (typeof VALID_BILLING_CYCLES)[number];

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
  const subscriptionStatus: SubscriptionStatus = VALID_SUB_STATUSES.includes(body.subscriptionStatus as SubscriptionStatus)
    ? (body.subscriptionStatus as SubscriptionStatus)
    : "trial";
  const billingPlan = typeof body.billingPlan === "string" ? body.billingPlan.trim() || null : null;
  const billingCycle: BillingCycle = VALID_BILLING_CYCLES.includes(body.billingCycle as BillingCycle)
    ? (body.billingCycle as BillingCycle)
    : "monthly";
  const isDemo = typeof body.isDemo === "boolean" ? body.isDemo : false;
  const subscriptionStartedAt = typeof body.subscriptionStartedAt === "string" ? body.subscriptionStartedAt : null;
  const subscriptionCancelledAt = typeof body.subscriptionCancelledAt === "string" ? body.subscriptionCancelledAt : null;

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

  // Fetch current values for audit old_values (also verifies the school exists)
  const { data: targetSchool } = await admin
    .from("schools")
    .select("id, name, trial_start_date, trial_end_date, trial_status, subscription_status, billing_plan, billing_cycle, is_demo")
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
      subscription_status: subscriptionStatus,
      billing_plan: billingPlan,
      billing_cycle: billingCycle,
      is_demo: isDemo,
      ...(subscriptionStartedAt !== null ? { subscription_started_at: subscriptionStartedAt } : {}),
      ...(subscriptionCancelledAt !== null ? { subscription_cancelled_at: subscriptionCancelledAt } : {}),
    })
    .eq("id", schoolId);

  if (updateErr) {
    console.error("[update-school] Update failed:", updateErr);
    return NextResponse.json({ error: "Failed to update school." }, { status: 500 });
  }

  // Audit
  await insertAuditLog(admin, {
    schoolId:    schoolId,
    actorUserId: user.id,
    actorRole:   "super_admin",
    tableName:   "schools",
    recordId:    schoolId,
    action:      "UPDATE",
    oldValues:   {
      name: (targetSchool as any).name,
      trial_start_date: (targetSchool as any).trial_start_date,
      trial_end_date: (targetSchool as any).trial_end_date,
      trial_status: (targetSchool as any).trial_status,
      subscription_status: (targetSchool as any).subscription_status,
      billing_plan: (targetSchool as any).billing_plan,
      billing_cycle: (targetSchool as any).billing_cycle,
      is_demo: (targetSchool as any).is_demo,
    },
    newValues:   {
      name,
      trial_start_date: trialStartDate || null,
      trial_end_date: trialEndDate || null,
      trial_status: trialStatus,
      subscription_status: subscriptionStatus,
      billing_plan: billingPlan,
      billing_cycle: billingCycle,
      is_demo: isDemo,
    },
  });

  return NextResponse.json({ ok: true });
}
