"use client";

import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared";

export interface Step5DiscussionProps {
  recommendations: string;
  setRecommendations: (v: string) => void;
  canEdit: boolean;
}

export function Step5Discussion({
  recommendations, setRecommendations, canEdit,
}: Step5DiscussionProps) {
  return (
    <div className="space-y-5">

      {/* ── Panel: Team Discussion & Recommendations ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Team Discussion &amp; Recommendations</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture key discussion points from the IEP meeting and the team&apos;s recommendations for this learner.
          </p>
        </div>

        <Field
          label="Recommendations"
          hint="What the IEP team recommends — placements, services, next steps, referrals, or follow-up actions."
        >
          <Textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            disabled={!canEdit}
            rows={5}
            placeholder="e.g. Continue speech-language therapy twice weekly. Refer for occupational therapy assessment. Maintain current placement in inclusive classroom with pull-out support…"
          />
        </Field>
      </div>

    </div>
  );
}
