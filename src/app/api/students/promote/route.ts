import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface EnrollRow {
  studentId: string;
  studentName: string;
  classId: string;
}

interface GraduateRow {
  enrollmentId: string;
  studentName: string;
}

interface PromoteResult {
  created: number;
  graduated: number;
  skipped: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const targetSchoolYearId = typeof body.targetSchoolYearId === "string" ? body.targetSchoolYearId : null;
  const enrollRows  = Array.isArray(body.enroll)   ? (body.enroll   as unknown[]) : [];
  const graduateRows = Array.isArray(body.graduate) ? (body.graduate as unknown[]) : [];

  if (!targetSchoolYearId) {
    return NextResponse.json({ error: "targetSchoolYearId is required." }, { status: 400 });
  }
  if (enrollRows.length === 0 && graduateRows.length === 0) {
    return NextResponse.json({ error: "No rows to process." }, { status: 400 });
  }

  // Parse and type-check row arrays
  const parsedEnroll: EnrollRow[] = [];
  for (const r of enrollRows) {
    if (
      typeof (r as Record<string, unknown>).studentId !== "string" ||
      typeof (r as Record<string, unknown>).classId   !== "string"
    ) {
      return NextResponse.json({ error: "Invalid enroll row shape." }, { status: 400 });
    }
    const row = r as Record<string, unknown>;
    parsedEnroll.push({
      studentId:   row.studentId   as string,
      studentName: typeof row.studentName === "string" ? row.studentName : "",
      classId:     row.classId     as string,
    });
  }
  const parsedGraduate: GraduateRow[] = [];
  for (const r of graduateRows) {
    if (typeof (r as Record<string, unknown>).enrollmentId !== "string") {
      return NextResponse.json({ error: "Invalid graduate row shape." }, { status: 400 });
    }
    const row = r as Record<string, unknown>;
    parsedGraduate.push({
      enrollmentId: row.enrollmentId as string,
      studentName:  typeof row.studentName === "string" ? row.studentName : "",
    });
  }

  // Verify caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify caller role and school_id
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

  // Verify the target school year belongs to this school
  const { data: yearRow } = await admin
    .from("school_years")
    .select("school_id")
    .eq("id", targetSchoolYearId)
    .maybeSingle();
  if (!yearRow || yearRow.school_id !== schoolId) {
    return NextResponse.json({ error: "Target school year does not belong to your school." }, { status: 403 });
  }

  // Batch-verify all student IDs belong to this school
  if (parsedEnroll.length > 0) {
    const uniqueStudentIds = [...new Set(parsedEnroll.map((r) => r.studentId))];
    const { data: validStudents } = await admin
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", uniqueStudentIds);
    const validStudentSet = new Set((validStudents ?? []).map((s) => s.id));
    const invalidStudent = parsedEnroll.find((r) => !validStudentSet.has(r.studentId));
    if (invalidStudent) {
      return NextResponse.json(
        { error: `Student "${invalidStudent.studentName}" does not belong to your school.` },
        { status: 403 }
      );
    }

    // Batch-verify all class IDs belong to this school
    const uniqueClassIds = [...new Set(parsedEnroll.map((r) => r.classId))];
    const { data: validClasses } = await admin
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", uniqueClassIds);
    const validClassSet = new Set((validClasses ?? []).map((c) => c.id));
    const invalidClass = parsedEnroll.find((r) => !validClassSet.has(r.classId));
    if (invalidClass) {
      return NextResponse.json(
        { error: `Class for "${invalidClass.studentName}" does not belong to your school.` },
        { status: 403 }
      );
    }
  }

  // Batch-verify all enrollment IDs (for graduate) link back to this school's students
  if (parsedGraduate.length > 0) {
    const uniqueEnrollmentIds = [...new Set(parsedGraduate.map((r) => r.enrollmentId))];
    const { data: validEnrollments } = await admin
      .from("enrollments")
      .select("id, students!inner(school_id)")
      .in("id", uniqueEnrollmentIds) as { data: Array<{ id: string; students: { school_id: string } }> | null };
    const validEnrollSet = new Set(
      (validEnrollments ?? [])
        .filter((e) => e.students?.school_id === schoolId)
        .map((e) => e.id)
    );
    const invalidEnroll = parsedGraduate.find((r) => !validEnrollSet.has(r.enrollmentId));
    if (invalidEnroll) {
      return NextResponse.json(
        { error: `Enrollment for "${invalidEnroll.studentName}" does not belong to your school.` },
        { status: 403 }
      );
    }
  }

  // --- All validation passed — now process ---

  const result: PromoteResult = { created: 0, graduated: 0, skipped: 0, errors: [] };

  for (const row of parsedEnroll) {
    // Duplicate check
    const { data: existing } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", row.studentId)
      .eq("class_id", row.classId)
      .eq("school_year_id", targetSchoolYearId)
      .maybeSingle();

    if (existing) { result.skipped++; continue; }

    const { error: insErr } = await admin.from("enrollments").insert({
      student_id: row.studentId,
      class_id: row.classId,
      school_year_id: targetSchoolYearId,
      status: "enrolled",
    });

    if (insErr) {
      result.errors.push(`${row.studentName}: ${insErr.message}`);
    } else {
      result.created++;
    }
  }

  for (const row of parsedGraduate) {
    const { error: updErr } = await admin
      .from("enrollments")
      .update({ status: "completed" })
      .eq("id", row.enrollmentId);

    if (updErr) {
      result.errors.push(`${row.studentName}: ${updErr.message}`);
    } else {
      result.graduated++;
    }
  }

  return NextResponse.json({ ok: true, result });
}
