"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, MessageSquare, User, CreditCard, LogOut,
  GraduationCap, TrendingUp, CalendarDays, FileText, MoreHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandingApplier } from "@/components/BrandingApplier";
import { Spinner } from "@/components/ui/spinner";
import type { BrandingConfig } from "@/contexts/SchoolContext";

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

// Primary bottom nav — max 4 items so More fits on 320px screens
const NAV_PRIMARY = [
  { href: "/parent/dashboard", icon: Home,          label: "Home" },
  { href: "/parent/updates",   icon: MessageSquare, label: "Updates" },
  { href: "/parent/events",    icon: CalendarDays,  label: "Events" },
  { href: "/parent/progress",  icon: TrendingUp,    label: "Progress" },
] as const;

// Routes that belong under "More"
const MORE_ROUTES = ["/parent/student", "/parent/documents", "/parent/billing"];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [children_, setChildren_] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [branding, setBranding] = useState<Pick<BrandingConfig, "primaryColor" | "accentColor" | "textSizeScale" | "spacingScale">>({
    primaryColor: null, accentColor: null, textSizeScale: "default", spacingScale: "default",
  });
  const [showMore, setShowMore] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Scroll to top and close More sheet on route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setShowMore(false);
  }, [pathname]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: guardianRows } = await (supabase as any)
      .from("guardians")
      .select(`
        student_id,
        students(
          id, first_name, last_name, student_code,
          school_id,
          child_profile_id,
          enrollments(status, class_id, classes(name, messenger_link, school_years(status)))
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
      const activeEnrollment =
        enrollments.find((e: any) => e.status === "enrolled" && e.classes?.school_years?.status === "active") ??
        enrollments.find((e: any) => e.status === "enrolled") ??
        enrollments[0];
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
        accentColor:  (school as any)?.accent_color  ?? null,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const selectedChild = children_.find((c) => c.id === selectedChildId) ?? children_[0] ?? null;
  const moreActive = MORE_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <BrandingApplier branding={branding} />

      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border bg-card px-4 py-3 flex items-center justify-between z-30">
        {/* Child info — tapping opens child profile */}
        <Link
          href="/parent/student"
          className="flex items-center gap-3 hover:opacity-75 transition-opacity min-w-0"
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none truncate">{schoolName || "School Portal"}</p>
            {selectedChild && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {selectedChild.firstName} {selectedChild.lastName}
                {selectedChild.studentCode && (
                  <span className="font-mono ml-1">· {selectedChild.studentCode}</span>
                )}
              </p>
            )}
          </div>
        </Link>

        {/* Child switcher — only shown for multi-child families */}
        {children_.length > 1 && (
          <select
            value={selectedChildId ?? ""}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1 bg-background ml-2 flex-shrink-0"
          >
            {children_.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        )}
      </header>

      {/* ── Scrollable main content ──────────────────────────────────────────── */}
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

      {/* ── Fixed bottom nav ─────────────────────────────────────────────────── */}
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

          {/* More button */}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-[11px] transition-colors min-w-0 ${
              moreActive || showMore ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="More options"
          >
            <MoreHorizontal className="w-5 h-5 flex-shrink-0" />
            <span className="leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* ── More bottom sheet ────────────────────────────────────────────────── */}
      {showMore && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setShowMore(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 inset-x-0 z-50 bg-card rounded-t-2xl border-t border-border"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="max-w-2xl mx-auto px-4 pt-3 pb-3">
              {/* Drag handle */}
              <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />

              <div className="space-y-0.5">
                <Link
                  href="/parent/student"
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-3 py-3.5 rounded-xl transition-colors text-sm font-medium ${
                    pathname.startsWith("/parent/student")
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent/60 text-foreground"
                  }`}
                >
                  <User className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                  Child Profile
                </Link>

                <Link
                  href="/parent/documents"
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-3 py-3.5 rounded-xl transition-colors text-sm font-medium ${
                    pathname.startsWith("/parent/documents")
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent/60 text-foreground"
                  }`}
                >
                  <FileText className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                  Documents
                </Link>

                <Link
                  href="/parent/billing"
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-3 py-3.5 rounded-xl transition-colors text-sm font-medium ${
                    pathname.startsWith("/parent/billing")
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent/60 text-foreground"
                  }`}
                >
                  <CreditCard className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                  Billing
                </Link>

                <div className="border-t border-border/60 my-1" />

                <button
                  type="button"
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-red-50 text-red-600 transition-colors text-sm font-medium"
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
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
