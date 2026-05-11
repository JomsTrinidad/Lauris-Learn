/**
 * Starter phrases for IEP narrative fields.
 * These are teaching aids — all text is fully editable after insertion.
 * Tone: strengths-based, specific, professional.
 */

// ── Step 2 — Needs & Strengths ───────────────────────────────────────────────

export const STRENGTHS_STARTERS = [
  "Demonstrates strong visual memory and can recall images and patterns with consistency.",
  "Shows genuine enthusiasm for learning activities, especially hands-on and sensory-based tasks.",
  "Engages well in one-on-one instructional settings with a familiar adult.",
  "Follows visual schedules and structured routines reliably once established.",
  "Demonstrates emerging phonological awareness, including rhyming and sound matching.",
  "Shows creativity in art-based and expressive activities.",
  "Can perform daily living tasks (e.g., dressing, eating) with minimal prompting.",
  "Communicates basic needs using words, signs, or AAC with familiar adults.",
  "Responds positively to consistent routines and predictable classroom structures.",
  "Exhibits strong gross motor skills and enjoys physical activity.",
  "Demonstrates understanding of simple, single-step instructions reliably.",
  "Shows strong number sense when working with concrete, manipulative-based materials.",
  "Builds warm and positive relationships with familiar adults and selected peers.",
  "Demonstrates persistence and willingness to attempt new and challenging tasks.",
  "Has well-developed self-care skills appropriate for their age and developmental level.",
  "Shows interest in books, illustrations, and storytelling activities.",
] as const;

export const NEEDS_STARTERS = [
  "Requires support to sustain attention during large-group instruction for more than 5–10 minutes.",
  "Needs structured support to develop phonological awareness and foundational reading skills.",
  "Requires prompting to initiate and complete multi-step tasks independently.",
  "Needs consistent visual and verbal cues to transition between activities smoothly.",
  "Requires support to regulate emotional responses in high-stimulation environments.",
  "Needs targeted intervention to expand expressive vocabulary and sentence structure.",
  "Requires adapted materials and reduced task complexity to access grade-level content.",
  "Needs explicit instruction in social communication skills (e.g., turn-taking, initiating).",
  "Requires hand-over-hand or verbal prompting to complete fine motor tasks.",
  "Needs support to develop self-advocacy and help-seeking skills.",
  "Requires a quiet, low-distraction setting to perform at their best.",
  "Needs individualized support to develop pre-literacy and pre-numeracy concepts.",
  "Requires frequent check-ins and monitoring to remain on task.",
  "Needs explicit modeling and repeated practice to generalize skills across settings.",
  "Requires additional processing time before responding to questions or instructions.",
  "Needs structured social skills instruction to build peer relationship and friendship skills.",
] as const;

export const PARENT_CONCERNS_STARTERS = [
  "Parents express concern about the learner's ability to participate in group activities with peers.",
  "The family has noted that the learner shows anxiety or distress in new or unfamiliar situations.",
  "Parents are concerned about delayed expressive language development.",
  "The family reports difficulty with transitions at home, especially during morning routines.",
  "Parents would like additional support to improve reading and writing skills.",
  "The family is concerned about the learner's social isolation from classmates.",
  "Parents would like the learner to develop greater independence in daily living tasks.",
  "The family expresses concern about the frequency of behavioral outbursts or meltdowns.",
  "Parents are seeking more consistent communication between home and school.",
  "The family would like guidance on how to better support learning at home.",
  "Parents are concerned that the learner is not keeping pace with grade-level expectations.",
  "The family expresses a desire for the learner to be included in regular class activities.",
] as const;

export const DISABILITY_IMPACT_STARTERS = [
  "Difficulty with sustained attention limits the learner's participation in whole-class instruction.",
  "Limited expressive communication makes it challenging to demonstrate understanding in standard assessments.",
  "Sensory processing differences affect the learner's ability to focus in busy classroom environments.",
  "Difficulty processing multi-step instructions impacts the ability to complete independent seatwork.",
  "Behavioral responses to frustration can disrupt participation in group activities.",
  "Fine motor challenges limit participation in handwriting and art tasks without adapted tools.",
  "Reading and writing difficulties impact access to text-based content across subject areas.",
  "Social communication challenges affect participation in collaborative and partner-based tasks.",
  "Cognitive processing differences require that content be scaffolded and presented in smaller steps.",
  "Difficulty generalizing skills means the learner benefits from explicit connections across settings and subjects.",
] as const;

export const EVALUATION_STARTERS = [
  "Based on direct observation and teacher reports, the learner demonstrates emerging skills across assessed domains.",
  "Assessment results indicate relative strengths in visual processing, with needs in verbal expression and language.",
  "Informal and standardized assessments indicate performance significantly below grade-level expectations in literacy.",
  "Recent therapy evaluation indicates the learner presents with a profile affecting communication and learning.",
  "Assessment data reflects consistent performance in structured one-on-one tasks, with greater difficulty in group settings.",
  "Initial evaluation results indicate delays in developmental and academic domains consistent with existing diagnostic information.",
  "School-based observation and curriculum-based measurement indicate emerging skills in functional academics.",
  "A multidisciplinary evaluation identified needs in communication, adaptive behavior, and academic readiness.",
  "Parent report and clinical assessment data align, indicating consistent functional needs at home and school.",
  "No formal standardized assessment was administered; evaluation is based on observation, portfolio review, and parent/teacher report.",
] as const;

// ── Step 3 — Supports ────────────────────────────────────────────────────────

export const BARRIER_DIFFICULTY_STARTERS = [
  "Difficulty sustaining attention during group instruction",
  "Challenges with expressive communication and verbal responses",
  "Difficulty with sensory processing in stimulating environments",
  "Challenges initiating and completing multi-step tasks independently",
  "Difficulty with peer interaction and cooperative social participation",
  "Challenges with fine motor tasks and handwriting activities",
  "Difficulty transitioning between activities or settings",
  "Challenges with reading comprehension and foundational literacy skills",
] as const;

export const LEARNING_BARRIER_STARTERS = [
  "Large groups and noisy environments increase distractibility and reduce focus.",
  "Open-ended or multi-step verbal instructions without visual or written support.",
  "Unstructured time and sudden or unexpected changes to the daily routine.",
  "Time pressure and performance expectations create anxiety that affects output.",
  "Absence of a familiar, trusted adult reduces engagement and security.",
  "Overstimulation from bright lighting, loud sounds, or strong sensory input.",
  "Abstract content presented without concrete, visual, or hands-on anchors.",
  "Low frustration tolerance when tasks feel too difficult or unfamiliar.",
] as const;

export const LEARNING_FACILITATOR_STARTERS = [
  "Visual schedules and step-by-step task cards posted at eye level.",
  "One-on-one or small-group instructional formats with a familiar adult.",
  "Consistent, predictable daily routines with advance notice of transitions.",
  "Preferred topics or high-interest activities used as engagement anchors.",
  "Positive reinforcement for effort and task completion, not just outcomes.",
  "Frequent sensory breaks and movement opportunities throughout the day.",
  "Simplified verbal instructions paired with visual or gestural cues.",
  "Proximity to a trusted adult for reassurance, monitoring, and redirection.",
  "Reduced workload volume while maintaining access to grade-level concepts.",
  "Peer buddy or cooperative learning with structured, defined roles.",
] as const;

export interface AccommodationStarter {
  text: string;
  category: string;
}

export const ACCOMMODATION_STARTERS: readonly AccommodationStarter[] = [
  { text: "Provide written or visual instructions alongside verbal directions.", category: "Presentation" },
  { text: "Use simplified language and shorter sentences when giving instructions.", category: "Presentation" },
  { text: "Pre-teach key vocabulary and concepts before introducing a new lesson.", category: "Presentation" },
  { text: "Provide graphic organizers, concept maps, or visual outlines for note-taking.", category: "Presentation" },
  { text: "Chunk long assignments into smaller, numbered steps with checkpoints.", category: "Presentation" },
  { text: "Allow verbal responses in lieu of written answers when appropriate.", category: "Response" },
  { text: "Accept drawings, models, or demonstrations as evidence of understanding.", category: "Response" },
  { text: "Use multiple-choice or matching formats instead of open-ended written questions.", category: "Response" },
  { text: "Reduce the number of items per task to manage cognitive load.", category: "Response" },
  { text: "Provide a quiet, low-distraction workspace for seatwork and assessments.", category: "Environment" },
  { text: "Seat learner near the teacher or classroom aide for easy monitoring and support.", category: "Environment" },
  { text: "Minimize visual clutter and reduce non-essential materials on the workspace.", category: "Environment" },
  { text: "Allow sensory supports (e.g., fidget tool, weighted lap pad, noise-cancelling headphones).", category: "Environment" },
  { text: "Provide extended time for activities and assessments without penalty.", category: "Timing" },
  { text: "Break tasks into shorter segments with brief rest periods between each.", category: "Timing" },
  { text: "Allow adequate processing time before expecting a verbal or written response.", category: "Timing" },
  { text: "Schedule cognitively demanding tasks during the learner's peak performance window.", category: "Scheduling" },
  { text: "Provide advance notice of upcoming transitions using a visual timer.", category: "Scheduling" },
] as const;

// ── Step 4 — Goals & Interventions ───────────────────────────────────────────

export const STRATEGY_STARTERS = [
  "Provide explicit, step-by-step instruction with teacher modeling before independent practice.",
  "Use visual task cards and picture-based activity sequences to support multi-step tasks.",
  "Implement a token economy or reward chart for task completion and on-task behavior.",
  "Use visual timers to support transitions and help the learner manage time-on-task.",
  "Provide a personal visual schedule that mirrors the classroom daily schedule.",
  "Use social stories and role-play scenarios to practice targeted social situations.",
  "Implement an errorless learning procedure when introducing new skills.",
  "Conduct regular check-ins at least twice per session to monitor understanding and redirect.",
  "Use a prompting hierarchy (verbal → gestural → physical) and systematically fade supports over time.",
  "Provide opportunities for the learner to demonstrate mastery through preferred response modes.",
  "Use peer-mediated learning with structured buddy roles for cooperative activities.",
  "Create a calm-down kit and a designated self-regulation space for the learner to use as needed.",
  "Pre-teach lesson vocabulary before instruction to reduce cognitive load during the lesson.",
  "Use backwards chaining for complex self-care and functional daily living tasks.",
  "Maintain a home-school communication log to reinforce skill generalization across settings.",
] as const;

/** Domain-filtered goal starter phrases keyed by domain label. */
export const GOAL_STARTERS: Record<string, readonly string[]> = {
  "Communication": [
    "By the end of the school year, [learner] will use [2–3 word phrases / full sentences] to express wants, needs, or comments in 4 out of 5 observed opportunities.",
    "By the end of the school year, [learner] will initiate a conversation with a peer or familiar adult at least [X] times per week, as measured by teacher observation.",
    "By the end of the school year, [learner] will answer simple yes/no and wh-questions related to familiar topics with [X]% accuracy across [X] consecutive sessions.",
    "By the end of the school year, [learner] will use their AAC device or system to request at least [X] different items or activities per session.",
    "By the end of the school year, [learner] will follow 2-step verbal instructions without visual cues in [X] out of [X] trials.",
  ],
  "Social / Emotional": [
    "By the end of the school year, [learner] will demonstrate appropriate social greetings (e.g., saying hello, waving) to familiar adults and peers across [X] consecutive school days.",
    "By the end of the school year, [learner] will take turns in a 2-person game or structured activity for at least [X] minutes without adult prompting.",
    "By the end of the school year, [learner] will use [X] identified calming strategies independently when experiencing [emotion/trigger].",
    "By the end of the school year, [learner] will identify and label at least [X] basic emotions in self and others across [X] consecutive sessions.",
    "By the end of the school year, [learner] will participate in a cooperative group activity with [X] peers for at least [X] minutes per session.",
  ],
  "Academic": [
    "By the end of the school year, [learner] will identify and read [X] sight words / letters / numbers with [X]% accuracy across [X] trials.",
    "By the end of the school year, [learner] will demonstrate understanding of [concept] by completing [observable task] with [X]% accuracy across [X] sessions.",
    "By the end of the school year, [learner] will complete [X]-step problems involving [concept] with [X]% accuracy in [X] out of [X] sessions.",
    "By the end of the school year, [learner] will produce legible written work (e.g., tracing, copying) using an appropriate grip in [X] out of [X] observed opportunities.",
  ],
  "Self-Help / Daily Living": [
    "By the end of the school year, [learner] will complete [task, e.g., handwashing, shoe tying, unpacking bag] with [X] or fewer verbal prompts.",
    "By the end of the school year, [learner] will independently manage their belongings during [routine] with [X]% independence across [X] consecutive school days.",
    "By the end of the school year, [learner] will request a bathroom or comfort break using words, signs, or AAC in [X] out of [X] opportunities.",
    "By the end of the school year, [learner] will demonstrate safe mealtime behaviors (e.g., staying seated, appropriate portion size) with minimal prompting.",
  ],
  "Motor": [
    "By the end of the school year, [learner] will demonstrate improved fine motor precision by completing [task, e.g., cutting along a line, threading beads] with [X]% accuracy across [X] sessions.",
    "By the end of the school year, [learner] will hold and use a pencil with a functional grip during [X]-minute writing tasks in [X] out of [X] observed opportunities.",
    "By the end of the school year, [learner] will demonstrate improved gross motor coordination by completing [skill, e.g., catching a ball, hopping on one foot] with [X]% success across [X] trials.",
    "By the end of the school year, [learner] will independently navigate the school environment (e.g., stairs, hallways) safely with [X] or fewer prompts.",
    "By the end of the school year, [learner] will use scissors to cut along a [straight/curved] line within [X] cm of the target line in [X] out of [X] trials.",
  ],
  "Behavior": [
    "By the end of the school year, [learner] will reduce the frequency of [target behavior] from a baseline of [X] times per [session/day/week] to no more than [X] times.",
    "By the end of the school year, [learner] will use [replacement behavior] instead of [challenging behavior] in [X] out of [X] observed incidents.",
    "By the end of the school year, [learner] will remain on task for [X] consecutive minutes during structured independent work without redirection.",
    "By the end of the school year, [learner] will follow classroom expectations (e.g., staying seated, raising hand to speak) with [X] or fewer prompts per class period.",
  ],
  "Sensory": [
    "By the end of the school year, [learner] will tolerate [sensory experience, e.g., working in the classroom during a noisy activity] for at least [X] minutes without behavioral disruption.",
    "By the end of the school year, [learner] will independently use [X identified sensory strategy] to regulate their arousal level during [routine/setting].",
    "By the end of the school year, [learner] will demonstrate increased tolerance for [texture/sound/sensation] by completing [task] without a negative behavioral response in [X] out of [X] trials.",
  ],
};

export const GOAL_STARTERS_GENERAL = [
  "By the end of the school year, [learner] will [skill] as measured by [method] in [X] out of [X] opportunities.",
  "By the end of the school year, [learner] will demonstrate [skill or behavior] with [X]% accuracy across [X] consecutive sessions.",
  "By the end of the school year, [learner] will independently [skill] in [X] out of [X] observed trials, as documented by teacher observation and work samples.",
] as const;
