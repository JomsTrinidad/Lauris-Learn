"use client";

import { useEffect, useState } from "react";
import { History, X, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { SupportTimeline } from "./SupportTimeline";
import { loadStudentSupportHistory } from "./timeline";
import type { StudentHistoryEvent } from "./timeline";

interface StudentSupportHistoryModalProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
  /** Optional: navigate to the Plans & Forms view for this student. */
  onOpenPlans?: () => void;
}

export function StudentSupportHistoryModal({
  studentId,
  studentName,
  onClose,
  onOpenPlans,
}: StudentSupportHistoryModalProps) {
  const [events, setEvents] = useState<StudentHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    loadStudentSupportHistory(supabase, studentId)
      .then(setEvents)
      .catch((err) => {
        console.error("[StudentSupportHistoryModal]", err);
        setError("Could not load support history.");
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <History className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Support History</p>
              <p className="text-xs text-muted-foreground truncate">{studentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Count badge — shown once loaded */}
        {!loading && !error && events.length > 0 && (
          <div className="px-4 pt-3 pb-0 flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              {events.length} coordination event{events.length !== 1 ? "s" : ""} across all support plans
            </p>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-8">{error}</p>
          ) : (
            <SupportTimeline
              events={events}
              showMonthDividers
              emptyLabel="No support coordination history yet. Events will appear here when plans are created and progressed."
            />
          )}
        </div>

        {/* Footer */}
        {onOpenPlans && (
          <div className="p-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => { onOpenPlans(); onClose(); }}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View support plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
