/**
 * IepFormState — canonical typed interface for all IEP form fields.
 *
 * Used by:
 *   - IEPPlanModal (state declarations + recovery snapshots)
 *   - useIepRecovery (typed formState / onRestore args)
 *   - iep-hydration.ts (return type of planToFormState)
 *   - iep-payload.ts (input to buildIepDetails)
 *   - iep-print.ts (input to printIEP, via IepPrintData)
 */

import type { GoalRow, InterventionRow, ProgressRow } from "./steps/shared";
import type { IepTeamMember, IepAssistiveDevice, IepBarrier, PlanStatus } from "./types";

export interface IepFormState {
  // Head
  title: string;
  studentId: string;
  status: PlanStatus;
  // Legacy fields (kept for backward compat + pre-populate present levels)
  diagnosis: string;
  strengths: string;
  areasOfNeed: string;
  backgroundNotes: string;
  parentNotes: string;
  parentConcerns: string;
  homeSupportNotes: string;
  reviewDate: string;
  reviewedByTeacherId: string;
  reviewedByAdminId: string;
  parentAcknowledged: boolean;
  // Cover / DepEd school details
  region: string;
  division: string;
  district: string;
  // Learner snapshot
  learnerLrn: string;
  learnerBirthDate: string;
  learnerSex: string;
  learnerGrade: string;
  religion: string;
  motherTongue: string;
  homeAddress: string;
  parentWorkplace: string;
  caregiverName: string;
  caregiverContact: string;
  caregiverEmail: string;
  // Difficulties / Medical Assessment
  diffSeeing: boolean;
  diffHearing: boolean;
  diffCommunicating: boolean;
  diffMoving: boolean;
  diffConcentrating: boolean;
  diffRemembering: boolean;
  diffOther: boolean;
  diffOtherDesc: string;
  hasMedical: boolean;
  medicalDiagnosis: string;
  // Present Levels
  evaluationResults: string;
  presentStrengths: string;
  presentNeeds: string;
  disabilityImpact: string;
  // Meeting
  meetingDate: string;
  lastIepDate: string;
  meetingPurpose: string;
  revisionDate: string;
  iepReviewDate: string;
  recommendations: string;
  agreements: string;
  // Team + devices + barriers
  teamMembers: IepTeamMember[];
  assistiveDevices: IepAssistiveDevice[];
  barriers: IepBarrier[];
  // Signature / Prepared
  preparedBy: string;
  preparedDate: string;
  checkedReviewedBy: string;
  checkedReviewedDate: string;
  // Sub-row collections
  goals: GoalRow[];
  interventions: InterventionRow[];
  progress: ProgressRow[];
  attachmentIds: string[];
}

/** Returns a blank IepFormState suitable for a new plan. */
export function emptyFormState(): IepFormState {
  return {
    title: "", studentId: "", status: "draft",
    diagnosis: "", strengths: "", areasOfNeed: "", backgroundNotes: "",
    parentNotes: "", parentConcerns: "", homeSupportNotes: "",
    reviewDate: "", reviewedByTeacherId: "", reviewedByAdminId: "",
    parentAcknowledged: false,
    region: "", division: "", district: "",
    learnerLrn: "", learnerBirthDate: "", learnerSex: "", learnerGrade: "",
    religion: "", motherTongue: "", homeAddress: "", parentWorkplace: "",
    caregiverName: "", caregiverContact: "", caregiverEmail: "",
    diffSeeing: false, diffHearing: false, diffCommunicating: false,
    diffMoving: false, diffConcentrating: false, diffRemembering: false,
    diffOther: false, diffOtherDesc: "", hasMedical: false, medicalDiagnosis: "",
    evaluationResults: "", presentStrengths: "", presentNeeds: "", disabilityImpact: "",
    meetingDate: "", lastIepDate: "", meetingPurpose: "", revisionDate: "",
    iepReviewDate: "", recommendations: "", agreements: "",
    teamMembers: [], assistiveDevices: [], barriers: [],
    preparedBy: "", preparedDate: "", checkedReviewedBy: "", checkedReviewedDate: "",
    goals: [], interventions: [], progress: [], attachmentIds: [],
  };
}
