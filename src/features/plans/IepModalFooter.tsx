"use client";

/**
 * IepModalFooter — sticky footer navigation for IEP Plan modal.
 *
 * Renders:
 *   Left:  Back button (when not on first step)
 *   Right: Close · workflow action buttons · Next button
 *
 * Workflow action buttons are step- and role-gated:
 *   simple_review:          Finalize IEP (last step, staff, canEdit)
 *   admin_approval_required: Approve (step ≥5, admin, submitted/in_review)
 *                            Submit For Review (last step, staff, canEdit, not submitted)
 */

import { ChevronLeft, ChevronRight, CheckCircle2, Send, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalCancelButton } from "@/components/ui/modal";
import type { WizardStep } from "./constants";
import type { PlanStatus } from "./types";

const LAST_STEP: WizardStep = 8;

export interface IepModalFooterProps {
  activeStep: WizardStep;
  onBack: () => void;
  onNext: () => void;
  // Workflow
  isSimpleReview: boolean;
  status: PlanStatus;
  isStaff: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  saving: boolean;
  onFinalize: () => void;
  onApprove: () => void;
  onSubmitForReview: () => void;
  // Revision workflow (shown instead of save/submit/finalize when plan is read-only)
  isReadOnly?: boolean;
  canCreateRevision?: boolean;
  creating?: boolean;
  onCreateRevision?: () => void;
}

export function IepModalFooter({
  activeStep, onBack, onNext,
  isSimpleReview, status, isStaff, isAdmin, canEdit, saving,
  onFinalize, onApprove, onSubmitForReview,
  isReadOnly = false, canCreateRevision = false, creating = false, onCreateRevision,
}: IepModalFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 pt-4 border-t border-border -mx-6 px-6">
      <div>
        {activeStep > 1 && (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" />Back
          </Button>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <ModalCancelButton label="Close" size="sm" />

        {isReadOnly ? (
          /* Read-only mode (finalized / approved) — only show Create Revision */
          canCreateRevision && (
            <Button type="button" onClick={onCreateRevision} disabled={creating}>
              {creating
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <GitBranch className="w-4 h-4 mr-1.5" />}
              Create Revision
            </Button>
          )
        ) : isSimpleReview ? (
          /* simple_review path — Finalize IEP on last step */
          activeStep === LAST_STEP && isStaff && canEdit && (
            <Button type="button" onClick={onFinalize} disabled={saving}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />Finalize IEP
            </Button>
          )
        ) : (
          /* admin_approval_required path */
          <>
            {activeStep >= 5 && isAdmin && (status === "submitted" || status === "in_review") && (
              <Button type="button" variant="outline" onClick={onApprove} disabled={saving}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />Approve
              </Button>
            )}
            {activeStep === LAST_STEP && isStaff && canEdit && status !== "submitted" && (
              <Button type="button" onClick={onSubmitForReview} disabled={saving}>
                <Send className="w-4 h-4 mr-1.5" />Submit For Review
              </Button>
            )}
          </>
        )}

        {activeStep < LAST_STEP && (
          <Button type="button" size="sm" onClick={onNext}>
            Next<ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
