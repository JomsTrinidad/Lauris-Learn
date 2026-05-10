/**
 * useIepRecovery — custom hook for IEP form recovery.
 *
 * Handles:
 *   - Autosaving form state to localStorage every 5-10 seconds
 *   - Autosaving on major field changes (title, student change)
 *   - Loading recovery data on mount
 *   - Clearing recovery data on successful save
 *   - Browser unload warning for unsaved changes
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateRecoveryKey,
  getRecoveryData,
  saveRecovery,
  clearRecovery,
  isRecoveryNewer,
} from "./recovery-utils";

export interface IepRecoveryState {
  [key: string]: any;
}

export interface UseIepRecoveryOptions {
  userId: string;
  studentId: string;
  planId: string | null;
  schoolYearId: string | null;
  draftUpdatedAt: string | null;
  isEditing: boolean;
}

export function useIepRecovery(
  options: UseIepRecoveryOptions,
  formState: IepRecoveryState,
  onRestoreState: (data: IepRecoveryState) => void,
) {
  const { userId, studentId, planId, schoolYearId, draftUpdatedAt, isEditing } = options;
  const recoveryKey = generateRecoveryKey(userId, studentId, planId, schoolYearId);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  // ─── State ────────────────────────────────────────────────────────
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryTimestamp, setRecoveryTimestamp] = useState<string | null>(null);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);

  // ─── On mount: check for recovery data ────────────────────────────
  useEffect(() => {
    const recovery = getRecoveryData<IepRecoveryState>(recoveryKey);
    if (recovery) {
      const isNewer = isRecoveryNewer(recovery.timestamp, draftUpdatedAt);
      if (isNewer) {
        setRecoveryAvailable(true);
        setRecoveryTimestamp(recovery.timestamp);
        setShowRecoveryPrompt(true);
      } else {
        // Recovery data is stale compared to saved draft; clear it
        clearRecovery(recoveryKey);
      }
    }
  }, [recoveryKey, draftUpdatedAt]);

  // ─── Handle recovery restore ────────────────────────────────────────
  const handleRestore = useCallback(() => {
    const recovery = getRecoveryData<IepRecoveryState>(recoveryKey);
    if (recovery) {
      const { timestamp, ...data } = recovery;
      onRestoreState(data);
      setShowRecoveryPrompt(false);
      hasUnsavedChangesRef.current = true;
    }
  }, [recoveryKey, onRestoreState]);

  // ─── Handle recovery discard ────────────────────────────────────────
  const handleDiscardRecovery = useCallback(() => {
    clearRecovery(recoveryKey);
    setShowRecoveryPrompt(false);
    setRecoveryAvailable(false);
    hasUnsavedChangesRef.current = false;
  }, [recoveryKey]);

  // ─── Autosave to localStorage ──────────────────────────────────────
  const autosave = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      saveRecovery(recoveryKey, formState);
    }
  }, [recoveryKey, formState]);

  // ─── Set autosave interval (5-10 seconds) ──────────────────────────
  useEffect(() => {
    if (!isEditing) {
      // Don't autosave if not editing (e.g., view mode)
      return;
    }

    // Autosave every 7 seconds
    autosaveTimerRef.current = setInterval(autosave, 7000);

    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
      }
    };
  }, [autosave, isEditing]);

  // ─── Mark changes on major field updates ────────────────────────────
  const markChanged = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    // Trigger immediate autosave after a major change
    autosave();
  }, [autosave]);

  // ─── Clear recovery on successful save ──────────────────────────────
  const clearOnSave = useCallback(() => {
    clearRecovery(recoveryKey);
    hasUnsavedChangesRef.current = false;
  }, [recoveryKey]);

  // ─── Browser unload warning ────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current && isEditing) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditing]);

  // ─── Check for unsaved changes (for UI indicator) ────────────────────
  const hasUnsavedChanges = hasUnsavedChangesRef.current;

  return {
    showRecoveryPrompt,
    recoveryTimestamp,
    handleRestore,
    handleDiscardRecovery,
    markChanged,
    clearOnSave,
    hasUnsavedChanges,
  };
}
