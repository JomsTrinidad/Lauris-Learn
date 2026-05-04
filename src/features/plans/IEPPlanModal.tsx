"use client";

/**
 * IEP Plan modal — create + edit a structured IEP Plan.
 *
 * - Section navigation is a horizontal tab strip (no long scrolling form).
 * - Sub-row collections (goals, interventions, progress) use stable
 *   client-supplied UUIDs so the diff-save in queries.savePlan() works.
 * - Attachments reference existing child_documents rows for this student.
 * - Save Draft and Submit For Review both call savePlan() with a status.
 *   Approve / Archive transitions are admin-only and gated by RLS.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  Send,
  Loader2,
  CheckCircle2,
  Archive,
  FileDown,
  Paperclip,
  X,
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
  IEP_SECTIONS,
  PLAN_STATUS_LABELS,
  GOAL_DOMAIN_SUGGESTIONS,
  type IEPSectionId,
} from "./constants";
import { getPlan, savePlan, setPlanStatus, type PlanSaveInput } from "./queries";
import type { PlanFull, PlanStatus } from "./types";
import { format, parseISO } from "date-fns";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";
import { cn } from "@/lib/utils";

interface StudentOption {
  id: string;
  full_name: string;
}

interface DocOption {
  id: string;
  title: string;
  document_type: keyof typeof DOCUMENT_TYPE_LABELS;
}

export interface IEPPlanModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save (or status transition) so the parent reloads. */
  onSaved: (planId: string) => void;
  /** Plan id being edited. NULL means we're creating a new plan. */
  planId: string | null;
  schoolId: string;
  schoolYearId: string | null;
  userId: string;
  userRole: "school_admin" | "teacher" | "parent" | "super_admin" | null;
  /** Pre-selected student id when navigating from a student row. */
  defaultStudentId?: string | null;
}

type GoalRow = PlanSaveInput["goals"][number];
type InterventionRow = PlanSaveInput["interventions"][number];
type ProgressRow = PlanSaveInput["progress"][number];

export function IEPPlanModal({
  open,
  onClose,
  onSaved,
  planId,
  schoolId,
  schoolYearId,
  userId,
  userRole,
  defaultStudentId = null,
}: IEPPlanModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin   = userRole === "school_admin";
  const isStaff   = userRole === "school_admin" || userRole === "teacher";
  const isEditing = planId !== null;

  // ── State ───────────────────────────────────────────────────────────
  const [section, setSection] = useState<IEPSectionId>("profile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Header / head fields
  const [title, setTitle]               = useState("");
  const [studentId, setStudentId]       = useState(defaultStudentId ?? "");
  const [status, setStatus]             = useState<PlanStatus>("draft");
  const [createdAt, setCreatedAt]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]       = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);

  // Profile
  const [diagnosis, setDiagnosis]             = useState("");
  const [strengths, setStrengths]             = useState("");
  const [areasOfNeed, setAreasOfNeed]         = useState("");
  const [backgroundNotes, setBackgroundNotes] = useState("");

  // Parent input
  const [parentNotes, setParentNotes]           = useState("");
  const [parentConcerns, setParentConcerns]     = useState("");
  const [homeSupportNotes, setHomeSupportNotes] = useState("");

  // Review
  const [reviewDate, setReviewDate]                 = useState("");
  const [reviewedByTeacherId, setReviewedByTeacherId] = useState<string>("");
  const [reviewedByAdminId, setReviewedByAdminId]   = useState<string>("");
  const [parentAcknowledged, setParentAcknowledged] = useState(false);

  // Sub-row collections
  const [goals, setGoals]                 = useState<GoalRow[]>([]);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [progress, setProgress]           = useState<ProgressRow[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  // Lookup data
  const [students, setStudents]                 = useState<StudentOption[]>([]);
  const [studentDocs, setStudentDocs]           = useState<DocOption[]>([]);
  const [stableId, setStableId]                 = useState<string | null>(null);

  // ── Reset / hydrate when the modal opens ────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSection("profile");
    setError(null);

    let cancelled = false;
    (async () => {
      // Always load students for the picker.
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
        // Edit — hydrate from server.
        setLoading(true);
        try {
          const full = await getPlan(supabase, planId);
          if (cancelled) return;
          if (!full) {
            setError("Plan not found or you don't have access.");
            setLoading(false);
            return;
          }
          hydrateFromServer(full);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load plan.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        // New — fresh defaults + a stable id.
        const newId = crypto.randomUUID();
        setStableId(newId);
        setTitle("");
        setStudentId(defaultStudentId ?? "");
        setStatus("draft");
        setCreatedAt(null);
        setUpdatedAt(null);
        setCreatedByName(null);
        setDiagnosis(""); setStrengths(""); setAreasOfNeed(""); setBackgroundNotes("");
        setParentNotes(""); setParentConcerns(""); setHomeSupportNotes("");
        setReviewDate(""); setReviewedByTeacherId(""); setReviewedByAdminId("");
        setParentAcknowledged(false);
        setGoals([]); setInterventions([]); setProgress([]); setAttachmentIds([]);
        setStudentDocs([]);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId, schoolId]);

  // ── Load attachable docs whenever the student changes ───────────────
  useEffect(() => {
    if (!open || !studentId) {
      setStudentDocs([]);
      return;
    }
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

  function hydrateFromServer(full: PlanFull) {
    const p = full.plan;
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
    setGoals(full.goals.map((g) => ({
      id: g.id,
      domain: g.domain,
      description: g.description,
      target_date: g.target_date,
      measurement_method: g.measurement_method,
      baseline: g.baseline,
      success_criteria: g.success_criteria,
      sort_order: g.sort_order,
    })));
    setInterventions(full.interventions.map((i) => ({
      id: i.id,
      strategy: i.strategy,
      frequency: i.frequency,
      responsible_person: i.responsible_person,
      environment: i.environment,
      notes: i.notes,
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

  // ── Save handlers ───────────────────────────────────────────────────

  async function performSave(targetStatus: PlanStatus) {
    if (!stableId) return;
    if (!title.trim()) { setError("Title is required."); setSection("profile"); return; }
    if (!studentId)    { setError("Pick a student.");    setSection("profile"); return; }

    setSaving(true);
    setError(null);
    try {
      await savePlan(supabase, {
        id:            stableId,
        schoolId,
        studentId,
        schoolYearId,
        planType:      "iep",
        title:         title.trim(),
        status:        targetStatus,
        diagnosis:        nullIfEmpty(diagnosis),
        strengths:        nullIfEmpty(strengths),
        areasOfNeed:      nullIfEmpty(areasOfNeed),
        backgroundNotes:  nullIfEmpty(backgroundNotes),
        parentNotes:      nullIfEmpty(parentNotes),
        parentConcerns:   nullIfEmpty(parentConcerns),
        homeSupportNotes: nullIfEmpty(homeSupportNotes),
        reviewDate:           nullIfEmpty(reviewDate),
        reviewedByTeacherId:  nullIfEmpty(reviewedByTeacherId),
        reviewedByAdminId:    nullIfEmpty(reviewedByAdminId),
        parentAcknowledged,
        goals:         goals.map((g, i) => ({ ...g, sort_order: i })),
        interventions: interventions.map((iv, i) => ({ ...iv, sort_order: i })),
        progress,
        attachmentDocumentIds: attachmentIds,
        currentUserId: userId,
        isNew:         !isEditing,
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
    setSaving(true);
    setError(null);
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

  // ── Add / remove sub-rows ───────────────────────────────────────────

  function addGoal() {
    setGoals((prev) => [...prev, {
      id: crypto.randomUUID(),
      domain: null, description: "",
      target_date: null, measurement_method: null,
      baseline: null, success_criteria: null,
      sort_order: prev.length,
    }]);
  }
  function addIntervention() {
    setInterventions((prev) => [...prev, {
      id: crypto.randomUUID(),
      strategy: "", frequency: null, responsible_person: null,
      environment: null, notes: null, sort_order: prev.length,
    }]);
  }
  function addProgress() {
    setProgress((prev) => [...prev, {
      id: crypto.randomUUID(),
      linked_goal_id: null,
      entry_date: format(new Date(), "yyyy-MM-dd"),
      progress_note: "", observed_by: null, next_step: null,
    }]);
  }

  // ── Render ─────────────────────────────────────────────────────────

  const studentName = students.find((s) => s.id === studentId)?.full_name ?? "—";
  const canEdit     = isStaff && status !== "approved" && status !== "archived";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `IEP Plan — ${title || studentName}` : "New IEP Plan"}
      className="max-w-4xl"
    >
      {/* Header strip */}
      <div className="-mx-6 -mt-6 px-6 pt-4 pb-4 border-b border-border bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <HeaderCell label="Student" value={studentName} />
          <HeaderCell label="Status">
            <PlanStatusBadge status={status} />
          </HeaderCell>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => performStatusChange("approved")}
              disabled={saving}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
          )}
          {isAdmin && status !== "archived" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => performStatusChange("archived")}
              disabled={saving}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled
            title="Coming soon"
            className="ml-auto"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="-mx-6 px-6 border-b border-border flex gap-1 overflow-x-auto">
        {IEP_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
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
          {/* Always-on header fields (also editable in Profile) */}
          {section === "profile" && (
            <>
              <Field label="Plan Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. IEP Plan — SY 2025-2026"
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Student">
                <Select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  disabled={!canEdit || isEditing}
                >
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Diagnosis / Condition" hint="Optional. Brief, plain-English description.">
                <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Strengths">
                <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Areas Of Need">
                <Textarea value={areasOfNeed} onChange={(e) => setAreasOfNeed(e.target.value)} disabled={!canEdit} rows={2} />
              </Field>
              <Field label="Background Notes">
                <Textarea value={backgroundNotes} onChange={(e) => setBackgroundNotes(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
            </>
          )}

          {section === "goals" && (
            <>
              <SectionHeader
                title="Goals"
                hint="One block per goal. Use specific, observable language."
                onAdd={canEdit ? addGoal : undefined}
                addLabel="Add goal"
              />
              {goals.length === 0 && <EmptyHint>No goals yet.</EmptyHint>}
              {goals.map((g, idx) => (
                <BlockCard key={g.id} index={idx} onRemove={canEdit ? () => setGoals((p) => p.filter((x) => x.id !== g.id)) : undefined}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Domain">
                      <Input
                        list={`goal-domains-${g.id}`}
                        value={g.domain ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { domain: e.target.value })}
                        disabled={!canEdit}
                      />
                      <datalist id={`goal-domains-${g.id}`}>
                        {GOAL_DOMAIN_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
                      </datalist>
                    </Field>
                    <Field label="Target Date">
                      <DatePicker
                        value={g.target_date ?? ""}
                        onChange={(v) => updateGoal(setGoals, g.id, { target_date: v || null })}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                  <Field label="Goal Description" required>
                    <Textarea
                      value={g.description}
                      onChange={(e) => updateGoal(setGoals, g.id, { description: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                    />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Measurement Method">
                      <Input
                        value={g.measurement_method ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { measurement_method: e.target.value })}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Baseline">
                      <Input
                        value={g.baseline ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { baseline: e.target.value })}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                  <Field label="Success Criteria">
                    <Textarea
                      value={g.success_criteria ?? ""}
                      onChange={(e) => updateGoal(setGoals, g.id, { success_criteria: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                    />
                  </Field>
                </BlockCard>
              ))}
            </>
          )}

          {section === "interventions" && (
            <>
              <SectionHeader
                title="Interventions & Accommodations"
                hint="Strategies, who does them, where, and how often."
                onAdd={canEdit ? addIntervention : undefined}
                addLabel="Add intervention"
              />
              {interventions.length === 0 && <EmptyHint>No entries yet.</EmptyHint>}
              {interventions.map((iv, idx) => (
                <BlockCard key={iv.id} index={idx} onRemove={canEdit ? () => setInterventions((p) => p.filter((x) => x.id !== iv.id)) : undefined}>
                  <Field label="Strategy / Intervention" required>
                    <Textarea
                      value={iv.strategy}
                      onChange={(e) => updateIntervention(setInterventions, iv.id, { strategy: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                    />
                  </Field>
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field label="Frequency">
                      <Input
                        value={iv.frequency ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { frequency: e.target.value })}
                        disabled={!canEdit}
                        placeholder="Daily, 3x weekly…"
                      />
                    </Field>
                    <Field label="Responsible Person">
                      <Input
                        value={iv.responsible_person ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { responsible_person: e.target.value })}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Environment">
                      <Input
                        value={iv.environment ?? ""}
                        onChange={(e) => updateIntervention(setInterventions, iv.id, { environment: e.target.value })}
                        disabled={!canEdit}
                        placeholder="Classroom, home, therapy room…"
                      />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <Textarea
                      value={iv.notes ?? ""}
                      onChange={(e) => updateIntervention(setInterventions, iv.id, { notes: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                    />
                  </Field>
                </BlockCard>
              ))}
            </>
          )}

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
                <BlockCard key={pr.id} index={idx} onRemove={canEdit ? () => setProgress((p) => p.filter((x) => x.id !== pr.id)) : undefined}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Date">
                      <DatePicker
                        value={pr.entry_date}
                        onChange={(v) => updateProgress(setProgress, pr.id, { entry_date: v || format(new Date(), "yyyy-MM-dd") })}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Linked Goal">
                      <Select
                        value={pr.linked_goal_id ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { linked_goal_id: e.target.value || null })}
                        disabled={!canEdit}
                      >
                        <option value="">— No specific goal —</option>
                        {goals.map((g, i) => (
                          <option key={g.id} value={g.id}>
                            Goal {i + 1}: {(g.description || "(empty)").slice(0, 60)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Progress Note" required>
                    <Textarea
                      value={pr.progress_note}
                      onChange={(e) => updateProgress(setProgress, pr.id, { progress_note: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                    />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Observed By">
                      <Input
                        value={pr.observed_by ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { observed_by: e.target.value })}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Next Step">
                      <Input
                        value={pr.next_step ?? ""}
                        onChange={(e) => updateProgress(setProgress, pr.id, { next_step: e.target.value })}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                </BlockCard>
              ))}
            </>
          )}

          {section === "parent" && (
            <>
              <Field label="Parent Notes" hint="What the parent shared in conversation.">
                <Textarea value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              <Field label="Parent Concerns">
                <Textarea value={parentConcerns} onChange={(e) => setParentConcerns(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
              <Field label="Home Support Notes">
                <Textarea value={homeSupportNotes} onChange={(e) => setHomeSupportNotes(e.target.value)} disabled={!canEdit} rows={3} />
              </Field>
            </>
          )}

          {section === "review" && (
            <>
              <Field label="Review Date">
                <DatePicker value={reviewDate} onChange={setReviewDate} disabled={!canEdit} />
              </Field>
              <Field label="Reviewed By Teacher" hint="Pick the teacher who reviewed this plan.">
                <StaffPicker
                  schoolId={schoolId}
                  role="teacher"
                  value={reviewedByTeacherId}
                  onChange={setReviewedByTeacherId}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Reviewed By School Admin">
                <StaffPicker
                  schoolId={schoolId}
                  role="school_admin"
                  value={reviewedByAdminId}
                  onChange={setReviewedByAdminId}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Parent Acknowledgement">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={parentAcknowledged}
                    onChange={(e) => setParentAcknowledged(e.target.checked)}
                    disabled={!canEdit}
                  />
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
                      <label
                        key={d.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={!canEdit}
                          onChange={(e) => {
                            if (e.target.checked) setAttachmentIds((p) => [...p, d.id]);
                            else                  setAttachmentIds((p) => p.filter((id) => id !== d.id));
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {DOCUMENT_TYPE_LABELS[d.document_type]}
                          </div>
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
                    <button
                      type="button"
                      onClick={() => setAttachmentIds([])}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
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

// ── Small presentational helpers ──────────────────────────────────────

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
    draft:     "draft",
    submitted: "scheduled",
    in_review: "waitlisted",
    approved:  "active",
    archived:  "archived",
  };
  return <Badge variant={variant[status]}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeader({
  title, hint, onAdd, addLabel,
}: { title: string; hint?: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {onAdd && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          {addLabel ?? "Add"}
        </Button>
      )}
    </div>
  );
}

function BlockCard({
  index, onRemove, children,
}: { index: number; onRemove?: () => void; children: React.ReactNode }) {
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

// Generic helpers for sub-row updates
function updateGoal(
  setter: React.Dispatch<React.SetStateAction<GoalRow[]>>,
  id: string,
  patch: Partial<GoalRow>,
) {
  setter((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}
function updateIntervention(
  setter: React.Dispatch<React.SetStateAction<InterventionRow[]>>,
  id: string,
  patch: Partial<InterventionRow>,
) {
  setter((prev) => prev.map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)));
}
function updateProgress(
  setter: React.Dispatch<React.SetStateAction<ProgressRow[]>>,
  id: string,
  patch: Partial<ProgressRow>,
) {
  setter((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

function nullIfEmpty(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

// ── StaffPicker — small inline picker; reuses list_school_staff_for_sharing ──
//
// We can't read profiles directly (RLS only exposes the caller's row), so we
// reuse the SECURITY DEFINER RPC the documents share modal already uses.
function StaffPicker({
  schoolId, role, value, onChange, disabled,
}: {
  schoolId: string;
  role: "teacher" | "school_admin";
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
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
      {opts.map((o) => (
        <option key={o.id} value={o.id}>{o.full_name}</option>
      ))}
    </Select>
  );
}
