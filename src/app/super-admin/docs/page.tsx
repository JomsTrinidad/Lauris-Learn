"use client";
import { useState } from "react";
import {
  BookOpen, ChevronRight, Server, School, FlaskConical, UserCheck,
  ArrowRight, CheckCircle, AlertTriangle, Key, Database, Users,
  Settings, CreditCard, Shield, RefreshCw, LogIn, Layers,
  FileText, Zap, Clock, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Section data ──────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "overview",        label: "Platform Overview",          icon: Layers },
  { id: "creating-school", label: "Creating a New School",      icon: School },
  { id: "trial-system",    label: "Trial System",               icon: Clock },
  { id: "impersonation",   label: "Impersonation",              icon: Shield },
  { id: "demo-data",       label: "Demo Data",                  icon: FlaskConical },
  { id: "onboarding",      label: "Onboarding Checklist",       icon: CheckCircle },
  { id: "trial-to-prod",   label: "Trial → Production",         icon: ArrowRight },
  { id: "credentials",     label: "Demo Credentials",           icon: Key },
  { id: "database",        label: "Database & Migrations",      icon: Database },
  { id: "storage",         label: "Storage Buckets",            icon: Server },
  { id: "roles",           label: "Roles & Permissions",        icon: UserCheck },
  { id: "troubleshooting", label: "Troubleshooting",            icon: HelpCircle },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeading({ id, icon: Icon, title, subtitle }: {
  id: string; icon: React.ElementType; title: string; subtitle?: string;
}) {
  return (
    <div id={id} className="scroll-mt-6 mb-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground ml-9">{subtitle}</p>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-1">{title}</p>
        <div className="text-sm text-muted-foreground space-y-1">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted rounded-lg p-3 text-xs font-mono text-foreground overflow-x-auto border border-border my-2 whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}

function InfoBox({ type = "info", children }: { type?: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const styles = {
    info:   "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
    warn:   "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300",
    danger: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
  };
  const icons = {
    info:   <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    warn:   <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    danger: <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
  };
  return (
    <div className={cn("flex gap-2 border rounded-lg p-3 text-sm my-3", styles[type])}>
      {icons[type]}
      <div>{children}</div>
    </div>
  );
}

function Divider() {
  return <hr className="border-border my-8" />;
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 my-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar nav */}
      <aside className="w-52 flex-shrink-0 sticky top-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Contents</p>
        <nav className="space-y-0.5">
          {NAV_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors",
                activeSection === id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Platform Documentation</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Super Admin reference — setup, onboarding, trial management, and production migration.
          </p>
        </div>

        {/* ── 1. Overview ─────────────────────────────────────────────────────── */}
        <SectionHeading id="overview" icon={Layers} title="Platform Overview"
          subtitle="How Lauris Learn is structured as a multi-tenant SaaS" />

        <div className="text-sm text-muted-foreground space-y-3 ml-9 mb-6">
          <p>
            Lauris Learn is a multi-tenant platform. Each <strong className="text-foreground">School</strong> is
            an independent tenant with its own data, users, branding, and billing configuration.
            All tables include a <code className="bg-muted px-1 rounded text-xs">school_id</code> column and
            Row Level Security (RLS) ensures tenants cannot access each other's data.
          </p>
          <p>
            The platform has four user roles: <strong className="text-foreground">super_admin</strong> (you),{" "}
            <strong className="text-foreground">school_admin</strong>,{" "}
            <strong className="text-foreground">teacher</strong>, and{" "}
            <strong className="text-foreground">parent</strong>.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              { role: "super_admin", desc: "Full platform access. Can create/manage all schools, impersonate admins, manage demo data." },
              { role: "school_admin", desc: "Full access to their school. Manages students, billing, classes, staff, settings." },
              { role: "teacher", desc: "Limited to their assigned classes. Records attendance, posts updates, observations." },
              { role: "parent", desc: "Read-only portal. Views their child's attendance, updates, billing, progress, events." },
            ].map(({ role, desc }) => (
              <div key={role} className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="text-xs font-mono font-semibold text-primary mb-1">{role}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <Divider />

        {/* ── 2. Creating a School ─────────────────────────────────────────────── */}
        <SectionHeading id="creating-school" icon={School} title="Creating a New School" />

        <div className="ml-9 mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Go to <strong className="text-foreground">Schools</strong> in the sidebar and click{" "}
            <strong className="text-foreground">+ New School</strong>. Creating a school automatically:
          </p>
          <CheckList items={[
            "Creates the schools record with is_demo = false",
            "Seeds a default School Year (SY 2025–2026, active)",
            "Seeds a default Branch (Main Branch)",
            "Sets trial_start_date, trial_end_date, trial_status per your input",
          ]} />
          <InfoBox type="warn">
            After creating a school you must manually create the first <strong>school_admin</strong> user.
            Have the admin sign up via <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-xs">/login</code>,
            then update their profile in Supabase SQL Editor (see Onboarding Checklist).
          </InfoBox>
        </div>

        <Divider />

        {/* ── 3. Trial System ──────────────────────────────────────────────────── */}
        <SectionHeading id="trial-system" icon={Clock} title="Trial System"
          subtitle="How trials are enforced and what happens when they expire" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>Every school has three trial-related columns on the <code className="bg-muted px-1 rounded text-xs">schools</code> table:</p>
          <div className="space-y-2">
            {[
              { col: "trial_start_date", desc: "When the trial began (DATE)" },
              { col: "trial_end_date",   desc: "When the trial expires (DATE)" },
              { col: "trial_status",     desc: "active | expired | converted" },
            ].map(({ col, desc }) => (
              <div key={col} className="flex gap-3 items-start">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground flex-shrink-0">{col}</code>
                <span className="text-xs">{desc}</span>
              </div>
            ))}
          </div>
          <p>The dashboard banner logic (in SchoolContext) checks these values on load:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong className="text-foreground">≤ 7 days remaining</strong> — amber warning banner with countdown</li>
            <li><strong className="text-foreground">Expired</strong> — red banner; all write actions are disabled (read-only mode)</li>
            <li><strong className="text-foreground">Converted</strong> — no banner; full access regardless of dates</li>
          </ul>
          <InfoBox type="info">
            To extend a trial, use the Edit (pencil) button on the school row in Schools and update the
            trial end date. Changes take effect on the school admin's next page load.
          </InfoBox>
        </div>

        <Divider />

        {/* ── 4. Impersonation ─────────────────────────────────────────────────── */}
        <SectionHeading id="impersonation" icon={Shield} title="Impersonation"
          subtitle="Acting as a school admin for setup or troubleshooting" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>
            Click the <strong className="text-foreground">Impersonate</strong> button on any school row to enter
            that school's dashboard as a school admin. A blue banner appears at the top of the screen confirming
            you are impersonating. Click <strong className="text-foreground">Exit Impersonation</strong> in the
            banner to return.
          </p>
          <p>How it works technically:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Impersonation state is stored in <code className="bg-muted px-1 rounded text-xs">sessionStorage.__ll_impersonating</code></li>
            <li>SchoolContext reads this on load and switches the active school_id accordingly</li>
            <li>Your super_admin auth session is preserved — you are not logged in as the school admin</li>
            <li>All writes you make during impersonation are scoped to that school's data</li>
          </ul>
          <InfoBox type="warn">
            Impersonation is session-scoped. If you close the tab the impersonation ends automatically.
            Impersonation events are recorded in the audit log.
          </InfoBox>
        </div>

        <Divider />

        {/* ── 5. Demo Data ─────────────────────────────────────────────────────── */}
        <SectionHeading id="demo-data" icon={FlaskConical} title="Demo Data"
          subtitle="Seeding realistic sample data for walkthroughs and testing" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>
            Demo data can only be generated for schools with <code className="bg-muted px-1 rounded text-xs">is_demo = true</code>.
            This flag is a hard safety block — the API will reject any request targeting a non-demo school.
          </p>

          <p className="font-medium text-foreground">Three scenarios are available:</p>
          <div className="space-y-2">
            {[
              { name: "Small Preschool",        key: "small_preschool",   detail: "4 classes · ~38 students · 4 teachers · 10 parents — general walkthrough scenario" },
              { name: "Compliance-Heavy School", key: "compliance_heavy",  detail: "8 classes · ~80 students · 8 teachers · 15 parents — media-heavy, full documentation setup" },
              { name: "New Trial School",        key: "trial_new",         detail: "2 classes · 15 students · 2 teachers · 5 parents — onboarding and incomplete setup scenario" },
            ].map(({ name, key, detail }) => (
              <div key={key} className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="text-xs font-semibold text-foreground">{name} <code className="font-mono text-primary ml-1">{key}</code></p>
                <p className="text-xs mt-0.5">{detail}</p>
              </div>
            ))}
          </div>

          <p className="font-medium text-foreground">Actions:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong className="text-foreground">Generate</strong> — clears any prior data and seeds fresh data for the chosen scenario</li>
            <li><strong className="text-foreground">Refresh</strong> — same as generate but preserves the school shell (re-seeds with same scenario)</li>
            <li><strong className="text-foreground">Reset</strong> — refreshes back to the baseline of the chosen scenario</li>
            <li><strong className="text-foreground">Clear Data</strong> — removes all demo data but leaves the school record intact</li>
          </ul>

          <InfoBox type="info">
            Each generation run is tracked in the <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">demo_data_runs</code> table.
            The run history panel per school shows status, scenario, and timestamps for the last 10 runs.
          </InfoBox>
        </div>

        <Divider />

        {/* ── 6. Onboarding Checklist ──────────────────────────────────────────── */}
        <SectionHeading id="onboarding" icon={CheckCircle} title="Onboarding Checklist"
          subtitle="Complete steps for bringing a new school live on the platform" />

        <div className="ml-9 mb-6">
          <Step n={1} title="Create the school record">
            <p>In the Schools page, click + New School. Fill in the school name, contact details, and trial dates.</p>
            <p>Note the generated <strong className="text-foreground">School ID (UUID)</strong> — you will need it for the SQL steps below.</p>
          </Step>

          <Step n={2} title="Admin signs up">
            <p>Have the school admin navigate to <code className="bg-muted px-1 rounded text-xs">/login</code> and create an account using their email and a strong password.</p>
            <p>Supabase will create an auth user and auto-create a minimal profile row.</p>
          </Step>

          <Step n={3} title="Assign the admin to the school">
            <p>In Supabase SQL Editor, run:</p>
            <CodeBlock>{`UPDATE profiles
SET
  school_id = '<SCHOOL_UUID>',
  role      = 'school_admin',
  full_name = 'Admin Name'
WHERE email = 'admin@theirschool.com';`}</CodeBlock>
          </Step>

          <Step n={4} title="Admin configures school settings">
            <p>The admin logs in and completes setup under <strong className="text-foreground">Settings</strong>:</p>
            <CheckList items={[
              "School Information — name, address, phone",
              "Branding — logo upload, colors, font scale",
              "School Years — verify the default SY is correct or create a new one",
              "Academic Periods — add Regular Term, Summer, etc.",
            ]} />
          </Step>

          <Step n={5} title="Finance configuration">
            <p>Under <strong className="text-foreground">Finance Setup</strong> the admin adds:</p>
            <CheckList items={[
              "Fee Types — Tuition, Miscellaneous, Registration, etc.",
              "Tuition Configs — amount per period/level combination",
              "Discounts — sibling discount, early bird, scholarship, etc.",
            ]} />
          </Step>

          <Step n={6} title="Classes and teachers">
            <p>Under <strong className="text-foreground">Classes</strong>:</p>
            <CheckList items={[
              "Create each class with name, level, schedule, capacity",
              "Assign a teacher to each class",
              "Set promotion paths (next_class_id) for end-of-year promote flow",
            ]} />
            <p className="mt-1">Teachers are created via the same sign-up + SQL profile update flow as the admin, using <code className="bg-muted px-1 rounded text-xs">role = 'teacher'</code>.</p>
          </Step>

          <Step n={7} title="Add students">
            <p>Under <strong className="text-foreground">Students</strong>, add each student with:</p>
            <CheckList items={[
              "Full name, date of birth, gender, address",
              "Guardian(s) — name, relationship, phone, email",
              "Enroll into a class for the active school year",
            ]} />
          </Step>

          <Step n={8} title="Parent portal setup (optional at launch)">
            <p>Parents receive an invite link generated from the Students section. When they accept the invite:</p>
            <CheckList items={[
              "They sign up at /invite?token=... and their profile is linked to their child",
              "Their role is set to 'parent' automatically",
              "They get access to /parent — attendance, updates, billing, events, progress",
            ]} />
          </Step>

          <Step n={9} title="Generate initial billing records">
            <p>Under <strong className="text-foreground">Billing → Generate Billing</strong>, run the billing generator for the first month to create records for all enrolled students. Choose the fee type, academic period, and due date mode.</p>
          </Step>

          <Step n={10} title="Verify and go live">
            <CheckList items={[
              "Log in as a teacher — verify attendance and updates work",
              "Log in as a parent (use a test guardian email) — verify the parent portal",
              "Confirm trial dates are correct in the Schools page",
              "Brief the school admin on the platform",
            ]} />
          </Step>
        </div>

        <Divider />

        {/* ── 7. Trial → Production ────────────────────────────────────────────── */}
        <SectionHeading id="trial-to-prod" icon={ArrowRight} title="Trial → Production Migration"
          subtitle="Converting a school from trial to a paid production account" />

        <div className="ml-9 mb-6 space-y-4 text-sm text-muted-foreground">
          <p>
            When a school decides to continue after their trial, the migration process depends on whether
            they want to keep the trial data or start fresh.
          </p>

          <div className="bg-muted/40 border border-border rounded-xl p-4 mb-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Option A — Keep trial data (most common)</p>
            <p className="text-xs mb-3">
              Use this when the school used the trial period to enter real students, configure classes,
              and set up their actual data. No data migration is needed — just flip the account status.
            </p>
            <Step n={1} title="Edit the school in the Schools page">
              <p>Click the pencil icon on the school row and update:</p>
              <CheckList items={[
                "trial_status → converted",
                "subscription_status → active",
                "billing_plan → their chosen plan",
                "billing_cycle → monthly or annual",
                "Clear or extend trial_end_date as appropriate",
              ]} />
            </Step>
            <Step n={2} title="Confirm access is restored">
              <p>
                The school admin's next page load will show no trial banner and full write access.
                The read-only overlay (if trial had expired) will lift immediately.
              </p>
            </Step>
            <Step n={3} title="Archive or delete demo data if any">
              <p>
                If the school was also used as a demo school (<code className="bg-muted px-1 rounded text-xs">is_demo = true</code>),
                clear the demo data via the Demo Data page, then set <code className="bg-muted px-1 rounded text-xs">is_demo = false</code>
                in SQL Editor:
              </p>
              <CodeBlock>{`UPDATE schools SET is_demo = false WHERE id = '<SCHOOL_UUID>';`}</CodeBlock>
            </Step>
          </div>

          <div className="bg-muted/40 border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Option B — Fresh production school (trial data was test/demo only)</p>
            <p className="text-xs mb-3">
              Use this when the trial school only contained test/demo data and the school wants a
              clean slate for production with real student records.
            </p>
            <Step n={1} title="Create a new school record">
              <p>In the Schools page, create a brand new school entry with <code className="bg-muted px-1 rounded text-xs">is_demo = false</code> and set <code className="bg-muted px-1 rounded text-xs">trial_status = converted</code> immediately.</p>
            </Step>
            <Step n={2} title="Re-assign the admin">
              <p>Update the admin profile's <code className="bg-muted px-1 rounded text-xs">school_id</code> to point to the new school UUID:</p>
              <CodeBlock>{`UPDATE profiles
SET school_id = '<NEW_SCHOOL_UUID>'
WHERE email = 'admin@theirschool.com';`}</CodeBlock>
            </Step>
            <Step n={3} title="Re-configure from scratch">
              <p>Have the admin redo Settings, Finance Setup, Classes, and Students on the new clean school. This is preferable when trial data was messy or purely exploratory.</p>
            </Step>
            <Step n={4} title="Decommission the old trial school">
              <p>
                Either leave the trial school as a historical record (with trial_status = expired) or
                delete it via SQL after confirming all data has been migrated:
              </p>
              <CodeBlock>{`-- Only run after confirming the school is safe to delete
-- CASCADE will remove all school data (students, billing, etc.)
DELETE FROM schools WHERE id = '<OLD_TRIAL_SCHOOL_UUID>';`}</CodeBlock>
              <InfoBox type="danger">
                Deleting a school is irreversible. All cascaded data — students, billing records,
                payments, attendance, enrollments — will be permanently deleted. Always confirm with
                the school first and take a Supabase backup if needed.
              </InfoBox>
            </Step>
          </div>

          <InfoBox type="info">
            <strong>Which option to use?</strong> Ask the school admin: "Did you enter real student names and configure your actual fee structure during the trial?" If yes → Option A. If they just clicked around or used demo data → Option B.
          </InfoBox>
        </div>

        <Divider />

        {/* ── 8. Demo Credentials ──────────────────────────────────────────────── */}
        <SectionHeading id="credentials" icon={Key} title="Demo Credentials"
          subtitle="How to find and use the login credentials for generated demo users" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>
            Each demo data generation run creates a unique <strong className="text-foreground">batch ID</strong>
            — a 7-character base-36 timestamp (e.g. <code className="bg-muted px-1 rounded text-xs">abc1x3f</code>).
            All credentials for that run use this batch ID:
          </p>
          <div className="space-y-2">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <p className="text-xs font-semibold text-foreground mb-1">Teacher accounts</p>
              <p className="text-xs font-mono">Email:    teacher.demo.{"{batchId}"}.01@example.com</p>
              <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
              <p className="text-xs text-muted-foreground mt-1">Numbered 01, 02, 03… up to the teacher count for the scenario.</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <p className="text-xs font-semibold text-foreground mb-1">Parent accounts</p>
              <p className="text-xs font-mono">Email:    parent.demo.{"{batchId}"}.01@example.com</p>
              <p className="text-xs font-mono">Password: DemoPass@{"{batchId}"}!</p>
              <p className="text-xs text-muted-foreground mt-1">Numbered 01, 02… up to the parent count for the scenario.</p>
            </div>
          </div>
          <InfoBox type="warn">
            The batch ID changes every time you generate or refresh demo data. To find the current
            batch ID: go to <strong>Supabase Dashboard → Authentication → Users</strong> and filter
            by <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-xs">@example.com</code>.
            The email prefix contains the current batch ID.
          </InfoBox>
          <p>
            Alternatively, check the <code className="bg-muted px-1 rounded text-xs">demo_data_runs</code> table
            in Supabase SQL Editor — the <code className="bg-muted px-1 rounded text-xs">summary</code> JSONB
            column contains <code className="bg-muted px-1 rounded text-xs">demoUserIds</code>, and cross-referencing
            with <code className="bg-muted px-1 rounded text-xs">auth.users</code> gives you the exact emails.
          </p>
          <CodeBlock>{`-- Find current demo user emails for a school
SELECT au.email, p.role, p.full_name
FROM profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.school_id = '<DEMO_SCHOOL_UUID>'
  AND p.role IN ('teacher', 'parent')
ORDER BY p.role, au.email;`}</CodeBlock>
        </div>

        <Divider />

        {/* ── 9. Database & Migrations ─────────────────────────────────────────── */}
        <SectionHeading id="database" icon={Database} title="Database & Migrations"
          subtitle="Running the schema and migration files on a fresh Supabase project" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>All schema files live in <code className="bg-muted px-1 rounded text-xs">supabase/</code>. Run them in order in the Supabase SQL Editor:</p>
          <Step n={1} title="Run the base schema">
            <CodeBlock>{`-- supabase/schema.sql
-- Creates all 21+ tables, enums, RLS policies, triggers, and seed data`}</CodeBlock>
          </Step>
          <Step n={2} title="Run all migrations in order">
            <p>Run each file from <code className="bg-muted px-1 rounded text-xs">migrations/001_additions.sql</code> through the latest numbered file. Always run in ascending numeric order.</p>
            <p className="mt-1">Current migration sequence as of this writing: 001 → 043. Check the <code className="bg-muted px-1 rounded text-xs">supabase/migrations/</code> folder for the latest.</p>
          </Step>
          <Step n={3} title="Verify RLS is enabled">
            <CodeBlock>{`-- Check all tables have RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;`}</CodeBlock>
            <p className="mt-1">All rows should show <code className="bg-muted px-1 rounded text-xs">rowsecurity = true</code>.</p>
          </Step>

          <InfoBox type="warn">
            If you add a new table, remember to: (1) enable RLS, (2) add a super_admin bypass policy
            using <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-xs">is_super_admin()</code>,
            and (3) add school-member read/write policies.
          </InfoBox>

          <p className="font-medium text-foreground">Key design rules:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Every tenant table has a <code className="bg-muted px-1 rounded text-xs">school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE</code></li>
            <li>Primary keys use <code className="bg-muted px-1 rounded text-xs">UUID DEFAULT gen_random_uuid()</code> (or <code className="bg-muted px-1 rounded text-xs">uuid_generate_v4()</code> in older tables)</li>
            <li>All tables with mutable data have <code className="bg-muted px-1 rounded text-xs">updated_at TIMESTAMPTZ</code> and a trigger to set it automatically</li>
            <li>Only one active school year per school — enforced by a unique index on <code className="bg-muted px-1 rounded text-xs">(school_id) WHERE status = 'active'</code></li>
            <li>The <code className="bg-muted px-1 rounded text-xs">handle_new_user</code> trigger auto-creates a minimal profile row on auth user creation. Always upsert profiles, never insert.</li>
          </ul>
        </div>

        <Divider />

        {/* ── 10. Storage Buckets ───────────────────────────────────────────────── */}
        <SectionHeading id="storage" icon={Server} title="Storage Buckets"
          subtitle="Media storage setup and path conventions" />

        <div className="ml-9 mb-6 space-y-3 text-sm text-muted-foreground">
          <p>
            Currently all media uses a single private bucket: <code className="bg-muted px-1 rounded text-xs">updates-media</code>.
            It must be created manually in the Supabase Dashboard (the migration adds policies but not the bucket itself).
          </p>
          <Step n={1} title="Create the bucket manually">
            <p>In Supabase Dashboard → Storage → New Bucket:</p>
            <CheckList items={[
              "Name: updates-media",
              "Public: OFF (private bucket)",
              "File size limit: 10 MB recommended",
              "Allowed MIME types: image/*",
            ]} />
          </Step>
          <p className="font-medium text-foreground">Path conventions:</p>
          <div className="space-y-1.5">
            {[
              { path: "updates-media/{post_id}/{filename}", desc: "Class update photos" },
              { path: "payment-receipts/{schoolId}/{paymentId}.{ext}", desc: "Payment receipt photos" },
              { path: "proud-moments/{schoolId}/{momentId}/{filename}", desc: "Proud moment media" },
            ].map(({ path, desc }) => (
              <div key={path} className="flex gap-2 items-start">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground flex-shrink-0">{path}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
          <p>
            Signed URLs expire after <strong className="text-foreground">1 hour</strong>. Pages that display
            media generate signed URLs in a single batch on load via <code className="bg-muted px-1 rounded text-xs">createSignedUrls()</code>.
          </p>
          <InfoBox type="info">
            Planned (not yet built): split <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">updates-media</code> into
            separate <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">receipts</code> (admin-only) and{" "}
            <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">student-documents</code> buckets
            when the document hub feature is built.
          </InfoBox>
        </div>

        <Divider />

        {/* ── 11. Roles & Permissions ───────────────────────────────────────────── */}
        <SectionHeading id="roles" icon={UserCheck} title="Roles & Permissions"
          subtitle="What each role can and cannot do" />

        <div className="ml-9 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 border border-border font-medium text-foreground">Action</th>
                  <th className="text-center p-2 border border-border font-medium text-foreground">super_admin</th>
                  <th className="text-center p-2 border border-border font-medium text-foreground">school_admin</th>
                  <th className="text-center p-2 border border-border font-medium text-foreground">teacher</th>
                  <th className="text-center p-2 border border-border font-medium text-foreground">parent</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Create / delete schools",            "✅", "—", "—", "—"],
                  ["Impersonate school admins",           "✅", "—", "—", "—"],
                  ["Manage all school data",              "✅", "✅", "—", "—"],
                  ["Generate demo data",                  "✅", "—", "—", "—"],
                  ["Manage students & guardians",         "✅", "✅", "—", "—"],
                  ["Manage classes",                      "✅", "✅", "—", "—"],
                  ["Manage billing & payments",           "✅", "✅", "—", "—"],
                  ["Record attendance",                   "✅", "✅", "✅", "—"],
                  ["Post class updates",                  "✅", "✅", "✅", "—"],
                  ["Record progress observations",        "✅", "✅", "✅", "—"],
                  ["View own child's data (read-only)",   "—", "—", "—", "✅"],
                  ["Pay via parent portal",               "—", "—", "—", "✅"],
                  ["RSVP to events",                      "—", "—", "—", "✅"],
                  ["Report absence",                      "—", "—", "—", "✅"],
                ].map(([action, ...cols]) => (
                  <tr key={action} className="hover:bg-muted/30 transition-colors">
                    <td className="p-2 border border-border text-muted-foreground">{action}</td>
                    {cols.map((val, i) => (
                      <td key={i} className="p-2 border border-border text-center">
                        {val === "✅" ? <span className="text-green-500">✅</span> :
                         val === "—"  ? <span className="text-muted-foreground/40">—</span> : val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Divider />

        {/* ── 12. Troubleshooting ───────────────────────────────────────────────── */}
        <SectionHeading id="troubleshooting" icon={HelpCircle} title="Troubleshooting"
          subtitle="Common issues and how to resolve them" />

        <div className="ml-9 mb-6 space-y-4">
          {[
            {
              issue: "Admin logs in but sees no school data / wrong school",
              cause: "Their profile has the wrong school_id or no school_id set.",
              fix: `UPDATE profiles SET school_id = '<SCHOOL_UUID>', role = 'school_admin' WHERE email = 'admin@school.com';`,
            },
            {
              issue: "Parent logs in but can't see their child's data",
              cause: "The guardian record for this parent email hasn't been created, or their profile role is not 'parent'.",
              fix: `-- Check guardian record exists
SELECT * FROM guardians WHERE email = 'parent@example.com';

-- Check profile role
SELECT id, role, school_id FROM profiles WHERE email = 'parent@example.com';

-- Fix role if needed
UPDATE profiles SET role = 'parent' WHERE email = 'parent@example.com';`,
            },
            {
              issue: "duplicate key value violates unique constraint 'one_active_year_per_school'",
              cause: "A school already has an active school year. Only one is allowed per school.",
              fix: `-- Check existing active years
SELECT id, name, status FROM school_years WHERE school_id = '<SCHOOL_UUID>';

-- Archive the old one first if needed
UPDATE school_years SET status = 'archived' WHERE id = '<OLD_SY_UUID>';`,
            },
            {
              issue: "Demo data generation fails partway through",
              cause: "Prior partial run left orphaned data. The next generate will auto-clear before retrying.",
              fix: "Simply click Generate again — the route now clears any partial data before regenerating. If it keeps failing, check the run history panel for the error message.",
            },
            {
              issue: "School admin still sees read-only overlay after converting trial",
              cause: "SchoolContext caches trial state on load. The overlay lifts on the next page refresh.",
              fix: "Ask the admin to press F5 / hard-refresh their browser. The trial_status = 'converted' will be picked up on reload.",
            },
            {
              issue: "Photo upload fails silently (no error, image doesn't appear)",
              cause: "The updates-media storage bucket was not created, or was created as public instead of private.",
              fix: "Verify in Supabase Dashboard → Storage that the 'updates-media' bucket exists and is set to private. RLS policies are applied by migrations but the bucket itself must be created manually.",
            },
          ].map(({ issue, cause, fix }) => (
            <div key={issue} className="border border-border rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-foreground flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                {issue}
              </p>
              <p className="text-xs text-muted-foreground ml-6"><strong className="text-foreground">Cause:</strong> {cause}</p>
              <div className="ml-6">
                <p className="text-xs text-muted-foreground mb-1"><strong className="text-foreground">Fix:</strong></p>
                <CodeBlock>{fix}</CodeBlock>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
