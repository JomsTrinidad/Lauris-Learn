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
      "Caregiver name, contact number, email, home address, workplace, and any notes from conversation",
      "DepEd classification — region, schools division, and district (expandable section at the bottom)",
    ],
    whoContributes: [
      { role: "School Admin / SPED Coordinator", contribution: "Verifies learner details and school classification info" },
      { role: "SPED Teacher", contribution: "Confirms learner profile before the meeting" },
      { role: "Parent / Caregiver", contribution: "Provides contact, address, and workplace details" },
    ],
    examples: [
      "LRN: 100200300400 · Grade / Section: Grade 3 — Sampaguita · Mother Tongue: Filipino",
      "Caregiver: Maria Santos · +63 912 345 6789 · maria@example.com",
    ],
    avoid: [
      "Leaving the learner blank — all plan data is scoped to a specific learner",
      "Forgetting the DepEd classification (expandable at the bottom) — required for school submissions",
    ],
  },

  2: {
    whatBelongs: [
      "Meeting purpose (Initial, Annual, Triennial, Revision, or Exit) and date of meeting",
      "Physical location of the meeting and online meeting link (if applicable)",
      "Last IEP date, revision date, and scheduled IEP review date",
      "IEP team members with their roles; check 'Confirm participation' once they have joined",
    ],
    whoContributes: [
      { role: "School Admin / SPED Coordinator", contribution: "Sets meeting purpose, dates, and location" },
      { role: "SPED Teacher", contribution: "Leads team composition and confirms attendance" },
      { role: "Parent / Caregiver", contribution: "Participates as a required IEP team member" },
    ],
    examples: [
      "Meeting Purpose: Annual IEP — reviewing progress toward last year's goals",
      "Location: SPED Resource Room, BK Main Building",
      "Team: SPED Teacher · Parent/Guardian · Classroom Teacher · Speech-Language Therapist",
    ],
    avoid: [
      "Leaving meeting date blank — it becomes part of the official IEP date record",
      "Omitting the IEP review date — this determines when the plan is due for re-evaluation",
      "Skipping the parent/guardian team member — DepEd Order No. 44 requires their participation",
    ],
  },

  3: {
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
      "Skipping the Impact on Curriculum field — this justifies the goals you will write in Step 5",
    ],
    note: "Use the Evidence Assistant to draft evaluation summaries, strengths, and needs from existing progress reports or uploaded files. Starter Ideas panels on each field offer quick suggested phrases.",
  },

  4: {
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
    note: "Use the Suggest Supports button to draft barrier, facilitator, and accommodation entries based on the needs documented in Step 3. Expand Support Planning Tips inside the panel for a quick reference list of common barriers and facilitators.",
  },

  5: {
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

  6: {
    whatBelongs: [
      "Anything useful you want to capture before or during drafting — questions, reminders, observations, possible supports",
      "Concerns to raise with the team, things to verify before the meeting, or informal notes from parent conversations",
      "Early planning thoughts that aren't ready to go into a structured field yet",
    ],
    whoContributes: [
      { role: "SPED Teacher / Drafter", contribution: "Primary user — uses this as a private planning scratch space" },
      { role: "Anyone editing the draft", contribution: "Can add notes they want the team to discuss" },
    ],
    examples: [
      "Remember to ask OT about fine motor baseline before the meeting.",
      "Parent mentioned reading difficulty at home — check if this affects the literacy goal.",
      "Not sure if 3× weekly is realistic — confirm with admin before finalizing frequency.",
    ],
    avoid: [
      "Treating this as a permanent record — these notes are saved but do not appear on the printed IEP",
      "Duplicating content from Goals or Supports — if something is decided, put it in the right section",
    ],
    note: "Draft Notes do not appear in the printed IEP or shared versions of the plan. Use them freely as a thinking space — cross things out, leave questions, think out loud.",
  },

  7: {
    whatBelongs: [
      "Team Recommendations — individual proposals for services, placements, or referrals with their status (Proposed, Under Discussion, Accepted, Not Proceeding, Deferred)",
      "Discussion Notes — free-form notes from the IEP meeting: context, observations, or anything not captured in structured recommendations",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Summarizes the team's discussion and proposed actions" },
      { role: "School Admin / SPED Coordinator", contribution: "Confirms recommendations align with available resources and policy" },
      { role: "Therapists / Specialists", contribution: "Provide domain-specific service and referral recommendations" },
    ],
    examples: [
      "Continue speech-language therapy twice weekly for the remainder of the school year. [Accepted]",
      "Refer for occupational therapy assessment to address emerging fine-motor difficulties. [Proposed]",
      "Maintain current inclusive placement with pull-out literacy support three times per week. [Accepted]",
    ],
    avoid: [
      "Listing goals here — goals belong in Step 5; this section captures services and team decisions",
      "Vague statements — \"provide more support\" is not a recommendation; be specific about who, what, and how often",
    ],
    note: "This section is typically completed collaboratively — during or after the IEP team meeting, or before final approval. It is not expected to be filled in during initial drafting.",
  },

  8: {
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

  9: {
    whatBelongs: [
      "Finalized Agreements — commitments the team reached: responsibilities, timelines, and follow-through actions",
      "Action Items — concrete next steps with responsible parties and expected dates",
      "Unresolved Concerns — topics the team flagged but could not fully resolve; carry forward to next meeting",
      "Next Review Commitments — what the team commits to bring to the next IEP review",
      "Home Support Notes and Parent Consent Notes — strategies the family is implementing and summary of consent discussions",
      "Parent Acknowledgement — confirm that the parent or guardian has reviewed and agreed to this plan (available once the plan is shared for review)",
    ],
    whoContributes: [
      { role: "SPED Teacher", contribution: "Documents the team's commitments and action items from the meeting" },
      { role: "Parent / Caregiver", contribution: "Confirms home support plans; acknowledges receiving the plan" },
      { role: "School Admin", contribution: "May add school-side commitments (e.g. scheduling, report delivery)" },
    ],
    examples: [
      "Agreement: School will provide weekly progress reports to the family.",
      "Action Item: SPED teacher will draft revised goal targets by March 15.",
      "Home support: Visual schedule displayed at home using the same routine as at school.",
    ],
    avoid: [
      "Mixing agreements with recommendations — recommendations (Step 7) are what the team proposes; agreements are what everyone has committed to",
      "Marking parent acknowledgement before the parent has actually reviewed the plan — this is a meaningful confirmation",
    ],
  },

  10: {
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
  1:  "Learner & Family",
  2:  "Meeting Setup",
  3:  "Needs & Strengths",
  4:  "Supports & Accommodations",
  5:  "Goals & Interventions",
  6:  "Draft Notes",
  7:  "Team Review",
  8:  "Progress & Review",
  9:  "Agreements",
  10: "Attachments",
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
