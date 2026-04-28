"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AlertTriangle, XCircle, Eye, X, Ban } from "lucide-react";
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

function SubscriptionBanner() {
  const { subscriptionStatus, isImpersonating } = useSchoolContext();
  const [dismissed, setDismissed] = useState(false);

  // Super admin impersonating: skip — they need to see even broken schools
  if (isImpersonating) return null;
  if (!subscriptionStatus) return null;

  if (subscriptionStatus === "suspended") {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Ban className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">This account has been suspended.</span>
          <span className="hidden sm:inline">Contact support to reactivate your subscription.</span>
        </div>
        <a
          href="mailto:hello@laurislearn.com?subject=Account Suspension"
          className="ml-4 px-3 py-1 bg-white text-red-600 rounded-md text-xs font-semibold hover:bg-red-50 transition-colors"
        >
          Contact Us
        </a>
      </div>
    );
  }

  if (subscriptionStatus === "cancelled") {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Your subscription has been cancelled.</span>
          <span className="hidden sm:inline">Reactivate to regain full access.</span>
        </div>
        <a
          href="mailto:hello@laurislearn.com?subject=Reactivation Request"
          className="ml-4 px-3 py-1 bg-white text-red-600 rounded-md text-xs font-semibold hover:bg-red-50 transition-colors"
        >
          Reactivate
        </a>
      </div>
    );
  }

  if (subscriptionStatus === "past_due" && !dismissed) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-medium">Payment past due.</span>
            {" "}Please update your payment method to avoid service interruption.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="mailto:hello@laurislearn.com?subject=Payment Update"
            className="px-3 py-1 bg-white text-amber-600 rounded-md text-xs font-semibold hover:bg-amber-50 transition-colors"
          >
            Update Payment
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
          Viewing as <span className="font-semibold">{schoolName}</span>
          <span className="hidden sm:inline"> — Super Admin impersonation. Any writes are logged with your identity.</span>
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
  const { schoolName, activeYear, userName, userRole, userId, userAvatar, loading, isReadOnly, isImpersonating, subscriptionStatus, branding, allSchoolYears, viewingYear, setViewingYear } = useSchoolContext();
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

  // Super admin without an active impersonation session belongs in /super-admin/schools,
  // not the school dashboard (they have no school_id so all pages show empty data).
  useEffect(() => {
    if (!loading && userRole === "super_admin" && !isImpersonating) {
      router.replace("/super-admin/schools");
    }
  }, [loading, userRole, isImpersonating, router]);

  // Pages that only school_admin (or super_admin) may access.
  // Teachers are redirected to dashboard; RLS already prevents data access,
  // but this avoids confusing empty screens for non-admin staff.
  const ADMIN_ONLY_PREFIXES = ["/settings", "/finance"];
  useEffect(() => {
    if (!loading && userRole === "teacher") {
      const blocked = ADMIN_ONLY_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (blocked) router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userRole, pathname, router]);

  if (loading || userRole === "parent" || (userRole === "super_admin" && !isImpersonating)) {
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
      <SubscriptionBanner />
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
            showBackToDashboard={pathname !== "/dashboard"}
          />
          <main ref={mainRef} className={`flex-1 overflow-y-auto p-6 ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
            {isReadOnly && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 pointer-events-auto opacity-100">
                {subscriptionStatus === "suspended"
                  ? "Your account is suspended. Data is read-only. "
                  : subscriptionStatus === "cancelled"
                  ? "Your subscription has been cancelled. Data is read-only. "
                  : "Your trial has expired. Data is read-only. "}
                <a href="mailto:hello@laurislearn.com?subject=Account Access" className="underline font-medium">
                  Contact us to restore access.
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
