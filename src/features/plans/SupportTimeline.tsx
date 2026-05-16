"use client";

import {
  ClipboardList,
  Send,
  Eye,
  CheckCircle2,
  Archive,
  Paperclip,
  Heart,
  BookOpen,
  Home,
  StickyNote,
} from "lucide-react";
import type { SupportTimelineEvent, TimelineEventKind } from "./timeline";

interface KindConfig {
  icon: React.ComponentType<{ className?: string }>;
  dotClass: string;
  iconClass: string;
}

const KIND_CONFIG: Record<TimelineEventKind, KindConfig> = {
  plan_created:        { icon: ClipboardList, dotClass: "bg-primary border-primary",           iconClass: "text-primary-foreground" },
  plan_revised:        { icon: ClipboardList, dotClass: "bg-primary border-primary",           iconClass: "text-primary-foreground" },
  plan_submitted:      { icon: Send,          dotClass: "bg-blue-100 border-blue-300",         iconClass: "text-blue-600" },
  review_started:      { icon: Eye,           dotClass: "bg-amber-500 border-amber-500",       iconClass: "text-white" },
  plan_finalized:      { icon: CheckCircle2,  dotClass: "bg-green-500 border-green-500",       iconClass: "text-white" },
  plan_approved:       { icon: CheckCircle2,  dotClass: "bg-green-500 border-green-500",       iconClass: "text-white" },
  plan_archived:       { icon: Archive,       dotClass: "bg-muted border-border",              iconClass: "text-muted-foreground" },
  document_attached:   { icon: Paperclip,     dotClass: "bg-card border-border",               iconClass: "text-muted-foreground" },
  parent_acknowledged: { icon: Heart,         dotClass: "bg-pink-100 border-pink-300",         iconClass: "text-pink-600" },
  progress_added:      { icon: BookOpen,      dotClass: "bg-card border-border",               iconClass: "text-muted-foreground" },
  home_guidance_shared:      { icon: Home,       dotClass: "bg-teal-100 border-teal-300",   iconClass: "text-teal-600" },
  parent_observation_shared: { icon: StickyNote, dotClass: "bg-amber-100 border-amber-300", iconClass: "text-amber-600" },
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

interface SupportTimelineProps {
  events: SupportTimelineEvent[];
  emptyLabel?: string;
  /** Show a thin month separator row whenever the calendar month changes. */
  showMonthDividers?: boolean;
}

export function SupportTimeline({
  events,
  emptyLabel = "No events recorded yet.",
  showMonthDividers = false,
}: SupportTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <ClipboardList className="w-8 h-8 opacity-30" />
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }

  let lastMonth = "";

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const cfg = KIND_CONFIG[event.kind];
        const Icon = cfg.icon;
        const isLast = index === events.length - 1;

        // Month divider — insert when month changes (oldest-first ordering)
        const currentMonth = monthKey(event.timestamp);
        const showDivider = showMonthDividers && currentMonth !== lastMonth;
        if (showMonthDividers) lastMonth = currentMonth;

        return (
          <li key={event.id}>
            {/* Month divider */}
            {showDivider && (
              <div className="flex items-center gap-3 py-3">
                {/* Spacer that aligns with the dot column (w-7 = 28px) */}
                <div className="w-7 flex-shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">
                  {monthLabel(event.timestamp)}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
            )}

            {/* Event row */}
            <div className="flex gap-3">
              {/* Left column: dot + connecting line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 z-10 ${cfg.dotClass}`}
                >
                  <Icon className={`w-3.5 h-3.5 ${cfg.iconClass}`} />
                </div>
                {!isLast && (
                  <div className="w-px flex-1 bg-border mt-1 mb-1" />
                )}
              </div>

              {/* Right column: content */}
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                <p className="text-sm font-medium text-foreground leading-snug">{event.label}</p>
                {event.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.detail}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {shortDate(event.timestamp)}
                  <span className="ml-1.5 opacity-60">· {relativeDate(event.timestamp)}</span>
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
