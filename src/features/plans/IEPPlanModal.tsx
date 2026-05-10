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
  Plus, Trash2, Save, Send, Loader2, CheckCircle2,
  Archive, Printer, Paperclip, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, MoreHorizontal, HelpCircle,
} from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/datepicker";
import { ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import {
  PLAN_STATUS_LABELS, GOAL_DOMAIN_SUGGESTIONS,
  MEETING_PURPOSE_OPTIONS, DEFAULT_TEAM_ROLES, BARRIERS_LEGEND, TEAM_FOOTNOTE,
} from "./constants";
import { getPlan, savePlan, setPlanStatus, type PlanSaveInput } from "./queries";
import type { PlanFull, PlanStatus, IepDetails, IepTeamMember, IepAssistiveDevice, IepBarrier } from "./types";
import { ProgressReportAssistant } from "./iep-assistant/ProgressReportAssistant";
import { useIepRecovery, type IepRecoveryState } from "@/lib/iep-recovery/useIepRecovery";
import { IepStepHelp } from "./IepStepHelp";
import { format, parseISO } from "date-fns";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";
import { cn } from "@/lib/utils";

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

// ─── Local row types ───────────────────────────────────────────────────

type GoalRow = PlanSaveInput["goals"][number];
type InterventionRow = PlanSaveInput["interventions"][number];
type ProgressRow = PlanSaveInput["progress"][number];

interface StudentOption { id: string; full_name: string }
interface DocOption { id: string; title: string; document_type: keyof typeof DOCUMENT_TYPE_LABELS }

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
}

// ─── Component ─────────────────────────────────────────────────────────

export function IEPPlanModal({
  open, onClose, onSaved,
  planId, schoolId, schoolName = "", schoolYearId, schoolYearName = null,
  userId, userRole, defaultStudentId = null,
}: IEPPlanModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin   = userRole === "school_admin";
  const isStaff   = userRole === "school_admin" || userRole === "teacher";
  const isEditing = planId !== null;

  // ── UI state ─────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showSaveDraftPrompt, setShowSaveDraftPrompt] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedGoalTracking, setExpandedGoalTracking] = useState<Set<string>>(new Set());
  const [showReviewDetails, setShowReviewDetails] = useState(false);
  const [stepHelpOpen, setStepHelpOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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
    setLegendOpen(false);
    setShowSaveDraftPrompt(false);

    let cancelled = false;
    (async () => {
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId)
        .order("last_name");
      if (cancelled) return;
      setStudents(
        ((studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map(
          (s) => ({ id: s.id, full_name: `${s.first_name} ${s.last_name}` }),
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
      await setPlanStatus(supabase, stableId, next, next === "approved" ? userId : null);
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

  <script>window.print(); window.close();</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=700,noopener");
    if (w) { w.document.write(html); w.document.close(); }
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
  const canEdit = isStaff && status !== "approved" && status !== "archived";

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

          {/* ── STEP 1: Student & Meeting ── */}
          {activeStep === 1 && (
            <div className="space-y-5">

              {/* ── Panel 1: Student & Family ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Learner &amp; Family</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Basic learner and caregiver information for this IEP.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Plan Title" required>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. IEP Plan — SY 2025-2026" disabled={!canEdit} />
                  </Field>
                  <Field label="Learner" required>
                    <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}
                      disabled={!canEdit || isEditing}>
                      <option value="">Select a learner…</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </Select>
                  </Field>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-0.5">Learner Details</p>
                  <p className="text-xs text-muted-foreground">LRN, birth date, and sex are pre-filled from existing records when available.</p>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="LRN">
                    <Input value={learnerLrn} onChange={(e) => setLearnerLrn(e.target.value)} disabled={!canEdit} />
                  </Field>
                  <Field label="Date of Birth">
                    <DatePicker value={learnerBirthDate} onChange={setLearnerBirthDate} disabled={!canEdit} />
                  </Field>
                  <Field label="Sex">
                    <Select value={learnerSex} onChange={(e) => setLearnerSex(e.target.value)} disabled={!canEdit}>
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="Grade / Section">
                    <Input value={learnerGrade} onChange={(e) => setLearnerGrade(e.target.value)} disabled={!canEdit} placeholder="e.g. Grade 3 — Sampaguita" />
                  </Field>
                  <Field label="Religion">
                    <Input value={religion} onChange={(e) => setReligion(e.target.value)} disabled={!canEdit} />
                  </Field>
                  <Field label="Mother Tongue Spoken">
                    <Input value={motherTongue} onChange={(e) => setMotherTongue(e.target.value)} disabled={!canEdit} />
                  </Field>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1">Parent / Guardian / Caregiver</p>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="Name">
                    <Input value={caregiverName} onChange={(e) => setCaregiverName(e.target.value)} disabled={!canEdit} placeholder="Full name" />
                  </Field>
                  <Field label="Contact Number">
                    <Input type="tel" value={caregiverContact} onChange={(e) => setCaregiverContact(e.target.value)} disabled={!canEdit} placeholder="+63 9XX XXX XXXX" />
                  </Field>
                  <Field label="Email Address">
                    <Input type="email" value={caregiverEmail} onChange={(e) => setCaregiverEmail(e.target.value)} disabled={!canEdit} placeholder="email@example.com" />
                  </Field>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Home Address">
                    <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} disabled={!canEdit} rows={2} />
                  </Field>
                  <Field label="Workplace">
                    <Textarea value={parentWorkplace} onChange={(e) => setParentWorkplace(e.target.value)} disabled={!canEdit} rows={2} />
                  </Field>
                </div>
                <Field label="Parent / Guardian / Caregiver Notes" hint="What the caregiver shared in conversation.">
                  <Textarea value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} disabled={!canEdit} rows={2} />
                </Field>

                {/* DepEd classification — collapsible, auto-populated from school settings */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setLegendOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {legendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    DepEd classification — region, division, district
                  </button>
                  {legendOpen && (
                    <div className="mt-3 grid md:grid-cols-3 gap-3">
                      <Field label="Region">
                        <Input value={region} onChange={(e) => setRegion(e.target.value)} disabled={!canEdit} placeholder="e.g. Region IV-A" />
                      </Field>
                      <Field label="Schools Division">
                        <Input value={division} onChange={(e) => setDivision(e.target.value)} disabled={!canEdit} placeholder="e.g. Division of Laguna" />
                      </Field>
                      <Field label="District">
                        <Input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!canEdit} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Panel 2: Meeting Setup ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Meeting Setup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Document the meeting purpose, dates, and follow-up schedule.</p>
                </div>

                <Field label="Purpose of Meeting">
                  <Select value={meetingPurpose} onChange={(e) => setMeetingPurpose(e.target.value)} disabled={!canEdit}>
                    <option value="">— Select —</option>
                    {MEETING_PURPOSE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Date of Meeting">
                    <DatePicker value={meetingDate} onChange={setMeetingDate} disabled={!canEdit} />
                  </Field>
                  {meetingPurpose !== "initial" && (
                    <Field label="Date of Last IEP">
                      <DatePicker value={lastIepDate} onChange={setLastIepDate} disabled={!canEdit} />
                    </Field>
                  )}
                </div>
                {meetingPurpose === "revision" && (
                  <Field label="Revision Date">
                    <DatePicker value={revisionDate} onChange={setRevisionDate} disabled={!canEdit} />
                  </Field>
                )}
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="IEP Review Date">
                    <DatePicker value={iepReviewDate} onChange={setIepReviewDate} disabled={!canEdit} />
                  </Field>
                </div>

                {/* Recommendations */}
                <div className="border-t border-border/40 pt-3 space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Recommendations</p>
                  <Textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} disabled={!canEdit} rows={3} placeholder="Enter recommendations from the IEP team…" />
                </div>

                {/* Agreements */}
                <div className="border-t border-border/40 pt-3 space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Agreements</p>
                  <Textarea value={agreements} onChange={(e) => setAgreements(e.target.value)} disabled={!canEdit} rows={3} placeholder="Enter agreements reached during the IEP meeting…" />
                </div>
              </div>

              {/* ── Panel 3: IEP Team ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">IEP Team</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{TEAM_FOOTNOTE}</p>
                </div>

                {teamMembers.length === 0 && <EmptyHint>No team members added yet.</EmptyHint>}
                {teamMembers.map((m, idx) => (
                  <BlockCard key={m.id} index={idx}
                    onRemove={canEdit ? () => setTeamMembers((p) => p.filter((x) => x.id !== m.id)) : undefined}>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="Name">
                        <Input value={m.name}
                          onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, name: e.target.value } : x))}
                          disabled={!canEdit} />
                      </Field>
                      <Field label="Role">
                        <Select
                          value={m.role}
                          onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, role: e.target.value } : x))}
                          disabled={!canEdit}
                        >
                          <option value="">— Select role —</option>
                          {DEFAULT_TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={m.requires_ack} disabled={!canEdit}
                        onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, requires_ack: e.target.checked } : x))} />
                      Requires acknowledgement
                    </label>
                    {m.requires_ack && (
                      <Field label="Acknowledged At">
                        <DatePicker
                          value={m.acknowledged_at ?? ""}
                          onChange={(v) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, acknowledged_at: v || null } : x))}
                          disabled={!canEdit}
                        />
                      </Field>
                    )}
                  </BlockCard>
                ))}
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={addTeamMember}>
                    <Plus className="w-4 h-4 mr-1" /> Add team member
                  </Button>
                )}
              </div>

            </div>
          )}

          {/* ── STEP 2: Current Needs & Strengths ── */}
          {activeStep === 2 && (
            <div className="space-y-5">

              {/* ── Panel A: Reported Difficulties ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Reported Difficulties</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Check all areas where the learner has been observed to have difficulty.</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {([
                    ["diff_seeing",        "Seeing",                           diffSeeing,        setDiffSeeing],
                    ["diff_hearing",       "Hearing",                          diffHearing,       setDiffHearing],
                    ["diff_communicating", "Communicating",                    diffCommunicating, setDiffCommunicating],
                    ["diff_moving",        "Moving / Walking",                 diffMoving,        setDiffMoving],
                    ["diff_concentrating", "Concentrating / Paying Attention", diffConcentrating, setDiffConcentrating],
                    ["diff_remembering",   "Remembering / Understanding",      diffRemembering,   setDiffRemembering],
                  ] as [string, string, boolean, (v: boolean) => void][]).map(([key, lbl, val, setter]) => (
                    <label key={key} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={val} disabled={!canEdit}
                        onChange={(e) => setter(e.target.checked)} />
                      {lbl}
                    </label>
                  ))}
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={diffOther} disabled={!canEdit}
                      onChange={(e) => setDiffOther(e.target.checked)} />
                    Other
                  </label>
                </div>
                {diffOther && (
                  <Field label="Describe other difficulty">
                    <Input value={diffOtherDesc} onChange={(e) => setDiffOtherDesc(e.target.value)} disabled={!canEdit}
                      placeholder="Briefly describe the other difficulty area." />
                  </Field>
                )}

                <div className="border-t border-border/40 pt-3 space-y-3">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={hasMedical} disabled={!canEdit}
                      onChange={(e) => setHasMedical(e.target.checked)} />
                    Medical assessment or diagnosis information available
                  </label>
                  {hasMedical && (
                    <Field label="Reported diagnosis / medical details"
                      hint="Medical assessment information as provided by parent or attending specialist.">
                      <Textarea value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)}
                        disabled={!canEdit} rows={2}
                        placeholder="Describe the diagnosis or assessment results as reported by the parent or specialist." />
                    </Field>
                  )}
                  <Field label="Reported condition (brief summary)"
                    hint="Used in reports and older plan views.">
                    <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                      disabled={!canEdit} rows={2}
                      placeholder="e.g. Autism Spectrum Disorder, as reported by attending physician." />
                  </Field>
                </div>
              </div>

              {/* ── Panel B: Current Learning Profile ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Current Learning Profile</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Describe the learner's current academic, developmental, and functional performance.</p>
                </div>

                {/* Contextual AI assistant block */}
                {isStaff && (
                  <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Need help getting started?</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Use the latest progress report to draft strengths, needs, and evaluation summaries.</p>
                    </div>
                    <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
                      title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
                      className="text-xs font-medium text-primary hover:text-primary/80 shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                      Use Progress Report →
                    </button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic -mt-1">
                  These sections can be updated over time as more assessments and observations become available.
                </p>

                <Field label="Evaluation Summary"
                  hint="Results of the initial or most recent evaluation.">
                  <Textarea value={evaluationResults} onChange={(e) => setEvaluationResults(e.target.value)}
                    disabled={!canEdit} rows={2}
                    placeholder="Summarize the key findings from the most recent evaluation or assessment." />
                </Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Academic / Functional Strengths">
                    <Textarea value={presentStrengths} onChange={(e) => setPresentStrengths(e.target.value)}
                      disabled={!canEdit} rows={3}
                      placeholder="What skills, interests, or learning behaviors are currently working well?" />
                  </Field>
                  <Field label="Academic / Functional Needs">
                    <Textarea value={presentNeeds} onChange={(e) => setPresentNeeds(e.target.value)}
                      disabled={!canEdit} rows={3}
                      placeholder="What areas currently require support or intervention?" />
                  </Field>
                </div>
                <Field label="Parent / Guardian Concerns"
                  hint="Concerns shared by the parent or guardian regarding the child's education.">
                  <Textarea value={parentConcerns} onChange={(e) => setParentConcerns(e.target.value)}
                    disabled={!canEdit} rows={2}
                    placeholder="What specific concerns did the parent or guardian raise about their child's education?" />
                </Field>
                <Field label="Impact on General Education Curriculum">
                  <Textarea value={disabilityImpact} onChange={(e) => setDisabilityImpact(e.target.value)}
                    disabled={!canEdit} rows={2}
                    placeholder="How does the learner's condition affect their participation and progress in the general education curriculum?" />
                </Field>
              </div>

              {/* ── Panel C: Internal Staff Notes ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Internal Staff Notes</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Additional context for the team. Not included in the printed IEP by default.</p>
                </div>
                <Field label="Background Notes">
                  <Textarea value={backgroundNotes} onChange={(e) => setBackgroundNotes(e.target.value)}
                    disabled={!canEdit} rows={2}
                    placeholder="Additional observations, context, or notes for staff use only." />
                </Field>
              </div>

            </div>
          )}

          {/* ── STEP 3: Supports & Accommodations ── */}
          {activeStep === 3 && (
            <div className="space-y-5">

              {/* ── Panel A: Assistive Technology & Devices ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Assistive Technology &amp; Devices</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Tools, equipment, and technology that support the learner's participation.</p>
                  </div>
                  {canEdit && assistiveDevices.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={addDevice} className="shrink-0">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add device
                    </Button>
                  )}
                </div>

                {assistiveDevices.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      No devices listed yet. Common examples: communication boards, visual schedules, adaptive writing tools, noise-cancelling headphones, sensory supports.
                    </p>
                    {canEdit && (
                      <Button type="button" variant="outline" size="sm" onClick={addDevice}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Add assistive device
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assistiveDevices.map((d, idx) => (
                      <BlockCard key={d.id} index={idx}
                        onRemove={canEdit ? () => setAssistiveDevices((p) => p.filter((x) => x.id !== d.id)) : undefined}>
                        <div className="grid md:grid-cols-2 gap-3">
                          <Field label="Related area or difficulty">
                            <Input value={d.difficulty}
                              onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, difficulty: e.target.value } : x))}
                              disabled={!canEdit}
                              placeholder="e.g. difficulty with handwriting" />
                          </Field>
                          <Field label="Assistive technology or device">
                            <Input value={d.device}
                              onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, device: e.target.value } : x))}
                              disabled={!canEdit}
                              placeholder="e.g. adaptive pencil grip, text-to-speech app" />
                          </Field>
                        </div>
                      </BlockCard>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Panel B: Learning Supports & Accommodations ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Learning Supports &amp; Accommodations</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Document what makes participation harder and what strategies or supports help the learner succeed.</p>
                  </div>
                  {canEdit && barriers.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={addBarrier} className="shrink-0">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add entry
                    </Button>
                  )}
                </div>

                {/* Contextual AI assistant block */}
                {isStaff && (
                  <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Need ideas for supports?</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Use recent progress reports and goals to draft suggested barriers, facilitators, and accommodations.</p>
                    </div>
                    <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
                      title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
                      className="text-xs font-medium text-primary hover:text-primary/80 shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                      Suggest Supports →
                    </button>
                  </div>
                )}

                {/* Support Planning Tips — collapsible */}
                <div>
                  <button
                    type="button"
                    onClick={() => setLegendOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {legendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Support planning tips &amp; examples
                  </button>
                  {legendOpen && (
                    <div className="mt-2 rounded-lg border border-border/50 bg-card p-3 text-xs space-y-2">
                      <div>
                        <p className="font-medium text-foreground mb-1">Common barriers (what makes it harder)</p>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LB")).map((l) => (
                            <li key={l.code} className="flex gap-1.5"><span className="font-medium text-foreground/70 shrink-0">{l.code}</span>{l.label}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-1">Common facilitators (what helps)</p>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LF")).map((l) => (
                            <li key={l.code} className="flex gap-1.5"><span className="font-medium text-foreground/70 shrink-0">{l.code}</span>{l.label}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {barriers.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      No support entries yet. Common examples: structured routines, peer support, modified materials, extended time, reduced task complexity, sensory breaks.
                    </p>
                    {canEdit && (
                      <Button type="button" variant="outline" size="sm" onClick={addBarrier}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Add support entry
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {barriers.map((b, idx) => (
                      <BlockCard key={b.id} index={idx}
                        onRemove={canEdit ? () => setBarriers((p) => p.filter((x) => x.id !== b.id)) : undefined}>
                        <Field label="Area or difficulty">
                          <Input value={b.difficulty}
                            onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, difficulty: e.target.value } : x))}
                            disabled={!canEdit}
                            placeholder="e.g. difficulty sustaining attention during group activities" />
                        </Field>
                        <div className="grid md:grid-cols-3 gap-3">
                          <Field label="What makes it harder?">
                            <Textarea rows={2} value={b.learning_barriers}
                              onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_barriers: e.target.value } : x))}
                              disabled={!canEdit}
                              placeholder="What situations or conditions make participation more difficult?" />
                          </Field>
                          <Field label="What helps the learner?">
                            <Textarea rows={2} value={b.learning_facilitators}
                              onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_facilitators: e.target.value } : x))}
                              disabled={!canEdit}
                              placeholder="What strategies, routines, or supports help the learner succeed?" />
                          </Field>
                          <Field label="Classroom accommodations">
                            <Textarea rows={2} value={b.accommodations}
                              onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, accommodations: e.target.value } : x))}
                              disabled={!canEdit}
                              placeholder="What consistent adjustments should be provided in the classroom?" />
                          </Field>
                        </div>
                      </BlockCard>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── STEP 4: Goals & Interventions ── */}
          {activeStep === 4 && (
            <div className="space-y-5">

              {/* ── Panel A: Annual Goals ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Annual Goals</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Set specific, observable goals for the school year. Each goal should describe what the learner will achieve.</p>
                </div>

                {/* AI contextual card */}
                {isStaff && (
                  <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">Draft Goals with AI</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Based on the needs and strengths you&apos;ve documented, the assistant can suggest measurable annual goals.</p>
                    </div>
                    <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
                      title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
                      className="text-xs text-primary hover:text-primary/80 font-medium shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
                      Draft Goals →
                    </button>
                  </div>
                )}

                {/* Empty state with examples */}
                {goals.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-3">
                    <p className="text-sm font-medium text-foreground">No goals yet</p>
                    <p className="text-xs text-muted-foreground">Examples of annual goals:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        "Improve expressive communication",
                        "Increase classroom participation",
                        "Improve reading comprehension",
                        "Develop self-regulation strategies",
                        "Strengthen fine motor skills",
                      ].map((ex) => (
                        <span key={ex} className="inline-block bg-muted rounded-md px-2.5 py-1 text-xs text-muted-foreground">{ex}</span>
                      ))}
                    </div>
                    {canEdit && (
                      <button type="button" onClick={addGoal}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 mt-1">
                        <Plus className="w-3.5 h-3.5" />
                        Create first goal
                      </button>
                    )}
                  </div>
                )}

                {/* Goal cards */}
                {goals.map((g, idx) => {
                  const isTrackingExpanded = expandedGoalTracking.has(g.id);
                  const hasAdvancedData = !!(g.baseline || g.measurement_method || g.success_criteria || g.remarks);
                  return (
                    <BlockCard key={g.id} index={idx}
                      onRemove={canEdit ? () => setGoals((p) => p.filter((x) => x.id !== g.id)) : undefined}>

                      {/* Core Goal Information */}
                      <Field label="Annual goal" required>
                        <Textarea rows={2} value={g.description}
                          onChange={(e) => updateGoal(setGoals, g.id, { description: e.target.value })}
                          disabled={!canEdit}
                          placeholder="By the end of the school year, the learner will…" />
                      </Field>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Field label="Domain / Area">
                          <Input list={`goal-domains-${g.id}`} value={g.domain ?? ""}
                            onChange={(e) => updateGoal(setGoals, g.id, { domain: e.target.value })}
                            disabled={!canEdit}
                            placeholder="e.g. Communication, Literacy, Social Skills" />
                          <datalist id={`goal-domains-${g.id}`}>
                            {GOAL_DOMAIN_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
                          </datalist>
                        </Field>
                        <Field label="Target date">
                          <DatePicker value={g.target_date ?? ""}
                            onChange={(v) => updateGoal(setGoals, g.id, { target_date: v || null })}
                            disabled={!canEdit} />
                        </Field>
                      </div>
                      <Field label="Short-term objectives">
                        <Textarea rows={2} value={g.enroute_objectives ?? ""}
                          onChange={(e) => updateGoal(setGoals, g.id, { enroute_objectives: e.target.value || null })}
                          disabled={!canEdit}
                          placeholder="Step-by-step milestones leading toward the annual goal…" />
                      </Field>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Field label="How often / how long">
                          <Input value={g.timeline ?? ""}
                            onChange={(e) => updateGoal(setGoals, g.id, { timeline: e.target.value || null })}
                            disabled={!canEdit} placeholder="e.g. 3x/week, 30 mins" />
                        </Field>
                        <Field label="Who is responsible">
                          <Input value={g.responsible_person ?? ""}
                            onChange={(e) => updateGoal(setGoals, g.id, { responsible_person: e.target.value || null })}
                            disabled={!canEdit} placeholder="e.g. SPED Teacher, OT" />
                        </Field>
                      </div>

                      {/* Advanced Tracking toggle */}
                      <div className="border-t border-border/40 pt-3">
                        <button type="button"
                          onClick={() => setExpandedGoalTracking((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                            return next;
                          })}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                          {isTrackingExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          Advanced tracking
                          {hasAdvancedData && !isTrackingExpanded && (
                            <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                        {isTrackingExpanded && (
                          <div className="mt-3 space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              <Field label="Baseline (where are we starting?)">
                                <Input value={g.baseline ?? ""}
                                  onChange={(e) => updateGoal(setGoals, g.id, { baseline: e.target.value || null })}
                                  disabled={!canEdit}
                                  placeholder="Current performance level before intervention" />
                              </Field>
                              <Field label="How will progress be measured?">
                                <Input value={g.measurement_method ?? ""}
                                  onChange={(e) => updateGoal(setGoals, g.id, { measurement_method: e.target.value || null })}
                                  disabled={!canEdit}
                                  placeholder="e.g. Teacher observation, work samples, rubric" />
                              </Field>
                            </div>
                            <Field label="What does success look like?">
                              <Textarea rows={2} value={g.success_criteria ?? ""}
                                onChange={(e) => updateGoal(setGoals, g.id, { success_criteria: e.target.value || null })}
                                disabled={!canEdit}
                                placeholder="Specific, observable evidence that this goal has been met…" />
                            </Field>
                            <Field label="Evaluation notes & remarks">
                              <Textarea rows={2} value={g.remarks ?? ""}
                                onChange={(e) => updateGoal(setGoals, g.id, { remarks: e.target.value || null })}
                                disabled={!canEdit}
                                placeholder="Instructional notes, mid-year reflections, adjustments made…" />
                            </Field>
                          </div>
                        )}
                      </div>
                    </BlockCard>
                  );
                })}

                {/* Add another goal when at least one exists */}
                {goals.length > 0 && canEdit && (
                  <button type="button" onClick={addGoal}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                    <Plus className="w-3.5 h-3.5" />
                    Add another goal
                  </button>
                )}
              </div>

              {/* ── Panel B: Support Strategies & Learning Activities ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Support Strategies &amp; Learning Activities</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Describe specific strategies, who carries them out, where, and how often. Link each to a goal to track coverage.</p>
                  </div>
                  {canEdit && interventions.length > 0 && (
                    <button type="button" onClick={() => addIntervention()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                      Add strategy
                    </button>
                  )}
                </div>

                {interventions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-3">
                    <p className="text-sm font-medium text-foreground">No strategies yet</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">Support strategies describe HOW the team helps the learner reach their goals — the activities, routines, and methods used in class and at home.</p>
                    {canEdit && (
                      <button type="button" onClick={() => addIntervention()}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                        <Plus className="w-3.5 h-3.5" />
                        Add first strategy
                      </button>
                    )}
                  </div>
                )}

                {interventions.map((iv, idx) => (
                  <BlockCard key={iv.id} index={idx}
                    onRemove={canEdit ? () => setInterventions((p) => p.filter((x) => x.id !== iv.id)) : undefined}>

                    {/* Goal link — show nudge when no goals exist yet */}
                    {goals.length === 0 ? (
                      <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium">Link to a goal:</span> Add annual goals first (in the panel above), then come back to link this strategy.
                      </div>
                    ) : (
                      <Field label="Which goal does this support?" hint="Optional — link to track strategy coverage.">
                        <Select value={iv.goal_id ?? ""}
                          onChange={(e) => updateIntervention(setInterventions, iv.id, { goal_id: e.target.value || null })}
                          disabled={!canEdit}>
                          <option value="">— Not linked to a specific goal —</option>
                          {goals.map((g, i) => (
                            <option key={g.id} value={g.id}>
                              Goal {i + 1}: {(g.description || "(empty)").slice(0, 60)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    <Field label="What is the strategy or activity?" required>
                      <Textarea rows={2} value={iv.strategy}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { strategy: e.target.value })}
                        disabled={!canEdit}
                        placeholder="e.g. Visual schedule review at the start of each class period, using task cards and verbal prompts." />
                    </Field>
                    <div className="grid md:grid-cols-3 gap-3">
                      <Field label="Frequency / schedule">
                        <Input value={iv.frequency ?? ""}
                          onChange={(e) => updateIntervention(setInterventions, iv.id, { frequency: e.target.value })}
                          disabled={!canEdit} placeholder="Daily, 3x weekly…" />
                      </Field>
                      <Field label="Who carries this out">
                        <Input value={iv.responsible_person ?? ""}
                          onChange={(e) => updateIntervention(setInterventions, iv.id, { responsible_person: e.target.value })}
                          disabled={!canEdit} placeholder="SPED Teacher, OT…" />
                      </Field>
                      <Field label="Where / setting">
                        <Input value={iv.environment ?? ""}
                          onChange={(e) => updateIntervention(setInterventions, iv.id, { environment: e.target.value })}
                          disabled={!canEdit} placeholder="Classroom, home…" />
                      </Field>
                    </div>
                    <Field label="Additional notes">
                      <Textarea rows={2} value={iv.notes ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { notes: e.target.value })}
                        disabled={!canEdit}
                        placeholder="Materials needed, special considerations, variations…" />
                    </Field>
                  </BlockCard>
                ))}
              </div>

            </div>
          )}

          {/* ── STEP 5: Progress & Review ── */}
          {activeStep === 5 && (
            <div className="space-y-5">

              {/* ── Panel A: Learner Progress Reflection ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Learner Progress Reflection</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Document observations, instructional progress, and next steps over time.</p>
                  </div>
                  {canEdit && progress.length > 0 && (
                    <button type="button" onClick={addProgress}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                      Add entry
                    </button>
                  )}
                </div>

                {progress.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-3">
                    <p className="text-sm font-medium text-foreground">No observations recorded yet</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">Add an entry whenever you observe meaningful progress, a challenge, or a change worth noting. Each entry becomes part of the learner&apos;s growth story.</p>
                    {canEdit && (
                      <button type="button" onClick={addProgress}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                        <Plus className="w-3.5 h-3.5" />
                        Record first observation
                      </button>
                    )}
                  </div>
                )}

                {progress.map((pr, idx) => (
                  <BlockCard key={pr.id} index={idx}
                    onRemove={canEdit ? () => setProgress((p) => p.filter((x) => x.id !== pr.id)) : undefined}>
                    {/* Date + goal reference as journal header */}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="shrink-0">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">Date of observation</label>
                        <DatePicker value={pr.entry_date}
                          onChange={(v) => updateProgress(setProgress, pr.id, { entry_date: v || format(new Date(), "yyyy-MM-dd") })}
                          disabled={!canEdit} />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">Related to goal</label>
                        <Select value={pr.linked_goal_id ?? ""}
                          onChange={(e) => updateProgress(setProgress, pr.id, { linked_goal_id: e.target.value || null })}
                          disabled={!canEdit}>
                          <option value="">— General observation —</option>
                          {goals.map((g, i) => (
                            <option key={g.id} value={g.id}>
                              Goal {i + 1}: {(g.description || "(empty)").slice(0, 50)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <Field label="What was observed?" required>
                      <Textarea rows={3} value={pr.progress_note}
                        onChange={(e) => updateProgress(setProgress, pr.id, { progress_note: e.target.value })}
                        disabled={!canEdit}
                        placeholder="Describe what you saw — how the learner responded, any notable progress, emerging skills, or challenges…" />
                    </Field>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="Observed by" hint="Teacher, therapist, or staff member who observed the learner.">
                        <Input value={pr.observed_by ?? ""}
                          onChange={(e) => updateProgress(setProgress, pr.id, { observed_by: e.target.value })}
                          disabled={!canEdit} placeholder="Name of observer" />
                      </Field>
                      <Field label="Next step" hint="What should the team continue, adjust, or try next?">
                        <Input value={pr.next_step ?? ""}
                          onChange={(e) => updateProgress(setProgress, pr.id, { next_step: e.target.value })}
                          disabled={!canEdit} placeholder="Continue, adjust, or try…" />
                      </Field>
                    </div>
                  </BlockCard>
                ))}
              </div>

              {/* ── Panel B: Review & Approval Details (collapsible) ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <button type="button"
                  onClick={() => setShowReviewDetails((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Review &amp; Approval Details</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Signature lines, approval workflow, and review tracking.</p>
                  </div>
                  {showReviewDetails ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {showReviewDetails && (
                  <div className="space-y-4 pt-1">
                    {/* Signature lines */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">Print signature lines</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Field label="Prepared by">
                          <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} disabled={!canEdit} placeholder="Name for print signature" />
                        </Field>
                        <Field label="Prepared date">
                          <DatePicker value={preparedDate} onChange={setPreparedDate} disabled={!canEdit} />
                        </Field>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3 mt-3">
                        <Field label="Checked and reviewed by">
                          <Input value={checkedReviewedBy} onChange={(e) => setCheckedReviewedBy(e.target.value)} disabled={!canEdit} placeholder="Name for print signature" />
                        </Field>
                        <Field label="Checked / reviewed date">
                          <DatePicker value={checkedReviewedDate} onChange={setCheckedReviewedDate} disabled={!canEdit} />
                        </Field>
                      </div>
                    </div>

                    {/* Approval workflow */}
                    <div className="border-t border-border/40 pt-4 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Approval workflow</p>
                      <Field label="Review date">
                        <DatePicker value={reviewDate} onChange={setReviewDate} disabled={!canEdit} />
                      </Field>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Field label="Reviewed by teacher">
                          <StaffPicker schoolId={schoolId} role="teacher"
                            value={reviewedByTeacherId} onChange={setReviewedByTeacherId} disabled={!canEdit} />
                        </Field>
                        <Field label="Reviewed by admin">
                          <StaffPicker schoolId={schoolId} role="school_admin"
                            value={reviewedByAdminId} onChange={setReviewedByAdminId} disabled={!canEdit} />
                        </Field>
                      </div>
                    </div>

                    {/* Status pipeline */}
                    <div className="border-t border-border/40 pt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Plan status</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(["draft", "submitted", "in_review", "approved", "archived"] as PlanStatus[]).map((s, i, arr) => (
                          <span key={s} className="flex items-center gap-1.5">
                            <span className={cn(
                              "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                              status === s
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}>
                              {PLAN_STATUS_LABELS[s]}
                            </span>
                            {i < arr.length - 1 && <span className="text-muted-foreground/50 text-xs">→</span>}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Use <em>Save Draft</em> to keep editing. Use <em>Submit For Review</em> when ready for admin approval.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Panel C: Family Review & Acknowledgement ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Family Review &amp; Acknowledgement</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Notes from home and confirmation that the family has reviewed this plan.</p>
                </div>
                <Field label="Home support notes" hint="Any strategies, routines, or supports the family is implementing at home.">
                  <Textarea value={homeSupportNotes} onChange={(e) => setHomeSupportNotes(e.target.value)} disabled={!canEdit} rows={2}
                    placeholder="e.g. The family reads together nightly, uses a visual schedule at home…" />
                </Field>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={parentAcknowledged}
                      onChange={(e) => setParentAcknowledged(e.target.checked)} disabled={!canEdit} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Parent / guardian has reviewed and acknowledged this plan</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Checking this confirms the family has been involved in the IEP process and agrees with the plan.</p>
                    </div>
                  </label>
                </div>
              </div>

            </div>
          )}

          {/* ── STEP 6: Attachments ── */}
          {activeStep === 6 && (
            <div className="space-y-5">

              {/* ── Main frame ── */}
              <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Supporting Documents</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Link progress reports, assessments, therapy summaries, and supporting evidence that inform this IEP. Documents are managed in the Documents area.</p>
                </div>

                {/* No student selected */}
                {!studentId && (
                  <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center">
                    <p className="text-sm text-muted-foreground">Select a learner on the first step to see their available documents.</p>
                  </div>
                )}

                {/* Student selected but no docs */}
                {studentId && studentDocs.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">No documents uploaded yet</p>
                    <p className="text-xs text-muted-foreground">Go to the <strong>Documents</strong> section to upload reports, assessments, and other supporting materials for this learner, then come back to link them here.</p>
                  </div>
                )}

                {/* Document list grouped by type */}
                {studentDocs.length > 0 && (() => {
                  const DOC_GROUPS: { label: string; types: Array<DocOption["document_type"]> }[] = [
                    { label: "Progress Reports",   types: ["iep", "therapy_progress"] },
                    { label: "Assessments",         types: ["therapy_evaluation", "dev_pediatrician_report", "school_accommodation"] },
                    { label: "Medical Documents",   types: ["medical_certificate"] },
                    { label: "Parent Documents",    types: ["parent_provided"] },
                    { label: "Supporting Evidence", types: ["other_supporting"] },
                  ];
                  const grouped = DOC_GROUPS
                    .map((g) => ({ ...g, docs: studentDocs.filter((d) => g.types.includes(d.document_type)) }))
                    .filter((g) => g.docs.length > 0);
                  const ungrouped = studentDocs.filter(
                    (d) => !DOC_GROUPS.flatMap((g) => g.types).includes(d.document_type),
                  );
                  if (ungrouped.length > 0) grouped.push({ label: "Other", types: [], docs: ungrouped });

                  return (
                    <div className="space-y-4">
                      {grouped.map((group) => (
                        <div key={group.label}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.label}</p>
                          <div className="border border-border rounded-lg divide-y divide-border">
                            {group.docs.map((d) => {
                              const checked = attachmentIds.includes(d.id);
                              return (
                                <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                                    <input type="checkbox" className="mt-1 shrink-0" checked={checked} disabled={!canEdit}
                                      onChange={(e) => {
                                        if (e.target.checked) setAttachmentIds((p) => [...p, d.id]);
                                        else                  setAttachmentIds((p) => p.filter((id) => id !== d.id));
                                      }} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">{d.title}</span>
                                        {checked && <Paperclip className="w-3 h-3 text-primary shrink-0" />}
                                      </div>
                                      <div className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.document_type]}</div>
                                    </div>
                                  </label>
                                  {/* AI actions per document */}
                                  {isStaff && checked && (
                                    <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
                                      title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
                                      className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap mt-0.5 disabled:opacity-40 disabled:cursor-not-allowed">
                                      <Sparkles className="w-3 h-3" />
                                      Summarize
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Attached count + clear */}
                {attachmentIds.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 pt-3">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span><span className="font-medium text-foreground">{attachmentIds.length}</span> document{attachmentIds.length !== 1 ? "s" : ""} linked to this IEP</span>
                    {canEdit && (
                      <button type="button" onClick={() => setAttachmentIds([])}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" /> Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Submission guidance (informational only — submit action is in the footer) ── */}
              {isStaff && canEdit && status === "draft" && (
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-2">
                  <p className="text-sm font-medium text-foreground">Ready to submit?</p>
                  <p className="text-xs text-muted-foreground">When the plan is complete, use the <strong>Submit For Review</strong> button below to send it to an admin for approval. You can continue editing until it&apos;s approved.</p>
                </div>
              )}

            </div>
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
          {/* Approve — available on final two steps for admins */}
          {activeStep >= 5 && isAdmin && (status === "submitted" || status === "in_review") && (
            <Button type="button" variant="outline" onClick={() => performStatusChange("approved")} disabled={saving}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />Approve
            </Button>
          )}
          {/* Submit For Review — only on the final step so the action feels earned */}
          {activeStep === 6 && isStaff && canEdit && status !== "submitted" && (
            <Button type="button" onClick={() => performSave("submitted")} disabled={saving}>
              <Send className="w-4 h-4 mr-1.5" />Submit For Review
            </Button>
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
    approved: "active", archived: "archived",
  };
  return <Badge variant={variant[status]}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeader({ title, hint, onAdd, addLabel }: { title: string; hint?: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {onAdd && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />{addLabel ?? "Add"}
        </Button>
      )}
    </div>
  );
}

function BlockCard({ index, onRemove, children }: { index: number; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-600 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground italic">{children}</div>;
}

// ── Sub-row update helpers ────────────────────────────────────────────────

function updateGoal(setter: React.Dispatch<React.SetStateAction<GoalRow[]>>, id: string, patch: Partial<GoalRow>) {
  setter((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}
function updateIntervention(setter: React.Dispatch<React.SetStateAction<InterventionRow[]>>, id: string, patch: Partial<InterventionRow>) {
  setter((prev) => prev.map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)));
}
function updateProgress(setter: React.Dispatch<React.SetStateAction<ProgressRow[]>>, id: string, patch: Partial<ProgressRow>) {
  setter((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

/** Null-if-empty helper — trims whitespace. */
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

// ── StaffPicker ───────────────────────────────────────────────────────────

function StaffPicker({ schoolId, role, value, onChange, disabled }: {
  schoolId: string; role: "teacher" | "school_admin";
  value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [opts, setOpts] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("list_school_staff_for_sharing", { p_school_id: schoolId })
      .then(({ data }) => {
        if (cancelled) return;
        const all = (data ?? []) as Array<{ id: string; full_name: string; role: string }>;
        setOpts(all.filter((p) => p.role === role));
      });
    return () => { cancelled = true; };
  }, [schoolId, role, supabase]);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">— Not yet —</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
    </Select>
  );
}
