/**
 * scripts/demo/cleanup.mjs — Safe, dry-run-first teardown of SUPERSEDED demos
 *
 * Removes the demos replaced by the current Care-workload demo (seed.mjs):
 *
 *   • Legacy "Maple Grove" Learn+Care demo  — fixed UUID prefix de300000-…
 *       logins: admin1@myschool.test, teacher1@myschool.test, parent1@personal.test,
 *               admin1@mytherapyclinic.test, therapist1@mytherapyclinic.test, parent2@personal.test
 *   • "Riverside" Learn+Care demo            — fixed UUID prefix de400000-…
 *       Learn logins: admin1/admin2/teacher1/teacher2@laurislearn.test
 *       (its @lauriscare.test staff and @laurisparent.test parents are REUSED by the
 *        current demo and are therefore PRESERVED — only the de400000 orgs/data go)
 *   • Secondary @lauris.demo Care demo       — "Lauris Care Demo Clinic …" orgs (safety net)
 *
 * ── HARD GUARANTEES (guards ABORT the run if violated) ──
 *   • PRESERVE Sunshine Learning Center (the live pilot + the only Learn demo school).
 *   • PRESERVE jtrinidad7@gmail.com, joms.trinidad@gmail.com, parent@lauriscare.test,
 *     everything @sunshine.test / @bridgepoint.test.
 *   • PRESERVE the current demo: the de500000-… orgs, all @lauriscare.test staff, and
 *     all @laurisparent.test parents. Cleanup deletes by deterministic de300000-/
 *     de400000- IDs + the legacy login domains ONLY — never the reused clinic name
 *     "Maple Grove Therapy Center" and never @lauriscare.test / @laurisparent.test.
 *   • Never deletes a user whose school_id is anything other than the two legacy demo
 *     schools (de300000-/de400000-…0001) — every real Learn member is protected.
 *
 * DRY-RUN BY DEFAULT.  Pass --apply to actually delete (irreversible).
 *
 * Usage:
 *   node scripts/demo/cleanup.mjs            # dry run — review the plan
 *   node scripts/demo/cleanup.mjs --apply    # execute the deletion
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("✗ Missing URL or service role key in .env.local"); process.exit(1); }
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const APPLY = process.argv.includes("--apply");

// ─── Things that must NEVER be touched ───────────────────────────────────────────
const SUNSHINE_SCHOOL_ID = "0d229fda-c6bf-4741-9076-e4cf500f0d5f";
const FORBIDDEN_IN_PLAN = ["de500000", SUNSHINE_SCHOOL_ID, "b0752f12", "0d229fda", "7ef412e8"]; // de500000 demo + Sunshine + Bridgepoint

// ─── Legacy namespaces (deterministic fixed UUIDs) ───────────────────────────────
const MG = { // Maple Grove (de300000)
  ns: "de300000", schoolName: "Maple Grove Learning Center", clinicName: "Maple Grove Therapy Center",
  school: "de300000-0000-0000-0000-000000000001", schoolOrg: "de300000-0000-0000-0000-0000000000a1",
  clinicOrg: "de300000-0000-0000-0000-0000000000b1", schoolYear: "de300000-0000-0000-0000-0000000000c1",
  acadPeriod: "de300000-0000-0000-0000-0000000000c2", classLevel: "de300000-0000-0000-0000-0000000000d1",
  classes: ["de300000-0000-0000-0000-0000000000d2"],
  children: ["de300000-0000-0000-0000-0000000000e1"],
  students: ["de300000-0000-0000-0000-0000000000e2"],
};
const RV = { // Riverside (de400000)
  ns: "de400000", schoolName: "Riverside Learning Center", clinicName: "Riverside Therapy & Wellness Center",
  school: "de400000-0000-0000-0000-000000000001", schoolOrg: "de400000-0000-0000-0000-0000000000a1",
  clinicOrg: "de400000-0000-0000-0000-0000000000b1", schoolYear: "de400000-0000-0000-0000-0000000000c1",
  acadPeriod: "de400000-0000-0000-0000-0000000000c2", classLevel: "de400000-0000-0000-0000-0000000000d1",
  classes: ["de400000-0000-0000-0000-0000000000d2", "de400000-0000-0000-0000-0000000000d3"],
  children: ["de400000-0000-0000-0000-0000000000e1", "de400000-0000-0000-0000-0000000000e4", "de400000-0000-0000-0000-0000000000e7"],
  students: ["de400000-0000-0000-0000-0000000000e2", "de400000-0000-0000-0000-0000000000e5"],
};

const CARE_TABLES = [
  "care_session_goal_links", "care_session_events", "care_session_notes", "care_voice_notes",
  "care_session_interruptions", "care_milestones", "care_home_activities", "care_continuity_holds",
  "care_parent_observations", "care_support_context", "care_note_suggestions", "care_goals",
];
function buildSteps(ns) {
  const orgs = [ns.schoolOrg, ns.clinicOrg];
  return [
    ...CARE_TABLES.map((t) => [t, "clinic_organization_id", ns.clinicOrg]),
    ["clinic_documents", "origin_organization_id", ns.clinicOrg],
    ["therapy_sessions", "clinic_organization_id", ns.clinicOrg],
    ["care_family_members", "clinic_organization_id", ns.clinicOrg],
    ["care_audit_events", "clinic_organization_id", ns.clinicOrg],
    ["care_clinic_holidays", "clinic_organization_id", ns.clinicOrg],
    ["care_clinic_settings", "clinic_organization_id", ns.clinicOrg],
    ["care_therapist_profiles", "clinic_organization_id", ns.clinicOrg],
    ["document_organization_access_grants", "source_school_id", ns.school],
    ["child_profile_access_grants", "target_organization_id", orgs],
    ["child_document_versions", "school_id", ns.school],
    ["child_documents", "school_id", ns.school],
    ["child_profile_memberships", "organization_id", orgs],
    ["child_identifiers", "child_profile_id", ns.children],
    ["enrollments", "school_year_id", ns.schoolYear],
    ["student_class_assignments", "school_year_id", ns.schoolYear],
    ["guardians", "student_id", ns.students],
    ["students", "id", ns.students],
    ["child_profiles", "origin_organization_id", ns.clinicOrg], // clinic-owned children
    ["child_profiles", "id", ns.children],
    ["classes", "id", ns.classes],
    ["class_levels", "id", ns.classLevel],
    ["academic_periods", "id", ns.acadPeriod],
    ["school_years", "id", ns.schoolYear],
    ["organization_memberships", "organization_id", orgs],
    ["organizations", "id", orgs],
    ["schools", "id", ns.school],
  ];
}

// ─── Legacy login allowlist ──────────────────────────────────────────────────────
const LEGACY_EMAIL_DOMAINS = ["@myschool.test", "@mytherapyclinic.test", "@personal.test", "@laurislearn.test", "@lauris.demo"];
const LEGACY_EMAIL_EXACT   = ["parent@lauriscare.demo"];
const PROTECT_EMAIL_EXACT  = ["jtrinidad@gmail.com", "jtrinidad7@gmail.com", "joms.trinidad@gmail.com", "parent@lauriscare.test"];
const PROTECT_EMAIL_SUFFIX = ["@sunshine.test", "@bridgepoint.test", "@lauriscare.test", "@laurisparent.test"];
const ALLOWED_SCHOOL_IDS_FOR_DELETE = [MG.school, RV.school];
const DEMO_CLINIC_NAME_PREFIX = "Lauris Care Demo Clinic"; // @lauris.demo safety net

const arr = (v) => (Array.isArray(v) ? v : [v]);
const isProtectedEmail = (e) => {
  const x = (e || "").toLowerCase();
  return PROTECT_EMAIL_EXACT.includes(x) || PROTECT_EMAIL_SUFFIX.some((s) => x.endsWith(s));
};
async function count(table, col, v) {
  const vals = arr(v); if (!vals.length) return 0;
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true }).in(col, vals);
  if (error) { console.log(`    ⚠  count ${table}.${col}: ${error.message}`); return 0; }
  return n ?? 0;
}
async function del(table, col, v) {
  const vals = arr(v); if (!vals.length) return;
  const { error } = await db.from(table).delete().in(col, vals);
  if (error) throw new Error(`delete ${table}.${col}: ${error.message}`);
}

// Verify a legacy namespace looks exactly as expected before allowing its teardown.
async function verifyNamespace(ns) {
  const { data: school } = await db.from("schools").select("id,name").eq("id", ns.school).maybeSingle();
  if (school && school.name !== ns.schoolName)
    throw new Error(`GUARD: school ${ns.school} is "${school.name}", expected "${ns.schoolName}" — aborting.`);
  const { data: orgRows } = await db.from("organizations").select("id,kind,name,school_id").in("id", [ns.schoolOrg, ns.clinicOrg]);
  for (const o of orgRows ?? []) {
    if (o.id === ns.schoolOrg && (o.kind !== "school" || o.school_id !== ns.school))
      throw new Error(`GUARD: ${ns.schoolOrg} is not the expected school shadow org — aborting.`);
    if (o.id === ns.clinicOrg && (o.kind !== "clinic" || o.school_id))
      throw new Error(`GUARD: ${ns.clinicOrg} is not a school-less clinic — aborting.`);
  }
  return { present: !!(school || (orgRows ?? []).length), school, orgs: orgRows ?? [] };
}

async function main() {
  console.log("\n══════════════════════════════════════════════");
  console.log(`  Demo cleanup — ${APPLY ? "APPLY (DESTRUCTIVE)" : "DRY RUN (no changes)"}`);
  console.log("══════════════════════════════════════════════");

  const namespaces = [MG, RV];
  const steps = [];
  for (const ns of namespaces) {
    const info = await verifyNamespace(ns);
    console.log(`\nLegacy ${ns.ns} (${ns.schoolName} / ${ns.clinicName}): ${info.present ? "PRESENT" : "absent (already removed)"}`);
    steps.push(...buildSteps(ns));
  }

  // GUARD: no step may target a protected id (de500000 demo / Sunshine / Bridgepoint).
  for (const [t, c, v] of steps) {
    for (const val of arr(v)) {
      if (FORBIDDEN_IN_PLAN.some((p) => String(val).includes(p)))
        throw new Error(`GUARD: step ${t}.${c} targets protected id ${val} — aborting.`);
    }
  }

  // Secondary @lauris.demo clinic orgs (safety net)
  const { data: demoClinics } = await db.from("organizations").select("id,kind,name,school_id")
    .eq("kind", "clinic").like("name", `${DEMO_CLINIC_NAME_PREFIX}%`);
  for (const o of demoClinics ?? []) {
    if (o.kind !== "clinic" || !o.name.startsWith(DEMO_CLINIC_NAME_PREFIX) || o.school_id)
      throw new Error(`GUARD: demo clinic ${o.id} ("${o.name}") out of allowlist — aborting.`);
  }
  const demoClinicIds = (demoClinics ?? []).map((o) => o.id);
  if (demoClinicIds.length) {
    console.log(`\nSecondary @lauris.demo clinic orgs (${demoClinicIds.length}):`);
    for (const o of demoClinics) console.log(`  • ${o.name}  ${o.id}`);
  }

  // ── Resolve candidate users ──────────────────────────────────────────────────
  const authUsers = [];
  for (let page = 1; ; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    authUsers.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < 1000) break;
  }
  const { data: profiles } = await db.from("profiles").select("id, email, school_id");
  const schoolById = new Map((profiles ?? []).map((p) => [p.id, p.school_id]));
  const candidates = authUsers.filter((u) => {
    const e = (u.email || "").toLowerCase();
    const matches = LEGACY_EMAIL_EXACT.includes(e) || LEGACY_EMAIL_DOMAINS.some((d) => e.endsWith(d));
    if (!matches) return false;
    if (isProtectedEmail(e)) return false;
    const sid = schoolById.get(u.id);
    if (sid && !ALLOWED_SCHOOL_IDS_FOR_DELETE.includes(sid)) {
      console.log(`  ⏭  skip ${e} — school_id ${String(sid).slice(0, 8)}… is not a legacy demo school`);
      return false;
    }
    return true;
  });
  const userIds = candidates.map((u) => u.id);
  const leaked = candidates.find((u) => isProtectedEmail(u.email));
  if (leaked) throw new Error(`GUARD: protected email ${leaked.email} in delete set — aborting.`);

  console.log(`\nLegacy demo users in scope (${candidates.length}):`);
  for (const u of candidates.sort((a, b) => (a.email || "").localeCompare(b.email || ""))) console.log(`  • ${u.email}`);

  // ── Plan / counts ───────────────────────────────────────────────────────────
  console.log("\nRows that will be deleted:");
  let total = 0;
  for (const [t, c, v] of steps) { const n = await count(t, c, v); if (n) console.log(`  ${String(n).padStart(5)}  ${t} (${c})`); total += n; }
  if (demoClinicIds.length) {
    for (const t of CARE_TABLES.concat(["therapy_sessions", "care_family_members"])) {
      const n = await count(t, "clinic_organization_id", demoClinicIds); if (n) console.log(`  ${String(n).padStart(5)}  ${t} [@lauris.demo]`); total += n;
    }
  }
  console.log(`  ${String(candidates.length).padStart(5)}  profiles + auth.users`);
  console.log(`  ───── total table rows (excl. auth): ${total}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing was deleted. Re-run with --apply to execute.\n"); return; }

  // ── Execute (FK order) ────────────────────────────────────────────────────────
  console.log("\nDeleting…");
  // Neutralize active documents first: child_documents.current_version_id is
  // ON DELETE SET NULL, and a non-draft doc must keep a current version
  // (child_documents_current_version_required_chk). Drafting them lets the
  // subsequent child_document_versions deletes proceed without tripping the CHECK.
  await db.from("child_documents").update({ current_version_id: null, status: "draft" }).in("school_id", [MG.school, RV.school]);
  for (const [t, c, v] of steps) { await del(t, c, v); }
  if (demoClinicIds.length) {
    for (const t of CARE_TABLES.concat(["clinic_documents", "therapy_sessions", "care_family_members",
      "care_audit_events", "care_clinic_holidays", "care_clinic_settings", "care_therapist_profiles"])) {
      await del(t, t === "clinic_documents" ? "origin_organization_id" : "clinic_organization_id", demoClinicIds);
    }
    await del("child_profile_access_grants", "target_organization_id", demoClinicIds);
    await del("document_organization_access_grants", "target_organization_id", demoClinicIds);
    await del("child_profile_memberships", "organization_id", demoClinicIds);
    await del("child_profiles", "origin_organization_id", demoClinicIds);
    await del("organization_memberships", "organization_id", demoClinicIds);
    await del("organizations", "id", demoClinicIds);
  }
  await del("profiles", "id", userIds);
  for (const u of candidates) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) console.log(`  ⚠  auth delete ${u.email}: ${error.message}`);
  }
  console.log(`\n✓ Cleanup complete. Removed legacy Maple Grove + Riverside demos` +
    (demoClinicIds.length ? ` + ${demoClinicIds.length} @lauris.demo clinic org(s)` : "") +
    ` + ${candidates.length} legacy user(s).\n`);
}
main().catch((e) => { console.error("\n✗ Cleanup failed:", e.message ?? e); process.exit(1); });
