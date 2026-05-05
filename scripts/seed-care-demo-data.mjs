/**
 * scripts/seed-care-demo-data.mjs
 *
 * Seeds realistic Lauris Care demo data for MVP testing.
 * Prerequisite: seed-care-demo-logins.mjs must have been run first.
 *
 * What this seeds:
 *   - 6 clinic-owned children for Clinic North
 *   - 5 clinic-owned children for Clinic South
 *   - 11 parent auth users (password: SunshineDemo2026!) — profiles only, no child linkage
 *   - 6 therapy sessions per child (prev/curr/next month mix of statuses)
 *   - therapy_session_notes for every completed session
 *   - clinic documents (2 docs for North, 3 docs for South, on selected children)
 *
 * Idempotent: safe to rerun.
 *   - Children identified by (display_name, origin_organization_id) — reused if found
 *   - Sessions: if ANY session exists for (child, clinic) the whole session block is skipped
 *   - Documents: if ANY document exists for (child, clinic) the doc block is skipped
 *   - Parents: password reset + metadata update on rerun
 *
 * Schema notes:
 *   - therapy_session_notes: UNIQUE on therapy_session_id (1:1). Only for completed sessions.
 *   - status CHECK: scheduled | completed | cancelled | no_show  (no 'absent')
 *   - clinic_documents: 3-step insert (head → version → repoint current_version_id)
 *   - cd_origin_consistency_validate trigger fires even with service-role (SECURITY DEFINER)
 *   - authored_by_profile_id is pinned to the inserting user in normal RLS, but service-role
 *     bypasses that — we set it to the admin's profile_id manually.
 *
 * Usage:
 *   node scripts/seed-care-demo-data.mjs
 *
 * Required env vars (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Config ───────────────────────────────────────────────────────────────────

const PARENT_PASSWORD = "SunshineDemo2026!";
const DEMO_ADMIN_EMAILS = {
  north: "care.admin.north@lauris.demo",
  south: "care.admin.south@lauris.demo",
};
const CLINIC_NAMES = {
  north: "Lauris Care Demo Clinic North",
  south: "Lauris Care Demo Clinic South",
};

// ─── Note content pools ───────────────────────────────────────────────────────

const NOTES = {
  speech: [
    {
      session_objective: "Improve articulation of /s/ and /z/ sounds in initial word position.",
      activities: "Minimal pair drills: sun/fun, zoo/boo. Story retell using target words. Oral motor warm-up with tongue tip exercises.",
      child_response: "Child produced /s/ correctly in 14/20 trials (70%). Became distracted after 20 minutes but re-engaged with visual cues. Good imitation of clinician models.",
      progress_observed: "Noticeable improvement from last session (55%). Child self-corrected twice without prompting — a first. /z/ remains inconsistent in medial position.",
      home_practice: "Practice 'snake words' list (10 items) twice daily with a mirror. Read the sun/zoo picture book together and have child name each image.",
      private_internal_note: "Parent reported child has been practicing at home. Consider introducing /s/ blends next session if accuracy stays above 70%.",
    },
    {
      session_objective: "Expand mean length of utterance (MLU) from 2 to 3-word phrases.",
      activities: "Play-based language with farm animal figures. Carrier phrase expansion: 'I see a ___', 'The ___ is ___'. Clinician models, child imitates then spontaneously produces.",
      child_response: "Produced 3-word phrases in 8/15 opportunities with light verbal prompt. Spontaneous 3-word utterances emerged twice during free play. Highly engaged with animal figures.",
      progress_observed: "MLU measured at 2.4 (up from 2.1 last month). Pronoun 'I' now used consistently. 'The' article still omitted most of the time.",
      home_practice: "During dinner, parent narrates and pauses: 'The dog is ___' and waits for child to complete. Aim for 5 expansions per mealtime.",
      private_internal_note: "Will introduce article 'the' in structured drill next session. Consider referral to OT if fine motor concerns persist (pencil grip observed as weak).",
    },
    {
      session_objective: "Strengthen pragmatic skills: turn-taking and topic maintenance in conversation.",
      activities: "Barrier game (describe-and-draw). Role play ordering at a pretend restaurant. Clinician deliberately made off-topic comments to practice redirection.",
      child_response: "Maintained topic for 4-5 exchanges before shifting — marked improvement. Initiated 3 conversational repairs independently. Struggled with barrier game instructions but persisted.",
      progress_observed: "Topic maintenance duration doubled since initial assessment. Eye contact during conversation is now consistent. Still interrupts when excited, but frequency reduced.",
      home_practice: "20-minute 'talk time' each evening: take turns asking each other 2 questions and listen fully before responding. Use a timer if needed.",
      private_internal_note: "Strong session. Consider discharging pragmatic goals in 2–3 sessions if trajectory holds. Parent present today — very engaged and asking good questions.",
    },
    {
      session_objective: "Develop phonological awareness: rhyme identification and initial sound segmentation.",
      activities: "Rhyme sorting cards (mat/cat/hat vs cup/pup/up). Alliteration game with name cards. Sound box tapping for CVC words.",
      child_response: "Rhyme identification: 9/12 correct (75%). Initial sound tapping: 7/10 with 2-second wait time. Struggled with blends (st-, pl-). Stayed on task for full 30 minutes.",
      progress_observed: "Rhyme awareness is emerging consistently. Initial sound isolation is solid for single consonants. Blends and final sound isolation remain targets.",
      home_practice: "Play 'I Spy' with sounds (not letters): 'I spy something that starts with /m/.' Do 5–10 minutes before bedtime reading.",
      private_internal_note: "Will begin phoneme blending drills next session. Child shows strong visual memory — use letter tiles as visual anchors for phoneme positions.",
    },
  ],
  occupational: [
    {
      session_objective: "Improve pencil grasp and pre-writing stroke accuracy (horizontal, vertical, diagonal lines).",
      activities: "Theraputty warm-up (pinch and roll). Vertical chalkboard lines with dynamic tripod grip cue. Dot-to-dot worksheet (large format). Scissor cutting along wide straight lines.",
      child_response: "Maintained dynamic tripod grip for ~8 minutes before reverting to fist grasp. Completed 4/6 dot-to-dot lines within 0.5 cm of target. Scissor cutting: opened fully but had difficulty sequencing snips.",
      progress_observed: "Tripod grip duration increased from 3 minutes to 8 minutes. Diagonal stroke is now present but inconsistent in direction. Scissors are a new target — baseline established today.",
      home_practice: "Daily 5-minute theraputty session: squeeze 10 times, roll 10 snakes, pinch 10 peas. Use golf pencil for all drawing activities at home this week.",
      private_internal_note: "Parent concerned about school readiness. Recommend weighted pencil trial — will source one and introduce next session. OT goals are appropriate for age 5.",
    },
    {
      session_objective: "Build bilateral coordination for dressing tasks (buttons, zippers).",
      activities: "Button board (small, medium, large buttons). Lacing card activity. Zipper practice vest. Simulated dressing sequence with visual schedule strip.",
      child_response: "Large buttons: independent. Medium buttons: 60% independent, needed hand-over-hand for button hole alignment. Small buttons: 0% — refused after 2 attempts. Zipper: pull up independently, needs help with starting tab.",
      progress_observed: "Large button mastery is consistent (100% across 3 sessions). Medium buttons emerging. Small buttons remain a significant challenge — fine motor precision is the limiting factor.",
      home_practice: "Dress Mr. Button Bear each morning (large buttons only this week). Let child practice own jacket zipper — parent starts the tab, child pulls up.",
      private_internal_note: "Child shows frustration with small buttons — use backward chaining to reduce failure. Consider whether school uniform requires small buttons — flag to parent.",
    },
    {
      session_objective: "Improve sensory processing: decrease tactile defensiveness to messy textures.",
      activities: "Wilbarger brushing protocol (parent trained last session). Heavy work warm-up: push wall, carry books. Tactile exploration bin: beans → kinetic sand → shaving cream (graduated exposure).",
      child_response: "Accepted brushing with minor verbal protest (improvement from refusing last session). Tolerated beans for 4 minutes before requesting break. Touched kinetic sand with finger tip only. Refused shaving cream — did not escalate.",
      progress_observed: "Tactile tolerance window is widening. Beans are now a neutral stimulus (was aversive 3 sessions ago). Dry textures are consistently tolerated; wet/sticky textures remain aversive.",
      home_practice: "Brushing protocol 2x daily (morning + before bed). Offer sensory bin with dried lentils for 5 minutes free play — no pressure to touch, just exposure.",
      private_internal_note: "Parent implementing home protocol consistently — great commitment. Consider adding vibrating toothbrush to oral desensitization if tactile gains continue. Re-evaluate in 4 sessions.",
    },
    {
      session_objective: "Develop visual motor integration for copying simple geometric shapes.",
      activities: "Beery VMI subtest (partial — 6 items). Shape copying on vertical surface (mirror + paper). Geoboard pattern matching. Puzzles with 6–9 pieces.",
      child_response: "VMI: age equivalent 4y2m (chronological age 5y8m — moderate delay). Copied circle and cross accurately. Square attempted but corners rounded. Triangle not yet produced. Puzzle: 9-piece completed in 5 min with 1 verbal cue.",
      progress_observed: "Circle is fully mastered. Cross reproduction is new since last formal assessment. Square corners are emerging. VMI delay is consistent with prior OT assessment.",
      home_practice: "Shape tracing workbook (pages 8–15, circle and cross only). Play with Magna-Tiles to build shape awareness. Avoid coloring sheets with fine details — use bold outlines only.",
      private_internal_note: "VMI delay is likely contributing to handwriting difficulties. Will share VMI scores with parents next session and discuss school accommodation. Consider referral to developmental optometrist.",
    },
  ],
  behavioral: [
    {
      session_objective: "Reduce frequency of tantrum behavior during transitions using visual schedule and countdown timer.",
      activities: "Review visual schedule with child (icons for each session block). Introduced 5-minute sand timer for activity transitions. Role-play 'finishing time' with toy cleanup.",
      child_response: "Tantrums during transitions: 2 today (down from 5 last session). Accepted timer with verbal explanation. Initiated schedule check independently once. Required redirection during cleanup but transitioned within 3 minutes.",
      progress_observed: "Significant reduction in transition tantrums. Visual schedule is becoming a reliable anchor. Sand timer accepted as a concrete transition cue — major milestone.",
      home_practice: "Use a 5-minute timer before all transitions at home (screen off, mealtime, leave house). Pair with a consistent verbal cue: 'Timer is starting, 5 minutes until ___.'",
      private_internal_note: "Parent report: tantrums at home also decreasing. Consistency between clinic and home is accelerating progress. Will introduce 'finished' check mark ritual next session.",
    },
    {
      session_objective: "Build emotional identification skills: name and recognize basic emotions in self and others.",
      activities: "Emotion faces card matching (happy, sad, angry, scared, surprised). Mirror play — make and name faces together. 'How does this person feel?' storybook discussion. Feelings thermometer introduction.",
      child_response: "Named happy, sad, angry correctly from cards 100%. Surprised and scared confused with each other — accepted prompting. Mirror play elicited genuine affect. Engaged with storybook for 15 minutes — longest sustained engagement to date.",
      progress_observed: "Core emotion vocabulary (happy/sad/angry) is solidifying. Nuanced emotions remain targets. Social referencing (looking at clinician for cues) is now emerging spontaneously.",
      home_practice: "Feelings check-in at bedtime: 'What was your happiest part of today? Was there anything that made you feel sad or angry?' Keep it brief and non-pressured.",
      private_internal_note: "Child's affect is becoming more readable. Parents note he is beginning to verbalize emotions at home unprompted — a strong indicator of generalization.",
    },
    {
      session_objective: "Increase on-task behavior during non-preferred academic activities to 10-minute sustained intervals.",
      activities: "Counting worksheet (non-preferred). Token board: 5 tokens = 5-minute preferred activity break. Errorless learning format — faded prompts over task. Cool-down corner introduction.",
      child_response: "On-task for 7 minutes sustained (up from 4 minutes). Earned 2 full token boards. Required 1 prompt to return to task after break. Did not require cool-down corner today.",
      progress_observed: "On-task duration improved significantly this month (4 → 7 minutes). Token economy is now understood and motivating. Break transitions are smooth when timer is used.",
      home_practice: "Token board for homework time: every 5 minutes on task = 1 token. 3 tokens = 10-minute free choice. Keep chart visible and consistent.",
      private_internal_note: "Consider fading token schedule from fixed to variable ratio as on-task duration stabilizes at 10 minutes. Discuss with parents whether school uses similar system.",
    },
    {
      session_objective: "Develop frustration tolerance: use 'stop and breathe' coping strategy independently.",
      activities: "Dragon breathing practice (in through nose, out through mouth slowly). Frustration scenario role-play with block tower intentionally knocked over. Identify body signals of frustration (tight chest, hot face). Coping card creation.",
      child_response: "Completed dragon breathing without prompting after block tower fell — first independent use of strategy. Named 'tight tummy' as a frustration signal. Made own coping card with 3 strategies. Mild protest when session ended.",
      progress_observed: "Independent strategy use is a significant breakthrough. Body signal identification is new since last session. Frustration episodes in session: 1 today (down from 4 in first session).",
      home_practice: "Post coping card on fridge at eye level. When frustration signals appear, parent says: 'I notice your tummy feels tight. Want to try dragon breathing?' — offer, don't demand.",
      private_internal_note: "Excellent progress on coping strategy generalization. Will introduce 'asking for help' as a complementary strategy. Parents should be coached to validate emotion before redirecting to strategy.",
    },
  ],
  other: [
    {
      session_objective: "Assess baseline developmental milestones and establish therapeutic rapport.",
      activities: "Structured play observation. Parent interview (developmental history, current concerns). Standardized screening items. Free play period to observe spontaneous behavior.",
      child_response: "Cooperative throughout assessment. Engaged with all materials offered. Comfort level with clinician increased over the 50-minute session — cautious at first, relaxed by end.",
      progress_observed: "Baseline established. Strengths: receptive language, visual memory, sustained attention for preferred tasks. Areas for development: expressive language, fine motor, peer interaction.",
      home_practice: "No specific home tasks this week. Observe and note any situations where child shows particular strengths or struggles — bring observations to next session.",
      private_internal_note: "Strong rapport established despite initial hesitation. Parent very invested and asks good questions. Goal-setting session scheduled for next appointment.",
    },
    {
      session_objective: "Set collaborative therapy goals with family; introduce home program framework.",
      activities: "Family goal-setting conversation (child included). Priority ranking of concern areas. Explanation of therapy approach and frequency. Home program introduction — first task assigned.",
      child_response: "Child chose a sticker for their 'goal board' and identified their own goal ('talk better'). Engaged during family conversation, colored while listening. Accepted goal board enthusiastically.",
      progress_observed: "Family alignment on top 3 goals achieved. Home program materials distributed. Parent confident in first home task. Child shows intrinsic motivation — positive prognostic indicator.",
      home_practice: "Complete the 'My Goals' page in the home program booklet together this week. Keep therapy notebook for writing down observations and questions.",
      private_internal_note: "Family is highly motivated. Set realistic expectations about timeline. Recommended monthly check-in calls between sessions — parent agreed.",
    },
    {
      session_objective: "Review progress toward quarterly goals; adjust therapy plan based on data.",
      activities: "Structured probe of all active goal areas. Parent report review. Goal achievement celebration ritual (sticker chart). Introduction of next-quarter targets.",
      child_response: "Engaged enthusiastically with probe activities — now views them as 'the test game'. Celebrated progress milestones with high-fives. Asked clinician 'what's next?' — strong intrinsic motivation.",
      progress_observed: "2 of 4 quarterly goals met (mastery criteria). 1 goal progressing on trajectory. 1 goal revised — original criteria were too stringent given baseline. Overall: strong quarter.",
      home_practice: "Maintain current home program. No changes this week — consolidation is the goal before new targets are introduced next session.",
      private_internal_note: "Consider discharging Goal 2 next quarter — child is performing at age expectations. Document in progress note for insurance review. Schedule mid-year parent conference.",
    },
    {
      session_objective: "Discharge planning: review all goal outcomes and establish maintenance plan.",
      activities: "Final standardized assessment (post-test). Achievement celebration. Skills generalization discussion with parent. Maintenance plan co-creation.",
      child_response: "Completed all post-test items with enthusiasm. Displayed skills confidently — markedly different from initial assessment presentation. Expressed pride in own progress.",
      progress_observed: "All discharge criteria met. Post-test scores within functional range for age. Parent reports daily function is significantly improved. Maintenance plan established.",
      home_practice: "Continue home program independently — monthly check of skills. Return to clinic if regression observed. Emergency contact information provided.",
      private_internal_note: "Successful discharge. Will send summary report to referring pediatrician and school (with parent consent). Recommend annual monitoring check-in.",
    },
  ],
};

// ─── Child roster ─────────────────────────────────────────────────────────────

// slotHour: UTC hour for session scheduling (PH = UTC+8, so 01:00 UTC = 09:00 PH)
const CHILDREN = {
  north: [
    { displayName: "Sofia Reyes",    dob: "2019-03-12", sex: "female", therapyType: "speech",       slotHour: "01", parentEmail: "parent.north.01@lauris.demo", parentName: "Maria Reyes" },
    { displayName: "Marco Santos",   dob: "2018-11-05", sex: "male",   therapyType: "occupational",  slotHour: "01", parentEmail: "parent.north.02@lauris.demo", parentName: "Jose Santos" },
    { displayName: "Isabella Cruz",  dob: "2020-06-20", sex: "female", therapyType: "speech",       slotHour: "03", parentEmail: "parent.north.03@lauris.demo", parentName: "Ana Cruz" },
    { displayName: "Liam Garcia",    dob: "2019-09-01", sex: "male",   therapyType: "occupational",  slotHour: "03", parentEmail: "parent.north.04@lauris.demo", parentName: "Carlos Garcia" },
    { displayName: "Andrea Mendoza", dob: "2018-04-15", sex: "female", therapyType: "behavioral",   slotHour: "01", parentEmail: "parent.north.05@lauris.demo", parentName: "Rosa Mendoza" },
    { displayName: "Rafael Torres",  dob: "2020-01-30", sex: "male",   therapyType: "speech",       slotHour: "06", parentEmail: "parent.north.06@lauris.demo", parentName: "Elena Torres" },
  ],
  south: [
    { displayName: "Emma Lopez",     dob: "2019-07-22", sex: "female", therapyType: "occupational",  slotHour: "01", parentEmail: "parent.south.01@lauris.demo", parentName: "Linda Lopez" },
    { displayName: "Diego Ramos",    dob: "2018-12-10", sex: "male",   therapyType: "speech",       slotHour: "01", parentEmail: "parent.south.02@lauris.demo", parentName: "Miguel Ramos" },
    { displayName: "Luna Bautista",  dob: "2019-05-03", sex: "female", therapyType: "behavioral",   slotHour: "03", parentEmail: "parent.south.03@lauris.demo", parentName: "Grace Bautista" },
    { displayName: "Paolo Villanueva", dob: "2018-08-17", sex: "male", therapyType: "speech",       slotHour: "03", parentEmail: "parent.south.04@lauris.demo", parentName: "Antonio Villanueva" },
    { displayName: "Mia Rivera",     dob: "2020-02-25", sex: "female", therapyType: "occupational",  slotHour: "06", parentEmail: "parent.south.05@lauris.demo", parentName: "Carmen Rivera" },
  ],
};

// ─── Document definitions (keyed by child display_name) ──────────────────────

const DOCUMENTS = {
  // North
  "Sofia Reyes": [
    { title: "Initial Speech-Language Assessment", kind: "initial assessment", allowDownload: true,  status: "active" },
    { title: "Speech Therapy Plan — Q2 2026",      kind: "therapy plan",       allowDownload: false, status: "active" },
  ],
  "Andrea Mendoza": [
    { title: "Behavioral Support Plan — 2026",     kind: "behavioral support plan", allowDownload: false, status: "active" },
  ],
  // South
  "Diego Ramos": [
    { title: "Initial Speech-Language Assessment", kind: "initial assessment", allowDownload: true, status: "active" },
  ],
  "Paolo Villanueva": [
    { title: "Monthly Progress Note — April 2026", kind: "progress note",  allowDownload: true,  status: "active" },
    { title: "Speech Therapy Plan — Q2 2026",      kind: "therapy plan",   allowDownload: false, status: "active" },
  ],
};

// ─── Session schedule builder ─────────────────────────────────────────────────

function buildSessionSchedule(slotHour, childGlobalIdx) {
  const h = String(slotHour).padStart(2, "0");
  return [
    // Previous month — 2 sessions (both completed)
    { date: `2026-04-07T${h}:00:00.000Z`, status: "completed",  noteIdx: 0 },
    { date: `2026-04-21T${h}:00:00.000Z`, status: childGlobalIdx % 4 === 3 ? "cancelled" : childGlobalIdx % 4 === 2 ? "no_show" : "completed", noteIdx: 1 },
    // Current month — 2 sessions (first completed, second scheduled)
    { date: `2026-05-05T${h}:00:00.000Z`, status: "completed",  noteIdx: 2 },
    { date: `2026-05-19T${h}:00:00.000Z`, status: "scheduled",  noteIdx: null },
    // Next month — 2 sessions (both scheduled)
    { date: `2026-06-02T${h}:00:00.000Z`, status: "scheduled",  noteIdx: null },
    { date: `2026-06-16T${h}:00:00.000Z`, status: "scheduled",  noteIdx: null },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findAuthUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).find((u) => u.email === email) ?? null;
}

async function ensureParentAuthUser(email, fullName) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: PARENT_PASSWORD,
      user_metadata: { full_name: fullName },
    });
    console.log(`  ↩  parent exists: ${email}`);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PARENT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message}`);
  console.log(`  ✓  created parent: ${email}`);
  return data.user.id;
}

async function getClinicOrgByName(name) {
  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .eq("name", name)
    .eq("kind", "clinic")
    .maybeSingle();
  if (error) throw new Error(`getClinicOrg("${name}"): ${error.message}`);
  if (!data) throw new Error(`Clinic org "${name}" not found — run seed-care-demo-logins.mjs first`);
  return data;
}

async function getProfileByEmail(email) {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`getProfile(${email}): ${error.message}`);
  if (!data) throw new Error(`Profile for ${email} not found — run seed-care-demo-logins.mjs first`);
  return data.id;
}

async function findOwnedChildByName(orgId, displayName) {
  const { data } = await admin
    .from("child_profiles")
    .select("id")
    .eq("origin_organization_id", orgId)
    .eq("display_name", displayName)
    .maybeSingle();
  return data?.id ?? null;
}

async function ensureChild(orgId, childDef) {
  const existing = await findOwnedChildByName(orgId, childDef.displayName);
  if (existing) {
    console.log(`  ↩  child exists: ${childDef.displayName}`);
    return existing;
  }

  const childId = randomUUID();

  const { error: cpErr } = await admin.from("child_profiles").insert({
    id: childId,
    display_name: childDef.displayName,
    date_of_birth: childDef.dob,
    sex_at_birth: childDef.sex,
    country_code: "PH",
    origin_organization_id: orgId,
    created_in_app: "lauris_care",
  });
  if (cpErr) throw new Error(`insert child_profiles(${childDef.displayName}): ${cpErr.message}`);

  const { error: cpmErr } = await admin.from("child_profile_memberships").insert({
    child_profile_id: childId,
    organization_id: orgId,
    relationship_kind: "clinic_client",
    status: "active",
    started_at: new Date().toISOString().slice(0, 10),
  });
  if (cpmErr) {
    // Best-effort rollback
    await admin.from("child_profiles").delete().eq("id", childId);
    throw new Error(`insert child_profile_memberships(${childDef.displayName}): ${cpmErr.message}`);
  }

  console.log(`  ✓  child created: ${childDef.displayName}`);
  return childId;
}

async function hasSessionsForChild(orgId, childProfileId) {
  const { data } = await admin
    .from("therapy_sessions")
    .select("id")
    .eq("clinic_organization_id", orgId)
    .eq("child_profile_id", childProfileId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function seedSessions(orgId, childId, therapistProfileId, adminProfileId, childDef, childGlobalIdx) {
  const alreadySeeded = await hasSessionsForChild(orgId, childId);
  if (alreadySeeded) {
    console.log(`    ↩  sessions already seeded for ${childDef.displayName}`);
    return;
  }

  const schedule = buildSessionSchedule(childDef.slotHour, childGlobalIdx);
  const notePool = NOTES[childDef.therapyType] ?? NOTES.other;
  let notePoolIdx = 0;

  for (const slot of schedule) {
    const sessionId = randomUUID();

    const { error: sErr } = await admin.from("therapy_sessions").insert({
      id: sessionId,
      clinic_organization_id: orgId,
      child_profile_id: childId,
      therapist_profile_id: therapistProfileId,
      therapy_type: childDef.therapyType,
      scheduled_at: slot.date,
      duration_minutes: 50,
      status: slot.status,
      created_by_profile_id: adminProfileId,
    });
    if (sErr) throw new Error(`insert therapy_sessions(${childDef.displayName} ${slot.date}): ${sErr.message}`);

    // Seed note for completed sessions only
    if (slot.status === "completed" && slot.noteIdx !== null) {
      const noteContent = notePool[notePoolIdx % notePool.length];
      notePoolIdx++;

      const { error: nErr } = await admin.from("therapy_session_notes").insert({
        therapy_session_id: sessionId,
        authored_by_profile_id: therapistProfileId,
        session_objective: noteContent.session_objective,
        activities: noteContent.activities,
        child_response: noteContent.child_response,
        progress_observed: noteContent.progress_observed,
        home_practice: noteContent.home_practice,
        private_internal_note: noteContent.private_internal_note,
      });
      if (nErr) throw new Error(`insert therapy_session_notes(${childDef.displayName} ${slot.date}): ${nErr.message}`);
    }
  }

  const completedCount = schedule.filter((s) => s.status === "completed").length;
  console.log(`    ✓  ${schedule.length} sessions (${completedCount} completed + notes) for ${childDef.displayName}`);
}

async function hasDocumentsForChild(orgId, childProfileId) {
  const { data } = await admin
    .from("clinic_documents")
    .select("id")
    .eq("origin_organization_id", orgId)
    .eq("child_profile_id", childProfileId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function seedDocumentsForChild(orgId, childId, adminProfileId, childName) {
  const docDefs = DOCUMENTS[childName];
  if (!docDefs || docDefs.length === 0) return;

  const alreadySeeded = await hasDocumentsForChild(orgId, childId);
  if (alreadySeeded) {
    console.log(`    ↩  documents already seeded for ${childName}`);
    return;
  }

  for (const docDef of docDefs) {
    const docId = randomUUID();
    const versionId = randomUUID();

    // Step 1: insert head with current_version_id=null
    const { error: headErr } = await admin.from("clinic_documents").insert({
      id: docId,
      origin_organization_id: orgId,
      child_profile_id: childId,
      title: docDef.title,
      document_kind: docDef.kind,
      status: docDef.status,
      permissions: { view: true, download: docDef.allowDownload },
      created_by_profile_id: adminProfileId,
      current_version_id: null,
    });
    if (headErr) throw new Error(`insert clinic_documents head("${docDef.title}"): ${headErr.message}`);

    // Step 2: insert version
    const safeKind = docDef.kind.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { error: vErr } = await admin.from("clinic_document_versions").insert({
      id: versionId,
      document_id: docId,
      version_number: 1,
      storage_path: `${orgId}/${childId}/${docId}/v1.pdf`,
      mime_type: "application/pdf",
      file_name: `${safeKind}-v1.pdf`,
      file_size_bytes: 204800,
      uploaded_by_profile_id: adminProfileId,
    });
    if (vErr) {
      await admin.from("clinic_documents").delete().eq("id", docId);
      throw new Error(`insert clinic_document_versions("${docDef.title}"): ${vErr.message}`);
    }

    // Step 3: repoint head
    const { error: updErr } = await admin
      .from("clinic_documents")
      .update({ current_version_id: versionId })
      .eq("id", docId);
    if (updErr) throw new Error(`repoint current_version_id("${docDef.title}"): ${updErr.message}`);

    console.log(`    ✓  document: "${docDef.title}" (${docDef.allowDownload ? "download on" : "view only"})`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Lauris Care — Demo Data Seed (Phase 2)");
  console.log("══════════════════════════════════════════\n");

  // ── 1. Resolve clinic orgs ────────────────────────────────────────────────
  console.log("── Clinic Organizations ───────────────────");
  const northOrg = await getClinicOrgByName(CLINIC_NAMES.north);
  const southOrg = await getClinicOrgByName(CLINIC_NAMES.south);
  console.log(`  ✓  North: ${northOrg.id}`);
  console.log(`  ✓  South: ${southOrg.id}`);

  const orgs = { north: northOrg, south: southOrg };

  // ── 2. Resolve admin profiles ─────────────────────────────────────────────
  console.log("\n── Admin Profiles ─────────────────────────");
  const adminProfileIds = {
    north: await getProfileByEmail(DEMO_ADMIN_EMAILS.north),
    south: await getProfileByEmail(DEMO_ADMIN_EMAILS.south),
  };
  const speechTherapistNorthId = await getProfileByEmail("care.speech.north@lauris.demo");
  const otTherapistNorthId     = await getProfileByEmail("care.ot.north@lauris.demo");
  const behaviorTherapistNorthId = await getProfileByEmail("care.behavior.north@lauris.demo");
  const speechTherapistSouthId = await getProfileByEmail("care.speech.south@lauris.demo");
  const otTherapistSouthId     = await getProfileByEmail("care.ot.south@lauris.demo");
  console.log("  ✓  All admin and therapist profiles resolved");

  // Map therapy types to therapist profile IDs per clinic
  const therapistMap = {
    north: {
      speech:       speechTherapistNorthId,
      occupational: otTherapistNorthId,
      behavioral:   behaviorTherapistNorthId,
      other:        adminProfileIds.north,
    },
    south: {
      speech:       speechTherapistSouthId,
      occupational: otTherapistSouthId,
      behavioral:   speechTherapistSouthId, // South has no behavior therapist — speech covers it
      other:        adminProfileIds.south,
    },
  };

  // ── 3. Parent auth users ──────────────────────────────────────────────────
  console.log("\n── Parent Auth Users ──────────────────────");
  console.log("  (profiles only — no child linkage table exists in Care yet)");
  const allChildren = [...CHILDREN.north, ...CHILDREN.south];
  for (const child of allChildren) {
    await ensureParentAuthUser(child.parentEmail, child.parentName);
  }

  // ── 4. Children, sessions, notes, documents ───────────────────────────────
  let childGlobalIdx = 0;

  for (const clinic of ["north", "south"]) {
    const org = orgs[clinic];
    const adminId = adminProfileIds[clinic];
    const children = CHILDREN[clinic];

    console.log(`\n── ${clinic.toUpperCase()} Clinic Children ───────────────────`);

    for (const childDef of children) {
      console.log(`\n  ${childDef.displayName} [${childDef.therapyType}]`);

      const childId = await ensureChild(org.id, childDef);

      const therapistId = therapistMap[clinic][childDef.therapyType];

      await seedSessions(org.id, childId, therapistId, adminId, childDef, childGlobalIdx);
      await seedDocumentsForChild(org.id, childId, adminId, childDef.displayName);

      childGlobalIdx++;
    }
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  Done.\n");

  console.log("Children seeded:");
  console.log("\n  NORTH Clinic:");
  for (const c of CHILDREN.north) {
    const docCount = (DOCUMENTS[c.displayName] ?? []).length;
    console.log(`    ${c.displayName.padEnd(22)} ${c.therapyType.padEnd(14)} ${docCount > 0 ? `${docCount} doc(s)` : ""}`);
  }
  console.log("\n  SOUTH Clinic:");
  for (const c of CHILDREN.south) {
    const docCount = (DOCUMENTS[c.displayName] ?? []).length;
    console.log(`    ${c.displayName.padEnd(22)} ${c.therapyType.padEnd(14)} ${docCount > 0 ? `${docCount} doc(s)` : ""}`);
  }

  console.log(`\nParent accounts (password: ${PARENT_PASSWORD}):`);
  console.log("  parent.north.01–06@lauris.demo  (North clinic parents)");
  console.log("  parent.south.01–05@lauris.demo  (South clinic parents)");
  console.log("  Note: no child linkage table in Care — profiles only.");

  console.log("\nSessions per child: 6");
  console.log("  Apr 7 (completed) · Apr 21 (completed/cancelled/no_show) ·");
  console.log("  May 5 (completed) · May 19 (scheduled) ·");
  console.log("  Jun 2 (scheduled) · Jun 16 (scheduled)");
  console.log("  Notes seeded for all completed sessions (3–4 structured fields each).");

  console.log("\nRichest demo child: Paolo Villanueva (South · speech)");
  console.log("  3 completed sessions with notes + 2 clinic documents");
  console.log("  → ideal for demonstrating the full Care workflow\n");

  console.log("Schema gaps documented:");
  console.log("  • No parent-of-clinic-child linkage table — parent auth users created");
  console.log("    but cannot be associated with children. Phase E deferred.");
  console.log("  • Placeholder storage paths (no real PDFs in clinic-documents bucket).");
  console.log("    View/Download on clinic docs will yield a 404 signed URL —");
  console.log("    upload a real PDF via the UI to test the full access flow.\n");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message ?? err);
  process.exit(1);
});
