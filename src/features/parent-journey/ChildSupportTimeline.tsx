/**
 * ChildSupportTimeline
 *
 * A reusable vertical timeline that renders a child's cross-org journey —
 * school updates, therapy sessions, medical events — ordered by date and
 * grouped by calendar month.
 *
 * Designed for the parent portal journey view and the future Lauris Med
 * "Coordinated Profile" screen. Accepts ParentJourneyItem[] from any caller;
 * does not fetch its own data.
 *
 * Usage:
 *   import { ChildSupportTimeline } from "@/features/parent-journey/ChildSupportTimeline";
 *   <ChildSupportTimeline items={feed} />
 */

import type { ParentJourneyItem, SourceCategory } from "./types";
import { BookOpen, TrendingUp, ShieldCheck, Bell } from "lucide-react";

// ── Category visual config ────────────────────────────────────────────────────

interface CatStyle {
  Icon: React.ElementType;
  dot: string;         // Tailwind bg class for the timeline dot
  dotBorder: string;   // border color to separate dot from line
  line: string;        // connecting line color
  label: string;       // text color for the org label
}

const CAT: Record<SourceCategory, CatStyle> = {
  school:  { Icon: BookOpen,    dot: "bg-primary",      dotBorder: "border-primary/30",      line: "bg-primary/20",    label: "text-primary" },
  therapy: { Icon: TrendingUp,  dot: "bg-purple-500",   dotBorder: "border-purple-200",       line: "bg-purple-200",    label: "text-purple-700" },
  medical: { Icon: ShieldCheck, dot: "bg-emerald-500",  dotBorder: "border-emerald-200",      line: "bg-emerald-200",   label: "text-emerald-700" },
  system:  { Icon: Bell,        dot: "bg-gray-400",     dotBorder: "border-gray-200",         line: "bg-gray-200",      label: "text-gray-600" },
};

// ── Grouping helper ───────────────────────────────────────────────────────────

function groupByMonth(items: ParentJourneyItem[]): Array<{ label: string; items: ParentJourneyItem[] }> {
  const map = new Map<string, ParentJourneyItem[]>();
  for (const item of items) {
    const d = new Date(item.occurredAt);
    const key = d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// ── TimelineItem ──────────────────────────────────────────────────────────────

function TimelineItem({
  item,
  isLast,
}: {
  item: ParentJourneyItem;
  isLast: boolean;
}) {
  const cat = CAT[item.sourceCategory] ?? CAT.system;
  const { Icon } = cat;

  return (
    <div className="flex gap-3">
      {/* Left column: dot + connecting line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center z-10 border-2 border-background ${cat.dot}`}
          aria-hidden
        >
          <Icon className="w-3 h-3 text-white" />
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-1 mb-0 ${cat.line}`} />
        )}
      </div>

      {/* Right column: content */}
      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${cat.label}`}>
            {item.organizationName}
          </span>
          {item.providerName && (
            <span className="text-[10px] text-muted-foreground">· {item.providerName}</span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
            {shortDate(item.occurredAt)}
          </span>
        </div>
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ChildSupportTimeline ──────────────────────────────────────────────────────

interface ChildSupportTimelineProps {
  /** Journey items to render. Sorted newest-first or oldest-first — the
   *  component re-sorts them ascending (oldest first) for timeline display. */
  items: ParentJourneyItem[];
  /** When true, the oldest entry appears at the top (default: false — newest month at top). */
  chronological?: boolean;
}

export function ChildSupportTimeline({
  items,
  chronological = false,
}: ChildSupportTimelineProps) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No timeline events yet.
      </div>
    );
  }

  // Sort ascending (oldest first) then optionally reverse for newest-first.
  const sorted = [...items].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
  const ordered = chronological ? sorted : [...sorted].reverse();

  const grouped = groupByMonth(ordered);

  return (
    <div className="space-y-6">
      {grouped.map(({ label, items: monthItems }) => (
        <div key={label}>
          {/* Month/Year divider */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            {label}
          </p>

          {/* Timeline entries for this month */}
          <div>
            {monthItems.map((item, idx) => (
              <TimelineItem
                key={item.id}
                item={item}
                isLast={idx === monthItems.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
