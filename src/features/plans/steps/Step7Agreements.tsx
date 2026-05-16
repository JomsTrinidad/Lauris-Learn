"use client";

import type { Dispatch, SetStateAction } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Field, NaToggle } from "./shared";
import type { PlanStatus } from "../types";
import { HomeSupportItems } from "../HomeSupportItems";

export interface Step7AgreementsProps {
  agreements: string; setAgreements: (v: string) => void;
  homeSupportNotes: string; setHomeSupportNotes: (v: string) => void;
  parentAcknowledged: boolean; setParentAcknowledged: Dispatch<SetStateAction<boolean>>;
  parentConsentNotes: string; setParentConsentNotes: (v: string) => void;
  unresolvedConcerns: string; setUnresolvedConcerns: (v: string) => void;
  actionItems: string; setActionItems: (v: string) => void;
  nextReviewCommitments: string; setNextReviewCommitments: (v: string) => void;
  agreementsNa: boolean; setAgreementsNa: (v: boolean) => void;
  concernsNa: boolean; setConcernsNa: (v: boolean) => void;
  nextReviewNa: boolean; setNextReviewNa: (v: boolean) => void;
  status: PlanStatus;
  canEdit: boolean;
  /** Plan DB id — null for unsaved new plans. Required by HomeSupportItems. */
  planId: string | null;
  studentId: string;
  schoolId: string;
}

export function Step7Agreements({
  agreements, setAgreements,
  homeSupportNotes, setHomeSupportNotes,
  parentAcknowledged, setParentAcknowledged,
  parentConsentNotes, setParentConsentNotes,
  unresolvedConcerns, setUnresolvedConcerns,
  actionItems, setActionItems,
  nextReviewCommitments, setNextReviewCommitments,
  agreementsNa, setAgreementsNa,
  concernsNa, setConcernsNa,
  nextReviewNa, setNextReviewNa,
  status, canEdit,
  planId, studentId, schoolId,
}: Step7AgreementsProps) {

  const isDraft = status === "draft";

  return (
    <div className="space-y-5">

      {/* ── Finalized Agreements ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Finalized Agreements</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Decisions and commitments reached by the IEP team during this meeting.</p>
          </div>
          {canEdit && <NaToggle checked={agreementsNa} onChange={setAgreementsNa} disabled={!canEdit} />}
        </div>
        {agreementsNa ? (
          <p className="text-xs text-muted-foreground italic">No written agreements reached — marked as not applicable.</p>
        ) : (
          <Field label="Agreements" hint="What the team committed to — responsibilities, timelines, and follow-through actions.">
            <Textarea
              value={agreements}
              onChange={(e) => setAgreements(e.target.value)}
              disabled={!canEdit}
              rows={4}
              placeholder="e.g. School will provide weekly progress reports to the family. Parent will implement the home reading programme. Therapy schedule confirmed for Tuesdays and Thursdays…"
            />
          </Field>
        )}
      </div>

      {/* ── Action Items ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Action Items</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Concrete next steps with responsible parties and expected timelines.</p>
        </div>
        <Field label="Action items" hint="Who will do what, and by when.">
          <Textarea
            value={actionItems}
            onChange={(e) => setActionItems(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder="e.g. SPED teacher will draft revised goal targets by March 15. School admin will contact OT provider by end of week…"
          />
        </Field>
      </div>

      {/* ── Unresolved Concerns ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Unresolved Concerns</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Topics or concerns the team flagged but could not fully resolve in this meeting.</p>
          </div>
          {canEdit && <NaToggle checked={concernsNa} onChange={setConcernsNa} disabled={!canEdit} />}
        </div>
        {concernsNa ? (
          <p className="text-xs text-muted-foreground italic">No unresolved concerns — marked as not applicable.</p>
        ) : (
          <Field label="Unresolved concerns" hint="Open issues to carry forward to the next meeting or follow-up.">
            <Textarea
              value={unresolvedConcerns}
              onChange={(e) => setUnresolvedConcerns(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="e.g. Waiting for speech therapist assessment results before finalising communication goals. Transport arrangements for therapy sessions still pending…"
            />
          </Field>
        )}
      </div>

      {/* ── Next Review Commitments ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Next Review Commitments</h3>
            <p className="text-xs text-muted-foreground mt-0.5">What the team commits to bring to the next IEP review meeting.</p>
          </div>
          {canEdit && <NaToggle checked={nextReviewNa} onChange={setNextReviewNa} disabled={!canEdit} />}
        </div>
        {nextReviewNa ? (
          <p className="text-xs text-muted-foreground italic">Next review commitments marked as not applicable.</p>
        ) : (
          <Field label="Commitments for next review">
            <Textarea
              value={nextReviewCommitments}
              onChange={(e) => setNextReviewCommitments(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="e.g. Updated progress data on all annual goals. New therapy report from OT. Parent feedback on home programme…"
            />
          </Field>
        )}
      </div>

      {/* ── Family Review & Acknowledgement ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Family Review &amp; Acknowledgement</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Notes from home and confirmation that the family has reviewed this plan.</p>
        </div>

        <Field label="Home support notes" hint="Any strategies, routines, or supports the family is implementing at home.">
          <Textarea
            value={homeSupportNotes}
            onChange={(e) => setHomeSupportNotes(e.target.value)}
            disabled={!canEdit}
            rows={2}
            placeholder="e.g. The family reads together nightly, uses a visual schedule at home…"
          />
        </Field>

        <Field label="Parent consent notes" hint="Summary of consent discussions, preferences expressed, or any conditions the family noted.">
          <Textarea
            value={parentConsentNotes}
            onChange={(e) => setParentConsentNotes(e.target.value)}
            disabled={!canEdit}
            rows={2}
            placeholder="e.g. Parent consented to all recommended supports. Requested a translated copy of the plan…"
          />
        </Field>

        {/* Acknowledgement checkbox — shown once the plan moves past draft stage */}
        {!isDraft && (
          <div className="rounded-lg border border-border/50 bg-card p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={parentAcknowledged}
                onChange={(e) => setParentAcknowledged(e.target.checked)}
                disabled={!canEdit}
              />
              <div>
                <p className="text-xs font-medium text-foreground">Parent / guardian has reviewed and acknowledged this plan</p>
                <p className="text-xs text-muted-foreground mt-0.5">Checking this confirms the family has been involved in the IEP process and agrees with the plan.</p>
              </div>
            </label>
          </div>
        )}

        {isDraft && (
          <p className="text-xs text-muted-foreground italic">
            Family acknowledgement will be available once this plan is shared for review.
          </p>
        )}
      </div>

      {/* ── Home Support Guidance ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Home Support Guidance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Structured focus areas and reinforcement suggestions for the family to continue at home.
            Each item can be individually shared with parents once the plan is finalized.
          </p>
        </div>
        <HomeSupportItems
          planId={planId}
          studentId={studentId}
          schoolId={schoolId}
          canEdit={canEdit}
        />
      </div>

    </div>
  );
}
