"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

const IMPERSONATION_KEY = "__ll_impersonating";

interface ImpersonationData {
  schoolId: string;
  schoolName: string;
}

export interface ActiveYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "archived" | "planned" | "closed";
}

export interface BrandingConfig {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  textSizeScale: "default" | "large" | "extra_large";
  spacingScale: "compact" | "default" | "relaxed";
}

export interface SchoolContextValue {
  schoolId: string | null;
  schoolName: string;
  activeYear: ActiveYear | null;
  userId: string | null;
  userRole: "super_admin" | "school_admin" | "teacher" | "parent" | null;
  userName: string;
  userAvatar: string | null;
  trialStatus: "active" | "expired" | "converted" | null;
  trialDaysLeft: number | null;
  isTrialExpired: boolean;
  subscriptionStatus: "trial" | "active" | "past_due" | "suspended" | "cancelled" | null;
  isDemo: boolean;
  isReadOnly: boolean;
  isImpersonating: boolean;
  branding: BrandingConfig;
  allSchoolYears: ActiveYear[];
  viewingYear: ActiveYear | null;
  isHistoricalView: boolean;
  loading: boolean;
  refresh: () => void;
  /** Update only the branding slice without triggering a full context reload. */
  patchBranding: (patch: Partial<BrandingConfig>) => void;
  setViewingYear: (year: ActiveYear) => void;
  startImpersonation: (schoolId: string, schoolName: string) => void;
  stopImpersonation: () => void;
}

const DEFAULT_BRANDING: BrandingConfig = {
  logoUrl: null,
  primaryColor: null,
  accentColor: null,
  textSizeScale: "default",
  spacingScale: "default",
};

const SchoolContext = createContext<SchoolContextValue>({
  schoolId: null,
  schoolName: "",
  activeYear: null,
  allSchoolYears: [],
  viewingYear: null,
  isHistoricalView: false,
  userId: null,
  userRole: null,
  userName: "",
  userAvatar: null,
  trialStatus: null,
  trialDaysLeft: null,
  isTrialExpired: false,
  subscriptionStatus: null,
  isDemo: false,
  isReadOnly: false,
  isImpersonating: false,
  branding: DEFAULT_BRANDING,
  loading: true,
  refresh: () => {},
  patchBranding: () => {},
  setViewingYear: () => {},
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

function calcTrialDaysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function SchoolProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [value, setValue] = useState<Omit<SchoolContextValue, "refresh" | "patchBranding" | "startImpersonation" | "stopImpersonation" | "setViewingYear" | "isHistoricalView">>({
    schoolId: null,
    schoolName: "",
    activeYear: null,
    allSchoolYears: [],
    viewingYear: null,
    userId: null,
    userRole: null,
    userName: "",
    userAvatar: null,
    trialStatus: null,
    trialDaysLeft: null,
    isTrialExpired: false,
    subscriptionStatus: null,
    isDemo: false,
    isReadOnly: false,
    isImpersonating: false,
    branding: DEFAULT_BRANDING,
    loading: true,
  });

  const load = useCallback(async () => {
    setValue((v) => ({ ...v, loading: true }));

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setValue((v) => ({ ...v, loading: false }));
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, role, full_name, avatar_url")
      .eq("id", user.id)
      .single();

    // Check for active impersonation (super admin only)
    let impersonating: ImpersonationData | null = null;
    if (profile?.role === "super_admin" && typeof window !== "undefined") {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      if (raw) {
        try { impersonating = JSON.parse(raw); } catch { /* ignore */ }
      }
    }

    const effectiveSchoolId = impersonating?.schoolId ?? profile?.school_id ?? null;

    if (!effectiveSchoolId) {
      setValue((v) => ({
        ...v,
        userId: user.id,
        userName: profile?.full_name ?? user.email ?? "",
        userAvatar: (profile as any)?.avatar_url ?? null,
        userRole: profile?.role ?? null,
        isImpersonating: false,
        loading: false,
      }));
      return;
    }

    const [{ data: school }, { data: schoolYears }] = await Promise.all([
      supabase
        .from("schools")
        .select("name, trial_start_date, trial_end_date, trial_status, subscription_status, is_demo, logo_url, primary_color, accent_color, text_size_scale, spacing_scale")
        .eq("id", effectiveSchoolId)
        .single(),
      supabase
        .from("school_years")
        .select("id, name, start_date, end_date, status")
        .eq("school_id", effectiveSchoolId)
        .order("start_date", { ascending: false }),
    ]);

    const allSchoolYears: ActiveYear[] = (schoolYears ?? []).map((y) => ({
      id: y.id,
      name: y.name,
      startDate: y.start_date,
      endDate: y.end_date,
      status: y.status as ActiveYear["status"],
    }));
    const activeYear = allSchoolYears.find((y) => y.status === "active") ?? null;

    const trialStatus = (school?.trial_status as "active" | "expired" | "converted") ?? null;
    const trialDaysLeft = calcTrialDaysLeft(school?.trial_end_date ?? null);
    const isTrialExpired = trialStatus === "expired" || (trialStatus === "active" && (trialDaysLeft ?? 1) <= 0);
    const subscriptionStatus = ((school as any)?.subscription_status as SchoolContextValue["subscriptionStatus"]) ?? null;
    const isDemo = ((school as any)?.is_demo as boolean) ?? false;
    const isImpersonating = !!impersonating;

    // Read-only when: trial expired OR subscription suspended/cancelled; always bypass for impersonating super admin
    const isHardBlocked = isTrialExpired || subscriptionStatus === "suspended" || subscriptionStatus === "cancelled";

    setValue({
      schoolId: effectiveSchoolId,
      schoolName: impersonating?.schoolName ?? school?.name ?? "Lauris Learn",
      activeYear,
      allSchoolYears,
      viewingYear: activeYear,
      userId: user.id,
      userRole: profile?.role ?? null,
      userName: profile?.full_name ?? "",
      userAvatar: (profile as any)?.avatar_url ?? null,
      trialStatus,
      trialDaysLeft,
      isTrialExpired,
      subscriptionStatus,
      isDemo,
      isReadOnly: isHardBlocked && !isImpersonating,
      isImpersonating,
      branding: {
        logoUrl: (school as any)?.logo_url ?? null,
        primaryColor: (school as any)?.primary_color ?? null,
        accentColor: (school as any)?.accent_color ?? null,
        textSizeScale: ((school as any)?.text_size_scale ?? "default") as BrandingConfig["textSizeScale"],
        spacingScale: ((school as any)?.spacing_scale ?? "default") as BrandingConfig["spacingScale"],
      },
      loading: false,
    });
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function patchBranding(patch: Partial<BrandingConfig>) {
    setValue((v) => ({ ...v, branding: { ...v.branding, ...patch } }));
  }

  function logImpersonationEvent(
    targetSchoolId: string,
    targetSchoolName: string,
    eventType: "impersonation_started" | "impersonation_ended",
  ) {
    fetch("/api/super-admin/impersonation-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetSchoolId, targetSchoolName, eventType }),
    }).catch(() => { /* audit failure must not block impersonation UX */ });
  }

  function startImpersonation(schoolId: string, schoolName: string) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify({ schoolId, schoolName }));
    }
    // Logging is handled by the caller (super-admin schools page) because that page
    // lives outside SchoolProvider and initiates the session directly via sessionStorage.
    load();
  }

  function stopImpersonation() {
    if (typeof window !== "undefined") {
      // Read school info before clearing so the end-event log is accurate.
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      if (raw) {
        try {
          const { schoolId, schoolName } = JSON.parse(raw) as ImpersonationData;
          logImpersonationEvent(schoolId, schoolName, "impersonation_ended");
        } catch { /* ignore parse errors */ }
      }
      sessionStorage.removeItem(IMPERSONATION_KEY);
    }
    load();
  }

  function setViewingYear(year: ActiveYear) {
    setValue((v) => ({ ...v, viewingYear: year }));
  }

  const isHistoricalView = value.activeYear !== null && value.viewingYear?.id !== value.activeYear?.id;

  return (
    <SchoolContext.Provider value={{ ...value, isHistoricalView, refresh: load, patchBranding, setViewingYear, startImpersonation, stopImpersonation }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchoolContext() {
  return useContext(SchoolContext);
}
