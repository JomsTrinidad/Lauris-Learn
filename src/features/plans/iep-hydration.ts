/**
 * iep-hydration.ts — pure hydration helpers for IEP plan data.
 *
 * planToFormState() maps a PlanFull server response into the IepFormState
 * shape used by IEPPlanModal, plus a few non-form-state extras (stableId,
 * createdAt, etc.) that the modal also needs to track.
 *
 * Keeping this logic here means IEPPlanModal.hydrateFromServer() becomes a
 * thin wrapper that calls planToFormState() then assigns the results to
 * React state — no mapping logic inline.
 */

import type { PlanFull, IepDetails } from "./types";
import type { IepFormState } from "./iep-form-state";

/** Everything returned by planToFormState — form fields + modal metadata. */
export interface HydratedPlan {
  formState: IepFormState;
  stableId: string;
  createdAt: string | null;
  updatedAt: string | null;
  createdByName: string | null;
  /** True when review/prepared fields are populated — used to auto-expand the review section. */
  showReviewDetails: boolean;
  /** Goal IDs that have enough tracking data to start expanded. */
  expandedGoalIds: string[];
}

/**
 * Maps a PlanFull server response to an IepFormState + modal metadata object.
 * Pure function — no side effects, no React state.
 */
export function planToFormState(full: PlanFull): HydratedPlan {
  const p = full.plan;
  const d = (p.iep_details ?? {}) as IepDetails;

  const goals = full.goals.map((g) => ({
    id: g.id,
    domain: g.domain,
    description: g.description,
    target_date: g.target_date,
    measurement_method: g.measurement_method,
    baseline: g.baseline,
    success_criteria: g.success_criteria,
    enroute_objectives: g.enroute_objectives ?? null,
    timeline: g.timeline ?? null,
    responsible_person: g.responsible_person ?? null,
    remarks: g.remarks ?? null,
    sort_order: g.sort_order,
  }));

  return {
    stableId: p.id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    createdByName: full.created_by_profile?.full_name ?? null,
    showReviewDetails: !!(
      d.prepared_by ||
      p.reviewed_by_teacher_id ||
      p.reviewed_by_admin_id ||
      p.review_date
    ),
    expandedGoalIds: goals
      .filter((g) => !!(g.baseline || g.measurement_method || g.success_criteria || g.remarks))
      .map((g) => g.id),
    formState: {
      title: p.title,
      studentId: p.student_id,
      status: p.status,
      diagnosis: p.diagnosis ?? "",
      strengths: p.strengths ?? "",
      areasOfNeed: p.areas_of_need ?? "",
      backgroundNotes: p.background_notes ?? "",
      parentNotes: p.parent_notes ?? "",
      parentConcerns: p.parent_concerns ?? "",
      homeSupportNotes: p.home_support_notes ?? "",
      reviewDate: p.review_date ?? "",
      reviewedByTeacherId: p.reviewed_by_teacher_id ?? "",
      reviewedByAdminId: p.reviewed_by_admin_id ?? "",
      parentAcknowledged: p.parent_acknowledged_at !== null,
      region: d.region ?? "",
      division: d.division ?? "",
      district: d.district ?? "",
      learnerLrn: d.learner_lrn ?? "",
      learnerBirthDate: d.learner_birth_date ?? "",
      learnerSex: d.learner_sex ?? "",
      learnerGrade: d.learner_grade ?? "",
      religion: d.religion ?? "",
      motherTongue: d.mother_tongue ?? "",
      homeAddress: d.home_address ?? "",
      parentWorkplace: d.parent_workplace ?? "",
      caregiverName: d.caregiver_name ?? "",
      caregiverContact: d.caregiver_contact ?? "",
      caregiverEmail: d.caregiver_email ?? "",
      diffSeeing: d.diff_seeing ?? false,
      diffHearing: d.diff_hearing ?? false,
      diffCommunicating: d.diff_communicating ?? false,
      diffMoving: d.diff_moving ?? false,
      diffConcentrating: d.diff_concentrating ?? false,
      diffRemembering: d.diff_remembering ?? false,
      diffOther: d.diff_other ?? false,
      diffOtherDesc: d.diff_other_description ?? "",
      hasMedical: d.has_medical_assessment ?? false,
      medicalDiagnosis: d.medical_diagnosis_details ?? "",
      evaluationResults: d.evaluation_results ?? "",
      // Pre-populate present levels from legacy fields when iep_details fields are empty
      presentStrengths: d.present_academic_strengths ?? p.strengths ?? "",
      presentNeeds: d.present_academic_needs ?? p.areas_of_need ?? "",
      disabilityImpact: d.disability_impact ?? "",
      meetingDate: d.meeting_date ?? "",
      lastIepDate: d.last_iep_date ?? "",
      meetingPurpose: d.meeting_purpose ?? "",
      revisionDate: d.revision_date ?? "",
      iepReviewDate: d.iep_review_date ?? "",
      meetingLocation: d.meeting_location ?? "",
      meetingLink: d.meeting_link ?? "",
      meetingLinkPending: d.meeting_link_pending ?? false,
      recommendations: d.recommendations ?? "",
      recommendationItems: d.recommendation_items ?? [],
      agreements: d.agreements ?? "",
      parentConsentNotes: d.parent_consent_notes ?? "",
      unresolvedConcerns: d.unresolved_concerns ?? "",
      actionItems: d.action_items ?? "",
      nextReviewCommitments: d.next_review_commitments ?? "",
      teamMembers: d.team_members ?? [],
      assistiveDevices: d.assistive_devices ?? [],
      barriers: d.barriers ?? [],
      preparedBy: d.prepared_by ?? "",
      preparedDate: d.prepared_date ?? "",
      checkedReviewedBy: d.checked_reviewed_by ?? "",
      checkedReviewedDate: d.checked_reviewed_date ?? "",
      draftNotes: d.draft_notes ?? "",
      meetingTbs: d.meeting_tbs ?? false,
      supportsNa: d.supports_na ?? false,
      goalsNa: d.goals_na ?? false,
      recommendationsNa: d.recommendations_na ?? false,
      discussionNa: d.discussion_na ?? false,
      progressNa: d.progress_na ?? false,
      agreementsNa: d.agreements_na ?? false,
      concernsNa: d.concerns_na ?? false,
      nextReviewNa: d.next_review_na ?? false,
      goals,
      interventions: full.interventions.map((i) => ({
        id: i.id,
        strategy: i.strategy,
        frequency: i.frequency,
        responsible_person: i.responsible_person,
        environment: i.environment,
        notes: i.notes,
        goal_id: i.goal_id ?? null,
        sort_order: i.sort_order,
      })),
      progress: full.progress.map((pr) => ({
        id: pr.id,
        linked_goal_id: pr.linked_goal_id,
        entry_date: pr.entry_date,
        progress_note: pr.progress_note,
        observed_by: pr.observed_by,
        next_step: pr.next_step,
      })),
      attachmentIds: full.attachments.map((a) => a.document_id),
    },
  };
}
