"use client";
import { useState } from "react";
import {
  BookOpen, Lock, Calendar, GraduationCap, Users, Briefcase, DollarSign, Settings, Mail, CheckCircle2,
  Search, X, ChevronDown, ChevronRight, HelpCircle, AlertTriangle
} from "lucide-react";
import React from "react";

interface GetStartedGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  showDismissOption?: boolean;
  dismissHint?: string;
  /** When true, renders only the inner content (search + list + footer) without the backdrop/panel chrome. */
  embedded?: boolean;
}

export const GetStartedGuide: React.FC<GetStartedGuideProps> = ({
  isOpen,
  onClose,
  onDismiss,
  showDismissOption = false,
  dismissHint = "You can always access Getting Started from the Settings page if you need it again.",
  embedded = false,
}) => {
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});

  const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
    <div className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-sm">{text}</span>
    </div>
  );

  const Note = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
      <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  const Tip = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-300 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  type HelpTopic = {
    id: string;
    icon: React.ElementType;
    title: string;
    stepNumber: number;
    searchText: string;
    body: React.ReactNode;
  };

  const topics: HelpTopic[] = [
    {
      id: "overview",
      icon: BookOpen,
      title: "Recommended Setup Order",
      stepNumber: 0,
      searchText: "overview order sequence steps school year container",
      body: (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Think of the <strong>school year as the operational container for everything else.</strong></p>
          <p className="text-xs text-muted-foreground">Follow this sequence to set up a new school and school year:</p>
          <div className="space-y-1.5 mt-3 text-xs bg-muted/50 rounded-lg p-3">
            <div>1. School Profile</div>
            <div>1b. Policies &amp; Workflows (optional)</div>
            <div>2. School Year</div>
            <div>3. Academic Terms</div>
            <div>4. Class Levels</div>
            <div>5. Teachers</div>
            <div>6. Classes</div>
            <div>7. Fee Types</div>
            <div>8. Tuition Rates</div>
            <div>9. Student ID Format</div>
            <div>10. Students (Enrollment)</div>
            <div>11. Class Placement</div>
            <div>12. Parent Invites</div>
            <div>13. Daily Operations</div>
          </div>
          <Note><strong>Why this order?</strong> Each step builds on the previous ones. You can't create classes without a school year, and you can't enroll students without classes.</Note>
        </div>
      ),
    },
    {
      id: "step-1",
      icon: Lock,
      title: "Step 1: Confirm School Profile",
      stepNumber: 1,
      searchText: "school profile name branch address logo contact details branding policies workflows iep enrollment",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Go to <strong className="text-foreground">Settings → School Information</strong> and confirm the following details are correct. This keeps the system branded and accurate for your school.</p>
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold">Check and update if needed:</p>
            <ul className="text-xs space-y-1 ml-2 text-muted-foreground">
              <li>• School name</li>
              <li>• Branch location</li>
              <li>• Address</li>
              <li>• Logo and branding colors</li>
              <li>• Contact phone number and email</li>
            </ul>
          </div>
          <Note>Operational policies are in a separate section: <strong>Settings → Policies &amp; Workflows</strong>. Configure the IEP workflow mode (Simple Review or Admin Approval Required) and enrollment balance rules there — these are optional but worth setting before you go live.</Note>
        </div>
      ),
    },
    {
      id: "step-2",
      icon: Calendar,
      title: "Step 2: Set Up School Year",
      stepNumber: 2,
      searchText: "school year active create start end dates operational container",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">A school year is the operational container for everything else — enrollment, classes, attendance, billing, and dashboards all operate within one school year.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Settings → School Years</strong></>} />
            <Step n={2} text={<>Click <strong>Add School Year</strong></>} />
            <Step n={3} text={<>Enter the year name (e.g., <strong>SY 2025–2026</strong>)</>} />
            <Step n={4} text={<>Set the <strong>start and end dates</strong></>} />
            <Step n={5} text={<>Check <strong>Mark as Active</strong> — only one year can be active at a time</>} />
            <Step n={6} text="Save" />
          </div>
          <Note><strong>Critical:</strong> A new school year starts empty intentionally. Students do NOT automatically carry over — they must be <strong>enrolled</strong> into the new year.</Note>
        </div>
      ),
    },
    {
      id: "step-3",
      icon: GraduationCap,
      title: "Step 3: Add Academic Terms / Periods",
      stepNumber: 3,
      searchText: "academic period term semester regular term summer organize operations reporting",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Terms help organize operations and reporting. Examples: Regular Term, Semester, Summer Program.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Settings → Academic Periods</strong></>} />
            <Step n={2} text={<>Click <strong>Add Period</strong></>} />
            <Step n={3} text={<>Name it (e.g., <strong>Regular Term, Summer, Semester 1</strong>)</>} />
            <Step n={4} text={<>Set the <strong>start and end dates</strong></>} />
            <Step n={5} text="Save" />
          </div>
          <Note>Academic periods are used for billing (tuition rates per term) and organizing the calendar.</Note>
        </div>
      ),
    },
    {
      id: "step-4",
      icon: Users,
      title: "Step 4: Set Up Class Levels",
      stepNumber: 4,
      searchText: "class level age group toddler nursery kinder grade level backend grouping",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Levels are backend groupings that help organize students and billing. Do NOT confuse with Classes, which are actual sections.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Settings → Class Levels</strong></>} />
            <Step n={2} text={<>Click <strong>Add Level</strong></>} />
            <Step n={3} text={<>Enter level names like: <strong>Toddler, Nursery, Kinder, Grade 1, Grade 2, etc.</strong></>} />
            <Step n={4} text="Save" />
          </div>
          <p className="text-xs text-muted-foreground mt-2"><strong>Difference:</strong></p>
          <ul className="text-xs space-y-0.5 ml-2 text-muted-foreground">
            <li>• <strong>Level:</strong> Age grouping (backend — for reports, billing rates)</li>
            <li>• <strong>Class:</strong> Actual section (e.g., Kinder A, Kinder B, Toddler AM, Toddler PM)</li>
          </ul>
        </div>
      ),
    },
    {
      id: "step-5",
      icon: Users,
      title: "Step 5: Add Teachers",
      stepNumber: 5,
      searchText: "teacher staff add create account role user",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Teachers should exist before assigning them to classes. You can set up teacher accounts manually or have them sign up.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Settings → Teachers</strong></>} />
            <Step n={2} text={<>Click <strong>Add Teacher</strong></>} />
            <Step n={3} text={<>Enter their <strong>name</strong> and <strong>email</strong></>} />
            <Step n={4} text="Save" />
          </div>
          <Note>Teachers must have the <strong>Teacher</strong> role and be assigned to your school in the system.</Note>
        </div>
      ),
    },
    {
      id: "step-6",
      icon: BookOpen,
      title: "Step 6: Create Classes",
      stepNumber: 6,
      searchText: "class create add classroom section time schedule teacher assign",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Classes are actual sections that belong to the active school year. Examples: Toddler A, Kinder PM, Grade 1-A.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Classes</strong> (main sidebar)</>} />
            <Step n={2} text={<>Click <strong>Add Class</strong></>} />
            <Step n={3} text={<>Enter <strong>class name</strong> (unique for the school year)</>} />
            <Step n={4} text={<>Select <strong>level / age group</strong></>} />
            <Step n={5} text={<>Set <strong>start and end times</strong></>} />
            <Step n={6} text={<>Set <strong>capacity</strong> (max students)</>} />
            <Step n={7} text={<>Assign a <strong>teacher</strong></>} />
            <Step n={8} text="Save" />
          </div>
          <Tip>At the start of each new school year, create fresh classes for that year rather than reusing old ones. Old classes are kept for historical reference.</Tip>
        </div>
      ),
    },
    {
      id: "step-7",
      icon: Briefcase,
      title: "Step 7: Configure Fee Types",
      stepNumber: 7,
      searchText: "fee type billing tuition enrollment fee books miscellaneous charge",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Fee types define what you can bill for. Common types: Tuition, Enrollment Fee, Books, Miscellaneous.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Billing (under Finance in the sidebar) → Setup tab → Fee Types sub-tab</strong></>} />
            <Step n={2} text={<>Click <strong>Add Fee Type</strong></>} />
            <Step n={3} text={<>Enter the <strong>fee name</strong> (e.g., Tuition, Enrollment Fee, Books)</>} />
            <Step n={4} text={<>Enter a <strong>description</strong> (optional)</>} />
            <Step n={5} text="Save" />
          </div>
          <Note>Fee types are used when generating billing records. You'll reference them later to set tuition rates per term and level.</Note>
        </div>
      ),
    },
    {
      id: "step-8",
      icon: DollarSign,
      title: "Step 8: Set Up Tuition Rates",
      stepNumber: 8,
      searchText: "tuition rates billing per term level per academic period class",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Define how much to charge per student for each term and class level. Tuition rates drive automatic billing when you generate invoices.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Billing (under Finance in the sidebar) → Setup tab → Tuition Rates sub-tab</strong></>} />
            <Step n={2} text={<>Select an <strong>academic term</strong> (e.g., Regular Term)</>} />
            <Step n={3} text={<>For each <strong>class level</strong>, enter the <strong>monthly tuition amount</strong></>} />
            <Step n={4} text="Save" />
          </div>
          <Note>You must configure tuition rates before generating billing. If you add new terms later, come back here to set rates for the new terms.</Note>
        </div>
      ),
    },
    {
      id: "step-9",
      icon: Settings,
      title: "Step 9: Configure Student ID Format",
      stepNumber: 9,
      searchText: "student id code format prefix padding year include auto generate identify",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Define how student codes are auto-generated when you add new students. Set your prefix and format before enrolling students so the system generates codes correctly.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Settings → Student IDs</strong></>} />
            <Step n={2} text={<>Enter the <strong>prefix</strong> (e.g., <strong>LL, BK, ABC</strong>) — this starts all student codes</>} />
            <Step n={3} text={<>Set the <strong>padding</strong> (number of digits, e.g., 4 means <strong>0001, 0002, etc.</strong>)</>} />
            <Step n={4} text={<>Optionally check <strong>Include school year</strong> to append the year (e.g., <strong>LL-26-0001</strong> for 2026)</>} />
            <Step n={5} text="Save" />
          </div>
          <Note><strong>Do this before enrolling students.</strong> The format applies only to new students added after the change. Existing student codes are not retroactively updated.</Note>
        </div>
      ),
    },
    {
      id: "step-10",
      icon: Users,
      title: "Step 10: Enroll Students",
      stepNumber: 10,
      searchText: "student enrollment add new returning enrollment page level enrollment status",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Students require two steps: first create the student profile, then enroll them in the active school year. Students may exist in the system but are not active for a year until enrolled.</p>
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold"><strong>Create the student profile:</strong></p>
            <div className="ml-2 space-y-1">
              <Step n={1} text={<>Go to <strong>Students</strong></>} />
              <Step n={2} text={<>Click <strong>+ Add Student Profile</strong> (profile only, no enrollment yet)</>} />
              <Step n={3} text={<>Fill in <strong>name, DOB, level, and other details</strong></>} />
              <Step n={4} text="Save" />
            </div>
            <p className="text-xs font-semibold mt-3"><strong>Enroll in the school year:</strong></p>
            <div className="ml-2 space-y-1">
              <Step n={1} text={<>Go to <strong>Enrollment</strong> page</>} />
              <Step n={2} text={<>Click <strong>+ Enroll Student</strong></>} />
              <Step n={3} text={<>Select the <strong>student</strong> and confirm their <strong>level</strong></>} />
              <Step n={4} text="Save" />
            </div>
          </div>
          <Note><strong>Critical:</strong> Students in the system may have zero enrollment records — they only appear on dashboards and in billing when explicitly enrolled for a school year.</Note>
        </div>
      ),
    },
    {
      id: "step-11",
      icon: GraduationCap,
      title: "Step 11: Place Students Into Classes",
      stepNumber: 11,
      searchText: "class placement student class assignment section enroll enrollment",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Distinguish between enrollment (into the year) and class placement (into a specific section).</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Classes</strong></>} />
            <Step n={2} text={<>Click a <strong>class card</strong></>} />
            <Step n={3} text={<>Click <strong>Add Student</strong></>} />
            <Step n={4} text="Search and select students to add to that class" />
            <Step n={5} text="Save" />
          </div>
          <p className="text-xs text-muted-foreground mt-2"><strong>The difference:</strong></p>
          <ul className="text-xs space-y-0.5 ml-2 text-muted-foreground">
            <li>• <strong>Enrollment:</strong> Student is active in this school year</li>
            <li>• <strong>Class Placement:</strong> Student attends this specific section (e.g., Kinder A vs Kinder B)</li>
          </ul>
        </div>
      ),
    },
    {
      id: "step-12",
      icon: Mail,
      title: "Step 12: Invite Parents",
      stepNumber: 12,
      searchText: "parent invite guardian portal access invite link email",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Parents access the portal to view attendance, progress, billing, events, and updates.</p>
          <div className="space-y-2 mt-2">
            <Step n={1} text={<>Go to <strong>Students</strong></>} />
            <Step n={2} text={<>Click a <strong>student row</strong> to open details</>} />
            <Step n={3} text={<>Under <strong>Guardians</strong>, click <strong>Add Guardian</strong></>} />
            <Step n={4} text={<>Enter the <strong>parent's name and email</strong></>} />
            <Step n={5} text={<>Check <strong>Send invite</strong> to email the portal link</>} />
            <Step n={6} text="Save" />
          </div>
          <Note>Parents receive an invite link where they can set their own password and access their child's dashboard.</Note>
        </div>
      ),
    },
    {
      id: "step-13",
      icon: CheckCircle2,
      title: "Step 13: Daily Operations",
      stepNumber: 13,
      searchText: "daily operations attendance billing updates events documents dashboard",
      body: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Once setup is complete, the dashboard becomes your operational hub. Regular workflows include:</p>
          <ul className="text-xs space-y-1 ml-2 text-muted-foreground mt-2">
            <li>• <strong>Attendance:</strong> Mark student presence daily</li>
            <li>• <strong>Parent Updates:</strong> Send class announcements and photos</li>
            <li>• <strong>Billing:</strong> Generate and track payment records</li>
            <li>• <strong>Events:</strong> Create and manage school events</li>
            <li>• <strong>Documents:</strong> Share IEPs, reports, and medical certificates</li>
            <li>• <strong>Progress:</strong> Record student observations</li>
          </ul>
          <Note><strong>Dashboard:</strong> Returns to this page after daily work. It shows what needs attention today.</Note>
        </div>
      ),
    },
  ];

  const q = helpSearch.trim().toLowerCase();
  const filtered = q
    ? topics.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.searchText.toLowerCase().includes(q)
      )
    : topics;

  if (!isOpen) return null;

  // ── Shared inner content (used by both full-drawer and embedded modes) ────────
  const innerContent = (
    <>
      {/* Search */}
      <div className="px-5 py-3 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search steps..."
            value={helpSearch}
            onChange={(e) => setHelpSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">No steps match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
            <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">
              Clear search
            </button>
          </div>
        ) : (
          filtered.map((item) => {
            const Icon = item.icon;
            const open = !!helpExpanded[item.id];
            return (
              <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                  onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                >
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {item.stepNumber > 0 ? (
                      <span className="text-xs font-bold text-muted-foreground">{item.stepNumber}</span>
                    ) : (
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium">{item.title}</span>
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                    {item.body}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex-shrink-0 space-y-3">
        {showDismissOption && onDismiss && (
          <div className="space-y-2 pb-2 border-b border-border">
            <button
              onClick={onDismiss}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-foreground font-medium"
            >
              Don't show on Dashboard
            </button>
            <p className="text-xs text-muted-foreground leading-relaxed">{dismissHint}</p>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {helpSearch ? (
            <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span>
          ) : (
            <span>13 steps · click any to expand</span>
          )}
        </div>
      </div>
    </>
  );

  // ── Embedded mode: content only, no backdrop/panel chrome ────────────────────
  if (embedded) {
    return <div className="flex flex-col flex-1 min-h-0">{innerContent}</div>;
  }

  // ── Full-drawer mode ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={() => { onClose(); setHelpSearch(""); }} />
      <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">Getting Started</h2>
          </div>
          <button
            onClick={() => { onClose(); setHelpSearch(""); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {innerContent}
      </div>
    </div>
  );
};
