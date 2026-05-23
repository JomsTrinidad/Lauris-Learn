/**
 * scripts/demo/audit.mjs — READ-ONLY Supabase demo/test audit
 *
 * Produces a ground-truth inventory of auth users, profiles, schools,
 * organizations, memberships, children, students, and cross-app grants
 * across the SHARED Lauris Learn + Lauris Care Supabase project.
 *
 * STRICTLY READ-ONLY. Performs no INSERT/UPDATE/DELETE of any kind.
 * Safe to run any number of times.
 *
 * Usage:
 *   node scripts/demo/audit.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PRESERVE_SUPER_ADMIN = "jtrinidad7@gmail.com";

function classifyDomain(email) {
  if (!email) return "（no email）";
  const e = email.toLowerCase();
  if (e === PRESERVE_SUPER_ADMIN) return "SUPER ADMIN (preserve)";
  // Current demo (created by seed.mjs)
  if (e.endsWith("@laurisparent.test")) return "@laurisparent.test (Parent demo — current)";
  if (e.endsWith("@laurismed.test")) return "@laurismed.test (Med — RESERVED, should be empty)";
  if (e === "parent@lauriscare.test") return "@lauriscare.test (preserve — Sunshine cross-app parent)";
  if (e.endsWith("@lauriscare.test")) return "@lauriscare.test (Care demo — current)";
  // Preserved real schools
  if (e.endsWith("@sunshine.test")) return "@sunshine.test (Sunshine pilot — Learn anchor, preserve)";
  if (e.endsWith("@bridgepoint.test")) return "@bridgepoint.test (Bridgepoint — preserve)";
  // Legacy / superseded patterns (cleanup.mjs targets these)
  if (e.endsWith("@laurislearn.test")) return "LEGACY Riverside demo (superseded — cleanup.mjs)";
  if (e.endsWith("@myschool.test") || e.endsWith("@mytherapyclinic.test") || e.endsWith("@personal.test"))
    return "LEGACY Maple Grove demo (superseded — cleanup.mjs)";
  if (e.endsWith("@lauris.demo")) return "@lauris.demo (legacy Care demo — cleanup.mjs)";
  if (e.endsWith(".test")) return "*.test (other test)";
  if (e.endsWith(".demo")) return "*.demo (other demo)";
  if (e.endsWith("@gmail.com")) return "@gmail.com (real?)";
  return "other / real-looking";
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) break;
    page += 1;
  }
  return users;
}

async function safeSelect(table, columns = "*") {
  const { data, error } = await db.from(table).select(columns);
  if (error) return { rows: null, error: error.message };
  return { rows: data ?? [], error: null };
}

function hr(label) {
  console.log("\n" + "═".repeat(78));
  console.log("  " + label);
  console.log("═".repeat(78));
}

async function main() {
  console.log("\nLauris Learn + Lauris Care — SHARED Supabase audit (READ-ONLY)");
  console.log("Project:", SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0]);
  console.log("Generated:", new Date().toISOString());

  // ── auth.users ────────────────────────────────────────────────────────────
  const authUsers = await listAllAuthUsers();
  const profilesRes = await safeSelect("profiles", "id, email, role, school_id, full_name");
  const profilesById = new Map((profilesRes.rows ?? []).map((p) => [p.id, p]));

  hr(`AUTH USERS  (total: ${authUsers.length})`);
  const byDomain = new Map();
  for (const u of authUsers) {
    const k = classifyDomain(u.email);
    if (!byDomain.has(k)) byDomain.set(k, []);
    byDomain.get(k).push(u);
  }
  for (const [domain, list] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${domain}  — ${list.length} user(s)`);
    for (const u of list.sort((a, b) => (a.email || "").localeCompare(b.email || ""))) {
      const p = profilesById.get(u.id);
      const role = p?.role ?? "(no profile)";
      const sid = p?.school_id ? `school=${p.school_id.slice(0, 8)}…` : "school=∅";
      const last = u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : "never";
      console.log(`    ${(u.email || "(none)").padEnd(40)} role=${String(role).padEnd(12)} ${sid.padEnd(18)} lastSignIn=${last}`);
    }
  }

  // ── schools ──────────────────────────────────────────────────────────────
  hr("SCHOOLS");
  const schools = await safeSelect("schools", "id, name, created_at");
  if (schools.error) console.log("  ✗", schools.error);
  else if (schools.rows.length === 0) console.log("  (none)");
  else {
    for (const s of schools.rows.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))) {
      console.log(`  ${s.id}  ${(s.name || "").padEnd(45)} created=${(s.created_at || "").slice(0, 10)}`);
    }
  }

  // ── organizations ──────────────────────────────────────────────────────────
  hr("ORGANIZATIONS");
  const orgs = await safeSelect("organizations", "id, kind, name, school_id, created_in_app, created_at");
  const memRes = await safeSelect("organization_memberships", "id, organization_id, profile_id, role, status");
  const memByOrg = new Map();
  for (const m of memRes.rows ?? []) {
    if (!memByOrg.has(m.organization_id)) memByOrg.set(m.organization_id, []);
    memByOrg.get(m.organization_id).push(m);
  }
  if (orgs.error) console.log("  ✗", orgs.error);
  else {
    for (const kind of ["school", "clinic", "medical_practice"]) {
      const list = (orgs.rows ?? []).filter((o) => o.kind === kind);
      console.log(`\n  kind = ${kind}  (${list.length})`);
      for (const o of list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))) {
        const mem = memByOrg.get(o.id) ?? [];
        const active = mem.filter((m) => m.status === "active");
        const link = o.school_id ? `→school ${o.school_id.slice(0, 8)}…` : "";
        console.log(
          `    ${o.id}  ${(o.name || "").padEnd(38)} app=${(o.created_in_app || "?").padEnd(12)} members=${active.length}/${mem.length} ${link}`,
        );
      }
      const otherKinds = (orgs.rows ?? []).filter(
        (o) => !["school", "clinic", "medical_practice"].includes(o.kind),
      );
      if (kind === "medical_practice" && otherKinds.length) {
        console.log(`\n  kind = (other)  (${otherKinds.length})`);
        for (const o of otherKinds) console.log(`    ${o.id}  kind=${o.kind}  ${o.name}`);
      }
    }
  }

  // ── children / students / cross-app links ──────────────────────────────────
  hr("CHILD PROFILES / STUDENTS / CROSS-APP LINKS");
  const cps = await safeSelect("child_profiles", "id, display_name, origin_organization_id, created_in_app");
  const students = await safeSelect("students", "id, school_id, child_profile_id, first_name, last_name, student_code");
  const cpm = await safeSelect("child_profile_memberships", "id, child_profile_id, organization_id, relationship_kind, status");

  if (!cps.error) {
    const owned = cps.rows.filter((c) => c.origin_organization_id);
    const schoolOrigin = cps.rows.filter((c) => !c.origin_organization_id);
    console.log(`  child_profiles total: ${cps.rows.length}  (clinic-origin: ${owned.length}, school-origin/legacy: ${schoolOrigin.length})`);
    const byOrigin = new Map();
    for (const c of owned) byOrigin.set(c.origin_organization_id, (byOrigin.get(c.origin_organization_id) || 0) + 1);
    for (const [oid, n] of byOrigin) {
      const o = (orgs.rows ?? []).find((x) => x.id === oid);
      console.log(`    clinic-origin in ${oid.slice(0, 8)}… (${o?.name ?? "?"}): ${n}`);
    }
  } else console.log("  child_profiles ✗", cps.error);

  if (!students.error) {
    const linked = students.rows.filter((s) => s.child_profile_id).length;
    console.log(`  students total: ${students.rows.length}  (linked to child_profile: ${linked})`);
    const bySchool = new Map();
    for (const s of students.rows) bySchool.set(s.school_id, (bySchool.get(s.school_id) || 0) + 1);
    for (const [sid, n] of bySchool) {
      const sc = (schools.rows ?? []).find((x) => x.id === sid);
      console.log(`    school ${String(sid).slice(0, 8)}… (${sc?.name ?? "?"}): ${n} student(s)`);
    }
  } else console.log("  students ✗", students.error);

  if (!cpm.error) {
    const byKind = new Map();
    for (const m of cpm.rows) byKind.set(m.relationship_kind, (byKind.get(m.relationship_kind) || 0) + 1);
    console.log(`  child_profile_memberships total: ${cpm.rows.length}  ` + [...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(", "));
  }

  // ── cross-app grants ────────────────────────────────────────────────────────
  hr("CROSS-APP GRANTS & CARE FAMILY LINKS");
  for (const t of [
    ["child_profile_access_grants", "id, child_profile_id, source_organization_id, target_organization_id, scope, status, valid_until"],
    ["document_organization_access_grants", "id, document_id, source_school_id, target_organization_id, status, valid_until"],
    ["care_family_members", "id, profile_id, child_profile_id, clinic_organization_id, relationship"],
  ]) {
    const r = await safeSelect(t[0], t[1]);
    if (r.error) console.log(`  ${t[0]}: ✗ ${r.error}`);
    else {
      const active = r.rows.filter((x) => x.status === "active").length;
      console.log(`  ${t[0]}: ${r.rows.length} row(s)` + (r.rows[0]?.status !== undefined ? ` (active: ${active})` : ""));
    }
  }

  // ── orphans ────────────────────────────────────────────────────────────────
  hr("INTEGRITY CHECKS");
  const profileIds = new Set((profilesRes.rows ?? []).map((p) => p.id));
  const authIds = new Set(authUsers.map((u) => u.id));
  const authNoProfile = authUsers.filter((u) => !profileIds.has(u.id));
  const profileNoAuth = (profilesRes.rows ?? []).filter((p) => !authIds.has(p.id));
  console.log(`  auth.users without a profiles row: ${authNoProfile.length}`);
  for (const u of authNoProfile) console.log(`    ${u.email} (${u.id})`);
  console.log(`  profiles without an auth.users row: ${profileNoAuth.length}`);
  for (const p of profileNoAuth) console.log(`    ${p.email} (${p.id})`);

  console.log("\nDone (read-only).\n");
}

main().catch((e) => {
  console.error("\n✗ Audit failed:", e.message ?? e);
  process.exit(1);
});
