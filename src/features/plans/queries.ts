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
  IepDetails,
} from "./types";

type Client = SupabaseClient<Database>;

// ─── List ─────────────────────────────────────────────────────────────

export interface ListPlansFilters {
  schoolId:   string;
  planType?:  PlanType | null;
  studentId?: string | null;
  /** Single-status filter. Ignored when `statuses` is also provided. */
  status?:    PlanStatus | null;
  /** Multi-status filter (e.g. review queue). Takes precedence over `status`. */
  statuses?:  readonly PlanStatus[];
  /** Default false (newest first). Pass true to show oldest first (review queue). */
  sortAscending?: boolean;
}

export async function listPlans(
  supabase: Client,
  f: ListPlansFilters,
): Promise<PlanListItem[]> {
  let q = supabase.from("student_plans").select("*").eq("school_id", f.schoolId);

  // Queue mode (sortAscending) orders by submitted_at oldest-first so the most urgent
  // items surface at the top; legacy rows with null submitted_at sort last.
  if (f.sortAscending) {
    q = q.order("submitted_at", { ascending: true, nullsFirst: false });
  } else {
    q = q.order("updated_at", { ascending: false });
  }

  if (f.planType)  q = q.eq("plan_type",  f.planType);
  if (f.studentId) q = q.eq("student_id", f.studentId);
  if (f.statuses && f.statuses.length > 0) {
    q = q.in("status", [...f.statuses]);
  } else if (f.status) {
    q = q.eq("status", f.status);
  }

  const { data, error } = await q;
  if (error) throw error;

  const plans = (data ?? []) as StudentPlanRow[];
  if (plans.length === 0) return [];

  // ── Enrich with student / school year / created_by / submitted_by ─
  const studentIds    = Array.from(new Set(plans.map((p) => p.student_id)));
  const schoolYearIds = Array.from(new Set(plans.map((p) => p.school_year_id).filter((x): x is string => !!x)));
  // Batch both created_by and submitted_by in a single profiles query.
  const profileIds    = Array.from(new Set([
    ...plans.map((p) => p.created_by),
    ...plans.map((p) => p.submitted_by),
  ].filter((x): x is string => !!x)));

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
    student:              studentMap.get(p.student_id) ?? null,
    school_year:          p.school_year_id ? yearMap.get(p.school_year_id) ?? null : null,
    created_by_profile:   p.created_by   ? profileMap.get(p.created_by)   ?? null : null,
    submitted_by_profile: p.submitted_by ? profileMap.get(p.submitted_by) ?? null : null,
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

  // Legacy profile fields (kept for backward compat; also pre-populate Present Levels)
  diagnosis:        string | null;
  strengths:        string | null;
  areasOfNeed:      string | null;
  backgroundNotes:  string | null;

  // Legacy parent input fields
  parentNotes:        string | null;
  parentConcerns:     string | null;
  homeSupportNotes:   string | null;

  // Legacy review fields
  reviewDate:           string | null;
  reviewedByTeacherId:  string | null;
  reviewedByAdminId:    string | null;
  parentAcknowledged:   boolean;

  /** DepEd-specific payload (migration 085). */
  iepDetails: IepDetails | null;

  // Sub-rows
  goals:         Array<{
    id: string;
    domain: string | null;
    description: string;
    target_date: string | null;
    measurement_method: string | null;
    baseline: string | null;
    success_criteria: string | null;
    enroute_objectives: string | null;
    timeline: string | null;
    responsible_person: string | null;
    remarks: string | null;
    sort_order: number;
  }>;
  interventions: Array<{
    id: string;
    strategy: string;
    frequency: string | null;
    responsible_person: string | null;
    environment: string | null;
    notes: string | null;
    goal_id: string | null;
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

  currentUserId:  string;
  isNew:          boolean;
}

export async function savePlan(supabase: Client, input: PlanSaveInput): Promise<void> {
  const isFinalizing = input.status === "finalized";

  // 1. UPSERT head content.
  //
  //    When finalizing, the head is written with status='draft' temporarily so
  //    that sub-rows can be saved against a non-finalized parent (the sub-row
  //    RLS USING clauses only allow writes when parent status is draft /
  //    submitted / in_review — never finalized). After sub-rows are committed
  //    the head is flipped to 'finalized' in step 3. This keeps the edit window
  //    to zero: there is never a moment where the head is finalized but sub-rows
  //    can still be modified through RLS.
  const headPayload = {
    id:                                 input.id,
    school_id:                          input.schoolId,
    student_id:                         input.studentId,
    school_year_id:                     input.schoolYearId,
    plan_type:                          input.planType,
    title:                              input.title,
    status:                             isFinalizing ? "draft" : input.status,
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
    iep_details:                        input.iepDetails as Record<string, unknown> | null,
    ...(input.isNew ? { created_by: input.currentUserId } : {}),
    // Stamp submission audit fields on every transition to "submitted".
    ...(input.status === "submitted" ? {
      submitted_at: new Date().toISOString(),
      submitted_by: input.currentUserId ?? null,
    } : {}),
  };

  const { error: headErr } = await supabase
    .from("student_plans")
    .upsert(headPayload as Database["public"]["Tables"]["student_plans"]["Insert"], { onConflict: "id" });
  if (headErr) throw headErr;

  // 2. Sub-rows — diff save.
  //    Head status is 'draft' at this point, so the sub-row teacher_write
  //    policies (USING: parent status IN ('draft','submitted','in_review')) are
  //    satisfied without needing 'finalized' in their USING clause.
  await diffSaveGoals(supabase, input.id, input.goals);
  await diffSaveInterventions(supabase, input.id, input.interventions);
  await diffSaveProgress(supabase, input.id, input.progress, input.currentUserId);
  await diffSaveAttachments(supabase, input.id, input.attachmentDocumentIds, input.currentUserId);

  // 3. Finalization flip — update head status to 'finalized' + audit stamps.
  //    After this point the plan is locked: the head USING clause blocks any
  //    further teacher UPDATE on the head, and sub-row USING clauses (which
  //    never include 'finalized') block any direct sub-row modification.
  if (isFinalizing) {
    const { error: finalErr } = await supabase
      .from("student_plans")
      .update({
        status:       "finalized",
        finalized_at: new Date().toISOString(),
        finalized_by: input.currentUserId ?? null,
      })
      .eq("id", input.id);
    if (finalErr) throw finalErr;
  }
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
      enroute_objectives:  g.enroute_objectives,
      timeline:            g.timeline,
      responsible_person:  g.responsible_person,
      remarks:             g.remarks,
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
      goal_id:             i.goal_id,
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
  actorProfileId?: string | null,
): Promise<void> {
  const update: Database["public"]["Tables"]["student_plans"]["Update"] = { status: next };
  if (next === "approved") {
    update.approved_at = new Date().toISOString();
    if (actorProfileId) update.approved_by = actorProfileId;
  }
  if (next === "finalized") {
    update.finalized_at = new Date().toISOString();
    if (actorProfileId) update.finalized_by = actorProfileId;
  }
  if (next === "archived") {
    update.archived_at = new Date().toISOString();
  }
  const { error } = await supabase.from("student_plans").update(update).eq("id", planId);
  if (error) throw error;
}


// ─── Discard Draft ────────────────────────────────────────────────────────────

/**
 * Hard-deletes a draft plan that has never been submitted, approved, or
 * finalized. All sub-rows (goals, interventions, progress, attachments, and
 * evidence assistant rows) cascade automatically via ON DELETE CASCADE.
 *
 * RLS enforces eligibility (migration 090):
 *   - school_admin: FOR ALL policy (migration 070) allows any draft DELETE
 *   - teacher:      only their own drafts with all timestamp guards satisfied
 */
export async function discardPlan(supabase: Client, planId: string): Promise<void> {
  const { error } = await supabase.from("student_plans").delete().eq("id", planId);
  if (error) throw error;
}


// ─── Create Revision ──────────────────────────────────────────────────────────

/**
 * Creates a new draft plan that is a revision of an existing finalized or
 * approved plan. Copies: head fields, goals, interventions, attachment refs.
 * Does NOT copy: progress entries (they belong to the original plan).
 *
 * Returns the new plan's ID so the caller can open it immediately.
 */
export async function createRevision(
  supabase: Client,
  sourcePlanId: string,
  userId: string,
): Promise<string> {
  const full = await getPlan(supabase, sourcePlanId);
  if (!full) throw new Error("Source plan not found or you do not have access.");

  const { plan } = full;
  const newPlanId  = crypto.randomUUID();
  const revNum     = (plan.revision_number ?? 1) + 1;
  // Root of the chain: if source is already a revision, point to the same root.
  const parentId   = plan.parent_plan_id ?? plan.id;

  // 1. Insert new plan head (status='draft', all audit timestamps reset)
  const { error: headErr } = await supabase.from("student_plans").insert({
    id:                    newPlanId,
    school_id:             plan.school_id,
    student_id:            plan.student_id,
    school_year_id:        plan.school_year_id,
    plan_type:             plan.plan_type,
    title:                 plan.title,
    status:                "draft",
    diagnosis:             plan.diagnosis,
    strengths:             plan.strengths,
    areas_of_need:         plan.areas_of_need,
    background_notes:      plan.background_notes,
    parent_notes:          plan.parent_notes,
    parent_concerns:       plan.parent_concerns,
    home_support_notes:    plan.home_support_notes,
    review_date:           plan.review_date,
    reviewed_by_teacher_id: plan.reviewed_by_teacher_id,
    reviewed_by_admin_id:  plan.reviewed_by_admin_id,
    iep_details:           plan.iep_details,
    created_by:            userId,
    // Revision lineage
    parent_plan_id:        parentId,
    supersedes_plan_id:    sourcePlanId,
    revision_number:       revNum,
  });
  if (headErr) throw headErr;

  // 2. Copy goals — mint new IDs; build old→new map for intervention remapping.
  const goalIdMap = new Map<string, string>();
  if (full.goals.length > 0) {
    const newGoals = full.goals.map((g) => {
      const newId = crypto.randomUUID();
      goalIdMap.set(g.id, newId);
      return {
        id:                 newId,
        plan_id:            newPlanId,
        domain:             g.domain,
        description:        g.description,
        target_date:        g.target_date,
        measurement_method: g.measurement_method,
        baseline:           g.baseline,
        success_criteria:   g.success_criteria,
        enroute_objectives: g.enroute_objectives,
        timeline:           g.timeline,
        responsible_person: g.responsible_person,
        remarks:            g.remarks,
        sort_order:         g.sort_order,
      };
    });
    const { error } = await supabase.from("student_plan_goals").insert(newGoals);
    if (error) throw error;
  }

  // 3. Copy interventions — remap goal_id to the new goal IDs.
  if (full.interventions.length > 0) {
    const newInterventions = full.interventions.map((iv) => ({
      id:                 crypto.randomUUID(),
      plan_id:            newPlanId,
      strategy:           iv.strategy,
      frequency:          iv.frequency,
      responsible_person: iv.responsible_person,
      environment:        iv.environment,
      notes:              iv.notes,
      goal_id:            iv.goal_id ? (goalIdMap.get(iv.goal_id) ?? null) : null,
      sort_order:         iv.sort_order,
    }));
    const { error } = await supabase.from("student_plan_interventions").insert(newInterventions);
    if (error) throw error;
  }

  // 4. Copy attachment references — same child_documents rows, no file copy.
  if (full.attachments.length > 0) {
    const newAttachments = full.attachments.map((a) => ({
      id:          crypto.randomUUID(),
      plan_id:     newPlanId,
      document_id: a.document_id,
      attached_by: userId,
    }));
    const { error } = await supabase.from("student_plan_attachments").insert(newAttachments);
    if (error) throw error;
  }

  return newPlanId;
}
