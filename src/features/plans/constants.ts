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

/** Section metadata for the IEP modal stepper / tab list. */
export const IEP_SECTIONS = [
  { id: "profile",       label: "Student Profile" },
  { id: "goals",         label: "Goals" },
  { id: "interventions", label: "Interventions" },
  { id: "progress",      label: "Progress" },
  { id: "parent",        label: "Parent Input" },
  { id: "review",        label: "Review & Approval" },
  { id: "attachments",   label: "Attachments" },
] as const;

export type IEPSectionId = typeof IEP_SECTIONS[number]["id"];
