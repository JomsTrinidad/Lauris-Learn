/**
 * Supabase query helpers for the Plans & Forms feature.
 *
 * RLS is enforced server-side (migration 070) — this module does not
 * filter for visibility; it only scopes by school_id and (when provided)
 * student_id and plan_type.
 *
 * Save model:
 *   - The head row uses a stable client-supplied UUID so the modal can
 *     wire sub-rows in one atomic save without round-tripping the id.
 *   - Sub-rows are saved with the "diff" pattern: upsert each kept row
 *     by id, then delete plan-scoped rows whose id is not in the new set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  PlanListItem,
  PlanFull,
  PlanStatus,
  PlanType,
  StudentPlanRow,
  StudentPlanGoalRow,
  StudentPlanInterventionRow,
  StudentPlanProgressEntryRow,
} from "./types";

type Client = SupabaseClient<Database>;

// ─── List ─────────────────────────────────────────────────────────────

export interface ListPlansFilters {
  schoolId:   string;
  planType?:  PlanType | null;
  studentId?: string | null;
  status?:    PlanStatus | null;
}

export async function listPlans(
  supabase: Client,
  f: ListPlansFilters,
): Promise<PlanListItem[]> {
  let q = supabase
    .from("student_plans")
    .select("*")
    .eq("school_id", f.schoolId)
    .order("updated_at", { ascending: false });

  if (f.planType)  q = q.eq("plan_type",  f.planType);
  if (f.studentId) q = q.eq("student_id", f.studentId);
  if (f.status)    q = q.eq("status",     f.status);

  const { data, error } = await q;
  if (error) throw error;

  const plans = (data ?? []) as StudentPlanRow[];
  if (plans.length === 0) return [];

  // ── Enrich with student / school year / created_by ────────────────
  const studentIds    = Array.from(new Set(plans.map((p) => p.student_id)));
  const schoolYearIds = Array.from(new Set(plans.map((p) => p.school_year_id).filter((x): x is string => !!x)));
  const profileIds    = Array.from(new Set(plans.map((p) => p.created_by).filter((x): x is string => !!x)));

  const [studentsRes, yearsRes, profilesRes] = await Promise.all([
    studentIds.length
      ? supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    schoolYearIds.length
      ? supabase.from("school_years").select("id, name").in("id", schoolYearIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  type StudentLite = { id: string; first_name: string; last_name: string };
  type YearLite    = { id: string; name: string };
  type ProfileLite = { id: string; full_name: string };

  const studentMap = new Map<string, StudentLite>(
    ((studentsRes.data as StudentLite[] | null) ?? []).map((s) => [s.id, s]),
  );
  const yearMap = new Map<string, YearLite>(
    ((yearsRes.data as YearLite[] | null) ?? []).map((y) => [y.id, y]),
  );
  const profileMap = new Map<string, ProfileLite>(
    ((profilesRes.data as ProfileLite[] | null) ?? []).map((p) => [p.id, p]),
  );

  return plans.map((p) => ({
    ...p,
    student:            studentMap.get(p.student_id) ?? null,
    school_year:        p.school_year_id ? yearMap.get(p.school_year_id) ?? null : null,
    created_by_profile: p.created_by    ? profileMap.get(p.created_by)    ?? null : null,
  }));
}


// ─── Get ──────────────────────────────────────────────────────────────

export async function getPlan(
  supabase: Client,
  planId: string,
): Promise<PlanFull | null> {
  const { data: planData, error: planErr } = await supabase
    .from("student_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!planData) return null;

  const plan = planData as StudentPlanRow;

  const [
    goalsRes,
    interventionsRes,
    progressRes,
    attachmentsRes,
    studentRes,
    yearRes,
    profileRes,
  ] = await Promise.all([
    supabase.from("student_plan_goals").select("*").eq("plan_id", planId).order("sort_order"),
    supabase.from("student_plan_interventions").select("*").eq("plan_id", planId).order("sort_order"),
    supabase.from("student_plan_progress_entries").select("*").eq("plan_id", planId).order("entry_date", { ascending: false }),
    supabase.from("student_plan_attachments").select("*").eq("plan_id", planId).order("attached_at"),
    supabase.from("students").select("id, first_name, last_name").eq("id", plan.student_id).maybeSingle(),
    plan.school_year_id
      ? supabase.from("school_years").select("id, name").eq("id", plan.school_year_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    plan.created_by
      ? supabase.from("profiles").select("id, full_name").eq("id", plan.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (goalsRes.error)         throw goalsRes.error;
  if (interventionsRes.error) throw interventionsRes.error;
  if (progressRes.error)      throw progressRes.error;
  if (attachmentsRes.error)   throw attachmentsRes.error;

  const attachmentRows = (attachmentsRes.data ?? []) as Array<{ id: string; plan_id: string; document_id: string; attached_by: string | null; attached_at: string }>;
  const docIds = attachmentRows.map((a) => a.document_id);
  type DocLite = { id: string; title: string; document_type: Database["public"]["Tables"]["child_documents"]["Row"]["document_type"] };
  const docsRes = docIds.length
    ? await supabase.from("child_documents").select("id, title, document_type").in("id", docIds)
    : { data: [] as DocLite[], error: null };
  if (docsRes.error) throw docsRes.error;
  const docMap = new Map<string, DocLite>(
    ((docsRes.data as DocLite[] | null) ?? []).map((d) => [d.id, d]),
  );

  return {
    plan,
    student:            (studentRes.data as { id: string; first_name: string; last_name: string } | null) ?? null,
    school_year:        (yearRes.data    as { id: string; name: string } | null) ?? null,
    created_by_profile: (profileRes.data as { id: string; full_name: string } | null) ?? null,
    goals:         (goalsRes.data         ?? []) as StudentPlanGoalRow[],
    interventions: (interventionsRes.data ?? []) as StudentPlanInterventionRow[],
    progress:      (progressRes.data      ?? []) as StudentPlanProgressEntryRow[],
    attachments:   attachmentRows.map((a) => ({
      ...a,
      document: docMap.get(a.document_id) ?? null,
    })),
  };
}


// ─── Save ─────────────────────────────────────────────────────────────

export interface PlanSaveInput {
  /** Stable head id. Use crypto.randomUUID() for new plans. */
  id:             string;
  schoolId:       string;
  studentId:      string;
  schoolYearId:   string | null;
  planType:       PlanType;
  title:          string;
  status:         PlanStatus;

  // Profile
  diagnosis:        string | null;
  strengths:        string | null;
  areasOfNeed:      string | null;
  backgroundNotes:  string | null;

  // Parent input
  parentNotes:        string | null;
  parentConcerns:     string | null;
  homeSupportNotes:   string | null;

  // Review
  reviewDate:           string | null;  // YYYY-MM-DD
  reviewedByTeacherId:  string | null;
  reviewedByAdminId:    string | null;
  parentAcknowledged:   boolean;        // toggle

  // Sub-rows — id is REQUIRED (caller mints with crypto.randomUUID() for new rows)
  goals:         Array<{
    id: string;
    domain: string | null;
    description: string;
    target_date: string | null;
    measurement_method: string | null;
    baseline: string | null;
    success_criteria: string | null;
    sort_order: number;
  }>;
  interventions: Array<{
    id: string;
    strategy: string;
    frequency: string | null;
    responsible_person: string | null;
    environment: string | null;
    notes: string | null;
    sort_order: number;
  }>;
  progress:      Array<{
    id: string;
    linked_goal_id: string | null;
    entry_date: string;
    progress_note: string;
    observed_by: string | null;
    next_step: string | null;
  }>;
  attachmentDocumentIds: string[];

  /** Caller's profile id; saved on new progress entries' created_by. */
  currentUserId:  string;
  /** Whether this is a brand-new plan (controls created_by + parent_acknowledged_at semantics). */
  isNew:          boolean;
}

export async function savePlan(supabase: Client, input: PlanSaveInput): Promise<void> {
  // 1. UPSERT head
  const headPayload = {
    id:                                 input.id,
    school_id:                          input.schoolId,
    student_id:                         input.studentId,
    school_year_id:                     input.schoolYearId,
    plan_type:                          input.planType,
    title:                              input.title,
    status:                             input.status,
    diagnosis:                          input.diagnosis,
    strengths:                          input.strengths,
    areas_of_need:                      input.areasOfNeed,
    background_notes:                   input.backgroundNotes,
    parent_notes:                       input.parentNotes,
    parent_concerns:                    input.parentConcerns,
    home_support_notes:                 input.homeSupportNotes,
    review_date:                        input.reviewDate,
    reviewed_by_teacher_id:             input.reviewedByTeacherId,
    reviewed_by_admin_id:               input.reviewedByAdminId,
    parent_acknowledged_at:             input.parentAcknowledged ? new Date().toISOString() : null,
    ...(input.isNew ? { created_by: input.currentUserId } : {}),
  };

  const { error: headErr } = await supabase
    .from("student_plans")
    .upsert(headPayload as Database["public"]["Tables"]["student_plans"]["Insert"], { onConflict: "id" });
  if (headErr) throw headErr;

  // 2. Sub-rows — diff save
  await diffSaveGoals(supabase, input.id, input.goals);
  await diffSaveInterventions(supabase, input.id, input.interventions);
  await diffSaveProgress(supabase, input.id, input.progress, input.currentUserId);
  await diffSaveAttachments(supabase, input.id, input.attachmentDocumentIds, input.currentUserId);
}

async function diffSaveGoals(
  supabase: Client,
  planId: string,
  goals: PlanSaveInput["goals"],
) {
  if (goals.length > 0) {
    const rows = goals.map((g) => ({
      id:                  g.id,
      plan_id:             planId,
      domain:              g.domain,
      description:         g.description,
      target_date:         g.target_date,
      measurement_method:  g.measurement_method,
      baseline:            g.baseline,
      success_criteria:    g.success_criteria,
      sort_order:          g.sort_order,
    }));
    const { error } = await supabase
      .from("student_plan_goals")
      .upsert(rows as Database["public"]["Tables"]["student_plan_goals"]["Insert"][], { onConflict: "id" });
    if (error) throw error;
  }
  await deleteRemoved(supabase, "student_plan_goals", planId, goals.map((g) => g.id));
}

async function diffSaveInterventions(
  supabase: Client,
  planId: string,
  interventions: PlanSaveInput["interventions"],
) {
  if (interventions.length > 0) {
    const rows = interventions.map((i) => ({
      id:                  i.id,
      plan_id:             planId,
      strategy:            i.strategy,
      frequency:           i.frequency,
      responsible_person:  i.responsible_person,
      environment:         i.environment,
      notes:               i.notes,
      sort_order:          i.sort_order,
    }));
    const { error } = await supabase
      .from("student_plan_interventions")
      .upsert(rows as Database["public"]["Tables"]["student_plan_interventions"]["Insert"][], { onConflict: "id" });
    if (error) throw error;
  }
  await deleteRemoved(supabase, "student_plan_interventions", planId, interventions.map((i) => i.id));
}

async function diffSaveProgress(
  supabase: Client,
  planId: string,
  progress: PlanSaveInput["progress"],
  currentUserId: string,
) {
  if (progress.length > 0) {
    const rows = progress.map((p) => ({
      id:              p.id,
      plan_id:         planId,
      linked_goal_id:  p.linked_goal_id,
      entry_date:      p.entry_date,
      progress_note:   p.progress_note,
      observed_by:     p.observed_by,
      next_step:       p.next_step,
      created_by:      currentUserId,
    }));
    const { error } = await supabase
      .from("student_plan_progress_entries")
      .upsert(rows as Database["public"]["Tables"]["student_plan_progress_entries"]["Insert"][], { onConflict: "id" });
    if (error) throw error;
  }
  await deleteRemoved(supabase, "student_plan_progress_entries", planId, progress.map((p) => p.id));
}

async function diffSaveAttachments(
  supabase: Client,
  planId: string,
  documentIds: string[],
  currentUserId: string,
) {
  // Attachments don't have stable client ids — they are keyed by (plan_id, document_id).
  // Fetch existing, delete dropped doc_ids, insert new doc_ids.
  const { data: existingRaw, error: readErr } = await supabase
    .from("student_plan_attachments")
    .select("id, document_id")
    .eq("plan_id", planId);
  if (readErr) throw readErr;

  const existing = (existingRaw ?? []) as Array<{ id: string; document_id: string }>;
  const existingDocIds = new Set(existing.map((a) => a.document_id));
  const desiredDocIds  = new Set(documentIds);

  const toRemove = existing.filter((a) => !desiredDocIds.has(a.document_id));
  const toInsert = documentIds.filter((d) => !existingDocIds.has(d));

  if (toRemove.length > 0) {
    const ids = toRemove.map((a) => a.id);
    const { error } = await supabase.from("student_plan_attachments").delete().in("id", ids);
    if (error) throw error;
  }
  if (toInsert.length > 0) {
    const rows = toInsert.map((document_id) => ({
      plan_id: planId,
      document_id,
      attached_by: currentUserId,
    }));
    const { error } = await supabase
      .from("student_plan_attachments")
      .insert(rows as Database["public"]["Tables"]["student_plan_attachments"]["Insert"][]);
    if (error) throw error;
  }
}

type SubTable =
  | "student_plan_goals"
  | "student_plan_interventions"
  | "student_plan_progress_entries";

async function deleteRemoved(
  supabase: Client,
  table: SubTable,
  planId: string,
  keepIds: string[],
) {
  let q = supabase.from(table).delete().eq("plan_id", planId);
  if (keepIds.length > 0) {
    // PostgREST: not.in expects parenthesized comma-separated list
    q = q.not("id", "in", `(${keepIds.join(",")})`);
  }
  const { error } = await q;
  if (error) throw error;
}


// ─── Status transitions (admin-only writes are enforced by RLS) ──────

export async function setPlanStatus(
  supabase: Client,
  planId: string,
  next: PlanStatus,
  approverProfileId?: string | null,
): Promise<void> {
  const update: Database["public"]["Tables"]["student_plans"]["Update"] = { status: next };
  if (next === "approved") {
    update.approved_at = new Date().toISOString();
    if (approverProfileId) update.approved_by = approverProfileId;
  }
  if (next === "archived") {
    update.archived_at = new Date().toISOString();
  }
  const { error } = await supabase.from("student_plans").update(update).eq("id", planId);
  if (error) throw error;
}
