"use client";
import { X, Users, BookOpen, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import type { WizardStep } from "./constants";

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
      "Plan title and the learner's name, LRN, date of birth, sex, grade, religion, and mother tongue",
      "Caregiver name, contact number, email, address, and any notes from conversation",
      "Meeting purpose (Initial, Annual, Triennial, Revision, or Exit), date of meeting, and IEP review date",
      "IEP team members with their roles; mark who requires formal acknowledgement",
      "DepEd classification — region, schools division, and district (expandable section at the bottom)",
    ],
    whoContributes: [
      { role: "School Admin / SPED Coordinator", contribution: "Confirms meeting purpose, dates, and school classification details" },
      { role: "SPED Teacher", contribution: "Verifies learner details and leads team composition" },
      { role: "Parent / Caregiver", contribution: "Provides contact and workplace info; participates as a required team member" },
    ],
    examples: [
      "Meeting Purpose: Annual IEP — reviewing progress toward last year's goals",
      "Team: SPED Teacher · Parent/Guardian · Classroom Teacher · Speech-Language Therapist",
    ],
    avoid: [
      "Leaving meeting date blank — it becomes part of the official IEP date record",
      "Omitting the IEP review date — this determines when the plan is due for re-evaluation",
      "Skipping the parent/guardian team member — DepEd Order No. 44 requires their participation",
      "Forgetting the DepEd classification (expandable at the bottom) — required for school submissions",
    ],
  },

  2: {
    whatBelongs: [
      "Reported Difficulties — check all that apply: Seeing, Hearing, Communicating, Moving, Concentrating, Remembering",
      "Medical or diagnosis information if provided by the parent or a specialist",
      "Evaluation Summary — findings from the most recent formal assessment",
      "Present Strengths and Present Needs — the learner's current academic and functional profile",
      "Parent / Guardian Concerns — what the family has raised",
      "Impact on the General Education Curriculum — how the learner's condition affects participation",
      "Background Notes — additional context for the team only; not included in the printed IEP",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Describes present levels of academic and functional performance" },
      { role: "Therapists", contribution: "Shares formal assessment results and functional observations" },
      { role: "Classroom Teacher", contribution: "Contributes academic and social participation data" },
      { role: "Parent / Caregiver", contribution: "Reports home behavior, medical history, and family concerns" },
    ],
    examples: [
      "Strength: Responds well to visual schedules and structured daily routines.",
      "Need: Requires adult prompting to initiate and sustain peer interactions.",
      "Evaluation: GFTA-3 shows severe articulation delay; intelligibility 40% to unfamiliar listeners.",
    ],
    avoid: [
      "Copying assessment reports word-for-word — translate clinical findings into educational terms",
      "Documenting only deficits — strengths are equally important and guide goal-setting",
      "Skipping the Impact on Curriculum field — this justifies the goals you will write in Step 4",
    ],
    note: "Use the Evidence Assistant to draft evaluation summaries, strengths, and needs from existing progress reports or uploaded files. Starter Ideas panels on each field offer quick suggested phrases.",
  },

  3: {
    whatBelongs: [
      "Assistive Technology & Devices — each item links a difficulty area to a specific device or tool used consistently",
      "Learning Supports entries — each entry covers: the difficulty area, what makes it harder (barriers), what helps (facilitators), and classroom accommodations",
      "Only list supports and devices that are regularly used — not one-off or aspirational items",
    ],
    whoContributes: [
      { role: "Classroom Teacher", contribution: "Day-to-day accommodations already in use" },
      { role: "SPED Teacher", contribution: "Specialized instructional supports and assistive tools" },
      { role: "Therapist", contribution: "Sensory, motor, and communication strategies" },
      { role: "Parent / Caregiver", contribution: "What works well at home that can be replicated at school" },
    ],
    examples: [
      "Device: Text-to-speech app on iPad for reading comprehension tasks",
      "Barrier: Group noise increases anxiety → Facilitator: Preferential front seating + optional ear defenders → Accommodation: Written instructions alongside all verbal directions",
      "Accommodation: Extended time (1.5×) on all written assessments",
    ],
    avoid: [
      "Vague supports — write \"provide written step-by-step instructions\" not \"give extra help\"",
      "Omitting devices used every day — all consistent tools should be listed",
    ],
    note: "Use the Suggest Supports button to draft barrier, facilitator, and accommodation entries based on the needs documented in Step 2. Expand Support Planning Tips inside the panel for a quick reference list of common barriers and facilitators.",
  },

  4: {
    whatBelongs: [
      "Annual Goals — each needs: a measurable description, domain/area, target date, short-term objectives (milestones), frequency, and the responsible person",
      "Advanced Tracking per goal (toggle to expand): baseline, how progress is measured, success criteria, and evaluation notes",
      "Support Strategies & Learning Activities — describe HOW the team helps the learner reach each goal; include frequency, responsible person, and setting",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Leads goal writing; sets academic and functional goals" },
      { role: "Therapists", contribution: "Suggest domain goals (speech, OT, behavior) for the team to adapt" },
      { role: "Parent / Caregiver", contribution: "Shares home priorities and observational data" },
      { role: "AI Assistant", contribution: "Suggests draft measurable goals for the team to review and refine" },
    ],
    examples: [
      "Given a visual schedule, [Name] will independently transition between 3 activities in 4 of 5 opportunities across 4 consecutive sessions.",
      "Strategy: Visual schedule review at the start of each class using task cards and prompts — daily, SPED Teacher, classroom.",
    ],
    avoid: [
      "Unmeasurable goals — \"will improve reading\" is not a goal; add a target frequency, percentage, or level",
      "Too many goals — 3 to 5 priority goals is more effective than 10 vague ones",
      "Leaving \"Who is responsible\" blank — every goal needs an owner",
    ],
    note: "Link each Support Strategy to an Annual Goal using the goal dropdown inside each strategy card. This creates goal-coverage tracking so the team can see which goals have strategies and which don't.",
  },

  5: {
    whatBelongs: [
      "Key discussion points and decisions from the IEP meeting",
      "Services recommended — therapy, pull-out support, additional assessments",
      "Placement decisions and any adjustments to the learning environment",
      "Referrals to specialists and next steps the team agreed to pursue",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Summarizes the team's discussion and proposed actions" },
      { role: "School Admin / SPED Coordinator", contribution: "Confirms recommendations align with available resources and policy" },
      { role: "Therapists / Specialists", contribution: "Provide domain-specific service and referral recommendations" },
    ],
    examples: [
      "Continue speech-language therapy twice weekly for the remainder of the school year.",
      "Refer for occupational therapy assessment to address emerging fine-motor difficulties.",
      "Maintain current inclusive placement with pull-out literacy support three times per week.",
    ],
    avoid: [
      "Listing goals here — goals belong in Step 4; this section captures services and team decisions",
      "Vague statements — \"provide more support\" is not a recommendation; be specific about who, what, and how often",
    ],
  },

  6: {
    whatBelongs: [
      "Progress Reflection entries — each entry records: date, which goal it relates to (optional), what was observed, who observed it, and a suggested next step",
      "Entries build an ongoing record of the learner's growth across the plan period — add them throughout the year, not just at the end",
      "Review & Approval Details (expandable section) — print signature lines and the approval workflow: review date, reviewed by teacher, reviewed by admin",
    ],
    whoContributes: [
      { role: "SPED Teacher / Classroom Teacher", contribution: "Adds progress entries when meaningful observations occur" },
      { role: "Therapists / Any observing staff", contribution: "Can contribute entries for sessions and activities they lead" },
      { role: "School Admin", contribution: "Provides formal review; name and date recorded in the Review & Approval section" },
    ],
    examples: [
      "15 Jan 2026 · Goal 2: Initiated peer greetings unprompted on 3 of 5 occasions. → Next step: Introduce group greeting routines.",
      "10 Mar 2026 · General: Transition time reduced from 5 minutes to under 2 minutes consistently across the week.",
    ],
    avoid: [
      "Waiting until end of year — short, regular entries throughout the plan period tell a much stronger story",
      "Leaving \"Observed by\" blank — the record should show who gathered the data",
      "Skipping the Review & Approval section before submission — reviewer names and dates are required before the plan is finalized",
    ],
  },

  7: {
    whatBelongs: [
      "Agreements — commitments made by both the school and the family: who will do what and by when",
      "Home Support Notes — strategies or routines the family is implementing at home",
      "Parent Acknowledgement — confirm that the parent or guardian has reviewed and agreed to this plan",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Documents the team's commitments from the IEP meeting" },
      { role: "Parent / Caregiver", contribution: "Confirms home support plans; acknowledges receiving the plan" },
      { role: "School Admin", contribution: "May add school-side commitments (e.g. scheduling, report delivery)" },
    ],
    examples: [
      "Agreement: School will send weekly progress updates to the family via the class messenger app.",
      "Agreement: Parent will implement the home reading programme three times per week.",
      "Home support: Visual schedule displayed at home using the same routine as at school.",
    ],
    avoid: [
      "Mixing agreements with recommendations — recommendations (Step 5) are what the team proposes; agreements are what everyone has committed to",
      "Marking parent acknowledgement before the parent has actually reviewed the plan — this is a meaningful confirmation",
    ],
  },

  8: {
    whatBelongs: [
      "Supporting documents already uploaded to Document Coordination for this learner",
      "Progress Reports and previous IEPs — document types: IEP, Therapy Progress",
      "Assessments and evaluations — Therapy Evaluation, Developmental Pediatrician Report, School Accommodation",
      "Medical Certificates and parent-provided documents",
      "Only link documents that directly informed this IEP — not every file in the learner's record",
    ],
    whoContributes: [
      { role: "School Staff", contribution: "Links relevant documents already in Document Coordination" },
      { role: "Therapists / Specialists", contribution: "Therapy reports and assessments they have shared with the school" },
    ],
    examples: [
      "Speech-language evaluation report from the current school year",
      "OT assessment summary — Sensory Profile",
      "Developmental pediatrician report confirming diagnosis",
    ],
    avoid: [
      "Linking documents that are not yet active — only documents with active status appear in the list",
      "Linking unrelated documents — each linked document creates an audit trail connecting evidence to this IEP",
    ],
    note: "Click Summarize next to any linked document to extract and insert relevant information into the plan using the AI assistant. Documents must first be uploaded to Document Coordination before they can be linked here.",
  },
};

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Learner & Meeting",
  2: "Needs & Strengths",
  3: "Supports & Accommodations",
  4: "Goals & Interventions",
  5: "Discussion & Recommendations",
  6: "Progress & Review",
  7: "Agreements",
  8: "Attachments",
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
