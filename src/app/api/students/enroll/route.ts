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
  const level              = typeof body.level              === "string" ? body.level.trim()        : null;
  const schoolYearId       = typeof body.schoolYearId       === "string" ? body.schoolYearId       : null;
  const academicPeriodId   = typeof body.academicPeriodId   === "string" ? body.academicPeriodId   : null;
  const rawStatus          = typeof body.status             === "string" ? body.status             : "enrolled";
  const startDate          = typeof body.startDate          === "string" ? body.startDate          : null;
  const endDate            = typeof body.endDate            === "string" ? body.endDate            : null;
  // Optional: present only when placing a promoted-pending-placement student
  const sourceEnrollmentId = typeof body.sourceEnrollmentId === "string" ? body.sourceEnrollmentId : null;

  if (!studentId || !schoolYearId) {
    return NextResponse.json({ error: "studentId and schoolYearId are required." }, { status: 400 });
  }
  if (!classId && !level) {
    return NextResponse.json({ error: "Either classId or level is required." }, { status: 400 });
  }
  if (level && level.length > 100) {
    return NextResponse.json({ error: "Level value is too long." }, { status: 400 });
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

  // Verify student and school year belong to the caller's school
  const [studentRes, yearRes] = await Promise.all([
    admin.from("students").select("school_id").eq("id", studentId).maybeSingle(),
    admin.from("school_years").select("school_id, status").eq("id", schoolYearId).maybeSingle(),
  ]);

  if (!studentRes.data || studentRes.data.school_id !== schoolId) {
    return NextResponse.json({ error: "Student does not belong to your school." }, { status: 403 });
  }
  if (!yearRes.data || yearRes.data.school_id !== schoolId) {
    return NextResponse.json({ error: "School year does not belong to your school." }, { status: 403 });
  }
  if (yearRes.data.status !== "active") {
    const label = yearRes.data.status === "planned" || yearRes.data.status === "draft"
      ? "planned — activate it in Settings first"
      : "closed — enrollments are no longer accepted";
    return NextResponse.json(
      { error: `This school year is ${label}.` },
      { status: 422 }
    );
  }

  // ── Resolve classId ────────────────────────────────────────────────────────
  // When classId is provided directly, verify it belongs to the school.
  // When level is provided instead, look up (or create) the Unassigned
  // placeholder class for that level + year. This keeps class_id NOT NULL.
  let resolvedClassId: string;

  if (classId) {
    const classRes = await admin
      .from("classes")
      .select("school_id")
      .eq("id", classId)
      .maybeSingle();
    if (!classRes.data || classRes.data.school_id !== schoolId) {
      return NextResponse.json({ error: "Class does not belong to your school." }, { status: 403 });
    }
    resolvedClassId = classId;
  } else {
    // Verify the level exists in at least one active non-system class for this school+year.
    // This prevents arbitrary level strings from creating garbage placeholder classes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: levelRows } = await (admin as any)
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .eq("school_year_id", schoolYearId)
      .eq("level", level)
      .eq("is_active", true)
      .eq("is_system", false)
      .limit(1);

    if (!levelRows || levelRows.length === 0) {
      return NextResponse.json(
        { error: `No active class found for level "${level}" this school year. Create a class for this level first.` },
        { status: 422 }
      );
    }

    // Level-based enrollment: find or create the Unassigned placeholder class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (admin as any)
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .eq("school_year_id", schoolYearId)
      .eq("level", level)
      .eq("is_system", true)
      .maybeSingle();

    if (existing?.id) {
      resolvedClassId = existing.id;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error: createErr } = await (admin as any)
        .from("classes")
        .insert({
          school_id:      schoolId,
          school_year_id: schoolYearId,
          name:           `[Unassigned] ${level}`,
          level,
          is_system:      true,
          capacity:       9999,
          start_time:     "00:00",
          end_time:       "00:00",
          is_active:      true,
        })
        .select("id")
        .single();
      if (createErr || !created?.id) {
        console.error("[students/enroll] Failed to create Unassigned class:", createErr);
        return NextResponse.json({ error: "Failed to create placement class." }, { status: 500 });
      }
      resolvedClassId = created.id;
    }
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

  // Check if the student already has an enrollment for this school year.
  // If so, update the existing record (class change) instead of inserting a duplicate,
  // which would violate the UNIQUE (student_id, school_year_id) constraint.
  const { data: existing } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .maybeSingle();

  let enrollmentId: string;

  if (existing?.id) {
    // Update existing enrollment to the new class
    const { error: updateErr } = await admin
      .from("enrollments")
      .update({
        class_id:           resolvedClassId,
        academic_period_id: academicPeriodId ?? undefined,
        status,
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate   ? { end_date:   endDate   } : {}),
      })
      .eq("id", existing.id);

    if (updateErr) {
      console.error("[students/enroll] Update failed:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    enrollmentId = existing.id;

    await insertAuditLog(admin, {
      schoolId,
      actorUserId: user.id,
      actorRole:   caller.role,
      tableName:   "enrollments",
      recordId:    enrollmentId,
      action:      "UPDATE",
      newValues:   { class_id: resolvedClassId, status, school_year_id: schoolYearId },
    });
  } else {
    // Insert new enrollment
    const { data: inserted, error: insertErr } = await admin.from("enrollments").insert({
      student_id:         studentId,
      class_id:           resolvedClassId,
      school_year_id:     schoolYearId,
      academic_period_id: academicPeriodId,
      status,
      start_date:         startDate,
      end_date:           endDate,
    }).select("id").single();

    if (insertErr) {
      console.error("[students/enroll] Insert failed:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    enrollmentId = inserted!.id;

    await insertAuditLog(admin, {
      schoolId,
      actorUserId: user.id,
      actorRole:   caller.role,
      tableName:   "enrollments",
      recordId:    enrollmentId,
      action:      "INSERT",
      newValues:   { student_id: studentId, class_id: resolvedClassId, level, school_year_id: schoolYearId, status },
    });
  }

  // Mark the source enrollment as placed (only for pending-placement flow)
  if (sourceEnrollmentId) {
    await admin
      .from("enrollments")
      .update({ progression_status: "placed" })
      .eq("id", sourceEnrollmentId);

    await insertAuditLog(admin, {
      schoolId,
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
