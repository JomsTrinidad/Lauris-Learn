/**
 * Recovery Prompt — shown when unsaved IEP work is found.
 *
 * Displays:
 *   - Message about unsaved work
 *   - Timestamp of recovery data
 *   - Restore and Discard buttons
 */

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecoveryPromptProps {
  timestamp: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function RecoveryPrompt({ timestamp, onRestore, onDiscard }: RecoveryPromptProps) {
  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown time";

  return (
    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 space-y-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <p className="font-medium text-sm text-amber-900">
            Unsaved IEP work was found
          </p>
          <p className="text-xs text-amber-800">
            Last saved locally at {formattedTime}. Your saved draft may be older than this recovery data.
          </p>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDiscard}
          className="border-amber-200 text-amber-900 hover:bg-amber-100"
        >
          Discard
        </Button>
        <Button type="button" size="sm" onClick={onRestore}>
          Restore
        </Button>
      </div>
    </div>
  );
}
