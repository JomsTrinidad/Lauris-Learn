import { useEffect, useState } from "react";

/**
 * useNetworkStatus — lightweight offline detection
 *
 * Returns true when online, false when offline.
 * Updates on window online/offline events.
 */
export function useNetworkStatus() {
  // Start with navigator.onLine state; browsers typically reflect actual connection
  const [isOnline, setIsOnline] = useState(
    typeof window !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    // Listener when user goes offline
    const handleOffline = () => setIsOnline(false);

    // Listener when user comes back online
    const handleOnline = () => setIsOnline(true);

    // Register listeners
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Cleanup
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return isOnline;
}
