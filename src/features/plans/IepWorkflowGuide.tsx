"use client";

/**
 * IepWorkflowGuide — inline workflow reference panel for the IEP modal sidebar.
 *
 * Shows the current plan status, the applicable workflow path
 * (simple_review vs admin_approval_required), and a quick role guide.
 * Replaces the step-content area when the Workflow Guide button is active.
 */

import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanStatus, IepWorkflowMode } from "./types";

interface IepWorkflowGuideProps {
  status: PlanStatus;
  workflowMode: IepWorkflowMode;
  isAdmin: boolean;
}

type FlowNode = { status: PlanStatus; label: string; role: string };

const SIMPLE_REVIEW_FLOW: FlowNode[] = [
  { status: "draft",     label: "Draft",     role: "Teacher or Admin" },
  { status: "finalized", label: "Finalized", role: "Teacher or Admin" },
];

const APPROVAL_FLOW: FlowNode[] = [
  { status: "draft",     label: "Draft",     role: "Teacher or Admin" },
  { status: "submitted", label: "Submitted", role: "Teacher or Admin" },
  { status: "approved",  label: "Approved",  role: "Admin only" },
];

const STATUS_INFO: Partial<Record<PlanStatus, { label: string; description: string; color: string }>> = {
  draft:     { label: "Draft",     description: "In progress. All staff can edit and add evidence from reports.", color: "text-muted-foreground" },
  submitted: { label: "Submitted", description: "Shared for team input. Awaiting admin review.", color: "text-blue-600 dark:text-blue-400" },
  in_review: { label: "In Review", description: "Under active review by the team.", color: "text-yellow-600 dark:text-yellow-400" },
  approved:  { label: "Approved",  description: "Reviewed and approved by admin. Read-only — use Create Revision to edit.", color: "text-green-600 dark:text-green-400" },
  finalized: { label: "Finalized", description: "Plan is finalized and read-only — use Create Revision to make changes.", color: "text-green-600 dark:text-green-400" },
  archived:  { label: "Archived",  description: "No longer active.", color: "text-muted-foreground" },
};

export function IepWorkflowGuide({ status, workflowMode, isAdmin }: IepWorkflowGuideProps) {
  const info = STATUS_INFO[status];
  const flow = workflowMode === "simple_review" ? SIMPLE_REVIEW_FLOW : APPROVAL_FLOW;

  // Determine where the current status falls in the flow
  const currentIndex = flow.findIndex((n) => n.status === status);
  // If status isn't in the flow (e.g. archived, in_review), treat as before first node
  const effectiveIndex = currentIndex === -1 ? -1 : currentIndex;

  const isReadOnly = status === "approved" || status === "finalized";

  return (
    <div className="space-y-7 max-w-lg">

      {/* ── Current status ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Current Status</h3>
        {info ? (
          <>
            <p className={cn("text-sm font-semibold", info.color)}>{info.label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{info.description}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground capitalize">{status}</p>
        )}
      </div>

      {/* ── Workflow path ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
          {workflowMode === "simple_review" ? "Simple Review Workflow" : "Approval Workflow"}
        </h3>
        <div className="flex items-start gap-2 flex-wrap">
          {flow.map((node, idx) => {
            const isCompleted = effectiveIndex > idx;
            const isCurrent   = effectiveIndex === idx;
            return (
              <div key={node.status} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    isCompleted
                      ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
                      : isCurrent
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-muted/40 border-border/50 text-muted-foreground",
                  )}>
                    {isCompleted
                      ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                      : <Circle className="w-3 h-3 shrink-0" />}
                    {node.label}
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 mt-0.5 text-center leading-tight max-w-[80px]">
                    {node.role}
                  </span>
                </div>
                {idx < flow.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mb-4" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Role responsibilities ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Who does what?</h3>
        <ul className="space-y-2.5 text-sm">
          {workflowMode === "simple_review" ? (
            <>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground w-28">Teacher or Admin</span>
                <span>Complete all 8 sections, then click <span className="font-medium text-foreground">Finalize IEP</span> on the last tab.</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground w-28">Admin</span>
                <span>Can archive at any time or create a revision from a finalized plan.</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground w-28">Teacher or Admin</span>
                <span>Fill in all sections, then click <span className="font-medium text-foreground">Share for Team Input</span> on the last tab.</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground w-28">Admin</span>
                <span>Review the plan (tabs 6–8), then click <span className="font-medium text-foreground">Approve</span> to finalize.</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 font-medium text-foreground w-28">Either</span>
                <span>Use the evidence button on the Needs tab to auto-fill fields from therapy reports.</span>
              </li>
            </>
          )}
        </ul>
      </div>

      {/* ── Read-only notice ── */}
      {isReadOnly && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          This plan is read-only. All tabs and content remain viewable.
          {!isAdmin && " Ask an admin to create a revision if changes are needed."}
          {isAdmin && " Use “Create Revision” in the footer to make a new editable draft."}
        </div>
      )}

    </div>
  );
}
