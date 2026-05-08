import { useEffect, useState } from "react";

const LOCALSTORAGE_KEY = "lauris_getting_started_dismissed";

export interface UseGetStartedDisplayResult {
  shouldShowOnDashboard: boolean;
  isDismissed: boolean;
  dismiss: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function useGetStartedDisplay(
  profileCreatedAt: string | null | undefined
): UseGetStartedDisplayResult {
  const [isDismissed, setIsDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Determine if within 2-month window
  const isWithin2Months = (): boolean => {
    if (!profileCreatedAt) return false;

    const createdDate = new Date(profileCreatedAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // 2 months = 60 days (approximate)
    return diffDays < 60;
  };

  // Load dismissed state from localStorage
  useEffect(() => {
    setIsMounted(true);
    const dismissed = localStorage.getItem(LOCALSTORAGE_KEY) === "true";
    setIsDismissed(dismissed);
  }, []);

  const shouldShowOnDashboard = isMounted && !isDismissed && isWithin2Months();

  const dismiss = () => {
    localStorage.setItem(LOCALSTORAGE_KEY, "true");
    setIsDismissed(true);
    setOpen(false);
  };

  return {
    shouldShowOnDashboard,
    isDismissed,
    dismiss,
    open,
    setOpen,
  };
}
