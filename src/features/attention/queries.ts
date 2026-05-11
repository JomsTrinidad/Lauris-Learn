/**
 * Attention item queries — IEP phase.
 *
 * Two role paths:
 *   Admin (admin_approval_required) → plans in submitted / in_review,
 *     oldest-first so the longest-waiting surfaces at the top.
 *
 *   Teacher → own draft IEPs missing annual goals,
 *     oldest-first so stale drafts don't silently rot.
 *
 * Simple-review mode: no admin queue items (per spec). Teacher items
 * still apply regardless of workflow mode.
 *
 * Adding future modules (attendance, billing, etc.):
 *   1. Write a parallel get<Module>AttentionItems() function.
 *   2. Call it from getIepAttentionItems() or a new getAllAttentionItems().
 *   3. No changes to types.ts or the hook are required.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { AttentionItem, AttentionPriority } from "./types";
import { PENDING_REVIEW_STATUSES } from "@/features/plans/review-queue";

type Client = SupabaseClient<Database>;

// ── Internal helpers ──────────────────────────────────────────────────────────

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function submittedAgeLabel(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d === 0) return "Submitted today.";
  if (d === 1) return "Submitted yesterday.";
  return `Submitted ${d} days ago.`;
}

function reviewPriority(submittedAt: string | null | undefined): AttentionPriority {
  const d = daysSince(submittedAt);
  if (d >= 7) return "high";
  if (d >= 3) return "medium";
  return "low";
}

async function batchStudentNames(
  supabase: Client,
  studentIds: string[],
): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in("id", studentIds);
  return new Map(
    (data ?? []).map((s) => [
      s.id,
      `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Unknown student",
    ]),
  );
}

// ── Admin: IEP plans waiting for review ──────────────────────────────────────

export async function getIepAdminAttentionItems(
  supabase: Client,
  schoolId: string,
): Promise<AttentionItem[]> {
  const { data, error } = await supabase
    .from("student_plans")
    .select("id, title, status, submitted_at, student_id")
    .eq("school_id", schoolId)
    .in("status", [...PENDING_REVIEW_STATUSES])
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(5);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const studentIds = [...new Set(data.map((p) => p.student_id))];
  const nameMap = await batchStudentNames(supabase, studentIds);

  return data.map((plan) => ({
    id: `iep_review_${plan.id}`,
    category: "needs_review" as const,
    title:
      plan.status === "in_review"
        ? "IEP Under Active Review"
        : "IEP Waiting for Review",
    description: `${nameMap.get(plan.student_id) ?? "Unknown student"} — ${plan.title || "Untitled Plan"}`,
    detail: submittedAgeLabel(plan.submitted_at),
    related_student_id: plan.student_id,
    related_plan_id: plan.id,
    action_href: "/documents?view=plans-forms",
    action_label: "Open IEP",
    priority: reviewPriority(plan.submitted_at),
    relevant_at: plan.submitted_at ?? undefined,
  }));
}

// ── Teacher: own draft IEPs missing annual goals ──────────────────────────────

export async function getIepTeacherAttentionItems(
  supabase: Client,
  schoolId: string,
  userId: string,
): Promise<AttentionItem[]> {
  const { data: plans, error } = await supabase
    .from("student_plans")
    .select("id, title, created_at, student_id")
    .eq("school_id", schoolId)
    .eq("created_by", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(10);
  if (error || !plans || plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const { data: goalRows } = await supabase
    .from("student_plan_goals")
    .select("plan_id")
    .in("plan_id", planIds);
  const plansWithGoals = new Set((goalRows ?? []).map((g) => g.plan_id as string));

  const noGoalPlans = plans.filter((p) => !plansWithGoals.has(p.id));
  if (noGoalPlans.length === 0) return [];

  const studentIds = [...new Set(noGoalPlans.map((p) => p.student_id))];
  const nameMap = await batchStudentNames(supabase, studentIds);

  return noGoalPlans.slice(0, 3).map((plan) => ({
    id: `iep_teacher_draft_${plan.id}`,
    category: "needs_input" as const,
    title: "Draft IEP Missing Goals",
    description: `${nameMap.get(plan.student_id) ?? "Unknown student"} — ${plan.title || "Untitled Plan"}`,
    detail: "No annual goals added yet.",
    related_student_id: plan.student_id,
    related_plan_id: plan.id,
    action_href: "/documents?view=plans-forms",
    action_label: "Open IEP",
    priority: "low" as const,
    relevant_at: plan.created_at ?? undefined,
  }));
}

// ── Main entry — routes by role + workflow mode ───────────────────────────────

/**
 * Returns all IEP-related attention items for the caller's role.
 *
 * - Admin + admin_approval_required → submitted/in_review plans (oldest first)
 * - Admin + simple_review           → (none — per spec)
 * - Teacher (any mode)              → own drafts missing goals
 * - Other roles                     → empty
 */
export async function getIepAttentionItems(
  supabase: Client,
  {
    schoolId,
    userId,
    userRole,
    workflowMode,
  }: {
    schoolId: string;
    userId: string;
    userRole: string | null;
    workflowMode: string;
  },
): Promise<AttentionItem[]> {
  if (
    (userRole === "school_admin" || userRole === "super_admin") &&
    workflowMode === "admin_approval_required"
  ) {
    return getIepAdminAttentionItems(supabase, schoolId);
  }

  if (userRole === "teacher") {
    return getIepTeacherAttentionItems(supabase, schoolId, userId);
  }

  return [];
}
