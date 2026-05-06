/**
 * scripts/seed-care-demo-data.mjs  (v2 — rich demo story)
 *
 * Seeds Lauris Care demo data for MVP testing and presentations.
 * Prerequisite: seed-care-demo-logins.mjs must have been run first.
 *
 * Tables used (all aligned, no legacy):
 *   child_profiles, child_profile_memberships (Phase 6B)
 *   therapy_sessions (migration 082)
 *   care_session_notes (migration 084 + 088)
 *   care_goals (migration 083)
 *   care_session_goal_links (migration 085)
 *   care_milestones (migration 086)
 *   care_home_activities (migration 087)
 *   clinic_documents + clinic_document_versions (migration 081)
 *
 * Old tables NOT used: therapy_session_notes, children, therapists,
 *   clinics, billing_*, scheduling_queue, enrollment_requests
 *
 * Idempotent — safe to rerun:
 *   children:       by (display_name, origin_organization_id)
 *   sessions:       if any exist for (child, clinic) → recover IDs, skip insert
 *   notes:          per session_id (UNIQUE) — checked individually
 *   goals:          if any exist for (child, clinic) → recover map, skip insert
 *   goal links:     if any exist for child's sessions → skip all
 *   milestones:     if any exist for (child, clinic) → skip all
 *   activities:     if any exist for (child, clinic) → skip all
 *   documents:      if any exist for (child, clinic) → skip all
 *
 * Rich demo child per clinic:
 *   North → Sofia Reyes   (speech)  — 11 sessions, 6 goals, 3 milestones, 5 activities, 2 published summaries
 *   South → Paolo Villanueva (speech) — same story arc
 *
 * Usage:
 *   node scripts/seed-care-demo-data.mjs
 *
 * Required env vars (from .env.local):
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

// ─── Children roster ─────────────────────────────────────────────────────────

// isRich=true → full clinical story (11 sessions, 6 goals, 3 milestones, 5 activities, 2 published)
// isRich=false → standard story (6 sessions, 3 goals, 1-2 milestones, 2 activities)
const CHILDREN = {
  north: [
    { displayName: "Sofia Reyes",    dob: "2019-03-12", sex: "female", therapyType: "speech",       slotHour: "01", isRich: true,  parentEmail: "parent.north.01@lauris.demo", parentName: "Maria Reyes" },
    { displayName: "Marco Santos",   dob: "2018-11-05", sex: "male",   therapyType: "occupational",  slotHour: "02", isRich: false, parentEmail: "parent.north.02@lauris.demo", parentName: "Jose Santos" },
    { displayName: "Isabella Cruz",  dob: "2020-06-20", sex: "female", therapyType: "speech",       slotHour: "03", isRich: false, parentEmail: "parent.north.03@lauris.demo", parentName: "Ana Cruz" },
    { displayName: "Liam Garcia",    dob: "2019-09-01", sex: "male",   therapyType: "occupational",  slotHour: "04", isRich: false, parentEmail: "parent.north.04@lauris.demo", parentName: "Carlos Garcia" },
    { displayName: "Andrea Mendoza", dob: "2018-04-15", sex: "female", therapyType: "behavioral",   slotHour: "05", isRich: false, parentEmail: "parent.north.05@lauris.demo", parentName: "Rosa Mendoza" },
    { displayName: "Rafael Torres",  dob: "2020-01-30", sex: "male",   therapyType: "speech",       slotHour: "06", isRich: false, parentEmail: "parent.north.06@lauris.demo", parentName: "Elena Torres" },
  ],
  south: [
    { displayName: "Emma Lopez",       dob: "2019-07-22", sex: "female", therapyType: "occupational", slotHour: "01", isRich: false, parentEmail: "parent.south.01@lauris.demo", parentName: "Linda Lopez" },
    { displayName: "Diego Ramos",      dob: "2018-12-10", sex: "male",   therapyType: "speech",       slotHour: "02", isRich: false, parentEmail: "parent.south.02@lauris.demo", parentName: "Miguel Ramos" },
    { displayName: "Luna Bautista",    dob: "2019-05-03", sex: "female", therapyType: "behavioral",   slotHour: "03", isRich: false, parentEmail: "parent.south.03@lauris.demo", parentName: "Grace Bautista" },
    { displayName: "Paolo Villanueva", dob: "2018-08-17", sex: "male",   therapyType: "speech",       slotHour: "04", isRich: true,  parentEmail: "parent.south.04@lauris.demo", parentName: "Antonio Villanueva" },
    { displayName: "Mia Rivera",       dob: "2020-02-25", sex: "female", therapyType: "occupational", slotHour: "05", isRich: false, parentEmail: "parent.south.05@lauris.demo", parentName: "Carmen Rivera" },
  ],
};

// ─── Session schedules ────────────────────────────────────────────────────────

// noteSet: index into NOTE_POOLS[therapyType] (null = no note)
// parentVisible: whether to publish the parent note
// parentVisibleAt: ISO timestamp when published (only when parentVisible=true)
// noteStatus: 'completed' | 'draft'

function buildRichSchedule(slotHour) {
  const h = String(slotHour).padStart(2, "0");
  return [
    { date: `2026-02-03T${h}:00:00.000Z`, status: "completed", noteSet: 0, noteStatus: "completed", parentVisible: false },
    { date: `2026-02-17T${h}:00:00.000Z`, status: "completed", noteSet: 1, noteStatus: "completed", parentVisible: false },
    { date: `2026-03-03T${h}:00:00.000Z`, status: "completed", noteSet: 2, noteStatus: "completed", parentVisible: false },
    { date: `2026-03-17T${h}:00:00.000Z`, status: "no_show",   noteSet: null },
    { date: `2026-03-31T${h}:00:00.000Z`, status: "completed", noteSet: 3, noteStatus: "completed", parentVisible: true, parentVisibleAt: `2026-04-01T${h}:00:00.000Z` },
    { date: `2026-04-14T${h}:00:00.000Z`, status: "completed", noteSet: 4, noteStatus: "completed", parentVisible: true, parentVisibleAt: `2026-04-15T${h}:00:00.000Z` },
    { date: `2026-04-28T${h}:00:00.000Z`, status: "cancelled", noteSet: null },
    { date: `2026-05-05T${h}:00:00.000Z`, status: "completed", noteSet: 5, noteStatus: "draft",     parentVisible: false },
    { date: `2026-05-19T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
    { date: `2026-06-02T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
    { date: `2026-06-16T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
  ];
}

function buildRegularSchedule(slotHour, childIdx) {
  const h = String(slotHour).padStart(2, "0");
  const midStatus = childIdx % 4 === 3 ? "cancelled" : childIdx % 4 === 2 ? "no_show" : "completed";
  return [
    { date: `2026-04-07T${h}:00:00.000Z`, status: "completed", noteSet: 0, noteStatus: "completed", parentVisible: false },
    { date: `2026-04-21T${h}:00:00.000Z`, status: midStatus,   noteSet: midStatus === "completed" ? 1 : null, noteStatus: "completed", parentVisible: false },
    { date: `2026-05-05T${h}:00:00.000Z`, status: "completed", noteSet: 2, noteStatus: "draft",     parentVisible: false },
    { date: `2026-05-19T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
    { date: `2026-06-02T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
    { date: `2026-06-16T${h}:00:00.000Z`, status: "scheduled", noteSet: null },
  ];
}

// ─── Note content pools (care_session_notes fields) ───────────────────────────

const NOTE_POOLS = {
  speech: [
    {
      summary_text: "Targeted /s/ and /z/ articulation using minimal pair drills (sun/fun, zoo/boo) and story retell tasks. Oral motor warm-up completed. Child cooperative throughout.",
      key_behaviors: "Spontaneous self-correction of /s/ in 2 instances without clinician prompt. Maintained sustained attention for full 45-minute session. Mild distraction at minute 20 — redirected with visual cues.",
      progress_notes: "/s/ accuracy: 70% (14/20 trials) — up from 55% baseline. /z/ medial position inconsistent (40%). Pronoun 'I' used correctly in 8/10 spontaneous utterances. Trajectory on track for Q2 mastery.",
      parent_note: "Great session! Sofia worked hard on her 's' sounds today and reached 70% accuracy — up from 55% when we started. She even caught and corrected her own mistakes twice, which is a huge first! Keep practicing the 'snake words' list at home (10 words, twice a day with a mirror).",
    },
    {
      summary_text: "MLU expansion focus using play-based language with farm animal figures. Carrier phrase expansion: 'I see a ___', 'The ___ is ___'. Clinician modeled 3-word phrases; child imitated then produced spontaneously.",
      key_behaviors: "Produced 3-word phrases in 8/15 opportunities with light verbal prompt. Spontaneous 3-word utterances emerged twice during free play. Article 'the' omitted most of the time. High engagement throughout.",
      progress_notes: "MLU measured at 2.4 words (up from 2.1 last month). 'I' pronoun now used consistently. 3-word phrases: 8/15 with prompt, 2/15 spontaneous. Target: 12/15 by end of quarter.",
      parent_note: "We focused on helping build longer sentences today. She's putting together 3-word sentences more often — real progress! At dinner, try pausing mid-sentence: 'The dog is...' and wait for her to finish. Aim for 5 of these per mealtime.",
    },
    {
      summary_text: "Pragmatic language: turn-taking and topic maintenance. Barrier game, role-play at pretend restaurant, and deliberate off-topic comment practice to strengthen conversational repair.",
      key_behaviors: "Topic maintained for 4–5 exchanges — significant improvement from 2 at intake. Initiated 3 conversational repairs independently. Interrupted twice when excited. Eye contact during exchanges now consistent.",
      progress_notes: "Topic maintenance: 4–5 exchanges (goal: 5+). Conversational repairs: 3 independent initiations. Interruptions reduced. Pragmatic goals on trajectory for quarterly target.",
      parent_note: "Sofia is getting so much better at conversations! She kept a topic going for 4 or 5 back-and-forth exchanges today, which is double what she could do when she started. Try a 20-minute 'talk time' each evening — take turns asking questions and really listen before responding.",
    },
    {
      summary_text: "Phonological awareness: rhyme identification and initial sound segmentation using sorting cards, alliteration games, and CVC sound box tapping.",
      key_behaviors: "Rhyme identification: 9/12 correct (75%). Initial sound isolation: 7/10 with 2-second wait. Struggled with consonant blends (st-, pl-). Sustained attention for full 30-minute structured task — a first.",
      progress_notes: "Rhyme awareness emerging consistently. Single-consonant initial sounds solid. Blends and final sound isolation remain active targets. Full attention during phonological structured tasks: achieved milestone.",
      parent_note: "Sofia is learning to recognize rhymes and beginning sounds — the building blocks of reading! She got 75% on rhyme sorting today. Try 'I Spy Sounds' at home: 'I spy something that starts with the /m/ sound.' 5–10 minutes before bedtime reading is perfect.",
    },
    {
      summary_text: "Quarterly progress review: structured probe across all active goals, parent report review, achievement celebration, and introduction of next-quarter phoneme blending targets.",
      key_behaviors: "Viewed probe activities as 'the test game' — enthusiastic engagement throughout. Self-identified improvement in /s/ sounds. Spontaneous 3-word phrases used 4 times during free play. Concentration strong.",
      progress_notes: "Goal 1 (/s/ articulation): 78% — approaching 80% mastery. Goal 2 (MLU): 2.7 words — progressing well. Goal 5 ('I' pronoun): 90% — near mastery. /s/ blends goal: achieved (>90% over 3 sessions). Strong quarter.",
      parent_note: "Wonderful review session! Sofia's 's' sounds are at 78% — almost at the goal! Her sentences are getting longer, and her 's' blend words are fully mastered. Next quarter we'll start blending sounds together, which will support her reading readiness. She's working so hard and it shows!",
    },
    {
      summary_text: "Articulation carryover session: structured narration, picture description, and conversational practice embedding target phonemes in natural contexts. Beginning generalization phase.",
      key_behaviors: "Target sounds correct in 3/5 conversational opportunities without prompting — first signs of carryover. Topic maintenance extended to 6 exchanges (personal best). Volunteered to speak more frequently than prior sessions.",
      progress_notes: "Conversational carryover: 60% — first significant generalization beyond structured drills. Topic maintenance: 6 exchanges (personal best). Goal 1 trajectory on track for Q2 mastery. MLU in free play: 2.8 words.",
      parent_note: "Such a great session! Sofia is starting to use her speech skills in real conversations — not just during practice. She kept a topic going for 6 back-and-forth exchanges! Keep up the 'talk time' at home and the mirror practice — it's clearly working. We're almost at the goal!",
    },
  ],
  occupational: [
    {
      summary_text: "Pencil grasp and pre-writing strokes: theraputty warm-up, vertical chalkboard strokes with dynamic tripod cues, dot-to-dot worksheet, scissor cutting along wide straight lines.",
      key_behaviors: "Maintained dynamic tripod grip for 8 minutes before reverting to fist grasp. Completed 4/6 dot-to-dot lines within 0.5 cm accuracy. Scissors: full opening present but snip sequencing inconsistent. Cooperative throughout.",
      progress_notes: "Tripod grip duration: 8 minutes (up from 3 minutes). Diagonal strokes present but inconsistent direction. Scissor cutting baseline established. Pre-writing stroke accuracy: 4/6.",
      parent_note: "Marco worked so hard on his pencil skills today! He kept a proper grip for 8 whole minutes — huge improvement from 3 minutes last week. At home: 5 minutes of theraputty daily (squeeze 10, roll 10, pinch 10) and use a short golf pencil for drawing activities.",
    },
    {
      summary_text: "Bilateral coordination for dressing: button board (3 sizes), lacing card, zipper vest practice, and simulated dressing sequence with visual schedule support.",
      key_behaviors: "Large buttons: fully independent. Medium buttons: 60% with hand-over-hand guidance. Small buttons: refused after 2 attempts. Zipper: pulls up independently but needs help with starting tab. Tolerated all tasks without frustration.",
      progress_notes: "Large button mastery consistent across 3 sessions. Medium buttons emerging (60%). Small buttons remain a significant challenge. Zipper progress: pull-up independent. Bilateral coordination on trajectory.",
      parent_note: "We practiced dressing skills today — buttons and zippers! Marco can now do all large buttons completely on his own. For the jacket zipper, start the tab for him and let him pull it up the rest of the way. Practice 'Mr. Button Bear' each morning — large buttons only this week.",
    },
    {
      summary_text: "Sensory desensitization: Wilbarger brushing protocol, heavy work warm-up, graduated tactile exposure (beans → kinetic sand → shaving cream).",
      key_behaviors: "Accepted brushing with minor verbal protest — improvement from refusing last session. Tolerated bean bin for 4 minutes. Touched kinetic sand with fingertip. Refused shaving cream — no escalation.",
      progress_notes: "Tactile tolerance window widening. Beans now neutral (aversive 3 sessions ago). Dry textures consistently tolerated. Wet/sticky textures remain aversive. Refusal without escalation is itself a progress indicator.",
      parent_note: "Good session! Marco is getting more comfortable with different textures. He spent 4 minutes in the bean bin — real progress. Please continue the brushing at home twice daily (morning and before bed). Offer the lentil sensory bin for 5 minutes of free play — no pressure to touch, just exposure.",
    },
    {
      summary_text: "Visual motor integration: Beery VMI subtest (6 items), shape copying on vertical surface, geoboard pattern matching, and 9-piece puzzle.",
      key_behaviors: "VMI age equivalent: 4y2m (chronological 5y8m). Copied circle and cross accurately. Square corners rounded. Triangle not yet produced. 9-piece puzzle completed in 5 minutes with 1 verbal cue. Engaged and effortful.",
      progress_notes: "Circle mastered. Cross reproduction new since last formal assessment. Square corners emerging. VMI delay consistent with prior assessment — trajectory tracking as expected. Puzzle completion time improving.",
      parent_note: "We did shape copying work today. Marco can now draw circles and crosses really well! We're working on squares next — his corners are starting to appear. Shape tracing workbook at home (pages 8–15, circle and cross only). Magna-Tiles are great for shape awareness play!",
    },
    {
      summary_text: "Fine motor strengthening: pinch strengthening with theraputty, peg board activities, threading beads (large then medium), and finger isolation exercises.",
      key_behaviors: "Pinch strength: 3.5 kg (up from 2.8 kg). Completed 24/30 peg board pegs in 3 minutes. Threading: 6 large beads independently. Finger isolation: ring and pinky co-activate — intrinsic weakness noted.",
      progress_notes: "Pinch strength measurably improving. Peg board speed increasing. Bead threading emerging with large beads. Finger isolation remains a target. Overall fine motor trajectory on track.",
      parent_note: "Marco's hand strength is really improving! He's faster and more coordinated with small objects. Keep doing the theraputty squeezes at home daily. Let him try his own shirt buttons each morning — the practice really adds up over time.",
    },
    {
      summary_text: "School readiness focus: pencil grip carryover to writing tasks, fine motor speed on age-appropriate worksheet, and structured scissor cutting project.",
      key_behaviors: "Maintained tripod grip for 12 minutes on writing worksheet — new personal best. Completed worksheet with 80% within-line accuracy. Scissor cutting: sequenced 8 consecutive snips along a curved line. Self-regulated one break independently.",
      progress_notes: "Tripod grip duration: 12 minutes (goal: 15 minutes). Worksheet accuracy: 80%. Scissor sequencing emerging with curved lines. School readiness trajectory on track for current academic year goals.",
      parent_note: "Amazing session! Marco held his pencil correctly for 12 whole minutes and completed a full worksheet at 80% accuracy. He's nearly ready for the kind of writing his class will do next term. Keep up the daily theraputty and let him use a regular pencil now — the golf pencil served its purpose!",
    },
  ],
  behavioral: [
    {
      summary_text: "Transition management: visual schedule review, 5-minute sand timer introduction, 'finishing time' role-play with toy cleanup, and consistent transition verbal cue practice.",
      key_behaviors: "Transition tantrums: 2 (down from 5 last session). Accepted sand timer with verbal explanation. Initiated schedule check independently once. Required redirection during cleanup but completed within 3 minutes.",
      progress_notes: "Transition tantrums reduced significantly. Visual schedule functioning as reliable anchor. Sand timer accepted as concrete transition cue — major milestone. Target: 0 tantrums during structured session.",
      parent_note: "Andrea had such an impressive session! When it was time to switch activities, she only needed 2 reminders — down from 5 last week. Use a 5-minute timer before ALL transitions at home: screen off, mealtime, leaving the house. Pair it with: 'Timer is starting, 5 minutes until...'",
    },
    {
      summary_text: "Emotional identification: faces card matching, mirror play, storybook discussion ('How does this person feel?'), and feelings thermometer introduction.",
      key_behaviors: "Named happy, sad, angry correctly from cards (100%). Surprised and scared confused — accepted prompting. Mirror play elicited genuine affect. Storybook engagement: 15 minutes — longest concentration to date.",
      progress_notes: "Core emotion vocabulary (happy/sad/angry) solidifying. Nuanced emotions (surprised/scared) remain targets. Social referencing emerging spontaneously. Session engagement peak: 15 minutes — new record.",
      parent_note: "Andrea is learning to name her feelings — such an important skill! She got happy, sad, and angry right every time today. Tonight at bedtime, try a feelings check-in: 'What was your happiest part of today? Was there anything that felt sad or angry?' Keep it relaxed and brief.",
    },
    {
      summary_text: "On-task behavior using token economy: counting worksheet (non-preferred), token board (5 tokens = 5-min preferred break), errorless learning format, cool-down corner introduction.",
      key_behaviors: "On-task for 7 minutes sustained (up from 4 minutes). Earned 2 full token boards. 1 prompt to return to task post-break. Did not require cool-down corner today. Token economy clearly motivating.",
      progress_notes: "On-task duration: 7 minutes (goal: 10 minutes). Token economy internalized — reached for board independently to count. Break transitions smooth with timer. Trajectory on track.",
      parent_note: "Great focus today! Andrea stayed on task for 7 whole minutes — almost at our 10-minute goal. The reward system is really working for her. Set up a token board for homework time: 5 minutes on task = 1 token. 3 tokens = 10 minutes of free choice. Keep the chart visible and consistent!",
    },
    {
      summary_text: "Frustration tolerance: 'stop and breathe' coping strategy. Dragon breathing practice, intentional frustration scenario (block tower), body signal identification, coping card creation.",
      key_behaviors: "Completed dragon breathing independently after block tower knocked over — first independent coping strategy use. Named 'tight tummy' as frustration signal. Created coping card with 3 strategies. Frustration episodes in session: 1 (down from 4 at intake).",
      progress_notes: "Independent strategy use: achieved — significant breakthrough. Body signal identification: 'tight tummy' named today. Frustration episodes: 1 (from 4 at intake). Coping card created — home reinforcement planned.",
      parent_note: "Incredible session! Andrea used her calming strategy completely on her own today — we knocked a block tower over on purpose and she stopped, breathed, and moved on without a big reaction. Post the coping card on the fridge at her eye level. When you see frustration: 'I notice your tummy feels tight. Want to try dragon breathing?' Offer, don't demand.",
    },
    {
      summary_text: "Social skills: sharing, cooperative play, and asking for help. Board game with turn-taking rules, cooperative block building, and 'asking for help' script practice.",
      key_behaviors: "Shared game pieces with minimal prompting on 4/5 opportunities. Cooperative block building: 3-minute task completed. 'Asking for help' script used once spontaneously. Positive affect maintained throughout. One rule-rigidity episode resolved independently.",
      progress_notes: "Sharing behaviors improving in structured context. Cooperative play emerging — 3-minute sustained cooperation. Asking for help partially generalized. Rule rigidity de-escalated independently. Social goals on trajectory.",
      parent_note: "Andrea played really nicely today — she shared her game pieces and asked for help by herself once! At home: play simple board games together (Snakes and Ladders, Memory). When she's stuck, prompt: 'What can you do when something is hard?' and give her time to try the asking-for-help script.",
    },
    {
      summary_text: "Progress consolidation: structured probe of all active goals, parent report review, skill generalization discussion, and introduction of peer interaction targets for next quarter.",
      key_behaviors: "Demonstrated all active coping strategies on request — confidence visible. Zero transition tantrums during session. Named all 5 target emotions correctly. On-task: 9 minutes (new personal best). Positive affect throughout.",
      progress_notes: "Transition goal: nearing mastery (1 incident/session target met for 3 consecutive sessions). Emotion vocabulary: 5/5 core emotions identified. On-task duration: 9 minutes (goal 10 — nearly there). Strong overall quarter. Peer interaction goals introduced.",
      parent_note: "What a wonderful review session! Andrea named all her feelings correctly, managed every transition smoothly, and stayed focused for almost 10 minutes. She's come so far! Next quarter we'll start working on playing and talking with other kids, which will support her in school and at home.",
    },
  ],
  other: [
    {
      summary_text: "Initial assessment and rapport-building. Structured play observation, parent developmental interview, standardized screening items, and free play to observe spontaneous behavior.",
      key_behaviors: "Cooperative throughout assessment. Increasing comfort with clinician over 50-minute session — cautious initially, relaxed by end. Strong visual memory during form board. Parallel play observed with clinician.",
      progress_notes: "Baseline established. Strengths: receptive language, visual memory, sustained attention for preferred tasks. Development areas: expressive language, fine motor, peer interaction. Goal setting scheduled for next session.",
      parent_note: "We had a wonderful first session! We spent time getting to know each other and doing activities to understand where to focus our work. Your child did great — they warmed up beautifully by the end. We'll share a full summary and set goals together next week.",
    },
    {
      summary_text: "Collaborative goal-setting with family and child. Priority ranking, therapy approach explanation, home program introduction, first home activity assigned.",
      key_behaviors: "Child participated in goal selection — chose own goal ('talk better'). Engaged during family conversation while coloring. Accepted goal board enthusiastically. Parent confident with first home task after demonstration.",
      progress_notes: "Family alignment on top 3 goals achieved. Home program introduced. Parent confident in first home task. Child shows intrinsic motivation — strong prognostic indicator.",
      parent_note: "Our goal-setting session went so well! Your child picked their very own goal and we all agreed on what we'll work on together. You're set with the first home activity. Keep the therapy notebook handy to write down observations and questions for me between sessions.",
    },
    {
      summary_text: "Quarterly progress review: probe of all active goals, parent report review, achievement celebration, introduction of next-quarter targets.",
      key_behaviors: "Viewed probe activities as 'the test game' — enthusiastic engagement. Self-identified improvements. Asked 'what's next?' — strong intrinsic motivation. All probe items completed with full effort.",
      progress_notes: "2 of 4 quarterly goals met mastery criteria. 1 goal progressing on trajectory. 1 goal criteria revised — original targets too stringent given baseline. Strong overall quarter.",
      parent_note: "What a great review session! Two goals have been officially met — celebrate at home tonight! The other goals are coming along well. We've adjusted one goal to better match progress, and next quarter we start some exciting new targets. Your support at home is making a real difference.",
    },
  ],
};

// ─── Goal sets per therapy type ───────────────────────────────────────────────

// For rich children: all 6 goals (including 1 achieved)
// For regular children: first 3 only (no achieved goal)

const GOAL_SETS = {
  speech: [
    { title: "Articulate /s/ and /z/ sounds correctly in 80% of conversational speech", description: "Using structured drills and conversational practice to achieve phoneme accuracy in natural speech contexts.", therapyType: "speech", status: "on_track",    progressPercent: 72 },
    { title: "Expand mean length of utterance to 4-word phrases consistently",           description: "Increasing phrase complexity through carrier phrase expansion and play-based language.", therapyType: "speech",   status: "progressing", progressPercent: 55 },
    { title: "Maintain conversational topic for 5+ consecutive exchanges",               description: "Developing pragmatic skills for sustained, purposeful conversational interaction.", therapyType: "speech",       status: "active",      progressPercent: 40 },
    { title: "Identify and segment initial sounds in spoken CVC words independently",    description: "Building phonological awareness as a foundation for literacy readiness.", therapyType: "speech",               status: "needs_focus", progressPercent: 28 },
    { title: "Use 'I' pronoun consistently in spontaneous speech",                        description: "Establishing correct pronoun use to support language and social communication.", therapyType: "general",        status: "on_track",    progressPercent: 85 },
    { title: "Produce /s/ blend words correctly in structured tasks",                    description: "Articulation of consonant blends beginning with /s/ (sl-, st-, sp-, sn-).", therapyType: "speech",            status: "achieved",    progressPercent: 100, achievedAt: "2026-04-15T00:00:00Z" },
  ],
  occupational: [
    { title: "Maintain dynamic tripod pencil grip for 15-minute writing tasks",    description: "Developing functional pencil grasp to support handwriting and school readiness.", therapyType: "occupational", status: "on_track",    progressPercent: 70 },
    { title: "Fasten medium-sized buttons independently within 2 minutes",         description: "Building bilateral coordination and fine motor precision for dressing independence.", therapyType: "occupational", status: "progressing", progressPercent: 55 },
    { title: "Copy basic geometric shapes (circle, cross, square) accurately",     description: "Developing visual motor integration for pre-writing and academic readiness.", therapyType: "occupational",         status: "active",      progressPercent: 45 },
    { title: "Tolerate varied textures during daily activities without protest",   description: "Reducing tactile defensiveness to improve participation in self-care and play.", therapyType: "occupational",     status: "needs_focus", progressPercent: 32 },
    { title: "Complete bilateral coordination tasks with minimal assistance",      description: "Improving use of both hands together for dressing, lacing, and classroom tasks.", therapyType: "occupational",  status: "progressing", progressPercent: 60 },
    { title: "Maintain dynamic tripod grip for 5-minute tasks consistently",       description: "Foundation grip goal — prerequisite for extended writing endurance.", therapyType: "occupational",               status: "achieved",    progressPercent: 100, achievedAt: "2026-03-15T00:00:00Z" },
  ],
  behavioral: [
    { title: "Transition between activities with ≤1 protest behavior per session",   description: "Using visual schedules and timer cues to support smooth activity transitions.", therapyType: "behavioral", status: "on_track",    progressPercent: 75 },
    { title: "Identify and label 5 core emotions in self and others",                description: "Developing emotional vocabulary and social-emotional awareness.", therapyType: "behavioral",                    status: "progressing", progressPercent: 60 },
    { title: "Sustain on-task behavior during non-preferred activities for 10 min",  description: "Building attentional regulation using token economy and errorless learning.", therapyType: "behavioral",   status: "active",      progressPercent: 45 },
    { title: "Apply 'stop and breathe' coping strategy independently when frustrated", description: "Developing self-regulation for frustration management without adult prompt.", therapyType: "behavioral",  status: "on_track",    progressPercent: 70 },
    { title: "Follow 2-step instructions without redirection during structured tasks", description: "Improving compliance and attention to verbal instruction in clinic and home.", therapyType: "behavioral",  status: "progressing", progressPercent: 50 },
    { title: "Accept 'finished' signal for preferred activities without escalating",  description: "Using visual and auditory cues to end preferred activities without escalation.", therapyType: "behavioral", status: "achieved",    progressPercent: 100, achievedAt: "2026-04-10T00:00:00Z" },
  ],
  other: [
    { title: "Participate in all therapy activities cooperatively for full session",  description: "Establishing therapeutic rapport and engagement baseline.", therapyType: "general", status: "on_track",    progressPercent: 85 },
    { title: "Demonstrate age-appropriate self-care and daily living skills",         description: "Addressing functional daily activities relevant to school and home.", therapyType: "general",    status: "progressing", progressPercent: 50 },
  ],
};

// ─── Milestone definitions ────────────────────────────────────────────────────

// goalIdx: index into goalTitles array (null = no goal link)
// sessionIdx: index into completedSessionIds array (null = no session link)

const RICH_MILESTONES = {
  speech: [
    { title: "First spontaneous self-correction of /s/ sound", description: "Sofia corrected her own /s/ production during free conversation — no prompt from therapist. A significant indicator of phonological awareness growth.", type: "breakthrough", goalIdx: 0, sessionIdx: 1, date: "2026-02-17" },
    { title: "Sustained conversation topic for 6 exchanges",   description: "During barrier game, Sofia maintained the same topic for 6 back-and-forth turns — doubling her personal best and meeting the milestone threshold.", type: "skill",        goalIdx: 2, sessionIdx: 4, date: "2026-04-14" },
    { title: "Mastered /s/ blend words in structured tasks",   description: "Sofia achieved 90%+ accuracy on /s/ blend words (sl-, st-, sp-) across three sessions — goal formally marked as achieved.", type: "skill", goalIdx: 5, sessionIdx: null, date: "2026-04-15" },
  ],
  occupational: [
    { title: "First fully independent large button fastening",    description: "Marco independently fastened all 4 large buttons on the practice vest with no assistance or verbal cue — mastery criterion met.", type: "skill",        goalIdx: 5, sessionIdx: 1, date: "2026-04-21" },
    { title: "Maintained tripod grip for 10 continuous minutes",  description: "During a coloring task, Marco held dynamic tripod grip for 10 continuous minutes — a new personal best and double his previous record.", type: "breakthrough", goalIdx: 0, sessionIdx: 4, date: "2026-04-14" },
    { title: "Completed zipper pull independently",               description: "With starting tab pre-aligned by parent, Marco pulled the zipper from bottom to top independently — first full independent completion.", type: "skill", goalIdx: 4, sessionIdx: null, date: "2026-04-20" },
  ],
  behavioral: [
    { title: "First independent use of 'stop and breathe'",      description: "During an intentional frustration scenario, Andrea stopped, breathed, and moved on without escalating — completely unprompted. Huge milestone.", type: "breakthrough", goalIdx: 3, sessionIdx: 3, date: "2026-03-31" },
    { title: "Zero transition tantrums in a full session",        description: "Andrea completed an entire session with zero transition tantrums for the first time — all 4 activity changes smooth with only the visual timer.", type: "behavior",     goalIdx: 0, sessionIdx: 4, date: "2026-04-14" },
    { title: "Correctly identified 'surprised' emotion",          description: "Andrea correctly identified 'surprised' from a picture card and described a personal experience — nuanced emotion vocabulary emerging.", type: "skill",  goalIdx: 1, sessionIdx: null, date: "2026-04-22" },
  ],
  other: [
    { title: "Completed first full session without breaks",       description: "Engaged in all planned activities for the full session duration without an unscheduled break — therapeutic endurance established.", type: "behavior",     goalIdx: 0, sessionIdx: 1, date: "2026-04-21" },
    { title: "Initiated interaction with clinician spontaneously", description: "Without any prompt, child initiated a conversation topic from home life — strong indicator of trust, comfort, and communication growth.", type: "breakthrough", goalIdx: 0, sessionIdx: 2, date: "2026-05-05" },
    { title: "Met two quarterly goals ahead of schedule",          description: "Two of four quarterly goals reached mastery criteria during formal review — strong therapeutic trajectory.", type: "skill", goalIdx: 1, sessionIdx: null, date: "2026-05-01" },
  ],
};

const REGULAR_MILESTONES = {
  speech:       [{ title: "Produced target sounds correctly across 3 consecutive sessions", description: "Consistent articulation accuracy maintained across three sessions — generalization emerging.", type: "skill",     goalIdx: 0, sessionIdx: null, date: "2026-05-05" }],
  occupational: [{ title: "Completed full dressing sequence with visual schedule",          description: "Using visual schedule, completed shirt, pants, and shoes independently.", type: "skill",                          goalIdx: 1, sessionIdx: null, date: "2026-05-05" }],
  behavioral:   [{ title: "First smooth transition with timer cue only",                    description: "Completed activity transition with only the sand timer — no additional verbal prompting needed.", type: "behavior", goalIdx: 0, sessionIdx: 1,    date: "2026-04-21" }],
  other:        [{ title: "Engaged cooperatively for full session",                         description: "Participated in all planned activities without requiring a break — engagement solidifying.", type: "skill",         goalIdx: 0, sessionIdx: 1,    date: "2026-04-21" }],
};

// ─── Home activity definitions ────────────────────────────────────────────────

// goalIdx: index into goalTitles (null = no goal link)
// status: 'assigned' | 'in_progress' | 'completed' | 'skipped'

const RICH_ACTIVITIES = {
  speech: [
    { title: "'Snake words' mirror practice", description: "Daily articulation practice using target /s/ words", instructions: "Stand in front of a mirror and say each word on the list clearly. Watch your tongue tip touch behind your teeth for /s/. Do 10 words, twice a day.", frequency: "Twice daily", goalIdx: 0, status: "in_progress", dueDate: "2026-06-02" },
    { title: "'I Spy Sounds' bedtime game",   description: "Phonological awareness through playful sound identification", instructions: "Before lights out, take turns: 'I spy something that starts with the /m/ sound.' Aim for 5–10 rounds using objects in the room.", frequency: "Nightly", goalIdx: 3, status: "assigned", dueDate: "2026-06-16" },
    { title: "Dinner-time phrase expansion pause", description: "MLU expansion through structured mealtime interaction", instructions: "During one meal daily, narrate and pause: 'The chicken is ___' or 'Sofia is eating ___.' Wait 5 seconds for her to complete. Aim for 5 per meal.", frequency: "Daily at dinner", goalIdx: 1, status: "assigned", dueDate: "2026-06-02" },
    { title: "20-minute 'talk time' after school", description: "Pragmatic skills practice through structured conversation", instructions: "Set a 20-minute timer. Take turns asking each other 2 questions and listen fully before responding. If topic shifts, gently guide back.", frequency: "Daily", goalIdx: 2, status: "assigned", dueDate: "2026-06-16" },
    { title: "Picture book narration activity", description: "Combined language and phonological awareness", instructions: "Read one picture book together. For each page, child points to 2 items and says: 'I see a ___.' Emphasize /s/ words naturally.", frequency: "3x per week", goalIdx: 0, status: "completed", dueDate: null, completedNote: "Completed successfully over 3 weeks — child now spontaneously names pictures independently." },
  ],
  occupational: [
    { title: "Daily theraputty hand strengthening",   description: "Finger strengthening for pencil grip endurance", instructions: "5 minutes daily: squeeze 10 times, roll 10 snakes, pinch 10 pea shapes. Use the blue medium-resistance putty.", frequency: "Daily", goalIdx: 0, status: "in_progress", dueDate: "2026-06-02" },
    { title: "Mr. Button Bear morning routine",       description: "Bilateral coordination through daily dressing practice", instructions: "Each morning, practice all large buttons on Mr. Button Bear before putting on own clothes. Make it the first thing after waking up.", frequency: "Daily mornings", goalIdx: 1, status: "in_progress", dueDate: "2026-06-02" },
    { title: "Shape tracing workbook",                description: "Visual motor integration practice", instructions: "Complete 1 page from the workbook (pages 8–15, circle and cross only). Use a golf pencil. Focus on staying on the line, not speed.", frequency: "3x per week", goalIdx: 2, status: "assigned", dueDate: "2026-06-16" },
    { title: "Sensory bin free play",                 description: "Tactile desensitization through unstructured exposure", instructions: "Set out the lentil bin for 5 minutes. No pressure to touch — just having it nearby is the first step. Praise any voluntary contact.", frequency: "Daily", goalIdx: 3, status: "assigned", dueDate: "2026-06-02" },
    { title: "Jacket zipper practice",                description: "Self-care dressing independence", instructions: "Parent aligns the zipper tab, then Marco pulls up independently. Do this every time — don't zip it for him. Praise every attempt.", frequency: "Every time jacket is worn", goalIdx: 4, status: "assigned", dueDate: null },
  ],
  behavioral: [
    { title: "5-minute sand timer for all transitions", description: "Visual transition support for home use", instructions: "Use a 5-minute timer before ALL transitions: screen off, mealtime, leaving house, bedtime. Say: 'Timer is starting, 5 minutes until ___.' When it runs out, the activity ends.", frequency: "Before every transition", goalIdx: 0, status: "in_progress", dueDate: null },
    { title: "Bedtime feelings check-in",              description: "Emotional vocabulary through daily practice", instructions: "At bedtime, ask: 'What was your happiest moment today? Was there anything that felt sad or angry?' Keep it 2 minutes — relaxed and non-pressured.", frequency: "Nightly", goalIdx: 1, status: "assigned", dueDate: "2026-06-16" },
    { title: "Token board for homework time",          description: "On-task behavior support for academic activities", instructions: "Every 5 minutes on task = 1 token. 3 tokens = 10 minutes free choice. Keep chart visible. Reset daily. Be consistent!", frequency: "Daily during homework", goalIdx: 2, status: "in_progress", dueDate: null },
    { title: "Coping card display and practice",       description: "Frustration tolerance — reinforcing coping strategy", instructions: "Post Andrea's coping card on the fridge at her eye level. When frustration signals appear, say: 'I see you might feel frustrated. Want to try dragon breathing?' Offer — don't demand.", frequency: "As needed", goalIdx: 3, status: "assigned", dueDate: null },
    { title: "Board games evening routine",            description: "Social skills practice through cooperative play", instructions: "Play 15 minutes of a simple board game 3x per week (Snakes and Ladders, Memory). Let her win sometimes but not always. Practice taking turns and accepting outcomes.", frequency: "3x per week", goalIdx: 1, status: "assigned", dueDate: "2026-06-16" },
  ],
  other: [
    { title: "Therapy notebook observations",  description: "Parent observation record for generalization tracking", instructions: "Keep the therapy notebook on the kitchen counter. Jot down 1–2 observations daily: skills noticed, challenges, questions for next session.", frequency: "Daily", goalIdx: 0, status: "in_progress", dueDate: null },
    { title: "'My Goals' page completion",     description: "Child engagement with therapy goals", instructions: "Complete the 'My Goals' page in the home program booklet together. Let child choose stickers. Display it somewhere visible.", frequency: "Once", goalIdx: 1, status: "completed", dueDate: null, completedNote: "Completed and displayed on child's bedroom door." },
    { title: "Maintenance home program",       description: "Skill generalization after goal achievement", instructions: "Continue home program activities independently. Check in on skills monthly. Contact clinic if regression observed.", frequency: "As needed", goalIdx: 0, status: "assigned", dueDate: null },
  ],
};

const REGULAR_ACTIVITIES = {
  speech:       [
    { title: "'Snake words' mirror practice", instructions: "Practice 10 target words twice daily in front of a mirror.", frequency: "Twice daily", goalIdx: 0, status: "assigned", dueDate: "2026-06-02" },
    { title: "Mealtime phrase expansion",     instructions: "At one meal daily, pause mid-sentence and wait 5 seconds for child to complete.", frequency: "Daily", goalIdx: 1, status: "assigned", dueDate: "2026-06-16" },
  ],
  occupational: [
    { title: "Daily theraputty hand strengthening", instructions: "5 minutes of theraputty exercises daily: squeeze, roll, pinch.", frequency: "Daily", goalIdx: 0, status: "assigned", dueDate: "2026-06-02" },
    { title: "Dressing practice morning routine",   instructions: "Allow child to attempt own buttons and zipper each morning before assisting.", frequency: "Daily mornings", goalIdx: 1, status: "assigned", dueDate: "2026-06-16" },
  ],
  behavioral:   [
    { title: "Transition timer routine",    instructions: "Use a 5-minute timer before transitions. Pair with consistent verbal cue.", frequency: "Before every transition", goalIdx: 0, status: "assigned", dueDate: null },
    { title: "Feelings check-in at bedtime", instructions: "Brief bedtime check-in: what felt good today? Any big feelings?", frequency: "Nightly", goalIdx: 1, status: "assigned", dueDate: "2026-06-16" },
  ],
  other:        [
    { title: "Therapy notebook observations", instructions: "Note 1–2 observations daily and bring to sessions.", frequency: "Daily", goalIdx: 0, status: "assigned", dueDate: null },
    { title: "Goal board review",             instructions: "Review the goal board together once a week.", frequency: "Weekly", goalIdx: 0, status: "assigned", dueDate: null },
  ],
};

// ─── Clinic document definitions ──────────────────────────────────────────────

const DOCUMENTS = {
  "Sofia Reyes":       [
    { title: "Initial Speech-Language Assessment", kind: "initial assessment", allowDownload: true,  status: "active" },
    { title: "Speech Therapy Plan — Q2 2026",      kind: "therapy plan",       allowDownload: false, status: "active" },
  ],
  "Andrea Mendoza":    [{ title: "Behavioral Support Plan — 2026", kind: "behavioral support plan", allowDownload: false, status: "active" }],
  "Diego Ramos":       [{ title: "Initial Speech-Language Assessment", kind: "initial assessment", allowDownload: true, status: "active" }],
  "Paolo Villanueva":  [
    { title: "Monthly Progress Note — April 2026", kind: "progress note", allowDownload: true,  status: "active" },
    { title: "Speech Therapy Plan — Q2 2026",      kind: "therapy plan",  allowDownload: false, status: "active" },
  ],
};

// ─── Goal link patterns ────────────────────────────────────────────────────────

// Which goal indices to link (and by how many % points) for each completed session
const LINK_PATTERNS = [
  { goalIndices: [0, 4], deltas: [10, 5] },
  { goalIndices: [0, 1], deltas: [8, 10] },
  { goalIndices: [2, 3], deltas: [8,  5] },
  { goalIndices: [1, 4], deltas: [8,  8] },
  { goalIndices: [0, 2], deltas: [10, 10] },
  { goalIndices: [0, 1, 2], deltas: [5, 8, 5] },
  { goalIndices: [0, 3], deltas: [10, 7] },
  { goalIndices: [1, 2], deltas: [8,  6] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findAuthUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).find((u) => u.email === email) ?? null;
}

async function ensureParentAuthUser(email, fullName) {
  let userId;
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password: PARENT_PASSWORD, user_metadata: { full_name: fullName } });
    console.log(`  ↩  parent exists: ${email}`);
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PARENT_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message}`);
    console.log(`  ✓  created parent: ${email}`);
    userId = data.user.id;
  }
  // Ensure profiles.role = 'parent' so the Care portal recognises them
  await admin.from("profiles").upsert({ id: userId, role: "parent", full_name: fullName, email }, { onConflict: "id" });

  // Remove any org memberships for parent accounts — parents must never appear
  // as clinic staff. If a stale membership exists, the Care navbar shows the
  // wrong role badge for everyone because CareContext returns the first active
  // membership it finds.
  const { error: omErr } = await admin.from("organization_memberships").delete().eq("profile_id", userId);
  if (omErr) console.warn(`    ⚠  org_memberships cleanup(${email}): ${omErr.message}`);

  return userId;
}

async function ensureFamilyMember(orgId, childId, parentProfileId) {
  const { data: existing } = await admin.from("care_family_members").select("id").eq("profile_id", parentProfileId).eq("child_profile_id", childId).maybeSingle();
  if (existing) return;
  const { error } = await admin.from("care_family_members").insert({ profile_id: parentProfileId, child_profile_id: childId, clinic_organization_id: orgId, relationship: "parent" });
  if (error) console.warn(`    ⚠  care_family_members insert: ${error.message}`);
}

async function getClinicOrgByName(name) {
  const { data, error } = await admin.from("organizations").select("id,name").eq("name", name).eq("kind", "clinic").maybeSingle();
  if (error) throw new Error(`getClinicOrg("${name}"): ${error.message}`);
  if (!data) throw new Error(`Clinic org "${name}" not found — run seed-care-demo-logins.mjs first`);
  return data;
}

async function getProfileByEmail(email) {
  const { data, error } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (error) throw new Error(`getProfile(${email}): ${error.message}`);
  if (!data) throw new Error(`Profile for ${email} not found — run seed-care-demo-logins.mjs first`);
  return data.id;
}

async function findOwnedChildByName(orgId, displayName) {
  const { data } = await admin.from("child_profiles").select("id").eq("origin_organization_id", orgId).eq("display_name", displayName).maybeSingle();
  return data?.id ?? null;
}

async function ensureChild(orgId, childDef) {
  const existing = await findOwnedChildByName(orgId, childDef.displayName);
  if (existing) { console.log(`  ↩  child exists: ${childDef.displayName}`); return existing; }
  const childId = randomUUID();
  const { error: cpErr } = await admin.from("child_profiles").insert({ id: childId, display_name: childDef.displayName, date_of_birth: childDef.dob, sex_at_birth: childDef.sex, country_code: "PH", origin_organization_id: orgId, created_in_app: "lauris_care" });
  if (cpErr) throw new Error(`insert child_profiles(${childDef.displayName}): ${cpErr.message}`);
  const { error: cpmErr } = await admin.from("child_profile_memberships").insert({ child_profile_id: childId, organization_id: orgId, relationship_kind: "clinic_client", status: "active", started_at: new Date().toISOString().slice(0, 10) });
  if (cpmErr) { await admin.from("child_profiles").delete().eq("id", childId); throw new Error(`insert membership(${childDef.displayName}): ${cpmErr.message}`); }
  console.log(`  ✓  child created: ${childDef.displayName}`);
  return childId;
}

// ─── Goal seeding ─────────────────────────────────────────────────────────────

async function ensureGoals(orgId, childId, goalDefs, therapistId) {
  const { data: existing, error } = await admin.from("care_goals").select("id,title").eq("clinic_organization_id", orgId).eq("child_profile_id", childId);
  if (error) throw new Error(`fetch care_goals: ${error.message}`);
  if (existing && existing.length > 0) {
    console.log(`    ↩  ${existing.length} goals already exist`);
    const map = {};
    for (const g of existing) map[g.title] = g.id;
    return map;
  }
  const goalIds = {};
  for (const def of goalDefs) {
    const goalId = randomUUID();
    const { error: gErr } = await admin.from("care_goals").insert({
      id: goalId,
      clinic_organization_id: orgId,
      child_profile_id: childId,
      title: def.title,
      description: def.description ?? null,
      therapy_type: def.therapyType ?? null,
      status: def.status ?? "active",
      progress_percent: def.progressPercent ?? 0,
      target_date: null,
      achieved_at: def.achievedAt ?? null,
      created_by_profile_id: therapistId,
    });
    if (gErr) throw new Error(`insert care_goals("${def.title}"): ${gErr.message}`);
    goalIds[def.title] = goalId;
  }
  console.log(`    ✓  ${goalDefs.length} goals seeded`);
  return goalIds;
}

// ─── Session seeding ──────────────────────────────────────────────────────────

// Returns { completedSessions: [{id, noteSet, parentVisible, parentVisibleAt, noteStatus}] }
async function ensureSessions(orgId, childId, therapistId, adminId, childDef, childIdx) {
  const { data: existing } = await admin.from("therapy_sessions").select("id,status,scheduled_at").eq("clinic_organization_id", orgId).eq("child_profile_id", childId).order("scheduled_at", { ascending: true });
  if (existing && existing.length > 0) {
    console.log(`    ↩  ${existing.length} sessions already exist`);
    return {
      completedSessions: existing
        .map((s, i) => ({ id: s.id, noteSet: i, parentVisible: false, parentVisibleAt: null, noteStatus: "completed" }))
        .filter((_, i) => existing[i].status === "completed"),
    };
  }

  const schedule = childDef.isRich ? buildRichSchedule(childDef.slotHour) : buildRegularSchedule(childDef.slotHour, childIdx);
  const completedSessions = [];

  for (const slot of schedule) {
    const sessionId = randomUUID();
    const { error } = await admin.from("therapy_sessions").insert({
      id: sessionId,
      clinic_organization_id: orgId,
      child_profile_id: childId,
      therapist_profile_id: therapistId,
      therapy_type: childDef.therapyType,
      scheduled_at: slot.date,
      duration_minutes: 50,
      status: slot.status,
      created_by_profile_id: adminId,
    });
    if (error) throw new Error(`insert therapy_sessions(${childDef.displayName} ${slot.date}): ${error.message}`);
    if (slot.status === "completed") {
      completedSessions.push({ id: sessionId, noteSet: slot.noteSet, parentVisible: slot.parentVisible ?? false, parentVisibleAt: slot.parentVisibleAt ?? null, noteStatus: slot.noteStatus ?? "completed" });
    }
  }

  const totals = { completed: schedule.filter(s => s.status === "completed").length, scheduled: schedule.filter(s => s.status === "scheduled").length };
  console.log(`    ✓  ${schedule.length} sessions (${totals.completed} completed, ${totals.scheduled} upcoming)`);
  return { completedSessions };
}

// ─── Note seeding ─────────────────────────────────────────────────────────────

async function ensureCareNotes(orgId, childId, therapistId, completedSessions, therapyType) {
  const pool = NOTE_POOLS[therapyType] ?? NOTE_POOLS.other;
  let seeded = 0;
  let skipped = 0;
  for (const s of completedSessions) {
    if (s.noteSet === null || s.noteSet === undefined) continue;
    const { data: existing } = await admin.from("care_session_notes").select("id").eq("session_id", s.id).maybeSingle();
    if (existing) { skipped++; continue; }
    const content = pool[s.noteSet % pool.length];
    const { error } = await admin.from("care_session_notes").insert({
      id: randomUUID(),
      session_id: s.id,
      clinic_organization_id: orgId,
      child_profile_id: childId,
      therapist_profile_id: therapistId,
      status: s.noteStatus ?? "completed",
      summary_text: content.summary_text,
      key_behaviors: content.key_behaviors,
      progress_notes: content.progress_notes,
      parent_note: content.parent_note,
      parent_visible: s.parentVisible ?? false,
      parent_visible_at: s.parentVisibleAt ?? null,
    });
    if (error) throw new Error(`insert care_session_notes (session ${s.id.slice(0, 8)}): ${error.message}`);
    seeded++;
  }
  if (skipped > 0) console.log(`    ↩  ${skipped} notes already exist`);
  if (seeded > 0) {
    const published = completedSessions.filter(s => s.parentVisible).length;
    console.log(`    ✓  ${seeded} notes seeded (${published} parent-visible)`);
  }
}

// ─── Goal link seeding ────────────────────────────────────────────────────────

async function ensureGoalLinks(orgId, completedSessions, goalIds) {
  if (!completedSessions.length || !Object.keys(goalIds).length) return;
  const sessionIds = completedSessions.map(s => s.id);
  const { data: existing } = await admin.from("care_session_goal_links").select("id").eq("clinic_organization_id", orgId).in("session_id", sessionIds).limit(1);
  if (existing && existing.length > 0) { console.log(`    ↩  goal links already exist`); return; }

  const goalTitles = Object.keys(goalIds);
  let linked = 0;

  for (let i = 0; i < completedSessions.length; i++) {
    const session = completedSessions[i];
    const pattern = LINK_PATTERNS[i % LINK_PATTERNS.length];
    for (let j = 0; j < pattern.goalIndices.length; j++) {
      const goalIdx = pattern.goalIndices[j];
      if (goalIdx >= goalTitles.length) continue;
      const goalId = goalIds[goalTitles[goalIdx]];
      if (!goalId) continue;
      const { error } = await admin.from("care_session_goal_links").insert({
        id: randomUUID(),
        session_id: session.id,
        goal_id: goalId,
        clinic_organization_id: orgId,
        progress_delta: pattern.deltas[j] ?? 5,
        note: `Progress noted during session ${i + 1}`,
      });
      if (error && !error.message.includes("duplicate") && !error.code?.includes("23505")) {
        throw new Error(`insert care_session_goal_links: ${error.message}`);
      }
      linked++;
    }
  }
  if (linked > 0) console.log(`    ✓  ${linked} goal links seeded`);
}

// ─── Milestone seeding ────────────────────────────────────────────────────────

async function ensureMilestones(orgId, childId, therapistId, milestoneDefs, completedSessionIds, goalIds) {
  const { data: existing } = await admin.from("care_milestones").select("id").eq("clinic_organization_id", orgId).eq("child_profile_id", childId).limit(1);
  if (existing && existing.length > 0) { console.log(`    ↩  milestones already exist`); return; }

  const goalTitles = Object.keys(goalIds);
  let seeded = 0;
  for (const def of milestoneDefs) {
    const sessionId = (def.sessionIdx !== null && def.sessionIdx !== undefined && def.sessionIdx < completedSessionIds.length) ? completedSessionIds[def.sessionIdx] : null;
    const goalId = (def.goalIdx !== null && def.goalIdx !== undefined && def.goalIdx < goalTitles.length) ? goalIds[goalTitles[def.goalIdx]] : null;
    const { error } = await admin.from("care_milestones").insert({
      id: randomUUID(),
      clinic_organization_id: orgId,
      child_profile_id: childId,
      session_id: sessionId,
      goal_id: goalId,
      title: def.title,
      description: def.description ?? null,
      milestone_date: def.date ?? new Date().toISOString().slice(0, 10),
      type: def.type ?? "other",
      status: "active",
      recorded_by_profile_id: therapistId,
    });
    if (error) throw new Error(`insert care_milestones("${def.title}"): ${error.message}`);
    seeded++;
  }
  if (seeded > 0) console.log(`    ✓  ${seeded} milestones seeded`);
}

// ─── Home activity seeding ────────────────────────────────────────────────────

async function ensureActivities(orgId, childId, therapistId, activityDefs, goalIds) {
  const { data: existing } = await admin.from("care_home_activities").select("id").eq("clinic_organization_id", orgId).eq("child_profile_id", childId).limit(1);
  if (existing && existing.length > 0) { console.log(`    ↩  home activities already exist`); return; }

  const goalTitles = Object.keys(goalIds);
  let seeded = 0;
  for (const def of activityDefs) {
    const goalId = (def.goalIdx !== null && def.goalIdx !== undefined && def.goalIdx < goalTitles.length) ? goalIds[goalTitles[def.goalIdx]] : null;
    const row = {
      id: randomUUID(),
      clinic_organization_id: orgId,
      child_profile_id: childId,
      goal_id: goalId,
      session_id: null,
      title: def.title,
      description: def.description ?? null,
      instructions: def.instructions ?? null,
      frequency: def.frequency ?? null,
      due_date: def.dueDate ?? null,
      status: def.status ?? "assigned",
      assigned_by_profile_id: therapistId,
    };
    if (def.status === "completed" && def.completedNote) {
      row.completed_at = new Date().toISOString();
      row.completed_note = def.completedNote;
    }
    const { error } = await admin.from("care_home_activities").insert(row);
    if (error) throw new Error(`insert care_home_activities("${def.title}"): ${error.message}`);
    seeded++;
  }
  if (seeded > 0) console.log(`    ✓  ${seeded} home activities seeded`);
}

// ─── Document seeding ─────────────────────────────────────────────────────────

async function seedDocuments(orgId, childId, adminId, childName) {
  const docDefs = DOCUMENTS[childName];
  if (!docDefs || docDefs.length === 0) return;
  const { data: existing } = await admin.from("clinic_documents").select("id").eq("origin_organization_id", orgId).eq("child_profile_id", childId).limit(1);
  if (existing && existing.length > 0) { console.log(`    ↩  documents already exist`); return; }
  for (const docDef of docDefs) {
    const docId = randomUUID();
    const versionId = randomUUID();
    const { error: hErr } = await admin.from("clinic_documents").insert({ id: docId, origin_organization_id: orgId, child_profile_id: childId, title: docDef.title, document_kind: docDef.kind, status: docDef.status, permissions: { view: true, download: docDef.allowDownload }, created_by_profile_id: adminId, current_version_id: null });
    if (hErr) throw new Error(`insert clinic_documents("${docDef.title}"): ${hErr.message}`);
    const safeKind = docDef.kind.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { error: vErr } = await admin.from("clinic_document_versions").insert({ id: versionId, document_id: docId, version_number: 1, storage_path: `${orgId}/${childId}/${docId}/v1.pdf`, mime_type: "application/pdf", file_name: `${safeKind}-v1.pdf`, uploaded_by_profile_id: adminId });
    if (vErr) { await admin.from("clinic_documents").delete().eq("id", docId); throw new Error(`insert version("${docDef.title}"): ${vErr.message}`); }
    const { error: uErr } = await admin.from("clinic_documents").update({ current_version_id: versionId }).eq("id", docId);
    if (uErr) throw new Error(`repoint version("${docDef.title}"): ${uErr.message}`);
    console.log(`    ✓  doc: "${docDef.title}"`);
  }
}

// ─── Orchestrate one child ────────────────────────────────────────────────────

async function seedChild(orgId, therapistId, adminId, childDef, childIdx) {
  console.log(`\n  ${childDef.displayName} [${childDef.therapyType}${childDef.isRich ? " · rich" : ""}]`);

  const childId = await ensureChild(orgId, childDef);

  // Goals first (needed for goal links, milestones, activities)
  const goalSet = childDef.isRich
    ? GOAL_SETS[childDef.therapyType] ?? GOAL_SETS.other
    : (GOAL_SETS[childDef.therapyType] ?? GOAL_SETS.other).filter(g => g.status !== "achieved").slice(0, 3);
  const goalIds = await ensureGoals(orgId, childId, goalSet, therapistId);

  // Sessions
  const { completedSessions } = await ensureSessions(orgId, childId, therapistId, adminId, childDef, childIdx);

  // Notes (idempotent per session_id)
  await ensureCareNotes(orgId, childId, therapistId, completedSessions, childDef.therapyType);

  // Goal links
  await ensureGoalLinks(orgId, completedSessions, goalIds);

  // Milestones
  const milestoneDefs = childDef.isRich
    ? (RICH_MILESTONES[childDef.therapyType] ?? RICH_MILESTONES.other)
    : (REGULAR_MILESTONES[childDef.therapyType] ?? REGULAR_MILESTONES.other);
  await ensureMilestones(orgId, childId, therapistId, milestoneDefs, completedSessions.map(s => s.id), goalIds);

  // Home activities
  const activityDefs = childDef.isRich
    ? (RICH_ACTIVITIES[childDef.therapyType] ?? RICH_ACTIVITIES.other)
    : (REGULAR_ACTIVITIES[childDef.therapyType] ?? REGULAR_ACTIVITIES.other);
  await ensureActivities(orgId, childId, therapistId, activityDefs, goalIds);

  // Clinic documents
  await seedDocuments(orgId, childId, adminId, childDef.displayName);

  return childId;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Lauris Care — Demo Data Seed  (v2 rich)");
  console.log("══════════════════════════════════════════\n");

  // 1. Resolve clinic orgs
  console.log("── Clinic Organizations ───────────────────");
  const northOrg = await getClinicOrgByName(CLINIC_NAMES.north);
  const southOrg = await getClinicOrgByName(CLINIC_NAMES.south);
  console.log(`  ✓  North: ${northOrg.id}`);
  console.log(`  ✓  South: ${southOrg.id}`);
  const orgs = { north: northOrg, south: southOrg };

  // 2. Resolve staff profiles
  console.log("\n── Staff Profiles ─────────────────────────");
  const adminProfileIds = {
    north: await getProfileByEmail(DEMO_ADMIN_EMAILS.north),
    south: await getProfileByEmail(DEMO_ADMIN_EMAILS.south),
  };
  const speechN  = await getProfileByEmail("care.speech.north@lauris.demo");
  const otN      = await getProfileByEmail("care.ot.north@lauris.demo");
  const behaviorN = await getProfileByEmail("care.behavior.north@lauris.demo");
  const speechS  = await getProfileByEmail("care.speech.south@lauris.demo");
  const otS      = await getProfileByEmail("care.ot.south@lauris.demo");
  console.log("  ✓  All staff profiles resolved");

  // 2b. Re-assert clinic_admin role for admin accounts — defensive fix so
  //     running the data seed alone can't leave admin accounts with wrong roles.
  console.log("\n── Re-asserting Admin Roles ───────────────");
  for (const side of ["north", "south"]) {
    const profileId = adminProfileIds[side];
    const orgId = orgs[side].id;
    const { data: existing } = await admin
      .from("organization_memberships")
      .select("id, role")
      .eq("profile_id", profileId)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      if (existing.role !== "clinic_admin") {
        const { error } = await admin.from("organization_memberships").update({ role: "clinic_admin" }).eq("id", existing.id);
        if (error) console.warn(`  ⚠  role update failed for ${DEMO_ADMIN_EMAILS[side]}: ${error.message}`);
        else console.log(`  ✓  ${DEMO_ADMIN_EMAILS[side]} → role=clinic_admin (was ${existing.role})`);
      } else {
        console.log(`  ↩  ${DEMO_ADMIN_EMAILS[side]} already clinic_admin`);
      }
    } else {
      console.warn(`  ⚠  No active membership for ${DEMO_ADMIN_EMAILS[side]} — run seed-care-demo-logins.mjs first`);
    }
  }

  const therapistMap = {
    north: { speech: speechN, occupational: otN, behavioral: behaviorN, other: adminProfileIds.north },
    south: { speech: speechS, occupational: otS, behavioral: speechS,   other: adminProfileIds.south },
  };

  // 3. Parent auth users — build email → profileId map
  console.log("\n── Parent Auth Users ──────────────────────");
  const parentIdMap = {};
  for (const c of [...CHILDREN.north, ...CHILDREN.south]) {
    parentIdMap[c.parentEmail] = await ensureParentAuthUser(c.parentEmail, c.parentName);
  }

  // 4. Children — full clinical data + family member links
  let childIdx = 0;
  for (const clinic of ["north", "south"]) {
    console.log(`\n══ ${clinic.toUpperCase()} Clinic ═══════════════════════════`);
    for (const childDef of CHILDREN[clinic]) {
      const childId = await seedChild(orgs[clinic].id, therapistMap[clinic][childDef.therapyType], adminProfileIds[clinic], childDef, childIdx++);
      const parentProfileId = parentIdMap[childDef.parentEmail];
      if (parentProfileId && childId) {
        await ensureFamilyMember(orgs[clinic].id, childId, parentProfileId);
      }
    }
  }

  // 5. Summary
  console.log("\n══════════════════════════════════════════");
  console.log("  Done.\n");

  console.log("Rich demo children:");
  console.log("  North → Sofia Reyes      (speech)  11 sessions · 6 goals · 3 milestones · 5 activities · 2 published parent summaries");
  console.log("  South → Paolo Villanueva (speech)  11 sessions · 6 goals · 3 milestones · 5 activities · 2 published parent summaries");
  console.log("\nAll other children: 6 sessions · 3 goals · 1 milestone · 2 activities\n");

  console.log("Tables seeded:");
  console.log("  child_profiles, child_profile_memberships");
  console.log("  therapy_sessions");
  console.log("  care_session_notes  (NEW — not therapy_session_notes)");
  console.log("  care_goals");
  console.log("  care_session_goal_links");
  console.log("  care_milestones");
  console.log("  care_home_activities");
  console.log("  clinic_documents, clinic_document_versions");
  console.log("\nOld tables NOT touched:");
  console.log("  therapy_session_notes, children, therapists, clinics,");
  console.log("  billing_*, scheduling_queue, enrollment_requests\n");

  console.log("Demo logins (password: Demo2026!):");
  console.log("  care.admin.north@lauris.demo   clinic_admin   North");
  console.log("  care.speech.north@lauris.demo  therapist      North");
  console.log("  care.admin.south@lauris.demo   clinic_admin   South");
  console.log("  care.speech.south@lauris.demo  therapist      South");
  console.log("\nParent accounts (password: SunshineDemo2026!):");
  console.log("  parent.north.01–06@lauris.demo  (North clinic families)");
  console.log("  parent.south.01–05@lauris.demo  (South clinic families)\n");

  console.log("Note: clinic document storage paths are placeholders.");
  console.log("      Upload a real PDF via the UI to test the full access flow.\n");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message ?? err);
  process.exit(1);
});
