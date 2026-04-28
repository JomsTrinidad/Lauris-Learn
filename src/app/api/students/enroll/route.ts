import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const VALID_STATUSES = ["enrolled", "waitlisted", "inquiry", "withdrawn", "completed"] as const;
type EnrollStatus = (typeof VALID_STATUSES)[number];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const studentId          = typeof body.studentId          === "string" ? body.studentId          : null;
  const classId            = typeof body.classId            === "string" ? body.classId            : null;
  const schoolYearId       = typeof body.schoolYearId       === "string" ? body.schoolYearId       : null;
  const academicPeriodId   = typeof body.academicPeriodId   === "string" ? body.academicPeriodId   : null;
  const rawStatus          = typeof body.status             === "string" ? body.status             : "enrolled";
  const startDate          = typeof body.startDate          === "string" ? body.startDate          : null;
  const endDate            = typeof body.endDate            === "string" ? body.endDate            : null;
  // Optional: present only when placing a promoted-pending-placement student
  const sourceEnrollmentId = typeof body.sourceEnrollmentId === "string" ? body.sourceEnrollmentId : null;

  if (!studentId || !classId || !schoolYearId) {
    return NextResponse.json({ error: "studentId, classId, and schoolYearId are required." }, { status: 400 });
  }
  const status: EnrollStatus = VALID_STATUSES.includes(rawStatus as EnrollStatus)
    ? (rawStatus as EnrollStatus)
    : "enrolled";

  // Verify caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify caller's role and get their school_id from the database
  const { data: caller } = await admin
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .single();

  if (!caller?.school_id) {
    return NextResponse.json({ error: "Your account is not linked to a school." }, { status: 403 });
  }
  if (caller.role === "parent") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const schoolId = caller.school_id;

  // Verify all referenced entities belong to the caller's school
  const [studentRes, classRes, yearRes] = await Promise.all([
    admin.from("students").select("school_id").eq("id", studentId).maybeSingle(),
    admin.from("classes").select("school_id").eq("id", classId).maybeSingle(),
    admin.from("school_years").select("school_id").eq("id", schoolYearId).maybeSingle(),
  ]);

  if (!studentRes.data || studentRes.data.school_id !== schoolId) {
    return NextResponse.json({ error: "Student does not belong to your school." }, { status: 403 });
  }
  if (!classRes.data || classRes.data.school_id !== schoolId) {
    return NextResponse.json({ error: "Class does not belong to your school." }, { status: 403 });
  }
  if (!yearRes.data || yearRes.data.school_id !== schoolId) {
    return NextResponse.json({ error: "School year does not belong to your school." }, { status: 403 });
  }

  if (academicPeriodId) {
    const { data: period } = await admin
      .from("academic_periods")
      .select("school_id")
      .eq("id", academicPeriodId)
      .maybeSingle();
    if (!period || period.school_id !== schoolId) {
      return NextResponse.json({ error: "Academic period does not belong to your school." }, { status: 403 });
    }
  }

  // Validate source enrollment when placing a promoted-pending-placement student
  if (sourceEnrollmentId) {
    const { data: srcEnroll } = await admin
      .from("enrollments")
      .select("id, student_id, progression_status, students!inner(school_id)")
      .eq("id", sourceEnrollmentId)
      .maybeSingle() as { data: { id: string; student_id: string; progression_status: string | null; students: { school_id: string } } | null };

    if (!srcEnroll) {
      return NextResponse.json({ error: "Source enrollment not found." }, { status: 404 });
    }
    if (srcEnroll.students.school_id !== schoolId) {
      return NextResponse.json({ error: "Source enrollment does not belong to your school." }, { status: 403 });
    }
    if (srcEnroll.student_id !== studentId) {
      return NextResponse.json({ error: "Source enrollment does not belong to this student." }, { status: 422 });
    }
    if (srcEnroll.progression_status !== "promoted_pending_placement") {
      return NextResponse.json(
        { error: "Source enrollment is not in promoted_pending_placement status." },
        { status: 422 }
      );
    }
  }

  // Insert the enrollment — return id for audit log
  const { data: inserted, error: insertErr } = await admin.from("enrollments").insert({
    student_id: studentId,
    class_id: classId,
    school_year_id: schoolYearId,
    academic_period_id: academicPeriodId,
    status,
    start_date: startDate,
    end_date: endDate,
  }).select("id").single();

  if (insertErr) {
    // Surface duplicate-key as a friendlier message
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "This student is already enrolled in that class for this school year." },
        { status: 409 }
      );
    }
    console.error("[students/enroll] Insert failed:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Audit — service-role bypasses auth.uid() so triggers can't fire; write manually
  await insertAuditLog(admin, {
    schoolId:    schoolId,
    actorUserId: user.id,
    actorRole:   caller.role,
    tableName:   "enrollments",
    recordId:    inserted?.id ?? null,
    action:      "INSERT",
    newValues:   { student_id: studentId, class_id: classId, school_year_id: schoolYearId, status },
  });

  // Mark the source enrollment as placed (only for pending-placement flow)
  if (sourceEnrollmentId) {
    await admin
      .from("enrollments")
      .update({ progression_status: "placed" })
      .eq("id", sourceEnrollmentId);

    await insertAuditLog(admin, {
      schoolId:    schoolId,
      actorUserId: user.id,
      actorRole:   caller.role,
      tableName:   "enrollments",
      recordId:    sourceEnrollmentId,
      action:      "UPDATE",
      newValues:   { progression_status: "placed", source: "pending_placement" },
    });
  }

  return NextResponse.json({ ok: true });
}
