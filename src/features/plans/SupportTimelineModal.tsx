"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { SupportTimeline } from "./SupportTimeline";
import { loadSupportTimeline } from "./timeline";
import type { SupportTimelineEvent } from "./timeline";
import type { PlanListItem } from "./types";

interface SupportTimelineModalProps {
  plan: PlanListItem;
  onClose: () => void;
  onOpenPlan?: () => void;
}

export function SupportTimelineModal({ plan, onClose, onOpenPlan }: SupportTimelineModalProps) {
  const [events, setEvents] = useState<SupportTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    loadSupportTimeline(supabase, plan.id)
      .then(setEvents)
      .catch((err) => console.error("[SupportTimelineModal]", err))
      .finally(() => setLoading(false));
  }, [plan.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{plan.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {(plan as { student?: { full_name?: string } }).student?.full_name ?? ""}
              </p>
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

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <SupportTimeline events={events} emptyLabel="No coordination events recorded yet." />
          )}
        </div>

        {/* Footer */}
        {onOpenPlan && (
          <div className="p-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => { onOpenPlan(); onClose(); }}
              className="w-full text-sm text-center text-primary hover:underline"
            >
              Open Plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
