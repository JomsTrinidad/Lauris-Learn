/**
 * Constants for the Plans & Forms feature.
 * Labels and section metadata only — no runtime logic.
 */

import type { PlanStatus, PlanType } from "./types";

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  iep:      "IEP Plan",
  support:  "Support Plan",
  behavior: "Behavior Plan",
  other:    "Other Form",
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft:     "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved:  "Approved",
  archived:  "Archived",
};

/** Common goal-domain suggestions (free text, not enforced). */
export const GOAL_DOMAIN_SUGGESTIONS = [
  "Communication",
  "Social / Emotional",
  "Academic",
  "Self-Help / Daily Living",
  "Motor",
  "Behavior",
  "Sensory",
] as const;

/**
 * DepEd-aligned IEP section tabs.
 * Order mirrors the DepEd Order No. 44 s. 2021 IEP form structure.
 */
export const IEP_SECTIONS = [
  { id: "cover",        label: "Cover & Learner" },
  { id: "assessment",   label: "Assessment" },
  { id: "meeting",      label: "Meeting & Team" },
  { id: "supports",     label: "Supports" },
  { id: "goals",        label: "Goals" },
  { id: "interventions",label: "Interventions" },
  { id: "progress",     label: "Progress" },
  { id: "review",       label: "Review" },
  { id: "attachments",  label: "Attachments" },
] as const;

export type IEPSectionId = typeof IEP_SECTIONS[number]["id"];

/** IEP meeting purpose options (DepEd form). */
export const MEETING_PURPOSE_OPTIONS = [
  { value: "initial",    label: "Initial IEP" },
  { value: "annual",     label: "Annual IEP" },
  { value: "triennial",  label: "IEP Following 3-Year Re-Evaluation" },
  { value: "revision",   label: "Revision of IEP" },
  { value: "exit",       label: "Exit for Inclusion" },
] as const;

/** Default IEP team member role suggestions. */
export const DEFAULT_TEAM_ROLES = [
  "Parent / Guardian / Caregiver",
  "Learner",
  "Special Education Teacher / Therapist",
  "Regular Education / Receiving Teacher",
  "School Principal",
  "Master Teacher",
  "Guidance Counselor / Coordinator",
  "Others",
] as const;

/**
 * DepEd barriers & accommodations legend entries.
 * Configurable here rather than hardcoded in the modal.
 */
export const BARRIERS_LEGEND = [
  { code: "LB1", label: "Difficulty with reading/writing" },
  { code: "LB2", label: "Difficulty following multi-step directions" },
  { code: "LB3", label: "Difficulty sustaining attention" },
  { code: "LB4", label: "Sensory processing difficulties" },
  { code: "LB5", label: "Limited communication skills" },
  { code: "LF1", label: "Visual aids / graphic organizers" },
  { code: "LF2", label: "Structured routines and predictability" },
  { code: "LF3", label: "Peer support / cooperative learning" },
  { code: "LF4", label: "Modified materials / reduced workload" },
  { code: "LF5", label: "AAC / assistive technology" },
] as const;

/** IEP team membership footnote (DepEd requirement). */
export const TEAM_FOOTNOTE =
  "The IEP Team must include at least one regular education teacher of the " +
  "learner if the learner is or may be participating in the regular education environment.";
