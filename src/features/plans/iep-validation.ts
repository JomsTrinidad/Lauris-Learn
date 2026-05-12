/**
 * iep-validation.ts — phased IEP completeness validation.
 *
 * Three tiers:
 *   saveDraft        — never blocks; always returns valid
 *   validateForSharing  — planning-phase minimum (blocks "Save & Share")
 *   validateForFinalization — review-phase minimum (blocks Submit / Finalize / Approve)
 *
 * N/A toggles let the drafter explicitly mark a section as not applicable,
 * waiving the completeness requirement for that section.
 *
 * getStepCompletionStatus() returns per-step completion for sidebar cues.
 */

import type { IepFormState } from "./iep-form-state";

export type ValidationResult =
  | { valid: true }
  | { valid: false; missing: MissingItem[] };

export interface MissingItem {
  stepNumber: number;
  stepLabel: string;
  field: string;
}

// ─── Sharing (planning minimum) ────────────────────────────────────────────

export function validateForSharing(s: IepFormState): ValidationResult {
  const missing: MissingItem[] = [];

  if (!s.studentId) {
    missing.push({ stepNumber: 1, stepLabel: "Meeting Setup", field: "Student" });
  }
  if (!s.meetingPurpose?.trim()) {
    missing.push({ stepNumber: 1, stepLabel: "Meeting Setup", field: "Meeting purpose" });
  }
  if (!s.meetingDate?.trim() && !s.meetingTbs) {
    missing.push({ stepNumber: 1, stepLabel: "Meeting Setup", field: "Meeting date (or mark as TBD)" });
  }
  if (!s.presentNeeds?.trim()) {
    missing.push({ stepNumber: 2, stepLabel: "Needs & Strengths", field: "Present levels of need" });
  }
  if (s.goals.length === 0 && !s.goalsNa) {
    missing.push({ stepNumber: 4, stepLabel: "Goals & Interventions", field: "At least one goal (or mark as N/A)" });
  }
  if (s.assistiveDevices.length === 0 && s.barriers.length === 0 && !s.supportsNa) {
    missing.push({ stepNumber: 3, stepLabel: "Supports & Barriers", field: "Assistive devices or barriers (or mark as N/A)" });
  }

  return missing.length === 0 ? { valid: true } : { valid: false, missing };
}

// ─── Finalization (review minimum) ─────────────────────────────────────────

export function validateForFinalization(s: IepFormState): ValidationResult {
  // First check the planning minimum
  const planningCheck = validateForSharing(s);
  const missing: MissingItem[] = planningCheck.valid ? [] : [...planningCheck.missing];

  if (s.recommendationItems.length === 0 && !s.recommendationsNa) {
    missing.push({ stepNumber: 7, stepLabel: "Team Review", field: "Team recommendations (or mark as N/A)" });
  }
  if (!s.recommendations?.trim() && !s.discussionNa) {
    missing.push({ stepNumber: 7, stepLabel: "Team Review", field: "Discussion notes (or mark as N/A)" });
  }
  if (s.progress.length === 0 && !s.progressNa) {
    missing.push({ stepNumber: 5, stepLabel: "Progress Review", field: "Progress entries (or mark as N/A)" });
  }
  if (!s.agreements?.trim() && !s.agreementsNa) {
    missing.push({ stepNumber: 8, stepLabel: "Parent & Caregiver", field: "Team agreements (or mark as N/A)" });
  }
  if (!s.unresolvedConcerns?.trim() && !s.concernsNa) {
    missing.push({ stepNumber: 8, stepLabel: "Parent & Caregiver", field: "Unresolved concerns (or mark as N/A)" });
  }
  if (!s.nextReviewCommitments?.trim() && !s.nextReviewNa) {
    missing.push({ stepNumber: 8, stepLabel: "Parent & Caregiver", field: "Next review commitments (or mark as N/A)" });
  }

  return missing.length === 0 ? { valid: true } : { valid: false, missing };
}

// ─── Per-step completion status ─────────────────────────────────────────────

export type StepStatus = "complete" | "partial" | "empty";

export interface StepCompletion {
  step: number;
  status: StepStatus;
}

export function getStepCompletionStatus(s: IepFormState): Record<number, StepStatus> {
  const result: Record<number, StepStatus> = {};

  // Step 1 — Learner & Family (studentId + title are the minimum)
  const hasStudent = !!s.studentId;
  const hasTitle   = !!s.title?.trim();
  const hasExtraLearner = !!(s.learnerLrn || s.caregiverName || s.region);
  if (hasStudent && hasTitle) {
    result[1] = "complete";
  } else if (hasStudent || hasTitle || hasExtraLearner) {
    result[1] = "partial";
  } else {
    result[1] = "empty";
  }

  // Step 2 — Meeting Setup
  const hasPurpose = !!s.meetingPurpose?.trim();
  const hasDate    = !!(s.meetingDate?.trim() || s.meetingTbs);
  if (hasPurpose && hasDate) {
    result[2] = "complete";
  } else if (hasPurpose || hasDate || !!s.meetingLocation?.trim() || s.teamMembers.length > 0) {
    result[2] = "partial";
  } else {
    result[2] = "empty";
  }

  // Step 3 — Needs & Strengths
  const hasNeeds = !!s.presentNeeds?.trim();
  const hasOtherNeeds = !!(s.presentStrengths?.trim() || s.evaluationResults?.trim());
  if (hasNeeds) {
    result[3] = "complete";
  } else if (hasOtherNeeds) {
    result[3] = "partial";
  } else {
    result[3] = "empty";
  }

  // Step 4 — Supports & Barriers
  if (s.supportsNa) {
    result[4] = "complete";
  } else {
    const hasDevices = s.assistiveDevices.length > 0;
    const hasBarriers = s.barriers.length > 0;
    result[4] = hasDevices && hasBarriers ? "complete" : hasDevices || hasBarriers ? "partial" : "empty";
  }

  // Step 5 — Goals & Interventions
  if (s.goalsNa) {
    result[5] = "complete";
  } else {
    result[5] = s.goals.length > 0 ? "complete" : "empty";
  }

  // Step 6 — Draft Notes (always optional)
  result[6] = s.draftNotes?.trim() ? "complete" : "empty";

  // Step 7 — Team Review (Discussion)
  const hasRecs = s.recommendationItems.length > 0 || s.recommendationsNa;
  const hasNotes = !!(s.recommendations?.trim()) || s.discussionNa;
  if (hasRecs && hasNotes) {
    result[7] = "complete";
  } else if (hasRecs || hasNotes) {
    result[7] = "partial";
  } else {
    result[7] = "empty";
  }

  // Step 8 — Progress Review
  if (s.progressNa) {
    result[8] = "complete";
  } else {
    result[8] = s.progress.length > 0 ? "complete" : "empty";
  }

  // Step 9 — Agreements (Parent & Caregiver)
  const p9a = !!(s.agreements?.trim()) || s.agreementsNa;
  const p9b = !!(s.unresolvedConcerns?.trim()) || s.concernsNa;
  const p9c = !!(s.nextReviewCommitments?.trim()) || s.nextReviewNa;
  if (p9a && p9b && p9c) {
    result[9] = "complete";
  } else if (p9a || p9b || p9c || !!(s.parentConsentNotes?.trim())) {
    result[9] = "partial";
  } else {
    result[9] = "empty";
  }

  // Step 10 — Attachments (always optional)
  result[10] = s.attachmentIds.length > 0 ? "complete" : "empty";

  return result;
}

function allFilled(fields: (string | boolean | undefined | null)[]): boolean {
  return fields.every((f) => (typeof f === "string" ? f.trim().length > 0 : !!f));
}

function anyFilled(fields: (string | boolean | undefined | null)[]): boolean {
  return fields.some((f) => (typeof f === "string" ? f.trim().length > 0 : !!f));
}
