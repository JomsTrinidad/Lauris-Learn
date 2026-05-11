/**
 * iep-payload.ts — payload builders and string utilities for IEP plans.
 *
 * buildIepDetails() converts the flat IepFormState into the JSONB
 * iep_details structure that is persisted to the database.
 *
 * ne / nn / esc are shared string helpers used by the modal save path and
 * the print renderer.
 */

import type { IepDetails } from "./types";
import type { IepFormState } from "./iep-form-state";

/** For JSONB iep_details fields: omit the key entirely when blank. */
export function ne(v: string | null | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

/** For PlanSaveInput fields typed `string | null`: return null when blank. */
export function nn(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** HTML-escape a string for use in print output. */
export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}

/**
 * Converts the flat IepFormState into the IepDetails JSONB structure.
 * Omits keys that are empty/falsy so the stored JSONB stays compact.
 */
export function buildIepDetails(state: IepFormState): IepDetails {
  return {
    region: ne(state.region),
    division: ne(state.division),
    district: ne(state.district),
    learner_lrn: ne(state.learnerLrn),
    learner_birth_date: ne(state.learnerBirthDate),
    learner_sex: ne(state.learnerSex),
    learner_grade: ne(state.learnerGrade),
    religion: ne(state.religion),
    mother_tongue: ne(state.motherTongue),
    home_address: ne(state.homeAddress),
    parent_workplace: ne(state.parentWorkplace),
    caregiver_name: ne(state.caregiverName),
    caregiver_contact: ne(state.caregiverContact),
    caregiver_email: ne(state.caregiverEmail),
    diff_seeing: state.diffSeeing || undefined,
    diff_hearing: state.diffHearing || undefined,
    diff_communicating: state.diffCommunicating || undefined,
    diff_moving: state.diffMoving || undefined,
    diff_concentrating: state.diffConcentrating || undefined,
    diff_remembering: state.diffRemembering || undefined,
    diff_other: state.diffOther || undefined,
    diff_other_description: ne(state.diffOtherDesc),
    has_medical_assessment: state.hasMedical || undefined,
    medical_diagnosis_details: ne(state.medicalDiagnosis),
    evaluation_results: ne(state.evaluationResults),
    present_academic_strengths: ne(state.presentStrengths),
    present_academic_needs: ne(state.presentNeeds),
    disability_impact: ne(state.disabilityImpact),
    meeting_date: ne(state.meetingDate),
    last_iep_date: ne(state.lastIepDate),
    meeting_purpose: ne(state.meetingPurpose),
    revision_date: ne(state.revisionDate),
    iep_review_date: ne(state.iepReviewDate),
    recommendations: ne(state.recommendations),
    agreements: ne(state.agreements),
    team_members: state.teamMembers.length ? state.teamMembers : undefined,
    assistive_devices: state.assistiveDevices.length ? state.assistiveDevices : undefined,
    barriers: state.barriers.length ? state.barriers : undefined,
    prepared_by: ne(state.preparedBy),
    prepared_date: ne(state.preparedDate),
    checked_reviewed_by: ne(state.checkedReviewedBy),
    checked_reviewed_date: ne(state.checkedReviewedDate),
  };
}
