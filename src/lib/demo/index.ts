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
function billingStatus(monthIdx: number, totalMonths: number, studentIdx: number): "unpaid" | "partial" | "paid" | "overdue" {
  const recency = totalMonths - 1 - monthIdx; // 0=oldest, higher=more recent
  const variant = (studentIdx * 11 + monthIdx * 7) % 10;
  if (recency >= 2) {
    // older months: mostly paid
    return variant < 8 ? "paid" : "partial";
  }
  if (recency === 1) {
    // one month back: mixed
    if (variant < 5) return "paid";
    if (variant < 7) return "partial";
    if (variant < 9) return "unpaid";
    return "overdue";
  }
  // current month: mostly unpaid/partial
  if (variant < 3) return "paid";
  if (variant < 6) return "partial";
  if (variant < 9) return "unpaid";
  return "overdue";
}

// ─── Scenario configs ─────────────────────────────────────────────────────────

interface ClassDef { name: string; level: string; nextLevel: string; startTime: string; endTime: string; capacity: number; }

interface ScenarioDef {
  label:           string;
  description:     string;
  classes:         ClassDef[];
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
}

const SCENARIOS: Record<DemoScenario, ScenarioDef> = {
  small_preschool: {
    label: "Small Preschool",
    description: "General walkthrough — 4 classes, ~38 students, complete setup",
    classes: [
      { name: "Toddler Playgroup",   level: "Toddler",    nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 12 },
      { name: "Pre-Kinder A",        level: "Pre-Kinder", nextLevel: "Kinder",     startTime: "08:00", endTime: "11:00", capacity: 15 },
      { name: "Kinder A",            level: "Kinder",     nextLevel: "GRADUATE",   startTime: "08:00", endTime: "11:30", capacity: 15 },
      { name: "Kinder B",            level: "Kinder",     nextLevel: "GRADUATE",   startTime: "13:00", endTime: "16:00", capacity: 15 },
    ],
    studentsPerClass: [9, 10, 10, 9],
    parentCount: 10,
    billingMonths: ["2025-08-01","2025-09-01","2025-10-01","2025-11-01"],
    attendStart: "2025-09-01",
    attendEnd:   "2025-10-17",
    updateCount:     8,
    proudCount:      15,
    observeFraction: 0.7,
    uploadedFilesCount: 6,
    tuitionAmount: 3500,
  },
  compliance_heavy: {
    label: "Compliance-Heavy School",
    description: "Media-heavy documentation and reporting — 8 classes, ~80 students",
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
    studentsPerClass: [10, 9, 10, 10, 10, 10, 11, 10],
    parentCount: 15,
    billingMonths: ["2025-07-01","2025-08-01","2025-09-01","2025-10-01","2025-11-01","2025-12-01"],
    attendStart: "2025-09-01",
    attendEnd:   "2025-09-30",
    updateCount:     20,
    proudCount:      40,
    observeFraction: 0.9,
    uploadedFilesCount: 25,
    tuitionAmount: 4200,
  },
  trial_new: {
    label: "New Trial School",
    description: "Onboarding & incomplete setup — 2 classes, 15 students, minimal data",
    classes: [
      { name: "Playgroup",  level: "Playgroup",  nextLevel: "Pre-Kinder", startTime: "08:00", endTime: "10:30", capacity: 15 },
      { name: "Pre-Kinder", level: "Pre-Kinder", nextLevel: "GRADUATE",   startTime: "08:00", endTime: "11:00", capacity: 15 },
    ],
    studentsPerClass: [8, 7],
    parentCount: 5,
    billingMonths: ["2025-09-01","2025-10-01"],
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
  const teacherCount = cfg.classes.length; // 1 teacher per class
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
  const regularPeriodId: string | null = (apData ?? []).find((a: any) => a.name === "Regular Term")?.id ?? null;

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
        total_amount: levelTuition[lvl] * archivedBillingMonths,
        months: archivedBillingMonths,
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
        school_id: schoolId, name, kind: "core", display_order: i,
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

  const ctRows = [
    ...classIds.map((cid, i) => ({ class_id: cid, teacher_id: teacherProfileIds[i % teacherProfileIds.length] })),
    ...nextClassIds.map((cid, i) => ({ class_id: cid, teacher_id: teacherProfileIds[i % teacherProfileIds.length] })),
  ];
  await batchInsert(admin, "class_teachers", ctRows);

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

  // ── 13. Billing records + payments ─────────────────────────────────────────
  const shiftedBillingMonths = cfg.billingMonths.map((m) => shiftDate(m, mo));
  const billingRows: Record<string, unknown>[] = [];
  shiftedBillingMonths.forEach((month, monthIdx) => {
    studentIds.forEach((sid, studentIdx) => {
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
  const METHODS: string[] = ["gcash","cash","bank_transfer","maya","cash"];
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
  const eventRows: Record<string, unknown>[] = [
    { school_id: schoolId, title: "Opening Day Ceremony", event_date: shiftDate("2025-06-02", mo), applies_to: "all", requires_rsvp: false, all_day: true },
    { school_id: schoolId, title: "National Heroes Day Celebration", event_date: shiftDate("2025-08-25", mo), applies_to: "all", requires_rsvp: false, all_day: true },
    { school_id: schoolId, title: "Family Fun Day", event_date: shiftDate("2025-10-18", mo), applies_to: "all", requires_rsvp: true, all_day: true, description: "Join us for a day of games, food, and family bonding!" },
    { school_id: schoolId, title: "Christmas Program", event_date: shiftDate("2025-12-12", mo), applies_to: "all", requires_rsvp: true, all_day: false, start_time: "09:00", end_time: "12:00", description: "Our annual Christmas celebration with performances from each class." },
    { school_id: schoolId, title: "Graduation Day", event_date: shiftDate("2026-03-27", mo), applies_to: "all", requires_rsvp: true, all_day: false, start_time: "09:00", end_time: "12:00" },
  ];
  if (scenario !== "trial_new") {
    eventRows.push(
      { school_id: schoolId, title: "Nutrition Month Activity", event_date: shiftDate("2025-07-15", mo), applies_to: "all", requires_rsvp: false, all_day: true },
      { school_id: schoolId, title: "Foundation Day", event_date: shiftDate("2025-09-05", mo), applies_to: "all", requires_rsvp: false, all_day: true },
    );
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
  const obsRows: Record<string, unknown>[] = [];
  const RATINGS = ["emerging","developing","consistent","advanced"] as const;
  const observeCount = Math.floor(studentIds.length * cfg.observeFraction);
  for (let si = 0; si < observeCount; si++) {
    const sid = studentIds[si];
    // 2–3 observations per observed student (different categories)
    const catSample = categoryIds.slice(0, Math.min(3, categoryIds.length));
    catSample.forEach((catId, ci) => {
      const date = new Date(shiftDate("2025-10-01", mo) + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + (si + ci * 5) % 14);
      obsRows.push({
        student_id: sid, category_id: catId,
        rating: RATINGS[(si * 3 + ci) % RATINGS.length],
        note: `Observed during class activities. Showing ${RATINGS[(si * 3 + ci) % RATINGS.length]} progress.`,
        observed_at: date.toISOString().slice(0, 10),
        visibility: ci % 3 === 0 ? "internal_only" : "parent_visible",
        observed_by: teacherIds[si % teacherIds.length] ?? null,
      });
    });
  }
  if (obsRows.length) await batchInsert(admin, "progress_observations", obsRows);

  // ── 18. Enrollment inquiries ────────────────────────────────────────────────
  if (scenario !== "trial_new") {
    const inquiryStatuses = ["inquiry","assessment_scheduled","waitlisted","offered_slot","not_proceeding"] as const;
    const inquiryRows: Record<string, unknown>[] = Array.from({ length: scenario === "compliance_heavy" ? 15 : 8 }, (_, i) => ({
      school_id: schoolId,
      child_name: `${studentFirst(i + 50, i % 2 === 0)} ${lastName(i + 50)}`,
      parent_name: `${T_FEMALE[i % T_FEMALE.length]} ${lastName(i + 60)}`,
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

  return {
    studentCount:       studentIds.length,
    teacherCount:       teacherIds.length,
    parentCount:        parentIds.length,
    classCount:         classIds.length,
    attendanceCount:    attendRows.length,
    billingCount:       billingRows.length,
    paymentCount:       payRows.length,
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
