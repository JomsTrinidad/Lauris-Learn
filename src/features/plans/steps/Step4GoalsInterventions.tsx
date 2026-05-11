"use client";

import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import { GOAL_DOMAIN_SUGGESTIONS } from "../constants";
import { Field, BlockCard, updateGoal, updateIntervention, type GoalRow, type InterventionRow } from "./shared";

export interface Step4Props {
  goals: GoalRow[];
  setGoals: Dispatch<SetStateAction<GoalRow[]>>;
  addGoal: () => void;
  interventions: InterventionRow[];
  setInterventions: Dispatch<SetStateAction<InterventionRow[]>>;
  addIntervention: (goalId?: string) => void;
  expandedGoalTracking: Set<string>;
  setExpandedGoalTracking: Dispatch<SetStateAction<Set<string>>>;
  isStaff: boolean;
  isEditing: boolean;
  saving: boolean;
  handleAssistantClick: () => void;
  canEdit: boolean;
}

export function Step4GoalsInterventions({
  goals, setGoals, addGoal,
  interventions, setInterventions, addIntervention,
  expandedGoalTracking, setExpandedGoalTracking,
  isStaff, isEditing, saving, handleAssistantClick, canEdit,
}: Step4Props) {
  return (
    <div className="space-y-5">

      {/* ── Panel A: Annual Goals ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Annual Goals</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Set specific, observable goals for the school year. Each goal should describe what the learner will achieve.</p>
        </div>

        {isStaff && (
          <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">Draft Goals with AI</p>
              <p className="text-xs text-muted-foreground mt-0.5">Based on the needs and strengths you&apos;ve documented, the assistant can suggest measurable annual goals.</p>
            </div>
            <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
              title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
              className="text-xs text-primary hover:text-primary/80 font-medium shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
              Draft Goals →
            </button>
          </div>
        )}

        {goals.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">No goals yet</p>
            <p className="text-xs text-muted-foreground">Examples of annual goals:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "Improve expressive communication",
                "Increase classroom participation",
                "Improve reading comprehension",
                "Develop self-regulation strategies",
                "Strengthen fine motor skills",
              ].map((ex) => (
                <span key={ex} className="inline-block bg-muted rounded-md px-2.5 py-1 text-xs text-muted-foreground">{ex}</span>
              ))}
            </div>
            {canEdit && (
              <button type="button" onClick={addGoal}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 mt-1">
                <Plus className="w-3.5 h-3.5" />
                Create first goal
              </button>
            )}
          </div>
        )}

        {goals.map((g, idx) => {
          const isTrackingExpanded = expandedGoalTracking.has(g.id);
          const hasAdvancedData = !!(g.baseline || g.measurement_method || g.success_criteria || g.remarks);
          return (
            <BlockCard key={g.id} index={idx}
              onRemove={canEdit ? () => setGoals((p) => p.filter((x) => x.id !== g.id)) : undefined}>

              <Field label="Annual goal" required>
                <Textarea rows={2} value={g.description}
                  onChange={(e) => updateGoal(setGoals, g.id, { description: e.target.value })}
                  disabled={!canEdit}
                  placeholder="By the end of the school year, the learner will…" />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Domain / Area">
                  <Input list={`goal-domains-${g.id}`} value={g.domain ?? ""}
                    onChange={(e) => updateGoal(setGoals, g.id, { domain: e.target.value })}
                    disabled={!canEdit}
                    placeholder="e.g. Communication, Literacy, Social Skills" />
                  <datalist id={`goal-domains-${g.id}`}>
                    {GOAL_DOMAIN_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
                  </datalist>
                </Field>
                <Field label="Target date">
                  <DatePicker value={g.target_date ?? ""}
                    onChange={(v) => updateGoal(setGoals, g.id, { target_date: v || null })}
                    disabled={!canEdit} />
                </Field>
              </div>
              <Field label="Short-term objectives">
                <Textarea rows={2} value={g.enroute_objectives ?? ""}
                  onChange={(e) => updateGoal(setGoals, g.id, { enroute_objectives: e.target.value || null })}
                  disabled={!canEdit}
                  placeholder="Step-by-step milestones leading toward the annual goal…" />
              </Field>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="How often / how long">
                  <Input value={g.timeline ?? ""}
                    onChange={(e) => updateGoal(setGoals, g.id, { timeline: e.target.value || null })}
                    disabled={!canEdit} placeholder="e.g. 3x/week, 30 mins" />
                </Field>
                <Field label="Who is responsible">
                  <Input value={g.responsible_person ?? ""}
                    onChange={(e) => updateGoal(setGoals, g.id, { responsible_person: e.target.value || null })}
                    disabled={!canEdit} placeholder="e.g. SPED Teacher, OT" />
                </Field>
              </div>

              {/* Advanced Tracking toggle */}
              <div className="border-t border-border/40 pt-3">
                <button type="button"
                  onClick={() => setExpandedGoalTracking((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                    return next;
                  })}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {isTrackingExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Advanced tracking
                  {hasAdvancedData && !isTrackingExpanded && (
                    <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
                {isTrackingExpanded && (
                  <div className="mt-3 space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="Baseline (where are we starting?)">
                        <Input value={g.baseline ?? ""}
                          onChange={(e) => updateGoal(setGoals, g.id, { baseline: e.target.value || null })}
                          disabled={!canEdit}
                          placeholder="Current performance level before intervention" />
                      </Field>
                      <Field label="How will progress be measured?">
                        <Input value={g.measurement_method ?? ""}
                          onChange={(e) => updateGoal(setGoals, g.id, { measurement_method: e.target.value || null })}
                          disabled={!canEdit}
                          placeholder="e.g. Teacher observation, work samples, rubric" />
                      </Field>
                    </div>
                    <Field label="What does success look like?">
                      <Textarea rows={2} value={g.success_criteria ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { success_criteria: e.target.value || null })}
                        disabled={!canEdit}
                        placeholder="Specific, observable evidence that this goal has been met…" />
                    </Field>
                    <Field label="Evaluation notes & remarks">
                      <Textarea rows={2} value={g.remarks ?? ""}
                        onChange={(e) => updateGoal(setGoals, g.id, { remarks: e.target.value || null })}
                        disabled={!canEdit}
                        placeholder="Instructional notes, mid-year reflections, adjustments made…" />
                    </Field>
                  </div>
                )}
              </div>
            </BlockCard>
          );
        })}

        {goals.length > 0 && canEdit && (
          <button type="button" onClick={addGoal}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
            <Plus className="w-3.5 h-3.5" />
            Add another goal
          </button>
        )}
      </div>

      {/* ── Panel B: Support Strategies & Learning Activities ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Support Strategies &amp; Learning Activities</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Describe specific strategies, who carries them out, where, and how often. Link each to a goal to track coverage.</p>
          </div>
          {canEdit && interventions.length > 0 && (
            <button type="button" onClick={() => addIntervention()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 shrink-0">
              <Plus className="w-3.5 h-3.5" />
              Add strategy
            </button>
          )}
        </div>

        {interventions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/60 p-5 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">No strategies yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">Support strategies describe HOW the team helps the learner reach their goals — the activities, routines, and methods used in class and at home.</p>
            {canEdit && (
              <button type="button" onClick={() => addIntervention()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                <Plus className="w-3.5 h-3.5" />
                Add first strategy
              </button>
            )}
          </div>
        )}

        {interventions.map((iv, idx) => (
          <BlockCard key={iv.id} index={idx}
            onRemove={canEdit ? () => setInterventions((p) => p.filter((x) => x.id !== iv.id)) : undefined}>

            {goals.length === 0 ? (
              <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">Link to a goal:</span> Add annual goals first (in the panel above), then come back to link this strategy.
              </div>
            ) : (
              <Field label="Which goal does this support?" hint="Optional — link to track strategy coverage.">
                <Select value={iv.goal_id ?? ""}
                  onChange={(e) => updateIntervention(setInterventions, iv.id, { goal_id: e.target.value || null })}
                  disabled={!canEdit}>
                  <option value="">— Not linked to a specific goal —</option>
                  {goals.map((g, i) => (
                    <option key={g.id} value={g.id}>
                      Goal {i + 1}: {(g.description || "(empty)").slice(0, 60)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="What is the strategy or activity?" required>
              <Textarea rows={2} value={iv.strategy}
                onChange={(e) => updateIntervention(setInterventions, iv.id, { strategy: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. Visual schedule review at the start of each class period, using task cards and verbal prompts." />
            </Field>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Frequency / schedule">
                <Input value={iv.frequency ?? ""}
                  onChange={(e) => updateIntervention(setInterventions, iv.id, { frequency: e.target.value })}
                  disabled={!canEdit} placeholder="Daily, 3x weekly…" />
              </Field>
              <Field label="Who carries this out">
                <Input value={iv.responsible_person ?? ""}
                  onChange={(e) => updateIntervention(setInterventions, iv.id, { responsible_person: e.target.value })}
                  disabled={!canEdit} placeholder="SPED Teacher, OT…" />
              </Field>
              <Field label="Where / setting">
                <Input value={iv.environment ?? ""}
                  onChange={(e) => updateIntervention(setInterventions, iv.id, { environment: e.target.value })}
                  disabled={!canEdit} placeholder="Classroom, home…" />
              </Field>
            </div>
            <Field label="Additional notes">
              <Textarea rows={2} value={iv.notes ?? ""}
                onChange={(e) => updateIntervention(setInterventions, iv.id, { notes: e.target.value })}
                disabled={!canEdit}
                placeholder="Materials needed, special considerations, variations…" />
            </Field>
          </BlockCard>
        ))}
      </div>

    </div>
  );
}
