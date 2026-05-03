import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient, insertAuditLog } from "@/lib/supabase/admin";

const VALID_CLASSIFICATIONS = [
  "eligible",
  "not_eligible_retained",
  "not_eligible_other",
  "graduated",
  "not_continuing",
  "withdrawn",
] as const;
type ClassificationStatus = (typeof VALID_CLASSIFICATIONS)[number];

interface ClassifyRow {
  enrollmentId: string;
  studentName: string;
  classificationStatus: ClassificationStatus;
  notes: string;
}

interface ClassifyResult {
  classified: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const classifyRows = Array.isArray(body.classify) ? (body.classify as unknown[]) : [];

  if (classifyRows.length === 0) {
    return NextResponse.json({ error: "No rows to classify." }, { status: 400 });
  }

  // Parse and validate classify rows
  const parsedClassify: ClassifyRow[] = [];
  for (const r of classifyRows) {
    const row = r as Record<string, unknown>;
    if (typeof row.enrollmentId !== "string") {
      return NextResponse.json({ error: "Invalid classify row: enrollmentId missing." }, { status: 400 });
    }
    const status = row.classificationStatus;
    if (!VALID_CLASSIFICATIONS.includes(status as ClassificationStatus)) {
      return NextResponse.json(
        { error: `Invalid classificationStatus "${status}".` },
        { status: 400 }
      );
    }
    parsedClassify.push({
      enrollmentId:         row.enrollmentId as string,
      studentName:          typeof row.studentName === "string" ? row.studentName : "",
      classificationStatus: status as ClassificationStatus,
      notes:                typeof row.notes === "string" ? row.notes : "",
    });
  }

  // Verify caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify caller role and school membership
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

  // Batch-verify all enrollment IDs belong to this school
  const uniqueEnrollmentIds = [...new Set(parsedClassify.map((r) => r.enrollmentId))];
  const { data: validEnrollments } = await admin
    .from("enrollments")
    .select("id, students!inner(school_id)")
    .in("id", uniqueEnrollmentIds) as {
      data: Array<{ id: string; students: { school_id: string } }> | null;
    };

  const validEnrollSet = new Set(
    (validEnrollments ?? [])
      .filter((e) => e.students?.school_id === schoolId)
      .map((e) => e.id)
  );
  const invalidEnroll = parsedClassify.find((r) => !validEnrollSet.has(r.enrollmentId));
  if (invalidEnroll) {
    return NextResponse.json(
      { error: `Enrollment for "${invalidEnroll.studentName}" does not belong to your school.` },
      { status: 403 }
    );
  }

  // --- All validation passed — process classifications ---

  const result: ClassifyResult = { classified: 0, errors: [] };

  for (const row of parsedClassify) {
    // "withdrawn" = mid-year exit. Year is NOT treated as completed; the
    // enrollment status mirrors a normal mid-year withdrawal so the student
    // remains eligible for future enrollment flows.
    const enrollmentStatus = row.classificationStatus === "withdrawn" ? "withdrawn" : "completed";

    const { error: updErr } = await admin
      .from("enrollments")
      .update({
        status:             enrollmentStatus,
        progression_status: row.classificationStatus,
        progression_notes:  row.notes || null,
      })
      .eq("id", row.enrollmentId);

    if (updErr) {
      result.errors.push(`${row.studentName}: ${updErr.message}`);
    } else {
      result.classified++;
      await insertAuditLog(admin, {
        schoolId,
        actorUserId: user.id,
        actorRole:   caller.role,
        tableName:   "enrollments",
        recordId:    row.enrollmentId,
        action:      "UPDATE",
        newValues:   {
          status:             enrollmentStatus,
          progression_status: row.classificationStatus,
          source:             "year_end_classification",
        },
      });
    }
  }

  return NextResponse.json({ ok: true, result });
}
