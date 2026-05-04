/**
 * Feature-level types for "Plans & Forms" — structured internal plans
 * (IEP, Support, Behavior, Other) authored inside Lauris Learn.
 *
 * These are SEPARATE from uploaded documents. Uploaded IEP PDFs continue
 * to live in child_documents under document_type='iep'. Structured plans
 * live in student_plans (this module) and reference uploaded documents
 * via student_plan_attachments.
 *
 * Database Row/Insert/Update types live in src/lib/types/database.ts.
 */

import type { Database } from "@/lib/types/database";

export type PlanType   = "iep" | "support" | "behavior" | "other";
export type PlanStatus = "draft" | "submitted" | "in_review" | "approved" | "archived";

type Tables = Database["public"]["Tables"];

export type StudentPlanRow                 = Tables["student_plans"]["Row"];
export type StudentPlanGoalRow             = Tables["student_plan_goals"]["Row"];
export type StudentPlanInterventionRow     = Tables["student_plan_interventions"]["Row"];
export type StudentPlanProgressEntryRow    = Tables["student_plan_progress_entries"]["Row"];
export type StudentPlanAttachmentRow       = Tables["student_plan_attachments"]["Row"];

/** View-model used by the IEP plans list. */
export interface PlanListItem extends StudentPlanRow {
  student:     { id: string; first_name: string; last_name: string } | null;
  school_year: { id: string; name: string } | null;
  created_by_profile: { id: string; full_name: string } | null;
}

/** Full plan payload returned by getPlan — head plus all sub-rows. */
export interface PlanFull {
  plan:           StudentPlanRow;
  student:        { id: string; first_name: string; last_name: string } | null;
  school_year:    { id: string; name: string } | null;
  created_by_profile: { id: string; full_name: string } | null;
  goals:          StudentPlanGoalRow[];
  interventions:  StudentPlanInterventionRow[];
  progress:       StudentPlanProgressEntryRow[];
  attachments:    Array<StudentPlanAttachmentRow & {
    document: {
      id: string;
      title: string;
      document_type: Tables["child_documents"]["Row"]["document_type"];
    } | null;
  }>;
}
