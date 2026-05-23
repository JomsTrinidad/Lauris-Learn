/**
 * scripts/demo/verify.mjs — Validate the demo via REAL RLS (anon key + sign-in).
 *
 * Signs in as each demo user with the public anon key (NOT the service role) and
 * confirms: clinic workload visibility, the Sunshine↔Care cross-app links, the
 * clinic-transfer second-clinic visibility, and that RLS still isolates school
 * tables + cross-clinic data. Read-only.
 *
 * Usage: node scripts/demo/verify.mjs
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
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = "LaurisDemo2026!";
const PRIMARY_CLINIC = "de500000-0000-0000-0000-0000000000b1";
const SECOND_CLINIC  = "de500000-0000-0000-0000-0000000000b2";
const OWNED_CHILD_1  = "de500000-0000-0000-0000-100000000001"; // a primary-clinic-owned child
const TRANSFER_CHILD = "de500000-0000-0000-0000-a00000000002"; // the Sunshine-shared transfer child

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
}
async function asUser(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

async function main() {
  console.log("\nDemo RLS verification (real sign-in, anon key)\n");

  // ── Primary clinic admin — workload + cross-app reads ──────────────────────
  console.log("admin1@lauriscare.test (primary clinic_admin):");
  const a1 = await asUser("admin1@lauriscare.test");
  const cps = await a1.from("child_profiles").select("id");
  check("sees the clinic workload (≥20 children)", !cps.error && (cps.data ?? []).length >= 20,
    cps.error ? cps.error.message : `${(cps.data ?? []).length} children visible`);
  const docs = await a1.rpc("list_documents_for_organization", { p_org_id: PRIMARY_CLINIC });
  check("sees shared Sunshine IEP(s) via list_documents_for_organization",
    !docs.error && (docs.data ?? []).some((d) => /IEP/i.test(d.title ?? "")),
    docs.error ? docs.error.message : `${(docs.data ?? []).length} doc(s)`);
  const sess = await a1.from("therapy_sessions").select("id").eq("clinic_organization_id", PRIMARY_CLINIC);
  check("sees clinic therapy_sessions", !sess.error && (sess.data ?? []).length >= 20,
    sess.error ? sess.error.message : `${(sess.data ?? []).length} sessions`);
  const stu = await a1.from("students").select("id");
  check("CANNOT see school students (RLS intact)", (stu.data ?? []).length === 0,
    `${(stu.data ?? []).length} row(s) visible`);

  // ── A therapist sees their sessions ────────────────────────────────────────
  console.log("\ntherapist1@lauriscare.test (Bea Navarro, Speech):");
  const t1 = await asUser("therapist1@lauriscare.test");
  const tsess = await t1.from("therapy_sessions").select("id,therapy_type").eq("clinic_organization_id", PRIMARY_CLINIC);
  check("sees clinic sessions", !tsess.error && (tsess.data ?? []).length > 0,
    tsess.error ? tsess.error.message : `${(tsess.data ?? []).length} sessions`);

  // ── Second clinic admin — transfer visibility + isolation ──────────────────
  console.log("\nadmin2@lauriscare.test (second clinic_admin — transfer target):");
  const a2 = await asUser("admin2@lauriscare.test");
  const transfer = await a2.from("child_profiles").select("id").eq("id", TRANSFER_CHILD);
  check("sees the transferred child (grant to second clinic)", !transfer.error && (transfer.data ?? []).length === 1,
    transfer.error ? transfer.error.message : "");
  const leak = await a2.from("child_profiles").select("id").eq("id", OWNED_CHILD_1);
  check("CANNOT see primary-clinic-owned children (cross-clinic isolation)", (leak.data ?? []).length === 0,
    `${(leak.data ?? []).length} row(s) visible`);
  const tSecond = await a2.from("therapy_sessions").select("id").eq("clinic_organization_id", SECOND_CLINIC);
  check("sees the upcoming second-clinic session", !tSecond.error && (tSecond.data ?? []).length >= 1,
    tSecond.error ? tSecond.error.message : `${(tSecond.data ?? []).length} sessions`);

  // ── Parents — unified Lauris Parent: Learn (guardian) AND Care (family) ─────
  for (const email of ["parent1@laurisparent.test", "parent2@laurisparent.test"]) {
    console.log(`\n${email} (parent — Learn + Care):`);
    const p = await asUser(email);
    const myStu = await p.from("students").select("id,first_name");
    check("sees own child on the school side (guardian-email RLS)", !myStu.error && (myStu.data ?? []).length >= 1,
      myStu.error ? myStu.error.message : `${(myStu.data ?? []).length} student(s)`);
    const note = await p.from("care_session_notes").select("id").eq("parent_visible", true);
    check("sees parent-visible therapy notes on the clinic side", !note.error && (note.data ?? []).length >= 1,
      note.error ? note.error.message : `${(note.data ?? []).length} note(s)`);
  }

  console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("\n✗ verify failed:", e.message ?? e); process.exit(1); });
