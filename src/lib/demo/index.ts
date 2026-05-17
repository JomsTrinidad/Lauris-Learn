/**
 * Demo data generator for Lauris Learn platform admin.
 *
 * Generates realistic but clearly-fake school data for demo/sales walkthroughs.
 * Safety rule: every public function verifies is_demo = true before touching data.
 *
 * Import ONLY from API routes (src/app/api/). Never import in client components.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DemoScenario = "small_preschool" | "compliance_heavy" | "trial_new";
export type DemoAction   = "generate" | "refresh" | "reset" | "clear";

export interface DemoCredentials {
  /** Shared password for every demo account on this school */
  password: string;
  admin:    { email: string; fullName: string };
  teachers: Array<{ email: string; fullName: string }>;
  parents:  Array<{ email: string; fullName: string }>;
}

export interface DemoRunSummary {
  studentCount:       number;
  teacherCount:       number;
  parentCount:        number;
  classCount:         number;
  attendanceCount:    number;
  billingCount:       number;
  paymentCount:       number;
  updatesCount:       number;
  proudMomentsCount:  number;
  observationCount:   number;
  uploadedFilesCount: number;
  /** Auth user UUIDs created for this run — stored so we can delete them on clear */
  demoUserIds:        string[];
  /** Stable demo logins to share with clients. Same emails+password across refreshes. */
  credentials:        DemoCredentials;
}

// ─── Fake name pools (clearly fictional, Filipino-inspired) ───────────────────

const F_STUDENT = [
  "Sofia","Isabella","Andrea","Emma","Olivia","Mia","Luna","Alexa","Bianca","Camille",
  "Danielle","Francesca","Gianna","Hannah","Iris","Jasmine","Kat","Lara","Nadia","Paula",
  "Queenie","Rhea","Stella","Tanya","Uma","Vera","Wanda","Ximena","Yara","Zoe",
];
const M_STUDENT = [
  "Marco","Rafael","Liam","Gabriel","Ethan","Diego","Matteo","Lucas","Miguel","Noah",
  "Paolo","Andrei","Ivan","Carlos","Ryan","Kyle","Jace","Aaron","Dean","Felix",
  "Grant","Hugo","Ilan","Jerome","Kevin","Lance","Miles","Nathan","Oscar","Pierce",
];
const LAST_NAMES = [
  "Santos","Reyes","Cruz","Garcia","Ramos","Mendoza","Torres","Lopez","Gonzalez","Bautista",
  "Villanueva","Rivera","Flores","Aquino","Cabrera","Castillo","Navarro","Moreno","Romero","Lim",
];
const T_FEMALE = ["Maria","Ana","Elena","Rosa","Carmen","Gloria","Patricia","Cecilia","Jennifer","Marilou"];
const T_MALE   = ["Jose","Juan","Ricardo","Roberto","Antonio","Carlos","Eduardo","Manuel","Fernando","Rafael"];

// Inquiry child names — completely separate from F_STUDENT / M_STUDENT / T_FEMALE / T_MALE
// and use last names NOT in the LAST_NAMES pool, so there is zero overlap with enrolled students.
const INQUIRY_CHILD_NAMES = [
  "Alicia Buenaventura", "Bruno Macaraeg",    "Chloe Atienza",
  "Dario Evangelista",   "Eloise Fabian",      "Franco Padilla",
  "Gina Domingo",        "Hector Aguilar",     "Isabel Sy",
  "Julius Tan",          "Kira Abad",          "Lorenzo Mata",
  "Mara Chua",           "Nico Sison",         "Odessa Vera",
];
const INQUIRY_PARENT_NAMES = [
  "Rachel Buenaventura", "Benedict Macaraeg",  "Vivian Atienza",
  "Dennis Evangelista",  "Lydia Fabian",       "Ferdinand Padilla",
  "Rowena Domingo",      "Arturo Aguilar",     "Norma Sy",
  "Ignacio Tan",         "Connie Abad",        "Leandro Mata",
  "Mylene Chua",         "Nardo Sison",        "Ofelia Vera",
];

function studentFirst(idx: number, female: boolean): string {
  const pool = female ? F_STUDENT : M_STUDENT;
  return pool[idx % pool.length];
}
function lastName(idx: number): string {
  return LAST_NAMES[(idx * 3 + 7) % LAST_NAMES.length];
}
function teacherFirst(idx: number): string {
  const female = idx % 4 !== 0;
  return female ? T_FEMALE[idx % T_FEMALE.length] : T_MALE[Math.floor(idx / 4) % T_MALE.length];
}

// ─── Progress categories (shared across scenarios) ────────────────────────────

const PROGRESS_CATEGORIES = [
  { name: "Participation",          description: "Active engagement in class activities",      sort_order: 1 },
  { name: "Social Skills",          description: "Interaction with peers and adults",           sort_order: 2 },
  { name: "Communication",          description: "Verbal and non-verbal expression",            sort_order: 3 },
  { name: "Fine Motor Skills",      description: "Writing, drawing, cutting, manipulation",     sort_order: 4 },
  { name: "Gross Motor Skills",     description: "Large body movements and coordination",       sort_order: 5 },
  { name: "Cognitive Development",  description: "Problem-solving and critical thinking",       sort_order: 6 },
  { name: "Self-Care",              description: "Ability to manage personal needs",            sort_order: 7 },
];

const PROUD_CATEGORIES = [
  "Academic Achievement","Creativity","Leadership","Kindness","Perseverance",
  "Teamwork","Communication","Sports & Movement","Problem Solving","Character",
];

const PROUD_NOTES = [
  "Helped a classmate who was upset without being asked. Such a kind heart!",
  "Completed their first full drawing with proper shapes and colors. Huge milestone!",
  "Led the morning circle time today — spoke clearly and kept the group engaged.",
  "Read their first three-letter words independently. We are so proud!",
  "Stayed calm and used words during a conflict with a peer. Excellent emotional growth.",
  "Counted to 50 correctly without any help. Amazing progress!",
  "Shared toys with new classmates right away. So welcoming and generous!",
  "Finished the puzzle independently after two earlier attempts. Perseverance pays off!",
  "Participated in show-and-tell for the first time — so brave!",
  "Tied their own shoelaces today for the first time. Big milestone!",
  "Drew a detailed picture of their family with labels. Emerging literacy at its best!",
  "Remembered all the hand-washing steps without a reminder. Building healthy habits!",
  "Said 'please' and 'thank you' consistently all week. Manners are becoming natural.",
  "Built the tallest block tower in the class and helped a friend build theirs too.",
  "Sang the full alphabet song confidently in front of the group.",
];

const UPDATE_CONTENTS = [
  "We had a wonderful art session today! The children created beautiful collages using recycled materials. Their creativity truly shines!",
  "Today we practiced counting and number recognition. Most of our little learners can now count up to 20! Great progress, everyone.",
  "We read a fun story about a friendly dragon who learns to share. The children loved acting out the different characters.",
  "Our science exploration today involved mixing colors. The children were amazed to see yellow and blue make green!",
  "Music and movement day was a blast! The children learned a new song about the days of the week.",
  "Outdoor play focused on cooperative games today. Wonderful to see the children developing their teamwork skills.",
  "We introduced our new letter of the week: the letter S. Can you spot things that start with S at home?",
  "Show and tell was a big hit today! The children shared their favorite toys and books with the class.",
  "Today's storytime featured a book about different emotions. We discussed how to express feelings in healthy ways.",
  "Nature walk in the school garden! We spotted butterflies, caterpillars, and interesting bugs.",
  "Great work on our writing practice today! The children are improving their pencil grip and letter formation.",
  "Our class worked on a group puzzle today. Wonderful to see how they take turns and support each other.",
  "Sensory play day! Rice bins, sand trays, and water play helped develop fine motor and tactile exploration.",
  "Reminder: No school this Friday due to the teacher planning day. See you Monday refreshed and ready to learn!",
  "Announcement: School photo day is coming up next week! Please dress children in their best school uniform.",
  "We introduced a new classroom rule about listening when friends speak. The children embraced it beautifully.",
  "Parent reminder: Please ensure your child brings a water bottle and a healthy snack daily.",
  "We celebrated three birthdays today! Thank you to the families who shared treats with the class.",
  "Our class enjoyed a storytelling activity where children invented their own story characters. So imaginative!",
  "We reviewed shapes and colors through a fun game today. Everyone is getting so confident!",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Stable demo identity derived from the school's name. Same input → same emails
// and password across every refresh, so credentials shared with clients keep
// working. Two demo schools whose names start with the same first word would
// collide on email — rename one if that ever happens.
function schoolSlug(name: string | null | undefined): string {
  const first = (name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^a-z0-9]/g, "");
  return cleaned.slice(0, 12) || "demo";
}
function demoPassword(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1) + "Demo2026!";
}

// All scenario dates are anchored to this base start. When the active school
// year starts on a different month, shiftDate() slides every date forward/back
// by the same number of months so the data always lands inside the correct year.
const BASE_START = "2025-06-01";

function monthsBetween(from: string, to: string): number {
  const fy = parseInt(from.slice(0, 4)), fm = parseInt(from.slice(5, 7));
  const ty = parseInt(to.slice(0, 4)), tm = parseInt(to.slice(5, 7));
  return (ty - fy) * 12 + (tm - fm);
}

function shiftDate(dateStr: string, months: number): string {
  if (months === 0) return dateStr;
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7)) - 1; // 0-indexed
  const d = parseInt(dateStr.slice(8, 10));
  const raw = m + months;
  const newY = y + Math.floor(raw / 12);
  const newM = ((raw % 12) + 12) % 12;
  return `${newY}-${String(newM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function schoolDays(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cur = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function batchInsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[],
  chunkSize = 150,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

// Deterministic attendance status based on indices
function attendanceStatus(studentIdx: number, dayIdx: number): "present" | "late" | "absent" | "excused" {
  const n = (studentIdx * 13 + dayIdx * 7) % 20;
  if (n <= 15) return "present";
  if (n === 16) return "late";
  if (n === 17 || n === 18) return "absent";
  return "excused";
}

// Deterministic billing status based on month index (0=oldest)
// Tuned for a healthy demo narrative: prior months almost fully cleared,
// only a modest outstanding tail on the most recent month.
function billingStatus(monthIdx: number, totalMonths: number, studentIdx: number): "unpaid" | "partial" | "paid" | "overdue" {
  const recency = totalMonths - 1 - monthIdx; // 0 = most recent month
  const variant = (studentIdx * 11 + monthIdx * 7) % 10;
  if (recency >= 2) {
    // older months: nearly all collected
    return variant < 9 ? "paid" : "partial";
  }
  if (recency === 1) {
    // one month back: mostly paid, a few still outstanding, none overdue
    if (variant < 7) return "paid";
    if (variant < 9) return "partial";
    return "unpaid";
  }
  // most recent month: healthy rate — majority paid/partial, small unpaid tail
  if (variant < 5) return "paid";
  if (variant < 8) return "partial";
  if (variant < 9) return "unpaid";
  return "overdue"; // at most 1-in-10 on the newest month only
}

// ─── Scenario configs ─────────────────────────────────────────────────────────

interface ClassDef { name: string; level: string; nextLevel: string; startTime: string; endTime: string; capacity: number; }

interface ScenarioDef {
  label:           string;
  description:     string;
  classes:         ClassDef[];
  // Per-class enrollment counts. Should target ~80% of each class's capacity
  // (Math.floor(capacity * 0.8)) so demo schools feel populated like real schools.
  // A small number of overrides can deviate (e.g. one class near capacity) to
  // surface realistic edge cases.
  studentsPerClass: number[];
  parentCount:     number;
  billingMonths:   string[];   // YYYY-MM (first of month stored as YYYY-MM-01)
  attendStart:     string;     // school days start
  attendEnd:       string;     // school days end
  updateCount:     number;
  proudCount:      number;
  observeFraction: number;    // 0–1 fraction of students to create observations for
  uploadedFilesCount: number;
  tuitionAmount:   number;
  trialNewMode?:   boolean;   // Scenario C: fewer payments, partial setup
  // Optional override: how many teacher auth users to mint. Defaults to
  // classes.length (one teacher per class). Setting this BELOW classes.length
  // forces round-robin assignment so some teachers cover multiple classes —
  // useful for testing teacher-role views with multi-class coverage.
  teacherCount?: number;
  // Optional override: archived-year class indices that get NO row in
  // class_teachers. Lets the demo include a "class with no assigned teacher"
  // edge case. Active-year mirror classes are skipped at the same indices.
  unassignedClassIndices?: number[];
}

const SCENARIOS: Record<DemoScenario, ScenarioDef> = {
  small_preschool: {
    label: "Small Preschool",
    description: "General walkthrough — 4 classes at ~80% fill, ~47 students, complete setup",
    classes: [
      { name: "Toddler Playgroup",   level: "Toddler",    nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 12 },
      { name: "Pre-Kinder A",        level: "Pre-Kinder", nextLevel: "Kinder",     startTime: "08:00", endTime: "11:00", capacity: 15 },
      { name: "Kinder A",            level: "Kinder",     nextLevel: "GRADUATE",   startTime: "08:00", endTime: "11:30", capacity: 15 },
      { name: "Kinder B",            level: "Kinder",     nextLevel: "GRADUATE",   startTime: "13:00", endTime: "16:00", capacity: 15 },
    ],
    // ~80% fill via Math.floor(capacity * 0.8): 9 / 12 / 12 / 12.
    // Override: Kinder A bumped to 14/15 (~93%) — one class near capacity as
    // a realistic edge case for testing capacity-warning UI.
    studentsPerClass: [9, 12, 14, 12],
    parentCount: 13,
    billingMonths: ["2025-11-01","2025-12-01","2026-01-01","2026-02-01"],
    attendStart: "2025-09-01",
    attendEnd:   "2025-10-17",
    updateCount:     8,
    proudCount:      22,
    observeFraction: 0.7,
    uploadedFilesCount: 6,
    tuitionAmount: 3500,
  },
  compliance_heavy: {
    label: "Compliance-Heavy School",
    description: "Media-heavy documentation and reporting — 8 classes at ~80% fill, ~103 students",
    classes: [
      { name: "Nursery A",     level: "Nursery",    nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 15 },
      { name: "Nursery B",     level: "Nursery",    nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 15 },
      { name: "Pre-Kinder A",  level: "Pre-Kinder", nextLevel: "Kinder",     startTime: "08:00", endTime: "11:00", capacity: 15 },
      { name: "Pre-Kinder B",  level: "Pre-Kinder", nextLevel: "Kinder",     startTime: "08:00", endTime: "11:00", capacity: 15 },
      { name: "Kinder A",      level: "Kinder",     nextLevel: "Grade 1",    startTime: "08:00", endTime: "11:30", capacity: 15 },
      { name: "Kinder B",      level: "Kinder",     nextLevel: "Grade 1",    startTime: "08:00", endTime: "11:30", capacity: 15 },
      { name: "Grade 1 A",     level: "Grade 1",    nextLevel: "GRADUATE",   startTime: "07:30", endTime: "12:00", capacity: 18 },
      { name: "Grade 1 B",     level: "Grade 1",    nextLevel: "GRADUATE",   startTime: "07:30", endTime: "12:00", capacity: 18 },
    ],
    // ~80% fill via Math.floor(capacity * 0.8): 12 × 6 then 14, 14.
    // Override: Grade 1 B bumped to 17/18 (~94%) — one class near capacity.
    studentsPerClass: [12, 12, 12, 12, 12, 12, 14, 17],
    parentCount: 20,
    billingMonths: ["2025-09-01","2025-10-01","2025-11-01","2025-12-01","2026-01-01","2026-02-01"],
    attendStart: "2025-09-01",
    attendEnd:   "2025-09-30",
    updateCount:     20,
    proudCount:      60,
    observeFraction: 0.9,
    uploadedFilesCount: 25,
    tuitionAmount: 4200,
    // 6 teachers for 8 classes → round-robin gives 2 teachers with 2 classes
    // each. Combined with unassignedClassIndices=[3], one teacher (the one
    // who would otherwise have only had class 3) ends up with no classes,
    // and class index 3 (Pre-Kinder B) has no assigned teacher.
    teacherCount: 6,
    unassignedClassIndices: [3],
  },
  trial_new: {
    label: "New Trial School",
    description: "Onboarding & incomplete setup — 2 classes at ~80% fill, ~24 students, minimal data",
    classes: [
      { name: "Playgroup",  level: "Playgroup",  nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 15 },
      { name: "Pre-Kinder", level: "Pre-Kinder", nextLevel: "GRADUATE",   startTime: "08:00", endTime: "11:00", capacity: 15 },
    ],
    // ~80% fill via Math.floor(capacity * 0.8): 12 / 12.
    studentsPerClass: [12, 12],
    parentCount: 8,
    billingMonths: ["2026-01-01","2026-02-01"],
    attendStart: "2025-09-01",
    attendEnd:   "2025-09-19",
    updateCount:     3,
    proudCount:      5,
    observeFraction: 0.3,
    uploadedFilesCount: 2,
    tuitionAmount: 2500,
    trialNewMode: true,
  },
};

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateDemoData(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  scenario: DemoScenario,
  actorUserId: string,
): Promise<DemoRunSummary> {

  // Safety: verify school is a demo school
  const { data: school } = await (admin as any).from("schools").select("id, name, is_demo").eq("id", schoolId).single();
  if (!school?.is_demo) throw new Error("School is not marked as a demo school. Generation blocked.");

  const cfg     = SCENARIOS[scenario];
  const batchId = Date.now().toString(36).slice(-7); // still used for OR numbers + storage paths
  const METHODS: string[] = ["gcash","cash","bank_transfer","maya","cash"];
  const slug    = schoolSlug(school.name);
  const password = demoPassword(slug);

  // Email helpers — stable per school, same across refreshes
  const adminEmail   = `admin@${slug}.test`;
  const teacherEmail = (i: number) => `t${i + 1}@${slug}.test`;
  const parentEmail  = (i: number) => `p${i + 1}@${slug}.test`;

  // Create-or-reuse: if an account with this email already exists (e.g. left
  // over from a partially failed clear), reuse its UUID instead of failing.
  async function createOrReuseUser(email: string, fullName: string): Promise<string | null> {
    const { data, error } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (data?.user) return data.user.id;
    // Fall back to lookup on duplicate-email errors
    if (error) {
      const { data: list } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = (list?.users ?? []).find((u: any) => u.email === email);
      if (existing) {
        // Reset the password so it always matches the documented one
        await (admin as any).auth.admin.updateUserById(existing.id, { password });
        return existing.id;
      }
    }
    return null;
  }

  const demoUserIds:        string[] = [];
  const teacherIds:         string[] = [];
  const teacherProfileIds:  string[] = [];
  const parentIds:          string[] = [];

  // ── 1a. Create school_admin auth user ───────────────────────────────────────
  const adminFullName = `${school.name} Admin`;
  const adminUid = await createOrReuseUser(adminEmail, adminFullName);
  if (!adminUid) throw new Error(`Failed to create school_admin user ${adminEmail}`);
  demoUserIds.push(adminUid);

  // ── 1. Create teacher auth users ────────────────────────────────────────────
  // Default: one teacher per class. Scenarios can set teacherCount lower than
  // classes.length to force round-robin coverage (some teachers run multiple
  // classes — realistic for compliance_heavy demos).
  const teacherCount = cfg.teacherCount ?? cfg.classes.length;
  for (let i = 0; i < teacherCount; i++) {
    const fullName = `${teacherFirst(i)} ${lastName(i * 2)}`;
    const uid = await createOrReuseUser(teacherEmail(i), fullName);
    if (uid) {
      demoUserIds.push(uid);
      teacherIds.push(uid);
    }
  }

  // ── 2. Create parent auth users ─────────────────────────────────────────────
  for (let i = 0; i < cfg.parentCount; i++) {
    const female = i % 3 !== 2;
    const first  = female ? T_FEMALE[i % T_FEMALE.length] : T_MALE[i % T_MALE.length];
    const last   = lastName(i * 5 + 3);
    const uid = await createOrReuseUser(parentEmail(i), `${first} ${last}`);
    if (uid) {
      demoUserIds.push(uid);
      parentIds.push(uid);
    }
  }

  // ── 3. Insert profiles ──────────────────────────────────────────────────────
  const profileRows: Record<string, unknown>[] = [];
  profileRows.push({
    id: adminUid, email: adminEmail, full_name: adminFullName,
    role: "school_admin", school_id: schoolId,
  });
  teacherIds.forEach((uid, i) => {
    profileRows.push({ id: uid, email: teacherEmail(i), full_name: `${teacherFirst(i)} ${lastName(i * 2)}`, role: "teacher", school_id: schoolId });
  });
  parentIds.forEach((uid, i) => {
    const female = i % 3 !== 2;
    const first  = female ? T_FEMALE[i % T_FEMALE.length] : T_MALE[i % T_MALE.length];
    profileRows.push({ id: uid, email: parentEmail(i), full_name: `${first} ${lastName(i * 5 + 3)}`, role: "parent", school_id: schoolId });
  });
  // Upsert (not insert) — Supabase's handle_new_user trigger auto-creates a minimal
  // profile row when the auth user is created. We upsert to fill in school_id, role, full_name.
  if (profileRows.length) {
    const { error: profErr } = await (admin as any)
      .from("profiles")
      .upsert(profileRows, { onConflict: "id" });
    if (profErr) throw new Error(`Insert into profiles failed: ${profErr.message}`);
  }

  // ── 4. School years + academic periods ─────────────────────────────────────
  // Demo narrative: we are standing just before SY 2026-2027 begins.
  // All rich data (enrollments, attendance, billing) lives in the archived
  // SY 2025-2026 — that's the year that just finished. SY 2026-2027 is the
  // active upcoming year with classes set up but no enrollments yet, so the
  // admin can demo Year-End Classification → returning-student enrollment flow.

  // Archived year — SY 2025–2026 (all demo data: enrollments, attendance, billing)
  const { data: archivedSyData, error: archivedSyErr } = await (admin as any)
    .from("school_years")
    .insert({ school_id: schoolId, name: "SY 2025–2026", start_date: "2025-06-01", end_date: "2026-03-31", status: "archived" })
    .select("id").single();
  if (archivedSyErr) throw new Error(`archived school_years insert: ${archivedSyErr.message}`);
  const archivedYearId: string = archivedSyData.id;

  const { data: archivedApData } = await (admin as any).from("academic_periods").insert([
    { school_id: schoolId, school_year_id: archivedYearId, name: "Regular Term", start_date: "2025-06-01", end_date: "2026-03-31", is_active: false },
    ...(scenario !== "trial_new" ? [{ school_id: schoolId, school_year_id: archivedYearId, name: "Summer Term", start_date: "2026-04-01", end_date: "2026-05-31", is_active: false }] : []),
  ]).select("id, name");
  const archivedRegularPeriodId: string | null = (archivedApData ?? []).find((a: any) => a.name === "Regular Term")?.id ?? null;
  const archivedSummerPeriodId: string | null  = (archivedApData ?? []).find((a: any) => a.name === "Summer Term")?.id  ?? null;

  // Active year — SY 2026–2027 (classes set up, no enrollments yet)
  const { data: syData, error: syErr } = await (admin as any)
    .from("school_years")
    .insert({ school_id: schoolId, name: "SY 2026–2027", start_date: "2026-06-01", end_date: "2027-03-31", status: "active" })
    .select("id").single();
  if (syErr) throw new Error(`school_years insert: ${syErr.message}`);
  const schoolYearId: string = syData.id;

  const { data: apData } = await (admin as any)
    .from("academic_periods")
    .insert([
      { school_id: schoolId, school_year_id: schoolYearId, name: "Regular Term", start_date: "2026-06-01", end_date: "2027-03-31", is_active: true },
      ...(scenario !== "trial_new" ? [{ school_id: schoolId, school_year_id: schoolYearId, name: "Summer Term", start_date: "2027-04-01", end_date: "2027-05-31", is_active: false }] : []),
    ])
    .select("id, name");
  const regularPeriodId: string | null  = (apData ?? []).find((a: any) => a.name === "Regular Term")?.id ?? null;
  const summerPeriodId: string | null   = (apData ?? []).find((a: any) => a.name === "Summer Term")?.id  ?? null;

  // mo = 0: BASE_START matches archived year start, no date shifting needed
  const mo = 0;

  // ── 5. Fee types ────────────────────────────────────────────────────────────
  const FEE_TYPE_DEFS: Array<{ name: string; defaultAmount: number; mandatory: boolean; archivedPrice?: number; activePrice?: number }> = [
    { name: "Tuition Fee",       defaultAmount: cfg.tuitionAmount, mandatory: true  },
    { name: "Registration Fee",  defaultAmount: 500,               mandatory: true,  archivedPrice: 500,  activePrice: 500  },
    { name: "Miscellaneous Fee", defaultAmount: 350,               mandatory: true,  archivedPrice: 350,  activePrice: 350  },
    { name: "Books & Materials", defaultAmount: 1800,              mandatory: true,  archivedPrice: 1800, activePrice: 1800 },
    { name: "Uniform Fee",       defaultAmount: 1200,              mandatory: false, archivedPrice: 1200, activePrice: 1200 },
    { name: "Activity Fee",      defaultAmount: 250,               mandatory: false, archivedPrice: 250,  activePrice: 250  },
    { name: "Field Trip Fee",    defaultAmount: 0,                 mandatory: false, archivedPrice: 0,    activePrice: 0    },
    { name: "Late Payment Fee",  defaultAmount: 0,                 mandatory: false },
    { name: "Other",             defaultAmount: 0,                 mandatory: false },
  ];

  // Fetch existing fee types so we never insert duplicates (idempotent on re-run)
  const { data: existingFt } = await (admin as any)
    .from("fee_types").select("id, name").eq("school_id", schoolId);
  const existingFtNames = new Set((existingFt ?? []).map((f: any) => f.name as string));
  const feeTypesToInsert = FEE_TYPE_DEFS.filter((f) => !existingFtNames.has(f.name));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ftData: Array<{ id: string; name: string }> = existingFt ?? [];
  if (feeTypesToInsert.length > 0) {
    const { data: newFt, error: ftErr } = await (admin as any)
      .from("fee_types")
      .insert(feeTypesToInsert.map(({ name, defaultAmount, mandatory }) => ({
        school_id: schoolId, name, is_active: true, default_amount: defaultAmount,
        is_enrollment_mandatory: mandatory,
      })))
      .select("id, name");
    if (ftErr) throw new Error(`Insert into fee_types failed: ${ftErr.message}`);
    ftData = [...ftData, ...(newFt ?? [])];
  }

  // Seed school-year-specific prices for both years (Tuition Fee excluded — comes from tuition_configs)
  // Wrapped in try-catch: non-fatal if fee_type_prices table doesn't exist yet (migration 049 pending)
  const feeTypePriceRows: Record<string, unknown>[] = [];
  for (const def of FEE_TYPE_DEFS) {
    if (def.name === "Tuition Fee") continue;
    const ftId = ftData.find((f: any) => f.name === def.name)?.id;
    if (!ftId) continue;
    if (def.archivedPrice != null) {
      feeTypePriceRows.push({ fee_type_id: ftId, school_year_id: archivedYearId, school_id: schoolId, amount: def.archivedPrice });
    }
    if (def.activePrice != null) {
      feeTypePriceRows.push({ fee_type_id: ftId, school_year_id: schoolYearId, school_id: schoolId, amount: def.activePrice });
    }
  }
  if (feeTypePriceRows.length > 0) {
    try {
      await (admin as any)
        .from("fee_type_prices")
        .upsert(feeTypePriceRows, { onConflict: "fee_type_id,school_year_id" });
    } catch {
      // fee_type_prices table may not exist yet — fee types still created, prices skipped
    }
  }

  const tuitionFeeTypeId: string | null = ftData.find((f: any) => f.name === "Tuition Fee")?.id ?? null;
  const miscFeeTypeId: string | null    = ftData.find((f: any) => f.name === "Miscellaneous Fee")?.id ?? null;

  // ── 5b. Tuition configs (per level × academic period) ──────────────────────
  const uniqueLevels = [...new Set(cfg.classes.map((c) => c.level))];
  // Level tuition amounts: base + small increment per level index for realism
  const levelTuition: Record<string, number> = {};
  uniqueLevels.forEach((lvl, i) => { levelTuition[lvl] = cfg.tuitionAmount + i * 200; });
  const archivedBillingMonths = cfg.billingMonths.length;
  const tuitionConfigRows: Record<string, unknown>[] = [];

  if (archivedRegularPeriodId) {
    uniqueLevels.forEach((lvl) => {
      tuitionConfigRows.push({
        school_id: schoolId,
        academic_period_id: archivedRegularPeriodId,
        level: lvl,
        total_amount: levelTuition[lvl] * 10 - 2000,
        months: 10,
      });
    });
  }
  if (regularPeriodId) {
    uniqueLevels.forEach((lvl) => {
      tuitionConfigRows.push({
        school_id: schoolId,
        academic_period_id: regularPeriodId,
        level: lvl,
        total_amount: levelTuition[lvl] * 10,
        months: 10,
      });
    });
  }
  // Summer Term tuition: flat ₱5,000 per level for both years
  if (archivedSummerPeriodId) {
    uniqueLevels.forEach((lvl) => {
      tuitionConfigRows.push({
        school_id: schoolId,
        academic_period_id: archivedSummerPeriodId,
        level: lvl,
        total_amount: 5000,
        months: 2,
      });
    });
  }
  if (summerPeriodId) {
    uniqueLevels.forEach((lvl) => {
      tuitionConfigRows.push({
        school_id: schoolId,
        academic_period_id: summerPeriodId,
        level: lvl,
        total_amount: 5000,
        months: 2,
      });
    });
  }
  if (tuitionConfigRows.length) await batchInsert(admin, "tuition_configs", tuitionConfigRows);

  // ── 5c. Discounts ────────────────────────────────────────────────────────────
  const discountRows: Record<string, unknown>[] = [
    { school_id: schoolId, name: "Early Enrollment Discount", type: "percentage", scope: "early_enrollment", value: 10,  is_active: true },
    { school_id: schoolId, name: "Sibling Discount",          type: "fixed",      scope: "sibling",          value: 500, is_active: true },
    { school_id: schoolId, name: "Full Payment Discount",     type: "percentage", scope: "full_payment",     value: 5,   is_active: true },
  ];
  if (scenario === "compliance_heavy") {
    discountRows.push({ school_id: schoolId, name: "Scholar Discount", type: "percentage", scope: "custom", value: 15, is_active: true });
  }
  await batchInsert(admin, "discounts", discountRows);

  // suppress unused warning — miscFeeTypeId reserved for future itemized billing seed
  void miscFeeTypeId;

  // ── 6. Progress categories ──────────────────────────────────────────────────
  const { data: pcData } = await (admin as any)
    .from("progress_categories")
    .insert(PROGRESS_CATEGORIES.map((c) => ({ ...c, school_id: schoolId })))
    .select("id");
  const categoryIds: string[] = (pcData ?? []).map((c: any) => c.id);

  // ── 7. Classes ──────────────────────────────────────────────────────────────
  // Seed class_levels first; classes reference them via level_id (migration 060).
  const distinctLevels = [...new Set(cfg.classes.map((c) => c.level).filter((l): l is string => !!l))];
  const levelIdByName: Record<string, string> = {};
  if (distinctLevels.length > 0) {
    const { data: levelData, error: levelErr } = await (admin as any)
      .from("class_levels")
      .insert(distinctLevels.map((name, i) => ({
        school_id: schoolId, name, kind: "core", display_order: i, progression_order: i + 1,
      })))
      .select("id, name");
    if (levelErr) throw new Error(`class_levels insert: ${levelErr.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (levelData ?? []) as Array<{ id: string; name: string }>) {
      levelIdByName[row.name] = row.id;
    }
  }

  // Archived year classes — enrollments, attendance, billing, updates all live here
  const { data: classData, error: classErr } = await (admin as any)
    .from("classes")
    .insert(cfg.classes.map((c) => ({
      school_id: schoolId, school_year_id: archivedYearId, academic_period_id: archivedRegularPeriodId,
      name: c.name, level_id: c.level ? levelIdByName[c.level] ?? null : null, next_level: c.nextLevel, start_time: c.startTime, end_time: c.endTime, capacity: c.capacity, is_active: true,
    })))
    .select("id, name");
  if (classErr) throw new Error(`classes insert: ${classErr.message}`);
  const classIds: string[] = (classData ?? []).map((c: any) => c.id);

  // Active year classes — same structure, no enrollments yet (upcoming year)
  const { data: nextClassData } = await (admin as any)
    .from("classes")
    .insert(cfg.classes.map((c) => ({
      school_id: schoolId, school_year_id: schoolYearId, academic_period_id: regularPeriodId,
      name: c.name, level_id: c.level ? levelIdByName[c.level] ?? null : null, next_level: c.nextLevel, start_time: c.startTime, end_time: c.endTime, capacity: c.capacity, is_active: true,
    })))
    .select("id");
  const nextClassIds: string[] = (nextClassData ?? []).map((c: any) => c.id);

  // ── 8. Teacher profiles + class teachers ───────────────────────────────────
  // class_teachers.teacher_id references teacher_profiles(id) (migration 058),
  // so we mirror each demo auth-user teacher into teacher_profiles and use
  // those IDs for the join rows.
  if (teacherIds.length > 0) {
    // auth_user_id (migration 066) lets the RLS helpers resolve
    // auth.uid() → teacher_profiles.id → class_teachers.teacher_id, which is
    // what makes teacher logins able to see/insert child_documents,
    // parent_updates, and proud_moments for their classes.
    const tpRows = teacherIds.map((uid, i) => ({
      school_id:    schoolId,
      auth_user_id: uid,
      full_name:    `${teacherFirst(i)} ${lastName(i * 2)}`,
      email:        teacherEmail(i),
      is_active:    true,
    }));
    const { data: tpData, error: tpErr } = await (admin as any)
      .from("teacher_profiles").insert(tpRows).select("id");
    if (tpErr) throw new Error(`teacher_profiles insert: ${tpErr.message}`);
    teacherProfileIds.push(...(tpData ?? []).map((t: any) => t.id as string));
  }

  // Optional per-scenario skip list — classes that should ship without an
  // assigned teacher (demo edge case for the "needs a teacher" warning).
  const skipTeacherIdx = new Set<number>(cfg.unassignedClassIndices ?? []);
  const ctRows = [
    ...classIds.flatMap((cid, i) => skipTeacherIdx.has(i)
      ? []
      : [{ class_id: cid, teacher_id: teacherProfileIds[i % teacherProfileIds.length] }]),
    ...nextClassIds.flatMap((cid, i) => skipTeacherIdx.has(i)
      ? []
      : [{ class_id: cid, teacher_id: teacherProfileIds[i % teacherProfileIds.length] }]),
  ];
  if (ctRows.length) await batchInsert(admin, "class_teachers", ctRows);

  // ── 9. Students ─────────────────────────────────────────────────────────────
  const studentRows: Record<string, unknown>[] = [];
  let sIdx = 0;
  cfg.studentsPerClass.forEach((count, classIdx) => {
    for (let j = 0; j < count; j++, sIdx++) {
      const female  = sIdx % 2 === 0;
      const dob     = `${2018 + (classIdx % 3)}-${String((sIdx % 12) + 1).padStart(2, "0")}-${String((sIdx % 28) + 1).padStart(2, "0")}`;
      studentRows.push({
        school_id: schoolId,
        first_name: studentFirst(sIdx, female),
        last_name:  lastName(sIdx + 10),
        date_of_birth: dob,
        gender: female ? "Female" : "Male",
        is_active: true,
      });
    }
  });
  const { data: studentData, error: stuErr } = await (admin as any)
    .from("students").insert(studentRows).select("id");
  if (stuErr) throw new Error(`students insert: ${stuErr.message}`);
  const studentIds: string[] = (studentData ?? []).map((s: any) => s.id);

  // ── 10. Guardians ───────────────────────────────────────────────────────────
  const guardianRows: Record<string, unknown>[] = [];
  studentIds.forEach((sid, i) => {
    const pIdx   = i % parentIds.length;
    const pEmail = parentIds[pIdx] ? parentEmail(pIdx) : null;
    const female   = (i * 3 + 1) % 3 !== 0;
    const first    = female ? T_FEMALE[(i * 5) % T_FEMALE.length] : T_MALE[(i * 5) % T_MALE.length];
    const last     = lastName(i + 40);
    guardianRows.push({
      student_id: sid, full_name: `${first} ${last}`,
      relationship: i % 4 === 0 ? "Father" : "Mother",
      phone: `0917${String((i * 1234567 + 1000000) % 9000000 + 1000000)}`,
      email: pEmail,
      is_primary: true,
      is_emergency_contact: true,
    });
  });
  await batchInsert(admin, "guardians", guardianRows);

  // ── 11. Enrollments ─────────────────────────────────────────────────────────
  const enrollRows: Record<string, unknown>[] = [];
  let eIdx = 0;
  cfg.studentsPerClass.forEach((count, classIdx) => {
    for (let j = 0; j < count; j++, eIdx++) {
      enrollRows.push({
        student_id: studentIds[eIdx], class_id: classIds[classIdx],
        school_year_id: archivedYearId, academic_period_id: archivedRegularPeriodId,
        status: "enrolled", enrolled_at: "2025-06-01",
      });
    }
  });
  await batchInsert(admin, "enrollments", enrollRows);

  // Backfill student_class_assignments for archived-year enrollments.
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: arcEnrollData } = await (admin as any)
      .from("enrollments")
      .select("id, student_id, class_id, school_year_id, enrolled_at")
      .eq("school_year_id", archivedYearId)
      .in("student_id", studentIds);
    if (arcEnrollData?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await batchInsert(admin, "student_class_assignments", (arcEnrollData as any[]).map((e) => ({
        enrollment_id:   e.id,
        class_id:        e.class_id,
        student_id:      e.student_id,
        school_year_id:  e.school_year_id,
        assignment_kind: "initial",
        start_date:      (e.enrolled_at ?? "2025-06-01").slice(0, 10),
        end_date:        null,
        change_reason:   "Seeded by demo",
      })));
    }
  }

  // ── 11.5. Year-end classifications on archived year enrollments ─────────────
  // Pre-classify students so the demo shows realistic year-end outcomes.
  // Indices 0–3 get specific special cases; everyone else is eligible.
  if (studentIds.length >= 4) {
    const specialCases: Array<{ idx: number; progression_status: string; enrollment_status: string }> = [
      { idx: 0, progression_status: "withdrawn",             enrollment_status: "withdrawn"  },
      { idx: 1, progression_status: "not_continuing",        enrollment_status: "completed"  },
      { idx: 2, progression_status: "not_eligible_retained", enrollment_status: "completed"  },
      { idx: 3, progression_status: "not_eligible_other",    enrollment_status: "completed"  },
    ];
    for (const c of specialCases) {
      await (admin as any).from("enrollments")
        .update({ status: c.enrollment_status, progression_status: c.progression_status })
        .eq("student_id", studentIds[c.idx]).eq("school_year_id", archivedYearId);
    }
    const eligibleIds = studentIds.slice(4);
    if (eligibleIds.length > 0) {
      await (admin as any).from("enrollments")
        .update({ status: "completed", progression_status: "eligible" })
        .in("student_id", eligibleIds).eq("school_year_id", archivedYearId);
    }
  }

  // ── 11.6. Active-year enrollments + billing ──────────────────────────────────
  // Enroll ~60% of eligible students into their promoted active-year class so
  // the demo shows a school mid-way through SY 2026-2027 with classes running.
  const activeEnrollRows: Record<string, unknown>[] = [];
  let activeEnrollBillingCount = 0;
  let activeEnrollPaymentCount = 0;
  {
    // Map: level name → list of indices into cfg.classes (and therefore nextClassIds)
    const levelToNewClassIdx: Record<string, number[]> = {};
    cfg.classes.forEach((c, i) => {
      if (!levelToNewClassIdx[c.level]) levelToNewClassIdx[c.level] = [];
      levelToNewClassIdx[c.level].push(i);
    });
    const levelSlotCounters: Record<string, number> = {};

    let runningIdx = 0;
    cfg.studentsPerClass.forEach((count, classIdx) => {
      const classDef = cfg.classes[classIdx];
      if (classDef.nextLevel === "GRADUATE" || classDef.nextLevel === "NON_PROMOTIONAL") {
        runningIdx += count;
        return;
      }
      const targetIndices = levelToNewClassIdx[classDef.nextLevel] ?? [];
      if (!targetIndices.length) { runningIdx += count; return; }
      if (!levelSlotCounters[classDef.nextLevel]) levelSlotCounters[classDef.nextLevel] = 0;

      const eligibleInClass: number[] = [];
      for (let j = 0; j < count; j++) {
        const gi = runningIdx + j;
        if (gi >= 4) eligibleInClass.push(gi); // skip special-case indices 0–3
      }
      const toEnroll = Math.ceil(eligibleInClass.length * 0.6);
      eligibleInClass.slice(0, toEnroll).forEach((gi) => {
        const slotIdx = (levelSlotCounters[classDef.nextLevel] ?? 0) % targetIndices.length;
        levelSlotCounters[classDef.nextLevel] = slotIdx + 1;
        activeEnrollRows.push({
          student_id: studentIds[gi],
          class_id: nextClassIds[targetIndices[slotIdx]],
          school_year_id: schoolYearId,
          academic_period_id: regularPeriodId,
          status: "enrolled",
          enrolled_at: "2026-06-01",
        });
      });
      runningIdx += count;
    });
  }
  if (activeEnrollRows.length) {
    await batchInsert(admin, "enrollments", activeEnrollRows);

    // Backfill student_class_assignments for active-year enrollments.
    // Use today's date so attendance queries can find students immediately,
    // regardless of the school year's nominal start date.
    {
      const today = new Date().toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: actEnrollData } = await (admin as any)
        .from("enrollments")
        .select("id, student_id, class_id, school_year_id")
        .eq("school_year_id", schoolYearId)
        .in("student_id", studentIds);
      if (actEnrollData?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await batchInsert(admin, "student_class_assignments", (actEnrollData as any[]).map((e) => ({
          enrollment_id:   e.id,
          class_id:        e.class_id,
          student_id:      e.student_id,
          school_year_id:  e.school_year_id,
          assignment_kind: "initial",
          start_date:      today,
          end_date:        null,
          change_reason:   "Seeded by demo",
        })));
      }
    }

    if (!cfg.trialNewMode) {
      // Add 2 billing months for the active year to show ongoing payments
      const activeMonths = ["2026-06-01", "2026-07-01"];
      const activeBillingRows: Record<string, unknown>[] = [];
      activeEnrollRows.forEach((enr, i) => {
        const classIdx = nextClassIds.indexOf(enr.class_id as string);
        const tuition = cfg.tuitionAmount + (classIdx % 2 === 0 ? 0 : 200);
        const amountDue = tuition + 500;
        activeMonths.forEach((month, mIdx) => {
          const bStatus = mIdx === 0
            // June (prior month): mostly settled — 67% paid, 33% partial
            ? (i % 3 < 2 ? "paid" : "partial")
            // July (current month): actively being collected — 40% paid, 40% partial, 20% unpaid
            : (i % 5 < 2 ? "paid" : i % 5 < 4 ? "partial" : "unpaid");
          activeBillingRows.push({
            school_id: schoolId,
            student_id: enr.student_id,
            school_year_id: schoolYearId,
            class_id: enr.class_id,
            billing_month: month,
            description: "Tuition & Miscellaneous",
            amount_due: amountDue,
            status: bStatus,
            due_date: `${month.slice(0, 7)}-15`,
            fee_type_id: tuitionFeeTypeId,
          });
        });
      });
      const { data: activeBillData, error: abErr } = await (admin as any)
        .from("billing_records").insert(activeBillingRows).select("id, status, amount_due");
      if (abErr) throw new Error(`active billing_records insert: ${abErr.message}`);
      activeEnrollBillingCount = activeBillingRows.length;

      const activePayRows: Record<string, unknown>[] = [];
      (activeBillData ?? []).forEach((br: any, i: number) => {
        if (br.status === "paid") {
          activePayRows.push({
            billing_record_id: br.id, amount: br.amount_due,
            payment_method: METHODS[i % METHODS.length],
            payment_date: "2026-06-05", status: "confirmed",
            or_number: `OR-${batchId.toUpperCase()}-A${String(i + 1).padStart(4, "0")}`,
            recorded_by: actorUserId,
          });
        } else if (br.status === "partial") {
          activePayRows.push({
            billing_record_id: br.id, amount: Math.floor(br.amount_due * 0.5),
            payment_method: METHODS[(i * 3) % METHODS.length],
            payment_date: "2026-06-10", status: "confirmed",
            or_number: `OR-${batchId.toUpperCase()}-A${String(1000 + i).padStart(4, "0")}`,
            recorded_by: actorUserId,
          });
        }
      });
      if (activePayRows.length) await batchInsert(admin, "payments", activePayRows, 150);
      activeEnrollPaymentCount = activePayRows.length;
    }
  }

  // ── 11.7. New-student entry-level enrollment (active year) ─────────────────
  // One genuinely new student at the entry level (Toddler, Nursery, etc.) —
  // not promoted from the archived year. Demonstrates the new-student path in
  // the Enrollment Hub (shows up as status='enrolled' in enrollment_inquiries).
  {
    // Entry level = the level that no other class promotes INTO.
    const allNextLevels = new Set(cfg.classes.map((c) => c.nextLevel));
    const entryClassIdx = cfg.classes.findIndex((c) => !allNextLevels.has(c.level));
    const entryNextClassId = entryClassIdx >= 0 ? nextClassIds[entryClassIdx] : null;

    if (entryNextClassId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newStuData } = await (admin as any)
        .from("students")
        .insert({
          school_id:     schoolId,
          first_name:    "Sofia",
          last_name:     "Cruz",
          date_of_birth: "2023-03-15",
          gender:        "Female",
          is_active:     true,
        })
        .select("id")
        .single();
      const newStudentId: string | null = (newStuData as any)?.id ?? null;

      if (newStudentId) {
        const today = new Date().toISOString().slice(0, 10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newEnrollData } = await (admin as any)
          .from("enrollments")
          .insert({
            student_id:         newStudentId,
            class_id:           entryNextClassId,
            school_year_id:     schoolYearId,
            academic_period_id: regularPeriodId,
            status:             "enrolled",
            enrolled_at:        new Date().toISOString(),
          })
          .select("id")
          .single();
        const newEnrollId: string | null = (newEnrollData as any)?.id ?? null;

        if (newEnrollId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).from("student_class_assignments").insert({
            enrollment_id:   newEnrollId,
            class_id:        entryNextClassId,
            student_id:      newStudentId,
            school_year_id:  schoolYearId,
            assignment_kind: "initial",
            start_date:      today,
            end_date:        null,
            change_reason:   "Seeded by demo — new student",
          });
        }

        // Enrollment inquiry at status='enrolled' so the Enrollment Hub shows
        // this student as a new inbound walk-in.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("enrollment_inquiries").insert({
          school_id:      schoolId,
          child_name:     "Sofia Cruz",
          parent_name:    "Maria Cruz",
          contact:        "09181234567",
          email:          `new.entry.${batchId}@example.com`,
          desired_class:  cfg.classes[entryClassIdx].name,
          school_year_id: schoolYearId,
          inquiry_source: "walk-in",
          status:         "enrolled",
          notes:          "New student. First time enrolling.",
        });
      }
    }
  }

  // ── 11.8. IEP workflow demo scenarios ───────────────────────────────────────
  // Two realistic in-progress IEP plans so the dashboard Student Support card
  // surfaces coordination signals. Both belong to students that are past the
  // special-case indices (0–3) and guaranteed to exist in every scenario.
  //
  // Scenario A — Teacher draft in preparation (status='draft')
  //   A teacher has started an IEP for a student in the first class.
  //   Planning is underway but the plan has not been submitted yet.
  //
  // Scenario B — Submitted, awaiting coordination (status='submitted')
  //   A different student's IEP has been completed and submitted.
  //   It is sitting in the review queue, waiting for school-admin coordination.
  //   submitted_at is set to 3 days ago to give it realistic age.
  {
    const iepStudentA = studentIds[4];  // first non-special-case student
    const iepStudentB = studentIds[5];  // second non-special-case student
    const planAuthor  = teacherIds[0];  // first teacher profile (profiles.id = auth uid)

    if (iepStudentA && iepStudentB && planAuthor) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      // Plan A — draft
      const { data: planAData, error: planAErr } = await (admin as any)
        .from("student_plans")
        .insert({
          school_id:    schoolId,
          student_id:   iepStudentA,
          school_year_id: schoolYearId,
          plan_type:    "iep",
          title:        "IEP — Communication and Social Skills",
          status:       "draft",
          strengths:    "Enthusiastic and curious learner. Strong visual memory.",
          areas_of_need: "Expressive language, initiating peer interactions, turn-taking in group activities.",
          created_by:   planAuthor,
        })
        .select("id")
        .single();
      if (planAErr) throw new Error(`IEP plan A insert: ${planAErr.message}`);
      const planAId: string | null = (planAData as any)?.id ?? null;

      // Plan B — submitted, awaiting review
      const { data: planBData, error: planBErr } = await (admin as any)
        .from("student_plans")
        .insert({
          school_id:    schoolId,
          student_id:   iepStudentB,
          school_year_id: schoolYearId,
          plan_type:    "iep",
          title:        "IEP — Fine Motor and Self-Care",
          status:       "submitted",
          strengths:    "Highly motivated and responds well to visual schedules.",
          areas_of_need: "Fine motor precision, scissors use, fastening buttons and zippers.",
          submitted_at: threeDaysAgo,
          submitted_by: planAuthor,
          created_by:   planAuthor,
        })
        .select("id")
        .single();
      if (planBErr) throw new Error(`IEP plan B insert: ${planBErr.message}`);
      const planBId: string | null = (planBData as any)?.id ?? null;

      // Add one goal to plan B so it looks substantive when opened in Plans & Forms
      if (planBId) {
        await (admin as any).from("student_plan_goals").insert({
          plan_id:            planBId,
          domain:             "Fine Motor",
          description:        "Student will use scissors to cut along a straight line with no more than 2 corrections in 3 out of 4 trials.",
          measurement_method: "Teacher observation + work sample",
          responsible_person: "Classroom teacher and OT consultant",
          sort_order:         1,
        });
      }

      // suppress unused-variable lint for planAId (no sub-rows needed for the draft)
      void planAId;
    }
  }

  // ── 12. Attendance records ──────────────────────────────────────────────────
  const days = schoolDays(shiftDate(cfg.attendStart, mo), shiftDate(cfg.attendEnd, mo));
  const attendRows: Record<string, unknown>[] = [];
  let studentClassOffset = 0;
  cfg.studentsPerClass.forEach((count, classIdx) => {
    days.forEach((date, dayIdx) => {
      for (let j = 0; j < count; j++) {
        const sId = studentIds[studentClassOffset + j];
        attendRows.push({
          class_id: classIds[classIdx], student_id: sId, date,
          status: attendanceStatus(studentClassOffset + j, dayIdx),
          recorded_by: teacherIds[classIdx % teacherIds.length] ?? null,
        });
      }
    });
    studentClassOffset += count;
  });
  await batchInsert(admin, "attendance_records", attendRows, 200);

  // ── 12.5. Today-relative attendance for dashboard attendance signals ─────────
  // Seeds records for today + recent school days in the ACTIVE year's classes so
  // the dashboard's attendance signals (consecutive absence, returned, full week)
  // fire when the demo dashboard is viewed with all classes marked.
  // Only runs on weekdays and only for small_preschool / compliance_heavy.
  {
    const todayDate = new Date().toISOString().slice(0, 10);
    const todayDow = new Date(todayDate + "T00:00:00Z").getUTCDay();
    const isTodayWeekday = todayDow >= 1 && todayDow <= 5;

    if (!cfg.trialNewMode && isTodayWeekday && activeEnrollRows.length > 0) {
      // Get last N school days (weekdays only), most recent first
      function getRecentSchoolDaysLocal(n: number): string[] {
        const days: string[] = [];
        const cur = new Date(todayDate + "T00:00:00Z");
        let guard = 0;
        while (days.length < n && guard++ < 30) {
          const dow = cur.getUTCDay();
          if (dow >= 1 && dow <= 5) days.push(cur.toISOString().slice(0, 10));
          cur.setUTCDate(cur.getUTCDate() - 1);
        }
        return days; // [today, yesterday, ...]
      }

      // School days Mon → today (oldest first)
      function getThisWeekSchoolDaysLocal(): string[] {
        const todayD = new Date(todayDate + "T00:00:00Z");
        const dow = todayD.getUTCDay();
        const daysSinceMon = dow === 0 ? 6 : dow - 1;
        const days: string[] = [];
        for (let i = daysSinceMon; i >= 0; i--) {
          const d = new Date(todayD);
          d.setUTCDate(d.getUTCDate() - i);
          const ds = d.toISOString().slice(0, 10);
          const dsw = new Date(ds + "T00:00:00Z").getUTCDay();
          if (dsw >= 1 && dsw <= 5) days.push(ds);
        }
        return days;
      }

      const last5 = getRecentSchoolDaysLocal(5); // [today, D-1, D-2, D-3, D-4]
      const thisWeekDays = getThisWeekSchoolDaysLocal();

      // Map nextClassId → students enrolled this year
      const activeStudentsByClass: Record<string, string[]> = {};
      activeEnrollRows.forEach((enr) => {
        const cId = enr.class_id as string;
        (activeStudentsByClass[cId] ??= []).push(enr.student_id as string);
      });

      // Find the first active class with 3+ students (for consecutive/returned signals)
      const signalClass = nextClassIds
        .map((id) => ({ id, students: activeStudentsByClass[id] ?? [] }))
        .find(({ students }) => students.length >= 3);

      // Find the second active class with any students (for full-week signal)
      const fullWeekClass = nextClassIds
        .map((id) => ({ id, students: activeStudentsByClass[id] ?? [] }))
        .filter(({ id }) => id !== signalClass?.id)
        .find(({ students }) => students.length >= 1);

      const signalAttRows: Record<string, unknown>[] = [];

      if (signalClass) {
        const { id: scId, students: scStudents } = signalClass;
        const teacherRef = teacherIds[0] ?? null;

        // Student 0: absent today + 2 prior school days → 3 consecutive absences
        const absentSid = scStudents[0];
        [last5[0], last5[1], last5[2]].filter(Boolean).forEach((d) => {
          signalAttRows.push({ class_id: scId, student_id: absentSid, date: d, status: "absent", recorded_by: teacherRef });
        });
        // Day 3–4 ago: present (streak starts 3 days ago)
        [last5[3], last5[4]].filter(Boolean).forEach((d) => {
          signalAttRows.push({ class_id: scId, student_id: absentSid, date: d, status: "present", recorded_by: teacherRef });
        });

        // Student 1: present today, absent 3 prior days → returned signal
        if (scStudents.length >= 2) {
          const returnedSid = scStudents[1];
          signalAttRows.push({ class_id: scId, student_id: returnedSid, date: last5[0], status: "present", recorded_by: teacherRef });
          [last5[1], last5[2], last5[3]].filter(Boolean).forEach((d) => {
            signalAttRows.push({ class_id: scId, student_id: returnedSid, date: d, status: "absent", recorded_by: teacherRef });
          });
          if (last5[4]) signalAttRows.push({ class_id: scId, student_id: returnedSid, date: last5[4], status: "present", recorded_by: teacherRef });
        }

        // Remaining students: present today (enough to mark the class as done)
        scStudents.slice(2).forEach((sid) => {
          signalAttRows.push({ class_id: scId, student_id: sid, date: last5[0], status: "present", recorded_by: teacherRef });
        });
      }

      if (fullWeekClass && thisWeekDays.length >= 2) {
        // All students present all week → class full-week streak signal
        const { id: fwId, students: fwStudents } = fullWeekClass;
        const teacherRef = teacherIds[1 % teacherIds.length] ?? null;
        fwStudents.forEach((sid) => {
          thisWeekDays.forEach((d) => {
            // Avoid duplicate if today was already added via signalClass logic
            if (fwId !== signalClass?.id) {
              signalAttRows.push({ class_id: fwId, student_id: sid, date: d, status: "present", recorded_by: teacherRef });
            }
          });
        });
      }

      // All other active classes: mark every student present today so allClassesMarked is true
      nextClassIds.forEach((classId, idx) => {
        if (classId === signalClass?.id || classId === fullWeekClass?.id) return;
        const students = activeStudentsByClass[classId] ?? [];
        const teacherRef = teacherIds[idx % teacherIds.length] ?? null;
        students.forEach((sid) => {
          signalAttRows.push({ class_id: classId, student_id: sid, date: last5[0], status: "present", recorded_by: teacherRef });
        });
      });

      if (signalAttRows.length > 0) {
        await batchInsert(admin, "attendance_records", signalAttRows, 200);
      }
    }
  }

  // ── 13. Billing records + payments ─────────────────────────────────────────
  const shiftedBillingMonths = cfg.billingMonths.map((m) => shiftDate(m, mo));
  const billingRows: Record<string, unknown>[] = [];
  shiftedBillingMonths.forEach((month, monthIdx) => {
    studentIds.forEach((sid, studentIdx) => {
      // Only generate archived billing for ~40% of students to keep the list concise
      if (studentIdx % 5 >= 2) return;
      const classIdxFinal = cfg.studentsPerClass.reduce<number>((cls, cnt, ci) => {
        let running = 0;
        for (let k = 0; k < ci; k++) running += cfg.studentsPerClass[k];
        if (studentIdx >= running && studentIdx < running + cnt) return ci;
        return cls;
      }, 0);
      const tuition   = cfg.tuitionAmount + (classIdxFinal % 2 === 0 ? 0 : 200);
      const misc      = scenario === "compliance_heavy" ? 500 : scenario === "trial_new" ? 0 : 500;
      const amountDue = tuition + misc;
      const bs        = cfg.trialNewMode
        ? (monthIdx === 0 ? (studentIdx % 3 === 0 ? "paid" : "unpaid") : "unpaid")
        : billingStatus(monthIdx, shiftedBillingMonths.length, studentIdx);
      const dueDate   = `${month.slice(0, 7)}-15`;
      billingRows.push({
        school_id: schoolId, student_id: sid, school_year_id: archivedYearId,
        class_id: classIds[classIdxFinal] ?? null,
        billing_month: month, description: `Tuition${misc ? " & Miscellaneous" : ""}`,
        amount_due: amountDue, status: bs, due_date: dueDate,
        fee_type_id: tuitionFeeTypeId,
      });
    });
  });
  const { data: billingData, error: billErr } = await (admin as any)
    .from("billing_records").insert(billingRows).select("id, status, amount_due");
  if (billErr) throw new Error(`billing_records insert: ${billErr.message}`);

  // Payments for paid / partial records
  const payRows: Record<string, unknown>[] = [];
  (billingData ?? []).forEach((br: any, i: number) => {
    if (br.status === "paid") {
      payRows.push({
        billing_record_id: br.id, amount: br.amount_due,
        payment_method: METHODS[i % METHODS.length],
        payment_date: shiftedBillingMonths[Math.min(i % shiftedBillingMonths.length, shiftedBillingMonths.length - 1)].slice(0, 7) + "-05",
        status: "confirmed",
        or_number: `OR-${batchId.toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
        recorded_by: actorUserId,
      });
    } else if (br.status === "partial") {
      payRows.push({
        billing_record_id: br.id, amount: Math.floor(br.amount_due * 0.5),
        payment_method: METHODS[(i * 3) % METHODS.length],
        payment_date: shiftedBillingMonths[Math.min(i % shiftedBillingMonths.length, shiftedBillingMonths.length - 1)].slice(0, 7) + "-10",
        status: "confirmed",
        or_number: `OR-${batchId.toUpperCase()}-${String(1000 + i).padStart(4, "0")}`,
        recorded_by: actorUserId,
      });
    }
  });
  if (payRows.length) await batchInsert(admin, "payments", payRows, 150);

  // ── 14. Parent updates (announcements + class posts) ───────────────────────
  const updateRows: Record<string, unknown>[] = [];
  // 2 school-wide broadcasts
  for (let i = 0; i < Math.min(2, cfg.updateCount); i++) {
    updateRows.push({
      school_id: schoolId, class_id: null,
      author_id: teacherIds[0] ?? actorUserId,
      content: UPDATE_CONTENTS[(i + 14) % UPDATE_CONTENTS.length],
    });
  }
  // Class-specific posts
  for (let i = 2; i < cfg.updateCount; i++) {
    const cIdx = i % classIds.length;
    updateRows.push({
      school_id: schoolId, class_id: classIds[cIdx],
      author_id: teacherIds[cIdx % teacherIds.length] ?? actorUserId,
      content: UPDATE_CONTENTS[i % UPDATE_CONTENTS.length],
    });
  }
  await batchInsert(admin, "parent_updates", updateRows);

  // ── 15. Events ──────────────────────────────────────────────────────────────
  // classIdx helpers for class-specific events
  const cls0 = classIds[0];
  const cls1 = classIds[classIds.length > 1 ? 1 : 0];

  const eventRows: Record<string, unknown>[] = [
    // ════════════════════════════════════════════════════════════════════════
    // SY 2025-2026  (past — all use shiftDate so they follow the active year)
    // ════════════════════════════════════════════════════════════════════════
    // ── June 2025 ──────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Opening Day Ceremony",                          event_date: shiftDate("2025-06-02", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Welcome back! First day of school for SY 2025–2026. Homeroom orientation follows the opening ceremony." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA Welcome Assembly & School Orientation",    event_date: shiftDate("2025-06-06", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:30", description: "General PTA meeting to welcome all families, introduce teachers, and walk through the school calendar and policies for the year." },
    { school_id: schoolId, event_type: "holiday",        title: "Independence Day (Araw ng Kalayaan)",          event_date: shiftDate("2025-06-12", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── July 2025 ──────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Nutrition Month Assembly",                      event_date: shiftDate("2025-07-11", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "10:00", description: "Nutrition Month kick-off with a healthy-eating program, fruit-and-veggie snack stations, and a simple cooking demo for the kids." },
    { school_id: schoolId, event_type: "school_event",  title: "Values Formation Assembly",                     event_date: shiftDate("2025-07-18", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "09:30", description: "Monthly school gathering for character formation. Theme this month: Kindness and Gratitude. Short reflection activity follows." },
    { school_id: schoolId, event_type: "school_event",  title: "Intramurals — Sports & Games Day",              event_date: shiftDate("2025-07-25", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Age-appropriate relay races, parachute games, and obstacle courses. Classes are color-coded into teams. Students should wear their PE attire." },
    { school_id: schoolId, event_type: "deadline",       title: "Tuition Deadline — 1st Grading Period",        event_date: shiftDate("2025-07-31", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Last day to settle tuition and miscellaneous fees for the 1st grading period without incurring a late payment penalty." },
    // ── August 2025 ────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Fire Safety Drill",                             event_date: shiftDate("2025-08-08", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "09:00", end_time: "09:45", description: "Mandatory evacuation drill in coordination with the local BFP. Teachers will brief their classes beforehand on proper procedures and assembly points." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA General Meeting — Q1 Update",              event_date: shiftDate("2025-08-15", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:00", description: "First-quarter PTA update covering the budget report, school news, and open forum. All parents are encouraged to attend." },
    { school_id: schoolId, event_type: "holiday",        title: "Ninoy Aquino Day",                             event_date: shiftDate("2025-08-21", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "holiday",        title: "National Heroes Day",                          event_date: shiftDate("2025-08-25", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Buwan ng Wika Program",                         event_date: shiftDate("2025-08-29", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "11:00", description: "Annual celebration of Filipino language and culture. Students perform songs, recitations, and short skits in Filipino. Filipiniana attire encouraged." },
    // ── September 2025 ─────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Foundation Day Celebration",                    event_date: shiftDate("2025-09-05", mo), applies_to: "all",   requires_rsvp: true,  all_day: true,  description: "Celebrate the school's founding anniversary with class booth activities, a pageant, and a special program for families." },
    { school_id: schoolId, event_type: "school_event",  title: "STEM Fair — Science Exploration Exhibit",       event_date: shiftDate("2025-09-12", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:30", description: "Students present hands-on science experiments and mini-projects on topics like plants, animals, water, and weather. Parents are welcome to visit the exhibit." },
    { school_id: schoolId, event_type: "class_event",   title: "Class Photo Day",                               event_date: shiftDate("2025-09-19", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "10:30", description: "Individual portrait and class group photos. Please wear the complete school uniform with proper grooming." },
    { school_id: schoolId, event_type: "school_event",  title: "Q1 Culminating Activity — Sharing Day",         event_date: shiftDate("2025-09-26", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:30", end_time: "11:00", max_companions: 2, description: "First-quarter learning showcase. Students share what they've learned through art displays, songs, and mini-presentations for family guests." },
    { school_id: schoolId, event_type: "deadline",       title: "Project Submission Deadline — Q1",             event_date: shiftDate("2025-09-30", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "All Q1 projects and portfolio requirements must be submitted today. Late submissions require a note from the parent." },
    // ── October 2025 ───────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "meeting",        title: "Parent-Teacher Conference",                    event_date: shiftDate("2025-10-10", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:00", end_time: "17:00", description: "One-on-one conferences with your child's class teacher to review the first grading period report and discuss learning goals. Check your class schedule for your assigned time slot." },
    { school_id: schoolId, event_type: "class_event",   title: "Oral Reading Assessment Week",                  event_date: shiftDate("2025-10-13", mo), applies_to: "class", class_id: cls1,       requires_rsvp: false, all_day: true,  description: "Individual oral reading checks for Pre-Kinder and Kinder students. Teachers will listen to each child read aloud and note fluency, accuracy, and comprehension." },
    { school_id: schoolId, event_type: "class_event",   title: "Field Trip — Nature Exploration",               event_date: shiftDate("2025-10-17", mo), applies_to: "class", class_id: cls0,       requires_rsvp: true,  all_day: true,  description: "Half-day trip to a local farm or botanical garden. Permission slip and exact fee due by October 10. Wear comfortable clothes and closed-toe shoes." },
    { school_id: schoolId, event_type: "school_event",  title: "Family Fun Day",                                event_date: shiftDate("2025-10-18", mo), applies_to: "all",   requires_rsvp: true,  all_day: true,  max_companions: 3, description: "School-wide event packed with family games, food stalls, raffle draws, and a mini-carnival. A full day of fun and bonding — bring the whole family!" },
    { school_id: schoolId, event_type: "school_event",  title: "United Nations Day Program",                    event_date: shiftDate("2025-10-24", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "11:00", description: "Students come dressed as citizens of different countries. Each class represents a nation and shares a brief cultural performance or presentation." },
    { school_id: schoolId, event_type: "school_event",  title: "Halloween Program & Costume Parade",            event_date: shiftDate("2025-10-31", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "10:30", description: "Students arrive in their favorite creative costumes for our annual Halloween parade and themed activities. Friendly, non-scary costumes only." },
    // ── November 2025 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "All Saints' Day",                              event_date: shiftDate("2025-11-01", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "holiday",        title: "All Souls' Day",                               event_date: shiftDate("2025-11-02", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Reading Week — Character Dress-Up Day",         event_date: shiftDate("2025-11-07", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:30", description: "Kick off Reading Week by coming to school as your favorite book character. Storytelling corners, read-alouds, and book displays run throughout the week." },
    { school_id: schoolId, event_type: "deadline",       title: "Project Submission Deadline — Q2",             event_date: shiftDate("2025-11-14", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "All second-quarter projects and portfolio requirements must be submitted by today. Remind your child to bring their output folder." },
    { school_id: schoolId, event_type: "meeting",        title: "Therapy Coordination Meeting",                 event_date: shiftDate("2025-11-21", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "13:00", end_time: "16:00", description: "For parents of children receiving therapy support. Teachers and therapists will discuss progress, home carry-over strategies, and goals for the third grading period." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA Meeting — Q2 Report",                      event_date: shiftDate("2025-11-28", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:00", description: "Second-quarter PTA session: budget update, Christmas program briefing, and open forum. Committee reports from health, safety, and events." },
    { school_id: schoolId, event_type: "holiday",        title: "Bonifacio Day",                                event_date: shiftDate("2025-11-30", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── December 2025 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "Feast of the Immaculate Conception",           event_date: shiftDate("2025-12-08", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Christmas Program Rehearsal",                   event_date: shiftDate("2025-12-10", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:00", description: "Full dress rehearsal for the Christmas Program. All students must be in costume. Parents are NOT expected to attend — run-through only." },
    { school_id: schoolId, event_type: "school_event",  title: "Christmas Program",                             event_date: shiftDate("2025-12-12", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "12:00", max_companions: 4, description: "Annual Christmas celebration featuring performances from each class, a gift-giving ceremony, and a visit from Santa. Reception follows the program." },
    { school_id: schoolId, event_type: "holiday",        title: "Christmas Day",                                event_date: shiftDate("2025-12-25", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "holiday",        title: "Rizal Day",                                    event_date: shiftDate("2025-12-30", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── January 2026 ───────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "New Year's Day",                               event_date: shiftDate("2026-01-01", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Classes Resume — Second Term",                  event_date: shiftDate("2026-01-05", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "School resumes after the Christmas–New Year break. New seating arrangements and Q3 lesson plans begin this week. Updated schedules will be posted." },
    { school_id: schoolId, event_type: "school_event",  title: "School Mass & Values Formation",                event_date: shiftDate("2026-01-16", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "09:30", description: "Opening Mass and character formation session for the new term. Theme: Perseverance and Growth. Quiet reflection activity follows the program." },
    { school_id: schoolId, event_type: "deadline",       title: "Tuition Deadline — 3rd Grading Period",        event_date: shiftDate("2026-01-31", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Last day to settle tuition and fees for the third grading period. Please contact the registrar's office early if you need a payment arrangement." },
    // ── February 2026 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Friendship Day Program",                        event_date: shiftDate("2026-02-13", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "10:30", description: "Valentine's-week program celebrating kindness and friendship. Students exchange handmade cards and enjoy cooperative activities with classmates." },
    { school_id: schoolId, event_type: "school_event",  title: "Fire Safety Drill — Q3",                        event_date: shiftDate("2026-02-20", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "09:30", end_time: "10:00", description: "Third fire drill of the school year. Practice observing proper exit routes and reporting to the assembly area calmly and quickly." },
    { school_id: schoolId, event_type: "class_event",   title: "Oral Reading Assessment Week — Q3",             event_date: shiftDate("2026-02-23", mo), applies_to: "class", class_id: cls1,       requires_rsvp: false, all_day: true,  description: "Individual reading fluency checks for Pre-Kinder and Kinder students. Assessment results will be shared with parents at the upcoming PTC." },
    { school_id: schoolId, event_type: "school_event",  title: "Q3 Culminating Activity — Showcase Day",        event_date: shiftDate("2026-02-27", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:30", end_time: "11:00", max_companions: 2, description: "Third-quarter learning showcase. Students present completed projects, art work, and mini-performances for parents and family guests." },
    { school_id: schoolId, event_type: "deadline",       title: "Project Submission Deadline — Q3",             event_date: shiftDate("2026-02-28", mo), applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Final day to submit all Q3 project outputs and portfolio folders. Written explanation from a parent required for any late submission." },
    // ── March 2026 ─────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Reading Week — Author Spotlight",               event_date: shiftDate("2026-03-06", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:00", description: "End-of-year reading celebration with a book fair, storytelling, book swaps, and a guest parent reader invited to each classroom." },
    { school_id: schoolId, event_type: "meeting",        title: "Therapy Coordination Meeting — Year-End",      event_date: shiftDate("2026-03-13", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "13:00", end_time: "16:00", description: "Year-end review for children in support and therapy programs. Topics include goals met, summer home strategies, and recommendations for next school year." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA General Assembly — Year-End",              event_date: shiftDate("2026-03-19", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:00", description: "Closing PTA session: financial report, outgoing/incoming officers, and appreciation for all parent volunteers throughout the school year." },
    { school_id: schoolId, event_type: "school_event",  title: "Recognition Day",                               event_date: shiftDate("2026-03-20", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "12:00", description: "Academic honors and awards ceremony recognizing students with outstanding performance, best in conduct, and special achievements across all classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Moving Up Ceremony Rehearsal",                  event_date: shiftDate("2026-03-25", mo), applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:00", description: "Full dress rehearsal for the Moving Up Ceremony. All students must attend. Bring formal attire for a costume check before the actual ceremony." },
    { school_id: schoolId, event_type: "school_event",  title: "Moving Up Ceremony",                            event_date: shiftDate("2026-03-27", mo), applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "12:00", max_companions: 4, description: "Graduation and promotion ceremony for all students completing SY 2025–2026. Light reception follows the ceremony in the covered court." },
    // ════════════════════════════════════════════════════════════════════════
    // SY 2026-2027  (upcoming — hardcoded dates)
    // ════════════════════════════════════════════════════════════════════════
    // ── May–June 2026 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "meeting",        title: "Parent-Teacher Conference — Year-End",         event_date: "2026-05-22", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:00", end_time: "17:00", description: "End-of-year conferences to review your child's final progress report and set goals for next school year. Check the class schedule for your assigned slot." },
    { school_id: schoolId, event_type: "deadline",       title: "Permission Slip Deadline — Year-End Field Trip",event_date: "2026-06-05", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Submit signed permission slips and payment for the year-end field trip by this date. No late submissions accepted." },
    { school_id: schoolId, event_type: "school_event",  title: "Opening Day Ceremony — SY 2026-2027",           event_date: "2026-06-08", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Welcome to SY 2026–2027! First day of school. Homeroom orientation and distribution of schedules after the opening ceremony." },
    { school_id: schoolId, event_type: "holiday",        title: "Independence Day (Araw ng Kalayaan)",          event_date: "2026-06-12", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA Welcome Assembly & Orientation",           event_date: "2026-06-13", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:30", description: "Opening PTA meeting for SY 2026–2027. Meet your child's new teachers, review the school calendar, and elect new committee members." },
    // ── July 2026 ──────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Nutrition Month Assembly",                      event_date: "2026-07-10", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "10:00", description: "Monthly Nutrition theme launch with a Bahay Kubo song, veggie trivia games, and healthy snacks prepared by the canteen." },
    { school_id: schoolId, event_type: "school_event",  title: "Values Formation Assembly",                     event_date: "2026-07-17", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "09:30", description: "Monthly school gathering for character formation. Theme: Respect and Responsibility. Interactive reflection activity for each class." },
    { school_id: schoolId, event_type: "school_event",  title: "Intramurals — Color Games Day",                 event_date: "2026-07-24", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Annual Intramurals! Classes compete in color-coded teams across relay races, parachute activities, and cooperative challenges. Wear your team color." },
    { school_id: schoolId, event_type: "deadline",       title: "Tuition Deadline — 1st Grading Period",        event_date: "2026-07-31", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Deadline to pay first grading period tuition and fees. A 2% late charge applies to outstanding balances after this date." },
    // ── August 2026 ────────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Fire Safety Drill",                             event_date: "2026-08-07", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "09:00", end_time: "09:45", description: "First fire evacuation drill of SY 2026–2027. All students and staff practice the full evacuation route and roll call at the assembly area." },
    { school_id: schoolId, event_type: "meeting",        title: "PTA General Meeting — Q1 Update",              event_date: "2026-08-14", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "11:00", description: "Q1 PTA update: school fund report, upcoming Foundation Day preparations, and open forum. Light snacks provided." },
    { school_id: schoolId, event_type: "holiday",        title: "Ninoy Aquino Day",                             event_date: "2026-08-21", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Buwan ng Wika Program",                         event_date: "2026-08-28", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "11:00", description: "Celebration of the Filipino language. Students perform poems, songs, and short plays in Filipino. Parents welcome to watch." },
    { school_id: schoolId, event_type: "holiday",        title: "National Heroes Day",                          event_date: "2026-08-31", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── September 2026 ─────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "school_event",  title: "Foundation Day Celebration",                    event_date: "2026-09-04", applies_to: "all",   requires_rsvp: true,  all_day: true,  description: "School anniversary celebration with booth activities, mini-concerts from each class, and a special recognition of long-time staff and families." },
    { school_id: schoolId, event_type: "class_event",   title: "Class Photo Day",                               event_date: "2026-09-11", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "10:30", description: "Annual class portraits. Please ensure your child is in complete uniform with neat hair. Individual and group shots taken by the school photographer." },
    { school_id: schoolId, event_type: "school_event",  title: "STEM Fair — Engineering & Design Showcase",     event_date: "2026-09-18", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:30", description: "Students build and display simple machines, towers, and engineering projects. Families are invited to explore the exhibits and vote for their favorite design." },
    { school_id: schoolId, event_type: "class_event",   title: "Oral Reading Assessment Week",                  event_date: "2026-09-21", applies_to: "class", class_id: cls1,       requires_rsvp: false, all_day: true,  description: "One-on-one oral reading fluency checks for Pre-Kinder and Kinder. Results will be shared during the Q1 Parent-Teacher Conference." },
    { school_id: schoolId, event_type: "school_event",  title: "Q1 Culminating Activity — Learning Showcase",   event_date: "2026-09-25", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:30", end_time: "11:00", max_companions: 2, description: "First-quarter showcase where each class presents what they've been learning through interactive stations, art projects, and short performances." },
    { school_id: schoolId, event_type: "deadline",       title: "Project Submission Deadline — Q1",             event_date: "2026-09-30", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "All Q1 project outputs must be submitted today. Please check your child's class group chat for the complete list of requirements." },
    // ── October 2026 ───────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "meeting",        title: "Parent-Teacher Conference — Q1",               event_date: "2026-10-02", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "08:00", end_time: "17:00", description: "First-quarter conferences. Discuss your child's Q1 report card and teacher observations. Check the schedule posted on the classroom door for your slot." },
    { school_id: schoolId, event_type: "class_event",   title: "Field Trip — Planetarium & Science Museum",     event_date: "2026-10-09", applies_to: "class", class_id: cls1,       requires_rsvp: true,  all_day: true,  description: "Educational trip for Kinder students. Permission slip and fee due by October 3. Students will explore the solar system exhibit and a short planetarium show." },
    { school_id: schoolId, event_type: "school_event",  title: "Family Day",                                    event_date: "2026-10-17", applies_to: "all",   requires_rsvp: true,  all_day: true,  max_companions: 3, description: "Annual Family Day celebration with games, food stalls, raffle, and a talent showcase by the students. Enjoy a fun-filled Saturday with the whole family!" },
    { school_id: schoolId, event_type: "school_event",  title: "United Nations Day Program",                    event_date: "2026-10-23", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "11:00", description: "Each class represents a country of the world. Students wear their assigned country's traditional dress and present a short cultural program." },
    { school_id: schoolId, event_type: "school_event",  title: "Halloween Program & Costume Parade",            event_date: "2026-10-30", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:30", end_time: "10:30", description: "Come in a fun, friendly costume for our Halloween parade around the campus. Candy exchange and themed activities follow the parade." },
    // ── November 2026 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "All Saints' Day",                              event_date: "2026-11-01", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "holiday",        title: "All Souls' Day",                               event_date: "2026-11-02", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Reading Week — Book Character Day",             event_date: "2026-11-06", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:30", description: "Start of Reading Week! Students dress up as a character from their favorite book. In-class storytelling stations and a school-wide book swap activity." },
    { school_id: schoolId, event_type: "school_event",  title: "Book Week",                                     event_date: "2026-11-09", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Week-long reading celebration. Daily themes include Poetry Day, Author Spotlight, and a mini-book fair. Students are encouraged to bring a book to share." },
    { school_id: schoolId, event_type: "deadline",       title: "Project Submission Deadline — Q2",             event_date: "2026-11-13", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Second-quarter projects and portfolio folders must be submitted. Teachers will not accept late outputs after final grading begins." },
    { school_id: schoolId, event_type: "meeting",        title: "Therapy Coordination Meeting",                 event_date: "2026-11-20", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "13:00", end_time: "16:00", description: "Progress update meeting for children receiving therapy or learning support. Parents, class teachers, and support staff will align on the Q3 plan." },
    { school_id: schoolId, event_type: "holiday",        title: "Bonifacio Day",                                event_date: "2026-11-30", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── December 2026 ──────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "Feast of the Immaculate Conception",           event_date: "2026-12-08", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Special Non-Working Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Christmas Program Rehearsal",                   event_date: "2026-12-09", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "11:00", description: "Dress rehearsal for the Christmas Program. All students must attend in full costume. No parents during rehearsal — save the surprise for the big day!" },
    { school_id: schoolId, event_type: "school_event",  title: "Christmas Program",                             event_date: "2026-12-11", applies_to: "all",   requires_rsvp: true,  all_day: false, start_time: "09:00", end_time: "12:00", max_companions: 4, description: "Our most-awaited event of the year! Enjoy Christmas performances from every class, a gift-giving activity, and a visit from Santa. Reception follows." },
    { school_id: schoolId, event_type: "holiday",        title: "Christmas Day",                                event_date: "2026-12-25", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "holiday",        title: "Rizal Day",                                    event_date: "2026-12-30", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    // ── January 2027 ───────────────────────────────────────────────────────
    { school_id: schoolId, event_type: "holiday",        title: "New Year's Day",                               event_date: "2027-01-01", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "Regular Holiday — No classes." },
    { school_id: schoolId, event_type: "school_event",  title: "Classes Resume — Second Term",                  event_date: "2027-01-04", applies_to: "all",   requires_rsvp: false, all_day: true,  description: "School resumes after the holiday break. Q3 lessons and updated schedules begin this week. Check the class group chat for any changes." },
    { school_id: schoolId, event_type: "school_event",  title: "School Mass & Values Formation — New Year",     event_date: "2027-01-15", applies_to: "all",   requires_rsvp: false, all_day: false, start_time: "08:00", end_time: "09:30", description: "Opening program for the new term with a values formation session. Theme: Hope, Courage, and New Beginnings." },
  ];
  // SY 2025-2026 events are the first 50 rows; trial_new sees only upcoming events.
  if (scenario === "trial_new") {
    eventRows.splice(0, 50);
  }
  await batchInsert(admin, "events", eventRows);

  // ── 16. Proud moments ──────────────────────────────────────────────────────
  const pmRows: Record<string, unknown>[] = [];
  for (let i = 0; i < cfg.proudCount; i++) {
    const sid  = studentIds[i % studentIds.length];
    const tid  = teacherIds[i % teacherIds.length];
    const date = new Date(shiftDate("2025-09-01", mo) + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + (i * 3) % 45);
    pmRows.push({
      school_id: schoolId, student_id: sid,
      created_by: tid ?? null,
      category: PROUD_CATEGORIES[i % PROUD_CATEGORIES.length],
      note: PROUD_NOTES[i % PROUD_NOTES.length],
    });
  }
  await batchInsert(admin, "proud_moments", pmRows);

  // ── 17. Progress observations ───────────────────────────────────────────────
  // Notes per domain × rating level (0=emerging … 3=advanced).
  // Order matches PROGRESS_CATEGORIES: Participation, Social Skills, Communication,
  // Fine Motor, Gross Motor, Cognitive Development, Self-Care.
  const OBS_NOTES_BY_DOMAIN: string[][] = [
    [ // Participation
      "Joins activities when directly invited; hesitant to volunteer independently.",
      "Raised hand during group time; more comfortable with familiar routines.",
      "Participates actively in most activities; occasionally needs a gentle prompt.",
      "Consistently engaged; initiates participation and encourages quieter classmates.",
    ],
    [ // Social Skills
      "Plays near peers but interaction is mostly parallel; limited verbal exchange.",
      "Shares materials when reminded; beginning to take turns with familiar friends.",
      "Initiates interaction with classmates; handles turn-taking with minor support.",
      "Builds friendships naturally; navigates simple conflicts with care and maturity.",
    ],
    [ // Communication
      "Uses single words or gestures to make requests; responds to yes/no questions.",
      "Forms short two-to-three word phrases; answers 'what' questions with support.",
      "Speaks in full sentences; describes events and retells short stories well.",
      "Communicates clearly with peers and adults; uses varied and descriptive vocabulary.",
    ],
    [ // Fine Motor Skills
      "Holds pencil in fist grip; tracing requires significant hand-over-hand support.",
      "Tripod grip emerging with reminders; cuts along straight lines with effort.",
      "Consistent tripod grip; traces shapes accurately and writes name legibly.",
      "Writes name and simple words neatly; uses scissors precisely on curved lines.",
    ],
    [ // Gross Motor Skills
      "Running is unsteady; frequently loses balance during active movement activities.",
      "Balances briefly on one foot; throws ball without consistent direction control.",
      "Hops and skips with coordination; catches a large ball consistently.",
      "Strong balance and fluid coordination; confident movement in all activities.",
    ],
    [ // Cognitive Development
      "Matches colors and shapes by direct example; difficulty applying independently.",
      "Sorts by one attribute; identifies simple patterns with direct guidance.",
      "Counts objects to ten with one-to-one correspondence; extends simple patterns.",
      "Works through concrete problems independently; explains reasoning in simple terms.",
    ],
    [ // Self-Care
      "Requires adult support for most self-care tasks; aware of routines but not yet independent.",
      "Manages snack time alone; needs verbal reminders for the handwashing sequence.",
      "Follows multi-step routines with one prompt; manages personal belongings reliably.",
      "Fully independent in hygiene, belongings, and personal space throughout the day.",
    ],
  ];
  const OBS_RATING_LEVEL: Record<string, number> = { emerging: 0, developing: 1, consistent: 2, advanced: 3 };

  // Growth profiles — realistic longitudinal scenarios.
  // dayOffsets = days from Sep 1 of the school year so observations span Sep 2025 → Mar 2026.
  type ObsGrowthProfile = { ratings: string[]; dayOffsets: number[] };
  function pickObsProfile(si: number): ObsGrowthProfile {
    const bucket = si % 11;
    if (bucket === 0)  return { ratings: ["emerging","developing","consistent"],             dayOffsets: [8,  85, 165] }; // steady improver
    if (bucket === 1)  return { ratings: ["developing","developing","consistent"],            dayOffsets: [15, 90, 170] }; // plateau then breakthrough
    if (bucket === 2)  return { ratings: ["consistent","consistent","advanced"],              dayOffsets: [10,100, 180] }; // near mastery
    if (bucket === 3)  return { ratings: ["emerging","emerging","developing","consistent"],   dayOffsets: [6,  40, 105, 175] }; // slow start, strong finish
    if (bucket === 4)  return { ratings: ["emerging","developing"],                           dayOffsets: [12,  52] }; // stale: last obs Oct 2025
    if (bucket === 5)  return { ratings: ["consistent","developing"],                         dayOffsets: [14,  82] }; // regression/concern
    if (bucket === 6)  return { ratings: ["developing","consistent","advanced"],              dayOffsets: [9,  60, 115] }; // high achiever
    if (bucket === 7)  return { ratings: ["developing","consistent","consistent"],            dayOffsets: [20,  72, 155] }; // solid mid-range
    if (bucket === 8)  return { ratings: ["emerging","developing","developing","consistent"], dayOffsets: [5,  38,  80, 158] }; // gradual builder
    if (bucket === 9)  return { ratings: ["emerging"],                                        dayOffsets: [18] }; // needs attention: single obs
    return                    { ratings: ["consistent","advanced"],                           dayOffsets: [8,  75] }; // early advanced
  }

  const obsRows: Record<string, unknown>[] = [];
  const observeCount = Math.floor(studentIds.length * cfg.observeFraction);
  const obsYearStart = shiftDate("2025-09-01", mo);

  for (let si = 0; si < observeCount; si++) {
    const sid = studentIds[si];
    const profile = pickObsProfile(si);
    // 2–4 domains per student, spread by student index to avoid uniformity
    const domainCount = 2 + (si % 3);
    const domainIndices = [...new Set(
      Array.from({ length: Math.min(domainCount, categoryIds.length) }, (_, k) => (si * 3 + k * 2) % categoryIds.length)
    )];

    domainIndices.forEach((domIdx) => {
      const catId = categoryIds[domIdx];
      profile.ratings.forEach((rating, obsIdx) => {
        const d = new Date(obsYearStart + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + profile.dayOffsets[obsIdx] + domIdx); // 1-day stagger per domain
        const ratingLevel = OBS_RATING_LEVEL[rating] ?? 0;
        const notePool    = OBS_NOTES_BY_DOMAIN[domIdx] ?? OBS_NOTES_BY_DOMAIN[0];
        obsRows.push({
          student_id:  sid,
          category_id: catId,
          rating,
          note:        notePool[Math.min(ratingLevel, notePool.length - 1)],
          observed_at: d.toISOString().slice(0, 10),
          visibility:  (ratingLevel === 0 && si % 4 === 0) ? "internal_only" : "parent_visible",
          observed_by: teacherIds[(si + domIdx) % teacherIds.length] ?? null,
        });
      });
    });
  }

  if (obsRows.length) await batchInsert(admin, "progress_observations", obsRows);

  // ── 18. Enrollment inquiries ────────────────────────────────────────────────
  if (scenario !== "trial_new") {
    const inquiryStatuses = ["inquiry","assessment_scheduled","waitlisted","offered_slot","not_proceeding"] as const;
    const inquiryRows: Record<string, unknown>[] = Array.from({ length: scenario === "compliance_heavy" ? 15 : 8 }, (_, i) => ({
      school_id: schoolId,
      child_name: INQUIRY_CHILD_NAMES[i % INQUIRY_CHILD_NAMES.length],
      parent_name: INQUIRY_PARENT_NAMES[i % INQUIRY_PARENT_NAMES.length],
      contact: `0918${String((i * 7654321 + 1000000) % 9000000 + 1000000)}`,
      email: `inquiry.demo.${batchId}.${i + 1}@example.com`,
      desired_class: cfg.classes[i % cfg.classes.length].name,
      school_year_id: schoolYearId,
      inquiry_source: ["walk-in","referral","social_media","flyer","website"][i % 5],
      status: inquiryStatuses[i % inquiryStatuses.length],
      notes: i % 3 === 0 ? "Family relocated to the area. Very interested in enrolling." : null,
    }));
    await batchInsert(admin, "enrollment_inquiries", inquiryRows);
  }

  // ── 19. Holidays ────────────────────────────────────────────────────────────
  await batchInsert(admin, "holidays", [
    { school_id: schoolId, name: "National Heroes Day",   date: shiftDate("2025-08-25", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "All Saints Day",        date: shiftDate("2025-11-01", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "All Souls Day",         date: shiftDate("2025-11-02", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "Bonifacio Day",         date: shiftDate("2025-11-30", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "Immaculate Conception", date: shiftDate("2025-12-08", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "Christmas Break",       date: shiftDate("2025-12-20", mo), applies_to_all: true, is_no_class: true },
    { school_id: schoolId, name: "New Year Holiday",      date: shiftDate("2026-01-01", mo), applies_to_all: true, is_no_class: true },
  ]);

  // ── 20. Uploaded files (placeholder rows — no real storage uploads) ─────────
  const fileRows: Record<string, unknown>[] = [];
  for (let i = 0; i < cfg.uploadedFilesCount; i++) {
    const entityType = ["parent_update","student","payment"][i % 3];
    fileRows.push({
      school_id: schoolId,
      uploaded_by: actorUserId,
      related_entity_type: entityType,
      related_entity_id: entityType === "student" ? studentIds[i % studentIds.length] : null,
      bucket: "updates-media",
      storage_path: `demo-placeholder/${schoolId}/${batchId}/file-${i + 1}.jpg`,
      file_size: 102400 + i * 51200,
      mime_type: "image/jpeg",
      status: "active",
    });
  }
  if (fileRows.length) await batchInsert(admin, "uploaded_files", fileRows);

  // ── 21. Grading scale sets (Skills Progress + Numeric 1-5) ──────────────────
  const { data: skillsSet } = await (admin as any)
    .from("grading_scale_sets")
    .insert({ school_id: schoolId, name: "Skills Progress Scale", description: "A progress-focused scale describing the level of support a student needs.", scale_mode: "label_only", is_default: false })
    .select("id").single();
  if (skillsSet?.id) {
    await batchInsert(admin, "grading_scales", [
      { school_id: schoolId, scale_set_id: skillsSet.id, label: "Needs Support", description: "Requires frequent guidance",                  color: "#ef4444", min_score: null, max_score: null, sort_order: 1 },
      { school_id: schoolId, scale_set_id: skillsSet.id, label: "Progressing",   description: "Improving with some support",                 color: "#f97316", min_score: null, max_score: null, sort_order: 2 },
      { school_id: schoolId, scale_set_id: skillsSet.id, label: "Independent",   description: "Performs skill without help",                 color: "#22c55e", min_score: null, max_score: null, sort_order: 3 },
      { school_id: schoolId, scale_set_id: skillsSet.id, label: "Mastered",      description: "Performs skill consistently across settings", color: "#6366f1", min_score: null, max_score: null, sort_order: 4 },
    ]);
  }

  const { data: numericSet } = await (admin as any)
    .from("grading_scale_sets")
    .insert({ school_id: schoolId, name: "Numeric 1–5 Scale", description: "A five-point numeric scale where each number represents a clear performance level.", scale_mode: "range_based", is_default: false })
    .select("id").single();
  if (numericSet?.id) {
    await batchInsert(admin, "grading_scales", [
      { school_id: schoolId, scale_set_id: numericSet.id, label: "1 – Needs Improvement",  description: "Well below expectations",              color: "#ef4444", min_score: 1, max_score: 1, sort_order: 1 },
      { school_id: schoolId, scale_set_id: numericSet.id, label: "2 – Developing",         description: "Approaching expectations",             color: "#f97316", min_score: 2, max_score: 2, sort_order: 2 },
      { school_id: schoolId, scale_set_id: numericSet.id, label: "3 – Meets Expectations", description: "Meets standard",                       color: "#eab308", min_score: 3, max_score: 3, sort_order: 3 },
      { school_id: schoolId, scale_set_id: numericSet.id, label: "4 – Strong",             description: "Above expectations",                   color: "#22c55e", min_score: 4, max_score: 4, sort_order: 4 },
      { school_id: schoolId, scale_set_id: numericSet.id, label: "5 – Excellent",          description: "Significantly exceeds expectations",   color: "#6366f1", min_score: 5, max_score: 5, sort_order: 5 },
    ]);
  }

  return {
    studentCount:       studentIds.length,
    teacherCount:       teacherIds.length,
    parentCount:        parentIds.length,
    classCount:         classIds.length,
    attendanceCount:    attendRows.length,
    billingCount:       billingRows.length + activeEnrollBillingCount,
    paymentCount:       payRows.length + activeEnrollPaymentCount,
    updatesCount:       updateRows.length,
    proudMomentsCount:  pmRows.length,
    observationCount:   obsRows.length,
    uploadedFilesCount: fileRows.length,
    demoUserIds,
    credentials: {
      password,
      admin:    { email: adminEmail, fullName: adminFullName },
      teachers: teacherIds.map((_uid, i) => ({
        email: teacherEmail(i),
        fullName: `${teacherFirst(i)} ${lastName(i * 2)}`,
      })),
      parents: parentIds.map((_uid, i) => {
        const female = i % 3 !== 2;
        const first  = female ? T_FEMALE[i % T_FEMALE.length] : T_MALE[i % T_MALE.length];
        return { email: parentEmail(i), fullName: `${first} ${lastName(i * 5 + 3)}` };
      }),
    },
  };
}

// ─── Cleaner ──────────────────────────────────────────────────────────────────

/**
 * Delete wrapper that throws on PostgREST error. The legacy clear path silently
 * swallowed FK / RLS rejections — that's how unmigrated child_documents rows
 * blocked the students delete and produced duplicate students on the next
 * refresh. New deletes added during the document-coordination work go through
 * here; legacy lines are left as-is to keep the diff focused.
 */
async function mustDelete(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await build((admin as any).from(table).delete());
  if (error) throw new Error(`clearDemoData: failed to delete from ${table}: ${error.message}`);
}

export async function clearDemoData(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  demoUserIds: string[],
): Promise<void> {

  // Safety: hard-block on non-demo schools
  const { data: school } = await (admin as any).from("schools").select("id, is_demo").eq("id", schoolId).single();
  if (!school?.is_demo) throw new Error("School is not marked as a demo school. Clear operation blocked.");

  // Fetch class IDs and student IDs scoped to this school
  const { data: classes }  = await (admin as any).from("classes").select("id").eq("school_id", schoolId);
  const classIds: string[] = (classes ?? []).map((c: any) => c.id);

  const { data: students }   = await (admin as any).from("students").select("id").eq("school_id", schoolId);
  const studentIds: string[] = (students ?? []).map((s: any) => s.id);

  const { data: brs }       = await (admin as any).from("billing_records").select("id").eq("school_id", schoolId);
  const brIds: string[]     = (brs ?? []).map((b: any) => b.id);

  const { data: pms }       = await (admin as any).from("proud_moments").select("id").eq("school_id", schoolId);
  const pmIds: string[]     = (pms ?? []).map((p: any) => p.id);

  const { data: evts }      = await (admin as any).from("events").select("id").eq("school_id", schoolId);
  const eventIds: string[]  = (evts ?? []).map((e: any) => e.id);

  // Delete in FK-safe order
  if (pmIds.length)     await (admin as any).from("proud_moment_reactions").delete().in("proud_moment_id", pmIds);
  if (brIds.length)     await (admin as any).from("payments").delete().in("billing_record_id", brIds);
  if (brIds.length)     await (admin as any).from("billing_discounts").delete().in("billing_record_id", brIds);
  if (brIds.length)     await (admin as any).from("billing_records").delete().in("id", brIds);
  if (classIds.length)  await (admin as any).from("attendance_records").delete().in("class_id", classIds);
  if (studentIds.length) await (admin as any).from("progress_observations").delete().in("student_id", studentIds);
  if (pmIds.length)     await (admin as any).from("proud_moments").delete().in("id", pmIds);
  if (eventIds.length)  await (admin as any).from("event_rsvps").delete().in("event_id", eventIds);
  await (admin as any).from("absence_notifications").delete().eq("school_id", schoolId);
  await (admin as any).from("parent_updates").delete().eq("school_id", schoolId);
  await (admin as any).from("uploaded_files").delete().eq("school_id", schoolId);
  if (classIds.length)   await (admin as any).from("class_teachers").delete().in("class_id", classIds);
  await (admin as any).from("teacher_profiles").delete().eq("school_id", schoolId);
  if (studentIds.length) await (admin as any).from("enrollments").delete().in("student_id", studentIds);
  await (admin as any).from("classes").delete().eq("school_id", schoolId);
  await (admin as any).from("class_levels").delete().eq("school_id", schoolId);
  await (admin as any).from("academic_periods").delete().eq("school_id", schoolId); // cascades → tuition_configs
  await (admin as any).from("fee_types").delete().eq("school_id", schoolId);
  await (admin as any).from("discounts").delete().eq("school_id", schoolId);
  await (admin as any).from("events").delete().eq("school_id", schoolId);
  await (admin as any).from("holidays").delete().eq("school_id", schoolId);
  await (admin as any).from("enrollment_inquiries").delete().eq("school_id", schoolId);
  await (admin as any).from("progress_categories").delete().eq("school_id", schoolId);
  await (admin as any).from("grading_scales").delete().eq("school_id", schoolId);
  await (admin as any).from("grading_scale_sets").delete().eq("school_id", schoolId);

  // Document chain — migration 054 puts ON DELETE RESTRICT FKs from
  // child_documents / document_consents / document_requests back to students.
  // If anything was uploaded since the last clear, the students delete below
  // will silently fail (PostgREST returns an error, not a throw) and the next
  // generate run lands fresh students on top of the survivors → duplicates.
  // Order: grants (RESTRICT FK to consents) → consents/requests → demote
  // heads (CHECK requires version on non-draft) → versions → heads.
  const { data: docs } = await (admin as any).from("child_documents").select("id").eq("school_id", schoolId);
  const docIds: string[] = (docs ?? []).map((d: any) => d.id);
  await mustDelete(admin, "document_access_grants", q => q.eq("school_id", schoolId));
  await mustDelete(admin, "document_requests",      q => q.eq("school_id", schoolId));
  await mustDelete(admin, "document_consents",      q => q.eq("school_id", schoolId));
  if (docIds.length) {
    const upd = await (admin as any).from("child_documents")
      .update({ status: "draft", current_version_id: null })
      .in("id", docIds);
    if (upd.error) throw new Error(`clearDemoData: failed to demote child_documents: ${upd.error.message}`);
    await mustDelete(admin, "child_document_versions", q => q.in("document_id", docIds));
    await mustDelete(admin, "child_documents",         q => q.in("id", docIds));
  }
  await mustDelete(admin, "document_access_events", q => q.eq("school_id", schoolId));
  await mustDelete(admin, "external_contacts",      q => q.eq("school_id", schoolId));

  // student_plans — FK to students is RESTRICT; delete sub-rows first
  const { data: planData } = await (admin as any).from("student_plans").select("id").eq("school_id", schoolId);
  const planIds: string[] = (planData ?? []).map((p: any) => p.id);
  if (planIds.length) {
    await mustDelete(admin, "student_plan_attachments",      q => q.in("plan_id", planIds));
    await mustDelete(admin, "student_plan_progress_entries", q => q.in("plan_id", planIds));
    await mustDelete(admin, "student_plan_interventions",    q => q.in("plan_id", planIds));
    await mustDelete(admin, "student_plan_goals",            q => q.in("plan_id", planIds));
    await mustDelete(admin, "student_plans",                 q => q.in("id", planIds));
  }

  if (studentIds.length) await (admin as any).from("guardians").delete().in("student_id", studentIds);
  await mustDelete(admin, "students", q => q.eq("school_id", schoolId));
  await (admin as any).from("school_years").delete().eq("school_id", schoolId);
  // Collect all teacher/parent/school_admin profile IDs for this school before
  // deleting profiles (covers users from failed runs not recorded in demoUserIds).
  // Super_admins are deliberately excluded — that's the operator running this.
  const { data: demoProfiles } = await (admin as any)
    .from("profiles").select("id").eq("school_id", schoolId).in("role", ["teacher", "parent", "school_admin"]);
  const allDemoUserIds = [...new Set([
    ...demoUserIds,
    ...(demoProfiles ?? []).map((p: any) => p.id as string),
  ])];

  await (admin as any).from("profiles").delete().eq("school_id", schoolId).in("role", ["teacher", "parent", "school_admin"]);

  for (const uid of allDemoUserIds) {
    try {
      await (admin as any).auth.admin.deleteUser(uid);
    } catch {
      // Non-fatal: user may have already been deleted
    }
  }
}

// ─── Scenario metadata (for UI display) ──────────────────────────────────────

export function getScenarioLabel(s: DemoScenario): string { return SCENARIOS[s].label; }
export function getScenarioDescription(s: DemoScenario): string { return SCENARIOS[s].description; }
export const DEMO_SCENARIOS: DemoScenario[] = ["small_preschool", "compliance_heavy", "trial_new"];
