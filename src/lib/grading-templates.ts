export type ScaleMode = "label_only" | "range_based";

export interface TemplateItem {
  label: string;
  description: string;
  color: string;
  sortOrder: number;
  minScore: number | null;
  maxScore: number | null;
}

export interface GradingTemplate {
  id: string;
  name: string;
  bestUsedFor: string;
  description: string;
  scaleMode: ScaleMode;
  items: TemplateItem[];
}

export const GRADING_TEMPLATES: GradingTemplate[] = [
  {
    id: "preschool_development",
    name: "Preschool Development Scale",
    bestUsedFor: "Preschool, kindergarten readiness, developmental observations, behavior, participation, early learning skills",
    description: "A simple developmental scale for tracking how consistently a child demonstrates a skill without forcing numeric scores.",
    scaleMode: "label_only",
    items: [
      { label: "Emerging",   description: "Beginning to show understanding",     color: "#ef4444", sortOrder: 1, minScore: null, maxScore: null },
      { label: "Developing", description: "Showing growth with support",          color: "#f97316", sortOrder: 2, minScore: null, maxScore: null },
      { label: "Consistent", description: "Demonstrates skill independently",     color: "#22c55e", sortOrder: 3, minScore: null, maxScore: null },
      { label: "Advanced",   description: "Exceeds expectations",                 color: "#6366f1", sortOrder: 4, minScore: null, maxScore: null },
    ],
  },
  {
    id: "skills_progress",
    name: "Skills Progress Scale",
    bestUsedFor: "Classroom observations, therapy-style progress notes, practical skills, behavior, communication, independence",
    description: "A progress-focused scale that describes the level of support a student needs.",
    scaleMode: "label_only",
    items: [
      { label: "Needs Support", description: "Requires frequent guidance",                         color: "#ef4444", sortOrder: 1, minScore: null, maxScore: null },
      { label: "Progressing",   description: "Improving with some support",                        color: "#f97316", sortOrder: 2, minScore: null, maxScore: null },
      { label: "Independent",   description: "Performs skill without help",                        color: "#22c55e", sortOrder: 3, minScore: null, maxScore: null },
      { label: "Mastered",      description: "Performs skill consistently across settings",        color: "#6366f1", sortOrder: 4, minScore: null, maxScore: null },
    ],
  },
  {
    id: "numeric_1_5",
    name: "Numeric 1–5 Scale",
    bestUsedFor: "Rubrics, teacher ratings, participation, behavior, homework quality, simple performance scoring",
    description: "A five-point numeric scale where each number represents a clear performance level.",
    scaleMode: "range_based",
    items: [
      { label: "1 – Needs Improvement",  description: "Well below expectations",         color: "#ef4444", sortOrder: 1, minScore: 1, maxScore: 1 },
      { label: "2 – Developing",         description: "Approaching expectations",        color: "#f97316", sortOrder: 2, minScore: 2, maxScore: 2 },
      { label: "3 – Meets Expectations", description: "Meets standard",                  color: "#eab308", sortOrder: 3, minScore: 3, maxScore: 3 },
      { label: "4 – Strong",             description: "Above expectations",              color: "#22c55e", sortOrder: 4, minScore: 4, maxScore: 4 },
      { label: "5 – Excellent",          description: "Significantly exceeds expectations", color: "#6366f1", sortOrder: 5, minScore: 5, maxScore: 5 },
    ],
  },
  {
    id: "percentage_grade",
    name: "Percentage Grade Scale",
    bestUsedFor: "Quizzes, exams, assignments, academic grading",
    description: "A standard percentage-based grading scale using 0–100 scores.",
    scaleMode: "range_based",
    items: [
      { label: "Excellent",         description: "Outstanding performance",           color: "#6366f1", sortOrder: 1, minScore: 90,  maxScore: 100 },
      { label: "Very Good",         description: "Above average performance",         color: "#22c55e", sortOrder: 2, minScore: 85,  maxScore: 89  },
      { label: "Good",              description: "Average performance",               color: "#3b82f6", sortOrder: 3, minScore: 80,  maxScore: 84  },
      { label: "Satisfactory",      description: "Below average, passing",            color: "#eab308", sortOrder: 4, minScore: 75,  maxScore: 79  },
      { label: "Needs Improvement", description: "Did not meet the passing threshold", color: "#ef4444", sortOrder: 5, minScore: 0,   maxScore: 74  },
    ],
  },
  {
    id: "letter_grade",
    name: "Letter Grade Scale",
    bestUsedFor: "Schools that use A/B/C/D/F academic grading",
    description: "A traditional letter grading scale mapped to percentage score ranges.",
    scaleMode: "range_based",
    items: [
      { label: "A", description: "Excellent",      color: "#6366f1", sortOrder: 1, minScore: 90, maxScore: 100 },
      { label: "B", description: "Good",           color: "#22c55e", sortOrder: 2, minScore: 80, maxScore: 89  },
      { label: "C", description: "Average",        color: "#3b82f6", sortOrder: 3, minScore: 70, maxScore: 79  },
      { label: "D", description: "Below Average",  color: "#eab308", sortOrder: 4, minScore: 60, maxScore: 69  },
      { label: "F", description: "Failing",        color: "#ef4444", sortOrder: 5, minScore: 0,  maxScore: 59  },
    ],
  },
  {
    id: "pass_fail",
    name: "Pass / Fail Scale",
    bestUsedFor: "Completion-based activities, simple assessments, eligibility checks",
    description: "A simple two-outcome grading scale based on a passing threshold.",
    scaleMode: "range_based",
    items: [
      { label: "Pass", description: "Met the passing threshold",     color: "#22c55e", sortOrder: 1, minScore: 75, maxScore: 100 },
      { label: "Fail", description: "Did not meet the threshold",   color: "#ef4444", sortOrder: 2, minScore: 0,  maxScore: 74  },
    ],
  },
  {
    id: "completion",
    name: "Completion Scale",
    bestUsedFor: "Activity tracking, requirements, submissions, participation, classroom tasks",
    description: "A simple status scale for tracking whether a student completed an expected activity.",
    scaleMode: "label_only",
    items: [
      { label: "Not Started",    description: "Student has not started the activity",       color: "#6b7280", sortOrder: 1, minScore: null, maxScore: null },
      { label: "In Progress",    description: "Student has started but not completed it",   color: "#f97316", sortOrder: 2, minScore: null, maxScore: null },
      { label: "Completed",      description: "Student finished the activity",              color: "#22c55e", sortOrder: 3, minScore: null, maxScore: null },
      { label: "Not Applicable", description: "Activity does not apply to this student",   color: "#3b82f6", sortOrder: 4, minScore: null, maxScore: null },
    ],
  },
];
