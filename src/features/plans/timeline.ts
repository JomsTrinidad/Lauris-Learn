/**
 * Support plan operational timeline — data layer.
 *
 * Two public functions:
 *
 *   loadSupportTimeline(supabase, planId)
 *     Plan-centric view: all events for a single plan.
 *     Used by SupportTimelineModal (opened from IEPPlansList).
 *
 *   loadStudentSupportHistory(supabase, studentId)
 *     Student-centric view: all support events across every plan for a child.
 *     5 batch queries (no per-plan N+1). Used by StudentSupportHistoryModal.
 *     Returns StudentHistoryEvent[] which extends SupportTimelineEvent with
 *     plan context (planId, planTitle, planRevisionNumber).
 *
 * Event sources (in priority order):
 *   1. student_plans timestamp columns — primary; semantic and reliable
 *   2. student_plan_attachments — document attached events
 *   3. student_plan_progress_entries — grouped by entry_date per plan
 *   4. audit_logs — ONE targeted query per surface: 'in_review' transition only
 *      (this status has no dedicated timestamp column on the head row)
 *
 * Deliberately suppressed / never exposed:
 *   - Raw UPDATE events on student_plans sub-tables (goals, interventions, etc.)
 *   - Individual field-level changes
 *   - Autosaves and intermediate drafts
 *   - Technical INSERT events on sub-tables
 *
 * Future coordination history opportunities (not yet implemented):
 *   - "Returned for revision" — no schema timestamp; would need audit query
 *   - Attendance intervention triggers
 *   - Lauris Care / Lauris Med therapy session linkage
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export type TimelineEventKind =
  | "plan_created"
  | "plan_revised"
  | "plan_submitted"
  | "review_started"
  | "plan_finalized"
  | "plan_approved"
  | "plan_archived"
  | "document_attached"
  | "parent_acknowledged"
  | "progress_added"
  | "home_guidance_shared"
  | "parent_observation_shared";

export interface SupportTimelineEvent {
  /** Stable key for React (not a DB primary key — may be composite). */
  id: string;
  kind: TimelineEventKind;
  /** ISO 8601 string used for chronological sort. */
  timestamp: string;
  /** Human-readable primary sentence. */
  label: string;
  /** Optional secondary detail line (e.g. document name, archive reason). */
  detail?: string;
}

export async function loadSupportTimeline(
  supabase: Client,
  planId: string,
): Promise<SupportTimelineEvent[]> {
  // ── 1. Plan head (structured timestamps — primary source) ──────────────
  const { data: planData, error: planErr } = await supabase
    .from("student_plans")
    .select("id, created_at, created_by, submitted_at, submitted_by, finalized_at, finalized_by, approved_at, approved_by, archived_at, archive_reason, parent_acknowledged_at, revision_number, supersedes_plan_id")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!planData) return [];

  // ── 2. Attachments ─────────────────────────────────────────────────────
  const { data: attachments } = await supabase
    .from("student_plan_attachments")
    .select("id, attached_at, attached_by, document:child_documents(title)")
    .eq("plan_id", planId)
    .order("attached_at");

  // ── 3. Progress entries (will be collapsed by date) ────────────────────
  const { data: progressRows } = await supabase
    .from("student_plan_progress_entries")
    .select("id, entry_date, created_by")
    .eq("plan_id", planId)
    .order("entry_date");

  // ── 3b. Home guidance — first-shared timestamp (single aggregate row) ────
  // One timeline event fires when guidance was FIRST shared with a parent for
  // this plan. We use MIN(shared_with_parent_at) to get the earliest moment
  // any item became visible. No per-item events to avoid noise.
  const { data: guidanceRows } = await supabase
    .from("support_follow_through_items")
    .select("id, shared_with_parent_at")
    .eq("plan_id", planId)
    .eq("is_shared_with_parent", true)
    .not("shared_with_parent_at", "is", null)
    .order("shared_with_parent_at", { ascending: true })
    .limit(1);

  // ── 3c. Parent observations — first submitted for this plan ───────────────
  // One event fires the first time a parent submits ANY observation for this
  // plan. Per-observation events would create noise; one event per plan is
  // the right signal ("parent engaged with home support guidance").
  const { data: observationRows } = await supabase
    .from("parent_observations")
    .select("id, created_at")
    .eq("plan_id", planId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  // ── 4. Audit logs — in_review transition ONLY ──────────────────────────
  // We query for UPDATE events on this plan and filter client-side to the
  // exact status='in_review' transition. This is the only audit query in
  // the entire normalization layer; everything else uses structured columns.
  type AuditRow = { id: string; actor_user_id: string | null; actor_role: string | null; new_values: Record<string, unknown> | null; created_at: string };

  const { data: auditRowsRaw } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, actor_role, new_values, created_at")
    .eq("table_name", "student_plans")
    .eq("record_id", planId)
    .eq("action", "UPDATE" as "INSERT" | "UPDATE" | "DELETE")
    .order("created_at");

  const auditRows = (auditRowsRaw ?? []) as AuditRow[];

  const reviewStartedRows = auditRows.filter((a) => {
    return a.new_values?.status === "in_review";
  });

  // ── Collect all profile IDs for a single batch name-resolution ─────────
  const profileIds = new Set<string>();
  const addId = (id: string | null | undefined) => {
    if (id) profileIds.add(id);
  };
  addId(planData.created_by);
  addId(planData.submitted_by);
  addId(planData.finalized_by);
  addId(planData.approved_by);
  for (const a of attachments ?? []) addId(a.attached_by);
  for (const p of progressRows ?? []) addId(p.created_by);
  for (const r of reviewStartedRows) addId(r.actor_user_id);

  const profileMap = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...profileIds]);
    for (const p of profiles ?? []) profileMap.set(p.id, p.full_name);
  }

  const name = (id: string | null | undefined): string | null =>
    id ? (profileMap.get(id) ?? null) : null;
  const by = (actorName: string | null): string =>
    actorName ? ` by ${actorName}` : "";

  const events: SupportTimelineEvent[] = [];

  // ── Event: Plan created (or revision started) ──────────────────────────
  const revNum = planData.revision_number ?? 1;
  const creator = name(planData.created_by);
  events.push({
    id: `created_${planId}`,
    kind: revNum > 1 ? "plan_revised" : "plan_created",
    timestamp: planData.created_at,
    label:
      revNum > 1
        ? `Revision ${revNum} started${by(creator)}`
        : `Support plan draft started${by(creator)}`,
    detail:
      revNum > 1 ? "Continuing from the previous finalized plan" : undefined,
  });

  // ── Event: Submitted for review ────────────────────────────────────────
  if (planData.submitted_at) {
    const submitter = name(planData.submitted_by);
    events.push({
      id: `submitted_${planId}`,
      kind: "plan_submitted",
      timestamp: planData.submitted_at,
      label: `Plan submitted for team review${by(submitter)}`,
    });
  }

  // ── Event: Review started (from audit, in_review transition) ──────────
  // Only relevant in admin_approval_required workflow mode.
  for (const r of reviewStartedRows) {
    const reviewer = name(r.actor_user_id);
    events.push({
      id: `review_${r.id}`,
      kind: "review_started",
      timestamp: r.created_at,
      label: `Review process started${by(reviewer)}`,
    });
  }

  // ── Event: Plan finalized ──────────────────────────────────────────────
  if (planData.finalized_at) {
    const finalizer = name(planData.finalized_by);
    events.push({
      id: `finalized_${planId}`,
      kind: "plan_finalized",
      timestamp: planData.finalized_at,
      label: `Plan finalized${by(finalizer)}`,
    });
  }

  // ── Event: Plan approved ───────────────────────────────────────────────
  if (planData.approved_at) {
    const approver = name(planData.approved_by);
    events.push({
      id: `approved_${planId}`,
      kind: "plan_approved",
      timestamp: planData.approved_at,
      label: `Plan approved${by(approver)}`,
    });
  }

  // ── Event: Plan archived ───────────────────────────────────────────────
  if (planData.archived_at) {
    events.push({
      id: `archived_${planId}`,
      kind: "plan_archived",
      timestamp: planData.archived_at,
      label: "Plan archived",
      detail: planData.archive_reason ?? undefined,
    });
  }

  // ── Event: Parent acknowledged recommendations ─────────────────────────
  if (planData.parent_acknowledged_at) {
    events.push({
      id: `parent_ack_${planId}`,
      kind: "parent_acknowledged",
      timestamp: planData.parent_acknowledged_at,
      label: "Parent acknowledged recommendations",
    });
  }

  // ── Event: Home guidance first shared ─────────────────────────────────
  const firstGuidance = guidanceRows?.[0];
  if (firstGuidance?.shared_with_parent_at) {
    events.push({
      id: `home_guidance_${planId}`,
      kind: "home_guidance_shared",
      timestamp: firstGuidance.shared_with_parent_at,
      label: "Home support guidance shared with family",
    });
  }

  // ── Event: Parent observation first submitted ──────────────────────────
  const firstObservation = observationRows?.[0];
  if (firstObservation?.created_at) {
    events.push({
      id: `parent_obs_${planId}`,
      kind: "parent_observation_shared",
      timestamp: firstObservation.created_at,
      label: "Parent shared observations on home support",
    });
  }

  // ── Events: Documents attached ─────────────────────────────────────────
  for (const att of attachments ?? []) {
    if (!att.attached_at) continue;
    const attacher = name(att.attached_by);
    // PostgREST may return the FK join as an array — handle both shapes.
    const docRaw = att.document;
    const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
    const docTitle = (doc as { title?: string } | null)?.title ?? null;
    events.push({
      id: `attachment_${att.id}`,
      kind: "document_attached",
      timestamp: att.attached_at,
      label: docTitle ? `"${docTitle}" attached to plan` : "Document attached to plan",
      detail: attacher ? `Attached by ${attacher}` : undefined,
    });
  }

  // ── Events: Progress notes (grouped by entry_date) ─────────────────────
  // Multiple entries logged on the same calendar date collapse into one
  // timeline event to avoid noise from routine observation sessions.
  const progressByDate = new Map<
    string,
    { count: number; firstId: string; actor: string | null }
  >();
  for (const p of progressRows ?? []) {
    const day = p.entry_date; // "YYYY-MM-DD"
    const existing = progressByDate.get(day);
    if (existing) {
      existing.count++;
    } else {
      progressByDate.set(day, {
        count: 1,
        firstId: p.id,
        actor: name(p.created_by),
      });
    }
  }
  for (const [day, { count, firstId, actor }] of progressByDate) {
    events.push({
      id: `progress_${firstId}`,
      kind: "progress_added",
      // Noon UTC on that date so same-day events sort predictably.
      timestamp: `${day}T12:00:00.000Z`,
      label:
        count === 1
          ? `Progress note added${by(actor)}`
          : `${count} progress notes added${by(actor)}`,
    });
  }

  // Sort chronologically (oldest first → newest at bottom, most recent visible)
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Student-centric support history
// ─────────────────────────────────────────────────────────────────────────────

/** Extends SupportTimelineEvent with the plan this event belongs to. */
export interface StudentHistoryEvent extends SupportTimelineEvent {
  planId: string;
  planTitle: string;
  planRevisionNumber: number;
}

/**
 * Load the full support coordination history for a student across ALL their
 * support plans (any status, any school year).
 *
 * Uses 5 queries total regardless of how many plans the student has:
 *   1. All student_plans for this student
 *   2+3+4. Batch queries: attachments, progress entries, audit logs (parallel)
 *   5. Profile name resolution
 *
 * Events are enriched with plan context (planTitle in the detail field) so the
 * student-level timeline remains readable without opening individual plans.
 */
export async function loadStudentSupportHistory(
  supabase: Client,
  studentId: string,
): Promise<StudentHistoryEvent[]> {
  // ── 1. All plans for this student ─────────────────────────────────────
  const { data: plans, error: plansErr } = await supabase
    .from("student_plans")
    .select("id, title, plan_type, created_at, created_by, submitted_at, submitted_by, finalized_at, finalized_by, approved_at, approved_by, archived_at, archive_reason, parent_acknowledged_at, revision_number, supersedes_plan_id")
    .eq("student_id", studentId)
    .order("created_at");
  if (plansErr) throw plansErr;
  if (!plans || plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);

  // ── 2–4. Batch queries — run in parallel ──────────────────────────────
  type BatchAuditRow = {
    id: string;
    record_id: string | null;
    actor_user_id: string | null;
    new_values: Record<string, unknown> | null;
    created_at: string;
  };

  const [attRes, progressRes, auditRes, guidanceRes, observationRes] = await Promise.all([
    supabase
      .from("student_plan_attachments")
      .select("id, plan_id, attached_at, attached_by, document:child_documents(title)")
      .in("plan_id", planIds)
      .order("attached_at"),
    supabase
      .from("student_plan_progress_entries")
      .select("id, plan_id, entry_date, created_by")
      .in("plan_id", planIds)
      .order("entry_date"),
    supabase
      .from("audit_logs")
      .select("id, record_id, actor_user_id, new_values, created_at")
      .in("record_id", planIds)
      .eq("table_name", "student_plans")
      .eq("action", "UPDATE" as "INSERT" | "UPDATE" | "DELETE")
      .order("created_at"),
    // Home guidance: earliest shared_with_parent_at per plan
    supabase
      .from("support_follow_through_items")
      .select("id, plan_id, shared_with_parent_at")
      .in("plan_id", planIds)
      .eq("is_shared_with_parent", true)
      .not("shared_with_parent_at", "is", null)
      .order("shared_with_parent_at", { ascending: true }),
    // Parent observations: earliest created_at per plan (one event per plan)
    supabase
      .from("parent_observations")
      .select("id, plan_id, created_at")
      .in("plan_id", planIds)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const attachments = attRes.data ?? [];
  const progressRows = progressRes.data ?? [];
  const auditRows = (auditRes.data ?? []) as BatchAuditRow[];
  // Home guidance — keep only the earliest shared_with_parent_at per plan
  const firstGuidanceByPlan = new Map<string, string>();
  for (const g of (guidanceRes.data ?? [])) {
    const planId_ = (g as { plan_id: string; shared_with_parent_at: string }).plan_id;
    const sharedAt = (g as { plan_id: string; shared_with_parent_at: string }).shared_with_parent_at;
    if (!firstGuidanceByPlan.has(planId_)) {
      firstGuidanceByPlan.set(planId_, sharedAt);
    }
  }
  // Parent observations — keep only the earliest created_at per plan
  const firstObservationByPlan = new Map<string, string>();
  for (const o of (observationRes.data ?? [])) {
    const planId_ = (o as { plan_id: string; created_at: string }).plan_id;
    const createdAt = (o as { plan_id: string; created_at: string }).created_at;
    if (!firstObservationByPlan.has(planId_)) {
      firstObservationByPlan.set(planId_, createdAt);
    }
  }

  // Index audit rows that represent an in_review transition, keyed by plan ID
  const reviewStartedByPlan = new Map<string, BatchAuditRow[]>();
  for (const row of auditRows) {
    if (row.new_values?.status === "in_review" && row.record_id) {
      const list = reviewStartedByPlan.get(row.record_id) ?? [];
      list.push(row);
      reviewStartedByPlan.set(row.record_id, list);
    }
  }

  // Index attachments and progress entries by plan_id for O(1) lookup
  const attByPlan = new Map<string, typeof attachments>();
  for (const att of attachments) {
    const list = attByPlan.get(att.plan_id) ?? [];
    list.push(att);
    attByPlan.set(att.plan_id, list);
  }

  const progressByPlan = new Map<string, typeof progressRows>();
  for (const p of progressRows) {
    const list = progressByPlan.get(p.plan_id) ?? [];
    list.push(p);
    progressByPlan.set(p.plan_id, list);
  }

  // ── 5. Batch profile name resolution ──────────────────────────────────
  const profileIds = new Set<string>();
  const addId = (id: string | null | undefined) => { if (id) profileIds.add(id); };
  for (const plan of plans) {
    addId(plan.created_by);
    addId(plan.submitted_by);
    addId(plan.finalized_by);
    addId(plan.approved_by);
  }
  for (const att of attachments) addId(att.attached_by);
  for (const p of progressRows) addId(p.created_by);
  for (const row of auditRows) addId(row.actor_user_id);

  const profileMap = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...profileIds]);
    for (const p of profiles ?? []) profileMap.set(p.id, p.full_name);
  }

  const name = (id: string | null | undefined): string | null =>
    id ? (profileMap.get(id) ?? null) : null;
  const by = (actorName: string | null): string =>
    actorName ? ` by ${actorName}` : "";

  // ── Build events per plan ──────────────────────────────────────────────
  const events: StudentHistoryEvent[] = [];

  for (const plan of plans) {
    const planContext = plan.title; // shown in the detail field for context
    const revNum = plan.revision_number ?? 1;
    const creator = name(plan.created_by);

    const push = (base: Omit<StudentHistoryEvent, "planId" | "planTitle" | "planRevisionNumber">) => {
      events.push({ ...base, planId: plan.id, planTitle: plan.title, planRevisionNumber: revNum });
    };

    // plan_created / plan_revised
    push({
      id: `created_${plan.id}`,
      kind: revNum > 1 ? "plan_revised" : "plan_created",
      timestamp: plan.created_at,
      label:
        revNum > 1
          ? `Revision ${revNum} started${by(creator)}`
          : `Support plan draft started${by(creator)}`,
      detail: revNum > 1 ? `${planContext} · continuing from previous plan` : planContext,
    });

    // plan_submitted
    if (plan.submitted_at) {
      const submitter = name(plan.submitted_by);
      push({
        id: `submitted_${plan.id}`,
        kind: "plan_submitted",
        timestamp: plan.submitted_at,
        label: `Plan submitted for team review${by(submitter)}`,
        detail: planContext,
      });
    }

    // review_started (from audit — in_review transition)
    for (const r of reviewStartedByPlan.get(plan.id) ?? []) {
      const reviewer = name(r.actor_user_id);
      push({
        id: `review_${r.id}`,
        kind: "review_started",
        timestamp: r.created_at,
        label: `Review process started${by(reviewer)}`,
        detail: planContext,
      });
    }

    // plan_finalized
    if (plan.finalized_at) {
      const finalizer = name(plan.finalized_by);
      push({
        id: `finalized_${plan.id}`,
        kind: "plan_finalized",
        timestamp: plan.finalized_at,
        label: `Plan finalized${by(finalizer)}`,
        detail: planContext,
      });
    }

    // plan_approved
    if (plan.approved_at) {
      const approver = name(plan.approved_by);
      push({
        id: `approved_${plan.id}`,
        kind: "plan_approved",
        timestamp: plan.approved_at,
        label: `Plan approved${by(approver)}`,
        detail: planContext,
      });
    }

    // plan_archived
    if (plan.archived_at) {
      push({
        id: `archived_${plan.id}`,
        kind: "plan_archived",
        timestamp: plan.archived_at,
        label: "Plan archived",
        // Prefer archive reason as context; fall back to plan title
        detail: plan.archive_reason ?? planContext,
      });
    }

    // parent_acknowledged
    if (plan.parent_acknowledged_at) {
      push({
        id: `parent_ack_${plan.id}`,
        kind: "parent_acknowledged",
        timestamp: plan.parent_acknowledged_at,
        label: "Parent acknowledged recommendations",
        detail: planContext,
      });
    }

    // home_guidance_shared — fires once per plan (first share event)
    const firstSharedAt = firstGuidanceByPlan.get(plan.id);
    if (firstSharedAt) {
      push({
        id: `home_guidance_${plan.id}`,
        kind: "home_guidance_shared",
        timestamp: firstSharedAt,
        label: "Home support guidance shared with family",
        detail: planContext,
      });
    }

    // parent_observation_shared — fires once per plan (first observation submitted)
    const firstObsAt = firstObservationByPlan.get(plan.id);
    if (firstObsAt) {
      push({
        id: `parent_obs_${plan.id}`,
        kind: "parent_observation_shared",
        timestamp: firstObsAt,
        label: "Parent shared observations on home support",
        detail: planContext,
      });
    }

    // document_attached (per plan's attachments)
    for (const att of attByPlan.get(plan.id) ?? []) {
      if (!att.attached_at) continue;
      const attacher = name(att.attached_by);
      const docRaw = att.document;
      const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
      const docTitle = (doc as { title?: string } | null)?.title ?? null;
      push({
        id: `attachment_${att.id}`,
        kind: "document_attached",
        timestamp: att.attached_at,
        label: docTitle ? `"${docTitle}" attached${by(attacher)}` : `Document attached${by(attacher)}`,
        detail: planContext,
      });
    }

    // progress_added — collapse multiple entries on the same date into one event
    const planProgress = progressByPlan.get(plan.id) ?? [];
    const progressByDate = new Map<string, { count: number; firstId: string; actor: string | null }>();
    for (const p of planProgress) {
      const day = p.entry_date;
      const existing = progressByDate.get(day);
      if (existing) {
        existing.count++;
      } else {
        progressByDate.set(day, { count: 1, firstId: p.id, actor: name(p.created_by) });
      }
    }
    for (const [day, { count, firstId, actor }] of progressByDate) {
      push({
        id: `progress_${firstId}`,
        kind: "progress_added",
        timestamp: `${day}T12:00:00.000Z`,
        label: count === 1
          ? `Progress note added${by(actor)}`
          : `${count} progress notes added${by(actor)}`,
        detail: planContext,
      });
    }
  }

  // Sort chronologically (oldest first)
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return events;
}
