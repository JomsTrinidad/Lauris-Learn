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

// ─── DepEd-aligned IEP details ────────────────────────────────────────────

/** IEP team member row stored inside iep_details.team_members[]. */
export interface IepTeamMember {
  id: string;
  name: string;
  role: string;
  requires_ack: boolean;
  acknowledged_at: string | null;
}

/** Assistive device row stored inside iep_details.assistive_devices[]. */
export interface IepAssistiveDevice {
  id: string;
  difficulty: string;
  device: string;
}

/** Barriers / accommodations row stored inside iep_details.barriers[]. */
export interface IepBarrier {
  id: string;
  difficulty: string;
  learning_barriers: string;
  learning_facilitators: string;
  accommodations: string;
}

/**
 * DepEd-specific IEP details stored as JSONB in student_plans.iep_details.
 *
 * Sections:
 *   Cover / School Details: region, division, district
 *   Learner snapshot:       learner_lrn, learner_birth_date, learner_sex,
 *                           learner_grade
 *   Learner extras:         religion, mother_tongue, home_address,
 *                           parent_workplace
 *   Difficulties/Medical:   diff_* flags + medical fields
 *   Present Levels:         evaluation_results, academic_strengths,
 *                           academic_needs, disability_impact
 *   Meeting:                dates, purpose, review_date, notes
 *   Team Members:           repeatable rows
 *   Assistive Devices:      repeatable rows
 *   Barriers:               repeatable grid rows
 *   Signature:              prepared_by, prepared_date, checked fields
 *
 * All fields are optional so NULL iep_details (existing plans) gracefully
 * hydrate to empty defaults.
 */
export interface IepDetails {
  // Cover / School Details
  region?: string;
  division?: string;
  district?: string;

  // Learner snapshot (prefilled from DB on first save for historical accuracy)
  learner_lrn?: string;
  learner_birth_date?: string;
  learner_sex?: string;
  learner_grade?: string;

  // Learner extras (DepEd-specific; not in the core students table)
  religion?: string;
  mother_tongue?: string;
  home_address?: string;
  parent_workplace?: string;

  // Caregiver contact snapshot (point-in-time; prefilled from guardians on first open)
  caregiver_name?: string;
  caregiver_contact?: string;
  caregiver_email?: string;

  // Difficulties / Medical Assessment checkboxes
  diff_seeing?: boolean;
  diff_hearing?: boolean;
  diff_communicating?: boolean;
  diff_moving?: boolean;
  diff_concentrating?: boolean;
  diff_remembering?: boolean;
  diff_other?: boolean;
  diff_other_description?: string;
  has_medical_assessment?: boolean;
  medical_diagnosis_details?: string;

  // Present Levels of Academic Achievement and/or Functional Performance
  evaluation_results?: string;
  present_academic_strengths?: string;
  present_academic_needs?: string;
  disability_impact?: string;

  // Meeting Information
  meeting_date?: string;
  last_iep_date?: string;
  meeting_purpose?: string;
  revision_date?: string;
  iep_review_date?: string;
  recommendations?: string;
  agreements?: string;

  // IEP Team Members (repeatable)
  team_members?: IepTeamMember[];

  // Special Factors / Assistive Devices (repeatable)
  assistive_devices?: IepAssistiveDevice[];

  // Difficulties, Barriers, and Enabling Supports (repeatable)
  barriers?: IepBarrier[];

  // Prepared / Reviewed (for print signature area)
  prepared_by?: string;
  prepared_date?: string;
  checked_reviewed_by?: string;
  checked_reviewed_date?: string;
}
