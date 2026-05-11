"use client";

/**
 * IepModalHeader — sticky header for IEP Plan modal.
 *
 * Contains (top to bottom):
 *   1. Recovery prompt bar (amber, dismissible)
 *   2. Metadata + action row (status badge, student name, Save button, overflow menu)
 *   3. Save-draft prompt bar (shown when user tries AI on unsaved plan)
 *   4. Phase navigation — 3 workflow phases (Preparation / Planning / Review)
 *   5. Section sub-nav — sections within the active phase + step guide toggle
 *
 * The overflow menu (Print IEP / Archive plan) manages its own open/close
 * state and outside-click handler internally.
 *
 * Phase ↔ step derivation:
 *   getPhaseForStep() maps the flat WizardStep (1–7) to a PhaseId (1–3).
 *   activePhase and currentPhase are derived; the underlying activeStep state
 *   in IEPPlanModal is unchanged — no recovery or payload impact.
 */

import { useEffect, useRef, useState } from "react";
import {
  Save, Loader2, AlertCircle, MoreHorizontal,
  Printer, Archive, X, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { PLAN_STATUS_LABELS, PHASES, getPhaseForStep, type WizardStep } from "./constants";
import type { PlanStatus } from "./types";

export interface IepModalHeaderProps {
  // Recovery prompt
  showRecoveryPrompt: boolean;
  recoveryTimestamp: string | null;
  onRestoreRecovery: () => void;
  onDiscardRecovery: () => void;
  // Metadata strip
  status: PlanStatus;
  studentName: string;
  title: string;
  updatedAt: string | null;
  // Save action
  saving: boolean;
  canEdit: boolean;
  onSave: () => void;
  // Overflow menu
  onPrint: () => void;
  canPrint: boolean;
  isAdmin: boolean;
  isArchived: boolean;
  onArchive: () => void;
  // Save-draft prompt (shown when user tries AI assistant on unsaved plan)
  showSaveDraftPrompt: boolean;
  onDismissSaveDraftPrompt: () => void;
  // Wizard stepper
  activeStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  /** When true: hides the Save button and suppresses recovery/save-draft prompts. */
  isReadOnly?: boolean;
}

export function IepModalHeader({
  showRecoveryPrompt, recoveryTimestamp, onRestoreRecovery, onDiscardRecovery,
  status, studentName, title, updatedAt,
  saving, canEdit, onSave,
  onPrint, canPrint, isAdmin, isArchived, onArchive,
  showSaveDraftPrompt, onDismissSaveDraftPrompt,
  activeStep, onStepChange,
  isReadOnly = false,
}: IepModalHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Derive phase from flat step number — no additional state needed.
  const activePhase = getPhaseForStep(activeStep);;

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

  return (
    <div className="-mx-6 -mt-6 border-b border-border bg-card sticky top-0 z-10">

      {/* Recovery prompt — single compact line (hidden for read-only plans) */}
      {!isReadOnly && showRecoveryPrompt && recoveryTimestamp && (
        <div className="flex items-center gap-2 px-6 py-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="flex-1 text-amber-800 dark:text-amber-200">
            Unsaved recovery found
          </span>
          <button
            type="button"
            onClick={onRestoreRecovery}
            className="font-semibold text-amber-800 dark:text-amber-200 hover:text-amber-900 hover:underline underline-offset-2"
          >
            Restore
          </button>
          <span className="text-amber-300 dark:text-amber-700">·</span>
          <button
            type="button"
            onClick={onDiscardRecovery}
            className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200"
          >
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

        {/* Primary action: Save (hidden for read-only finalized/approved plans) */}
        {!isReadOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={saving || !canEdit}
            className="shrink-0"
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>
        )}

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
                onClick={() => { onPrint(); setShowMoreMenu(false); }}
                disabled={!canPrint}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                Print IEP
              </button>
              {isAdmin && !isArchived && (
                <button
                  type="button"
                  onClick={() => { onArchive(); setShowMoreMenu(false); }}
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

      {/* Save-draft-first prompt (compact, hidden for read-only plans) */}
      {!isReadOnly && showSaveDraftPrompt && (
        <div className="flex items-center gap-2 px-6 py-2 text-xs bg-muted/60 border-t border-border/40">
          <AlertCircle className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="flex-1 text-muted-foreground">
            Save this draft to enable AI suggestions for goals.
          </span>
          <button
            type="button"
            onClick={onDismissSaveDraftPrompt}
            className="text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Phase-based navigation ── */}
      <div className="border-t border-border/40 bg-muted/20">
        <div className="flex items-center px-6 py-3 gap-1">

          {PHASES.map((phase, idx) => {
            const isActivePhase = activePhase === phase.id;
            const isPastPhase = activePhase > phase.id;
            return (
              <div key={phase.id} className="flex items-center gap-1 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onStepChange(phase.steps[0])}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full min-w-0",
                    isActivePhase
                      ? "bg-primary/10"
                      : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2 transition-colors",
                      isActivePhase
                        ? "border-primary bg-primary text-primary-foreground"
                        : isPastPhase
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {isPastPhase ? "✓" : phase.id}
                  </span>
                  <div className="text-left min-w-0">
                    <div className={cn(
                      "text-sm font-semibold leading-tight",
                      isActivePhase ? "text-primary" : isPastPhase ? "text-foreground/70" : "text-muted-foreground",
                    )}>
                      {phase.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 whitespace-nowrap">
                      {phase.description}
                    </div>
                  </div>
                </button>
                {idx < PHASES.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-border/80 shrink-0" />
                )}
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}

// ── Presentational helper ─────────────────────────────────────────────────────

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const variant: Record<PlanStatus, "draft" | "scheduled" | "waitlisted" | "active" | "archived"> =
    {
      draft: "draft",
      submitted: "scheduled",
      in_review: "waitlisted",
      approved: "active",
      finalized: "active",
      archived: "archived",
    };
  return <Badge variant={variant[status]}>{PLAN_STATUS_LABELS[status]}</Badge>;
}
