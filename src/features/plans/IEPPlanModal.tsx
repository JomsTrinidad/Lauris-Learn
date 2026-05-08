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

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Save, Send, Loader2, CheckCircle2,
  Archive, Printer, Paperclip, X, ChevronDown, ChevronUp,
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
  IEP_SECTIONS, PLAN_STATUS_LABELS, GOAL_DOMAIN_SUGGESTIONS,
  MEETING_PURPOSE_OPTIONS, DEFAULT_TEAM_ROLES, BARRIERS_LEGEND, TEAM_FOOTNOTE,
  type IEPSectionId,
} from "./constants";
import { getPlan, savePlan, setPlanStatus, type PlanSaveInput } from "./queries";
import type { PlanFull, PlanStatus, IepDetails, IepTeamMember, IepAssistiveDevice, IepBarrier } from "./types";
import { format, parseISO } from "date-fns";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";
import { cn } from "@/lib/utils";

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
  const [section, setSection]   = useState<IEPSectionId>("cover");
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

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

  // ── Reset / hydrate ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSection("cover");
    setError(null);
    setLegendOpen(false);

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

  // Prefetch LRN for selected student
  useEffect(() => {
    if (!open || !studentId || learnerLrn) return;
    let cancelled = false;
    (async () => {
      const { data: studentRow } = await supabase
        .from("students")
        .select("child_profile_id, date_of_birth")
        .eq("id", studentId)
        .maybeSingle();
      if (cancelled || !studentRow) return;

      const row = studentRow as { child_profile_id: string | null; date_of_birth: string | null };

      if (!learnerBirthDate && row.date_of_birth) setLearnerBirthDate(row.date_of_birth);

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
  }, [open, studentId, supabase]);

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
    setDiffSeeing(false); setDiffHearing(false); setDiffCommunicating(false);
    setDiffMoving(false); setDiffConcentrating(false); setDiffRemembering(false);
    setDiffOther(false); setDiffOtherDesc(""); setHasMedical(false); setMedicalDiagnosis("");
    setEvaluationResults(""); setPresentStrengths(""); setPresentNeeds(""); setDisabilityImpact("");
    setMeetingDate(""); setLastIepDate(""); setMeetingPurpose(""); setRevisionDate("");
    setIepReviewDate(""); setRecommendations(""); setAgreements("");
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
    setTeamMembers(d.team_members ?? []);
    setAssistiveDevices(d.assistive_devices ?? []);
    setBarriers(d.barriers ?? []);
    setPreparedBy(d.prepared_by ?? "");
    setPreparedDate(d.prepared_date ?? "");
    setCheckedReviewedBy(d.checked_reviewed_by ?? "");
    setCheckedReviewedDate(d.checked_reviewed_date ?? "");

    setGoals(full.goals.map((g) => ({
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
    })));
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
  async function performSave(targetStatus: PlanStatus) {
    if (!stableId) return;
    if (!title.trim()) { setError("Title is required."); setSection("cover"); return; }
    if (!studentId)    { setError("Pick a student.");    setSection("cover"); return; }

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
      setStatus(targetStatus);
      onSaved(stableId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  }

  async function performStatusChange(next: PlanStatus) {
    if (!stableId) return;
    setSaving(true); setError(null);
    try {
      await setPlanStatus(supabase, stableId, next, next === "approved" ? userId : null);
      setStatus(next);
      onSaved(stableId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change status.");
    } finally {
      setSaving(false);
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
    <div class="field" style="flex:2"><div class="label">Home Address</div><div class="value">${esc(homeAddress || "—")}</div></div>
    <div class="field"><div class="label">Parent Workplace</div><div class="value">${esc(parentWorkplace || "—")}</div></div>
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
      className="max-w-5xl max-h-[94vh]"
    >
      {/* Header strip */}
      <div className="-mx-6 -mt-6 px-6 pt-4 pb-4 border-b border-border bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <HeaderCell label="Student" value={studentName} />
          <HeaderCell label="Status"><PlanStatusBadge status={status} /></HeaderCell>
          <HeaderCell label="Created by" value={createdByName ?? "—"} />
          <HeaderCell
            label="Last updated"
            value={updatedAt ? format(parseISO(updatedAt), "MMM d, yyyy h:mma") : "—"}
          />
        </div>
        {/* Action row */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            type="button"
            onClick={() => performSave(status === "approved" || status === "archived" ? status : "draft")}
            disabled={saving || !canEdit}
            variant="outline"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={() => performSave("submitted")}
            disabled={saving || !canEdit}
          >
            <Send className="w-4 h-4 mr-2" />
            Submit For Review
          </Button>
          {isAdmin && (status === "submitted" || status === "in_review") && (
            <Button type="button" variant="outline" onClick={() => performStatusChange("approved")} disabled={saving}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
          )}
          {isAdmin && status !== "archived" && (
            <Button type="button" variant="outline" onClick={() => performStatusChange("archived")} disabled={saving}>
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={printIEP}
            className="ml-auto"
            disabled={!studentId}
            title="Open print view"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print IEP
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="-mx-6 px-6 border-b border-border flex gap-0.5">
        {IEP_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "px-2.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              section === s.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="pt-4"><ErrorAlert message={error} /></div>}
      {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading plan…</div>}

      {!loading && (
        <div className="py-4 space-y-4">

          {/* ── 1. Cover & Learner ─────────────────────────────────────── */}
          {section === "cover" && (
            <>
              <Field label="Plan Title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. IEP Plan — SY 2025-2026" disabled={!canEdit} />
              </Field>
              <Field label="Student" required>
                <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}
                  disabled={!canEdit || isEditing}>
                  <option value="">Select a student…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </Select>
              </Field>

              <div className="pt-1 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                School / DepEd Details
              </div>
              <div className="grid md:grid-cols-3 gap-3">
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

              <div className="pt-1 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Learner Information
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                LRN and birth date are prefilled from existing records when available. Adjust if needed.
              </p>
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

              <div className="pt-1 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Parent / Guardian Information
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Home Address">
                  <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
                <Field label="Parent / Guardian Workplace">
                  <Textarea value={parentWorkplace} onChange={(e) => setParentWorkplace(e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
              </div>
              <Field label="Parent / Guardian Notes" hint="What the parent shared in conversation.">
                <Textarea value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
            </>
          )}

          {/* ── 2. Assessment ──────────────────────────────────────────── */}
          {section === "assessment" && (
            <>
              <div className="pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Reported Difficulties
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {([
                  ["diff_seeing",        "Seeing",                         diffSeeing,        setDiffSeeing],
                  ["diff_hearing",       "Hearing",                        diffHearing,       setDiffHearing],
                  ["diff_communicating", "Communicating",                  diffCommunicating, setDiffCommunicating],
                  ["diff_moving",        "Moving / Walking",               diffMoving,        setDiffMoving],
                  ["diff_concentrating", "Concentrating / Paying Attention",diffConcentrating, setDiffConcentrating],
                  ["diff_remembering",   "Remembering / Understanding",    diffRemembering,   setDiffRemembering],
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
                  <Input value={diffOtherDesc} onChange={(e) => setDiffOtherDesc(e.target.value)} disabled={!canEdit} />
                </Field>
              )}

              <div className="pt-2">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={hasMedical} disabled={!canEdit}
                    onChange={(e) => setHasMedical(e.target.checked)} />
                  With Medical Assessment / Diagnosis
                </label>
              </div>
              {hasMedical && (
                <Field label="Diagnosis / Details">
                  <Textarea value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)} disabled={!canEdit} rows={2} />
                </Field>
              )}
              {/* Legacy diagnosis field */}
              <Field label="Diagnosis / Condition (brief summary)" hint="Used in Reports and older plan views.">
                <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>

              <div className="pt-2 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Present Levels of Academic Achievement / Functional Performance
              </div>
              <Field label="Results of Initial or Most Recent Evaluation">
                <Textarea value={evaluationResults} onChange={(e) => setEvaluationResults(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Academic / Functional Strengths">
                  <Textarea value={presentStrengths} onChange={(e) => setPresentStrengths(e.target.value)} disabled={!canEdit} rows={3} />
                </Field>
                <Field label="Academic / Functional Needs">
                  <Textarea value={presentNeeds} onChange={(e) => setPresentNeeds(e.target.value)} disabled={!canEdit} rows={3} />
                </Field>
              </div>
              <Field label="Parental Concerns Regarding the Child's Education">
                <Textarea value={parentConcerns} onChange={(e) => setParentConcerns(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Impact of Disability on Involvement in the General Education Curriculum">
                <Textarea value={disabilityImpact} onChange={(e) => setDisabilityImpact(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Background Notes (Internal)" hint="Additional context for staff; not printed by default.">
                <Textarea value={backgroundNotes} onChange={(e) => setBackgroundNotes(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
            </>
          )}

          {/* ── 3. Meeting & Team ──────────────────────────────────────── */}
          {section === "meeting" && (
            <>
              <div className="pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Meeting Information
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Date of Meeting">
                  <DatePicker value={meetingDate} onChange={setMeetingDate} disabled={!canEdit} />
                </Field>
                <Field label="Date of Last IEP">
                  <DatePicker value={lastIepDate} onChange={setLastIepDate} disabled={!canEdit} />
                </Field>
              </div>
              <Field label="Purpose of Meeting">
                <Select value={meetingPurpose} onChange={(e) => setMeetingPurpose(e.target.value)} disabled={!canEdit}>
                  <option value="">— Select —</option>
                  {MEETING_PURPOSE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
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
              <Field label="Recommendations">
                <Textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              <Field label="Agreements">
                <Textarea value={agreements} onChange={(e) => setAgreements(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>

              <div className="pt-2 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                IEP Team Members
              </div>
              <p className="text-xs text-muted-foreground -mt-2">{TEAM_FOOTNOTE}</p>
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
                      <Input
                        list={`team-roles-${m.id}`}
                        value={m.role}
                        onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, role: e.target.value } : x))}
                        disabled={!canEdit}
                      />
                      <datalist id={`team-roles-${m.id}`}>
                        {DEFAULT_TEAM_ROLES.map((r) => <option key={r} value={r} />)}
                      </datalist>
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
            </>
          )}

          {/* ── 4. Supports ───────────────────────────────────────────── */}
          {section === "supports" && (
            <>
              <SectionHeader
                title="Assistive Technology / Devices"
                hint="List the difficulty and the assistive technology or device needed."
                onAdd={canEdit ? addDevice : undefined}
                addLabel="Add device row"
              />
              {assistiveDevices.length === 0 && <EmptyHint>No assistive devices listed.</EmptyHint>}
              {assistiveDevices.map((d, idx) => (
                <BlockCard key={d.id} index={idx}
                  onRemove={canEdit ? () => setAssistiveDevices((p) => p.filter((x) => x.id !== d.id)) : undefined}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Difficulty">
                      <Input value={d.difficulty}
                        onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, difficulty: e.target.value } : x))}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Assistive Technology / Device">
                      <Input value={d.device}
                        onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, device: e.target.value } : x))}
                        disabled={!canEdit} />
                    </Field>
                  </div>
                </BlockCard>
              ))}

              <div className="pt-3">
                <SectionHeader
                  title="Difficulties, Barriers, and Enabling Supports"
                  hint="One row per identified difficulty."
                  onAdd={canEdit ? addBarrier : undefined}
                  addLabel="Add row"
                />
                {/* Collapsible legend */}
                <button
                  type="button"
                  onClick={() => setLegendOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  {legendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Teacher guide / legend
                </button>
                {legendOpen && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                    <strong className="text-foreground">Barriers (LB):</strong>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LB")).map((l) => (
                        <li key={l.code}><strong>{l.code}</strong> — {l.label}</li>
                      ))}
                    </ul>
                    <strong className="text-foreground">Facilitators (LF):</strong>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LF")).map((l) => (
                        <li key={l.code}><strong>{l.code}</strong> — {l.label}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {barriers.length === 0 && <EmptyHint>No barriers listed.</EmptyHint>}
              {barriers.map((b, idx) => (
                <BlockCard key={b.id} index={idx}
                  onRemove={canEdit ? () => setBarriers((p) => p.filter((x) => x.id !== b.id)) : undefined}>
                  <Field label="Difficulty">
                    <Input value={b.difficulty}
                      onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, difficulty: e.target.value } : x))}
                      disabled={!canEdit} />
                  </Field>
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field label="Learning Barriers">
                      <Textarea rows={2} value={b.learning_barriers}
                        onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_barriers: e.target.value } : x))}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Learning Facilitators">
                      <Textarea rows={2} value={b.learning_facilitators}
                        onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_facilitators: e.target.value } : x))}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Accommodations">
                      <Textarea rows={2} value={b.accommodations}
                        onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, accommodations: e.target.value } : x))}
                        disabled={!canEdit} />
                    </Field>
                  </div>
                </BlockCard>
              ))}
            </>
          )}

          {/* ── 5. Goals ──────────────────────────────────────────────── */}
          {section === "goals" && (
            <>
              <SectionHeader
                title="Annual Goals / Long-Term Goals"
                hint="One block per annual goal. Use specific, observable language."
                onAdd={canEdit ? addGoal : undefined}
                addLabel="Add goal"
              />
              {goals.length === 0 && <EmptyHint>No goals yet. Click "Add goal" to start.</EmptyHint>}
              {goals.map((g, idx) => (
                <BlockCard key={g.id} index={idx}
                  onRemove={canEdit ? () => setGoals((p) => p.filter((x) => x.id !== g.id)) : undefined}>
                  <Field label="Annual Goal / Long-Term Goal" required>
                    <Textarea rows={2} value={g.description}
                      onChange={(e) => updateGoal(setGoals, g.id, { description: e.target.value })}
                      disabled={!canEdit} />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Domain / Area">
                      <Input list={`goal-domains-${g.id}`} value={g.domain ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { domain: e.target.value })}
                        disabled={!canEdit} />
                      <datalist id={`goal-domains-${g.id}`}>
                        {GOAL_DOMAIN_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
                      </datalist>
                    </Field>
                    <Field label="Target Date">
                      <DatePicker value={g.target_date ?? ""}
                        onChange={(v) => updateGoal(setGoals, g.id, { target_date: v || null })}
                        disabled={!canEdit} />
                    </Field>
                  </div>
                  <Field label="En Route / Short-Term Objectives">
                    <Textarea rows={3} value={g.enroute_objectives ?? ""}
                      onChange={(e) => updateGoal(setGoals, g.id, { enroute_objectives: e.target.value || null })}
                      disabled={!canEdit}
                      placeholder="List the stepping-stone objectives toward the annual goal…" />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Timeline / Minutes / Session">
                      <Input value={g.timeline ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { timeline: e.target.value || null })}
                        disabled={!canEdit} placeholder="e.g. 3x/week, 30 mins" />
                    </Field>
                    <Field label="Individual/s Responsible">
                      <Input value={g.responsible_person ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { responsible_person: e.target.value || null })}
                        disabled={!canEdit} placeholder="e.g. SPED Teacher, OT" />
                    </Field>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Baseline">
                      <Input value={g.baseline ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { baseline: e.target.value || null })}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Measurement Method">
                      <Input value={g.measurement_method ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { measurement_method: e.target.value || null })}
                        disabled={!canEdit} />
                    </Field>
                  </div>
                  <Field label="Success Criteria">
                    <Textarea rows={2} value={g.success_criteria ?? ""}
                      onChange={(e) => updateGoal(setGoals, g.id, { success_criteria: e.target.value || null })}
                      disabled={!canEdit} />
                  </Field>
                  <Field label="Progress / Instructional Evaluation / Remarks">
                    <Textarea rows={2} value={g.remarks ?? ""}
                      onChange={(e) => updateGoal(setGoals, g.id, { remarks: e.target.value || null })}
                      disabled={!canEdit} />
                  </Field>
                </BlockCard>
              ))}
            </>
          )}

          {/* ── 6. Interventions ──────────────────────────────────────── */}
          {section === "interventions" && (
            <>
              <SectionHeader
                title="Interventions / Activities"
                hint="Strategies, who carries them out, where, and how often. Link each to a goal."
                onAdd={canEdit ? () => addIntervention() : undefined}
                addLabel="Add intervention"
              />
              {interventions.length === 0 && <EmptyHint>No interventions yet.</EmptyHint>}
              {interventions.map((iv, idx) => (
                <BlockCard key={iv.id} index={idx}
                  onRemove={canEdit ? () => setInterventions((p) => p.filter((x) => x.id !== iv.id)) : undefined}>
                  <Field label="Linked Annual Goal" hint="Optionally link this intervention to a specific goal.">
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
                  <Field label="Intervention / Activity / Procedure" required>
                    <Textarea rows={2} value={iv.strategy}
                      onChange={(e) => updateIntervention(setInterventions, iv.id, { strategy: e.target.value })}
                      disabled={!canEdit} />
                  </Field>
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field label="Frequency / Timeline / Session">
                      <Input value={iv.frequency ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { frequency: e.target.value })}
                        disabled={!canEdit} placeholder="Daily, 3x weekly, 30 min…" />
                    </Field>
                    <Field label="Individual/s Responsible">
                      <Input value={iv.responsible_person ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { responsible_person: e.target.value })}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Environment">
                      <Input value={iv.environment ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { environment: e.target.value })}
                        disabled={!canEdit} placeholder="Classroom, home, pull-out…" />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <Textarea rows={2} value={iv.notes ?? ""}
                      onChange={(e) => updateIntervention(setInterventions, iv.id, { notes: e.target.value })}
                      disabled={!canEdit} />
                  </Field>
                </BlockCard>
              ))}
            </>
          )}

          {/* ── 7. Progress ───────────────────────────────────────────── */}
          {section === "progress" && (
            <>
              <SectionHeader
                title="Progress Tracking"
                hint="Add a new entry whenever you observe progress on a goal."
                onAdd={canEdit ? addProgress : undefined}
                addLabel="Add progress entry"
              />
              {progress.length === 0 && <EmptyHint>No progress entries yet.</EmptyHint>}
              {progress.map((pr, idx) => (
                <BlockCard key={pr.id} index={idx}
                  onRemove={canEdit ? () => setProgress((p) => p.filter((x) => x.id !== pr.id)) : undefined}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Date">
                      <DatePicker value={pr.entry_date}
                        onChange={(v) => updateProgress(setProgress, pr.id, { entry_date: v || format(new Date(), "yyyy-MM-dd") })}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Linked Goal">
                      <Select value={pr.linked_goal_id ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { linked_goal_id: e.target.value || null })}
                        disabled={!canEdit}>
                        <option value="">— No specific goal —</option>
                        {goals.map((g, i) => (
                          <option key={g.id} value={g.id}>
                            Goal {i + 1}: {(g.description || "(empty)").slice(0, 60)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Progress / Instructional Evaluation" required>
                    <Textarea rows={2} value={pr.progress_note}
                      onChange={(e) => updateProgress(setProgress, pr.id, { progress_note: e.target.value })}
                      disabled={!canEdit} />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Observed By">
                      <Input value={pr.observed_by ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { observed_by: e.target.value })}
                        disabled={!canEdit} />
                    </Field>
                    <Field label="Next Step">
                      <Input value={pr.next_step ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { next_step: e.target.value })}
                        disabled={!canEdit} />
                    </Field>
                  </div>
                </BlockCard>
              ))}
            </>
          )}

          {/* ── 8. Review ─────────────────────────────────────────────── */}
          {section === "review" && (
            <>
              <div className="pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Prepared / Reviewed
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Prepared By (name / signature line)">
                  <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} disabled={!canEdit} placeholder="Name for print signature" />
                </Field>
                <Field label="Prepared Date">
                  <DatePicker value={preparedDate} onChange={setPreparedDate} disabled={!canEdit} />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Checked and Reviewed By">
                  <Input value={checkedReviewedBy} onChange={(e) => setCheckedReviewedBy(e.target.value)} disabled={!canEdit} placeholder="Name for print signature" />
                </Field>
                <Field label="Checked / Reviewed Date">
                  <DatePicker value={checkedReviewedDate} onChange={setCheckedReviewedDate} disabled={!canEdit} />
                </Field>
              </div>

              <div className="pt-2 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                System-Linked Reviewers
              </div>
              <Field label="Review Date (system)">
                <DatePicker value={reviewDate} onChange={setReviewDate} disabled={!canEdit} />
              </Field>
              <Field label="Reviewed By Teacher">
                <StaffPicker schoolId={schoolId} role="teacher"
                  value={reviewedByTeacherId} onChange={setReviewedByTeacherId} disabled={!canEdit} />
              </Field>
              <Field label="Reviewed By School Admin">
                <StaffPicker schoolId={schoolId} role="school_admin"
                  value={reviewedByAdminId} onChange={setReviewedByAdminId} disabled={!canEdit} />
              </Field>
              <Field label="Home Support Notes">
                <Textarea value={homeSupportNotes} onChange={(e) => setHomeSupportNotes(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Parent Acknowledgement">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={parentAcknowledged}
                    onChange={(e) => setParentAcknowledged(e.target.checked)} disabled={!canEdit} />
                  Parent has reviewed and acknowledged this plan
                </label>
              </Field>

              <div className="border border-border rounded-lg p-3 text-xs text-muted-foreground bg-muted/20">
                <strong className="text-foreground">Status workflow:</strong>{" "}
                Draft → Submitted → In Review → Approved (admin) → Archived (admin).
                Use <em>Save Draft</em> to keep editing, or <em>Submit For Review</em> when
                you&apos;re ready for an admin to approve.
              </div>
            </>
          )}

          {/* ── 9. Attachments ────────────────────────────────────────── */}
          {section === "attachments" && (
            <>
              <SectionHeader
                title="Attachments"
                hint="Reference uploaded documents about this student (PDFs in the Documents area)."
              />
              {!studentId && <EmptyHint>Pick a student first to see their uploaded documents.</EmptyHint>}
              {studentId && studentDocs.length === 0 && (
                <EmptyHint>This student has no uploaded documents yet. Upload them in the Documents tab first.</EmptyHint>
              )}
              {studentDocs.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {studentDocs.map((d) => {
                    const checked = attachmentIds.includes(d.id);
                    return (
                      <label key={d.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={checked} disabled={!canEdit}
                          onChange={(e) => {
                            if (e.target.checked) setAttachmentIds((p) => [...p, d.id]);
                            else                  setAttachmentIds((p) => p.filter((id) => id !== d.id));
                          }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.title}</div>
                          <div className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.document_type]}</div>
                        </div>
                        {checked && <Paperclip className="w-3.5 h-3.5 text-primary mt-1" />}
                      </label>
                    );
                  })}
                </div>
              )}
              {attachmentIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{attachmentIds.length}</span>
                  <span>attached</span>
                  {canEdit && (
                    <button type="button" onClick={() => setAttachmentIds([])}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-border -mx-6 px-6">
        <ModalCancelButton label="Close" />
      </div>
    </Modal>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────

function HeaderCell({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground mt-0.5">{children ?? value ?? "—"}</div>
    </div>
  );
}

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
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/10">
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
