"use client";

import type { Dispatch, SetStateAction } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared";

export interface Step7AgreementsProps {
  agreements: string; setAgreements: (v: string) => void;
  homeSupportNotes: string; setHomeSupportNotes: (v: string) => void;
  parentAcknowledged: boolean; setParentAcknowledged: Dispatch<SetStateAction<boolean>>;
  canEdit: boolean;
}

export function Step7Agreements({
  agreements, setAgreements,
  homeSupportNotes, setHomeSupportNotes,
  parentAcknowledged, setParentAcknowledged,
  canEdit,
}: Step7AgreementsProps) {
  return (
    <div className="space-y-5">

      {/* ── Agreements ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Agreements</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Decisions and commitments reached by the IEP team during this meeting.</p>
        </div>
        <Field label="Agreements" hint="What the team committed to — responsibilities, timelines, and follow-through actions.">
          <Textarea
            value={agreements}
            onChange={(e) => setAgreements(e.target.value)}
            disabled={!canEdit}
            rows={4}
            placeholder="e.g. School will provide weekly progress reports to the family. Parent will implement the home reading programme. Therapy schedule confirmed for Tuesdays and Thursdays…"
          />
        </Field>
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
      </div>

    </div>
  );
}
