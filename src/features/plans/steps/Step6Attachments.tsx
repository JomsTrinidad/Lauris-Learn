"use client";

import type { Dispatch, SetStateAction } from "react";
import { Paperclip, Sparkles, X } from "lucide-react";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";
import type { IepWorkflowMode, PlanStatus } from "../types";
import type { GoalRow, DocOption } from "./shared";
import type { IepTeamMember } from "../types";

export interface Step6Props {
  studentId: string;
  studentDocs: DocOption[];
  attachmentIds: string[];
  setAttachmentIds: Dispatch<SetStateAction<string[]>>;
  isStaff: boolean;
  isEditing: boolean;
  saving: boolean;
  handleAssistantClick: () => void;
  canEdit: boolean;
  // Submission guidance
  isSimpleReview: boolean;
  status: PlanStatus;
  meetingDate: string;
  iepReviewDate: string;
  goals: GoalRow[];
  teamMembers: IepTeamMember[];
}

const DOC_GROUPS: { label: string; types: string[] }[] = [
  { label: "Progress Reports",   types: ["iep", "therapy_progress"] },
  { label: "Assessments",         types: ["therapy_evaluation", "dev_pediatrician_report", "school_accommodation"] },
  { label: "Medical Documents",   types: ["medical_certificate"] },
  { label: "Parent Documents",    types: ["parent_provided"] },
  { label: "Supporting Evidence", types: ["other_supporting"] },
];

export function Step6Attachments({
  studentId, studentDocs, attachmentIds, setAttachmentIds,
  isStaff, isEditing, saving, handleAssistantClick, canEdit,
  isSimpleReview, status, meetingDate, iepReviewDate, goals, teamMembers,
}: Step6Props) {
  const grouped = DOC_GROUPS
    .map((g) => ({ ...g, docs: studentDocs.filter((d) => g.types.includes(d.document_type)) }))
    .filter((g) => g.docs.length > 0);
  const ungrouped = studentDocs.filter(
    (d) => !DOC_GROUPS.flatMap((g) => g.types).includes(d.document_type),
  );
  if (ungrouped.length > 0) grouped.push({ label: "Other", types: [], docs: ungrouped });

  return (
    <div className="space-y-5">

      {/* ── Main frame ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Supporting Documents</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Link progress reports, assessments, therapy summaries, and supporting evidence that inform this IEP. Documents are managed in the Documents area.</p>
        </div>

        {!studentId && (
          <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center">
            <p className="text-sm text-muted-foreground">Select a learner on the first step to see their available documents.</p>
          </div>
        )}

        {studentId && studentDocs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No documents uploaded yet</p>
            <p className="text-xs text-muted-foreground">Go to the <strong>Documents</strong> section to upload reports, assessments, and other supporting materials for this learner, then come back to link them here.</p>
          </div>
        )}

        {studentDocs.length > 0 && (
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
                            <div className="text-xs text-muted-foreground">
                              {(DOCUMENT_TYPE_LABELS as Record<string, string>)[d.document_type] ?? d.document_type}
                            </div>
                          </div>
                        </label>
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
        )}

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

      {/* ── Submission guidance ── */}
      {isStaff && canEdit && status === "draft" && (
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-2">
          {isSimpleReview ? (
            <>
              <p className="text-sm font-medium text-foreground">Ready to finalize?</p>
              <p className="text-xs text-muted-foreground">When the plan is complete, use the <strong>Finalize IEP</strong> button below to lock it. A finalized plan cannot be edited.</p>
              {(!meetingDate || !iepReviewDate || goals.length === 0 || teamMembers.length === 0) && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Before finalizing, consider completing:</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                    {!meetingDate       && <li>Meeting date (Step 1)</li>}
                    {!iepReviewDate     && <li>IEP review date (Step 1)</li>}
                    {goals.length === 0 && <li>At least one annual goal (Step 4)</li>}
                    {teamMembers.length === 0 && <li>IEP team members (Step 1)</li>}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Ready to submit?</p>
              <p className="text-xs text-muted-foreground">When the plan is complete, use the <strong>Submit For Review</strong> button below to send it to an admin for approval. You can continue editing until it&apos;s approved.</p>
            </>
          )}
        </div>
      )}

    </div>
  );
}
