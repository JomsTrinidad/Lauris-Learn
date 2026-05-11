"use client";

import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import type { PlanStatus } from "../types";
import { Field, BlockCard, StaffPicker, updateProgress, type GoalRow, type ProgressRow } from "./shared";

export interface Step5Props {
  // Progress entries
  progress: ProgressRow[];
  setProgress: Dispatch<SetStateAction<ProgressRow[]>>;
  addProgress: () => void;
  goals: GoalRow[];
  // Review & Approval
  showReviewDetails: boolean;
  setShowReviewDetails: (v: boolean) => void;
  preparedBy: string; setPreparedBy: (v: string) => void;
  preparedDate: string; setPreparedDate: (v: string) => void;
  checkedReviewedBy: string; setCheckedReviewedBy: (v: string) => void;
  checkedReviewedDate: string; setCheckedReviewedDate: (v: string) => void;
  reviewDate: string; setReviewDate: (v: string) => void;
  reviewedByTeacherId: string; setReviewedByTeacherId: (v: string) => void;
  reviewedByAdminId: string; setReviewedByAdminId: (v: string) => void;
  // Status display
  status: PlanStatus;
  schoolId: string;
  canEdit: boolean;
}

export function Step5ProgressReview({
  progress, setProgress, addProgress, goals,
  showReviewDetails, setShowReviewDetails,
  preparedBy, setPreparedBy, preparedDate, setPreparedDate,
  checkedReviewedBy, setCheckedReviewedBy, checkedReviewedDate, setCheckedReviewedDate,
  reviewDate, setReviewDate, reviewedByTeacherId, setReviewedByTeacherId,
  reviewedByAdminId, setReviewedByAdminId,
  status, schoolId, canEdit,
}: Step5Props) {
  return (
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
            <p className="text-xs font-medium text-foreground">No observations recorded yet</p>
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="shrink-0">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Date of observation</label>
                <DatePicker value={pr.entry_date}
                  onChange={(v) => updateProgress(setProgress, pr.id, { entry_date: v || pr.entry_date })}
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
          onClick={() => setShowReviewDetails(!showReviewDetails)}
          className="flex w-full items-center justify-between gap-2 text-left">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Review &amp; Approval Details</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Signature lines, approval workflow, and review tracking.</p>
          </div>
          {showReviewDetails
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>

        {showReviewDetails && (
          <div className="space-y-4 pt-1">
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

          </div>
        )}
      </div>

    </div>
  );
}
