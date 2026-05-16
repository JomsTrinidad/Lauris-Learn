"use client";

/**
 * IEP Plan modal — create + edit a DepEd-aligned structured IEP Plan.
 *
 * Sections (migration 085 + DepEd Order No. 44 s. 2021):
 *   1. Learner & Meeting   — school details, learner/parent snapshot, meeting info
 *   2. Needs & Strengths   — difficulties, medical, present levels
 *   3. Supports            — assistive devices, barriers/accommodations
 *   4. Goals & Interventions — DepEd annual goals with linked strategies
 *   5. Discussion & Recommendations — team discussion points and recommendations
 *   6. Progress, Agreements & Review — progress entries, agreements, review/signature block
 *   7. Attachments         — reference uploaded child_documents
 *
 * Print: "Print IEP" in the overflow menu opens a DepEd-style HTML document
 * via a hidden iframe — no server-side PDF generation required.
 *
 * Architecture: this file is the orchestration layer only.
 *   - Step rendering   → steps/Step1–Step7
 *   - Header shell     → IepModalHeader (owns overflow-menu state)
 *   - Footer shell     → IepModalFooter
 *   - Recovery hook    → useIepRecovery<IepFormState>
 *   - Form state type  → iep-form-state.ts
 *   - Hydration        → iep-hydration.ts (planToFormState)
 *   - Payload builder  → iep-payload.ts (buildIepDetails, nn)
 *   - Print renderer   → iep-print.ts (printIEP)
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorAlert } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Lock, HelpCircle, Info, User, CalendarDays, Heart, Shield, Target, StickyNote, MessageSquare, TrendingUp, Handshake, Paperclip, Trash2, Loader2, Send, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getPlan, savePlan, setPlanStatus, createRevision, discardPlan } from "./queries";
import type { PlanFull, PlanStatus, IepWorkflowMode } from "./types";
import { EvidenceAssistant } from "./iep-assistant/EvidenceAssistant";
import { getAppliedSuggestionsForPlan } from "./iep-assistant/queries";
import type { ProvenanceMap, AppliedSuggestionMeta, TargetField } from "./iep-assistant/types";
import { useIepRecovery } from "@/lib/iep-recovery/useIepRecovery";
import { IepStepHelp } from "./IepStepHelp";
import { IepWorkflowGuide } from "./IepWorkflowGuide";
import { format } from "date-fns";
import { IepModalHeader } from "./IepModalHeader";
import { IepModalFooter } from "./IepModalFooter";
import { Step1LearnerMeeting } from "./steps/Step1LearnerMeeting";
import { StepMeetingSetup } from "./steps/StepMeetingSetup";
import { Step2NeedsStrengths } from "./steps/Step2NeedsStrengths";
import { Step3Supports } from "./steps/Step3Supports";
import { Step4GoalsInterventions } from "./steps/Step4GoalsInterventions";
import { Step6DraftNotes } from "./steps/Step6DraftNotes";
import { Step5Discussion } from "./steps/Step5Discussion";
import { Step5ProgressReview } from "./steps/Step5ProgressReview";
import { Step7Agreements } from "./steps/Step7Agreements";
import { Step6Attachments } from "./steps/Step6Attachments";
import type { GoalRow, InterventionRow, ProgressRow, StudentOption, DocOption } from "./steps/shared";
import type { IepTeamMember, IepAssistiveDevice, IepBarrier } from "./types";
import { type IepFormState, emptyFormState } from "./iep-form-state";
import { planToFormState } from "./iep-hydration";
import { buildIepDetails, nn } from "./iep-payload";
import { printIEP } from "./iep-print";
import { validateForSharing, validateForFinalization, getStepCompletionStatus } from "./iep-validation";
import { PHASES, WIZARD_STEPS, getPhaseForStep, type WizardStep } from "./constants";

// Re-export WizardStep so existing importers of this module don't break.
export type { WizardStep } from "./constants";

// ─── Props ─────────────────────────────────────────────────────────────────

export interface IEPPlanModalProps {
  open: boolean;
  onClose: () => void;
  /** keepOpen=true when a draft save should keep the modal open (show toast instead). */
  onSaved: (planId: string, keepOpen?: boolean) => void;
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
  const [provenanceMap, setProvenanceMap] = useState<ProvenanceMap>({});
  const [showSaveDraftPrompt, setShowSaveDraftPrompt] = useState(false);
  const [expandedGoalTracking, setExpandedGoalTracking] = useState<Set<string>>(new Set());
  const [showReviewDetails, setShowReviewDetails] = useState(false);
  const [stepHelpOpen, setStepHelpOpen] = useState(false);
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false);
  const [helpPulseStopped, setHelpPulseStopped] = useState(false);

  // ── Head / metadata (not persisted in IepFormState) ─────────────────────
  const [createdAt, setCreatedAt]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]       = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [stableId, setStableId]         = useState<string | null>(null);
  // Audit timestamps — used to gate discard eligibility
  const [submittedAt, setSubmittedAt]   = useState<string | null>(null);
  const [finalizedAt, setFinalizedAt]   = useState<string | null>(null);
  const [approvedAt, setApprovedAt]     = useState<string | null>(null);
  // Discard draft confirmation
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

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
  const [meetingDate, setMeetingDate]           = useState("");
  const [lastIepDate, setLastIepDate]           = useState("");
  const [meetingPurpose, setMeetingPurpose]     = useState("");
  const [revisionDate, setRevisionDate]         = useState("");
  const [iepReviewDate, setIepReviewDate]       = useState("");
  const [meetingLocation, setMeetingLocation]   = useState("");
  const [meetingLink, setMeetingLink]           = useState("");
  const [meetingLinkPending, setMeetingLinkPending] = useState(false);
  const [draftNotes, setDraftNotes]             = useState("");
  // N/A toggles
  const [meetingTbs, setMeetingTbs]             = useState(false);
  const [supportsNa, setSupportsNa]             = useState(false);
  const [goalsNa, setGoalsNa]                   = useState(false);
  const [recommendationsNa, setRecommendationsNa] = useState(false);
  const [discussionNa, setDiscussionNa]         = useState(false);
  const [progressNa, setProgressNa]             = useState(false);
  const [agreementsNa, setAgreementsNa]         = useState(false);
  const [concernsNa, setConcernsNa]             = useState(false);
  const [nextReviewNa, setNextReviewNa]         = useState(false);
  const [recommendations, setRecommendations]   = useState("");
  const [recommendationItems, setRecommendationItems] = useState<import("./types").RecommendationItem[]>([]);
  const [agreements, setAgreements]             = useState("");
  const [parentConsentNotes, setParentConsentNotes]   = useState("");
  const [unresolvedConcerns, setUnresolvedConcerns]   = useState("");
  const [actionItems, setActionItems]               = useState("");
  const [nextReviewCommitments, setNextReviewCommitments] = useState("");

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
    meetingDate, lastIepDate, meetingPurpose, revisionDate, iepReviewDate,
    meetingLocation, meetingLink, meetingLinkPending,
    draftNotes,
    meetingTbs, supportsNa, goalsNa, recommendationsNa, discussionNa,
    progressNa, agreementsNa, concernsNa, nextReviewNa,
    recommendations, recommendationItems, agreements,
    parentConsentNotes, unresolvedConcerns, actionItems, nextReviewCommitments,
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
    setMeetingLocation(data.meetingLocation ?? "");
    setMeetingLink(data.meetingLink ?? "");
    setMeetingLinkPending(data.meetingLinkPending ?? false);
    setDraftNotes(data.draftNotes ?? "");
    setMeetingTbs(data.meetingTbs ?? false);
    setSupportsNa(data.supportsNa ?? false);
    setGoalsNa(data.goalsNa ?? false);
    setRecommendationsNa(data.recommendationsNa ?? false);
    setDiscussionNa(data.discussionNa ?? false);
    setProgressNa(data.progressNa ?? false);
    setAgreementsNa(data.agreementsNa ?? false);
    setConcernsNa(data.concernsNa ?? false);
    setNextReviewNa(data.nextReviewNa ?? false);
    setRecommendations(data.recommendations ?? "");
    setRecommendationItems(data.recommendationItems ?? []);
    setAgreements(data.agreements ?? "");
    setParentConsentNotes(data.parentConsentNotes ?? "");
    setUnresolvedConcerns(data.unresolvedConcerns ?? "");
    setActionItems(data.actionItems ?? "");
    setNextReviewCommitments(data.nextReviewCommitments ?? "");
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
    setShowWorkflowGuide(false);
    setHelpPulseStopped(false);

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

  // Load provenance map from applied suggestions when a plan opens
  useEffect(() => {
    if (!open || !stableId) { setProvenanceMap({}); return; }
    getAppliedSuggestionsForPlan(supabase, stableId)
      .then((metas) => {
        const map: ProvenanceMap = {};
        for (const meta of metas) {
          if (meta.targetField === "goal" || meta.targetField === "barrier") continue;
          const field = meta.targetField;
          if (!map[field]) map[field] = meta;
        }
        setProvenanceMap(map);
      })
      .catch(() => setProvenanceMap({}));
  }, [open, stableId, supabase]);

  // Ref forwarded to the Modal's scrollable container so we can reset scroll position.
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref to markChanged so the effect below doesn't re-run on
  // every render (the recovery object reference changes each render).
  const markChangedRef = useRef(recovery.markChanged);
  markChangedRef.current = recovery.markChanged;

  // Mark changes only when the fields we care about actually change.
  useEffect(() => {
    if (!isEditing || !stableId) return;
    markChangedRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, studentId, isEditing, stableId]);

  // Scroll the modal container to the top whenever the active step changes.
  useEffect(() => {
    modalScrollRef.current?.scrollTo({ top: 0 });
  }, [activeStep]);

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

  // Stop the help-icon pulse after 8 s (only for new plans, not existing ones)
  useEffect(() => {
    if (!open || isEditing) { setHelpPulseStopped(true); return; }
    setHelpPulseStopped(false);
    const t = setTimeout(() => setHelpPulseStopped(true), 8000);
    return () => clearTimeout(t);
  }, [open, isEditing]);

  // ── Data helpers ──────────────────────────────────────────────────────────

  function resetAllFields() {
    restoreFormState(emptyFormState());
    setCreatedAt(null);
    setUpdatedAt(null);
    setCreatedByName(null);
    setSubmittedAt(null);
    setFinalizedAt(null);
    setApprovedAt(null);
    setDiscardConfirmOpen(false);
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
    setSubmittedAt(full.plan.submitted_at ?? null);
    setFinalizedAt(full.plan.finalized_at ?? null);
    setApprovedAt(full.plan.approved_at ?? null);
    setDiscardConfirmOpen(false);
    setShowReviewDetails(hydrated.showReviewDetails);
    setExpandedGoalTracking(new Set(hydrated.expandedGoalIds));
    restoreFormState(hydrated.formState);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────
  async function performSave(targetStatus: PlanStatus): Promise<boolean> {
    if (!stableId) return false;
    if (!title.trim()) { setError("Title is required."); setActiveStep(1); return false; }
    if (!studentId)    { setError("Pick a student.");    setActiveStep(1); return false; }

    // Phased validation — only for non-draft saves
    if (targetStatus !== "draft") {
      const state = getFormStateForRecovery();
      const isFinalization = targetStatus === "approved" || targetStatus === "finalized";
      const check = isFinalization ? validateForFinalization(state) : validateForSharing(state);
      if (!check.valid) {
        const lines = check.missing.map((m) => `• ${m.stepLabel}: ${m.field}`);
        setError(`Please complete the following before sharing:\n${lines.join("\n")}`);
        setActiveStep(check.missing[0].stepNumber as WizardStep);
        return false;
      }
    }

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
      if (targetStatus === "draft") {
        onSaved(stableId, true);
        showSavedToast();
      } else {
        onSaved(stableId);
      }
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
  const [continueSaving, setContinueSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  function showSavedToast() {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  }

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

  // ── Discard Draft ────────────────────────────────────────────────────────
  async function handleDiscardDraftConfirm() {
    if (!stableId) return;
    setSaving(true); setError(null);
    try {
      await discardPlan(supabase, stableId);
      recovery.clearOnSave();
      onSaved(stableId); // refreshes the list; modal closes via onClose in parent
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard draft.");
      setDiscardConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

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

  // Icon per wizard step for the sidebar nav
  const STEP_ICONS: Record<number, React.ElementType> = {
    1: User, 2: CalendarDays, 3: Heart, 4: Shield,
    5: Target, 6: StickyNote, 7: MessageSquare, 8: TrendingUp, 9: Handshake, 10: Paperclip,
  };

  const studentName = students.find((s) => s.id === studentId)?.full_name ?? "—";
  const canEdit = isStaff && status !== "approved" && status !== "archived" && status !== "finalized";
  const stepCompletion = useMemo(
    () => getStepCompletionStatus(getFormStateForRecovery()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, studentId, meetingDate, meetingTbs, meetingPurpose, presentNeeds,
     goals, goalsNa, assistiveDevices, barriers, supportsNa, progress, progressNa,
     draftNotes, recommendationItems, recommendationsNa, recommendations, discussionNa,
     agreements, agreementsNa, unresolvedConcerns, concernsNa, nextReviewCommitments, nextReviewNa,
     preparedBy, attachmentIds],
  );
  const isReadOnly = status === "finalized" || status === "approved";
  const canDiscardDraft = isEditing && isStaff
    && status === "draft"
    && submittedAt === null
    && finalizedAt === null
    && approvedAt === null;
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
      className="max-w-[1100px] max-h-[90vh]"
      scrollRef={modalScrollRef}
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
        canDiscardDraft={canDiscardDraft}
        onDiscardDraft={() => setDiscardConfirmOpen(true)}
        showSaveDraftPrompt={showSaveDraftPrompt}
        onDismissSaveDraftPrompt={() => setShowSaveDraftPrompt(false)}
        activeStep={activeStep}
        onStepChange={setActiveStep}
        isReadOnly={isReadOnly}
      />

      {error && <div className="pt-4"><ErrorAlert message={error} /></div>}

      {discardConfirmOpen && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-destructive">Discard this draft IEP?</p>
          <p className="text-sm text-muted-foreground">
            This will remove the draft and its unsaved planning content. This cannot be undone.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleDiscardDraftConfirm()}
              disabled={saving}
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Discard Draft
            </Button>
            <button
              type="button"
              onClick={() => setDiscardConfirmOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {savedToast && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-green-100 border border-green-200 text-green-800">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          Draft saved.
        </div>
      )}
      {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading plan…</div>}

      {/* Read-only notice for finalized / approved plans */}
      {!loading && isReadOnly && (
        <div className="mt-4 flex items-start gap-2 px-4 py-3 text-sm bg-amber-100 border border-amber-200 rounded-lg">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800">
            This plan is <strong>{status === "finalized" ? "finalized" : "approved"}</strong> and is read-only.
            {canCreateRevision && " Use \"Create Revision\" to make a new editable draft based on this plan."}
          </span>
        </div>
      )}

      {!loading && (
        <div className="flex -mx-6">

          {/* ── Sidebar section nav — always interactive (outside fieldset) ── */}
          <nav className="w-52 shrink-0 border-r border-border/40 px-3 py-5 sticky self-start space-y-5" style={{ top: '116px' }}>

            {/* Workflow Guide button */}
            <button
              type="button"
              onClick={() => { setShowWorkflowGuide((v) => !v); setStepHelpOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors border-l-2 -mt-1 mb-1",
                showWorkflowGuide
                  ? "bg-primary/10 text-primary font-medium border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent",
              )}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              Workflow Guide
            </button>

            {PHASES.map((phase) => (
              <div key={phase.id}>
                {phase.id === 3 && (
                  <div className="border-t border-border/40 -mx-1 mb-3" />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-2 mb-1.5">
                  {phase.id === 3 ? "Team Review" : phase.label}
                </p>
                {phase.steps.map((stepId) => {
                  const step = WIZARD_STEPS.find((s) => s.id === stepId)!;
                  const isActive = activeStep === stepId && !showWorkflowGuide;
                  const isGuideActive = isActive && stepHelpOpen;
                  const Icon = STEP_ICONS[stepId];
                  const showPulse = !isEditing && !helpPulseStopped;
                  return (
                    <div key={stepId} className="group relative flex items-center mb-0.5">
                      <button
                        type="button"
                        onClick={() => { setActiveStep(stepId); setShowWorkflowGuide(false); }}
                        className={cn(
                          "flex-1 text-left flex items-center gap-2 pl-2.5 pr-7 py-1.5 text-xs rounded-md transition-colors border-l-2",
                          isActive
                            ? "bg-primary/10 text-primary font-medium border-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent",
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground/50")} />
                        <span className="flex-1">{step.label}</span>
                        {(() => {
                          const cs = stepCompletion[stepId];
                          if (cs === "complete") return <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Complete" />;
                          if (cs === "partial") return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Partially filled" />;
                          return null;
                        })()}
                      </button>
                      <button
                        type="button"
                        title={`${step.label} guide — click for section tips`}
                        onClick={() => {
                          setHelpPulseStopped(true);
                          if (!isActive) {
                            setActiveStep(stepId);
                            setShowWorkflowGuide(false);
                            setStepHelpOpen(true);
                          } else {
                            setStepHelpOpen((v) => !v);
                          }
                        }}
                        className={cn(
                          "absolute right-1 w-5 h-5 flex items-center justify-center rounded transition-colors",
                          isGuideActive
                            ? "text-primary"
                            : isActive
                              ? "text-muted-foreground/40 hover:text-primary"
                              : "text-transparent group-hover:text-muted-foreground/40 hover:!text-primary",
                        )}
                      >
                        <HelpCircle className={cn(
                          "w-3 h-3",
                          showPulse && !isGuideActive && "animate-pulse text-primary/50",
                        )} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* ── Content area — fieldset disables form inputs when read-only ── */}
          <fieldset disabled={isReadOnly} className="flex-1 min-w-0 border-0 p-0 m-0">
            <div className="px-6 py-5">

              {showWorkflowGuide ? (
                <IepWorkflowGuide
                  status={status}
                  workflowMode={workflowMode}
                  isAdmin={isAdmin}
                />
              ) : (
                <>
                  {stepHelpOpen && (
                    <div className="mb-5">
                      <IepStepHelp step={activeStep} onClose={() => setStepHelpOpen(false)} />
                    </div>
                  )}

              <div className="space-y-5">

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
                    canEdit={canEdit}
                  />
                )}

                {activeStep === 2 && (
                  <StepMeetingSetup
                    meetingPurpose={meetingPurpose} setMeetingPurpose={setMeetingPurpose}
                    meetingDate={meetingDate} setMeetingDate={setMeetingDate}
                    lastIepDate={lastIepDate} setLastIepDate={setLastIepDate}
                    revisionDate={revisionDate} setRevisionDate={setRevisionDate}
                    iepReviewDate={iepReviewDate} setIepReviewDate={setIepReviewDate}
                    meetingLocation={meetingLocation} setMeetingLocation={setMeetingLocation}
                    meetingLink={meetingLink} setMeetingLink={setMeetingLink}
                    meetingLinkPending={meetingLinkPending} setMeetingLinkPending={setMeetingLinkPending}
                    meetingTbs={meetingTbs} setMeetingTbs={setMeetingTbs}
                    teamMembers={teamMembers} setTeamMembers={setTeamMembers}
                    addTeamMember={addTeamMember}
                    status={status}
                    canEdit={canEdit}
                  />
                )}

                {activeStep === 3 && (
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
                    provenanceMap={provenanceMap}
                  />
                )}

                {activeStep === 4 && (
                  <Step3Supports
                    assistiveDevices={assistiveDevices} setAssistiveDevices={setAssistiveDevices} addDevice={addDevice}
                    barriers={barriers} setBarriers={setBarriers} addBarrier={addBarrier}
                    step3BarriersLegendOpen={step3BarriersLegendOpen} setStep3BarriersLegendOpen={setStep3BarriersLegendOpen}
                    supportsNa={supportsNa} setSupportsNa={setSupportsNa}
                    isStaff={isStaff} isEditing={isEditing} saving={saving}
                    handleAssistantClick={handleAssistantClick} canEdit={canEdit}
                  />
                )}

                {activeStep === 5 && (
                  <Step4GoalsInterventions
                    goals={goals} setGoals={setGoals} addGoal={addGoal}
                    interventions={interventions} setInterventions={setInterventions} addIntervention={addIntervention}
                    expandedGoalTracking={expandedGoalTracking} setExpandedGoalTracking={setExpandedGoalTracking}
                    goalsNa={goalsNa} setGoalsNa={setGoalsNa}
                    isStaff={isStaff} isEditing={isEditing} saving={saving}
                    handleAssistantClick={handleAssistantClick} canEdit={canEdit}
                  />
                )}

                {activeStep === 6 && (
                  <>
                    <Step6DraftNotes
                      draftNotes={draftNotes} setDraftNotes={setDraftNotes}
                      canEdit={canEdit}
                    />
                    {/* Draft phase handoff — only for draft plans being actively edited by staff */}
                    {!isReadOnly && isStaff && canEdit && status === "draft" && (
                      <div className="mt-8 rounded-xl border border-border/60 bg-muted/20 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Initial Draft Ready</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              You've completed the teacher-led planning sections. The next sections are usually
                              completed with the IEP team during review or meeting coordination.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          {/* Primary action */}
                          <div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void performSave("submitted")}
                              disabled={saving}
                            >
                              {saving
                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                : <Send className="w-3.5 h-3.5 mr-1.5" />}
                              Save &amp; Share for Team Input
                            </Button>
                            <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
                              You can still revise this plan later.
                            </p>
                          </div>

                          {/* Secondary + tertiary */}
                          <div className="flex items-center gap-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={async () => {
                                setContinueSaving(true);
                                const ok = await performSave("draft");
                                setContinueSaving(false);
                                if (ok) setActiveStep(7);
                              }}
                            >
                              {continueSaving
                                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                                : <>Continue to Team Review<ChevronRight className="w-3.5 h-3.5 ml-1" /></>}
                            </Button>
                            <button
                              type="button"
                              onClick={() => void performSave("draft")}
                              disabled={saving}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              Save Draft
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeStep === 7 && (
                  <Step5Discussion
                    recommendations={recommendations} setRecommendations={setRecommendations}
                    recommendationItems={recommendationItems} setRecommendationItems={setRecommendationItems}
                    recommendationsNa={recommendationsNa} setRecommendationsNa={setRecommendationsNa}
                    discussionNa={discussionNa} setDiscussionNa={setDiscussionNa}
                    canEdit={canEdit}
                  />
                )}

                {activeStep === 8 && (
                  <Step5ProgressReview
                    progress={progress} setProgress={setProgress} addProgress={addProgress}
                    goals={goals}
                    progressNa={progressNa} setProgressNa={setProgressNa}
                    showReviewDetails={showReviewDetails} setShowReviewDetails={setShowReviewDetails}
                    preparedBy={preparedBy} setPreparedBy={setPreparedBy}
                    preparedDate={preparedDate} setPreparedDate={setPreparedDate}
                    checkedReviewedBy={checkedReviewedBy} setCheckedReviewedBy={setCheckedReviewedBy}
                    checkedReviewedDate={checkedReviewedDate} setCheckedReviewedDate={setCheckedReviewedDate}
                    reviewDate={reviewDate} setReviewDate={setReviewDate}
                    reviewedByTeacherId={reviewedByTeacherId} setReviewedByTeacherId={setReviewedByTeacherId}
                    reviewedByAdminId={reviewedByAdminId} setReviewedByAdminId={setReviewedByAdminId}
                    status={status} schoolId={schoolId} canEdit={canEdit}
                  />
                )}

                {activeStep === 9 && (
                  <Step7Agreements
                    agreements={agreements} setAgreements={setAgreements}
                    homeSupportNotes={homeSupportNotes} setHomeSupportNotes={setHomeSupportNotes}
                    parentAcknowledged={parentAcknowledged} setParentAcknowledged={setParentAcknowledged}
                    parentConsentNotes={parentConsentNotes} setParentConsentNotes={setParentConsentNotes}
                    unresolvedConcerns={unresolvedConcerns} setUnresolvedConcerns={setUnresolvedConcerns}
                    actionItems={actionItems} setActionItems={setActionItems}
                    nextReviewCommitments={nextReviewCommitments} setNextReviewCommitments={setNextReviewCommitments}
                    agreementsNa={agreementsNa} setAgreementsNa={setAgreementsNa}
                    concernsNa={concernsNa} setConcernsNa={setConcernsNa}
                    nextReviewNa={nextReviewNa} setNextReviewNa={setNextReviewNa}
                    status={status}
                    canEdit={canEdit}
                    planId={stableId}
                    studentId={studentId}
                    schoolId={schoolId}
                  />
                )}

                {activeStep === 10 && (
                  <Step6Attachments
                    studentId={studentId} studentDocs={studentDocs}
                    attachmentIds={attachmentIds} setAttachmentIds={setAttachmentIds}
                    isStaff={isStaff} isEditing={isEditing} saving={saving}
                    handleAssistantClick={handleAssistantClick} canEdit={canEdit}
                    isSimpleReview={isSimpleReview} status={status}
                    meetingDate={meetingDate} iepReviewDate={iepReviewDate}
                    goals={goals} teamMembers={teamMembers}
                    planId={stableId}
                  />
                )}

              </div>
                </>
              )}
            </div>
          </fieldset>
        </div>
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
        showDraftHandoff={activeStep === 6 && !isReadOnly && isStaff && canEdit && status === "draft"}
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
          onSectionApplied={(field: TargetField, meta: AppliedSuggestionMeta) => {
            if (field === "goal" || field === "barrier") return;
            setProvenanceMap((prev) => ({ ...prev, [field]: meta }));
          }}
        />
      )}
    </Modal>
  );
}
