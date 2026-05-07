"use client";

import { ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { validateEnvironment } from "@/lib/monitoring";
import { OfflineBanner } from "./OfflineBanner";

/**
 * Wraps the app with TanStack Query's QueryClientProvider.
 * Enables caching, deduplication, and background refetching across the app.
 * Also provides lightweight offline detection via banner.
 * Runs environment validation once on mount.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    validateEnvironment();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      {children}
    </QueryClientProvider>
  );
}
