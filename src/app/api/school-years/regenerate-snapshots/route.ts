import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Enrollment row shape returned by the join query — mirrors close/route.ts
interface EnrollmentRow {
  id: string;
  student_id: string;
  school_year_id: string;
  class_id: string | null;
  status: string;
  progression_status: string | null;
  classes: {
    id: string;
    name: string;
    class_levels: { name: string } | null;
  } | null;
}

/**
 * POST /api/school-years/regenerate-snapshots
 *
 * Recovery path for a failed or partial year-close snapshot generation.
 * Deletes existing school_year_completions for the year and regenerates them
 * from current enrollment data.
 *
 * Guards:
 *   - school_admin of the year's school only
 *   - year must already be CLOSED (does not reopen it)
 *   - explicit confirmation payload required: { yearId, confirm: true }
 *
 * Does NOT:
 *   - reopen the school year
 *   - mutate enrollments, attendance, billing, plans, or student_class_assignments
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const yearId = typeof body.yearId === "string" ? body.yearId : null;
  if (!yearId) {
    return NextResponse.json({ error: "yearId is required." }, { status: 400 });
  }

  // Explicit confirmation guard — prevents accidental calls
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "confirm: true is required to regenerate snapshots." },
      { status: 400 }
    );
  }

  // Verify caller is authenticated
  const serverClient = await createServerClient();
  const { data: { user }, error: authErr } = await serverClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify caller role + school membership
  const { data: caller } = await admin
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .single();

  if (!caller?.school_id) {
    return NextResponse.json(
      { error: "Your account is not linked to a school." },
      { status: 403 }
    );
  }
  if (caller.role !== "school_admin") {
    return NextResponse.json(
      { error: "Only school administrators can regenerate year-end snapshots." },
      { status: 403 }
    );
  }

  const schoolId = caller.school_id;

  // Verify the year exists, belongs to this school, and is CLOSED
  const { data: year } = await admin
    .from("school_years")
    .select("id, status, school_id")
    .eq("id", yearId)
    .single();

  if (!year || year.school_id !== schoolId) {
    return NextResponse.json({ error: "School year not found." }, { status: 404 });
  }
  if (year.status !== "closed") {
    return NextResponse.json(
      {
        error:
          year.status === "active"
            ? "Use the Close Year action to generate snapshots for the active year."
            : "Only closed school years can have snapshots regenerated.",
      },
      { status: 422 }
    );
  }

  // 1. Delete existing snapshots for this year (correction workflow)
  const { error: deleteErr, count: deletedCount } = await admin
    .from("school_year_completions")
    .delete({ count: "exact" })
    .eq("school_year_id", yearId)
    .eq("school_id", schoolId);

  if (deleteErr) {
    return NextResponse.json(
      { error: `Failed to clear existing snapshots: ${deleteErr.message}` },
      { status: 500 }
    );
  }

  // 2. Fetch all relevant enrollments — same query as close/route.ts
  const { data: enrollments, error: enrollErr } = await admin
    .from("enrollments")
    .select("id, student_id, school_year_id, class_id, status, progression_status, classes(id, name, class_levels(name))")
    .eq("school_year_id", yearId)
    .in("status", ["enrolled", "completed", "withdrawn"]) as {
      data: EnrollmentRow[] | null;
      error: unknown;
    };

  if (enrollErr || !enrollments) {
    return NextResponse.json(
      {
        error:
          "Snapshots cleared but regeneration failed: could not fetch enrollment data. " +
          "Run this action again to retry.",
        deleted: deletedCount ?? 0,
        regenerated: 0,
      },
      { status: 500 }
    );
  }

  if (enrollments.length === 0) {
    return NextResponse.json({ ok: true, deleted: deletedCount ?? 0, regenerated: 0 });
  }

  // 3. Build snapshot rows — same logic as close/route.ts
  const rows = enrollments.map((e) => ({
    school_id:          schoolId,
    school_year_id:     e.school_year_id,
    student_id:         e.student_id,
    enrollment_id:      e.id,
    final_class_id:     e.class_id,
    final_class_name:   e.classes?.name ?? null,
    final_level_name:   (e.classes?.class_levels as { name: string } | null)?.name ?? null,
    completion_status:
      e.status === "withdrawn"
        ? "withdrawn"
        : e.status === "enrolled"
        ? "enrolled_at_close"
        : "completed",
    progression_status: e.progression_status,
    generated_by:       user.id,
  }));

  // 4. Insert fresh snapshots — ignoreDuplicates is a safety net but after the
  //    delete above there should be no conflicts.
  const { error: insertErr } = await admin
    .from("school_year_completions")
    .upsert(rows, { onConflict: "student_id,school_year_id", ignoreDuplicates: true });

  if (insertErr) {
    return NextResponse.json(
      {
        error: `Snapshots cleared but re-insert failed: ${insertErr.message}. Run this action again to retry.`,
        deleted: deletedCount ?? 0,
        regenerated: 0,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: deletedCount ?? 0,
    regenerated: rows.length,
  });
}
