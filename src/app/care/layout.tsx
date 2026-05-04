"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Stethoscope,
  Users,
  FileText,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { CareContext } from "@/features/care/CareContext";
import { listMyClinicMemberships } from "@/features/care/queries";
import type { ClinicMembership } from "@/features/care/types";

const NAV = [
  { href: "/care/children",  icon: Users,    label: "Children" },
  { href: "/care/documents", icon: FileText, label: "Documents" },
];

const ACTIVE_ORG_KEY = "__ll_care_active_org";

export default function CareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const mainRef = useRef<HTMLElement>(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  async function init() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email ?? "");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    setUserName(profile?.full_name ?? user.email ?? "");

    const mems = await listMyClinicMemberships();
    setMemberships(mems);

    if (mems.length === 0) {
      setActiveOrgId(null);
      setLoading(false);
      // Soft-redirect access-denied users to the dedicated page if they
      // landed on a different /care/* route directly.
      if (pathname !== "/care/access-denied") {
        router.replace("/care/access-denied");
      }
      return;
    }

    if (mems.length === 1) {
      setActiveOrgId(mems[0].organizationId);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(ACTIVE_ORG_KEY, mems[0].organizationId);
      }
    } else {
      // Multi-org: honour previous selection if still valid; otherwise
      // require the user to pick. We do NOT silently default.
      const stored =
        typeof window !== "undefined"
          ? sessionStorage.getItem(ACTIVE_ORG_KEY)
          : null;
      const matched = stored
        ? mems.find((m) => m.organizationId === stored)
        : undefined;
      setActiveOrgId(matched ? matched.organizationId : null);
    }

    setLoading(false);
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectOrg(orgId: string) {
    setActiveOrgId(orgId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(ACTIVE_ORG_KEY, orgId);
    }
    setOrgPickerOpen(false);
  }

  async function signOut() {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(ACTIVE_ORG_KEY);
    }
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

  // No memberships → render the access-denied child directly (no
  // chrome). The init() above has already redirected to /care/access-denied
  // if we landed elsewhere, so this also covers the bottom-nav escape
  // hatch.
  if (memberships.length === 0) {
    return <>{children}</>;
  }

  const activeMembership = memberships.find(
    (m) => m.organizationId === activeOrgId,
  );

  // Multi-org users without a selection see a chooser prompt.
  const requiresOrgChoice = memberships.length > 1 && !activeMembership;

  return (
    <CareContext.Provider
      value={{
        userId,
        userName,
        userEmail,
        memberships,
        activeOrganizationId: activeOrgId,
        activeOrganizationName: activeMembership?.organizationName ?? "",
        activeOrganizationKind: activeMembership?.organizationKind ?? null,
        activeRole: activeMembership?.role ?? null,
        isClinicAdmin: activeMembership?.role === "clinic_admin",
        setActiveOrganizationId: selectOrg,
        loading: false,
      }}
    >
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top header */}
        <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none">
                Lauris Care
              </p>
              {memberships.length === 1 && activeMembership && (
                <p className="text-sm font-semibold mt-1 truncate">
                  {activeMembership.organizationName}
                </p>
              )}
              {memberships.length > 1 && (
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setOrgPickerOpen((v) => !v)}
                    className="flex items-center gap-1 text-sm font-semibold hover:text-primary"
                  >
                    {activeMembership?.organizationName ??
                      "Select organization"}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {orgPickerOpen && (
                    <div className="absolute z-20 mt-1 left-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[220px]">
                      {memberships.map((m) => (
                        <button
                          key={m.membershipId}
                          type="button"
                          onClick={() => selectOrg(m.organizationId)}
                          className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                            m.organizationId === activeOrgId
                              ? "bg-muted font-medium"
                              : ""
                          }`}
                        >
                          <p>{m.organizationName}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {m.organizationKind.replace("_", " ")} · {m.role}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {userName || userEmail}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main
          ref={mainRef}
          className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full"
        >
          {requiresOrgChoice ? (
            <div className="text-center py-16">
              <p className="font-medium">Select an organization to continue.</p>
              <p className="text-sm text-muted-foreground mt-1">
                You belong to multiple organizations. Choose one in the
                top-left.
              </p>
            </div>
          ) : (
            children
          )}
        </main>

        <nav className="border-t border-border bg-card safe-bottom">
          <div className="flex max-w-4xl mx-auto">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
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
    </CareContext.Provider>
  );
}
