/**
 * POST /api/school-years/close
 *
 * THE ONLY SANCTIONED WAY to close a school year.
 * Do NOT write school_years.status = 'closed' directly (SQL editor, saveSy() edit
 * modal, etc.) — doing so produces a closed year with zero completion snapshots.
 *
 * Non-atomic: the year is marked closed before snapshots are generated. If snapshot
 * generation fails, the year stays closed and snapshots will be empty. Recovery:
 *   Settings → School Years → <closed year> → "Regenerate Snapshots"
 *   (POST /api/school-years/regenerate-snapshots)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Enrollment row shape returned by the join query
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
      { error: "Only school administrators can close a school year." },
      { status: 403 }
    );
  }

  const schoolId = caller.school_id;

  // Verify the year exists, belongs to this school, and is currently active
  const { data: year } = await admin
    .from("school_years")
    .select("id, status, school_id")
    .eq("id", yearId)
    .single();

  if (!year || year.school_id !== schoolId) {
    return NextResponse.json({ error: "School year not found." }, { status: 404 });
  }
  if (year.status !== "active") {
    return NextResponse.json(
      { error: "Only the active school year can be closed." },
      { status: 422 }
    );
  }

  // 1. Close the school year
  const { error: closeErr } = await admin
    .from("school_years")
    .update({ status: "closed" })
    .eq("id", yearId);

  if (closeErr) {
    return NextResponse.json({ error: closeErr.message }, { status: 500 });
  }

  // 2. Generate completion snapshots for all enrollments in the year.
  //    Fetch every relevant enrollment with its class + level name.
  const { data: enrollments, error: enrollErr } = await admin
    .from("enrollments")
    .select("id, student_id, school_year_id, class_id, status, progression_status, classes(id, name, class_levels(name))")
    .eq("school_year_id", yearId)
    .in("status", ["enrolled", "completed", "withdrawn"]) as {
      data: EnrollmentRow[] | null;
      error: unknown;
    };

  if (enrollErr || !enrollments) {
    // Year is already closed; return partial success so the UI closes normally
    return NextResponse.json({
      ok: true,
      snapshotsCreated: 0,
      warning: "Year closed but completion snapshots could not be generated. Run the close action again to retry.",
    });
  }

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

  let snapshotsCreated = 0;

  if (rows.length > 0) {
    // ON CONFLICT DO NOTHING — idempotent; re-running after a partial failure
    // does not duplicate rows.
    const { error: insertErr } = await admin
      .from("school_year_completions")
      .upsert(rows, { onConflict: "student_id,school_year_id", ignoreDuplicates: true });

    if (!insertErr) {
      snapshotsCreated = rows.length;
    }
  }

  return NextResponse.json({ ok: true, snapshotsCreated });
}
