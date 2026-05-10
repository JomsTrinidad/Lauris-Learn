"use client";
import { X, Users, BookOpen, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import type { WizardStep } from "./IEPPlanModal";

interface StepHelp {
  whatBelongs: string[];
  whoContributes: { role: string; contribution: string }[];
  examples?: string[];
  avoid?: string[];
  note?: string;
}

const STEP_HELP: Record<WizardStep, StepHelp> = {
  1: {
    whatBelongs: [
      "Basic learner identity — name, grade, and relevant demographics",
      "When this IEP meeting is happening and why",
      "Who is part of the IEP team for this plan",
      "Caregiver contact details for coordination and follow-up",
    ],
    whoContributes: [
      { role: "School Admin / SPED Coordinator", contribution: "Confirms meeting date, purpose, and team composition" },
      { role: "SPED Teacher", contribution: "Leads the meeting; verifies learner details" },
      { role: "Parent / Caregiver", contribution: "Confirms contact information; is a required member of the IEP team" },
    ],
    examples: [
      "Meeting Purpose: Annual Review — reviewing progress toward last year's goals",
      "IEP Team: SPED Teacher · Parent/Guardian · Classroom Teacher · Speech-Language Therapist",
    ],
    avoid: [
      "Leaving the meeting date blank — it becomes part of the official IEP record",
      "Omitting the parent — DepEd Order No. 44 requires parent membership in the IEP team",
    ],
  },
  2: {
    whatBelongs: [
      "A clear picture of how the learner performs right now",
      "Strengths and skills that can be built upon",
      "Areas that currently require support or intervention",
      "Key findings from formal evaluations and assessments",
      "How the learner's condition affects participation in general education",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Present levels of academic and functional performance" },
      { role: "Therapists", contribution: "Functional observations from therapy sessions" },
      { role: "Classroom Teacher", contribution: "Academic and social participation data" },
      { role: "Parent / Caregiver", contribution: "Home behavior, interests, and learning strengths" },
    ],
    examples: [
      "Strength: Responds well to visual schedules and structured routines.",
      "Need: Requires adult prompting to initiate and sustain peer interactions.",
      "Evaluation: GFTA-3 results show severe articulation delay; intelligibility 40% to unfamiliar listeners.",
    ],
    avoid: [
      "Copying assessment reports word-for-word — translate clinical findings into educational terms",
      "Documenting only deficits — strengths matter as much as needs",
      "Skipping disability impact — this justifies the goals you will set in Step 4",
    ],
  },
  3: {
    whatBelongs: [
      "Classroom accommodations the learner consistently needs",
      "Assistive technology and devices used",
      "What makes participation harder (barriers) and what helps overcome them",
      "Sensory, motor, or communication supports already in place",
    ],
    whoContributes: [
      { role: "Classroom Teacher", contribution: "Day-to-day accommodation strategies that work" },
      { role: "SPED Teacher", contribution: "Specialized instructional supports" },
      { role: "Therapist", contribution: "Sensory, motor, and communication supports" },
      { role: "Parent / Caregiver", contribution: "What works well at home that translates to school" },
    ],
    examples: [
      "Accommodation: Provide written instructions alongside verbal directions",
      "Device: Text-to-speech app on iPad for reading comprehension tasks",
      "Barrier: Group noise increases anxiety → Support: Preferential front seating, optional ear defenders",
    ],
    avoid: [
      "Vague supports — write \"provide written instructions\" not \"give extra help\"",
      "Omitting devices used every day — all consistent tools should be listed",
    ],
    note: "Use the AI assistant to generate support suggestions based on the needs documented in Step 2.",
  },
  4: {
    whatBelongs: [
      "Annual goals with measurable outcomes for the school year",
      "Teaching strategies and interventions aligned to each goal",
      "Baseline performance the goal is building from",
      "Success criteria — how you will know when the goal is reached",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Leads goal writing; sets academic and functional goals" },
      { role: "Therapists", contribution: "Suggest domain goals (speech, OT, behavior) for adaptation into the IEP" },
      { role: "Parent / Caregiver", contribution: "Shares home priorities and observations" },
      { role: "AI Assistant", contribution: "Suggests draft goals for team review — not final until a staff member approves" },
    ],
    examples: [
      "Given a visual schedule, Learner will transition independently between 3 activities in 4 of 5 opportunities across 4 consecutive sessions.",
      "Using a graphic organizer, Learner will write a 3-sentence paragraph with a main idea and 2 supporting details by end of term.",
    ],
    avoid: [
      "Unmeasurable goals — \"will improve reading\" is not a goal",
      "Too many goals — 3 to 5 priority goals is more effective than 10 vague ones",
      "Copying therapist goals directly — adapt them to the classroom and school context",
    ],
    note: "Therapist-suggested goals are starting drafts. The school finalizes all official IEP wording.",
  },
  5: {
    whatBelongs: [
      "How the learner has progressed toward previous goals",
      "Who reviewed this plan and when",
      "Team recommendations for the next review cycle",
      "Parent acknowledgment that they received and reviewed the plan",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Writes the progress narrative" },
      { role: "Admin / Lead Teacher", contribution: "Provides formal review and approval" },
      { role: "Parent / Caregiver", contribution: "Acknowledges receiving and reviewing the plan" },
    ],
    examples: [
      "Learner met 2 of 4 annual goals. Communication goals showed 80% progress; reading goals continue into next term.",
    ],
    avoid: [
      "Leaving reviewer details blank before submission — approvers need this information",
      "Mixing progress notes with goal content — progress belongs here, goals belong in Step 4",
    ],
  },
  6: {
    whatBelongs: [
      "Supporting documents already uploaded to Document Coordination",
      "Therapy reports, evaluations, or previous IEPs referenced in this plan",
      "Medical certificates or specialist reports that informed the IEP",
    ],
    whoContributes: [
      { role: "School Staff", contribution: "Links relevant documents from the Document Coordination workspace" },
      { role: "Therapists / Specialists", contribution: "Therapy reports and assessments uploaded and shared by the school" },
    ],
    examples: [
      "Speech-language evaluation report from the previous school year",
      "OT assessment summary — Sensory Profile",
      "Developmental pediatrician report confirming diagnosis",
    ],
    note: "Documents must first be uploaded to Document Coordination. Linking a document here creates an audit trail connecting evidence to this IEP.",
  },
};

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Learner & Meeting",
  2: "Needs & Strengths",
  3: "Supports & Accommodations",
  4: "Goals & Interventions",
  5: "Progress & Review",
  6: "Attachments",
};

export function IepStepHelp({ step, onClose }: { step: WizardStep; onClose: () => void }) {
  const help = STEP_HELP[step];

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Step {step} · Guide</p>
          <p className="text-sm font-semibold mt-0.5 text-foreground">{STEP_LABELS[step]}</p>
        </div>
        <button type="button" onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Two-column: what belongs + who contributes */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What belongs here</p>
          </div>
          <ul className="space-y-1">
            {help.whatBelongs.map((item, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2 leading-relaxed">
                <span className="text-primary shrink-0 mt-px">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Who usually contributes</p>
          </div>
          <ul className="space-y-1.5">
            {help.whoContributes.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className="font-medium text-foreground">{c.role}</span>
                <span className="text-muted-foreground"> — {c.contribution}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Examples */}
      {help.examples && help.examples.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Examples</p>
          </div>
          {help.examples.map((ex, i) => (
            <p key={i} className="text-xs text-muted-foreground bg-card rounded-md px-3 py-1.5 border border-border/50 italic leading-relaxed">{ex}</p>
          ))}
        </div>
      )}

      {/* Avoid */}
      {help.avoid && help.avoid.length > 0 && (
        <div className="flex gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Common mistakes to avoid</p>
            <ul className="space-y-0.5">
              {help.avoid.map((a, i) => (
                <li key={i} className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">· {a}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Note */}
      {help.note && (
        <div className="flex gap-2.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-lg px-3 py-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-px" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{help.note}</p>
        </div>
      )}
    </div>
  );
}
