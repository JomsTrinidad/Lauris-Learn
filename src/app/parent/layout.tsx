"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, MessageSquare, User, CreditCard, LogOut,
  GraduationCap, TrendingUp, CalendarDays, FileText, ClipboardList,
  ChevronRight, X as XIcon, Sparkles, Menu, UserMinus, Check,
} from "lucide-react";
import { fetchAttendanceToday } from "@/features/parent-journey/queries";
import { createClient } from "@/lib/supabase/client";
import { BrandingApplier } from "@/components/BrandingApplier";
import { Spinner } from "@/components/ui/spinner";
import type { BrandingConfig } from "@/contexts/SchoolContext";
import {
  fetchFamilySignals,
  deriveFamilyPulse,
  deriveActiveDomainsLabel,
  type FamilySignal,
  type FamilyPulse,
} from "@/features/parent-family/queries";

interface ChildInfo {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  classId: string | null;
  messengerLink: string | null;
  studentCode: string | null;
  childProfileId: string | null;
}

// Bottom nav — 4 items now (More absorbed into the family drawer). Cleaner
// pacing across narrow viewports; previously the 5-item layout pushed each
// label below readability at 320px. Per-child detail pages (Profile, Plans,
// Documents, Billing) live in the drawer's "More about X" section.
const NAV_PRIMARY = [
  { href: "/parent/dashboard", icon: Home,          label: "Home" },
  { href: "/parent/updates",   icon: MessageSquare, label: "Updates" },
  { href: "/parent/events",    icon: CalendarDays,  label: "Events" },
  { href: "/parent/progress",  icon: TrendingUp,    label: "Progress" },
] as const;

// Per-active-child links shown inside the family drawer under "More about
// {Name}". Each `href` is a top-level parent route that already reads the
// active child from ParentContext — no per-route params needed.
const CHILD_DETAIL_LINKS = [
  { href: "/parent/student",   icon: User,          label: "Child profile" },
  { href: "/parent/plans",     icon: ClipboardList, label: "Support plans" },
  { href: "/parent/documents", icon: FileText,      label: "Documents" },
  { href: "/parent/billing",   icon: CreditCard,    label: "Billing" },
] as const;

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [children_, setChildren_] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string>("");
  const [parentEmail, setParentEmail] = useState<string>("");
  const [branding, setBranding] = useState<Pick<BrandingConfig, "primaryColor" | "themeKey" | "textSizeScale" | "spacingScale">>({
    primaryColor: null, themeKey: null, textSizeScale: "default", spacingScale: "default",
  });
  // Family drawer state. `familySignals` is fetched once children are known
  // and lazily refreshed whenever the drawer is opened so the pulse labels
  // stay calm-current. Null while loading; empty Map after fetch if no
  // children. Each child's signal is also re-derived against `deriveFamilyPulse`
  // at render time so the text stays human ("Quiet · 3d ago" vs raw counts).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [familySignals, setFamilySignals] = useState<Map<string, FamilySignal> | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Scroll to top + close drawer on route change. Family drawer behaves like
  // a sheet — closes when navigation lands so the new page is the active
  // surface, not the drawer.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Family signals refresh — runs whenever the drawer opens. Cheap (2 batched
  // queries) and parents who open the drawer expect to see current state.
  // Initial fetch also fires once children_ is populated so the first open
  // already has data.
  useEffect(() => {
    if (children_.length === 0) return;
    refreshFamilySignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children_]);

  useEffect(() => {
    if (drawerOpen && children_.length > 0) {
      refreshFamilySignals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  async function refreshFamilySignals() {
    const inputs = children_.map((c) => ({
      id: c.id,
      classId: c.classId,
      childProfileId: c.childProfileId,
    }));
    const sigs = await fetchFamilySignals(supabase, inputs);
    setFamilySignals(sigs);
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    setParentEmail(user.email ?? "");
    const rawName = ((user.user_metadata?.full_name ?? user.user_metadata?.name ?? "") as string).trim();
    setParentName(rawName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: guardianRows } = await (supabase as any)
      .from("guardians")
      .select(`
        student_id,
        students(
          id, first_name, last_name, student_code,
          school_id,
          child_profile_id,
          enrollments(status, class_id, classes(name, messenger_link, school_years(status, start_date)))
        )
      `)
      .eq("email", user.email);

    if (!guardianRows || guardianRows.length === 0) {
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kids: ChildInfo[] = (guardianRows as any[]).flatMap((g: any) => {
      const s = g.students;
      if (!s) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enrollments = (s.enrollments ?? []) as any[];
      // Phase 5E — Transition & lifecycle continuity. The fallback for a
      // transitioned child (graduated / withdrawn — no `enrolled` row) must
      // anchor on their MOST RECENT placement, not an arbitrary/oldest one.
      // `enrollments[0]` was unordered (PostgREST returns insertion order,
      // typically oldest-first), so a child who progressed Toddler → Kinder
      // and graduated would be re-framed by their Toddler class — the
      // "re-framing the child from zero" rupture the lifecycle directive
      // warns against. Sorting by school-year start_date descending anchors
      // them where they finished. See docs/TRANSITION_AND_LIFECYCLE_CONTINUITY.md §7.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mostRecentEnrollment = [...enrollments].sort((a: any, b: any) =>
        (b.classes?.school_years?.start_date ?? "").localeCompare(
          a.classes?.school_years?.start_date ?? ""))[0];
      const activeEnrollment =
        enrollments.find((e: any) => e.status === "enrolled" && e.classes?.school_years?.status === "active") ??
        enrollments.find((e: any) => e.status === "enrolled") ??
        mostRecentEnrollment;
      return [{
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        studentCode: s.student_code ?? null,
        childProfileId: s.child_profile_id ?? null,
        className: activeEnrollment?.classes?.name ?? "—",
        classId: activeEnrollment?.class_id ?? null,
        messengerLink: activeEnrollment?.classes?.messenger_link ?? null,
      }];
    });

    setChildren_(kids);
    if (kids.length > 0 && !selectedChildId) setSelectedChildId(kids[0].id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstStudent = (guardianRows as any[])[0]?.students;
    if (firstStudent?.school_id) {
      setSchoolId(firstStudent.school_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: school } = await (supabase as any).from("schools")
        .select("name, primary_color, accent_color, text_size_scale, spacing_scale")
        .eq("id", firstStudent.school_id)
        .single();
      setSchoolName((school as any)?.name ?? "");
      setBranding({
        primaryColor: (school as any)?.primary_color ?? null,
        themeKey:     (school as any)?.accent_color  ?? null,
        textSizeScale: ((school as any)?.text_size_scale ?? "default") as BrandingConfig["textSizeScale"],
        spacingScale:  ((school as any)?.spacing_scale  ?? "default") as BrandingConfig["spacingScale"],
      });
    }

    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function switchChild(childId: string) {
    setSelectedChildId(childId);
    setDrawerOpen(false);
    // If the parent is on a per-child detail page, the page itself reacts
    // to ParentContext changes — no router push needed. If they're on Home,
    // it just re-renders for the new child.
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const selectedChild = children_.find((c) => c.id === selectedChildId) ?? children_[0] ?? null;
  const parentFirstName = parentName ? parentName.split(" ")[0] : "";

  // Phase 17 — drawer-trigger preview cue. Computes whether ANY child other
  // than the active one has fresh activity worth seeing. When true, the
  // hamburger gets a small dot — the parent of 3 kids notices the dot on the
  // hamburger and intuitively reaches for the drawer. Single-child families
  // never see this cue (no other children to surface).
  const hasOtherChildrenWithFreshActivity = children_.length > 1 && familySignals !== null
    && children_.some((c) => {
      if (c.id === selectedChildId) return false;
      const sig = familySignals.get(c.id);
      return sig !== undefined && (sig.freshCount > 0 || sig.hasFeaturedHighlight);
    });

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <BrandingApplier branding={branding} />

      {/* ── Top header ──────────────────────────────────────────────────────────
          Phase 17 — drawer trigger separated from child identity.
          Parents mentally map the child's name as "who I am viewing" — NOT
          as "the navigation system." Conflating them (Phase 15's brand-as-
          drawer-trigger) meant single-child parents would never discover
          the drawer, and multi-child parents felt their kid's name had been
          appropriated as a menu button.
          New split:
            • LEFT — hamburger button → opens family drawer. Universal symbol.
              Carries a small fresh dot when ANY non-active child has fresh
              activity (Phase 17 preview cue — the parent sees the dot and
              knows to open the drawer without opening it first).
            • CENTER — brand: child avatar + name + class. Tap = link to
              /parent/student (the child profile). Calm, semantic, no
              instructive chevron. This is the "who I'm viewing" anchor. */}
      <header className="flex-shrink-0 border-b border-border bg-card px-4 py-3 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex-shrink-0 -ml-1 w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Open family panel"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <Menu className="w-5 h-5" />
            {hasOtherChildrenWithFreshActivity && (
              <span
                className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary"
                aria-label="Other children have new activity"
              />
            )}
          </button>
          {selectedChild ? (
            <Link
              href="/parent/student"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0 flex-1"
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary-foreground">
                  {selectedChild.firstName.charAt(0)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">
                  {selectedChild.firstName} {selectedChild.lastName}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5">
                  {selectedChild.className}
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-primary-foreground" />
              </div>
              <p className="text-sm font-semibold leading-tight">Lauris Parent</p>
            </div>
          )}
        </div>
      </header>

      {/* ── Scrollable main content ────────────────────────────────────────── */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 max-w-2xl mx-auto w-full [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full"
        style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        {children_.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <GraduationCap className="w-12 h-12 mx-auto opacity-30" />
            <p className="font-medium">No students linked to your account.</p>
            <p className="text-sm">Ask your school to send you an invite link.</p>
          </div>
        ) : (
          <ParentContext.Provider value={{
            childId: selectedChildId,
            child: selectedChild,
            schoolName,
            schoolId,
            classId: selectedChild?.classId ?? null,
            messengerLink: selectedChild?.messengerLink ?? null,
            childProfileId: selectedChild?.childProfileId ?? null,
          }}>
            {children}
          </ParentContext.Provider>
        )}
      </main>

      {/* ── Fixed bottom nav (4 items — More absorbed by family drawer) ──── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex max-w-2xl mx-auto">
          {NAV_PRIMARY.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-[11px] transition-colors min-w-0 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="leading-none">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Family drawer (slide-from-left) ────────────────────────────────────
          The family continuity hub. Replaces the old More bottom sheet, which
          read as a generic SaaS settings menu. New structure:
            1. Parent header (small, ambient — who is signed in)
            2. "Your family" section — one card per child with active state
               and a quiet pulse signal ("New highlight" / "3 new this week" /
               "Quiet · 4d ago"). Tap a card to switch. This is the family
               glanceability layer — a parent of 3 kids learns which one is
               worth checking before they open anyone's profile.
            3. "More about {Active Child}" — the per-child detail links that
               used to live in More (Profile, Plans, Documents, Billing).
               Anchored to the active child so the relationship is explicit.
            4. Sign out at the very bottom — quiet utility, no decoration.
          Slides from the left because that's where the trigger lives (brand
          block in top-left). Slide direction always points toward the
          trigger — basic motion-orientation hygiene. */}
      {drawerOpen && (
        <FamilyDrawer
          parentFirstName={parentFirstName}
          parentEmail={parentEmail}
          schoolName={schoolName}
          schoolId={schoolId}
          family={children_}
          selectedChildId={selectedChildId}
          signals={familySignals}
          pathname={pathname}
          onClose={() => setDrawerOpen(false)}
          onSwitchChild={switchChild}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}

// ── Family drawer component ───────────────────────────────────────────────────

interface FamilyDrawerProps {
  parentFirstName: string;
  parentEmail: string;
  schoolName: string;
  schoolId: string | null;
  // Phase 20 — renamed from `children` (React reserved prop name; ESLint
  // react/no-children-prop). Same payload: the family of ChildInfo records.
  family: ChildInfo[];
  selectedChildId: string | null;
  signals: Map<string, FamilySignal> | null;
  pathname: string;
  onClose: () => void;
  onSwitchChild: (childId: string) => void;
  onSignOut: () => void;
}

function FamilyDrawer({
  parentFirstName,
  parentEmail,
  schoolName,
  schoolId,
  family,
  selectedChildId,
  signals,
  pathname,
  onClose,
  onSwitchChild,
  onSignOut,
}: FamilyDrawerProps) {
  const activeChild = family.find((c) => c.id === selectedChildId) ?? family[0];
  return (
    <>
      {/* Backdrop — tap to close. Slightly softer than the old More sheet's
          /40 so the drawer feels like a layer rather than a modal blocker. */}
      <div
        className="fixed inset-0 z-40 bg-black/35 animate-in fade-in-0 duration-150"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — slides from left. Max width 20rem (320px) on phone, capped
          so the underlying page stays visible. */}
      <div
        className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-sm bg-card flex flex-col shadow-xl animate-in slide-in-from-left duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Family panel"
      >
        {/* ── Drawer header — "Logged in as" card style ──────────────────────
            Borrowed compositional pattern from the Figma reference: a small
            tinted card up top that carries identity context (who is signed
            in + which school they're connected to). Reads as a calm header
            anchor without feeling like a settings page. The title row above
            the card mirrors the Figma's "Menu" / X-close arrangement but
            uses the parent-first phrasing the directive asks for. */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold leading-tight">Family</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 -mt-1"
              aria-label="Close family panel"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          {parentEmail && (
            <div className="bg-primary/5 rounded-xl px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Signed in as
              </p>
              <p className="text-sm font-semibold leading-tight mt-0.5">
                {parentFirstName || parentEmail.split("@")[0]}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5">
                {parentEmail}
              </p>
              {schoolName && (
                <p className="text-[11px] text-muted-foreground/70 leading-tight truncate mt-1">
                  {schoolName}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* ── Family section ──────────────────────────────────────────── */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 mb-2">
              {family.length > 1 ? "Your children" : "Your child"}
            </h3>
            <div className="space-y-1">
              {family.map((child) => {
                const isActive = child.id === selectedChildId;
                const signal = signals?.get(child.id);
                const pulse: FamilyPulse = deriveFamilyPulse(signal);
                const domainsLabel = deriveActiveDomainsLabel(signal) ?? child.className;
                return (
                  <ChildCard
                    key={child.id}
                    child={child}
                    isActive={isActive}
                    pulse={pulse}
                    domainsLabel={domainsLabel}
                    onClick={() => onSwitchChild(child.id)}
                  />
                );
              })}
            </div>
          </section>

          {/* ── Today for [Child] section (Phase 20 — operations hub) ───────
              Daily operational actions for the active child. Lives between
              "Your children" (family scan) and "More about X" (long-term
              records). The whole section hides when no operational rows
              are visible — calm by absence. Mounted only when there's an
              active child. */}
          {activeChild && (
            <TodayForChildSection
              child={activeChild}
              schoolId={schoolId}
            />
          )}

          {/* ── "More about {active child}" section ─────────────────────── */}
          {activeChild && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 mb-2">
                More about {activeChild.firstName}
              </h3>
              <div className="space-y-0.5">
                {CHILD_DETAIL_LINKS.map(({ href, icon: Icon, label }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent/60 text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                      <span className="flex-1">{label}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Account utility (quiet, isolated at bottom) ─────────────── */}
          <section className="pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 text-red-600 transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

// ── Today for [Child] section (drawer-internal operations hub) ───────────────
// Phase 20 — operational actions live here instead of on the homepage.
// Self-contained:
//   • Queries attendance_records + absence_notifications on mount and on
//     childId change (cheap; runs only while the drawer is open).
//   • Owns the absence form state — no lifting required.
//   • Hides entirely when there's nothing actionable (calm by absence).
//
// The section is the natural home for future Care/Medical operations:
// "Running late," "Cancel therapy session," "Reschedule," etc. Each future
// row is a calm link with an inline expand pattern matching this one. The
// section header doesn't change as actions multiply.

interface TodayActionState {
  loading: boolean;
  attendanceMarked: boolean;
  absenceReported: boolean;
}

function TodayForChildSection({
  child,
  schoolId,
}: {
  child: ChildInfo;
  schoolId: string | null;
}) {
  const supabase = createClient();
  const [state, setState] = useState<TodayActionState>({
    loading: true,
    attendanceMarked: false,
    absenceReported: false,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-query whenever the active child changes (parent switched kids from
  // the drawer-above section without closing the drawer — although in our
  // flow that path also closes the drawer; this is defensive).
  useEffect(() => {
    let cancelled = false;
    async function loadTodayState() {
      setState({ loading: true, attendanceMarked: false, absenceReported: false });
      setFormOpen(false);
      setReason("");
      setError(null);
      const today = new Date().toISOString().split("T")[0];
      const [att, absRow] = await Promise.all([
        fetchAttendanceToday(supabase, child.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("absence_notifications")
          .select("id")
          .eq("student_id", child.id)
          .eq("date", today)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        attendanceMarked: att.status !== null,
        absenceReported: !!absRow.data,
      });
    }
    loadTodayState();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id]);

  async function submitAbsence() {
    if (!schoolId) return;
    setSubmitting(true);
    setError(null);
    const today = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("absence_notifications")
      .insert({
        school_id: schoolId,
        student_id: child.id,
        class_id: child.classId,
        date: today,
        reason: reason.trim() || null,
      });
    setSubmitting(false);
    if (err) {
      // 23505 = unique violation; treat as already-reported (idempotent).
      if (err.code === "23505") {
        setState((s) => ({ ...s, absenceReported: true }));
        setFormOpen(false);
      } else {
        setError("Could not send notification. Please try again.");
      }
    } else {
      setState((s) => ({ ...s, absenceReported: true }));
      setFormOpen(false);
      setReason("");
    }
  }

  // Section hides entirely when nothing is actionable.
  //   • loading → render the section frame but no rows (avoids flash)
  //   • attendance already marked by the school → no absence row needed
  //   • absence reported & nothing else → still show the calm confirmation
  if (state.loading) return null;
  if (state.attendanceMarked && !state.absenceReported) return null;

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 mb-2">
        Today for {child.firstName}
      </h3>
      {state.absenceReported ? (
        // Calm confirmation row — same shape as the action rows so the
        // section reads as "the action you took today" rather than as a
        // status banner.
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm">
          <Check className="w-4 h-4 flex-shrink-0 text-green-600" aria-hidden />
          <span className="flex-1 text-muted-foreground">Absence sent to school today.</span>
        </div>
      ) : formOpen ? (
        // Inline form. Fits the drawer width (max ~360px usable). The
        // submit button keeps the amber accent at commit-time only — that's
        // earned color, not chrome.
        <div className="px-2 pb-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            Let the school know {child.firstName} won&apos;t be in today.
          </p>
          <input
            type="text"
            placeholder="Reason (optional) — e.g. Sick"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitAbsence}
              disabled={submitting}
              className="flex-1 text-sm font-medium bg-amber-500 text-white rounded-lg py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Notify school"}
            </button>
            <button
              type="button"
              onClick={() => { setFormOpen(false); setReason(""); setError(null); }}
              className="px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        // Idle row. Visually matches the "More about X" row pattern below
        // (icon + label + chevron) for drawer consistency.
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium hover:bg-accent/60 text-foreground"
        >
          <UserMinus className="w-4 h-4 flex-shrink-0 text-muted-foreground/70" />
          <span className="flex-1 text-left">Mark absent today</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
        </button>
      )}
    </section>
  );
}

// ── Child card (drawer-internal) ──────────────────────────────────────────────
// Per-child surface in the family drawer. Visual treatment borrowed from the
// Figma reference: deterministic avatar color per child (so Olivia stays
// purple across visits, Emma stays rose, etc.), domain subtitle ("School ·
// Therapy"), and a tiny right-side dot for fresh activity (the 0.2s
// family scan). The pulse text below the subtitle gives the 0.5s "what
// kind of thing" follow-up read.
//
// Active state: subtle primary tint + ring + "Viewing" pill. The avatar
// color does NOT change for active state — child identity stays consistent.

const AVATAR_PALETTE = [
  { bg: "bg-purple-500", text: "text-white" },
  { bg: "bg-rose-500",   text: "text-white" },
  { bg: "bg-blue-500",   text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-amber-500",  text: "text-white" },
  { bg: "bg-indigo-500", text: "text-white" },
] as const;

function getAvatarPalette(childId: string): (typeof AVATAR_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < childId.length; i++) {
    hash = (hash + childId.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[hash];
}

const PULSE_TONE_CLS: Record<FamilyPulse["tone"], string> = {
  highlight: "text-amber-700",
  fresh:     "text-primary",
  quiet:     "text-muted-foreground/70",
  empty:     "text-muted-foreground/40",
};

const PULSE_DOT_CLS: Record<FamilyPulse["tone"], string> = {
  highlight: "bg-amber-500",
  fresh:     "bg-primary",
  quiet:     "",  // no dot for quiet — calm by absence
  empty:     "",
};

function ChildCard({
  child,
  isActive,
  pulse,
  domainsLabel,
  onClick,
}: {
  child: ChildInfo;
  isActive: boolean;
  pulse: FamilyPulse;
  domainsLabel: string;
  onClick: () => void;
}) {
  const palette = getAvatarPalette(child.id);
  const dotCls = PULSE_DOT_CLS[pulse.tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        isActive
          ? "bg-primary/8 ring-1 ring-primary/20"
          : "hover:bg-accent/40"
      }`}
      aria-pressed={isActive}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${palette.bg} ${palette.text}`}
      >
        <span className="text-sm font-semibold">
          {child.firstName.charAt(0)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold leading-tight truncate ${isActive ? "text-primary" : "text-foreground"}`}>
            {child.firstName} {child.lastName}
          </p>
          {isActive && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-primary/70 flex-shrink-0">
              Viewing
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
          {domainsLabel}
        </p>
        {pulse.text && pulse.tone !== "quiet" && pulse.tone !== "empty" && (
          <p className={`text-[11px] leading-tight mt-1 flex items-center gap-1 ${PULSE_TONE_CLS[pulse.tone]}`}>
            {pulse.tone === "highlight" && <Sparkles className="w-3 h-3 flex-shrink-0" />}
            <span className="truncate">{pulse.text}</span>
          </p>
        )}
      </div>
      {/* Right-side fresh dot — Figma-borrowed. Only renders when there's
          actual fresh activity (highlight or fresh items in the last 72h).
          For "quiet" or "empty" pulses the dot is hidden — calm by absence,
          parents don't see a dot for every child every time. */}
      {dotCls && (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`}
          aria-label={`${child.firstName} has new activity`}
        />
      )}
    </button>
  );
}

// ── Context ───────────────────────────────────────────────────────────────────
import { createContext, useContext } from "react";

interface ParentCtx {
  childId: string | null;
  child: ChildInfo | null;
  schoolName: string;
  schoolId: string | null;
  classId: string | null;
  messengerLink: string | null;
  childProfileId: string | null;
}
export const ParentContext = createContext<ParentCtx>({
  childId: null, child: null, schoolName: "", schoolId: null,
  classId: null, messengerLink: null, childProfileId: null,
});
export function useParentContext() { return useContext(ParentContext); }
