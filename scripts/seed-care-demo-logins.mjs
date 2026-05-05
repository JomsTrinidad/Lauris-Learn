/**
 * scripts/seed-care-demo-logins.mjs
 *
 * Creates demo auth users, clinic organizations, and organization_memberships
 * for Lauris Care isolation testing.
 *
 * Does NOT seed children, sessions, clinic documents, or any clinical data.
 * Those are seeded separately after login testing passes.
 *
 * Idempotent: safe to rerun.
 *   - existing auth users → password reset, metadata updated
 *   - existing clinic orgs → reused by name
 *   - existing active memberships → role updated if different, otherwise skipped
 *
 * Usage:
 *   node scripts/seed-care-demo-logins.mjs
 *
 * Required env vars (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─── Load .env.local ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// ─── Admin client (bypasses RLS) ─────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Config ───────────────────────────────────────────────────────────────────

const DEMO_PASSWORD = "Demo2026!";

// Clinic organizations to create or reuse
const CLINICS = [
  { slug: "north", name: "Lauris Care Demo Clinic North", kind: "clinic" },
  { slug: "south", name: "Lauris Care Demo Clinic South", kind: "clinic" },
];

// Care users and their clinic + role assignments
// memberRole must match values used in Care portal RLS:
//   'clinic_admin' — full clinic write access (create children, upload docs, schedule sessions)
//   'therapist'    — session scheduling + read access
const DEMO_USERS = [
  { email: "care.admin.north@lauris.demo",    fullName: "Care Admin North",         clinicSlug: "north", memberRole: "clinic_admin" },
  { email: "care.admin.south@lauris.demo",    fullName: "Care Admin South",         clinicSlug: "south", memberRole: "clinic_admin" },
  { email: "care.speech.north@lauris.demo",   fullName: "Speech Therapist North",   clinicSlug: "north", memberRole: "therapist"    },
  { email: "care.ot.north@lauris.demo",       fullName: "OT Therapist North",       clinicSlug: "north", memberRole: "therapist"    },
  { email: "care.behavior.north@lauris.demo", fullName: "Behavior Therapist North", clinicSlug: "north", memberRole: "therapist"    },
  { email: "care.speech.south@lauris.demo",   fullName: "Speech Therapist South",   clinicSlug: "south", memberRole: "therapist"    },
  { email: "care.ot.south@lauris.demo",       fullName: "OT Therapist South",       clinicSlug: "south", memberRole: "therapist"    },
];

// Existing platform owner — verified only, never recreated
const PLATFORM_OWNER_EMAIL = "jtrinidad7@gmail.com";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scan up to 1 000 auth users (sufficient for demo environment). */
async function findAuthUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).find((u) => u.email === email) ?? null;
}

/**
 * Create or reuse an auth user.
 * - If the user exists: resets password to DEMO_PASSWORD, updates full_name metadata.
 * - If new: creates with email_confirm=true so login works immediately.
 * Returns the auth user UUID.
 */
async function ensureAuthUser(email, fullName) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      user_metadata: { full_name: fullName },
    });
    console.log(`  ↩  auth user exists: ${email}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message}`);
  console.log(`  ✓  created auth user: ${email}`);
  return data.user.id;
}

/**
 * Upsert into profiles.
 *
 * Care users (school_id=null) are not school-side users. Their profiles.role
 * is set to 'teacher' — the only harmless value in the user_role enum when
 * school_id is null. All clinic access flows through organization_memberships,
 * not profiles.role. The handle_new_user trigger may have already created the
 * row with role='teacher'; this upsert fills in full_name and email.
 */
async function ensureProfile(uid, email, fullName, schoolId = null, role = "teacher") {
  const { error } = await admin.from("profiles").upsert(
    { id: uid, email, full_name: fullName, school_id: schoolId, role },
    { onConflict: "id" },
  );
  if (error) throw new Error(`upsert profiles(${email}): ${error.message}`);
}

/**
 * Create or reuse a clinic/medical_practice organization by name.
 *
 * There is no unique constraint on (kind, name) for clinic orgs, so we do
 * a SELECT before INSERT to avoid duplicates on idempotent reruns.
 * If multiple rows with the same name somehow exist, the first one wins.
 */
async function ensureClinicOrg(name, kind) {
  const { data } = await admin
    .from("organizations")
    .select("id, name")
    .eq("kind", kind)
    .eq("name", name)
    .maybeSingle();

  if (data) {
    console.log(`  ↩  org exists: "${name}"`);
    return data.id;
  }

  const { data: created, error } = await admin
    .from("organizations")
    .insert({ kind, name, country_code: "PH", created_in_app: "lauris_care" })
    .select("id")
    .single();
  if (error || !created) throw new Error(`insert org "${name}": ${error?.message}`);
  console.log(`  ✓  created org: "${name}" (${created.id})`);
  return created.id;
}

/**
 * Ensure exactly one active membership for (orgId, profileId).
 *
 * - If active membership exists with correct role: no-op.
 * - If active membership exists with different role: updates role.
 * - If no active membership: inserts one.
 *
 * organization_memberships INSERT/UPDATE require super_admin under RLS.
 * This script uses the service-role client which bypasses RLS entirely.
 */
async function ensureMembership(orgId, profileId, role, email) {
  const { data: existing } = await admin
    .from("organization_memberships")
    .select("id, role")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    if (existing.role !== role) {
      const { error } = await admin
        .from("organization_memberships")
        .update({ role })
        .eq("id", existing.id);
      if (error) throw new Error(`update membership role for ${email}: ${error.message}`);
      console.log(`  ↩  membership role updated → ${role} (${email})`);
    } else {
      console.log(`  ↩  membership exists: ${role} (${email})`);
    }
    return;
  }

  const { error } = await admin.from("organization_memberships").insert({
    organization_id: orgId,
    profile_id: profileId,
    role,
    status: "active",
    started_at: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`insert membership(${email}, role=${role}): ${error.message}`);
  console.log(`  ✓  membership: ${role} (${email})`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Lauris Care — Demo Login Seed");
  console.log("══════════════════════════════════════════\n");

  // ── 1. Clinic organizations ───────────────────────────────────────────────
  console.log("── Organizations ──────────────────────────");
  const orgIds = {};
  for (const clinic of CLINICS) {
    orgIds[clinic.slug] = await ensureClinicOrg(clinic.name, clinic.kind);
  }

  // ── 2. Platform owner ─────────────────────────────────────────────────────
  console.log("\n── Platform Owner ─────────────────────────");
  const ownerUser = await findAuthUserByEmail(PLATFORM_OWNER_EMAIL);
  if (!ownerUser) {
    console.log(`  ⚠  ${PLATFORM_OWNER_EMAIL} not found in auth.users`);
    console.log(`     They must sign up at /login first, then run this script again.`);
  } else {
    // Ensure super_admin role — only update if not already set
    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", ownerUser.id)
      .maybeSingle();

    if (!ownerProfile) {
      // Profile not yet created (user signed up but trigger may not have fired)
      console.log(`  ⚠  profile row missing for ${PLATFORM_OWNER_EMAIL} — sign in once to trigger creation`);
    } else if (ownerProfile.role !== "super_admin") {
      const { error } = await admin
        .from("profiles")
        .update({ role: "super_admin" })
        .eq("id", ownerUser.id);
      if (error) {
        console.log(`  ⚠  could not set super_admin: ${error.message}`);
      } else {
        console.log(`  ✓  ${PLATFORM_OWNER_EMAIL} → role=super_admin`);
      }
    } else {
      console.log(`  ↩  ${PLATFORM_OWNER_EMAIL} already has role=super_admin`);
    }
  }

  // ── 3. Demo care users ────────────────────────────────────────────────────
  console.log("\n── Care Users ─────────────────────────────");
  const results = [];
  for (const u of DEMO_USERS) {
    console.log(`\n  ${u.email} [${u.memberRole}]`);
    const uid = await ensureAuthUser(u.email, u.fullName);
    // profiles.role for Care users: 'teacher' (default in user_role enum).
    // school_id=null means none of the school-side RLS paths grant any access.
    // All Care portal access is gated by organization_memberships.
    await ensureProfile(uid, u.email, u.fullName, null, "teacher");
    await ensureMembership(orgIds[u.clinicSlug], uid, u.memberRole, u.email);
    results.push({ ...u, uid, orgId: orgIds[u.clinicSlug] });
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  Done.\n");

  console.log("Clinic Organizations:");
  for (const clinic of CLINICS) {
    console.log(`  ${clinic.name}`);
    console.log(`  id: ${orgIds[clinic.slug]}`);
  }

  console.log(`\nDemo Logins (password: ${DEMO_PASSWORD}):\n`);
  console.log(
    "  Email                                     Role            Clinic",
  );
  console.log(
    "  ─────────────────────────────────────────────────────────────────────────────",
  );
  for (const u of DEMO_USERS) {
    const clinicName = CLINICS.find((c) => c.slug === u.clinicSlug)?.name ?? u.clinicSlug;
    console.log(
      `  ${u.email.padEnd(42)}${u.memberRole.padEnd(16)}${clinicName}`,
    );
  }
  console.log(
    `  ${PLATFORM_OWNER_EMAIL.padEnd(42)}super_admin      (existing — no password change)`,
  );

  console.log("\nSchema notes:");
  console.log("  • Care users have profiles.role='teacher' and school_id=NULL");
  console.log("    (user_role enum has no care-specific value; 'teacher' is harmless)");
  console.log("  • Clinic access is gated by organization_memberships, not profiles.role");
  console.log("  • Login at /care — not /login → /dashboard\n");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message ?? err);
  process.exit(1);
});
