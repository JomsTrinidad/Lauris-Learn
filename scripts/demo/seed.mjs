/**
 * scripts/demo/seed.mjs — Care-workload + clinic-transfer + Learn↔Care demo seed
 *
 * Anchors the Learn side on the REAL Sunshine Learning Center pilot and builds a
 * rich Lauris Care demo around two clinics, under a dedicated UUID namespace
 * (prefix "de500000-…") so it is cleanly separable from everything else.
 *
 *   Learn school : Sunshine Learning Center (REAL — reused, never recreated).
 *                  A few existing Sunshine students are LINKED into Care
 *                  additively (set students.child_profile_id, add demo guardians
 *                  + a shared IEP). All such writes are reversible by --reset.
 *   Care clinics : "Maple Grove Therapy Center"   (primary, de500000-…b1)
 *                  "Northside Pediatric Therapy"   (second, de500000-…b2 — used
 *                                                    only for transfer simulation)
 *   Care staff   (@lauriscare.test, password LaurisDemo2026!):
 *                  admin1  Dr. Elena Santos   clinic_admin (primary)
 *                  admin2  Rafael Domingo     clinic_admin (second)
 *                  therapist1 Bea Navarro     Speech-Language Pathologist (speech)
 *                  therapist2 Joaquin Reyes   Occupational Therapist (occupational) — works at BOTH clinics
 *                  therapist3 Carla Mendoza   Occupational Therapist (occupational)
 *                  therapist4 Miguel Torres   ABA Therapist (behavioral)
 *   Parents      (@laurisparent.test): parent1 Paolo Cruz, parent2 Liza Cruz
 *   Lauris Med   (@laurismed.test): RESERVED naming only — NOT created.
 *
 *   Workload  : 5 clinic-OWNED children per therapist + 1 Sunshine-linked child
 *               per therapist (≈6 each) + 3 intake children with NO therapist.
 *   Transfer  : one Sunshine-linked OT child is shared to BOTH clinics — history
 *               at Maple Grove, upcoming session at Northside (Joaquin Reyes,
 *               who is a member of both) — simulating a clinic transfer.
 *
 * Server-side auth creation only (service role never leaves Node). Idempotent —
 * fixed/deterministic UUIDs + existence checks; auth users looked up by email.
 *
 * Usage:
 *   node scripts/demo/seed.mjs            # create / upsert the demo
 *   node scripts/demo/seed.mjs --reset    # remove THIS demo (de500000 + Sunshine
 *                                          # links) then re-create
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Never touches Bridgepoint, jtrinidad7@gmail.com, parent@lauriscare.test, or the
 * legacy Maple Grove (de300000) / Riverside (de400000) demos (see cleanup.mjs).
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
const RESET = process.argv.includes("--reset");

// ─── Anchors ────────────────────────────────────────────────────────────────────
const SUNSHINE_SCHOOL_ID = "0d229fda-c6bf-4741-9076-e4cf500f0d5f"; // REAL pilot school
const SUNSHINE_ORG_ID    = "b0752f12-c2cd-4d4c-afcd-f23c94f6d8aa"; // its shadow org (kind=school)
const SUNSHINE_ADMIN_EMAIL = "admin@sunshine.test";                 // grant/document author (real)
const DEMO_PASSWORD = "LaurisDemo2026!";

// ─── de500000 fixed org ids ──────────────────────────────────────────────────────
const PRIMARY_CLINIC = "de500000-0000-0000-0000-0000000000b1"; // Maple Grove Therapy Center
const SECOND_CLINIC  = "de500000-0000-0000-0000-0000000000b2"; // Northside Pediatric Therapy
const PRIMARY_CLINIC_NAME = "Maple Grove Therapy Center";
const SECOND_CLINIC_NAME  = "Northside Pediatric Therapy";

// ─── Deterministic UUID minting in the de500000 namespace ───────────────────────
// uid(segment) — segment is the final 12 hex chars.  mk(prefixChar, n) builds a
// stable id from a 1-char category + an 11-digit counter.
const uid = (seg12) => `de500000-0000-0000-0000-${seg12}`;
const mk = (prefix, n) => uid((prefix + String(n).padStart(11, "0")).slice(-12));

// ─── Staff ───────────────────────────────────────────────────────────────────────
const USERS = [
  { email: "admin1@lauriscare.test",     name: "Dr. Elena Santos", role: "clinic_admin", clinic: "primary" },
  { email: "admin2@lauriscare.test",     name: "Rafael Domingo",   role: "clinic_admin", clinic: "second"  },
  { email: "therapist1@lauriscare.test", name: "Bea Navarro",      role: "therapist",    clinic: "primary" },
  { email: "therapist2@lauriscare.test", name: "Joaquin Reyes",    role: "therapist",    clinic: "both"    },
  { email: "therapist3@lauriscare.test", name: "Carla Mendoza",    role: "therapist",    clinic: "primary" },
  { email: "therapist4@lauriscare.test", name: "Miguel Torres",    role: "therapist",    clinic: "primary" },
  { email: "parent1@laurisparent.test",  name: "Paolo Cruz",       role: "parent",       clinic: null      },
  { email: "parent2@laurisparent.test",  name: "Liza Cruz",        role: "parent",       clinic: null      },
];
const MED_RESERVED = ["admin1@laurismed.test", "admin2@laurismed.test", "doctor1@laurismed.test", "doctor2@laurismed.test"];

// 4 therapists, each owning 5 children + 1 Sunshine-linked child (≈6 caseload).
const THERAPISTS = [
  { email: "therapist1@lauriscare.test", name: "Bea Navarro",   spec: "Speech-Language Pathologist", ttype: "speech",       owned: 5 },
  { email: "therapist2@lauriscare.test", name: "Joaquin Reyes", spec: "Occupational Therapist",       ttype: "occupational", owned: 5 },
  { email: "therapist3@lauriscare.test", name: "Carla Mendoza", spec: "Occupational Therapist",       ttype: "occupational", owned: 5 },
  { email: "therapist4@lauriscare.test", name: "Miguel Torres", spec: "ABA Therapist",                ttype: "behavioral",   owned: 5 },
];
const SUNSHINE_LINK_COUNT = 4;            // one Sunshine-linked child per therapist
const FULL_FEATURED_SUNSHINE = [0, 2];    // these get a shared IEP + a portal parent
const TRANSFER_SUNSHINE_INDEX = 1;        // therapist2's Sunshine child = the transfer case
const INTAKE_COUNT = 3;                   // children onboarded but with NO therapist yet

// Names for the 20 owned + 3 intake clinic children (23 total).
const NAMES = [
  ["Liam", "Tan"], ["Sofia", "Reyes"], ["Noah", "Aquino"], ["Mia", "Pascual"], ["Lucas", "Domingo"],       // T1
  ["Emma", "Villanueva"], ["Gabriel", "Santos"], ["Olivia", "Ramos"], ["Ethan", "Bautista"], ["Chloe", "Mendoza"], // T2
  ["Aaron", "Flores"], ["Isabella", "Castillo"], ["Caleb", "Romero"], ["Maya", "Navarro"], ["Daniel", "Garcia"],   // T3
  ["Hannah", "Torres"], ["Joshua", "Lim"], ["Ava", "Soriano"], ["Nathan", "Ocampo"], ["Zoe", "Salazar"],          // T4
  ["Leo", "Mercado"], ["Ella", "Cabrera"], ["Marcus", "Dela Cruz"],                                                // intake
];

// ─── Therapy-type content (goals + parent-friendly notes) ───────────────────────
const GOALS_BY_TYPE = {
  speech:       ["Produce target sounds (/s/, /r/) in conversational speech", "Expand expressive vocabulary and sentence length"],
  occupational: ["Develop pincer grasp and pre-writing control", "Improve sensory regulation and self-feeding"],
  behavioral:   ["Increase functional communication requests", "Reduce transition-related distress; build on-task tolerance"],
};
const NOTE_BY_TYPE = {
  speech: {
    summary_text: "Articulation drills with minimal pairs and an oral-motor warm-up.",
    key_behaviors: "Sustained attention for most of the session; one redirection with a visual cue.",
    progress_notes: "Target-sound accuracy improving; expressive vocabulary expanding.",
    parent_note: "Great session today! Practice the sound list at home — about 10 words, twice a day with a mirror.",
  },
  occupational: {
    summary_text: "Fine-motor pegboard work and graded sensory-bin exploration.",
    key_behaviors: "Engaged for most of the session with two short movement breaks.",
    progress_notes: "Pincer grasp emerging; texture tolerance gradually improving.",
    parent_note: "At home, let your child pick up small finger foods before meals — keep it short and playful.",
  },
  behavioral: {
    summary_text: "Functional-communication training using visual supports and choice boards.",
    key_behaviors: "Used picture cards to request items; calmer during transitions.",
    progress_notes: "Requesting behavior increased; tantrum duration shorter than last visit.",
    parent_note: "Offer choices using two pictures at home — it gives your child a calm way to ask for what they want.",
  },
};
const GOAL_STATUS = ["on_track", "progressing", "active"];

// ─── tiny helpers ──────────────────────────────────────────────────────────────
function log(s) { console.log(s); }
async function findAuthUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    const u = (data?.users ?? []).find((x) => x.email === email);
    if (u) return u;
    if ((data?.users ?? []).length < 1000) return null;
    page += 1;
  }
}
async function ensureAuthUser(email, name) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name },
    });
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message}`);
  return data.user.id;
}
async function insIfAbsent(table, row, { critical = true, quiet = false } = {}) {
  if (row.id) {
    const { data } = await db.from(table).select("id").eq("id", row.id).maybeSingle();
    if (data) { if (!quiet) log(`  ↩  ${table} exists (${String(row.id).slice(0, 8)}…)`); return; }
  }
  const { error } = await db.from(table).insert(row);
  if (error) {
    if (critical) throw new Error(`insert ${table}: ${error.message}`);
    log(`  ⚠  ${table} insert skipped: ${error.message}`);
    return;
  }
  if (!quiet) log(`  ✓  ${table}`);
}
async function insIfAbsentBy(table, match, row, { critical = true, quiet = false } = {}) {
  let q = db.from(table).select("id");
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data } = await q.maybeSingle();
  if (data) { if (!quiet) log(`  ↩  ${table} exists`); return data.id; }
  const { data: created, error } = await db.from(table).insert(row).select("id").maybeSingle();
  if (error) {
    if (critical) throw new Error(`insert ${table}: ${error.message}`);
    log(`  ⚠  ${table} insert skipped: ${error.message}`);
    return null;
  }
  if (!quiet) log(`  ✓  ${table}`);
  return created?.id ?? null;
}

// Pick the deterministic set of Sunshine students used for cross-app linking:
// the first N existing students ordered by id (stable across runs).
async function resolveSunshineStudents(n) {
  const { data, error } = await db
    .from("students")
    .select("id, first_name, last_name, date_of_birth, gender, child_profile_id")
    .eq("school_id", SUNSHINE_SCHOOL_ID)
    .order("id", { ascending: true })
    .limit(n);
  if (error) throw new Error(`resolve Sunshine students: ${error.message}`);
  return data ?? [];
}

// All demo child_profile ids this seed mints (owned + intake + sunshine-linked).
function demoChildProfileIds() {
  const ownedTotal = THERAPISTS.reduce((a, t) => a + t.owned, 0) + INTAKE_COUNT; // 23
  const ids = [];
  for (let i = 1; i <= ownedTotal; i++) ids.push(mk("1", i));
  for (let i = 1; i <= SUNSHINE_LINK_COUNT; i++) ids.push(mk("a", i));
  return ids;
}
function sunshineCpIds() {
  const ids = [];
  for (let i = 1; i <= SUNSHINE_LINK_COUNT; i++) ids.push(mk("a", i));
  return ids;
}
function demoDocIds() {
  return FULL_FEATURED_SUNSHINE.map((i) => mk("8", i + 1));
}

// ─── reset (this demo only) ────────────────────────────────────────────────────
async function resetDemo() {
  log("\n── --reset: removing THIS demo (de500000 + Sunshine links) ──");
  const clinics = [PRIMARY_CLINIC, SECOND_CLINIC];
  const allCp = demoChildProfileIds();
  const ssCp = sunshineCpIds();
  const docIds = demoDocIds();
  const parentEmails = ["parent1@laurisparent.test", "parent2@laurisparent.test"];

  const careByOrg = [
    "care_session_goal_links", "care_session_events", "care_session_notes", "care_voice_notes",
    "care_session_interruptions", "care_milestones", "care_home_activities", "care_continuity_holds",
    "care_parent_observations", "care_support_context", "care_note_suggestions", "care_goals",
  ];
  for (const t of careByOrg) await db.from(t).delete().in("clinic_organization_id", clinics);
  await db.from("clinic_documents").delete().in("origin_organization_id", clinics);
  await db.from("therapy_sessions").delete().in("clinic_organization_id", clinics);
  await db.from("care_family_members").delete().in("clinic_organization_id", clinics);
  await db.from("care_audit_events").delete().in("clinic_organization_id", clinics);
  await db.from("care_clinic_holidays").delete().in("clinic_organization_id", clinics);
  await db.from("care_clinic_settings").delete().in("clinic_organization_id", clinics);
  await db.from("care_therapist_profiles").delete().in("clinic_organization_id", clinics);
  // cross-app grants targeting either demo clinic
  await db.from("child_profile_access_grants").delete().in("target_organization_id", clinics);
  await db.from("document_organization_access_grants").delete().in("target_organization_id", clinics);
  // demo-added Learn rows on REAL Sunshine students (reverse the links)
  if (docIds.length) {
    // draft + null current_version_id before deleting versions: current_version_id
    // is ON DELETE SET NULL and a non-draft doc must keep one (CHECK constraint).
    await db.from("child_documents").update({ current_version_id: null, status: "draft" }).in("id", docIds);
    await db.from("child_document_versions").delete().in("document_id", docIds);
    await db.from("child_documents").delete().in("id", docIds);
  }
  // demo-added guardians are removed by (student_id, parent email) below
  const linked = await resolveSunshineStudents(SUNSHINE_LINK_COUNT);
  const linkedStudentIds = linked.map((s) => s.id);
  if (linkedStudentIds.length) {
    await db.from("guardians").delete().in("student_id", linkedStudentIds).in("email", parentEmails);
    // restore each real student to its pre-demo state (only if it points at our demo cp)
    await db.from("students").update({ child_profile_id: null }).in("id", linkedStudentIds).in("child_profile_id", ssCp);
  }
  // demo child rows
  await db.from("child_profile_memberships").delete().in("child_profile_id", allCp);
  await db.from("child_identifiers").delete().in("child_profile_id", allCp);
  await db.from("child_profiles").delete().in("id", allCp);
  // orgs
  await db.from("organization_memberships").delete().in("organization_id", clinics);
  await db.from("organizations").delete().in("id", clinics);
  log("  ✓  demo cleared (Sunshine students restored to child_profile_id=NULL; auth users reused)");
}

// ─── session/goal/note generation for an assigned (has-therapist) child ─────────
let SESS_SEQ = 0, NOTE_SEQ = 0, GOAL_SEQ = 0;
async function seedTreatment({ cpId, clinicId, therapistUid, createdByUid, ttype, childIndex }) {
  // 1 goal
  const goalTitle = GOALS_BY_TYPE[ttype][childIndex % GOALS_BY_TYPE[ttype].length];
  await insIfAbsent("care_goals", {
    id: mk("5", ++GOAL_SEQ), clinic_organization_id: clinicId, child_profile_id: cpId,
    title: goalTitle, therapy_type: ttype, status: GOAL_STATUS[childIndex % GOAL_STATUS.length],
    progress_percent: 30 + (childIndex * 7) % 60, created_by_profile_id: therapistUid,
  }, { critical: false, quiet: true });

  // sessions: 3 historical + 1 upcoming.  ~1 in 6 children has a no_show in the middle.
  const histDates = ["2026-03", "2026-04", "2026-05"];
  const noShowMid = childIndex % 6 === 3;
  for (let k = 0; k < histDates.length; k++) {
    const day = String(8 + (childIndex % 18)).padStart(2, "0");
    const status = noShowMid && k === 1 ? "no_show" : "completed";
    const sid = mk("3", ++SESS_SEQ);
    await insIfAbsent("therapy_sessions", {
      id: sid, clinic_organization_id: clinicId, child_profile_id: cpId,
      therapist_profile_id: therapistUid, therapy_type: ttype,
      scheduled_at: `${histDates[k]}-${day}T01:00:00.000Z`, duration_minutes: 50,
      status, created_by_profile_id: createdByUid,
    }, { critical: false, quiet: true });
    // parent-visible note on the second completed session
    if (status === "completed" && k === 1) {
      const c = NOTE_BY_TYPE[ttype];
      await insIfAbsent("care_session_notes", {
        id: mk("4", ++NOTE_SEQ), session_id: sid, clinic_organization_id: clinicId, child_profile_id: cpId,
        therapist_profile_id: therapistUid, status: "completed",
        summary_text: c.summary_text, key_behaviors: c.key_behaviors,
        progress_notes: c.progress_notes, parent_note: c.parent_note,
        parent_visible: true, parent_visible_at: `${histDates[k]}-${day}T02:00:00.000Z`,
      }, { critical: false, quiet: true });
    }
  }
  // 1 upcoming session
  await insIfAbsent("therapy_sessions", {
    id: mk("3", ++SESS_SEQ), clinic_organization_id: clinicId, child_profile_id: cpId,
    therapist_profile_id: therapistUid, therapy_type: ttype,
    scheduled_at: `2026-06-${String(10 + (childIndex % 18)).padStart(2, "0")}T01:00:00.000Z`,
    duration_minutes: 50, status: "scheduled", created_by_profile_id: createdByUid,
  }, { critical: false, quiet: true });
}

// ─── main ───────────────────────────────────────────────────────────────────────
async function main() {
  log("\n══════════════════════════════════════════════════════");
  log("  Care-workload + transfer + Learn↔Care demo seed");
  log("══════════════════════════════════════════════════════");

  if (RESET) await resetDemo();

  // 0) Confirm Sunshine + its admin exist (we anchor the Learn side on them)
  const { data: ssSchool } = await db.from("schools").select("id, name").eq("id", SUNSHINE_SCHOOL_ID).maybeSingle();
  if (!ssSchool) throw new Error("Sunshine Learning Center not found — aborting (Learn anchor missing).");
  const { data: ssAdmin } = await db.from("profiles").select("id").eq("email", SUNSHINE_ADMIN_EMAIL).maybeSingle();
  const ssAdminUid = ssAdmin?.id ?? null;
  log(`\n  Learn anchor: ${ssSchool.name} (${SUNSHINE_SCHOOL_ID.slice(0, 8)}…), admin=${ssAdminUid ? "found" : "MISSING — grants/docs skipped"}`);

  // 1) Clinics
  log("\n── Clinics ──");
  await insIfAbsent("organizations", { id: PRIMARY_CLINIC, kind: "clinic", name: PRIMARY_CLINIC_NAME, country_code: "PH", created_in_app: "lauris_care" });
  await insIfAbsent("organizations", { id: SECOND_CLINIC,  kind: "clinic", name: SECOND_CLINIC_NAME,  country_code: "PH", created_in_app: "lauris_care" });

  // 2) Staff auth users + profiles
  log("\n── Care staff + parents (server-side auth only) ──");
  const uid = {};
  for (const u of USERS) {
    uid[u.email] = await ensureAuthUser(u.email, u.name);
    // user_role enum has no clinic value → clinic staff use the harmless 'teacher' default.
    const profileRole = u.role === "clinic_admin" || u.role === "therapist" ? "teacher" : u.role;
    const { error } = await db.from("profiles").upsert(
      { id: uid[u.email], email: u.email, full_name: u.name, role: profileRole, school_id: null },
      { onConflict: "id" });
    if (error) throw new Error(`profiles upsert ${u.email}: ${error.message}`);
    if (u.role === "parent") await db.from("organization_memberships").delete().eq("profile_id", uid[u.email]);
    log(`  ✓  ${u.email.padEnd(30)} ${u.role.padEnd(12)} ${u.name}`);
  }

  // 3) Clinic memberships
  log("\n── Clinic memberships ──");
  const today = new Date().toISOString().slice(0, 10);
  for (const u of USERS.filter((x) => x.clinic)) {
    const orgs = u.clinic === "primary" ? [PRIMARY_CLINIC]
      : u.clinic === "second" ? [SECOND_CLINIC]
      : [PRIMARY_CLINIC, SECOND_CLINIC]; // 'both'
    for (const org of orgs) {
      await insIfAbsentBy(
        "organization_memberships",
        { organization_id: org, profile_id: uid[u.email], status: "active" },
        { organization_id: org, profile_id: uid[u.email], role: u.role, status: "active", started_at: today },
        { quiet: true });
    }
  }
  log(`  ✓  memberships set (admin1+T1-4 → primary; admin2 → second; therapist2 → both)`);

  // 4) Clinic-OWNED workload children (origin = primary clinic) + intake children
  log("\n── Clinic-owned workload children ──");
  let nameIdx = 0;     // walks NAMES
  let childSeq = 0;    // walks mk("1", …) cp ids
  const allocation = []; // for the summary table
  for (const t of THERAPISTS) {
    const therapistUid = uid[t.email];
    let count = 0;
    for (let j = 0; j < t.owned; j++) {
      const [first, last] = NAMES[nameIdx++];
      const cpId = mk("1", ++childSeq);
      await insIfAbsent("child_profiles", {
        id: cpId, display_name: `${first} ${last}`, first_name: first, last_name: last,
        date_of_birth: `2020-0${(childSeq % 9) + 1}-1${childSeq % 9}`, sex_at_birth: childSeq % 2 ? "male" : "female",
        primary_language: "Filipino", country_code: "PH", created_in_app: "lauris_care",
        origin_organization_id: PRIMARY_CLINIC,
      }, { critical: false, quiet: true });
      await insIfAbsentBy(
        "child_profile_memberships",
        { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, status: "active" },
        { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, relationship_kind: "clinic_client",
          status: "active", started_at: "2026-02-01", created_in_app: "lauris_care" },
        { critical: false, quiet: true });
      await seedTreatment({ cpId, clinicId: PRIMARY_CLINIC, therapistUid, createdByUid: uid["admin1@lauriscare.test"], ttype: t.ttype, childIndex: childSeq });
      count++;
    }
    allocation.push({ therapist: t.name, spec: t.spec, ttype: t.ttype, owned: count });
  }
  log(`  ✓  ${childSeq} owned children created across 4 therapists`);

  // intake children — onboarded (clinic_client) but NO therapist / sessions yet
  log("\n── Intake children (no therapist assigned) ──");
  const intakeNames = [];
  for (let j = 0; j < INTAKE_COUNT; j++) {
    const [first, last] = NAMES[nameIdx++];
    intakeNames.push(`${first} ${last}`);
    const cpId = mk("1", ++childSeq);
    await insIfAbsent("child_profiles", {
      id: cpId, display_name: `${first} ${last}`, first_name: first, last_name: last,
      date_of_birth: `2021-0${(j % 8) + 1}-05`, sex_at_birth: j % 2 ? "male" : "female",
      primary_language: "Filipino", country_code: "PH", created_in_app: "lauris_care",
      origin_organization_id: PRIMARY_CLINIC,
    }, { critical: false, quiet: true });
    await insIfAbsentBy(
      "child_profile_memberships",
      { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, status: "active" },
      { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, relationship_kind: "clinic_client",
        status: "active", started_at: today, created_in_app: "lauris_care" },
      { critical: false, quiet: true });
  }
  log(`  ✓  ${INTAKE_COUNT} intake children (membership only): ${intakeNames.join(", ")}`);

  // 5) Sunshine-linked cross-app children (1 per therapist)
  log("\n── Sunshine ↔ Care linked children ──");
  const sunshineStudents = await resolveSunshineStudents(SUNSHINE_LINK_COUNT);
  const sunshineSummary = [];
  for (let i = 0; i < sunshineStudents.length; i++) {
    const s = sunshineStudents[i];
    const t = THERAPISTS[i % THERAPISTS.length];
    const therapistUid = uid[t.email];
    const cpId = mk("a", i + 1);
    const isTransfer = i === TRANSFER_SUNSHINE_INDEX;
    const fullFeatured = FULL_FEATURED_SUNSHINE.includes(i);

    // shared (school-origin) child_profile mirroring the real student's name
    await insIfAbsent("child_profiles", {
      id: cpId, display_name: `${s.first_name} ${s.last_name}`, first_name: s.first_name, last_name: s.last_name,
      date_of_birth: s.date_of_birth ?? null, sex_at_birth: s.gender ?? null,
      primary_language: "Filipino", country_code: "PH", created_in_app: "lauris_learn",
      // origin NULL → school-origin → shared into clinics by GRANT
    }, { critical: false, quiet: true });
    await insIfAbsent("child_identifiers", {
      id: mk("2", i + 1), child_profile_id: cpId, identifier_type: "school_internal",
      identifier_value: `SUN-2026-${String(i + 1).padStart(4, "0")}`, country_code: "PH",
    }, { critical: false, quiet: true });
    // link the REAL Sunshine student to this shared profile (reversible)
    if (s.child_profile_id !== cpId) {
      await db.from("students").update({ child_profile_id: cpId }).eq("id", s.id);
    }
    // school-side membership (additive)
    await insIfAbsentBy(
      "child_profile_memberships",
      { child_profile_id: cpId, organization_id: SUNSHINE_ORG_ID, status: "active" },
      { child_profile_id: cpId, organization_id: SUNSHINE_ORG_ID, relationship_kind: "enrolled_student",
        status: "active", started_at: "2026-06-01", created_in_app: "lauris_learn" },
      { critical: false, quiet: true });

    // identity grant Sunshine → primary clinic
    if (ssAdminUid) {
      await insIfAbsentBy(
        "child_profile_access_grants",
        { child_profile_id: cpId, target_organization_id: PRIMARY_CLINIC, status: "active" },
        { id: mk("6", i + 1), child_profile_id: cpId, scope: "identity_with_identifiers",
          source_organization_id: SUNSHINE_ORG_ID, target_organization_id: PRIMARY_CLINIC,
          granted_by_profile_id: ssAdminUid, granted_by_kind: "school_admin",
          purpose: "Therapy coordination (school-shared client)", status: "active" },
        { critical: false, quiet: true });
    }
    // Care membership + treatment at the primary clinic
    await insIfAbsentBy(
      "child_profile_memberships",
      { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, status: "active" },
      { child_profile_id: cpId, organization_id: PRIMARY_CLINIC, relationship_kind: "therapy_client",
        status: "active", started_at: "2026-02-01", created_in_app: "lauris_care" },
      { critical: false, quiet: true });
    await seedTreatment({ cpId, clinicId: PRIMARY_CLINIC, therapistUid, createdByUid: uid["admin1@lauriscare.test"], ttype: t.ttype, childIndex: 100 + i });

    // full-featured: shared IEP (Learn doc → clinic grant) + a portal parent
    if (fullFeatured && ssAdminUid) {
      const docId = mk("8", i + 1), verId = mk("9", i + 1);
      const docExists = (await db.from("child_documents").select("id").eq("id", docId).maybeSingle()).data;
      if (!docExists) {
        await db.from("child_documents").insert({
          id: docId, school_id: SUNSHINE_SCHOOL_ID, student_id: s.id, document_type: "iep",
          title: `IEP — ${s.first_name} ${s.last_name} (SY 2026–2027)`, status: "draft",
          source_kind: "school", created_by: ssAdminUid, effective_date: "2026-06-15",
        });
        await db.from("child_document_versions").insert({
          id: verId, document_id: docId, school_id: SUNSHINE_SCHOOL_ID, version_number: 1,
          storage_path: `${SUNSHINE_SCHOOL_ID}/${s.id}/${docId}/v1.pdf`,
          file_name: `iep-${s.first_name}-${s.last_name}-v1.pdf`.toLowerCase().replace(/\s+/g, "-"),
          mime_type: "application/pdf", uploaded_by_kind: "school_admin", uploaded_by_user_id: ssAdminUid,
        });
        await db.from("child_documents").update({ current_version_id: verId, status: "active" }).eq("id", docId);
      }
      await insIfAbsentBy(
        "document_organization_access_grants",
        { document_id: docId, target_organization_id: PRIMARY_CLINIC, status: "active" },
        { id: mk("7", i + 1), document_id: docId, scope: "document",
          source_school_id: SUNSHINE_SCHOOL_ID, target_organization_id: PRIMARY_CLINIC,
          granted_by_profile_id: ssAdminUid, granted_by_kind: "school_admin",
          purpose: "Share IEP with treating clinic",
          permissions: { view: true, download: true, comment: false, upload_new_version: false },
          status: "active" },
        { critical: false, quiet: true });
      // portal parent: parent1 → first full-featured, parent2 → second
      const parentEmail = i === FULL_FEATURED_SUNSHINE[0] ? "parent1@laurisparent.test" : "parent2@laurisparent.test";
      const parentName  = parentEmail.startsWith("parent1") ? "Paolo Cruz" : "Liza Cruz";
      const relationship = parentEmail.startsWith("parent1") ? "Father" : "Mother";
      await insIfAbsentBy(
        "guardians",
        { student_id: s.id, email: parentEmail },
        { student_id: s.id, full_name: parentName, relationship, email: parentEmail, is_primary: true },
        { critical: false, quiet: true });
      await insIfAbsentBy(
        "care_family_members",
        { profile_id: uid[parentEmail], child_profile_id: cpId },
        { profile_id: uid[parentEmail], child_profile_id: cpId, clinic_organization_id: PRIMARY_CLINIC, relationship: "parent" },
        { critical: false, quiet: true });
    }

    // transfer case: also shared to the SECOND clinic, with an upcoming session there
    if (isTransfer && ssAdminUid) {
      await insIfAbsentBy(
        "child_profile_access_grants",
        { child_profile_id: cpId, target_organization_id: SECOND_CLINIC, status: "active" },
        { id: mk("6", 90 + i), child_profile_id: cpId, scope: "identity_with_identifiers",
          source_organization_id: SUNSHINE_ORG_ID, target_organization_id: SECOND_CLINIC,
          granted_by_profile_id: ssAdminUid, granted_by_kind: "school_admin",
          purpose: "Clinic transfer — records shared with receiving clinic", status: "active" },
        { critical: false, quiet: true });
      await insIfAbsentBy(
        "child_profile_memberships",
        { child_profile_id: cpId, organization_id: SECOND_CLINIC, status: "active" },
        { child_profile_id: cpId, organization_id: SECOND_CLINIC, relationship_kind: "therapy_client",
          status: "active", started_at: today, created_in_app: "lauris_care" },
        { critical: false, quiet: true });
      // upcoming session at the receiving clinic with the dual-clinic therapist (Joaquin Reyes, OT)
      await insIfAbsent("therapy_sessions", {
        id: mk("3", ++SESS_SEQ), clinic_organization_id: SECOND_CLINIC, child_profile_id: cpId,
        therapist_profile_id: uid["therapist2@lauriscare.test"], therapy_type: "occupational",
        scheduled_at: "2026-06-30T02:00:00.000Z", duration_minutes: 50, status: "scheduled",
        created_by_profile_id: uid["admin2@lauriscare.test"],
      }, { critical: false, quiet: true });
    }

    sunshineSummary.push({
      name: `${s.first_name} ${s.last_name}`, student: s.id.slice(0, 8), therapist: t.name,
      ttype: t.ttype, transfer: isTransfer, iep: fullFeatured,
    });
  }

  // ── summary ──
  log("\n══════════════════════════════════════════════════════");
  log("  Demo ready.  Care/parent password: " + DEMO_PASSWORD);
  log("══════════════════════════════════════════════════════\n");
  log("  LAURIS LEARN — Sunshine Learning Center (REAL pilot; use existing @sunshine.test logins)\n");
  log("  LAURIS CARE (/care):");
  log("    PRIMARY  " + PRIMARY_CLINIC_NAME);
  log("      admin1@lauriscare.test      clinic_admin  Dr. Elena Santos");
  for (const t of THERAPISTS) {
    const e = USERS.find((u) => u.name === t.name)?.email ?? "";
    log(`      ${e.padEnd(28)}therapist     ${t.name} — ${t.spec}`);
  }
  log("    SECOND   " + SECOND_CLINIC_NAME + "  (transfer target)");
  log("      admin2@lauriscare.test      clinic_admin  Rafael Domingo");
  log("      (therapist2 Joaquin Reyes also works here — receives the transfer)\n");
  log("  LAURIS PARENT (/parent on either app):");
  log("    parent1@laurisparent.test     Paolo Cruz   (guardian + Care family of a Sunshine-shared child)");
  log("    parent2@laurisparent.test     Liza Cruz    (guardian + Care family of a Sunshine-shared child)\n");
  log("  LAURIS MED (reserved naming only — NOT created): " + MED_RESERVED.join(", "));
  log("\n  Workload (primary clinic):");
  for (const a of allocation) log(`    ${a.therapist.padEnd(16)} ${a.ttype.padEnd(13)} owned=${a.owned} + 1 Sunshine-linked`);
  log(`    Intake (no therapist): ${INTAKE_COUNT} children — ${intakeNames.join(", ")}`);
  log("\n  Sunshine ↔ Care linked children:");
  for (const x of sunshineSummary)
    log(`    ${x.name.padEnd(22)} student=${x.student}…  ${x.therapist} (${x.ttype})` +
      `${x.iep ? "  +sharedIEP +parent" : ""}${x.transfer ? "  ★TRANSFER→Northside" : ""}`);
  log("");
}

main().catch((e) => { console.error("\n✗ Seed failed:", e.message ?? e); process.exit(1); });
