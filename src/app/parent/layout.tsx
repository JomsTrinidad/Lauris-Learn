"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, MessageSquare, User, CreditCard, LogOut, GraduationCap, TrendingUp, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";

interface ChildInfo {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  classId: string | null;
  messengerLink: string | null;
  studentCode: string | null;
}

const NAV = [
  { href: "/parent/dashboard", icon: Home,          label: "Home" },
  { href: "/parent/student",   icon: User,          label: "Child" },
  { href: "/parent/updates",   icon: MessageSquare, label: "Updates" },
  { href: "/parent/events",    icon: CalendarDays,  label: "Events" },
  { href: "/parent/progress",  icon: TrendingUp,    label: "Progress" },
  { href: "/parent/billing",   icon: CreditCard,    label: "Billing" },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [children_, setChildren_] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    // Find students linked to this user's email via guardians
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: guardianRows } = await (supabase as any)
      .from("guardians")
      .select(`
        student_id,
        students(
          id, first_name, last_name, student_code,
          school_id,
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
      // Prefer the enrollment whose school year is active, then fall back to any enrolled record
      const activeEnrollment =
        enrollments.find((e: any) => e.status === "enrolled" && e.classes?.school_years?.status === "active") ??
        enrollments.find((e: any) => e.status === "enrolled") ??
        enrollments[0];
      return [{
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        studentCode: s.student_code ?? null,
        className: activeEnrollment?.classes?.name ?? "—",
        classId: activeEnrollment?.class_id ?? null,
        messengerLink: activeEnrollment?.classes?.messenger_link ?? null,
      }];
    });

    setChildren_(kids);
    if (kids.length > 0 && !selectedChildId) setSelectedChildId(kids[0].id);

    // Get school name from first student
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstStudent = (guardianRows as any[])[0]?.students;
    if (firstStudent?.school_id) {
      setSchoolId(firstStudent.school_id);
      const { data: school } = await supabase.from("schools").select("name").eq("id", firstStudent.school_id).single();
      setSchoolName(school?.name ?? "");
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{schoolName || "School Portal"}</p>
            {selectedChild && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedChild.firstName} {selectedChild.lastName}
                {selectedChild.studentCode && (
                  <span className="font-mono ml-1">· {selectedChild.studentCode}</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Child switcher for multi-child families */}
          {children_.length > 1 && (
            <select
              value={selectedChildId ?? ""}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              {children_.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          )}
          <button
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Pass selectedChildId via URL param convention — child components read it */}
        {children_.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <GraduationCap className="w-12 h-12 mx-auto opacity-30" />
            <p className="font-medium">No students linked to your account.</p>
            <p className="text-sm">Ask your school to send you an invite link.</p>
          </div>
        ) : (
          // Clone children with selectedChildId context
          <ParentContext.Provider value={{ childId: selectedChildId, child: selectedChild, schoolName, schoolId, classId: selectedChild?.classId ?? null, messengerLink: selectedChild?.messengerLink ?? null }}>
            {children}
          </ParentContext.Provider>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="border-t border-border bg-card safe-bottom">
        <div className="flex max-w-2xl mx-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// Simple context so child pages can get the selected child's id
import { createContext, useContext } from "react";

interface ParentCtx {
  childId: string | null;
  child: ChildInfo | null;
  schoolName: string;
  schoolId: string | null;
  classId: string | null;
  messengerLink: string | null;
}
export const ParentContext = createContext<ParentCtx>({ childId: null, child: null, schoolName: "", schoolId: null, classId: null, messengerLink: null });
export function useParentContext() { return useContext(ParentContext); }
