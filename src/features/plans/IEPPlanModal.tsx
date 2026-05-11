"use client";

/**
 * IEP Plan modal — create + edit a DepEd-aligned structured IEP Plan.
 *
 * Sections (migration 085 + DepEd Order No. 44 s. 2021):
 *   1. Cover & Learner   — school details, learner/parent snapshot
 *   2. Assessment        — difficulties checkboxes, medical, present levels
 *   3. Meeting & Team    — meeting info, purpose, IEP team members
 *   4. Supports          — assistive devices, barriers/accommodations
 *   5. Goals             — DepEd annual goals with enroute objectives
 *   6. Interventions     — strategies linked to goals
 *   7. Progress          — progress entries per goal
 *   8. Review            — prepared/reviewed + admin approval
 *   9. Attachments       — reference uploaded child_documents
 *
 * Print: "Print IEP" opens a browser-print window with a DepEd-style
 * HTML document; no server-side PDF generation required.
 *
 * Backward compat: existing plans without iep_details hydrate cleanly
 * (all new fields default to empty). Legacy head columns (diagnosis,
 * strengths, areas_of_need, parent_concerns) are kept and displayed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Save, Send, Loader2, CheckCircle2,
  Archive, Printer, X, ChevronLeft, ChevronRight,
  AlertCircle, MoreHorizontal, HelpCircle,
} from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { PLAN_STATUS_LABELS, MEETING_PURPOSE_OPTIONS, TEAM_FOOTNOTE } from "./constants";
import { getPlan, savePlan, setPlanStatus } from "./queries";
import type { PlanFull, PlanStatus, IepDetails, IepTeamMember, IepAssistiveDevice, IepBarrier, IepWorkflowMode } from "./types";
import { ProgressReportAssistant } from "./iep-assistant/ProgressReportAssistant";
import { useIepRecovery, type IepRecoveryState } from "@/lib/iep-recovery/useIepRecovery";
import { IepStepHelp } from "./IepStepHelp";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Step1LearnerMeeting } from "./steps/Step1LearnerMeeting";
import { Step2NeedsStrengths } from "./steps/Step2NeedsStrengths";
import { Step3Supports } from "./steps/Step3Supports";
import { Step4GoalsInterventions } from "./steps/Step4GoalsInterventions";
import { Step5ProgressReview } from "./steps/Step5ProgressReview";
import { Step6Attachments } from "./steps/Step6Attachments";
import type { GoalRow, InterventionRow, ProgressRow, StudentOption, DocOption } from "./steps/shared";

// ─── Wizard ────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
const WIZARD_STEPS: { id: WizardStep; label: string; shortLabel: string }[] = [
  { id: 1, label: "Learner & Meeting",      shortLabel: "Learner"  },
  { id: 2, label: "Needs & Strengths",     shortLabel: "Needs"    },
  { id: 3, label: "Supports",              shortLabel: "Supports" },
  { id: 4, label: "Goals & Interventions", shortLabel: "Goals"    },
  { id: 5, label: "Progress & Review",     shortLabel: "Progress" },
  { id: 6, label: "Attachments",           shortLabel: "Attach"   },
];

// ─── Props ─────────────────────────────────────────────────────────────

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
}

// ─── Component ─────────────────────────────────────────────────────────

export function IEPPlanModal({
  open, onClose, onSaved,
  planId, schoolId, schoolName = "", schoolYearId, schoolYearName = null,
  userId, userRole, defaultStudentId = null, workflowMode = "simple_review",
}: IEPPlanModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin   = userRole === "school_admin";
  const isStaff   = userRole === "school_admin" || userRole === "teacher";
  const isSimpleReview = workflowMode === "simple_review";
  const isEditing = planId !== null;

  // ── UI state ─────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [step1LegendOpen, setStep1LegendOpen] = useState(false);
  const [step3BarriersLegendOpen, setStep3BarriersLegendOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showSaveDraftPrompt, setShowSaveDraftPrompt] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedGoalTracking, setExpandedGoalTracking] = useState<Set<string>>(new Set());
  const [showReviewDetails, setShowReviewDetails] = useState(false);
  const [stepHelpOpen, setStepHelpOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDropOpen, setStudentDropOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const studentDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  // Close step help panel when switching steps
  useEffect(() => { setStepHelpOpen(false); }, [activeStep]);

  // Close student dropdown on outside click
  useEffect(() => {
    if (!studentDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (studentDropRef.current && !studentDropRef.current.contains(e.target as Node)) {
        setStudentDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [studentDropOpen]);

  // ── Head / legacy fields ──────────────────────────────────────────────
  const [title, setTitle]               = useState("");
  const [studentId, setStudentId]       = useState(defaultStudentId ?? "");
  const [status, setStatus]             = useState<PlanStatus>("draft");
  const [createdAt, setCreatedAt]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]       = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);

  // Legacy fields (kept for backward compat + pre-populate Present Levels)
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

  // ── DepEd iep_details fields ──────────────────────────────────────────
  // Cover / School
  const [region, setRegion]     = useState("");
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");

  // Learner snapshot + extras
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

  // Difficulties
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

  // Present Levels (DepEd-specific)
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

  // Team Members
  const [teamMembers, setTeamMembers] = useState<IepTeamMember[]>([]);

  // Assistive Devices
  const [assistiveDevices, setAssistiveDevices] = useState<IepAssistiveDevice[]>([]);

  // Barriers
  const [barriers, setBarriers] = useState<IepBarrier[]>([]);

  // Signature / Prepared
  const [preparedBy, setPreparedBy]             = useState("");
  const [preparedDate, setPreparedDate]         = useState("");
  const [checkedReviewedBy, setCheckedReviewedBy] = useState("");
  const [checkedReviewedDate, setCheckedReviewedDate] = useState("");

  // ── Sub-row collections ───────────────────────────────────────────────
  const [goals, setGoals]                 = useState<GoalRow[]>([]);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [progress, setProgress]           = useState<ProgressRow[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  // ── Lookup data ───────────────────────────────────────────────────────
  const [students, setStudents]   = useState<StudentOption[]>([]);
  const [studentDocs, setStudentDocs] = useState<DocOption[]>([]);
  const [stableId, setStableId]   = useState<string | null>(null);

  // ── Recovery system ────────────────────────────────────────────────────
  const getFormStateForRecovery = (): IepRecoveryState => ({
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
    goals, interventions, progress, attachmentIds,
  });

  const restoreFormState = (data: IepRecoveryState) => {
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
    setGoals(data.goals ?? []);
    setInterventions(data.interventions ?? []);
    setProgress(data.progress ?? []);
    setAttachmentIds(data.attachmentIds ?? []);
  };

  const recovery = useIepRecovery(
    {
      userId,
      studentId,
      planId,
      schoolYearId,
      draftUpdatedAt: updatedAt,
      isEditing,
    },
    getFormStateForRecovery(),
    restoreFormState,
  );

  // ── Reset / hydrate ───────────────────────────────────────────────────
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
    if (!isEditing || !stableId) return; // Only during active editing
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

  // Prefetch LRN, gender, and grade/section for selected student
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

      // Grade/Section from active enrollment — only when the field is still empty
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
            // Levels below Kinder do not require a formal IEP under DepEd Order No. 44 s. 2021
            const lev = (cls.level ?? "").toLowerCase().trim();
            const PRE_IEP_LEVELS = ["toddler", "nursery", "pre-nursery", "playgroup", "play group", "pre-kinder", "prekinder", "pre kinder"];
            const isPreIep = PRE_IEP_LEVELS.some((l) => lev.includes(l));
            setLearnerGrade(isPreIep ? "N/A" : cls.name);
          }
        }
      }

      // Prefill caregiver contact from primary guardian (only on a new plan with empty fields)
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

  // Keep studentSearch display text in sync with the selected student
  useEffect(() => {
    if (studentDropOpen) return;
    const found = students.find((s) => s.id === studentId);
    if (found) setStudentSearch(found.full_name);
    else if (!studentId) setStudentSearch("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, students]);

  function resetAllFields() {
    setTitle(""); setStatus("draft");
    setCreatedAt(null); setUpdatedAt(null); setCreatedByName(null);
    setDiagnosis(""); setStrengths(""); setAreasOfNeed(""); setBackgroundNotes("");
    setParentNotes(""); setParentConcerns(""); setHomeSupportNotes("");
    setReviewDate(""); setReviewedByTeacherId(""); setReviewedByAdminId("");
    setParentAcknowledged(false);
    setRegion(""); setDivision(""); setDistrict("");
    setLearnerLrn(""); setLearnerBirthDate(""); setLearnerSex(""); setLearnerGrade("");
    setReligion(""); setMotherTongue(""); setHomeAddress(""); setParentWorkplace("");
    setCaregiverName(""); setCaregiverContact(""); setCaregiverEmail("");
    setDiffSeeing(false); setDiffHearing(false); setDiffCommunicating(false);
    setDiffMoving(false); setDiffConcentrating(false); setDiffRemembering(false);
    setDiffOther(false); setDiffOtherDesc(""); setHasMedical(false); setMedicalDiagnosis("");
    setEvaluationResults(""); setPresentStrengths(""); setPresentNeeds(""); setDisabilityImpact("");
    setMeetingDate(""); setLastIepDate(""); setMeetingPurpose(""); setRevisionDate("");
    setIepReviewDate(""); setRecommendations(""); setAgreements("");
    setExpandedGoalTracking(new Set());
    setShowReviewDetails(false);
    setTeamMembers([]); setAssistiveDevices([]); setBarriers([]);
    setPreparedBy(""); setPreparedDate(""); setCheckedReviewedBy(""); setCheckedReviewedDate("");
    setGoals([]); setInterventions([]); setProgress([]); setAttachmentIds([]);
    setStudentDocs([]);
  }

  function hydrateFromServer(full: PlanFull) {
    const p = full.plan;
    const d = (p.iep_details ?? {}) as IepDetails;

    setStableId(p.id);
    setTitle(p.title);
    setStudentId(p.student_id);
    setStatus(p.status);
    setCreatedAt(p.created_at);
    setUpdatedAt(p.updated_at);
    setCreatedByName(full.created_by_profile?.full_name ?? null);

    setDiagnosis(p.diagnosis ?? "");
    setStrengths(p.strengths ?? "");
    setAreasOfNeed(p.areas_of_need ?? "");
    setBackgroundNotes(p.background_notes ?? "");
    setParentNotes(p.parent_notes ?? "");
    setParentConcerns(p.parent_concerns ?? "");
    setHomeSupportNotes(p.home_support_notes ?? "");
    setReviewDate(p.review_date ?? "");
    setReviewedByTeacherId(p.reviewed_by_teacher_id ?? "");
    setReviewedByAdminId(p.reviewed_by_admin_id ?? "");
    setParentAcknowledged(p.parent_acknowledged_at !== null);

    // iep_details fields
    setRegion(d.region ?? "");
    setDivision(d.division ?? "");
    setDistrict(d.district ?? "");
    setLearnerLrn(d.learner_lrn ?? "");
    setLearnerBirthDate(d.learner_birth_date ?? "");
    setLearnerSex(d.learner_sex ?? "");
    setLearnerGrade(d.learner_grade ?? "");
    setReligion(d.religion ?? "");
    setMotherTongue(d.mother_tongue ?? "");
    setHomeAddress(d.home_address ?? "");
    setParentWorkplace(d.parent_workplace ?? "");
    setCaregiverName(d.caregiver_name ?? "");
    setCaregiverContact(d.caregiver_contact ?? "");
    setCaregiverEmail(d.caregiver_email ?? "");
    setDiffSeeing(d.diff_seeing ?? false);
    setDiffHearing(d.diff_hearing ?? false);
    setDiffCommunicating(d.diff_communicating ?? false);
    setDiffMoving(d.diff_moving ?? false);
    setDiffConcentrating(d.diff_concentrating ?? false);
    setDiffRemembering(d.diff_remembering ?? false);
    setDiffOther(d.diff_other ?? false);
    setDiffOtherDesc(d.diff_other_description ?? "");
    setHasMedical(d.has_medical_assessment ?? false);
    setMedicalDiagnosis(d.medical_diagnosis_details ?? "");
    setEvaluationResults(d.evaluation_results ?? "");
    // Pre-populate present levels from legacy fields if empty in iep_details
    setPresentStrengths(d.present_academic_strengths ?? p.strengths ?? "");
    setPresentNeeds(d.present_academic_needs ?? p.areas_of_need ?? "");
    setDisabilityImpact(d.disability_impact ?? "");
    setMeetingDate(d.meeting_date ?? "");
    setLastIepDate(d.last_iep_date ?? "");
    setMeetingPurpose(d.meeting_purpose ?? "");
    setRevisionDate(d.revision_date ?? "");
    setIepReviewDate(d.iep_review_date ?? "");
    setRecommendations(d.recommendations ?? "");
    setAgreements(d.agreements ?? "");
    if (d.prepared_by || p.reviewed_by_teacher_id || p.reviewed_by_admin_id || p.review_date) setShowReviewDetails(true);
    setTeamMembers(d.team_members ?? []);
    setAssistiveDevices(d.assistive_devices ?? []);
    setBarriers(d.barriers ?? []);
    setPreparedBy(d.prepared_by ?? "");
    setPreparedDate(d.prepared_date ?? "");
    setCheckedReviewedBy(d.checked_reviewed_by ?? "");
    setCheckedReviewedDate(d.checked_reviewed_date ?? "");

    const mappedGoals = full.goals.map((g) => ({
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
    setGoals(mappedGoals);
    setExpandedGoalTracking(new Set(
      mappedGoals
        .filter((g) => !!(g.baseline || g.measurement_method || g.success_criteria || g.remarks))
        .map((g) => g.id),
    ));
    setInterventions(full.interventions.map((i) => ({
      id: i.id,
      strategy: i.strategy,
      frequency: i.frequency,
      responsible_person: i.responsible_person,
      environment: i.environment,
      notes: i.notes,
      goal_id: i.goal_id ?? null,
      sort_order: i.sort_order,
    })));
    setProgress(full.progress.map((pr) => ({
      id: pr.id,
      linked_goal_id: pr.linked_goal_id,
      entry_date: pr.entry_date,
      progress_note: pr.progress_note,
      observed_by: pr.observed_by,
      next_step: pr.next_step,
    })));
    setAttachmentIds(full.attachments.map((a) => a.document_id));
  }

  // ── Build iep_details payload ─────────────────────────────────────────
  function buildIepDetails(): IepDetails {
    return {
      region: ne(region), division: ne(division), district: ne(district),
      learner_lrn: ne(learnerLrn), learner_birth_date: ne(learnerBirthDate),
      learner_sex: ne(learnerSex), learner_grade: ne(learnerGrade),
      religion: ne(religion), mother_tongue: ne(motherTongue),
      home_address: ne(homeAddress), parent_workplace: ne(parentWorkplace),
      caregiver_name: ne(caregiverName), caregiver_contact: ne(caregiverContact),
      caregiver_email: ne(caregiverEmail),
      diff_seeing: diffSeeing || undefined,
      diff_hearing: diffHearing || undefined,
      diff_communicating: diffCommunicating || undefined,
      diff_moving: diffMoving || undefined,
      diff_concentrating: diffConcentrating || undefined,
      diff_remembering: diffRemembering || undefined,
      diff_other: diffOther || undefined,
      diff_other_description: ne(diffOtherDesc),
      has_medical_assessment: hasMedical || undefined,
      medical_diagnosis_details: ne(medicalDiagnosis),
      evaluation_results: ne(evaluationResults),
      present_academic_strengths: ne(presentStrengths),
      present_academic_needs: ne(presentNeeds),
      disability_impact: ne(disabilityImpact),
      meeting_date: ne(meetingDate), last_iep_date: ne(lastIepDate),
      meeting_purpose: ne(meetingPurpose), revision_date: ne(revisionDate),
      iep_review_date: ne(iepReviewDate), recommendations: ne(recommendations),
      agreements: ne(agreements),
      team_members: teamMembers.length ? teamMembers : undefined,
      assistive_devices: assistiveDevices.length ? assistiveDevices : undefined,
      barriers: barriers.length ? barriers : undefined,
      prepared_by: ne(preparedBy), prepared_date: ne(preparedDate),
      checked_reviewed_by: ne(checkedReviewedBy),
      checked_reviewed_date: ne(checkedReviewedDate),
    };
  }

  // ── Save handlers ─────────────────────────────────────────────────────
  async function performSave(targetStatus: PlanStatus): Promise<boolean> {
    if (!stableId) return false;
    if (!title.trim()) { setError("Title is required."); setActiveStep(1); return false; }
    if (!studentId)    { setError("Pick a student.");    setActiveStep(1); return false; }

    setSaving(true); setError(null);
    try {
      await savePlan(supabase, {
        id: stableId, schoolId, studentId, schoolYearId,
        planType: "iep", title: title.trim(),
        status: targetStatus,
        diagnosis: nn(diagnosis), strengths: nn(strengths),
        areasOfNeed: nn(areasOfNeed), backgroundNotes: nn(backgroundNotes),
        parentNotes: nn(parentNotes), parentConcerns: nn(parentConcerns),
        homeSupportNotes: nn(homeSupportNotes),
        reviewDate: nn(reviewDate),
        reviewedByTeacherId: nn(reviewedByTeacherId),
        reviewedByAdminId: nn(reviewedByAdminId),
        parentAcknowledged,
        iepDetails: buildIepDetails(),
        goals: goals.map((g, i) => ({ ...g, sort_order: i })),
        interventions: interventions.map((iv, i) => ({ ...iv, sort_order: i })),
        progress,
        attachmentDocumentIds: attachmentIds,
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
      recovery.clearOnSave(); // Clear recovery data after status change
      setStatus(next);
      onSaved(stableId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change status.");
    } finally {
      setSaving(false);
    }
  }

  // ── Progress Report Assistant entry points ───────────────────────────
  function handleAssistantClick() {
    if (isEditing) {
      setAssistantOpen(true);
    } else {
      setShowSaveDraftPrompt(true);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────
  function printIEP() {
    const sName = students.find((s) => s.id === studentId)?.full_name ?? "—";
    const purposeLabel = MEETING_PURPOSE_OPTIONS.find((o) => o.value === meetingPurpose)?.label ?? meetingPurpose ?? "—";
    const diffList = [
      diffSeeing && "Seeing",
      diffHearing && "Hearing",
      diffCommunicating && "Communicating",
      diffMoving && "Moving/Walking",
      diffConcentrating && "Concentrating/Paying Attention",
      diffRemembering && "Remembering/Understanding",
      diffOther && (diffOtherDesc || "Other"),
    ].filter(Boolean).join(", ");

    const goalsHtml = goals.map((g, i) => {
      const linked = interventions.filter((iv) => iv.goal_id === g.id);
      return `
        <div class="goal-block no-break">
          <table>
            <tr><th colspan="4">Annual Goal ${i + 1}: ${esc(g.description)}</th></tr>
            <tr>
              <td><b>Domain:</b> ${esc(g.domain ?? "—")}</td>
              <td><b>Target Date:</b> ${esc(g.target_date ?? "—")}</td>
              <td><b>Timeline:</b> ${esc(g.timeline ?? "—")}</td>
              <td><b>Responsible:</b> ${esc(g.responsible_person ?? "—")}</td>
            </tr>
            ${g.enroute_objectives ? `<tr><td colspan="4"><b>En Route Objectives:</b><br/>${esc(g.enroute_objectives)}</td></tr>` : ""}
            ${g.baseline ? `<tr><td colspan="2"><b>Baseline:</b> ${esc(g.baseline)}</td><td colspan="2"><b>Measurement:</b> ${esc(g.measurement_method ?? "—")}</td></tr>` : ""}
            ${g.success_criteria ? `<tr><td colspan="4"><b>Success Criteria:</b> ${esc(g.success_criteria)}</td></tr>` : ""}
          </table>
          ${linked.length ? `
            <table style="margin-top:4px">
              <tr><th>Intervention / Activity</th><th>Frequency / Session</th><th>Individual Responsible</th><th>Environment</th></tr>
              ${linked.map((iv) => `<tr><td>${esc(iv.strategy)}</td><td>${esc(iv.frequency ?? "—")}</td><td>${esc(iv.responsible_person ?? "—")}</td><td>${esc(iv.environment ?? "—")}</td></tr>`).join("")}
            </table>` : ""}
          ${g.remarks ? `<p style="font-size:9pt"><b>Remarks:</b> ${esc(g.remarks)}</p>` : ""}
        </div>`;
    }).join("");

    const teamHtml = teamMembers.length ? `
      <table>
        <tr><th>Name</th><th>Role</th><th>Signature / Acknowledgement</th></tr>
        ${teamMembers.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td style="min-width:100px">&nbsp;</td></tr>`).join("")}
      </table>
      <p style="font-size:8pt;font-style:italic">${esc(TEAM_FOOTNOTE)}</p>` : "";

    const barriersHtml = barriers.length ? `
      <table>
        <tr><th>Difficulty</th><th>Learning Barriers</th><th>Learning Facilitators</th><th>Accommodations</th></tr>
        ${barriers.map((b) => `<tr><td>${esc(b.difficulty)}</td><td>${esc(b.learning_barriers)}</td><td>${esc(b.learning_facilitators)}</td><td>${esc(b.accommodations)}</td></tr>`).join("")}
      </table>` : "";

    const devicesHtml = assistiveDevices.length ? `
      <table>
        <tr><th>Difficulty</th><th>Assistive Technology / Devices</th></tr>
        ${assistiveDevices.map((d) => `<tr><td>${esc(d.difficulty)}</td><td>${esc(d.device)}</td></tr>`).join("")}
      </table>` : "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IEP — ${esc(sName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:10pt;color:#000;padding:16px}
    .center{text-align:center}
    h2{font-size:13pt;font-weight:bold;margin:8px 0 4px}
    .section-title{font-size:10pt;font-weight:bold;background:#ddd;border:1px solid #666;padding:3px 6px;margin:10px 0 4px}
    .field-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
    .field{flex:1;min-width:160px}
    .label{font-size:7.5pt;font-weight:bold;text-transform:uppercase;color:#555}
    .value{border-bottom:1px solid #999;min-height:16px;padding:1px 3px;font-size:9.5pt}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    th,td{border:1px solid #777;padding:3px 5px;font-size:9pt;vertical-align:top}
    th{background:#e8e8e8;font-weight:bold}
    .goal-block{margin-bottom:8px}
    .sig{display:flex;gap:20px;margin-top:14px}
    .sig-item{flex:1;text-align:center}
    .sig-line{border-top:1px solid #000;margin:20px 4px 2px}
    .sig-label{font-size:8pt}
    .no-break{page-break-inside:avoid}
    @page{size:A4;margin:14mm}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="center">
    <div>Republic of the Philippines</div>
    <div>Department of Education</div>
    ${region ? `<div>${esc(region)}</div>` : ""}
    ${division ? `<div>${esc(division)}</div>` : ""}
    ${district ? `<div>${esc(district)}</div>` : ""}
    <h2>INDIVIDUALIZED EDUCATION PLAN (IEP)</h2>
    ${schoolName ? `<div>${esc(schoolName)}</div>` : ""}
    ${schoolYearName ? `<div>School Year: ${esc(schoolYearName)}</div>` : ""}
  </div>

  <div class="section-title">I. LEARNER INFORMATION</div>
  <div class="field-row">
    <div class="field"><div class="label">Learner Name</div><div class="value">${esc(sName)}</div></div>
    <div class="field"><div class="label">LRN</div><div class="value">${esc(learnerLrn || "—")}</div></div>
    <div class="field"><div class="label">Date of Birth</div><div class="value">${esc(learnerBirthDate || "—")}</div></div>
    <div class="field"><div class="label">Sex</div><div class="value">${esc(learnerSex || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field"><div class="label">Grade / Section</div><div class="value">${esc(learnerGrade || "—")}</div></div>
    <div class="field"><div class="label">Religion</div><div class="value">${esc(religion || "—")}</div></div>
    <div class="field"><div class="label">Mother Tongue</div><div class="value">${esc(motherTongue || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field" style="flex:2"><div class="label">Parent / Guardian / Caregiver</div><div class="value">${esc(caregiverName || "—")}</div></div>
    <div class="field"><div class="label">Contact Number</div><div class="value">${esc(caregiverContact || "—")}</div></div>
    <div class="field"><div class="label">Email Address</div><div class="value">${esc(caregiverEmail || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field" style="flex:2"><div class="label">Home Address</div><div class="value">${esc(homeAddress || "—")}</div></div>
    <div class="field"><div class="label">Workplace</div><div class="value">${esc(parentWorkplace || "—")}</div></div>
  </div>

  ${(diffList || hasMedical || medicalDiagnosis) ? `
  <div class="section-title">II. DIFFICULTIES / MEDICAL ASSESSMENT</div>
  ${diffList ? `<p><b>Reported Difficulties:</b> ${esc(diffList)}</p>` : ""}
  ${hasMedical ? `<p><b>With Medical Assessment/Diagnosis:</b> ${esc(medicalDiagnosis || "Yes (see attached)")}</p>` : ""}
  ` : ""}

  <div class="section-title">III. MEETING INFORMATION</div>
  <div class="field-row">
    <div class="field"><div class="label">Date of Meeting</div><div class="value">${esc(meetingDate || "—")}</div></div>
    <div class="field"><div class="label">Date of Last IEP</div><div class="value">${esc(lastIepDate || "—")}</div></div>
    <div class="field"><div class="label">Purpose</div><div class="value">${esc(purposeLabel)}</div></div>
    ${meetingPurpose === "revision" ? `<div class="field"><div class="label">Revision Date</div><div class="value">${esc(revisionDate || "—")}</div></div>` : ""}
  </div>
  <div class="field-row">
    <div class="field"><div class="label">IEP Review Date</div><div class="value">${esc(iepReviewDate || "—")}</div></div>
  </div>
  ${recommendations ? `<p><b>Recommendations:</b> ${esc(recommendations)}</p>` : ""}
  ${agreements ? `<p><b>Agreements:</b> ${esc(agreements)}</p>` : ""}

  ${teamHtml ? `<div class="section-title">IV. IEP TEAM MEMBERS</div>${teamHtml}` : ""}

  ${(evaluationResults || presentStrengths || presentNeeds || disabilityImpact) ? `
  <div class="section-title">V. PRESENT LEVELS</div>
  ${evaluationResults ? `<p><b>Evaluation Results:</b> ${esc(evaluationResults)}</p>` : ""}
  ${presentStrengths ? `<p><b>Academic / Functional Strengths:</b> ${esc(presentStrengths)}</p>` : ""}
  ${presentNeeds ? `<p><b>Academic / Functional Needs:</b> ${esc(presentNeeds)}</p>` : ""}
  ${parentConcerns ? `<p><b>Parental Concerns:</b> ${esc(parentConcerns)}</p>` : ""}
  ${disabilityImpact ? `<p><b>Impact of Disability on Curriculum:</b> ${esc(disabilityImpact)}</p>` : ""}
  ` : ""}

  ${devicesHtml ? `<div class="section-title">VI. ASSISTIVE DEVICES</div>${devicesHtml}` : ""}
  ${barriersHtml ? `<div class="section-title">VII. BARRIERS &amp; ACCOMMODATIONS</div>${barriersHtml}` : ""}

  <div class="section-title">VIII. LEARNER GOALS</div>
  ${goalsHtml || "<p><em>No goals recorded.</em></p>"}

  <div class="section-title">IX. PREPARED / REVIEWED</div>
  <div class="sig">
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label"><b>${esc(preparedBy || "Prepared By")}</b><br/>Special Education Teacher / SPED Teacher</div>
      ${preparedDate ? `<div class="sig-label">Date: ${esc(preparedDate)}</div>` : ""}
    </div>
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label"><b>${esc(checkedReviewedBy || "Checked and Reviewed By")}</b><br/>School Principal / Master Teacher</div>
      ${checkedReviewedDate ? `<div class="sig-label">Date: ${esc(checkedReviewedDate)}</div>` : ""}
    </div>
  </div>

</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
    document.body.appendChild(iframe);
    const iDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (iDoc) {
      iDoc.open();
      iDoc.write(html);
      iDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 600);
    }
  }

  // ── Sub-row add helpers ───────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────
  const studentName = students.find((s) => s.id === studentId)?.full_name ?? "—";
  const canEdit = isStaff && status !== "approved" && status !== "archived" && status !== "finalized";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `IEP Plan — ${title || studentName}` : "New IEP Plan"}
      align="top"
      className="max-w-5xl max-h-[90vh]"
    >
      {/* ── Compact sticky header ─────────────────────────────────────── */}
      <div className="-mx-6 -mt-6 border-b border-border bg-card sticky top-0 z-10">

        {/* Recovery — single compact line */}
        {recovery.showRecoveryPrompt && recovery.recoveryTimestamp && (
          <div className="flex items-center gap-2 px-6 py-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="flex-1 text-amber-800 dark:text-amber-200">
              Unsaved recovery found
            </span>
            <button type="button" onClick={recovery.handleRestore}
              className="font-semibold text-amber-800 dark:text-amber-200 hover:text-amber-900 hover:underline underline-offset-2">
              Restore
            </button>
            <span className="text-amber-300 dark:text-amber-700">·</span>
            <button type="button" onClick={recovery.handleDiscardRecovery}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200">
              Discard
            </button>
          </div>
        )}

        {/* Metadata + actions row */}
        <div className="flex items-center gap-3 px-6 py-2.5">
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <PlanStatusBadge status={status} />
            {studentName !== "—" && (
              <span className="text-xs text-muted-foreground truncate">{studentName}</span>
            )}
            {title && studentName !== "—" && (
              <span className="text-xs text-muted-foreground hidden sm:inline truncate">· {title}</span>
            )}
            {updatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · {format(parseISO(updatedAt), "MMM d, h:mm a")}
              </span>
            )}
          </div>

          {/* Primary action: Save Draft */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => performSave(status === "approved" || status === "archived" ? status : "draft")}
            disabled={saving || !canEdit}
            className="shrink-0"
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>

          {/* Overflow menu */}
          <div className="relative shrink-0" ref={moreMenuRef}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowMoreMenu((v) => !v)}
              title="More actions"
              className="px-2"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-card shadow-lg z-20 py-1">
                <button
                  type="button"
                  onClick={() => { printIEP(); setShowMoreMenu(false); }}
                  disabled={!studentId}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                  Print IEP
                </button>
                {isAdmin && status !== "archived" && (
                  <button
                    type="button"
                    onClick={() => { void performStatusChange("archived"); setShowMoreMenu(false); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted text-left text-destructive"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive plan
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Save-draft-first prompt (compact) */}
        {showSaveDraftPrompt && (
          <div className="flex items-center gap-2 px-6 py-2 text-xs bg-muted/60 border-t border-border/40">
            <AlertCircle className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="flex-1 text-muted-foreground">Save this draft to enable AI suggestions for goals.</span>
            <button type="button" onClick={() => setShowSaveDraftPrompt(false)}
              className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Wizard stepper */}
        <div className="px-4 border-t border-border/40">
          <div className="flex items-center gap-0.5 overflow-x-auto py-2 [&::-webkit-scrollbar]:h-0">
            {WIZARD_STEPS.map((step, i) => {
              const isActive = activeStep === step.id;
              const isPast = activeStep > step.id;
              return (
                <div key={step.id} className="flex items-center shrink-0">
                  {i > 0 && <div className="w-3 h-px bg-border mx-0.5" />}
                  <button
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors",
                      isActive ? "bg-primary text-primary-foreground font-medium"
                        : isPast ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-semibold shrink-0",
                      isActive ? "bg-white/20 text-primary-foreground"
                        : isPast ? "bg-primary/15 text-primary"
                        : "bg-muted-foreground/20 text-muted-foreground",
                    )}>
                      {isPast ? "✓" : step.id}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                    <span className="md:hidden">{step.shortLabel}</span>
                  </button>
                </div>
              );
            })}
            {/* Step guidance toggle */}
            <div className="ml-auto pl-2 shrink-0">
              <button
                type="button"
                onClick={() => setStepHelpOpen((v) => !v)}
                title={stepHelpOpen ? "Close step guide" : "What belongs in this step?"}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
                  stepHelpOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{stepHelpOpen ? "Close guide" : "Step guide"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="pt-4"><ErrorAlert message={error} /></div>}
      {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading plan…</div>}

      {!loading && (
        <div className="py-4 space-y-5">

          {/* ── Step guide panel (Layer 2 contextual help) ── */}
          {stepHelpOpen && (
            <IepStepHelp
              step={activeStep}
              onClose={() => setStepHelpOpen(false)}
            />
          )}

          {/* ── STEP 1: Learner & Meeting ── */}
          {activeStep === 1 && (
            <Step1LearnerMeeting
              students={students}
              studentSearch={studentSearch} setStudentSearch={setStudentSearch}
              studentId={studentId} setStudentId={setStudentId}
              studentDropOpen={studentDropOpen} setStudentDropOpen={setStudentDropOpen}
              studentDropRef={studentDropRef}
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

          {/* ── STEP 2: Needs & Strengths ── */}
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

          {/* ── STEP 3: Supports & Accommodations ── */}
          {activeStep === 3 && (
            <Step3Supports
              assistiveDevices={assistiveDevices} setAssistiveDevices={setAssistiveDevices} addDevice={addDevice}
              barriers={barriers} setBarriers={setBarriers} addBarrier={addBarrier}
              step3BarriersLegendOpen={step3BarriersLegendOpen} setStep3BarriersLegendOpen={setStep3BarriersLegendOpen}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick} canEdit={canEdit}
            />
          )}

          {/* ── STEP 4: Goals & Interventions ── */}
          {activeStep === 4 && (
            <Step4GoalsInterventions
              goals={goals} setGoals={setGoals} addGoal={addGoal}
              interventions={interventions} setInterventions={setInterventions} addIntervention={addIntervention}
              expandedGoalTracking={expandedGoalTracking} setExpandedGoalTracking={setExpandedGoalTracking}
              isStaff={isStaff} isEditing={isEditing} saving={saving}
              handleAssistantClick={handleAssistantClick} canEdit={canEdit}
            />
          )}

          {/* ── STEP 5: Progress & Review ── */}
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

          {/* ── STEP 6: Attachments ── */}
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
      )}

      {/* Unsaved changes indicator */}
      {recovery.hasUnsavedChanges && isEditing && (
        <div className="px-6 pt-2 pb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Unsaved changes are temporarily protected on this device.</span>
        </div>
      )}

      {/* Footer navigation */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border -mx-6 px-6">
        <div>
          {activeStep > 1 && (
            <Button type="button" variant="outline" size="sm"
              onClick={() => setActiveStep((activeStep - 1) as WizardStep)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <ModalCancelButton label="Close" size="sm" />
          {isSimpleReview ? (
            /* Simple review path — Finalize IEP on last step */
            activeStep === 6 && isStaff && canEdit && (
              <Button type="button" onClick={() => performSave("finalized")} disabled={saving}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />Finalize IEP
              </Button>
            )
          ) : (
            /* Admin approval path — existing Approve + Submit For Review */
            <>
              {activeStep >= 5 && isAdmin && (status === "submitted" || status === "in_review") && (
                <Button type="button" variant="outline" onClick={() => performStatusChange("approved")} disabled={saving}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />Approve
                </Button>
              )}
              {activeStep === 6 && isStaff && canEdit && status !== "submitted" && (
                <Button type="button" onClick={() => performSave("submitted")} disabled={saving}>
                  <Send className="w-4 h-4 mr-1.5" />Submit For Review
                </Button>
              )}
            </>
          )}
          {activeStep < 6 && (
            <Button type="button" size="sm"
              onClick={() => setActiveStep((activeStep + 1) as WizardStep)}>
              Next<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress Report Assistant panel */}
      {assistantOpen && stableId && (
        <ProgressReportAssistant
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
          onSectionApplied={(label) => {
            // Show brief inline feedback (optional toast)
          }}
        />
      )}
    </Modal>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const variant: Record<PlanStatus, "draft" | "scheduled" | "waitlisted" | "active" | "archived"> = {
    draft: "draft", submitted: "scheduled", in_review: "waitlisted",
    approved: "active", finalized: "active", archived: "archived",
  };
  return <Badge variant={variant[status]}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

/** For JSONB iep_details fields: omit key entirely when blank. */
function ne(v: string | null | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

/** For PlanSaveInput fields typed `string | null`: return null when blank. */
function nn(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** HTML-escape a string for print output. */
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}
