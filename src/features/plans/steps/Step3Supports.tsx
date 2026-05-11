"use client";

import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { BARRIERS_LEGEND } from "../constants";
import type { IepAssistiveDevice, IepBarrier } from "../types";
import { Field, BlockCard } from "./shared";
import { StarterIdeasPanel } from "@/features/plans/authoring-assist/StarterIdeasPanel";
import {
  BARRIER_DIFFICULTY_STARTERS,
  LEARNING_BARRIER_STARTERS,
  LEARNING_FACILITATOR_STARTERS,
  ACCOMMODATION_STARTERS,
} from "@/features/plans/authoring-assist/starters";

const ACCOMMODATION_TEXTS = ACCOMMODATION_STARTERS.map((a) => `[${a.category}] ${a.text}`);

export interface Step3Props {
  // Assistive devices
  assistiveDevices: IepAssistiveDevice[];
  setAssistiveDevices: Dispatch<SetStateAction<IepAssistiveDevice[]>>;
  addDevice: () => void;
  // Barriers / accommodations
  barriers: IepBarrier[];
  setBarriers: Dispatch<SetStateAction<IepBarrier[]>>;
  addBarrier: () => void;
  // Barriers tips collapsible (distinct from Step 1's DepEd legend)
  step3BarriersLegendOpen: boolean;
  setStep3BarriersLegendOpen: (v: boolean) => void;
  // AI assistant
  isStaff: boolean;
  isEditing: boolean;
  saving: boolean;
  handleAssistantClick: () => void;
  canEdit: boolean;
}

export function Step3Supports({
  assistiveDevices, setAssistiveDevices, addDevice,
  barriers, setBarriers, addBarrier,
  step3BarriersLegendOpen, setStep3BarriersLegendOpen,
  isStaff, isEditing, saving, handleAssistantClick, canEdit,
}: Step3Props) {
  return (
    <div className="space-y-5">

      {/* ── Panel A: Assistive Technology & Devices ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Assistive Technology &amp; Devices</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tools, equipment, and technology that support the learner&apos;s participation.</p>
          </div>
          {canEdit && assistiveDevices.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={addDevice} className="shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" />Add device
            </Button>
          )}
        </div>

        {assistiveDevices.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              No devices listed yet. Common examples: communication boards, visual schedules, adaptive writing tools, noise-cancelling headphones, sensory supports.
            </p>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={addDevice}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add assistive device
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {assistiveDevices.map((d, idx) => (
              <BlockCard key={d.id} index={idx}
                onRemove={canEdit ? () => setAssistiveDevices((p) => p.filter((x) => x.id !== d.id)) : undefined}>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Related area or difficulty">
                    <Input value={d.difficulty}
                      onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, difficulty: e.target.value } : x))}
                      disabled={!canEdit}
                      placeholder="e.g. difficulty with handwriting" />
                  </Field>
                  <Field label="Assistive technology or device">
                    <Input value={d.device}
                      onChange={(e) => setAssistiveDevices((p) => p.map((x) => x.id === d.id ? { ...x, device: e.target.value } : x))}
                      disabled={!canEdit}
                      placeholder="e.g. adaptive pencil grip, text-to-speech app" />
                  </Field>
                </div>
              </BlockCard>
            ))}
          </div>
        )}
      </div>

      {/* ── Panel B: Learning Supports & Accommodations ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Learning Supports &amp; Accommodations</p>
            <p className="text-xs text-muted-foreground mt-0.5">Document what makes participation harder and what strategies or supports help the learner succeed.</p>
          </div>
          {canEdit && barriers.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={addBarrier} className="shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" />Add entry
            </Button>
          )}
        </div>

        {isStaff && (
          <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Need ideas for supports?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use recent progress reports and goals to draft suggested barriers, facilitators, and accommodations.</p>
            </div>
            <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
              title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
              className="text-xs font-medium text-primary hover:text-primary/80 shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
              Suggest Supports →
            </button>
          </div>
        )}

        {/* Support Planning Tips — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setStep3BarriersLegendOpen(!step3BarriersLegendOpen)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {step3BarriersLegendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Support planning tips &amp; examples
          </button>
          {step3BarriersLegendOpen && (
            <div className="mt-2 rounded-lg border border-border/50 bg-card p-3 text-xs space-y-2">
              <div>
                <p className="font-medium text-foreground mb-1">Common barriers (what makes it harder)</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LB")).map((l) => (
                    <li key={l.code} className="flex gap-1.5"><span className="font-medium text-foreground/70 shrink-0">{l.code}</span>{l.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Common facilitators (what helps)</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {BARRIERS_LEGEND.filter((l) => l.code.startsWith("LF")).map((l) => (
                    <li key={l.code} className="flex gap-1.5"><span className="font-medium text-foreground/70 shrink-0">{l.code}</span>{l.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {barriers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              No support entries yet. Common examples: structured routines, peer support, modified materials, extended time, reduced task complexity, sensory breaks.
            </p>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={addBarrier}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add support entry
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {barriers.map((b, idx) => (
              <BlockCard key={b.id} index={idx}
                onRemove={canEdit ? () => setBarriers((p) => p.filter((x) => x.id !== b.id)) : undefined}
                onDuplicate={canEdit ? () => setBarriers((p) => [...p, { ...b, id: crypto.randomUUID() }]) : undefined}>
                <Field label="Area or difficulty">
                  <Input value={b.difficulty}
                    onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, difficulty: e.target.value } : x))}
                    disabled={!canEdit}
                    placeholder="e.g. difficulty sustaining attention during group activities" />
                  <StarterIdeasPanel
                    items={[...BARRIER_DIFFICULTY_STARTERS]}
                    onInsert={(text) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, difficulty: text } : x))}
                    disabled={!canEdit}
                  />
                </Field>
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="What makes it harder?">
                    <Textarea rows={2} value={b.learning_barriers}
                      onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_barriers: e.target.value } : x))}
                      disabled={!canEdit}
                      placeholder="What situations or conditions make participation more difficult?" />
                    <StarterIdeasPanel
                      items={[...LEARNING_BARRIER_STARTERS]}
                      onInsert={(text) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_barriers: x.learning_barriers ? `${x.learning_barriers}\n\n${text}` : text } : x))}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="What helps the learner?">
                    <Textarea rows={2} value={b.learning_facilitators}
                      onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_facilitators: e.target.value } : x))}
                      disabled={!canEdit}
                      placeholder="What strategies, routines, or supports help the learner succeed?" />
                    <StarterIdeasPanel
                      items={[...LEARNING_FACILITATOR_STARTERS]}
                      onInsert={(text) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, learning_facilitators: x.learning_facilitators ? `${x.learning_facilitators}\n\n${text}` : text } : x))}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Classroom accommodations">
                    <Textarea rows={2} value={b.accommodations}
                      onChange={(e) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, accommodations: e.target.value } : x))}
                      disabled={!canEdit}
                      placeholder="What consistent adjustments should be provided in the classroom?" />
                    <StarterIdeasPanel
                      items={ACCOMMODATION_TEXTS}
                      onInsert={(text) => setBarriers((p) => p.map((x) => x.id === b.id ? { ...x, accommodations: x.accommodations ? `${x.accommodations}\n\n${text}` : text } : x))}
                      disabled={!canEdit}
                      searchable
                    />
                  </Field>
                </div>
              </BlockCard>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
