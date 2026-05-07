"use client";

import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

/**
 * OfflineBanner — lightweight offline detection
 *
 * Shows a small, non-blocking banner at the top of the page when offline.
 * Allows users to see that the app is aware of their offline state
 * and why some operations may fail or take longer.
 */
export function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="flex items-center gap-2 text-amber-900 text-sm max-w-7xl mx-auto">
        <WifiOff className="w-4 h-4 flex-shrink-0" />
        <span>You are offline. Some operations may not work until your connection is restored.</span>
      </div>
    </div>
  );
}
