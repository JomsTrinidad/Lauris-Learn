"use client";

/**
 * IEP Plan modal — create + edit a DepEd-aligned structured IEP Plan.
 *
 * Sections (migration 085 + DepEd Order No. 44 s. 2021):
 *   1. Learner & Meeting   — school details, learner/parent snapshot, meeting info
 *   2. Needs & Strengths   — difficulties, medical, present levels
 *   3. Supports            — assistive devices, barriers/accommodations
 *   4. Goals & Interventions — DepEd annual goals with linked strategies
 *   5. Progress & Review   — progress entries + review/signature block
 *   6. Attachments         — reference uploaded child_documents
 *
 * Print: "Print IEP" in the overflow menu opens a DepEd-style HTML document
 * via a hidden iframe — no server-side PDF generation required.
 *
 * Architecture: this file is the orchestration layer only.
 *   - Step rendering   → steps/Step1–Step6
 *   - Header shell     → IepModalHeader (owns overflow-menu state)
 *   - Footer shell     → IepModalFooter
 *   - Recovery hook    → useIepRecovery<IepFormState>
 *   - Form state type  → iep-form-state.ts
 *   - Hydration        → iep-hydration.ts (planToFormState)
 *   - Payload builder  → iep-payload.ts (buildIepDetails, nn)
 *   - Print renderer   → iep-print.ts (printIEP)
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorAlert } from "@/components/ui/spinner";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlan, savePlan, setPlanStatus, createRevision } from "./queries";
import type { PlanFull, PlanStatus, IepWorkflowMode } from "./types";
import { EvidenceAssistant } from "./iep-assistant/EvidenceAssistant";
import { useIepRecovery } from "@/lib/iep-recovery/useIepRecovery";
import { IepStepHelp } from "./IepStepHelp";
import { format } from "date-fns";
import { IepModalHeader } from "./IepModalHeader";
import { IepModalFooter } from "./IepModalFooter";
import { Step1LearnerMeeting } from "./steps/Step1LearnerMeeting";
import { Step2NeedsStrengths } from "./steps/Step2NeedsStrengths";
import { Step3Supports } from "./steps/Step3Supports";
import { Step4GoalsInterventions } from "./steps/Step4GoalsInterventions";
import { Step5ProgressReview } from "./steps/Step5ProgressReview";
import { Step6Attachments } from "./steps/Step6Attachments";
import type { GoalRow, InterventionRow, ProgressRow, StudentOption, DocOption } from "./steps/shared";
import type { IepTeamMember, IepAssistiveDevice, IepBarrier } from "./types";
import { type IepFormState, emptyFormState } from "./iep-form-state";
import { planToFormState } from "./iep-hydration";
import { buildIepDetails, nn } from "./iep-payload";
import { printIEP } from "./iep-print";
import type { WizardStep } from "./constants";

// Re-export WizardStep so existing importers of this module don't break.
export type { WizardStep } from "./constants";

// ─── Props ─────────────────────────────────────────────────────────────────

export interface IEPPlanModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (planId: string) => void;
  planId: string | null;
  schoolId: string;
  schoolName?: string;
  schoolYearId: string | null;
  schoolYearName?: string | null;
  userId: string;
  userRole: "school_admin" | "teacher" | "parent" | "super_admin" | null;
  defaultStudentId?: string | null;
  workflowMode?: IepWorkflowMode;
  /** Called after a revision is created; receives the new draft plan's ID. */
  onRevisionCreated?: (newPlanId: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function IEPPlanModal({
  open, onClose, onSaved,
  planId, schoolId, schoolName = "", schoolYearId, schoolYearName = null,
  userId, userRole, defaultStudentId = null, workflowMode = "simple_review",
  onRevisionCreated,
}: IEPPlanModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin   = userRole === "school_admin";
  const isStaff   = userRole === "school_admin" || userRole === "teacher";
  const isSimpleReview = workflowMode === "simple_review";
  const isEditing = planId !== null;

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [step1LegendOpen, setStep1LegendOpen] = useState(false);
  const [step3BarriersLegendOpen, setStep3BarriersLegendOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showSaveDraftPrompt, setShowSaveDraftPrompt] = useState(false);
  const [expandedGoalTracking, setExpandedGoalTracking] = useState<Set<string>>(new Set());
  const [showReviewDetails, setShowReviewDetails] = useState(false);
  const [stepHelpOpen, setStepHelpOpen] = useState(false);

  // Close step help panel when switching steps
  useEffect(() => { setStepHelpOpen(false); }, [activeStep]);

  // ── Head / metadata (not persisted in IepFormState) ─────────────────────
  const [createdAt, setCreatedAt]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]       = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [stableId, setStableId]         = useState<string | null>(null);

  // ── IEP form state (all 50+ fields) ──────────────────────────────────────
  const [title, setTitle]               = useState("");
  const [studentId, setStudentId]       = useState(defaultStudentId ?? "");
  const [status, setStatus]             = useState<PlanStatus>("draft");
  const [diagnosis, setDiagnosis]             = useState("");
  const [strengths, setStrengths]             = useState("");
  const [areasOfNeed, setAreasOfNeed]         = useState("");
  const [backgroundNotes, setBackgroundNotes] = useState("");
  const [parentNotes, setParentNotes]           = useState("");
  const [parentConcerns, setParentConcerns]     = useState("");
  const [homeSupportNotes, setHomeSupportNotes] = useState("");
  const [reviewDate, setReviewDate]             = useState("");
  const [reviewedByTeacherId, setReviewedByTeacherId] = useState("");
  const [reviewedByAdminId, setReviewedByAdminId]     = useState("");
  const [parentAcknowledged, setParentAcknowledged]   = useState(false);

  // Cover / School
  const [region, setRegion]     = useState("");
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");

  // Learner snapshot
  const [learnerLrn, setLearnerLrn]         = useState("");
  const [learnerBirthDate, setLearnerBirthDate] = useState("");
  const [learnerSex, setLearnerSex]         = useState("");
  const [learnerGrade, setLearnerGrade]     = useState("");
  const [religion, setReligion]             = useState("");
  const [motherTongue, setMotherTongue]     = useState("");
  const [homeAddress, setHomeAddress]       = useState("");
  const [parentWorkplace, setParentWorkplace] = useState("");
  const [caregiverName, setCaregiverName]   = useState("");
  const [caregiverContact, setCaregiverContact] = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");

  // Difficulties / Medical
  const [diffSeeing, setDiffSeeing]               = useState(false);
  const [diffHearing, setDiffHearing]             = useState(false);
  const [diffCommunicating, setDiffCommunicating] = useState(false);
  const [diffMoving, setDiffMoving]               = useState(false);
  const [diffConcentrating, setDiffConcentrating] = useState(false);
  const [diffRemembering, setDiffRemembering]     = useState(false);
  const [diffOther, setDiffOther]                 = useState(false);
  const [diffOtherDesc, setDiffOtherDesc]         = useState("");
  const [hasMedical, setHasMedical]               = useState(false);
  const [medicalDiagnosis, setMedicalDiagnosis]   = useState("");

  // Present Levels
  const [evaluationResults, setEvaluationResults]   = useState("");
  const [presentStrengths, setPresentStrengths]     = useState("");
  const [presentNeeds, setPresentNeeds]             = useState("");
  const [disabilityImpact, setDisabilityImpact]     = useState("");

  // Meeting
  const [meetingDate, setMeetingDate]       = useState("");
  const [lastIepDate, setLastIepDate]       = useState("");
  const [meetingPurpose, setMeetingPurpose] = useState("");
  const [revisionDate, setRevisionDate]     = useState("");
  const [iepReviewDate, setIepReviewDate]   = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [agreements, setAgreements]           = useState("");

  // Team / Devices / Barriers
  const [teamMembers, setTeamMembers] = useState<IepTeamMember[]>([]);
  const [assistiveDevices, setAssistiveDevices] = useState<IepAssistiveDevice[]>([]);
  const [barriers, setBarriers] = useState<IepBarrier[]>([]);

  // Signature / Review
  const [preparedBy, setPreparedBy]             = useState("");
  const [preparedDate, setPreparedDate]         = useState("");
  const [checkedReviewedBy, setCheckedReviewedBy] = useState("");
  const [checkedReviewedDate, setCheckedReviewedDate] = useState("");

  // Sub-row collections
  const [goals, setGoals]                 = useState<GoalRow[]>([]);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [progress, setProgress]           = useState<ProgressRow[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  // Lookup data (not form state)
  const [students, setStudents]   = useState<StudentOption[]>([]);
  const [studentDocs, setStudentDocs] = useState<DocOption[]>([]);

  // ── Recovery system ────────────────────────────────────────────────────────
  const getFormStateForRecovery = (): IepFormState => ({
    title, studentId, status,
    diagnosis, strengths, areasOfNeed, backgroundNotes,
    parentNotes, parentConcerns, homeSupportNotes,
    reviewDate, reviewedByTeacherId, reviewedByAdminId, parentAcknowledged,
    region, division, district,
    learnerLrn, learnerBirthDate, learnerSex, learnerGrade,
    religion, motherTongue, homeAddress, parentWorkplace,
    caregiverName, caregiverContact, caregiverEmail,
    diffSeeing, diffHearing, diffCommunicating, diffMoving, diffConcentrating, diffRemembering,
    diffOther, diffOtherDesc, hasMedical, medicalDiagnosis,
    evaluationResults, presentStrengths, presentNeeds, disabilityImpact,
    meetingDate, lastIepDate, meetingPurpose, revisionDate, iepReviewDate, recommendations, agreements,
    teamMembers, assistiveDevices, barriers,
    preparedBy, preparedDate, checkedReviewedBy, checkedReviewedDate,
    goals, interventions, progress, attachmentIds,
  });

  const restoreFormState = (data: IepFormState) => {
    setTitle(data.title ?? "");
    setStudentId(data.studentId ?? "");
    setStatus(data.status ?? "draft");
    setDiagnosis(data.diagnosis ?? "");
    setStrengths(data.strengths ?? "");
    setAreasOfNeed(data.areasOfNeed ?? "");
    setBackgroundNotes(data.backgroundNotes ?? "");
    setParentNotes(data.parentNotes ?? "");
    setParentConcerns(data.parentConcerns ?? "");
    setHomeSupportNotes(data.homeSupportNotes ?? "");
    setReviewDate(data.reviewDate ?? "");
    setReviewedByTeacherId(data.reviewedByTeacherId ?? "");
    setReviewedByAdminId(data.reviewedByAdminId ?? "");
    setParentAcknowledged(data.parentAcknowledged ?? false);
    setRegion(data.region ?? "");
    setDivision(data.division ?? "");
    setDistrict(data.district ?? "");
    setLearnerLrn(data.learnerLrn ?? "");
    setLearnerBirthDate(data.learnerBirthDate ?? "");
    setLearnerSex(data.learnerSex ?? "");
    setLearnerGrade(data.learnerGrade ?? "");
    setReligion(data.religion ?? "");
    setMotherTongue(data.motherTongue ?? "");
    setHomeAddress(data.homeAddress ?? "");
    setParentWorkplace(data.parentWorkplace ?? "");
    setCaregiverName(data.caregiverName ?? "");
    setCaregiverContact(data.caregiverContact ?? "");
    setCaregiverEmail(data.caregiverEmail ?? "");
    setDiffSeeing(data.diffSeeing ?? false);
    setDiffHearing(data.diffHearing ?? false);
    setDiffCommunicating(data.diffCommunicating ?? false);
    setDiffMoving(data.diffMoving ?? false);
    setDiffConcentrating(data.diffConcentrating ?? false);
    setDiffRemembering(data.diffRemembering ?? false);
    setDiffOther(data.diffOther ?? false);
    setDiffOtherDesc(data.diffOtherDesc ?? "");
    setHasMedical(data.hasMedical ?? false);
    setMedicalDiagnosis(data.medicalDiagnosis ?? "");
    setEvaluationResults(data.evaluationResults ?? "");
    setPresentStrengths(data.presentStrengths ?? "");
    setPresentNeeds(data.presentNeeds ?? "");
    setDisabilityImpact(data.disabilityImpact ?? "");
    setMeetingDate(data.meetingDate ?? "");
    setLastIepDate(data.lastIepDate ?? "");
    setMeetingPurpose(data.meetingPurpose ?? "");
    setRevisionDate(data.revisionDate ?? "");
    setIepReviewDate(data.iepReviewDate ?? "");
    setRecommendations(data.recommendations ?? "");
    setAgreements(data.agreements ?? "");
    setTeamMembers(data.teamMembers ?? []);
    setAssistiveDevices(data.assistiveDevices ?? []);
    setBarriers(data.barriers ?? []);
    setPreparedBy(data.preparedBy ?? "");
    setPreparedDate(data.preparedDate ?? "");
    setCheckedReviewedBy(data.checkedReviewedBy ?? "");
    setCheckedReviewedDate(data.checkedReviewedDate ?? "");
    setGoals(data.goals ?? []);
    setInterventions(data.interventions ?? []);
    setProgress(data.progress ?? []);
    setAttachmentIds(data.attachmentIds ?? []);
  };

  const recovery = useIepRecovery<IepFormState>(
    { userId, studentId, planId, schoolYearId, draftUpdatedAt: updatedAt, isEditing },
    getFormStateForRecovery(),
    restoreFormState,
  );

  // ── Reset / hydrate ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setActiveStep(1);
    setError(null);
    setStep1LegendOpen(false);
    setStep3BarriersLegendOpen(false);
    setShowSaveDraftPrompt(false);

    let cancelled = false;
    (async () => {
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, first_name, last_name, student_code")
        .eq("school_id", schoolId)
        .order("last_name");
      if (cancelled) return;
      setStudents(
        ((studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string; student_code: string | null }>).map(
          (s) => ({ id: s.id, full_name: `${s.first_name} ${s.last_name}`, student_code: s.student_code ?? null }),
        ),
      );

      if (planId) {
        setLoading(true);
        try {
          const full = await getPlan(supabase, planId);
          if (cancelled) return;
          if (!full) { setError("Plan not found or you don't have access."); setLoading(false); return; }
          hydrateFromServer(full);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load plan.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        setStableId(crypto.randomUUID());
        resetAllFields();
        setStudentId(defaultStudentId ?? "");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId, schoolId]);

  // Load student docs when student changes
  useEffect(() => {
    if (!open || !studentId) { setStudentDocs([]); return; }
    let cancelled = false;
    supabase
      .from("child_documents")
      .select("id, title, document_type")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setStudentDocs((data ?? []) as DocOption[]);
      });
    return () => { cancelled = true; };
  }, [open, studentId, schoolId, supabase]);

  // Mark changes on major field edits (title, studentId)
  useEffect(() => {
    if (!isEditing || !stableId) return;
    recovery.markChanged();
  }, [title, studentId, recovery, isEditing, stableId]);

  // Auto-populate region/division/district from school settings (only when fields are empty)
  useEffect(() => {
    if (!open || !schoolId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("region, schools_division, district")
        .eq("id", schoolId)
        .maybeSingle();
      if (cancelled || !data) return;
      const d = data as { region: string | null; schools_division: string | null; district: string | null };
      if (!region && d.region) setRegion(d.region);
      if (!division && d.schools_division) setDivision(d.schools_division);
      if (!district && d.district) setDistrict(d.district);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schoolId]);

  // Prefetch LRN, gender, grade/section, and caregiver for selected student
  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    (async () => {
      const { data: studentRow } = await supabase
        .from("students")
        .select("child_profile_id, date_of_birth, gender")
        .eq("id", studentId)
        .maybeSingle();
      if (cancelled || !studentRow) return;

      const row = studentRow as { child_profile_id: string | null; date_of_birth: string | null; gender: string | null };

      if (!learnerBirthDate && row.date_of_birth) setLearnerBirthDate(row.date_of_birth);
      if (!learnerSex && row.gender) setLearnerSex(row.gender);

      if (!learnerGrade && schoolYearId) {
        const { data: enrollData } = await supabase
          .from("enrollments")
          .select("class:classes(name, level)")
          .eq("student_id", studentId)
          .eq("school_year_id", schoolYearId)
          .eq("status", "enrolled")
          .maybeSingle();
        if (!cancelled && enrollData) {
          const cls = (enrollData as unknown as { class: { name: string; level: string } | null }).class;
          if (cls) {
            const lev = (cls.level ?? "").toLowerCase().trim();
            const PRE_IEP_LEVELS = ["toddler", "nursery", "pre-nursery", "playgroup", "play group", "pre-kinder", "prekinder", "pre kinder"];
            const isPreIep = PRE_IEP_LEVELS.some((l) => lev.includes(l));
            setLearnerGrade(isPreIep ? "N/A" : cls.name);
          }
        }
      }

      if (!caregiverName) {
        const { data: guardianRows } = await supabase
          .from("guardians")
          .select("full_name, phone, email, is_primary")
          .eq("student_id", studentId)
          .order("is_primary", { ascending: false })
          .limit(3);
        if (!cancelled && guardianRows && guardianRows.length > 0) {
          const g = guardianRows[0] as { full_name: string; phone: string | null; email: string | null; is_primary: boolean };
          setCaregiverName(g.full_name ?? "");
          if (!caregiverContact && g.phone) setCaregiverContact(g.phone);
          if (!caregiverEmail && g.email) setCaregiverEmail(g.email);
        }
      }

      if (row.child_profile_id) {
        const { data: identifiers } = await supabase
          .from("child_identifiers")
          .select("identifier_value")
          .eq("child_profile_id", row.child_profile_id)
          .ilike("identifier_type", "lrn")
          .maybeSingle();
        if (cancelled) return;
        const id = identifiers as { identifier_value: string } | null;
        if (id?.identifier_value && !learnerLrn) setLearnerLrn(id.identifier_value);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, schoolYearId, supabase]);

  // ── Data helpers ──────────────────────────────────────────────────────────

  function resetAllFields() {
    restoreFormState(emptyFormState());
    setCreatedAt(null);
    setUpdatedAt(null);
    setCreatedByName(null);
    setExpandedGoalTracking(new Set());
    setShowReviewDetails(false);
    setStudentDocs([]);
  }

  function hydrateFromServer(full: PlanFull) {
    const hydrated = planToFormState(full);
    setStableId(hydrated.stableId);
    setCreatedAt(hydrated.createdAt);
    setUpdatedAt(hydrated.updatedAt);
    setCreatedByName(hydrated.createdByName);
    setShowReviewDetails(hydrated.showReviewDetails);
    setExpandedGoalTracking(new Set(hydrated.expandedGoalIds));
    restoreFormState(hydrated.formState);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────
  async function performSave(targetStatus: PlanStatus): Promise<boolean> {
    if (!stableId) return false;
    if (!title.trim()) { setError("Title is required."); setActiveStep(1); return false; }
    if (!studentId)    { setError("Pick a student.");    setActiveStep(1); return false; }

    setSaving(true); setError(null);
    try {
      const state = getFormStateForRecovery();
      await savePlan(supabase, {
        id: stableId, schoolId, studentId, schoolYearId,
        planType: "iep", title: title.trim(),
        status: targetStatus,
        diagnosis: nn(state.diagnosis), strengths: nn(state.strengths),
        areasOfNeed: nn(state.areasOfNeed), backgroundNotes: nn(state.backgroundNotes),
        parentNotes: nn(state.parentNotes), parentConcerns: nn(state.parentConcerns),
        homeSupportNotes: nn(state.homeSupportNotes),
        reviewDate: nn(state.reviewDate),
        reviewedByTeacherId: nn(state.reviewedByTeacherId),
        reviewedByAdminId: nn(state.reviewedByAdminId),
        parentAcknowledged: state.parentAcknowledged,
        iepDetails: buildIepDetails(state),
        goals: state.goals.map((g, i) => ({ ...g, sort_order: i })),
        interventions: state.interventions.map((iv, i) => ({ ...iv, sort_order: i })),
        progress: state.progress,
        attachmentDocumentIds: state.attachmentIds,
        currentUserId: userId, isNew: !isEditing,
      });
      recovery.clearOnSave();
      setStatus(targetStatus);
      onSaved(stableId);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? "Failed to save plan.";
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function performStatusChange(next: PlanStatus) {
    if (!stableId) return;
    setSaving(true); setError(null);
    try {
      await setPlanStatus(supabase, stableId, next, (next === "approved" || next === "finalized") ? userId : null);
      recovery.clearOnSave();
      setStatus(next);
      onSaved(stableId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change status.");
    } finally {
      setSaving(false);
    }
  }

  // ── Progress Report Assistant ─────────────────────────────────────────────
  function handleAssistantClick() {
    if (isEditing) {
      setAssistantOpen(true);
    } else {
      setShowSaveDraftPrompt(true);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    const state = getFormStateForRecovery();
    const studentName = students.find((s) => s.id === studentId)?.full_name ?? "—";
    printIEP({
      studentName, schoolName, schoolYearName: schoolYearName ?? null,
      region: state.region, division: state.division, district: state.district,
      learnerLrn: state.learnerLrn, learnerBirthDate: state.learnerBirthDate,
      learnerSex: state.learnerSex, learnerGrade: state.learnerGrade,
      religion: state.religion, motherTongue: state.motherTongue,
      caregiverName: state.caregiverName, caregiverContact: state.caregiverContact,
      caregiverEmail: state.caregiverEmail,
      homeAddress: state.homeAddress, parentWorkplace: state.parentWorkplace,
      diffSeeing: state.diffSeeing, diffHearing: state.diffHearing,
      diffCommunicating: state.diffCommunicating, diffMoving: state.diffMoving,
      diffConcentrating: state.diffConcentrating, diffRemembering: state.diffRemembering,
      diffOther: state.diffOther, diffOtherDesc: state.diffOtherDesc,
      hasMedical: state.hasMedical, medicalDiagnosis: state.medicalDiagnosis,
      meetingDate: state.meetingDate, meetingPurpose: state.meetingPurpose,
      lastIepDate: state.lastIepDate, revisionDate: state.revisionDate,
      iepReviewDate: state.iepReviewDate, recommendations: state.recommendations,
      agreements: state.agreements,
      evaluationResults: state.evaluationResults, presentStrengths: state.presentStrengths,
      presentNeeds: state.presentNeeds, parentConcerns: state.parentConcerns,
      disabilityImpact: state.disabilityImpact,
      teamMembers: state.teamMembers, assistiveDevices: state.assistiveDevices,
      barriers: state.barriers, goals: state.goals, interventions: state.interventions,
      preparedBy: state.preparedBy, preparedDate: state.preparedDate,
      checkedReviewedBy: state.checkedReviewedBy, checkedReviewedDate: state.checkedReviewedDate,
    });
  }

  // ── Revision creation ─────────────────────────────────────────────────────
  const [creatingRevision, setCreatingRevision] = useState(false);

  const handleCreateRevision = useCallback(async () => {
    if (!stableId) return;
    setCreatingRevision(true);
    setError(null);
    try {
      const newId = await createRevision(supabase, stableId, userId);
      recovery.clearOnSave();
      onRevisionCreated?.(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create revision.");
    } finally {
      setCreatingRevision(false);
    }
  }, [stableId, supabase, userId, recovery, onRevisionCreated]);

  // ── Sub-row add helpers ───────────────────────────────────────────────────
  function addGoal() {
    setGoals((p) => [...p, {
      id: crypto.randomUUID(), domain: null, description: "",
      target_date: null, measurement_method: null, baseline: null,
      success_criteria: null, enroute_objectives: null, timeline: null,
      responsible_person: null, remarks: null, sort_order: p.length,
    }]);
  }
  function addIntervention(goalId?: string) {
    setInterventions((p) => [...p, {
      id: crypto.randomUUID(), strategy: "", frequency: null,
      responsible_person: null, environment: null, notes: null,
      goal_id: goalId ?? null, sort_order: p.length,
    }]);
  }
  function addProgress() {
    setProgress((p) => [...p, {
      id: crypto.randomUUID(), linked_goal_id: null,
      entry_date: format(new Date(), "yyyy-MM-dd"),
      progress_note: "", observed_by: null, next_step: null,
    }]);
  }
  function addTeamMember() {
    setTeamMembers((p) => [...p, { id: crypto.randomUUID(), name: "", role: "", requires_ack: false, acknowledged_at: null }]);
  }
  function addDevice() {
    setAssistiveDevices((p) => [...p, { id: crypto.randomUUID(), difficulty: "", device: "" }]);
  }
  function addBarrier() {
    setBarriers((p) => [...p, { id: crypto.randomUUID(), difficulty: "", learning_barriers: "", learning_facilitators: "", accommodations: "" }]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const studentName = students.find((s) => s.id === studentId)?.full_name ?? "—";
  const canEdit = isStaff && status !== "approved" && status !== "archived" && status !== "finalized";
  const isReadOnly = status === "finalized" || status === "approved";
  // Any staff (teacher or admin) can create a revision draft regardless of workflow mode.
  // In admin_approval_required mode the revision starts as 'draft' and must go through
  // the normal submit→approve cycle — teachers are not locked out of authoring.
  // RLS enforces the same student-visibility check as creating any new plan.
  const canCreateRevision = isReadOnly && isStaff;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `IEP Plan — ${title || studentName}` : "New IEP Plan"}
      align="top"
      className="max-w-5xl max-h-[90vh]"
    >
      <IepModalHeader
        showRecoveryPrompt={recovery.showRecoveryPrompt}
        recoveryTimestamp={recovery.recoveryTimestamp}
        onRestoreRecovery={recovery.handleRestore}
        onDiscardRecovery={recovery.handleDiscardRecovery}
        status={status}
        studentName={studentName}
        title={title}
        updatedAt={updatedAt}
        saving={saving}
        canEdit={canEdit}
        onSave={() => performSave(status === "approved" || status === "archived" ? status : "draft")}
        onPrint={handlePrint}
        canPrint={!!studentId}
        isAdmin={isAdmin}
        isArchived={status === "archived"}
        onArchive={() => void performStatusChange("archived")}
        showSaveDraftPrompt={showSaveDraftPrompt}
        onDismissSaveDraftPrompt={() => setShowSaveDraftPrompt(false)}
        activeStep={activeStep}
        onStepChange={setActiveStep}
        stepHelpOpen={stepHelpOpen}
        onToggleStepHelp={() => setStepHelpOpen((v) => !v)}
        isReadOnly={isReadOnly}
      />

      {error && <div className="pt-4"><ErrorAlert message={error} /></div>}
      {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading plan…</div>}

      {/* Read-only notice for finalized / approved plans */}
      {!loading && isReadOnly && (
        <div className="mt-4 flex items-start gap-2 px-4 py-3 text-sm bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-700/60">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-200">
            This plan is <strong>{status === "finalized" ? "finalized" : "approved"}</strong> and is read-only.
            {canCreateRevision && " Use \"Create Revision\" to make a new editable draft based on this plan."}
          </span>
        </div>
      )}

      {!loading && (
        <fieldset disabled={isReadOnly} className="contents">
        <div className="py-4 space-y-5">

          {stepHelpOpen && (
            <IepStepHelp step={activeStep} onClose={() => setStepHelpOpen(false)} />
          )}

          {activeStep === 1 && (
            <Step1LearnerMeeting
              students={students}
              studentId={studentId} setStudentId={setStudentId}
              isEditing={isEditing}
              title={title} setTitle={setTitle}
              learnerLrn={learnerLrn} setLearnerLrn={setLearnerLrn}
              learnerBirthDate={learnerBirthDate} setLearnerBirthDate={setLearnerBirthDate}
              learnerSex={learnerSex} setLearnerSex={setLearnerSex}
              learnerGrade={learnerGrade} setLearnerGrade={setLearnerGrade}
              religion={religion} setReligion={setReligion}
              motherTongue={motherTongue} setMotherTongue={setMotherTongue}
              caregiverName={caregiverName} setCaregiverName={setCaregiverName}
              caregiverContact={caregiverContact} setCaregiverContact={setCaregiverContact}
              caregiverEmail={caregiverEmail} setCaregiverEmail={setCaregiverEmail}
              homeAddress={homeAddress} setHomeAddress={setHomeAddress}
              parentWorkplace={parentWorkplace} setParentWorkplace={setParentWorkplace}
              parentNotes={parentNotes} setParentNotes={setParentNotes}
              step1LegendOpen={step1LegendOpen} setStep1LegendOpen={setStep1LegendOpen}
              region={region} setRegion={setRegion}
              division={division} setDivision={setDivision}
              district={district} setDistrict={setDistrict}
              meetingPurpose={meetingPurpose} setMeetingPurpose={setMeetingPurpose}
              meetingDate={meetingDate} setMeetingDate={setMeetingDate}
              lastIepDate={lastIepDate} setLastIepDate={setLastIepDate}
              revisionDate={revisionDate} setRevisionDate={setRevisionDate}
              iepReviewDate={iepReviewDate} setIepReviewDate={setIepReviewDate}
              recommendations={recommendations} setRecommendations={setRecommendations}
              agreements={agreements} setAgreements={setAgreements}
              teamMembers={teamMembers} setTeamMembers={setTeamMembers}
              addTeamMember={addTeamMember}
              canEdit={canEdit}
            />
          )}

          {activeStep === 2 && (
            <Step2NeedsStrengths
              diffSeeing={diffSeeing} setDiffSeeing={setDiffSeeing}
              diffHearing={diffHearing} setDiffHearing={setDiffHearing}
              diffCommunicating={diffCommunicating} setDiffCommunicating={setDiffCommunicating}
              diffMoving={diffMoving} setDiffMoving={setDiffMoving}
              diffConcentrating={diffConcentrating} setDiffConcentrating={setDiffConcentrating}
              diffRemembering={diffRemembering} setDiffRemembering={setDiffRemembering}
              diffOther={diffOther} setDiffOther={setDiffOther}
              diffOtherDesc={diffOtherDesc} setDiffOtherDesc={setDiffOtherDesc}
              hasMedical={hasMedical} setHasMedical={setHasMedical}
              medicalDiagnosis={medicalDiagnosis} setMedicalDiagnosis={setMedicalDiagnosis}
              diagnosis={diagnosis} setDiagnosis={setDiagnosis}
              evaluationResults={evaluationResults} setEvaluationResults={setEvaluationResults}
              presentStrengths={presentStrengths} setPresentStrengths={setPresentStrengths}
              presentNeeds={presentNeeds} setPresentNeeds={setPresentNeeds}
              parentConcerns={parentConcerns} setParentConcerns={setParentConcerns}
              disabilityImpact={disabilityImpact} setDisabilityImpact={setDisabilityImpact}
              backgroundNotes={backgroundNotes} setBackgroundNotes={setBackgroundNotes}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick}
              canEdit={canEdit}
            />
          )}

          {activeStep === 3 && (
            <Step3Supports
              assistiveDevices={assistiveDevices} setAssistiveDevices={setAssistiveDevices} addDevice={addDevice}
              barriers={barriers} setBarriers={setBarriers} addBarrier={addBarrier}
              step3BarriersLegendOpen={step3BarriersLegendOpen} setStep3BarriersLegendOpen={setStep3BarriersLegendOpen}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick} canEdit={canEdit}
            />
          )}

          {activeStep === 4 && (
            <Step4GoalsInterventions
              goals={goals} setGoals={setGoals} addGoal={addGoal}
              interventions={interventions} setInterventions={setInterventions} addIntervention={addIntervention}
              expandedGoalTracking={expandedGoalTracking} setExpandedGoalTracking={setExpandedGoalTracking}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick} canEdit={canEdit}
            />
          )}

          {activeStep === 5 && (
            <Step5ProgressReview
              progress={progress} setProgress={setProgress} addProgress={addProgress}
              goals={goals}
              showReviewDetails={showReviewDetails} setShowReviewDetails={setShowReviewDetails}
              preparedBy={preparedBy} setPreparedBy={setPreparedBy}
              preparedDate={preparedDate} setPreparedDate={setPreparedDate}
              checkedReviewedBy={checkedReviewedBy} setCheckedReviewedBy={setCheckedReviewedBy}
              checkedReviewedDate={checkedReviewedDate} setCheckedReviewedDate={setCheckedReviewedDate}
              reviewDate={reviewDate} setReviewDate={setReviewDate}
              reviewedByTeacherId={reviewedByTeacherId} setReviewedByTeacherId={setReviewedByTeacherId}
              reviewedByAdminId={reviewedByAdminId} setReviewedByAdminId={setReviewedByAdminId}
              homeSupportNotes={homeSupportNotes} setHomeSupportNotes={setHomeSupportNotes}
              parentAcknowledged={parentAcknowledged} setParentAcknowledged={setParentAcknowledged}
              status={status} schoolId={schoolId} canEdit={canEdit}
            />
          )}

          {activeStep === 6 && (
            <Step6Attachments
              studentId={studentId} studentDocs={studentDocs}
              attachmentIds={attachmentIds} setAttachmentIds={setAttachmentIds}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick} canEdit={canEdit}
              isSimpleReview={isSimpleReview} status={status}
              meetingDate={meetingDate} iepReviewDate={iepReviewDate}
              goals={goals} teamMembers={teamMembers}
            />
          )}

        </div>
        </fieldset>
      )}

      {recovery.hasUnsavedChanges && isEditing && (
        <div className="px-6 pt-2 pb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Unsaved changes are temporarily protected on this device.</span>
        </div>
      )}

      <IepModalFooter
        activeStep={activeStep}
        onBack={() => setActiveStep((activeStep - 1) as WizardStep)}
        onNext={() => setActiveStep((activeStep + 1) as WizardStep)}
        isSimpleReview={isSimpleReview}
        status={status}
        isStaff={isStaff}
        isAdmin={isAdmin}
        canEdit={canEdit}
        saving={saving}
        onFinalize={() => void performSave("finalized")}
        onApprove={() => void performStatusChange("approved")}
        onSubmitForReview={() => void performSave("submitted")}
        isReadOnly={isReadOnly}
        canCreateRevision={canCreateRevision}
        creating={creatingRevision}
        onCreateRevision={() => void handleCreateRevision()}
      />

      {assistantOpen && stableId && (
        <EvidenceAssistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          planId={stableId}
          studentId={studentId}
          schoolId={schoolId}
          userId={userId}
          userRole={userRole}
          setEvaluationResults={setEvaluationResults}
          setPresentStrengths={setPresentStrengths}
          setPresentNeeds={setPresentNeeds}
          setParentConcerns={setParentConcerns}
          setDisabilityImpact={setDisabilityImpact}
          setGoals={setGoals}
          setBarriers={setBarriers}
          onSectionApplied={(_label) => {
            // Placeholder: show brief inline feedback in a future iteration
          }}
        />
      )}
    </Modal>
  );
}
