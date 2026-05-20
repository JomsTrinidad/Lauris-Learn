"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  CheckCircle, XCircle, Clock, CalendarDays,
  Bell, CreditCard, ChevronRight,
  Star, BookOpen, TrendingUp, ShieldCheck, Inbox, Camera, Sparkles,
  StickyNote, X as XIcon,
} from "lucide-react";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";
import { useResonance, buildResonancePhrases } from "@/features/proud-moments/resonance";
import { useContinuityEcho, buildContinuityEchoPhrases } from "@/features/parent-reflection/continuity-echo";
import {
  fetchJourneyFeed,
  fetchAttendanceToday,
  fetchUpcomingEvents,
  fetchNeedsAttention,
  fetchLatestHighlight,
  fetchFallbackHighlight,
  fetchServicePresence,
  fetchRecurringMomentCategories,
  fetchSupportContext,
  fetchRecentParentVisibleVoiceNote,
} from "@/features/parent-journey/queries";
import {
  getChildStatusHeadline,
  getFeaturedParentCards,
  getServiceContextLine,
  getContinuitySignals,
  groupFeedByRecency,
  getTimeOfDayGreeting,
} from "@/features/parent-journey/helpers";
import type { FeedGroupKey } from "@/features/parent-journey/helpers";
import type {
  ParentJourneyItem,
  AttendanceTodayResult,
  UpcomingItem,
  NeedsAttentionCounts,
  LatestHighlight,
  FallbackHighlight,
  JourneyFilter,
  ServicePresence,
  PriorityCard,
  PriorityCardType,
  RecentVoiceNoteSignal,
} from "@/features/parent-journey/types";

// Phase 3B — Care deep-link prefix for the "Voice Note from Therapist"
// priority signal. Reused intentionally — same env var the journey feed
// already consumes for therapy-row deep-links. When unset, the voice-note
// signal is suppressed end-to-end (the helper short-circuits because no
// working tap target can be minted).
const CARE_BASE_URL: string | null =
  (process.env.NEXT_PUBLIC_CARE_BASE_URL ?? "").trim() || null;
import type { SchoolSupportContext } from "@/features/parent-journey/queries";

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── source category styles ────────────────────────────────────────────────────
// Source-level visual encoding so a parent can scan-distinguish school /
// therapy / medical without reading. `avatarBg` is the saturated brand fill
// used inside the feed cards' avatar circle; `iconBg`/`iconColor` survive
// for legacy callers (e.g. the operational rows). `brandLabel` is the
// human-readable badge text shown at each card's bottom-right.

const CAT_STYLES: Record<string, {
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  labelColor: string;
  avatarBg: string;        // saturated bg for the feed-card avatar circle
  avatarText: string;      // icon color inside the saturated avatar
  brandLabel: string;      // bottom-right source attribution text
  brandLabelColor: string; // color of the bottom-right source attribution
  dotColor: string;        // small color dot used on filter tabs
}> = {
  school:  {
    Icon: BookOpen,    iconBg: "bg-primary/10",  iconColor: "text-primary",
    labelColor: "text-primary/80",
    avatarBg: "bg-primary",            avatarText: "text-primary-foreground",
    // Phase 16 — semantic domain names instead of product names. Parents
    // think "School / Therapy / Medical," not "Lauris Learn / Lauris Care."
    // The internal architecture stops leaking through the UI.
    brandLabel: "School",              brandLabelColor: "text-primary",
    dotColor: "bg-primary",
  },
  therapy: {
    Icon: TrendingUp,  iconBg: "bg-purple-100",  iconColor: "text-purple-600",
    labelColor: "text-purple-600",
    avatarBg: "bg-purple-500",         avatarText: "text-white",
    brandLabel: "Therapy",             brandLabelColor: "text-purple-600",
    dotColor: "bg-purple-500",
  },
  medical: {
    Icon: ShieldCheck, iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
    labelColor: "text-emerald-600",
    avatarBg: "bg-emerald-500",        avatarText: "text-white",
    brandLabel: "Medical",             brandLabelColor: "text-emerald-600",
    dotColor: "bg-emerald-500",
  },
  system:  {
    Icon: Bell,        iconBg: "bg-muted",        iconColor: "text-muted-foreground",
    labelColor: "text-muted-foreground",
    avatarBg: "bg-muted",              avatarText: "text-muted-foreground",
    brandLabel: "Update",              brandLabelColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground/60",
  },
};

// ── filter chip (journey-section header) ──────────────────────────────────────
// Phase 17 — one chip per domain in the Journey section header. Three states:
//   "active" — domain has at least one item in the visible feed (or "all")
//   "quiet"  — domain is connected for this child but currently has 0 items
//   (not rendered when the domain isn't connected at all — the caller skips)
// The chip is rendered identically for active and quiet; only the dot color
// shifts. The count badge stays visible even at 0 so the parent can read
// "therapy: 0 this week" as a calm presence signal rather than "did therapy
// vanish?". Selected chip uses the primary fill.

function FilterChip({
  label,
  count,
  isActive,
  state,
  dotColor,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  state: "active" | "quiet";
  dotColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground border-primary"
          : state === "quiet"
            ? "border-border/60 text-muted-foreground/70 hover:text-foreground hover:border-foreground/30"
            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
      aria-pressed={isActive}
    >
      {dotColor && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            isActive ? "bg-primary-foreground/70" : dotColor
          }`}
        />
      )}
      <span>{label}</span>
      <span
        className={`inline-flex items-center justify-center min-w-[1.1rem] px-1 rounded-full text-[10px] font-semibold leading-tight ${
          isActive
            ? "bg-primary-foreground/20 text-primary-foreground"
            : state === "quiet"
              ? "bg-muted/60 text-muted-foreground/60"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ── journey row ───────────────────────────────────────────────────────────────

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function JourneyRow({
  item,
  isFresh = false,
  showSourceBadge = true,
}: {
  item: ParentJourneyItem;
  isFresh?: boolean;
  /** Phase 16 — when the active child only has ONE connected domain (e.g.
   *  school-only), the bottom-right source badge is informational noise (it
   *  repeats the same source on every card). Caller passes `false` for
   *  single-domain children and the badge is hidden; the colored avatar
   *  still encodes the source visually. For multi-domain children the
   *  badge differentiates and earns its space. */
  showSourceBadge?: boolean;
}) {
  // Phase 15 — Feed item becomes a micro-card. Scan-geometry decisions:
  //   • White card on the page's tinted bg = perceptible containment per item
  //   • Saturated colored avatar circle = instant source-category encoding
  //   • Conditional bottom-right domain attribution (School/Therapy/Medical) —
  //     only when the child has multiple connected domains (Phase 16)
  //   • Soft amber "New" pill = visible freshness signal (the previous
  //     bg-accent/20 tint was below human perception threshold). Tuned
  //     calmer than Figma's hard-red badge — same scan function, less
  //     notification-center energy.
  //   • Passive clustering (Phase 8) intentionally dropped: each card now
  //     carries its own source identity, so suppressing it on continuation
  //     rows would weaken scan rather than help it.
  const cat = CAT_STYLES[item.sourceCategory] ?? CAT_STYLES.system;
  const { Icon } = cat;
  const hasMedia = (item.mediaCount ?? 0) > 0;
  const thumbUrls = item.mediaThumbnailUrls ?? [];
  const extra = Math.max(0, (item.mediaCount ?? 0) - 3);
  const ahref = item.actionHref;
  const ahrefIsExternal = ahref ? isExternalHref(ahref) : false;
  return (
    <article
      className={`bg-card rounded-xl p-3.5 shadow-sm ${
        isFresh ? "ring-1 ring-amber-200/70" : "ring-1 ring-border/30"
      }`}
    >
      {isFresh && (
        <span className="sr-only">Posted since your last visit.</span>
      )}
      <div className="flex gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.avatarBg}`}>
          <Icon className={`w-4 h-4 ${cat.avatarText}`} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Top row: title (or summary-as-title) + soft "New" pill on fresh
              items. timestamp lives at the bottom-right with the brand
              attribution so the top row stays focused on the headline. */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {item.title && item.title.trim() !== "" ? (
                <>
                  <p className="text-sm font-semibold leading-snug">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    {item.summary}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                  {item.summary}
                </p>
              )}
            </div>
            {isFresh && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 flex-shrink-0 leading-tight">
                New
              </span>
            )}
          </div>

          {hasMedia && (
            <Link href={item.actionHref ?? "/parent/updates"} className="mt-2.5 flex items-center gap-1.5 group">
              {thumbUrls.slice(0, 3).map((url, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img
                    src={url}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover ring-1 ring-border"
                  />
                  {i === 2 && extra > 0 && (
                    <div className="absolute inset-0 bg-black/55 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-semibold">+{extra}</span>
                    </div>
                  )}
                </div>
              ))}
              {thumbUrls.length === 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                  <Camera className="w-3 h-3 flex-shrink-0" />
                  {item.mediaCount} photo{item.mediaCount !== 1 ? "s" : ""}
                </span>
              )}
              {thumbUrls.length > 0 && (
                <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {item.mediaCount} photo{item.mediaCount !== 1 ? "s" : ""}
                </span>
              )}
            </Link>
          )}

          {ahref && item.itemType !== "update" && (
            ahrefIsExternal ? (
              <a
                href={ahref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-0.5"
              >
                {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
              </a>
            ) : (
              <Link
                href={ahref}
                className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-0.5"
              >
                {item.actionLabel ?? "See more"} <ChevronRight className="w-3 h-3" />
              </Link>
            )
          )}

          {/* Footer: org/provider context + time + optional domain badge.
              For single-domain children, the domain badge is suppressed
              (it would repeat the same source on every card). The colored
              avatar circle on the left still encodes the source — no
              information is lost, only the redundant chrome is gone. */}
          <div className="mt-2.5 flex items-center gap-2 text-[10px] leading-tight">
            <span className="text-muted-foreground truncate">
              {item.providerName ?? item.organizationName}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground flex-shrink-0">{timeAgo(item.occurredAt)}</span>
            {showSourceBadge && (
              <span className={`ml-auto inline-flex items-center gap-1 font-medium flex-shrink-0 ${cat.brandLabelColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cat.dotColor}`} />
                {cat.brandLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ── operational row rendering ─────────────────────────────────────────────────
// Phase 4 — Continuity Surfaces.
// Operational triage no longer uses bordered Card components. Each item
// becomes a compressed row so the page's emotional center of gravity sits
// on continuity surfaces (hero + spotlight + journey feed) rather than on
// dashboard cards. Urgent items still pop visually (left accent + subtle
// amber tint), but at roughly one-third the visual mass of the old
// `UrgentBanner` + `CompactCard` pair. Non-urgent items are plain rows.

const OPERATIONAL_ICON: Partial<Record<PriorityCardType, React.ElementType>> = {
  upcoming_meeting: CalendarDays,
  balance_due:      CreditCard,
  upcoming_event:   CalendarDays,
  school_event:     CalendarDays,
  holiday:          CalendarDays,
  all_clear:        CheckCircle,
  todays_session:   CalendarDays,
};

// Phase 4A — `softened` is a render-only quietness guardrail. When two
// urgent_action cards stack (e.g. consent + doc request), only the first
// keeps the amber container; subsequent urgent cards demote visually to
// neutral so the priority surface never shows two amber rows at once
// (see docs/PARENT_COGNITIVE_RHYTHM.md §5.1 + §8). The card's semantic
// `cardType` is unchanged — only the visual tonality softens.
function OperationalRow({ card, softened = false }: { card: PriorityCard; softened?: boolean }) {
  const isUrgent  = card.cardType === "urgent_action" && !softened;
  const isWarning = card.accentVariant === "warning" && !softened;
  const isPurple  = card.accentVariant === "purple";

  // Phase 13 — Operational rows now live INSIDE the Today scene's
  // atmospheric wrapper. The previous between-row `border-b border-border/40`
  // separator made non-urgent rows read as a sub-list (table-of-actions)
  // inside the scene; dropping it lets them read as continuous quiet
  // present-moment items. Urgent rows keep their amber left-accent + tint
  // because their interruption value is earned.
  const containerCls = isUrgent
    ? "flex items-start gap-2.5 pl-3 pr-2 py-2 rounded-r-md border-l-2 border-amber-400 bg-amber-50/40 hover:bg-amber-50/70 transition-colors"
    : "flex items-start gap-2.5 pl-1 pr-2 py-2 hover:bg-accent/10 rounded-md transition-colors";

  const titleCls = isUrgent
    ? "text-sm font-semibold text-amber-900 leading-snug"
    : isWarning
      ? "text-sm font-medium text-amber-800 leading-snug"
      : "text-sm font-medium leading-snug";

  const iconCls = isUrgent
    ? "text-amber-600"
    : isWarning
      ? "text-amber-500"
      : isPurple
        ? "text-purple-500"
        : "text-muted-foreground";

  const chevCls = isUrgent ? "text-amber-500" : "text-muted-foreground/60";

  const Icon = isUrgent
    ? (card.id === "consent-pending" ? ShieldCheck : Inbox)
    : (OPERATIONAL_ICON[card.cardType] ?? CalendarDays);

  // Subtitle + optional detail merged inline so non-urgent rows stay 2-line max.
  const subtitle = card.detail && card.detail.trim()
    ? `${card.subtitle} · ${card.detail}`
    : card.subtitle;

  // Phase 3B — Cross-app priority signals can carry an external Care
  // deep-link (e.g. the "Voice Note from Therapist" card opens Care so the
  // parent's existing signed-URL flow takes over). next/link doesn't add
  // target / rel on external URLs, so route those through a plain anchor —
  // matches the JourneyRow pattern already in this file.
  const externalHref = isExternalHref(card.actionHref);
  const rowInner = (
    <>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className={titleCls}>{card.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>
      </div>
      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${chevCls}`} />
    </>
  );

  if (externalHref) {
    return (
      <a
        href={card.actionHref}
        target="_blank"
        rel="noopener noreferrer"
        className={containerCls}
      >
        {rowInner}
      </a>
    );
  }
  return (
    <Link href={card.actionHref} className={containerCls}>
      {rowInner}
    </Link>
  );
}

function OperationalSection({ cards }: { cards: PriorityCard[] }) {
  // Phase 12.5 — When no operational items exist, the section renders
  // NOTHING. Absence is the correct signal here; adding a "You're all
  // caught up" line would introduce productivity / inbox semantics that
  // the directive explicitly avoids.
  // Phase 13 — Lives inside the Today atmospheric wrapper. `space-y-1`
  // on the non-urgent group keeps tiny breathing room between rows
  // without the visible separator, so the operational items read as
  // continuous quiet items in the scene rather than a sub-list.
  if (cards.length === 0) {
    return null;
  }
  const urgent = cards.filter(c => c.cardType === "urgent_action");
  const others = cards.filter(c => c.cardType !== "urgent_action");

  // Phase 4A quietness guardrail (see docs/PARENT_COGNITIVE_RHYTHM.md §5.1 +
  // §8): cap amber-tinted urgent treatment to one row at a time. The first
  // urgent keeps its amber container; further urgent cards stay in the list
  // (same position, same cardType, same destination) but render with the
  // calm neutral container — preventing the "twin amber" stack when both
  // consent + doc request fire on the same visit. Empirically the only way
  // two urgent_action cards stack is consent + doc request; the slice(2) cap
  // upstream means we won't exceed two anyway.
  const leadUrgent = urgent[0];
  const trailingUrgent = urgent.slice(1);
  return (
    <div className="space-y-2">
      {leadUrgent && <OperationalRow card={leadUrgent} />}
      {(trailingUrgent.length > 0 || others.length > 0) && (
        <div className="space-y-1">
          {trailingUrgent.map((c) => <OperationalRow key={c.id} card={c} softened />)}
          {others.map((c) => <OperationalRow key={c.id} card={c} />)}
        </div>
      )}
    </div>
  );
}

// ── positive highlight ────────────────────────────────────────────────────────

const REACTIONS = [
  { type: "proud",      emoji: "❤️", label: "Proud" },
  { type: "great_job",  emoji: "👏", label: "Great Job" },
  { type: "keep_going", emoji: "🌟", label: "Keep Going" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Effort":         "bg-blue-100 text-blue-700",
  "Kindness":       "bg-pink-100 text-pink-700",
  "Focus":          "bg-purple-100 text-purple-700",
  "Participation":  "bg-amber-100 text-amber-700",
  "Independence":   "bg-green-100 text-green-700",
  "Creativity":     "bg-orange-100 text-orange-700",
  "Improvement":    "bg-teal-100 text-teal-700",
  "Helping Others": "bg-rose-100 text-rose-700",
};

// Phase 10 — De-saturated palette for the continuity-memory "Lately" strip.
// Pairs the same hue families as CATEGORY_COLORS but at /50 background + /600
// text, so chips read as softened / weathered / atmospheric — visually
// subordinate to active surfaces (hero, spotlight, feed rows). The memory
// strip should never look like an analytics panel or "important signals."
const CATEGORY_COLORS_MEMORY: Record<string, string> = {
  "Effort":         "bg-blue-50 text-blue-600",
  "Kindness":       "bg-pink-50 text-pink-600",
  "Focus":          "bg-purple-50 text-purple-600",
  "Participation":  "bg-amber-50 text-amber-600",
  "Independence":   "bg-green-50 text-green-600",
  "Creativity":     "bg-orange-50 text-orange-600",
  "Improvement":    "bg-teal-50 text-teal-600",
  "Helping Others": "bg-rose-50 text-rose-600",
};

// Phase 5 — "today" dropped from the standalone Positive Highlight card so
// the heading reads correctly when the cooldown has pushed the moment past
// hero-eligibility but the card is still showing a 3–6 day old moment. The
// card already renders `timeAgo(highlight.createdAt)` in its top-right
// corner ("3d") — that's where freshness lives now. Voice aligned with the
// hero-side `getProudMomentHeroHeading` map in helpers.ts.
const MOMENT_HEADINGS: Partial<Record<string, (n: string) => string>> = {
  "Kindness":       (n) => `${n} showed kindness.`,
  "Effort":         (n) => `${n} gave it their all.`,
  "Focus":          (n) => `${n} stayed focused during class.`,
  "Participation":  (n) => `${n} was active and engaged.`,
  "Independence":   (n) => `${n} worked independently.`,
  "Creativity":     (n) => `${n} showed wonderful creativity.`,
  "Improvement":    (n) => `${n} made great progress.`,
  "Helping Others": (n) => `${n} helped a classmate.`,
};

function getMomentHeading(firstName: string, category: string): string {
  const fn = MOMENT_HEADINGS[category];
  return fn ? fn(firstName) : `${firstName} earned a positive highlight.`;
}

// ── Phase 11 — Quiet parent resonance picker ──────────────────────────────────
// Rendered inside the Positive Highlight card (both attached spotlight and
// standalone block). Three states: collapsed (small link), open (5 phrase
// chips), saved (small chip with × to clear). localStorage-only persistence
// via `useResonance` — no backend, no teacher visibility, no notifications.
//
// Voice: reflective, not reactive. "This stayed with us." energy.
// The StickyNote icon is inward-facing (personal note-to-self metaphor),
// deliberately not a heart, paper plane, or chat bubble.

// Phase A V2 — Journey Memory. A saved reflection becomes "memory" once it
// has stood for more than this threshold; before that, rendering "· just
// now" right after the tap reads as overzealous. The 5-minute gate lets
// the pill mature into a remembered note rather than echoing the user's
// last action back at them.
const REFLECTION_MEMORY_THRESHOLD_MS = 5 * 60 * 1000;

function shouldShowReflectionMemory(savedAt: string | null): boolean {
  if (!savedAt) return false;
  const age = Date.now() - new Date(savedAt).getTime();
  return age >= REFLECTION_MEMORY_THRESHOLD_MS;
}

function ResonancePicker({
  childId, momentId, firstName,
}: {
  childId: string | null;
  momentId: string;
  firstName: string;
}) {
  const { phrase, savedAt, setPhrase, hydrated } = useResonance(childId, momentId);
  const [isOpen, setIsOpen] = useState(false);

  // Don't render anything until localStorage has been read — avoids the
  // saved chip flickering away on first paint then back on the second.
  if (!hydrated) return null;

  const phrases = buildResonancePhrases(firstName);
  const showMemoryAnchor = shouldShowReflectionMemory(savedAt);

  // Saved state — single small chip with × to clear. No "shared" label,
  // no celebration, no animation. Phase A V2: when the save has been
  // standing long enough to feel like memory (≥ 5 min), append a quiet
  // "· {timeAgo}" anchor so the pill reads as a past reflection rather
  // than a present action.
  if (phrase) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-50/70 text-amber-900 border border-amber-100">
          <StickyNote className="w-3 h-3 flex-shrink-0 opacity-70" />
          {phrase}
        </span>
        {showMemoryAnchor && savedAt && (
          <span className="text-[10px] text-muted-foreground/60">
            · {timeAgo(savedAt)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPhrase(null)}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="Remove note"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Open state — 5 preset phrase chips. Tap one to save and collapse.
  if (isOpen) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {phrases.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPhrase(p); setIsOpen(false); }}
              className="px-2.5 py-1 rounded-full text-xs border border-amber-200/60 text-amber-800/90 hover:bg-amber-50 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Never mind
        </button>
      </div>
    );
  }

  // Collapsed state — small inviting link, no button styling. Reads as
  // optional reflection, not action item. Empty by default to avoid
  // creating engagement pressure.
  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
    >
      + Add a note from home
    </button>
  );
}

// ── Phase 16 — Parent continuity echo picker ──────────────────────────────────
// Sibling of ResonancePicker, attached to the school support context line.
// SAME visual grammar (collapsed link → open chips → saved chip with ×),
// DIFFERENT voice ("we're seeing this too" reflection on a broader ongoing
// situation, vs Phase 11's "this stayed with us" reaction to a single
// celebrated moment). Storage is local-only (`useContinuityEcho`), private
// to the parent device. Teachers do not see echoes in v1 — privacy by
// architecture.
//
// `anchorId` is the support context's `updatedAt` ISO timestamp. When the
// school re-writes the context, anchorId changes, and the previous echo
// goes dormant (its localStorage row stays but is invisible until/unless
// the same context is restored). This is the cleanest invalidation rule
// for v1: a NEW situation deserves a NEW echo decision; the old echo
// referred to a different "this".
//
// Color register matches the support context line above (muted/neutral)
// rather than the amber resonance picker (warmer, proud-moment-attached).
// Echo is reflective neutrality; resonance is warmth. The two MUST read
// distinctly so the parent never confuses the surfaces.
/**
 * Phase A V2 + Phase B V2 — controlled echo picker.
 *
 * Refactored to accept echo state as props so the dashboard can also read
 * it (for the Phase B resonance line) without keeping a separate
 * useContinuityEcho copy. The single source of truth lives in the
 * dashboard's hook call; this picker only renders and dispatches.
 *
 * Phase A V2: when savedAt is older than the memory threshold, append
 * `· {timeAgo}` so the pill reads as a remembered note.
 */
function ContinuityEchoPicker({
  phrase, savedAt, setPhrase, hydrated, firstName,
}: {
  phrase: string | null;
  savedAt: string | null;
  setPhrase: (next: string | null) => void;
  hydrated: boolean;
  firstName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!hydrated) return null;

  const phrases = buildContinuityEchoPhrases(firstName);
  const showMemoryAnchor = shouldShowReflectionMemory(savedAt);

  if (phrase) {
    return (
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-foreground/80 border border-border/60">
          <StickyNote className="w-3 h-3 flex-shrink-0 opacity-60" />
          {phrase}
        </span>
        {showMemoryAnchor && savedAt && (
          <span className="text-[10px] text-muted-foreground/60">
            · {timeAgo(savedAt)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPhrase(null)}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="Remove note"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (isOpen) {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {phrases.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPhrase(p); setIsOpen(false); }}
              className="px-2.5 py-1 rounded-full text-xs border border-border/60 text-foreground/80 hover:bg-muted/40 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Never mind
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="mt-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
    >
      + Note from home
    </button>
  );
}

// ── Phase B V2 — Home/school resonance block ──────────────────────────────────
// Wraps the support context line + its echo picker + the new resonance line
// in a single component that owns the useContinuityEcho hook. Single source
// of truth — the picker mutates state, the resonance line reads state, both
// stay in sync.
//
// Resonance line emits when BOTH conditions hold:
//   (a) school has set a support context (the whole block is conditional
//       on this — `supportContext != null`),
//   (b) parent has saved an echo phrase for THIS anchor.
//
// Wording is one observational sentence, present perfect, no actor. The
// line is information, not invitation — there is no link, no CTA, no
// notification, no thread. The school does NOT see this line (the parent's
// echo lives in localStorage). The line is a private resonance reflection
// the page shows back to the parent, not a message the school receives.
function SupportContextBlock({
  supportContext, childId, firstName,
}: {
  supportContext: SchoolSupportContext;
  childId: string | null;
  firstName: string;
}) {
  const { phrase, savedAt, setPhrase, hydrated } = useContinuityEcho(
    childId,
    supportContext.updatedAt,
  );
  // Don't render the resonance line until echo state has hydrated — avoids
  // a one-frame flicker between "nothing here" and "echo present, show
  // resonance".
  const showResonanceLine = hydrated && phrase !== null;
  return (
    <div className="px-1">
      <p className="text-sm text-foreground/80 leading-relaxed">
        {supportContext.focusText}
      </p>
      {showResonanceLine && (
        <p className="text-[11px] italic text-muted-foreground/75 mt-1.5 leading-relaxed">
          Home and school have both noticed this lately.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground/60 mt-1">
        {supportContext.setByName
          ? `From ${supportContext.setByName.split(" ")[0]} · updated ${timeAgo(supportContext.updatedAt)}`
          : `Updated ${timeAgo(supportContext.updatedAt)}`}
      </p>
      <ContinuityEchoPicker
        phrase={phrase}
        savedAt={savedAt}
        setPhrase={setPhrase}
        hydrated={hydrated}
        firstName={firstName}
      />
    </div>
  );
}

// ── filter config ─────────────────────────────────────────────────────────────

const JOURNEY_FILTERS: JourneyFilter[] = ["all", "school", "therapy", "medical"];

const FILTER_LABELS: Record<JourneyFilter, string> = {
  all:     "All",
  school:  "School",
  therapy: "Therapy",
  medical: "Medical",
};

// Phase 14 — Timeline group labels. Quiet section separators inside the
// Journey feed. Rendered only when ≥2 groups have items (see render block);
// a lone group reads better as a flat list under the existing section
// header ("{firstName}'s journey") than under a redundant "Today" label.
const FEED_GROUP_LABELS: Record<FeedGroupKey, string> = {
  today:    "Today",
  thisWeek: "Earlier this week",
  older:    "Older",
};
const FEED_GROUP_ORDER: FeedGroupKey[] = ["today", "thisWeek", "older"];

// Empty-state copy — calm, source-aware, never implies failure. The "all"
// state lands on parents who haven't built up activity in any source yet;
// the three source filters describe what arrives when that source contributes.
const FILTER_EMPTY: Record<JourneyFilter, string> = {
  all:     "No updates yet. New posts from school and therapy will appear here as they come in.",
  school:  "No school updates yet.",
  therapy: "No therapy updates yet.",
  medical: "Medical updates are not connected yet.",
};

// ── icon map for status headline ──────────────────────────────────────────────

const STATUS_ICON_MAP = {
  check:    CheckCircle,
  clock:    Clock,
  x:        XCircle,
  calendar: CalendarDays,
  sparkle:  Sparkles,
} as const;

// ── Phase 7 — Gentle freshness cues ──────────────────────────────────────────
// localStorage-only "last seen" model. Each visit reads the previous
// lastSeen, computes which feed items have arrived since then, then
// immediately writes Date.now() back so the NEXT visit naturally consumes
// today's freshness. No backend, no read-state table, no inbox semantics.
//
// Cap: a feed item older than FRESH_WINDOW_HOURS never gets the tint, even
// if the parent has been away for weeks — old continuity remains calm
// background context.
//
// First-visit fallback: when no lastSeen exists in localStorage, behave as
// though the parent visited FIRST_VISIT_LOOKBACK_HOURS ago — surfaces only
// today's items, not the whole feed history.

const FRESH_WINDOW_HOURS = 72;
const FIRST_VISIT_LOOKBACK_HOURS = 24;

function lastSeenKey(childId: string): string {
  return `parent-journey-last-seen:${childId}`;
}

// ── main component ────────────────────────────────────────────────────────────

export default function ParentDashboard() {
  const { child, childId, classId, schoolId, schoolName, childProfileId } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [parentName, setParentName] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTodayResult>({ status: null, checkedInAt: null, checkedInAtIso: null });
  const [events, setEvents] = useState<UpcomingItem[]>([]);
  const [needs, setNeeds] = useState<NeedsAttentionCounts>({ billingCount: 0, billingTotal: 0, docRequestCount: 0, docApprovalCount: 0 });
  const [highlight, setHighlight] = useState<LatestHighlight | null>(null);
  const [fallbackHighlight, setFallbackHighlight] = useState<FallbackHighlight | null>(null);
  const [feed, setFeed] = useState<ParentJourneyItem[]>([]);
  const [servicePresence, setServicePresence] = useState<ServicePresence>({
    school: { connected: false }, therapy: { connected: false }, medical: { connected: false },
  });
  // Phase 10 — Continuity memory. Names of proud_moment categories that
  // have recurred (≥2 times) in the last 14 days, sorted by most recent.
  // Cap of 3. Renders as a quiet "Lately" strip at the top of the journey
  // section. Empty array hides the strip entirely.
  const [recurringCategories, setRecurringCategories] = useState<string[]>([]);
  // Phase 12 — School-set continuity context. One short observational line
  // describing what's currently happening for this child. Null when no
  // school staff has written one. Renders as a quiet ambient line below
  // the hero, above the standalone Positive Highlight / operational rows.
  const [supportContext, setSupportContext] = useState<SchoolSupportContext | null>(null);
  // Phase 3B — recent parent-visible voice note (signal-layer only; RLS-gated
  // by Care's cvn_parent_select). Null when none recent or no Care linkage.
  const [recentVoiceNote, setRecentVoiceNote] = useState<RecentVoiceNoteSignal | null>(null);
  const [activeFilter, setActiveFilter] = useState<JourneyFilter>("all");
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [reactSaving, setReactSaving] = useState(false);

  // Phase 20 — Absence-related state lifted out of the dashboard entirely.
  // Operational actions now live in the family drawer's "Today for X"
  // section, which manages its own state internally. The homepage is
  // continuity-only.

  // Phase 7 — Gentle freshness cues. `freshItemIds` is the snapshot of
  // journey items that have arrived since the parent's previous visit
  // (per-child, localStorage-only). Computed ONCE per mount via the ref
  // lock below so filter changes / refetches within a single visit don't
  // re-flicker the tint.
  const [freshItemIds, setFreshItemIds] = useState<Set<string>>(new Set());
  const freshComputedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (!childId) { setLoading(false); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    setParentUserId(userId);

    const rawName = ((user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "") as string).trim();
    setParentName(rawName ? rawName.split(" ")[0] : null);

    const resolvedSchool = schoolName || "School";
    const resolvedClass = child?.className ?? "";

    const [att, evts, needsData, hlData, fbData, feedData, spData, recurringCats, ctxData, voiceNoteData] = await Promise.all([
      fetchAttendanceToday(supabase, childId),
      fetchUpcomingEvents(supabase, resolvedSchool, { schoolId, classId }),
      fetchNeedsAttention({ supabase, childId }),
      fetchLatestHighlight({ supabase, childId, userId }),
      fetchFallbackHighlight({ supabase, childId }),
      fetchJourneyFeed({ supabase, childId, classId, schoolName: resolvedSchool, childProfileId }),
      fetchServicePresence(supabase, childId, resolvedSchool, resolvedClass),
      // Phase 10 — continuity memory (recurring proud-moment categories ≥2 in 14d).
      fetchRecurringMomentCategories(supabase, childId),
      // Phase 12 — school-set continuity context (one ambient line).
      fetchSupportContext(supabase, childId),
      // Phase 3B — single recent parent-visible voice note for the signal layer.
      // Care-unlinked parents naturally receive null via RLS — no error path.
      fetchRecentParentVisibleVoiceNote(supabase, childProfileId),
    ]);

    setAttendance(att);
    setEvents(evts);
    setNeeds(needsData);
    setHighlight(hlData);
    setFallbackHighlight(fbData);
    setFeed(feedData);
    setServicePresence(spData);
    setRecurringCategories(recurringCats);
    setSupportContext(ctxData);
    setRecentVoiceNote(voiceNoteData);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, classId, childProfileId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Phase 7 — Compute the freshness snapshot ONCE per mount, after `feed` is
  // populated. Subsequent re-renders (filter changes, reload button) keep the
  // same snapshot so the tint doesn't flicker mid-visit. lastSeen is written
  // back immediately so the NEXT visit naturally consumes today's freshness.
  useEffect(() => {
    if (!childId) return;
    if (feed.length === 0) return;
    if (freshComputedRef.current) return;
    if (typeof window === "undefined") return;

    let prevLastSeenMs: number;
    try {
      const stored = window.localStorage.getItem(lastSeenKey(childId));
      prevLastSeenMs = stored
        ? new Date(stored).getTime()
        : Date.now() - FIRST_VISIT_LOOKBACK_HOURS * 60 * 60 * 1000;
    } catch {
      // localStorage unavailable (private browsing edge case) — fall back to
      // first-visit lookback so the experience stays calm.
      prevLastSeenMs = Date.now() - FIRST_VISIT_LOOKBACK_HOURS * 60 * 60 * 1000;
    }

    // Cap: freshness can never exceed FRESH_WINDOW_HOURS regardless of how
    // long the parent has been away — old continuity stays calm.
    const freshCutoffMs = Math.max(
      prevLastSeenMs,
      Date.now() - FRESH_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const fresh = new Set<string>();
    for (const item of feed) {
      if (new Date(item.occurredAt).getTime() > freshCutoffMs) {
        fresh.add(item.id);
      }
    }
    setFreshItemIds(fresh);
    freshComputedRef.current = true;

    // Consume on visit: write current timestamp back so the NEXT visit
    // treats today's items as already seen. No N-second dwell timer — the
    // simpler "consumed on mount" model is cleaner.
    try {
      window.localStorage.setItem(lastSeenKey(childId), new Date().toISOString());
    } catch {
      // Silent — write failure just means freshness won't persist; UX still works.
    }
  }, [childId, feed]);

  // Reset the freshness lock when the parent switches to a different child,
  // so the new child's first feed-render computes its own snapshot.
  useEffect(() => {
    freshComputedRef.current = false;
    setFreshItemIds(new Set());
  }, [childId]);

  async function handleMomentReaction(momentId: string, reactionType: string) {
    if (!parentUserId) return;
    setReactSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("proud_moment_reactions")
      .upsert(
        { proud_moment_id: momentId, parent_id: parentUserId, reaction_type: reactionType },
        { onConflict: "proud_moment_id,parent_id" }
      );
    setHighlight((prev) => prev ? { ...prev, myReaction: reactionType } : null);
    setReactSaving(false);
  }

  // Phase 20 — submitAbsence relocated to TodayForChildSection in the
  // family drawer. Dashboard no longer touches absence_notifications.

  if (loading) return <PageSpinner />;

  const firstName = child?.firstName ?? "Your child";

  // ── Derived: status headline (cross-domain + continuity-weighted, Phase 3) ──
  // The hero is built by a tier-based priority chain in helpers.ts:
  //   Tier A acute operational  → Tier B today scheduled  → Tier C fresh present
  //   → Tier D continuity (proud moment / therapy / positive observation)
  //   → Tier E background continuity → Tier F calm default.
  //
  // We pass highlight + fallbackHighlight so the helper can promote a Tier-D
  // continuity signal *over* a stale "present" check-in. When it does, it
  // returns `consumedHighlightId` / `consumedFallback` so we can suppress
  // the duplicated content below (heading line on Positive Highlight card;
  // entire Recent Growth card).
  const today = new Date().toISOString().split("T")[0];
  const todayEvents = events.filter(e => e.date === today);
  const recentFeedItem = feed[0] ?? null;
  const statusHeadline = getChildStatusHeadline(
    firstName, attendance, todayEvents, recentFeedItem, highlight, fallbackHighlight,
  );
  const StatusIcon = STATUS_ICON_MAP[statusHeadline.iconKind];

  // Cross-domain context line — single, subtle, only when ≥2 services connected.
  const serviceContextLine = getServiceContextLine(servicePresence);

  // Phase 15 — Today's Pulse signal removed. The count badges in the top
  // filter strip (Zone 1) now carry "what arrived per source" with stronger
  // scan gravity than a compressed sentence inside the Today card. Keeping
  // both would have been compression-on-compression.

  // Phase 3 — operational details moved into a secondary line.
  // When the hero is not attendance-driven AND the child IS marked present
  // today, surface a small grounding line so parents quietly know the
  // operational fact without it dominating. Renders only in this one case;
  // absent / late / excused are already in Tier A and own the hero.
  const heroOwnsAttendance =
    attendance.status === "absent" ||
    attendance.status === "late" ||
    attendance.status === "excused" ||
    (attendance.status === "present" &&
      attendance.checkedInAtIso !== null &&
      Date.now() - new Date(attendance.checkedInAtIso).getTime() <= 4 * 60 * 60 * 1000);
  const showSecondaryAttendance = !heroOwnsAttendance && attendance.status === "present";

  // ── Derived: priority cards ──────────────────────────────────────────────
  // Phase 3B — voice note + Care deep-link plumbed through. Cards layer
  // stays the same shape (≤2 visible signals); the helper internally weighs
  // the new P25 tomorrow-meeting + P35 voice-note tiers against the existing
  // urgent_action / today-meeting / event / billing / holiday chain.
  const priorityCards = getFeaturedParentCards({
    events,
    needs,
    voiceNote: recentVoiceNote,
    careBaseUrl: CARE_BASE_URL,
    childProfileId,
  });

  // ── Derived: continuity signals (Phase 13 — observable patterns) ─────────
  // Merges the Phase 10 recurring-category strip with new domain freshness
  // signals into one "What's showing up" cluster. Returns up to 3 chips, or
  // empty array (caller hides the section). Pure helper, no extra fetches.
  const continuitySignals = getContinuitySignals(feed, recurringCategories, servicePresence);

  // ── Derived: highlight state ─────────────────────────────────────────────
  const showFeaturedHighlight = highlight !== null && highlight.isFeatured;
  // Phase 3 — when the hero already carried the proud-moment headline, the
  // card still renders for category chip + note + reactions, but suppresses
  // its heading <p> so the same sentence doesn't appear twice on the page.
  const highlightHeadingSuppressed =
    showFeaturedHighlight && statusHeadline.consumedHighlightId === highlight!.id;
  // Phase 3 — when the hero lifted the fallback positive observation, the
  // Recent Growth card is suppressed entirely (its only meaningful content
  // was the heading + summary the hero now carries).
  const showFallbackHighlight =
    !showFeaturedHighlight && fallbackHighlight !== null && !statusHeadline.consumedFallback;

  // ── Journey feed ─────────────────────────────────────────────────────────
  const filteredFeed = activeFilter === "all"
    ? feed
    : feed.filter((i) => i.sourceCategory === activeFilter);

  // Phase 14 — Timeline compression. Bucket the (already-filtered) feed
  // into today / earlier-this-week / older. Group labels render only when
  // ≥2 groups have items — a single "Today" label above a flat list is
  // redundant chrome under the existing "{name}'s journey" header.
  const feedGroups = groupFeedByRecency(filteredFeed);
  const nonEmptyFeedGroups = FEED_GROUP_ORDER.filter((k) => feedGroups[k].length > 0);
  const showFeedGroupLabels = nonEmptyFeedGroups.length >= 2;

  const sp = servicePresence;

  // Phase 16 — Multi-domain detection. The bottom-right source badge on each
  // feed card only earns its space when the child actually has multiple
  // domains flowing in. For single-domain (school-only) children the badge
  // would repeat "School" on every row — pure noise. The colored avatar
  // circle stays in both cases so source attribution is never lost.
  const connectedDomainCount =
    (sp.school.connected ? 1 : 0) +
    (sp.therapy.connected ? 1 : 0) +
    (sp.medical.connected ? 1 : 0);
  const showSourceBadge = connectedDomainCount >= 2;

  return (
    <ErrorBoundary section="parent-dashboard" fallback="minimal">
    {/* Phase 14 — Visible scan geometry.
        Page surface shifts to a tinted muted canvas (`bg-muted/60`) that
        bleeds edge-to-edge of the parent layout's content area. This is
        the foundation that makes the Today card visibly lift below.
        Three distinct visual planes now exist for the first time:
          • page   = atmospheric layer (this wrapper)
          • Today  = foreground cognition (white card on the tint)
          • Journey = ambient continuity texture (inline on the tint)
        Previous phases (12.5 → 12.6 → 13) hit the right philosophy but
        the visual delta was below perception threshold. This phase
        pushes into perceptible territory while staying calm, soft, and
        continuity-oriented. */}
    <div className="bg-muted/60 -mx-4 -my-6 px-4 py-6">
    <div className="space-y-4">

      {/* Phase 17 — Filter scan strip moved OUT of the page top and INTO
          the Journey section header below. The previous top placement
          created a semantic mismatch: chips read as page-level filters
          but only affected the Journey feed (the Today card stayed
          cross-domain). As Care grows, that mismatch would have hardened
          into a real bug.
          New architecture:
            • Today  = cross-domain synthesis (no filters above it)
            • Journey = inspection (filters attached to its header) */}

      {/* ── Today card (foreground cognition) ────────────────────────────────
          Phase 14 — Visible scan geometry. The Today scene becomes a
          REAL white card on the tinted page surface above. This is the
          first perceptibly elevated surface in the parent dashboard's
          history. Earlier attempts (tray with `bg-muted/30`, gradient
          with `from-muted/50 to-muted/20 ring-1`) sat on a white page
          background and produced delta below human perception threshold.
          The inversion — white card on tinted page — produces real
          contrast.
          Treatment:
            • `bg-card` (white in light mode, theme-adaptive)
            • `rounded-2xl` (16px, clearly a contained shape)
            • `p-5` (1.25rem generous internal breath — feels "held")
            • `shadow-sm` (very soft, restrained elevation cue —
               authorised by Phase 14 directive)
          Inset from page edges (no `-mx-4`) so the card has visible
          rounded corners on all four sides — the eye reads it as a
          contained zone, not a band.
          Still calm, soft, continuity-oriented. NOT dashboard chrome,
          NOT a widget, NOT enterprise card energy. */}
      <section className="bg-card rounded-2xl p-5 shadow-sm space-y-4">

      {/* ── Greeting + Status Headline ────────────────────────────────────── */}
      <div className="pt-1">
        {/* Phase 18 — Rhythm adaptation V1. Time-of-day variant on the
            existing greeting. Pure, computed at render time. Geometry of
            the rest of the page is intentionally untouched — the only
            adaptation is the head word ("Good morning" / "Good afternoon"
            / "Good evening" / "Hi" late-night). */}
        <p className="text-sm text-muted-foreground">
          {getTimeOfDayGreeting(new Date().getHours(), parentName)}
        </p>
        <h1 className="text-2xl font-bold leading-tight mt-0.5">
          {statusHeadline.heading}
        </h1>
        {/* Phase 13 — Tight supporting cluster.
            Previous structure had three independent text blocks under the
            headline (detail at `mt-1`, service context at `mt-1.5`,
            secondary attendance at `mt-1.5`) — five vertical text fragments
            in a zigzag rhythm read as "list of facts," not a hero. This
            collapses the supporting layer to a single compositional unit
            under the headline:
              (a) the colored detail line with status icon (semantic anchor)
              (b) an optional muted addendum that merges service context +
                  secondary attendance with a quiet `·` separator.
            The whole cluster occupies one visual tier under the headline
            (`mt-1.5`); the addendum sits hugging the detail at `mt-0.5`
            so it reads as continuation, not as a separate row. */}
        <div className="mt-1.5">
          {/* Phase 18 — detail line only renders when the tier returned one.
              Tier D30 (proud-moment-as-hero) now returns null so the
              attached spotlight beneath the headline can carry the real
              continuity story (teacher note) instead. */}
          {statusHeadline.detail && (
            statusHeadline.detailHref ? (
              <Link
                href={statusHeadline.detailHref}
                className={`inline-flex items-center gap-1 text-xs hover:underline transition-colors ${statusHeadline.detailColor}`}
              >
                <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{statusHeadline.detail}</span>
              </Link>
            ) : (
              <div className={`flex items-center gap-1 text-xs ${statusHeadline.detailColor}`}>
                <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{statusHeadline.detail}</span>
              </div>
            )
          )}
          {(serviceContextLine || showSecondaryAttendance) && (
            <p className={`text-[11px] text-muted-foreground/80 leading-relaxed ${statusHeadline.detail ? "mt-0.5" : ""}`}>
              {[
                serviceContextLine,
                showSecondaryAttendance
                  ? (attendance.checkedInAt
                      ? `${firstName} is in school today — checked in at ${attendance.checkedInAt}.`
                      : `${firstName} is in school today.`)
                  : null,
              ].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Phase 17 — Absence-reporting widget moved OUT of the Today card
            into the Coming up card below. Reasoning: operational utilities
            don't belong inside the continuity hero. The hero says "Olivia
            stayed focused today" — and immediately below it the page used
            to say "Report Olivia absent today." Tonal whiplash. The
            absence action is operational, not emotional, and Coming up is
            its semantic home. */}

        {/* ── Phase 18 — continuity spotlight attached to hero ────────────── */}
        {/* When the hero lifted a proud moment (Tier D30), the spotlight
            below the headline carries the meaning hierarchy:
              1. NOTE (continuity detail — the real story; promoted from
                 buried-italic to plain readable prose directly under the
                 headline)
              2. METADATA ROW (category chip + timestamp — small, ambient,
                 below the detail because taxonomy is context, not anchor)
              3. REACTIONS (affordance — only after meaning is established)
              4. Resonance picker + view-all link (utility)
            When `note` is empty, the continuity-detail line collapses
            cleanly and the metadata row carries on its own — the page
            degrades gracefully. */}
        {highlightHeadingSuppressed && highlight && (
          <div className="mt-3 pt-3 border-t border-amber-200/40 space-y-3">
            {/* Continuity detail — the actual developmental observation.
                Plain prose, no italics, no quote marks. This IS the story,
                not someone else's quoted line. */}
            {highlight.note && (
              <p className="text-[15px] text-amber-950/90 leading-relaxed">
                {highlight.note}
              </p>
            )}
            {/* Metadata row — ambient chip + relative time. Below the
                detail because taxonomy is context. */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[highlight.category] ?? "bg-gray-100 text-gray-700"}`}>
                {highlight.category}
              </span>
              <span className="text-amber-700/70">·</span>
              <span className="text-amber-700/80">{timeAgo(highlight.createdAt)}</span>
            </div>
            {/* Reactions — held back until meaning has been read. The
                visual weight is intentionally preserved (these are still
                the primary affordance); they just no longer LEAD. */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  onClick={() => handleMomentReaction(highlight.id, r.type)}
                  disabled={reactSaving}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    highlight.myReaction === r.type
                      ? "bg-amber-400 border-amber-400 text-white"
                      : "border-amber-300 text-amber-700 hover:bg-amber-100"
                  } disabled:opacity-50`}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
            {highlight.myReaction && (
              <p className="text-xs text-green-700">✓ Your reaction has been shared with the school.</p>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <ResonancePicker
                childId={childId}
                momentId={highlight.id}
                firstName={firstName}
              />
              <Link
                href="/parent/proud-moments"
                className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors"
              >
                View all highlights <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Phase 12 — Continuity context line ────────────────────────────────
          Ambient atmospheric framing — school-set, observational, present-
          continuous. Sits BETWEEN the hero and the standalone continuity
          blocks (Positive Highlight / Recent Growth) so it frames how the
          parent reads everything below.
          Visual treatment: plain text on the page surface — NO card frame,
          NO background fill, NO icon. The page quietly remembers the
          child's current rhythm without presenting it as a status surface.
          Renders only when school staff have actually set a context. */}
      {supportContext && (
        <SupportContextBlock
          supportContext={supportContext}
          childId={childId}
          firstName={firstName}
        />
      )}

      {/* ── Phase 13 — Signal cluster (Lately + Today's Pulse) ────────────────
          Compressed continuity signals MOVED into the Today tray from their
          previous positions. Together with the hero and Phase 12 context,
          these answer the busy-parent quick-scan questions:
            • Hero               → "What matters now?"
            • Phase 12 context   → "What's the ongoing situation?"
            • Lately strip       → "What patterns are emerging?" (was Phase 10)
            • Today's Pulse      → "What changed today?" (Phase 13)
          The journey feed below becomes supporting continuity texture —
          present for parents who want details, but no longer required
          reading for the basic scan. */}

      {/* Phase 13 — "What's showing up" continuity signal strip.
          Unified Phase-10 "Lately" + new domain freshness/volume signals
          into ONE compact row of up to 3 short observable chips. Hides
          entirely when getContinuitySignals returns an empty array
          (calm by absence — no "nothing to report" filler).
          Voice: factual recurrence + freshness, never interpretation.
          Recurring-category chips keep the de-saturated CATEGORY_COLORS_MEMORY
          palette so memory chips retain their visual identity; domain
          signals use neutral muted styling so they don't compete for
          color attention. */}
      {continuitySignals.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            What&apos;s showing up
          </span>
          {continuitySignals.map((sig, i) => {
            const cls =
              sig.kind === "recurring_category" && sig.category
                ? CATEGORY_COLORS_MEMORY[sig.category] ?? "bg-muted/40 text-muted-foreground"
                : "bg-muted/40 text-muted-foreground";
            const key = sig.kind === "recurring_category"
              ? `cat:${sig.category}`
              : `${sig.kind}:${sig.domain ?? i}`;
            return (
              <span
                key={key}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}
              >
                {sig.label}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Phase 4 — standalone Positive Highlight ─────────────────────────── */}
      {/* Renders only when the hero did NOT consume the proud moment (i.e. hero
          is in Tier A/B/C/E/F). Above the operational strip so continuity
          gravity wins vertical order. Demoted from card frame to a left-accent
          treatment so warmth is communicated by the bar + icon + colored text,
          not a filled container. */}
      {showFeaturedHighlight && highlight && !highlightHeadingSuppressed && (
        <div className="border-l-2 border-amber-300 pl-3 py-1 space-y-2">
          {/* Star + "Positive Highlight" label. Star icon is enough
              freshness affordance — no "Noted today" line needed here
              either (the timestamp in the corner is the time anchor). */}
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <h2 className="font-semibold text-amber-900 text-sm">Positive Highlight</h2>
            <span className="text-xs text-amber-600 ml-auto">{timeAgo(highlight.createdAt)}</span>
          </div>
          {/* Headline — the emotional takeaway */}
          <p className="font-semibold text-[15px] text-amber-900 leading-snug">
            {getMomentHeading(firstName, highlight.category)}
          </p>
          {/* Phase 18 — Continuity detail (teacher note) promoted to
              directly under the headline as plain prose, NOT italicized
              quote. This IS the story, the anchor parents emotionally
              remember. Collapses cleanly when no note exists. */}
          {highlight.note && (
            <p className="text-[15px] text-amber-950/90 leading-relaxed">
              {highlight.note}
            </p>
          )}
          {/* Metadata row — chip is ambient context, not the anchor */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[highlight.category] ?? "bg-gray-100 text-gray-700"}`}>
              {highlight.category}
            </span>
          </div>
          {/* Reactions — meaning first, response second */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                onClick={() => handleMomentReaction(highlight.id, r.type)}
                disabled={reactSaving}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  highlight.myReaction === r.type
                    ? "bg-amber-400 border-amber-400 text-white"
                    : "border-amber-300 text-amber-700 hover:bg-amber-100"
                } disabled:opacity-50`}
              >
                {r.emoji} {r.label}
              </button>
            ))}
          </div>
          {highlight.myReaction && (
            <p className="text-xs text-green-700">✓ Your reaction has been shared with the school.</p>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <ResonancePicker
              childId={childId}
              momentId={highlight.id}
              firstName={firstName}
            />
            <Link
              href="/parent/proud-moments"
              className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 transition-colors"
            >
              View all highlights <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Phase 4 — standalone Recent Growth (fallback) ───────────────────── */}
      {/* Above the operational strip for the same continuity-gravity reason.
          Demoted to a left-accent green block. */}
      {showFallbackHighlight && fallbackHighlight && (
        <div className="border-l-2 border-green-300 pl-3 py-1">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
            <h2 className="font-semibold text-green-900 text-sm">Recent Growth</h2>
            <span className="text-xs text-green-600 ml-auto">{timeAgo(fallbackHighlight.occurredAt)}</span>
          </div>
          <p className="font-medium text-sm text-green-900 leading-snug">
            {firstName} is making progress in {fallbackHighlight.category}.
          </p>
          <p className="text-xs text-green-800 mt-1.5 leading-relaxed">
            {fallbackHighlight.summary}
          </p>
          <Link
            href="/parent/progress"
            className="mt-3 text-xs text-green-700 hover:text-green-900 font-medium flex items-center gap-1 transition-colors"
          >
            View progress <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Phase 15 — Operational rows extracted from the Today card into
          their own white "Coming up" card below. Reasoning: parents
          described the Today card as "stuffed" — 7–9 content types piled
          in one container. Pulling events / balance-due / consent rows
          into a parallel card gives them their own scan zone and lets
          Today become a focused emotional surface (headline + spotlight
          + lately + support context only). */}

      </section>

      {/* ── ZONE 3 — Coming up card (pure event list) ─────────────────────────
          Phase 20 — Coming up card is now strictly informational. The
          previous "Can't make it?" header utility moved into the family
          drawer's "Today for X" section because parents read the utility
          as semantically attached to the events below it ("can't make
          *this* conference?"). With the utility gone, the card is calm
          by absence — it renders only when there are real upcoming
          events to surface. */}
      {priorityCards.length > 0 && (
        <section className="bg-card rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Coming up
            </h2>
          </div>
          <OperationalSection cards={priorityCards} />
        </section>
      )}

      {/* ── ZONE 4 — Updates feed (ambient continuity texture + domain filters)
          Phase 17 — Filter chips MOVED HERE from the page top.
          Today is now strictly cross-domain synthesis; Journey is strictly
          domain-scoped inspection. The filter strip is the chrome OF the
          Journey section — semantically what it always was.
          Domain-state semantics on each chip:
            • Active (count > 0)         → brand-colored dot + count badge
            • Connected but quiet (= 0)  → MUTED dot + "0" badge — the
                                            domain stays visible because
                                            absence is information
                                            ("therapy is connected but
                                            quiet this week" matters)
            • Not connected at all       → chip hidden entirely
          "All" is always shown. */}
      <section className="space-y-3">
        <div className="px-1 space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground/70">
            {activeFilter === "all"
              ? `${firstName}'s journey`
              : `${FILTER_LABELS[activeFilter]} updates`}
          </h2>
          <nav
            className="flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-1 px-1"
            aria-label="Filter timeline by domain"
          >
            {JOURNEY_FILTERS.map((f) => {
              const isActive = activeFilter === f;
              // Domain state per chip:
              //   "all" → always rendered; count = total feed length
              //   source filter → connected? (skip if not) + count
              if (f === "all") {
                return (
                  <FilterChip
                    key={f}
                    label="All"
                    count={feed.length}
                    isActive={isActive}
                    state="active"
                    onClick={() => setActiveFilter(f)}
                  />
                );
              }
              const connected =
                f === "school"  ? sp.school.connected :
                f === "therapy" ? sp.therapy.connected :
                f === "medical" ? sp.medical.connected : false;
              if (!connected) return null;
              const count = feed.filter((i) => i.sourceCategory === f).length;
              const cat = CAT_STYLES[f];
              return (
                <FilterChip
                  key={f}
                  label={FILTER_LABELS[f]}
                  count={count}
                  isActive={isActive}
                  state={count > 0 ? "active" : "quiet"}
                  dotColor={count > 0 ? cat.dotColor : "bg-muted-foreground/30"}
                  onClick={() => setActiveFilter(f)}
                />
              );
            })}
          </nav>
        </div>

        {filteredFeed.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm px-4 leading-relaxed">
            {FILTER_EMPTY[activeFilter]}
          </div>
        ) : (
          <>
            {/* Phase 14 — Timeline Compression V1.
                Quiet temporal section labels interleaved at the same DOM
                level as the cards, so `space-y-2` keeps natural rhythm
                between every item. Group labels are themselves flow items;
                each non-first label adds `pt-3` to widen the gap above it,
                creating a small visual break between groups without
                drawing a divider, a box, or an accordion.
                Labels only render when ≥2 groups have items — a lone
                "Today" header above a single-group feed adds redundant
                chrome under the existing section title. */}
            <div className="space-y-2">
              {nonEmptyFeedGroups.flatMap((g, idx) => {
                const elements: React.ReactNode[] = [];
                if (showFeedGroupLabels) {
                  elements.push(
                    <div
                      key={`label-${g}`}
                      className={`text-[11px] font-medium uppercase tracking-wide text-muted-foreground/55 px-1 ${idx > 0 ? "pt-3" : ""}`}
                    >
                      {FEED_GROUP_LABELS[g]}
                    </div>
                  );
                }
                for (const item of feedGroups[g]) {
                  elements.push(
                    <JourneyRow
                      key={item.id}
                      item={item}
                      isFresh={freshItemIds.has(item.id)}
                      showSourceBadge={showSourceBadge}
                    />
                  );
                }
                return elements;
              })}
            </div>
            <div className="pt-1 text-center">
              <Link
                href="/parent/updates"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
              >
                View all updates <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        )}
      </section>

    </div>
    </div>
    </ErrorBoundary>
  );
}
