/**
 * IEP form recovery utilities.
 * Manages localStorage-based recovery of unsaved IEP form state.
 *
 * Recovery key format: `iep_recovery_${userId}_${studentId}_${planId}_${schoolYearId}`
 * Ensures one user cannot access another user's recovery data.
 * Ensures recovery data is tied to the specific student and plan.
 */

/**
 * Generate a recovery storage key.
 * Scoped by: userId, studentId, planId, schoolYearId
 */
export function generateRecoveryKey(
  userId: string,
  studentId: string,
  planId: string | null,
  schoolYearId: string | null,
): string {
  const pid = planId ?? "new";
  const syi = schoolYearId ?? "none";
  return `iep_recovery_${userId}_${studentId}_${pid}_${syi}`;
}

/**
 * Check if recovery data exists and is fresh (< 30 days old).
 */
export function hasValidRecovery(recoveryKey: string): boolean {
  try {
    const json = localStorage.getItem(recoveryKey);
    if (!json) return false;

    const data = JSON.parse(json);
    const savedTime = new Date(data.timestamp).getTime();
    const now = Date.now();
    const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);

    return daysDiff < 30;
  } catch {
    return false;
  }
}

/**
 * Get recovery data with timestamp check.
 */
export function getRecoveryData<T>(
  recoveryKey: string,
): T & { timestamp: string } | null {
  try {
    const json = localStorage.getItem(recoveryKey);
    if (!json) return null;

    const data = JSON.parse(json) as T & { timestamp: string };
    const savedTime = new Date(data.timestamp).getTime();
    const now = Date.now();
    const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);

    if (daysDiff >= 30) {
      // Stale recovery data — remove it
      clearRecovery(recoveryKey);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Save recovery data (with timestamp).
 */
export function saveRecovery<T>(
  recoveryKey: string,
  data: T,
): void {
  try {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(recoveryKey, JSON.stringify(payload));
  } catch {
    // Silently fail if localStorage is full or disabled
    console.warn("Failed to save IEP recovery data (localStorage may be full or disabled)");
  }
}

/**
 * Clear recovery data for a specific key.
 */
export function clearRecovery(recoveryKey: string): void {
  try {
    localStorage.removeItem(recoveryKey);
  } catch {
    // Silently fail
  }
}

/**
 * Clear all stale recovery data (older than 30 days).
 * Scans all recovery keys and removes old ones.
 */
export function clearStaleRecovery(): void {
  try {
    const keys = Object.keys(localStorage);
    const recoveryKeys = keys.filter((k) => k.startsWith("iep_recovery_"));

    recoveryKeys.forEach((key) => {
      try {
        const json = localStorage.getItem(key);
        if (!json) return;

        const data = JSON.parse(json) as { timestamp: string };
        const savedTime = new Date(data.timestamp).getTime();
        const now = Date.now();
        const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);

        if (daysDiff >= 30) {
          localStorage.removeItem(key);
        }
      } catch {
        // Skip malformed entries
      }
    });
  } catch {
    // Silently fail
  }
}

/**
 * Check if saved draft is newer than recovery data.
 * Returns true if recovery data should be shown.
 */
export function isRecoveryNewer(
  recoveryTimestamp: string,
  draftUpdatedAt: string | null,
): boolean {
  if (!draftUpdatedAt) return true; // No draft yet, so recovery is "newer"
  const recoveryTime = new Date(recoveryTimestamp).getTime();
  const draftTime = new Date(draftUpdatedAt).getTime();
  return recoveryTime > draftTime;
}
