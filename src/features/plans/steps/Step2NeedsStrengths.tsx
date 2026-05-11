"use client";

import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared";
import { ProvenanceChip } from "@/features/plans/iep-assistant/ProvenanceChip";
import type { ProvenanceMap } from "@/features/plans/iep-assistant/types";
import { StarterIdeasPanel } from "@/features/plans/authoring-assist/StarterIdeasPanel";
import {
  EVALUATION_STARTERS,
  STRENGTHS_STARTERS,
  NEEDS_STARTERS,
  PARENT_CONCERNS_STARTERS,
  DISABILITY_IMPACT_STARTERS,
} from "@/features/plans/authoring-assist/starters";

export interface Step2Props {
  // Reported difficulties
  diffSeeing: boolean; setDiffSeeing: (v: boolean) => void;
  diffHearing: boolean; setDiffHearing: (v: boolean) => void;
  diffCommunicating: boolean; setDiffCommunicating: (v: boolean) => void;
  diffMoving: boolean; setDiffMoving: (v: boolean) => void;
  diffConcentrating: boolean; setDiffConcentrating: (v: boolean) => void;
  diffRemembering: boolean; setDiffRemembering: (v: boolean) => void;
  diffOther: boolean; setDiffOther: (v: boolean) => void;
  diffOtherDesc: string; setDiffOtherDesc: (v: string) => void;
  hasMedical: boolean; setHasMedical: (v: boolean) => void;
  medicalDiagnosis: string; setMedicalDiagnosis: (v: string) => void;
  diagnosis: string; setDiagnosis: (v: string) => void;
  // Learning profile
  evaluationResults: string; setEvaluationResults: (v: string) => void;
  presentStrengths: string; setPresentStrengths: (v: string) => void;
  presentNeeds: string; setPresentNeeds: (v: string) => void;
  parentConcerns: string; setParentConcerns: (v: string) => void;
  disabilityImpact: string; setDisabilityImpact: (v: string) => void;
  // Internal notes
  backgroundNotes: string; setBackgroundNotes: (v: string) => void;
  // AI assistant
  isStaff: boolean;
  isEditing: boolean;
  saving: boolean;
  handleAssistantClick: () => void;
  canEdit: boolean;
  provenanceMap?: ProvenanceMap;
}

export function Step2NeedsStrengths({
  diffSeeing, setDiffSeeing, diffHearing, setDiffHearing,
  diffCommunicating, setDiffCommunicating, diffMoving, setDiffMoving,
  diffConcentrating, setDiffConcentrating, diffRemembering, setDiffRemembering,
  diffOther, setDiffOther, diffOtherDesc, setDiffOtherDesc,
  hasMedical, setHasMedical, medicalDiagnosis, setMedicalDiagnosis,
  diagnosis, setDiagnosis,
  evaluationResults, setEvaluationResults,
  presentStrengths, setPresentStrengths,
  presentNeeds, setPresentNeeds,
  parentConcerns, setParentConcerns,
  disabilityImpact, setDisabilityImpact,
  backgroundNotes, setBackgroundNotes,
  isStaff, isEditing, saving, handleAssistantClick, canEdit,
  provenanceMap,
}: Step2Props) {
  return (
    <div className="space-y-5">

      {/* ── Panel A: Reported Difficulties ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Reported Difficulties</p>
          <p className="text-xs text-muted-foreground mt-0.5">Check all areas where the learner has been observed to have difficulty.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {([
            ["diff_seeing",        "Seeing",                           diffSeeing,        setDiffSeeing],
            ["diff_hearing",       "Hearing",                          diffHearing,       setDiffHearing],
            ["diff_communicating", "Communicating",                    diffCommunicating, setDiffCommunicating],
            ["diff_moving",        "Moving / Walking",                 diffMoving,        setDiffMoving],
            ["diff_concentrating", "Concentrating / Paying Attention", diffConcentrating, setDiffConcentrating],
            ["diff_remembering",   "Remembering / Understanding",      diffRemembering,   setDiffRemembering],
          ] as [string, string, boolean, (v: boolean) => void][]).map(([key, lbl, val, setter]) => (
            <label key={key} className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={val} disabled={!canEdit}
                onChange={(e) => setter(e.target.checked)} />
              {lbl}
            </label>
          ))}
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={diffOther} disabled={!canEdit}
              onChange={(e) => setDiffOther(e.target.checked)} />
            Other
          </label>
        </div>
        {diffOther && (
          <Field label="Describe other difficulty">
            <Input value={diffOtherDesc} onChange={(e) => setDiffOtherDesc(e.target.value)} disabled={!canEdit}
              placeholder="Briefly describe the other difficulty area." />
          </Field>
        )}

        <div className="border-t border-border/40 pt-3 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={hasMedical} disabled={!canEdit}
              onChange={(e) => setHasMedical(e.target.checked)} />
            Medical assessment or diagnosis information available
          </label>
          {hasMedical && (
            <Field label="Reported diagnosis / medical details"
              hint="Medical assessment information as provided by parent or attending specialist.">
              <Textarea value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)}
                disabled={!canEdit} rows={2}
                placeholder="Describe the diagnosis or assessment results as reported by the parent or specialist." />
            </Field>
          )}
          <Field label="Reported condition (brief summary)"
            hint="Used in reports and older plan views.">
            <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
              disabled={!canEdit} rows={2}
              placeholder="e.g. Autism Spectrum Disorder, as reported by attending physician." />
          </Field>
        </div>
      </div>

      {/* ── Panel B: Current Learning Profile ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Current Learning Profile</p>
          <p className="text-xs text-muted-foreground mt-0.5">Describe the learner&apos;s current academic, developmental, and functional performance.</p>
        </div>

        {isStaff && (
          <div className="rounded-lg border border-border/60 bg-card p-3 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Need help getting started?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use a progress report, uploaded file, or image to draft strengths, needs, and evaluation summaries.</p>
            </div>
            <button type="button" onClick={handleAssistantClick} disabled={saving || !isEditing}
              title={!isEditing ? "Save the plan first to enable AI suggestions" : undefined}
              className="text-xs font-medium text-primary hover:text-primary/80 shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
              Evidence Assistant →
            </button>
          </div>
        )}

        <p className="text-xs text-muted-foreground italic -mt-1">
          These sections can be updated over time as more assessments and observations become available.
        </p>

        <Field label="Evaluation Summary"
          hint="Results of the initial or most recent evaluation.">
          <Textarea value={evaluationResults} onChange={(e) => setEvaluationResults(e.target.value)}
            disabled={!canEdit} rows={2}
            placeholder="Summarize the key findings from the most recent evaluation or assessment." />
          {provenanceMap?.evaluation_results && (
            <ProvenanceChip meta={provenanceMap.evaluation_results} />
          )}
          <StarterIdeasPanel
            items={[...EVALUATION_STARTERS]}
            onInsert={(text) => setEvaluationResults(evaluationResults ? `${evaluationResults}\n\n${text}` : text)}
            disabled={!canEdit}
          />
        </Field>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Academic / Functional Strengths">
            <Textarea value={presentStrengths} onChange={(e) => setPresentStrengths(e.target.value)}
              disabled={!canEdit} rows={3}
              placeholder="What skills, interests, or learning behaviors are currently working well?" />
            {provenanceMap?.present_academic_strengths && (
              <ProvenanceChip meta={provenanceMap.present_academic_strengths} />
            )}
            <StarterIdeasPanel
              items={[...STRENGTHS_STARTERS]}
              onInsert={(text) => setPresentStrengths(presentStrengths ? `${presentStrengths}\n\n${text}` : text)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Academic / Functional Needs">
            <Textarea value={presentNeeds} onChange={(e) => setPresentNeeds(e.target.value)}
              disabled={!canEdit} rows={3}
              placeholder="What areas currently require support or intervention?" />
            {provenanceMap?.present_academic_needs && (
              <ProvenanceChip meta={provenanceMap.present_academic_needs} />
            )}
            <StarterIdeasPanel
              items={[...NEEDS_STARTERS]}
              onInsert={(text) => setPresentNeeds(presentNeeds ? `${presentNeeds}\n\n${text}` : text)}
              disabled={!canEdit}
            />
          </Field>
        </div>
        <Field label="Parent / Guardian Concerns"
          hint="Concerns shared by the parent or guardian regarding the child's education.">
          <Textarea value={parentConcerns} onChange={(e) => setParentConcerns(e.target.value)}
            disabled={!canEdit} rows={2}
            placeholder="What specific concerns did the parent or guardian raise about their child's education?" />
          {provenanceMap?.parent_concerns && (
            <ProvenanceChip meta={provenanceMap.parent_concerns} />
          )}
          <StarterIdeasPanel
            items={[...PARENT_CONCERNS_STARTERS]}
            onInsert={(text) => setParentConcerns(parentConcerns ? `${parentConcerns}\n\n${text}` : text)}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Impact on General Education Curriculum">
          <Textarea value={disabilityImpact} onChange={(e) => setDisabilityImpact(e.target.value)}
            disabled={!canEdit} rows={2}
            placeholder="How does the learner's condition affect their participation and progress in the general education curriculum?" />
          {provenanceMap?.disability_impact && (
            <ProvenanceChip meta={provenanceMap.disability_impact} />
          )}
          <StarterIdeasPanel
            items={[...DISABILITY_IMPACT_STARTERS]}
            onInsert={(text) => setDisabilityImpact(disabilityImpact ? `${disabilityImpact}\n\n${text}` : text)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      {/* ── Panel C: Internal Staff Notes ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold">Internal Staff Notes</p>
          <p className="text-xs text-muted-foreground mt-0.5">Additional context for the team. Not included in the printed IEP by default.</p>
        </div>
        <Field label="Background Notes">
          <Textarea value={backgroundNotes} onChange={(e) => setBackgroundNotes(e.target.value)}
            disabled={!canEdit} rows={2}
            placeholder="Additional observations, context, or notes for staff use only." />
        </Field>
      </div>

    </div>
  );
}
