"use client";

import { type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field, EmptyHint, NaToggle } from "./shared";
import type { RecommendationItem } from "../types";

const RECOMMENDATION_STATUS_LABELS: Record<RecommendationItem["status"], string> = {
  proposed:         "Proposed",
  under_discussion: "Under Discussion",
  accepted:         "Accepted",
  rejected:         "Not Proceeding",
  deferred:         "Deferred",
};

const STATUS_COLORS: Record<RecommendationItem["status"], string> = {
  proposed:         "bg-blue-100 text-blue-700 border-blue-200",
  under_discussion: "bg-amber-100 text-amber-700 border-amber-200",
  accepted:         "bg-green-100 text-green-700 border-green-200",
  rejected:         "bg-muted text-muted-foreground border-border",
  deferred:         "bg-muted text-muted-foreground border-border",
};

const CATEGORY_OPTIONS: string[] = [
  "Services",
  "Placement",
  "Accommodations",
  "Modifications",
  "Goals",
  "Assessment",
  "Behavior Support",
  "Therapy / Related Services",
  "Parent Concern",
  "Follow-Up Action",
  "Other",
];

export interface Step5DiscussionProps {
  recommendations: string;
  setRecommendations: (v: string) => void;
  recommendationItems: RecommendationItem[];
  setRecommendationItems: Dispatch<SetStateAction<RecommendationItem[]>>;
  recommendationsNa: boolean; setRecommendationsNa: (v: boolean) => void;
  discussionNa: boolean; setDiscussionNa: (v: boolean) => void;
  canEdit: boolean;
}

export function Step5Discussion({
  recommendations, setRecommendations,
  recommendationItems, setRecommendationItems,
  recommendationsNa, setRecommendationsNa,
  discussionNa, setDiscussionNa,
  canEdit,
}: Step5DiscussionProps) {

  function addItem() {
    setRecommendationItems((p) => [...p, {
      id: crypto.randomUUID(),
      text: "",
      category: "",
      proposed_by: "",
      status: "proposed",
    }]);
  }

  function updateItem(id: string, patch: Partial<RecommendationItem>) {
    setRecommendationItems((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
  }

  function removeItem(id: string) {
    setRecommendationItems((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-5">

      {/* ── Context banner ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground">Team Review section</p>
          <p className="text-xs text-muted-foreground">
            This section is typically completed collaboratively — during the IEP team meeting, after a review session,
            or before final approval. Use it to capture what the team recommended, discussed, and agreed on together.
          </p>
        </div>
      </div>

      {/* ── Structured Recommendation Items ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Team Recommendations</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track individual recommendations from the IEP team — services, placements, referrals, and follow-up actions.
            </p>
          </div>
          {canEdit && <NaToggle checked={recommendationsNa} onChange={setRecommendationsNa} disabled={!canEdit} />}
        </div>

        {recommendationsNa && (
          <p className="text-xs text-muted-foreground italic">Team recommendations marked as not applicable for this meeting.</p>
        )}

        {!recommendationsNa && recommendationItems.length === 0 && (
          <EmptyHint>No recommendations added yet. Use the button below to add one.</EmptyHint>
        )}

        {!recommendationsNa && recommendationItems.map((item, idx) => {
          // Derive controlled dropdown state from the stored free-text category value.
          // Stored value may be: empty, a known option, the literal "Other", or legacy free text.
          const cat = item.category ?? "";
          const isKnown = CATEGORY_OPTIONS.includes(cat);
          // Empty → placeholder; known option (incl. "Other") → show it; unknown non-empty → "Other"
          const dropdownValue = cat === "" ? "" : isKnown ? cat : "Other";
          // Show the custom text input when dropdown is "Other" and the stored value is not the sentinel.
          const showCustom = dropdownValue === "Other";
          // Pre-populate the text input with the original value for backward compat (legacy free text).
          const customValue = showCustom && cat !== "Other" ? cat : "";

          return (
          <div key={item.id} className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 pt-0.5">
                #{idx + 1}
              </span>
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0",
                STATUS_COLORS[item.status],
              )}>
                {RECOMMENDATION_STATUS_LABELS[item.status]}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors ml-auto"
                  title="Remove recommendation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Field label="Recommendation">
              <Textarea
                value={item.text}
                onChange={(e) => updateItem(item.id, { text: e.target.value })}
                disabled={!canEdit}
                rows={2}
                placeholder="e.g. Continue speech-language therapy twice weekly…"
              />
            </Field>

            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Category">
                <Select
                  value={dropdownValue}
                  onChange={(e) => updateItem(item.id, { category: e.target.value })}
                  disabled={!canEdit}
                >
                  <option value="" disabled>Select category</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </Select>
                {showCustom && (
                  <Input
                    value={customValue}
                    onChange={(e) => updateItem(item.id, { category: e.target.value || "Other" })}
                    disabled={!canEdit}
                    placeholder="Describe the category"
                    className="mt-1.5"
                  />
                )}
              </Field>
              <Field label="Proposed By">
                <Input
                  value={item.proposed_by ?? ""}
                  onChange={(e) => updateItem(item.id, { proposed_by: e.target.value })}
                  disabled={!canEdit}
                  placeholder="e.g. SPED Teacher"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={item.status}
                  onChange={(e) => updateItem(item.id, { status: e.target.value as RecommendationItem["status"] })}
                  disabled={!canEdit}
                >
                  {(Object.keys(RECOMMENDATION_STATUS_LABELS) as RecommendationItem["status"][]).map((s) => (
                    <option key={s} value={s}>{RECOMMENDATION_STATUS_LABELS[s]}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          );
        })}

        {canEdit && !recommendationsNa && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-4 h-4 mr-1" /> Add recommendation
          </Button>
        )}
      </div>

      {/* ── General Discussion Notes ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Discussion Notes</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Free-form notes from the IEP meeting — context, observations, or anything not captured in structured recommendations above.
            </p>
          </div>
          {canEdit && <NaToggle checked={discussionNa} onChange={setDiscussionNa} disabled={!canEdit} />}
        </div>

        {discussionNa ? (
          <p className="text-xs text-muted-foreground italic">Discussion notes marked as not applicable for this meeting.</p>
        ) : (
          <Field label="Notes" hint="Additional discussion points, context, or background.">
            <Textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              disabled={!canEdit}
              rows={4}
              placeholder="e.g. Team discussed the learner's recent progress. Parents shared concerns about social integration. School will follow up with the therapy provider regarding scheduling…"
            />
          </Field>
        )}
      </div>

    </div>
  );
}
