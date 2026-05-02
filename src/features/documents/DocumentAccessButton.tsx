"use client";

/**
 * View / Download button that routes through the Phase C API.
 *
 * Calls openDocumentForAccess() which:
 *   - hits POST /api/documents/[id]/access
 *   - on success, opens the signed URL in a new tab and dereferences it
 *   - on denial, throws DocumentAccessError with a sanitized message
 *
 * The signed URL is never assigned to React state, props, or refs in this
 * component — it lives only inside the openDocumentForAccess call.
 */

import { useState } from "react";
import { Eye, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  openDocumentForAccess,
  DocumentAccessError,
  type DocumentAccessAction,
} from "./documents-api";

export interface DocumentAccessButtonProps {
  docId: string;
  action: Extract<DocumentAccessAction, "view" | "download">;
  /** Compact icon-only button (for table rows) vs labeled button. */
  compact?: boolean;
  /** Notified when an error occurs. Caller is expected to surface a toast. */
  onError?: (message: string) => void;
  /** When the doc is known not to allow this action, we hide the button. */
  hidden?: boolean;
}

export function DocumentAccessButton({
  docId,
  action,
  compact = false,
  onError,
  hidden = false,
}: DocumentAccessButtonProps) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (hidden) return null;

  const Icon = action === "view" ? Eye : Download;
  const label = action === "view" ? "View" : "Download";

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await openDocumentForAccess(docId, action);
    } catch (err) {
      const msg =
        err instanceof DocumentAccessError
          ? err.message
          : "Couldn't open the document.";
      setLocalError(msg);
      onError?.(msg);
      // Auto-clear local error after a few seconds.
      setTimeout(() => setLocalError(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={label}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md transition-colors",
          compact
            ? "p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            : "px-3 py-1.5 text-sm border border-border hover:bg-muted",
          busy && "opacity-60 cursor-wait",
        )}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
        {!compact && <span>{label}</span>}
      </button>
      {localError && !compact && (
        <span className="absolute top-full mt-1 right-0 whitespace-nowrap text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 z-20">
          {localError}
        </span>
      )}
    </span>
  );
}
