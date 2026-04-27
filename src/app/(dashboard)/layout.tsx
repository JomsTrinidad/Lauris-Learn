"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, XCircle, Eye, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BrandingApplier } from "@/components/BrandingApplier";
import { SchoolProvider, useSchoolContext } from "@/contexts/SchoolContext";
import { Spinner } from "@/components/ui/spinner";

function TrialBanner() {
  const { trialStatus, trialDaysLeft, isTrialExpired } = useSchoolContext();
  const [dismissed, setDismissed] = useState(false);

  if (!trialStatus || trialStatus === "converted" || dismissed) return null;

  if (isTrialExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Your trial has expired.</span>
          <span className="hidden sm:inline">Upgrade to continue using Lauris Learn.</span>
        </div>
        <a
          href="mailto:hello@laurislearn.com?subject=Upgrade Request"
          className="ml-4 px-3 py-1 bg-white text-red-600 rounded-md text-xs font-semibold hover:bg-red-50 transition-colors"
        >
          Upgrade Now
        </a>
      </div>
    );
  }

  if (trialDaysLeft !== null && trialDaysLeft <= 7) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-medium">{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left</span>
            {" "}in your free trial.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="mailto:hello@laurislearn.com?subject=Upgrade Request"
            className="px-3 py-1 bg-white text-amber-600 rounded-md text-xs font-semibold hover:bg-amber-50 transition-colors"
          >
            Upgrade
          </a>
          <button onClick={() => setDismissed(true)} className="hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function HistoricalViewBanner() {
  // Suppressed until historical filtering is fully wired to page queries.
  return null;
}

function ImpersonationBanner() {
  const { isImpersonating, schoolName, stopImpersonation } = useSchoolContext();
  const router = useRouter();

  if (!isImpersonating) return null;

  function handleExit() {
    stopImpersonation();
    router.push("/super-admin/schools");
  }

  return (
    <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span>
          Viewing as <span className="font-semibold">{schoolName}</span> — Super Admin impersonation mode
        </span>
      </div>
      <button
        onClick={handleExit}
        className="px-3 py-1 bg-white text-blue-600 rounded-md text-xs font-semibold hover:bg-blue-50 transition-colors"
      >
        Exit Impersonation
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { schoolName, activeYear, userName, userRole, userId, userAvatar, loading, isTrialExpired, branding, allSchoolYears, viewingYear, setViewingYear } = useSchoolContext();
  const router = useRouter();
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!loading && userRole === "parent") {
      router.replace("/parent/dashboard");
    }
  }, [loading, userRole, router]);

  if (loading || userRole === "parent") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  const yearLabel = viewingYear?.name ?? activeYear?.name ?? "No Active Year";
  const roleLabel =
    userRole === "school_admin" ? "School Admin"
    : userRole === "teacher"   ? "Teacher"
    : userRole === "super_admin" ? "Super Admin"
    : "User";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BrandingApplier branding={branding} />
      {/* System banners */}
      <ImpersonationBanner />
      <TrialBanner />
      <HistoricalViewBanner />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          schoolName={schoolName || "Lauris Learn"}
          schoolYear={yearLabel}
          userRole={userRole}
          logoUrl={branding.logoUrl}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            userName={userName || "User"}
            userRole={roleLabel}
            schoolYear={yearLabel}
            schoolName={schoolName || "Lauris Learn"}
            userAvatar={userAvatar}
            allSchoolYears={allSchoolYears}
            viewingYear={viewingYear}
            onSelectYear={setViewingYear}
          />
          <main ref={mainRef} className={`flex-1 overflow-y-auto p-6 ${isTrialExpired ? "pointer-events-none opacity-60" : ""}`}>
            {isTrialExpired && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 pointer-events-auto opacity-100">
                Your trial has expired. Data is read-only.{" "}
                <a href="mailto:hello@laurislearn.com?subject=Upgrade Request" className="underline font-medium">
                  Contact us to upgrade.
                </a>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SchoolProvider>
      <Shell>{children}</Shell>
    </SchoolProvider>
  );
}
