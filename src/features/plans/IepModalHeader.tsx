"use client";

/**
 * IepModalHeader — sticky header for IEP Plan modal.
 *
 * Contains (top to bottom):
 *   1. Recovery prompt bar (amber, dismissible)
 *   2. Metadata + action row (status badge, student name, Save button, overflow menu)
 *   3. Save-draft prompt bar (shown when user tries AI on unsaved plan)
 *   4. Wizard stepper (step tabs + step guide toggle)
 *
 * The overflow menu (Print IEP / Archive plan) manages its own open/close
 * state and outside-click handler internally.
 */

import { useEffect, useRef, useState } from "react";
import {
  Save, Loader2, AlertCircle, MoreHorizontal,
  Printer, Archive, HelpCircle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { PLAN_STATUS_LABELS, WIZARD_STEPS, type WizardStep } from "./constants";
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
  // Step guide panel toggle (controlled by parent — affects content area)
  stepHelpOpen: boolean;
  onToggleStepHelp: () => void;
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
  stepHelpOpen, onToggleStepHelp,
  isReadOnly = false,
}: IepModalHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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
                  onClick={() => onStepChange(step.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : isPast
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-semibold shrink-0",
                      isActive
                        ? "bg-white/20 text-primary-foreground"
                        : isPast
                          ? "bg-primary/15 text-primary"
                          : "bg-muted-foreground/20 text-muted-foreground",
                    )}
                  >
                    {isPast ? "✓" : step.id}
                  </span>
                  <span className="hidden md:inline">{step.label}</span>
                  <span className="md:hidden">{step.shortLabel}</span>
                </button>
              </div>
            );
          })}

          {/* Step guide toggle */}
          <div className="ml-auto pl-2 shrink-0">
            <button
              type="button"
              onClick={onToggleStepHelp}
              title={stepHelpOpen ? "Close step guide" : "What belongs in this step?"}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
                stepHelpOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {stepHelpOpen ? "Close guide" : "Step guide"}
              </span>
            </button>
          </div>
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
